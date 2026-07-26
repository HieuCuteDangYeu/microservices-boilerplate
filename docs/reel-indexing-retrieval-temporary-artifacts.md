# Reel Indexing and Retrieval Temporary Artifacts

Remove these artifacts only after Prompt 6 has passed production validation
and Prompt 7 cleanup begins.

| Artifact | Added in | Validation purpose |
| --- | --- | --- |
| `apps/reel-indexing-service/src/application/use-cases/reel-indexing-prompt1-transcription.spec.ts` | Prompt 1 | Transcript merge lineage, deterministic replay, missing segment rejection, and partial transcription resume |
| `apps/reel-indexing-service/src/application/use-cases/reel-indexing-prompt1-evidence.spec.ts` | Prompt 1 | Deterministic routing, evidence separation, hierarchy, token validation, embedding reuse, vector rejection, and adaptive boundaries |
| `apps/reel-indexing-service/src/application/use-cases/reel-indexing-prompt1-workflow.spec.ts` | Prompts 1 and 4 | Durable graph replay, summary-only Content completion, canonical activation, stale completion handling, and media/index failure isolation |
| `apps/content-service/src/application/use-cases/complete-reel-indexing-prompt4.spec.ts` | Prompt 4 | Summary-only Content completion forwards no chunks or embeddings |
| `apps/content-service/src/application/use-cases/search-public-reels-prompt4.spec.ts` | Prompt 6 | Ensures public semantic search uses Indexing without a Content fallback |
| `scripts/tmp/compare-semantic-recommendations.cjs` | Prompt 3 | Probes canonical Reel-level semantic candidates |
