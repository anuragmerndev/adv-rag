/* eslint-disable prettier/prettier */
import { existsSync } from 'node:fs';
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

import { db } from '../db/client';

/**
 * Migration system for managing database schema changes
 */

interface Migration {
    id: string;
    name: string;
    timestamp: number;
    up: string;
    down: string;
}

export class MigrationManager {
    private migrationsDir: string;
    private migrationsTable = '_migrations';

    constructor(migrationsDir: string = './migrations') {
        this.migrationsDir = migrationsDir;
    }

    /**
     * Initialize migrations table
     */
    private async initMigrationsTable(): Promise<void> {
        const sql = `
      CREATE TABLE IF NOT EXISTS ${this.migrationsTable} (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        executed_at TIMESTAMPTZ DEFAULT now()
      )
    `;
        await db.query(sql);
    }

    /**
     * Get list of executed migrations
     */
    private async getExecutedMigrations(): Promise<Set<string>> {
        await this.initMigrationsTable();

        const result = await db.query<{ id: string }>(
            `SELECT id FROM ${this.migrationsTable} ORDER BY executed_at`,
        );
        return new Set(result.rows.map((r) => r.id));
    }

    /**
     * Load migration files from disk
     */
    // eslint-disable-next-line sonarjs/cognitive-complexity
    private async loadMigrations(): Promise<Migration[]> {
        if (!existsSync(this.migrationsDir)) {
            await mkdir(this.migrationsDir, { recursive: true });
            return [];
        }

        const files = await readdir(this.migrationsDir);
        const sqlFiles = files.filter((f) => f.endsWith('.sql'));

        const migrations: Migration[] = [];

        for (const file of sqlFiles) {
            const content = await readFile(
                path.join(this.migrationsDir, file),
                'utf-8',
            );

            // Parse migration file format:
            // -- Migration: migration_name
            // -- UP
            // CREATE TABLE ...;
            // -- DOWN
            // DROP TABLE ...;

            const lines = content.split('\n');
            let name = '';
            let upSQL = '';
            let downSQL = '';
            let section: 'none' | 'up' | 'down' = 'none';

            for (const line of lines) {
                if (line.startsWith('-- Migration:')) {
                    name = line.replace('-- Migration:', '').trim();
                } else if (line.trim() === '-- UP') {
                    section = 'up';
                } else if (line.trim() === '-- DOWN') {
                    section = 'down';
                } else if (line.startsWith('--')) {
                    continue;
                } else {
                    if (section === 'up') upSQL += line + '\n';
                    if (section === 'down') downSQL += line + '\n';
                }
            }

            // Extract timestamp from filename (format: YYYYMMDDHHMMSS_name.sql)
            const match = file.match(/^(\d+)_/);
            const timestamp = match ? parseInt(match[1]) : 0;

            migrations.push({
                id: file.replace('.sql', ''),
                name: name || file,
                timestamp,
                up: upSQL.trim(),
                down: downSQL.trim(),
            });
        }

        return migrations.sort((a, b) => a.timestamp - b.timestamp);
    }

    /**
     * Run pending migrations
     */
    async up(): Promise<void> {
        console.log('🚀 Running migrations...\n');

        try {
            await db.testConnection();

            const executed = await this.getExecutedMigrations();
            const allMigrations = await this.loadMigrations();
            const pending = allMigrations.filter((m) => !executed.has(m.id));

            if (pending.length === 0) {
                console.log('✓ No pending migrations');
                return;
            }

            console.log(`Found ${pending.length} pending migration(s)\n`);

            for (const migration of pending) {
                console.log(`Running: ${migration.name}...`);
                const client = await db.getClient();
                try {
                    await client.query('BEGIN');
                    // Execute migration
                    await client.query(migration.up);

                    // Record migration
                    await client.query(
                        `INSERT INTO ${this.migrationsTable} (id, name) VALUES ($1, $2)`,
                        [migration.id, migration.name],
                    );
                    await client.query('COMMIT');
                    console.log(`✓ ${migration.name} completed\n`);
                } catch (error) {
                    await client.query('ROLLBACK');
                    console.error(`✗ ${migration.name} failed:`, error);
                    throw error;
                } finally {
                    client.release();
                }
            }

            // Optimize vector indexes
            console.log('⚡ Optimizing indexes...');
            await db.query('ANALYZE');

            console.log('\n✅ All migrations completed successfully!');
        } catch (error) {
            console.error('\n❌ Migration failed:', error);
            throw error;
        }
    }

    /**
     * Rollback last migration
     */
    async down(): Promise<void> {
        console.log('⏪ Rolling back last migration...\n');

        try {
            await db.testConnection();

            const executed = await this.getExecutedMigrations();
            const allMigrations = await this.loadMigrations();

            const executedList = allMigrations.filter((m) =>
                executed.has(m.id),
            );

            if (executedList.length === 0) {
                console.log('✓ No migrations to rollback');
                return;
            }

            const lastMigration = executedList[executedList.length - 1];
            console.log(`Rolling back: ${lastMigration.name}...`);

            const client = await db.getClient();
            try {
                await client.query('BEGIN');
                // Execute rollback
                await client.query(lastMigration.down);

                // Remove migration record
                await client.query(
                    `DELETE FROM ${this.migrationsTable} WHERE id = $1`,
                    [lastMigration.id],
                );
                await client.query('COMMIT');
                console.log(`✓ ${lastMigration.name} rolled back\n`);
            } catch (error) {
                await client.query('ROLLBACK');
                console.error('✗ Rollback failed:', error);
                throw error;
            } finally {
                client.release();
            }

            console.log('✅ Rollback completed successfully!');
        } catch (error) {
            console.error('\n❌ Rollback failed:', error);
            throw error;
        }
    }

    /**
     * Show migration status
     */
    async status(): Promise<void> {
        console.log('📊 Migration Status\n');

        try {
            await db.testConnection();

            const executed = await this.getExecutedMigrations();
            const allMigrations = await this.loadMigrations();

            console.log(`Total migrations: ${allMigrations.length}`);
            console.log(`Executed: ${executed.size}`);
            console.log(`Pending: ${allMigrations.length - executed.size}\n`);

            if (allMigrations.length > 0) {
                console.log('Migration List:\n');
                allMigrations.forEach((m) => {
                    const status = executed.has(m.id)
                        ? '✓ Executed'
                        : '○ Pending';
                    console.log(`  ${status}  ${m.name}`);
                });
            }
        } catch (error) {
            console.error('Error checking status:', error);
            throw error;
        }
    }

    /**
     * Create a new migration file
     */
    async create(name: string): Promise<void> {
        const timestamp = new Date()
            .toISOString()
            .replace(/[-:T.]/g, '')
            .slice(0, 14);
        const filename = `${timestamp}_${name.toLowerCase().replace(/\s+/g, '_')}.sql`;
        const filepath = path.join(this.migrationsDir, filename);

        const template = `-- Migration: ${name}
-- Created: ${new Date().toISOString()}

-- UP
-- Write your migration SQL here
CREATE TABLE IF NOT EXISTS example (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid()
);

-- DOWN
-- Write rollback SQL here
DROP TABLE IF EXISTS example;
`;

        if (!existsSync(this.migrationsDir)) {
            await mkdir(this.migrationsDir, { recursive: true });
        }

        await writeFile(filepath, template);
        console.log(`✓ Created migration: ${filename}`);
    }
}

// CLI handling
async function main() {
    const migrationManager = new MigrationManager(
        path.join(__dirname, '../db/migrations'),
    );
    const command = process.argv[2];
    const arg = process.argv[3];

    try {
        switch (command) {
        case 'up':
            await migrationManager.up();
            break;
        case 'down':
            await migrationManager.down();
            break;
        case 'status':
            await migrationManager.status();
            break;
        case 'create':
            if (!arg) {
                console.error('Error: Migration name required');
                console.log(
                    'Usage: npm run migrate create <migration-name>',
                );
                process.exit(1);
            }
            await migrationManager.create(arg);
            break;
        default:
            console.log(`
                Migration Manager

                Usage: npm run migrate <command> [options]

                Commands:
                up              Run all pending migrations
                down            Rollback the last migration
                status          Show migration status
                create <name>   Create a new migration file

                Examples:
                npm run migrate up
                npm run migrate down
                npm run migrate status
                npm run migrate create add_users_table
        `);
            process.exit(1);
        }
    } catch (error) {
        console.error('Migration error:', error);
        process.exit(1);
    } finally {
        await db.close();
    }
}

// Run if called directly
if (require.main === module) {
    main();
}

export default MigrationManager;
