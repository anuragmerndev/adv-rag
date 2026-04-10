import { Router } from 'express';

import { ragRouter } from '@routes/rag.routes';

const rootRouter = Router();

rootRouter.use('/rag', ragRouter);

export { rootRouter };
