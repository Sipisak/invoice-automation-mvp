import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCzechAmount } from './moneyParser';

test('parseCzechAmount: Czech format (space thousands, comma decimal)', () => {
  assert.equal(parseCzechAmount('24 200,00'), 24200);
  assert.equal(parseCzechAmount('8 470,50'), 8470.5);
  assert.equal(parseCzechAmount('1234,56'), 1234.56);
});

test('parseCzechAmount: strips currency words/symbols', () => {
  assert.equal(parseCzechAmount('24 200,00 Kč'), 24200);
  assert.equal(parseCzechAmount('1 000 CZK'), 1000);
  assert.equal(parseCzechAmount('12,50 €'), 12.5);
});

test('parseCzechAmount: dot thousands + comma decimal (1.234,56)', () => {
  assert.equal(parseCzechAmount('1.234,56'), 1234.56);
  assert.equal(parseCzechAmount('1.234.567,89'), 1234567.89);
});

test('parseCzechAmount: anglo format (comma thousands, dot decimal)', () => {
  assert.equal(parseCzechAmount('1,234.56'), 1234.56);
});

test('parseCzechAmount: plain integers and dot-decimals', () => {
  assert.equal(parseCzechAmount('1234'), 1234);
  assert.equal(parseCzechAmount('1234.5'), 1234.5);
});

test('parseCzechAmount: NBSP / narrow-NBSP thousands separator', () => {
  assert.equal(parseCzechAmount('24\u00A0200,00'), 24200); // U+00A0 non-breaking space
  assert.equal(parseCzechAmount('24\u202F200,00'), 24200); // U+202F narrow no-break space
});

test('parseCzechAmount: unparseable / empty -> null (never guess, §0)', () => {
  assert.equal(parseCzechAmount(''), null);
  assert.equal(parseCzechAmount('Kč'), null);
  assert.equal(parseCzechAmount('abc'), null);
  assert.equal(parseCzechAmount(null), null);
  assert.equal(parseCzechAmount(undefined), null);
});
