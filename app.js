/* 融光工房 ― UI */
'use strict';
const APP_VERSION = '2026.11.09-5';
const STORE_KEY = 'mho-equip:v1';
const PART_JP = { head: '頭', body: '胴', arm: '腕', waist: '腰', leg: '脚' };
const EL_CLASS = { '火': 'fire', '水': 'water', '雷': 'thunder', '氷': 'ice', '龍': 'dragon', '毒': 'poison', '麻痺': 'para', '睡眠': 'sleep', '爆破': 'blast', '無': 'none' };
const ICON = {
  weapon: '<path d="M19 3l2 2-10.5 10.5-2-2zM8.5 13.5l2 2M5 15l4 4M3.5 20.5l3-3"/>',
  head: '<path d="M5 15a7 7 0 0 1 14 0v2H5z"/><path d="M12 8v4M8 17v3M16 17v3"/>',
  body: '<path d="M8 4h8l4 3-2 4-2-1v10H8V10l-2 1-2-4z"/><path d="M12 4v16"/>',
  arm: '<path d="M8 3h6v9l3 2v4l-4 3H9l-2-4z"/><path d="M8 9h6"/>',
  waist: '<path d="M3 9h18v5H3z"/><path d="M10 9v5h4V9M7 14l-1 5M17 14l1 5"/>',
  leg: '<path d="M9 3h6v10l2 6H7l2-6z"/><path d="M9 9h6"/>',
};
const svgIcon = (k) => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '1.7'); s.setAttribute('stroke-linejoin', 'round'); s.setAttribute('stroke-linecap', 'round'); s.innerHTML = ICON[k]; return s; };

const $ = (sel) => document.querySelector(sel);
const el = (tag, attrs = {}, ...children) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v; else if (k === 'style') n.setAttribute('style', v); else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v);
  }
  for (const c of children) if (c != null && c !== false) n.append(c);
  return n;
};
const fmtInt = (v) => Math.round(v).toLocaleString('ja-JP');

const state = loadState();
let DATA = null;
let worker = null;
let reqId = 0;
const cur = { armor: null, goal: null, weapon: null, goalWeapon: null, elemDps: {} };

function loadState() {
  const def = { char: 'hero', heroWeapon: 'hbg', heroElement: '火', rank: 1, target: 'normal' };
  let st;
  try { st = Object.assign(def, JSON.parse(localStorage.getItem(STORE_KEY) || '{}')); } catch { st = def; }
  if (st.charId) { if (st.charId.startsWith('hero_')) { st.char = 'hero'; st.heroWeapon = st.charId.slice(5); } else st.char = st.charId; delete st.charId; }
  for (const k of ['defeated', 'tune', 'map', 'orbTier', 'guildLv']) delete st[k];
  return st;
}
function saveState() { try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch {} }

async function loadData() {
  const q = `?v=${APP_VERSION}`;
  const [armor, skills, monsters, characters] = await Promise.all(
    ['armor', 'skills', 'monsters', 'characters'].map(n => fetch(`data/${n}.json${q}`).then(r => { if (!r.ok) throw new Error(n); return r.json(); }))
  );
  const [weapons, builds] = await Promise.all(['weapons', 'builds'].map(n => fetch(`data/${n}.json${q}`).then(r => (r.ok ? r.json() : null)).catch(() => null)));
  return { armor, skills, monsters, characters, weapons, builds };
}

function init() {
  loadData().then((d) => {
    DATA = d;
    $('#dataDate').textContent = `データ更新日 ${d.armor.updated || ''}`;
    if (!currentChar()) { state.char = 'hero'; state.heroWeapon = 'hbg'; }
    worker = new Worker('solver.js?v=' + APP_VERSION);
    worker.onmessage = onWorkerMessage;
    worker.postMessage({ type: 'init', armor: d.armor, skills: d.skills });
    renderChars();
    renderRank(true);
    bindControls();
    renderMenu();
    renderPriorities();
    solve();
  }).catch((err) => {
    $('#resultHint').textContent = `データを読み込めませんでした（${err.message}）。通信状態を確認して開き直してください。`;
  });
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
}

/* ---------- menu / help ---------- */
function setMenu(open) { $('#menu').hidden = !open; $('#menuBack').hidden = !open; $('#menuBtn').setAttribute('aria-expanded', String(open)); }
function setHelp(open) { $('#helpSheet').hidden = !open; $('#helpBack').hidden = !open; }
function renderMenu() {
  $('#menuBtn').addEventListener('click', () => setMenu($('#menu').hidden));
  $('#menuBack').addEventListener('click', () => setMenu(false));
  document.querySelectorAll('#menu a.menuItem').forEach(a => a.addEventListener('click', () => setMenu(false)));
  $('#menuReset').addEventListener('click', () => {
    setMenu(false);
    if (!confirm('キャラ・ランクの選択を初期状態に戻します。いい？')) return;
    for (const k of Object.keys(state)) delete state[k];
    Object.assign(state, { char: 'hero', heroWeapon: 'hbg', heroElement: '火', rank: 1, target: 'normal' });
    saveState(); renderRank(true); renderTarget(); renderChars(); renderPriorities(); solve();
  });
  $('#menuHelp').addEventListener('click', () => { setMenu(false); setHelp(true); });
  $('#helpBack').addEventListener('click', () => setHelp(false));
  $('#helpClose').addEventListener('click', () => setHelp(false));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { setMenu(false); setHelp(false); } });
}

/* ---------- characters ---------- */
const HERO_WEAPONS = [['gs', '大剣'], ['ls', '太刀'], ['db', '双剣'], ['lance', 'ランス'], ['hammer', 'ハンマー'], ['cb', 'チャアク'], ['hbg', 'ヘビィ'], ['bow', '弓']];
const HERO_ELEMENTS = ['火', '水', '雷', '氷', '龍'];
const CHAR_ORDER = ['pepe', 'midori', 'luca', 'cless', 'ensho', 'akenia', 'lord', 'haze', 'raya', 'madre', 'folio', 'brix', 'ryunosuke'];
const SHORT_WEAPON = { 'ヘビィボウガン': 'ヘビィ', 'チャージアックス': 'チャアク' };
const WEAPON_TYPE = { hbg: 'ヘビィボウガン', ls: '太刀', gs: '大剣', db: '双剣', lance: 'ランス', hammer: 'ハンマー', cb: 'チャージアックス', bow: '弓' };
function heroElement() { return HERO_ELEMENTS.includes(state.heroElement) ? state.heroElement : '火'; }
function charId() { return state.char === 'hero' ? `hero_${state.heroWeapon}` : state.char; }
function currentChar() { return DATA.characters.characters.find(c => c.id === charId()); }
function charElement(c) { return c.elementSelectable ? heroElement() : (c.element || '無'); }
function charWeaponType(c) { return c.elementSelectable ? WEAPON_TYPE[state.heroWeapon] : c.weapon; }
function uniqueChars() {
  const pos = (id) => { const i = CHAR_ORDER.indexOf(id); return i < 0 ? 99 : i; };
  return DATA.characters.characters.filter(c => !c.id.startsWith('hero_')).sort((a, b) => pos(a.id) - pos(b.id));
}
function selectChar(next) { Object.assign(state, next); saveState(); cur.elemDps = {}; renderChars(); renderPriorities(); solve(); }
function ctab(label, selected, onclick, elem, sub, extra) {
  return el('button', { type: 'button', class: 'ctab' + (elem ? ' hasEl' : ''), role: 'tab', 'aria-selected': String(selected), onclick, style: elem ? `--tab-el: var(--el-${EL_CLASS[elem] || 'none'})` : '' },
    el('span', { class: 'ctabName', text: label }), sub ? el('span', { class: 'ctabSub', text: sub }) : null, extra || null);
}
function renderChars() {
  const box = $('#charTabs'); box.innerHTML = '';
  const hw = (HERO_WEAPONS.find(w => w[0] === state.heroWeapon) || [, ''])[1];
  box.append(ctab('主人公', state.char === 'hero', () => selectChar({ char: 'hero' }), heroElement(), `${hw}・${heroElement()}`));
  for (const c of uniqueChars()) box.append(ctab(c.name, state.char === c.id, () => selectChar({ char: c.id }), c.element, `${SHORT_WEAPON[c.weapon] || c.weapon}・${c.element}`));
  $('#heroSel').hidden = state.char !== 'hero';
  if (state.char === 'hero') {
    const wt = $('#weaponTabs'); wt.innerHTML = '';
    for (const [id, label] of HERO_WEAPONS) wt.append(ctab(label, state.heroWeapon === id, () => selectChar({ heroWeapon: id })));
    renderElementTabs();
  }
}
function renderElementTabs() {
  const et = $('#elementTabs'); et.innerHTML = '';
  const vals = HERO_ELEMENTS.map(e => cur.elemDps[e]).filter(v => v != null);
  const best = vals.length === HERO_ELEMENTS.length ? Math.max(...vals) : null;
  for (const e of HERO_ELEMENTS) {
    const v = cur.elemDps[e];
    const tab = ctab(e, heroElement() === e, () => selectChar({ heroElement: e }), e, null,
      el('span', { class: 'ctabDps', text: v != null ? (v ? fmtInt(v) : '―') : '…' }));
    if (best && v && Math.abs(v - best) < 0.5) tab.append(el('span', { class: 'crown', text: '最大' }));
    et.append(tab);
  }
}

/* ---------- ダメージモデル ---------- */
function skillDef(name) { return DATA.skills.skills.find(s => s.name === name.replace('{属性}', '火')); }
function modelWeights(c, yuko) {
  const m = c.model, e = m.elementShare ?? 0.35;
  // 属性ダメージUP が乗る割合。攻略サイトの終盤装備がどの武器種も属性ダメージUP Lv7 を最優先しているのに合わせて別に持つ
  const eUp = m.elemUpShare ?? e;
  const wE = m.weaponElement || 600, critPer = m.critPerPct ?? 0.004, critRate = m.critRate ?? 0.3;
  const out = {};
  for (const [name, sp] of Object.entries(c.modelSkills)) {
    const sk = skillDef(name); const levels = (sk && sk.levels) || [];
    const up = sp.uptime ?? 1, share = sp.share ?? 1;
    let arr = levels.map((l) => {
      const pct = l.pct || 0, p = ((yuko ? (l.pctYuko ?? pct) : pct) || 0) / 100;
      let mm;
      switch (sp.kind) {
        case 'element': mm = (1 + p * eUp) * (1 + p * (sp.core || 0)); break;
        case 'crit': mm = 1 + pct * up * critPer; break;
        case 'elemCrit': mm = 1 + p * critRate * e; break;
        case 'proc': mm = 1 + (sp.chance ?? 0.75) * p * up; break;
        case 'flat': mm = 1 + p * (sp.value ?? 0.3); break;
        case 'fixed': mm = 1 + (sp.value ?? 0.03) * (l.lv || 1); break;
        default: mm = 1 + p * up * share;
      }
      if (l.flat) mm *= 1 + (l.flat / wE) * e;
      return 100 * Math.log(mm);
    });
    if (!arr.length) arr = Array.from({ length: (sk && sk.maxLv) || 1 }, (_, i) => (sp.fallback ?? 0.5) * (i + 1));
    out[name] = arr;
  }
  return out;
}
function weightsFor(c, elem) {
  const yuko = state.target === 'yuko';
  const w = Object.assign({}, (yuko && c.weightsYuko) ? c.weightsYuko : (c.weights || {}));
  if (c.modelSkills && c.model) Object.assign(w, modelWeights(c, yuko));
  if (!c.elementSelectable) return w;
  const out = {};
  for (const [k, v] of Object.entries(w)) out[k.replace('{属性}', elem)] = v;
  return out;
}
const effectiveWeights = (c) => weightsFor(c, heroElement());
const mult = (score) => Math.exp((score || 0) / 100);
const gainPct = (w) => (mult(w) - 1) * 100;
const fmtGain = (w) => { const v = gainPct(w); return (v >= 0 ? '+' : '') + (v < 10 ? v.toFixed(1) : Math.round(v)) + '%'; };
const fmtPct = (v) => (v >= 0 ? '+' : '') + (Math.abs(v) < 10 ? v.toFixed(1) : Math.round(v)) + '%';

/* ---------- ランクで決まること ---------- */
function rankCap(rank = state.rank) {
  let cap = 2;
  for (const [r, c] of (DATA.monsters.rankCap || [])) if (rank >= r) cap = c;
  return cap;
}
function orbTierFor(cap) {
  const t = DATA.monsters.orbCap || {};
  for (let i = 1; i <= 6; i++) if ((t[i] || t[String(i)] || 0) >= cap) return i;
  return 6;
}
function monsterOpen(name, rank) { const m = DATA.monsters.monsters.find(x => x.name === name); return !m || m.unlockRank == null || m.unlockRank <= rank; }
function mapOpen(name, rank) { const m = DATA.monsters.maps.find(x => x.name === name); return !m || m.unlockRank == null || m.unlockRank <= rank; }
function availableSeries(rank = state.rank) {
  return DATA.armor.series.filter((s) => {
    const g = s.gate || { type: 'basic' };
    if (g.type === 'monster') return (g.monsters || [g.monster]).some(n => monsterOpen(n, rank));
    if (g.type === 'map') return mapOpen(g.map, rank);
    return true;
  }).map(s => s.name);
}
function milestones() {
  const now = new Set(availableSeries());
  const ranks = new Set();
  for (const [r] of (DATA.monsters.rankCap || [])) if (r > state.rank) ranks.add(r);
  for (const m of DATA.monsters.monsters) if (m.unlockRank != null && m.unlockRank > state.rank && m.armorSeries.length) ranks.add(m.unlockRank);
  return [...ranks].sort((a, b) => a - b).slice(0, 7).map((r) => {
    const cap = rankCap(r);
    const newMon = DATA.monsters.monsters.filter(m => m.unlockRank === r && m.armorSeries.some(sn => !now.has(sn))).map(m => m.name);
    const why = [];
    if (cap > rankCap(r - 1)) why.push(`レア${cap}まで強化`);
    if (newMon.length) why.push(newMon.join('・'));
    return { rank: r, label: `ランク${r}`, why: why.join('／'), series: availableSeries(r), rarityCap: cap, orbTier: orbTierFor(cap) };
  });
}

/* ---------- 武器 ---------- */
function weaponStatsAt(w, r) {
  const st = w.stats || {};
  if (st[r]) return st[r];
  const keys = Object.keys(st).map(Number).filter(k => k <= r).sort((a, b) => b - a);
  return keys.length ? st[keys[0]] : null;
}
// 武器の実効攻撃力：攻撃力×物理の割合×会心補正 ＋ 属性値×属性の割合（属性値は攻撃力の約半分なので×2で同じ尺度に）
function weaponPower(c, w, st) {
  const e = (c.model && c.model.elementShare) || 0.35;
  const aff = (st.affinity ?? w.affinity ?? 0) / 100;
  const yuko = state.target === 'yuko' && w.yukoBonus ? 1 + w.yukoBonus : 1; // 鋭精武器の「融光種へのダメージ+8%」
  return ((st.attack || 0) * (1 + aff * 0.25) * (1 - e) + (st.element || 0) * 2 * e) * yuko;
}
function weaponCands(c, { rank = state.rank, cap = null, elem = charElement(c) } = {}) {
  const list = (DATA.weapons && DATA.weapons.weapons) || [];
  const type = charWeaponType(c);
  const rc = cap || rankCap(rank);
  const out = [];
  for (const w of list) {
    if (w.type !== type || w.element !== elem) continue;
    if ((w.baseRarity || 1) > rc) continue;
    if (w.minRank && rank < w.minRank) continue; // 鋭精武器は冒険ランク40＋6章クリアの鋭精チャレンジから
    if (!(w.monsters || []).every(m => monsterOpen(m, rank))) continue;
    const r = Math.min(w.maxRarity || rc, rc);
    const st = weaponStatsAt(w, r);
    if (!st) continue;
    out.push({ w, r, st, power: weaponPower(c, w, st) });
  }
  // 赤羽（冒険団）武器は数値上は同レアの武器と並ぶが、攻略サイトの終盤装備では1本も採用されておらず実戦では弱い。
  // ほかに作れる武器があるときは後ろに回す
  return out.sort((a, b) => (a.w.guild - b.w.guild) || (b.power - a.power));
}
const BASE_POWER = 100; // 武器データが無いときの仮の値

/* ---------- controls ---------- */
function renderRank(syncInput) {
  const r = $('#rank');
  if (syncInput) r.value = state.rank;
  $('#rankVal').textContent = state.rank;
  r.style.setProperty('--p', `${((state.rank - 1) / 59) * 100}%`);
  const step = (DATA.monsters.rankCap || []).find(([rr]) => rr > state.rank);
  const cn = $('#capNote'); cn.innerHTML = '';
  cn.append('レア', el('b', { text: String(rankCap()) }), 'まで強化できる', step ? `（ランク${step[0]}でレア${step[1]}）` : '');
  // 目盛り：強化上限が上がるランク（数字付き◆）と、新しい防具が作れるランク（◆）
  const ticks = $('#rankTicks'); ticks.innerHTML = '';
  const capRanks = new Map((DATA.monsters.rankCap || []).map(([rr, c]) => [rr, c]));
  const monRanks = new Set(DATA.monsters.monsters.filter(m => m.armorSeries.length && m.unlockRank > 1).map(m => m.unlockRank));
  for (const rr of new Set([...capRanks.keys(), ...monRanks])) {
    const isCap = capRanks.has(rr);
    ticks.append(el('span', { class: 'tick' + (isCap ? ' cap' : '') + (rr <= state.rank ? ' passed' : ''), style: `left: ${((rr - 1) / 59) * 100}%`, title: isCap ? `ランク${rr}でレア${capRanks.get(rr)}` : `ランク${rr}で新しい防具` }, el('i')));
  }
}
function renderTarget() {
  document.body.classList.toggle('yuko', state.target === 'yuko');
  document.querySelectorAll('#targetTabs .tsw').forEach(b => b.setAttribute('aria-selected', String((state.target || 'normal') === b.dataset.target)));
}
function bindControls() {
  let t = null;
  const apply = (v, live) => {
    state.rank = Math.min(60, Math.max(1, v));
    renderRank(!live);
    clearTimeout(t); t = setTimeout(() => { saveState(); cur.elemDps = {}; if (state.char === 'hero') renderElementTabs(); solve(); }, live ? 280 : 0);
  };
  $('#rank').addEventListener('input', (e) => apply(+e.target.value, true));
  document.querySelectorAll('.nudge').forEach(b => b.addEventListener('click', () => apply(state.rank + (+b.dataset.nudge), false)));
  document.querySelectorAll('#targetTabs .tsw').forEach(b => b.addEventListener('click', () => {
    state.target = b.dataset.target; saveState(); renderTarget(); cur.elemDps = {}; if (state.char === 'hero') renderElementTabs(); renderPriorities(); solve();
  }));
  renderTarget();
}

/* ---------- solving ---------- */
function solve() {
  if (!worker || !DATA) return;
  const c = currentChar();
  reqId++;
  cur.armor = null; cur.goal = null;
  cur.weapon = weaponCands(c)[0] || null;
  cur.goalWeapon = weaponCands(c, { rank: 99, cap: 14 })[0] || null;
  $('#meterWho').textContent = `${c.elementSelectable ? `主人公・${SHORT_WEAPON[charWeaponType(c)] || charWeaponType(c)}` : c.name}・${charElement(c)}　ランク${state.rank}`;
  $('#resultHint').textContent = '計算中…';
  for (const id of ['#compareList', '#nextList']) { $(id).innerHTML = ''; $(id).append(el('li', { class: 'empty', text: '計算中…' })); }
  $('#comparePanel').hidden = c.scoreMode !== 'log';
  renderWeapon(c);
  const W = effectiveWeights(c);
  worker.postMessage({ type: 'solve', reqId, weights: W, availableSeries: availableSeries(), rarityCap: rankCap(), orbTier: orbTierFor(rankCap()), milestones: milestones(), axes: compareAxes(c), topN: 6, K: 12 });
  worker.postMessage({ type: 'solve', reqId, goal: true, weights: W, availableSeries: DATA.armor.series.map(s => s.name), rarityCap: 12, orbTier: 6, topN: 1, K: 12 });
  postBuilds(c, W);
  if (c.elementSelectable) {
    for (const e of HERO_ELEMENTS) {
      worker.postMessage({ type: 'solve', reqId, elem: e, weights: weightsFor(c, e), availableSeries: availableSeries(), rarityCap: rankCap(), orbTier: orbTierFor(rankCap()), topN: 1, K: 10 });
    }
  }
}

/* ---------- 攻略サイトの構成DB ---------- */
function dbBuildsFor(c) {
  const all = (DATA.builds && DATA.builds.builds) || [];
  const elem = charElement(c);
  return all.filter(b => b.charId === c.id && (!c.elementSelectable || !b.element || b.element === elem));
}
function postBuilds(c, W) {
  const list = dbBuildsFor(c);
  cur.dbList = list;
  if (!list.length) { renderBuilds([]); return; }
  worker.postMessage({ type: 'evalBuilds', reqId, weights: W, rarityCap: rankCap(),
    builds: list.map(b => ({ key: b.id, pieces: PARTS.map(part => (b.pieces[part] && b.pieces[part].id) || null) })) });
}
const PARTS = ['head', 'body', 'arm', 'waist', 'leg'];
const seriesOfPiece = (() => { let m = null; return (id) => {
  if (!m) { m = new Map(); for (const s of DATA.armor.series) for (const p of s.pieces) m.set(p.id, s.name); }
  return m.get(id);
}; })();
function weaponOpen(w, rank) {
  return (w.baseRarity || 1) <= rankCap(rank) && (!w.minRank || rank >= w.minRank) && (w.monsters || []).every(m => monsterOpen(m, rank));
}
// その構成の防具・武器が全部作れるようになるランク
function buildOpenRank(b) {
  const weapon = b.weapon && b.weapon.name ? DATA.weapons.weapons.find(w => w.name === b.weapon.name) : null;
  for (let r = 1; r <= 60; r++) {
    const avail = new Set(availableSeries(r));
    const armorOk = PARTS.every(part => { const p = b.pieces[part]; return !p || !p.id || avail.has(seriesOfPiece(p.id)); });
    if (armorOk && (!weapon || weaponOpen(weapon, r))) return r;
  }
  return null;
}
function refLabel(r) {
  const label = r.label && !/おすすめ装備|最強装備/.test(r.label) && r.label !== r.stage ? r.label : null;
  return [r.stage, r.rarityRange ? `レア${r.rarityRange}` : null, label].filter(Boolean).join('・');
}
// 同じサイトの同じ見出し（キャラページとまとめページの再掲など）は1つにまとめる
function uniqRefs(refs) {
  const seen = new Set();
  return refs.filter(r => { const k = r.source + '|' + (r.label || refLabel(r)); if (seen.has(k)) return false; seen.add(k); return true; });
}
function renderBuilds(rows) {
  const box = $('#dbList'); box.innerHTML = '';
  const oldMore = document.getElementById('dbMore'); if (oldMore) oldMore.remove();
  const c = currentChar();
  const list = cur.dbList || [];
  const hint = $('#dbHint');
  if (!DATA.builds) { hint.textContent = '構成DBがまだありません。'; return; }
  if (!list.length) { hint.textContent = `${c.elementSelectable ? `${charElement(c)}属性の` : ''}${c.name}の構成は、攻略サイトにまだ載っていません。下の「計算で組んだ最強装備」を見てください。`; return; }
  const byKey = new Map(rows.map(r => [r.key, r]));
  const cap = rankCap();
  const items = list.map((b) => {
    const row = byKey.get(b.id);
    const openAt = buildOpenRank(b);
    let wdef = b.weapon && b.weapon.name ? DATA.weapons.weapons.find(w => w.name === b.weapon.name) : null;
    // サイトが派生前の名前で載せている武器（融光種アクアアサルト → 融光種ウォーターキャノンなど）は、強化先までたどる
    const wbase = wdef;
    for (let i = 0; wdef && i < 4 && (wdef.maxRarity || 0) < cap; i++) {
      const next = DATA.weapons.weapons.find(w => w.derivesFrom === wdef.name);
      if (!next) break;
      wdef = next;
    }
    let wc = null;
    if (wdef) { const r = Math.min(wdef.maxRarity || cap, cap); const st = weaponStatsAt(wdef, Math.max(r, wdef.baseRarity || 1)); if (st) wc = { w: wdef, r: Math.max(r, wdef.baseRarity || 1), st, power: weaponPower(c, wdef, st) }; }
    // 武器の高レアの数値はサイトにそろっていないので、DPS目安は武器を「今作れる一番強い武器」にそろえて防具だけで比べる
    const dps = row ? dpsOf(cur.weapon, row.score) : 0;
    const cost = ((row && row.set && row.set.pieces) || []).reduce((t, p) => t + (p.rarity - p.baseRarity), 0);
    return { b, row, openAt, wc, wbase, dps, cost, now: openAt != null && openAt <= state.rank };
  });
  // DPS目安が同じなら、複数サイトに載っている構成 → 強化の少ない構成の順
  items.sort((a, b) => (b.now - a.now) || (a.now ? (Math.round(b.dps) - Math.round(a.dps)) || (b.b.sourceCount - a.b.sourceCount) || (a.cost - b.cost)
    : (a.openAt || 99) - (b.openAt || 99)));
  const nNow = items.filter(x => x.now).length;
  hint.textContent = `Game8・GameWith・アルテマ・Gamerch などに載っている${c.elementSelectable ? `${charElement(c)}属性の` : ''}${c.name}の構成 ${items.length}件。今のランクで作れる ${nNow}件を、防具をレア${cap}まで強化したときのDPS目安の順に並べています（スキルは今の強化上限で付く分。武器はどの構成も${cur.weapon ? cur.weapon.w.name : '同じ武器'}でそろえて比較）。`;
  const SHOW = 5;
  let more = null;
  items.forEach((x, idx) => {
    if (idx === SHOW) {
      more = el('ol', { class: 'dbList' });
      box.after(el('details', { class: 'dbMore', id: 'dbMore' }, el('summary', { text: `ほかの構成 ${items.length - SHOW}件（今は作れないものを含む）` }), more));
    }
    const target = more || box;
    const { b, row } = x;
    const head = el('div', { class: 'dbHead' },
      el('div', { class: 'dbRefs' }, ...uniqRefs(b.refs).map(r => el('span', { class: 'dbSrc' }, el('b', { text: r.source }), refLabel(r) ? ` ${refLabel(r)}` : '')),
        b.sourceCount > 1 ? el('span', { class: 'badge agree', text: `${b.sourceCount}サイト一致` }) : null),
      x.now && row ? el('span', { class: 'dbDps' }, fmtInt(x.dps), el('small', { text: 'DPS目安' })) : el('span', { class: 'dbLock', text: x.openAt ? `ランク${x.openAt}から` : '作れる条件不明' }));
    const wname = b.weapon ? (x.wc && x.wbase && x.wc.w !== x.wbase ? `${x.wbase.name} → ${x.wc.w.name}` : (b.weapon.name || b.weapon.raw)) : '―';
    const wline = el('div', { class: 'dbWeapon' }, el('span', { class: 'dbPart', text: '武器' }), el('span', { class: 'dbName', text: wname }),
      x.wc ? el('span', { class: 'dbRar' + (x.wc.r > (x.wc.w.baseRarity || 1) ? ' need' : ''), text: (x.wc.r > (x.wc.w.baseRarity || 1) ? `レア${x.wc.w.baseRarity}→${x.wc.r}` : `レア${x.wc.r}`) + (x.wc.st.est ? '（数値は推定）' : x.wc.r < cap && (x.wc.w.maxRarity || 0) < cap ? '（ここまで）' : '') })
        : el('span', { class: 'dbRar warn', text: '数値データなし' }));
    // 防具が同じでサイトによって武器が違うとき
    const wname0 = b.weapon ? (b.weapon.name || b.weapon.raw) : null;
    const otherW = new Map();
    for (const r of b.refs) if (r.weapon && r.weapon !== wname0) { const k = r.weapon; otherW.set(k, [...new Set([...(otherW.get(k) || []), r.source])]); }
    const wAlt = otherW.size ? el('p', { class: 'dbWalt', text: 'ほかのサイトの武器：' + [...otherW].map(([n, srcs]) => `${n}（${srcs.join('・')}）`).join('、') }) : null;
    const pieceInfo = new Map(((row && row.set && row.set.pieces) || []).map(p => [p.id, p]));
    const avail = new Set(availableSeries());
    const plist = el('ul', { class: 'dbPieces' });
    for (const part of PARTS) {
      const p = b.pieces[part];
      const info = p && p.id ? pieceInfo.get(p.id) : null;
      const locked = p && p.id && !avail.has(seriesOfPiece(p.id));
      plist.append(el('li', { class: locked ? 'locked' : '' }, el('span', { class: 'dbPart', text: PART_JP[part] }),
        el('span', { class: 'dbName', text: p ? (p.name || p.raw) : '―' }),
        info && !locked ? el('span', { class: 'dbRar' + (info.rarity > info.baseRarity ? ' need' : ''), text: info.rarity > info.baseRarity ? `レア${info.baseRarity}→${info.rarity}` : `レア${info.rarity}` })
          : el('span', { class: 'dbRar warn', text: locked ? 'まだ作れない' : (p && !p.id ? 'データなし' : '') })));
    }
    const tags = el('div', { class: 'tags' });
    for (const t of ((row && row.set && row.set.totals) || []).filter(t => t.value > 0.3 || t.skill === '弾導強化').slice(0, 7)) {
      tags.append(el('span', { class: 'tag hit' }, t.skill, el('span', { class: 'lv', text: String(t.lv) })));
    }
    // 攻略サイトに載っているスキルLvに、今の強化上限ではまだ届かない分
    const have = new Map(((row && row.set && row.set.totals) || []).map(t => [t.skill, t.lv]));
    const want = new Map();
    for (const r of b.refs) for (const k of r.skills || []) if (k.lv) want.set(k.skill, Math.max(want.get(k.skill) || 0, k.lv));
    const Wc = effectiveWeights(c);
    const gap = [...want].filter(([k, lv]) => (have.get(k) || 0) < lv && Wc[k] && (Wc[k][lv - 1] || 0) > 0.3)
      .map(([k, lv]) => `${k} ${have.get(k) || 0}/${lv}`);
    const gapLine = x.now && row && gap.length ? el('p', { class: 'dbGap', text: `攻略サイトの想定（${b.refs[0].rarityRange ? `レア${b.refs[0].rarityRange}` : '最大強化'}）まであと：${gap.join('・')}。強化上限が上がると揃う` }) : null;
    const det = el('details', { class: 'dbDet' }, el('summary', { text: '攻略サイトの解説・スキル' }),
      ...uniqRefs(b.refs).map(r => el('div', { class: 'dbRef' },
        el('p', { class: 'dbRefHead' }, el('b', { text: r.source }), ` ${refLabel(r)}`, r.updated ? el('span', { class: 'muted', text: `（${String(r.updated).slice(0, 10)}）` }) : null),
        r.weapon ? el('p', { class: 'dbRefSk', text: `武器：${r.weapon}` }) : null,
        r.skills && r.skills.length ? el('p', { class: 'dbRefSk', text: '掲載スキル：' + r.skills.map(k => `${k.skill}${k.lv ?? ''}`).join('・') }) : null,
        r.comment ? el('p', { class: 'dbRefCm', text: r.comment }) : null,
        r.url ? el('a', { href: r.url, target: '_blank', rel: 'noopener', text: '出典ページを開く' }) : null)));
    target.append(el('li', { class: 'dbCard' + (x.now ? '' : ' future') }, head, wline, wAlt, plist, x.now ? tags : null, gapLine, det));
  });
}

function onWorkerMessage(e) {
  const msg = e.data;
  if (msg.reqId !== reqId) return;
  if (msg.elem) { if (msg.type === 'result') onElemResult(msg); return; }
  if (msg.goal) { if (msg.type === 'result') { cur.goal = msg.best; renderGoal(); renderMeter(); } return; }
  if (msg.type === 'builds') { renderBuilds(msg.rows); return; }
  if (msg.type === 'result') { cur.armor = msg.best; renderResult(msg); renderMeter(); }
  if (msg.type === 'next') renderNext(msg.next);
  if (msg.type === 'compare') renderCompare(msg.rows);
}
function onElemResult(msg) {
  const c = currentChar();
  const wb = weaponCands(c, { elem: msg.elem })[0];
  cur.elemDps[msg.elem] = msg.best && wb ? wb.power * mult(msg.best.score) : 0;
  if (state.char === 'hero') renderElementTabs();
}

const dpsOf = (weapon, armorScore) => (weapon ? weapon.power : BASE_POWER) * mult(armorScore);

/* ---------- DPS meter ---------- */
let shownDps = 0, animFrame = null;
function animateNumber(target) {
  const node = $('#dpsNum');
  cancelAnimationFrame(animFrame);
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || !shownDps) { shownDps = target; node.textContent = fmtInt(target); return; }
  const from = shownDps, t0 = performance.now(), dur = 520;
  const step = (now) => {
    const k = Math.min(1, (now - t0) / dur), ease = 1 - Math.pow(1 - k, 3);
    shownDps = from + (target - from) * ease; node.textContent = fmtInt(shownDps);
    if (k < 1) animFrame = requestAnimationFrame(step);
  };
  animFrame = requestAnimationFrame(step);
}
function renderMeter() {
  if (!cur.armor) return;
  const dps = dpsOf(cur.weapon, cur.armor.score);
  animateNumber(dps);
  const calc = $('#dpsCalc'); calc.innerHTML = '';
  calc.append('武器 ', el('b', { text: cur.weapon ? fmtInt(cur.weapon.power) : '―' }), ' × スキル ', el('b', { text: '×' + mult(cur.armor.score).toFixed(2) }));
  if (state.target === 'yuko') calc.append('（融光種相手）');
  if (cur.goal) {
    const goal = dpsOf(cur.goalWeapon, cur.goal.score);
    $('#gaugeFill').style.width = `${Math.max(2, Math.min(100, (dps / goal) * 100))}%`;
    $('#gaugeNote').textContent = `到達点 ${fmtInt(goal)} まで ${Math.round((dps / goal) * 100)}%`;
  }
}

/* ---------- loadout ---------- */
function rarityClass(r) { return r >= 8 ? 'top' : r >= 6 ? 'high' : r >= 4 ? 'mid' : 'low'; }
function rarDiamonds(rarity, max, label) {
  const rar = el('div', { class: 'rar' });
  for (let r = 1; r <= max; r++) {
    const d = el('span', { class: 'd' + (r <= rarity ? ' on' : '') });
    if (r <= rarity) d.style.background = `var(--r-${rarityClass(r)})`;
    rar.append(d);
  }
  rar.append(label);
  return rar;
}
function renderWeapon(c) {
  const box = $('#weaponSlot'); box.innerHTML = '';
  if (!DATA.weapons) return;
  const b = cur.weapon;
  if (!b) {
    box.append(el('div', { class: 'slot weapon' }, el('div', { class: 'slotIcon' }, svgIcon('weapon')),
      el('div', { class: 'empty', text: `このランクで作れる${charElement(c)}属性の${charWeaponType(c)}が見つかりません。` })));
    return;
  }
  const { w, r, st } = b;
  const need = r > (w.baseRarity || 1);
  const aff = st.affinity ?? w.affinity;
  const lbl = el('span', { class: 'lbl' }, need ? el('b', { class: 'need', text: `レア${r}まで強化` }) : el('b', { text: `レア${r}` }), st.est ? '（数値は推定）' : '');
  box.append(el('div', { class: 'slot weapon' },
    el('div', { class: 'slotIcon' }, svgIcon('weapon')),
    el('div', {},
      el('div', { class: 'pname' }, w.name, el('span', { class: 'series', text: `${w.type}${w.guild ? '・冒険団武器（鉄鉱石で強化）' : ''}` })),
      rarDiamonds(r, Math.min(w.maxRarity, 14), lbl),
      el('div', { class: 'wstats' },
        el('span', {}, '攻撃', el('b', { text: String(st.attack) })),
        el('span', {}, w.element, el('b', { text: String(st.element || '―') })),
        aff ? el('span', {}, '会心', el('b', { text: `${aff}%` })) : null,
        el('span', {}, '実効', el('b', { text: fmtInt(b.power) }))))));
  if (w.guild) box.append(el('p', { class: 'walt', text: 'このランクで作れるほかの武器が無いので冒険団武器。モンスター武器が作れるようになったら乗り換え推奨' }));
  if (w.apex) {
    const alt = weaponCands(c).find(x => !x.w.apex && !x.w.guild);
    box.append(el('p', { class: 'walt', text: `鋭精武器（鋭精チャレンジの素材で作る。属性は作るときに選び、シーズン0で作れるのは今のところ2本まで）。${w.effect ? w.effect.replace(/【\s*|\s*】/g, '') + '。' : ''}${alt ? `この属性で作っていなければ ${alt.w.name}（レア${alt.r}・実効${fmtInt(alt.power)}）` : ''}` }));
  }
}
function renderResult(res) {
  const rack = $('#rack'); rack.innerHTML = '';
  if (!res.best) {
    $('#resultHint').textContent = 'このランクで作れる防具が見つかりませんでした。';
    $('#skillTotals').innerHTML = ''; $('#altList').innerHTML = '';
    return;
  }
  const b = res.best;
  const needs = b.pieces.filter(p => p.rarity > p.baseRarity);
  const armorById = new Map(DATA.armor.series.flatMap(s => s.pieces.map(q => [q.id, q])));
  // 攻略サイト間で解放レアが割れている部位は、多数決で採った値と各サイトの値を添える
  const conflictNote = (p) => {
    const src = armorById.get(p.id);
    const cs = ((src && src.conflicts) || []).filter(c => c.skill && c.rarity === p.rarity); // 採用したレアでサイトの値が割れている時だけ
    if (!cs.length) return null;
    const seen = new Set(), parts = [];
    for (const c of cs) {
      if (seen.has(c.skill)) continue; seen.add(c.skill);
      const vals = Object.entries(c.values).map(([s, v]) => `${s} Lv${v}`).join('・');
      parts.push(`${c.skill}（レア${c.rarity}：${vals} → Lv${c.chosen}を採用）`);
    }
    return el('div', { class: 'conflict', text: `※サイトで食い違い：${parts.join('、')}` });
  };
  $('#resultHint').textContent = needs.length ? `強化：${needs.map(p => `${p.name}→レア${p.rarity}`).join('、')}` : '全部位、生産したままでOK';
  const capNow = rankCap();
  for (const p of b.pieces) {
    // スキルはレアp.rarityで揃う。それ以上はランクの上限まで強化でき、防御力が上がる（攻略サイトにレアdocMaxより上のスキル情報なし）
    const top = Math.max(p.rarity, capNow);
    const lbl = el('span', { class: 'lbl' }, p.rarity > p.baseRarity ? el('b', { class: 'need', text: `レア${p.baseRarity}→${p.rarity}` }) : el('b', { text: `レア${p.rarity}` }),
      top > p.rarity ? el('span', { class: 'more', text: `　レア${top}まで育つ（${p.docMax < top ? `レア${p.docMax + 1}以降のスキルは攻略サイト未掲載` : '防御力UP'}）` }) : null);
    const tags = el('div', { class: 'tags' });
    for (const k of p.skills) tags.append(el('span', { class: 'tag' + (k.value > 0.3 ? ' hit' : '') }, k.name, el('span', { class: 'lv', text: String(k.lv) })));
    rack.append(el('li', { class: 'slot' },
      el('div', { class: 'slotIcon', title: PART_JP[p.part] }, svgIcon(p.part)),
      el('div', {}, el('div', { class: 'pname' }, p.name), rarDiamonds(p.rarity, top, lbl), tags, conflictNote(p))));
  }
  const tot = $('#skillTotals'); tot.innerHTML = '';
  const shown = b.totals.filter(t => t.value > 0.3);
  for (const t of shown) {
    const info = DATA.skills.skills.find(s => s.name === t.skill);
    const eff = info && info.levels && info.levels[t.lv - 1] ? info.levels[t.lv - 1].effect : '';
    const pips = el('div', { class: 'pips' });
    for (let i = 1; i <= t.max; i++) pips.append(el('span', { class: 'pip' + (i <= t.lv ? (i > t.lv - t.fromSet ? ' set' : ' on') : '') }));
    tot.append(el('div', { class: 'sk' },
      el('span', { class: 'skName' }, t.skill, el('b', { text: `Lv${t.lv}` })),
      el('span', { class: 'gain', text: `DPS ${fmtGain(t.value)}` }), pips, eff ? el('span', { class: 'eff', text: eff }) : null));
  }
  if (b.setHits.length) tot.append(el('p', { class: 'setNote', text: 'セットスキル：' + b.setHits.map(h => `${h.set}（${h.pieces}部位）→${h.skill}+${h.lv}`).join('、') }));
  if (!shown.length) tot.append(el('p', { class: 'empty', text: 'DPSに効くスキルが付く防具がまだありません。' }));
  const alts = $('#altList'); alts.innerHTML = '';
  for (const a of res.alts) {
    alts.append(el('div', { class: 'alt' },
      el('span', { class: 'altScore', text: fmtInt(dpsOf(cur.weapon, a.score)) }),
      el('span', { text: a.totals.filter(t => t.value > 0.3).map(t => `${t.skill}${t.lv}`).join('・') || '―' }),
      el('ul', {}, ...a.pieces.map(p => el('li', { text: `${PART_JP[p.part]} ${p.name}${p.rarity > p.baseRarity ? `（レア${p.rarity}）` : ''}` })))));
  }
  if (!res.alts.length) alts.append(el('p', { class: 'empty', text: '候補はこの1通りです。' }));
}

/* ---------- compare ---------- */
function compareAxes(c) {
  if (c.scoreMode !== 'log' || !c.modelSkills) return [];
  const elemName = charElement(c);
  const W = effectiveWeights(c);
  return (c.priorities || [])
    .filter(p => { const sp = c.modelSkills[p.skill]; return sp && (sp.kind === 'dmg' || sp.kind === 'element'); })
    .map(p => { const key = p.skill.replace('{属性}', elemName); const arr = W[key] || [0]; return { label: key, skill: key, max: arr[arr.length - 1] }; })
    .sort((a, b) => b.max - a.max).slice(0, 5);
}
function renderCompare(rows) {
  const box = $('#compareList'); box.innerHTML = '';
  if (!rows || !rows.length) { box.append(el('li', { class: 'empty', text: '比べられる構成がまだありません。' })); return; }
  const dps = rows.map(r => dpsOf(cur.weapon, r.score));
  const top = Math.max(...dps), low = Math.min(...dps) * 0.85;
  rows.forEach((r, i) => {
    const pct = ((dps[i] - low) / (top - low || 1)) * 100;
    const skills = r.set.totals.filter(t => t.value > 0.3).map(t => `${t.skill}${t.lv}`).join('・');
    box.append(el('li', { class: 'cmp' + (i === 0 ? ' best' : '') },
      el('span', { class: 'cmpName' }, `${r.skill}軸`, i === 0 ? el('span', { class: 'badge', text: '最大' }) : null),
      el('span', { class: 'cmpScore', text: fmtInt(dps[i]) }),
      el('div', { class: 'cmpBar' }, el('span', { style: `width:${Math.max(4, pct)}%` })),
      el('span', { class: 'cmpSkills', text: (i ? `${fmtPct((dps[i] / top - 1) * 100)}　` : '') + skills }),
      el('details', { class: 'cmpDet' }, el('summary', { text: '防具' }),
        el('ul', {}, ...r.set.pieces.map(p => el('li', { text: `${PART_JP[p.part]} ${p.name}${p.rarity > p.baseRarity ? `（レア${p.rarity}）` : ''}` }))))));
  });
}

/* ---------- milestones ---------- */
function renderNext(res) {
  const nl = $('#nextList'); nl.innerHTML = '';
  const c = currentChar();
  const base = dpsOf(cur.weapon, cur.armor ? cur.armor.score : 0);
  let last = base, shown = 0;
  for (const x of (res.milestones || [])) {
    const wb = weaponCands(c, { rank: x.rank })[0] || null;
    const dps = dpsOf(wb, x.score);
    if (dps <= last + 0.5) continue;
    last = dps; shown++;
    const weaponUp = wb && cur.weapon && (wb.w.name !== cur.weapon.w.name || wb.r !== cur.weapon.r);
    const parts = [];
    if (weaponUp) parts.push(`武器 ${wb.w.name}レア${wb.r}`);
    if (x.changed.length) parts.push(`防具 ${x.changed.join('・')}`);
    nl.append(el('li', { class: 'tl' },
      el('div', { class: 'tlHead' }, el('span', { class: 'tlRank', text: x.label }), el('span', { class: 'tlDps' }, fmtInt(dps), el('small', { text: fmtPct((dps / base - 1) * 100) }))),
      x.why ? el('div', { class: 'tlWhy', text: x.why }) : null,
      el('div', { class: 'tlBody', text: parts.join('　') || x.skills })));
  }
  if (!shown) nl.append(el('li', { class: 'empty', text: 'この先ランクを上げても、いまの装備から変わりません。' }));
}

/* ---------- goal ---------- */
function renderGoal() {
  const box = $('#goalBody'); box.innerHTML = '';
  const b = cur.goal;
  if (!b) { box.append(el('p', { class: 'empty', text: '計算できませんでした。' })); return; }
  const gw = cur.goalWeapon;
  const skills = b.totals.filter(t => t.value > 0.3).map(t => `${t.skill}${t.lv}`).join('・');
  box.append(el('div', { class: 'goal' },
    el('div', { class: 'gTop' }, el('span', { text: 'DPS' }), el('span', { class: 'gScore', text: fmtInt(dpsOf(gw, b.score)) })),
    gw ? el('div', {}, `武器：${gw.w.name}（レア${gw.r}・実効${fmtInt(gw.power)}${gw.st.est ? '・推定' : ''}）`) : null,
    el('div', { class: 'gSkills', text: skills || '―' }),
    el('ul', {}, ...b.pieces.map(p => el('li', { text: `${PART_JP[p.part]} ${p.name}${p.rarity > p.baseRarity ? `（レア${p.rarity}）` : ''}` })))));
}

/* ---------- skill priorities ---------- */
function renderPriorities() {
  const c = currentChar();
  const list = $('#prioList'); list.innerHTML = '';
  $('#prioHint').textContent = c.scoreMode === 'log'
    ? `そのスキルを最大まで積むと${state.target === 'yuko' ? '（融光種相手で）' : ''}DPSが何%上がるか。`
    : '攻略サイトの推奨をもとにした優先度です。';
  const W = effectiveWeights(c);
  const elemName = charElement(c);
  const items = (c.priorities || []).map((p) => {
    const key = p.skill.replace('{属性}', elemName);
    const arr = W[key] || [];
    const lv = p.targetLv || arr.length;
    return { p, key, lv, w: arr.length ? arr[Math.min(lv, arr.length) - 1] : 0 };
  }).sort((a, b) => b.w - a.w);
  const top = Math.max(1, ...items.map(i => gainPct(i.w)));
  for (const { p, key, lv, w } of items) {
    list.append(el('li', { class: 'prio' },
      el('div', { class: 'prioHead' }, el('span', { class: 'pname', text: `${key} Lv${lv}` }), el('span', { class: 'gain', text: c.scoreMode === 'log' ? `DPS ${fmtGain(w)}` : '' })),
      c.scoreMode === 'log' ? el('div', { class: 'pbar' }, el('span', { style: `width:${Math.max(2, (gainPct(w) / top) * 100)}%` })) : null,
      el('span', { class: 'reason', text: p.reason || '' }),
      p.sources && p.sources.length ? el('span', { class: 'src', text: '出典：' + p.sources.join('・') }) : null));
  }
  if (!items.length) list.append(el('li', { class: 'empty', text: 'このキャラの優先スキルはまだ未登録です。' }));
  const sl = $('#sourceList'); sl.innerHTML = '';
  if (c.note) sl.append(el('p', { text: c.note }));
  if (c.sources && c.sources.length) {
    sl.append('参照：');
    c.sources.forEach((u, i) => sl.append(el('a', { href: u.url || u, target: '_blank', rel: 'noopener', text: u.title || `[${i + 1}]` }), ' '));
  }
}

document.addEventListener('DOMContentLoaded', init);
