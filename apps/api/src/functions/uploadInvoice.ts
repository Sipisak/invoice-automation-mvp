import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { BatchRepository } from '../repositories/BatchRepository';
import { InvoicePipeline } from '../pipeline/InvoicePipeline';
import { sha256 } from '../utils/fileHash';
import { DATA } from '../utils/paths';
import { logger } from '../utils/logger';

// POST /api/invoices/upload
// Accepts a multipart 'file' field, or a raw body + ?fileName= (handy for curl).
export async function uploadInvoice(
  req: HttpRequest,
  _ctx: InvocationContext,
): Promise<HttpResponseInit> {
  let fileName: string | undefined;
  let buffer: Buffer | undefined;

  const contentType = req.headers.get('content-type') ?? '';
  if (contentType.includes('multipart/form-data')) {
    const form = await req.formData();
    // `as unknown`: File isn't a TS global without the DOM lib; we only need the Blob API.
    const entry = form.get('file') as unknown;
    if (entry && typeof entry === 'object' && 'arrayBuffer' in entry) {
      const blob = entry as { name?: string; arrayBuffer(): Promise<ArrayBuffer> };
      fileName = blob.name ?? 'upload.bin';
      buffer = Buffer.from(await blob.arrayBuffer());
    }
  } else {
    const body = Buffer.from(await req.arrayBuffer());
    if (body.length) {
      buffer = body;
      fileName = req.query.get('fileName') ?? 'upload.bin';
    }
  }

  if (!buffer || buffer.length === 0 || !fileName) {
    return {
      status: 400,
      jsonBody: { error: "no file (use multipart 'file' field or raw body + ?fileName=)" },
    };
  }

  // Storage adapter (§3): place the file at its final location BEFORE the pipeline.
  // Content-hash name = idempotent (identical content → one physical copy).
  const fileHash = sha256(buffer);
  await mkdir(DATA.processed, { recursive: true });
  const filePath = path.join(DATA.processed, `${fileHash}_${fileName}`);
  await writeFile(filePath, buffer);

  // One upload = one batch (§3).
  const batch = await BatchRepository.create('upload');
  const invoice = await InvoicePipeline.run({ fileName, filePath, buffer }, batch.id);

  // 202 Accepted (§13.7): heavy processing (OCR) will run later in the pipeline (Day 3).
  logger.info(`upload: ${fileName} -> invoice ${invoice.id}`);
  return { status: 202, jsonBody: { id: invoice.id, businessStatus: invoice.businessStatus } };
}

app.http('uploadInvoice', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'invoices/upload',
  handler: uploadInvoice,
});
