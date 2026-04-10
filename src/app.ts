import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';

import { errorHandler } from '@middlewares/globalErrorHandler';

import { apiRequestLogger } from '@logger/logger';

import { rootRouter } from '@routes/index';

import { db } from './db/client';
import { cacheService } from './services/cache.service';
import { pineconeService } from './services/pinecone.service';

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(apiRequestLogger);

app.get('/healthz', async (_req, res) => {
    const [postgres, redis, pinecone] = await Promise.all([
        db.testConnection().catch(() => false),
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
