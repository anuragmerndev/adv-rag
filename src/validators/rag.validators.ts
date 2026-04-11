import { z } from 'zod';

export const queryValidator = z.object({
    user_question: z
        .string({ required_error: 'user_question is required' })
        .min(1, 'user_question cannot be empty')
        .max(2000, 'user_question must be 2000 characters or less')
        .trim(),
    stream: z.boolean().optional().default(false),
    conversationId: z.string().optional(),
});

export type QueryInput = z.infer<typeof queryValidator>;

export const deleteDocumentValidator = z.object({
    id: z
        .string({ required_error: 'id is required' })
        .min(1, 'id cannot be empty'),
});
