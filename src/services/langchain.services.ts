import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';
import { Document } from '@langchain/core/documents';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';

class LangchainService {
    private static instance: LangchainService;

    constructor() {}

    public static getInstance(): LangchainService {
        if (!LangchainService.instance) {
            LangchainService.instance = new LangchainService();
        }
        return LangchainService.instance;
    }

    async loadDocument(contentpath: string) {
        const loader = new PDFLoader(contentpath, {
            pdfjs: () => import('pdfjs-dist/legacy/build/pdf.mjs'),
        });
        return await loader.load();
    }

    getTextSplitter(chunkSize: number, chunkOverlap: number) {
        return new RecursiveCharacterTextSplitter({
            chunkSize: chunkSize,
            chunkOverlap: chunkOverlap,
        });
    }

    async createDocument(text: string) {
        const textSplitter = this.getTextSplitter(1000, 100);
        return await textSplitter.createDocuments([text]);
    }

    async splitDocuments(
        chunkSize: number,
        chunkOverlap: number,
        document: Document<Record<string, any>>[],
    ) {
        const textSplitter = this.getTextSplitter(chunkSize, chunkOverlap);
        return await textSplitter.splitDocuments(document);
    }
}

const langchainService = LangchainService.getInstance();

export { langchainService };
