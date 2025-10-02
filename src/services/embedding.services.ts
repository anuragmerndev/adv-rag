import OpenAI from 'openai';

import { aiLogger } from '@logger/logger';

class EmbeddingService {
    private static instance: EmbeddingService;
    private openAI: OpenAI;

    private constructor() {
        this.openAI = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
            logger: {
                debug: (message, ...args) => aiLogger.debug(message, ...args),
                info: (message, ...args) => aiLogger.info(message, ...args),
                warn: (message, ...args) => aiLogger.warn(message, ...args),
                error: (message, ...args) => aiLogger.error(message, ...args),
            },
            logLevel: 'debug',
        });
    }

    public static getInstance(): EmbeddingService {
        if (!EmbeddingService.instance) {
            EmbeddingService.instance = new EmbeddingService();
        }
        return EmbeddingService.instance;
    }

    public async getEmbedding(text: string) {
        const embedding = await this.openAI.embeddings.create({
            model: 'text-embedding-ada-002',
            input: text,
        });
        return embedding.data[0].embedding;
    }
}

const embeddingService = EmbeddingService.getInstance();
export { embeddingService };
