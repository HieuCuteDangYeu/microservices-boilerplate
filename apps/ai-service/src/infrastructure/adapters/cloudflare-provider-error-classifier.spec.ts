import { classifyCloudflareProviderFailure } from './cloudflare-provider-error-classifier';

describe('classifyCloudflareProviderFailure', () => {
  it.each([
    [4006, 'Daily allocation has been exhausted for this account.'],
    [3036, 'Provider detail is not required for a known code.'],
  ])(
    'classifies account exhaustion code %i as non-transient',
    (providerCode, message) => {
      expect(
        classifyCloudflareProviderFailure({
          status: 429,
          providerCode,
          message,
        }),
      ).toEqual({ category: 'ACCOUNT_LIMITED', transient: false });
    },
  );

  it('classifies 3040 as transient out of capacity', () => {
    expect(
      classifyCloudflareProviderFailure({ status: 429, providerCode: 3040 }),
    ).toEqual({ category: 'OUT_OF_CAPACITY', transient: true });
  });

  it('classifies a generic 429 with Retry-After as rate limited', () => {
    expect(
      classifyCloudflareProviderFailure({ status: 429, retryAfterMs: 2_000 }),
    ).toEqual({ category: 'RATE_LIMITED', transient: true });
  });

  it.each([408, 500, 502, 503, 504])(
    'classifies HTTP %i as a transient provider failure',
    (status) => {
      expect(classifyCloudflareProviderFailure({ status })).toEqual({
        category: 'TRANSIENT_PROVIDER_FAILURE',
        transient: true,
      });
    },
  );

  it('keeps an undocumented 429 without safe message metadata unknown', () => {
    expect(
      classifyCloudflareProviderFailure({ status: 429, providerCode: 4006 }),
    ).toEqual({ category: 'UNKNOWN_PROVIDER_FAILURE', transient: true });
  });
});
