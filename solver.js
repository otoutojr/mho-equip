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
    self.postMessage({ type: 'result', ...res });
    if (msg.next && msg.next.length && res.best) {
      const t1 = Date.now();
      const next = solveNext(msg, res.best.score);
      self.postMessage({ type: 'next', reqId: msg.reqId, next, ms: Date.now() - t1 });
    }
  }
};

function buildDb(armor, skills) {
  const skillIndex = new Map();
  const skillMax = [];
  const skillNames = [];
  const idx = (name) => {
    if (!skillIndex.has(name)) { skillIndex.set(name, skillNames.length); skillNames.push(name); skillMax.push(7); }
    return skillIndex.get(name);
  };
  for (const s of skills.skills) { const i = idx(s.name); skillMax[i] = s.maxLv || 7; }
  const seriesIndex = new Map();
  const series = [];
  const pieces = [];
  armor.series.forEach((s) => {
    const si = series.length;
    seriesIndex.set(s.name, si);
    const bonuses = (s.setSkill && s.setSkill.bonuses || []).filter(b => b.skill).map(b => ({ pieces: b.pieces, skill: idx(b.skill), lv: b.lv || 1, name: b.skill }));
    series.push({ name: s.name, setName: s.setSkill && s.setSkill.name || null, bonuses });
    for (const p of s.pieces) {
      pieces.push({
        id: p.id, name: p.name, part: p.part, series: s.name, si,
        baseRarity: p.baseRarity || 1, maxRarity: p.maxRarity || 9,
        skills: p.skills.map(k => ({ s: idx(k.name), name: k.name, lv: k.lv, rarity: k.rarity == null ? (p.baseRarity || 1) : k.rarity })),
      });
    }
  });
  return { pieces, skillIndex, skillMax, skillNames, series, seriesIndex };
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

function preparePieces(W, availableSeries, rarityCap, ownedMap) {
  const out = [];
  for (const p of DB.pieces) {
    if (!availableSeries.has(p.series)) continue;
    const cap = Math.min(p.maxRarity, rarityCap);
    const lo = p.baseRarity;
    if (cap < lo) continue;
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
  // セットスキルで価値のあるシリーズは少し優遇して残す
  const setWorth = new Set();
  for (const s of DB.series) for (const b of s.bonuses) if (wval(W, b.skill, b.lv) > 0) setWorth.add(s.name);
  for (const part of PARTS) {
    const list = byPart[part];
    list.sort((a, b) => b.value - a.value || a.cost - b.cost || b.ref.baseRarity - a.ref.baseRarity);
    const keep = list.slice(0, K);
    for (const c of list.slice(K)) {
      if (setWorth.has(c.ref.series) && keep.length < K + 6) keep.push(c);
    }
    byPart[part] = keep.length ? keep : list.slice(0, 1);
  }
  return byPart;
}

function evaluate(combo, W, acc, seriesCount, touched) {
  // combo: 5 candidates. acc: Int32Array(skills) scratch. seriesCount: Int32Array(series) scratch. touched: scratch array
  let nt = 0, ns = 0;
  for (let i = 0; i < 5; i++) {
    const c = combo[i]; if (!c) continue;
    for (const k of c.sk) { if (!acc[k.s]) touched[nt++] = k.s; acc[k.s] += k.lv; }
    const si = c.ref.si;
    if (!seriesCount[si]) touched[200 + ns++] = si;
    seriesCount[si]++;
  }
  let setHits = null;
  for (let j = 0; j < ns; j++) {
    const si = touched[200 + j]; const n = seriesCount[si]; const ser = DB.series[si];
    for (const b of ser.bonuses) if (n >= b.pieces) {
      if (!acc[b.skill]) touched[nt++] = b.skill;
      acc[b.skill] += b.lv;
      (setHits || (setHits = [])).push({ series: ser.name, set: ser.setName, pieces: b.pieces, skill: b.name, lv: b.lv });
    }
    seriesCount[si] = 0;
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
  const sc = new Int32Array(DB.series.length);
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
      baseRarity: c.ref.baseRarity, maxRarity: c.ref.maxRarity, rarity: c.rarity,
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
  const prepared = preparePieces(W, avail, msg.rarityCap, msg.owned);
  const byPart = pickCandidates(prepared, W, K);
  const top = search(byPart, W, msg.topN || 6);
  return { best: top.length ? describe(top[0], W) : null, alts: top.slice(1).map(t => describe(t, W)), counts: PARTS.map(p => byPart[p].length) };
}

function solveNext(msg, base) {
  const W = makeWeightTable(msg.weights);
  const K = Math.max(8, (msg.K || 12) - 2);
  const avail = new Set(msg.availableSeries);
  const next = [];
  for (const n of msg.next) {
    const avail2 = new Set([...avail, ...n.series]);
    const prep2 = preparePieces(W, avail2, msg.rarityCap, msg.owned);
    const by2 = pickCandidates(prep2, W, K);
    const top2 = search(by2, W, 1);
    if (!top2.length) continue;
    const d = describe(top2[0], W);
    const changed = d.pieces.filter(p => n.series.includes(p.series)).map(p => p.name);
    next.push({ monster: n.monster, delta: top2[0].score - base, score: top2[0].score, changed });
  }
  next.sort((a, b) => b.delta - a.delta);
  return next;
}
