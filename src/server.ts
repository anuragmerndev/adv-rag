import 'dotenv/config';

import fs from 'fs';
import http from 'http';

import { config } from '@config/env';
import { logger } from '@logger/logger';

import { app } from './app';
import { prisma } from './db/prisma';
import { cacheService } from './services/cache.service';

const { PORT } = config;

fs.mkdirSync('uploads', { recursive: true });

function startServer() {
    const server = http.createServer(app);

    server.listen(PORT, () => {
        logger.info(`server is running on port ${PORT} (pid ${process.pid})`);
    });

    const shutdown = async (signal: string) => {
        logger.info(`${signal} received — shutting down gracefully`);

        server.close(async () => {
            try {
                await Promise.all([
                    cacheService.disconnect(),
                    prisma.$disconnect(),
                ]);
                logger.info('all connections closed — exiting');
                process.exit(0);
            } catch (err) {
                logger.error('error during shutdown', { err });
                process.exit(1);
            }
        });

        // Force exit if shutdown takes too long
        setTimeout(() => {
            logger.error('shutdown timed out — forcing exit');
            process.exit(1);
        }, 10000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    return server;
}

// if (NODE_ENV === 'development') {
startServer();
// }

// if (NODE_ENV === 'production') {
//     const numCpus = cpus().length;

//     if (cluster.isPrimary) {
//         logger.info(`Master thread is running on ${process.pid}`);
//         for (let i = 0; i < numCpus; i++) {
//             cluster.fork();
//         }

//         cluster.on('exit', (worker) => {
//             logger.warn(`Worker ${worker.process.pid} died — restarting`);
//             cluster.fork();
//         });
//     } else {
//         startServer();
//     }
// }
