export interface IRetrievalAgentPolicy {
  enabled: boolean;
  model?: string;
  maxSteps: number;
  maxParallelCalls: number;
  callTimeoutMs: number;
}
