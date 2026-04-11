import { Router } from 'express';

import {
    createConversation,
    deleteConversation,
    getConversation,
    listConversations,
    updateConversation,
} from '@controllers/conversation.controllers';

import { requireAuth } from '@middlewares/auth.middleware';

const conversationRouter = Router();

conversationRouter.post('/', requireAuth, createConversation);
conversationRouter.get('/', requireAuth, listConversations);
conversationRouter.get('/:id', requireAuth, getConversation);
conversationRouter.patch('/:id', requireAuth, updateConversation);
conversationRouter.delete('/:id', requireAuth, deleteConversation);

export { conversationRouter };
