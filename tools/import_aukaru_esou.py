#!/usr/bin/env python3
"""アウかるの絵装データを data/esou.json にする。

使い方:
  curl -o catalog.json 'https://mhnowcalc.com/mhocalc/equip-optimizer-auto.php?lang=ja&esou_catalog=1'
  python3 tools/import_aukaru_esou.py catalog.json 2026-11-28

入れるのはレジェンド（品質4）だけ。サブステータスは Lv10 の一番いい値。
筆入れ（Lv2・4・6・8・10 の追加効果）は入れていない。

ルール（アウかるの計算と同じ）:
  - 付けられるのは5枚、コストの合計は12まで（アウかるも「コスト上限は未検証」としている）
  - 1枠目がコア。固有効果はコアに置いたときだけ効く
  - セット効果は、コアを2枚分に数える（百錬の証「百戦錬磨の師範」のあと）。同じ絵柄は1回だけ数える
  - 届いた段階の効果はぜんぶ足す（4セットなら2セットの効果も付く）

発動率（RATES・CORE_RULES）はこのサイトの見積もり。アウかるはセットの条件つき効果を 0% から自分で入れる作りなので、
ここでは属性の4セットがふつうに回る前提の値を置いている。
"""
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
EL = {'fire': '火', 'water': '水', 'thunder': '雷', 'ice': '氷', 'dragon': '龍', 'all': '全'}
FIELD = {'elementBonus': 'U', 'affinity': 'A', 'damageBonus': 'D', 'physicalBonus': 'P'}

# セットの条件つき効果の発動率（段階の key → 効果が乗っている時間の割合。重ねがけは最大まで重ねた値に対する割合）
RATES = {
    'esou-set:3002': (0.95, '会心が1回出れば60秒続く'),                    # 猛力4
    'esou-set:3004': (0.85, '弱点に当てるたびに20秒'),                      # 灼炎4
    'esou-set:3006': (0.75, 'メンバーの奥義のたびに1段（60秒）。4段のうち3段を保つとみる'),  # 水御4
    'esou-set:3008': (0.9, '当て続ければ5段を保てる（12秒）'),              # 湧雷4
    'esou-set:3018': (0.75, '自分の奥義のあと60秒'),                        # 破竜4
    'esou-set:3022': (0.95, '当てるたびに8秒'),                             # 氷霜4
    'esou-set:3024': (0.2, '制圧している時間を2割とみる'),                  # 嵐威2
}
# 条件つきの固有効果を、キャラのモデル（characters.json の modelSkills）のどの値で見積もるか。
#   skills: この中にキャラが持っているスキルがあれば、その発動率×割合のいちばん高いものを使う
#   scale: それに掛ける数（クールタイムで半分しか乗らない、など）
#   weapons: この武器種なら rate をそのまま使う
#   chars: キャラを名指しで決める（攻略サイトがそのキャラに勧めているもの）
CORE_RULES = {
    '絵装・クシャルダオラ': {'rate': 0.5, 'why': '破壊済みの部位に当たっている時間を半分とみる'},
    '絵装・融光種ドスジャグラス': {'skills': ['弁当好き'], 'why': 'こんがり肉を食べたあと45秒'},
    '絵装・融光種クルルヤック': {'skills': ['連撃強化'], 'scale': 0.5, 'why': '10秒続いてクールタイム20秒'},
    '絵装・融光種オドガロン': {'skills': ['連撃強化'], 'why': '連撃が出ている間'},
    '絵装・融光種ドスギルオス': {'skills': ['連撃強化'], 'why': '連撃が出ている間'},
    '絵装・融光種プケプケ': {'weapons': {'チャージアックス': 0.8}, 'why': 'ビンを使うスキルのあと45秒'},
    '絵装・融光種ボルボロス': {'skills': ['溜め強化', '溜め強射'], 'why': '溜めが最高段階になってから45秒'},
    '絵装・融光種アンジャナフ': {'skills': ['溜め強化', '溜め強射'], 'why': '溜めスキルで攻撃している間'},
    '絵装・融光種リオレウス': {'skills': ['溜め強化', '溜め強射'], 'why': '溜めスキルのあと15秒'},
    '絵装・融光種ラドバルキン': {'skills': ['溜め強化', '溜め強射'], 'why': '溜めスキルのあと15秒'},
    '絵装・融光種パオウルムー': {'skills': ['滞空'], 'why': '滞空している間'},
    '絵装・融光種レイギエナ': {'skills': ['滞空'], 'why': '滞空している間'},
    '絵装・融光種トビカガチ': {'skills': ['一撃貫通'], 'why': '貫通ダメージを与えている間'},
    '絵装・融光種リオレイア': {'chars': {'midori': 0.8}, 'why': '裂破ダメージのあと20秒（Game8 がミドリに推奨）'},
    '絵装・融光種ツィツィヤック': {'weapons': {'ハンマー': 0.3}, 'why': 'めまいを取ってから30秒、クールタイム60秒'},
    '絵装・融光種ディアブロス': {'why': '剛猛が出るキャラが分からないので数えない'},
}


def effects(src):
    out = []
    for e in src or []:
        f = FIELD.get(e.get('field'))
        if not f or e.get('scope'):  # 控えにいるときの奥義だけに乗る効果は数えない
            continue
        w = e.get('weaponElement')
        if w == 'none':  # 属性の無い武器だけ
            continue
        x = {'f': f, 'v': e['value']}
        if e.get('element') in EL and f == 'U':
            x['el'] = EL[e['element']]
        if w:
            x['el'] = EL[w]
        if e.get('conditional'):
            x['cond'] = True
            if e.get('maxStacks'):
                x['v'] = e['value'] * e['maxStacks']
        out.append(x)
    return out


def main():
    src, date = sys.argv[1], sys.argv[2]
    cat = json.load(open(src, encoding='utf-8'))
    sets = {}
    for sid, s in cat['esouSets'].items():
        stages = []
        for st in s['stages']:
            ef = effects(st.get('effects'))
            row = {'count': st['count'], 'text': st['description'].replace('\n', ''), 'effects': ef}
            if st['key'] in RATES and any(e.get('cond') for e in ef):
                row['rate'], row['why'] = RATES[st['key']]
            stages.append(row)
        sets[sid] = {'name': s['name'], 'stages': stages}
    cards = []
    for c in cat['charms']:
        if c['quality'] != 4:
            continue
        sub = {}
        for o in c['mainSlots'][0]['options']:
            k = FIELD.get(o['field'])
            if k in ('U', 'A'):
                sub[k] = max(o['values'])
        row = {'name': c['name'], 'cost': c['cost'], 'art': str(c['archetype']), 'sets': c['sets'], 'slots': len(c['mainSlots']), 'sub': sub}
        p = c.get('primary') or {}
        if p.get('description'):
            row['core'] = {'text': p['description'], 'effects': effects(p.get('effects'))}
            if 'シーズン限定' in p['description']:
                row['season'] = 'S0'
            rule = CORE_RULES.get(c['name'])
            if rule:
                row['core']['rule'] = rule
        cards.append(row)
    out = {
        'source': 'アウかる（mhnowcalc.com/mhocalc）の絵装データ', 'sourceVersion': cat.get('version'), 'fetchedAt': date,
        'costLimit': 12, 'slots': 5, 'coreCount': 2, 'sets': sets, 'cards': cards,
    }
    dst = ROOT / 'data' / 'esou.json'
    dst.write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    print(f'{dst}: セット {len(sets)}・絵装 {len(cards)}（コスト別 { {k: sum(1 for c in cards if c["cost"] == k) for k in (1, 3, 4)} }）')
    missing = [n for n in CORE_RULES if not any(c['name'] == n for c in cards)]
    if missing:
        print('  CORE_RULES にあるのにデータに無い:', missing)
    cond = [c['name'] for c in cards if c.get('core') and any(e.get('cond') for e in c['core']['effects']) and 'rule' not in c['core']]
    if cond:
        print('  条件つきの固有効果なのに見積もりが無い:', cond)


if __name__ == '__main__':
    main()
