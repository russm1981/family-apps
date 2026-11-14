/* Family Dashboard – is this browser keeping what the apps save?
 * The connection to your dashboard (and setup's progress) is kept in the browser's storage for this site. Some browser
 * settings – "Block all cookies", private/InPrivate windows, or clearing site data on every visit – stop that, so the
 * page forgets everything each time it's reloaded. Cookies would be blocked by the same settings, so instead we say so. */
(function () {
    var ok = false;
    try { localStorage.setItem('fd.storeTest', '1'); ok = localStorage.getItem('fd.storeTest') === '1'; localStorage.removeItem('fd.storeTest'); } catch (e) { ok = false; }
    window.FD_STORAGE_OK = ok;
    if (ok) return;
    function show() {
        if (document.getElementById('fdStoreWarn')) return;
        var b = document.createElement('div'); b.id = 'fdStoreWarn';
        b.style.cssText = 'position:sticky;top:0;z-index:9999;background:#3a1416;color:#ffd7d7;border-bottom:2px solid #e5484d;padding:12px 16px;font:15px/1.45 system-ui,-apple-system,Segoe UI,sans-serif';
        b.innerHTML = '<b>⚠ This browser isn’t letting this page save anything</b>, so it forgets your dashboard every time you reload. ' +
            'To fix it, click the icon at the left of the address bar → <b>Site settings</b> (or <b>Cookies and site data</b>) and choose <b>Allow</b> for ' + location.hostname + '. ' +
            'Also check you’re not in a private (InPrivate / Incognito) window, and that “Block all cookies” or “Clear cookies when you close” is off.';
        document.body.insertBefore(b, document.body.firstChild);
    }
    if (document.body) show(); else document.addEventListener('DOMContentLoaded', show);
})();
