#!/usr/bin/env python3
"""武器データ（GameWith から収集した weapons.json）をアプリ用 data/weapons.json に変換する。

- 生産レア〜最大レアの全レアについて攻撃力・属性値を持たせる
- レア8〜12 は gamewith.ai の武器ごとのレア別表（rarity_rules.json の weaponHighRarity）で埋める
- それでも無いレア（冒険団武器などのレア13）は、前後の既知の値から等比補間して est:true を付ける
"""
import json, sys, pathlib, datetime

RAW = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else pathlib.Path('/tmp/claude-0/-home-claude/094b7c7b-727a-5a9e-9d7d-7a958be863c9/scratchpad/data/weapons.json')
OUT = pathlib.Path(__file__).resolve().parent.parent / 'data' / 'weapons.json'


def interp(known, r, key):
    lo = max((k for k in known if k < r and known[k].get(key)), default=None)
    hi = min((k for k in known if k > r and known[k].get(key)), default=None)
    if lo is None or hi is None:
        return None
    a, b = known[lo][key], known[hi][key]
    return round(a * (b / a) ** ((r - lo) / (hi - lo)))


def pct(v):
    try:
        return float(str(v).rstrip('%')) if v not in (None, '-', '') else None
    except ValueError:
        return None


def main():
    d = json.loads(RAW.read_text(encoding='utf-8'))
    rules = RAW.parent / 'rarity_rules.json'
    high = {x['name']: x for x in json.loads(rules.read_text(encoding='utf-8')).get('weaponHighRarity', [])} if rules.exists() else {}
    out = []
    for w in d['weapons']:
        known = {int(r): st for r, st in (w.get('stats') or {}).items() if st.get('attack')}
        for r, st in ((high.get(w['name']) or {}).get('stats') or {}).items():
            r = int(r)
            if r in known or not st.get('attack'):
                continue
            aff = pct(st.get('crit'))
            known[r] = {'attack': st['attack'], 'element': st.get('element'), 'affinity': aff if aff is not None else (w.get('affinity') or 0), 'src': 'gamewith.ai'}
        # gamewith.ai（英語版）の最大レア値も補間の手がかりに使う（冒険団などはレア12の値がある）
        for g in w.get('gamewithAi') or []:
            r = g.get('rarity')
            if r and g.get('attack') and r not in known:
                known[r] = {'attack': g['attack'], 'element': g.get('element'), 'affinity': g.get('affinity') or 0, 'fromList': True}
        if not known:
            continue
        base = w.get('baseRarity') or min(known)
        mx = max(w.get('maxRarity') or 0, max(known))
        stats = {}
        for r in range(base, mx + 1):
            if r in known:
                st = known[r]
                stats[r] = {'attack': st['attack'], 'element': st.get('element'), 'affinity': st.get('affinity', w.get('affinity') or 0)}
                if st.get('fromList'):
                    stats[r]['src'] = 'list'
                elif st.get('src'):
                    stats[r]['src'] = st['src']
            else:
                atk = interp(known, r, 'attack')
                if atk is None:
                    continue
                el = interp(known, r, 'element')
                stats[r] = {'attack': atk, 'element': el, 'affinity': w.get('affinity') or 0, 'est': True}
        out.append({
            'name': w['name'], 'type': w['type'], 'element': w.get('element') or '無',
            'baseRarity': base, 'maxRarity': mx, 'stats': stats,
            'affinity': w.get('affinity') or 0,
            'monsters': w.get('monsters') or [],
            'guild': '冒険団' in w['name'],
            'yuko': bool(w.get('yuko')),
            'derived': w.get('obtainedBy') == '強化のみ(派生)',
            'sourceUrl': w.get('sourceUrl'),
        })
    OUT.write_text(json.dumps({'updated': datetime.date.today().isoformat(), 'weapons': out}, ensure_ascii=False, indent=1), encoding='utf-8')
    print('weapons', len(out), 'estimated rarities', sum(1 for w in out for s in w['stats'].values() if s.get('est')))


if __name__ == '__main__':
    main()
