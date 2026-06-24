import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { TextPdfExtractor } from './TextPdfExtractor';
import { MockOcrExtractor } from './MockOcrExtractor';
import { OcrService } from './OcrService';
import { DATA } from '../utils/paths';
import type { IncomingFile } from '../pipeline/InvoicePipeline';

const SAMPLES = path.join(DATA.root, 'input-samples');

function file(fileName: string): IncomingFile {
  const filePath = path.join(SAMPLES, fileName);
  return { fileName, filePath, buffer: readFileSync(filePath) };
}

test('TextPdfExtractor: faktura-A — fields read + normalized', async () => {
  const r = await TextPdfExtractor.extract(file('faktura-A.pdf'));
  assert.equal(r.documentType, 'FAKTURA');
  assert.equal(r.data.invoiceNumber?.normalizedValue, '2024010');
  assert.equal(r.data.variableSymbol?.normalizedValue, '2024010');
  assert.equal(r.data.supplierIco?.normalizedValue, '25896314'); // supplier's IČ, not odběratel's
  assert.equal(r.data.issueDate?.normalizedValue, '2024-03-15'); // DD.MM.YYYY -> ISO
  assert.equal(r.data.dueDate?.normalizedValue, '2024-03-29');
  assert.equal(r.data.totalAmount?.normalizedValue, 24200);
  assert.equal(r.data.currency?.normalizedValue, 'CZK');
  assert.equal(r.data.bankCode?.normalizedValue, '0800');
  assert.equal(r.data.supplier?.normalizedValue, 'Kovo Novák s.r.o.');
  assert.ok(r.rawText && r.rawText.length > 0, 'text PDF yields raw text');
  assert.ok(r.overallConfidence > 0.5, 'clean invoice -> decent confidence');
});

test('TextPdfExtractor: faktura-B — different supplier + amount', async () => {
  const r = await TextPdfExtractor.extract(file('faktura-B.pdf'));
  assert.equal(r.data.invoiceNumber?.normalizedValue, '7700321');
  assert.equal(r.data.supplierIco?.normalizedValue, '49710355');
  assert.equal(r.data.totalAmount?.normalizedValue, 8470.5);
});

test('TextPdfExtractor: confidence is honest, never fabricated 1.0 (§18)', async () => {
  const r = await TextPdfExtractor.extract(file('faktura-A.pdf'));
  const present = Object.values(r.data).filter(Boolean); // absent fields are undefined
  assert.ok(present.length > 0);
  for (const v of present) {
    assert.ok(v!.confidence > 0 && v!.confidence <= 0.9, `confidence in (0, 0.9]: ${v!.confidence}`);
  }
});

test('MockOcrExtractor: faktura-C-scan — incomplete, low confidence', async () => {
  const r = await MockOcrExtractor.extract(file('faktura-C-scan.pdf'));
  assert.equal(r.documentType, 'NEZNAMY'); // scan we can't reliably type (§6)
  assert.equal(r.rawText, null); // scan has no text layer
  assert.equal(r.data.totalAmount?.normalizedValue, null); // missing -> null, not guessed
  assert.ok(r.overallConfidence < 0.5, 'scan -> low confidence drives Day 4 to NEPRECTENO');
});

test('OcrService facade: routes scan-with-fixture to mock, text PDF to pdf-parse', async () => {
  const scan = await OcrService.extract(file('faktura-C-scan.pdf'));
  assert.equal(scan.rawText, null, 'fixture present -> MockOcrExtractor (no raw text)');

  const textPdf = await OcrService.extract(file('faktura-A.pdf'));
  assert.ok(textPdf.rawText && textPdf.rawText.length > 0, 'no fixture -> TextPdfExtractor');
});
