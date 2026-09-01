import type { StructuredProviderFailureCategory } from '@ai/domain/interfaces/structured-llm.service.interface';

export interface CloudflareProviderFailureClassification {
  category: StructuredProviderFailureCategory;
  transient: boolean;
}

export function classifyCloudflareProviderFailure(input: {
  status?: number;
  providerCode?: number;
  retryAfterMs?: number;
  message?: string;
}): CloudflareProviderFailureClassification {
  const message = input.message?.trim().toLowerCase() ?? '';
  const dailyAllocationExhausted =
    /\b(daily|per day)\b/.test(message) &&
    /\b(allocation|quota|limit)\b/.test(message) &&
    /\b(exhausted|exceeded|limited|reached|used up)\b/.test(message);

  if (
    input.status === 429 &&
    (input.providerCode === 3036 || dailyAllocationExhausted)
  ) {
    return { category: 'ACCOUNT_LIMITED', transient: false };
  }
  if (input.status === 429 && input.providerCode === 3040) {
    return { category: 'OUT_OF_CAPACITY', transient: true };
  }
  if (
    input.status === 429 &&
    (input.retryAfterMs !== undefined ||
      /\brate limit|too many requests\b/.test(message))
  ) {
    return { category: 'RATE_LIMITED', transient: true };
  }
  if (
    input.status === 408 ||
    input.status === 500 ||
    input.status === 502 ||
    input.status === 503 ||
    input.status === 504
  ) {
    return { category: 'TRANSIENT_PROVIDER_FAILURE', transient: true };
  }
  return {
    category: 'UNKNOWN_PROVIDER_FAILURE',
    transient: input.status === 429,
  };
}
