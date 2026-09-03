'use strict';

const sharedQuestionAnswerHistory = [
  'USER: [Shared recording] basalt observatory',
  'USER: What site did the speaker describe first?',
  'ASSISTANT: The speaker described the Northglass observatory.',
].join('\n');

const sharedReferentContext = {
  conversationHasSharedReelContext: true,
  accessibleSharedReelCount: 1,
  recentShareEvent: true,
  turnsSinceRecentShare: 2,
  recentEventTypes: ['REEL_SHARE', 'TEXT', 'TEXT'],
};

const transcriptExpected = {
  intent: 'REEL_VIDEO_QUESTION',
  referenceTarget: 'SHARED_REEL',
  reelQuestionType: 'TRANSCRIPT_CONTENT',
  requiredEvidence: ['TRANSCRIPT'],
  recommendationAction: 'NONE',
};

const metadataExpected = {
  intent: 'REEL_VIDEO_QUESTION',
  referenceTarget: 'SHARED_REEL',
  reelQuestionType: 'REEL_METADATA',
  requiredEvidence: ['METADATA'],
  recommendationAction: 'NONE',
};

const summaryExpected = {
  intent: 'REEL_VIDEO_QUESTION',
  referenceTarget: 'SHARED_REEL',
  reelQuestionType: 'GENERAL_REEL_SUMMARY',
  requiredEvidence: ['TRANSCRIPT', 'METADATA'],
  recommendationAction: 'NONE',
};

const routerEvidenceBoundaryCases = [
  {
    id: 'evidence-content-location-01',
    message: 'Where did the presenter say the field survey took place?',
    recentHistory: sharedQuestionAnswerHistory,
    hasSharedReelContext: true,
    sharedReelCount: 1,
    referentContext: sharedReferentContext,
    expected: transcriptExpected,
  },
  {
    id: 'evidence-content-participant-02',
    message: 'Which participant did the speaker say joined the survey?',
    recentHistory: sharedQuestionAnswerHistory,
    hasSharedReelContext: true,
    sharedReelCount: 1,
    referentContext: sharedReferentContext,
    expected: transcriptExpected,
  },
  {
    id: 'evidence-content-role-03',
    message: 'What role did the speaker assign to the archive lead?',
    recentHistory: sharedQuestionAnswerHistory,
    hasSharedReelContext: true,
    sharedReelCount: 1,
    referentContext: sharedReferentContext,
    expected: transcriptExpected,
  },
  {
    id: 'evidence-content-organization-04',
    message:
      'Which institute did the speaker mention as coordinating the survey?',
    recentHistory: sharedQuestionAnswerHistory,
    hasSharedReelContext: true,
    sharedReelCount: 1,
    referentContext: sharedReferentContext,
    expected: transcriptExpected,
  },
  {
    id: 'evidence-content-date-05',
    message: 'What date did the speaker give for the calibration session?',
    recentHistory: sharedQuestionAnswerHistory,
    hasSharedReelContext: true,
    sharedReelCount: 1,
    referentContext: sharedReferentContext,
    expected: transcriptExpected,
  },
  {
    id: 'evidence-content-relation-06',
    message:
      'What relationship did the speaker describe between the beacon and the vessel?',
    recentHistory: sharedQuestionAnswerHistory,
    hasSharedReelContext: true,
    sharedReelCount: 1,
    referentContext: sharedReferentContext,
    expected: transcriptExpected,
  },
  {
    id: 'evidence-metadata-caption-07',
    message: 'What caption is attached to the shared recording?',
    recentHistory: sharedQuestionAnswerHistory,
    hasSharedReelContext: true,
    sharedReelCount: 1,
    referentContext: sharedReferentContext,
    expected: metadataExpected,
  },
  {
    id: 'evidence-metadata-tags-08',
    message: 'Which tags are attached to the recording?',
    recentHistory: sharedQuestionAnswerHistory,
    hasSharedReelContext: true,
    sharedReelCount: 1,
    referentContext: sharedReferentContext,
    expected: metadataExpected,
  },
  {
    id: 'evidence-metadata-uploader-09',
    message: 'Who is credited as the uploader of the recording itself?',
    recentHistory: sharedQuestionAnswerHistory,
    hasSharedReelContext: true,
    sharedReelCount: 1,
    referentContext: sharedReferentContext,
    expected: metadataExpected,
  },
  {
    id: 'evidence-summary-10',
    message: 'What is the shared recording mainly about?',
    recentHistory: sharedQuestionAnswerHistory,
    hasSharedReelContext: true,
    sharedReelCount: 1,
    referentContext: sharedReferentContext,
    expected: summaryExpected,
  },
];

module.exports = { routerEvidenceBoundaryCases };
