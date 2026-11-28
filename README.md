# 装備おすすめ ― モンハンアウトランダーズ

冒険ランクを入れるだけで、そのランクで作れる武器・防具からキャラごとの最強装備を計算する個人用ツールです。iPhoneのホーム画面に追加して使う前提（PWA）。

## できること
- キャラ（主人公の各武器種・SSR/SRキャラ）ごとに、優先スキルの重み付けで最強セットを探索
- どの部位を何レアまで強化すればそのスキルが付くかを表示
- 「入れたいスキル」をLvで指定すると、それを満たす中でDPS目安が一番高い装備を出す（届かないときは一番近い組み合わせ）
- ランクの節目（強化上限UP・新モンスター解放）ごとの火力の伸び
- そのランクで作れる一番強い武器（武器種・属性別）
- 入力内容は端末内（localStorage）に保存

## 構成
- `index.html` / `style.css` / `app.js` … 画面。上から、キャラの帯（よく使うキャラを1回押して切り替え。下へ送っても上に残る）→ DPS目安と相手（通常／融光種）→ 装備 → 絵装 → スキル（付いたスキルと、入れる・外すの指定）→ ほかの候補 → 折りたたみ。
  「変更」で下から出る札（`<dialog>`）に、全キャラ・主人公の武器と属性・冒険ランク・帯に並べるキャラの選択がある。
  いまの答えを出し終えて手が空くと、相手の切り替えと帯のほかのキャラを先に計算して覚えておく（`app.js` の `prefetchNext`）ので、押した瞬間に答えが出る
- `phrase.js` + `vendor/budoux/` … 日本語を文節で折り返す（Safari など `word-break: auto-phrase` 未対応の端末だけ。BudouX、Apache-2.0）
- `vendor/number-flow/`・`vendor/rough-notation/` … DPS目安の数字が桁ごとに回る動き（NumberFlow、MIT）と、強化が要る所を囲む朱の手書きの丸（Rough Notation、MIT）
- `fonts/` … 見出し・数字の明朝（Shippori Mincho B1 ExtraBold を、使う字だけに絞った woff2。OFL-1.1）
- `icons/mon/` … 装備の行に出すモンスターの印。`icons/mon/<シリーズ名>.png`（webp・jpgも可）を置くとその画像になり、無ければ墨の仮の印（`app.js` の `monIcon`）が出る。ゲーム内アイコンは権利者のものなので同梱せず、置くかどうかは運営の判断（`icons/mon/README.md` に置ける名前の一覧）
- `solver.js` … Web Worker。候補の絞り込み → 全組み合わせ探索（同点なら強化段数が少ない方）。組み合わせごとに、アウかる（mhnowcalc.com）の期待値の式（与ダメ系スキルは足し算、会心は+25%・基本会心率15%）でDPS目安を計算する。式の本体は `app.js` の `damageSpec`／`specDps` と `solver.js` の `specDps`（同じ式）。スキル同士の連動（`links`：背水の陣は融光怪力Lv3で常に発動）は `damageSpec` で作り、`solver.js` の `linkD` で足す
- `data/*.json` … 武器・防具・スキル・モンスター・キャラの重み
- `tools/build_data.py` … 収集した生データから `data/` を作る
- `tools/apply_observed.py` + `tools/observed/*.json` … 攻略サイト以外から分かったデータを `data/` に重ねる。ゲーム画面で確かめた防具・スキル・セット効果・強化上限と、アウかる（mhnowcalc.com）の武器のレア12〜14の数値・防具スキルの食い違いの修正。`build_data.py`・`build_weapons.py` の最後に自動で走るので、攻略サイトのデータを作り直しても消えない。`--check` で検算（部位が5つそろっているか・スキル名・最大Lv・防具や武器の有無・防具idの重複）だけできる。スクショ画像そのものはリポジトリに入れない（文字に書き写したものだけ）
- `tools/import_aukaru_weapons.py` … アウかるの装備一覧ページ（HTML）に埋め込まれた武器データから、こちらに無いレア・数値が違うレアだけを `tools/observed/weapons_YYYYMMDD_aukaru.json` に書き出す（状態異常の武器は対象外）
- `tools/merge_rarity.py` … 防具のレア別スキルを Game8・GameWith・gamewith.ai の多数決でまとめ、Gamerch の最大強化時スキルと照合する
- `tools/make_models.py` … キャラごとのダメージモデル（スキルがどれだけ火力に乗るか）。融光怪力・背水の陣は全キャラ共通（`COMMON_SKILLS`）
- `tools/build_builds.py` … 攻略サイトのおすすめ構成を集めた構成DB（data/builds.json）を作る
- `tools/build_api.py` … 外部のAI（Claude Desktop など）向けに、キャラごとの小さなJSON（api/index.json, api/builds/<charId>.json）を作る。使い方のプロンプトは docs/claude-desktop-prompt.md
- `tools/build_weapons.py` … 武器データ（レアごとの攻撃力・属性値。サイトでレア9止まりの武器はレア10まで推定値で伸ばす）
- `tools/subset_font.py` … 明朝フォントを、サイトに出てくる字だけに絞って `fonts/` に出す（index.html・app.js を書き換えたら実行し直す）
- `tools/test_ui.py` … iPhone 幅で表示と計算結果を確かめる
- `tools/audit_ui.py` … 画面の点検（押せる大きさ・名前・コントラスト・横はみ出し・フォーカス枠・動きを減らす設定など。Vercel の Web Interface Guidelines のうち機械で確かめられる項目）。`--selftest` でわざと悪い部品を入れて、点検が拾えるかを確かめられる

## 借りたもの（デザイン）
フォント・折り返し・紙の質感・影・動き・朱の手書きの丸は、GitHub の公開リポジトリ（Shippori Mincho・BudouX・Open Props・Vercel の Web Interface Guidelines・Rough Notation・NumberFlow）を使っています。出どころとライセンスは [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) にあります。

## データについて
防具・スキル・モンスターの情報は攻略サイト（GameWith・Game8・gamewith.ai・Gamerch）の掲載内容をもとにまとめたもので、ゲーム内の表記と異なる場合があります。キャラごとの重みは攻略サイトの推奨とゲーム内の効果値を参考にした目安です。

## 絵装

- `data/esou.json`：レジェンド絵装55種とセット効果。`tools/import_aukaru_esou.py` でアウかるの絵装データから作る（発動率の見積もりもこのスクリプトに書いてある）
- 画面の「絵装」は、いまの武器と防具に足したときの DPS目安がいちばん高い5枚（コスト合計12まで、1枠目がコア）を `app.js` の `esouSearch` が総当たりで探す
- 肉質：`app.js` の `HITZONE`。アウかるのモンスター肉質図鑑（38体）で、弱点属性の肉質 ÷ 物理の肉質が通常種で約1.25倍、融光種で約6倍だったので、属性側のダメージにこの倍率を掛けている
