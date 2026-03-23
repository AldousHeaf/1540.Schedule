const express = require('express');
const path = require('path');
const fs = require('fs').promises;

const { buildSchedule } = require('./scheduler.js');

const app = express();
const PORT = 3000;

const DF = path.join(__dirname, 'data.json');
const PIT_RL = ['Pits', 'Pit Lead'];

app.use(express.static('public'));

let schC = null; // sched cache

function clrCfgC() {
  delete require.cache[require.resolve('./config.js')];
  try { delete require.cache[require.resolve('./requirements.js')]; } catch (_) {}
}

function ldCfg() {
  clrCfgC();
  return require('./config.js');
}

async function bldSav(cfg) {
  const sch = await buildSchedule(cfg);
  await fs.writeFile(DF, JSON.stringify({ schedule: sch }, null, 2));
  return sch;
}

async function ldSch() {
  const cfg = ldCfg();

  if (cfg.useCachedSchedule) {
    try {
      const raw = await fs.readFile(DF, 'utf8');
      const d = JSON.parse(raw);
      schC = d.schedule || d;
      return schC;
    } catch (_) {
      schC = await bldSav(cfg);
      return schC;
    }
  }

  schC = await bldSav(cfg);
  return schC;
}

function shNm(n) {
  if (!n) return '';

  if (n.includes('@')) {
    const l = n.split('@')[0] || '';
    if (!l.length) return n;
    if (l.length === 1) return l.toUpperCase();

    const fi = l[l.length - 1].toUpperCase();
    const lr = l.slice(0, -1);
    const ln = lr.charAt(0).toUpperCase() + lr.slice(1);
    return `${fi} ${ln}`;
  }

  const p = n.trim().split(/\s+/);
  if (p.length < 2) return p[0] || n;
  return p[0] + ' ' + (p[1][0] || '').toUpperCase() + '.';
}

function blk2Min(br) {
  const [st, en] = (br || '').split('-').map((s) => s.trim());
  const [sh, sm] = (st || '0:00').split(':').map(Number);
  const [eh, em] = (en || '0:00').split(':').map(Number);
  return { st: (sh || 0) * 60 + (sm || 0), en: (eh || 0) * 60 + (em || 0) };
}

function empPits() {
  return { dataAsOfTime: Date.now(), timeRange: null, leads: [], people: [] };
}

app.use(async (_req, _res, next) => {
  if (schC === null) await ldSch();
  next();
});

app.get('/api/schedule', (_req, res) => {
  try {
    const cfg = require('./config.js'); // no cache clear here on purpose
    res.json({ useCachedSchedule: !!cfg.useCachedSchedule, ...schC });
  } catch (_) {
    res.status(500).json({ error: 'Failed to load schedule' });
  }
});

app.get('/api/regenerate', async (_req, res) => {
  try {
    schC = await ldSch();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/currentPits', (req, res) => {
  try {
    const dI = parseInt(req.query.day, 10);
    const d = schC && schC.days && !isNaN(dI)
      ? schC.days[dI]
      : (schC && schC.days && schC.days[0]) || null;

    if (!d || !d.timeBlocks || !d.people) return res.status(200).json(empPits());

    const now = new Date();
    const nowM = now.getHours() * 60 + now.getMinutes();

    let bI = -1;
    let tr = null;

    for (let i = 0; i < d.timeBlocks.length; i++) {
      const m = blk2Min(d.timeBlocks[i]);
      if (nowM >= m.st && nowM < m.en) {
        bI = i;
        tr = d.timeBlocks[i];
        break;
      }
    }

    if (bI < 0) return res.status(200).json(empPits());

    const lds = [];
    const ppl = [];

    for (const p of d.people) {
      const rl = (p.schedule || [])[bI];
      if (!rl || !PIT_RL.includes(rl)) continue;
      if (rl === 'Pit Lead') lds.push(shNm(p.name));
      else ppl.push(shNm(p.name));
    }

    // had separate payload var before, didnt need it
    res.status(200).json({ dataAsOfTime: Date.now(), timeRange: tr, leads: lds, people: ppl });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.listen(PORT, async () => {
  await ldSch();
  console.log('http://localhost:' + PORT);
});
