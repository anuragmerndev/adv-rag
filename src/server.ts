import 'dotenv/config';

import cluster from 'cluster';
import { cpus } from 'os';

import { config } from '@config/env';
import { logger } from '@logger/logger';

import { app } from './app';

const { PORT, NODE_ENV } = config;

if (NODE_ENV === 'development') {
    app.listen(PORT, () => {
        logger.info(`server is running on port ${PORT}`);
    });
}

if (NODE_ENV === 'production') {
    const numCpus = cpus().length;

    if (cluster.isPrimary) {
        logger.info(`Master thread is running on ${process.pid}`);
        for (let i = 0; i < numCpus; i++) {
            cluster.fork();
        }

        cluster.on('exit', () => {
            cluster.fork();
        });
    } else {
        app.listen(PORT, () => {
            logger.info(`server is running on pid ${process.pid}`);
        });
    }
}
