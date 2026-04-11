import fs from 'fs';
import path from 'path';

import { Request, Response } from 'express';

import { prisma } from '@db/prisma';

import { pineconeService } from '@services/pinecone.service';

import { apiResponse } from '@utils/apiResponse';
import { asyncHandler } from '@utils/asyncHandler';
import { RESPONSE_STATUS } from '@utils/responseStatus';

const DOCUMENT_NOT_FOUND = 'Document not found';

const listDocuments = asyncHandler(async (req: Request, res: Response) => {
    const userId: string = (req as any).userId;

    const documents = await prisma.document.findMany({
        where: { userId },
        orderBy: { uploadedAt: 'desc' },
        select: {
            id: true,
            originalName: true,
            chunkCount: true,
            fileSize: true,
            uploadedAt: true,
        },
    });

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, documents);
});

const deleteDocument = asyncHandler(async (req: Request, res: Response) => {
    const userId: string = (req as any).userId;
    const { id } = req.params;

    const doc = await prisma.document.findFirst({ where: { id, userId } });

    if (!doc) {
        return res
            .status(RESPONSE_STATUS.NOT_FOUND)
            .json({ success: false, error: DOCUMENT_NOT_FOUND });
    }

    // Remove vectors from Pinecone (namespace = userId)
    await pineconeService.deleteByDocument(userId, id);

    // Remove file from disk if it exists
    if (doc.filePath) {
        const absPath = path.resolve(doc.filePath);
        if (fs.existsSync(absPath)) {
            fs.unlinkSync(absPath);
        }
    }

    await prisma.document.delete({ where: { id } });

    return apiResponse(res, RESPONSE_STATUS.NOCONTENT, null);
});

const downloadDocument = asyncHandler(async (req: Request, res: Response) => {
    const userId: string = (req as any).userId;
    const { id } = req.params;

    const doc = await prisma.document.findFirst({ where: { id, userId } });

    if (!doc) {
        return res
            .status(RESPONSE_STATUS.NOT_FOUND)
            .json({ success: false, error: DOCUMENT_NOT_FOUND });
    }

    if (!doc.filePath) {
        return res.status(RESPONSE_STATUS.NOT_FOUND).json({
            success: false,
            error: 'File not available for download',
        });
    }

    const absPath = path.resolve(doc.filePath);

    if (!fs.existsSync(absPath)) {
        return res.status(RESPONSE_STATUS.NOT_FOUND).json({
            success: false,
            error: 'File not available for download',
        });
    }

    res.setHeader(
        'Content-Disposition',
        `attachment; filename="${doc.originalName}"`,
    );
    res.setHeader('Content-Type', 'application/octet-stream');

    fs.createReadStream(absPath).pipe(res);
});

export { listDocuments, deleteDocument, downloadDocument };
