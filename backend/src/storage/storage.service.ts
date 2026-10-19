import {
  GetObjectCommand,
  HeadObjectCommand,
  NotFound,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.validation.js';

const DOWNLOAD_URL_TTL_SECONDS = 5 * 60;

export interface StoredObject {
  name: string;
  contentType: string;
  size: number;
}

// S3 API client for any S3-compatible store: S3Mock locally, Cloudflare R2 in
// production (D12). Only env decides which one.
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
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
      // Fail fast instead of the SDK's default retries/backoff when storage is down.
      maxAttempts: 2,
    });
  }

  /** Stores a file held in memory (D6: nothing is written to local disk). */
  async putObject(
    key: string,
    body: Buffer,
    contentType: string,
    name: string,
  ): Promise<void> {
    await this.call('upload', () =>
      this.s3.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
          // S3 metadata travels as an HTTP header, which must be ASCII; encoding
          // keeps names like "Prüfbericht.pdf" intact.
          Metadata: { 'original-name': encodeURIComponent(name) },
        }),
      ),
    );
  }

  /** Metadata of a stored object, or null when the key does not exist. */
  async headObject(key: string): Promise<StoredObject | null> {
    try {
      const head = await this.s3.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return {
        name: decodeURIComponent(
          head.Metadata?.['original-name'] ?? key.split('/').pop()!,
        ),
        contentType: head.ContentType ?? 'application/octet-stream',
        size: head.ContentLength ?? 0,
      };
    } catch (error) {
      if (error instanceof NotFound) return null;
      throw this.unavailable('head', error);
    }
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

  private async call<T>(operation: string, fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      throw this.unavailable(operation, error);
    }
  }

  // Storage problems are an outage, not a client error: 503 with the cause in
  // the log only (endpoint/bucket details stay out of the response).
  private unavailable(
    operation: string,
    error: unknown,
  ): ServiceUnavailableException {
    this.logger.warn(
      `S3 ${operation} failed: ${error instanceof Error ? error.message : error}`,
    );
    return new ServiceUnavailableException('File storage unavailable');
  }
}
