#!/usr/bin/env python3
"""アウかる（mhnowcalc.com）の装備一覧ページに埋め込まれた武器データから、data/weapons.json に足す・直す行を書き出す。

使い方:
  curl -sL -o /tmp/equip.html "https://mhnowcalc.com/mhocalc/equipment-collected.php?lang=ja"
  python3 tools/import_aukaru_weapons.py /tmp/equip.html tools/observed/weapons_YYYYMMDD_aukaru.json YYYY-MM-DD

- アウかるはレアごとに武器名を持っている（例: フラムエルヘレヴⅡ → フラムエルヘレヴ改Ⅲ）。こちらの武器名と同じ名前のレアだけを使う
- 攻撃力は AttackWeaponBasis、属性値は 火/水/氷/雷/龍 の Damage、会心率は AffinityRate/100
- 状態異常（麻痺・毒など）の武器は、こちらの「属性値」とアウかるの蓄積値の単位が同じか確かめていないので対象外
- こちらと数値が同じレアは書き出さない（足すレアと、数値が違うレアだけ）
ページそのもの（HTML）はリポジトリに入れない。
"""
import sys, json, re, unicodedata, collections, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
norm = lambda s: unicodedata.normalize('NFKC', s)
ELEM = {'FireDamage': '火', 'WaterDamage': '水', 'IceDamage': '氷', 'ThunderDamage': '雷', 'DragonDamage': '龍'}
ROMAN = r'(?:I|II|III|IV|V|VI|VII|VIII|IX|X)$'


def key(n):
    n = norm(n)
    n = re.sub(ROMAN, '', n).strip()
    m = re.match(r'^(.*)[（(](火|水|氷|雷|龍)[）)]$', n)
    return f'{m.group(1)}・{m.group(2)}' if m else n


def weapons_in(html):
    out = []
    for m in re.finditer(r'\{"id":"\d+","kind":"weapon"', html):
        st = m.start(); depth = 0; j = st
        while True:
            ch = html[j]
            if ch == '{': depth += 1
            elif ch == '}':
                depth -= 1
                if depth == 0: break
            j += 1
        out.append(json.loads(html[st:j + 1].replace('\\/', '/')))
    return out


def main(html_path, out_path, date):
    html = open(html_path, encoding='utf-8', errors='replace').read()
    theirs = weapons_in(html)
    ours = json.loads((ROOT / 'data' / 'weapons.json').read_text(encoding='utf-8'))['weapons']
    rows = collections.defaultdict(list)  # こちらの名前のキー → (アウかるの武器, レアの行)
    for w in theirs:
        names = w.get('rank_names') or {}
        for r in w.get('ranks') or []:
            rows[key(names.get(str(r['rank'])) or w['name'])].append((w, r))
    out, added, fixed, same, skipped = {}, 0, 0, 0, collections.Counter()
    for o in ours:
        cand = rows.get(key(o['name']))
        if not cand:
            skipped['アウかるに同じ名前が無い'] += 1; continue
        if o['element'] not in ELEM.values() and o['element'] != '無':
            skipped['状態異常の武器'] += 1; continue
        add = {}
        for w, r in cand:
            if w.get('type_name') and o.get('type') and w['type_name'] != o['type']:
                continue
            v = r.get('values') or {}
            els = {ELEM[k]: x for k, x in v.items() if k in ELEM and x}
            if o['element'] == '無':
                if els: continue
                el = 0
            else:
                if o['element'] not in els: continue  # 属性が違う行（別の武器）は使わない
                el = els[o['element']]
            st = {'attack': v.get('AttackWeaponBasis'), 'element': el, 'affinity': round((v.get('AffinityRate') or 0) / 100, 2)}
            if st['attack'] is None: continue
            rr = str(r['rank'])
            mine = o['stats'].get(rr)
            if mine and mine.get('attack') == st['attack'] and (mine.get('element') or 0) == st['element'] \
                    and abs((mine.get('affinity') or 0) - st['affinity']) < 0.01 and not mine.get('est'):
                same += 1; continue
            if mine: fixed += 1
            else: added += 1
            add[rr] = st
        if add:
            mx = max([int(r) for r in add] + [o.get('maxRarity') or 0])
            out[o['name']] = {'maxRarity': mx, 'stats': dict(sorted(add.items(), key=lambda x: int(x[0])))}
    doc = {
        'observedAt': date,
        'label': f'アウかる（mhnowcalc.com）の装備一覧の武器データ（{date}に取得）',
        'how': 'アウかるの装備一覧ページに埋め込まれた武器データ（レアごとの名前・攻撃力・属性値・会心率）から、こちらの武器名と同じ名前のレアだけを抜き出した（tools/import_aukaru_weapons.py）。こちらに無いレアを足し、数値が違うレアを置き換える。アウかる側の注記は「ゲーム内で確かめた値ではない候補」。状態異常の武器は対象外',
        'weaponStats': out,
    }
    pathlib.Path(out_path).write_text(json.dumps(doc, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    print(f'アウかるの武器 {len(theirs)} / 書き出した武器 {len(out)} / 足したレア {added} / 置き換えたレア {fixed} / 同じだったレア {same} / 対象外 {dict(skipped)}')
    print('書き出した武器の最大レア:', dict(sorted(collections.Counter(v["maxRarity"] for v in out.values()).items())))


if __name__ == '__main__':
    main(*sys.argv[1:4])
