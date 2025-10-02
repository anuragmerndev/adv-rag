import cluster from 'cluster';
import { cpus } from 'os';

import { config } from 'dotenv';

import { logger } from '@logger/logger';

import { app } from './app';

config();

const PORT = process.env.PORT ? Number(process.env.PORT) : 8080;

const ENV = process.env.NODE_ENV;

if (ENV === 'development') {
    app.listen(PORT, () => {
        logger.info(`server is running ${PORT}`);
    });
}

if (ENV === 'production') {
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
            logger.info(`server is running on ${process.pid}`);
        });
    }
}
