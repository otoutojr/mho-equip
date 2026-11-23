#!/usr/bin/env python3
"""攻略サイト以外から分かったデータ（tools/observed/*.json）を data/*.json に重ねる。

攻略サイトのデータは build_data.py・build_weapons.py で作り直すと入れ替わるので、ゲーム画面で確かめたことや
アウかる（mhnowcalc.com）のデータは別ファイルに残しておき、作り直したあとにこのスクリプトで重ねる
（build_data.py と build_weapons.py の最後から呼ばれる）。何度実行しても同じ結果になる。

1ファイルに入れられるもの:
  armorSeries   防具シリーズ（同じ名前のシリーズは丸ごと置き換え）。部位ごとに画面のスキルと「LV 今/最大」
  sets / skills / setSkills   セット効果・スキル（同じ名前は置き換え）
  piecePatches  既存の防具の、あるレアでのスキルLvを直す [{piece, rarity, skills: {名前: Lv}}]
  rankCap       冒険ランク→強化上限レアの表に足す [[ランク, レア], ...]
  weaponStats   武器のレアごとの数値を足す・直す {武器名: {maxRarity, stats: {レア: {attack, element, affinity}}}}

使い方: python3 tools/apply_observed.py [--check]
  --check  data/ を書き換えずに、書き写しの検算（スキル名・最大Lv・部位・防具や武器の有無）だけする
"""
import json, re, sys, pathlib, collections

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / 'data'
OBS = ROOT / 'tools' / 'observed'
PARTS = ['head', 'body', 'arm', 'waist', 'leg']


def slug(s):  # build_data.slug と同じ（防具のidを他と同じ作りにする）
    return re.sub(r'[^0-9a-zA-Z]+', '_', s.encode('unicode_escape').decode()).strip('_')[:40]


def replace_by_name(items, new, key='name'):
    out, done = [], False
    for x in items:
        if x.get(key) == new[key]:
            out.append(new); done = True
        else:
            out.append(x)
    if not done:
        out.append(new)
    return out


def check(obs, skills_by_name, new_skills, pieces_by_name=None, weapons_by_name=None, rank_cap=None):
    """書き写しの検算。食い違いがあれば文字列のリストで返す"""
    errs = []
    known = dict(skills_by_name)
    known.update({s['name']: s for s in new_skills})

    def lv_ok(where, name, lv, mx=None):
        sk = known.get(name)
        if not sk:
            errs.append(f"{where}: スキル「{name}」が skills.json に無い"); return
        if mx is not None and mx != sk['maxLv']:
            errs.append(f"{where}: {name} の最大Lvが画面は{mx}・データは{sk['maxLv']}")
        if not 1 <= lv <= sk['maxLv']:
            errs.append(f"{where}: {name} Lv{lv} が範囲外（最大{sk['maxLv']}）")

    for s in obs.get('armorSeries', []):
        parts = [p['part'] for p in s['pieces']]
        if sorted(parts) != sorted(PARTS):
            errs.append(f"{s['name']}: 部位が5つそろっていない {parts}")
        for p in s['pieces']:
            for k in p['skills']:
                lv_ok(p['name'], k['name'], k['lv'], k.get('max'))
    for st in obs.get('sets', []):
        for b in st['bonuses']:
            if b['skill'] not in known:
                errs.append(f"セット「{st['name']}」のスキル「{b['skill']}」が skills.json に無い")
    for pp in obs.get('piecePatches', []):
        if pieces_by_name is not None and pp['piece'] not in pieces_by_name:
            errs.append(f"直す防具「{pp['piece']}」が armor.json に無い")
        for name, lv in pp['skills'].items():
            lv_ok(f"{pp['piece']} レア{pp['rarity']}", name, lv)
    if obs.get('rankCap'):
        table = dict(map(tuple, rank_cap or []))
        table.update({r: c for r, c in obs['rankCap']})
        caps = [c for _, c in sorted(table.items())]
        if caps != sorted(caps):
            errs.append(f"強化上限の表がランク順に増えていない: {sorted(table.items())}")
    for name, w in (obs.get('weaponStats') or {}).items():
        if weapons_by_name is not None and name not in weapons_by_name:
            errs.append(f"武器「{name}」が weapons.json に無い")
        for r, st in w['stats'].items():
            if not st.get('attack'):
                errs.append(f"武器「{name}」レア{r} の攻撃力が無い")
    return errs


def load(name):
    p = DATA / name
    return json.loads(p.read_text(encoding='utf-8')) if p.exists() else None


def observed(key):
    """書き写しファイルの key（skills など）を、ファイル名順に全部並べて返す（build_data.py がキャラの重みづけの前に使う）"""
    return [x for f in sorted(OBS.glob('*.json')) for x in json.loads(f.read_text(encoding='utf-8')).get(key, [])]


def apply(only_check=False, out_dir=DATA):
    files = sorted(OBS.glob('*.json'))
    if not files:
        print('  (skip) tools/observed に書き写しなし')
        return 0
    armor, skills, monsters, weapons = load('armor.json'), load('skills.json'), load('monsters.json'), load('weapons.json')
    bad = 0
    touched = set()
    for f in files:
        obs = json.loads(f.read_text(encoding='utf-8'))
        by_name = {s['name']: s for s in skills['skills']}
        pieces = {p['name']: p for s in armor['series'] for p in s['pieces']}
        wmap = {w['name']: w for w in weapons['weapons']} if weapons else None
        errs = check(obs, by_name, obs.get('skills', []), pieces, wmap, monsters.get('rankCap') if monsters else None)
        if errs:
            bad += len(errs)
            print(f'  !! {f.name}: 書き写しの検算で {len(errs)} 件')
            for e in errs: print('     -', e)
            continue
        print(f'  {f.name}: 検算OK')
        if only_check:
            continue
        label = obs['label']
        for sk in obs.get('skills', []):
            skills['skills'] = replace_by_name(skills['skills'], sk); touched.add('skills')
        for st in obs.get('sets', []):
            armor['sets'] = replace_by_name(armor['sets'], st); touched.add('armor')
        for st in obs.get('setSkills', []):
            skills['setSkills'] = replace_by_name(skills['setSkills'], st); touched.add('skills')
        for s in obs.get('armorSeries', []):
            ps = []
            for p in sorted(s['pieces'], key=lambda p: PARTS.index(p['part'])):
                ps.append({
                    'id': f"{slug(s['name'])}_{p['part']}", 'name': p['name'], 'gameName': p.get('gameName'), 'part': p['part'],
                    # スキルが分かっているのは生産時のレアだけなので、docMax は生産レア
                    'baseRarity': p['baseRarity'], 'maxRarity': p.get('maxRarity') or p['baseRarity'], 'docMax': p['baseRarity'],
                    'set': s.get('set'), 'orbTier': None,
                    'skills': [{'name': k['name'], 'lv': k['lv'], 'rarity': p['baseRarity']} for k in p['skills']],
                    'materials': None, 'sourceUrl': None, 'sources': [label], 'seen': p.get('seen'),
                })
            series = {'name': s['name'], 'gate': s['gate'], 'set': s.get('set'), 'notes': s.get('notes'), 'pieces': ps}
            armor['series'] = replace_by_name(armor['series'], series); touched.add('armor')
        for pp in obs.get('piecePatches', []):
            p = pieces[pp['piece']]
            for name, lv in pp['skills'].items():
                hit = [k for k in p['skills'] if k['name'] == name and (k.get('rarity') or p['baseRarity']) == pp['rarity']]
                if hit:
                    for k in hit: k['lv'] = lv
                else:
                    p['skills'].append({'name': name, 'lv': lv, 'rarity': pp['rarity']})
            p['skills'].sort(key=lambda k: (k.get('rarity') or p['baseRarity'], k['name']))
            src = p.setdefault('sources', [])
            if label not in src: src.append(label)
            touched.add('armor')
        if obs.get('rankCap'):
            table = dict(map(tuple, monsters['rankCap']))
            table.update({r: c for r, c in obs['rankCap']})
            monsters['rankCap'] = [[r, c] for r, c in sorted(table.items())]
            touched.add('monsters')
        for name, w in (obs.get('weaponStats') or {}).items():
            mine = wmap[name]
            for r, st in w['stats'].items():
                mine['stats'][str(r)] = {**st, 'src': label}
            mine['stats'] = dict(sorted(mine['stats'].items(), key=lambda x: int(x[0])))
            mine['maxRarity'] = max(mine.get('maxRarity') or 0, w.get('maxRarity') or 0, *map(int, w['stats']))
            touched.add('weapons')
    # 防具のidがほかの部位とぶつかっていないか（idが同じだと、片方がもう片方を隠してしまう）
    seen_ids = collections.Counter(p['id'] for s in armor['series'] for p in s['pieces'])
    dup = [i for i, n in seen_ids.items() if n > 1]
    if dup:
        bad += len(dup)
        print(f'  !! 防具のidが重複: {dup}')
    if bad:
        print(f'  検算で食い違いがあるので data/ は書き換えない（{bad} 件）')
        return bad
    if not only_check:
        docs = {'armor': armor, 'skills': skills, 'monsters': monsters, 'weapons': weapons}
        for name in sorted(touched):
            (out_dir / f'{name}.json').write_text(json.dumps(docs[name], ensure_ascii=False, indent=1), encoding='utf-8')
        print('  重ねたファイル:', ', '.join(f'data/{n}.json' for n in sorted(touched)) or 'なし')
    return 0


if __name__ == '__main__':
    sys.exit(1 if apply(only_check='--check' in sys.argv) else 0)
