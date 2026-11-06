/* 装備おすすめ ― UI */
'use strict';
const APP_VERSION = '2026.11.06-7';
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

function loadState() {
  const def = { char: 'hero', heroWeapon: 'hbg', heroElement: '火', rank: 1, target: 'normal' };
  let st;
  try { st = Object.assign(def, JSON.parse(localStorage.getItem(STORE_KEY) || '{}')); } catch { st = def; }
  // 旧バージョンの charId（hero_hbg など）を引き継ぐ
  if (st.charId) {
    if (st.charId.startsWith('hero_')) { st.char = 'hero'; st.heroWeapon = st.charId.slice(5); } else st.char = st.charId;
    delete st.charId;
  }
  delete st.defeated; delete st.tune; delete st.map; delete st.orbTier; delete st.guildLv;
  return st;
}
function saveState() { try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch {} }

async function loadData() {
  const q = `?v=${APP_VERSION}`;
  const [armor, skills, monsters, characters] = await Promise.all(
    ['armor', 'skills', 'monsters', 'characters'].map(n => fetch(`data/${n}.json${q}`).then(r => { if (!r.ok) throw new Error(n); return r.json(); }))
  );
  const weapons = await fetch(`data/weapons.json${q}`).then(r => (r.ok ? r.json() : null)).catch(() => null);
  return { armor, skills, monsters, characters, weapons };
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
    renderFields();
    renderMenu();
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
  document.querySelectorAll('#menu a.menuItem').forEach(a => a.addEventListener('click', () => setMenu(false)));
  $('#menuReset').addEventListener('click', () => {
    setMenu(false);
    if (!confirm('キャラ・ランクの選択を初期状態に戻します。いい？')) return;
    for (const k of Object.keys(state)) delete state[k];
    Object.assign(state, { char: 'hero', heroWeapon: 'hbg', heroElement: '火', rank: 1, target: 'normal' });
    saveState(); renderFields(true); renderTargetTabs(); renderChars(); renderPriorities(); solve();
  });
  $('#menuHelp').addEventListener('click', () => { setMenu(false); setHelp(true); });
  $('#helpBack').addEventListener('click', () => setHelp(false));
  $('#helpClose').addEventListener('click', () => setHelp(false));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { setMenu(false); setHelp(false); } });
}

/* ---------- characters ---------- */
const HERO_WEAPONS = [['gs', '大剣'], ['ls', '太刀'], ['db', '双剣'], ['lance', 'ランス'], ['hammer', 'ハンマー'], ['cb', 'チャアク'], ['hbg', 'ヘビィ'], ['bow', '弓']];
const HERO_ELEMENTS = ['火', '水', '雷', '氷', '龍'];
function heroElement() { return HERO_ELEMENTS.includes(state.heroElement) ? state.heroElement : '火'; }
function charId() { return state.char === 'hero' ? `hero_${state.heroWeapon}` : state.char; }
function currentChar() { return DATA.characters.characters.find(c => c.id === charId()); }
function charElement(c) { return c.elementSelectable ? heroElement() : (c.element || '無'); }
const CHAR_ORDER = ['pepe', 'midori', 'luca', 'cless', 'ensho', 'akenia', 'lord', 'haze', 'raya', 'madre', 'folio', 'brix', 'ryunosuke'];
function uniqueChars() {
  const pos = (id) => { const i = CHAR_ORDER.indexOf(id); return i < 0 ? 99 : i; };
  return DATA.characters.characters.filter(c => !c.id.startsWith('hero_')).sort((a, b) => pos(a.id) - pos(b.id));
}

function selectChar(next) { Object.assign(state, next); saveState(); renderChars(); renderPriorities(); solve(); }
function tabBtn(label, selected, onclick, dotElem, sub) {
  return el('button', { type: 'button', class: 'ctab', role: 'tab', 'aria-selected': String(selected), onclick },
    el('span', { class: 'ctabName' }, dotElem ? el('span', { class: 'el', style: `background: var(--el-${EL_CLASS[dotElem] || 'none'})` }) : null, label),
    sub ? el('span', { class: 'ctabSub', text: sub }) : null);
}
function renderChars() {
  const box = $('#charTabs'); box.innerHTML = '';
  box.append(tabBtn('主人公', state.char === 'hero', () => selectChar({ char: 'hero' }), heroElement(), `${(HERO_WEAPONS.find(w => w[0] === state.heroWeapon) || [, ''])[1]}・${heroElement()}`));
  for (const c of uniqueChars()) box.append(tabBtn(c.name, state.char === c.id, () => selectChar({ char: c.id }), c.element, c.weapon === 'チャージアックス' ? 'チャアク' : (c.weapon === 'ヘビィボウガン' ? 'ヘビィ' : c.weapon)));
  const heroSel = $('#heroSel');
  heroSel.hidden = state.char !== 'hero';
  if (state.char === 'hero') {
    const wt = $('#weaponTabs'); wt.innerHTML = '';
    for (const [id, label] of HERO_WEAPONS) wt.append(tabBtn(label, state.heroWeapon === id, () => selectChar({ heroWeapon: id })));
    const et = $('#elementTabs'); et.innerHTML = '';
    for (const e of HERO_ELEMENTS) et.append(tabBtn(e, heroElement() === e, () => selectChar({ heroElement: e }), e));
  }
  const c = currentChar();
  $('#charNote').textContent = c.note || (c.mechanics || []).join('。');
}
// 主人公は属性を選べるので、重みの「{属性}」を選択中の属性に置き換える
/* ---------- ダメージモデル（ブラウザ側で再計算。発動率の調整を反映） ---------- */
const UPTIME_KINDS = new Set(['dmg', 'crit', 'proc']);
function tuneOf() { return {}; }
function skillDef(name) { return DATA.skills.skills.find(s => s.name === name.replace('{属性}', '火')); }
function uptimeOf(c, name) { const t = tuneOf(c); const sp = c.modelSkills[name]; return t[name] != null ? t[name] : (sp.uptime ?? 1); }
function elementShareOf(c) { const t = tuneOf(c); return t.__elementShare != null ? t.__elementShare : (c.model.elementShare ?? 0.35); }
function modelWeights(c, yuko) {
  const m = c.model, e = elementShareOf(c);
  const wE = m.weaponElement || 600, critPer = m.critPerPct ?? 0.004, critRate = m.critRate ?? 0.3;
  const out = {};
  for (const [name, sp] of Object.entries(c.modelSkills)) {
    const sk = skillDef(name); const levels = (sk && sk.levels) || [];
    const up = uptimeOf(c, name), share = sp.share ?? 1;
    let arr = levels.map((l) => {
      const pct = l.pct || 0, p = ((yuko ? (l.pctYuko ?? pct) : pct) || 0) / 100;
      let mult;
      switch (sp.kind) {
        case 'element': mult = (1 + p * e) * (1 + p * (sp.core || 0)); break;
        case 'crit': mult = 1 + pct * up * critPer; break;
        case 'elemCrit': mult = 1 + p * critRate * e; break;
        case 'proc': mult = 1 + (sp.chance ?? 0.75) * p * up; break;
        case 'flat': mult = 1 + p * (sp.value ?? 0.3); break;
        default: mult = 1 + p * up * share;
      }
      if (l.flat) mult *= 1 + (l.flat / wE) * e;
      return 100 * Math.log(mult);
    });
    if (!arr.length) arr = Array.from({ length: (sk && sk.maxLv) || 1 }, (_, i) => (sp.fallback ?? 0.5) * (i + 1));
    out[name] = arr;
  }
  return out;
}
function effectiveWeights(c) {
  const yuko = state.target === 'yuko';
  let w = Object.assign({}, (yuko && c.weightsYuko) ? c.weightsYuko : (c.weights || {}));
  if (c.modelSkills && c.model) Object.assign(w, modelWeights(c, yuko));
  if (!c.elementSelectable) return w;
  const out = {};
  for (const [k, v] of Object.entries(w)) out[k.replace('{属性}', heroElement())] = v;
  return out;
}
function renderPriorities() {
  const c = currentChar();
  const list = $('#prioList'); list.innerHTML = '';
  $('#prioHint').textContent = c.scoreMode === 'log'
    ? `そのスキルを最大まで積んだときに、${state.target === 'yuko' ? '融光種相手の' : ''}火力が何%上がるか。上ほど火力が出るスキルです。`
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
    const li = el('li', { class: 'prio' },
      el('div', { class: 'prioHead' },
        el('span', { class: 'pname', text: `${key} Lv${lv}` }),
        el('span', { class: 'gain', text: c.scoreMode === 'log' ? `火力 ${fmtGain(w)}` : '' })),
      el('span', { class: 'reason', text: p.reason || '' }));
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

/* ---------- rank ---------- */
function renderFields(valuesOnly) {
  $('#rank').value = state.rank; $('#rankVal').textContent = state.rank;
  if (valuesOnly) return;
  let rankTimer = null;
  const applyRank = (v, live) => {
    state.rank = Math.min(60, Math.max(1, v)); $('#rank').value = state.rank; $('#rankVal').textContent = state.rank;
    renderCapNote();
    clearTimeout(rankTimer);
    rankTimer = setTimeout(() => { saveState(); solve(); }, live ? 300 : 0);
  };
  $('#rank').addEventListener('input', (e) => applyRank(+e.target.value, true));
  document.querySelectorAll('.nudge').forEach(b => b.addEventListener('click', () => applyRank(state.rank + (+b.dataset.nudge), false)));
  document.querySelectorAll('#targetTabs .tab').forEach((b) => {
    b.addEventListener('click', () => { state.target = b.dataset.target; saveState(); renderTargetTabs(); renderPriorities(); solve(); });
  });
  renderTargetTabs();
}
function renderTargetTabs() {
  document.querySelectorAll('#targetTabs .tab').forEach((b) => b.setAttribute('aria-selected', String((state.target || 'normal') === b.dataset.target)));
}

/* ---------- ランクで決まること ---------- */
function rankCap(rank = state.rank) {
  let cap = 2;
  for (const [r, c] of (DATA.monsters.rankCap || [])) if (rank >= r) cap = c;
  return cap;
}
// そのレアまで強化するのに要る狩魂玉のランク（ランクで解放されていれば手に入る前提）
function orbTierFor(cap) {
  const t = DATA.monsters.orbCap || {};
  for (let i = 1; i <= 6; i++) if ((t[i] || t[String(i)] || 0) >= cap) return i;
  return 6;
}
function monsterOpen(name, rank) {
  const m = DATA.monsters.monsters.find(x => x.name === name);
  return !m || m.unlockRank == null || m.unlockRank <= rank;
}
function mapOpen(name, rank) {
  const m = DATA.monsters.maps.find(x => x.name === name);
  return !m || m.unlockRank == null || m.unlockRank <= rank;
}
function availableSeries(rank = state.rank) {
  return DATA.armor.series.filter((s) => {
    const g = s.gate || { type: 'basic' };
    if (g.type === 'monster') return (g.monsters || [g.monster]).some(n => monsterOpen(n, rank));
    if (g.type === 'map') return mapOpen(g.map, rank);
    return true;
  }).map(s => s.name);
}
function renderCapNote() {
  const step = (DATA.monsters.rankCap || []).find(([r]) => r > state.rank);
  $('#capNote').textContent = `ランク${state.rank}：レア${rankCap()}まで強化できる` + (step ? `（ランク${step[0]}でレア${step[1]}）` : '');
}
// この先のランクの節目（強化上限が上がる・新しいモンスターが解放される）
function milestones() {
  const now = new Set(availableSeries());
  const ranks = new Set();
  for (const [r] of (DATA.monsters.rankCap || [])) if (r > state.rank) ranks.add(r);
  for (const m of DATA.monsters.monsters) if (m.unlockRank != null && m.unlockRank > state.rank && m.armorSeries.length) ranks.add(m.unlockRank);
  return [...ranks].sort((a, b) => a - b).slice(0, 6).map((r) => {
    const series = availableSeries(r);
    const cap = rankCap(r);
    const newMon = DATA.monsters.monsters.filter(m => m.unlockRank === r && m.armorSeries.some(sn => !now.has(sn))).map(m => m.name);
    const why = [];
    if (cap > rankCap(r - 1)) why.push(`レア${cap}まで強化`);
    if (newMon.length) why.push(newMon.join('・') + 'の装備');
    return { label: `ランク${r}`, why: why.join('／'), series, rarityCap: cap, orbTier: orbTierFor(cap) };
  });
}

/* ---------- solving ---------- */
function solve() {
  if (!worker || !DATA) return;
  const c = currentChar();
  const avail = availableSeries();
  reqId++;
  renderCapNote();
  $('#resultTitle').textContent = `ランク${state.rank}の最強装備`;
  $('#resultHint').textContent = '計算中…';
  $('#compareList').innerHTML = ''; $('#compareList').append(el('li', { class: 'empty', text: '計算中…' }));
  $('#nextList').innerHTML = ''; $('#nextList').append(el('li', { class: 'empty', text: '計算中…' }));
  $('#comparePanel').hidden = c.scoreMode !== 'log';
  renderWeapon(c);
  const W = effectiveWeights(c);
  worker.postMessage({ type: 'solve', reqId, weights: W, availableSeries: avail, rarityCap: rankCap(), orbTier: orbTierFor(rankCap()), milestones: milestones(), axes: compareAxes(c), K: 12, topN: 6 });
  worker.postMessage({ type: 'solve', reqId, goal: true, weights: W, availableSeries: DATA.armor.series.map(s => s.name), rarityCap: 12, orbTier: 6, K: 12, topN: 3 });
}

/* ---------- 武器（データがあれば） ---------- */
const WEAPON_TYPE = { hbg: 'ヘビィボウガン', ls: '太刀', gs: '大剣', db: '双剣', lance: 'ランス', hammer: 'ハンマー', cb: 'チャージアックス', bow: '弓' };
function weaponStatsAt(w, r) {
  const st = w.stats || {};
  if (st[r]) return st[r];
  const keys = Object.keys(st).map(Number).filter(k => k <= r).sort((a, b) => b - a);
  return keys.length ? st[keys[0]] : null;
}
function weaponCands(c, rank = state.rank, capOverride = null) {
  const list = (DATA.weapons && DATA.weapons.weapons) || [];
  const type = c.weapon || WEAPON_TYPE[state.heroWeapon];
  const elem = charElement(c);
  const cap = capOverride || rankCap(rank);
  const e = (c.model && c.model.elementShare) || 0.35;
  const out = [];
  for (const w of list) {
    if (w.type !== type || w.element !== elem) continue;
    if ((w.baseRarity || 1) > cap) continue;
    if (!(w.monsters || []).every(m => monsterOpen(m, rank))) continue;
    const r = Math.min(w.maxRarity || cap, cap);
    const st = weaponStatsAt(w, r);
    if (!st) continue;
    // 物理と属性の割合で重み付け（属性の割合はキャラのモデルと同じ）。会心率は+25%×確率
    const score = (st.attack || 0) * (1 + ((st.affinity ?? w.affinity ?? 0) / 100) * 0.25) * (1 - e) + (st.element || 0) * 2 * e;
    out.push({ w, r, st, score });
  }
  return out.sort((a, b) => b.score - a.score);
}
function weaponCard(b, label) {
  const { w, r, st } = b;
  const need = r > (w.baseRarity || 1);
  const aff = st.affinity ?? w.affinity;
  return el('div', { class: 'slot weapon' },
    el('div', { class: 'part', text: '武' }),
    el('div', {},
      label ? el('div', { class: 'wlabel', text: label }) : null,
      el('div', { class: 'pname' }, w.name, el('span', { class: 'series', text: `${w.type}・${w.element}属性${w.guild ? '・鉄鉱石で強化できる冒険団武器' : ''}` })),
      el('div', { class: 'rar' }, el('span', { class: 'lbl' },
        need ? el('b', { class: 'need', text: `レア${r}まで強化` }) : el('b', { text: `レア${r}` }),
        `　攻撃${st.attack}・${w.element}${st.element || '―'}${aff ? `・会心${aff}%` : ''}${st.est ? '（推定値）' : ''}`))));
}
function renderWeapon(c) {
  const box = $('#weaponSlot'); box.innerHTML = '';
  if (!DATA.weapons) return;
  const cands = weaponCands(c);
  if (!cands.length) { box.append(el('div', { class: 'slot weapon' }, el('div', { class: 'part', text: '武' }), el('div', { class: 'empty', text: `このランクで作れる${charElement(c)}属性の${c.weapon || WEAPON_TYPE[state.heroWeapon]}が見つかりません。` }))); return; }
  box.append(weaponCard(cands[0]));
  if (cands[0].w.guild) {
    const alt = cands.find(x => !x.w.guild);
    if (alt) box.append(el('div', { class: 'walt', text: `冒険団武器を使わないなら：${alt.w.name}（レア${alt.r}・攻撃${alt.st.attack}・${alt.w.element}${alt.st.element || '―'}）` }));
  }
}

let lastBase = 0;
function onWorkerMessage(e) {
  const msg = e.data;
  if (msg.reqId !== reqId) return;
  if (msg.goal) { if (msg.type === 'result') renderGoal(msg); return; }
  if (msg.type === 'result') renderResult(msg);
  if (msg.type === 'next') renderNext(msg.next);
  if (msg.type === 'compare') renderCompare(msg.rows);
}

function compareAxes(c) {
  if (c.scoreMode !== 'log' || !c.modelSkills) return [];
  const elemName = charElement(c);
  const W = effectiveWeights(c);
  return (c.priorities || [])
    .filter(p => { const sp = c.modelSkills[p.skill]; return sp && (sp.kind === 'dmg' || sp.kind === 'element'); })
    .map(p => { const key = p.skill.replace('{属性}', elemName); const arr = W[key] || [0]; return { label: `${key}を軸`, skill: key, max: arr[arr.length - 1] }; })
    .sort((a, b) => b.max - a.max).slice(0, 5);
}
function renderCompare(rows) {
  const box = $('#compareList'); box.innerHTML = '';
  if (!rows || !rows.length) { box.append(el('li', { class: 'empty', text: '比べられる構成がまだありません。' })); return; }
  const top = rows[0].score;
  rows.forEach((r, i) => {
    const skills = r.set.totals.filter(t => t.value > 0.3).map(t => `${t.skill}${t.lv}`).join('・');
    const diff = (Math.exp((r.score - top) / 100) - 1) * 100;
    const li = el('li', { class: 'cmp' + (i === 0 ? ' best' : '') },
      el('div', { class: 'cmpHead' },
        el('span', { class: 'cmpName', text: `${r.skill} Lv${r.lv}の構成` }),
        el('span', { class: 'cmpScore', text: fmtScore(r.score) })),
      el('div', { class: 'cmpSub', text: i === 0 ? 'いちばん火力が出る' : `1位より火力 ${diff.toFixed(1)}%` }),
      el('div', { class: 'cmpSkills', text: skills }));
    const det = el('details', { class: 'cmpDet' }, el('summary', { text: '防具を見る' }),
      el('ul', {}, ...r.set.pieces.map(p => el('li', { text: `${PART_JP[p.part]} ${p.name}${p.rarity > p.baseRarity ? `（レア${p.rarity}まで強化）` : ''}` }))));
    li.append(det);
    box.append(li);
  });
}

function gainPct(w) { return (Math.exp((w || 0) / 100) - 1) * 100; }
function fmtGain(w) { const v = gainPct(w); return (v >= 0 ? '+' : '') + (v < 10 ? v.toFixed(1) : Math.round(v)) + '%'; }
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
    $('#resultHint').textContent = 'このランクで作れる防具が見つかりませんでした。';
    $('#skillTotals').innerHTML = ''; $('#altList').innerHTML = '';
    return;
  }
  const b = res.best;
  lastBase = b.score;
  $('#scoreValue').textContent = fmtScore(b.score);
  $('#scoreLabel').textContent = isLog() ? '火力（スキルなし比）' : '火力スキル合計（目安）';
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
    tot.append(el('div', { class: 'sk' },
      el('span', {}, t.skill, el('span', { class: 'lv', text: ` Lv${t.lv}${t.raw > t.max ? `（上限、${t.raw - t.max}余り）` : ''}` })),
      el('span', { class: 'gain', text: isLog() ? `火力 ${fmtGain(t.value)}` : '' }), bar, eff ? el('span', { class: 'eff', text: eff }) : null));
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
  // 前の節目より強くならない節目は省く
  const rows = [];
  let last = lastBase;
  for (const x of (res.milestones || [])) { if (x.score > last + 0.05 || (!rows.length && x === res.milestones[res.milestones.length - 1])) { rows.push(x); last = Math.max(last, x.score); } }
  let shown = 0;
  for (const x of rows) {
    const flat = x.delta < 0.05;
    nl.append(el('li', { class: 'next' + (flat ? ' flat' : '') },
      el('span', { class: 'nname' }, x.label, el('span', { class: 'nwhy', text: x.why ? `　${x.why}` : '' })),
      el('span', { class: 'delta', text: flat ? '変化なし' : fmtDelta(x.delta) }),
      el('span', { class: 'why', text: flat ? 'いまの装備のままでOK' : `${x.skills}　／　入れ替え：${x.changed.join('・') || '―'}` })));
    shown++;
  }
  if (!shown) nl.append(el('li', { class: 'empty', text: 'これ以上ランクを上げても装備は変わりません。' }));
}

function renderGoal(res) {
  const box = $('#goalBody'); box.innerHTML = '';
  if (!res.best) { box.append(el('div', { class: 'empty', text: '計算できませんでした。' })); return; }
  const b = res.best;
  const skills = b.totals.filter(t => t.value > 0).map(t => `${t.skill} Lv${t.lv}`).join('・');
  const gain = lastBase ? fmtDelta(b.score - lastBase) : '';
  const gw = DATA.weapons ? weaponCands(currentChar(), 99, 14)[0] : null;
  box.append(el('div', { class: 'goal' },
    el('div', {}, el('span', { class: 'gScore', text: fmtScore(b.score) }), gain ? el('span', { class: 'hint', text: `　いまのセットから${gain}` }) : null),
    gw ? el('div', { class: 'gWeapon', text: `武器：${gw.w.name}（レア${gw.r}・攻撃${gw.st.attack}・${gw.w.element}${gw.st.element || '―'}${gw.st.est ? '・推定値' : ''}）` }) : null,
    el('div', { text: skills || '―' }),
    el('ul', {}, ...b.pieces.map(p => el('li', { text: `${PART_JP[p.part]} ${p.name}${p.rarity > p.baseRarity ? `（レア${p.rarity}）` : ''}` })))));
}

document.addEventListener('DOMContentLoaded', init);
