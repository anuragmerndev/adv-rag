import dotenv from 'dotenv';

import { logger } from '@logger/logger';

import { PgVectorService } from '@services/vector.services';

import { cacheService } from './cache.service';
import { EmbeddingService } from './embedding.services';
dotenv.config();

class RagService {
    private embeddingService: EmbeddingService;
    private vectorService: PgVectorService;
    private static instance: RagService;
    constructor() {
        this.embeddingService = EmbeddingService.getInstance();
        this.vectorService = PgVectorService.getInstance();
    }

    public static getInstance(): RagService {
        if (!RagService.instance) {
            RagService.instance = new RagService();
        }
        return RagService.instance;
    }

    async ragPipeline(query: string, fingerprint: string) {
        const embeddingStart = Date.now();
        logger.info('starting rag pipeline, query: ', query);

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

        console.log(
            'creating query embedding took ',
            Date.now() - embeddingStart,
        );

        const vectorSearchStart = Date.now();
        const K = 5;
        const similaritySearchResult =
            await this.vectorService.similaritySearch(queryEmbedding, K);
        console.log('vector search took ', Date.now() - vectorSearchStart);

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
            // simple regex-based example; extend with classifier for production
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

        // 4) Policy check: short classifier to decide allow/partial/refuse decision
        // For demo keep it simple; replace with ML-based policy for better accuracy
        const policyCheck = () => {
            const hasSuspicious = preFilterResults.some(
                (r) => r.prefilter.found,
            );
            if (hasSuspicious)
                return { decision: 'partial', reason: 'context_redacted' };
            return { decision: 'allow', reason: 'ok' };
        };

        const policyResult = policyCheck();

        console.log('vector filter took ', Date.now() - vectorSearchStart);

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
