/// <reference types="jest" />

import { coverUrl, extractFolderId, streamUrl } from '../driveUrls';

const id = '1Bj2CW9jD-rbQwdVeB7ZEOkkI9obYZBMw';

describe('Drive URLs', () => {
  test('builds the range-capable stream endpoint', () => {
    expect(streamUrl(id)).toBe(`https://drive.usercontent.google.com/download?id=${id}&export=download`);
  });

  test('builds a thumbnail URL with a default width of 600', () => {
    expect(coverUrl(id)).toBe(`https://drive.google.com/thumbnail?id=${id}&sz=w600`);
    expect(coverUrl(id, 240)).toBe(`https://drive.google.com/thumbnail?id=${id}&sz=w240`);
  });

  test('encodes IDs as single query parameter values', () => {
    expect(streamUrl('a&b c')).toContain('id=a%26b%20c&export=download');
    expect(coverUrl('a&b c')).toContain('id=a%26b%20c&sz=w600');
  });

  test.each([
    id,
    `  ${id}  `,
    `/drive/folders/${id}`,
    `/drive/folders/${id}/?usp=sharing`,
    `https://drive.google.com/drive/folders/${id}`,
    `https://drive.google.com/drive/folders/${id}?usp=sharing#grid`,
    `https://drive.google.com/drive/u/0/folders/${id}?usp=sharing`,
    `/drive/u/2/folders/${id}?usp=sharing`,
    `?id=${id}`,
    `?usp=sharing&id=${id}&x=1`,
    `https://drive.google.com/open?id=${id}`,
    `https://drive.google.com/embeddedfolderview?id=${id}#list`,
    `https://drive.google.com/open?id=${id.replace('-', '%2D')}`,
  ])('extracts a folder ID from %s', (input) => {
    expect(extractFolderId(input)).toBe(id);
  });

  test.each([
    '', '  ', 'not a folder id',
    'https://drive.google.com/drive/folders/',
    'https://drive.google.com/file/d/file-id/view',
    'https://example.com/drive/folders/abc',
    'https://drive.google.com.evil.test/drive/folders/abc',
    'https://drive.google.com/open?id=',
    '?id=has%20spaces', '?id=%ZZ', '?folder=abc',
    '/drive/folders/abc/extra',
  ])('rejects an invalid folder input: %s', (input) => {
    expect(extractFolderId(input)).toBeNull();
  });
});
