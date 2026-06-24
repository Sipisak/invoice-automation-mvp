import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ValidationService } from './ValidationService';
import { classifyInvoice } from './ClassificationService';
import { RuleMatchingService } from './RuleMatchingService';
import { extracted } from '../types/ExtractedValue';
import type { ExtractedInvoiceData } from '../types/invoice';

// A fully readable, high-confidence domestic invoice (mirrors faktura-A's extracted shape),
// including the §6 payment tier (dueDate + account/code + IBAN).
function completeData(): ExtractedInvoiceData {
  return {
    ourCompany: extracted('Montáže Dvořák a.s.', 'Montáže Dvořák a.s.', 0.8),
    supplier: extracted('Kovo Novák s.r.o.', 'Kovo Novák s.r.o.', 0.8),
    invoiceNumber: extracted('2024010', '2024010', 0.9),
    variableSymbol: extracted('2024010', '2024010', 0.9),
    issueDate: extracted('15.03.2024', '2024-03-15', 0.9),
    dueDate: extracted('29.03.2024', '2024-03-29', 0.9),
    totalAmount: extracted('24 200,00', 24200, 0.9),
    currency: extracted('Kč', 'CZK', 0.7),
    supplierIco: extracted('25896314', '25896314', 0.9),
    bankAccount: extracted('1234567890', '1234567890', 0.9),
    bankCode: extracted('0800', '0800', 0.9),
    iban: extracted('CZ65 0800 0000 0012 3456 7890', 'CZ65 0800 0000 0012 3456 7890', 0.9),
  };
}

test('ValidationService: complete high-confidence faktura -> no missing, not low-confidence', () => {
  const r = ValidationService.validate(completeData(), 'FAKTURA');
  assert.deepEqual(r.missingFields, []);
  assert.equal(r.lowConfidence, false);
});

test('ValidationService: missing totalAmount is reported', () => {
  const data = completeData();
  delete data.totalAmount;
  assert.ok(ValidationService.validate(data, 'FAKTURA').missingFields.includes('totalAmount'));
});

test('ValidationService: null normalizedValue counts as missing (not a read)', () => {
  const data = completeData();
  data.issueDate = extracted<string>('20I.03.2O24', null, 0.2); // read but unparseable
  assert.ok(ValidationService.validate(data, 'FAKTURA').missingFields.includes('issueDate'));
});

test('ValidationService: §10 forbidden supplier name -> supplier missing', () => {
  const data = completeData();
  data.supplier = extracted('Odběratel', 'Odběratel', 0.8);
  assert.ok(ValidationService.validate(data, 'FAKTURA').missingFields.includes('supplier'));
});

test('ValidationService: §6 VS derivable from invoice number -> not missing', () => {
  const data = completeData();
  delete data.variableSymbol;
  assert.ok(!ValidationService.validate(data, 'FAKTURA').missingFields.includes('variableSymbol'));
});

test('ValidationService: low confidence on a present required field is flagged', () => {
  const data = completeData();
  data.totalAmount = extracted('24 200,00', 24200, 0.3); // present but shaky
  assert.equal(ValidationService.validate(data, 'FAKTURA').lowConfidence, true);
});

test('ValidationService: §6 payable faktura missing payment fields -> dueDate + bankAccount/iban missing', () => {
  const data = completeData();
  delete data.dueDate;
  delete data.bankAccount;
  delete data.bankCode;
  delete data.iban;
  const missing = ValidationService.validate(data, 'FAKTURA').missingFields;
  assert.ok(missing.includes('dueDate'));
  assert.ok(missing.includes('bankAccount/iban'));
});

test('ValidationService: IBAN alone satisfies the payment tier (no account+code needed)', () => {
  const data = completeData();
  delete data.bankAccount;
  delete data.bankCode; // IBAN remains
  assert.ok(!ValidationService.validate(data, 'FAKTURA').missingFields.includes('bankAccount/iban'));
});

test('ValidationService: payment tier NOT enforced for non-payable doc type (objednávka)', () => {
  const data = completeData();
  delete data.dueDate;
  delete data.bankAccount;
  delete data.bankCode;
  delete data.iban;
  const missing = ValidationService.validate(data, 'OBJEDNAVKA').missingFields;
  assert.ok(!missing.includes('dueDate'));
  assert.ok(!missing.includes('bankAccount/iban'));
});

test('RuleMatchingService: matches faktura-A supplier, misses faktura-B supplier', () => {
  const matched = RuleMatchingService.match(completeData());
  assert.equal(matched?.id, 'rule-kovo-novak');

  const noRule = completeData();
  noRule.supplierIco = extracted('49710355', '49710355', 0.9); // faktura-B supplier
  assert.equal(RuleMatchingService.match(noRule), null);
});

// classifyInvoice — the §6 conservative order, isolated from DB/OCR.
const ok = { missingFields: [], lowConfidence: false };
const rule = { id: 'rule-kovo-novak', supplierIco: '25896314', vatClassification: 'UN', accountingPredefinition: '1Fp' };

test('classify: hard-duplicate wins over everything -> DUPLICITA, routes nowhere', () => {
  const r = classifyInvoice({ isHardDuplicate: true, validation: ok, rule, documentType: 'FAKTURA' });
  assert.equal(r.businessStatus, 'DUPLICITA');
  assert.deepEqual([r.routing.toPohoda, r.routing.toIntranet], [false, false]);
});

test('classify: missing field -> NEPRECTENO_NEUPLNE even if a rule exists', () => {
  const r = classifyInvoice({
    isHardDuplicate: false,
    validation: { missingFields: ['totalAmount'], lowConfidence: false },
    rule,
    documentType: 'NEZNAMY',
  });
  assert.equal(r.businessStatus, 'NEPRECTENO_NEUPLNE');
  assert.deepEqual([r.routing.toPohoda, r.routing.toIntranet], [false, false]);
});

test('classify: readable but no rule -> DOPLNIT_PRAVIDLO (routing still computed)', () => {
  const r = classifyInvoice({ isHardDuplicate: false, validation: ok, rule: null, documentType: 'FAKTURA' });
  assert.equal(r.businessStatus, 'DOPLNIT_PRAVIDLO');
  assert.deepEqual([r.routing.toPohoda, r.routing.toIntranet], [true, true]);
});

test('classify: complete + rule -> K_ODSOUHLASENI, routes to Pohoda + Intranet', () => {
  const r = classifyInvoice({ isHardDuplicate: false, validation: ok, rule, documentType: 'FAKTURA' });
  assert.equal(r.businessStatus, 'K_ODSOUHLASENI');
  assert.deepEqual([r.routing.toPohoda, r.routing.toIntranet], [true, true]);
});

test('classify §11: objednávka routes to Intranet only', () => {
  const r = classifyInvoice({ isHardDuplicate: false, validation: ok, rule, documentType: 'OBJEDNAVKA' });
  assert.deepEqual([r.routing.toPohoda, r.routing.toIntranet], [false, true]);
});
