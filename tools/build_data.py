#!/usr/bin/env python3
"""収集した生データ（scratchpad/data/*.json）からアプリ用の data/*.json を作る。

入力（存在するものだけ使う）:
  armor_gamewith.json        GameWith 29シリーズ
  armor_gamewith_extra.json  GameWith 追加シリーズ
  armor_extra.json           Game8 など（GameWith に無いシリーズの補完）
  skills.json                スキル効果（レベル別）とセットスキル
  monsters.json              モンスター・マップ・解放ランク
  characters.json            キャラごとの推奨スキル
  overrides.json             手作業の補正（任意）

出力: data/armor.json, data/skills.json, data/monsters.json, data/characters.json
"""
import json, re, sys, datetime, pathlib, collections

RAW = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else pathlib.Path('/tmp/claude-0/-home-claude/094b7c7b-727a-5a9e-9d7d-7a958be863c9/scratchpad/data')
OUT = pathlib.Path(__file__).resolve().parent.parent / 'data'
TODAY = datetime.date.today().isoformat()

def load(name):
    p = RAW / name
    if not p.exists():
        print(f'  (skip) {name} なし')
        return None
    return json.loads(p.read_text(encoding='utf-8'))

def norm(s):
    if s is None: return None
    return s.replace('ＵＰ', 'UP').replace('Ｌｖ', 'Lv').strip()

# ---------------------------------------------------------------- armor
def merge_armor():
    series = collections.OrderedDict()
    for fname in ['armor_gamewith.json', 'armor_gamewith_extra.json', 'armor_extra.json']:
        d = load(fname)
        if not d: continue
        for s in d.get('series', []):
            name = norm(s['name'])
            if name in series:
                # 既存にない部位だけ補完
                have = {p['part'] for p in series[name]['pieces']}
                for p in s['pieces']:
                    if p['part'] not in have:
                        series[name]['pieces'].append(p); have.add(p['part'])
                continue
            series[name] = {'name': name, 'setSkill': s.get('setSkill'), 'monster': s.get('monster'), 'pieces': list(s['pieces']), 'notes': s.get('notes', '')}
    return series

PART_ORDER = {'head': 0, 'body': 1, 'arm': 2, 'waist': 3, 'leg': 4}

# シリーズ → 入手条件（モンスター名は monsters.json と突き合わせて上書きされる）
SERIES_MONSTER = {
    'ジャグラス': 'ドスジャグラス', 'クルル': 'クルルヤック', 'プケプケ': 'プケプケ', 'ギルオス': 'ドスギルオス',
    'ジュラ': 'ジュラトドス', 'ボロス': 'ボルボロス', 'ジャナフ': 'アンジャナフ', 'カガチ': 'トビカガチ',
    'レイア': 'リオレイア', 'レウス': 'リオレウス', 'ディアブロ': 'ディアブロス', 'ディアブロス': 'ディアブロス',
    'ツィツィ': 'ツィツィヤック', 'ウルムー': 'パオウルムー', 'バルキン': 'ラドバルキン', 'ギエナ': 'レイギエナ',
    'ガロン': 'オドガロン', 'リオハート': 'リオレイア亜種', 'エアルダ': 'ルガエアルダ', 'ブロス亜種': 'ディアブロス亜種',
}
BASIC_SERIES = {'冒険者', 'アロイ', 'チェーン', 'ボーン', 'レザー', 'ハイメタ', 'ランゴ', 'パピメル', 'オウビート', 'タロス'}
MAP_SERIES = {'インゴット': '熱砂の平原'}  # 狩魂玉Ⅱ・大地の結晶が要る
GUILD_SERIES = {'冒険団': 1}

def series_gate(name, monsters_by_series):
    if name in GUILD_SERIES:
        return {'type': 'guild', 'lv': GUILD_SERIES[name]}
    if name in BASIC_SERIES:
        return {'type': 'basic'}
    if name in MAP_SERIES:
        return {'type': 'map', 'map': MAP_SERIES[name]}
    mons = monsters_by_series.get(name)
    if mons:
        return {'type': 'monster', 'monsters': mons}
    base = name.replace('融光種', '')
    if base in SERIES_MONSTER:
        m = SERIES_MONSTER[base]
        return {'type': 'monster', 'monsters': [('融光種' + m) if name.startswith('融光種') else m]}
    print(f'  !! 入手条件が不明なシリーズ: {name} → basic 扱い')
    return {'type': 'basic', 'unknown': True}

ORB = {'Ⅰ': 1, 'Ⅱ': 2, 'Ⅲ': 3, 'Ⅳ': 4, 'Ⅴ': 5, 'Ⅵ': 6}
def orb_tier(materials):
    """生産素材の狩魂玉のティア（Ⅰ〜）。無ければ None"""
    for m in materials or []:
        n = m.get('name') or ''
        if n.startswith('狩魂玉') and len(n) > 3 and n[3] in ORB:
            return ORB[n[3]]
    return None

def slug(s):
    return re.sub(r'[^0-9a-zA-Z]+', '_', s.encode('unicode_escape').decode()).strip('_')[:40]

# ---------------------------------------------------------------- skills
PCT = re.compile(r'([+＋]?)(\d+(?:\.\d+)?)\s*[%％]')
NUM = re.compile(r'[+＋](\d+(?:\.\d+)?)')

def parse_value(effect):
    if not effect: return None
    m = PCT.search(effect)
    if m: return float(m.group(2))
    m = NUM.search(effect)
    if m: return float(m.group(1))
    return None

def build_skills(armor_series, raw):
    skills = collections.OrderedDict()
    if raw:
        for s in raw.get('skills', []):
            name = norm(s['name'])
            levels = []
            for lv in s.get('levels', []) or []:
                eff = lv.get('effect')
                levels.append({'lv': lv['lv'], 'effect': eff, 'value': parse_value(eff)})
            skills[name] = {'name': name, 'category': s.get('category'), 'weapon': s.get('weapon'), 'maxLv': s.get('maxLv') or (len(levels) or None), 'levels': levels}
    # 防具側に出てくるのに無いスキルは仮登録（maxLv は見かけの最大）
    seen_max = collections.Counter()
    for s in armor_series.values():
        for p in s['pieces']:
            for k in p['skills']:
                seen_max[norm(k['name'])] = max(seen_max[norm(k['name'])], k['lv'])
        for b in (s.get('setSkill') or {}).get('bonuses', []) or []:
            if b.get('skill'): seen_max[norm(b['skill'])] = max(seen_max[norm(b['skill'])], b.get('lv', 1))
    for name, mx in seen_max.items():
        if name not in skills:
            # 効果不明のスキル。上限は不明なので大きめにしておく（重みが付かなければ結果に影響しない）
            skills[name] = {'name': name, 'category': None, 'weapon': None, 'maxLv': max(mx, 7), 'levels': [], 'placeholder': True}
        elif not skills[name].get('maxLv'):
            skills[name]['maxLv'] = max(mx, 7)
    set_skills = (raw or {}).get('setSkills', [])
    return skills, set_skills

def parse_set_bonus(effect):
    """'標本の達人+1' → ('標本の達人', 1)"""
    if not effect: return None, None
    m = re.match(r'(.+?)\s*[+＋]\s*(\d+)', effect)
    if m: return norm(m.group(1)), int(m.group(2))
    return norm(effect), 1

# ---------------------------------------------------------------- monsters
CHAPTER_RANK = {'1': 1, '2': 8, '3': 16, '4': 24, '5': 32}

def build_monsters(raw, series_names):
    maps, monsters = [], []
    if not raw:
        return {'maps': [{'name': '巨木の原野', 'unlockRank': 1}], 'monsters': []}
    for m in raw.get('maps', []):
        u = m.get('unlock') or {}
        rank = u.get('rank')
        if rank is None and u.get('chapter'):
            rank = CHAPTER_RANK.get(str(u['chapter']).strip()[:1])
        maps.append({'name': m['name'], 'unlockRank': rank, 'note': u.get('note'), 'sourceUrl': m.get('sourceUrl')})
    map_rank = {m['name']: m['unlockRank'] for m in maps}
    for m in raw.get('monsters', []):
        u = m.get('unlock') or {}
        rank = u.get('rank')
        if rank is None and u.get('chapter'):
            rank = CHAPTER_RANK.get(str(u['chapter']).strip()[:1])
        if rank is None:
            rs = [map_rank.get(x) for x in m.get('maps', []) if map_rank.get(x) is not None]
            rank = min(rs) if rs else None
        aser = [norm(x) for x in (m.get('armorSeries') or []) if norm(x) in series_names]
        monsters.append({'name': m['name'], 'variant': m.get('variant', 'normal'), 'maps': m.get('maps') or [], 'element': m.get('element') or '無',
                         'weak': m.get('weak') or [], 'armorSeries': aser, 'unlockRank': rank, 'note': u.get('note'), 'sourceUrl': m.get('sourceUrl')})
    return {'maps': maps, 'monsters': monsters}

# ---------------------------------------------------------------- characters
TIER_W = {'S': 1.0, 'A': 0.55, 'B': 0.25, 'C': 0.1}
ELEMENTS = ['火', '水', '雷', '氷', '龍']

def level_values(skill):
    """スキルのレベル別の数値（% など）。無ければ 1レベル=3 の線形。"""
    lv = skill.get('levels') or []
    vals = [x.get('value') for x in lv]
    if vals and all(v is not None for v in vals):
        return vals
    mx = skill.get('maxLv') or len(vals) or 3
    return [3.0 * (i + 1) for i in range(mx)]

def build_characters(raw, skills, overrides):
    out = []
    chars = list((raw or {}).get('characters', []))
    # 手作業の補正で優先スキルを丸ごと差し替え/追加できる
    for cid, ov in ((overrides or {}).get('characters') or {}).items():
        hit = next((c for c in chars if c['id'] == cid), None)
        if hit is None:
            hit = {'id': cid}
            chars.append(hit)
        for k, v in ov.items():
            if k != 'weights': hit[k] = v
    for c in chars:
        hero = c['id'].startswith('hero_')
        weights = {}
        prios = []
        seen = set()
        for p in c.get('skillPriorities', []):
            name = norm(p['skill'])
            if hero and name.endswith('属性ダメージUP'):
                name = '{属性}属性ダメージUP'
            lookup = name.replace('{属性}', '火')
            if lookup not in skills:
                cands = [k for k in skills if k.replace('属性ダメージUP', '') == lookup.replace('属性ダメージUP', '')]
                if cands: lookup = cands[0]
                else:
                    print(f"  ?? {c.get('name', c['id'])}: スキル名が防具データに無い: {name}")
                    continue
            if not hero and lookup.endswith('属性ダメージUP') and c.get('element') and not lookup.startswith(c['element']):
                continue
            if name in seen: continue
            seen.add(name)
            w = TIER_W.get((p.get('tier') or 'B').upper(), 0.25) * (p.get('factor') or 1.0)
            vals = level_values(skills[lookup])
            weights[name] = [round(v * w, 3) for v in vals]
            prios.append({'skill': name, 'tier': (p.get('tier') or 'B').upper(), 'targetLv': p.get('targetLv'), 'reason': p.get('reason') or ''})
        # 控えめな汎用補正（同点時に生存スキルを拾う）
        for name in ('体力強化', '加護', '体力回復', '防護'):
            if name in skills and name not in weights:
                weights[name] = [0.1 * (i + 1) for i in range(skills[name]['maxLv'] or 1)]
        entry = {'id': c['id'], 'name': c.get('name', c['id']), 'rarity': c.get('rarity'), 'type': c.get('type'), 'weapon': c.get('weapon'), 'element': c.get('element'),
                 'elementSelectable': hero, 'mechanics': c.get('mechanics') or [], 'priorities': prios, 'weights': weights, 'note': c.get('note') or ''}
        ov = ((overrides or {}).get('characters') or {}).get(c['id'])
        if ov and ov.get('weights'):
            entry['weights'].update(ov['weights'])
        out.append(entry)
    order = (overrides or {}).get('characterOrder')
    if order:
        pos = {cid: i for i, cid in enumerate(order)}
        out.sort(key=lambda e: pos.get(e['id'], 999))
    return out

def main():
    OUT.mkdir(exist_ok=True)
    overrides = load('overrides.json') or {}
    armor_series = merge_armor()
    raw_mon = load('monsters.json')
    monsters = build_monsters(raw_mon, set(armor_series.keys()))
    monsters_by_series = collections.defaultdict(list)
    for m in monsters['monsters']:
        for s in m['armorSeries']:
            monsters_by_series[s].append(m['name'])
    skills, set_skills = build_skills(armor_series, load('skills.json'))

    sets = collections.OrderedDict()
    def register_set(ss):
        if not ss or not ss.get('name'): return None
        sname = norm(ss['name'])
        if sname not in sets:
            bonuses = []
            for b in ss.get('bonuses', []) or []:
                eff = b.get('probableEffect') or b.get('effect')
                skill, lv = (b.get('skill'), b.get('lv')) if b.get('skill') else parse_set_bonus(eff)
                bonuses.append({'pieces': b.get('pieces', 2), 'skill': norm(skill), 'lv': lv or 1, 'effect': b.get('effect'), 'description': b.get('description')})
            sets[sname] = {'name': sname, 'bonuses': bonuses}
        return sname

    series_out = []
    for name, s in armor_series.items():
        main_set = register_set(s.get('setSkill'))
        for other in s.get('otherSetSkills') or []:
            register_set(other)
        pieces = []
        for p in sorted(s['pieces'], key=lambda p: PART_ORDER.get(p['part'], 9)):
            pset = norm(p.get('setSkillOverride')) if p.get('setSkillOverride') else main_set
            if pset and pset not in sets: register_set({'name': pset, 'bonuses': []})
            pieces.append({'id': f"{slug(name)}_{p['part']}", 'name': norm(p['name']), 'part': p['part'], 'baseRarity': p.get('baseRarity') or 1,
                           'maxRarity': p.get('maxRarity') or 9, 'set': pset, 'orbTier': orb_tier(p.get('materials')),
                           'skills': [{'name': norm(k['name']), 'lv': k['lv'], 'rarity': k.get('rarity') if k.get('rarity') is not None else (p.get('baseRarity') or 1)} for k in p['skills']],
                           'materials': p.get('materials'), 'sourceUrl': p.get('sourceUrl')})
        series_out.append({'name': name, 'gate': series_gate(name, monsters_by_series), 'set': main_set, 'pieces': pieces})
    armor_out = {'updated': TODAY, 'sets': list(sets.values()), 'series': series_out}

    chars = build_characters(load('characters.json'), skills, overrides)

    (OUT / 'armor.json').write_text(json.dumps(armor_out, ensure_ascii=False, indent=1), encoding='utf-8')
    (OUT / 'skills.json').write_text(json.dumps({'updated': TODAY, 'skills': list(skills.values()), 'setSkills': set_skills}, ensure_ascii=False, indent=1), encoding='utf-8')
    (OUT / 'monsters.json').write_text(json.dumps({'updated': TODAY, **monsters}, ensure_ascii=False, indent=1), encoding='utf-8')
    (OUT / 'characters.json').write_text(json.dumps({'updated': TODAY, 'characters': chars}, ensure_ascii=False, indent=1), encoding='utf-8')
    print(f"series={len(series_out)} pieces={sum(len(s['pieces']) for s in series_out)} skills={len(skills)} monsters={len(monsters['monsters'])} chars={len(chars)}")
    for s in series_out:
        g = s['gate']
        if g['type'] == 'monster': print(f"  {s['name']:10} ← {','.join(g['monsters'])}")
        else: print(f"  {s['name']:10} ← {g}")

if __name__ == '__main__':
    main()
