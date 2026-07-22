import { ConfigService } from '@nestjs/config';
import { CloudflareTranscriptionAdapter } from './cloudflare-transcription.adapter';

describe('CloudflareTranscriptionAdapter', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('accepts a successful empty transcript for audio without speech', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          result: { text: '', segments: [], word_count: 0 },
        }),
        { status: 200 },
      ),
    );
    const adapter = new CloudflareTranscriptionAdapter(
      new ConfigService({
        CLOUDFLARE_ACCOUNT_ID: 'account-id',
        CLOUDFLARE_API_TOKEN: 'token',
      }),
    );

    await expect(
      adapter.transcribeAudio(Buffer.from('audio')),
    ).resolves.toEqual(
      expect.objectContaining({
        text: '',
        wordCount: 0,
        provider: 'cloudflare-workers-ai',
      }),
    );
  });
});
