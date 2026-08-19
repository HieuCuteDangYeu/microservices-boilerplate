const fs = require('node:fs')

const replaceOnce = (file, before, after) => {
  const source = fs.readFileSync(file, 'utf8')
  if (!source.includes(before)) {
    throw new Error(`Expected source block not found in ${file}`)
  }
  fs.writeFileSync(file, source.replace(before, after))
}

const insertBefore = (file, marker, insertion) => {
  const source = fs.readFileSync(file, 'utf8')
  if (!source.includes(marker)) {
    throw new Error(`Expected marker not found in ${file}`)
  }
  fs.writeFileSync(file, source.replace(marker, `${insertion}${marker}`))
}

const mutationInterface = 'apps/conversation-service/src/domain/interfaces/conversation-mutation.repository.interface.ts'
insertBefore(
  mutationInterface,
  `  abstract removeParticipant(\n`,
  `  abstract removeParticipantAsMember(\n    conversationId: string,\n    userId: string,\n  ): Promise<boolean>;\n\n`,
)

const prismaRepo = 'apps/conversation-service/src/infrastructure/repositories/prisma-conversation-chat.repository.ts'
insertBefore(
  prismaRepo,
  `  async removeParticipant(\n`,
  `  async removeParticipantAsMember(\n    conversationId: string,\n    userId: string,\n  ): Promise<boolean> {\n    const conversation = await this.conversationPrisma.conversation.findUnique({\n      where: { id: conversationId },\n      select: {\n        creatorId: true,\n        participantIds: true,\n        memberJoinedAt: true,\n        createdAt: true,\n      },\n    });\n\n    if (!conversation) {\n      throw new NotFoundException('Conversation not found');\n    }\n\n    if (\n      conversation.creatorId === userId ||\n      !conversation.participantIds.includes(userId)\n    ) {\n      return false;\n    }\n\n    const participantIds = conversation.participantIds.filter(\n      (participantId) => participantId !== userId,\n    );\n    const memberJoinedAt = normalizeMemberJoinedAt(\n      conversation.memberJoinedAt,\n      conversation.participantIds,\n      conversation.createdAt,\n    );\n    delete memberJoinedAt[userId];\n\n    const result = await this.conversationPrisma.conversation.updateMany({\n      where: {\n        id: conversationId,\n        creatorId: { not: userId },\n        participantIds: { has: userId },\n      },\n      data: {\n        participantIds: { set: participantIds },\n        memberJoinedAt: memberJoinedAt as Prisma.InputJsonValue,\n      },\n    });\n\n    return result.count === 1;\n  }\n\n`,
)

const useCase = 'apps/conversation-service/src/application/use-cases/manage-group-conversation.use-case.ts'
replaceOnce(
  useCase,
  `    await this.mutationRepository.removeParticipant(\n      input.conversationId,\n      input.actorUserId,\n    );\n\n    return await this.getUpdatedConversation(input.conversationId);\n  }\n`,
  `    const removed = await this.mutationRepository.removeParticipantAsMember(\n      input.conversationId,\n      input.actorUserId,\n    );\n\n    if (!removed) {\n      throw new ConflictException(\n        'Group membership or ownership changed; refresh and try again',\n      );\n    }\n\n    return await this.getUpdatedConversation(input.conversationId);\n  }\n`,
)

const spec = 'apps/conversation-service/src/application/use-cases/manage-group-conversation.use-case.spec.ts'
replaceOnce(
  spec,
  `    removeParticipantAsOwner: jest.Mock;\n    removeParticipant: jest.Mock;`,
  `    removeParticipantAsOwner: jest.Mock;\n    removeParticipantAsMember: jest.Mock;\n    removeParticipant: jest.Mock;`,
)
replaceOnce(
  spec,
  `      removeParticipantAsOwner: jest.fn().mockResolvedValue(true),\n      removeParticipant: jest.fn().mockResolvedValue(undefined),`,
  `      removeParticipantAsOwner: jest.fn().mockResolvedValue(true),\n      removeParticipantAsMember: jest.fn().mockResolvedValue(true),\n      removeParticipant: jest.fn().mockResolvedValue(undefined),`,
)
replaceOnce(
  spec,
  `    expect(mutationRepository.removeParticipant).toHaveBeenCalledWith(\n      before.id,\n      MEMBER_ID,\n    );\n    expect(result.participantIds).not.toContain(MEMBER_ID);\n  });\n\n  it('requires the current owner to transfer ownership before leaving',`,
  `    expect(mutationRepository.removeParticipantAsMember).toHaveBeenCalledWith(\n      before.id,\n      MEMBER_ID,\n    );\n    expect(result.participantIds).not.toContain(MEMBER_ID);\n  });\n\n  it('rejects leave if the member becomes owner concurrently', async () => {\n    chatRepository.findConversation.mockResolvedValue(group());\n    mutationRepository.removeParticipantAsMember.mockResolvedValue(false);\n\n    await expect(\n      useCase.leave({\n        conversationId: 'group-id',\n        actorUserId: MEMBER_ID,\n      }),\n    ).rejects.toThrow(\n      'Group membership or ownership changed; refresh and try again',\n    );\n  });\n\n  it('requires the current owner to transfer ownership before leaving',`,
)
