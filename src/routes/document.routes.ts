import { Router } from 'express';

import { requireAuth } from '@middlewares/auth.middleware';

import {
    deleteDocument,
    downloadDocument,
    listDocuments,
} from '@controllers/document.controllers';

const documentRouter = Router();

documentRouter.get('/', requireAuth, listDocuments);
documentRouter.delete('/:id', requireAuth, deleteDocument);
documentRouter.get('/:id/download', requireAuth, downloadDocument);

export { documentRouter };
