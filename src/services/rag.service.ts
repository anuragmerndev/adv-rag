import dotenv from 'dotenv';

import { logger } from '@logger/logger';

import { cacheService } from './cache.service';
import { EmbeddingService } from './embedding.services';
import { pineconeService } from './pinecone.service';
dotenv.config();

const DEFAULT_NAMESPACE = 'default';

class RagService {
    private embeddingService: EmbeddingService;
    private static instance: RagService;

    constructor() {
        this.embeddingService = EmbeddingService.getInstance();
    }

    public static getInstance(): RagService {
        if (!RagService.instance) {
            RagService.instance = new RagService();
        }
        return RagService.instance;
    }

    async ragPipeline(
        query: string,
        fingerprint: string,
        namespace: string = DEFAULT_NAMESPACE,
    ) {
        logger.info('starting rag pipeline', { query });

        let queryEmbedding: number[];
        const cachedQueryEmbedding = await cacheService.getCache(
            `emb:${fingerprint}`,
        );
        if (cachedQueryEmbedding) {
            queryEmbedding = JSON.parse(cachedQueryEmbedding);
        } else {
            queryEmbedding = await this.embeddingService.getEmbedding(query);
            cacheService.setCache(
                `emb:${fingerprint}`,
                JSON.stringify(queryEmbedding),
            );
        }

        const K = 5;
        const similaritySearchResult = await pineconeService.similaritySearch(
            namespace,
            queryEmbedding,
            K,
        );

        const contextData = similaritySearchResult
            .map((f) => f.content)
            .join('\n\n');

        if (!contextData || contextData.trim().length === 0) {
            return undefined;
        }

        const provenance = similaritySearchResult.map((f) => ({
            id: f.id,
            score: f.similarity,
        }));

        const preFilterDocs = (text: string) => {
            const suspicious =
                /\b(bypass|disable|ignore rules|unrestricted|open firewall|run arbitrary)\b/gi;
            const redacted = text.replace(suspicious, '[REDACTED_REASON]');
            const found = suspicious.test(text);
            return { redacted, found };
        };

        const preFilterResults = similaritySearchResult.map((f) => ({
            ...f,
            prefilter: preFilterDocs(f.content),
        }));

        const policyCheck = () => {
            const hasSuspicious = preFilterResults.some(
                (r) => r.prefilter.found,
            );
            if (hasSuspicious)
                return { decision: 'partial', reason: 'context_redacted' };
            return { decision: 'allow', reason: 'ok' };
        };

        const policyResult = policyCheck();

        return {
            data: '',
            policyResult,
            preFilterResults,
            contextData,
            provenance,
            cachedQueryEmbedding: !!cachedQueryEmbedding,
        };
    }
}

const ragService = RagService.getInstance();
export { ragService };
