export interface StructuredLlmJsonSchema {
  type: 'object';
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
}

export type StructuredProviderFailureCategory =
  | 'ACCOUNT_LIMITED'
  | 'OUT_OF_CAPACITY'
  | 'RATE_LIMITED'
  | 'TRANSIENT_PROVIDER_FAILURE'
  | 'UNKNOWN_PROVIDER_FAILURE';

export type StructuredJsonType =
  | 'string'
  | 'array'
  | 'object'
  | 'number'
  | 'boolean'
  | 'null'
  | 'absent';

export interface StructuredLlmCallDiagnostics {
  modelRole?: string;
  model: string;
  providerStatus: number | 'NETWORK_ERROR' | 'TIMEOUT';
  latencyMs: number;
  configuredTimeoutMs: number;
  configuredMaxCompletionTokens: number;
  finishReason?: string;
  endpointContract?: string;
  responseContentType?: StructuredJsonType;
  contentPresent?: boolean;
  toolCallsPresent?: boolean;
  attempt: number;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    reasoningTokens?: number;
  };
  errorCode?: string;
  providerCode?: number;
  providerCategory?: StructuredProviderFailureCategory;
  retryAfterMs?: number;
  requestId?: string;
  networkErrorName?: string;
  networkErrorCode?: string;
  networkErrorSyscall?: string;
  transient?: boolean;
  schemaPath?: string;
  schemaConstraint?: string;
  schemaVersion?: string;
  expectedType?: StructuredJsonType;
  actualJsonType?: StructuredJsonType;
}

export interface GenerateStructuredObjectInput {
  model?: string;
  systemPrompt: string;
  userPrompt: string;
  jsonSchema: StructuredLlmJsonSchema;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
  modelRole?: string;
  schemaVersion?: string;
  attempt?: number;
  onDiagnostics?: (diagnostics: StructuredLlmCallDiagnostics) => void;
}

export interface IStructuredLlmService {
  generateObject<T>(input: GenerateStructuredObjectInput): Promise<T>;
}
