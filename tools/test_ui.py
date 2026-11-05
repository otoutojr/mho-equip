#!/usr/bin/env python3
"""ヘッドレスブラウザで iPhone 幅の表示と計算結果を確認する。
使い方: python3 tools/test_ui.py [char_id] [rank] [monster1,monster2,...] [rarityCap]
事前に `python3 -m http.server 8765` をプロジェクト直下で起動しておく。
"""
import sys, json, pathlib
from playwright.sync_api import sync_playwright

char = sys.argv[1] if len(sys.argv) > 1 else 'pepe'
rank = sys.argv[2] if len(sys.argv) > 2 else '43'
mons = sys.argv[3].split(',') if len(sys.argv) > 3 and sys.argv[3] else []
cap = sys.argv[4] if len(sys.argv) > 4 else '7'
shots = pathlib.Path('/tmp/claude-0/-home-claude/094b7c7b-727a-5a9e-9d7d-7a958be863c9/scratchpad')

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 393, "height": 852}, device_scale_factor=2, locale="ja-JP")
    page = ctx.new_page()
    logs = []
    page.on("console", lambda m: logs.append(f"{m.type}: {m.text}"))
    page.on("pageerror", lambda e: logs.append(f"PAGEERROR: {e}"))
    page.goto("http://localhost:8765/", wait_until="networkidle")
    state = {"charId": char, "rank": int(rank), "rarityCap": int(cap), "guildLv": 0, "defeated": {m: True for m in mons}, "map": None}
    page.evaluate("s => localStorage.setItem('mho-equip:v1', JSON.stringify(s))", state)
    page.reload(wait_until="networkidle")
    page.wait_for_function("document.querySelector('#scoreValue').textContent !== '―' || document.querySelector('#resultHint').textContent.includes('ありません')", timeout=20000)
    page.wait_for_function("!document.querySelector('#nextList').textContent.includes('計算中')", timeout=60000)
    print("SCORE", page.inner_text("#scoreValue"))
    print("HINT", page.inner_text("#resultHint"))
    rack = [t for t in page.inner_text("#rack").split("\n") if t.strip()]
    print("RACK", rack)
    print("TOTALS", [t for t in page.inner_text("#skillTotals").split("\n") if t.strip()][:24])
    print("NEXT", [t for t in page.inner_text("#nextList").split("\n") if t.strip()][:16])
    page.screenshot(path=str(shots / f"ui_{char}.png"), full_page=True)
    for l in logs[:20]: print("LOG", l)
    b.close()
