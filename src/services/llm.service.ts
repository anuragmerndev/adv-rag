/* eslint-disable max-len */
import OpenAI from 'openai';

import { config } from '@config/env';
import { aiLogger } from '@logger/logger';

/**
 * Available OpenAI models
 */
export const LLM_MODELS = {
    GPT4_TURBO: 'gpt-4-turbo-preview',
    GPT4: 'gpt-4',
    GPT35_TURBO: 'gpt-3.5-turbo',
    GPT5_NANO: 'gpt-5-nano',
    GPT_OSS: 'gpt-oss:20b',
    GPT_4O_MINI: 'gpt-4o-mini',
} as const;

export type LLMModel = (typeof LLM_MODELS)[keyof typeof LLM_MODELS];

/**
 * Chat message
 */
export interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

/**
 * LLMService - Generate responses using OpenAI chat models
 */
class LLMService {
    private static instance: LLMService;
    private openAI: OpenAI;
    private defaultModel: LLMModel = LLM_MODELS.GPT_4O_MINI;
    private systemPrompt: string = `
        You are a helpful AI assistant. 
        You will be provided with the context of a document and a question. 
        Your task is to answer the question based on the provided context.
        When responding, be sure to reference the context in your answer.
        And if the question is not related to the context, respond with "I'm sorry, I don't know the answer to that question."
    `;

    constructor() {
        this.openAI = new OpenAI({
            apiKey: config.OPENAI_API_KEY,
        });

        aiLogger.info('LLMService initialized');
    }

    public static getInstance(): LLMService {
        if (!LLMService.instance) {
            LLMService.instance = new LLMService();
        }
        return LLMService.instance;
    }

    /**
     * Set the default model
     */
    public setDefaultModel(model: LLMModel): void {
        this.defaultModel = model;
    }

    /**
     * Set the system prompt
     */
    public setSystemPrompt(prompt: string): void {
        this.systemPrompt = prompt;
    }

    /**
     * Generate answer using query and context (RAG pattern)
     * @param query - User question
     * @param context - Retrieved context from vector search
     * @param model - Optional model override
     */
    public async generateAnswer(
        query: string,
        context: string,
        model?: LLMModel,
        history?: ChatMessage[],
    ): Promise<string> {
        if (!query || query.trim().length === 0) {
            throw new Error('Query cannot be empty');
        }

        if (!context || context.trim().length === 0) {
            throw new Error('Context cannot be empty');
        }

        try {
            const messages: ChatMessage[] = [
                {
                    role: 'system',
                    content: this.systemPrompt,
                },
                ...(history ?? []),
                {
                    role: 'user',
                    content: `Context:\n${context}\n\nQuestion: ${query}\n\nPlease answer the question based on the provided context.`,
                },
            ];

            const response = await this.openAI.chat.completions.create({
                model: model || this.defaultModel,
                messages,
            });

            const answer = response.choices[0]?.message?.content || '';

            if (!answer) {
                throw new Error('No response generated');
            }

            aiLogger.debug(`Generated answer: ${answer.length} characters`);

            return answer;
        } catch (error: any) {
            aiLogger.error('Failed to generate answer:', error.message);
            throw new Error(`Failed to generate answer: ${error.message}`);
        }
    }

    /**
     * Stream response for real-time output
     * @param query - User question
     * @param context - Retrieved context
     * @param onChunk - Callback for each chunk
     * @param model - Optional model override
     */
    public async streamAnswer(
        query: string,
        context: string,
        onChunk: (chunk: string) => void,
        model?: LLMModel,
        history?: ChatMessage[],
    ): Promise<string> {
        if (!query || query.trim().length === 0) {
            throw new Error('Query cannot be empty');
        }

        if (!context || context.trim().length === 0) {
            throw new Error('Context cannot be empty');
        }

        try {
            const messages: ChatMessage[] = [
                {
                    role: 'system',
                    content: this.systemPrompt,
                },
                ...(history ?? []),
                {
                    role: 'user',
                    content: `Context:\n${context}\n\nQuestion: ${query}\n\nPlease answer the question based on the provided context.`,
                },
            ];

            const stream = await this.openAI.chat.completions.create({
                model: model || this.defaultModel,
                messages,
                stream: true,
            });

            let fullAnswer = '';

            for await (const chunk of stream) {
                const content = chunk.choices[0]?.delta?.content || '';
                if (content) {
                    fullAnswer += content;
                    onChunk(content);
                }
            }

            aiLogger.debug(`Streamed answer: ${fullAnswer.length} characters`);

            return fullAnswer;
        } catch (error: any) {
            aiLogger.error('Failed to stream answer:', error.message);
            throw new Error(`Failed to stream answer: ${error.message}`);
        }
    }
}

export { LLMService };
