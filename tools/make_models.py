#!/usr/bin/env python3
"""キャラごとのダメージモデル（models.json）を書き出す。

モデルの考え方：
  倍率 = Π(1 + 効果% × 発動している割合(uptime) × 乗るダメージの割合(share))
  属性ダメージUP は「属性ダメージの割合(elementShare)」にだけ乗る
  会心率+X% は「1%あたりの期待ダメージ増(critPerPct)」に換算（会心倍率1.25想定で0.25%、主人公・ミドリはコアパッシブで+0.25%）
  属性攻撃力+N はキャラの属性攻撃力(weaponElement≒ランク40台で600想定。コアパッシブの閾値1500から逆算)に対する割合 × elementShare
出典・想定は各スキルに書き、サイトの「狙うスキルと根拠」に表示する。
"""
import json, pathlib

OUT = pathlib.Path('/tmp/claude-0/-home-claude/094b7c7b-727a-5a9e-9d7d-7a958be863c9/scratchpad/data/models.json')

GW = 'GameWith'; G8 = 'Game8'; GR = 'Gamerch'; AL = 'アルテマ'; GAI = 'gamewith.ai'

def dmg(uptime, share=1.0, tier='S', lv=None, reason='', sources=(), assumption=''):
    return {'kind': 'dmg', 'uptime': uptime, 'share': share, 'tier': tier, 'targetLv': lv, 'reason': reason, 'sources': list(sources), 'assumption': assumption}
def elem(tier='S', lv=7, reason='属性ダメージ部分に乗る。融光種相手は効果が2倍以上', sources=(G8, GW), assumption='', core=0.0):
    # core: コアパッシブが「属性ダメージ1%→与ダメ+X%」のキャラは総ダメージにも乗る
    return {'kind': 'element', 'tier': tier, 'targetLv': lv, 'reason': reason, 'sources': list(sources), 'assumption': assumption, 'core': core}
def crit(uptime=1.0, tier='A', lv=None, reason='会心率UP', sources=(), assumption=''):
    return {'kind': 'crit', 'uptime': uptime, 'tier': tier, 'targetLv': lv, 'reason': reason, 'sources': list(sources), 'assumption': assumption}
def elemcrit(tier='B', lv=3, reason='会心時の属性ダメージUP', sources=(G8,), assumption='会心率30%想定'):
    return {'kind': 'elemCrit', 'tier': tier, 'targetLv': lv, 'reason': reason, 'sources': list(sources), 'assumption': assumption}
def proc(uptime, chance=0.75, tier='B', lv=None, reason='', sources=(), assumption=''):
    return {'kind': 'proc', 'uptime': uptime, 'chance': chance, 'tier': tier, 'targetLv': lv, 'reason': reason, 'sources': list(sources), 'assumption': assumption}
def tiny(reason='快適スキル（火力には直接乗らない）', sources=()):
    return {'kind': 'flat', 'value': 0.02, 'tier': 'C', 'targetLv': 1, 'reason': reason, 'sources': list(sources), 'assumption': '同点のときだけ優先', 'fallback': 0.2}

CRIT_HERO = 0.005   # 会心倍率1.25（Game8 EN明記）+ コアパッシブ(会心率1%→+0.25%、上限22.5%)
CRIT_BASE = 0.0025  # 会心倍率1.25のみ

def hero_common():
    return {
        '{属性}属性ダメージUP': elem(reason='主人公は属性特化前提なので武器属性のダメージUPが軸。Game8終盤は全武器でLv7', sources=(G8, GW, GR)),
        '洞察': crit(1.0, 'A', 3, '会心率UP。主人公はコアパッシブで会心率1%が与ダメ+0.25%になる', (GW, G8, GR), '会心率1%＝期待ダメージ+0.5%'),
        '弱点攻撃': crit(0.65, 'A', 3, '弱点部位を攻撃したときの会心率UP', (G8, GW), '弱点部位に当てる割合65%'),
        '会心撃【属性】': elemcrit(),
    }

models = {}

models['hero_hbg'] = {
    'name': '主人公（ヘビィ）', 'weapon': 'ヘビィボウガン',
    'note': '機関竜弾（50発の連射）と通常弾・徹甲榴弾が主力。4サイト中3サイトが主人公最強武器種SS。属性特化が乗る属性武器で使う前提。',
    'sources': [{'title': 'GameWith ヘビィ最強装備', 'url': 'https://gamewith.jp/mhoutlanders/584348'}, {'title': 'Game8 主人公(ヘビィ)', 'url': 'https://game8.jp/mhoutlanders/785410'}, {'title': 'Gamerch 主人公', 'url': 'https://gamerch.com/mho'}, {'title': 'アルテマ', 'url': 'https://altema.jp/'}],
    'model': {'elementShare': 0.35, 'weaponElement': 600, 'critPerPct': CRIT_HERO, 'critRate': 0.3, 'skills': {
        **hero_common(),
        'リロード強化': dmg(0.8, 1.0, 'S', 7, 'リロード後30秒 与ダメUP。ヘビィはリロード頻度が高くジャストガードでも更新されるのでほぼ常時', (G8, GW, GR), '発動率80%'),
        '連撃強化': dmg(0.75, 1.0, 'S', 7, '3秒以内5ヒットで与ダメUP。機関竜弾中は確実に維持できる（貫通弾・斬裂弾では不発）', (G8,), '発動率75%'),
        '弩弾強化': dmg(1.0, 0.45, 'A', 4, '通常弾・散弾・貫通弾のダメージUP。機関竜弾・強力弾には乗らない', (GR, GW), '通常弾系が総ダメージの45%'),
        '闘志': crit(0.5, 'B', 3, '怒り時の会心率UP', (GW, GR, AL), '怒り中50%'),
        'ポテンシャル解放': crit(0.65, 'B', 3, '開始90秒後から会心率UP', (GW,), '狩猟時間の65%'),
        '弱点追撃': proc(0.5, 0.75, 'B', 3, '破壊済み部位への追加ダメージ', (G8,), '破壊済み部位を狙う割合50%'),
        '徹底追撃': dmg(0.4, 1.0, 'B', 3, 'のけぞり・制圧後15秒 与ダメUP', (G8, GW), '発動率40%'),
        '防御反撃': dmg(0.3, 1.0, 'C', 3, 'ジャストガード後30秒 与ダメUP', (GW,), '発動率30%'),
        'ガードテクニック': tiny('ガードのけぞり軽減。快適', (G8, GW, GR)),
    }},
}

models['hero_ls'] = {
    'name': '主人公（太刀）', 'weapon': '太刀',
    'note': '気刃兜割ループと居合抜刀が主力。練気ゲージ上げが前提なので「練気をまといし刃」は全サイト採用。',
    'sources': [{'title': 'GameWith 太刀最強装備', 'url': 'https://gamewith.jp/mhoutlanders/584269'}, {'title': 'Game8 主人公(太刀)', 'url': 'https://game8.jp/mhoutlanders/785412'}],
    'model': {'elementShare': 0.35, 'weaponElement': 600, 'critPerPct': CRIT_HERO, 'critRate': 0.3, 'skills': {
        **hero_common(),
        '練気をまといし刃': dmg(0.8, 1.0, 'S', 4, '練気ゲージ段階上昇で30秒 与ダメUP。太刀の立ち回りで常時更新しやすい', (GW, G8, GR, AL, GAI), '発動率80%'),
        '抜刀一閃': dmg(0.6, 1.0, 'S', 7, '抜刀攻撃後30秒 与ダメUP。特殊納刀→居合抜刀を繰り返せば高稼働', (GW, GR, AL), '発動率60%'),
        '回避強化': dmg(0.5, 1.0, 'A', 7, 'ジャスト回避後20秒 与ダメUP。見切り斬り主体なら高稼働', (G8, GW), '発動率50%'),
        '連撃強化': dmg(0.5, 1.0, 'A', 7, '兜割ループ中は維持できる', (GW, G8, GR), '発動率50%'),
        '本気': tiny('攻撃が弾かれなくなる', (G8,)),
    }},
}

models['hero_gs'] = {
    'name': '主人公（大剣）', 'weapon': '大剣',
    'note': '真・溜め斬り〜本気斬りが主力。溜め強化は5サイト全てが採用。',
    'sources': [{'title': 'GameWith 大剣最強装備', 'url': 'https://gamewith.jp/mhoutlanders/584088'}, {'title': 'Game8 主人公(大剣)', 'url': 'https://game8.jp/mhoutlanders/785407'}],
    'model': {'elementShare': 0.3, 'weaponElement': 600, 'critPerPct': CRIT_HERO, 'critRate': 0.3, 'skills': {
        **hero_common(),
        '溜め強化': dmg(0.8, 1.0, 'S', 7, '溜め攻撃命中で15秒 与ダメUP。大剣は溜め斬りが主軸なのでほぼ常時', (GW, G8, GR, AL, GAI), '発動率80%'),
        '破砕': dmg(0.65, 1.0, 'A', 4, '大剣でひるませる／部位破壊で60秒 与ダメUP（GameWith表記は破撃）', (GW, G8, GR), '発動率65%'),
        '剛勢': dmg(0.4, 1.0, 'B', 7, 'タックル中の被弾（剛猛）後30秒 与ダメUP', (GW, G8), '発動率40%'),
        '弱点追撃': proc(0.5, 0.75, 'B', 3, '破壊済み部位への追加ダメージ', (G8, GW, GR), '破壊済み部位を狙う割合50%'),
        '破壊王': tiny('部位破壊しやすくなる（破砕の発動補助）', (GW, G8)),
    }},
}

models['hero_db'] = {
    'name': '主人公（双剣）', 'weapon': '双剣',
    'note': '鬼人化中の乱舞が主力。手数が多いので連撃強化はどのコンボでも発動。',
    'sources': [{'title': 'GameWith 双剣最強装備', 'url': 'https://gamewith.jp/mhoutlanders/584255'}, {'title': 'Game8 主人公(双剣)', 'url': 'https://game8.jp/mhoutlanders/785408'}],
    'model': {'elementShare': 0.4, 'weaponElement': 600, 'critPerPct': CRIT_HERO, 'critRate': 0.3, 'skills': {
        **hero_common(),
        '連撃強化': dmg(0.9, 1.0, 'S', 7, '3秒以内5ヒットで与ダメUP。双剣は常時発動', (GW, G8, GR), '発動率90%'),
        '鬼人の修羅': dmg(0.6, 1.0, 'S', 4, '鬼人化中 与ダメUP＋属性攻撃力+25', (GW, GR, G8, AL), '鬼人化中60%'),
        '本気': tiny('攻撃が弾かれなくなる', (G8, GR)),
    }},
}

models['hero_lance'] = {
    'name': '主人公（ランス）', 'weapon': 'ランス',
    'note': '溜めカウンター・突進・ジャストガード反撃が主力。',
    'sources': [{'title': 'GameWith ランス最強装備', 'url': 'https://gamewith.jp/mhoutlanders/584268'}, {'title': 'Game8 主人公(ランス)', 'url': 'https://game8.jp/mhoutlanders/785409'}],
    'model': {'elementShare': 0.35, 'weaponElement': 600, 'critPerPct': CRIT_HERO, 'critRate': 0.3, 'skills': {
        **hero_common(),
        '貫突': dmg(0.8, 1.0, 'S', 4, '同じ部位に8秒以内3回命中で30秒 与ダメUP。突きを当て続ければ常時更新', (GW, G8, GR), '発動率80%'),
        '防御反撃': dmg(0.55, 1.0, 'S', 7, 'ジャストガード成功後30秒 与ダメUP', (GW, G8, GR, AL), '発動率55%'),
        '溜め強化': dmg(0.45, 1.0, 'A', 7, '溜めカウンター命中で15秒 与ダメUP', (GW,), '発動率45%'),
        '闘志': crit(0.5, 'B', 3, '怒り時の会心率UP', (GW, GR, AL, G8), '怒り中50%'),
        '連撃強化': dmg(0.35, 1.0, 'C', 7, '溜め突進の連撃で発動できる', (), '発動率35%'),
        'ガードテクニック': tiny('ガードのけぞり軽減・スタミナ軽減', (GR, G8, GW)),
    }},
}

models['hero_hammer'] = {
    'name': '主人公（ハンマー）', 'weapon': 'ハンマー',
    'note': '溜め攻撃と叩きつけコンボが主力。頭を殴る武器なので気絶値関連の威震も乗る。',
    'sources': [{'title': 'GameWith ハンマー最強装備', 'url': 'https://gamewith.jp/mhoutlanders/584350'}, {'title': 'Game8 主人公(ハンマー)', 'url': 'https://game8.jp/mhoutlanders/833436'}],
    'model': {'elementShare': 0.3, 'weaponElement': 600, 'critPerPct': CRIT_HERO, 'critRate': 0.3, 'skills': {
        **hero_common(),
        '溜め強化': dmg(0.8, 1.0, 'S', 7, '溜め攻撃命中で15秒 与ダメUP。ハンマーは溜めが主軸', (GW, G8, GR, GAI), '発動率80%'),
        '気力変換': dmg(1.0, 0.7, 'A', 7, 'スタミナを消費する攻撃の与ダメUP（溜め・剛攻撃）', (GW, G8), 'スタミナ消費攻撃が総ダメージの70%'),
        '威震': dmg(0.6, 1.0, 'A', 4, '打撃で気絶値を蓄積すると15秒 与ダメUP', (GR, GW), '発動率60%'),
        '破壊王': tiny('部位破壊しやすくなる', (GW, GR)),
    }},
}

models['hero_cb'] = {
    'name': '主人公（チャアク）', 'weapon': 'チャージアックス',
    'note': '斧強化状態の斧モード連続攻撃と超高出力が主力。変形強化は5サイト全て採用。',
    'sources': [{'title': 'GameWith チャアク最強装備', 'url': 'https://gamewith.jp/mhoutlanders/584349'}, {'title': 'Game8 主人公(チャアク)', 'url': 'https://game8.jp/mhoutlanders/833437'}],
    'model': {'elementShare': 0.35, 'weaponElement': 600, 'critPerPct': CRIT_HERO, 'critRate': 0.3, 'skills': {
        **hero_common(),
        '変形強化': dmg(0.9, 1.0, 'S', 4, '武器変形で60秒 与ダメUP＋属性攻撃力+25。60秒以内に変形し続ければ常時', (GW, G8, GR, AL, GAI), '発動率90%'),
        'チャージ準備': dmg(0.5, 1.0, 'A', 7, 'スタミナ満タンを5秒維持で与ダメUP。チャアクはスタミナ消費が少ない（Gamerchのみ採用）', (GR,), '発動率50%'),
        '連撃強化': dmg(0.5, 1.0, 'A', 7, '斧強化状態の斧モードで条件を満たせる', (GW,), '発動率50%'),
        '徹底追撃': dmg(0.4, 1.0, 'B', 3, 'のけぞり・制圧後15秒 与ダメUP', (G8, GW, GR), '発動率40%'),
        '高圧ガード': tiny('融光種狂暴化時の防御UP', (GW,)),
    }},
}

models['hero_bow'] = {
    'name': '主人公（弓）', 'weapon': '弓',
    'note': '剛射・溜め射撃・千竜追射が主力。弓スキル強化は条件なしで常時。',
    'sources': [{'title': 'GameWith 弓最強装備', 'url': 'https://gamewith.jp/mhoutlanders/584347'}, {'title': 'Game8 主人公(弓)', 'url': 'https://game8.jp/mhoutlanders/785411'}],
    'model': {'elementShare': 0.4, 'weaponElement': 600, 'critPerPct': CRIT_HERO, 'critRate': 0.3, 'skills': {
        **hero_common(),
        '弓スキル強化': dmg(1.0, 0.7, 'S', 4, '弓のスキル1〜3のダメージUP（常時）', (GW, G8, GR), 'スキル攻撃が総ダメージの70%'),
        '溜め強射': dmg(0.75, 1.0, 'S', 7, '溜め段階を維持している間 与ダメUP', (GR, GW, AL, G8, GAI), '発動率75%'),
        '気力変換': dmg(1.0, 0.85, 'A', 7, 'スタミナ消費攻撃の与ダメUP。弓はほぼ全行動が対象', (GW, GR), 'スタミナ消費攻撃が総ダメージの85%'),
        '一撃貫通': dmg(1.0, 0.25, 'B', 7, '貫通矢（千竜追射など）の与ダメUP', (G8,), '貫通矢が総ダメージの25%'),
        '連撃強化': dmg(0.5, 1.0, 'B', 7, '連射・曲射の多段ヒット（連撃ダメージ）で発動できる。貫通矢では不発', (), '発動率50%（要検証）'),
        '無垢': dmg(0.4, 1.0, 'B', 3, '体力満タン時 与ダメUP', (GW, G8), '満タン維持40%'),
        'ポテンシャル解放': crit(0.65, 'B', 3, '開始90秒後から会心率UP', (GW, G8, GR), '狩猟時間の65%'),
        '弾導強化': tiny('最大威力になる距離が短くなる（快適）', (GW, G8, AL)),
    }},
}

# ---------------- 固有キャラ ----------------
models['pepe'] = {
    'name': 'ペペ', 'weapon': 'ヘビィボウガン', 'element': '水', 'type': '巧作', 'rarity': 'SSR',
    'note': '全弾が散弾扱い。滞空中の火力マシマシ（135%）・スカイバースト（75%）が主力。コアパッシブで水属性ダメージ1%につき敵の被ダメ+0.15%（上限15%）。',
    'sources': [{'title': 'Game8 ペペ', 'url': 'https://game8.jp/mhoutlanders/784185'}, {'title': 'GameWith ペペ', 'url': 'https://gamewith.jp/mhoutlanders/561564'}, {'title': 'Game8 滞空', 'url': 'https://game8.jp/mhoutlanders/838933'}],
    'model': {'elementShare': 0.4, 'weaponElement': 600, 'critPerPct': CRIT_BASE, 'critRate': 0.2, 'skills': {
        '滞空': dmg(0.9, 1.0, 'S', 7, '滞空攻撃すべて（火力マシマシ・スカイバースト・プランジスマッシュ）に乗る', (G8, GW, AL), '滞空中90%'),
        '連撃強化': dmg(0.8, 1.0, 'S', 7, '散弾の連続ヒットで3秒5ヒットを簡単に満たせる。GameWith「滞空よりも連撃強化がペペにとって維持しやすい」', (GW,), '発動率80%'),
        '弩弾強化': dmg(1.0, 0.65, 'S', 4, '通常弾・散弾・貫通弾のダメージUP。射撃と火力マシマシに乗り、スカイバーストには乗らない', (G8, GW), '散弾系が総ダメージの65%'),
        '水属性ダメージUP': elem(reason='属性分に乗る。コアパッシブで水属性ダメージ1%→奥義で制圧した相手の被ダメ+0.15%（15秒）', sources=(G8, GW, AL, 'game8.co'), core=0.08),
        '洞察': crit(1.0, 'A', 3, '会心率UP', (GW,), '会心率1%＝期待ダメージ+0.25%'),
        '弱点攻撃': crit(0.6, 'B', 3, '弱点部位での会心率UP', (G8,), '弱点部位60%'),
        '会心撃【属性】': elemcrit(),
        '弾導強化': tiny('散弾は近いほど全弾当たる。快適', (G8,)),
    }},
}

models['midori'] = {
    'name': 'ミドリ', 'weapon': '太刀', 'element': '火', 'type': '極撃', 'rarity': 'SSR',
    'note': '練気ゲージを上げて兜割で殴る火属性太刀。コアパッシブで会心率1%→与ダメ+0.25%（上限22.5%）。',
    'sources': [{'title': 'Game8 ミドリ', 'url': 'https://game8.jp/mhoutlanders/784183'}, {'title': 'GameWith ミドリ', 'url': 'https://gamewith.jp/mhoutlanders/577465'}],
    'model': {'elementShare': 0.4, 'weaponElement': 600, 'critPerPct': CRIT_HERO, 'critRate': 0.35, 'skills': {
        '火属性ダメージUP': elem(reason='最重要。序盤Lv3→終盤Lv7', sources=(G8, GW)),
        '練気をまといし刃': dmg(0.8, 1.0, 'S', 4, '練気ゲージ段階上昇で30秒 与ダメUP', (G8, GW), '発動率80%'),
        '抜刀一閃': dmg(0.6, 1.0, 'A', 7, '抜刀攻撃後30秒 与ダメUP。スキル3後に納刀するので再発動が容易', (GW, GR), '発動率60%'),
        '回避強化': dmg(0.5, 1.0, 'A', 7, 'ジャスト回避後20秒 与ダメUP', (GW,), '発動率50%'),
        '洞察': crit(1.0, 'A', 3, '会心率UP。コアパッシブで会心率がそのまま火力', (G8, GW), '会心率1%＝期待ダメージ+0.5%'),
        '弱点攻撃': crit(0.65, 'A', 3, '弱点部位での会心率UP', (G8,), '弱点部位65%'),
        '狩人の第六感': dmg(0.3, 1.0, 'B', 3, 'フィールドの罠使用後120秒 与ダメUP', (G8,), '発動率30%'),
        '本気': tiny('攻撃が弾かれなくなる', (G8,)),
    }},
}

models['luca'] = {
    'name': 'ルカ', 'weapon': '弓', 'element': '雷', 'type': '極撃', 'rarity': 'SSR',
    'note': '貫通矢主体の雷弓。コアパッシブで雷属性ダメージ1%→与ダメ+0.2%（上限22.5%）。貫通矢なので連撃強化は不発。',
    'sources': [{'title': 'Game8 ルカ', 'url': 'https://game8.jp/mhoutlanders/784187'}],
    'model': {'elementShare': 0.45, 'weaponElement': 600, 'critPerPct': CRIT_BASE, 'critRate': 0.3, 'skills': {
        '雷属性ダメージUP': elem(reason='コアパッシブで雷属性ダメージ1%→与ダメ+0.2%（上限22.5%）なので最優先', sources=(G8, GW, 'game8.co'), core=0.2),
        '弓スキル強化': dmg(1.0, 0.7, 'S', 4, '弓のスキル1〜3のダメージUP（常時）', (G8, GW), 'スキル攻撃が総ダメージの70%'),
        '一撃貫通': dmg(1.0, 0.5, 'A', 7, '貫通矢の与ダメUP。ルカは全ての矢が貫通（固有特性）。ただしどの攻略サイトも採用例なし＝要検証', (), '貫通矢が総ダメージの50%（要検証）'),
        '溜め強射': dmg(0.7, 1.0, 'A', 7, '溜め段階維持中 与ダメUP', (GW,), '発動率70%'),
        '気力変換': dmg(1.0, 0.85, 'A', 7, 'スタミナ消費攻撃の与ダメUP', (GW,), 'スタミナ消費攻撃85%'),
        '無垢': dmg(0.4, 1.0, 'B', 3, '体力満タン時 与ダメUP', (G8,), '満タン維持40%'),
        '会心撃【属性】': elemcrit(),
        '弾導強化': tiny('適正距離を伸ばす快適スキル', (GW,)),
    }},
}

models['cless'] = {
    'name': 'クレス', 'weapon': '双剣', 'element': '龍', 'type': '巧作', 'rarity': 'SSR',
    'note': '鬼人化中の乱舞で殴る龍属性双剣。固有特性で弱点部位の龍ダメージ+40%。コアパッシブで会心率1%→骨棘付きモンスターの被ダメ+0.2%（上限15%）。',
    'sources': [{'title': 'Game8 クレス', 'url': 'https://game8.jp/mhoutlanders/784186'}, {'title': 'GameWith クレス', 'url': 'https://gamewith.jp/mhoutlanders/559700'}],
    'model': {'elementShare': 0.4, 'weaponElement': 600, 'critPerPct': 0.0035, 'critRate': 0.3, 'skills': {
        '連撃強化': dmg(0.9, 1.0, 'S', 7, '双剣は常時発動', (G8, GW), '発動率90%'),
        '龍属性ダメージUP': elem(sources=(G8, GW)),
        '鬼人の修羅': dmg(0.6, 1.0, 'A', 4, '鬼人化中 与ダメUP', (G8, GW), '鬼人化中60%'),
        '弱点攻撃': crit(0.7, 'A', 3, '弱点部位での会心率UP。固有特性と相性', (G8,), '弱点部位70%'),
        '洞察': crit(1.0, 'B', 3, '会心率UP', (G8,), '会心率1%＝期待ダメージ+0.25%'),
        '会心撃【属性】': elemcrit(),
        '本気': tiny('攻撃が弾かれなくなる', (G8,)),
    }},
}

models['ensho'] = {
    'name': 'エンショウ', 'weapon': '大剣', 'element': '龍', 'type': '極撃', 'rarity': 'SSR',
    'note': '溜め斬りが主力の龍属性大剣。コアパッシブは属性ダメージ連動。',
    'sources': [{'title': 'Game8 エンショウ', 'url': 'https://game8.jp/mhoutlanders/784188'}],
    'model': {'elementShare': 0.35, 'weaponElement': 600, 'critPerPct': CRIT_BASE, 'critRate': 0.3, 'skills': {
        '溜め強化': dmg(0.8, 1.0, 'S', 7, '溜め攻撃命中で15秒 与ダメUP', (G8, GW), '発動率80%'),
        '龍属性ダメージUP': elem(reason='コアパッシブで龍属性ダメージ1%→与ダメ+0.2%', sources=(G8, GW, 'game8.co'), core=0.2),
        '剛勢': dmg(0.5, 1.0, 'A', 7, '剛猛発動後30秒 与ダメUP。被弾前提の立ち回りなので主人公より高稼働（Game8終盤Lv5）', (G8, GW, AL), '発動率50%'),
        '滞空': dmg(1.0, 0.3, 'B', 7, '真・不屈狂斬り（509%）が滞空攻撃なら乗る。どの攻略サイトも未採用＝要検証', (), '滞空攻撃が総ダメージの30%（要検証）'),
        '破砕': dmg(0.6, 1.0, 'A', 4, 'ひるみ・部位破壊で60秒 与ダメUP', (GW,), '発動率60%'),
        '弱点追撃': proc(0.5, 0.75, 'B', 3, '破壊済み部位への追加ダメージ', (G8,), '破壊済み部位50%'),
        '闘志': crit(0.5, 'B', 3, '怒り時の会心率UP', (G8,), '怒り中50%'),
        '破壊王': tiny('部位破壊しやすくなる', (G8,)),
    }},
}

models['akenia'] = {
    'name': 'アケニア', 'weapon': 'ランス', 'element': '龍', 'type': '支援', 'rarity': 'SSR',
    'note': 'ジャストガード反撃が主力の龍属性ランス。コアパッシブのシールド・会心バフは龍属性ダメージ連動。',
    'sources': [{'title': 'Game8 アケニア', 'url': 'https://game8.jp/mhoutlanders/784189'}],
    'model': {'elementShare': 0.35, 'weaponElement': 600, 'critPerPct': CRIT_BASE, 'critRate': 0.3, 'skills': {
        '龍属性ダメージUP': elem(sources=(G8, GW)),
        '防御反撃': dmg(0.6, 1.0, 'S', 7, 'ジャストガード後30秒 与ダメUP', (G8, GW), '発動率60%'),
        '貫突': dmg(0.6, 1.0, 'A', 4, '同部位連続命中で30秒 与ダメUP', (G8, GW), '発動率60%'),
        '闘志': crit(0.5, 'B', 3, '怒り時の会心率UP', (G8,), '怒り中50%'),
        '剛勢': dmg(0.3, 1.0, 'B', 7, '剛猛後30秒 与ダメUP', (G8,), '発動率30%'),
        '会心撃【属性】': elemcrit(),
        'ガードテクニック': tiny('ガードのけぞり軽減', (G8,)),
    }},
}

models['lord'] = {
    'name': 'ロード', 'weapon': 'ハンマー', 'element': '氷', 'type': '極撃', 'rarity': 'SSR',
    'note': '溜め攻撃主体の氷属性ハンマー。',
    'sources': [{'title': 'Game8 ロード', 'url': 'https://game8.jp/mhoutlanders/833427'}],
    'model': {'elementShare': 0.3, 'weaponElement': 600, 'critPerPct': CRIT_BASE, 'critRate': 0.3, 'skills': {
        '溜め強化': dmg(0.8, 1.0, 'S', 7, '溜め攻撃命中で15秒 与ダメUP', (G8, GW), '発動率80%'),
        '氷属性ダメージUP': elem(reason='コアパッシブで氷属性ダメージ1%→与ダメ+0.2%', sources=(G8, GW, 'game8.co'), core=0.2),
        '気力変換': dmg(1.0, 0.7, 'A', 7, 'スタミナ消費攻撃の与ダメUP', (G8,), 'スタミナ消費攻撃70%'),
        '威震': dmg(0.6, 1.0, 'A', 4, '気絶値蓄積で15秒 与ダメUP', (G8,), '発動率60%'),
        'ポテンシャル解放': crit(0.65, 'B', 3, '開始90秒後から会心率UP', (G8,), '狩猟時間の65%'),
        '徹底追撃': dmg(0.4, 1.0, 'B', 3, 'スタン後15秒 与ダメUP', (G8, 'game8.co'), '発動率40%'),
        '破壊王': tiny('部位破壊しやすくなる', (G8, GW, GR)),
    }},
}

models['haze'] = {
    'name': 'ヘイズ', 'weapon': '双剣', 'element': '雷', 'type': '支援', 'rarity': 'SSR',
    'note': '雷属性双剣。攻略サイトに装備記事が少なく、双剣共通の推奨をベースにしている。',
    'sources': [{'title': 'Game8 ヘイズ', 'url': 'https://game8.jp/mhoutlanders/833873'}, {'title': 'アルテマ', 'url': 'https://altema.jp/'}],
    'model': {'elementShare': 0.35, 'weaponElement': 600, 'critPerPct': CRIT_BASE, 'critRate': 0.3, 'skills': {
        '連撃強化': dmg(0.9, 1.0, 'S', 7, '双剣は常時発動', (GW,), '発動率90%'),
        '雷属性ダメージUP': elem(sources=(AL, GW)),
        '回避強化': dmg(0.5, 1.0, 'A', 4, '相殺（カウンター）で発動する与ダメUP。相殺を繰り返す立ち回りなら高稼働', ('game8.co', GR), '発動率50%'),
        '鬼人の修羅': dmg(0.35, 1.0, 'B', 4, '鬼人化中 与ダメUP。鬼人強化中に乗るかは不明（要検証）', (GW, GR), '鬼人化中35%（要検証）'),
        '洞察': crit(1.0, 'B', 3, '会心率UP', (AL, 'game8.co'), '会心率1%＝期待ダメージ+0.25%'),
        '徹底追撃': dmg(0.4, 1.0, 'B', 3, 'のけぞり・制圧後 与ダメUP', (AL,), '発動率40%'),
        '闘志': crit(0.5, 'B', 3, '怒り時の会心率UP', (AL,), '怒り中50%'),
        '無垢': dmg(0.4, 1.0, 'B', 3, '体力満タン時 与ダメUP', (), '満タン維持40%'),
    }},
}

models['raya'] = {
    'name': 'ラヤ', 'weapon': '双剣', 'element': '火', 'type': '巧作', 'rarity': 'SR',
    'note': '罠で拘束する火属性双剣。固有の連撃とも相性がいい。',
    'sources': [{'title': 'Game8 ラヤ', 'url': 'https://game8.jp/mhoutlanders/784193'}],
    'model': {'elementShare': 0.35, 'weaponElement': 600, 'critPerPct': CRIT_BASE, 'critRate': 0.3, 'skills': {
        '連撃強化': dmg(0.9, 1.0, 'S', 7, '双剣は常時発動', (GW,), '発動率90%'),
        '火属性ダメージUP': elem(sources=(G8, GW)),
        '鬼人の修羅': dmg(0.5, 1.0, 'A', 4, '鬼人化中 与ダメUP（ゲージ消費で解除）', (GW, G8, GR), '鬼人化中50%'),
        '回避強化': dmg(0.5, 1.0, 'A', 4, 'ジャスト回避後 与ダメUP', (GR,), '発動率50%'),
        '弱点追撃': proc(0.5, 0.75, 'B', 3, '破壊済み部位への追加ダメージ', (G8,), '破壊済み部位50%'),
        '洞察': crit(1.0, 'B', 3, '会心率UP', (), '会心率1%＝期待ダメージ+0.25%'),
        '本気': tiny('攻撃が弾かれなくなる', (G8,)),
    }},
}

models['madre'] = {
    'name': 'マドレ', 'weapon': '弓', 'element': '水', 'type': '支援', 'rarity': 'SR',
    'note': '回復支援もできる水属性弓。',
    'sources': [{'title': 'Game8 マドレ', 'url': 'https://game8.jp/mhoutlanders/784190'}],
    'model': {'elementShare': 0.4, 'weaponElement': 600, 'critPerPct': CRIT_BASE, 'critRate': 0.3, 'skills': {
        '弓スキル強化': dmg(1.0, 0.7, 'S', 4, '弓のスキル1〜3のダメージUP（常時）', (G8,), 'スキル攻撃70%'),
        '水属性ダメージUP': elem(sources=(G8, GW)),
        '溜め強射': dmg(0.6, 1.0, 'A', 7, '溜め段階維持中 与ダメUP', (GW,), '発動率60%'),
        '気力変換': dmg(1.0, 0.85, 'A', 7, 'スタミナ消費攻撃の与ダメUP', (GW,), 'スタミナ消費攻撃85%'),
        '無垢': dmg(0.4, 1.0, 'B', 3, '体力満タン時 与ダメUP', (G8,), '満タン維持40%'),
        '弾導強化': tiny('適正距離を伸ばす快適スキル', (G8,)),
    }},
}

models['folio'] = {
    'name': 'フォリオ', 'weapon': 'ランス', 'element': '水', 'type': '極撃', 'rarity': 'SR',
    'note': '同部位への連続突きが主力の水属性ランス。',
    'sources': [{'title': 'Game8 フォリオ', 'url': 'https://game8.jp/mhoutlanders/784194'}],
    'model': {'elementShare': 0.35, 'weaponElement': 600, 'critPerPct': CRIT_BASE, 'critRate': 0.3, 'skills': {
        '貫突': dmg(0.8, 1.0, 'S', 4, '同部位連続命中で30秒 与ダメUP', (G8, GW), '発動率80%'),
        '水属性ダメージUP': elem(reason='コアパッシブで水属性ダメージ1%→与ダメ+0.2%', sources=(G8, 'game8.co'), core=0.2),
        '溜め強化': dmg(0.45, 1.0, 'A', 7, 'スキル3の溜めに乗る', (GW,), '発動率45%'),
        '回避強化': dmg(0.5, 1.0, 'A', 7, 'ジャスト回避後 与ダメUP', (G8,), '発動率50%'),
        '連撃強化': dmg(0.4, 1.0, 'B', 7, '突きの連打で発動', (G8,), '発動率40%'),
        '防御反撃': dmg(0.4, 1.0, 'B', 7, 'ジャストガード後 与ダメUP', (), '発動率40%'),
        '闘志': crit(0.5, 'B', 3, '怒り時の会心率UP', (G8,), '怒り中50%'),
        '破壊王': tiny('部位破壊しやすくなる', (GW,)),
    }},
}

models['brix'] = {
    'name': 'ブリックス', 'weapon': '大剣', 'element': '雷', 'type': '巧作', 'rarity': 'SR',
    'note': 'ジャストガードとめまい制圧が強みの雷属性大剣。コアパッシブの被ダメ増は雷属性ダメージ連動。',
    'sources': [{'title': 'Game8 ブリックス', 'url': 'https://game8.jp/mhoutlanders/808772'}],
    'model': {'elementShare': 0.35, 'weaponElement': 600, 'critPerPct': CRIT_BASE, 'critRate': 0.3, 'skills': {
        '雷属性ダメージUP': elem(reason='固有特性（熱所持中 雷+40%）とコアパッシブ（雷属性ダメージ1%→めまい中の被ダメ+0.15%）が雷依存', sources=(G8, 'game8.co', AL), core=0.06),
        '防御反撃': dmg(0.5, 1.0, 'S', 7, 'ジャストガード後30秒 与ダメUP。ジャスガは熱エネルギー獲得手段でもある', (G8,), '発動率50%'),
        '溜め強化': dmg(0.35, 1.0, 'A', 7, '溜め攻撃命中で15秒 与ダメUP。熱エネルギー所持中は溜め斬りを使わないので低め', (GW, 'game8.co', GR), '発動率35%'),
        '破砕': dmg(0.5, 1.0, 'A', 4, 'ひるみ・部位破壊で60秒 与ダメUP', (GW,), '発動率50%'),
        '剛勢': dmg(0.3, 1.0, 'B', 7, '剛猛後30秒 与ダメUP', (GW,), '発動率30%'),
        '徹底追撃': dmg(0.5, 1.0, 'B', 3, 'めまい制圧後 与ダメUP。制圧が得意', (G8,), '発動率50%'),
        '会心撃【属性】': elemcrit(),
        '破壊王': tiny('部位破壊しやすくなる', (GW,)),
    }},
}

models['ryunosuke'] = {
    'name': 'リュウノスケ', 'weapon': '太刀', 'element': '火', 'type': '支援', 'rarity': 'SR',
    'note': '味方全体の火属性を上げる支援太刀。こんがり肉を食べるスキルがあるので弁当好きと相性がいい。',
    'sources': [{'title': 'Game8 リュウノスケ', 'url': 'https://game8.jp/mhoutlanders/808773'}],
    'model': {'elementShare': 0.35, 'weaponElement': 600, 'critPerPct': CRIT_BASE, 'critRate': 0.3, 'skills': {
        '火属性ダメージUP': elem(sources=(G8, GW)),
        '練気をまといし刃': dmg(0.75, 1.0, 'S', 4, '練気ゲージ段階上昇で与ダメUP', (G8, AL, GR), '発動率75%'),
        '弁当好き': dmg(0.6, 1.0, 'A', 3, 'スキル1でこんがり肉を食べられるので食後の与ダメUPを維持しやすい（GameWithのみ採用）', (GW,), '発動率60%'),
        '回避強化': dmg(0.4, 1.0, 'B', 4, 'ジャスト回避後 与ダメUP', ('game8.co',), '発動率40%'),
        '抜刀一閃': dmg(0.4, 1.0, 'B', 7, '抜刀攻撃後 与ダメUP。キャラ個別ガイドは未採用', (GR,), '発動率40%'),
        '弱点攻撃': crit(0.6, 'B', 3, '弱点部位での会心率UP', (GW,), '弱点部位60%'),
        '弱点追撃': proc(0.5, 0.75, 'B', 3, '破壊済み部位への追加ダメージ', (GW,), '破壊済み部位50%'),
        '破砕': tiny('大剣スキル。太刀には乗らないが快適枠', (GW,)),
    }},
}

HERO_ELEMENT_NOTE = ' 属性は、Game8・アルテマが火（レウス／ジャナフ／リオハート防具と絵装リオレイアが揃う）を先頭に推奨、GameWithは「5属性のうち一番数値の高い武器」。爆破・毒・麻痺武器だと属性特化と会心コアパッシブが発動しないので不利。'
for cid, m in models.items():
    if cid.startswith('hero_'):
        m['note'] = m['note'] + HERO_ELEMENT_NOTE
json.dump({'characters': models}, open(OUT, 'w'), ensure_ascii=False, indent=1)
print('wrote', OUT, len(models), 'models')
