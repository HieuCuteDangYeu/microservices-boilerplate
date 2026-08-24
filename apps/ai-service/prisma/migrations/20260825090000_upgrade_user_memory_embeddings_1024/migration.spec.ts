import fs from 'node:fs';
import path from 'node:path';

describe('UserMemory 1024-dimension migration', () => {
  const sql = fs.readFileSync(path.join(__dirname, 'migration.sql'), 'utf8');

  it('preserves authoritative rows and content while clearing only derived embeddings', () => {
    expect(sql).not.toMatch(/\b(?:DELETE|TRUNCATE|DROP\s+TABLE)\b/i);
    expect(sql).toContain('ALTER COLUMN embedding TYPE vector(1024)');
    expect(sql).toMatch(/UPDATE "UserMemory"[\s\S]*embedding = NULL/);
    expect(sql).not.toMatch(/SET[\s\S]*\bcontent\s*=/i);
  });

  it('records model, dimensions, and version in the identity index', () => {
    expect(sql).toContain(
      '"UserMemory_userId_embeddingModel_embeddingDimensions_embeddingVersion_idx"',
    );
    expect(sql).toContain('"embeddingDimensions"');
    expect(sql).toContain('"embeddingVersion"');
  });
});
