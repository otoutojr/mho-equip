/* 装備おすすめ solver (Web Worker)
 * 入力: 防具データ・キャラの重み・作れるシリーズ・強化上限レア
 * 出力: 最高スコアの5部位セットと候補、未討伐モンスター別の伸びしろ
 */
'use strict';

let DB = null; // {pieces, skillIndex, skillMax, seriesIndex, setBonuses}
const PARTS = ['head', 'body', 'arm', 'waist', 'leg'];

self.onmessage = (e) => {
  const msg = e.data;
  if (msg.type === 'init') { DB = buildDb(msg.armor, msg.skills); self.postMessage({ type: 'ready' }); return; }
  if (msg.type === 'solve') {
    const t0 = Date.now();
    const res = solve(msg);
    res.ms = Date.now() - t0;
    res.reqId = msg.reqId;
    res.goal = !!msg.goal;
    res.elem = msg.elem || null;
    self.postMessage({ type: 'result', ...res });
    if (res.best && !msg.goal && !msg.elem) {
      if (msg.axes && msg.axes.length) self.postMessage({ type: 'compare', reqId: msg.reqId, rows: solveCompare(msg, res.best) });
      const t1 = Date.now();
      const next = solveNext(msg, res.best.score, new Set(res.best.pieces.map(p => p.id)));
      self.postMessage({ type: 'next', reqId: msg.reqId, next, ms: Date.now() - t1 });
    }
  }
};

// 「〇〇軸」で組んだ場合の火力比較：その軸スキルを最優先で積んだセットを探し、本来の火力で採点し直す
function solveCompare(msg, best) {
  const W = makeWeightTable(msg.weights);
  const avail = new Set(msg.availableSeries);
  const acc = new Int32Array(DB.skillNames.length), sc = new Int32Array(DB.sets.length + 1), touched = new Int32Array(260);
  const rows = [];
  for (const ax of msg.axes) {
    const si = DB.skillIndex.get(ax.skill);
    if (si == null || !W[si]) continue;
    const Wb = W.slice();
    Wb[si] = W[si].map(v => v * 4 + 2);
    const prep = preparePieces(Wb, avail, msg.rarityCap, msg.owned, msg.orbTier);
    const top = search(pickCandidates(prep, Wb, msg.K || 12), Wb, 1);
    if (!top.length) continue;
    // 本来の重みで再評価（強化レアは軸スキル優先のまま）
    const r = evaluate(top[0].combo, W, acc, sc, touched);
    const d = describe({ score: r.score, combo: top[0].combo, setHits: r.setHits }, W);
    const lv = (d.totals.find(t => t.skill === ax.skill) || { lv: 0 }).lv;
    if (!lv) continue;
    rows.push({ label: ax.label, skill: ax.skill, lv, score: r.score, delta: r.score - best.score, set: d });
  }
  rows.sort((a, b) => b.score - a.score);
  return rows;
}

function buildDb(armor, skills) {
  const skillIndex = new Map();
  const skillMax = [];
  const skillNames = [];
  const idx = (name) => {
    if (!skillIndex.has(name)) { skillIndex.set(name, skillNames.length); skillNames.push(name); skillMax.push(7); }
    return skillIndex.get(name);
  };
  for (const s of skills.skills) { const i = idx(s.name); skillMax[i] = s.maxLv || 7; }
  // セットスキル（部位ごとに所属セットが違う防具があるので、シリーズではなくセット名で数える）
  const setIndex = new Map();
  const sets = [];
  for (const st of (armor.sets || [])) {
    setIndex.set(st.name, sets.length);
    sets.push({ name: st.name, bonuses: (st.bonuses || []).filter(b => b.skill).map(b => ({ pieces: b.pieces || 2, skill: idx(b.skill), lv: b.lv || 1, name: b.skill })) });
  }
  const pieces = [];
  armor.series.forEach((s) => {
    for (const p of s.pieces) {
      const setName = p.set || s.set || null;
      if (setName && !setIndex.has(setName)) { setIndex.set(setName, sets.length); sets.push({ name: setName, bonuses: [] }); }
      pieces.push({
        id: p.id, name: p.name, part: p.part, series: s.name, seti: setName ? setIndex.get(setName) : -1,
        baseRarity: p.baseRarity || 1, maxRarity: p.maxRarity || 9, docMax: p.docMax || p.maxRarity || 9, orbTier: p.orbTier || null,
        skills: p.skills.map(k => ({ s: idx(k.name), name: k.name, lv: k.lv, rarity: k.rarity == null ? (p.baseRarity || 1) : k.rarity })),
      });
    }
  });
  return { pieces, skillIndex, skillMax, skillNames, sets, setIndex };
}

// スキルは「レアrでLv総量」なので、r以下で最大のレアのエントリを採用
function skillsAtRarity(piece, r) {
  const best = new Map();
  for (const k of piece.skills) {
    if (k.rarity > r) continue;
    const cur = best.get(k.s);
    if (!cur || k.rarity > cur.rarity || (k.rarity === cur.rarity && k.lv > cur.lv)) best.set(k.s, k);
  }
  return [...best.values()].map(k => ({ s: k.s, name: k.name, lv: k.lv }));
}

function makeWeightTable(weights) {
  // weights: {skillName: [v1, v2, ...]} → Float64Array per skill index
  const W = new Array(DB.skillNames.length).fill(null);
  for (const [name, arr] of Object.entries(weights)) {
    const i = DB.skillIndex.get(name);
    if (i == null) continue;
    W[i] = arr;
  }
  return W;
}
const wval = (W, s, lv) => { const a = W[s]; if (!a || lv <= 0) return 0; return a[Math.min(lv, a.length) - 1] || 0; };

function preparePieces(W, availableSeries, rarityCap, ownedMap, orbTier) {
  const out = [];
  for (const p of DB.pieces) {
    if (!availableSeries.has(p.series)) continue;
    if (p.orbTier && orbTier && p.orbTier > orbTier) continue; // 生産に要る狩魂玉のランクが足りない
    const lo = p.baseRarity;
    // 強化上限は「生産後にどこまで上げられるか」。生産レアが上限より高い防具はそのまま生産できる扱い
    const cap = Math.max(lo, Math.min(p.maxRarity, rarityCap));
    let bestVal = -1, bestR = lo, bestSk = null;
    for (let r = lo; r <= cap; r++) {
      const sk = skillsAtRarity(p, r);
      let v = 0;
      for (const k of sk) v += wval(W, k.s, Math.min(k.lv, DB.skillMax[k.s]));
      if (v > bestVal + 1e-9) { bestVal = v; bestR = r; bestSk = sk; }
    }
    out.push({ ref: p, value: bestVal, rarity: bestR, sk: bestSk, cost: bestR - lo, owned: ownedMap ? ownedMap[p.id] : null });
  }
  return out;
}

function pickCandidates(prepared, W, K) {
  const byPart = {};
  for (const part of PARTS) byPart[part] = [];
  for (const c of prepared) byPart[c.ref.part].push(c);
  // セットスキルで価値のあるセットの防具は少し優遇して残す
  const setWorth = new Set();
  DB.sets.forEach((st, i) => { for (const b of st.bonuses) if (wval(W, b.skill, b.lv) > 0) setWorth.add(i); });
  for (const part of PARTS) {
    const list = byPart[part];
    list.sort((a, b) => b.value - a.value || a.cost - b.cost || b.ref.baseRarity - a.ref.baseRarity);
    const keep = list.slice(0, K);
    for (const c of list.slice(K)) {
      if (setWorth.has(c.ref.seti) && keep.length < K + 6) keep.push(c);
    }
    byPart[part] = keep.length ? keep : list.slice(0, 1);
  }
  return byPart;
}

function evaluate(combo, W, acc, setCount, touched) {
  // combo: 5 candidates. acc: Int32Array(skills) scratch. setCount: Int32Array(sets) scratch. touched: scratch array
  let nt = 0, ns = 0;
  for (let i = 0; i < 5; i++) {
    const c = combo[i]; if (!c) continue;
    for (const k of c.sk) { if (!acc[k.s]) touched[nt++] = k.s; acc[k.s] += k.lv; }
    const si = c.ref.seti;
    if (si < 0) continue;
    if (!setCount[si]) touched[200 + ns++] = si;
    setCount[si]++;
  }
  let setHits = null;
  for (let j = 0; j < ns; j++) {
    const si = touched[200 + j]; const n = setCount[si]; const st = DB.sets[si];
    for (const b of st.bonuses) if (n >= b.pieces) {
      if (!acc[b.skill]) touched[nt++] = b.skill;
      acc[b.skill] += b.lv;
      (setHits || (setHits = [])).push({ set: st.name, pieces: b.pieces, skill: b.name, lv: b.lv });
    }
    setCount[si] = 0;
  }
  let score = 0;
  for (let j = 0; j < nt; j++) {
    const s = touched[j]; const lv = acc[s];
    if (lv) { score += wval(W, s, lv < DB.skillMax[s] ? lv : DB.skillMax[s]); acc[s] = 0; }
  }
  return { score, setHits: setHits || [] };
}

function search(byPart, W, topN) {
  const acc = new Int32Array(DB.skillNames.length);
  const sc = new Int32Array(DB.sets.length + 1);
  const touched = new Int32Array(260);
  const [H, B, A, Wt, L] = PARTS.map(p => byPart[p]);
  const top = []; // sorted desc by score
  const combo = new Array(5);
  for (const h of H) { combo[0] = h;
    for (const b of B) { combo[1] = b;
      for (const a of A) { combo[2] = a;
        for (const w of Wt) { combo[3] = w;
          for (const l of L) { combo[4] = l;
            const r = evaluate(combo, W, acc, sc, touched);
            const cost = h.cost + b.cost + a.cost + w.cost + l.cost; // 強化段数の合計（同点なら少ない方）
            const last = top[top.length - 1];
            if (top.length < topN || r.score > last.score + 1e-9 || (Math.abs(r.score - last.score) <= 1e-9 && cost < last.cost)) {
              const entry = { score: r.score, cost, combo: combo.slice(), setHits: r.setHits };
              let i = top.length;
              while (i > 0 && (top[i - 1].score < entry.score - 1e-9 || (Math.abs(top[i - 1].score - entry.score) <= 1e-9 && top[i - 1].cost > entry.cost))) i--;
              top.splice(i, 0, entry); if (top.length > topN) top.pop();
            }
          }
        }
      }
    }
  }
  return top;
}

function describe(entry, W) {
  const acc = new Map();
  for (const c of entry.combo) for (const k of c.sk) acc.set(k.s, (acc.get(k.s) || 0) + k.lv);
  for (const h of entry.setHits) { const s = DB.skillIndex.get(h.skill); acc.set(s, (acc.get(s) || 0) + h.lv); }
  const totals = [...acc.entries()].map(([s, lv]) => ({ skill: DB.skillNames[s], lv: Math.min(lv, DB.skillMax[s]), raw: lv, max: DB.skillMax[s], value: wval(W, s, Math.min(lv, DB.skillMax[s])), fromSet: entry.setHits.filter(h => h.skill === DB.skillNames[s]).reduce((a, h) => a + h.lv, 0) }))
    .sort((a, b) => b.value - a.value || b.lv - a.lv);
  return {
    score: entry.score,
    pieces: entry.combo.map(c => ({
      id: c.ref.id, name: c.ref.name, part: c.ref.part, series: c.ref.series,
      baseRarity: c.ref.baseRarity, maxRarity: c.ref.maxRarity, docMax: c.ref.docMax, rarity: c.rarity, orbTier: c.ref.orbTier,
      skills: c.sk.map(k => ({ name: k.name, lv: k.lv, value: wval(W, k.s, k.lv) })),
      value: c.value,
    })),
    setHits: entry.setHits,
    totals,
  };
}

function solve(msg) {
  const W = makeWeightTable(msg.weights);
  const K = msg.K || 12;
  const avail = new Set(msg.availableSeries);
  const prepared = preparePieces(W, avail, msg.rarityCap, msg.owned, msg.orbTier);
  const byPart = pickCandidates(prepared, W, K);
  const top = search(byPart, W, msg.topN || 6);
  return { best: top.length ? describe(top[0], W) : null, alts: top.slice(1).map(t => describe(t, W)), counts: PARTS.map(p => byPart[p].length) };
}

function solveNext(msg, base, baseIds) {
  const W = makeWeightTable(msg.weights);
  const K = Math.max(8, (msg.K || 12) - 2);
  const out = [];
  for (const m of (msg.milestones || [])) {
    const prep = preparePieces(W, new Set(m.series), m.rarityCap, msg.owned, m.orbTier);
    const top = search(pickCandidates(prep, W, K), W, 1);
    if (!top.length) continue;
    const d = describe(top[0], W);
    out.push({ rank: m.rank, label: m.label, why: m.why, delta: top[0].score - base, score: top[0].score,
      changed: d.pieces.filter(p => !baseIds.has(p.id)).map(p => p.name), skills: d.totals.filter(t => t.value > 0.3).map(t => `${t.skill}${t.lv}`).join('・') });
  }
  return { milestones: out };
}
