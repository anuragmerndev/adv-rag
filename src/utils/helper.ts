/* eslint-disable quotes */
import crypto from 'node:crypto';

import multer from 'multer';

import { config } from '@config/env';

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads');
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(
            null,
            file.fieldname +
                '-' +
                uniqueSuffix +
                '.' +
                file.originalname.split('.').pop(),
        );
    },
});

const MAX_FILE_SIZE = config.MAX_FILE_SIZE;

const upload = multer({
    storage: storage,
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter: (_req, file, cb) => {
        if (file.mimetype !== 'application/pdf') {
            cb(new Error('Only PDF files are allowed'));
            return;
        }
        cb(null, true);
    },
});

const CONTRACTIONS: Record<string, string> = {
    "i'm": 'i am',
    "don't": 'do not',
    "doesn't": 'does not',
    "didn't": 'did not',
    "can't": 'cannot',
    "won't": 'will not',
    "haven't": 'have not',
    "hasn't": 'has not',
    "isn't": 'is not',
    "aren't": 'are not',
    "wasn't": 'was not',
    "weren't": 'were not',
    "it's": 'it is',
    "that's": 'that is',
    "there's": 'there is',
    "what's": 'what is',
    "who's": 'who is',
    "let's": 'let us',
};

function normalizeQuery(input: string): string {
    if (!input) return '';

    let text = input.toLowerCase().trim();

    // Expand common contractions
    for (const [k, v] of Object.entries(CONTRACTIONS)) {
        text = text.replace(new RegExp(`\\b${k}\\b`, 'g'), v);
    }

    // Remove punctuation (except inside words/numbers)
    text = text.replace(/[^a-z0-9\s]/g, ' ');

    // Collapse multiple spaces
    text = text.replace(/\s+/g, ' ');

    // Optional: remove very common stopwords
    const STOPWORDS = new Set([
        'the',
        'a',
        'an',
        'is',
        'am',
        'are',
        'to',
        'of',
        'in',
        'on',
        'for',
        'at',
        'and',
        'or',
        'that',
        'this',
        'it',
        'as',
        'by',
        'be',
        'was',
        'were',
        'do',
        'does',
        'did',
        'from',
        'with',
    ]);

    const words = text.split(' ').filter((w) => w && !STOPWORDS.has(w));

    // Rejoin
    return words.join(' ').trim();
}

const createShaFingerprint = (text: string): string => {
    const hash = crypto.createHash('sha256');
    hash.update(text);
    return hash.digest('hex');
};

export { upload, normalizeQuery, createShaFingerprint };
