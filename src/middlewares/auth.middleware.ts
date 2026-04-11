import { clerkMiddleware, getAuth } from '@clerk/express';
import { NextFunction, Request, Response } from 'express';

import { prisma } from '@db/prisma';

export const clerkAuth = clerkMiddleware();

export const requireAuth = async (
    req: Request,
    res: Response,
    next: NextFunction,
) => {
    const { userId: clerkId } = getAuth(req);

    if (!clerkId) {
        return res
            .status(401)
            .json({ success: false, error: 'Unauthorised' });
    }

    const user = await prisma.user.findUnique({ where: { clerkId } });

    if (!user) {
        return res.status(401).json({
            success: false,
            error: 'User not found — sign in first',
        });
    }

    (req as any).userId = user.id;
    (req as any).clerkId = clerkId;

    return next();
};
