import cors from 'cors';
import express from 'express';

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

app.use(apiRequestLogger);

app.get('/healthz', async (_req, res) => {
    const [postgres, redis, pinecone] = await Promise.all([
        prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
        cacheService.isHealthy().catch(() => false),
        pineconeService.isHealthy().catch(() => false),
    ]);

    const allHealthy = postgres && redis && pinecone;

    return res.status(200).json({
        status: allHealthy ? 'healthy' : 'degraded',
        services: { postgres, redis, pinecone },
    });
});

app.use('/v1', rootRouter);

app.use(errorHandler);

export { app };
