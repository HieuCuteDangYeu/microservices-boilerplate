import { Media } from '../entities/media.entity';

export interface IMediaRepository {
  save(media: Media): Promise<Media>;
}
