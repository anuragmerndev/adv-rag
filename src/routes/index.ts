import { Router } from 'express';

import { conversationRouter } from '@routes/conversation.routes';
import { documentRouter } from '@routes/document.routes';
import { ragRouter } from '@routes/rag.routes';
import { webhookRouter } from '@routes/webhook.routes';

const rootRouter = Router();

rootRouter.use('/rag', ragRouter);
rootRouter.use('/webhooks', webhookRouter);
rootRouter.use('/conversations', conversationRouter);
rootRouter.use('/documents', documentRouter);

export { rootRouter };
