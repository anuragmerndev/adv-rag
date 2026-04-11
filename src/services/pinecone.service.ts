import { Pinecone } from '@pinecone-database/pinecone';

import { config } from '@config/env';
import { logger } from '@logger/logger';

export interface PineconeSearchResult {
    id: string;
    doc_id: string;
    content: string;
    documentName: string;
    similarity: number;
}

class PineconeService {
    private static instance: PineconeService;
    private client: Pinecone;
    private indexName: string;

    private constructor() {
        this.client = new Pinecone({ apiKey: config.PINECONE_API_KEY });
        this.indexName = config.PINECONE_INDEX;
    }

    public static getInstance(): PineconeService {
        if (!PineconeService.instance) {
            PineconeService.instance = new PineconeService();
        }
        return PineconeService.instance;
    }

    private index() {
        return this.client.index(this.indexName);
    }

    async initialize(): Promise<void> {
        const indexList = await this.client.listIndexes();
        const exists = indexList.indexes?.some(
            (i) => i.name === this.indexName,
        );
        if (!exists) {
            throw new Error(
                `Pinecone index "${this.indexName}" does not exist`,
            );
        }
        logger.info(`Pinecone initialized — index: ${this.indexName}`);
    }

    async upsertChunks(
        namespace: string,
        documentId: string,
        chunks: Array<{ content: string; documentName?: string }>,
        embeddings: number[][],
    ): Promise<void> {
        const vectors = chunks.map((chunk, i) => ({
            id: `${documentId}_${i}`,
            values: embeddings[i],
            metadata: {
                documentId,
                content: chunk.content,
                documentName: chunk.documentName ?? '',
                chunkIndex: i,
            },
        }));

        const BATCH = 100;
        for (let i = 0; i < vectors.length; i += BATCH) {
            await this.index()
                .namespace(namespace)
                .upsert({ records: vectors.slice(i, i + BATCH) });
        }

        logger.info(`Upserted ${vectors.length} chunks for doc ${documentId}`);
    }

    async similaritySearch(
        namespace: string,
        queryEmbedding: number[],
        topK: number = 5,
        documentIds?: string[],
    ): Promise<PineconeSearchResult[]> {
        const filter =
            documentIds && documentIds.length > 0
                ? { documentId: { $in: documentIds } }
                : undefined;

        const result = await this.index()
            .namespace(namespace)
            .query({
                vector: queryEmbedding,
                topK,
                includeMetadata: true,
                ...(filter ? { filter } : {}),
            });

        return (result.matches ?? []).map((m) => ({
            id: m.id,
            doc_id: (m.metadata?.documentId as string) ?? '',
            content: (m.metadata?.content as string) ?? '',
            documentName: (m.metadata?.documentName as string) ?? '',
            similarity: m.score ?? 0,
        }));
    }

    async deleteByDocument(
        namespace: string,
        documentId: string,
    ): Promise<void> {
        const listed = await this.index()
            .namespace(namespace)
            .listPaginated({ prefix: `${documentId}_` });

        const ids =
            listed.vectors
                ?.map((v) => v.id)
                .filter((id): id is string => !!id) ?? [];

        if (ids.length > 0) {
            await this.index().namespace(namespace).deleteMany({ ids });
        }

        logger.info(`Deleted ${ids.length} vectors for doc ${documentId}`);
    }

    async deleteNamespace(namespace: string): Promise<void> {
        await this.index().namespace(namespace).deleteAll();
        logger.info(`Deleted namespace ${namespace}`);
    }

    async isHealthy(): Promise<boolean> {
        try {
            await this.client.listIndexes();
            return true;
        } catch {
            return false;
        }
    }
}

export const pineconeService = PineconeService.getInstance();
