#!/usr/bin/env python3
"""ヘッドレスブラウザで iPhone 幅の表示と計算結果を確認する。
使い方: python3 tools/test_ui.py [char] [rank] [heroWeapon] [heroElement] [target]
  例) python3 tools/test_ui.py hero 43 hbg 火
      python3 tools/test_ui.py cless 43
事前に `python3 -m http.server 8765` をプロジェクト直下で起動しておく。
"""
import sys, pathlib
from playwright.sync_api import sync_playwright

char = sys.argv[1] if len(sys.argv) > 1 else 'hero'
rank = int(sys.argv[2]) if len(sys.argv) > 2 else 43
weapon = sys.argv[3] if len(sys.argv) > 3 else 'hbg'
elem = sys.argv[4] if len(sys.argv) > 4 else '火'
target = sys.argv[5] if len(sys.argv) > 5 else 'normal'
shots = pathlib.Path('/tmp/claude-0/-home-claude/094b7c7b-727a-5a9e-9d7d-7a958be863c9/scratchpad')

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 393, "height": 852}, device_scale_factor=1, locale="ja-JP")
    page = ctx.new_page()
    logs = []
    page.on("console", lambda m: logs.append(f"{m.type}: {m.text}"))
    page.on("pageerror", lambda e: logs.append(f"PAGEERROR: {e}"))
    page.goto("http://localhost:8765/", wait_until="networkidle")
    state = {"char": char, "heroWeapon": weapon, "heroElement": elem, "rank": rank, "target": target}
    page.evaluate("s => localStorage.setItem('mho-equip:v1', JSON.stringify(s))", state)
    page.reload(wait_until="networkidle")
    page.wait_for_function("document.querySelector('#dpsNum') && /\\d/.test(document.querySelector('#dpsNum').textContent)", timeout=30000)
    page.wait_for_timeout(2500)
    print("DPS", page.inner_text("#dpsNum"), "|", page.inner_text("#dpsCalc"))
    print("WEAPON", " / ".join(t for t in page.inner_text("#weaponSlot").split("\n") if t.strip()))
    for t in page.inner_text("#rack").split("\n"):
        if t.strip(): print("  ", t)
    print("TOTALS", [t for t in page.inner_text("#skillTotals").split("\n") if t.strip()][:30])
    print("NEXT", [t for t in page.inner_text("#nextList").split("\n") if t.strip()][:14])
    page.screenshot(path=str(shots / f"ui_{char}_{weapon if char == 'hero' else ''}.png"), full_page=True)
    for l in logs[:20]: print("LOG", l)
    b.close()
