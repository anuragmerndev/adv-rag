import { aiLogger } from '@logger/logger';

/**
 * Result item for reranking
 */
export interface RerankItem {
    content: string;
    similarity: number; // Score from vector search
    [key: string]: any;
}

/**
 * Reranked result
 */
export interface RerankedItem extends RerankItem {
    rank: number;
}

/**
 * RerankingService - Simple reranking based on existing similarity scores
 *
 * Note: Since vector search already provides cosine similarity scores,
 * this service provides simple filtering and boosting strategies.
 * For more advanced reranking, consider using a cross-encoder model.
 */
class RerankingService {
    private static instance: RerankingService;

    private constructor() {
        aiLogger.info('RerankingService initialized');
    }

    public static getInstance(): RerankingService {
        if (!RerankingService.instance) {
            RerankingService.instance = new RerankingService();
        }
        return RerankingService.instance;
    }

    /**
     * Rerank by filtering low-similarity results and returning top K
     * @param results - Results from vector search
     * @param topK - Number of results to return
     * @param minSimilarity - Minimum similarity threshold (0-1)
     */
    public rerank(
        results: RerankItem[],
        topK?: number,
        minSimilarity: number = 0.5,
    ): RerankedItem[] {
        if (!results || results.length === 0) {
            return [];
        }

        // Filter by minimum similarity
        const filtered = results.filter((r) => r.similarity >= minSimilarity);

        // Already sorted by similarity from SQL query
        // Just take top K
        const topResults = topK ? filtered.slice(0, topK) : filtered;

        // Add rank
        const reranked = topResults.map((result, i) => ({
            ...result,
            rank: i + 1,
        }));

        aiLogger.debug(
            `Reranked ${results.length} results → ${reranked.length} after filtering (min: ${minSimilarity})`,
        );

        return reranked;
    }

    /**
     * Rerank with keyword boosting
     * Boosts results that contain specific keywords
     * @param results - Results from vector search
     * @param keywords - Keywords to boost
     * @param boostFactor - How much to boost (e.g., 1.2 = 20% boost)
     * @param topK - Number of results to return
     */
    public rerankWithKeywords(
        results: RerankItem[],
        keywords: string[],
        boostFactor: number = 1.2,
        topK?: number,
    ): RerankedItem[] {
        if (!results || results.length === 0) {
            return [];
        }

        // Boost scores if content contains keywords
        const boosted = results.map((result) => {
            let boostedSimilarity = result.similarity;

            const contentLower = result.content.toLowerCase();
            const hasKeyword = keywords.some((keyword) =>
                contentLower.includes(keyword.toLowerCase()),
            );

            if (hasKeyword) {
                boostedSimilarity = Math.min(
                    boostedSimilarity * boostFactor,
                    1.0,
                );
            }

            return {
                ...result,
                similarity: boostedSimilarity,
            };
        });

        // Sort by boosted similarity
        boosted.sort((a, b) => b.similarity - a.similarity);

        // Take top K and add rank
        const topResults = topK ? boosted.slice(0, topK) : boosted;
        const reranked = topResults.map((result, i) => ({
            ...result,
            rank: i + 1,
        }));

        aiLogger.debug(
            `Reranked with keywords [${keywords.join(', ')}], returning ${reranked.length} results`,
        );

        return reranked;
    }
}

export const rerankingService = RerankingService.getInstance();
