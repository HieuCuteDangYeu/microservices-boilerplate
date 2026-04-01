import { FunctionDeclaration, SchemaType } from '@google/generative-ai';

export const checkReelStatusTool: FunctionDeclaration = {
  name: 'check_reel_status',
  description:
    'Retrieve the current processing status, duration, and URL of a specific reel/video.',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      reelId: {
        type: SchemaType.STRING,
        description: 'The unique UUID of the reel',
      },
    },
    required: ['reelId'],
  },
};

export const getRecentMessagesTool: FunctionDeclaration = {
  name: 'get_recent_messages',
  description:
    'Retrieve the most recent messages from a specific conversation to understand the context.',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      conversationId: {
        type: SchemaType.STRING,
        description: 'The unique UUID of the conversation',
      },
      limit: {
        type: SchemaType.NUMBER,
        description: 'Number of messages to retrieve (max 10)',
      },
    },
    required: ['conversationId'],
  },
};
