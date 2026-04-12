import { Redis } from 'ioredis';

import { config } from '@config/env';
import { logger } from '@logger/logger';

class CacheService {
    private static instance: CacheService;
    private redisClient: Redis;

    private constructor() {
        this.redisClient = new Redis(config.REDIS_URL, { lazyConnect: true });
        this.redisClient.on('error', (err) =>
            logger.error('Redis connection error', { err }),
        );
    }

    public static getInstance(): CacheService {
        if (!CacheService.instance) {
            CacheService.instance = new CacheService();
        }
        return CacheService.instance;
    }

    public setCache(
        key: string,
        value: string | Buffer | number,
    ): Promise<string> {
        return this.redisClient.set(key, value);
    }

    public getCache(key: string): Promise<string | null> {
        return this.redisClient.get(key);
    }

    public deleteCache(key: string): Promise<number> {
        return this.redisClient.del(key);
    }

    public async isHealthy(): Promise<boolean> {
        try {
            const result = await this.redisClient.ping();
            return result === 'PONG';
        } catch {
            return false;
        }
    }

    public async disconnect(): Promise<void> {
        await this.redisClient.quit();
    }
}

const cacheService = CacheService.getInstance();
export { cacheService };
