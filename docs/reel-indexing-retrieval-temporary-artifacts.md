# Reel Indexing and Retrieval Temporary Artifacts

Remove these artifacts only after Prompt 6 has passed production validation
and Prompt 7 cleanup begins.

| Artifact | Added in | Validation purpose |
| --- | --- | --- |
| `apps/reel-indexing-service/src/application/use-cases/reel-indexing-prompt1-transcription.spec.ts` | Prompt 1 | Transcript merge lineage, deterministic replay, missing segment rejection, and partial transcription resume |
| `apps/reel-indexing-service/src/application/use-cases/reel-indexing-prompt1-evidence.spec.ts` | Prompt 1 | Deterministic routing, evidence separation, hierarchy, token validation, embedding reuse, vector rejection, and adaptive boundaries |
| `apps/reel-indexing-service/src/application/use-cases/reel-indexing-prompt1-workflow.spec.ts` | Prompt 1 | Durable graph replay, legacy Content compatibility write, candidate activation, stale candidate discard, and media/index failure isolation |
