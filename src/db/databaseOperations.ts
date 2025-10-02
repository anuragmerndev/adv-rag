import { QueryResultRow } from 'pg';

import { db } from './client';

/**
 * Single unified database operations class
 * Works with table schemas to provide type-safe CRUD operations
 */
export class DatabaseOperations {
    private static instance: DatabaseOperations;

    private constructor() {}

    public static getInstance(): DatabaseOperations {
        if (!DatabaseOperations.instance) {
            DatabaseOperations.instance = new DatabaseOperations();
        }
        return DatabaseOperations.instance;
    }

    /**
     * Insert a single record
     */
    async insert<T>(tableName: string, data: Partial<T>): Promise<T> {
        const keys = Object.keys(data);
        const values = Object.values(data);
        const columns = keys.join(', ');
        const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');

        const sql = `
      INSERT INTO ${tableName} (${columns})
      VALUES (${placeholders})
      RETURNING *
    `;

        const result = await db.query<T>(sql, values);
        return result.rows[0];
    }

    /**
     * Bulk insert multiple records
     */
    async insertMany<T extends QueryResultRow>(
        tableName: string,
        records: Partial<T>[],
        batchSize: number = 100,
    ): Promise<T[]> {
        if (records.length === 0) return [];

        const inserted: T[] = [];
        const client = await db.getClient();

        try {
            await client.query('BEGIN');

            for (let i = 0; i < records.length; i += batchSize) {
                const batch = records.slice(i, i + batchSize);
                const keys = Object.keys(batch[0]);
                const columns = keys.join(', ');

                const valuesClauses: string[] = [];
                const params: any[] = [];

                batch.forEach((record) => {
                    const recordValues = keys.map(
                        (key) => record[key as keyof T],
                    );
                    const placeholders = recordValues
                        .map((_, idx) => `$${params.length + idx + 1}`)
                        .join(', ');
                    valuesClauses.push(`(${placeholders})`);
                    params.push(...recordValues);
                });

                const sql = `
          INSERT INTO ${tableName} (${columns})
          VALUES ${valuesClauses.join(', ')}
          RETURNING *
        `;

                const result = await client.query<T>(sql, params);
                inserted.push(...result.rows);
            }

            await client.query('COMMIT');
            return inserted;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Find records with conditions
     */
    async find<T>(
        tableName: string,
        where?: Partial<T>,
        options?: {
            orderBy?: { column: string; direction: 'ASC' | 'DESC' }[];
            limit?: number;
            offset?: number;
            select?: string[];
        },
    ): Promise<T[]> {
        const selectClause = options?.select?.join(', ') || '*';
        let sql = `SELECT ${selectClause} FROM ${tableName}`;
        const params: any[] = [];

        if (where && Object.keys(where).length > 0) {
            const conditions = Object.keys(where).map((key, i) => {
                params.push(where[key as keyof T]);
                return `${key} = $${i + 1}`;
            });
            sql += ` WHERE ${conditions.join(' AND ')}`;
        }

        if (options?.orderBy && options.orderBy.length > 0) {
            const orderClauses = options.orderBy
                .map((o) => `${o.column} ${o.direction}`)
                .join(', ');
            sql += ` ORDER BY ${orderClauses}`;
        }

        if (options?.limit) sql += ` LIMIT ${options.limit}`;
        if (options?.offset) sql += ` OFFSET ${options.offset}`;

        const result = await db.query<T>(sql, params);
        return result.rows;
    }

    /**
     * Find a single record by ID
     */
    async findById<T>(
        tableName: string,
        id: string | number,
        idColumn: string = 'id',
    ): Promise<T | null> {
        const sql = `SELECT * FROM ${tableName} WHERE ${idColumn} = $1`;
        const result = await db.query<T>(sql, [id]);
        return result.rows[0] || null;
    }

    /**
     * Find one record matching conditions
     */
    async findOne<T>(tableName: string, where: Partial<T>): Promise<T | null> {
        const results = await this.find<T>(tableName, where, { limit: 1 });
        return results[0] || null;
    }

    /**
     * Update records
     */
    async update<T>(
        tableName: string,
        where: Partial<T>,
        data: Partial<T>,
    ): Promise<T[]> {
        const setKeys = Object.keys(data);
        const whereKeys = Object.keys(where);

        const setClauses = setKeys
            .map((key, i) => `${key} = $${i + 1}`)
            .join(', ');
        const whereClauses = whereKeys
            .map((key, i) => `${key} = $${setKeys.length + i + 1}`)
            .join(' AND ');

        const params = [...Object.values(data), ...Object.values(where)];

        const sql = `
      UPDATE ${tableName}
      SET ${setClauses}
      WHERE ${whereClauses}
      RETURNING *
    `;

        const result = await db.query<T>(sql, params);
        return result.rows;
    }

    /**
     * Update by ID
     */
    async updateById<T>(
        tableName: string,
        id: string | number,
        data: Partial<T>,
        idColumn: string = 'id',
    ): Promise<T | null> {
        const keys = Object.keys(data);
        const setClauses = keys
            .map((key, i) => `${key} = $${i + 1}`)
            .join(', ');
        const params = [...Object.values(data), id];

        const sql = `
      UPDATE ${tableName}
      SET ${setClauses}
      WHERE ${idColumn} = $${keys.length + 1}
      RETURNING *
    `;

        const result = await db.query<T>(sql, params);
        return result.rows[0] || null;
    }

    /**
     * Delete records
     */
    async delete<T>(tableName: string, where: Partial<T>): Promise<number> {
        const keys = Object.keys(where);
        const whereClauses = keys
            .map((key, i) => `${key} = $${i + 1}`)
            .join(' AND ');
        const params = Object.values(where);

        const sql = `DELETE FROM ${tableName} WHERE ${whereClauses}`;
        const result = await db.query(sql, params);
        return result.rowCount;
    }

    /**
     * Delete by ID
     */
    async deleteById(
        tableName: string,
        id: string | number,
        idColumn: string = 'id',
    ): Promise<boolean> {
        const sql = `DELETE FROM ${tableName} WHERE ${idColumn} = $1`;
        const result = await db.query(sql, [id]);
        return result.rowCount > 0;
    }

    /**
     * Soft delete (set is_deleted = true)
     */
    async softDelete<T>(
        tableName: string,
        where: Partial<T>,
        deletedColumn: string = 'is_deleted',
    ): Promise<T[]> {
        return this.update(tableName, where, {
            [deletedColumn]: true,
        } as Partial<T>);
    }

    /**
     * Soft delete by ID
     */
    async softDeleteById<T>(
        tableName: string,
        id: string | number,
        idColumn: string = 'id',
        deletedColumn: string = 'is_deleted',
    ): Promise<T | null> {
        return this.updateById<T>(
            tableName,
            id,
            { [deletedColumn]: true } as Partial<T>,
            idColumn,
        );
    }

    /**
     * Count records
     */
    async count<T>(tableName: string, where?: Partial<T>): Promise<number> {
        let sql = `SELECT COUNT(*) as count FROM ${tableName}`;
        const params: any[] = [];

        if (where && Object.keys(where).length > 0) {
            const conditions = Object.keys(where).map((key, i) => {
                params.push(where[key as keyof T]);
                return `${key} = $${i + 1}`;
            });
            sql += ` WHERE ${conditions.join(' AND ')}`;
        }

        const result = await db.query<{ count: string }>(sql, params);
        return parseInt(result.rows[0].count, 10);
    }

    /**
     * Check if record exists
     */
    async exists<T>(tableName: string, where: Partial<T>): Promise<boolean> {
        const count = await this.count(tableName, where);
        return count > 0;
    }

    /**
     * Execute raw SQL query
     */
    async raw<T = any>(sql: string, params?: any[]): Promise<T[]> {
        const result = await db.query<T>(sql, params);
        return result.rows;
    }

    /**
     * Execute query in transaction
     */
    async transaction<T>(callback: (client: any) => Promise<T>): Promise<T> {
        const client = await db.getClient();
        try {
            await client.query('BEGIN');
            const result = await callback(client);
            await client.query('COMMIT');
            return result;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }
}

// Export singleton instance
export const dbOps = DatabaseOperations.getInstance();
