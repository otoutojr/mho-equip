/* 融光工房 ― UI */
'use strict';
const APP_VERSION = '2026.11.24-3';
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
    if (!currentChar()) { state.char = 'hero'; state.heroWeapon = 'hbg'; }
    worker = new Worker('solver.js?v=' + APP_VERSION);
    worker.onmessage = onWorkerMessage;
    worker.postMessage({ type: 'init', armor: d.armor, skills: d.skills });
    renderPicker();
    renderRank(true);
    bindControls();
    renderPriorities();
    renderWants();
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
  // 属性の色は判子と武器の札（と属性を選ぶ札）だけに使う。朱（強化が要る所）と混ざらないように、ほかは墨と紙
  const e = charElement(c);
  document.documentElement.dataset.el = HERO_ELEMENTS.includes(e) ? e : '無';
  const crest = $('#crest'); crest.innerHTML = ''; crest.append(wicon(charWeaponType(c)));
  const stamp = $('#elStamp');
  const mark = HERO_ELEMENTS.includes(e) ? e : '';
  if (stamp.textContent !== mark) {
    stamp.textContent = mark;
    if (mark) { stamp.classList.remove('hit'); void stamp.offsetWidth; stamp.classList.add('hit'); } // 属性が変わったときだけ「ぽん」と押す（動きは CSS 側）
  }
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
  if (!names.length) { note.textContent = ''; return; }
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
// アウかる（mhnowcalc.com）の期待値の式に合わせる。
//   物理 = 攻撃力 ×(1 + 与ダメ合計)×(1 + 会心率×0.25)
//   属性 = (属性値 + 属性攻撃力の加算)×(1 + 与ダメ合計 + 属性ダメージUP)×(1 + 会心率×(0.25 + 会心撃【属性】))
// 与ダメ系スキルは掛け算ではなく全部足し算。条件付きスキルは「効果が続いている割合」（キャラごとの見積もり）を掛ける。
// 属性ダメージの割合はキャラごとの見積もり（elementShare）。攻撃力:属性値＝2:1 の武器でその割合になるよう、属性側に倍率 s を掛ける
const BASE_AFF = 15;   // 基本の会心率（アウかるの既定値）
const CORE_CAP = 22.5; // 主人公などのコアパッシブ（会心率1%→与ダメ+0.25%）の上限
function skillDef(name) { return DATA.skills.skills.find(s => s.name === name.replace('{属性}', '火')); }
// 融光種が相手のときだけ効くスキル（融光感知）。通常種が相手のときは一覧に出さない
function yukoOnly(name) { const d = skillDef(name); return !!(d && d.levels && d.levels.length && d.levels.every(l => !l.pct && l.pctYuko)); }
// キャラ・属性・武器から計算の式を作る。ソルバー（solver.js）にも同じものを送って、組み合わせごとに計算する
function damageSpec(c, elem, weapon) {
  const m = c.model || {}, yuko = state.target === 'yuko';
  const es = m.elementShare ?? 0.35, st = weapon ? weapon.st : null;
  const sp = {
    A: st ? (st.attack || 0) : 600, E: st ? (st.element || 0) : 300, s: (es / (1 - es)) / 0.5,
    aff0: BASE_AFF + (st ? (st.affinity ?? weapon.w.affinity ?? 0) : 0),
    coreRate: Math.max(0, ((m.critPerPct ?? 0.0025) - 0.0025) * 100), coreCap: CORE_CAP,
    yuko: weapon && yuko && weapon.w.yukoBonus ? 1 + weapon.w.yukoBonus : 1, // 鋭精武器の「融光種へのダメージ+8%」
    skills: {},
    links: [], // 連動：need が lv 以上のとき skill に D を足す（背水の陣は融光怪力Lv3で常に発動）
  };
  for (const [name0, def] of Object.entries(c.modelSkills || {})) {
    const sk = skillDef(name0), levels = (sk && sk.levels) || [];
    const up = def.uptime ?? 1, share = def.share ?? 1;
    const t = { D: [], U: [], A: [], C: [], E: [] };
    const n = levels.length || (sk && sk.maxLv) || 1;
    for (let i = 0; i < n; i++) {
      const l = levels[i];
      let D = 0, U = 0, A = 0, C = 0, E = 0;
      if (!l) D = (def.fallback ?? 0.5) * (i + 1); // 数値が無いスキルは、Lvごとに少しだけ評価（同点のときの順番づけ）
      else {
        const pct = l.pct || 0, p = (yuko ? (l.pctYuko ?? pct) : pct) || 0;
        switch (def.kind) {
          case 'element': U = p; D = p * (def.core || 0); break; // core: 属性ダメージ1%が与ダメにもなるキャラ
          case 'crit': A = pct * up; break;
          case 'elemCrit': C = p; break;
          case 'proc': D = (def.chance ?? 0.75) * p * up; break;
          case 'flat': D = p * (def.value ?? 0.3); break;
          case 'fixed': D = (def.value ?? 0.03) * 100 * (l.lv || i + 1); break;
          default: D = p * up * share;
        }
        E = l.flat || 0; // Lv7 などの「属性攻撃力+50」
      }
      t.D.push(D); t.U.push(U); t.A.push(A); t.C.push(C); t.E.push(E);
    }
    const name = name0.replace('{属性}', elem || '火');
    sp.skills[name] = t;
    if (def.link && levels.length && (def.kind || 'dmg') === 'dmg') {
      const k = (def.link.uptime ?? 1) - up; // 連動したときに増える発動率の分
      sp.links.push({ skill: name, need: def.link.skill, lv: def.link.lv || 1,
        D: levels.map((l) => { const pct = l.pct || 0; return ((yuko ? (l.pctYuko ?? pct) : pct) || 0) * k * share; }) });
    }
  }
  return sp;
}
// 期待値（DPS目安）。tot はスキルの合計 {D: 与ダメ%, U: 属性ダメUP%, A: 会心率%, C: 会心撃【属性】%, E: 属性攻撃力}
function specDps(sp, tot) {
  const aff = sp.aff0 + (tot.A || 0), a = Math.max(-1, Math.min(1, aff / 100));
  const d = ((tot.D || 0) + Math.min(sp.coreCap, sp.coreRate * Math.max(0, aff))) / 100;
  const cp = 1 + 0.25 * a, ce = a >= 0 ? 1 + a * (0.25 + (tot.C || 0) / 100) : cp;
  const E = sp.E ? sp.E + (tot.E || 0) : 0;
  return (sp.A * (1 + d) * cp + E * sp.s * (1 + d + (tot.U || 0) / 100) * ce) * sp.yuko;
}
// スキルを1つだけ積んだときの伸び（候補の絞り込みと「効く順」の表示に使う。足し算なので、重ねたときはこれより少し小さくなる）
// 連動するスキル（背水の陣）は、相手（融光怪力Lv3）がそろったときの伸びにする
function specWeights(sp) {
  const base = specDps(sp, {}), out = {};
  for (const [name, t] of Object.entries(sp.skills)) {
    const L = (sp.links || []).find(x => x.skill === name);
    out[name] = t.D.map((_, i) => 100 * Math.log(specDps(sp, { D: t.D[i] + (L ? L.D[Math.min(i, L.D.length - 1)] : 0), U: t.U[i], A: t.A[i], C: t.C[i], E: t.E[i] }) / base));
  }
  return out;
}
const weaponFor = (c, elem) => weaponCands(c, { elem: c.elementSelectable ? elem : charElement(c) })[0] || null;
const specFor = (c, elem, weapon = weaponFor(c, elem)) => (c.modelSkills && c.model) ? damageSpec(c, elem, weapon) : null;
function weightsFor(c, elem) {
  const yuko = state.target === 'yuko';
  const w = Object.assign({}, (yuko && c.weightsYuko) ? c.weightsYuko : (c.weights || {}));
  let out = w;
  if (c.elementSelectable) { out = {}; for (const [k, v] of Object.entries(w)) out[k.replace('{属性}', elem)] = v; }
  const sp = specFor(c, elem);
  if (sp) Object.assign(out, specWeights(sp));
  return out;
}
const effectiveWeights = (c) => weightsFor(c, charElement(c));
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
function saveFixes() { saveState(); applyFixes(); cur.elemDps = {}; renderRank(false); solve(); }
function capTable() { return (state.fix && state.fix.rankCap) || DATA.monsters.rankCap || []; }
// 「ランクRではレアCまで」と分かったときに、表全体をそれに合わせる
function setCapFix(rank, cap) {
  const at = {};
  for (const [r, c] of capTable()) at[c] = r;
  for (let c = 3; c <= 14; c++) {
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
    const lo = w.baseRarity || 1, hi = Math.max(12, w.maxRarity || 12);
    r = Math.min(hi, Math.max(lo, r));
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
    box.append(sel, rarityStepper(() => r, (v) => { r = v; draw(); }, lo, hi),
      el('div', { class: 'fixLine' }, el('label', { class: 'field' }, el('span', { text: '攻撃力' }), atk), el('label', { class: 'field' }, el('span', { text: '属性値' }), elv)),
      el('p', { class: 'note', text: info }), msg, el('div', { class: 'fixBtns' }, save, undo));
  };
  draw();
  return box;
}
// 直せるレアの上限。ふつうは12まで、ゲーム画面で最大レア13と出ていた防具（ディアネロ・融光種リオハート・融光種バルキン）はその防具の最大レアまで
const armorRarMax = (p) => Math.max(12, p.maxRarity || 12);
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
    const rMax = armorRarMax(p);
    r = Math.min(rMax, Math.max(p.baseRarity, r));
    if (!lv) lv = levelsAt();
    const sel = el('select', { 'aria-label': '直す防具' }, ...all.map(x => { const o = el('option', { value: x.id, text: x.name }); if (x === p) o.selected = true; return o; }));
    sel.addEventListener('change', () => { p = all.find(x => x.id === sel.value); r = Math.max(p.baseRarity, Math.min(rankCap(), armorRarMax(p))); lv = null; draw(); });
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
    box.append(sel, rarityStepper(() => r, (v) => { r = v; lv = null; draw(); }, p.baseRarity, rMax),
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
  const set = (v) => { capFixVal = Math.min(14, Math.max(2, v)); renderCapFix(); };
  box.append(el('div', { class: 'fix' },
    el('div', { class: 'fixLine' }, el('span', { class: 'fixLbl', text: `ランク${state.rank}の強化上限` }), stepBtn('−', '上限を1下げる', () => set(capFixVal - 1)),
      el('span', { class: 'fixVal', text: `レア${capFixVal}` }), stepBtn('＋', '上限を1上げる', () => set(capFixVal + 1))),
    el('div', { class: 'fixBtns' },
      el('button', { type: 'button', class: 'btn solid small', text: '保存', onclick: () => { setCapFix(state.rank, capFixVal); capFixOpen = false; saveFixes(); } }),
      fixed ? el('button', { type: 'button', class: 'btn small', text: '元の表に戻す', onclick: () => { fixes().rankCap = null; capFixOpen = false; saveFixes(); } }) : null,
      el('button', { type: 'button', class: 'btn small', text: 'やめる', onclick: () => { capFixOpen = false; renderCapFix(); } }))));
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
    if (g.type === 'rank') return rank >= g.rank; // 解放ランクが分からず、このランクの画面に並んでいたことだけ確認できたもの
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
// 武器だけの期待値（防具スキルなし）。上のダメージモデルと同じ式なので、DPS目安 ＝ これ × スキルの倍率
function weaponPower(c, w, st) {
  return specDps(damageSpec({ model: c.model, modelSkills: {} }, null, { w, st }), {});
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
  renderTarget();
  setView(state.view);
  setPicker(!state.seen); // 初めて開いたときは選択欄を開いておく
}

/* ---------- solving ---------- */
// 一度計算した答えは、このページを開いている間だけ覚えておく（通常⇄融光種などを行き来したときにすぐ出す）
const solveCache = new Map();
const solveKey = (c, wants) => JSON.stringify([c.id, charWeaponType(c), charElement(c), state.rank, state.target, wants, state.fix]);
// 計算中は、前の答えを薄くして残し、判子のまわりで点線を回す（画面の高さを変えない）
function setCalc(on) {
  $('#app').classList.toggle('calc', on);
  $('section.dps').setAttribute('aria-busy', String(on));
}
function solve() {
  if (!worker || !DATA) return;
  const c = currentChar();
  reqId++;
  const shown = !!cur.armor; // いま画面に前の答えが出ているか
  cur.armor = null; cur.goal = null; cur.alts = [];
  cur.weapon = weaponCands(c)[0] || null;
  cur.goalWeapon = weaponCands(c, { rank: 99, cap: 14 })[0] || null;
  renderWho();
  const W = effectiveWeights(c);
  const wants = wantsFor(c);
  cur.key = solveKey(c, wants);
  const hit = solveCache.get(cur.key);
  $('#resultHint').textContent = '';
  if (!hit && !shown) { // 最初の1回だけは、出せるものが無いので空の枠
    renderGear();
    for (const id of ['#skillTotals', '#candList']) { $(id).innerHTML = ''; $(id).append(el('p', { class: 'note', text: '計算中…' })); }
    $('#setNote').hidden = true;
  }
  setCalc(!hit);
  renderElemFold();
  for (const id of ['#compareList', '#nextList']) { $(id).innerHTML = ''; $(id).append(el('p', { class: 'note', text: '計算中…' })); }
  $('#goalBody').innerHTML = '';
  $('#cmpBlock').hidden = c.scoreMode !== 'log';
  cur.free = hit ? hit.free : null;
  if (hit) { cur.armor = hit.armor; cur.alts = hit.alts; cur.variants = hit.variants; renderResult(); renderMeter(); }
  renderWants();
  const spec = specFor(c, charElement(c), cur.weapon);
  const now = { reqId, weights: W, spec, availableSeries: availableSeries(), rarityCap: rankCap(), orbTier: orbTierFor(rankCap()) };
  const jobs = [];
  // 指定があるときは、指定なしの最強も先に出して差を見せる
  if (!hit && Object.keys(wants).length) jobs.push({ ...now, type: 'solve', free: true, topN: 1, K: 12 });
  if (!hit) jobs.push({ ...now, type: 'solve', wants, topN: 6, K: 12, variants: true, vary: HP_COST });
  jobs.push(() => buildsJob(c, W, wants, spec));
  // ここから下は折りたたみの中身。いまの答えが出てから順に計算する
  jobs.push(() => { if (!cur.armor) { renderNext({ milestones: [] }); return null; }
    return { ...now, type: 'next', wants, milestones: milestones(), K: 12, baseScore: cur.armor.score, baseIds: cur.armor.pieces.map(p => p.id) }; });
  jobs.push(() => { const axes = compareAxes(c); if (!cur.armor || !axes.length) { renderCompare([]); return null; }
    return { ...now, type: 'compare', wants, axes, K: 12, baseScore: cur.armor.score }; });
  if (c.elementSelectable) for (const e of HERO_ELEMENTS) jobs.push({ ...now, type: 'solve', elem: e, weights: weightsFor(c, e), spec: specFor(c, e), wants: wantsFor(c, e), topN: 1, K: 10 });
  jobs.push({ reqId, type: 'solve', goal: true, weights: W, spec: specFor(c, charElement(c), cur.goalWeapon), wants, availableSeries: DATA.armor.series.map(s => s.name), rarityCap: 14, orbTier: 6, topN: 1, K: 12 });
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
function buildsJob(c, W, wants, spec) {
  const list = dbBuildsFor(c);
  cur.dbList = list;
  if (!list.length) { renderBuilds([]); return null; }
  return { type: 'evalBuilds', reqId, weights: W, spec, wants, rarityCap: rankCap(),
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
  plate(part), el('span', { class: 'rowMain' }, ...[].concat(name)), el('span', { class: 'rowSide' + (need ? ' need' : ''), text: side }));
const pieceLine = (p) => el('p', {}, `${PART_JP[p.part]}　`, ...armorLabel(p), `　${rarText(p.baseRarity, p.rarity)}`);
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
    rowsBox.append(staticRow('武器', wname, x.wc ? rarText(x.wc.w.baseRarity || 1, x.wc.r) : 'データなし', !!x.wc && x.wc.r > (x.wc.w.baseRarity || 1)));
    const pieceInfo = new Map(((row && row.set && row.set.pieces) || []).map(p => [p.id, p]));
    for (const part of PARTS) {
      const p = b.pieces[part];
      const info = p && p.id ? pieceInfo.get(p.id) : null;
      const locked = p && p.id && !avail.has(seriesOfPiece(p.id));
      rowsBox.append(staticRow(PART_JP[part], p ? (p.id ? armorLabel(p) : (p.name || p.raw)) : '―',
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
  if (msg.type === 'result') {
    cur.armor = msg.best; cur.alts = msg.alts || []; cur.variants = msg.variants || [];
    solveCache.set(cur.key, { armor: cur.armor, alts: cur.alts, variants: cur.variants, free: cur.free });
    if (solveCache.size > 60) solveCache.delete(solveCache.keys().next().value);
    setCalc(false); renderResult(); renderMeter(); renderWants();
  }
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
  // NumberFlow（vendor/number-flow）：桁ごとに数字が回る。動きを減らす設定では回らない。読み込めなかったときは下の数え上げ
  if (window.customElements && customElements.get('number-flow')) {
    let flow = node.querySelector('number-flow');
    if (!flow) {
      node.textContent = '';
      flow = document.createElement('number-flow');
      flow.locales = 'ja-JP'; flow.format = { maximumFractionDigits: 0 };
      flow.transformTiming = { duration: 750, easing: 'cubic-bezier(.2, .8, .2, 1)' };
      flow.opacityTiming = { duration: 350, easing: 'ease-out' };
      flow.setAttribute('aria-hidden', 'true'); // 読み上げは隣の .vh（回っている途中の桁を読ませない）
      node.append(flow, el('span', { class: 'vh' }));
    }
    shownDps = target; flow.update(Math.round(target)); node.querySelector('.vh').textContent = fmtInt(target);
    return;
  }
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
  if (!cur.armor) { cancelAnimationFrame(animFrame); shownDps = 0; $('#dpsNum').textContent = '―'; $('#dpsSub').textContent = ''; return; }
  const dps = dpsOf(cur.weapon, cur.armor.score);
  animateNumber(dps);
  $('#dpsSub').textContent = `武器 ${cur.weapon ? fmtInt(cur.weapon.power) : '―'} × スキル ${mult(cur.armor.score).toFixed(2)}倍`;
  renderGoal();
}

/* ---------- 計算の最強：武器＋防具5部位 ---------- */
// 防具はシリーズ名（＝モンスター名）だけで出す。融光種は「光」の札。部位は左の札、正式な名前は行を開くと出る
function armorLabel(p) { return yukoLabel((p.id && seriesOfPiece(p.id)) || p.name || p.raw || '―'); }
const yukoLabel = (s) => (s.startsWith('融光種') ? [el('span', { class: 'yk', role: 'img', 'aria-label': '融光種' }, '光'), s.slice(3)] : [s]);
function gearRow(part, name, side, need, body) {
  return el('details', { class: 'row' },
    el('summary', {}, plate(part), el('span', { class: 'rowMain' }, ...[].concat(name)), el('span', { class: 'rowSide' + (need ? ' need' : ''), text: side })),
    el('div', { class: 'rowBody' }, ...body));
}
// 強化が要る所を朱の手書きの丸で囲む（Rough Notation、vendor/rough-notation）。描き直すたびに前の丸は消す
let needMarks = [], markQueued = false;
function markNeeds() {
  markQueued = false;
  needMarks.forEach(a => a.remove()); needMarks = [];
  if (!window.RoughNotation) return;
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const color = getComputedStyle(document.documentElement).getPropertyValue('--shu').trim() || '#b3311f';
  for (const s of document.querySelectorAll('#gear .rowSide.need')) {
    const a = RoughNotation.annotate(s, { type: 'circle', color, strokeWidth: 1.6, padding: [8, 7, 8, 10], animate: !reduce, animationDuration: 700 });
    a.show(); needMarks.push(a);
    const svg = s.nextElementSibling; // Rough Notation は丸の SVG を対象のすぐ後ろに入れる。飾りなので読み上げない
    if (svg && svg.classList.contains('rough-annotation')) svg.setAttribute('aria-hidden', 'true');
  }
}
const queueMarks = () => { if (!markQueued) { markQueued = true; requestAnimationFrame(markNeeds); } };
// 戻り値：強化が要る行の数
function renderGear() {
  const c = currentChar();
  queueMarks();
  const box = $('#gear'); box.innerHTML = '';
  let nNeed = 0;
  const wb = cur.weapon;
  if (wb) {
    const { w, r, st } = wb;
    const need = r > (w.baseRarity || 1); if (need) nNeed++;
    const aff = st.affinity ?? w.affinity;
    const body = [el('p', { text: `${w.type}　攻撃${st.attack}・${w.element}${st.element || '―'}${aff ? `・会心${aff}%` : ''}${st.user ? '（自分で入力した数値）' : ''}` })];
    if (w.guild) body.push(el('p', { text: 'このランクで作れるほかの武器が無いので冒険団武器。モンスター武器が作れるようになったら乗り換え推奨。' }));
    if (w.apex) {
      const alt = weaponCands(c).find(x => !x.w.apex && !x.w.guild);
      body.push(el('p', { text: `鋭精武器。属性は作るときに選ぶ（分解すれば作り直せる）。シーズン0で作れるのは今のところ2本まで。${w.effect ? w.effect.replace(/【\s*|\s*】/g, '') : ''}` }));
      if (alt) body.push(el('p', { text: `この属性で作っていなければ：${alt.w.name}（レア${alt.r}・実効${fmtInt(alt.power)}）` }));
    }
    body.push(fixToggle(() => weaponEditor(w.name, r)));
    box.append(gearRow('武器', yukoLabel(w.name), rarText(w.baseRarity || 1, r), need, body));
  } else if (DATA.weapons) {
    box.append(el('p', { class: 'note', text: `このランクで作れる${charElement(c)}属性の${charWeaponType(c)}が見つかりません。` }));
  }
  const b = cur.armor;
  if (!b) return nNeed;
  const capNow = rankCap();
  for (const p of b.pieces) {
    const need = p.rarity > p.baseRarity; if (need) nNeed++;
    const body = [el('p', { class: 'full', text: p.name }), el('p', { text: p.skills.map(k => `${k.name}${k.lv}`).join('・') || 'スキルなし' })];
    // スキルはレアp.rarityで揃う。それより上は、攻略サイトにスキルが載っているレア（docMax）までは増えないと分かっている
    if (capNow > p.rarity && p.docMax >= capNow) body.push(el('p', { text: 'これ以上強化しても、DPSに効くスキルは増えません。' }));
    if ((fixes().armor[p.id])) body.push(el('p', { text: 'この防具は、自分で直した数値を使っています。' }));
    body.push(fixToggle(() => armorEditor(p.part, p.id, Math.max(p.rarity, Math.min(capNow, armorRarMax(p))))));
    box.append(gearRow(PART_JP[p.part], armorLabel(p), rarText(p.baseRarity, p.rarity), need, body));
  }
  return nNeed;
}
function renderResult() {
  const b = cur.armor;
  renderGear();
  const hint = $('#resultHint'); hint.innerHTML = '';
  const tot = $('#skillTotals'); tot.innerHTML = '';
  const cands = $('#candList'); cands.innerHTML = '';
  const sn = $('#setNote'); sn.hidden = true;
  if (!b) {
    hint.textContent = 'このランクで作れる防具が見つかりませんでした。';
    for (const box of [tot, cands]) box.append(el('p', { class: 'note', text: '―' }));
    return;
  }
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
  renderCandidates(b, cands);
}
// 強い装備の候補（1〜3位）。主なスキル（DPSを5%以上上げているもの）の組み合わせが同じものはまとめて、
// 組み方の違う候補だけ並べる（弱点攻撃1→洞察1 のような小さな入れ替えだけの構成は出さない）
const mainSig = (d) => d.totals.filter(t => t.value >= 4.9).map(t => t.skill).sort().join('|');
// 体力の上限が下がるスキル。1位に入っているときは、それを使わない候補も必ず並べる
const HP_COST = ['融光怪力'];
function renderCandidates(b, box) {
  const list = [b], seen = new Set([mainSig(b)]);
  const pool = [...(cur.variants || []), ...(cur.alts || [])].sort((x, y) => y.score - x.score);
  for (const d of pool) {
    const k = mainSig(d);
    if (seen.has(k)) continue;
    seen.add(k); list.push(d);
    if (list.length >= 3) break;
  }
  const has = (d, n) => d.totals.some(t => t.skill === n && t.lv > 0);
  for (const n of HP_COST) {
    if (!has(b, n) || list.slice(1).some(d => !has(d, n))) continue;
    const safe = pool.find(d => (d.without || []).includes(n));
    if (safe) list.splice(Math.min(list.length, 2), 1, safe);
  }
  const top = dpsOf(cur.weapon, b.score);
  list.forEach((d, i) => {
    const dps = dpsOf(cur.weapon, d.score);
    const tag = d.without ? `（${d.without.join('・')}なし）` : '';
    const main = el('span', { class: 'rowMain', text: `${i + 1}位　${skillLine(d.totals) || '―'}${tag}` });
    const side = el('span', { class: 'rowSide', text: fmtInt(dps) + (i ? `（${fmtPct((dps / top - 1) * 100)}）` : '') });
    if (!i) { box.append(el('div', { class: 'candTop' }, main, side)); return; } // 1位は上の装備そのものなので開かない
    box.append(el('details', { class: 'row two' }, el('summary', {}, main, side), el('div', { class: 'rowBody' }, ...d.pieces.map(pieceLine))));
  });
  if (list.length < 2) box.append(el('p', { class: 'note', text: '組み方の違う候補はありません。' }));
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
        gw ? el('p', { text: `武器　${gw.w.name}　レア${gw.r}` }) : null,
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
  }).filter(({ key, w }) => !(w <= 0 && state.target !== 'yuko' && yukoOnly(key))).sort((a, b) => b.w - a.w);
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
