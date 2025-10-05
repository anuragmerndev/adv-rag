import { Redis } from 'ioredis';

class CacheService {
    private static instance: CacheService;
    private redisClient: Redis;

    private constructor() {
        this.redisClient = new Redis({
            host: 'localhost',
            port: 6379,
        });
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
}

const cacheService = CacheService.getInstance();
export { cacheService };
