import { Router } from 'express';

import { ragRouter } from '@routes/rag.routes';
import { userRouter } from '@routes/user.routes';

const rootRouter = Router();

rootRouter.use('/user', userRouter);
rootRouter.use('/rag', ragRouter);

export { rootRouter };
