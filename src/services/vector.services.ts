import { PrismaVectorStore } from '@langchain/community/vectorstores/prisma';
import { OpenAIEmbeddings } from '@langchain/openai';
import { DocumentChunk, Prisma } from '@prisma/client';

import client from '@db/index';

import { embeddingService } from '@services/embedding.services';

class VectorService {
    private static instance: VectorService;
    private vectorStore: PrismaVectorStore;

    private constructor() {
        this.vectorStore = PrismaVectorStore.withModel<DocumentChunk>(
            client,
        ).create(
            {
                embedDocuments: async (documents: string[]) => {
                    return await Promise.all(
                        documents.map(async (document) => {
                            return embeddingService.getEmbedding(document);
                        }),
                    );
                },
                embedQuery: async (document: string) => {
                    return await embeddingService.getEmbedding(document);
                },
            },
            {
                prisma: Prisma,
                tableName: 'DocumentChunk',
                vectorColumnName: 'embedding',
                columns: undefined,
            },
        );
    }

    public static getInstance(): VectorService {
        if (!VectorService.instance) {
            VectorService.instance = new VectorService();
        }
        return VectorService.instance;
    }

    async insertChunk() {}
}

const vectorService = VectorService.getInstance();
export { vectorService };
