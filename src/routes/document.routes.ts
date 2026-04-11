import { Router } from 'express';

import {
    deleteDocument,
    downloadDocument,
    listDocuments,
} from '@controllers/document.controllers';

import { requireAuth } from '@middlewares/auth.middleware';

const documentRouter = Router();

documentRouter.get('/', requireAuth, listDocuments);
documentRouter.delete('/:id', requireAuth, deleteDocument);
documentRouter.get('/:id/download', requireAuth, downloadDocument);

export { documentRouter };
