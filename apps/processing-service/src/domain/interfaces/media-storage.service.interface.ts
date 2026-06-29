export interface UploadedThumbnail {
  key: string;
  url: string;
}

export interface IMediaStorageService {
  downloadVideo(key: string, downloadPath: string): Promise<void>;

  deleteObjectsByPrefix(prefix: string): Promise<void>;

  uploadHlsDirectory(localDir: string, s3Prefix: string): Promise<void>;

  uploadThumbnail(localPath: string, s3Key: string): Promise<UploadedThumbnail>;

  getPublicUrl(key: string): string;
}
