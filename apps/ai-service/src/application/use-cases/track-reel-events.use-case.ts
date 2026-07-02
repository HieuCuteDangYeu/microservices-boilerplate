import type {
  IContentRepository,
  ReelViewEventInput,
} from '@content/domain/interfaces/content.repository.interface';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class TrackReelEventsUseCase {
  constructor(
    @Inject('IContentRepository')
    private readonly repository: IContentRepository,
  ) {}

  async execute(userId: string, events: Omit<ReelViewEventInput, 'userId'>[]) {
    if (!events.length) {
      return;
    }

    await this.repository.trackReelEvents(
      events.map((event) => ({
        ...event,
        userId,
      })),
    );
  }
}
