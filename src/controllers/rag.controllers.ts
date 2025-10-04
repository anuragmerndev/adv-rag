import { createId } from '@paralleldrive/cuid2';
import { Request, Response } from 'express';

import { EmbeddingService } from '@services/embedding.services';
import { langchainService } from '@services/langchain.services';
import { LLMService } from '@services/llm.service';
import { vectorService } from '@services/vector.services';

import { apiResponse } from '@utils/apiResponse';
import { asyncHandler } from '@utils/asyncHandler';
import { RESPONSE_STATUS } from '@utils/responseStatus';

import { dbOps } from '../db/databaseOperations';
import { Document, Tables } from '../db/schemas';

const uploadDocument = asyncHandler(async (req: Request, res: Response) => {
    const file = req.file;
    const chunks = await langchainService.loadDocument(file!.path);
    const splitdoc = await langchainService.splitDocuments(2500, 100, chunks);
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
    const embeddingService = new EmbeddingService();
    const llmService = new LLMService();
    const queryEmbedding = await embeddingService.getEmbedding(query);

    const similaritySearchResult = await vectorService.similaritySearch(
        queryEmbedding,
        5,
    );

    const contextData = similaritySearchResult
        .map((item) => item.content)
        .join('\n');

    if (!stream) {
        const response = await llmService.generateAnswer(query, contextData);
        return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
            data: response,
            message: 'success',
        });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    await llmService.streamAnswer(query, contextData, (chunk) => {
        res.write(
            `data: ${JSON.stringify({ type: 'chunk', data: chunk })}\n\n`,
        );
    });

    res.end();
});

export { uploadDocument, queryDocuments };
