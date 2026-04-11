import { Router } from 'express';

import { requireAuth } from '@middlewares/auth.middleware';
import { validateBody } from '@middlewares/validateBody';

import { queryValidator } from '@validators/rag.validators';

import { queryDocuments, uploadDocument } from '@controllers/rag.controllers';

import { upload } from '@utils/helper';

const ragRouter = Router();

ragRouter.post(
    '/upload',
    requireAuth,
    upload.single('document'),
    uploadDocument,
);
ragRouter.post(
    '/query',
    requireAuth,
    validateBody(queryValidator),
    queryDocuments,
);

export { ragRouter };
