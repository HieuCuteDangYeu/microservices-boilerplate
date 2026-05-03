import type { IContentRepository } from '@content/domain/interfaces/content.repository.interface';
import type { IStorageService } from '@content/domain/interfaces/storage.service.interface';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class DeleteReelUseCase {
  constructor(
    @Inject('IContentRepository')
    private readonly repository: IContentRepository,
    @Inject('IStorageService')
    private readonly storageService: IStorageService,
  ) {}

  async execute(id: string, userId: string): Promise<boolean> {
    const reel = await this.repository.findById(id);
    if (!reel) return false;

    const deleted = await this.repository.deleteReel(id, userId);
    if (!deleted) return false;

    // Cleanup R2 objects: HLS directory + thumbnail
    const keysToDelete: string[] = [];

    // HLS manifest & segments: strip .mp4 extension, list all objects under that prefix
    const hlsPrefix = reel.mediaKey.replace(/\.[^.]+$/, '');
    const hlsObjects = await this.storageService.listObjects(hlsPrefix);
    keysToDelete.push(...hlsObjects);

    if (reel.thumbnailKey) {
      keysToDelete.push(reel.thumbnailKey);
    }

    try {
      await this.storageService.deleteObjects(keysToDelete);
    } catch (err) {
      // Best-effort cleanup — log and don't fail the delete
      console.error(
        `[DeleteReelUseCase] R2 cleanup failed for reel ${id}:`,
        err,
      );
    }

    return true;
  }
}
