#!/usr/bin/env node
const fs = require('fs').promises;
const path = require('path');

const { buildSchedule } = require('./scheduler.js');

const RT = __dirname;
const DOCS = path.join(RT, 'docs');
const PUB = path.join(RT, 'public');

const DJSON = path.join(RT, 'data.json');
const OUTCSV = path.join(RT, 'schedule.csv');

const STC = ['index.html', 'admin.html', 'schedule.js', 'styles.css'];

function escCSV(v) {
  const s = String(v == null ? '' : v);
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

async function wrCSV(ds) {
  const rws = [];

  for (const d of ds) {
    const tbs = d.timeBlocks || [];
    rws.push(['Day', 'Name', ...tbs].map(escCSV).join(','));

    for (const p of d.people || []) {
      const rw = [d.label || 'Day', p.name || '', ...(p.schedule || []).map((x) => x || 'Open')];
      rws.push(rw.map(escCSV).join(','));
    }
  }

  if (!rws.length) return;
  await fs.writeFile(OUTCSV, rws.join('\n') + '\n', 'utf8');
  console.log('Wrote', OUTCSV);
}

async function rbDocs(ds, bdm) {
  await fs.rm(DOCS, { recursive: true }).catch(() => {});
  await fs.mkdir(DOCS, { recursive: true });

  await fs.writeFile(path.join(DOCS, 'schedule.json'), JSON.stringify({
    days: ds,
    blockDurationMinutes: bdm || 30,
    builtAt: new Date().toISOString(),
  }));

  for (const f of STC) {
    await fs.copyFile(path.join(PUB, f), path.join(DOCS, f));
  }
}

async function main() {
  // quick hot-reload for cfg tweaks
  delete require.cache[require.resolve('./config.js')];
  try { delete require.cache[require.resolve('./requirements.js')]; } catch (_) {}
  const cfg = require('./config.js');

  console.log('Building schedule...');
  const sch = await buildSchedule(cfg);

  let ds = sch.days || [];
  if (cfg.showOnlyDay != null) ds = ds.filter((_, i) => i === cfg.showOnlyDay);

  await fs.writeFile(DJSON, JSON.stringify({ schedule: sch }, null, 2));
  console.log('Wrote', DJSON);

  await wrCSV(ds);
  await rbDocs(ds, cfg.blockDurationMinutes);

  // old local copy path stuff was here
  // await fs.copyFile(...)

  console.log('Static site in docs/');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
