function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function extractMessage(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }

  if (Array.isArray(value)) {
    const items = value
      .map((item) => extractMessage(item))
      .filter((item): item is string => Boolean(item));

    if (items.length > 0) {
      return items.join('; ');
    }
  }

  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;

    if ('message' in record) {
      return extractMessage(record['message']);
    }

    if ('error' in record) {
      return extractMessage(record['error']);
    }
  }

  return undefined;
}

export function describeRmqError(error: unknown): {
  message: string;
  stack?: string;
} {
  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack,
    };
  }

  if (typeof error === 'object' && error !== null) {
    const record = error as Record<string, unknown>;
    const statusCode =
      typeof record['statusCode'] === 'number'
        ? `statusCode=${record['statusCode']}`
        : undefined;
    const message =
      extractMessage(record['message']) ||
      extractMessage(record['error']) ||
      safeStringify(error);
    const stack =
      typeof record['stack'] === 'string' ? record['stack'] : undefined;

    return {
      message: statusCode ? `${message} (${statusCode})` : message,
      stack,
    };
  }

  return {
    message: String(error),
  };
}

export function createRmqError(context: string, error: unknown): Error {
  const { message, stack } = describeRmqError(error);
  const normalizedError = new Error(`${context}: ${message}`);

  if (stack) {
    normalizedError.stack = stack;
  }

  return normalizedError;
}
