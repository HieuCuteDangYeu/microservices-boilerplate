import type { RagChatWorkflowState } from '@ai/domain/interfaces/rag-chat-workflow.interface';
import { Injectable } from '@nestjs/common';
import { assessDirectTranscriptFactSupport } from './direct-transcript-fact-support';

interface CandidateSpan {
  text: string;
  start: number;
  end: number;
}

@Injectable()
export class BuildGroundedAnswerRevisionUseCase {
  execute(state: RagChatWorkflowState): string | undefined {
    if (
      state.nextDraftSource !== 'VERIFIER_REVISION' ||
      state.route?.intent !== 'REEL_VIDEO_QUESTION' ||
      !state.verification?.requiresRevision
    ) {
      return undefined;
    }

    const evidence = state.rerankedChunks.find(
      (chunk) =>
        (chunk.evidenceType ?? 'TRANSCRIPT') === 'TRANSCRIPT' &&
        Boolean(chunk.evidenceText?.trim()),
    );
    const evidenceText = evidence?.evidenceText?.replace(/\s+/g, ' ').trim();
    if (!evidence || !evidenceText) return undefined;

    const supported = this.candidateSpans(evidenceText).filter(
      (candidate) =>
        this.addsEvidenceFact(candidate.text, state.userMessage) &&
        assessDirectTranscriptFactSupport({
          question: state.userMessage,
          answer: candidate.text,
          candidates: [
            { evidenceType: 'TRANSCRIPT', evidenceText: candidate.text },
          ],
        }).supported,
    );
    const groups = this.overlapGroups(supported);
    if (groups.length !== 1) return undefined;

    return [...groups[0]].sort(
      (left, right) =>
        this.wordCount(left.text) - this.wordCount(right.text) ||
        left.start - right.start,
    )[0]?.text;
  }

  private candidateSpans(evidence: string): CandidateSpan[] {
    const spans: CandidateSpan[] = [];
    const seen = new Set<string>();
    let offset = 0;
    for (const sentence of evidence.match(/[^.!?]+[.!?]?/g) ?? []) {
      const words = sentence.match(/\S+/g)?.slice(0, 96) ?? [];
      this.addSentenceSpans(words, offset, spans, seen);
      offset += words.length;
    }
    return spans;
  }

  private addSentenceSpans(
    words: string[],
    offset: number,
    spans: CandidateSpan[],
    seen: Set<string>,
  ) {
    const add = (start: number, end: number) => {
      if (end - start < 4 || end - start > 36) return;
      const text = words.slice(start, end).join(' ').trim();
      if (!text || seen.has(text)) return;
      seen.add(text);
      spans.push({ text, start: offset + start, end: offset + end });
    };

    for (let start = 0; start < words.length; start += 1) {
      for (
        let length = 4;
        length <= 36 && start + length <= words.length;
        length += 1
      ) {
        add(start, start + length);
      }
    }
  }

  private addsEvidenceFact(candidate: string, question: string): boolean {
    const questionTokens = new Set(this.tokens(question));
    const filler = new Set([
      'a',
      'an',
      'are',
      'because',
      'even',
      'is',
      'it',
      'not',
      'since',
      'so',
      'that',
      'the',
      'then',
      'therefore',
      'they',
      'was',
      'we',
    ]);
    return this.tokens(candidate).some(
      (token) => !questionTokens.has(token) && !filler.has(token),
    );
  }

  private tokens(value: string): string[] {
    return value.toLowerCase().match(/\d+(?:\.\d+)?|[a-z]+/g) ?? [];
  }

  private overlapGroups(candidates: CandidateSpan[]): CandidateSpan[][] {
    const groups: CandidateSpan[][] = [];
    for (const candidate of candidates.sort(
      (left, right) => left.start - right.start,
    )) {
      const group = groups.at(-1);
      const groupEnd = group ? Math.max(...group.map((item) => item.end)) : -1;
      if (!group || candidate.start >= groupEnd) {
        groups.push([candidate]);
      } else {
        group.push(candidate);
      }
    }
    return groups;
  }

  private wordCount(value: string): number {
    return value.match(/\S+/g)?.length ?? 0;
  }
}
