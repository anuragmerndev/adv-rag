import dotenv from 'dotenv';
import { Pool, PoolClient, PoolConfig } from 'pg';

dotenv.config();

/**
 * Singleton PostgreSQL connection pool
 * Reuses connections across requests for optimal performance
 */
class DatabaseClient {
    private static instance: DatabaseClient;
    private pool: Pool;
    private isConnected: boolean = false;

    private constructor() {
        const config: PoolConfig = {
            connectionString: process.env.DATABASE_URL,
            // Connection pool settings optimized for web servers
            max: 20, // Maximum pool size (adjust based on load)
            min: 5, // Keep 5 connections ready
            idleTimeoutMillis: 30000, // Close idle connections after 30s
            connectionTimeoutMillis: 10000, // Timeout if can't connect in 10s
            // Statement timeout for long-running queries
            statement_timeout: 60000, // 60s timeout for queries
        };

        this.pool = new Pool(config);

        // Handle pool errors
        this.pool.on('error', (err: Error) => {
            console.error('Unexpected error on idle PostgreSQL client:', err);
            // Don't exit process, let the app handle it
        });

        // Log successful connection
        this.pool.on('connect', () => {
            if (!this.isConnected) {
                console.log('✓ PostgreSQL pool connected');
                this.isConnected = true;
            }
        });
    }

    /**
     * Get the singleton instance
     */
    public static getInstance(): DatabaseClient {
        if (!DatabaseClient.instance) {
            DatabaseClient.instance = new DatabaseClient();
        }
        return DatabaseClient.instance;
    }

    /**
     * Get the connection pool
     */
    public getPool(): Pool {
        return this.pool;
    }

    /**
     * Execute a query with automatic connection management
     */
    public async query<T = any>(
        text: string,
        params?: any[],
    ): Promise<{ rows: T[]; rowCount: number }> {
        const start = Date.now();
        try {
            const result = await this.pool.query(text, params);
            const duration = Date.now() - start;
            // Log slow queries (> 1s)
            if (duration > 1000) {
                console.warn(
                    `Slow query (${duration}ms):`,
                    text.substring(0, 100),
                );
            }
            return {
                rows: result.rows,
                rowCount: result.rowCount || 0,
            };
        } catch (error) {
            console.error('Database query error:', error);
            throw error;
        }
    }

    /**
     * Get a client from the pool for transactions
     */
    public async getClient(): Promise<PoolClient> {
        return await this.pool.connect();
    }

    /**
     * Test database connection
     */
    public async testConnection(): Promise<boolean> {
        try {
            const result = await this.query('SELECT NOW()');
            console.log(
                '✓ Database connection test successful:',
                result.rows[0],
            );
            return true;
        } catch (error) {
            console.error('✗ Database connection test failed:', error);
            return false;
        }
    }

    /**
     * Initialize pgvector extension and verify setup
     */
    public async initializePgVector(): Promise<void> {
        try {
            // Enable pgvector extension
            await this.query('CREATE EXTENSION IF NOT EXISTS vector');

            // Verify extension is loaded
            const result = await this.query(
                // eslint-disable-next-line prettier/prettier
                'SELECT·*·FROM·pg_extension·WHERE·extname·=·\'vector\'',
            );
            if (result.rows.length === 0) {
                throw new Error('pgvector extension not found');
            }
            console.log('✓ pgvector extension initialized');
        } catch (error) {
            console.error('✗ Failed to initialize pgvector:', error);
            throw error;
        }
    }

    /**
     * Graceful shutdown
     */
    public async close(): Promise<void> {
        try {
            await this.pool.end();
            this.isConnected = false;
            console.log('✓ Database pool closed');
        } catch (error) {
            console.error('Error closing database pool:', error);
            throw error;
        }
    }

    /**
     * Get pool statistics
     */
    public getStats() {
        return {
            totalCount: this.pool.totalCount,
            idleCount: this.pool.idleCount,
            waitingCount: this.pool.waitingCount,
        };
    }
}

// Export singleton instance
export const db = DatabaseClient.getInstance();

// Export types for convenience
export type { PoolClient };
