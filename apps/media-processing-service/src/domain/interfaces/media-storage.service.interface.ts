export interface UploadedThumbnail {
  key: string;
  url: string;
}

export interface StoredArtifact {
  key: string;
  byteLength: number;
  checksum: string;
}

export interface IMediaStorageService {
  downloadVideo(key: string, downloadPath: string): Promise<void>;

  deleteObjectsByPrefix(prefix: string): Promise<void>;

  uploadHlsDirectory(localDir: string, s3Prefix: string): Promise<void>;

  uploadThumbnail(localPath: string, s3Key: string): Promise<UploadedThumbnail>;

  uploadArtifact(
    localPath: string,
    s3Key: string,
    contentType: string,
  ): Promise<{ key: string; byteLength: number }>;

  uploadTextObject(
    s3Key: string,
    content: string,
    contentType: string,
  ): Promise<StoredArtifact>;

  objectExists(key: string): Promise<boolean>;

  getObjectText(key: string): Promise<string>;

  getPublicUrl(key: string): string;
}
