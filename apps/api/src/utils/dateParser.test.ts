import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCzechDate } from './dateParser';

test('parseCzechDate: DD.MM.YYYY -> ISO', () => {
  assert.equal(parseCzechDate('15.03.2024'), '2024-03-15');
  assert.equal(parseCzechDate('2.4.2024'), '2024-04-02'); // single-digit day/month
  assert.equal(parseCzechDate('01. 02. 2024'), '2024-02-01'); // spaces around dots
});

test('parseCzechDate: already-ISO passes through', () => {
  assert.equal(parseCzechDate('2024-12-31'), '2024-12-31');
});

test('parseCzechDate: invalid calendar dates -> null (never guess, §0)', () => {
  assert.equal(parseCzechDate('32.01.2024'), null);
  assert.equal(parseCzechDate('15.13.2024'), null);
  assert.equal(parseCzechDate('29.02.2023'), null); // not a leap year
});

test('parseCzechDate: leap day valid', () => {
  assert.equal(parseCzechDate('29.02.2024'), '2024-02-29');
});

test('parseCzechDate: unparseable / empty -> null', () => {
  assert.equal(parseCzechDate('20I.03.2O24'), null); // OCR garble (letters)
  assert.equal(parseCzechDate('not a date'), null);
  assert.equal(parseCzechDate(''), null);
  assert.equal(parseCzechDate(null), null);
  assert.equal(parseCzechDate(undefined), null);
});
