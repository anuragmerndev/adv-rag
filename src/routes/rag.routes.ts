import { Router } from 'express';

import {
    deleteDocument,
    queryDocuments,
    uploadDocument,
} from '@controllers/rag.controllers';

import { validateBody } from '@middlewares/validateBody';

import { upload } from '@utils/helper';

import { queryValidator } from '@validators/rag.validators';

const ragRouter = Router();

ragRouter.post('/upload', upload.single('document'), uploadDocument);
ragRouter.post('/query', validateBody(queryValidator), queryDocuments);
ragRouter.delete('/document/:id', deleteDocument);

export { ragRouter };
