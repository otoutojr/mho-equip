#!/usr/bin/env python3
"""画面の点検。Vercel Labs の Web Interface Guidelines（MIT, https://github.com/vercel-labs/web-interface-guidelines）の
項目のうち、ヘッドレスブラウザで機械的に確かめられるものだけを調べる。

使い方: python3 tools/audit_ui.py [char] [rank] [heroWeapon] [heroElement]
  事前に `python3 -m http.server 8765` をプロジェクト直下で起動しておく。
  error があれば終了コード 1。warn は目で見て判断するもの。

調べること（iPhone 幅 393px、折りたたみは全部開く）
  - 押せるもの（button・summary・input…）が 44px 以上か（文章の途中のリンクは除く）
  - 押せるものに名前（文字・aria-label）があるか、SVG の飾りが aria-hidden か
  - 入力欄の文字が 16px 以上か（iPhone が拡大しない）
  - 横にはみ出していないか、viewport が拡大を禁止していないか
  - 文字と背景のコントラスト（通常 4.5、大きい文字 3）
  - キーボードで触ったときの枠（:focus-visible）、touch-action、tabindex>0、重複 id、target=_blank の rel
  - 「動きを減らす」設定のとき、判子の動きと transition が止まるか
  - 明朝フォントが読み込まれているか、コンソールのエラー
"""
import os, sys, json
from playwright.sync_api import sync_playwright

args = [a for a in sys.argv[1:] if not a.startswith('--')]
selftest = '--selftest' in sys.argv  # わざと悪い部品を入れて、点検が拾えるか確かめる（error が出れば正常）
char = args[0] if len(args) > 0 else 'hero'
rank = int(args[1]) if len(args) > 1 else 55
weapon = args[2] if len(args) > 2 else 'hbg'
elem = args[3] if len(args) > 3 else '水'
BASE = os.environ.get('AUDIT_BASE', 'http://localhost:8765/')  # 公開版を点検するときは AUDIT_BASE=https://otoutojr.github.io/mho-equip/
STATE = {'char': char, 'heroWeapon': weapon, 'heroElement': elem, 'rank': rank, 'target': 'normal', 'seen': True}
errors, warns = [], []


def err(area, msg): errors.append((area, msg))
def warn(area, msg): warns.append((area, msg))


# 画面の中で調べる JS（1回で全部集めて返す）
COLLECT = r"""
() => {
  const vis = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
  const label = (e) => (e.getAttribute('aria-label') || (e.id ? '#' + e.id : '') || e.className || e.tagName).toString().slice(0, 40);
  const nameOf = (e) => {
    const al = e.getAttribute('aria-label'); if (al) return al;
    const lb = e.getAttribute('aria-labelledby'); if (lb) return lb.split(/\s+/).map(i => (document.getElementById(i) || {}).textContent || '').join(' ').trim();
    if (e.tagName === 'INPUT' || e.tagName === 'SELECT' || e.tagName === 'TEXTAREA') { if (e.labels && e.labels.length) return e.labels[0].textContent.trim(); return e.title || ''; }
    return (e.textContent || '').trim() || e.title || '';
  };
  const out = { targets: [], names: [], inputs: [], contrast: [], overflow: [], focusables: [], ids: [], blank: [], tabindex: [], touch: [], svgs: [], fonts: [] };
  const inter = [...document.querySelectorAll('button, a[href], summary, input, select, textarea, [role=button], [role=tab]')].filter(vis);
  for (const e of inter) {
    const r = e.getBoundingClientRect();
    const inlineLink = e.tagName === 'A' && e.closest('.prose, .note, p, li');
    if ((r.width < 44 || r.height < 44) && !inlineLink) out.targets.push(`${label(e)} ${Math.round(r.width)}x${Math.round(r.height)}`);
    if (!nameOf(e)) out.names.push(label(e) + ' <' + e.tagName.toLowerCase() + '>');
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.tagName) && e.type !== 'range' && e.type !== 'checkbox' && parseFloat(getComputedStyle(e).fontSize) < 16) out.inputs.push(label(e) + ' ' + getComputedStyle(e).fontSize);
    if (e.tagName !== 'A' && getComputedStyle(e).touchAction !== 'manipulation') out.touch.push(label(e) + ' ' + getComputedStyle(e).touchAction);
    if (e.tabIndex > 0) out.tabindex.push(label(e));
  }
  for (const s of document.querySelectorAll('svg')) { if (!s.closest('[aria-hidden="true"]') && s.getAttribute('aria-hidden') !== 'true' && !s.getAttribute('role') && !s.querySelector('title')) out.svgs.push((s.parentElement && label(s.parentElement)) || 'svg'); }
  const seen = new Set(); for (const e of document.querySelectorAll('[id]')) { if (seen.has(e.id)) out.ids.push(e.id); seen.add(e.id); }
  for (const a of document.querySelectorAll('a[target=_blank]')) if (!/noopener/.test(a.rel || '')) out.blank.push(a.href);
  const W = document.documentElement.clientWidth;
  if (document.documentElement.scrollWidth > W) out.overflow.push('page scrollWidth ' + document.documentElement.scrollWidth + ' > ' + W);
  for (const e of document.querySelectorAll('main *')) { if (!vis(e)) continue; const r = e.getBoundingClientRect(); if (r.right > W + 1 || r.left < -1) { if (!e.closest('#wantChoices, .roster')) out.overflow.push(label(e) + ' ' + Math.round(r.left) + '..' + Math.round(r.right)); } }
  // コントラスト
  const parse = (s) => { const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const lin = (v) => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); };
  const lum = (c) => .2126 * lin(c.r) + .7152 * lin(c.g) + .0722 * lin(c.b);
  const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + .05) / (Math.min(l1, l2) + .05); };
  const mix = (f, b, a) => ({ r: f.r * a + b.r * (1 - a), g: f.g * a + b.g * (1 - a), b: f.b * a + b.b * (1 - a), a: 1 });
  const bgOf = (el) => { for (let e = el; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c.a > .5) return c; } return parse(getComputedStyle(document.documentElement).backgroundColor) || { r: 255, g: 255, b: 255, a: 1 }; };
  const opac = (el) => { let o = 1; for (let e = el; e; e = e.parentElement) o *= parseFloat(getComputedStyle(e).opacity); return o; };
  const seenEl = new Set();
  const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = tw.nextNode(); n; n = tw.nextNode()) {
    if (!n.data.trim()) continue; const e = n.parentElement; if (!e || seenEl.has(e) || !vis(e) || e.closest('script, style, [aria-hidden="true"], :disabled')) continue; seenEl.add(e);
    const cs = getComputedStyle(e); const bg = bgOf(e); let fg = parse(cs.color); if (!fg) continue;
    const o = opac(e) * fg.a; fg = mix(fg, bg, o);
    const size = parseFloat(cs.fontSize), bold = parseInt(cs.fontWeight, 10) >= 700;
    const need = (size >= 24 || (size >= 18.66 && bold)) ? 3 : 4.5;
    const r = ratio(fg, bg);
    if (r < need) out.contrast.push(`${label(e)} "${n.data.trim().slice(0, 14)}" ${r.toFixed(2)} < ${need} (${Math.round(size)}px, opacity ${opac(e).toFixed(2)})`);
    if (size < 12) out.contrast.push(`${label(e)} 文字が小さい ${size}px`);
  }
  out.fonts = [...document.fonts].map(f => `${f.family} ${f.weight} ${f.status}`);
  out.h1 = document.querySelectorAll('h1').length;
  out.lang = document.documentElement.lang;
  out.viewport = (document.querySelector('meta[name=viewport]') || {}).content || '';
  out.themeColor = !!document.querySelector('meta[name=theme-color]');
  out.colorScheme = !!document.querySelector('meta[name=color-scheme]');
  out.preload = !!document.querySelector('link[rel=preload][as=font]');
  return out;
}
"""

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 393, 'height': 852}, device_scale_factor=2, locale='ja-JP')
    page = ctx.new_page()
    logs = []
    page.on('console', lambda m: logs.append(f'{m.type}: {m.text}') if m.type in ('error', 'warning') else None)
    page.on('pageerror', lambda e: logs.append(f'PAGEERROR: {e}'))
    page.on('requestfailed', lambda r: logs.append(f'REQFAILED: {r.url}'))
    page.goto(BASE, wait_until='networkidle')
    page.evaluate('s => localStorage.setItem("mho-equip:v1", JSON.stringify(s))', STATE)
    page.reload(wait_until='networkidle')
    page.wait_for_function('document.querySelector("#dpsNum") && /\\d/.test(document.querySelector("#dpsNum").textContent)', timeout=30000)
    page.wait_for_timeout(1200)

    def sweep(tag):
        # 折りたたみを全部開き、「スキルを指定」と下から出る札（選ぶところ）も開いて、見えるものを全部調べる。
        # 札は dialog（開いている間はうしろを押せない）なので、最後に開いて、調べ終わったら閉じる
        page.evaluate('() => document.querySelectorAll("details").forEach(d => d.open = true)')
        if page.locator('.addBtn').first.is_visible() and page.locator('#wantPicker').is_hidden(): page.click('.addBtn')
        if page.locator('#picker').is_hidden() and page.locator('#editBtn').is_visible(): page.click('#editBtn')
        if selftest and not page.evaluate('() => !!document.getElementById("selftest")'):
            page.evaluate("""() => { const d = document.createElement('div'); d.id = 'selftest';
              d.innerHTML = '<button style="width:20px;height:20px"></button><p style="color:#c9bda0">うすい文字のテスト</p><a href="https://example.com" target="_blank">x</a><input aria-label="t" style="font-size:12px">';
              document.querySelector('main').append(d); }""")
        page.wait_for_timeout(500)
        r = page.evaluate(COLLECT)
        page.evaluate('() => { const d = document.querySelector("#picker"); if (d && d.open) d.close(); }')
        for k, area in (('targets', '押せる大きさ(<44px)'), ('names', '名前なし'), ('inputs', '入力欄が16px未満'), ('overflow', '横はみ出し'), ('ids', 'id重複'), ('blank', 'target=_blankにnoopenerなし'), ('tabindex', 'tabindex>0')):
            for m in r[k]: err(f'{tag} {area}', m)
        for m in r['contrast']: warn(f'{tag} コントラスト/文字', m)
        for m in r['touch']: warn(f'{tag} touch-action', m)
        for m in sorted(set(r['svgs'])): warn(f'{tag} SVGにaria-hiddenなし', m)
        return r

    r1 = sweep('計算')
    if r1['h1'] != 1: err('見出し', f'h1 が {r1["h1"]} 個')
    if r1['lang'] != 'ja': err('html', f'lang={r1["lang"]!r}')
    vp = r1['viewport'].replace(' ', '')
    if 'user-scalable=no' in vp or 'maximum-scale=1' in vp: err('viewport', '拡大を禁止している: ' + r1['viewport'])
    if not r1['themeColor']: err('meta', 'theme-color がない')
    if not r1['colorScheme']: err('meta', 'color-scheme がない')
    if not r1['preload']: warn('フォント', 'preload がない')
    if not any('Shippori Mincho B1' in f and 'loaded' in f for f in r1['fonts']): err('フォント', f'明朝が読み込まれていない: {r1["fonts"]}')

    # 攻略サイトの構成タブ
    page.click('#tabDb'); page.wait_for_timeout(800)
    sweep('構成')

    # キーボードのフォーカス枠
    page.click('#tabCalc'); page.wait_for_timeout(300)
    page.evaluate('() => { document.activeElement && document.activeElement.blur(); window.scrollTo(0, 0); }')
    miss = []
    for i in range(8):
        page.keyboard.press('Tab')
        o = page.evaluate('() => { const e = document.activeElement; if (!e || e === document.body) return null; const s = getComputedStyle(e); return { n: (e.id || e.className || e.tagName).toString().slice(0, 30), w: parseFloat(s.outlineWidth), st: s.outlineStyle, sh: s.boxShadow !== "none" }; }')
        if o and not ((o['st'] != 'none' and o['w'] >= 2) or o['sh']): miss.append(o['n'])
    for m in miss: err('フォーカス枠', m)

    # 動きを減らす設定
    ctx2 = b.new_context(viewport={'width': 393, 'height': 852}, locale='ja-JP', reduced_motion='reduce')
    pg2 = ctx2.new_page()
    pg2.goto(BASE, wait_until='networkidle')
    pg2.evaluate('s => localStorage.setItem("mho-equip:v1", JSON.stringify(s))', STATE)
    pg2.reload(wait_until='networkidle')
    pg2.wait_for_function('document.querySelector("#dpsNum") && /\\d/.test(document.querySelector("#dpsNum").textContent)', timeout=30000)
    rm = pg2.evaluate('() => ({ anim: getComputedStyle(document.querySelector("#elStamp")).animationName, trans: getComputedStyle(document.querySelector("#editBtn")).transitionDuration })')
    if rm['anim'] != 'none': err('動きを減らす', f'判子の animation が止まらない: {rm["anim"]}')
    if rm['trans'] not in ('0s', '0s, 0s', '0s, 0s, 0s, 0s'): err('動きを減らす', f'transition が止まらない: {rm["trans"]}')
    ctx2.close()

    for l in logs: err('コンソール', l)
    b.close()

print(f'点検: char={char} rank={rank}  error {len(errors)} 件 / warn {len(warns)} 件')
for a, m in errors: print(f'  [error] {a}: {m}')
seen = set()
for a, m in warns:
    if (a, m) in seen: continue
    seen.add((a, m)); print(f'  [warn ] {a}: {m}')
sys.exit(1 if errors else 0)
