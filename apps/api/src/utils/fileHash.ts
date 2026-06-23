import { createHash } from 'node:crypto';

// SHA-256 of file content. Storage-agnostic: hashes bytes, never touches the FS.
export function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}
