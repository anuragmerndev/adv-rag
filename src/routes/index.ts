import { Router } from 'express';

import { ragRouter } from '@routes/rag.routes';
import { webhookRouter } from '@routes/webhook.routes';

const rootRouter = Router();

rootRouter.use('/rag', ragRouter);
rootRouter.use('/webhooks', webhookRouter);

export { rootRouter };
