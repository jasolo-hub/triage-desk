import { BadRequestException } from '@nestjs/common';

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB
// Common filesystem limit, and the size of Comment.attachmentName in the DB:
// checking here gives a clear 400 at upload instead of a failing comment later.
export const MAX_FILE_NAME_LENGTH = 255;

/** Allowed extension → the one content type it must be declared with. */
export const ALLOWED_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  pdf: 'application/pdf',
  txt: 'text/plain',
};

// Leading bytes of each binary format. The declared type and the extension both
// come from the client, so we also look at the content: a renamed .exe sent as
// image/png fails here. Plain text has no signature and is not checked.
const SIGNATURES: Record<string, (b: Buffer) => boolean> = {
  'image/png': (b) =>
    b
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/jpeg': (b) => b.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])),
  'image/webp': (b) =>
    b.subarray(0, 4).toString('latin1') === 'RIFF' &&
    b.subarray(8, 12).toString('latin1') === 'WEBP',
  'application/pdf': (b) => b.subarray(0, 5).toString('latin1') === '%PDF-',
};

export interface ValidatedUpload {
  ext: string;
  contentType: string;
}

/** Throws 400 unless extension, declared type and content all agree with the allowlist. */
export function validateUpload(file: {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
}): ValidatedUpload {
  if (file.originalname.length > MAX_FILE_NAME_LENGTH) {
    throw new BadRequestException(
      `File name is longer than ${MAX_FILE_NAME_LENGTH} characters`,
    );
  }
  const ext = file.originalname.includes('.')
    ? file.originalname.split('.').pop()!.toLowerCase()
    : '';
  const expected = ALLOWED_TYPES[ext];
  if (!expected) {
    throw new BadRequestException(
      `File type .${ext || '?'} is not allowed (allowed: ${Object.keys(ALLOWED_TYPES).join(', ')})`,
    );
  }
  const declared = file.mimetype.split(';')[0].trim().toLowerCase();
  if (declared !== expected) {
    throw new BadRequestException(
      `A .${ext} file must be sent as ${expected}, not ${declared}`,
    );
  }
  const matches = SIGNATURES[expected];
  if (matches && !matches(file.buffer)) {
    throw new BadRequestException(`File content is not a valid ${expected}`);
  }
  if (file.buffer.length === 0) throw new BadRequestException('File is empty');
  return { ext, contentType: expected };
}
