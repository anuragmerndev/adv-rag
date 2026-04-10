import { Router } from 'express';

import { validateBody } from '@middlewares/validateBody';

import { queryValidator } from '@validators/rag.validators';

import {
    deleteDocument,
    queryDocuments,
    uploadDocument,
} from '@controllers/rag.controllers';

import { upload } from '@utils/helper';

const ragRouter = Router();

ragRouter.post('/upload', upload.single('document'), uploadDocument);
ragRouter.post('/query', validateBody(queryValidator), queryDocuments);
ragRouter.delete('/document/:id', deleteDocument);

export { ragRouter };
