# vendor/number-flow

数字が変わるとき桁ごとに回して見せる部品 **NumberFlow**（Maxwell Barvian）の、ブラウザ用の部品です。
`../../app.js` の `animateNumber()` が、DPS目安の数字（`#dpsNum`）を `<number-flow>` で出すのに使います。
読み込めなかったときは、今までどおりの数字の表示に戻ります。動きを減らす設定の端末では回りません（NumberFlow の標準の動き）。

- 出どころ: npm パッケージ `number-flow@0.6.2`（依存の `esm-env@1.2.2` を含む）を、esbuild 0.24.2 で1つのファイルにまとめたもの。中身のコードは変えていない
  - 入口のファイルは `import 'number-flow';` の1行だけ（読み込むと `<number-flow>` が使えるようになる）
  - コマンド: `esbuild entry.js --bundle --format=iife --minify --platform=browser --target=safari16 --legal-comments=inline --banner:js="/*! …ライセンスの表示… */" --outfile=number-flow.iife.js`
- ソース: https://github.com/barvian/number-flow ／ https://github.com/benmccann/esm-env
- ライセンス: どちらも MIT。`LICENSE`（number-flow の `LICENSE.md` をそのままコピー）と `LICENSE-esm-env`（esm-env の `LICENSE` をそのままコピー）

SHA-256（取り込んだ時点）

| ファイル | SHA-256 |
| --- | --- |
| number-flow.iife.js（まとめたもの） | `ccdb659ce3ccb8897c2b85853bfeaea2b70e52a2e46111b0485419f8fd56e2be` |
| 元の `number-flow/dist/index.mjs` | `df08f25a6a37f0d30ba045caaab66c87ba95172df2ed5e9261e2b090aa8a9b8d` |
| 元の `number-flow/dist/lite.mjs` | `3154fb0dfe2983c68a216bf5552f7d8e537759b2ccef3988e8b32aedd2a16b10` |
