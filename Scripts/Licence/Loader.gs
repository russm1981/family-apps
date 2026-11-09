/* Family Dashboard – licence server – LOADER (version 1.1)
 *
 * This small file is all that lives in this Apps Script project's "Code" file. Each time the script runs it fetches
 * the real program from where the apps are hosted (GitHub Pages), keeps a copy for a few hours so it stays quick,
 * and runs it. So:
 *   - updates arrive by themselves within a few minutes of being published – nothing to redeploy;
 *   - nothing here needs Google's Apps Script API or a Google Cloud project, and Google's limit of 200 saved
 *     versions doesn't matter (this file never changes);
 *   - if GitHub can't be reached it uses the last copy it saved (in a hidden tab of this Sheet).
 * Only paste a new copy of this file if the apps ask you to (a new loader version, or a new kind of permission).
 *
 * The functions at the bottom are the names Google calls (the web app, the menu, timers); each hands over to the
 * same-named function in the program.
 */
const FD_LOADER = (function () {
  const VERSION = '1.1';   // compared with version.json "loader": a higher number there asks families to paste this file again
  const DEFAULT_BASE = 'https://russm1981.github.io/family-apps/';
  const CODE = 'Scripts/Licence/Code.gs', HTML = 'Scripts/Licence/Admin.html';           // relative to the apps address
  const VKEY = 'licenceServer', VDECL = /const LS_VERSION = '([^']+)'/;  // version.json key, and how the program states its version
  const BACKUP = 'FD program (don’t edit)';
  const CHUNK = 30000, CELL = 45000, CHECK_SECS = 300, KEEP_SECS = 21600;
  let impl = null, src = null, html = null, ver = '', from = '';

  function props() { return PropertiesService.getScriptProperties(); }
  function cache() { try { return CacheService.getScriptCache(); } catch (e) { return null; } }
  function base() { return String(props().getProperty('fdAppsBase') || DEFAULT_BASE).replace(/\/?$/, '/'); }
  function get(u) {
    const r = UrlFetchApp.fetch(u + (u.indexOf('?') < 0 ? '?' : '&') + 't=' + Date.now(), { muteHttpExceptions: true, followRedirects: true });
    if (r.getResponseCode() !== 200) throw new Error('Couldn’t download ' + u + ' (' + r.getResponseCode() + ')');
    return r.getContentText();
  }
  function split(text, n) { const out = []; for (let i = 0; i < text.length; i += n) out.push(text.slice(i, i + n)); return out.length ? out : ['']; }

  /* ---- the cache (fast, up to 6 hours) */
  function fromCache() {
    const c = cache(); if (!c) return null;
    const meta = JSON.parse(c.get('fdl:meta') || 'null'); if (!meta) return null;
    const keys = []; for (let i = 0; i < meta.c; i++) keys.push('fdl:c' + i); for (let j = 0; j < meta.h; j++) keys.push('fdl:h' + j);
    const got = c.getAll(keys);
    if (keys.some(k => got[k] == null)) return null;
    let s = '', h = ''; for (let i = 0; i < meta.c; i++) s += got['fdl:c' + i]; for (let j = 0; j < meta.h; j++) h += got['fdl:h' + j];
    return { ver: meta.ver, src: s, html: h };
  }
  function toCache(p) {
    const c = cache(); if (!c) return;
    const cs = split(p.src, CHUNK), hs = split(p.html || '', CHUNK), all = {};
    cs.forEach((x, i) => { all['fdl:c' + i] = x; }); hs.forEach((x, i) => { all['fdl:h' + i] = x; });
    all['fdl:meta'] = JSON.stringify({ ver: p.ver, c: cs.length, h: hs.length });
    try { c.putAll(all, KEEP_SECS); } catch (e) { /* too big for the cache – the backup tab still works */ }
  }
  /* ---- the backup (a hidden tab in this Sheet, kept until the next version) */
  function sheetBook() { try { return SpreadsheetApp.getActive(); } catch (e) { return null; } }
  function fromBackup() {
    const ss = sheetBook(); if (!ss) return null;
    const sh = ss.getSheetByName(BACKUP); if (!sh || sh.getLastRow() < 2) return null;
    const v = sh.getRange(1, 1, sh.getLastRow(), 2).getValues();
    // Each cell starts with "|" so the Sheet never mistakes a piece of program for a formula or a number.
    const cut = x => String(x || '').replace(/^\|/, '');
    let s = '', h = ''; for (let i = 1; i < v.length; i++) { s += cut(v[i][0]); h += cut(v[i][1]); }
    return VDECL.test(s) ? { ver: String(v[0][0]), src: s, html: h } : null;
  }
  function toBackup(p) {
    const ss = sheetBook(); if (!ss) return;
    try {
      let sh = ss.getSheetByName(BACKUP);
      if (!sh) { sh = ss.insertSheet(BACKUP); try { sh.hideSheet(); } catch (e) { /* fine */ } }
      const cs = split(p.src, CELL), hs = split(p.html || '', CELL), n = Math.max(cs.length, hs.length);
      const rows = [[p.ver, 'Family Dashboard keeps its last program here in case GitHub can’t be reached. Don’t edit this tab.']];
      for (let i = 0; i < n; i++) rows.push(['|' + (cs[i] || ''), '|' + (hs[i] || '')]);
      sh.clearContents();
      sh.getRange(1, 1, rows.length, 2).setNumberFormat('@').setValues(rows);
    } catch (e) { console.warn('Loader backup: ' + e.message); }
  }
  /* ---- GitHub */
  function download(want) {
    const s = get(base() + CODE);
    const m = VDECL.exec(s);
    // Whole, and the version advertised? (GitHub Pages can lag a minute or two behind version.json.)
    if (!m || s.length < 20000 || !/function doGet\(/.test(s) || (want && m[1] !== want)) throw new Error('The program on GitHub isn’t ready yet' + (want ? ' (expected ' + want + ', found ' + (m ? m[1] : 'nothing') + ')' : ''));
    let h = ''; try { h = get(base() + HTML); } catch (e) { /* the Admin file in this project is used instead */ }
    return { ver: m[1], src: s, html: h };
  }
  function latest() { const v = JSON.parse(get(base() + 'version.json')); return { ver: String(v[VKEY] || ''), loader: String(v.loader || '') }; }

  /** The program to run: from the cache, checking GitHub for a newer one at most every 5 minutes. */
  function program(force) {
    if (src && !force) return;
    const c = cache();
    let p = force ? null : fromCache(); from = p ? 'cache' : '';
    let due = force || !p || !(c && c.get('fdl:checked'));
    if (due) {
      try {
        const L = latest();
        if (c) c.put('fdl:checked', '1', CHECK_SECS);
        if (L.loader && Number(L.loader) > Number(VERSION)) props().setProperty('fdLoaderNewer', L.loader); else props().deleteProperty('fdLoaderNewer');
        if (!p || p.ver !== L.ver) {
          try { const n = download(L.ver); toCache(n); toBackup(n); p = n; from = 'GitHub'; }
          catch (e) { console.warn('Loader: ' + e.message); if (!p) { p = fromBackup(); from = 'backup'; } }
        }
      } catch (e) {   // no internet, or a simple trigger (onOpen) that may not fetch
        if (!p) { p = fromBackup(); from = 'backup'; if (p) toCache(p); }
      }
    }
    if (!p) { p = download(''); toCache(p); toBackup(p); from = 'GitHub'; }
    src = p.src; html = p.html; ver = p.ver;
  }
  function run() {
    if (impl) return impl;
    program(false);
    impl = new Function('FD_LOADER', src + '\n;return function (name) { return eval(name); };')(API);
    return impl;
  }
  const API = {
    version: VERSION,
    /** A function of the program by name. */
    fn: function (name) { const f = run()(name); if (typeof f !== 'function') throw new Error('The program has no ' + name); return f; },
    /** The program's HTML file (the copy from GitHub, or the "Admin" file in this project). */
    html: function () { run(); return html || HtmlService.createHtmlOutputFromFile('Admin').getContent(); },
    /** Check for a newer program now (the apps' "Update now"). */
    refresh: function (why) {
      const was = ver || (fromCache() || {}).ver || '';
      try { const c = cache(); if (c) c.remove('fdl:checked'); } catch (e) { /* fine */ }
      const L = latest();
      if (!L.ver || L.ver === was) return { ok: true, upToDate: true, version: was, loader: true };
      const n = download(L.ver); toCache(n); toBackup(n);
      return { ok: true, updated: true, from: was, to: n.ver, loader: true };
    },
    /** Where the apps are hosted (the program tells the loader when it's changed in the settings). */
    setBase: function (b) { b = String(b || '').replace(/\/?$/, '/'); if (/^https:\/\//.test(b) && b !== base()) { props().setProperty('fdAppsBase', b); try { cache().remove('fdl:checked'); } catch (e) { /* fine */ } } },
    info: function () { return { loader: VERSION, program: ver, from: from, newerLoader: props().getProperty('fdLoaderNewer') || '' }; },
  };
  return API;
})();

function fdCall_(name, args) { return FD_LOADER.fn(name).apply(null, args); }

/** Menu "Load the dashboard program again" (also shown if the program couldn't be loaded when the Sheet opened). */
function fdRepair() {
  let msg;
  try { const r = FD_LOADER.refresh('menu'); msg = r.updated ? 'Loaded version ' + r.to + ' from GitHub.' : 'Already the newest version (' + r.version + ').'; }
  catch (e) { msg = 'Couldn’t load it: ' + e.message; }
  try { SpreadsheetApp.getUi().alert('Family Dashboard', msg, SpreadsheetApp.getUi().ButtonSet.OK); } catch (e) { console.log(msg); }
}
function onOpen(e) {
  try { fdCall_('onOpen', [e]); }
  catch (err) {
    try { SpreadsheetApp.getUi().createMenu('🔑 Licences').addItem('Load the dashboard program', 'fdRepair').addToUi(); } catch (x) { /* no UI */ }
  }
}
// Names Google calls: the web app, the menu, the timer.
function doGet() { return fdCall_('doGet', arguments); }
function doPost() { return fdCall_('doPost', arguments); }
function setup() { return fdCall_('setup', arguments); }
function updateTick() { return fdCall_('updateTick', arguments); }
function menuAddresses() { return fdCall_('menuAddresses', arguments); }
function menuPassword() { return fdCall_('menuPassword', arguments); }
function menuPortal() { return fdCall_('menuPortal', arguments); }
function menuUpdate() { return fdCall_('menuUpdate', arguments); }
function admin() { return fdCall_('admin', arguments); }

