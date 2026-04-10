export interface Document {
    id: string;
    name: string;
    created_at: Date;
    updated_at: Date;
    is_deleted: boolean;
}

export interface User {
    id: string;
    name: string;
    email: string;
    clerk_id: string;
    created_at: Date;
    updated_at: Date;
}

export const Tables = {
    document: 'document',
    user: 'user',
} as const;

export type TableName = (typeof Tables)[keyof typeof Tables];

export type TableTypeMap = {
    [Tables.document]: Document;
    [Tables.user]: User;
};
