import { db } from '../db/client';

/**
 * Document chunk interface
 */
export interface DocumentChunk {
    id: string;
    doc_id: string;
    content: string;
    embedding: number[];
    created_at: Date;
}

/**
 * Similarity search result with distance score
 */
export interface SimilaritySearchResult {
    id: string;
    doc_id: string;
    content: string;
    similarity: number; // Cosine similarity (0-1, higher is better)
    distance: number; // Cosine distance (0-2, lower is better)
}

/**
 * Batch insert chunk
 */
export interface ChunkInput {
    content: string;
    embedding: number[];
}

/**
 * PgVectorService - Singleton service for vector operations
 * Optimized for RAG applications with OpenAI embeddings
 */
class PgVectorService {
    private static instance: PgVectorService;

    // Default batch size for bulk inserts (tune based on your embeddings size)
    private readonly DEFAULT_BATCH_SIZE = 100;

    private constructor() {
        // Private constructor for singleton
    }

    /**
     * Get singleton instance
     */
    public static getInstance(): PgVectorService {
        if (!PgVectorService.instance) {
            PgVectorService.instance = new PgVectorService();
        }
        return PgVectorService.instance;
    }

    /**
     * Insert a single document chunk with embedding
     * @param docId - Document UUID
     * @param content - Text content
     * @param embedding - Vector embedding (1536 dimensions for OpenAI)
     * @returns Inserted chunk ID
     */
    public async insertChunk(
        docId: string,
        content: string,
        embedding: number[],
    ): Promise<string> {
        try {
            // Validate embedding dimensions
            if (embedding.length !== 1536) {
                throw new Error(
                    `Invalid embedding dimension: expected 1536, got ${embedding.length}`,
                );
            }

            const query = `
        INSERT INTO document_chunk (doc_id, content, embedding)
        VALUES ($1, $2, $3::vector)
        RETURNING id
      `;

            const result = await db.query<{ id: string }>(query, [
                docId,
                content,
                JSON.stringify(embedding), // pg converts JSON array to vector
            ]);

            return result.rows[0].id;
        } catch (error) {
            console.error('Error inserting chunk:', error);
            throw error;
        }
    }

    /**
     * Bulk insert document chunks with optimized batching
     * Uses multi-row INSERT for best performance
     * @param docId - Document UUID
     * @param chunks - Array of chunks with content and embeddings
     * @param batchSize - Number of chunks per batch (default: 100)
     * @returns Array of inserted chunk IDs
     */
    public async insertChunksBatch(
        docId: string,
        chunks: ChunkInput[],
        batchSize: number = this.DEFAULT_BATCH_SIZE,
    ): Promise<string[]> {
        if (chunks.length === 0) {
            return [];
        }

        const insertedIds: string[] = [];
        const client = await db.getClient();

        try {
            // Begin transaction for atomicity
            await client.query('BEGIN');

            // Process in batches to avoid memory issues and query size limits
            for (let i = 0; i < chunks.length; i += batchSize) {
                const batch = chunks.slice(i, i + batchSize);

                // Build multi-row INSERT query
                // ($1, $2, $3::vector), ($1, $4, $5::vector), ...
                const valuesClauses: string[] = [];
                const params: any[] = [docId]; // First param is always docId

                batch.forEach((chunk, idx) => {
                    // Validate embedding dimensions
                    if (chunk.embedding.length !== 1536) {
                        throw new Error(
                            `Invalid embedding dimension at index ${i + idx}: expected 1536, got ${chunk.embedding.length}`,
                        );
                    }

                    const contentParamIdx = params.length + 1;
                    const embeddingParamIdx = params.length + 2;
                    valuesClauses.push(
                        `($1, $${contentParamIdx}, $${embeddingParamIdx}::vector)`,
                    );
                    params.push(chunk.content);
                    params.push(JSON.stringify(chunk.embedding));
                });

                const query = `
          INSERT INTO document_chunk (doc_id, content, embedding)
          VALUES ${valuesClauses.join(', ')}
          RETURNING id
        `;

                const result = await client.query<{ id: string }>(
                    query,
                    params,
                );
                insertedIds.push(...result.rows.map((row) => row.id));
            }

            // Commit transaction
            await client.query('COMMIT');
            console.log(
                `✓ Inserted ${insertedIds.length} chunks for doc ${docId}`,
            );

            return insertedIds;
        } catch (error) {
            // Rollback on error
            await client.query('ROLLBACK');
            console.error('Error in batch insert:', error);
            throw error;
        } finally {
            // Release client back to pool
            client.release();
        }
    }

    /**
     * Perform similarity search using cosine distance
     * Returns top-K most similar chunks
     * @param queryEmbedding - Query vector (1536 dimensions)
     * @param topK - Number of results to return (default: 5)
     * @param docId - Optional: filter by specific document
     * @returns Array of similar chunks with similarity scores
     */
    public async similaritySearch(
        queryEmbedding: number[],
        topK: number = 5,
        docId?: string,
    ): Promise<SimilaritySearchResult[]> {
        try {
            // Validate embedding dimensions
            if (queryEmbedding.length !== 1536) {
                throw new Error(
                    `Invalid query embedding dimension: expected 1536, got ${queryEmbedding.length}`,
                );
            }

            // Build query with optional doc_id filter
            const whereClause = docId ? 'WHERE doc_id = $3' : '';
            const params: any[] = [JSON.stringify(queryEmbedding), topK];
            if (docId) params.push(docId);

            const query = `
        SELECT 
          id,
          doc_id,
          content,
          1 - (embedding <=> $1::vector) AS similarity,
          embedding <=> $1::vector AS distance
        FROM document_chunk
        ${whereClause}
        ORDER BY embedding <=> $1::vector ASC
        LIMIT $2
      `;

            // Note: The <=> operator computes cosine distance
            // Cosine distance = 1 - cosine similarity
            // Lower distance = more similar

            const result = await db.query<SimilaritySearchResult>(
                query,
                params,
            );

            return result.rows;
        } catch (error) {
            console.error('Error in similarity search:', error);
            throw error;
        }
    }

    /**
     * Delete all chunks for a specific document
     * @param docId - Document UUID
     * @returns Number of deleted chunks
     */
    public async deleteDocChunks(docId: string): Promise<number> {
        try {
            const query = `
        DELETE FROM document_chunk
        WHERE doc_id = $1
      `;

            const result = await db.query(query, [docId]);

            console.log(`✓ Deleted ${result.rowCount} chunks for doc ${docId}`);

            return result.rowCount;
        } catch (error) {
            console.error('Error deleting chunks:', error);
            throw error;
        }
    }

    /**
     * Delete a specific chunk by ID
     * @param chunkId - Chunk UUID
     * @returns True if deleted, false if not found
     */
    public async deleteChunk(chunkId: string): Promise<boolean> {
        try {
            const query = `
        DELETE FROM document_chunk
        WHERE id = $1
      `;

            const result = await db.query(query, [chunkId]);
            return result.rowCount > 0;
        } catch (error) {
            console.error('Error deleting chunk:', error);
            throw error;
        }
    }

    /**
     * Get chunk by ID
     * @param chunkId - Chunk UUID
     * @returns Chunk or null if not found
     */
    public async getChunk(chunkId: string): Promise<DocumentChunk | null> {
        try {
            const query = `
        SELECT id, doc_id, content, embedding, created_at
        FROM document_chunk
        WHERE id = $1
      `;

            const result = await db.query<DocumentChunk>(query, [chunkId]);
            return result.rows[0] || null;
        } catch (error) {
            console.error('Error getting chunk:', error);
            throw error;
        }
    }

    /**
     * Get all chunks for a document
     * @param docId - Document UUID
     * @returns Array of chunks
     */
    public async getDocChunks(docId: string): Promise<DocumentChunk[]> {
        try {
            const query = `
        SELECT id, doc_id, content, embedding, created_at
        FROM document_chunk
        WHERE doc_id = $1
        ORDER BY created_at ASC
      `;

            const result = await db.query<DocumentChunk>(query, [docId]);
            return result.rows;
        } catch (error) {
            console.error('Error getting doc chunks:', error);
            throw error;
        }
    }

    /**
     * Get total chunk count (useful for monitoring)
     * @returns Total number of chunks in database
     */
    public async getTotalChunkCount(): Promise<number> {
        try {
            const query = 'SELECT COUNT(*) as count FROM document_chunk';
            const result = await db.query<{ count: string }>(query);
            return parseInt(result.rows[0].count, 10);
        } catch (error) {
            console.error('Error getting chunk count:', error);
            throw error;
        }
    }

    /**
     * Optimize the vector index (run after bulk loading)
     * CRITICAL: Must run ANALYZE after bulk inserts for IVFFlat index
     */
    public async optimizeIndex(): Promise<void> {
        try {
            await db.query('ANALYZE document_chunk');
            console.log('✓ Vector index optimized');
        } catch (error) {
            console.error('Error optimizing index:', error);
            throw error;
        }
    }

    /**
     * Set IVFFlat probes for query-time tuning
     * Higher probes = better recall but slower queries
     * @param probes - Number of probes (recommended: 10-20)
     */
    public async setIVFFlatProbes(probes: number = 10): Promise<void> {
        try {
            await db.query(`SET ivfflat.probes = ${probes}`);
            console.log(`✓ IVFFlat probes set to ${probes}`);
        } catch (error) {
            console.error('Error setting IVFFlat probes:', error);
            throw error;
        }
    }
}

export { PgVectorService };

// Export singleton instance
export const vectorService = PgVectorService.getInstance();
