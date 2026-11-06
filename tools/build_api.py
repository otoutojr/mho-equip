#!/usr/bin/env python3
"""Claude Desktop など外部の AI から読みやすい、キャラごとの小さな JSON（api/）を作る。

  api/index.json            キャラ一覧・強化上限表・ファイルの場所・データの読み方
  api/builds/<charId>.json  そのキャラの攻略サイト構成（防具のレア別スキル・作れるランク・武器のレア別数値を同梱）

data/builds.json は全キャラ分で 700KB 以上あり、Web 取得ツールでは途中で切れるため、キャラごとに分ける。
"""
import json, pathlib, datetime, collections

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / 'data'
OUT = ROOT / 'api'
BASE_URL = 'https://otoutojr.github.io/mho-equip/'
PARTS = ['head', 'body', 'arm', 'waist', 'leg']
PART_JP = {'head': '頭', 'body': '胴', 'arm': '腕', 'waist': '腰', 'leg': '脚'}


def load(name):
    return json.loads((DATA / name).read_text(encoding='utf-8'))


def main():
    armor, weapons, builds, monsters, chars = load('armor.json'), load('weapons.json')['weapons'], load('builds.json'), load('monsters.json'), load('characters.json')['characters']
    rank_cap = monsters['rankCap']
    cap_at = lambda rank: max([c for r, c in rank_cap if rank >= r] + [2])
    mon_rank = {m['name']: m.get('unlockRank') or 1 for m in monsters['monsters']}
    map_rank = {m['name']: m.get('unlockRank') or 1 for m in monsters['maps']}
    sets = {s['name']: s for s in armor['sets']}

    def series_rank(s):
        g = s.get('gate') or {'type': 'basic'}
        if g['type'] == 'monster':
            return min(mon_rank.get(m, 1) for m in g.get('monsters') or [g.get('monster')])
        if g['type'] == 'map':
            return map_rank.get(g['map'], 1)
        return 1

    piece = {}
    for s in armor['series']:
        r0 = series_rank(s)
        for p in s['pieces']:
            # レアごとの合計スキル（そのレアで変わるところだけ）
            by_r = collections.OrderedDict()
            cur = {}
            for r in range(p['baseRarity'], (p.get('docMax') or p['baseRarity']) + 1):
                for k in p['skills']:
                    if k['rarity'] == r:
                        cur[k['name']] = k['lv']
                if r == p['baseRarity'] or any(k['rarity'] == r for k in p['skills']):
                    by_r[str(r)] = '・'.join(f'{n}{lv}' for n, lv in cur.items())
            piece[p['id']] = {'name': p['name'], 'part': PART_JP[p['part']], 'series': s['name'], 'craftRank': r0,
                              'baseRarity': p['baseRarity'], 'maxRarity': p['maxRarity'],
                              'skillsDocumentedUpTo': p.get('docMax'), 'skillsByRarity': by_r, 'set': p.get('set')}
    wmap = {w['name']: w for w in weapons}

    def weapon_rank(w):
        mr = max([mon_rank.get(m, 1) for m in w.get('monsters') or []] + [1])
        cr = next((r for r in range(1, 61) if cap_at(r) >= (w.get('baseRarity') or 1)), 60)
        return max(mr, cr)

    def weapon_info(name):
        w = wmap.get(name)
        if not w:
            return {'name': name, 'stats': None, 'note': '武器データなし'}
        return {'name': w['name'], 'type': w['type'], 'element': w['element'], 'craftRank': weapon_rank(w),
                'baseRarity': w['baseRarity'], 'maxRarity': w['maxRarity'], 'guild': w.get('guild'),
                'statsByRarity': {r: f"攻撃{st['attack']}・{w['element']}{st.get('element') or 0}・会心{st.get('affinity') or 0}%" + ('（推定）' if st.get('est') else '')
                                  for r, st in w['stats'].items()}}

    OUT.mkdir(exist_ok=True)
    (OUT / 'builds').mkdir(exist_ok=True)
    index_chars = []
    by_char = collections.defaultdict(list)
    for b in builds['builds']:
        if b.get('charId'):
            by_char[b['charId']].append(b)
    for c in chars:
        lst = by_char.get(c['id'], [])
        out_builds = []
        used_sets = set()
        for b in lst:
            ps = {}
            ranks = []
            for part in PARTS:
                q = b['pieces'].get(part)
                if q and q.get('id') in piece:
                    info = piece[q['id']]
                    ps[PART_JP[part]] = info['name']
                    ranks.append(info['craftRank'])
                    if info.get('set'):
                        used_sets.add(info['set'])
                else:
                    ps[PART_JP[part]] = (q or {}).get('raw') or (q or {}).get('name')
            w = b.get('weapon') or {}
            wname = w.get('name') or w.get('raw')
            if wname and wname in wmap:
                ranks.append(weapon_rank(wmap[wname]))
            out_builds.append({
                'id': b['id'], 'element': b.get('element'),
                'sites': [{'site': r['source'], 'stage': r.get('stage'), 'rarityRange': r.get('rarityRange'), 'label': r.get('label'),
                           'weapon': r.get('weapon'), 'listedSkills': '・'.join(f"{k['skill']}{k.get('lv') or ''}" for k in r.get('skills') or []),
                           'comment': r.get('comment') or None, 'url': r.get('url')} for r in b['refs']],
                'independentSites': b.get('sourceCount', 1),
                'weapon': wname, 'armor': ps,
                'craftableFromRank': max(ranks) if ranks else None,
            })
        pieces_used = {}
        for b in lst:
            for part in PARTS:
                q = b['pieces'].get(part)
                if q and q.get('id') in piece:
                    pieces_used[piece[q['id']]['name']] = {k: v for k, v in piece[q['id']].items() if k != 'name'}
        weapons_used = {}
        for b in lst:
            for r in b['refs']:
                if r.get('weapon') and r['weapon'] not in weapons_used:
                    weapons_used[r['weapon']] = weapon_info(r['weapon'])
        doc = {
            'charId': c['id'], 'name': c['name'], 'weaponType': c.get('weapon'), 'element': c.get('element'),
            'elementSelectable': bool(c.get('elementSelectable')),
            'updated': builds.get('updated'),
            'howToRead': {
                'builds': '攻略サイトのおすすめ構成。armor は部位→防具名。craftableFromRank はその防具・武器が全部作れるようになる冒険ランク（目安）。sites はその構成を載せているサイト（同じ防具5部位で武器だけ違うものもまとめてある）。independentSites は別会社のサイト数（Game8 と game8.co、GameWith と gamewith.ai は同じ会社で1つ）',
                'pieces': 'skillsByRarity はそのレアに上げたときに付く合計スキル（スキルが変わるレアだけ載せている）。skillsDocumentedUpTo より上のレアのスキルはどのサイトにも無い',
                'weapons': 'statsByRarity はレアごとの攻撃・属性値・会心率',
            },
            'builds': out_builds,
            'pieces': pieces_used,
            'sets': {n: sets[n]['bonuses'] for n in sorted(used_sets) if n in sets},
            'weapons': weapons_used,
        }
        (OUT / 'builds' / f"{c['id']}.json").write_text(json.dumps(doc, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
        size = (OUT / 'builds' / f"{c['id']}.json").stat().st_size
        index_chars.append({'charId': c['id'], 'name': c['name'], 'weaponType': c.get('weapon'), 'element': c.get('element') or '主人公は火・水・雷・氷・龍を選べる',
                            'builds': len(out_builds), 'url': f"{BASE_URL}api/builds/{c['id']}.json", 'bytes': size})
    index = {
        'name': '融光工房 構成DB（モンハンアウトランダーズ）',
        'site': BASE_URL,
        'updated': builds.get('updated'),
        'rankCap': {'説明': '冒険ランク → 武器・防具を強化できる上限レア（このランク以上でこのレアまで）', '表': [{'rank': r, 'maxRarity': c} for r, c in rank_cap],
                    'ランク16未満': 2, 'ランク48以上': '不明（どのサイトにも無い）'},
        'orbForRarity': {'1〜4': '狩魂玉Ⅰ', '5〜6': '狩魂玉Ⅱ', '7〜8': '狩魂玉Ⅲ', '9〜10': '狩魂玉Ⅳ', '11〜12': '狩魂玉Ⅴ'},
        'notes': [
            '防具は冒険ランクの強化上限まで強化できる。スキルが載っているのはレア10まで（レア11以降は防御力のみ扱い）',
            '赤羽（アカハネ冒険団）武器は数値上は強く見えるが、攻略サイトの終盤装備では採用されていない',
            '弾導強化（弓・ボウガン）は数値が無いが、積むと強いという実戦評価がある',
            '属性ダメージUP は融光種相手だと効果が大きく上がる（Lv7: +28% → +70%）',
        ],
        'characters': index_chars,
    }
    (OUT / 'index.json').write_text(json.dumps(index, ensure_ascii=False, indent=1), encoding='utf-8')
    print('api/index.json', len(index_chars), 'chars; largest file', max(x['bytes'] for x in index_chars), 'bytes')


if __name__ == '__main__':
    main()
