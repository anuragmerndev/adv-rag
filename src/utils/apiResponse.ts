import { Response } from 'express';

function apiResponse(res: Response, statusCode: number, data: unknown) {
    return res.status(statusCode).json({ success: true, data });
}

export { apiResponse };
