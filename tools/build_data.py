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
import merge_rarity

# 防具の強化上限は部位ごとではなく冒険ランクの表で決まる（GameWith「防具のみレア度9と12で追加強化される」）。
# 攻略サイトにスキルが載っているのはレア10まで（docMax）。それより上は防御力だけ上がる扱い
ARMOR_MAX = 12

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
BASIC_SERIES = {'冒険者', '冒険団', 'アロイ', 'チェーン', 'ボーン', 'レザー', 'ハイメタ', 'ランゴ', 'パピメル', 'オウビート', 'タロス'}
MAP_SERIES = {'インゴット': '熱砂の平原'}  # 狩魂玉Ⅱ・大地の結晶が要る
GUILD_SERIES = {}

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

ELEM_ATK = re.compile(r'属性攻撃力\s*[+＋](\d+)')
def parse_level(effect):
    """効果文 → (pct, pct_yuko, flat_elem_atk)。確率の%は除外"""
    if not effect: return (0.0, 0.0, 0)
    cleaned = re.sub(r'\d+(?:\.\d+)?\s*[%％]の確率', '', effect)
    pcts = [float(m.group(2)) for m in PCT.finditer(cleaned)]
    m = ELEM_ATK.search(effect)
    flat = int(m.group(1)) if m else 0
    pct = pcts[0] if pcts else 0.0
    yuko = pcts[1] if ('融光種' in effect and len(pcts) >= 2) else pct
    return (pct, yuko, flat)

def parse_value(effect):
    """効果文から数値を取る。(通常値, 融光種相手の値)。属性攻撃力+N は N×0.12 を加算（目安）"""
    if not effect: return None, None
    cleaned = re.sub(r'\d+(?:\.\d+)?\s*[%％]の確率', '', effect)  # 「75%の確率で」は発動率なので除外
    pcts = [float(m.group(2)) for m in PCT.finditer(cleaned)]
    bonus = 0.0
    m = ELEM_ATK.search(effect)
    if m: bonus = int(m.group(1)) * 0.12
    if pcts:
        base = pcts[0] + bonus
        yuko = (pcts[1] + bonus) if ('融光種' in effect and len(pcts) >= 2) else base
        return round(base, 2), round(yuko, 2)
    m = NUM.search(effect)
    if m: return float(m.group(1)), float(m.group(1))
    return (round(bonus, 2) if bonus else None), (round(bonus, 2) if bonus else None)

def build_skills(armor_series, raw):
    skills = collections.OrderedDict()
    if raw:
        for s in raw.get('skills', []):
            name = norm(s['name'])
            levels = []
            for lv in s.get('levels', []) or []:
                eff = lv.get('effect')
                v, vy = parse_value(eff)
                pct, pct_y, flat = parse_level(eff)
                levels.append({'lv': lv['lv'], 'effect': eff, 'value': v, 'valueYuko': vy, 'pct': pct, 'pctYuko': pct_y, 'flat': flat})
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
# 章ごとのおおよその冒険ランク（攻略サイトの進行ゲートから）。明記されたランクがあればそちらを優先
CHAPTER_RANK = {'1': 1, '2': 10, '3': 20, '4': 25, '5': 30, '6': 34}
MAP_RANK = {'巨木の原野': 1, '熱砂の平原': 10, '朽ち果ての淵': 30, '瑰麗岩礁': 34}
# マップ不明（巣穴のみ）のモンスターの所属マップ
MAP_FALLBACK = {'融光種パオウルムー': ['瑰麗岩礁'], 'ルガ・エアルダ': ['瑰麗岩礁'], '融光種ツィツィヤック': ['瑰麗岩礁']}
# 強化上限レア（冒険ランク → レア）GameWith 防具強化ページの表
RANK_CAP = [[16, 3], [18, 4], [21, 5], [26, 6], [31, 7], [34, 8], [41, 9], [44, 10], [47, 11]]
# 狩魂玉のランク → そのランクまでで強化できるレア
ORB_CAP = {1: 4, 2: 6, 3: 8, 4: 10, 5: 12, 6: 12}

def build_monsters(raw, series_names):
    maps, monsters = [], []
    if not raw:
        return {'maps': [{'name': '巨木の原野', 'unlockRank': 1}], 'monsters': [], 'rankCap': RANK_CAP, 'orbCap': ORB_CAP}
    for m in raw.get('maps', []):
        if m.get('kind') and m['kind'] != 'field':
            continue  # 巣穴の狩猟などはマップではない
        u = m.get('unlock') or {}
        rank = u.get('rank')
        if rank is None:
            rank = MAP_RANK.get(m['name']) or CHAPTER_RANK.get(str(u.get('chapter') or '').strip()[:1])
        maps.append({'name': m['name'], 'unlockRank': rank, 'note': u.get('note'), 'sourceUrl': m.get('sourceUrl')})
    map_rank = {m['name']: m['unlockRank'] for m in maps}
    for m in raw.get('monsters', []):
        aser = [norm(x) for x in (m.get('armorSeries') or []) if norm(x) in series_names]
        if not aser:
            continue  # 作れる防具が無いモンスターは出さない（未実装・CBT情報のみ等）
        u = m.get('unlock') or {}
        rank = u.get('rank')
        if rank is None and u.get('chapter'):
            rank = CHAPTER_RANK.get(str(u['chapter']).strip()[:1])
        mps = list(m.get('maps') or []) or MAP_FALLBACK.get(m['name'], [])
        if rank is None:
            rs = [map_rank.get(x) for x in mps if map_rank.get(x) is not None]
            rank = min(rs) if rs else None
        monsters.append({'name': m['name'], 'variant': m.get('variant', 'normal'), 'maps': mps, 'element': m.get('element') or '無',
                         'weak': m.get('weak') or [], 'armorSeries': aser, 'unlockRank': rank, 'chapter': u.get('chapter'),
                         'note': u.get('note'), 'sourceUrl': m.get('sourceUrl')})
    return {'maps': maps, 'monsters': monsters, 'rankCap': RANK_CAP, 'orbCap': ORB_CAP}

# ---------------------------------------------------------------- characters
TIER_W = {'S': 1.0, 'A': 0.55, 'B': 0.25, 'C': 0.1}
ELEMENTS = ['火', '水', '雷', '氷', '龍']

def level_values(skill):
    """スキルのレベル別の数値（通常, 融光種相手）。無ければ 1レベル=3 の線形。"""
    lv = skill.get('levels') or []
    vals = [x.get('value') for x in lv]
    if vals and all(v is not None for v in vals):
        return vals, [x.get('valueYuko') if x.get('valueYuko') is not None else x.get('value') for x in lv]
    mx = skill.get('maxLv') or len(vals) or 3
    lin = [3.0 * (i + 1) for i in range(mx)]
    return lin, lin

SKILL_ALIAS = {'破撃': '破砕', '冒険団の力・マニファー': '冒険団の力・アーム', '冒険団の力・グリーブ': '冒険団の力・グリーヴ'}

def expand_priorities(prios):
    """「会心率系(洞察/弱点攻撃)」「破撃/破砕」のような複合表記を個別スキルに分ける"""
    out = []
    for p in prios:
        raw = norm(p.get('skill') or '')
        if not raw: continue
        if raw.startswith('属性ダメージUP'):
            names = ['{属性}属性ダメージUP']
        else:
            inner = re.search(r'[（(](.+?)[）)]', raw)
            body = inner.group(1) if inner else re.sub(r'[（(].*?[）)]', '', raw)
            names = [SKILL_ALIAS.get(x.strip(), x.strip()) for x in re.split(r'[/／・]', body) if x.strip()]
        seen = []
        for n in names:
            if n.endswith('系') or n in seen: continue
            seen.append(n)
            q = dict(p); q['skill'] = n
            if n.endswith('属性ダメージUP') and not p.get('factor'):
                q['factor'] = 0.6  # 属性分にしか乗らないので控えめに
            out.append(q)
    return out

import math
def model_weights(model, skill_name, skill, yuko=False):
    """ダメージモデルからレベル別の重み（100×ln(倍率)）を作る"""
    spec = model['skills'][skill_name]
    e = model.get('elementShare', 0.35)
    wE = model.get('weaponElement', 130)
    crit_per = model.get('critPerPct', 0.004)   # 会心率+1%あたりの期待ダメージ増（割合）
    crit_rate = model.get('critRate', 0.3)
    out = []
    for lv in skill.get('levels') or []:
        pct, pct_y, flat = parse_level(lv.get('effect'))
        p = (pct_y if yuko else pct) / 100.0
        kind = spec.get('kind', 'dmg')
        up = spec.get('uptime', 1.0); share = spec.get('share', 1.0)
        if kind == 'dmg':
            m = 1 + p * up * share
        elif kind == 'element':
            m = (1 + p * e) * (1 + p * spec.get('core', 0.0))
        elif kind == 'crit':
            m = 1 + pct * up * crit_per
        elif kind == 'elemCrit':
            m = 1 + p * crit_rate * e
        elif kind == 'proc':
            m = 1 + spec.get('chance', 0.75) * p * up
        elif kind == 'flat':
            m = 1 + p * spec.get('value', 0.3)
        else:
            m = 1 + p * up * share
        if flat:
            m *= 1 + (flat / wE) * e
        out.append(round(100 * math.log(m), 3))
    if not out:
        mx = skill.get('maxLv') or 1
        out = [round(spec.get('fallback', 0.5) * (i + 1), 3) for i in range(mx)]
    return out

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
    # ダメージモデル（models.json）があれば優先
    models = load('models.json') or {}
    for cid, m in (models.get('characters') or {}).items():
        hit = next((c for c in chars if c['id'] == cid), None)
        if hit is None:
            hit = {'id': cid}; chars.append(hit)
        hit['model'] = m['model']
        for k in ('name', 'note', 'sources', 'rarity', 'type', 'weapon', 'element', 'mechanics'):
            if k in m: hit[k] = m[k]
    for c in chars:
        hero = c['id'].startswith('hero_')
        weights = {}
        weights_y = {}
        prios = []
        seen = set()
        for p in expand_priorities(c.get('skillPriorities', [])):
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
            vals, vals_y = level_values(skills[lookup])
            weights[name] = [round(v * w, 3) for v in vals]
            weights_y[name] = [round(v * w, 3) for v in vals_y]
            prios.append({'skill': name, 'tier': (p.get('tier') or 'B').upper(), 'targetLv': p.get('targetLv'), 'reason': p.get('reason') or ''})
        # 控えめな汎用補正（同点時に生存スキルを拾う）
        model = c.get('model')
        if model:
            weights, weights_y, prios = {}, {}, []
            for sname, spec in model['skills'].items():
                key = sname
                lookup = sname.replace('{属性}', '火')
                if lookup not in skills:
                    print(f"  ?? {c.get('name', c['id'])}: モデルのスキルが無い: {sname}"); continue
                weights[key] = model_weights(model, sname, skills[lookup], False)
                weights_y[key] = model_weights(model, sname, skills[lookup], True)
                if spec.get('reason') is not None:
                    prios.append({'skill': key, 'tier': spec.get('tier', 'A'), 'targetLv': spec.get('targetLv'), 'reason': spec.get('reason', ''), 'sources': spec.get('sources', []), 'assumption': spec.get('assumption', '')})
            prios.sort(key=lambda q: -max(weights[q['skill']]))
        for name in ('体力強化', '加護', '体力回復', '防護'):
            if name in skills and name not in weights:
                weights[name] = [0.1 * (i + 1) for i in range(skills[name]['maxLv'] or 1)]
                weights_y[name] = weights[name]
        entry = {'id': c['id'], 'name': c.get('name', c['id']), 'rarity': c.get('rarity'), 'type': None if hero else c.get('type'), 'weapon': c.get('weapon'), 'element': None if hero else c.get('element'),
                 'elementSelectable': hero, 'mechanics': c.get('mechanics') or [], 'priorities': prios, 'weights': weights, 'weightsYuko': weights_y, 'note': c.get('note') or '',
                 'scoreMode': 'log' if c.get('model') else 'sum', 'model': ({k: v for k, v in c['model'].items() if k != 'skills'} if c.get('model') else None),
                 'modelSkills': ({k: {kk: vv for kk, vv in v.items() if kk in ('kind', 'uptime', 'share', 'chance', 'core', 'value', 'fallback')} for k, v in c['model']['skills'].items()} if c.get('model') else None),
                 'sources': c.get('sources') or []}
        ov = ((overrides or {}).get('characters') or {}).get(c['id'])
        if ov and ov.get('weights'):
            entry['weights'].update(ov['weights']); entry['weightsYuko'].update(ov['weights'])
        out.append(entry)
    order = (overrides or {}).get('characterOrder')
    if order:
        pos = {cid: i for i, cid in enumerate(order)}
        out.sort(key=lambda e: pos.get(e['id'], 999))
    return out

def series_max_rarity(raw_mon):
    out = {}
    for name, rng in ((raw_mon or {}).get('armorSeriesRarity') or {}).get('series', {}).items():
        try:
            out[norm(name)] = int(str(rng).split('-')[-1])
        except ValueError:
            pass
    return out

def main():
    OUT.mkdir(exist_ok=True)
    overrides = load('overrides.json') or {}
    armor_series = merge_armor()
    raw_mon = load('monsters.json')
    max_rar = series_max_rarity(raw_mon)
    monsters = build_monsters(raw_mon, set(armor_series.keys()))
    monsters_by_series = collections.defaultdict(list)
    for m in monsters['monsters']:
        for s in m['armorSeries']:
            monsters_by_series[s].append(m['name'])
    skills, set_skills = build_skills(armor_series, load('skills.json'))

    sets = collections.OrderedDict()
    # Game8 のセットスキル表（必要部位数が GameWith と食い違うものがあり、独立2サイトが一致する Game8 側を採用）
    for st in set_skills or []:
        sname = norm(st.get('name'))
        if not sname: continue
        bonuses = [{'pieces': b.get('pieces') or st.get('pieces') or 2, 'skill': norm(b.get('skill')), 'lv': b.get('lv') or 1,
                    'effect': b.get('effect'), 'description': b.get('skillDescription') or b.get('effect')} for b in st.get('bonuses') or [] if b.get('skill')]
        if bonuses: sets[sname] = {'name': sname, 'bonuses': bonuses}
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
            last_unlock = max([k.get('rarity') or 0 for k in p['skills']] + [p.get('baseRarity') or 1])
            pieces.append({'id': f"{slug(name)}_{p['part']}", 'name': norm(p['name']), 'part': p['part'], 'baseRarity': p.get('baseRarity') or 1,
                           # 攻略サイトに載っているのはレアdocMaxまで。ゲーム内はランクの強化上限まで育つので、上限は全防具共通で12にする
                           'maxRarity': 12, 'docMax': max(max_rar.get(name, 0), last_unlock), 'set': pset, 'orbTier': orb_tier(p.get('materials')),
                           'skills': [{'name': norm(k['name']), 'lv': k['lv'], 'rarity': k.get('rarity') if k.get('rarity') is not None else (p.get('baseRarity') or 1)} for k in p['skills']],
                           'materials': p.get('materials'), 'sourceUrl': p.get('sourceUrl')})
        series_out.append({'name': name, 'gate': series_gate(name, monsters_by_series), 'set': main_set, 'pieces': pieces})

    # レア別スキルを Game8 / Gamerch / gamewith.ai と突き合わせる（GameWith はレア7前後までしか載っていない）
    rsrc = merge_rarity.load_sources(RAW)
    gmax = merge_rarity.load_gamerch_max(RAW)
    n_conf = 0; xc = collections.Counter()
    for s in series_out:
        for p in s['pieces']:
            merge_rarity.merge_piece(p, rsrc)
            p['maxRarity'] = max(ARMOR_MAX, p['docMax'])
            p.pop('maxSeen', None)
            xc[merge_rarity.check_max(p, gmax)] += 1
            n_conf += len([c for c in p.get('conflicts', []) if 'skill' in c])
    print(f'  レア別スキルの食い違い: {n_conf} 件 / Gamerch 最大強化スキルと一致 {xc[True]}・不一致 {xc[False]}・照合なし {xc[None]}')
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
