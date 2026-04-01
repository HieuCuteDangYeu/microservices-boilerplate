import { Knowledge } from '../entities/knowledge.entity';

export interface IKnowledgeRepository {
  save(knowledge: Knowledge, vector: number[]): Promise<Knowledge>;
  search(vector: number[], limit?: number): Promise<Knowledge[]>;
}
