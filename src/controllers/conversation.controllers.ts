import { Request, Response } from 'express';

import { prisma } from '@db/prisma';

import { apiResponse } from '@utils/apiResponse';
import { asyncHandler } from '@utils/asyncHandler';
import { RESPONSE_STATUS } from '@utils/responseStatus';

const CONVERSATION_NOT_FOUND = 'Conversation not found';

const createConversation = asyncHandler(async (req: Request, res: Response) => {
    const userId: string = (req as any).userId;
    const { title } = req.body;

    const conversation = await prisma.conversation.create({
        data: { userId, title: title ?? null },
    });

    return apiResponse(res, RESPONSE_STATUS.CREATED, conversation);
});

const listConversations = asyncHandler(async (req: Request, res: Response) => {
    const userId: string = (req as any).userId;

    const conversations = await prisma.conversation.findMany({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
        select: {
            id: true,
            title: true,
            createdAt: true,
            updatedAt: true,
            _count: { select: { messages: true } },
        },
    });

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, conversations);
});

const getConversation = asyncHandler(async (req: Request, res: Response) => {
    const userId: string = (req as any).userId;
    const { id } = req.params;

    const conversation = await prisma.conversation.findFirst({
        where: { id, userId },
        include: {
            messages: { orderBy: { createdAt: 'asc' } },
        },
    });

    if (!conversation) {
        return res
            .status(RESPONSE_STATUS.NOT_FOUND)
            .json({ success: false, error: CONVERSATION_NOT_FOUND });
    }

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, conversation);
});

const updateConversation = asyncHandler(async (req: Request, res: Response) => {
    const userId: string = (req as any).userId;
    const { id } = req.params;
    const { title } = req.body;

    const existing = await prisma.conversation.findFirst({
        where: { id, userId },
    });

    if (!existing) {
        return res
            .status(RESPONSE_STATUS.NOT_FOUND)
            .json({ success: false, error: CONVERSATION_NOT_FOUND });
    }

    const updated = await prisma.conversation.update({
        where: { id },
        data: { title },
    });

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, updated);
});

const deleteConversation = asyncHandler(async (req: Request, res: Response) => {
    const userId: string = (req as any).userId;
    const { id } = req.params;

    const existing = await prisma.conversation.findFirst({
        where: { id, userId },
    });

    if (!existing) {
        return res
            .status(RESPONSE_STATUS.NOT_FOUND)
            .json({ success: false, error: CONVERSATION_NOT_FOUND });
    }

    await prisma.conversation.delete({ where: { id } });

    return apiResponse(res, RESPONSE_STATUS.NOCONTENT, null);
});

export {
    createConversation,
    listConversations,
    getConversation,
    updateConversation,
    deleteConversation,
};
