import { createId } from '@paralleldrive/cuid2';
import { Request, Response } from 'express';

import { config } from '@config/env';

import { cacheService } from '@services/cache.service';
import { EmbeddingService } from '@services/embedding.services';
import { langchainService } from '@services/langchain.services';
import { LLMService } from '@services/llm.service';
import { pineconeService } from '@services/pinecone.service';
import { ragService } from '@services/rag.service';

import { apiResponse } from '@utils/apiResponse';
import { asyncHandler } from '@utils/asyncHandler';
import { createShaFingerprint, normalizeQuery } from '@utils/helper';
import { RESPONSE_STATUS } from '@utils/responseStatus';

import { dbOps } from '../db/databaseOperations';
import { Document, Tables } from '../db/schemas';

const uploadDocument = asyncHandler(async (req: Request, res: Response) => {
    const file = req.file;
    const chunks = await langchainService.loadDocument(file!.path);
    const splitdoc = await langchainService.splitDocuments(
        config.CHUNK_SIZE,
        config.CHUNK_OVERLAP,
        chunks,
    );
    const data = splitdoc.map((item) => item.pageContent);
    const embeddingService = new EmbeddingService();
    const embeddings = await embeddingService.getBatchEmbeddings(data);

    const id = createId();
    const doc = await dbOps.insert<Document>(Tables.document, {
        id: id,
        name: file?.originalname ?? file?.filename ?? '',
        created_at: new Date(),
        updated_at: new Date(),
        is_deleted: false,
    });
    await pineconeService.upsertChunks(
        'default',
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

const queryDocuments = asyncHandler(async (req: Request, res: Response) => {
    const { user_question, stream } = req.body;
    const llmService = new LLMService();

    const normalizedQuery = normalizeQuery(user_question);
    const shaFingerprint = createShaFingerprint(normalizedQuery);

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

    const ragData = await ragService.ragPipeline(user_question, shaFingerprint);

    if (!ragData) {
        return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
            // eslint-disable-next-line quotes
            answer: "I don't have enough context to answer that question.",
            cached: false,
            provenance: [],
        });
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

        await cacheService.setCache(
            `resp:${shaFingerprint}`,
            JSON.stringify(responsePayload),
        );
        return apiResponse(res, RESPONSE_STATUS.SUCCESS, responsePayload);
    }

    // Streaming path
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('X-Cache', 'false');
    res.setHeader('X-Cache-Embed', cachedQueryEmbedding ? 'cached' : 'false');

    let fullAnswer = '';

    await llmService.streamAnswer(user_question, redactedContext, (chunk) => {
        fullAnswer += chunk;
        res.write(
            `data: ${JSON.stringify({ type: 'chunk', data: chunk })}\n\n`,
        );
    });

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

    res.end();
});

const deleteDocument = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    const doc = await dbOps.findById<Document>(Tables.document, id);
    if (!doc) {
        return res
            .status(404)
            .json({ success: false, error: 'Document not found' });
    }

    await pineconeService.deleteByDocument('default', id);
    await dbOps.deleteById(Tables.document, id);

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, { deleted: id });
});

export { uploadDocument, queryDocuments, deleteDocument };
