/* 装備おすすめ ― UI */
'use strict';
const APP_VERSION = '2026.11.06-1';
const STORE_KEY = 'mho-equip:v1';
const PART_JP = { head: '頭', body: '胴', arm: '腕', waist: '腰', leg: '脚' };
const ROMAN = { 1: 'Ⅰ', 2: 'Ⅱ', 3: 'Ⅲ', 4: 'Ⅳ', 5: 'Ⅴ', 6: 'Ⅵ' };
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
  const def = { charId: null, rank: 1, guildLv: 0, orbTier: 3, heroElement: '火', target: 'normal', defeated: {}, map: null };
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
    renderMenu();
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

/* ---------- menu / help ---------- */
function setMenu(open) {
  $('#menu').hidden = !open; $('#menuBack').hidden = !open;
  $('#menuBtn').setAttribute('aria-expanded', String(open));
}
function setHelp(open) { $('#helpSheet').hidden = !open; $('#helpBack').hidden = !open; }
function renderMenu() {
  $('#menuBtn').addEventListener('click', () => setMenu($('#menu').hidden));
  $('#menuBack').addEventListener('click', () => setMenu(false));
  document.querySelectorAll('#menu a.menuItem').forEach(a => a.addEventListener('click', () => {
    setMenu(false);
    if (a.getAttribute('href') === '#progressPanel') $('#monsterFold').open = true;
  }));
  $('#menuAuto').addEventListener('click', () => { setMenu(false); autoFromRank(); });
  $('#menuAllDone').addEventListener('click', () => { setMenu(false); for (const m of DATA.monsters.monsters) state.defeated[m.name] = true; saveState(); renderMapTabs(); renderBoard(); solve(); });
  $('#menuReset').addEventListener('click', () => {
    setMenu(false);
    if (!confirm('ランク・討伐チェックなどの入力を全部消します。いい？')) return;
    const keep = { charId: state.charId };
    for (const k of Object.keys(state)) delete state[k];
    Object.assign(state, { charId: keep.charId, rank: 1, orbTier: 3, heroElement: '火', target: 'normal', defeated: {}, map: null });
    saveState(); renderFields(true); renderTargetTabs(); renderMapTabs(); renderBoard(); renderChars(); solve();
  });
  $('#menuHelp').addEventListener('click', () => { setMenu(false); setHelp(true); });
  $('#helpBack').addEventListener('click', () => setHelp(false));
  $('#helpClose').addEventListener('click', () => setHelp(false));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { setMenu(false); setHelp(false); } });
}
function autoFromRank() {
  for (const m of DATA.monsters.monsters) {
    if (m.unlockRank != null && m.unlockRank <= state.rank) state.defeated[m.name] = true;
  }
  saveState(); renderMapTabs(); renderBoard(); solve();
}

/* ---------- characters ---------- */
function currentChar() { return DATA.characters.characters.find(c => c.id === state.charId); }

function renderChars() {
  const box = $('#charChips'); box.innerHTML = '';
  for (const c of DATA.characters.characters) {
    const elem = c.elementSelectable ? heroElement() : c.element;
    const chip = el('button', { type: 'button', class: 'chip', role: 'tab', 'aria-selected': String(c.id === state.charId), onclick: () => { state.charId = c.id; saveState(); renderChars(); renderPriorities(); solve(); } },
      el('span', { class: 'name' }, el('span', { class: 'el', style: `background: var(--el-${EL_CLASS[elem] || 'none'})` }), c.name),
      el('span', { class: 'meta', text: `${c.weapon || ''}${elem && elem !== '無' ? '・' + elem : ''}${c.type ? '・' + c.type : ''}` }));
    box.append(chip);
  }
  const c = currentChar();
  $('#charNote').textContent = c.note || (c.mechanics || []).join('。');
  $('#resultTitle').textContent = `${c.name} の最強セット`;
  renderElementRow(c);
}

const HERO_ELEMENTS = ['火', '水', '雷', '氷', '龍'];
function heroElement() { return HERO_ELEMENTS.includes(state.heroElement) ? state.heroElement : '火'; }
function renderElementRow(c) {
  const row = $('#elementRow');
  if (!c.elementSelectable) { row.hidden = true; return; }
  row.hidden = false;
  const tabs = $('#elementTabs'); tabs.innerHTML = '';
  for (const e of HERO_ELEMENTS) {
    tabs.append(el('button', { type: 'button', class: 'tab', role: 'tab', 'aria-selected': String(e === heroElement()), onclick: () => { state.heroElement = e; saveState(); renderChars(); solve(); } },
      el('span', { class: 'el', style: `background: var(--el-${EL_CLASS[e]})` }), e));
  }
}
// 主人公は属性を選べるので、重みの「{属性}」を選択中の属性に置き換える
function effectiveWeights(c) {
  const w = (state.target === 'yuko' && c.weightsYuko) ? c.weightsYuko : (c.weights || {});
  if (!c.elementSelectable) return w;
  const out = {};
  for (const [k, v] of Object.entries(w)) out[k.replace('{属性}', heroElement())] = v;
  return out;
}

function renderPriorities() {
  const c = currentChar();
  const list = $('#prioList'); list.innerHTML = '';
  $('#prioHint').textContent = c.scoreMode === 'log'
    ? `スキルごとに「効果値 × 発動している割合 × 乗るダメージの割合」で評価し、掛け合わせて倍率にしています。${c.model && c.model.elementShare ? `属性ダメージの割合は約${Math.round(c.model.elementShare * 100)}%で想定。` : ''}`
    : '攻略サイトの推奨をもとにした優先度です。';
  for (const p of (c.priorities || [])) {
    const li = el('li', { class: 'prio' },
      el('span', { class: 'tier', text: p.tier }),
      el('span', { class: 'pname', text: (p.targetLv ? `${p.skill} Lv${p.targetLv}` : p.skill).replace('{属性}', c.elementSelectable ? heroElement() : (c.element || '')) }),
      el('span', { class: 'reason', text: p.reason || '' }));
    if (p.assumption) li.append(el('span', { class: 'assume', text: '想定：' + p.assumption }));
    if (p.sources && p.sources.length) li.append(el('span', { class: 'src', text: '出典：' + p.sources.join('・') }));
    list.append(li);
  }
  if (!c.priorities || !c.priorities.length) list.append(el('li', { class: 'empty', text: 'このキャラの優先スキルはまだ未登録です。' }));
  const sl = $('#sourceList'); sl.innerHTML = '';
  if (c.sources && c.sources.length) {
    sl.append('参照：');
    c.sources.forEach((u, i) => { sl.append(el('a', { href: u.url || u, target: '_blank', rel: 'noopener', text: u.title || `[${i + 1}]` }), ' '); });
  }
}

/* ---------- progression fields ---------- */
function renderFields(valuesOnly) {
  $('#rank').value = state.rank; $('#orbTier').value = state.orbTier;
  if (valuesOnly) return;
  document.querySelectorAll('.stepper button').forEach((b) => {
    b.addEventListener('click', () => {
      const input = b.parentElement.querySelector('input');
      const v = Math.min(+input.max, Math.max(+input.min, (+input.value || 0) + (+b.dataset.step)));
      input.value = v; input.dispatchEvent(new Event('change'));
    });
  });
  $('#rank').addEventListener('change', (e) => { state.rank = clamp(e.target, 1, 200); saveState(); renderBoard(); solve(); });
  $('#orbTier').addEventListener('change', (e) => { state.orbTier = clamp(e.target, 1, 6); saveState(); solve(); });
  document.querySelectorAll('#targetTabs .tab').forEach((b) => {
    b.addEventListener('click', () => { state.target = b.dataset.target; saveState(); renderTargetTabs(); solve(); });
  });
  renderTargetTabs();
  $('#markAllMap').addEventListener('click', () => { setMapDefeated(true); });
  $('#clearAllMap').addEventListener('click', () => { setMapDefeated(false); });
  $('#autoFromRank').addEventListener('click', autoFromRank);
}
function renderTargetTabs() {
  document.querySelectorAll('#targetTabs .tab').forEach((b) => b.setAttribute('aria-selected', String((state.target || 'normal') === b.dataset.target)));
}
function setMapDefeated(flag) {
  for (const m of DATA.monsters.monsters) if (m.maps.includes(currentMap)) { if (flag) state.defeated[m.name] = true; else delete state.defeated[m.name]; }
  saveState(); renderMapTabs(); renderBoard(); solve();
}
function clamp(input, lo, hi) { const v = Math.min(hi, Math.max(lo, +input.value || lo)); input.value = v; return v; }

/* ---------- monster board ---------- */
function renderMapTabs() {
  const all = DATA.monsters.monsters.length, done = DATA.monsters.monsters.filter(x => state.defeated[x.name]).length;
  $('#monsterCount').textContent = `${done}/${all} 討伐済み`;
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

/* ---------- 強化上限（冒険ランクと狩魂玉のランクから） ---------- */
function rankCap() {
  let cap = 2;
  for (const [r, c] of (DATA.monsters.rankCap || [])) if (state.rank >= r) cap = c;
  return cap;
}
function orbCap() { const t = DATA.monsters.orbCap || {}; return t[state.orbTier] || 12; }
function rarityCap() { return Math.min(rankCap(), orbCap()); }
function renderCapNote() {
  const rc = rankCap(), oc = orbCap(), cap = rarityCap();
  let txt = `いま強化できる上限：レア${cap}`;
  if (oc < rc) txt += `（ランク${state.rank}ならレア${rc}まで解放済みですが、狩魂玉${ROMAN[state.orbTier]}ではレア${oc}まで）`;
  else txt += `（冒険ランク${state.rank}で解放されている上限）`;
  $('#capNote').textContent = txt;
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
  renderCapNote();
  $('#resultHint').textContent = '計算中…';
  worker.postMessage({ type: 'solve', reqId, weights: effectiveWeights(c), availableSeries: avail, rarityCap: rarityCap(), orbTier: state.orbTier, next, K: 12, topN: 6 });
  worker.postMessage({ type: 'solve', reqId, goal: true, weights: effectiveWeights(c), availableSeries: DATA.armor.series.map(s => s.name), rarityCap: 12, orbTier: 6, next: [], K: 12, topN: 3 });
}

let lastBase = 0;
function onWorkerMessage(e) {
  const msg = e.data;
  if (msg.reqId !== reqId) return;
  if (msg.goal) { if (msg.type === 'result') renderGoal(msg); return; }
  if (msg.type === 'result') { renderResult(msg); $('#nextList').innerHTML = ''; $('#nextList').append(el('li', { class: 'empty', text: '伸びしろを計算中…' })); }
  if (msg.type === 'next') renderNext(msg.next);
}

function rarityClass(r) { return r >= 8 ? 'top' : r >= 6 ? 'high' : r >= 4 ? 'mid' : 'low'; }
function isLog() { const c = currentChar(); return c && c.scoreMode === 'log'; }
// スコア表示：倍率モデルのキャラは ×1.42、それ以外は +42%
function fmtScore(v) { return isLog() ? '×' + Math.exp(v / 100).toFixed(2) : (v >= 0 ? '+' : '') + (Math.round(v * 10) / 10) + '%'; }
function fmtDelta(d) { const v = isLog() ? (Math.exp(d / 100) - 1) * 100 : d; return (v >= 0 ? '+' : '') + (Math.round(v * 10) / 10) + '%'; }
function fmtPct(v) { return fmtScore(v); }

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
  lastBase = b.score;
  $('#scoreValue').textContent = fmtScore(b.score);
  $('#scoreLabel').textContent = isLog() ? '想定ダメージ倍率（スキル無し比）' : '火力スキル合計（目安）';
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
    const orb = p.orbTier ? `（生産に狩魂玉${ROMAN[p.orbTier] || p.orbTier}）` : '';
    if (p.rarity > p.baseRarity) lbl.append('生産レア', String(p.baseRarity), ' → ', el('b', { class: 'need', text: `レア${p.rarity}まで強化` }), orb);
    else lbl.append(el('b', { text: `レア${p.rarity}` }), '（生産のまま）', orb);
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
      el('span', { class: 'altScore', text: fmtScore(a.score) }),
      el('span', { text: a.totals.filter(t => t.value > 0).map(t => `${t.skill}${t.lv}`).join('・') || '―' }),
      el('ul', {}, ...a.pieces.map(p => el('li', { text: `${PART_JP[p.part]} ${p.name}${p.rarity > p.baseRarity ? `（レア${p.rarity}）` : ''}` })))));
  }
  if (!res.alts.length) alts.append(el('div', { class: 'empty', text: '候補はこの1通りです。' }));
}

function renderNext(res) {
  const nl = $('#nextList'); nl.innerHTML = '';
  const nexts = (res.monsters || []).slice(0, 8);
  for (const x of (res.extras || [])) {
    if (x.delta < 0.05) continue;
    const [kind, v] = x.label.split(':');
    const label = kind === 'orb' ? `狩魂玉${ROMAN[+v] || v}が手に入ったら` : `強化上限をレア${v}にしたら`;
    nl.append(el('li', { class: 'next' },
      el('span', { class: 'nname', text: label }),
      el('span', { class: 'delta', text: fmtDelta(x.delta) }),
      el('span', { class: 'why', text: `セット：${x.changed.join('・')}` })));
  }
  for (const n of nexts) {
    const flat = n.delta < 0.05;
    nl.append(el('li', { class: 'next' + (flat ? ' flat' : '') },
      el('span', { class: 'nname', text: n.monster }),
      el('span', { class: 'delta', text: flat ? '変化なし' : fmtDelta(n.delta) }),
      el('span', { class: 'why', text: flat ? 'いまのセットは変わりません' : `入れ替わる部位：${n.changed.join('・') || '―'}` })));
  }
  if (!nexts.length) nl.append(el('li', { class: 'empty', text: '未討伐のモンスターがありません。' }));
}

function renderGoal(res) {
  const box = $('#goalBody'); box.innerHTML = '';
  if (!res.best) { box.append(el('div', { class: 'empty', text: '計算できませんでした。' })); return; }
  const b = res.best;
  const skills = b.totals.filter(t => t.value > 0).map(t => `${t.skill} Lv${t.lv}`).join('・');
  const gain = lastBase ? fmtDelta(b.score - lastBase) : '';
  box.append(el('div', { class: 'goal' },
    el('div', {}, el('span', { class: 'gScore', text: fmtScore(b.score) }), gain ? el('span', { class: 'hint', text: `　いまのセットから${gain}` }) : null),
    el('div', { text: skills || '―' }),
    el('ul', {}, ...b.pieces.map(p => el('li', { text: `${PART_JP[p.part]} ${p.name}${p.rarity > p.baseRarity ? `（レア${p.rarity}）` : ''}` })))));
}

document.addEventListener('DOMContentLoaded', init);
