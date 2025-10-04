import { Router } from 'express';

import { queryDocuments, uploadDocument } from '@controllers/rag.controllers';

import { upload } from '@utils/helper';

const ragRouter = Router();

ragRouter.post('/upload', upload.single('document'), uploadDocument);
ragRouter.post('/query', queryDocuments);

export { ragRouter };
