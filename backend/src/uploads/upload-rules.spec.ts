import { BadRequestException } from '@nestjs/common';
import { validateUpload } from './upload-rules.js';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const PDF = Buffer.from('%PDF-1.7\n...');

const file = (originalname: string, mimetype: string, buffer: Buffer) => ({
  originalname,
  mimetype,
  buffer,
});

describe('validateUpload', () => {
  it('accepts allowed files whose extension, type and content agree', () => {
    expect(validateUpload(file('shot.PNG', 'image/png', PNG))).toEqual({
      ext: 'png',
      contentType: 'image/png',
    });
    expect(
      validateUpload(file('invoice.pdf', 'application/pdf', PDF)).contentType,
    ).toBe('application/pdf');
    expect(
      validateUpload(
        file('log.txt', 'text/plain; charset=utf-8', Buffer.from('hi')),
      ).ext,
    ).toBe('txt');
  });

  it.each(['tool.exe', 'run.sh', 'page.html', 'no-extension'])(
    'rejects %s',
    (name) => {
      expect(() =>
        validateUpload(file(name, 'application/octet-stream', PNG)),
      ).toThrow(BadRequestException);
    },
  );

  it('rejects a declared type that does not match the extension', () => {
    expect(() =>
      validateUpload(file('shot.png', 'application/pdf', PNG)),
    ).toThrow('A .png file must be sent as image/png');
  });

  it('rejects content that is not what the extension claims', () => {
    expect(() =>
      validateUpload(file('shot.png', 'image/png', Buffer.from('MZ...'))),
    ).toThrow('File content is not a valid image/png');
  });

  it('rejects empty files', () => {
    expect(() =>
      validateUpload(file('empty.txt', 'text/plain', Buffer.alloc(0))),
    ).toThrow('File is empty');
  });
});
