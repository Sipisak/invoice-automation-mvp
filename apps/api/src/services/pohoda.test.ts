import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDataPack, type PohodaItem } from './PohodaXmlExportService';

const COMPANY = { name: 'Montáže Dvořák a.s.', ico: '27654321' };

// faktura-A shape: domestic, 21 % VAT, CZK, gross 24200.
const czkHigh: PohodaItem = {
  supplier: 'Kovo Novák s.r.o.',
  supplierIco: '25896314',
  invoiceNumber: '2024010',
  variableSymbol: '2024010',
  issueDate: '2024-03-15',
  taxDate: '2024-03-15',
  dueDate: '2024-03-29',
  currency: 'CZK',
  totalAmount: 24200,
  vatRate: '21',
  accountingPredefinition: '1Fp',
  vatClassification: 'UN',
};

// Meta/TRONEXO shape: reverse charge (vatRate none) + foreign currency (EUR). The §9 branch no
// fixture exercises — and the one most likely to be coded wrong.
const eurNone: PohodaItem = {
  supplier: 'Meta Platforms Ireland Limited',
  invoiceNumber: 'FBADS-123',
  currency: 'EUR',
  totalAmount: 100,
  rate: 25,
  vatRate: 'none',
  accountingPredefinition: '2Fp',
  vatClassification: 'PDslRegEU',
};

test('§9: dataPack root carries the accounting unit IČO + the three namespaces', () => {
  const xml = buildDataPack(COMPANY, [czkHigh]);
  assert.match(xml, /<dat:dataPack[^>]*\bico="27654321"/);
  assert.match(xml, /xmlns:dat=/);
  assert.match(xml, /xmlns:inv=/);
  assert.match(xml, /xmlns:typ=/);
  assert.match(xml, /<dat:dataPackItem[^>]*\bid="item-1"/);
});

test('§9: supplier doc number uses inv:originalDocument — NEVER inv:number / originalDocumentNumber', () => {
  const xml = buildDataPack(COMPANY, [czkHigh]);
  assert.match(xml, /<inv:originalDocument>2024010<\/inv:originalDocument>/);
  assert.doesNotMatch(xml, /<inv:number>/);
  assert.doesNotMatch(xml, /<inv:originalDocumentNumber>/);
  assert.doesNotMatch(xml, /typeServiceMOSS/);
});

test('§9: 21 % CZK -> base in typ:priceHigh, gross only in priceHighSum (no re-tax on import)', () => {
  const xml = buildDataPack(COMPANY, [czkHigh]);
  assert.match(xml, /<inv:homeCurrency>/);
  assert.doesNotMatch(xml, /foreignCurrency/);
  assert.match(xml, /<typ:priceHigh>20000\.00<\/typ:priceHigh>/); // base, NOT 24200
  assert.match(xml, /<typ:priceHighVAT>4200\.00<\/typ:priceHighVAT>/);
  assert.match(xml, /<typ:priceHighSum>24200\.00<\/typ:priceHighSum>/);
  assert.doesNotMatch(xml, /<typ:priceHigh>24200/); // gross must never be the base
});

test('§9: amounts/currency are in the typ: namespace, not inv:', () => {
  const xml = buildDataPack(COMPANY, [eurNone]);
  assert.doesNotMatch(xml, /<inv:priceNone>|<inv:priceHigh|<inv:currency>|<inv:rate>|<inv:amount>/);
});

test('§9 HARD branch: none-rate -> typ:priceNone, never priceHigh*', () => {
  const xml = buildDataPack(COMPANY, [eurNone]);
  assert.match(xml, /<typ:priceNone>100\.00<\/typ:priceNone>/);
  assert.doesNotMatch(xml, /priceHigh/);
});

test('§9 HARD branch: foreign currency appears in item + summary, NEVER in the header', () => {
  const xml = buildDataPack(COMPANY, [eurNone]);
  // header must be clean of foreignCurrency
  const header = xml.slice(xml.indexOf('<inv:invoiceHeader>'), xml.indexOf('</inv:invoiceHeader>'));
  assert.doesNotMatch(header, /foreignCurrency/);
  // but it must be present in detail and summary
  const detail = xml.slice(xml.indexOf('<inv:invoiceDetail>'), xml.indexOf('</inv:invoiceDetail>'));
  const summary = xml.slice(xml.indexOf('<inv:invoiceSummary>'), xml.indexOf('</inv:invoiceSummary>'));
  assert.match(detail, /<inv:foreignCurrency>/);
  assert.match(summary, /<inv:foreignCurrency>/);
  assert.match(xml, /<typ:currency>/);
  assert.match(xml, /<typ:ids>EUR<\/typ:ids>/);
  assert.match(xml, /<typ:rate>25\.00<\/typ:rate>/);
});

test('multiple items -> unique dataPackItem ids', () => {
  const xml = buildDataPack(COMPANY, [czkHigh, eurNone]);
  assert.match(xml, /id="item-1"/);
  assert.match(xml, /id="item-2"/);
});
