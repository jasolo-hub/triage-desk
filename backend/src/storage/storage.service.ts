import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.validation.js';

const DOWNLOAD_URL_TTL_SECONDS = 5 * 60;

// S3 API client for any S3-compatible store: S3Mock locally, Cloudflare R2 in
// production (D12). Only env decides which one.
@Injectable()
export class StorageService {
  private readonly s3: S3Client;
  private readonly bucket: string;

  constructor(config: ConfigService<Env, true>) {
    this.bucket = config.get('S3_BUCKET', { infer: true });
    this.s3 = new S3Client({
      endpoint: config.get('S3_ENDPOINT', { infer: true }),
      region: config.get('S3_REGION', { infer: true }),
      // S3Mock needs path-style URLs (http://host/bucket/key); R2 works with both.
      forcePathStyle: config.get('S3_FORCE_PATH_STYLE', { infer: true }),
      credentials: {
        accessKeyId: config.get('S3_ACCESS_KEY_ID', { infer: true }),
        secretAccessKey: config.get('S3_SECRET_ACCESS_KEY', { infer: true }),
      },
    });
  }

  /** Short-lived download link: the bucket stays private, the URL expires in 5 minutes (D6).
   *  Signing is a local HMAC computation, no network call. */
  getPresignedGetUrl(key: string): Promise<string> {
    return getSignedUrl(
      this.s3,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      {
        expiresIn: DOWNLOAD_URL_TTL_SECONDS,
      },
    );
  }
}
