/**
 * Builds the document that actually runs inside the render iframe.
 *
 * Plain `src="file.html"` is not enough: a page driven by JavaScript
 * (`setTimeout`, `setInterval`, `requestAnimationFrame`, `Date.now`) advances on
 * the *wall clock*, which is meaningless when frames are captured in parallel,
 * out of order, at whatever speed the CPU manages. The result is a video that
 * freezes on the first state and a bitrate too low to look good.
 *
 * So the page is inlined and a deterministic virtual clock is injected BEFORE
 * any of its own scripts run. The clock only moves when the renderer moves it,
 * making `setTimeout`-driven story boards, scene steppers, typing effects, etc.
 * frame-exact.
 */

import { FONT_CSS } from './fonts.generated';

const CLOCK_SCRIPT = `
(function () {
  if (window.__virtualClockInstalled) return;
  window.__virtualClockInstalled = true;

  var RealDate = window.Date;
  var realRaf = window.requestAnimationFrame
    ? window.requestAnimationFrame.bind(window)
    : function (cb) { return window.setTimeout(function () { cb(Date.now()); }, 16); };
  window.__realRaf = realRaf;

  var EPOCH = 1700000000000; // fixed epoch so Date.now() is reproducible
  var now = 0;               // virtual time in ms
  var timers = [];           // {id, time, fn, args, interval}
  var nextId = 1;
  var MAX_TIMERS = 200000;

  window.__vnow = function () { return now; };
  window.__lastFiredAt = -1; // virtual time of the last timer fired in this advance
  window.__vtimers = function () { return timers.length; };

  function add(fn, delay, args, interval) {
    if (typeof fn !== 'function') return 0;
    var id = nextId++;
    var ms = Number(delay) || 0;
    if (ms < 0) ms = 0;
    timers.push({ id: id, time: now + ms, fn: fn, args: args, interval: interval ? Math.max(1, ms) : null });
    if (timers.length > MAX_TIMERS) timers.shift();
    return id;
  }

  function clear(id) {
    for (var i = 0; i < timers.length; i++) {
      if (timers[i].id === id) { timers.splice(i, 1); return; }
    }
  }

  window.setTimeout = function (fn, delay) {
    return add(fn, delay, Array.prototype.slice.call(arguments, 2), false);
  };
  window.setInterval = function (fn, delay) {
    return add(fn, delay, Array.prototype.slice.call(arguments, 2), true);
  };
  window.clearTimeout = clear;
  window.clearInterval = clear;
  window.requestAnimationFrame = function (cb) {
    // one virtual frame tick per scheduled animation frame
    return add(cb, 1000 / 60, [now + 1000 / 60], false);
  };
  window.cancelAnimationFrame = clear;

  window.performance.now = function () { return now; };
  window.Date.now = function () { return EPOCH + now; };
  var PatchedDate = function (a, b, c, d, e, f, g) {
    if (!(this instanceof PatchedDate)) return RealDate(EPOCH + now);
    switch (arguments.length) {
      case 0: return new RealDate(EPOCH + now);
      case 1: return new RealDate(a);
      case 2: return new RealDate(a, b);
      case 3: return new RealDate(a, b, c);
      case 4: return new RealDate(a, b, c, d);
      case 5: return new RealDate(a, b, c, d, e);
      case 6: return new RealDate(a, b, c, d, e, f);
      default: return new RealDate(a, b, c, d, e, f, g);
    }
  };
  PatchedDate.prototype = RealDate.prototype;
  PatchedDate.now = window.Date.now;
  PatchedDate.parse = RealDate.parse;
  PatchedDate.UTC = RealDate.UTC;
  window.Date = PatchedDate;

  /** Fire every timer due at or before \`target\` ms, in chronological order. */
  window.__advanceTo = function (target) {
    var guard = 0;
    window.__lastFiredAt = -1;
    for (;;) {
      var idx = -1;
      var best = Infinity;
      for (var i = 0; i < timers.length; i++) {
        var t = timers[i];
        if (t.time <= target && t.time < best) { best = t.time; idx = i; }
      }
      if (idx === -1) break;
      var timer = timers[idx];
      now = Math.max(now, timer.time);
      window.__lastFiredAt = now;
      if (timer.interval !== null) timer.time = now + timer.interval;
      else timers.splice(idx, 1);
      try {
        timer.fn.apply(window, timer.args || []);
      } catch (err) {
        console.error('[html-video] timer threw:', err);
      }
      if (++guard > MAX_TIMERS) {
        console.warn('[html-video] timer guard hit, stopping advance');
        break;
      }
    }
    if (target > now) now = target;
    return now;
  };

  /** Reset the virtual timeline (used when a renderer asks for an earlier frame). */
  window.__resetClock = function () {
    now = 0;
    timers.length = 0;
  };
})();
`;

const FREEZE_STYLE = `
*, *::before, *::after {
  animation-play-state: paused !important;
  caret-color: transparent !important;
  scroll-behavior: auto !important;
}
html, body { scrollbar-width: none !important; }
::-webkit-scrollbar { width: 0 !important; height: 0 !important; }
`;

const escapeForScript = (code: string): string => code.replace(/<\/script/gi, '<\\/script');

/**
 * Inline the page and prepend the virtual clock.
 * `baseHref` keeps relative images/CSS/fonts pointing at the right folder.
 */
export const buildSeekableDocument = (html: string, baseHref: string): string => {
  // The page is served from <server>/public/scenes/, the fonts live in
  // <server>/public/fonts/ — resolve them absolutely so every runner matches.
  const fontBase = (() => {
    try {
      return new URL('../fonts/', baseHref).href;
    } catch {
      return `${baseHref.replace(/scenes\/?$/, '')}fonts/`;
    }
  })();
  const fontCss = FONT_CSS.split('__FONT_BASE__').join(fontBase);

  const head =
    `<base href="${baseHref}">` +
    `<style id="remotion-fonts">${fontCss}</style>` +
    `<style id="remotion-seek-engine">${FREEZE_STYLE}</style>` +
    `<script>${escapeForScript(CLOCK_SCRIPT)}</script>`;

  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, `<head$1>${head}`);
  }
  if (/<html[^>]*>/i.test(html)) {
    return html.replace(/<html([^>]*)>/i, `<html$1><head>${head}</head>`);
  }
  return `<!DOCTYPE html><html><head>${head}</head><body>${html}</body></html>`;
};
