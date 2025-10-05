import { createId } from '@paralleldrive/cuid2';
import { Request, Response } from 'express';

import { cacheService } from '@services/cache.service';
import { EmbeddingService } from '@services/embedding.services';
import { langchainService } from '@services/langchain.services';
import { LLMService } from '@services/llm.service';
import { ragService } from '@services/rag.service';
import { vectorService } from '@services/vector.services';

import { apiResponse } from '@utils/apiResponse';
import { asyncHandler } from '@utils/asyncHandler';
import { createShaFingerprint, normalizeQuery } from '@utils/helper';
import { RESPONSE_STATUS } from '@utils/responseStatus';

import { dbOps } from '../db/databaseOperations';
import { Document, Tables } from '../db/schemas';

const uploadDocument = asyncHandler(async (req: Request, res: Response) => {
    const file = req.file;
    const chunks = await langchainService.loadDocument(file!.path);
    const splitdoc = await langchainService.splitDocuments(500, 100, chunks);
    const data = splitdoc.map((item) => item.pageContent);
    const embeddingService = new EmbeddingService();
    const embeddings = await embeddingService.getBatchEmbeddings(data);
    const dataToSave = data.map((item, index) => ({
        content: item,
        embedding: embeddings[index],
    }));

    const id = createId();
    const doc = await dbOps.insert<Document>(Tables.document, {
        id: id,
        name: file?.filename,
        created_at: new Date(),
        updated_at: new Date(),
        is_deleted: false,
    });
    console.log('doc created', { doc });
    await vectorService.insertChunksBatch(doc.id, dataToSave);
    return apiResponse(res, 200, { data: embeddings, message: 'success' });
});

const queryDocuments = asyncHandler(async (req: Request, res: Response) => {
    const { query, stream } = req.body;
    const llmService = new LLMService();

    const normalizedQuery = normalizeQuery(query);
    const shaFingerprint = createShaFingerprint(normalizedQuery);

    const cachedResponse = await cacheService.getCache(
        `resp:${shaFingerprint}`,
    );
    if (cachedResponse) {
        res.setHeader('X-Cache', 'cached');
        const response = JSON.parse(cachedResponse);
        return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
            ...response,
        });
    }

    const data = await ragService.ragPipeline(query, shaFingerprint);

    if (!data) {
        return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
            data: 'we do not have answer for this, kindly ask another question',
            message: 'success',
            meta: {
                decision: 'refuse',
                reason: 'no_relevant_context',
                provenance: [],
            },
        });
    }

    const {
        policyResult,
        preFilterResults,
        provenance,
        contextData,
        cachedQueryEmbedding,
    } = data;

    if (!stream && preFilterResults && preFilterResults.length > 0) {
        const llmAnswerTime = Date.now();
        const response = await llmService.generateAnswer(
            query,
            preFilterResults[0].prefilter.redacted,
        );
        console.log('llm answer took ', Date.now() - llmAnswerTime);
        res.setHeader('X-Cache', 'false');
        res.setHeader(
            'X-Cache-Embed',
            cachedQueryEmbedding ? 'cached' : 'false ',
        );

        return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
            data: response,
            message: 'success',
            meta: {
                decision: policyResult.decision, // allow | partial
                reason: policyResult.reason,
                provenance,
            },
            embCache: cachedQueryEmbedding,
        });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('X-Cache', 'false');
    res.setHeader('X-Cache-Embed', cachedQueryEmbedding ? 'cached' : 'false ');

    let resp = '';

    await llmService.streamAnswer(query, contextData, (chunk) => {
        resp += chunk;
        res.write(
            `data: ${JSON.stringify({ type: 'chunk', data: chunk })}\n\n`,
        );
    });

    res.write(
        `data: ${JSON.stringify({
            type: 'done',
            meta: {
                decision: policyResult.decision,
                reason: policyResult.reason,
                provenance,
            },
        })}\n\n`,
    );

    await cacheService.setCache(
        `resp:${shaFingerprint}`,
        JSON.stringify({
            data: resp,
            message: 'success',
            meta: {
                decision: policyResult.decision,
                reason: policyResult.reason,
                provenance,
            },
            cache: false,
            embCache: cachedQueryEmbedding,
        }),
    );

    res.end();
});

export { uploadDocument, queryDocuments };
