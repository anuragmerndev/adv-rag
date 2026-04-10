import dotenv from 'dotenv';

dotenv.config();

function requireEnv(key: string): string {
    const value = process.env[key];
    if (!value) {
        throw new Error(`Missing required environment variable: ${key}`);
    }
    return value;
}

function optionalEnv(key: string, defaultValue: string): string {
    return process.env[key] ?? defaultValue;
}

function optionalInt(key: string, defaultValue: number): number {
    const value = process.env[key];
    if (!value) return defaultValue;
    const parsed = parseInt(value, 10);
    if (isNaN(parsed)) {
        throw new Error(
            `Environment variable ${key} must be an integer, got: ${value}`,
        );
    }
    return parsed;
}

export const config = {
    PORT: optionalInt('PORT', 8080),
    NODE_ENV: optionalEnv('NODE_ENV', 'development'),

    DATABASE_URL: requireEnv('DATABASE_URL'),
    OPENAI_API_KEY: requireEnv('OPENAI_API_KEY'),

    PINECONE_API_KEY: requireEnv('PINECONE_API_KEY'),
    PINECONE_INDEX: optionalEnv('PINECONE_INDEX', 'ai-document'),

    REDIS_URL: optionalEnv('REDIS_URL', 'redis://localhost:6379'),

    MAX_FILE_SIZE: optionalInt('MAX_FILE_SIZE', 26214400),
    CHUNK_SIZE: optionalInt('CHUNK_SIZE', 500),
    CHUNK_OVERLAP: optionalInt('CHUNK_OVERLAP', 100),
    SIMILARITY_TOP_K: optionalInt('SIMILARITY_TOP_K', 5),

    ALLOWED_ORIGINS: optionalEnv('ALLOWED_ORIGINS', 'http://localhost:3000'),
} as const;
