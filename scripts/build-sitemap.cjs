'use strict';
/**
 * Builds sitemap.xml for globalhire.elabsolution.org.
 *
 * Run:  node scripts/build-sitemap.cjs        (writes ./sitemap.xml)
 *
 * The site is static, so the list of public pages is explicit. Pages behind sign-in
 * (anything that loads js/auth-guard.js), admin screens, dashboards and the noindex
 * campaign landing pages are deliberately NOT listed. Add a page here when it is public.
 *
 * URLs use the clean form (no .html) because vercel.json sets cleanUrls and 308-redirects
 * the .html form. <lastmod> is the date of the last git commit that touched the file, so it
 * only changes when the page does. Scholarship detail pages are one template
 * (scholarship-detail.html?id=<slug>); one URL per slug in data/scholarship-details.js.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const ORIGIN = 'https://globalhire.elabsolution.org';

// Public marketing / information pages (file name without .html, priority).
const PUBLIC_PAGES = [
  ['index', 1.0],
  ['jobs', 0.9],
  ['for-candidates', 0.9],
  ['for-employers', 0.8],
  ['licensing', 0.8],
  ['visa', 0.8],
  ['scholarships', 0.8],
  ['salary-calculator', 0.8],
  ['relocation-cost-calculator', 0.8],
  ['saudi-openings-nov2026-five', 0.7],
  ['elab-complete', 0.7],
  ['elab-complete-booking', 0.5],
  ['relocation', 0.6],
  ['settling-in', 0.6],
  ['job-hunting', 0.6],
  ['guides', 0.6],
  ['events', 0.6],
  ['platform', 0.5],
  ['faq', 0.6],
  ['about', 0.5],
  ['contact', 0.5],
  ['compliance', 0.4],
  ['visa-about', 0.6],
  ['visa-umrah', 0.6],
  ['visa-family-residence', 0.6],
  ['visa-family-visit', 0.6],
  ['visa-tourist-evisa', 0.6],
  ['privacy', 0.2],
  ['terms', 0.2],
  ['cookies', 0.2],
];

function lastmod(file) {
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%cs', '--', file], {
      cwd: ROOT,
      encoding: 'utf8',
    }).trim();
    if (out) return out;
  } catch (e) {
    /* fall through */
  }
  return new Date().toISOString().slice(0, 10);
}

function scholarshipSlugs() {
  const src = fs.readFileSync(path.join(ROOT, 'data', 'scholarship-details.js'), 'utf8');
  const slugs = [];
  const re = /^ {2}"([a-z0-9-]+)": \{/gm;
  let m;
  while ((m = re.exec(src))) slugs.push(m[1]);
  return slugs;
}

function entries() {
  const list = [];
  for (const [name, priority] of PUBLIC_PAGES) {
    const file = name + '.html';
    if (!fs.existsSync(path.join(ROOT, file))) {
      throw new Error('Public page listed but file is missing: ' + file);
    }
    const loc = name === 'index' ? ORIGIN + '/' : ORIGIN + '/' + name;
    list.push({ loc, lastmod: lastmod(file), priority });
  }
  const detailMod = lastmod('data/scholarship-details.js');
  for (const slug of scholarshipSlugs()) {
    list.push({
      loc: ORIGIN + '/scholarship-detail?id=' + slug,
      lastmod: detailMod,
      priority: 0.5,
    });
  }
  return list;
}

function build() {
  const rows = entries()
    .map(
      (e) =>
        '  <url>\n' +
        '    <loc>' + e.loc + '</loc>\n' +
        '    <lastmod>' + e.lastmod + '</lastmod>\n' +
        '    <priority>' + e.priority.toFixed(1) + '</priority>\n' +
        '  </url>'
    )
    .join('\n');
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    rows +
    '\n</urlset>\n'
  );
}

if (require.main === module) {
  fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), build());
  console.log('sitemap.xml written: ' + entries().length + ' URLs');
}

module.exports = { build, entries, PUBLIC_PAGES, scholarshipSlugs };
