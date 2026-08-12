export interface StructuredLlmJsonSchema {
  type: 'object';
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface GenerateStructuredObjectInput {
  model?: string;
  systemPrompt: string;
  userPrompt: string;
  jsonSchema: StructuredLlmJsonSchema;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}

export interface IStructuredLlmService {
  generateObject<T>(input: GenerateStructuredObjectInput): Promise<T>;
}
