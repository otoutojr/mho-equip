#!/usr/bin/env python3
"""icons/mon/ に置いたモンスターの印の画像を調べて、icons/mon/manifest.json（シリーズ名→拡張子）を作る。
画像を足したり消したりしたら、これを実行してからコミットする。

  python3 tools/icon_manifest.py
"""
import json, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
MON = ROOT / 'icons' / 'mon'
EXTS = ['png', 'webp', 'jpg', 'jpeg']


def main():
    series = {s['name'] for s in json.loads((ROOT / 'data' / 'armor.json').read_text(encoding='utf-8'))['series']}
    out, unknown = {}, []
    for ext in EXTS:
        for f in sorted(MON.glob(f'*.{ext}')):
            name = f.stem
            if name in series:
                out.setdefault(name, 'jpg' if ext == 'jpeg' else ext)
            else:
                unknown.append(f.name)
    (MON / 'manifest.json').write_text(json.dumps(out, ensure_ascii=False, indent=0) + '\n', encoding='utf-8')
    print(f'印のある防具シリーズ {len(out)} / {len(series)}')
    if unknown:
        print('シリーズ名と一致しないファイル（無視した）:', unknown)


if __name__ == '__main__':
    main()
