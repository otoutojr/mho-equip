#!/usr/bin/env python3
"""ゲーム画面から書き写したデータ（tools/observed/*.json）を data/*.json に重ねる。

攻略サイトのデータは build_data.py などで作り直すと入れ替わるので、自分でゲームを見て分かったことは
別ファイルに残しておき、作り直したあとにこのスクリプトで重ねる（build_data.py の最後から呼ばれる）。
同じ名前のシリーズ・セット・スキルは置き換えるので、何度実行しても同じ結果になる。

使い方: python3 tools/apply_observed.py [--check]
  --check  data/ を書き換えずに、書き写しの検算（スキル名・最大Lv・部位）だけする
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


def check(obs, skills_by_name, new_skills):
    """書き写しの検算。食い違いがあれば文字列のリストで返す"""
    errs = []
    known = dict(skills_by_name)
    known.update({s['name']: s for s in new_skills})
    for s in obs.get('armorSeries', []):
        parts = [p['part'] for p in s['pieces']]
        if sorted(parts) != sorted(PARTS):
            errs.append(f"{s['name']}: 部位が5つそろっていない {parts}")
        for p in s['pieces']:
            for k in p['skills']:
                sk = known.get(k['name'])
                if not sk:
                    errs.append(f"{p['name']}: スキル「{k['name']}」が skills.json に無い"); continue
                if k.get('max') is not None and k['max'] != sk['maxLv']:
                    errs.append(f"{p['name']}: {k['name']} の最大Lvが画面は{k['max']}・データは{sk['maxLv']}")
                if not 1 <= k['lv'] <= sk['maxLv']:
                    errs.append(f"{p['name']}: {k['name']} Lv{k['lv']} が範囲外（最大{sk['maxLv']}）")
    for st in obs.get('sets', []):
        for b in st['bonuses']:
            if b['skill'] not in known:
                errs.append(f"セット「{st['name']}」のスキル「{b['skill']}」が skills.json に無い")
    return errs


def apply(only_check=False, out_dir=DATA):
    files = sorted(OBS.glob('*.json'))
    if not files:
        print('  (skip) tools/observed に書き写しなし')
        return 0
    armor = json.loads((DATA / 'armor.json').read_text(encoding='utf-8'))
    skills = json.loads((DATA / 'skills.json').read_text(encoding='utf-8'))
    bad = 0
    for f in files:
        obs = json.loads(f.read_text(encoding='utf-8'))
        by_name = {s['name']: s for s in skills['skills']}
        errs = check(obs, by_name, obs.get('skills', []))
        if errs:
            bad += len(errs)
            print(f'  !! {f.name}: 書き写しの検算で {len(errs)} 件')
            for e in errs: print('     -', e)
            continue
        print(f'  {f.name}: 検算OK')
        if only_check:
            continue
        for sk in obs.get('skills', []):
            skills['skills'] = replace_by_name(skills['skills'], sk)
        for st in obs.get('sets', []):
            armor['sets'] = replace_by_name(armor['sets'], st)
        for st in obs.get('setSkills', []):
            skills['setSkills'] = replace_by_name(skills['setSkills'], st)
        for s in obs.get('armorSeries', []):
            pieces = []
            for p in sorted(s['pieces'], key=lambda p: PARTS.index(p['part'])):
                pieces.append({
                    'id': f"{slug(s['name'])}_{p['part']}", 'name': p['name'], 'gameName': p.get('gameName'), 'part': p['part'],
                    'baseRarity': p['baseRarity'], 'maxRarity': p.get('maxRarity') or p['baseRarity'], 'docMax': p.get('maxRarity') or p['baseRarity'],
                    'set': s.get('set'), 'orbTier': None,
                    'skills': [{'name': k['name'], 'lv': k['lv'], 'rarity': p['baseRarity']} for k in p['skills']],
                    'materials': None, 'sourceUrl': None, 'sources': [obs['label']], 'seen': p.get('seen'),
                })
            series = {'name': s['name'], 'gate': s['gate'], 'set': s.get('set'), 'notes': s.get('notes'), 'pieces': pieces}
            armor['series'] = replace_by_name(armor['series'], series)
    # 防具のidがほかの部位とぶつかっていないか（idが同じだと、片方がもう片方を隠してしまう）
    seen_ids = collections.Counter(p['id'] for s in armor['series'] for p in s['pieces'])
    dup = [i for i, n in seen_ids.items() if n > 1]
    if dup:
        bad += len(dup)
        print(f'  !! 防具のidが重複: {dup}')
    if bad:
        print(f'  書き写しに食い違いがあるので data/ は書き換えない（{bad} 件）')
        return bad
    if not only_check:
        (out_dir / 'armor.json').write_text(json.dumps(armor, ensure_ascii=False, indent=1), encoding='utf-8')
        (out_dir / 'skills.json').write_text(json.dumps(skills, ensure_ascii=False, indent=1), encoding='utf-8')
        print('  data/armor.json・data/skills.json に重ねた')
    return 0


if __name__ == '__main__':
    sys.exit(1 if apply(only_check='--check' in sys.argv) else 0)
