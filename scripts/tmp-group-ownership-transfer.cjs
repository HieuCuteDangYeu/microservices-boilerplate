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

const dtoPath = 'libs/common/src/conversation/dtos/transfer-group-ownership.dto.ts'
fs.writeFileSync(
  dtoPath,
  `import { createZodDto } from 'nestjs-zod';\nimport { z } from 'zod';\n\nexport const TransferGroupOwnershipSchema = z.object({\n  userId: z.string().trim().min(1),\n});\n\nexport class TransferGroupOwnershipDto extends createZodDto(\n  TransferGroupOwnershipSchema,\n) {}\n`,
)

const mutationInterface = 'apps/conversation-service/src/domain/interfaces/conversation-mutation.repository.interface.ts'
insertBefore(
  mutationInterface,
  `  abstract removeParticipant(\n`,
  `  abstract transferOwnership(\n    conversationId: string,\n    currentOwnerUserId: string,\n    newOwnerUserId: string,\n  ): Promise<boolean>;\n\n`,
)

const prismaRepo = 'apps/conversation-service/src/infrastructure/repositories/prisma-conversation-chat.repository.ts'
insertBefore(
  prismaRepo,
  `  async removeParticipant(\n`,
  `  async transferOwnership(\n    conversationId: string,\n    currentOwnerUserId: string,\n    newOwnerUserId: string,\n  ): Promise<boolean> {\n    const result = await this.conversationPrisma.conversation.updateMany({\n      where: {\n        id: conversationId,\n        creatorId: currentOwnerUserId,\n        participantIds: { has: newOwnerUserId },\n      },\n      data: { creatorId: newOwnerUserId },\n    });\n\n    return result.count === 1;\n  }\n\n`,
)

const useCase = 'apps/conversation-service/src/application/use-cases/manage-group-conversation.use-case.ts'
replaceOnce(
  useCase,
  `  BadRequestException,\n  ForbiddenException,`,
  `  BadRequestException,\n  ConflictException,\n  ForbiddenException,`,
)
insertBefore(
  useCase,
  `  async removeMember(input: {\n`,
  `  async transferOwnership(input: {\n    conversationId: string;\n    actorUserId: string;\n    userId: string;\n  }): Promise<Conversation> {\n    const conversation = await this.getGroupConversationForMember(\n      input.conversationId,\n      input.actorUserId,\n    );\n    this.assertOwner(conversation, input.actorUserId);\n\n    const newOwnerUserId = input.userId.trim();\n    assertValidConversationUserId(newOwnerUserId);\n\n    if (newOwnerUserId === conversation.creatorId) {\n      throw new BadRequestException('New owner must be another group member');\n    }\n\n    if (!conversation.participantIds.includes(newOwnerUserId)) {\n      throw new NotFoundException('New owner must be an existing group member');\n    }\n\n    const transferred = await this.mutationRepository.transferOwnership(\n      input.conversationId,\n      input.actorUserId,\n      newOwnerUserId,\n    );\n\n    if (!transferred) {\n      throw new ConflictException(\n        'Group membership or ownership changed; refresh and try again',\n      );\n    }\n\n    return await this.getUpdatedConversation(input.conversationId);\n  }\n\n`,
)
replaceOnce(
  useCase,
  `        'The group owner cannot leave before ownership transfer is supported',`,
  `        'The group owner must transfer ownership before leaving',`,
)

const microController = 'apps/conversation-service/src/infrastructure/controllers/conversation.controller.ts'
insertBefore(
  microController,
  `  @MessagePattern('add_conversation_member')\n`,
  `  @MessagePattern('transfer_group_ownership')\n  async handleTransferGroupOwnership(\n    @Payload()\n    data: {\n      conversationId: string;\n      actorUserId: string;\n      userId: string;\n    },\n  ) {\n    try {\n      const conversation =\n        await this.manageGroupConversationUseCase.transferOwnership(data);\n      this.chatGateway.emitConversationUpdated(conversation);\n      return ChatMapper.conversationToDto(conversation);\n    } catch (err: unknown) {\n      const error = err as Error;\n      this.logger.error(`❌ [TransferGroupOwnership] Error: ${error.message}`);\n      throw new RpcException(error.message);\n    }\n  }\n\n`,
)

const apiController = 'apps/api-gateway/src/conversation/conversation.controller.ts'
replaceOnce(
  apiController,
  `import { MessageDto } from '@common/conversation/dtos/message.dto';\nimport { UpdateGroupConversationDto, UpdateGroupConversationSchema } from '@common/conversation/dtos/update-group-conversation.dto';`,
  `import { MessageDto } from '@common/conversation/dtos/message.dto';\nimport { TransferGroupOwnershipDto, TransferGroupOwnershipSchema } from '@common/conversation/dtos/transfer-group-ownership.dto';\nimport { UpdateGroupConversationDto, UpdateGroupConversationSchema } from '@common/conversation/dtos/update-group-conversation.dto';`,
)
insertBefore(
  apiController,
  `  @Get(':id/members')\n`,
  `  @Patch(':id/owner')\n  @ApiOperation({ summary: 'Chuyển quyền sở hữu group conversation' })\n  @ApiBody({ type: TransferGroupOwnershipDto })\n  async transferGroupOwnership(\n    @Param('id') conversationId: string,\n    @Body() body: unknown,\n    @CurrentUser() user: AuthUser,\n  ): Promise<ConversationDto> {\n    const parsed = TransferGroupOwnershipSchema.safeParse(body);\n    if (!parsed.success) {\n      throw new BadRequestException(parsed.error.flatten());\n    }\n\n    return await lastValueFrom(\n      this.conversationClient.send<ConversationDto>('transfer_group_ownership', {\n        conversationId,\n        actorUserId: user.id,\n        userId: parsed.data.userId,\n      }),\n    );\n  }\n\n`,
)

const useCaseSpec = 'apps/conversation-service/src/application/use-cases/manage-group-conversation.use-case.spec.ts'
replaceOnce(
  useCaseSpec,
  `    addParticipant: jest.Mock;\n    removeParticipant: jest.Mock;`,
  `    addParticipant: jest.Mock;\n    transferOwnership: jest.Mock;\n    removeParticipant: jest.Mock;`,
)
replaceOnce(
  useCaseSpec,
  `      addParticipant: jest.fn().mockResolvedValue(undefined),\n      removeParticipant: jest.fn().mockResolvedValue(undefined),`,
  `      addParticipant: jest.fn().mockResolvedValue(undefined),\n      transferOwnership: jest.fn().mockResolvedValue(true),\n      removeParticipant: jest.fn().mockResolvedValue(undefined),`,
)
insertBefore(
  useCaseSpec,
  `  it('never allows the owner to be removed', async () => {\n`,
  `  it('transfers ownership to an existing group member', async () => {\n    const before = group();\n    const after = new Conversation({ ...before, creatorId: MEMBER_ID });\n    chatRepository.findConversation\n      .mockResolvedValueOnce(before)\n      .mockResolvedValueOnce(after);\n\n    const result = await useCase.transferOwnership({\n      conversationId: before.id,\n      actorUserId: OWNER_ID,\n      userId: MEMBER_ID,\n    });\n\n    expect(mutationRepository.transferOwnership).toHaveBeenCalledWith(\n      before.id,\n      OWNER_ID,\n      MEMBER_ID,\n    );\n    expect(result.creatorId).toBe(MEMBER_ID);\n  });\n\n  it('blocks ownership transfer by a non-owner member', async () => {\n    chatRepository.findConversation.mockResolvedValue(group());\n\n    await expect(\n      useCase.transferOwnership({\n        conversationId: 'group-id',\n        actorUserId: MEMBER_ID,\n        userId: THIRD_ID,\n      }),\n    ).rejects.toBeInstanceOf(ForbiddenException);\n\n    expect(mutationRepository.transferOwnership).not.toHaveBeenCalled();\n  });\n\n  it('requires the new owner to already be a group member', async () => {\n    chatRepository.findConversation.mockResolvedValue(group());\n\n    await expect(\n      useCase.transferOwnership({\n        conversationId: 'group-id',\n        actorUserId: OWNER_ID,\n        userId: NEW_MEMBER_ID,\n      }),\n    ).rejects.toThrow('New owner must be an existing group member');\n\n    expect(mutationRepository.transferOwnership).not.toHaveBeenCalled();\n  });\n\n  it('rejects a stale ownership transfer when membership changed concurrently', async () => {\n    chatRepository.findConversation.mockResolvedValue(group());\n    mutationRepository.transferOwnership.mockResolvedValue(false);\n\n    await expect(\n      useCase.transferOwnership({\n        conversationId: 'group-id',\n        actorUserId: OWNER_ID,\n        userId: MEMBER_ID,\n      }),\n    ).rejects.toThrow('Group membership or ownership changed; refresh and try again');\n  });\n\n`,
)
replaceOnce(
  useCaseSpec,
  `  it('blocks the owner from leaving until ownership transfer exists', async () => {`,
  `  it('requires the current owner to transfer ownership before leaving', async () => {`,
)
replaceOnce(
  useCaseSpec,
  `      'The group owner cannot leave before ownership transfer is supported',`,
  `      'The group owner must transfer ownership before leaving',`,
)

const realtimeSpec = 'apps/conversation-service/src/infrastructure/controllers/conversation.realtime.controller.spec.ts'
replaceOnce(
  realtimeSpec,
  `const group = (participantIds: string[]) =>\n  new Conversation({\n    id: CONVERSATION_ID,\n    creatorId: OWNER_ID,`,
  `const group = (participantIds: string[], creatorId = OWNER_ID) =>\n  new Conversation({\n    id: CONVERSATION_ID,\n    creatorId,`,
)
replaceOnce(
  realtimeSpec,
  `    addMember: jest.Mock;\n    removeMember: jest.Mock;`,
  `    addMember: jest.Mock;\n    transferOwnership: jest.Mock;\n    removeMember: jest.Mock;`,
)
replaceOnce(
  realtimeSpec,
  `      addMember: jest.fn(),\n      removeMember: jest.fn(),`,
  `      addMember: jest.fn(),\n      transferOwnership: jest.fn(),\n      removeMember: jest.fn(),`,
)
insertBefore(
  realtimeSpec,
  `  it('sends conversation_created only to a newly-added member and updates existing members', async () => {\n`,
  `  it('fans ownership transfer out to every current participant', async () => {\n    const updated = group([OWNER_ID, MEMBER_ID, THIRD_ID], MEMBER_ID);\n    manageGroupConversationUseCase.transferOwnership.mockResolvedValue(updated);\n\n    const result = await controller.handleTransferGroupOwnership({\n      conversationId: CONVERSATION_ID,\n      actorUserId: OWNER_ID,\n      userId: MEMBER_ID,\n    });\n\n    expect(chatGateway.emitConversationUpdated).toHaveBeenCalledWith(updated);\n    expect(result).toEqual(\n      expect.objectContaining({ id: CONVERSATION_ID, creatorId: MEMBER_ID }),\n    );\n  });\n\n`,
)
