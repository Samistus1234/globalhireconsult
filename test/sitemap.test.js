'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const sm = require('../scripts/build-sitemap.cjs');

const ROOT = path.join(__dirname, '..');

test('every listed page exists and is not auth-guarded or noindex', () => {
  for (const [name] of sm.PUBLIC_PAGES) {
    const html = fs.readFileSync(path.join(ROOT, name + '.html'), 'utf8');
    assert.ok(!/auth-guard/.test(html), name + ' loads auth-guard (signed-in page)');
    assert.ok(!/noindex/i.test(html), name + ' is noindex');
  }
});

test('one scholarship detail URL per slug', () => {
  const slugs = sm.scholarshipSlugs();
  assert.ok(slugs.length >= 50, 'expected the compiled detail set, got ' + slugs.length);
  const xml = sm.build();
  for (const s of slugs) assert.ok(xml.includes('scholarship-detail?id=' + s + '<'), s);
});

test('sitemap.xml on disk matches the generator (run: node scripts/build-sitemap.cjs)', () => {
  const onDisk = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
  assert.strictEqual(onDisk, sm.build());
});

test('no duplicate URLs and all use the production origin', () => {
  const locs = sm.entries().map((e) => e.loc);
  assert.strictEqual(new Set(locs).size, locs.length);
  for (const l of locs) assert.ok(l.startsWith('https://globalhire.elabsolution.org/'), l);
});

test('robots.txt points at the sitemap and does not block listed pages', () => {
  const robots = fs.readFileSync(path.join(ROOT, 'robots.txt'), 'utf8');
  assert.ok(robots.includes('Sitemap: https://globalhire.elabsolution.org/sitemap.xml'));
  const disallows = robots
    .split('\n')
    .filter((l) => l.startsWith('Disallow:'))
    .map((l) => l.replace('Disallow:', '').trim())
    .filter(Boolean);
  for (const [name] of sm.PUBLIC_PAGES) {
    const p = name === 'index' ? '/' : '/' + name;
    for (const d of disallows) {
      assert.ok(!p.startsWith(d), p + ' is blocked by Disallow: ' + d);
    }
  }
});
