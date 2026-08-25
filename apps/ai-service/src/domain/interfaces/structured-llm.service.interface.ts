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

export interface StructuredLlmCallDiagnostics {
  modelRole?: string;
  model: string;
  providerStatus: number | 'NETWORK_ERROR' | 'TIMEOUT';
  latencyMs: number;
  configuredTimeoutMs: number;
  configuredMaxCompletionTokens: number;
  finishReason?: string;
  attempt: number;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
  errorCode?: string;
  providerCode?: number;
  providerCategory?: StructuredProviderFailureCategory;
  retryAfterMs?: number;
  requestId?: string;
  transient?: boolean;
  schemaPath?: string;
  schemaConstraint?: string;
  schemaVersion?: string;
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
