import { performance } from 'node:perf_hooks';

import OpenAI from 'openai';

import { aiLogger } from '@logger/logger';

/**
 * Embedding models available
 */
export const EMBEDDING_MODELS = {
    ADA_002: 'text-embedding-ada-002',
    SMALL: 'text-embedding-3-small',
    LARGE: 'text-embedding-3-large',
    NOMIC: 'nomic-embed-text:v1.5',
    MXBAI: 'mxbai-embed-large:latest',
} as const;

export type EmbeddingModel =
    (typeof EMBEDDING_MODELS)[keyof typeof EMBEDDING_MODELS];

/**
 * EmbeddingService - Singleton for managing OpenAI embeddings
 */
class EmbeddingService {
    private static instance: EmbeddingService;
    private openAI: OpenAI;
    private defaultModel: EmbeddingModel = EMBEDDING_MODELS.SMALL;

    constructor() {
        if (!process.env.OPENAI_API_KEY) {
            throw new Error('OPENAI_API_KEY environment variable is not set');
        }

        this.openAI = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
        });

        aiLogger.info('EmbeddingService initialized');
    }

    public static getInstance(): EmbeddingService {
        if (!EmbeddingService.instance) {
            EmbeddingService.instance = new EmbeddingService();
        }
        return EmbeddingService.instance;
    }

    /**
     * Set the default embedding model
     */
    public setDefaultModel(model: EmbeddingModel): void {
        this.defaultModel = model;
    }

    /**
     * Get embedding for a single text
     */
    public async getEmbedding(
        text: string,
        model?: EmbeddingModel,
    ): Promise<number[]> {
        if (!text || text.trim().length === 0) {
            throw new Error('Text cannot be empty');
        }

        try {
            const response = await this.openAI.embeddings.create({
                model: model || this.defaultModel,
                input: text,
            });
            return response.data[0].embedding;
        } catch (error: any) {
            aiLogger.error('Failed to generate embedding:', error.message);
            throw new Error(`Failed to generate embedding: ${error.message}`);
        }
    }

    /**
     * Get embeddings for multiple texts
     * OpenAI supports up to 2048 inputs per request
     */
    public async getBatchEmbeddings(
        texts: string[],
        model?: EmbeddingModel,
        batchSize: number = 100,
    ): Promise<number[][]> {
        aiLogger.info(`Generating embeddings for ${texts.length} texts`);
        const start = performance.now();
        if (!texts || texts.length === 0) {
            throw new Error('Texts array cannot be empty');
        }

        const validTexts = texts.filter((t) => t && t.trim().length > 0);
        if (validTexts.length === 0) {
            throw new Error('All texts are empty');
        }

        const allEmbeddings: number[][] = [];

        // Process in batches
        for (let i = 0; i < validTexts.length; i += batchSize) {
            const batch = validTexts.slice(i, i + batchSize);

            try {
                const response = await this.openAI.embeddings.create({
                    model: model || this.defaultModel,
                    input: batch,
                });

                const batchEmbeddings = response.data.map(
                    (item) => item.embedding,
                );
                allEmbeddings.push(...batchEmbeddings);

                aiLogger.debug(
                    `Processed batch ${Math.floor(i / batchSize) + 1}: ${batch.length} texts`,
                );
            } catch (error: any) {
                aiLogger.error(
                    'Failed to generate batch embeddings:',
                    error.message,
                );
                throw new Error(
                    `Failed to generate batch embeddings: ${error.message}`,
                );
            }
        }
        aiLogger.info(
            `Generated embeddings for ${texts.length} texts in ${Math.trunc(performance.now() - start)}ms`,
        );
        return allEmbeddings;
    }

    /**
     * Calculate cosine similarity between two embeddings
     */
    public cosineSimilarity(a: number[], b: number[]): number {
        if (a.length !== b.length) {
            throw new Error('Embeddings must have the same dimension');
        }

        let dotProduct = 0;
        let normA = 0;
        let normB = 0;

        for (let i = 0; i < a.length; i++) {
            dotProduct += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }

        return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    }
}

export { EmbeddingService };
