import { Request, Response } from 'express';
import { Webhook } from 'svix';

import { config } from '@config/env';
import { prisma } from '@db/prisma';
import { asyncHandler } from '@utils/asyncHandler';

export const clerkWebhook = asyncHandler(
    async (req: Request, res: Response) => {
        const wh = new Webhook(config.CLERK_WEBHOOK_SECRET);

        let event: { type: string; data: Record<string, any> };
        try {
            event = wh.verify(JSON.stringify(req.body), {
                'svix-id': req.headers['svix-id'] as string,
                'svix-timestamp': req.headers['svix-timestamp'] as string,
                'svix-signature': req.headers['svix-signature'] as string,
            }) as { type: string; data: Record<string, any> };
        } catch {
            return res
                .status(400)
                .json({ error: 'Invalid webhook signature' });
        }

        const { type, data } = event;

        if (type === 'user.created') {
            await prisma.user.create({
                data: {
                    clerkId: data.id,
                    email: data.email_addresses[0]?.email_address ?? '',
                    name:
                        `${data.first_name ?? ''} ${data.last_name ?? ''}`.trim() ||
                        null,
                },
            });
        }

        if (type === 'user.updated') {
            await prisma.user.update({
                where: { clerkId: data.id },
                data: {
                    email: data.email_addresses[0]?.email_address ?? '',
                    name:
                        `${data.first_name ?? ''} ${data.last_name ?? ''}`.trim() ||
                        null,
                },
            });
        }

        if (type === 'user.deleted') {
            await prisma.user.delete({ where: { clerkId: data.id } });
        }

        return res.status(200).json({ received: true });
    },
);
