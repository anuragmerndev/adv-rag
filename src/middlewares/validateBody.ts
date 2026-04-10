import { NextFunction, Request, Response } from 'express';
import { ZodSchema } from 'zod';

export function validateBody(schema: ZodSchema) {
    return (req: Request, res: Response, next: NextFunction) => {
        const result = schema.safeParse(req.body);
        if (!result.success) {
            return res.status(400).json({
                success: false,
                error: result.error.issues
                    .map((i) => `${i.path.join('.')}: ${i.message}`)
                    .join(', '),
            });
        }
        req.body = result.data;
        next();
    };
}
