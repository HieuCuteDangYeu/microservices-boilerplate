const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function normalizeRotation(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? ((Math.round(parsed) % 360) + 360) % 360 : 0;
}

function probe(input) {
  const result = spawnSync(
    process.env.FFPROBE_PATH || 'ffprobe',
    ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', input],
    { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
  );

  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `ffprobe failed for ${input}`);
  }

  return JSON.parse(result.stdout);
}

function toVideoStream(stream) {
  const sideRotation = stream.side_data_list?.find((item) =>
    Number.isFinite(Number(item.rotation)),
  )?.rotation;
  const rotation = normalizeRotation(sideRotation ?? stream.tags?.rotate);
  const width = Number(stream.width);
  const height = Number(stream.height);
  const effectiveWidth = rotation === 90 || rotation === 270 ? height : width;
  const effectiveHeight = rotation === 90 || rotation === 270 ? width : height;

  return {
    codec: stream.codec_name,
    width,
    height,
    rotation,
    effectiveWidth,
    effectiveHeight,
    aspectRatio: Number((effectiveWidth / effectiveHeight).toFixed(4)),
  };
}

function classifyOrientation(aspectRatio) {
  if (aspectRatio >= 1.1) return 'LANDSCAPE';
  if (aspectRatio <= 0.9) return 'PORTRAIT';
  return 'SQUARE';
}

function detectContentCrop(input) {
  const result = spawnSync(
    process.env.FFMPEG_PATH || 'ffmpeg',
    [
      '-hide_banner',
      '-loglevel',
      'info',
      '-ss',
      '2',
      '-i',
      input,
      '-frames:v',
      '12',
      '-vf',
      'cropdetect=limit=0.08:round=2:reset=0',
      '-f',
      'null',
      '-',
    ],
    { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
  );
  const matches = [...result.stderr.matchAll(/crop=(\d+):(\d+):(\d+):(\d+)/g)];

  if (matches.length === 0) {
    return null;
  }

  const last = matches[matches.length - 1];
  return {
    width: Number(last[1]),
    height: Number(last[2]),
    x: Number(last[3]),
    y: Number(last[4]),
  };
}

function getDirectoryStats(targetPath) {
  if (!fs.existsSync(targetPath)) return { objectCount: 0, totalBytes: 0 };
  const stats = fs.statSync(targetPath);
  if (stats.isFile()) return { objectCount: 1, totalBytes: stats.size };

  return fs.readdirSync(targetPath, { withFileTypes: true }).reduce(
    (total, entry) => {
      const child = getDirectoryStats(path.join(targetPath, entry.name));
      return {
        objectCount: total.objectCount + child.objectCount,
        totalBytes: total.totalBytes + child.totalBytes,
      };
    },
    { objectCount: 0, totalBytes: 0 },
  );
}

function resolveInputs(env = process.env, argv = process.argv.slice(2)) {
  const source = env.REEL_INSPECT_SOURCE?.trim() || argv[0];
  let output = env.REEL_INSPECT_OUTPUT?.trim() || argv[1];

  if (!source || !path.isAbsolute(source) || !fs.existsSync(source)) {
    throw new Error(
      'Provide an existing absolute source path with REEL_INSPECT_SOURCE or argv[0].',
    );
  }

  if (!output) {
    throw new Error(
      'Provide an HLS master URL/path with REEL_INSPECT_OUTPUT or argv[1].',
    );
  }

  if (fs.existsSync(output) && fs.statSync(output).isDirectory()) {
    output = path.join(output, 'master.m3u8');
  }

  return { source, output };
}

function main() {
  const { source, output } = resolveInputs();
  const sourceProbe = probe(source);
  const outputProbe = probe(output);
  const sourceVideo = sourceProbe.streams.find(
    (stream) => stream.codec_type === 'video',
  );
  const outputVideos = outputProbe.streams
    .filter((stream) => stream.codec_type === 'video')
    .map(toVideoStream);

  if (!sourceVideo || outputVideos.length === 0) {
    throw new Error('Source and output must both contain a video stream.');
  }

  const sourceDetails = toVideoStream(sourceVideo);
  const crop = detectContentCrop(output);
  const firstOutput = outputVideos[0];
  const orientationChanged =
    classifyOrientation(sourceDetails.aspectRatio) !==
    classifyOrientation(firstOutput.aspectRatio);
  const outputContentFillsFrame =
    crop !== null &&
    outputVideos.some(
      (video) =>
        Math.abs(crop.width - video.width) <= 2 &&
        Math.abs(crop.height - video.height) <= 2,
    );

  process.stdout.write(
    `${JSON.stringify(
      {
        source,
        output,
        sourceVideo: {
          ...sourceDetails,
          orientation: classifyOrientation(sourceDetails.aspectRatio),
          durationSeconds: Number(sourceProbe.format?.duration),
          bytes: Number(sourceProbe.format?.size),
        },
        outputVideos: outputVideos.map((video) => ({
          ...video,
          orientation: classifyOrientation(video.aspectRatio),
        })),
        cropDetection: crop,
        landscapeCroppingObserved:
          classifyOrientation(sourceDetails.aspectRatio) === 'LANDSCAPE' &&
          orientationChanged &&
          outputContentFillsFrame,
        localHlsStats: /^https?:\/\//i.test(output)
          ? null
          : getDirectoryStats(path.dirname(output)),
      },
      null,
      2,
    )}\n`,
  );
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(
      `Media output inspection failed: ${
        error instanceof Error ? error.message : String(error)
      }\n`,
    );
    process.exitCode = 1;
  }
}
