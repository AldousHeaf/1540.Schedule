let sd = []; // sched days cache
const TO_MS = 20000; // api timeout
const RL_ORDER = ['Pit Lead', 'Pits', 'Drive', 'Scouting!', 'Strategy', 'Journalist', 'Media']; // keep this order

function escH(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function rlSlug(rl) {
  return (rl || '').toLowerCase().replace(/[^a-z]/g, '');
}

function setPanelOpen(isOpen) {
  const pnl = document.getElementById('rolePanel');
  if (!pnl) return;
  pnl.classList.toggle('hidden', !isOpen);
  pnl.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
}

function showPnl(day, rl) {
  // quick role modal build
  const ttl = document.getElementById('rolePanelTitle');
  const bd = document.getElementById('rolePanelBody');
  if (!ttl || !bd) return;
  ttl.textContent = rl;
  const pnl = document.getElementById('rolePanel');
  pnl.setAttribute('data-role-slug', rlSlug(rl));
  const blks = day.timeBlocks || [];
  const ppl = day.people || [];
  const assigned = ppl.filter((p) => (p.schedule || []).some((x) => x === rl));
  let totalAsg = 0;
  blks.forEach((_, i) => {
    totalAsg += ppl.filter((p) => (p.schedule || [])[i] === rl).length;
  });
  let html = '<p class="pnl-sub">' + escH(day.label) + ' schedule details</p>';
  html += '<div class="pnl-stats">';
  html += '<div class="pnl-stat"><span class="pnl-stat-k">Blocks</span><span class="pnl-stat-v">' + blks.length + '</span></div>';
  html += '<div class="pnl-stat"><span class="pnl-stat-k">People</span><span class="pnl-stat-v">' + assigned.length + '</span></div>';
  html += '<div class="pnl-stat"><span class="pnl-stat-k">Assignments</span><span class="pnl-stat-v">' + totalAsg + '</span></div>';
  html += '</div>';
  html += '<div class="pnl-grid">';
  blks.forEach((_, i) => {
    const asg = ppl.filter((p) => (p.schedule || [])[i] === rl);
    const tm = escH(blks[i]);
    const cell = asg.length
      ? '<div class="pnl-chips">' + asg.map((p) => '<span class="pnl-chip">' + escH(p.name) + '</span>').join('') + '</div>'
      : '<span class="pnl-empty">No one assigned</span>';
    html += '<section class="pnl-card"><h3 class="pnl-tm">' + tm + '</h3>' + cell + '</section>';
  });
  html += '</div>';
  bd.innerHTML = html;
  setPanelOpen(true);
}

function parseTm(tstr) {
  // 24h -> 12h for display
  const m = (tstr || '').match(/^(\d{1,2}):(\d{2})/);
  if (!m) return tstr;
  const h = parseInt(m[1], 10);
  const am = h < 12 ? 'am' : 'pm';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return h12 + ':' + m[2] + ' ' + am;
}

function buildDayTimeView(sec, day, dIdx, q) {
  // time-centric view
  const tbks = day.timeBlocks || [];
  const ppl = day.people || [];
  const ql = (q || '').trim().toLowerCase();
  const blkList = document.createElement('div');
  blkList.className = 'blk-list';
  tbks.forEach((blkStr, ti) => {
    const byRl = {};
    ppl.forEach((p) => {
      const rl = (p.schedule || [])[ti] || 'Open';
      if (!byRl[rl]) byRl[rl] = [];
      byRl[rl].push(p);
    });
    let hasMatch = !ql;
    if (ql) {
      ppl.forEach((p) => {
        if ((p.schedule || [])[ti] && (p.name || '').toLowerCase().includes(ql)) hasMatch = true;
      });
    }
    const blkEl = document.createElement('div');
    blkEl.className = 'blk';
    if (!hasMatch) blkEl.classList.add('blk-hide');
    const tmEl = document.createElement('div');
    tmEl.className = 'blk-tm';
    tmEl.textContent = parseTm(blkStr);
    blkEl.appendChild(tmEl);
    const rolesEl = document.createElement('div');
    rolesEl.className = 'blk-roles';
    RL_ORDER.forEach((rl) => {
      const names = byRl[rl];
      if (!names || names.length === 0) return;
      const filtered = ql ? names.filter((p) => (p.name || '').toLowerCase().includes(ql)) : names;
      if (ql && filtered.length === 0) return;
      const disp = filtered.length ? filtered : names;
      const rc = document.createElement('button');
      rc.type = 'button';
      rc.className = 'rc rc--' + rlSlug(rl);
      rc.setAttribute('data-role', rl);
      rc.setAttribute('data-day-index', String(dIdx));
      rc.innerHTML = '<span class="rc-lbl">' + escH(rl) + '</span><span class="rc-names">' + disp.map((p) => escH(p.name)).join(', ') + '</span>';
      rc.addEventListener('click', () => showPnl(sd[dIdx], rl));
      rolesEl.appendChild(rc);
    });
    blkEl.appendChild(rolesEl);
    blkList.appendChild(blkEl);
  });
  sec.appendChild(blkList);
}

function buildDayTableView(sec, day, dIdx, ppl, tbks, hrPerBlk) {
  // person table view
  // hrPerBlk kept in sig for now
  const tbl = document.createElement('table');
  tbl.className = 'tbl';
  const thead = document.createElement('thead');
  const hr = document.createElement('tr');
  const thN = document.createElement('th');
  thN.className = 'col-nm';
  thN.textContent = 'Name';
  hr.appendChild(thN);
  tbks.forEach((blk) => {
    const th = document.createElement('th');
    th.className = 'col-tm';
    th.textContent = blk;
    hr.appendChild(th);
  });
  thead.appendChild(hr);
  tbl.appendChild(thead);
  const tbody = document.createElement('tbody');
  ppl.forEach((pers) => {
    const tr = document.createElement('tr');
    tr.className = 'sched-row';
    tr.setAttribute('data-person-name', pers.name || '');
    const tdN = document.createElement('td');
    tdN.className = 'col-nm';
    tdN.textContent = pers.name;
    tr.appendChild(tdN);
    (pers.schedule || []).forEach((st, ti) => {
      const td = document.createElement('td');
      td.textContent = st;
      td.className = 'cell cell--' + rlSlug(st || 'open');
      if (st && st !== 'Open') {
        td.setAttribute('data-role', st);
        td.setAttribute('data-day-index', String(dIdx));
        td.style.cursor = 'pointer';
        td.title = 'Who has ' + st + ' per time';
      }
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  tbl.appendChild(tbody);
  const wrap = document.createElement('div');
  wrap.className = 'tbl-wrap';
  wrap.appendChild(tbl);
  sec.appendChild(wrap);
}

async function loadSched() {
  // pull api first, static json fallback
  const ctr = document.getElementById('scheduleContainer');
  try {
    let data = null;
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), TO_MS);
    try {
      const r = await fetch('/api/schedule', { signal: ac.signal });
      clearTimeout(t);
      if (r.ok) data = await r.json();
    } catch (_) {
      clearTimeout(t);
    }
    if (!data) {
      const r = await fetch('schedule.json?t=' + Date.now(), { cache: 'no-store' });
      if (r.ok) data = await r.json();
    }
    if (!data) throw new Error('Failed to load');
    const days = data.days || (data.schedule && data.schedule.days) || [];
    if (!days.length) {
      ctr.innerHTML = '<div class="empty">No schedule.</div>';
      return;
    }
    sd = days;
    const hrPerBlk = (Number(data.blockDurationMinutes) || 30) / 60;
    ctr.innerHTML = '';
    const q = (document.getElementById('searchInput').value || '').trim().toLowerCase();
    days.forEach((day, dIdx) => {
      const tbks = day.timeBlocks || [];
      const ppl = day.people || [];

      const timeWrap = document.createElement('div');
      timeWrap.className = 'sched-by-time';
      const secTime = document.createElement('section');
      secTime.className = 'day-sec';
      const h2t = document.createElement('h2');
      h2t.className = 'day-ttl';
      h2t.textContent = day.label;
      secTime.appendChild(h2t);
      buildDayTimeView(secTime, day, dIdx, q);
      timeWrap.appendChild(secTime);
      ctr.appendChild(timeWrap);

      const personWrap = document.createElement('div');
      personWrap.className = 'sched-by-person';
      personWrap.style.display = 'none';
      const secPerson = document.createElement('section');
      secPerson.className = 'day-sec';
      const h2p = document.createElement('h2');
      h2p.className = 'day-ttl';
      h2p.textContent = day.label;
      secPerson.appendChild(h2p);
      buildDayTableView(secPerson, day, dIdx, ppl, tbks, hrPerBlk);
      personWrap.appendChild(secPerson);
      ctr.appendChild(personWrap);
    });
    applyView();
  } catch (e) {
    const msg = e.name === 'AbortError' ? 'Taking a while…' : escH(e.message);
    // old: ctr.textContent = e.message
    ctr.innerHTML = '<div class="empty">' + msg + '</div>';
  }
}

function applyView() {
  const isTime = document.getElementById('viewTime').classList.contains('active');
  document.querySelectorAll('.sched-by-time').forEach((el) => { el.style.display = isTime ? '' : 'none'; });
  document.querySelectorAll('.sched-by-person').forEach((el) => { el.style.display = isTime ? 'none' : ''; });
}

function applySearch() {
  const q = (document.getElementById('searchInput').value || '').trim().toLowerCase();
  document.querySelectorAll('.sched-row').forEach((tr) => {
    const nm = (tr.getAttribute('data-person-name') || '').toLowerCase();
    tr.classList.toggle('tr-hide', q.length > 0 && !nm.includes(q));
  });
  document.querySelectorAll('.blk').forEach((blk) => {
    const names = blk.querySelectorAll('.rc-names');
    let hasMatch = !q;
    names.forEach((el) => {
      if (el.textContent.toLowerCase().includes(q)) hasMatch = true;
    });
    blk.classList.toggle('blk-hide', q.length > 0 && !hasMatch);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  loadSched();
  const inp = document.getElementById('searchInput');
  if (inp) inp.addEventListener('input', applySearch);
  const vTime = document.getElementById('viewTime');
  const vPerson = document.getElementById('viewPerson');
  if (vTime && vPerson) {
    vTime.addEventListener('click', () => { vTime.classList.add('active'); vPerson.classList.remove('active'); applyView(); });
    vPerson.addEventListener('click', () => { vPerson.classList.add('active'); vTime.classList.remove('active'); applyView(); });
  }
  const ctr = document.getElementById('scheduleContainer');
  if (ctr) {
    ctr.addEventListener('click', (e) => {
      const cell = e.target.closest('td[data-role]');
      if (!cell) return;
      const rl = cell.getAttribute('data-role');
      const dIdx = parseInt(cell.getAttribute('data-day-index'), 10);
      if (rl && rl !== 'Open' && !isNaN(dIdx) && sd[dIdx]) showPnl(sd[dIdx], rl);
    });
  }
  const pnl = document.getElementById('rolePanel');
  const px = pnl && pnl.querySelector('.pnl-x');
  if (px && pnl) {
    px.addEventListener('click', () => setPanelOpen(false));
    pnl.addEventListener('click', (e) => { if (e.target === pnl) setPanelOpen(false); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setPanelOpen(false); });
  }
});
