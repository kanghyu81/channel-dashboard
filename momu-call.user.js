// ==UserScript==
// @name         모무 전화번호 원터치 연결
// @namespace    https://kanghyu81.github.io/channel-dashboard/
// @version      1.0
// @description  momu24 페이지의 전화번호를 터치하면 바로 전화/문자 연결 바를 띄웁니다.
// @match        http://*.momu24.com/*
// @match        https://*.momu24.com/*
// @match        http://momu24.com/*
// @match        https://momu24.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

/* 모무 전화번호 원터치 연결
   - momu24 화면의 한국 전화번호를 터치 가능한 링크(span[data-pcall])로 바꾼다.
   - 번호를 터치하면 화면 아래에 전화 걸기 / 문자 보내기 바를 띄운다.
   - 검색이나 기간 변경으로 표가 다시 그려져도 MutationObserver(150ms 디바운스)가 새 번호를 자동 변환한다.
   - 직접 만든 바([data-pcall-bar])와 변환된 링크([data-pcall])는 다시 관찰/변환하지 않아 무한 루프가 없다. */
(function () {
  'use strict';
  if (window.__pcallUserscriptLoaded) return;
  window.__pcallUserscriptLoaded = 1;

  var ATTR = 'data-pcall';
  var BAR_ATTR = 'data-pcall-bar';
  var OWN_SELECTOR = '[' + ATTR + '],[' + BAR_ATTR + ']';
  var DEBOUNCE_MS = 150;
  var RE = /\+?82[-\s.]?10[-\s.]?\d{3,4}[-\s.]?\d{4}|01[016789][-\s.]?\d{3,4}[-\s.]?\d{4}|02[-\s.]?\d{3,4}[-\s.]?\d{4}|0(?:3[1-3]|4[1-4]|5[1-5]|6[1-4])[-\s.]?\d{3,4}[-\s.]?\d{4}|0(?:70|60|50\d)[-\s.]?\d{3,4}[-\s.]?\d{4}|1[5-8]\d{2}[-\s.]?\d{4}/g;
  var SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, INPUT: 1, SELECT: 1, OPTION: 1, NOSCRIPT: 1, A: 1, BUTTON: 1, SVG: 1, CODE: 1 };

  var observer = null;
  var timer = null;
  var converting = false;

  function digits(s) {
    var d = s.replace(/[^0-9]/g, '');
    if (/^82(?:10|2)/.test(d)) d = '0' + d.slice(2);
    return d;
  }

  function fmt(d) {
    if (/^01[016789]/.test(d) && (d.length === 10 || d.length === 11)) {
      return d.length === 11 ? d.slice(0, 3) + '-' + d.slice(3, 7) + '-' + d.slice(7) : d.slice(0, 3) + '-' + d.slice(3, 6) + '-' + d.slice(6);
    }
    if (d.slice(0, 2) === '02' && (d.length === 9 || d.length === 10)) {
      return d.length === 10 ? '02-' + d.slice(2, 6) + '-' + d.slice(6) : '02-' + d.slice(2, 5) + '-' + d.slice(5);
    }
    if (/^1[5-8][0-9]{6}$/.test(d)) return d.slice(0, 4) + '-' + d.slice(4);
    if (d.length >= 10) return d.slice(0, d.length - 7) + '-' + d.slice(d.length - 7, d.length - 4) + '-' + d.slice(d.length - 4);
    return d;
  }

  function toast(msg) {
    var t = document.getElementById('pcalltoast');
    if (t && t.parentNode) t.parentNode.removeChild(t);
    t = document.createElement('div');
    t.id = 'pcalltoast';
    t.setAttribute(BAR_ATTR, 'toast');
    t.textContent = msg;
    t.style.cssText = 'position:fixed;left:12px;right:12px;top:14px;z-index:2147483647;text-align:center;background:rgb(17,17,17);color:rgb(255,255,255);padding:10px 16px;border-radius:20px;font-size:14px;line-height:1.4;font-family:-apple-system,BlinkMacSystemFont,"Malgun Gothic","Apple SD Gothic Neo",sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.3);max-width:90vw;';
    (document.body || document.documentElement).appendChild(t);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 2600);
  }

  function showBar(d) {
    var old = document.getElementById('pcallbar');
    if (old && old.parentNode) old.parentNode.removeChild(old);
    var el = document.createElement('div');
    el.id = 'pcallbar';
    el.setAttribute(BAR_ATTR, '1');
    el.style.cssText = 'position:fixed;left:10px;right:10px;bottom:calc(12px + env(safe-area-inset-bottom,0px));z-index:2147483647;background:rgb(255,255,255);border:1px solid rgb(226,230,236);border-radius:16px;box-shadow:0 10px 34px rgba(0,0,0,.28);padding:12px 14px 14px;box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,"Malgun Gothic","Apple SD Gothic Neo",sans-serif;color:rgb(17,17,17);';
    el.innerHTML = '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px;">' +
      '<div style="font-size:20px;font-weight:800;letter-spacing:.4px;">' + fmt(d) + '</div>' +
      '<div data-pcall-close="1" style="font-size:20px;line-height:1;padding:4px 10px;color:rgb(154,163,173);cursor:pointer;-webkit-tap-highlight-color:transparent;">\u2715</div>' +
      '</div>' +
      '<div style="display:flex;gap:8px;">' +
      '<a href="tel:' + d + '" style="flex:1;text-align:center;padding:15px 0;border-radius:12px;background:rgb(21,101,192);color:rgb(255,255,255);font-size:16px;font-weight:700;text-decoration:none;-webkit-tap-highlight-color:transparent;">\ud83d\udcde 전화 걸기</a>' +
      '<a href="sms:' + d + '" style="flex:1;text-align:center;padding:15px 0;border-radius:12px;background:rgb(46,125,50);color:rgb(255,255,255);font-size:16px;font-weight:700;text-decoration:none;-webkit-tap-highlight-color:transparent;">\ud83d\udcac 문자 보내기</a>' +
      '</div>';
    (document.body || document.documentElement).appendChild(el);
  }

  function inOwn(node) {
    var p = node.parentNode;
    while (p && p !== document.body) {
      if (p.hasAttribute && p.hasAttribute(ATTR)) return true;
      if (p.hasAttribute && p.hasAttribute(BAR_ATTR)) return true;
      p = p.parentNode;
    }
    return false;
  }

  function convert() {
    if (!document.body) return 0;
    converting = true;
    var count = 0;
    try {
      var walker = document.createTreeWalker(document.body, 4, {
        acceptNode: function (n) {
          var p = n.parentNode;
          if (!p || SKIP[p.nodeName]) return 2;
          if (p.closest && p.closest(OWN_SELECTOR)) return 2;
          var v = n.nodeValue;
          if (!v || v.length < 7) return 2;
          RE.lastIndex = 0;
          return RE.test(v) ? 1 : 2;
        }
      }, false);
      var nodes = [], n, i, m, s, e, last, node, text, frag, sp;
      while ((n = walker.nextNode())) nodes.push(n);
      for (i = 0; i < nodes.length; i++) {
        node = nodes[i];
        text = node.nodeValue;
        frag = document.createDocumentFragment();
        last = 0;
        RE.lastIndex = 0;
        while ((m = RE.exec(text))) {
          s = m.index;
          e = s + m[0].length;
          if (s > 0 && /[0-9]/.test(text.charAt(s - 1))) continue;
          if (e < text.length && /[0-9]/.test(text.charAt(e))) continue;
          var d = digits(m[0]);
          if (d.length < 8) continue;
          if (s > last) frag.appendChild(document.createTextNode(text.slice(last, s)));
          sp = document.createElement('span');
          sp.setAttribute(ATTR, d);
          sp.textContent = m[0];
          sp.style.cssText = 'color:rgb(21,101,192);text-decoration:underline;text-decoration-thickness:2px;text-underline-offset:2px;cursor:pointer;-webkit-tap-highlight-color:rgba(21,101,192,.15);white-space:nowrap;font-size:inherit;font-family:inherit;';
          frag.appendChild(sp);
          last = e;
          count++;
        }
        if (last > 0) {
          if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
          if (node.parentNode) node.parentNode.replaceChild(frag, node);
        }
      }
    } finally {
      // 변환으로 생긴 변동은 대기열에서 버려 자기 변동으로 다시 돌지 않게 한다.
      if (observer) observer.takeRecords();
      converting = false;
    }
    return count;
  }

  function schedule() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () {
      timer = null;
      if (converting) return;
      convert();
    }, DEBOUNCE_MS);
  }

  function hasNewContent(mutations) {
    for (var i = 0; i < mutations.length; i++) {
      var adds = mutations[i].addedNodes;
      for (var j = 0; j < adds.length; j++) {
        var node = adds[j];
        if (node.nodeType === 1) {
          if (node.hasAttribute && node.hasAttribute(ATTR)) continue;
          if (node.hasAttribute && node.hasAttribute(BAR_ATTR)) continue;
          if (node.id === 'pcalltoast') continue;
          return true;
        }
        if (node.nodeType === 3 && !inOwn(node)) return true;
      }
    }
    return false;
  }

  function startObserver() {
    if (observer || !document.body) return;
    observer = new MutationObserver(function (mutations) {
      if (converting) return;
      if (!hasNewContent(mutations)) return;
      schedule();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var close = t.closest('[data-pcall-close]');
    if (close) {
      var bar = document.getElementById('pcallbar');
      if (bar && bar.contains(close) && bar.parentNode) bar.parentNode.removeChild(bar);
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    var sp = t.closest('[' + ATTR + ']');
    if (sp) {
      showBar(sp.getAttribute(ATTR));
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);

  function boot(announce) {
    var found = convert();
    startObserver();
    if (announce) toast(found > 0 ? '전화번호 ' + found + '개를 터치할 수 있게 바꿨어요' : '이 화면에서 바꿀 전화번호를 찾지 못했어요');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { boot(true); }, { once: true });
  } else {
    boot(true);
  }
})();
