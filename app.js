/* 融光工房 ― UI */
'use strict';
const APP_VERSION = '2026.11.11-4';
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

// 武器種アイコン（自作のシルエット。24×24、塗りは currentColor）
const WICON = {
  '大剣': '<g transform="rotate(45 12 12)"><path d="M8.2 4.2 12 .8l3.8 3.4V15H8.2z"/><path d="M5.6 15h12.8v2.2H5.6z"/><path d="M10.9 17.2h2.2v4.4h-2.2z"/><circle cx="12" cy="22.3" r="1.5"/></g>',
  '太刀': '<g transform="rotate(45 12 12)"><path d="M11.1-1.2c2.3 4.6 2.7 10.6 2.2 16.6h-2.4c.6-5.6.7-11.2.2-16.6z"/><path d="M9.4 15.4h5.2v1.7H9.4z"/><path d="M11 17.1h2.1v6.6H11z"/></g>',
  '双剣': '<g transform="translate(12 12) scale(.92) translate(-12 -12)"><g transform="rotate(38 12 12)"><path d="M10.6 3.4 12 1.8l1.4 1.600v10h-2.800z"/><path d="M8.800 13.400h6.400v1.700H8.800z"/><path d="M11 15.100h2v4.900h-2z"/></g><g transform="rotate(-38 12 12)"><path d="M10.6 3.4 12 1.8l1.4 1.600v10h-2.800z"/><path d="M8.800 13.400h6.400v1.700H8.800z"/><path d="M11 15.100h2v4.900h-2z"/></g></g>',
  'ランス': '<g transform="rotate(45 12 12)"><path d="M12-1.5 14.6 13H9.4z"/><path d="M8 13h8l-1.3 2.6H9.3z"/><path d="M11 15.6h2v7h-2z"/></g><path d="M3.2 12.6c2.2.5 4.3.5 6.4-.4.6 3.6-.6 6.6-3.4 8.6-2.6-1.9-3.7-4.6-3-8.2z"/>',
  'ハンマー': '<g transform="translate(12 12) rotate(35) scale(.82) translate(-12 -12)"><path d="M3.800 1.600h16.400c.8 0 1.400.6 1.400 1.400v7c0 .8-.6 1.400-1.400 1.400H3.800c-.8 0-1.400-.6-1.400-1.400V3c0-.8.6-1.400 1.400-1.400z"/><path d="M10.700 11.400h2.600V23h-2.600z"/><path d="M9.800 22.400h4.400v2.200H9.800z"/></g>',
  'チャージアックス': '<g transform="rotate(35 12 12)"><path d="M10.9 1h2.2v22h-2.2z"/><path d="M13.1 2.4c5.4.6 8 3.4 8 6.6s-2.6 6-8 6.6z"/><path d="M10.9 4.6 6 6.2v5.6l4.9 1.6z"/></g>',
  'ヘビィボウガン': '<path d="M1 9h13.600V7.200h4.600V9h3.800v4h-3.600l-1 2.200h-3.800L13 20H9.200l1.600-4.800H6.200V13H1z"/><path d="M6.600 4.800h7v1.600h-7z"/>',
  '弓': '<path d="M6.400 1.600C15.800 4.400 19.600 8 19.600 12s-3.800 7.600-13.200 10.400l-.5-1.700C13.600 18.200 17.400 15.200 17.400 12S13.600 5.800 5.900 3.300z"/><path d="M5.700 2.400h1v19.200h-1z"/><path d="M2 11.300h15v1.400H2z"/><path d="M16.400 9.200 21.600 12l-5.200 2.800z"/>',
};
function wicon(type) {
  const span = document.createElement('span');
  span.innerHTML = `<svg class="wicon" viewBox="0 0 24 24" aria-hidden="true">${WICON[type] || ''}</svg>`;
  return span.firstChild;
}
// 行の左の札：武器は武器種アイコン（属性の色）、防具は部位の字
function plate(part, weaponType) {
  if (part === '武器') return el('span', { class: 'plate weapon', role: 'img', 'aria-label': '武器' }, wicon(weaponType || charWeaponType(currentChar())));
  return el('span', { class: 'plate', text: part });
}
// スキルの段位：on個を塗り、指定Lv（want）に届いていない分は朱の斜線で示す
function pips(on, max, want = 0) {
  const box = el('span', { class: 'pips', 'aria-hidden': 'true' });
  for (let i = 0; i < max; i++) box.append(el('i', { class: i < on ? 'on' : (i < want ? 'miss' : '') }));
  return box;
}

const state = loadState();
let DATA = null;
let worker = null;
let reqId = 0;
const cur = { armor: null, goal: null, weapon: null, goalWeapon: null, elemDps: {}, free: null };

function loadState() {
  const def = { char: 'hero', heroWeapon: 'hbg', heroElement: '火', rank: 1, target: 'normal', view: 'calc', seen: false, wants: {}, fix: { weapons: {}, armor: {}, rankCap: null } };
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
    BASE = { weapons: d.weapons ? JSON.stringify(d.weapons) : null, armor: JSON.stringify(d.armor) };
    applyFixes(false);
    $('#dataDate').textContent = `データ更新日 ${d.armor.updated || ''}`;
    if (!currentChar()) { state.char = 'hero'; state.heroWeapon = 'hbg'; }
    worker = new Worker('solver.js?v=' + APP_VERSION);
    worker.onmessage = onWorkerMessage;
    worker.postMessage({ type: 'init', armor: d.armor, skills: d.skills });
    renderPicker();
    renderRank(true);
    bindControls();
    renderPriorities();
    renderWants();
    renderFixList();
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
function selectChar(next) { Object.assign(state, next); saveState(); cur.elemDps = {}; wantOpen = false; renderPicker(); renderPriorities(); solve(); }
function chip(label, selected, onclick, lead = null, cls = 'chip') { return el('button', { type: 'button', class: cls, 'aria-pressed': String(selected), onclick }, lead, label); }
const eldot = (e) => el('span', { class: 'eldot', 'data-el': e, 'aria-hidden': 'true', text: e });
// 一番上の1行：いま何を見ているか
function renderWho() {
  const c = currentChar();
  const wt = SHORT_WEAPON[charWeaponType(c)] || charWeaponType(c);
  $('#whoName').textContent = `${c.elementSelectable ? '主人公' : c.name}・${wt}・${charElement(c)}`;
  $('#whoSub').textContent = `ランク${state.rank}・レア${rankCap()}まで強化できる`;
  // 属性の色をページ全体の差し色にする（武器の札・判子・見出しの◆・DPSの帯）
  const e = charElement(c);
  document.documentElement.dataset.el = HERO_ELEMENTS.includes(e) ? e : '無';
  const crest = $('#crest'); crest.innerHTML = ''; crest.append(wicon(charWeaponType(c)));
  $('#elStamp').textContent = HERO_ELEMENTS.includes(e) ? e : '';
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
  for (const [id, label] of HERO_WEAPONS) wt.append(chip(label, state.heroWeapon === id, () => selectChar({ heroWeapon: id }), wicon(WEAPON_TYPE[id])));
  const et = $('#elementTabs'); et.innerHTML = '';
  for (const e of HERO_ELEMENTS) { const b = chip(`${e}属性`, heroElement() === e, () => selectChar({ heroElement: e }), eldot(e), 'chip el'); b.dataset.el = e; et.append(b); }
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
      el('span', { class: 'rowMain elRow' }, eldot(e), `${e}属性${on ? '（今の選択）' : ''}`),
      el('span', { class: 'rowSide', text: v != null ? (v ? fmtInt(v) : '―') : '計算中' })));
  }
}

/* ---------- 入れたいスキル（スキルごとに「Lvいくつ以上」を指定） ---------- */
// 主人公の「火属性ダメージUP」は、属性を変えても付いてくるように {属性} で持つ
function wantKey(c, name) { return c.elementSelectable && name === `${charElement(c)}属性ダメージUP` ? '{属性}属性ダメージUP' : name; }
function wantsFor(c, elem = charElement(c)) {
  const out = {};
  for (const [k, lv] of Object.entries((state.wants || {})[c.id] || {})) out[k.replace('{属性}', elem)] = lv;
  return out;
}
const skillMaxLv = (name) => { const sk = DATA.skills.skills.find(x => x.name === name); return Math.min(8, (sk && sk.maxLv) || 7); };
let wantOpen = false, wantCat = '効く順', wantTimer = null;
function setWant(name, lv) {
  const c = currentChar();
  state.wants = state.wants || {};
  const raw = (state.wants[c.id] = state.wants[c.id] || {});
  const k = wantKey(c, name);
  if (lv <= 0) delete raw[k]; else raw[k] = Math.min(lv, skillMaxLv(name));
  saveState();
  cur.armor = null; cur.free = null;
  renderWants();
  clearTimeout(wantTimer); wantTimer = setTimeout(() => { cur.elemDps = {}; solve(); }, 250);
}
// 防具かセットスキルで付けられるスキルの名前
let armorSkillSet = null;
function armorSkillNames() {
  if (!armorSkillSet) {
    const set = new Set();
    for (const sr of DATA.armor.series) for (const p of sr.pieces) for (const k of p.skills) set.add(k.name);
    for (const st of (DATA.armor.sets || [])) for (const b of (st.bonuses || [])) if (b.skill) set.add(b.skill);
    for (const n of [...set]) if (n.startsWith('冒険団の力')) set.delete(n);
    armorSkillSet = set;
  }
  return armorSkillSet;
}
const WANT_CATS = ['効く順', '火力', '会心', '弾・矢', '生存', 'その他'];
function renderWants() {
  const c = currentChar();
  const box = $('#wantList'); box.innerHTML = '';
  const wants = wantsFor(c);
  const names = Object.keys(wants);
  const got = new Map(((cur.armor && cur.armor.wants) || []).map(w => [w.skill, w.lv]));
  let short = 0;
  for (const name of names) {
    const lv = wants[name], max = skillMaxLv(name);
    const have = cur.armor ? Math.min(got.get(name) || 0, lv) : lv; // 計算中は指定どおりに描く
    const miss = have < lv; if (miss) short++;
    const plus = el('button', { type: 'button', class: 'step', 'aria-label': `${name}の指定を1上げる`, onclick: () => setWant(name, lv + 1), text: '＋' });
    if (lv >= max) plus.disabled = true;
    box.append(el('div', { class: 'want' },
      el('div', { class: 'wantName' }, name, miss ? el('span', { class: 'note need', text: (names.length > 1 ? 'ほかの指定と合わせると' : '今のランクでは') + (have ? `Lv${have}まで` : '付けられない') }) : null),
      el('button', { type: 'button', class: 'step', 'aria-label': lv > 1 ? `${name}の指定を1下げる` : `${name}の指定を外す`, onclick: () => setWant(name, lv - 1), text: lv > 1 ? '−' : '×' }),
      el('div', { class: 'wantLv' }, pips(have, max, lv), el('span', { class: 'lv', text: `Lv${lv}以上` })),
      plus));
  }
  box.append(el('button', { type: 'button', class: 'addBtn', 'aria-expanded': String(wantOpen), 'aria-controls': 'wantPicker',
    onclick: () => { wantOpen = !wantOpen; renderWants(); }, text: 'スキルを追加' }));
  renderWantPicker(c, wants);
  // 下の1行：指定が効いているか、指定なしの最強とどれだけ違うか
  const note = $('#wantNote');
  if (!names.length) { note.textContent = '「回避強化をLv3以上」のように指定すると、それを満たす中でDPSが一番高い装備を出します。'; return; }
  if (!cur.armor) { note.textContent = '計算中…'; return; }
  if (short) { note.innerHTML = ''; note.append(el('span', { class: 'need', text: '届かない指定があります。' }), '今のランクで一番近い装備を出しています。'); return; }
  if (cur.free) {
    const a = dpsOf(cur.weapon, cur.armor.score), f = dpsOf(cur.weapon, cur.free.score);
    note.textContent = f - a > 0.5 ? `指定を満たす中でDPSが一番高い装備です。指定なしの最強（${fmtInt(f)}）より ${fmtPct((a / f - 1) * 100)}。` : '指定なしの最強と同じDPSで、指定も満たしています。';
  } else note.textContent = '指定を満たす中でDPSが一番高い装備です。';
}
function renderWantPicker(c, wants) {
  const pk = $('#wantPicker'); pk.hidden = !wantOpen;
  if (!wantOpen) return;
  const cats = $('#wantCats'); cats.innerHTML = '';
  for (const k of WANT_CATS) cats.append(chip(k, wantCat === k, () => { wantCat = k; renderWants(); }));
  const W = effectiveWeights(c);
  const maxGain = (n) => { const a = W[n]; return a && a.length ? a[a.length - 1] : 0; };
  let list = [...armorSkillNames()].filter(n => !(n in wants));
  if (wantCat === '効く順') list = list.filter(n => maxGain(n) > 0.3).sort((a, b) => maxGain(b) - maxGain(a));
  else list = list.filter(n => { const sk = DATA.skills.skills.find(x => x.name === n); return ((sk && sk.category) || 'その他') === wantCat; }).sort((a, b) => a.localeCompare(b, 'ja'));
  const box = $('#wantChoices'); box.innerHTML = '';
  for (const n of list) {
    const g = maxGain(n);
    box.append(el('button', { type: 'button', class: 'rowBtn', onclick: () => { wantOpen = false; setWant(n, 1); } },
      el('span', { class: 'rowMain', text: n }),
      el('span', { class: 'rowSide', text: (g > 0.3 && c.scoreMode === 'log' ? `最大で${fmtGain(g)}・` : '') + `Lv${skillMaxLv(n)}まで` })));
  }
  if (!list.length) box.append(el('p', { class: 'note', text: wantCat === '効く順' ? 'このキャラのDPSに効くスキルは、もう全部指定しています。' : 'この種類のスキルはありません。' }));
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

/* ---------- 自分で直した数値（この端末に保存。攻略サイトより先にゲーム内で分かった数値を入れる） ---------- */
// state.fix = { weapons: {武器名: {レア: {attack, element}}}, armor: {防具id: {レア: {スキル名: Lv}}}, rankCap: [[ランク, レア], …] | null }
let BASE = null; // 配信データそのまま（直す前）
function fixes() {
  const f = (state.fix = state.fix || {});
  f.weapons = f.weapons || {}; f.armor = f.armor || {}; if (!('rankCap' in f)) f.rankCap = null;
  return f;
}
function applyFixes(reinit = true) {
  const fx = fixes();
  DATA.weapons = BASE.weapons ? JSON.parse(BASE.weapons) : null;
  DATA.armor = JSON.parse(BASE.armor);
  armorSkillSet = null;
  for (const [name, byR] of Object.entries(fx.weapons)) {
    const w = DATA.weapons && DATA.weapons.weapons.find(x => x.name === name);
    if (!w) continue;
    for (const [r, v] of Object.entries(byR)) {
      const prev = weaponStatsAt(w, +r) || {};
      w.stats[r] = { attack: v.attack, element: v.element, affinity: prev.affinity ?? w.affinity ?? 0, src: '自分で入力', user: true };
      w.maxRarity = Math.max(w.maxRarity || 0, +r);
    }
  }
  const pieces = new Map(DATA.armor.series.flatMap(sr => sr.pieces).map(p => [p.id, p]));
  for (const [id, byR] of Object.entries(fx.armor)) {
    const p = pieces.get(id);
    if (!p) continue;
    for (const [r, lvs] of Object.entries(byR)) {
      for (const [name, lv] of Object.entries(lvs)) {
        p.skills = p.skills.filter(k => !(k.name === name && (k.rarity ?? p.baseRarity) === +r));
        p.skills.push({ name, lv, rarity: +r, user: true });
      }
      p.docMax = Math.max(p.docMax || 0, +r);
      p.user = true;
    }
  }
  if (reinit && worker) worker.postMessage({ type: 'init', armor: DATA.armor, skills: DATA.skills });
}
function saveFixes() { saveState(); applyFixes(); renderFixList(); cur.elemDps = {}; renderRank(false); solve(); }
function capTable() { return (state.fix && state.fix.rankCap) || DATA.monsters.rankCap || []; }
// 「ランクRではレアCまで」と分かったときに、表全体をそれに合わせる
function setCapFix(rank, cap) {
  const at = {};
  for (const [r, c] of capTable()) at[c] = r;
  for (let c = 3; c <= 12; c++) {
    if (c <= cap) { if (at[c] == null || at[c] > rank) at[c] = rank; }
    else if (at[c] != null && at[c] <= rank) at[c] = rank + 1;
  }
  fixes().rankCap = Object.keys(at).map(Number).sort((a, b) => a - b).map(c => [at[c], c]);
}
const stepBtn = (text, label, onclick) => el('button', { type: 'button', class: 'step', 'aria-label': label, onclick, text });
function fixToggle(make) {
  const wrap = el('div', { class: 'fixWrap' });
  const btn = el('button', { type: 'button', class: 'btn small', 'aria-expanded': 'false', text: '数値を直す' });
  btn.addEventListener('click', () => {
    const open = btn.getAttribute('aria-expanded') === 'true';
    btn.setAttribute('aria-expanded', String(!open)); btn.textContent = open ? '数値を直す' : '閉じる';
    if (open) wrap.lastChild.remove(); else wrap.append(make());
  });
  wrap.append(btn);
  return wrap;
}
function rarityStepper(get, set, lo, hi) {
  const val = el('span', { class: 'fixVal', text: `レア${get()}` });
  const go = (d) => { const v = Math.min(hi, Math.max(lo, get() + d)); if (v !== get()) { set(v); val.textContent = `レア${v}`; } };
  return el('div', { class: 'fixLine' }, el('span', { class: 'fixLbl', text: '直すレア' }), stepBtn('−', 'レアを1下げる', () => go(-1)), val, stepBtn('＋', 'レアを1上げる', () => go(1)));
}
// 武器：レアごとの攻撃力・属性値
function weaponEditor(name0, r0) {
  const c = currentChar();
  const list = DATA.weapons.weapons.filter(w => w.type === charWeaponType(c) && w.element === charElement(c)).sort((a, b) => a.name.localeCompare(b.name, 'ja'));
  let w = list.find(x => x.name === name0) || list[0], r = r0;
  const box = el('div', { class: 'fix' });
  const draw = () => {
    box.innerHTML = '';
    const lo = w.baseRarity || 1;
    r = Math.min(12, Math.max(lo, r));
    const st = weaponStatsAt(w, r);
    const exact = st && w.stats[r] === st;
    const sel = el('select', { 'aria-label': '直す武器' }, ...list.map(x => { const o = el('option', { value: x.name, text: x.name }); if (x === w) o.selected = true; return o; }));
    sel.addEventListener('change', () => { w = list.find(x => x.name === sel.value); r = Math.min(w.maxRarity || 12, rankCap()); draw(); });
    const atk = el('input', { type: 'number', inputmode: 'numeric', min: '1', max: '9999', value: exact ? st.attack : '', 'aria-label': '攻撃力' });
    const elv = el('input', { type: 'number', inputmode: 'numeric', min: '0', max: '9999', value: exact ? (st.element || 0) : '', 'aria-label': '属性値' });
    const info = exact ? `今のデータ：攻撃${st.attack}・属性${st.element || 0}${st.user ? '（自分で入力）' : st.est ? '（推定）' : ''}` : `レア${r}の数値はまだありません。`;
    const msg = el('p', { class: 'note need' });
    const save = el('button', { type: 'button', class: 'btn solid small', text: '保存', onclick: () => {
      const a = Math.round(+atk.value), e = Math.round(+elv.value);
      if (!(a > 0) || !(e >= 0) || elv.value === '') { msg.textContent = '攻撃力と属性値を数字で入れてください（属性が無い武器は0）。'; return; }
      const fx = fixes(); (fx.weapons[w.name] = fx.weapons[w.name] || {})[r] = { attack: a, element: e };
      saveFixes();
    } });
    const undo = (fixes().weapons[w.name] || {})[r] ? el('button', { type: 'button', class: 'btn small', text: 'このレアの修正を消す', onclick: () => {
      const fx = fixes(); delete fx.weapons[w.name][r]; if (!Object.keys(fx.weapons[w.name]).length) delete fx.weapons[w.name]; saveFixes();
    } }) : null;
    box.append(sel, rarityStepper(() => r, (v) => { r = v; draw(); }, lo, 12),
      el('div', { class: 'fixLine' }, el('label', { class: 'field' }, el('span', { text: '攻撃力' }), atk), el('label', { class: 'field' }, el('span', { text: '属性値' }), elv)),
      el('p', { class: 'note', text: info }), msg, el('div', { class: 'fixBtns' }, save, undo));
  };
  draw();
  return box;
}
// 防具：そのレアで付いているスキルとLv
function armorEditor(part, id0, r0) {
  const all = DATA.armor.series.flatMap(sr => sr.pieces).filter(p => p.part === part).sort((a, b) => a.name.localeCompare(b.name, 'ja'));
  let p = all.find(x => x.id === id0) || all[0], r = r0, lv = null;
  // レアrの時点のLv（r以下で一番上のレアの値を採る。solver と同じ読み方）
  const levelsAt = () => {
    const m = new Map();
    for (const k of p.skills) { const kr = k.rarity ?? p.baseRarity; if (kr > r) continue; const cur0 = m.get(k.name); if (!cur0 || kr > cur0.r || (kr === cur0.r && k.lv > cur0.lv)) m.set(k.name, { lv: k.lv, r: kr }); }
    return new Map([...m].map(([n, v]) => [n, v.lv]));
  };
  const box = el('div', { class: 'fix' });
  const draw = () => {
    box.innerHTML = '';
    r = Math.min(12, Math.max(p.baseRarity, r));
    if (!lv) lv = levelsAt();
    const sel = el('select', { 'aria-label': '直す防具' }, ...all.map(x => { const o = el('option', { value: x.id, text: x.name }); if (x === p) o.selected = true; return o; }));
    sel.addEventListener('change', () => { p = all.find(x => x.id === sel.value); r = Math.max(p.baseRarity, Math.min(rankCap(), 12)); lv = null; draw(); });
    const rows = el('div', { class: 'fixSkills' });
    for (const [name, v] of lv) {
      const max = skillMaxLv(name);
      rows.append(el('div', { class: 'fixLine' }, el('span', { class: 'fixLbl', text: name }),
        stepBtn('−', `${name}を1下げる`, () => { lv.set(name, Math.max(0, v - 1)); draw(); }),
        el('span', { class: 'fixVal', text: v ? `Lv${v}` : '無し' }),
        stepBtn('＋', `${name}を1上げる`, () => { lv.set(name, Math.min(max, v + 1)); draw(); })));
    }
    const add = el('select', { 'aria-label': 'スキルを追加' }, el('option', { value: '', text: '＋ スキルを追加' }),
      ...[...armorSkillNames()].filter(n => !lv.has(n)).sort((a, b) => a.localeCompare(b, 'ja')).map(n => el('option', { value: n, text: n })));
    add.addEventListener('change', () => { if (add.value) { lv.set(add.value, 1); draw(); } });
    const save = el('button', { type: 'button', class: 'btn solid small', text: '保存', onclick: () => {
      const fx = fixes(); (fx.armor[p.id] = fx.armor[p.id] || {})[r] = Object.fromEntries(lv);
      saveFixes();
    } });
    const undo = (fixes().armor[p.id] || {})[r] ? el('button', { type: 'button', class: 'btn small', text: 'このレアの修正を消す', onclick: () => {
      const fx = fixes(); delete fx.armor[p.id][r]; if (!Object.keys(fx.armor[p.id]).length) delete fx.armor[p.id]; saveFixes();
    } }) : null;
    box.append(sel, rarityStepper(() => r, (v) => { r = v; lv = null; draw(); }, p.baseRarity, 12),
      el('p', { class: 'note', text: `レア${r}まで強化したときに付いているスキルを、ゲームの表示どおりに合わせてください。` }), rows, add, el('div', { class: 'fixBtns' }, save, undo));
  };
  draw();
  return box;
}
// 強化上限（選択欄のランクの下）
let capFixOpen = false, capFixVal = null;
function renderCapFix() {
  const box = $('#capFix'); if (!box) return;
  box.innerHTML = '';
  const fixed = !!(state.fix && state.fix.rankCap);
  if (!capFixOpen) {
    box.append(el('button', { type: 'button', class: 'linkBtn', text: 'ゲームと違うときは直す', onclick: () => { capFixOpen = true; capFixVal = rankCap(); renderCapFix(); } }));
    return;
  }
  if (capFixVal == null) capFixVal = rankCap();
  const set = (v) => { capFixVal = Math.min(12, Math.max(2, v)); renderCapFix(); };
  box.append(el('div', { class: 'fix' },
    el('div', { class: 'fixLine' }, el('span', { class: 'fixLbl', text: `ランク${state.rank}の強化上限` }), stepBtn('−', '上限を1下げる', () => set(capFixVal - 1)),
      el('span', { class: 'fixVal', text: `レア${capFixVal}` }), stepBtn('＋', '上限を1上げる', () => set(capFixVal + 1))),
    el('div', { class: 'fixBtns' },
      el('button', { type: 'button', class: 'btn solid small', text: '保存', onclick: () => { setCapFix(state.rank, capFixVal); capFixOpen = false; saveFixes(); } }),
      fixed ? el('button', { type: 'button', class: 'btn small', text: '元の表に戻す', onclick: () => { fixes().rankCap = null; capFixOpen = false; saveFixes(); } }) : null,
      el('button', { type: 'button', class: 'btn small', text: 'やめる', onclick: () => { capFixOpen = false; renderCapFix(); } }))));
}
// 直した数値の一覧（下の折りたたみ）
function renderFixList() {
  const box = $('#fixList'); box.innerHTML = '';
  const fx = fixes();
  const rows = [];
  const del = (label, fn) => el('button', { type: 'button', class: 'step', 'aria-label': `${label}の修正を消す`, text: '×', onclick: () => { fn(); saveFixes(); } });
  for (const [name, byR] of Object.entries(fx.weapons)) for (const [r, v] of Object.entries(byR)) {
    rows.push(el('div', { class: 'fixItem' }, el('span', { class: 'rowMain', text: `${name}　レア${r}：攻撃${v.attack}・属性${v.element}` }),
      del(name, () => { delete fx.weapons[name][r]; if (!Object.keys(fx.weapons[name]).length) delete fx.weapons[name]; })));
  }
  const pname = new Map(JSON.parse(BASE.armor).series.flatMap(sr => sr.pieces).map(p => [p.id, p.name]));
  for (const [id, byR] of Object.entries(fx.armor)) for (const [r, lvs] of Object.entries(byR)) {
    rows.push(el('div', { class: 'fixItem' }, el('span', { class: 'rowMain', text: `${pname.get(id) || id}　レア${r}：${Object.entries(lvs).map(([n, l]) => (l ? `${n}${l}` : `${n}無し`)).join('・')}` }),
      del(pname.get(id) || id, () => { delete fx.armor[id][r]; if (!Object.keys(fx.armor[id]).length) delete fx.armor[id]; })));
  }
  if (fx.rankCap) rows.push(el('div', { class: 'fixItem' }, el('span', { class: 'rowMain', text: '強化上限：' + fx.rankCap.map(([r, c]) => `ランク${r}→レア${c}`).join('、') }), del('強化上限', () => { fx.rankCap = null; })));
  $('#fixCount').textContent = rows.length ? ` ${rows.length}` : '';
  if (!rows.length) { box.append(el('p', { class: 'note', text: 'まだありません。装備の行を開いて「数値を直す」を押すと、ゲーム内の数値を入れられます。入れた数値はこの端末にだけ保存されます。' })); $('#fixTools').hidden = true; return; }
  box.append(...rows);
  $('#fixTools').hidden = false;
}

/* ---------- ランクで決まること ---------- */
function rankCap(rank = state.rank) {
  let cap = 2;
  for (const [r, c] of capTable()) if (rank >= r) cap = c;
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
  for (const [r] of capTable()) if (r > state.rank) ranks.add(r);
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
  const step = capTable().find(([rr]) => rr > state.rank);
  $('#capNote').textContent = `レア${rankCap()}まで強化できる` + (step ? `。次はランク${step[0]}でレア${step[1]}` : '') + (state.fix && state.fix.rankCap ? '（自分で直した値）' : '');
  renderCapFix();
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
    capFixVal = null;
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
    const keep = state.fix; // 自分で直した数値は残す
    for (const k of Object.keys(state)) delete state[k];
    Object.assign(state, { char: 'hero', heroWeapon: 'hbg', heroElement: '火', rank: 1, target: 'normal', view: 'calc', seen: false, wants: {}, fix: keep });
    wantOpen = false;
    saveState(); cur.elemDps = {};
    renderRank(true); renderTarget(); renderPicker(); setView('calc'); renderPriorities(); solve();
    setPicker(true); window.scrollTo(0, 0);
  });
  $('#fixCopy').addEventListener('click', async () => {
    const text = JSON.stringify({ app: 'mho-equip', version: APP_VERSION, fix: fixes() });
    const b = $('#fixCopy');
    try { await navigator.clipboard.writeText(text); b.textContent = 'コピーしました'; }
    catch { const ta = $('#fixText'); ta.hidden = false; ta.value = text; ta.focus(); ta.select(); b.textContent = '下の文字を選んでコピー'; }
    setTimeout(() => { b.textContent = '直した内容をコピー'; }, 2500);
  });
  $('#fixClear').addEventListener('click', () => {
    if (!confirm('自分で直した数値を全部消して、配信データに戻します。いい？')) return;
    state.fix = { weapons: {}, armor: {}, rankCap: null }; saveFixes();
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
  const wants = wantsFor(c);
  cur.free = null;
  renderWants();
  const now = { reqId, weights: W, availableSeries: availableSeries(), rarityCap: rankCap(), orbTier: orbTierFor(rankCap()) };
  const jobs = [];
  // 指定があるときは、指定なしの最強も先に出して差を見せる
  if (Object.keys(wants).length) jobs.push({ ...now, type: 'solve', free: true, topN: 1, K: 12 });
  jobs.push({ ...now, type: 'solve', wants, topN: 6, K: 12 });
  jobs.push(() => buildsJob(c, W, wants));
  // ここから下は折りたたみの中身。いまの答えが出てから順に計算する
  jobs.push(() => { if (!cur.armor) { renderNext({ milestones: [] }); return null; }
    return { ...now, type: 'next', wants, milestones: milestones(), K: 12, baseScore: cur.armor.score, baseIds: cur.armor.pieces.map(p => p.id) }; });
  jobs.push(() => { const axes = compareAxes(c); if (!cur.armor || !axes.length) { renderCompare([]); return null; }
    return { ...now, type: 'compare', wants, axes, K: 12, baseScore: cur.armor.score }; });
  if (c.elementSelectable) for (const e of HERO_ELEMENTS) jobs.push({ ...now, type: 'solve', elem: e, weights: weightsFor(c, e), wants: wantsFor(c, e), topN: 1, K: 10 });
  jobs.push({ reqId, type: 'solve', goal: true, weights: W, wants, availableSeries: DATA.armor.series.map(s => s.name), rarityCap: 12, orbTier: 6, topN: 1, K: 12 });
  runJobs(jobs);
}
// 計算の依頼は1つずつ送る。条件が変わったら残りは捨てて、新しい依頼に入れ替える
let jobQueue = [], jobBusy = false;
function runJobs(list) { jobQueue = list; pumpJobs(); }
function pumpJobs() {
  while (!jobBusy && jobQueue.length) {
    const j = jobQueue.shift();
    const msg = typeof j === 'function' ? j() : j;
    if (!msg) continue;
    jobBusy = true;
    worker.postMessage(msg);
  }
}

/* ---------- 攻略サイトの構成DB ---------- */
function dbBuildsFor(c) {
  const all = (DATA.builds && DATA.builds.builds) || [];
  const elem = charElement(c);
  return all.filter(b => b.charId === c.id && (!c.elementSelectable || !b.element || b.element === elem));
}
function buildsJob(c, W, wants) {
  const list = dbBuildsFor(c);
  cur.dbList = list;
  if (!list.length) { renderBuilds([]); return null; }
  return { type: 'evalBuilds', reqId, weights: W, wants, rarityCap: rankCap(),
    builds: list.map(b => ({ key: b.id, pieces: PARTS.map(part => (b.pieces[part] && b.pieces[part].id) || null) })) };
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
  plate(part), el('span', { class: 'rowMain', text: name }), el('span', { class: 'rowSide' + (need ? ' need' : ''), text: side }));
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
    const ws = (row && row.wants) || [];
    return { b, row, openAt, wc, wbase, dps, cost, now: openAt != null && openAt <= state.rank, ws, meets: ws.every(w => w.lv >= w.want) };
  });
  // DPS目安が同じなら、複数サイトに載っている構成 → 強化の少ない構成の順
  items.sort((a, b) => (b.now - a.now) || (a.now ? (b.meets - a.meets) || (Math.round(b.dps) - Math.round(a.dps)) || (b.b.sourceCount - a.b.sourceCount) || (a.cost - b.cost)
    : (a.openAt || 99) - (b.openAt || 99)));
  const nNow = items.filter(x => x.now).length;
  $('#dbCount').textContent = String(nNow);
  const hasWants = items.some(x => x.ws.length);
  hint.textContent = `今のランクで作れるのは${nNow}件。防具をレア${cap}まで強化したときのDPS目安が高い順です。` + (hasWants ? '入れたいスキルを満たす構成を先に並べています。' : '');
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
    const rowsBox = el('div', { class: 'rows card' });
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
    const wantLine = x.now && x.ws.length ? (x.meets ? el('p', { class: 'note', text: '入れたいスキルを満たしています。' })
      : el('p', { class: 'note need', text: '入れたいスキルに届かない：' + x.ws.filter(w => w.lv < w.want).map(w => `${w.skill} ${w.lv}/${w.want}`).join('・') })) : null;
    (more || box).append(el('li', { class: 'build' + (x.now ? '' : ' future') }, head, rowsBox, skills, wantLine, gapLine, det));
  });
}

function onWorkerMessage(e) {
  const msg = e.data;
  if (msg.type === 'done') { jobBusy = false; pumpJobs(); return; }
  if (msg.reqId !== reqId) return;
  if (msg.free) { if (msg.type === 'result') { cur.free = msg.best; renderWants(); } return; }
  if (msg.elem) { if (msg.type === 'result') onElemResult(msg); return; }
  if (msg.goal) { if (msg.type === 'result') { cur.goal = msg.best; renderGoal(); } return; }
  if (msg.type === 'builds') { renderBuilds(msg.rows); return; }
  if (msg.type === 'result') { cur.armor = msg.best; cur.alts = msg.alts || []; renderResult(); renderMeter(); renderWants(); }
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
  if (!cur.armor) { cancelAnimationFrame(animFrame); shownDps = 0; $('#dpsNum').textContent = '―'; $('#calcLine').textContent = ''; $('#dpsSub').textContent = ''; return; }
  const dps = dpsOf(cur.weapon, cur.armor.score);
  animateNumber(dps);
  $('#dpsSub').textContent = `武器 ${cur.weapon ? fmtInt(cur.weapon.power) : '―'} × スキル ${mult(cur.armor.score).toFixed(2)}倍`;
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
    el('summary', {}, plate(part), el('span', { class: 'rowMain', text: name }), el('span', { class: 'rowSide' + (need ? ' need' : ''), text: side })),
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
    const body = [el('p', { text: `${w.type}　攻撃${st.attack}・${w.element}${st.element || '―'}${aff ? `・会心${aff}%` : ''}${st.user ? '（自分で入力した数値）' : st.est ? '（数値は推定）' : ''}` })];
    if (w.guild) body.push(el('p', { text: 'このランクで作れるほかの武器が無いので冒険団武器。モンスター武器が作れるようになったら乗り換え推奨。' }));
    if (w.apex) {
      const alt = weaponCands(c).find(x => !x.w.apex && !x.w.guild);
      body.push(el('p', { text: `鋭精武器。属性は作るときに選ぶ（分解すれば作り直せる）。シーズン0で作れるのは今のところ2本まで。${w.effect ? w.effect.replace(/【\s*|\s*】/g, '') : ''}` }));
      if (alt) body.push(el('p', { text: `この属性で作っていなければ：${alt.w.name}（レア${alt.r}・実効${fmtInt(alt.power)}）` }));
    }
    body.push(fixToggle(() => weaponEditor(w.name, r)));
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
    if (capNow > p.rarity) body.push(el('p', { text: p.docMax < capNow ? `レア${p.docMax + 1}以降で付くスキルは、どの攻略サイトにもまだ載っていません。ゲーム内で分かったら下の「数値を直す」で入れられます。` : 'これ以上強化しても、DPSに効くスキルは増えません。' }));
    if ((fixes().armor[p.id])) body.push(el('p', { text: 'この防具は、自分で直した数値を使っています。' }));
    const ct = conflictText(p); if (ct) body.push(el('p', { text: ct }));
    body.push(fixToggle(() => armorEditor(p.part, p.id, Math.max(p.rarity, Math.min(capNow, 12)))));
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
  if (nNeed) hint.append('強化するのは', el('span', { class: 'need', text: `朱色の${nNeed}か所` }), 'だけ。行を押すとスキルが出ます。');
  else hint.textContent = '強化なしで、作ったまま使えます。行を押すとスキルが出ます。';
  const wanted = wantsFor(currentChar());
  const shown = b.totals.filter(t => t.value > 0.3 || (t.skill in wanted));
  for (const t of shown) {
    const info = DATA.skills.skills.find(s => s.name === t.skill);
    const eff = info && info.levels && info.levels[t.lv - 1] ? info.levels[t.lv - 1].effect : '';
    tot.append(el('details', { class: 'row two' },
      el('summary', {}, el('span', { class: 'rowMain skillName' }, t.skill, el('span', { class: 'pips-wrap' }, pips(t.lv, Math.min(8, t.max)), el('b', { class: 'lv', text: `Lv${t.lv}` }))),
        el('span', { class: 'rowSide', text: t.value > 0.05 ? fmtGain(t.value) : '指定' })),
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
