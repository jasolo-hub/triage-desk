import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { Access } from '../auth/decorators.js';
import { MAX_UPLOAD_BYTES } from './upload-rules.js';
import { UploadsService } from './uploads.service.js';

@ApiTags('uploads')
@ApiBearerAuth()
@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @Access('uploads', 'create')
  @Post()
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      // D6: the file lives only in this request's memory and is streamed to S3.
      storage: memoryStorage(),
      // multer aborts while reading the body once a file passes 5 MB, so an
      // oversized upload is never fully buffered (Nest turns it into a 413).
      limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
    }),
  )
  upload(@UploadedFile() file: Express.Multer.File | undefined) {
    if (!file)
      throw new BadRequestException('Multipart field "file" is required');
    return this.uploads.upload(file);
  }
}
