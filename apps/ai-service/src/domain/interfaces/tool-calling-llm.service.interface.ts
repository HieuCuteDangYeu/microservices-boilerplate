export interface ToolCallingJsonSchema {
  type: 'object';
  properties?: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface LlmToolDefinition {
  name: string;
  description: string;
  parameters: ToolCallingJsonSchema;
}

export interface LlmToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export type ToolCallingMessage =
  | {
      role: 'system' | 'user';
      content: string;
    }
  | {
      role: 'assistant';
      content?: string | null;
      toolCalls?: LlmToolCall[];
    }
  | {
      role: 'tool';
      toolCallId: string;
      name: string;
      content: string;
    };

export interface ToolCallingCompletionInput {
  model?: string;
  messages: ToolCallingMessage[];
  tools: LlmToolDefinition[];
  toolChoice?: 'auto' | 'none' | 'required';
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}

export interface ToolCallingCompletionResult {
  content?: string;
  toolCalls: LlmToolCall[];
  finishReason?: string;
}

export interface IToolCallingLlmService {
  complete(
    input: ToolCallingCompletionInput,
  ): Promise<ToolCallingCompletionResult>;
}
