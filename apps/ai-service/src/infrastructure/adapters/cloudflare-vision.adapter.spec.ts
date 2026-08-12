import { CloudflareVisionAdapter } from './cloudflare-vision.adapter';

describe('CloudflareVisionAdapter', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('parses the nested Workers AI vision answer envelope', async () => {
    const config = {
      getOrThrow: jest.fn((key: string) =>
        key === 'CLOUDFLARE_ACCOUNT_ID' ? 'account' : 'token',
      ),
      get: jest.fn().mockReturnValue('@cf/test/vision'),
    };
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      text: jest.fn().mockResolvedValue(
        JSON.stringify({
          success: true,
          result: {
            result: {
              answer:
                '{"caption":"A canary frame","ocrText":"ORDER NUMBER: VLR-9281","objects":["text"]}',
            },
          },
        }),
      ),
    } as never);
    const adapter = new CloudflareVisionAdapter(config as never);

    await expect(
      adapter.analyzeImage({
        image: new Uint8Array([1]),
        mimeType: 'image/jpeg',
      }),
    ).resolves.toMatchObject({
      caption: 'A canary frame',
      ocrText: 'ORDER NUMBER: VLR-9281',
      objects: ['text'],
    });
  });
});
