export interface DirectTranscriptEvidence {
  evidenceType?: string;
  evidenceText: string;
}

export interface DirectTranscriptFactSupport {
  supported: boolean;
  supportingEvidenceIndexes: number[];
}

const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'about',
  'be',
  'by',
  'do',
  'does',
  'for',
  'from',
  'has',
  'have',
  'in',
  'is',
  'it',
  'of',
  'on',
  'or',
  'say',
  'says',
  'speaker',
  'that',
  'the',
  'they',
  'this',
  'to',
  'using',
  'was',
  'what',
  'when',
  'where',
  'which',
  'who',
  'with',
  'would',
  'you',
]);

const NUMBER_WORDS: Record<string, string> = {
  one: '1',
  two: '2',
  three: '3',
  four: '4',
  five: '5',
  six: '6',
  seven: '7',
  eight: '8',
  nine: '9',
  ten: '10',
  eleven: '11',
  twelve: '12',
  thirteen: '13',
  fourteen: '14',
  fifteen: '15',
  sixteen: '16',
  seventeen: '17',
  eighteen: '18',
  nineteen: '19',
  twenty: '20',
};

const UNIT_ALIASES: Record<string, string> = {
  gb: 'gigabyte',
  gbs: 'gigabyte',
  kb: 'kilobyte',
  kbs: 'kilobyte',
  mb: 'megabyte',
  mbs: 'megabyte',
  tb: 'terabyte',
  tbs: 'terabyte',
};

/**
 * A deliberately narrow guard for compact transcript facts. It does not judge
 * open-ended summaries or infer a fact from topical overlap.
 */
export function assessDirectTranscriptFactSupport(input: {
  question: string;
  answer: string;
  candidates: DirectTranscriptEvidence[];
}): DirectTranscriptFactSupport {
  const rawAnswerTokens = contentTokens(input.answer);
  if (rawAnswerTokens.length === 0 || rawAnswerTokens.length > 12) {
    return unsupported();
  }

  const questionTokens = contentTokens(input.question);
  const answerTokens = rawAnswerTokens.filter(
    (token) => !questionTokens.includes(token),
  );
  if (answerTokens.length === 0) return unsupported();

  const quantityQuestion = /\b(how many|what number|how low)\b/i.test(
    input.question,
  );
  const explanationQuestion = /\b(why|reason|because)\b/i.test(input.question);
  const whoQuestion = /\bwho\b/i.test(input.question);
  const labelQuestion = /\blabel\b/i.test(input.question);

  const supportingEvidenceIndexes = input.candidates.flatMap(
    (candidate, index) => {
      if (candidate.evidenceType !== 'TRANSCRIPT') return [];

      const evidenceTokens = new Set(contentTokens(candidate.evidenceText));
      if (!answerTokens.every((token) => evidenceTokens.has(token))) return [];

      const sharedQuestionTerms = questionTokens.filter((token) =>
        evidenceTokens.has(token),
      );
      const evidence = candidate.evidenceText.toLowerCase();
      const hasQuantitySupport =
        quantityQuestion &&
        answerTokens.some((token) => /^\d+(?:\.\d+)?$/.test(token)) &&
        sharedQuestionTerms.length >= 1;
      const hasWhoRelation =
        whoQuestion &&
        sharedQuestionTerms.length >= 2 &&
        /\b(present(?:ed|ing)?|show(?:n|ing)?|tell(?:s|ing)?|call(?:ed|s)?|name(?:d|s)?)\b/.test(
          evidence,
        );
      const hasLabelRelation =
        labelQuestion &&
        sharedQuestionTerms.length >= 1 &&
        /\b(label(?:led)?|call(?:ed|s)?|name(?:d|s)?|assign(?:ed|s)?)\b/.test(
          evidence,
        );
      const hasDirectRelation =
        sharedQuestionTerms.length >= 2 &&
        /\b(assigned|called|named|label(?:led)?|same|common|because|belongs?|causes?|means?|can|could)\b/.test(
          evidence,
        );
      const hasExplanationRelation =
        explanationQuestion &&
        sharedQuestionTerms.length >= 2 &&
        /\b(because|since|therefore|so)\b/.test(evidence);

      return hasQuantitySupport ||
        hasWhoRelation ||
        hasLabelRelation ||
        hasDirectRelation ||
        hasExplanationRelation
        ? [index]
        : [];
    },
  );

  return {
    supported: supportingEvidenceIndexes.length > 0,
    supportingEvidenceIndexes,
  };
}

function contentTokens(value: string): string[] {
  return (value.toLowerCase().match(/\d+(?:\.\d+)?|[a-z]+/g) ?? [])
    .map((token: string): string => normalizeContentToken(token))
    .filter((token: string) => token.length > 0 && !STOP_WORDS.has(token));
}

function normalizeContentToken(token: string): string {
  const numeric = NUMBER_WORDS[token];
  if (numeric) return numeric;

  const unit = UNIT_ALIASES[token];
  if (unit) return unit;

  if (
    token.endsWith('s') &&
    token !== 'is' &&
    token !== 'was' &&
    token !== 'this'
  ) {
    return token.slice(0, -1);
  }

  return token;
}

function unsupported(): DirectTranscriptFactSupport {
  return { supported: false, supportingEvidenceIndexes: [] };
}
