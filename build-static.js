#!/usr/bin/env node
/**
 * One-shot build: run the scheduler, write data.json + schedule CSV + static site in docs/.
 * Then push docs/ to GitHub and enable Pages from /docs — no server on the live site.
 */
const fs = require('fs').promises;
const path = require('path');

const { buildSchedule } = require('./scheduler.js');

const ROOT = __dirname;
const DOCS = path.join(ROOT, 'docs');
const DATA_FILE = path.join(ROOT, 'data.json');

function escapeCsvCell(s) {
  const str = String(s == null ? '' : s);
  if (/[",\n\r]/.test(str)) return '"' + str.replace(/"/g, '""') + '"';
  return str;
}

async function main() {
  delete require.cache[require.resolve('./config.js')];
  try { delete require.cache[require.resolve('./requirements.js')]; } catch (_) {}
  const config = require('./config.js');

  console.log('Building schedule...');
  const schedule = await buildSchedule(config);
  const days = schedule.days || [];

  await fs.writeFile(DATA_FILE, JSON.stringify({ schedule }, null, 2));
  console.log('Wrote', DATA_FILE);

  const scheduleCsvPath = path.join(ROOT, 'schedule.csv');
  const csvRows = [];
  for (const day of days) {
    const blocks = day.timeBlocks || [];
    const header = ['Day', 'Name', ...blocks];
    csvRows.push(header.map(escapeCsvCell).join(','));
    for (const p of day.people || []) {
      const row = [day.label || 'Day', p.name || '', ...(p.schedule || []).map((s) => s || 'Open')];
      csvRows.push(row.map(escapeCsvCell).join(','));
    }
  }
  if (csvRows.length) {
    await fs.writeFile(scheduleCsvPath, csvRows.join('\n') + '\n', 'utf8');
    console.log('Wrote', scheduleCsvPath);
  }

  await fs.rm(DOCS, { recursive: true }).catch(() => {});
  await fs.mkdir(DOCS, { recursive: true });

  await fs.writeFile(path.join(DOCS, 'schedule.json'), JSON.stringify({ days }));
  await fs.copyFile(path.join(ROOT, 'public', 'index.html'), path.join(DOCS, 'index.html'));
  await fs.copyFile(path.join(ROOT, 'public', 'schedule.js'), path.join(DOCS, 'schedule.js'));
  await fs.copyFile(path.join(ROOT, 'public', 'styles.css'), path.join(DOCS, 'styles.css'));

  console.log('Static site written to docs/');
  console.log('');
  console.log('Next: commit docs/ and push. Enable GitHub Pages: Settings > Pages > Source: Deploy from branch > Branch: main > Folder: /docs');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
