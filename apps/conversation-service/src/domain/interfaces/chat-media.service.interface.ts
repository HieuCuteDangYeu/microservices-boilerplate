export abstract class IChatMediaService {
  /**
   * Removes objects created by the chat upload flow. Implementations must reject
   * keys that are not owned by the supplied user.
   */
  abstract deleteRecalledChatMedia(input: {
    userId: string;
    fileKeys: string[];
  }): Promise<void>;
}
