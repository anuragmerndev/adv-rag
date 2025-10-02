export interface Document {
    id: string;
    name: string;
    created_at: Date;
    updated_at: Date;
    is_deleted: boolean;
}

export interface DocumentChunk {
    id: string;
    doc_id: string;
    content: string;
    embedding: number[];
    created_at: Date;
}

export interface User {
    id: string;
    name: string;
    email: string;
    password: string;
}

export interface QueryLog {
    id: string;
    query: string;
    embedding: number[];
    response: string;
    created_at: Date;
}

/**
 * Table schemas configuration
 * Used for migrations and type safety
 */
export const Tables = {
    document: 'document',
    documentChunk: 'document_chunk',
    user: 'user',
    queryLog: 'query_log',
} as const;

/**
 * Type-safe table accessor
 */
export type TableName = (typeof Tables)[keyof typeof Tables];

/**
 * Map table names to their types
 */
export type TableTypeMap = {
    [Tables.document]: Document;
    [Tables.documentChunk]: DocumentChunk;
    [Tables.user]: User;
    [Tables.queryLog]: QueryLog;
};
