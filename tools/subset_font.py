#!/usr/bin/env python3
"""見出し・数字用のフォント（しっぽり明朝 B1 ExtraBold）を、サイトで使う文字だけに絞って fonts/ に出す。

使い方:
  python3 tools/subset_font.py /path/to/ShipporiMinchoB1-ExtraBold.ttf

- 元のフォント: https://github.com/fontdasu/ShipporiMincho （SIL Open Font License 1.1。Webフォントとしての利用も可）
  取得時のコミット 63431fe（2021-04-14）。ライセンス文は fonts/OFL.txt
- 入れる文字: ASCII全部 ＋ index.html（明朝で出る所だけ）/ app.js の文字列 / data/characters.json の名前 に出てくる日本語の文字
  （足りない文字は、CSS の font-family の次の書体に自動で切り替わる）
- 名前表（著作権・ライセンスの文字列）はそのまま残す（OFL の条件）
- 必要: pip install fonttools brotli
"""
import re, sys, json, pathlib, subprocess
from html.parser import HTMLParser

ROOT = pathlib.Path(__file__).resolve().parent.parent
src = pathlib.Path(sys.argv[1])
out = ROOT / 'fonts' / 'ShipporiMinchoB1-ExtraBold.subset.woff2'

VOID = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr'}


class SerifText(HTMLParser):
    """index.html のうち明朝で出る文字だけ集める。本文（ゴシック）の <li>・<a>・.brand/.lbl 以外の <p> は除く"""

    def __init__(self):
        super().__init__()
        self.stack, self.buf = [], []

    def handle_starttag(self, tag, attrs):
        if tag in VOID:
            return
        cls = set((dict(attrs).get('class') or '').split())
        self.stack.append(tag in ('li', 'a', 'script', 'style', 'title') or (tag == 'p' and not cls & {'brand', 'lbl'}))

    def handle_endtag(self, tag):
        if tag not in VOID and self.stack:
            self.stack.pop()

    def handle_data(self, data):
        if not any(self.stack):
            self.buf.append(data)


_p = SerifText()
_p.feed((ROOT / 'index.html').read_text(encoding='utf-8'))
html = ''.join(_p.buf)
app = (ROOT / 'app.js').read_text(encoding='utf-8')
strs = re.findall(r"'(?:[^'\\\n]|\\.)*'|\"(?:[^\"\\\n]|\\.)*\"|`(?:[^`\\]|\\.)*`", app)
chars = json.loads((ROOT / 'data' / 'characters.json').read_text(encoding='utf-8'))['characters']
names = ''.join(str(c.get('name', '')) + str(c.get('weapon', '')) + str(c.get('element', '')) for c in chars)

text = {chr(i) for i in range(0x20, 0x7f)}
for s in (html, '\n'.join(strs), names):
    text |= {c for c in s if ord(c) > 0x7f and c not in '​ '}
text |= set('◆◇→×＝＋－−・、。「」『』（）～…％：；！？')

tmp = ROOT / 'tools' / '.subset_chars.txt'
tmp.write_text(''.join(sorted(text)), encoding='utf-8')
out.parent.mkdir(exist_ok=True)
subprocess.run(['pyftsubset', str(src), f'--text-file={tmp}', '--flavor=woff2', f'--output-file={out}',
                '--layout-features=palt,ccmp,liga', '--name-IDs=*', '--notdef-outline', '--no-hinting'], check=True)
tmp.unlink()
print(f'{len(text)} 文字 → {out.relative_to(ROOT)}  {out.stat().st_size:,} bytes')
