'use strict';

const immediateFollowUpHistory = [
  'USER: [Shared recording] orbital lattice',
  'USER: Which structure does the presenter introduce first?',
  'ASSISTANT: The presenter introduces the outer lattice.',
].join('\n');

const immediateFollowUpContext = {
  conversationHasSharedReelContext: true,
  accessibleSharedReelCount: 1,
  recentShareEvent: true,
  turnsSinceRecentShare: 2,
  recentEventTypes: ['REEL_SHARE', 'TEXT', 'TEXT'],
};

const delayedFollowUpHistory = [
  immediateFollowUpHistory,
  'USER: The group then reviews a calibration note.',
  'ASSISTANT: The calibration note describes a separate setup step.',
  'USER: They also compare two measurement passes.',
  'ASSISTANT: The second pass is described as more stable.',
].join('\n');

const delayedFollowUpContext = {
  conversationHasSharedReelContext: true,
  accessibleSharedReelCount: 1,
  recentShareEvent: false,
  turnsSinceRecentShare: 6,
  recentEventTypes: [
    'REEL_SHARE',
    'TEXT',
    'TEXT',
    'TEXT',
    'TEXT',
    'TEXT',
    'TEXT',
  ],
};

const reelFollowUpExpected = {
  intent: 'REEL_VIDEO_QUESTION',
  referenceTarget: 'SHARED_REEL',
  reelQuestionType: 'TRANSCRIPT_CONTENT',
  requiredEvidence: ['TRANSCRIPT'],
  recommendationAction: 'NONE',
};

const conversationExpected = {
  intent: 'CONVERSATION_MEMORY_QUESTION',
  referenceTarget: 'CONVERSATION',
  reelQuestionType: 'NONE',
  requiredEvidence: ['CONVERSATION_MEMORY'],
  recommendationAction: 'NONE',
};

const normalChatExpected = {
  intent: 'NORMAL_CHAT',
  referenceTarget: 'NONE',
  reelQuestionType: 'NONE',
  requiredEvidence: ['NONE'],
  recommendationAction: 'NONE',
};

const userMemoryExpected = {
  intent: 'USER_MEMORY_QUESTION',
  referenceTarget: 'USER_MEMORY',
  reelQuestionType: 'NONE',
  requiredEvidence: ['USER_MEMORY'],
  recommendationAction: 'NONE',
};

const routerMultiturnCases = [
  {
    id: 'multiturn-reel-factual-01',
    message: 'Which material forms the outer lattice?',
    recentHistory: immediateFollowUpHistory,
    hasSharedReelContext: true,
    sharedReelCount: 1,
    referentContext: immediateFollowUpContext,
    expected: reelFollowUpExpected,
  },
  {
    id: 'multiturn-reel-quantitative-02',
    message: 'How many nodes are in that lattice?',
    recentHistory: immediateFollowUpHistory,
    hasSharedReelContext: true,
    sharedReelCount: 1,
    referentContext: immediateFollowUpContext,
    expected: reelFollowUpExpected,
  },
  {
    id: 'multiturn-reel-causal-03',
    message: 'Why did the presenter use a layered coating?',
    recentHistory: immediateFollowUpHistory,
    hasSharedReelContext: true,
    sharedReelCount: 1,
    referentContext: immediateFollowUpContext,
    expected: reelFollowUpExpected,
  },
  {
    id: 'multiturn-reel-relational-04',
    message: 'What relation does the anchor have to the frame?',
    recentHistory: immediateFollowUpHistory,
    hasSharedReelContext: true,
    sharedReelCount: 1,
    referentContext: immediateFollowUpContext,
    expected: reelFollowUpExpected,
  },
  {
    id: 'multiturn-reel-comparative-05',
    message: 'How does the first method compare with the second?',
    recentHistory: immediateFollowUpHistory,
    hasSharedReelContext: true,
    sharedReelCount: 1,
    referentContext: immediateFollowUpContext,
    expected: reelFollowUpExpected,
  },
  {
    id: 'multiturn-reel-sequence-06',
    message: 'What happens after the calibration step?',
    recentHistory: immediateFollowUpHistory,
    hasSharedReelContext: true,
    sharedReelCount: 1,
    referentContext: immediateFollowUpContext,
    expected: reelFollowUpExpected,
  },
  {
    id: 'multiturn-reel-domain-followup-07',
    message: 'Which lattice parameter is adjusted next?',
    recentHistory: immediateFollowUpHistory,
    hasSharedReelContext: true,
    sharedReelCount: 1,
    referentContext: immediateFollowUpContext,
    expected: reelFollowUpExpected,
  },
  {
    id: 'multiturn-reel-pronoun-followup-08',
    message: 'Does it remain stable after that?',
    recentHistory: immediateFollowUpHistory,
    hasSharedReelContext: true,
    sharedReelCount: 1,
    referentContext: immediateFollowUpContext,
    expected: reelFollowUpExpected,
  },
  {
    id: 'multiturn-reel-delayed-followup-09',
    message: 'Which compound is named at the end?',
    recentHistory: delayedFollowUpHistory,
    hasSharedReelContext: true,
    sharedReelCount: 1,
    referentContext: delayedFollowUpContext,
    expected: reelFollowUpExpected,
  },
  {
    id: 'multiturn-conversation-memory-10',
    message: 'What did you say about the lattice earlier?',
    recentHistory: immediateFollowUpHistory,
    hasSharedReelContext: true,
    sharedReelCount: 1,
    referentContext: immediateFollowUpContext,
    expected: conversationExpected,
  },
  {
    id: 'multiturn-unrelated-chat-11',
    message: 'Can you sketch a TypeScript interface for a queue?',
    recentHistory: immediateFollowUpHistory,
    hasSharedReelContext: true,
    sharedReelCount: 1,
    referentContext: immediateFollowUpContext,
    expected: normalChatExpected,
  },
  {
    id: 'multiturn-user-memory-12',
    message: 'Do you remember my preferred coding style?',
    recentHistory: immediateFollowUpHistory,
    hasSharedReelContext: true,
    sharedReelCount: 1,
    referentContext: immediateFollowUpContext,
    expected: userMemoryExpected,
  },
];

module.exports = { routerMultiturnCases };
