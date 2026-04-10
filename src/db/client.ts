import dotenv from 'dotenv';
import { Pool, PoolClient, PoolConfig } from 'pg';

import { logger } from '../logging/logger';

dotenv.config();

class DatabaseClient {
    private static instance: DatabaseClient;
    private pool: Pool;
    private isConnected: boolean = false;

    private constructor() {
        const config: PoolConfig = {
            connectionString: process.env.DATABASE_URL,
            max: 20,
            min: 5,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 10000,
            statement_timeout: 60000,
        };

        this.pool = new Pool(config);

        this.pool.on('error', (err: Error) => {
            logger.error('Unexpected error on idle PostgreSQL client', { err });
        });

        this.pool.on('connect', () => {
            if (!this.isConnected) {
                logger.info('PostgreSQL pool connected');
                this.isConnected = true;
            }
        });
    }

    public static getInstance(): DatabaseClient {
        if (!DatabaseClient.instance) {
            DatabaseClient.instance = new DatabaseClient();
        }
        return DatabaseClient.instance;
    }

    public getPool(): Pool {
        return this.pool;
    }

    public async query<T = any>(
        text: string,
        params?: any[],
    ): Promise<{ rows: T[]; rowCount: number }> {
        const start = Date.now();
        try {
            const result = await this.pool.query(text, params);
            const duration = Date.now() - start;
            if (duration > 1000) {
                logger.warn(
                    `Slow query (${duration}ms): ${text.substring(0, 100)}`,
                );
            }
            return {
                rows: result.rows,
                rowCount: result.rowCount || 0,
            };
        } catch (error) {
            logger.error('Database query error', { error });
            throw error;
        }
    }

    public async getClient(): Promise<PoolClient> {
        return await this.pool.connect();
    }

    public async testConnection(): Promise<boolean> {
        try {
            await this.query('SELECT NOW()');
            logger.info('Database connection test successful');
            return true;
        } catch (error) {
            logger.error('Database connection test failed', { error });
            return false;
        }
    }

    public async close(): Promise<void> {
        try {
            await this.pool.end();
            this.isConnected = false;
            logger.info('Database pool closed');
        } catch (error) {
            logger.error('Error closing database pool', { error });
            throw error;
        }
    }

    public getStats() {
        return {
            totalCount: this.pool.totalCount,
            idleCount: this.pool.idleCount,
            waitingCount: this.pool.waitingCount,
        };
    }
}

export const db = DatabaseClient.getInstance();

export type { PoolClient };
