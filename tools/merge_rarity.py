"""防具のレア別スキル解放を複数サイトから突き合わせる。

入力（scratchpad/data、あるものだけ使う）:
  armor_gamerch.json   Gamerch   {pieces:[{name, part, baseRarity, maxRarity, unlocks:[{rarity, skill, lv}]}]}
  armor_game8.json     Game8     同上
  rarity_rules.json    gamewith.ai ほか  {armorHighRarity:[同上], armorMaxRarity:{rule, perSeries}}
既存の GameWith データ（build_data の piece['skills'] = [{name, lv, rarity}]）と合わせて、
レアごとの「スキル → 合計Lv」を多数決で決める。同数で割れたら PRIORITY の順で採用し、食い違いとして記録する。
"""
import json, re, pathlib, collections

PRIORITY = ['game8', 'gamerch', 'gamewith', 'gamewith.ai']
LABEL = {'game8': 'Game8', 'gamerch': 'Gamerch', 'gamewith': 'GameWith', 'gamewith.ai': 'gamewith.ai'}
TIER = re.compile(r'\s*(?:[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]+|I{1,3}|IV|V|VI{0,3}|IX|X)$')

def key(name):
    if not name: return None
    n = name.replace('ＵＰ', 'UP').replace('　', '').replace(' ', '').strip()
    return TIER.sub('', n)

def norm_skill(s):
    return (s or '').replace('ＵＰ', 'UP').replace('Ｌｖ', 'Lv').strip()

def _load(raw, name):
    p = pathlib.Path(raw) / name
    if not p.exists(): return None
    try:
        return json.loads(p.read_text(encoding='utf-8'))
    except json.JSONDecodeError as e:
        print(f'  !! {name} が壊れている: {e}')
        return None

def load_sources(raw):
    """{source: {piece_key: {'max': int|None, 'base': int|None, 'unlocks': [(rarity, skill, lv)], 'url': str}}}"""
    out = {}
    for src, fname, field in [('gamerch', 'armor_gamerch.json', 'pieces'), ('game8', 'armor_game8.json', 'pieces'),
                              ('gamewith.ai', 'rarity_rules.json', 'armorHighRarity')]:
        d = _load(raw, fname)
        if not d: continue
        table = {}
        for p in d.get(field) or []:
            k = key(p.get('name'))
            if not k: continue
            ul = [(u.get('rarity'), norm_skill(u.get('skill')), u.get('lv')) for u in p.get('unlocks') or [] if u.get('skill')]
            table[k] = {'max': p.get('maxRarity'), 'base': p.get('baseRarity'), 'unlocks': ul,
                        'url': p.get('sourceUrl') or p.get('source'), 'part': p.get('part')}
        out[src] = table
        print(f'  {LABEL[src]}: {len(table)} 部位')
    return out

def levels_at(unlocks, r):
    """unlocks [(rarity, skill, lv)] から、レア r 時点の {skill: lv}"""
    best = {}
    for rr, sk, lv in unlocks:
        if rr is None or lv is None or rr > r: continue
        cur = best.get(sk)
        if cur is None or rr > cur[0] or (rr == cur[0] and lv > cur[1]):
            best[sk] = (rr, lv)
    return {sk: v[1] for sk, v in best.items() if v[1] > 0}

def merge_piece(piece, sources):
    """piece: build_data の部位 dict（skills, baseRarity, docMax）。書き換えて返す"""
    k = key(piece['name'])
    per = {}  # src -> (unlocks, documentedMax)
    gw = [(s['rarity'], s['name'], s['lv']) for s in piece['skills']]
    per['gamewith'] = (gw, piece.get('docMax') or piece['baseRarity'])
    for src, table in sources.items():
        e = table.get(k)
        if not e or not e['unlocks']: continue
        known = [u for u in e['unlocks'] if u[0] is not None]
        if not known: continue
        top = max([u[0] for u in known] + [e['max'] or 0])
        per[src] = (known, top)
    base = piece['baseRarity']
    for src, (ul, _) in per.items():
        if src == 'gamewith': continue
        b = sources[src][k].get('base')
        if b and b != base:
            piece.setdefault('conflicts', []).append({'type': 'baseRarity', 'values': {LABEL[src]: b, 'GameWith': base}})
    top = max(m for _, m in per.values())
    merged, conflicts = [], []
    prev = {}
    for r in range(base, top + 1):
        votes = collections.defaultdict(dict)  # skill -> {src: lv}
        covering = [src for src, (_, m) in per.items() if r <= m]
        for src in covering:
            lv = levels_at(per[src][0], r)
            for sk, v in lv.items(): votes[sk][src] = v
        skills_here = set(votes)
        for sk in skills_here:
            for src in covering:
                votes[sk].setdefault(src, 0)
        cur = {}
        for sk, vs in votes.items():
            tally = collections.Counter(vs.values())
            best_n = max(tally.values())
            cands = [lv for lv, n in tally.items() if n == best_n]
            if len(cands) == 1:
                lv = cands[0]
            else:
                lv = next(vs[s] for s in PRIORITY if s in vs and vs[s] in cands)
            if len(tally) > 1:
                conflicts.append({'rarity': r, 'skill': sk, 'chosen': lv, 'values': {LABEL[s]: v for s, v in vs.items()}})
            if lv > 0: cur[sk] = lv
        for sk, lv in cur.items():
            if prev.get(sk) != lv:
                merged.append({'name': sk, 'lv': lv, 'rarity': r})
        for sk in prev:
            if sk not in cur:  # 上のレアで消えるのは集計ミスなので、直前の値を持ち越す
                cur[sk] = prev[sk]
        prev = cur
    piece['skills'] = merged
    piece['docMax'] = top
    piece['sources'] = sorted(LABEL[s] for s in per)
    if conflicts:
        piece.setdefault('conflicts', []).extend(conflicts)
    return piece

def series_max(raw):
    d = _load(raw, 'rarity_rules.json') or {}
    return ((d.get('armorMaxRarity') or {}).get('perSeries')) or {}
