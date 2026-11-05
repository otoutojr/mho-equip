/* 装備おすすめ ― UI */
'use strict';
const APP_VERSION = '2026.11.05-1';
const STORE_KEY = 'mho-equip:v1';
const PART_JP = { head: '頭', body: '胴', arm: '腕', waist: '腰', leg: '脚' };
const EL_CLASS = { '火': 'fire', '水': 'water', '雷': 'thunder', '氷': 'ice', '龍': 'dragon', '毒': 'poison', '麻痺': 'para', '睡眠': 'sleep', '爆破': 'blast', '無': 'none' };

const $ = (sel) => document.querySelector(sel);
const el = (tag, attrs = {}, ...children) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v);
  }
  for (const c of children) if (c != null) n.append(c);
  return n;
};

const state = loadState();
let DATA = null;
let worker = null;
let reqId = 0;
let currentMap = null;

function loadState() {
  const def = { charId: null, rank: 1, rarityCap: 7, guildLv: 0, defeated: {}, map: null };
  try { return Object.assign(def, JSON.parse(localStorage.getItem(STORE_KEY) || '{}')); } catch { return def; }
}
function saveState() { try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch {} }

async function loadData() {
  const q = `?v=${APP_VERSION}`;
  const [armor, skills, monsters, characters] = await Promise.all(
    ['armor', 'skills', 'monsters', 'characters'].map(n => fetch(`data/${n}.json${q}`).then(r => { if (!r.ok) throw new Error(n); return r.json(); }))
  );
  return { armor, skills, monsters, characters };
}

function init() {
  loadData().then((d) => {
    DATA = d;
    $('#dataDate').textContent = `データ更新日 ${d.armor.updated || ''}`;
    if (!state.charId || !d.characters.characters.some(c => c.id === state.charId)) state.charId = d.characters.characters[0].id;
    currentMap = state.map || d.monsters.maps[0].name;
    worker = new Worker('solver.js?v=' + APP_VERSION);
    worker.onmessage = onWorkerMessage;
    worker.postMessage({ type: 'init', armor: d.armor, skills: d.skills });
    renderChars();
    renderFields();
    renderMapTabs();
    renderBoard();
    renderPriorities();
    $('#resultHint').textContent = '計算中…';
    solve();
  }).catch((err) => {
    $('#resultHint').textContent = `データを読み込めませんでした（${err.message}）。通信状態を確認して開き直してください。`;
  });
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

/* ---------- characters ---------- */
function currentChar() { return DATA.characters.characters.find(c => c.id === state.charId); }

function renderChars() {
  const box = $('#charChips'); box.innerHTML = '';
  for (const c of DATA.characters.characters) {
    const chip = el('button', { type: 'button', class: 'chip', role: 'tab', 'aria-selected': String(c.id === state.charId), onclick: () => { state.charId = c.id; saveState(); renderChars(); renderPriorities(); solve(); } },
      el('span', { class: 'name' }, el('span', { class: 'el', style: `background: var(--el-${EL_CLASS[c.element] || 'none'})` }), c.name),
      el('span', { class: 'meta', text: `${c.weapon}${c.element && c.element !== '無' ? '・' + c.element : ''}${c.type ? '・' + c.type : ''}` }));
    box.append(chip);
  }
  const c = currentChar();
  $('#charNote').textContent = c.note || (c.mechanics || []).join('。');
  $('#resultTitle').textContent = `${c.name} の最強セット`;
}

function renderPriorities() {
  const c = currentChar();
  const list = $('#prioList'); list.innerHTML = '';
  for (const p of (c.priorities || [])) {
    list.append(el('li', { class: 'prio' },
      el('span', { class: 'tier', text: p.tier }),
      el('span', { class: 'pname', text: p.targetLv ? `${p.skill} Lv${p.targetLv}` : p.skill }),
      el('span', { class: 'reason', text: p.reason || '' })));
  }
  if (!c.priorities || !c.priorities.length) list.append(el('li', { class: 'empty', text: 'このキャラの優先スキルはまだ未登録です。' }));
}

/* ---------- progression fields ---------- */
function renderFields() {
  $('#rank').value = state.rank; $('#rarityCap').value = state.rarityCap; $('#guildLv').value = state.guildLv;
  document.querySelectorAll('.stepper button').forEach((b) => {
    b.addEventListener('click', () => {
      const input = b.parentElement.querySelector('input');
      const v = Math.min(+input.max, Math.max(+input.min, (+input.value || 0) + (+b.dataset.step)));
      input.value = v; input.dispatchEvent(new Event('change'));
    });
  });
  $('#rank').addEventListener('change', (e) => { state.rank = clamp(e.target, 1, 200); saveState(); renderBoard(); solve(); });
  $('#rarityCap').addEventListener('change', (e) => { state.rarityCap = clamp(e.target, 1, 12); saveState(); solve(); });
  $('#guildLv').addEventListener('change', (e) => { state.guildLv = clamp(e.target, 0, 30); saveState(); solve(); });
  $('#autoFromRank').addEventListener('click', () => {
    for (const m of DATA.monsters.monsters) {
      if (m.unlockRank != null && m.unlockRank <= state.rank) state.defeated[m.name] = true;
    }
    saveState(); renderMapTabs(); renderBoard(); solve();
  });
}
function clamp(input, lo, hi) { const v = Math.min(hi, Math.max(lo, +input.value || lo)); input.value = v; return v; }

/* ---------- monster board ---------- */
function renderMapTabs() {
  const tabs = $('#mapTabs'); tabs.innerHTML = '';
  for (const m of DATA.monsters.maps) {
    const total = DATA.monsters.monsters.filter(x => x.maps.includes(m.name)).length;
    const done = DATA.monsters.monsters.filter(x => x.maps.includes(m.name) && state.defeated[x.name]).length;
    tabs.append(el('button', { type: 'button', class: 'tab', role: 'tab', 'aria-selected': String(m.name === currentMap), onclick: () => { currentMap = m.name; state.map = m.name; saveState(); renderMapTabs(); renderBoard(); } },
      m.name, el('span', { class: 'count', text: `${done}/${total}` })));
  }
}

function renderBoard() {
  const board = $('#monsterBoard'); board.innerHTML = '';
  const list = DATA.monsters.monsters.filter(m => m.maps.includes(currentMap));
  const order = (m) => (m.variant === 'yuko' ? 1 : 0);
  list.sort((a, b) => order(a) - order(b) || (a.unlockRank ?? 999) - (b.unlockRank ?? 999));
  for (const m of list) {
    const done = !!state.defeated[m.name];
    const tile = el('button', { type: 'button', class: 'mon', 'aria-pressed': String(done), onclick: () => { state.defeated[m.name] = !done; saveState(); renderMapTabs(); renderBoard(); solve(); } },
      el('span', { class: 'mname', text: m.name }),
      el('span', { class: 'mmeta' },
        el('span', { class: 'el', style: `background: var(--el-${EL_CLASS[m.element] || 'none'})`, title: m.element || '' }),
        el('span', { text: m.armorSeries && m.armorSeries.length ? m.armorSeries.join('・') + '装備' : '防具なし' })));
    if (done) tile.append(el('span', { class: 'stamp', text: '討伐' }));
    else if (m.unlockRank != null && m.unlockRank > state.rank) tile.append(el('span', { class: 'locked', text: `R${m.unlockRank}〜` }));
    board.append(tile);
  }
  const ore = (DATA.armor.series || []).filter(s => s.gate && (s.gate.type === 'basic' || s.gate.type === 'map')).map(s => s.name);
  $('#oreNote').textContent = ore.length ? `素材が鉱石・骨などの防具（${ore.join('・')}）は、そのマップに行けていれば候補に入れています。` : '';
}

/* ---------- availability ---------- */
function mapUnlocked(mapName) {
  const m = DATA.monsters.maps.find(x => x.name === mapName);
  if (m && m.unlockRank != null && state.rank >= m.unlockRank) return true;
  return DATA.monsters.monsters.some(x => x.maps.includes(mapName) && state.defeated[x.name]);
}
function availableSeries() {
  const out = [];
  for (const s of DATA.armor.series) {
    const g = s.gate || { type: 'basic' };
    let ok = false;
    if (g.type === 'basic') ok = true;
    else if (g.type === 'monster') ok = (g.monsters || [g.monster]).some(n => state.defeated[n]);
    else if (g.type === 'guild') ok = state.guildLv >= (g.lv || 1);
    else if (g.type === 'map') ok = mapUnlocked(g.map);
    if (ok) out.push(s.name);
  }
  return out;
}

/* ---------- solving ---------- */
function solve() {
  if (!worker || !DATA) return;
  const c = currentChar();
  const avail = availableSeries();
  const next = DATA.monsters.monsters.filter(m => !state.defeated[m.name] && m.armorSeries && m.armorSeries.length)
    .map(m => ({ monster: m.name, series: m.armorSeries.filter(sn => !avail.includes(sn)) }))
    .filter(n => n.series.length);
  reqId++;
  $('#resultHint').textContent = '計算中…';
  worker.postMessage({ type: 'solve', reqId, weights: c.weights || {}, availableSeries: avail, rarityCap: state.rarityCap, next, K: 12, topN: 6 });
}

function onWorkerMessage(e) {
  const msg = e.data;
  if (msg.reqId !== reqId) return;
  if (msg.type === 'result') { renderResult(msg); $('#nextList').innerHTML = ''; $('#nextList').append(el('li', { class: 'empty', text: '伸びしろを計算中…' })); }
  if (msg.type === 'next') renderNext(msg.next);
}

function rarityClass(r) { return r >= 8 ? 'top' : r >= 6 ? 'high' : r >= 4 ? 'mid' : 'low'; }
function fmtPct(v) { return (v >= 0 ? '+' : '') + (Math.round(v * 10) / 10).toString() + '%'; }

function renderResult(res) {
  const rack = $('#rack'); rack.innerHTML = '';
  const c = currentChar();
  if (!res.best) {
    $('#scoreValue').textContent = '―';
    $('#resultHint').textContent = 'まだ作れる防具がありません。倒したモンスターにチェックを入れてください。';
    $('#skillTotals').innerHTML = ''; $('#altList').innerHTML = ''; $('#nextList').innerHTML = '';
    return;
  }
  const b = res.best;
  $('#scoreValue').textContent = fmtPct(b.score);
  const needs = b.pieces.filter(p => p.rarity > p.baseRarity);
  $('#resultHint').textContent = needs.length
    ? `強化が必要：${needs.map(p => `${p.name}→レア${p.rarity}`).join('、')}`
    : '全部位、生産したままで最強の組み合わせです。';
  for (const p of b.pieces) {
    const rar = el('div', { class: 'rar' });
    for (let r = 1; r <= p.maxRarity; r++) {
      const d = el('span', { class: 'd' + (r <= p.rarity ? ' on' : '') });
      if (r <= p.rarity) d.style.background = `var(--r-${rarityClass(r)})`;
      rar.append(d);
    }
    const lbl = el('span', { class: 'lbl' });
    if (p.rarity > p.baseRarity) lbl.append('生産レア', String(p.baseRarity), ' → ', el('b', { class: 'need', text: `レア${p.rarity}まで強化` }));
    else lbl.append(el('b', { text: `レア${p.rarity}` }), '（生産のまま）');
    rar.append(lbl);
    const tags = el('div', { class: 'tags' });
    for (const k of p.skills) tags.append(el('span', { class: 'tag' + (k.value > 0 ? ' hit' : '') }, k.name, el('span', { class: 'lv', text: `Lv${k.lv}` })));
    if (!p.skills.length) tags.append(el('span', { class: 'tag', text: 'スキルなし' }));
    rack.append(el('li', { class: 'slot' },
      el('div', { class: 'part', text: PART_JP[p.part] }),
      el('div', {}, el('div', { class: 'pname' }, p.name, el('span', { class: 'series', text: p.series + 'シリーズ' })), rar, tags)));
  }
  // totals
  const tot = $('#skillTotals'); tot.innerHTML = '';
  const skillInfo = (n) => DATA.skills.skills.find(s => s.name === n);
  const shown = b.totals.filter(t => t.value > 0);
  for (const t of shown) {
    const info = skillInfo(t.skill);
    const eff = info && info.levels && info.levels[t.lv - 1] ? info.levels[t.lv - 1].effect : '';
    const bar = el('div', { class: 'bar' });
    for (let i = 1; i <= t.max; i++) bar.append(el('span', { class: 'seg' + (i <= t.lv ? (i > t.lv - t.fromSet ? ' set' : ' on') : '') }));
    tot.append(el('div', { class: 'sk' }, el('span', { text: t.skill }), el('span', { class: 'lv', text: `Lv${t.lv}${t.raw > t.max ? `（上限、${t.raw - t.max}余り）` : ''}` }), bar, eff ? el('span', { class: 'eff', text: eff }) : null));
  }
  if (b.setHits.length) tot.append(el('div', { class: 'hint', text: 'セットスキル：' + b.setHits.map(h => `${h.set}（${h.pieces}部位）→${h.skill}+${h.lv}`).join('、') }));
  if (!shown.length) tot.append(el('div', { class: 'empty', text: 'このキャラの優先スキルが付く防具がまだありません。' }));
  // alternatives
  const alts = $('#altList'); alts.innerHTML = '';
  for (const a of res.alts) {
    alts.append(el('div', { class: 'alt' },
      el('span', { class: 'altScore', text: fmtPct(a.score) }),
      el('span', { text: a.totals.filter(t => t.value > 0).map(t => `${t.skill}${t.lv}`).join('・') || '―' }),
      el('ul', {}, ...a.pieces.map(p => el('li', { text: `${PART_JP[p.part]} ${p.name}${p.rarity > p.baseRarity ? `（レア${p.rarity}）` : ''}` })))));
  }
  if (!res.alts.length) alts.append(el('div', { class: 'empty', text: '候補はこの1通りです。' }));
}

function renderNext(next) {
  const nl = $('#nextList'); nl.innerHTML = '';
  const nexts = next.slice(0, 8);
  for (const n of nexts) {
    const flat = n.delta < 0.05;
    nl.append(el('li', { class: 'next' + (flat ? ' flat' : '') },
      el('span', { class: 'nname', text: n.monster }),
      el('span', { class: 'delta', text: flat ? '変化なし' : fmtPct(n.delta) }),
      el('span', { class: 'why', text: flat ? 'いまのセットは変わりません' : `入れ替わる部位：${n.changed.join('・') || '―'}` })));
  }
  if (!nexts.length) nl.append(el('li', { class: 'empty', text: '未討伐のモンスターがありません。' }));
}

document.addEventListener('DOMContentLoaded', init);
