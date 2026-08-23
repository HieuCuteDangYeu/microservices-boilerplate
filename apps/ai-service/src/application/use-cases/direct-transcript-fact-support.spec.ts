import { assessDirectTranscriptFactSupport } from './direct-transcript-fact-support';

describe('assessDirectTranscriptFactSupport', () => {
  const assess = (question: string, answer: string, evidenceText: string) =>
    assessDirectTranscriptFactSupport({
      question,
      answer,
      candidates: [{ evidenceType: 'TRANSCRIPT', evidenceText }],
    });

  it.each([
    [
      'Who is presenting the detector?',
      'Olivier.',
      'Olivier is presenting the detector.',
    ],
    [
      'What label is assigned?',
      'Blue.',
      'The item is assigned the blue label.',
    ],
    [
      'How many frequency bands are used?',
      '15 bands.',
      'I am using fifteen bands.',
    ],
    [
      'How low can the bands go?',
      '12 bands.',
      'We can go down to twelve bands and still be okay.',
    ],
    [
      'Why are the marbles in the same cluster?',
      'They share a salient feature.',
      'They share a salient feature in common and belong to the same cluster.',
    ],
  ])(
    'supports a directly grounded compact fact: %s',
    (question, answer, evidenceText) => {
      expect(assess(question, answer, evidenceText).supported).toBe(true);
    },
  );

  it.each([
    [
      'How should backups be protected from fire?',
      'Three backups.',
      'Keep three backups in different physical places to protect against fire.',
    ],
    ['What label is assigned?', 'Blue.', 'A blue item is beside a bag.'],
    [
      'Who is presenting the detector?',
      'Olivier founded the project in 1998.',
      'Olivier is presenting the detector.',
    ],
    [
      'What is visibly shown?',
      'A blue label is visibly shown.',
      'The speaker says the label is blue.',
    ],
    [
      'How many frequency bands are used?',
      '12 bands.',
      'I am using fifteen bands.',
    ],
  ])(
    'rejects an unsafe support match: %s',
    (question, answer, evidenceText) => {
      expect(assess(question, answer, evidenceText).supported).toBe(false);
    },
  );
});
