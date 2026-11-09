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


def from_full(full):
    """weapons_full.json（gamewith.ai・GameWith・game8.co を突き合わせたレア別表）から作る。補間はレアの抜けの間だけ"""
    out = []
    for w in full['weapons']:
        known = {}
        for r, st in (w.get('stats') or {}).items():
            if st.get('attack'):
                known[int(r)] = {'attack': st['attack'], 'element': st.get('element') or 0, 'affinity': st.get('affinity') or 0,
                                 'src': '・'.join(st.get('sources') or [])}
        if not known:
            continue
        base = min(known)
        mx = max(known)
        stats = {}
        for r in range(base, mx + 1):
            if r in known:
                stats[r] = known[r]
            else:
                atk = interp(known, r, 'attack')
                if atk is None:
                    continue
                stats[r] = {'attack': atk, 'element': interp(known, r, 'element') or 0, 'affinity': known[max(k for k in known if k < r)]['affinity'], 'est': True}
        urls = w.get('sourceUrls') or []
        gw = next((u for u in urls if 'gamewith.jp' in u), None)
        out.append({
            'name': w['name'], 'type': w['type'], 'element': w.get('element') or '無',
            'baseRarity': base, 'maxRarity': mx, 'stats': stats,
            'affinity': known[mx]['affinity'],
            'monsters': w.get('monsters') or [],
            'guild': '冒険団' in w['name'],
            'yuko': w['name'].startswith('融光種') or any(str(m).startswith('融光種') for m in w.get('monsters') or []),
            'derived': w.get('craftable') is False,
            'derivesFrom': w.get('derivesFrom') or w.get('treeInferred'),
            'sourceUrl': gw or (urls[0] if urls else None),
        })
    return out


def extend_to_10(out):
    """攻略サイトの数値がレア9で止まっている武器を、レア10まで伸ばす（推定値）。
    ペペの融光種ウォーターキャノンがゲーム内でレア10まで強化できることを確認（2026-11-09、ランク49）。
    サイトの数値がレア9までなのは、レア10の解放（ランク45）まで届いた人がまだ少なかったためとみて、
    レア9止まりの武器はどれもレア10まで上がる扱いにする。レア10の数値は、レア12まであるサイトの67本が
    どれもレア9→10で攻撃×1.214・属性×1.217 なので、その比で出す"""
    ra, re_ = [], []
    for w in out:
        s9, s10 = w['stats'].get(9), w['stats'].get(10)
        if s9 and s10 and not s9.get('est') and not s10.get('est'):
            ra.append(s10['attack'] / s9['attack'])
            if s9.get('element'):
                re_.append(s10['element'] / s9['element'])
    if not ra:
        return 0
    ka, ke = sorted(ra)[len(ra) // 2], (sorted(re_)[len(re_) // 2] if re_ else sorted(ra)[len(ra) // 2])
    n = 0
    for w in out:
        if w['maxRarity'] == 9 and 9 in w['stats']:
            s9 = w['stats'][9]
            w['stats'][10] = {'attack': round(s9['attack'] * ka), 'element': round((s9.get('element') or 0) * ke), 'affinity': s9.get('affinity') or 0,
                              'est': True, 'src': f'推定（レア9×{ka:.3f}）。レア10まで強化できるのはゲーム内で確認'}
            w['maxRarity'] = 10
            n += 1
    return n


def main():
    full_p = RAW.parent / 'weapons_full.json'
    if full_p.exists():
        out = from_full(json.loads(full_p.read_text(encoding='utf-8')))
        print('レア9止まり → レア10まで伸ばした武器', extend_to_10(out))
        OUT.write_text(json.dumps({'updated': datetime.date.today().isoformat(), 'source': 'weapons_full.json（gamewith.ai・GameWith・game8.co）', 'weapons': out}, ensure_ascii=False, indent=1), encoding='utf-8')
        print('weapons', len(out), 'estimated rarities', sum(1 for w in out for s in w['stats'].values() if s.get('est')),
              'max rarity', dict(sorted(__import__('collections').Counter(w['maxRarity'] for w in out).items())))
        return
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
