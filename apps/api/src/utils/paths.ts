import path from 'node:path';

// `func start` runs with cwd = apps/api, so data/ resolves correctly.
// ponytail: local FS layout; in prod the storage adapter targets SharePoint/blob.
const root = path.join(process.cwd(), 'data');

export const DATA = {
  root,
  input: path.join(root, 'input'),
  processed: path.join(root, 'processed'),
  archive: path.join(root, 'archive'),
  output: path.join(root, 'output'),
  mockOcr: path.join(root, 'mock-ocr'), // fixture JSON for scanned docs (MockOcrExtractor)
};
