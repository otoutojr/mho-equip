# 第三者の素材とライセンス（Third-party notices）

このサイトの見た目には、GitHub の公開リポジトリから次の素材・考え方を使っています（2026-11-21 に採用）。
それぞれのライセンスの条件にしたがって、出どころと著作権表示をここに載せます。サイトの画面下「デザインの出どころ」にも同じ内容の要約があります。

| 名前 | 作者 | ライセンス | 使ったもの | どこに |
| --- | --- | --- | --- | --- |
| [Shippori Mincho](https://github.com/fontdasu/ShipporiMincho) | fontdasu / The Shippori Mincho Project Authors | SIL OFL 1.1 | フォント「Shippori Mincho B1 ExtraBold」（このサイトで使う字だけに絞った woff2） | `fonts/`, `style.css` |
| [BudouX](https://github.com/google/budoux) | Google LLC | Apache-2.0 | `parser.js` と日本語モデル `ja.js`（無改変） | `vendor/budoux/`, `phrase.js` |
| [Open Props](https://github.com/argyleink/open-props) | Adam Argyle | MIT | 影の重ね方・動き方（イージング）・紙の粒（feTurbulence の SVG）の値や作り方 | `style.css` |
| [Web Interface Guidelines](https://github.com/vercel-labs/web-interface-guidelines) | Vercel Labs | MIT | 点検項目（コードは取り込んでいない） | `tools/audit_ui.py`, `style.css`（hover/active、動きの抑制など） |

---

## 1. Shippori Mincho（しっぽり明朝）

- 出どころ: https://github.com/fontdasu/ShipporiMincho （`fonts/ttf/ShipporiMinchoB1-ExtraBold.ttf`、コミット 63431fe、2021-04-14）
- 著作権: Copyright 2021 The Shippori Mincho Project Authors (https://github.com/fontdasu/ShipporiMincho)
- ライセンス: SIL Open Font License, Version 1.1。全文は [`fonts/OFL.txt`](fonts/OFL.txt)（Webフォントとして配信してよい）
- 加工: fontTools の `pyftsubset` で、このサイトに出てくる文字だけに絞り、woff2 にした（`tools/subset_font.py`）。OpenType の機能は `palt`・`ccmp`・`liga` だけ残し、ヒンティングは外した。名前表の著作権・ライセンスの文字列はそのまま残している。元のフォントには Reserved Font Name の指定がない。
- 使い方: 見出し・数字・ボタンなど「明朝で出す所」だけ（`style.css` の `--serif`）。本文はシステムのゴシック体。

## 2. BudouX

- 出どころ: https://github.com/google/budoux （npm パッケージ `budoux@0.10.4` の `module/parser.js` と `module/data/models/ja.js`）
- 著作権: Copyright 2021 Google LLC（`parser.js` の `@license` ヘッダーのとおり）
- ライセンス: Apache License 2.0。全文は [`vendor/budoux/LICENSE`](vendor/budoux/LICENSE)。取り込んだファイルは**無改変**で、SHA-256 は [`vendor/budoux/README.md`](vendor/budoux/README.md) に記録。リポジトリに NOTICE ファイルはない。
- 使い方: `word-break: auto-phrase` に対応していないブラウザ（Safari など）でだけ、`phrase.js`（このリポジトリのオリジナル）が読み込み、文節の切れ目に ZWSP を入れて、説明文を文節で折り返す。

## 3. Open Props

- 出どころ: https://github.com/argyleink/open-props
- 著作権: Copyright (c) 2021 Adam Argyle
- ライセンス: MIT（全文は下）
- 使ったもの（`style.css` の `:root`）:
  - `--shadow-2`・`--shadow-3` の影の重ね方（`props.shadows.css`）… 影の色を墨の茶色 `hsl(30 27% 13%)`、基本の濃さを 6% にして、紙に合わせた
  - `--ease-out-3`・`--ease-spring-3`（`props.easing.css`）… 値はそのまま。`linear()` が使えない端末（iOS 17.2 より前など）では、判子の動きを ease-out にする（`@supports` で切り替え）
  - `--noise-*`（`props.gradients.css`）の feTurbulence の SVG … 色行列を足して茶色の薄い斑点にし、180px の升に直した（`--grain`）

## 4. Web Interface Guidelines

- 出どころ: https://github.com/vercel-labs/web-interface-guidelines
- 著作権: Copyright (c) 2025 Vercel Labs
- ライセンス: MIT（全文は下）
- 使い方: コードは取り込んでいない。README の点検項目のうち、ヘッドレスブラウザで確かめられるもの（押せる大きさ、名前、16px の入力欄、コントラスト、フォーカス枠、動きを減らす設定、拡大の禁止など）を `tools/audit_ui.py` にした。点検で見つかった「まだ作れない構成の文字が薄すぎる」を直し、`:hover`・`:active` の変化と `text-wrap`、`prefers-reduced-motion` を足した。

---

## 検討して採用しなかったもの

- [game-icons/icons](https://github.com/game-icons/icons)（CC BY 3.0 / 一部 CC0。使うなら作者名の表示が必要）… 武器種アイコンの候補として、実寸（18px・28px）で今の自作シルエットと並べて比べたが、細部が潰れて読みにくくなったので採用しなかった。
- Hina Mincho（OFL）… 太さが1つしかなく細いため、見出し・数字には弱いので採用しなかった。

---

## Open Props — MIT License

MIT License

Copyright (c) 2021 Adam Argyle

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.


---

## Web Interface Guidelines (Vercel Labs) — MIT License

MIT License

Copyright (c) 2025 Vercel Labs

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

