export interface StructuredLlmJsonSchema {
  type: 'object';
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
}

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
  attempt?: number;
  onDiagnostics?: (diagnostics: StructuredLlmCallDiagnostics) => void;
}

export interface IStructuredLlmService {
  generateObject<T>(input: GenerateStructuredObjectInput): Promise<T>;
}
