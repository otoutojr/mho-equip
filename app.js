/* 融光工房 ― UI */
'use strict';
const APP_VERSION = '2026.11.11-1';
const STORE_KEY = 'mho-equip:v1';
const PART_JP = { head: '頭', body: '胴', arm: '腕', waist: '腰', leg: '脚' };
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
  const def = { char: 'hero', heroWeapon: 'hbg', heroElement: '火', rank: 1, target: 'normal', view: 'calc', seen: false };
  let had = false;
  try { had = !!localStorage.getItem(STORE_KEY); } catch {}
  let st;
  try { st = Object.assign(def, JSON.parse(localStorage.getItem(STORE_KEY) || '{}')); } catch { st = def; }
  if (st.charId) { if (st.charId.startsWith('hero_')) { st.char = 'hero'; st.heroWeapon = st.charId.slice(5); } else st.char = st.charId; delete st.charId; }
  for (const k of ['defeated', 'tune', 'map', 'orbTier', 'guildLv']) delete st[k];
  if (had && st.rank > 1) st.seen = true; // 前のデザインから使っている人には選択欄を閉じた状態で出す
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
    renderPicker();
    renderRank(true);
    bindControls();
    renderPriorities();
    solve();
  }).catch((err) => {
    $('#resultHint').textContent = `データを読み込めませんでした（${err.message}）。通信状態を確認して開き直してください。`;
  });
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
}

/* ---------- 選択（上の1行と、「変更」で開く選択欄） ---------- */
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
function selectChar(next) { Object.assign(state, next); saveState(); cur.elemDps = {}; renderPicker(); renderPriorities(); solve(); }
function chip(label, selected, onclick) { return el('button', { type: 'button', class: 'chip', 'aria-pressed': String(selected), onclick, text: label }); }
// 一番上の1行：いま何を見ているか
function renderWho() {
  const c = currentChar();
  const wt = SHORT_WEAPON[charWeaponType(c)] || charWeaponType(c);
  $('#whoName').textContent = `${c.elementSelectable ? '主人公' : c.name}・${wt}・${charElement(c)}`;
  $('#whoSub').textContent = `冒険ランク${state.rank}・レア${rankCap()}まで強化できる`;
}
function setPicker(open) {
  $('#picker').hidden = !open;
  const b = $('#editBtn'); b.setAttribute('aria-expanded', String(open)); b.textContent = open ? '閉じる' : '変更';
}
function renderPicker() {
  const box = $('#charTabs'); box.innerHTML = '';
  box.append(chip('主人公', state.char === 'hero', () => selectChar({ char: 'hero' })));
  for (const c of uniqueChars()) box.append(chip(c.name, state.char === c.id, () => selectChar({ char: c.id })));
  $('#heroSel').hidden = state.char !== 'hero';
  const wt = $('#weaponTabs'); wt.innerHTML = '';
  for (const [id, label] of HERO_WEAPONS) wt.append(chip(label, state.heroWeapon === id, () => selectChar({ heroWeapon: id })));
  const et = $('#elementTabs'); et.innerHTML = '';
  for (const e of HERO_ELEMENTS) et.append(chip(e, heroElement() === e, () => selectChar({ heroElement: e })));
}
// 主人公だけ：属性ごとのDPS目安（押すとその属性に切り替え）
function renderElemFold() {
  const c = currentChar();
  $('#foldElem').hidden = !c.elementSelectable;
  if (!c.elementSelectable) return;
  const box = $('#elemList'); box.innerHTML = '';
  const rows = HERO_ELEMENTS.map(e => ({ e, v: cur.elemDps[e] })).sort((a, b) => (b.v || 0) - (a.v || 0));
  for (const { e, v } of rows) {
    const on = heroElement() === e;
    box.append(el('button', { type: 'button', class: 'rowBtn', 'aria-pressed': String(on), onclick: () => { if (!on) selectChar({ heroElement: e }); } },
      el('span', { class: 'rowMain', text: `${e}属性${on ? '（今の選択）' : ''}` }),
      el('span', { class: 'rowSide', text: v != null ? (v ? fmtInt(v) : '―') : '計算中' })));
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
  $('#capNote').textContent = `レア${rankCap()}まで強化できる` + (step ? `。次はランク${step[0]}でレア${step[1]}` : '');
  renderWho();
}
function renderTarget() {
  document.querySelectorAll('#targetTabs button').forEach(b => b.setAttribute('aria-pressed', String((state.target || 'normal') === b.dataset.target)));
}
function setView(v) {
  state.view = v === 'db' ? 'db' : 'calc';
  $('#viewCalc').hidden = state.view !== 'calc';
  $('#viewDb').hidden = state.view !== 'db';
  $('#tabCalc').setAttribute('aria-selected', String(state.view === 'calc'));
  $('#tabDb').setAttribute('aria-selected', String(state.view === 'db'));
}
function bindControls() {
  let t = null;
  const apply = (v, live) => {
    state.rank = Math.min(60, Math.max(1, v));
    renderRank(!live);
    clearTimeout(t); t = setTimeout(() => { saveState(); cur.elemDps = {}; solve(); }, live ? 280 : 0);
  };
  $('#rank').addEventListener('input', (e) => apply(+e.target.value, true));
  document.querySelectorAll('.nudge').forEach(b => b.addEventListener('click', () => apply(state.rank + (+b.dataset.nudge), false)));
  document.querySelectorAll('#targetTabs button').forEach(b => b.addEventListener('click', () => {
    state.target = b.dataset.target; saveState(); renderTarget(); cur.elemDps = {}; renderPriorities(); solve();
  }));
  $('#editBtn').addEventListener('click', () => setPicker($('#picker').hidden));
  $('#pickDone').addEventListener('click', () => { state.seen = true; saveState(); setPicker(false); window.scrollTo(0, 0); });
  $('#tabCalc').addEventListener('click', () => { setView('calc'); saveState(); });
  $('#tabDb').addEventListener('click', () => { setView('db'); saveState(); });
  $('#resetBtn').addEventListener('click', () => {
    if (!confirm('キャラ・ランクの選択を初期状態に戻します。いい？')) return;
    for (const k of Object.keys(state)) delete state[k];
    Object.assign(state, { char: 'hero', heroWeapon: 'hbg', heroElement: '火', rank: 1, target: 'normal', view: 'calc', seen: false });
    saveState(); cur.elemDps = {};
    renderRank(true); renderTarget(); renderPicker(); setView('calc'); renderPriorities(); solve();
    setPicker(true); window.scrollTo(0, 0);
  });
  renderTarget();
  setView(state.view);
  setPicker(!state.seen); // 初めて開いたときは選択欄を開いておく
}

/* ---------- solving ---------- */
function solve() {
  if (!worker || !DATA) return;
  const c = currentChar();
  reqId++;
  cur.armor = null; cur.goal = null; cur.alts = [];
  cur.weapon = weaponCands(c)[0] || null;
  cur.goalWeapon = weaponCands(c, { rank: 99, cap: 14 })[0] || null;
  renderWho();
  $('#resultHint').textContent = '計算中…';
  renderGear();
  renderElemFold();
  for (const id of ['#skillTotals', '#compareList', '#altList', '#nextList']) { $(id).innerHTML = ''; $(id).append(el('p', { class: 'note', text: '計算中…' })); }
  $('#goalBody').innerHTML = ''; $('#setNote').hidden = true;
  $('#cmpBlock').hidden = c.scoreMode !== 'log';
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
// 行の部品。rarText は「強化が要るときだけ 元→先」を返す
const rarText = (base, r) => (r > base ? `レア${base} → ${r}` : `レア${r}`);
const staticRow = (part, name, side, need) => el('div', { class: 'rowStatic' },
  el('span', { class: 'rowPart', text: part }), el('span', { class: 'rowMain', text: name }), el('span', { class: 'rowSide' + (need ? ' need' : ''), text: side }));
const pieceLine = (p) => el('p', { text: `${PART_JP[p.part]}　${p.name}　${rarText(p.baseRarity, p.rarity)}` });
const skillLine = (totals) => totals.filter(t => t.value > 0.3 || t.skill === '弾導強化').map(t => `${t.skill}${t.lv}`).join('・');

function renderBuilds(rows) {
  const box = $('#dbList'); box.innerHTML = '';
  const oldMore = document.getElementById('dbMore'); if (oldMore) oldMore.remove();
  const c = currentChar();
  const list = cur.dbList || [];
  const hint = $('#dbHint');
  $('#dbCount').textContent = '';
  if (!DATA.builds) { hint.textContent = '構成DBがまだありません。'; return; }
  if (!list.length) { hint.textContent = `${c.elementSelectable ? `${charElement(c)}属性の` : ''}${c.name}の構成は、攻略サイトにまだ載っていません。「計算の最強」を見てください。`; return; }
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
    if (wdef) { const r = Math.max(Math.min(wdef.maxRarity || cap, cap), wdef.baseRarity || 1); const st = weaponStatsAt(wdef, r); if (st) wc = { w: wdef, r, st }; }
    // 武器の高レアの数値はサイトにそろっていないので、DPS目安は武器を「今作れる一番強い武器」にそろえて防具だけで比べる
    const dps = row ? dpsOf(cur.weapon, row.score) : 0;
    const cost = ((row && row.set && row.set.pieces) || []).reduce((t, p) => t + (p.rarity - p.baseRarity), 0);
    return { b, row, openAt, wc, wbase, dps, cost, now: openAt != null && openAt <= state.rank };
  });
  // DPS目安が同じなら、複数サイトに載っている構成 → 強化の少ない構成の順
  items.sort((a, b) => (b.now - a.now) || (a.now ? (Math.round(b.dps) - Math.round(a.dps)) || (b.b.sourceCount - a.b.sourceCount) || (a.cost - b.cost)
    : (a.openAt || 99) - (b.openAt || 99)));
  const nNow = items.filter(x => x.now).length;
  $('#dbCount').textContent = String(nNow);
  hint.textContent = `今のランクで作れるのは${nNow}件。防具をレア${cap}まで強化したときのDPS目安が高い順です。`;
  const SHOW = 3;
  let more = null;
  const avail = new Set(availableSeries());
  const Wc = effectiveWeights(c);
  items.forEach((x, idx) => {
    if (idx === SHOW) {
      more = el('ol', {});
      box.after(el('details', { class: 'more', id: 'dbMore' }, el('summary', { text: `ほかの構成 ${items.length - SHOW}件を見る` }), more));
    }
    const { b, row } = x;
    const refs = uniqRefs(b.refs);
    const src = el('span', { class: 'bSrc' });
    refs.slice(0, 2).forEach((r, i) => { if (i) src.append(' / '); src.append(el('b', { text: r.source }), refLabel(r) ? ` ${refLabel(r)}` : ''); });
    if (refs.length > 2) src.append(` ほか${refs.length - 2}`);
    if (b.sourceCount > 1) src.append(`（${b.sourceCount}サイト一致）`);
    const head = el('div', { class: 'bHead' }, src,
      x.now && row ? el('span', { class: 'bDps', text: fmtInt(x.dps) }) : el('span', { class: 'rowSide', text: x.openAt ? `ランク${x.openAt}から` : '条件不明' }));
    const rowsBox = el('div', { class: 'rows' });
    const wname = b.weapon ? (x.wc && x.wbase && x.wc.w !== x.wbase ? `${x.wbase.name} → ${x.wc.w.name}` : (b.weapon.name || b.weapon.raw)) : '―';
    rowsBox.append(staticRow('武器', wname, x.wc ? rarText(x.wc.w.baseRarity || 1, x.wc.r) + (x.wc.st.est ? '（推定）' : '') : 'データなし', !!x.wc && x.wc.r > (x.wc.w.baseRarity || 1)));
    const pieceInfo = new Map(((row && row.set && row.set.pieces) || []).map(p => [p.id, p]));
    for (const part of PARTS) {
      const p = b.pieces[part];
      const info = p && p.id ? pieceInfo.get(p.id) : null;
      const locked = p && p.id && !avail.has(seriesOfPiece(p.id));
      rowsBox.append(staticRow(PART_JP[part], p ? (p.name || p.raw) : '―',
        info && !locked ? rarText(info.baseRarity, info.rarity) : (locked ? 'まだ作れない' : (p && !p.id ? 'データなし' : '')),
        !!info && !locked && info.rarity > info.baseRarity));
    }
    const totals = (row && row.set && row.set.totals) || [];
    const skills = x.now && totals.length ? el('p', { text: skillLine(totals) || 'DPSに効くスキルなし' }) : null;
    // 攻略サイトに載っているスキルLvに、今の強化上限ではまだ届かない分
    const have = new Map(totals.map(t => [t.skill, t.lv]));
    const want = new Map();
    for (const r of b.refs) for (const k of r.skills || []) if (k.lv) want.set(k.skill, Math.max(want.get(k.skill) || 0, k.lv));
    const gap = [...want].filter(([k, lv]) => (have.get(k) || 0) < lv && Wc[k] && (Wc[k][lv - 1] || 0) > 0.3).map(([k, lv]) => `${k} ${have.get(k) || 0}/${lv}`);
    const gapLine = x.now && row && gap.length ? el('p', { class: 'note', text: `サイトの想定まであと：${gap.join('・')}（強化上限が上がると揃う）` }) : null;
    // 防具が同じでサイトによって武器が違うとき
    const wname0 = b.weapon ? (b.weapon.name || b.weapon.raw) : null;
    const otherW = new Map();
    for (const r of b.refs) if (r.weapon && r.weapon !== wname0) otherW.set(r.weapon, [...new Set([...(otherW.get(r.weapon) || []), r.source])]);
    const det = el('details', { class: 'more' }, el('summary', { text: '解説と出典' }),
      el('div', { class: 'moreBody' },
        otherW.size ? el('p', { text: 'ほかのサイトの武器：' + [...otherW].map(([n, srcs]) => `${n}（${srcs.join('・')}）`).join('、') }) : null,
        ...refs.map(r => el('div', {},
          el('p', {}, el('b', { text: r.source }), ` ${refLabel(r)}`, r.updated ? `（${String(r.updated).slice(0, 10)}）` : ''),
          r.skills && r.skills.length ? el('p', { text: '掲載スキル：' + r.skills.map(k => `${k.skill}${k.lv ?? ''}`).join('・') }) : null,
          r.comment ? el('p', { text: r.comment }) : null,
          r.url ? el('p', {}, el('a', { href: r.url, target: '_blank', rel: 'noopener', text: '出典ページを開く' })) : null))));
    (more || box).append(el('li', { class: 'build' + (x.now ? '' : ' future') }, head, rowsBox, skills, gapLine, det));
  });
}

function onWorkerMessage(e) {
  const msg = e.data;
  if (msg.reqId !== reqId) return;
  if (msg.elem) { if (msg.type === 'result') onElemResult(msg); return; }
  if (msg.goal) { if (msg.type === 'result') { cur.goal = msg.best; renderGoal(); } return; }
  if (msg.type === 'builds') { renderBuilds(msg.rows); return; }
  if (msg.type === 'result') { cur.armor = msg.best; cur.alts = msg.alts || []; renderResult(); renderMeter(); }
  if (msg.type === 'next') renderNext(msg.next);
  if (msg.type === 'compare') renderCompare(msg.rows);
}
function onElemResult(msg) {
  const c = currentChar();
  const wb = weaponCands(c, { elem: msg.elem })[0];
  cur.elemDps[msg.elem] = msg.best && wb ? wb.power * mult(msg.best.score) : 0;
  renderElemFold();
}

const dpsOf = (weapon, armorScore) => (weapon ? weapon.power : BASE_POWER) * mult(armorScore);

/* ---------- DPS ---------- */
let shownDps = 0, animFrame = null;
function animateNumber(target) {
  const node = $('#dpsNum');
  cancelAnimationFrame(animFrame);
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || !shownDps) { shownDps = target; node.textContent = fmtInt(target); return; }
  const from = shownDps, t0 = performance.now(), dur = 420;
  const step = (now) => {
    const k = Math.min(1, (now - t0) / dur), ease = 1 - Math.pow(1 - k, 3);
    shownDps = from + (target - from) * ease; node.textContent = fmtInt(shownDps);
    if (k < 1) animFrame = requestAnimationFrame(step);
  };
  animFrame = requestAnimationFrame(step);
}
function renderMeter() {
  if (!cur.armor) { cancelAnimationFrame(animFrame); shownDps = 0; $('#dpsNum').textContent = '―'; $('#calcLine').textContent = ''; return; }
  const dps = dpsOf(cur.weapon, cur.armor.score);
  animateNumber(dps);
  $('#calcLine').textContent = `今の計算：武器 ${cur.weapon ? fmtInt(cur.weapon.power) : '―'} × スキル ×${mult(cur.armor.score).toFixed(2)} ＝ ${fmtInt(dps)}${state.target === 'yuko' ? '（融光種相手）' : ''}`;
  renderGoal();
}

/* ---------- 計算の最強：武器＋防具5部位 ---------- */
// 攻略サイト間で解放レアが割れている部位は、多数決で採った値と各サイトの値を添える
function conflictText(p) {
  const src = DATA.armor.series.flatMap(s => s.pieces).find(q => q.id === p.id);
  const cs = ((src && src.conflicts) || []).filter(x => x.skill && x.rarity === p.rarity); // 採用したレアでサイトの値が割れている時だけ
  if (!cs.length) return null;
  const seen = new Set(), parts = [];
  for (const x of cs) {
    if (seen.has(x.skill)) continue; seen.add(x.skill);
    parts.push(`${x.skill}（レア${x.rarity}：${Object.entries(x.values).map(([s, v]) => `${s} Lv${v}`).join('・')} → Lv${x.chosen}を採用）`);
  }
  return `サイトで食い違い：${parts.join('、')}`;
}
function gearRow(part, name, side, need, body) {
  return el('details', { class: 'row' },
    el('summary', {}, el('span', { class: 'rowPart', text: part }), el('span', { class: 'rowMain', text: name }), el('span', { class: 'rowSide' + (need ? ' need' : ''), text: side })),
    el('div', { class: 'rowBody' }, ...body));
}
// 戻り値：強化が要る行の数
function renderGear() {
  const c = currentChar();
  const box = $('#gear'); box.innerHTML = '';
  let nNeed = 0;
  const wb = cur.weapon;
  if (wb) {
    const { w, r, st } = wb;
    const need = r > (w.baseRarity || 1); if (need) nNeed++;
    const aff = st.affinity ?? w.affinity;
    const body = [el('p', { text: `${w.type}　攻撃${st.attack}・${w.element}${st.element || '―'}${aff ? `・会心${aff}%` : ''}${st.est ? '（数値は推定）' : ''}` })];
    if (w.guild) body.push(el('p', { text: 'このランクで作れるほかの武器が無いので冒険団武器。モンスター武器が作れるようになったら乗り換え推奨。' }));
    if (w.apex) {
      const alt = weaponCands(c).find(x => !x.w.apex && !x.w.guild);
      body.push(el('p', { text: `鋭精武器。属性は作るときに選び、シーズン0で作れるのは今のところ2本まで。${w.effect ? w.effect.replace(/【\s*|\s*】/g, '') : ''}` }));
      if (alt) body.push(el('p', { text: `この属性で作っていなければ：${alt.w.name}（レア${alt.r}・実効${fmtInt(alt.power)}）` }));
    }
    box.append(gearRow('武器', w.name, rarText(w.baseRarity || 1, r), need, body));
  } else if (DATA.weapons) {
    box.append(el('p', { class: 'note', text: `このランクで作れる${charElement(c)}属性の${charWeaponType(c)}が見つかりません。` }));
  }
  const b = cur.armor;
  if (!b) return nNeed;
  const capNow = rankCap();
  for (const p of b.pieces) {
    const need = p.rarity > p.baseRarity; if (need) nNeed++;
    const body = [el('p', { text: p.skills.map(k => `${k.name}${k.lv}`).join('・') || 'スキルなし' })];
    // スキルはレアp.rarityで揃う。それより上は、攻略サイトにスキルが載っているレア（docMax）までは増えないと分かっている
    if (capNow > p.rarity) body.push(el('p', { text: p.docMax < capNow ? `レア${p.docMax + 1}以降で付くスキルは、どの攻略サイトにもまだ載っていません。` : 'これ以上強化しても、DPSに効くスキルは増えません。' }));
    const ct = conflictText(p); if (ct) body.push(el('p', { text: ct }));
    box.append(gearRow(PART_JP[p.part], p.name, rarText(p.baseRarity, p.rarity), need, body));
  }
  return nNeed;
}
function renderResult() {
  const b = cur.armor;
  const nNeed = renderGear();
  const hint = $('#resultHint'); hint.innerHTML = '';
  const tot = $('#skillTotals'); tot.innerHTML = '';
  const alts = $('#altList'); alts.innerHTML = '';
  const sn = $('#setNote'); sn.hidden = true;
  if (!b) {
    hint.textContent = 'このランクで作れる防具が見つかりませんでした。';
    for (const box of [tot, alts]) box.append(el('p', { class: 'note', text: '―' }));
    return;
  }
  if (nNeed) hint.append('強化するのは', el('span', { class: 'need', text: `オレンジの${nNeed}か所` }), 'だけ。行を押すとスキルが出ます。');
  else hint.textContent = '強化なしで、作ったまま使えます。行を押すとスキルが出ます。';
  const shown = b.totals.filter(t => t.value > 0.3);
  for (const t of shown) {
    const info = DATA.skills.skills.find(s => s.name === t.skill);
    const eff = info && info.levels && info.levels[t.lv - 1] ? info.levels[t.lv - 1].effect : '';
    tot.append(el('details', { class: 'row two' },
      el('summary', {}, el('span', { class: 'rowMain' }, `${t.skill} `, el('b', { text: `Lv${t.lv}` })), el('span', { class: 'rowSide', text: fmtGain(t.value) })),
      el('div', { class: 'rowBody' }, eff ? el('p', { text: eff }) : null, el('p', { text: t.lv >= t.max ? 'これが最大Lv。' : `最大はLv${t.max}。` }))));
  }
  if (!shown.length) tot.append(el('p', { class: 'note', text: 'DPSに効くスキルが付く防具がまだありません。' }));
  if (b.setHits.length) { sn.hidden = false; sn.textContent = 'セットスキル：' + b.setHits.map(h => `${h.set}（${h.pieces}部位）で${h.skill}+${h.lv}`).join('、'); }
  for (const a of cur.alts) {
    alts.append(el('details', { class: 'row two' },
      el('summary', {}, el('span', { class: 'rowMain', text: skillLine(a.totals) || '―' }), el('span', { class: 'rowSide', text: fmtInt(dpsOf(cur.weapon, a.score)) })),
      el('div', { class: 'rowBody' }, ...a.pieces.map(pieceLine))));
  }
  if (!cur.alts.length) alts.append(el('p', { class: 'note', text: '候補はこの1通りです。' }));
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
  if (!rows || !rows.length) { box.append(el('p', { class: 'note', text: '比べられる構成がまだありません。' })); return; }
  const dps = rows.map(r => dpsOf(cur.weapon, r.score));
  const top = Math.max(...dps);
  rows.forEach((r, i) => {
    box.append(el('details', { class: 'row two' },
      el('summary', {}, el('span', { class: 'rowMain', text: `${r.skill}を軸に` }),
        el('span', { class: 'rowSide', text: fmtInt(dps[i]) + (dps[i] < top - 0.5 ? `（${fmtPct((dps[i] / top - 1) * 100)}）` : '') })),
      el('div', { class: 'rowBody' }, el('p', { text: skillLine(r.set.totals) || '―' }), ...r.set.pieces.map(pieceLine))));
  });
}

/* ---------- 次のランクで変わること ---------- */
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
    if (weaponUp) parts.push(`武器：${wb.w.name} レア${wb.r}`);
    if (x.changed.length) parts.push(`防具：${x.changed.join('・')}`);
    nl.append(el('details', { class: 'row two', open: '' },
      el('summary', {}, el('span', { class: 'rowMain', text: x.label }), el('span', { class: 'rowSide', text: `${fmtInt(dps)}（${fmtPct((dps / base - 1) * 100)}）` })),
      el('div', { class: 'rowBody' }, x.why ? el('p', { text: x.why }) : null, el('p', { text: parts.join('　') || x.skills }))));
  }
  if (!shown) nl.append(el('p', { class: 'note', text: 'この先ランクを上げても、いまの装備から変わりません。' }));
}
function renderGoal() {
  const box = $('#goalBody'); box.innerHTML = '';
  const b = cur.goal;
  if (!b) return;
  const gw = cur.goalWeapon;
  const goal = dpsOf(gw, b.score);
  const now = cur.armor ? dpsOf(cur.weapon, cur.armor.score) : 0;
  box.append(el('p', { class: 'note', text: '全部の武器・防具が作れて、最大まで強化できたとき。' }),
    el('div', { class: 'rows' }, el('details', { class: 'row two' },
      el('summary', {}, el('span', { class: 'rowMain', text: '到達点' }), el('span', { class: 'rowSide', text: `${fmtInt(goal)}${now ? `（今は${Math.round((now / goal) * 100)}%）` : ''}` })),
      el('div', { class: 'rowBody' },
        gw ? el('p', { text: `武器　${gw.w.name}　レア${gw.r}${gw.st.est ? '（数値は推定）' : ''}` }) : null,
        ...b.pieces.map(pieceLine), el('p', { text: skillLine(b.totals) || '―' })))));
}

/* ---------- スキルごとのDPS効果 ---------- */
function renderPriorities() {
  const c = currentChar();
  const list = $('#prioList'); list.innerHTML = '';
  $('#prioHint').textContent = c.scoreMode === 'log'
    ? `そのスキルを最大まで積むと${state.target === 'yuko' ? '（融光種相手で）' : ''}DPSが何%上がるか。押すと理由が出ます。`
    : '攻略サイトの推奨をもとにした優先度です。';
  const W = effectiveWeights(c);
  const elemName = charElement(c);
  const items = (c.priorities || []).map((p) => {
    const key = p.skill.replace('{属性}', elemName);
    const arr = W[key] || [];
    const lv = p.targetLv || arr.length;
    return { p, key, lv, w: arr.length ? arr[Math.min(lv, arr.length) - 1] : 0 };
  }).sort((a, b) => b.w - a.w);
  for (const { p, key, lv, w } of items) {
    list.append(el('details', { class: 'row two' },
      el('summary', {}, el('span', { class: 'rowMain', text: `${key} Lv${lv}` }), el('span', { class: 'rowSide', text: c.scoreMode === 'log' ? fmtGain(w) : '' })),
      el('div', { class: 'rowBody' }, p.reason ? el('p', { text: p.reason }) : null,
        p.sources && p.sources.length ? el('p', { text: '出典：' + p.sources.join('・') }) : null)));
  }
  if (!items.length) list.append(el('p', { class: 'note', text: 'このキャラの優先スキルはまだ未登録です。' }));
  const sl = $('#sourceList'); sl.innerHTML = '';
  if (c.note) sl.append(el('p', { text: c.note }));
  if (c.sources && c.sources.length) {
    const p = el('p', {}, '参照：');
    c.sources.forEach((u, i) => p.append(el('a', { href: u.url || u, target: '_blank', rel: 'noopener', text: u.title || `[${i + 1}]` }), ' '));
    sl.append(p);
  }
}

document.addEventListener('DOMContentLoaded', init);
