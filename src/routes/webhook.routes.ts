import express, { Router } from 'express';

import { clerkWebhook } from '@controllers/webhook.controllers';

const webhookRouter = Router();

// Raw body required for svix signature verification
webhookRouter.post(
    '/clerk',
    express.raw({ type: 'application/json' }),
    clerkWebhook,
);

export { webhookRouter };
