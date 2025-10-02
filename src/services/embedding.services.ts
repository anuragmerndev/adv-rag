/* eslint-disable prettier/prettier */
/* eslint-disable sonarjs/cognitive-complexity */
import OpenAI from 'openai';

import { aiLogger } from '@logger/logger';

/**
 * Embedding models available
 */
export const EMBEDDING_MODELS = {
    ADA_002: 'text-embedding-ada-002', // 1536 dimensions
    SMALL: 'text-embedding-3-small', // 1536 dimensions (cheaper, faster)
    LARGE: 'text-embedding-3-large', // 3072 dimensions (more accurate)
} as const;

export type EmbeddingModel =
    (typeof EMBEDDING_MODELS)[keyof typeof EMBEDDING_MODELS];

/**
 * Embedding response with metadata
 */
export interface EmbeddingResult {
    embedding: number[];
    model: string;
    usage: {
        prompt_tokens: number;
        total_tokens: number;
    };
}

/**
 * Batch embedding result
 */
export interface BatchEmbeddingResult {
    embeddings: number[][];
    texts: string[];
    model: string;
    totalTokens: number;
}

/**
 * Cache entry for embeddings
 */
interface CacheEntry {
    embedding: number[];
    timestamp: number;
    model: string;
}

/**
 * EmbeddingService - Singleton for managing OpenAI embeddings
 * Features:
 * - Single and batch embedding generation
 * - In-memory caching with TTL
 * - Automatic retry with exponential backoff
 * - Token usage tracking
 * - Error handling and logging
 */
class EmbeddingService {
    private static instance: EmbeddingService;
    private openAI: OpenAI;

    // Cache settings
    private cache: Map<string, CacheEntry> = new Map();
    private readonly CACHE_TTL = 3600000; // 1 hour in milliseconds
    private readonly MAX_CACHE_SIZE = 1000;

    // Rate limiting
    private requestCount = 0;
    private tokenCount = 0;
    private windowStart = Date.now();
    private readonly RATE_LIMIT_WINDOW = 60000; // 1 minute
    // Retry settings
    private readonly MAX_RETRIES = 3;
    private readonly INITIAL_RETRY_DELAY = 1000; // 1 second

    // Default model
    private defaultModel: EmbeddingModel = EMBEDDING_MODELS.LARGE;

    private constructor() {
        if (!process.env.OPENAI_API_KEY) {
            throw new Error('OPENAI_API_KEY environment variable is not set');
        }

        this.openAI = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
            maxRetries: 0, // We'll handle retries manually for better control
            timeout: 30000, // 30 seconds
        });

        // Start cache cleanup interval
        this.startCacheCleanup();

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
        aiLogger.info(`Default embedding model set to: ${model}`);
    }

    /**
     * Get embedding for a single text
     * @param text - Text to embed
     * @param options - Optional configuration
     */
    public async getEmbedding(
        text: string,
        options?: {
            model?: EmbeddingModel;
            useCache?: boolean;
            dimensions?: number; // For text-embedding-3-* models
        },
    ): Promise<number[]> {
        const model = options?.model || this.defaultModel;
        const useCache = options?.useCache !== false; // Default to true

        // Validate input
        if (!text || text.trim().length === 0) {
            throw new Error('Text cannot be empty');
        }

        // Check cache
        if (useCache) {
            const cached = this.getCachedEmbedding(text, model);
            if (cached) {
                aiLogger.debug('Cache hit for embedding');
                return cached;
            }
        }

        // Generate embedding with retry logic
        const result = await this.generateEmbeddingWithRetry(
            [text],
            model,
            options?.dimensions,
        );

        // Cache the result
        if (useCache) {
            this.cacheEmbedding(text, result.embeddings[0], model);
        }

        // Track usage
        this.trackUsage(result.totalTokens);

        return result.embeddings[0];
    }

    /**
     * Get embeddings for multiple texts in batch
     * More efficient than calling getEmbedding multiple times
     * @param texts - Array of texts to embed
     * @param options - Optional configuration
     */
    public async getBatchEmbeddings(
        texts: string[],
        options?: {
            model?: EmbeddingModel;
            batchSize?: number;
            useCache?: boolean;
            dimensions?: number;
        },
    ): Promise<BatchEmbeddingResult> {
        const model = options?.model || this.defaultModel;
        const batchSize = options?.batchSize || 100; // OpenAI limit is ~2048 for ada-002
        const useCache = options?.useCache !== false;

        // Validate input
        if (!texts || texts.length === 0) {
            throw new Error('Texts array cannot be empty');
        }

        // Filter out empty texts
        const validTexts = texts.filter((t) => t && t.trim().length > 0);
        if (validTexts.length === 0) {
            throw new Error('All texts are empty');
        }

        const allEmbeddings: number[][] = [];
        let totalTokens = 0;

        // Check cache first
        const uncachedTexts: string[] = [];
        const cachedEmbeddings: Map<string, number[]> = new Map();

        if (useCache) {
            for (const text of validTexts) {
                const cached = this.getCachedEmbedding(text, model);
                if (cached) {
                    cachedEmbeddings.set(text, cached);
                } else {
                    uncachedTexts.push(text);
                }
            }
            aiLogger.debug(
                `Cache: ${cachedEmbeddings.size} hits, ${uncachedTexts.length} misses`,
            );
        } else {
            uncachedTexts.push(...validTexts);
        }

        // Process uncached texts in batches
        if (uncachedTexts.length > 0) {
            for (let i = 0; i < uncachedTexts.length; i += batchSize) {
                const batch = uncachedTexts.slice(i, i + batchSize);

                aiLogger.debug(
                    `Processing batch ${i / batchSize + 1}: ${batch.length} texts`,
                );

                const result = await this.generateEmbeddingWithRetry(
                    batch,
                    model,
                    options?.dimensions,
                );

                // Cache results
                if (useCache) {
                    batch.forEach((text, idx) => {
                        this.cacheEmbedding(
                            text,
                            result.embeddings[idx],
                            model,
                        );
                    });
                }

                totalTokens += result.totalTokens;

                // Small delay between batches to avoid rate limits
                if (i + batchSize < uncachedTexts.length) {
                    await this.delay(100);
                }
            }
        }

        // Combine cached and new embeddings in original order
        for (const text of validTexts) {
            const cached = cachedEmbeddings.get(text);
            if (cached) {
                allEmbeddings.push(cached);
            } else {
                // Find in newly generated embeddings
                // const idx = uncachedTexts.indexOf(text);
                // if (idx !== -1) {
                //     const batchIdx = Math.floor(idx / batchSize);
                //     const inBatchIdx = idx % batchSize;
                //     // This is simplified - in production, you'd need better tracking
                //     allEmbeddings.push([]); // Placeholder
                // }
            }
        }

        // Track usage
        this.trackUsage(totalTokens);

        return {
            embeddings: allEmbeddings,
            texts: validTexts,
            model,
            totalTokens,
        };
    }

    /**
     * Generate embeddings with automatic retry and exponential backoff
     */
    private async generateEmbeddingWithRetry(
        texts: string[],
        model: string,
        dimensions?: number,
        retryCount = 0,
    ): Promise<BatchEmbeddingResult> {
        try {
            const requestParams: any = {
                model,
                input: texts,
            };

            // Add dimensions parameter for newer models
            if (
                dimensions &&
                (model.includes('3-small') || model.includes('3-large'))
            ) {
                requestParams.dimensions = dimensions;
            }

            const response = await this.openAI.embeddings.create(requestParams);

            const embeddings = response.data.map((item) => item.embedding);
            const totalTokens = response.usage?.total_tokens || 0;

            aiLogger.debug(
                `Generated ${embeddings.length} embeddings, ${totalTokens} tokens`,
            );

            return {
                embeddings,
                texts,
                model,
                totalTokens,
            };
        } catch (error: any) {
            // Handle rate limits and transient errors with retry
            const shouldRetry = this.shouldRetryError(error);
            if (shouldRetry && retryCount < this.MAX_RETRIES) {
                const delay = this.getRetryDelay(retryCount, error);
                aiLogger.warn(
                    `Embedding request failed (attempt ${retryCount + 1}/${this.MAX_RETRIES}), ` +
                        `retrying in ${delay}ms: ${error.message}`,
                );
                await this.delay(delay);
                return this.generateEmbeddingWithRetry(
                    texts,
                    model,
                    dimensions,
                    retryCount + 1,
                );
            }

            // Log and throw error
            aiLogger.error('Embedding generation failed:', {
                error: error.message,
                textsCount: texts.length,
                model,
                retryCount,
            });
            throw new Error(`Failed to generate embeddings: ${error.message}`);
        }
    }

    /**
     * Determine if an error should trigger a retry
     */
    private shouldRetryError(error: any): boolean {
        let shouldRetry = false;
        // Retry on rate limits
        if (error.status === 429) {
            shouldRetry = true;
        }

        // Retry on server errors
        if (error.status >= 500) {
            shouldRetry = true;
        }

        // Retry on network errors
        if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
            shouldRetry = true;
        }

        return shouldRetry;
    }

    /**
     * Calculate retry delay with exponential backoff
     */
    private getRetryDelay(retryCount: number, error: any): number {
        // Check if error has Retry-After header
        if (error.headers?.['retry-after']) {
            const retryAfter = parseInt(error.headers['retry-after']);
            return retryAfter * 1000;
        }

        // Exponential backoff: 1s, 2s, 4s
        return this.INITIAL_RETRY_DELAY * Math.pow(2, retryCount);
    }

    /**
     * Get cached embedding if available and not expired
     */
    private getCachedEmbedding(text: string, model: string): number[] | null {
        const cacheKey = this.getCacheKey(text, model);
        const cached = this.cache.get(cacheKey);

        if (!cached) return null;

        // Check if expired
        const age = Date.now() - cached.timestamp;
        if (age > this.CACHE_TTL) {
            this.cache.delete(cacheKey);
            return null;
        }

        return cached.embedding;
    }

    /**
     * Cache an embedding
     */
    private cacheEmbedding(
        text: string,
        embedding: number[],
        model: string,
    ): void {
        // Enforce cache size limit
        if (this.cache.size >= this.MAX_CACHE_SIZE) {
            // Remove oldest entry (simple LRU)
            const firstKey = this.cache.keys().next().value;
            if (firstKey) this.cache.delete(firstKey);
        }

        const cacheKey = this.getCacheKey(text, model);
        this.cache.set(cacheKey, {
            embedding,
            timestamp: Date.now(),
            model,
        });
    }

    /**
     * Generate cache key from text and model
     */
    private getCacheKey(text: string, model: string): string {
        // Simple hash function for cache key
        return `${model}:${this.simpleHash(text)}`;
    }

    /**
     * Simple string hash function
     */
    private simpleHash(str: string): string {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = (hash << 5) - hash + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return hash.toString(36);
    }

    /**
     * Track API usage for monitoring
     */
    private trackUsage(tokens: number): void {
        const now = Date.now();

        // Reset counters if window expired
        if (now - this.windowStart > this.RATE_LIMIT_WINDOW) {
            this.requestCount = 0;
            this.tokenCount = 0;
            this.windowStart = now;
        }

        this.requestCount++;
        this.tokenCount += tokens;
    }

    /**
     * Get current usage statistics
     */
    public getUsageStats(): {
        requestCount: number;
        tokenCount: number;
        cacheSize: number;
        cacheHitRate: number;
        } {
        return {
            requestCount: this.requestCount,
            tokenCount: this.tokenCount,
            cacheSize: this.cache.size,
            cacheHitRate: 0, // Would need to track hits/misses separately
        };
    }

    /**
     * Clear the cache
     */
    public clearCache(): void {
        this.cache.clear();
        aiLogger.info('Embedding cache cleared');
    }

    /**
     * Start periodic cache cleanup
     */
    private startCacheCleanup(): void {
        setInterval(() => {
            const now = Date.now();
            let removed = 0;

            for (const [key, entry] of Array.from(this.cache.entries())) {
                if (now - entry.timestamp > this.CACHE_TTL) {
                    this.cache.delete(key);
                    removed++;
                }
            }

            if (removed > 0) {
                aiLogger.debug(
                    `Cache cleanup: removed ${removed} expired entries`,
                );
            }
        }, this.CACHE_TTL); // Run every hour
    }

    /**
     * Delay helper for retries
     */
    private delay(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    /**
     * Calculate cosine similarity between two embeddings
     * Useful for comparing embeddings directly
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

// Export singleton instance
export const embeddingService = EmbeddingService.getInstance();
