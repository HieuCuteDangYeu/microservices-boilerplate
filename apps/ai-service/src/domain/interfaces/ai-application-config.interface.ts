export type AiModelRole =
  | 'ROUTER'
  | 'RETRIEVAL_PLANNER'
  | 'RETRIEVAL_TOOL'
  | 'CONTEXT_SUFFICIENCY'
  | 'ANSWER'
  | 'ANSWER_REVISION'
  | 'VERIFIER'
  | 'VERIFIER_ESCALATION'
  | 'CITATION_ATTRIBUTION'
  | 'INDEX_QUALITY'
  | 'METADATA_EXTRACTION'
  | 'SECTION_SUMMARY'
  | 'VISION'
  | 'TRANSCRIPTION'
  | 'EMBEDDING'
  | 'RERANKER'
  | 'CONVERSATION_SUMMARY'
  | 'MEMORY_EXTRACTION';

export interface IAiApplicationConfig {
  get<T = string>(key: string): T | undefined;
  model(role: AiModelRole): string;
  timeoutMs(role: AiModelRole): number;
  verifierMaxTokens(role: 'VERIFIER' | 'VERIFIER_ESCALATION'): number;
  boolean(key: string, fallback: boolean): boolean;
  number(key: string, fallback: number, min: number, max: number): number;
}
