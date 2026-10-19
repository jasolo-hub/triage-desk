import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { StorageService } from '../storage/storage.service.js';
import { validateUpload } from './upload-rules.js';

export interface UploadResponse {
  key: string;
  name: string;
  contentType: string;
  size: number;
}

@Injectable()
export class UploadsService {
  constructor(private readonly storage: StorageService) {}

  async upload(file: Express.Multer.File): Promise<UploadResponse> {
    const { ext, contentType } = validateUpload(file);
    // Random key: never derived from the user's file name (no path tricks, no
    // collisions, not guessable). The original name is kept as object metadata.
    const key = `attachments/${randomUUID()}.${ext}`;
    await this.storage.putObject(
      key,
      file.buffer,
      contentType,
      file.originalname,
    );
    return { key, name: file.originalname, contentType, size: file.size };
  }
}
