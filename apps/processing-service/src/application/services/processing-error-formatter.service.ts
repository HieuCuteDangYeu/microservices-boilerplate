export interface FormattedProcessingError {
  message: string;
  stack?: string;
}

export function formatProcessingError(
  error: unknown,
): FormattedProcessingError {
  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack,
    };
  }

  if (typeof error === 'object' && error !== null) {
    const record = error as Record<string, unknown>;

    const message =
      typeof record['message'] === 'string'
        ? record['message']
        : JSON.stringify(error);

    const stack =
      typeof record['stack'] === 'string' ? record['stack'] : undefined;

    return { message, stack };
  }

  return {
    message: String(error),
  };
}
