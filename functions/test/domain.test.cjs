const { test } = require('node:test');
const assert = require('node:assert/strict');
const { phoneKey, businessDate, validDate, money } = require('../domain.cjs');
test('phone uniqueness ignores punctuation, without storing a phone as document ID', () => {
    assert.equal(phoneKey('11 1234-5678'), phoneKey('1112345678'));
    assert.equal(phoneKey('1112345678').length, 64);
});
test('cash date uses Argentina time at UTC midnight', () => {
    assert.equal(businessDate(new Date('2026-09-16T01:00:00Z')), '2026-09-15');
    assert.equal(businessDate(new Date('2026-09-16T03:01:00Z')), '2026-09-16');
});
test('reject impossible booking dates and non-finite prices', () => {
    assert.equal(validDate('2026-02-30'), false);
    assert.equal(validDate('2028-02-29'), true);
    assert.throws(() => money(Infinity));
    assert.throws(() => money(-1));
    assert.equal(money(18000.125), 18000.13);
});
