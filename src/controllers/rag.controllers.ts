import { Request, Response } from 'express';

import { prisma } from '@db/prisma';

import { config } from '@config/env';

import { cacheService } from '@services/cache.service';
import { EmbeddingService } from '@services/embedding.services';
import { langchainService } from '@services/langchain.services';
import { ChatMessage, LLMService } from '@services/llm.service';
import { pineconeService } from '@services/pinecone.service';
import { ragService } from '@services/rag.service';

import { apiResponse } from '@utils/apiResponse';
import { asyncHandler } from '@utils/asyncHandler';
import { createShaFingerprint, normalizeQuery } from '@utils/helper';
import { RESPONSE_STATUS } from '@utils/responseStatus';

const uploadDocument = asyncHandler(async (req: Request, res: Response) => {
    const file = req.file;
    const userId: string = (req as any).userId;

    const chunks = await langchainService.loadDocument(file!.path);
    const splitdoc = await langchainService.splitDocuments(
        config.CHUNK_SIZE,
        config.CHUNK_OVERLAP,
        chunks,
    );
    const data = splitdoc.map((item) => item.pageContent);
    const embeddingService = new EmbeddingService();
    const embeddings = await embeddingService.getBatchEmbeddings(data);

    const doc = await prisma.document.create({
        data: {
            userId,
            originalName: file?.originalname ?? file?.filename ?? '',
            chunkCount: data.length,
            fileSize: file?.size ?? 0,
            filePath: file?.path ?? null,
        },
    });

    await pineconeService.upsertChunks(
        userId,
        doc.id,
        data.map((content) => ({
            content,
            documentName: file?.originalname ?? file?.filename ?? '',
        })),
        embeddings,
    );
    return apiResponse(res, RESPONSE_STATUS.CREATED, {
        message: 'Document uploaded and indexed successfully',
        documentId: doc.id,
        originalName: file?.originalname ?? '',
        chunks: data.length,
    });
});

type ConvRow = { id: string; title: string | null };

async function loadConversationContext(
    conversationId: string,
    userId: string,
): Promise<
    { conversation: ConvRow; chatHistory: ChatMessage[] } | 'not_found'
> {
    const conversation = await prisma.conversation.findFirst({
        where: { id: conversationId, userId },
    });

    if (!conversation) return 'not_found';

    const recentMessages = await prisma.message.findMany({
        where: { conversationId },
        orderBy: { createdAt: 'desc' },
        take: 6,
    });

    return {
        conversation,
        chatHistory: recentMessages.reverse().map((m) => ({
            role: m.role as ChatMessage['role'],
            content: m.content,
        })),
    };
}

async function persistMessages(
    conversationId: string | undefined,
    conversation: ConvRow | null,
    userQuestion: string,
    answer: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    provenance: any[],
) {
    if (!conversationId || !conversation) return;

    await prisma.message.createMany({
        data: [
            { conversationId, role: 'user', content: userQuestion },
            {
                conversationId,
                role: 'assistant',
                content: answer,
                sources: provenance,
            },
        ],
    });

    // Bump updatedAt; auto-title from first user message if no title yet
    await prisma.conversation.update({
        where: { id: conversationId },
        data: {
            updatedAt: new Date(),
            ...(conversation.title
                ? {}
                : { title: userQuestion.slice(0, 80).trim() }),
        },
    });
}

const SSE_HEADERS = {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
} as const;

const setSseHeaders = (res: Response) => {
    Object.entries(SSE_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
};

// prettier-ignore
// eslint-disable-next-line @typescript-eslint/quotes
const NO_CONTEXT_ANSWER = 'I don\'t have enough context to answer that question.';

function sendNoContext(res: Response, stream: boolean): void {
    if (stream) {
        setSseHeaders(res);
        res.write(
            `data: ${JSON.stringify({ type: 'chunk', data: NO_CONTEXT_ANSWER })}\n\n`,
        );
        res.write(
            `data: ${JSON.stringify({ type: 'done', provenance: [] })}\n\n`,
        );
        res.end();
        return;
    }
    apiResponse(res, RESPONSE_STATUS.SUCCESS, {
        answer: NO_CONTEXT_ANSWER,
        cached: false,
        provenance: [],
    });
}

const queryDocuments = asyncHandler(async (req: Request, res: Response) => {
    const { user_question, stream, conversationId } = req.body;
    const userId: string = (req as any).userId;
    const llmService = new LLMService();

    const normalizedQuery = normalizeQuery(user_question);
    const shaFingerprint = createShaFingerprint(normalizedQuery);

    // Load conversation + last 6 messages if conversationId provided
    let chatHistory: ChatMessage[] = [];
    let conversation: ConvRow | null = null;

    if (conversationId) {
        const ctx = await loadConversationContext(conversationId, userId);
        if (ctx === 'not_found') {
            return res.status(RESPONSE_STATUS.NOT_FOUND).json({
                success: false,
                error: 'Conversation not found',
            });
        }
        conversation = ctx.conversation;
        chatHistory = ctx.chatHistory;
    }

    // Skip response cache when inside a conversation — history makes responses unique
    if (!conversationId) {
        const cachedResponse = await cacheService.getCache(
            `resp:${shaFingerprint}`,
        );
        if (cachedResponse) {
            res.setHeader('X-Cache', 'cached');
            return apiResponse(
                res,
                RESPONSE_STATUS.SUCCESS,
                JSON.parse(cachedResponse),
            );
        }
    }

    const ragData = await ragService.ragPipeline(
        user_question,
        shaFingerprint,
        userId,
    );

    if (!ragData) {
        sendNoContext(res, stream);
        return;
    }

    const { policyResult, preFilterResults, provenance, cachedQueryEmbedding } =
        ragData;

    // Apply redaction to context before passing to LLM (fixes streaming redaction gap)
    const redactedContext = preFilterResults
        .map((r) => r.prefilter.redacted)
        .join('\n\n');

    if (!stream) {
        const answer = await llmService.generateAnswer(
            user_question,
            redactedContext,
            undefined,
            chatHistory,
        );

        res.setHeader('X-Cache', 'false');
        res.setHeader(
            'X-Cache-Embed',
            cachedQueryEmbedding ? 'cached' : 'false',
        );

        const responsePayload = {
            answer,
            cached: false,
            embeddingCached: cachedQueryEmbedding,
            provenance,
            policy: {
                decision: policyResult.decision,
                reason: policyResult.reason,
            },
        };

        if (!conversationId) {
            await cacheService.setCache(
                `resp:${shaFingerprint}`,
                JSON.stringify(responsePayload),
            );
        }

        await persistMessages(
            conversationId,
            conversation,
            user_question,
            answer,
            provenance,
        );
        return apiResponse(res, RESPONSE_STATUS.SUCCESS, responsePayload);
    }

    // Streaming path
    setSseHeaders(res);
    res.setHeader('X-Cache', 'false');
    res.setHeader('X-Cache-Embed', cachedQueryEmbedding ? 'cached' : 'false');

    let fullAnswer = '';

    await llmService.streamAnswer(
        user_question,
        redactedContext,
        (chunk) => {
            fullAnswer += chunk;
            res.write(
                `data: ${JSON.stringify({ type: 'chunk', data: chunk })}\n\n`,
            );
        },
        undefined,
        chatHistory,
    );

    res.write(
        `data: ${JSON.stringify({
            type: 'done',
            provenance,
            policy: {
                decision: policyResult.decision,
                reason: policyResult.reason,
            },
        })}\n\n`,
    );

    if (!conversationId) {
        await cacheService.setCache(
            `resp:${shaFingerprint}`,
            JSON.stringify({
                answer: fullAnswer,
                cached: false,
                embeddingCached: cachedQueryEmbedding,
                provenance,
                policy: {
                    decision: policyResult.decision,
                    reason: policyResult.reason,
                },
            }),
        );
    }

    await persistMessages(
        conversationId,
        conversation,
        user_question,
        fullAnswer,
        provenance,
    );
    res.end();
});

export { uploadDocument, queryDocuments };
