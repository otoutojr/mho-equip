#!/usr/bin/env python3
"""攻略サイトのおすすめ構成を集めた「構成DB」（data/builds.json）を作る。

入力（scratchpad/data、あるものだけ使う）:
  builds_game8.json     Game8 のキャラ・武器種ごとのおすすめ装備
  builds_gamewith.json  GameWith の最強装備
  builds_other.json     アルテマ・Gamerch など
  どれも {"builds": [{charId, element, weapon, armor: {head, body, arm, waist, leg}, skills, label, stage, sourceUrl, ...}]}

やること:
  - 防具名・武器名を data/armor.json / data/weapons.json の名前に突き合わせる（強化段階の Ⅰ〜Ⅳ は外す）
  - 同じキャラ・属性・武器・防具5部位の構成は1件にまとめ、どのサイトが載せているかを refs に並べる
  - 突き合わせられなかった名前は unresolved に残す（勝手に直さない）
"""
import json, re, sys, pathlib, datetime, collections, unicodedata

RAW = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else pathlib.Path('/tmp/claude-0/-home-claude/094b7c7b-727a-5a9e-9d7d-7a958be863c9/scratchpad/data')
ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'data' / 'builds.json'
PARTS = ['head', 'body', 'arm', 'waist', 'leg']
TIER = re.compile(r'\s*(?:[ⅠⅡⅢⅣⅤⅥ]+|IV|V?I{1,3}|V)$')


def norm(s):
    if not s:
        return None
    s = unicodedata.normalize('NFKC', s).replace(' ', '').replace('　', '').strip()
    return TIER.sub('', s)


def variants(n):
    """表記ゆれの候補（ディアブロ/ディアブロス、グリーブ/グリーヴ）"""
    out = {n}
    for a, b in [('ディアブロス', 'ディアブロ'), ('グリーヴ', 'グリーブ'), ('ヴ', 'ブ')]:
        for x in list(out):
            out.add(x.replace(a, b)); out.add(x.replace(b, a))
    return out


HERO_BY_TYPE = {'ヘビィボウガン': 'hero_hbg', '太刀': 'hero_ls', '大剣': 'hero_gs', '双剣': 'hero_db', 'ランス': 'hero_lance',
                '弓': 'hero_bow', 'ハンマー': 'hero_hammer', 'チャージアックス': 'hero_cb'}


def skill_name(s):
    return unicodedata.normalize('NFKC', s or '').replace('搔', '掻').strip()


def load(name):
    p = RAW / name
    if not p.exists():
        print(f'  (skip) {name} なし')
        return None
    return json.loads(p.read_text(encoding='utf-8'))


def main():
    armor = json.loads((ROOT / 'data' / 'armor.json').read_text(encoding='utf-8'))
    weapons = json.loads((ROOT / 'data' / 'weapons.json').read_text(encoding='utf-8'))['weapons']
    piece_by = {}
    for s in armor['series']:
        for p in s['pieces']:
            piece_by[(norm(p['name']), p['part'])] = p
            piece_by.setdefault((norm(p['name']), None), p)
    weapon_by = {norm(w['name']): w for w in weapons}
    # 英語名 → 日本語名（weapons_full.json の nameEn）
    full_p = RAW / 'weapons_full.json'
    if full_p.exists():
        for w in json.loads(full_p.read_text(encoding='utf-8'))['weapons']:
            if w.get('nameEn') and norm(w['name']) in weapon_by:
                weapon_by.setdefault(norm(w['nameEn']), weapon_by[norm(w['name'])])

    def find_piece(name, part):
        n = norm(name)
        if not n:
            return None
        for v in variants(n):
            p = piece_by.get((v, part)) or piece_by.get((v, None))
            if p:
                return p
        return None

    def find_weapon(name):
        n = norm(name)
        if not n:
            return None
        for v in variants(n):
            if v in weapon_by:
                return weapon_by[v]
        return None

    merged = collections.OrderedDict()
    unresolved = collections.Counter()
    skipped = collections.Counter()
    n_in = 0
    for fname in ['builds_game8.json', 'builds_gamewith.json', 'builds_other.json']:
        d = load(fname)
        if not d:
            continue
        for b in d.get('builds') or []:
            n_in += 1
            # まとめページの再掲（同じサイトの個別ページと同一）は数えない。キャラページと武器種ページの重複は下で1件にまとまる
            if b.get('sameAsBuild') or (b.get('sameAs') and not b.get('charId')):
                continue
            if not b.get('charId') and b.get('weaponType') in HERO_BY_TYPE:  # 武器種別の序盤装備ページ＝主人公向け
                b = dict(b, charId=HERO_BY_TYPE[b['weaponType']])
            src = b.get('source') or d.get('source') or fname
            if b.get('partial'):  # game8.co の「Progression Options」は一部の部位だけの行なので構成としては入れない
                skipped['部位がそろっていない'] += 1
                continue
            # 英語サイトは日本語名に読み替えたもの（armorJa / weaponJa、なければ Norm）を使う
            arm = b.get('armorJa') or b.get('armorNorm') or b.get('armor') or {}
            b = dict(b, weapon=b.get('weaponJa') or b.get('weaponNorm') or b.get('weapon'))
            pieces = {}
            for part in PARTS:
                raw = arm.get(part)
                p = find_piece(raw, part)
                if raw and not p:
                    unresolved[f'防具 {raw}（{src}）'] += 1
                pieces[part] = {'id': p['id'], 'name': p['name'], 'part': p['part']} if p else ({'id': None, 'raw': raw} if raw else None)
            # サイトの表で部位の欄がずれている防具（GameWith の「手」にメイルなど）は本来の部位に戻す
            for part in PARTS:
                q = pieces[part]
                if q and q.get('part') and q['part'] != part and not pieces.get(q['part']):
                    pieces[q['part']] = q; pieces[part] = None
            for q in pieces.values():
                if q: q.pop('part', None)
            w = find_weapon(b.get('weapon'))
            if b.get('weapon') and not w:
                unresolved[f'武器 {b.get("weapon")}（{src}）'] += 1
            el = b.get('element') or (w.get('element') if w and w.get('element') not in (None, '無') else None)
            # 防具5部位が同じなら武器が違っても1構成にまとめる（武器はサイトごとに並べる）
            key = '|'.join([b.get('charId') or '?', el or '-'] +
                           [(pieces[x] or {}).get('id') or (pieces[x] or {}).get('raw') or '-' for x in PARTS])
            wname = w['name'] if w else (b.get('weapon') or None)
            ref = {'source': src, 'label': b.get('label'), 'stage': b.get('stage'), 'rarityRange': b.get('rarityRange'),
                   'url': b.get('sourceUrl'), 'updated': b.get('pageUpdated'), 'comment': (b.get('comment') or '')[:200],
                   'skills': [{'skill': skill_name(k.get('skill')), 'lv': k.get('lv')} for k in b.get('skills') or [] if k.get('skill')],
                   'weapon': wname}
            if key in merged:
                m = merged[key]
                if not any(r['source'] == ref['source'] and r['label'] == ref['label'] and r['url'] == ref['url'] for r in m['refs']):
                    m['refs'].append(ref)
                if wname and not any(x['name'] == wname for x in m['weapons']):
                    m['weapons'].append({'name': wname, 'known': bool(w)})
                if not m['weapon'] or 'raw' in m['weapon']:
                    if w: m['weapon'] = {'name': w['name']}
                continue
            merged[key] = {
                'id': f'b{len(merged) + 1:03d}', 'charId': b.get('charId'), 'charName': b.get('charName'),
                'weaponType': b.get('weaponType') or (w or {}).get('type'), 'element': el,
                'weapon': {'name': w['name']} if w else ({'raw': b.get('weapon')} if b.get('weapon') else None),
                'pieces': pieces, 'refs': [ref],
                'weapons': [{'name': wname, 'known': bool(w)}] if wname else [],
            }
    builds = list(merged.values())
    # 同じ会社のサイト（Game8 と英語版 game8.co、GameWith と gamewith.ai）は1つと数える
    family = {'game8.co': 'Game8', 'gamewith.ai': 'GameWith'}
    for b in builds:
        b['sourceCount'] = len({family.get(r['source'], r['source']) for r in b['refs']})
    out = {'updated': datetime.date.today().isoformat(), 'builds': builds,
           'unresolved': [{'name': k, 'count': v} for k, v in unresolved.most_common()]}
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding='utf-8')
    by_char = collections.Counter(b['charId'] for b in builds)
    print(f'構成DB: 入力 {n_in} 件 → {len(builds)} 構成（複数サイト一致 {sum(1 for b in builds if b["sourceCount"] > 1)}）')
    print('  キャラ別', dict(by_char))
    print('  除外', dict(skipped))
    print('  サイト別', dict(collections.Counter(r['source'] for b in builds for r in b['refs'])))
    if unresolved:
        print('  突き合わせられなかった名前:')
        for k, v in unresolved.most_common(40):
            print('   ', k, v)


if __name__ == '__main__':
    main()
