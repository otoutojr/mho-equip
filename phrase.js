/* 日本語の折り返し（文節で改行する）
   - word-break: auto-phrase に対応するブラウザ（Chrome・Edge 119 以降）は、CSS に任せて何もしない。
   - 対応していない端末（Safari・iPhone など）では、BudouX（Google, Apache-2.0）で文節の切れ目を見つけ、
     そこにだけ ZWSP（U+200B）を入れる。CSS は word-break: keep-all で「ZWSP の所でだけ改行できる」状態にする。
   - 対象は長めの説明文だけ（SEL）。style.css の :is(...) と同じ並びにしておくこと。
   - BudouX が読み込めなくても、表示はそのまま（今までどおり）。 */
(() => {
  'use strict';
  let native = false;
  try { native = CSS.supports('word-break', 'auto-phrase'); } catch { /* 古いブラウザは未対応扱い */ }
  if (native) return;

  const SEL = '.note, .prose p, .prose li, .rowBody, .moreBody, .build > p';
  const ZWSP = '​';
  const JA = /[぀-ヿ㐀-鿿]/;
  let parser = null;
  let timer = 0;
  const queue = new Set();

  // 要素の中のテキストをまとめて文節に分け、切れ目に ZWSP を入れる（何度呼んでも同じ結果になる）
  function phrasify(el) {
    const nodes = [];
    const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = tw.nextNode(); n; n = tw.nextNode()) nodes.push(n);
    const plain = nodes.map((n) => n.data.split(ZWSP).join(''));
    const text = plain.join('');
    if (text.length < 6 || !JA.test(text)) return;
    const bounds = parser.parseBoundaries(text); // UTF-16 の位置
    let pos = 0;
    let bi = 0;
    nodes.forEach((n, i) => {
      const d = plain[i];
      const end = pos + d.length;
      let out = '';
      let prev = 0;
      while (bi < bounds.length && bounds[bi] <= end) {
        const o = bounds[bi++] - pos;
        if (o <= 0) continue;
        out += d.slice(prev, o) + ZWSP;
        prev = o;
      }
      out += d.slice(prev);
      if (out !== n.data) n.data = out;
      pos = end;
    });
  }

  function flush() {
    timer = 0;
    for (const el of queue) if (el.isConnected) phrasify(el);
    queue.clear();
  }
  // 入れ子になった対象は内側だけ処理する
  function add(el) {
    if (!el || el.querySelector(SEL)) return;
    queue.add(el);
    if (parser && !timer) timer = requestAnimationFrame(flush);
  }
  function collect(node) {
    if (node.nodeType === 3) { if (node.parentElement) add(node.parentElement.closest(SEL)); return; }
    if (node.nodeType !== 1) return;
    add(node.closest(SEL));
    node.querySelectorAll(SEL).forEach(add);
  }

  Promise.all([import('./vendor/budoux/parser.js'), import('./vendor/budoux/ja.js')]).then(([p, m]) => {
    parser = new p.Parser(m.model);
    document.documentElement.classList.add('wb-poly');
    collect(document.body);
    flush();
    // 画面は app.js が何度も描き直すので、増えたぶんだけ後から区切る（文字の書き換えは見ない＝自分の変更で再実行しない）
    new MutationObserver((recs) => { for (const r of recs) r.addedNodes.forEach(collect); }).observe(document.body, { childList: true, subtree: true });
  }).catch(() => { /* 読めなければ何もしない */ });
})();
