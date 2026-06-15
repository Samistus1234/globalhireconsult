'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const lo = require('../js/home-openings.js');

const DAY = 86400000;

test('escHtml escapes HTML-significant characters', () => {
  assert.strictEqual(lo.escHtml('<b>"x" & \'y\'</b>'),
    '&lt;b&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/b&gt;');
  assert.strictEqual(lo.escHtml(null), '');
  assert.strictEqual(lo.escHtml(undefined), '');
});

test('isNew: true within 14 days, false outside, false for bad input', () => {
  const now = 1_000 * DAY;
  assert.strictEqual(lo.isNew(new Date(now - 5 * DAY).toISOString(), now), true);
  assert.strictEqual(lo.isNew(new Date(now - 13 * DAY).toISOString(), now), true);
  assert.strictEqual(lo.isNew(new Date(now - 14 * DAY).toISOString(), now), true);
  assert.strictEqual(lo.isNew(new Date(now - 20 * DAY).toISOString(), now), false);
  assert.strictEqual(lo.isNew('', now), false);
  assert.strictEqual(lo.isNew('not-a-date', now), false);
});

test('salaryText falls back to Competitive', () => {
  assert.strictEqual(lo.salaryText({ salary_display: 'Tax-Free $8k' }), 'Tax-Free $8k');
  assert.strictEqual(lo.salaryText({ salary_display: '' }), 'Competitive');
  assert.strictEqual(lo.salaryText({}), 'Competitive');
});

test('slidesPerView: 3 desktop, 2 tablet, 1 mobile', () => {
  assert.strictEqual(lo.slidesPerView(1200), 3);
  assert.strictEqual(lo.slidesPerView(992), 3);
  assert.strictEqual(lo.slidesPerView(800), 2);
  assert.strictEqual(lo.slidesPerView(640), 2);
  assert.strictEqual(lo.slidesPerView(400), 1);
});

test('pageCount rounds up and guards zero', () => {
  assert.strictEqual(lo.pageCount(9, 3), 3);
  assert.strictEqual(lo.pageCount(7, 3), 3);
  assert.strictEqual(lo.pageCount(2, 3), 1);
  assert.strictEqual(lo.pageCount(0, 3), 0);
  assert.strictEqual(lo.pageCount(5, 0), 0);
});

test('cardHtml renders fields, escapes, NEW pill, salary fallback, jobs.html link', () => {
  const now = 1_000 * DAY;
  const html = lo.cardHtml({
    title: 'Derm <ologist>',
    employer_name: 'Acme & Co',
    destination_country: 'Qatar',
    specialty: 'Dermatology',
    salary_display: '',
    created_at: new Date(now - 2 * DAY).toISOString(),
  }, now);
  assert.match(html, /Derm &lt;ologist&gt;/);
  assert.match(html, /Acme &amp; Co/);
  assert.match(html, /Qatar/);
  assert.match(html, /Dermatology/);
  assert.match(html, /lo-tag">Dermatology/);
  assert.match(html, /Competitive/);
  assert.match(html, /lo-pill">NEW/);
  assert.match(html, /href="jobs\.html"/);

  const old = lo.cardHtml({
    title: 'Nurse', employer_name: 'X', destination_country: 'Saudi',
    specialty: '', salary_display: '$5k',
    created_at: new Date(now - 30 * DAY).toISOString(),
  }, now);
  assert.doesNotMatch(old, /lo-pill/);
  assert.doesNotMatch(old, /lo-tag/);
  assert.match(old, /\$5k/);
});
