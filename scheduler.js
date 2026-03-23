const fs = require('fs').promises;
const https = require('https');

/*
  old idea was many random full rebuilds.
  now: build valid first, then optimize with local moves.
*/

const RL = ['Drive', 'Pits', 'Pit Lead', 'Journalist', 'Strategy', 'Media'];
const SCOUT_ROLE = 'Scouting!';

const PL_NAMES = ['Sinead Hough', 'Zachary Rutman', 'Sinead H.', 'Zachary R.', 'Z. Rutman'];
const PL_EMAILS = ['rutmanz@catlin.edu'];

const NO_SCT = ['Quinn Bartlo', 'Crow Jahncke', 'Q. Bartlo', 'C. Jahncke', 'Azalea Colburn', 'A. Colburn', 'Autumn Wilkes', 'Autumn W.'];
const NO_STRAT = [];
const SKIP_NAMES = ['Spencer Tsai', 'Brian Chai', 'Brian C.'];
const DRIVE_NAMES = ['Luna Gonzalez Gonzalez', 'Alvin Zhang', 'David Kong', 'Luna G.', 'Alvin Z.', 'David K.'];

const HARD_PEN = 1000000;
const BURDEN_W = {
  Drive: 5,
  'Pit Lead': 4,
  Pits: 3,
  Strategy: 2,
  Media: 2,
  Journalist: 2,
  'Scouting!': 1.5,
  Open: 0,
};

const isPitLead = (p) => PL_NAMES.includes(p.name) || PL_EMAILS.includes((p.email || '').toLowerCase());

async function fetchNexusMatches(eventKey, apiKey) {
  if (!eventKey || !apiKey) return null;
  const key = (apiKey || process.env.NEXUS_API_KEY || '').trim();
  if (!key) return null;

  return new Promise((resolve) => {
    const url = `https://frc.nexus/api/v1/event/${encodeURIComponent(eventKey)}`;
    const req = https.get(url, { headers: { 'Nexus-Api-Key': key } }, (res) => {
      let buf = '';
      res.on('data', (c) => { buf += c; });
      res.on('end', () => {
        try {
          const data = JSON.parse(buf);
          const matches = data.matches;
          if (Array.isArray(matches) && matches.length > 0) {
            resolve(matches.map((m, i) => m.label || `Match ${i + 1}`));
          } else {
            resolve(null);
          }
        } catch (_) {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(10000, () => { req.destroy(); resolve(null); });
  });
}

function shortName(n) {
  if (!n) return '';
  if (n.includes('@')) {
    const local = n.split('@')[0] || '';
    if (local.length === 0) return n;
    if (local.length === 1) return local.toUpperCase();
    const fi = local[local.length - 1].toUpperCase();
    const lRaw = local.slice(0, -1);
    const ln = lRaw.charAt(0).toUpperCase() + lRaw.slice(1);
    return `${fi} ${ln}`;
  }
  const p = n.trim().split(/\s+/);
  if (p.length < 2) return p[0] || n;
  return p[0] + ' ' + (p[1][0] || '').toUpperCase() + '.';
}

function seededRandom(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleWithSeed(arr, seed) {
  const rng = seededRandom(seed);
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function parseCSV(txt) {
  const rows = [];
  let row = [];
  let cur = '';
  let q = false;

  for (let i = 0; i < txt.length; i++) {
    const c = txt[i];
    if (c === '"') {
      if (q && txt[i + 1] === '"') { cur += '"'; i++; continue; }
      q = !q;
      continue;
    }
    if (!q) {
      if (c === ',') { row.push(cur.trim()); cur = ''; continue; }
      if (c === '\n' || c === '\r') {
        if (c === '\r' && txt[i + 1] === '\n') i++;
        row.push(cur.trim());
        if (row.some((cell) => cell !== '')) rows.push(row);
        row = [];
        cur = '';
        continue;
      }
    }
    cur += c;
  }

  if (cur !== '' || row.length > 0) {
    row.push(cur.trim());
    if (row.some((cell) => cell !== '')) rows.push(row);
  }

  return rows;
}

function genBlks(stT, enT, blkMins) {
  const [sH, sM] = (stT || '0:00').split(':').map(Number);
  const [eH, eM] = (enT || '0:00').split(':').map(Number);
  let m = (sH || 0) * 60 + (sM || 0);
  const end = (eH || 0) * 60 + (eM || 0);
  const blks = [];

  while (m < end) {
    const h = Math.floor(m / 60);
    const min = m % 60;
    const h2 = Math.floor((m + blkMins) / 60);
    const min2 = (m + blkMins) % 60;
    blks.push(`${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}-${String(h2).padStart(2, '0')}:${String(min2).padStart(2, '0')}`);
    m += blkMins;
  }
  return blks;
}

function genBlksWithLunch(startT, endT, blkMins, lunchStartT, lunchEndT) {
  if (!lunchStartT || !lunchEndT) return genBlks(startT, endT, blkMins);
  return genBlks(startT, lunchStartT, blkMins).concat(genBlks(lunchEndT, endT, blkMins));
}

function timeToMins(t) {
  const [h, m] = (t || '0:00').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function blkStartMins(blkStr) {
  const start = blkStr.split('-')[0].trim();
  const [h, m] = start.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function parseSubs(rows, colMap) {
  if (rows.length < 2) return [];
  const hdrs = rows[0].map((h) => (h || '').trim());

  const k2i = {};
  for (const [k, htxt] of Object.entries(colMap)) {
    const idx = hdrs.findIndex((h) => h === htxt || h === k);
    if (idx >= 0) k2i[k] = idx;
  }

  const g = (row, k) => (k2i[k] != null ? (row[k2i[k]] || '').trim() : '');

  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const id = g(row, 'email');
    if (!id) continue;
    if (/^\d+$/.test(id)) continue;

    const email = (id || '').toLowerCase();
    const name = id;

    const wantsPits = /yes|true|1/i.test(g(row, 'wantsPits')) || /true|1/i.test(g(row, 'pit'));
    const otherRolesTxt = (g(row, 'otherRoles') || '').toLowerCase();
    const pitWorkTxt = (g(row, 'pitWorkType') || '').toLowerCase();
    const whichDaysTxt = (g(row, 'whichDays') || '').toLowerCase();

    const wantsMechPit = /true|1/i.test(g(row, 'mechPit')) || /mechanical|fab|design/i.test(pitWorkTxt);
    const wantsCtrlsPit = /true|1/i.test(g(row, 'ctrlsPit')) || /controls/i.test(pitWorkTxt);
    const wantsSwPit = /true|1/i.test(g(row, 'swPit')) || /software/i.test(pitWorkTxt);

    const wantsJournalism = /true|1/i.test(g(row, 'journalism')) || /journalism/i.test(otherRolesTxt);
    const wantsStrategy = /true|1/i.test(g(row, 'strategy')) || /strategy/i.test(otherRolesTxt);
    const wantsMedia = /true|1/i.test(g(row, 'media')) || /media/i.test(otherRolesTxt);

    const driveTeam = /yes|true|1/i.test(g(row, 'driveTeam')) || DRIVE_NAMES.includes(name);

    // legacy var names: friday => day 0, saturday => day 1
    // for this event, day 0 is Saturday and day 1 is Sunday.
    let friday = /true|yes|1/i.test(g(row, 'friday'));
    let saturday = /true|yes|1/i.test(g(row, 'saturday'));
    if (!friday && !saturday && whichDaysTxt) {
      const day0Match = /friday|saturday|3\/6|3\/7|3\/14/i.test(whichDaysTxt);
      const day1Match = /sunday|3\/8|3\/15/i.test(whichDaysTxt);
      friday = day0Match;
      saturday = day1Match;
    }
    if (!friday && !saturday) continue;

    let cannotScout = /yes|true|1/i.test(g(row, 'cannotScout'));
    if (NO_SCT.includes(name)) cannotScout = true;

    out.push({
      name: name || 'Unknown',
      email,
      wantsPits,
      wantsMechPit,
      wantsCtrlsPit,
      wantsSwPit,
      wantsJournalism,
      wantsStrategy,
      wantsMedia,
      driveTeam,
      cannotScout,
      unavailableTimes: g(row, 'unavailableTimes') || g(row, 'timesOfDay'),
      conventionTalks: g(row, 'conventionTalks'),
      friday,
      saturday,
    });
  }

  return out;
}

function loadReq(nBlk) {
  let raw = {};
  try { raw = require('./requirements.js'); } catch (_) {}

  const fill = (val, len) => {
    if (val == null) return new Array(len).fill(0);
    if (Array.isArray(val)) return val.length >= len ? val.slice(0, len) : val.concat(new Array(len - val.length).fill(val[val.length - 1] ?? 0));
    return new Array(len).fill(val);
  };

  const req = {};
  RL.forEach((r) => {
    const rr = raw[r];
    req[r] = { min: fill(rr?.min, nBlk), max: fill(rr?.max, nBlk) };
  });
  return req;
}

function reqAt(req, role, blkIdx, k) {
  const r = req[role];
  if (!r) return 0;
  const v = r[k];
  return Array.isArray(v) ? (v[blkIdx] ?? 0) : (v ?? 0);
}

function roleAffinity(sub, role) {
  if (!sub) return -999;
  if (role === 'Drive') return sub.driveTeam ? 1000 : -1000;
  if (sub.driveTeam) return -500;

  if (role === 'Pit Lead') return isPitLead(sub) ? 120 : (sub.wantsPits ? 12 : -5);
  if (role === 'Pits') return sub.wantsPits ? 30 : -6;
  if (role === 'Strategy') return sub.wantsStrategy ? 25 : (NO_STRAT.includes(sub.name) ? -1000 : -6);
  if (role === 'Media') return sub.wantsMedia ? 24 : -5;
  if (role === 'Journalist') return sub.wantsJournalism ? 24 : -5;
  if (role === SCOUT_ROLE) return sub.cannotScout ? -1000 : 10;
  if (role === 'Open') return 0;
  return -1;
}

function isUnavailable(sub, blkStr) {
  if (!sub || !sub.unavailableTimes) return false;
  const t = String(sub.unavailableTimes).toLowerCase();
  const st = (blkStr.split('-')[0] || '').replace(':', '');
  return !!st && t.includes(st);
}

function isEligible(sub, role, blkStr, sctEndMn) {
  if (!sub) return false;
  if (isUnavailable(sub, blkStr)) return false;

  if (role === 'Drive') return !!sub.driveTeam;
  if (sub.driveTeam && role !== 'Open') return false;

  if (role === SCOUT_ROLE) {
    if (sub.cannotScout || NO_SCT.includes(sub.name)) return false;
    if (blkStartMins(blkStr) >= sctEndMn) return false;
  }

  return true;
}

function buildSubMap(subs) {
  const m = new Map();
  for (const s of subs) m.set(s.email, s);
  return m;
}

function calcBurden(p) {
  return (p.schedule || []).reduce((sum, r) => sum + (BURDEN_W[r] ?? 0), 0);
}

function clonePeople(people) {
  return people.map((p) => ({ ...p, schedule: [...(p.schedule || [])] }));
}

function countRole(people, blkIdx, role) {
  let c = 0;
  for (const p of people) if ((p.schedule || [])[blkIdx] === role) c++;
  return c;
}

function buildValidInitialSchedule(subs, blocks, req, sctEndMn, rng) {
  const sMap = buildSubMap(subs);
  const nBlk = blocks.length;
  const people = subs.map((s) => ({ name: shortName(s.name), email: s.email, schedule: new Array(nBlk).fill('Open') }));

  const pickCandidates = (blkIdx, role, onlyPreferred = false) => {
    const blk = blocks[blkIdx];
    let cands = people.filter((p) => {
      if ((p.schedule || [])[blkIdx] !== 'Open') return false;
      const sub = sMap.get(p.email);
      if (!isEligible(sub, role, blk, sctEndMn)) return false;
      if (onlyPreferred && roleAffinity(sub, role) <= 0) return false;
      return true;
    });

    cands = cands.sort((a, b) => {
      const sa = roleAffinity(sMap.get(a.email), role) - calcBurden(a) * 0.2 + (rng() * 0.01);
      const sb = roleAffinity(sMap.get(b.email), role) - calcBurden(b) * 0.2 + (rng() * 0.01);
      return sb - sa;
    });

    return cands;
  };

  const assign = (blkIdx, role, target, onlyPreferred = false) => {
    let n = 0;
    const cands = pickCandidates(blkIdx, role, onlyPreferred);
    for (const p of cands) {
      if (n >= target) break;
      p.schedule[blkIdx] = role;
      n++;
    }
    return n;
  };

  for (let bi = 0; bi < nBlk; bi++) {
    const driveTarget = Math.max(reqAt(req, 'Drive', bi, 'min'), Math.min(reqAt(req, 'Drive', bi, 'max'), subs.filter((s) => s.driveTeam).length));
    assign(bi, 'Drive', driveTarget, true);

    const orderedHard = ['Pit Lead', 'Pits', 'Strategy', 'Media', 'Journalist'];
    for (const role of orderedHard) {
      const mn = reqAt(req, role, bi, 'min');
      const mx = reqAt(req, role, bi, 'max');
      assign(bi, role, mn, false);
      const cur = countRole(people, bi, role);
      if (cur < mx) assign(bi, role, mx - cur, true);
    }

    const canScout = blkStartMins(blocks[bi]) < sctEndMn;
    if (canScout) {
      const scoutTarget = Math.min(7, Math.max(3, people.filter((p) => {
        const sub = sMap.get(p.email);
        return (p.schedule[bi] === 'Open') && isEligible(sub, SCOUT_ROLE, blocks[bi], sctEndMn);
      }).length));
      assign(bi, SCOUT_ROLE, scoutTarget, false);
    }
  }

  return people;
}

function scoreDay(people, subs, blocks, req, sctEndMn) {
  const sMap = buildSubMap(subs);
  let score = 0;
  let hardViol = 0;

  for (let bi = 0; bi < blocks.length; bi++) {
    const roleCounts = {};

    for (const p of people) {
      const r = (p.schedule || [])[bi] || 'Open';
      roleCounts[r] = (roleCounts[r] || 0) + 1;
      const sub = sMap.get(p.email);

      if (!isEligible(sub, r, blocks[bi], sctEndMn)) hardViol++;
      if (sub && sub.driveTeam && r !== 'Drive' && r !== 'Open') hardViol++;
      if ((r === SCOUT_ROLE) && (blkStartMins(blocks[bi]) >= sctEndMn)) hardViol++;
    }

    for (const role of RL) {
      const mn = reqAt(req, role, bi, 'min');
      const mx = reqAt(req, role, bi, 'max');
      const got = roleCounts[role] || 0;
      if (got < mn) hardViol += (mn - got);
      if (got > mx) hardViol += (got - mx);
    }
  }

  if (hardViol > 0) return -hardViol * HARD_PEN;

  const burdens = people.map(calcBurden);
  const avgB = burdens.length ? burdens.reduce((a, b) => a + b, 0) / burdens.length : 0;

  for (const p of people) {
    const sub = sMap.get(p.email);
    const sch = p.schedule || [];
    const b = calcBurden(p);
    const scoutCnt = sch.filter((r) => r === SCOUT_ROLE).length;
    const pitCnt = sch.filter((r) => r === 'Pits' || r === 'Pit Lead').length;

    score -= Math.abs(b - avgB) * 28;
    score -= scoutCnt * scoutCnt * 1.5;
    score -= pitCnt * pitCnt * 1.2;

    for (const r of sch) {
      const aff = roleAffinity(sub, r);
      if (aff > 0) score += 16;
      if (aff < 0 && r !== 'Open') score -= 14;
    }
  }

  return score;
}

function mutateDaySchedule(people, subs, blocks, sctEndMn, rng) {
  if (!people.length || !blocks.length) return null;

  const sMap = buildSubMap(subs);
  const next = clonePeople(people);
  const bi = Math.floor(rng() * blocks.length);
  const blk = blocks[bi];

  const aIdx = Math.floor(rng() * next.length);
  const bIdx = Math.floor(rng() * next.length);
  if (aIdx === bIdx) return null;

  const a = next[aIdx];
  const b = next[bIdx];
  const ra = (a.schedule || [])[bi] || 'Open';
  const rb = (b.schedule || [])[bi] || 'Open';

  if (!isEligible(sMap.get(a.email), rb, blk, sctEndMn)) return null;
  if (!isEligible(sMap.get(b.email), ra, blk, sctEndMn)) return null;

  a.schedule[bi] = rb;
  b.schedule[bi] = ra;
  return next;
}

function optimizeDaySchedule(initialPeople, subs, blocks, req, sctEndMn, iterCount, rng) {
  let cur = clonePeople(initialPeople);
  let best = clonePeople(initialPeople);
  let curScore = scoreDay(cur, subs, blocks, req, sctEndMn);
  let bestScore = curScore;

  let temp = 10.0;
  const nIter = Math.max(100, iterCount || 200);

  for (let i = 0; i < nIter; i++) {
    const cand = mutateDaySchedule(cur, subs, blocks, sctEndMn, rng);
    if (!cand) continue;

    const candScore = scoreDay(cand, subs, blocks, req, sctEndMn);
    const delta = candScore - curScore;

    if (delta > 0 || rng() < Math.exp(delta / Math.max(0.001, temp))) {
      cur = cand;
      curScore = candScore;
      if (candScore > bestScore) {
        best = cand;
        bestScore = candScore;
      }
    }

    temp *= 0.996;
  }

  return best;
}

async function buildSchedule(cfg) {
  const {
    csvPath,
    competitionStartTime,
    competitionEndTime,
    blockDurationMinutes,
    columnMap,
    numberOfDays,
    optimizationIterations = 1,
    daySchedule,
  } = cfg;

  const blkMins = Number(blockDurationMinutes) || 30;
  const nDays = daySchedule && daySchedule.length ? daySchedule.length : Math.max(1, Number(numberOfDays) || 1);

  const dayFilt = [
    (s) => s.friday === true,
    (s) => s.saturday === true,
  ];

  const dayLbl = daySchedule ? daySchedule.map((d) => d.label) : ['Friday', 'Saturday'];

  function getBlocksForDay(d) {
    if (daySchedule && daySchedule[d]) {
      const dc = daySchedule[d];
      const st = dc.start || competitionStartTime;
      const en = dc.end || competitionEndTime;
      const l = dc.lunch;
      return genBlksWithLunch(st, en, blkMins, l && l[0], l && l[1]);
    }
    return genBlks(competitionStartTime, competitionEndTime, blkMins);
  }

  function getScoutEndForDay(d) {
    if (daySchedule && daySchedule[d] && daySchedule[d].scoutEnd != null) return timeToMins(daySchedule[d].scoutEnd);
    return Infinity;
  }

  const showDay = cfg.showOnlyDay != null ? cfg.showOnlyDay : 0;

  let nexusMatchLabels = null;
  if (cfg.nexusEventKey && (cfg.nexusApiKey || process.env.NEXUS_API_KEY)) {
    nexusMatchLabels = await fetchNexusMatches(cfg.nexusEventKey, cfg.nexusApiKey || process.env.NEXUS_API_KEY);
  }

  let subs = [];
  try {
    const csv = await fs.readFile(csvPath, 'utf8');
    subs = parseSubs(parseCSV(csv), columnMap);
    subs = subs.filter((s) => !SKIP_NAMES.includes(s.name));
  } catch (e) {
    console.warn('no csv', csvPath, e.message);
  }

  const runSeed = (typeof Date.now === 'function' ? Date.now() : 0) >>> 0;
  const seedCount = Math.max(2, Math.min(10, Math.floor((Number(optimizationIterations) || 1) / 150) + 2));

  const days = [];
  for (let d = 0; d < nDays; d++) {
    const filt = dayFilt[d];
    const baseSubs = filt ? subs.filter(filt) : subs;

    const blocks = (d === showDay && nexusMatchLabels && nexusMatchLabels.length > 0)
      ? nexusMatchLabels
      : getBlocksForDay(d);

    const req = loadReq(blocks.length);
    const sctEndMn = getScoutEndForDay(d);

    let bestPeople = null;
    let bestScore = -Infinity;

    for (let s = 0; s < seedCount; s++) {
      const seed = (runSeed + d * 1000 + s * 37) >>> 0;
      const rng = seededRandom(seed);
      const subsTry = shuffleWithSeed(baseSubs, seed);

      let people = buildValidInitialSchedule(subsTry, blocks, req, sctEndMn, rng);
      people = optimizeDaySchedule(people, subsTry, blocks, req, sctEndMn, optimizationIterations, rng);

      const sc = scoreDay(people, subsTry, blocks, req, sctEndMn);
      if (sc > bestScore) {
        bestScore = sc;
        bestPeople = people;
      }
    }

    const drvEmails = new Set((baseSubs || []).filter((s) => s.driveTeam).map((s) => s.email));
    const atBottom = (p) => isPitLead(p) || drvEmails.has(p.email);

    const sortedPeople = [...(bestPeople || [])].sort((a, b) => {
      const aBot = atBottom(a) ? 1 : 0;
      const bBot = atBottom(b) ? 1 : 0;
      if (aBot !== bBot) return aBot - bBot;
      return (a.name || '').localeCompare(b.name || '');
    });

    const scoutCheck = sortedPeople.map((p) => {
      const s = baseSubs.find((x) => x.email === p.email);
      const shouldScout = !s || !s.cannotScout;
      const scoutingBlocks = (p.schedule || []).filter((x) => x === SCOUT_ROLE).length;
      let status = 'ok';
      if (!shouldScout) status = 'exempt';
      else if (scoutingBlocks === 0) status = 'none';
      else if (scoutingBlocks < 2) status = 'low';
      return { name: p.name, scoutingBlocks, shouldScout, status };
    });

    days.push({
      day: d + 1,
      label: dayLbl[d] || `Day ${d + 1}`,
      timeBlocks: blocks,
      people: sortedPeople,
      scoutCheck,
    });
  }

  return { days };
}

module.exports = {
  buildSchedule,
  generateTimeBlocks: genBlks,
  parseCSV,
  parseSubmissions: parseSubs,
};
