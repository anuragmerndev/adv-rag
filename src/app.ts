import cors from 'cors';
import express from 'express';

import { clerkAuth } from '@middlewares/auth.middleware';
import { errorHandler } from '@middlewares/globalErrorHandler';

import { apiRequestLogger } from '@logger/logger';

import { rootRouter } from '@routes/index';

import { config } from './config/env';
import { prisma } from './db/prisma';
import { cacheService } from './services/cache.service';
import { pineconeService } from './services/pinecone.service';

const app = express();

const isProd = config.NODE_ENV === 'production';
const allowedOrigins = config.ALLOWED_ORIGINS.split(',').map((o) => o.trim());

app.use(
    cors({
        origin: isProd ? allowedOrigins : true,
        credentials: true,
    }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const withTimeout = <T>(promise: Promise<T>, ms: number, fallback: T) =>
    Promise.race([
        promise,
        new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
    ]);

app.get('/health', async (_req, res) => {
    const [postgres, redis, pinecone] = await Promise.all([
        withTimeout(
            prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
            5000,
            false,
        ),
        withTimeout(
            cacheService.isHealthy().catch(() => false),
            5000,
            false,
        ),
        withTimeout(
            pineconeService.isHealthy().catch(() => false),
            5000,
            false,
        ),
    ]);

    const allHealthy = postgres && redis && pinecone;

    return res.status(200).json({
        status: allHealthy ? 'healthy' : 'degraded',
        services: { postgres, redis, pinecone },
    });
});

app.use(clerkAuth);
app.use(apiRequestLogger);

app.use('/v1', rootRouter);

app.use(errorHandler);

export { app };
