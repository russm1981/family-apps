/* Family Dashboard – shared code for the phone apps.
 * Talks to the same Google Apps Script web app as the XENEON EDGE dashboard.
 * Nothing private is stored in these files: the web app URL and access code are
 * entered once on each phone (or via a setup link) and kept on that phone only.
 */
(function () {
    'use strict';
    var KEY = 'fdapp.cfg.v1';

    function read() { try { return JSON.parse(localStorage.getItem(KEY) || 'null') || {}; } catch (e) { return {}; } }
    function write(c) { try { localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) { /* ignore */ } }

    /** Accepts a setup link (…#api=…&code=…), "url|code", or separate values. */
    function parseSetup(text) {
        text = String(text || '').trim();
        var m = text.match(/[#?&]api=([^&#\s]+)/), c = text.match(/[#?&]code=([^&#\s]+)/);
        if (m && c) return { url: decodeURIComponent(m[1]), code: decodeURIComponent(c[1]) };
        var p = text.split('|');
        if (p.length === 2 && /^https:\/\/script\.google\.com\//.test(p[0].trim())) return { url: p[0].trim(), code: p[1].trim() };
        return null;
    }

    // A setup link opened in the browser configures this phone, then the details are removed from the address bar.
    function fromHash() {
        var s = parseSetup(location.hash);
        if (s) { write(s); history.replaceState(null, '', location.pathname + location.search); return true; }
        return false;
    }
    fromHash();
    window.addEventListener('hashchange', function () { if (fromHash()) location.reload(); });

    var cfg = read();

    function fetchJson(url, opts) {
        var ctl = new AbortController();
        var t = setTimeout(function () { ctl.abort(); }, 25000);
        opts = opts || {};
        opts.signal = ctl.signal; opts.cache = 'no-store'; opts.redirect = 'follow';
        return fetch(url, opts).then(function (r) {
            if (!r.ok) throw new Error('Server said ' + r.status);
            return r.json();
        }).then(function (d) {
            if (d && d.ok === false) throw new Error(d.error || 'Request failed');
            return d;
        }, function (e) {
            throw new Error(e && e.name === 'AbortError' ? 'No reply – check your signal' : (e.message === 'Failed to fetch' ? 'Can’t reach the Google Sheet' : e.message));
        }).finally(function () { clearTimeout(t); });
    }

    var FD = window.FD = {
        configured: function () { return !!(cfg.url && cfg.code); },
        config: function () { return { url: cfg.url || '', code: cfg.code || '' }; },
        setConfig: function (url, code) { cfg = { url: String(url || '').trim(), code: String(code || '').trim() }; write(cfg); },
        clearConfig: function () { cfg = {}; try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } },
        parseSetup: parseSetup,

        get: function (action, params) {
            var q = 'action=' + encodeURIComponent(action) + '&code=' + encodeURIComponent(cfg.code) + '&t=' + Date.now();
            Object.keys(params || {}).forEach(function (k) { q += '&' + k + '=' + encodeURIComponent(params[k]); });
            return fetchJson(cfg.url + (cfg.url.indexOf('?') >= 0 ? '&' : '?') + q, { method: 'GET' });
        },
        post: function (body) {
            body = Object.assign({}, body, { code: cfg.code });
            // text/plain keeps it a "simple" request – Apps Script can't answer CORS preflights.
            return fetchJson(cfg.url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) });
        },

        esc: function (s) {
            return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
                return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
            });
        },
        /** Dark or light text for a background colour. */
        ink: function (hex) {
            var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex || ''));
            if (!m) return '#fff';
            return (0.299 * parseInt(m[1], 16) + 0.587 * parseInt(m[2], 16) + 0.114 * parseInt(m[3], 16)) > 160 ? '#151515' : '#fff';
        },
        pad: function (n) { return (n < 10 ? '0' : '') + n; },
        ymd: function (d) { return d.getFullYear() + '-' + FD.pad(d.getMonth() + 1) + '-' + FD.pad(d.getDate()); },
        parse: function (s) { var p = String(s).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); },
        addDays: function (d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); },
        monday: function (d) { return FD.addDays(new Date(d.getFullYear(), d.getMonth(), d.getDate()), -((d.getDay() + 6) % 7)); },
        DOW: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
        DAY: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
        MON: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
        MONTH: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
        nice: function (ds) { var d = FD.parse(ds); return FD.DOW[d.getDay()] + ' ' + d.getDate() + ' ' + FD.MON[d.getMonth()]; },

        toast: function (text, bad, undo) {
            var t = document.getElementById('toast');
            if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
            t.className = 'toast on' + (bad ? ' bad' : '');
            t.innerHTML = '<span>' + FD.esc(text) + '</span>' + (undo ? '<button>Undo</button>' : '');
            if (undo) t.querySelector('button').onclick = function () { t.className = 'toast'; undo(); };
            clearTimeout(FD._tt);
            FD._tt = setTimeout(function () { t.className = 'toast'; }, undo ? 8000 : 3000);
        },

        /** Full-screen "connect this phone" form. Calls done() once it works. */
        setupScreen: function (el, appName, done) {
            var c = FD.config();
            el.innerHTML =
                '<div class="setup"><div class="setup-card">' +
                '<img src="icons/icon-192.png" alt="" class="setup-icon">' +
                '<h1>' + FD.esc(appName) + '</h1>' +
                '<p class="mute">Connect this phone to your Family Dashboard. Paste the setup link Russ sent you, or fill in both boxes.</p>' +
                '<label>Setup link</label><input id="suLink" placeholder="Paste setup link" autocomplete="off">' +
                '<div class="or">or</div>' +
                '<label>Web app URL</label><input id="suUrl" placeholder="https://script.google.com/macros/s/…/exec" value="' + FD.esc(c.url) + '" autocomplete="off">' +
                '<label>Access code</label><input id="suCode" placeholder="Access code" value="' + FD.esc(c.code) + '" autocomplete="off" autocapitalize="off">' +
                '<button class="btn wide" id="suGo">Connect</button><p id="suErr" class="err"></p></div></div>';
            function go() {
                var s = FD.parseSetup(document.getElementById('suLink').value);
                var url = s ? s.url : document.getElementById('suUrl').value, code = s ? s.code : document.getElementById('suCode').value;
                if (!/^https:\/\/script\.google\.com\//.test(String(url).trim()) || !String(code).trim()) {
                    document.getElementById('suErr').textContent = 'That doesn’t look right – check the link, or the URL and code.'; return;
                }
                FD.setConfig(url, code);
                var b = document.getElementById('suGo'); b.disabled = true; b.textContent = 'Checking…';
                FD.get('state').then(function () { done(); }).catch(function (e) {
                    b.disabled = false; b.textContent = 'Connect';
                    document.getElementById('suErr').textContent = e.message;
                });
            }
            document.getElementById('suGo').onclick = go;
        },

        registerSW: function () {
            if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function () { /* fine without */ });
        },
    };
})();
