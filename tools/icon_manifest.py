#!/usr/bin/env python3
"""icons/mon/ に置いたモンスターの印の画像を調べて、icons/mon/manifest.json（名前→拡張子）を作る。
画像を足したり消したりしたら、これを実行してからコミットする。

置ける名前は2種類：
  - 防具シリーズ名（例 `リオハート.webp`）… 装備の行と、同じモンスターの絵装の行に出る
  - `絵装・` を付けた絵装の名前（例 `絵装・ケストドン.webp`）… 防具の無いモンスター（小型・クシャルダオラ）の絵装の行に出る

  python3 tools/icon_manifest.py
"""
import json, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
MON = ROOT / 'icons' / 'mon'
EXTS = ['png', 'webp', 'jpg', 'jpeg']


def main():
    series = {s['name'] for s in json.loads((ROOT / 'data' / 'armor.json').read_text(encoding='utf-8'))['series']}
    esou_path = ROOT / 'data' / 'esou.json'
    esou = {c['name'] for c in json.loads(esou_path.read_text(encoding='utf-8'))['cards']} if esou_path.exists() else set()
    out, unknown = {}, []
    for ext in EXTS:
        for f in sorted(MON.glob(f'*.{ext}')):
            name = f.stem
            if name in series or name in esou:
                out.setdefault(name, 'jpg' if ext == 'jpeg' else ext)
            else:
                unknown.append(f.name)
    (MON / 'manifest.json').write_text(json.dumps(out, ensure_ascii=False, indent=0) + '\n', encoding='utf-8')
    print(f'印のある防具シリーズ {sum(1 for n in out if n in series)} / {len(series)}、絵装だけの印 {sum(1 for n in out if n in esou)}')
    if unknown:
        print('名前が一致しないファイル（無視した）:', unknown)


if __name__ == '__main__':
    main()
