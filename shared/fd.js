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

    // iPhone / iPad: there is no "Install" button in Safari – the app is added with Share → Add to Home Screen, and the
    // home-screen app keeps its own storage, separate from Safari's. So in Safari the family's link stays in the address
    // (and in the app's start address) for Add to Home Screen to carry across; the home-screen app then tidies it away.
    var IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
    var STANDALONE = !!(navigator.standalone || (window.matchMedia && matchMedia('(display-mode: standalone)').matches));
    var KEEP_LINK = IOS && !STANDALONE;

    // A setup link opened in the browser configures this phone, then the details are removed from the address bar.
    function fromHash() {
        var s = parseSetup(location.hash);
        if (s) { write(s); if (!KEEP_LINK) history.replaceState(null, '', location.pathname + location.search); return true; }
        return false;
    }
    fromHash();
    window.addEventListener('hashchange', function () { if (fromHash()) location.reload(); });

    var cfg = read();

    /** iPhone Safari: put the link back in the address and the app's start address, and explain how to install. */
    function iosInstall() {
        if (!KEEP_LINK || !cfg.url || !cfg.code) return;
        var hash = '#api=' + encodeURIComponent(cfg.url) + '&code=' + encodeURIComponent(cfg.code);
        if (location.hash !== hash) history.replaceState(null, '', location.pathname + location.search + hash);
        var link = document.querySelector('link[rel=manifest]');
        if (link && !link.dataset.fdIos) {
            fetch(link.href).then(function (r) { return r.json(); }).then(function (m) {
                var base = new URL(link.href, location.href);
                m.start_url = location.href; m.scope = new URL(m.scope || './', base).href; m.id = new URL(m.id || './', base).href;
                (m.icons || []).forEach(function (i) { i.src = new URL(i.src, base).href; });
                link.dataset.fdIos = '1';
                link.href = 'data:application/manifest+json,' + encodeURIComponent(JSON.stringify(m));
            }).catch(function () { /* the address bar still has the link */ });
        }
        var seen = 0; try { seen = Number(localStorage.getItem('fdapp.iosHint') || 0); } catch (e) { /* fine */ }
        if (Date.now() - seen < 3 * 86400000) return;
        var b = document.createElement('div');
        b.className = 'fd-ios-hint';
        b.setAttribute('style', 'position:fixed;left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom));z-index:9999;background:#1d2533;color:#eef1f6;' +
            'border:1px solid #3fa9f5;border-radius:14px;padding:12px 14px;font:15px/1.4 -apple-system,system-ui,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.5);display:flex;gap:10px;align-items:flex-start');
        b.innerHTML = '<div style="flex:1"><b>Install this app on your iPhone</b><br>Tap <b>Share</b> <span style="display:inline-block;border:1.5px solid currentColor;border-radius:3px;padding:0 4px;font-size:12px">↑</span> ' +
            'at the bottom of Safari (iPad: top right), scroll down and choose <b>Add to Home Screen</b>, then <b>Add</b>. ' +
            'Open it from the new icon – it’s already connected to your family.</div><button style="background:none;border:0;color:#9fb3c8;font-size:20px;padding:0 4px" aria-label="Close">✕</button>';
        b.querySelector('button').onclick = function () { b.remove(); try { localStorage.setItem('fdapp.iosHint', String(Date.now())); } catch (e) { /* fine */ } };
        document.body.appendChild(b);
    }
    if (document.body) iosInstall(); else document.addEventListener('DOMContentLoaded', iosInstall);

    /* ---- Keeping an app that's left open for days up to date.
     * Checks version.json when the app opens, whenever it comes back to the front, and every 15 minutes while it's
     * showing. A newer version: fetch fresh copies of the files and restart – straight away if nobody's in the middle of
     * something, otherwise a "Restart to update" bar (and it restarts by itself next time the app is opened). */
    var updTried = '';
    function newerVer(a, b) {
        var x = String(a || '').split('.').map(Number), y = String(b || '').split('.').map(Number);
        for (var i = 0; i < Math.max(x.length, y.length); i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); }
        return false;
    }
    function midTask() {
        var a = document.activeElement;
        if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.value) return true;
        return !!document.querySelector('.sheet-bg.on, .ov.on, dialog[open]');
    }
    function restart(ver) {
        try { sessionStorage.setItem('fdUpdTo', ver + '|' + Date.now()); } catch (e) { /* fine */ }
        var files = [location.pathname];
        Array.prototype.forEach.call(document.querySelectorAll('script[src], link[rel=stylesheet]'), function (el) { files.push(el.getAttribute('src') || el.getAttribute('href')); });
        var gone = false, done = function () { if (!gone) { gone = true; location.reload(); } };
        setTimeout(done, 5000);   // never wait longer than this
        Promise.all(files.map(function (f) { return fetch(f, { cache: 'reload' }).catch(function () { /* offline */ }); }))
            .then(function () { return navigator.serviceWorker && navigator.serviceWorker.getRegistration ? navigator.serviceWorker.getRegistration().then(function (r) { return r && r.update(); }) : null; })
            .then(done, done);
    }
    function checkUpdate(opening) {
        if (document.hidden || !/^https?:/.test(location.protocol)) return;
        fetch(new URL('../version.json', location.href).href + '?t=' + Date.now(), { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (v) {
            if (!v || !newerVer(v.app, FD.VERSION)) { var b0 = document.getElementById('fdUpd'); if (b0) b0.remove(); return; }
            // Just restarted for this version but GitHub still served the old files: don't loop – try again in 10 minutes.
            var last = ''; try { last = sessionStorage.getItem('fdUpdTo') || ''; } catch (e) { /* fine */ }
            var lp = last.split('|'); if (lp[0] === v.app && Date.now() - Number(lp[1] || 0) < 10 * 60000) return;
            if (opening || !midTask()) { restart(v.app); return; }
            if (document.getElementById('fdUpd') || updTried === v.app) return;
            updTried = v.app;
            var bar = document.createElement('div'); bar.id = 'fdUpd';
            bar.setAttribute('style', 'position:fixed;left:12px;right:12px;top:calc(10px + env(safe-area-inset-top));z-index:9998;background:#1d2533;color:#eef1f6;border:1px solid #3fa9f5;' +
                'border-radius:14px;padding:10px 12px;font:15px/1.35 -apple-system,system-ui,sans-serif;display:flex;gap:10px;align-items:center;box-shadow:0 8px 30px rgba(0,0,0,.5)');
            bar.innerHTML = '<span style="flex:1"><b>Update ready</b> (' + String(v.app).replace(/[<>&"]/g, '') + ')</span><button style="background:#3fa9f5;color:#fff;border:0;border-radius:10px;padding:8px 12px;font-weight:700">Restart</button>';
            bar.querySelector('button').onclick = function () { restart(v.app); };
            document.body.appendChild(bar);
        }).catch(function () { /* offline – next time */ });
    }
    var autoUpdateOn = false;
    function autoUpdate() {
        if (autoUpdateOn) return; autoUpdateOn = true;
        setTimeout(function () { checkUpdate(true); }, 3000);
        setInterval(function () { checkUpdate(false); }, 15 * 60000);
        var hiddenAt = 0;
        document.addEventListener('visibilitychange', function () {
            if (document.hidden) { hiddenAt = Date.now(); return; }
            // Back to the front after a while away counts as opening the app: safe to restart straight away.
            checkUpdate(Date.now() - hiddenAt > 5 * 60000);
        });
    }

    function fetchJson(url, opts) {
        var ctl = new AbortController();
        opts = opts || {};
        var t = setTimeout(function () { ctl.abort(); }, opts.timeout || 25000);
        opts.signal = ctl.signal; opts.cache = 'no-store'; opts.redirect = 'follow';
        return fetch(url, opts).then(function (r) {
            if (!r.ok) throw new Error('Server said ' + r.status);
            return r.json();
        }).then(function (d) {
            // The dashboard has moved to a new Sheet ("Start afresh"): remember the new address and ask again there.
            if (d && d.moved && /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(d.moved) && cfg.url && url.indexOf(cfg.url) === 0 && !opts.moved) {
                var old = cfg.url; cfg.url = d.moved; write(cfg);
                opts.moved = true;
                return fetchJson(d.moved + url.slice(old.length), opts);
            }
            if (d && d.ok === false) {
                if (/^Licence needed: /.test(d.error || '')) licenceNeeded(d.error.replace(/^Licence needed: /, ''));
                throw new Error(d.error || 'Request failed');
            }
            return d;
        }, function (e) {
            throw new Error(e && e.name === 'AbortError' ? 'No reply – check your signal' : (e.message === 'Failed to fetch' ? 'Can’t reach the Google Sheet' : e.message));
        }).finally(function () { clearTimeout(t); });
    }

    /** The dashboard has no working licence: say so clearly, once, with a box to put the key in, rather than leaving things blank. */
    function licenceNeeded(msg) {
        if (document.getElementById('fdLic')) return;
        var d = document.createElement('div');
        d.id = 'fdLic';
        d.setAttribute('style', 'position:fixed;inset:0;z-index:99999;background:rgba(5,8,12,.88);display:flex;align-items:center;justify-content:center;padding:16px;font-family:system-ui,-apple-system,sans-serif');
        d.innerHTML = '<div style="background:#161b22;color:#eef1f3;border:1px solid #2f373f;border-radius:16px;max-width:440px;width:100%;padding:22px 20px;text-align:center">' +
            '<div style="font-size:42px">🔑</div><h2 style="margin:6px 0 8px;font-size:20px">Licence key needed</h2>' +
            '<p style="margin:0 0 10px;line-height:1.45">' + FD.esc(msg) + '</p>' +
            '<p style="margin:0 0 8px;color:#9aa6b1;font-size:14px">Your key is in your order email. It starts FD-.</p>' +
            '<input id="fdLicIn" placeholder="FD-XXXXX-XXXXX-XXXXX-XXXXX" autocapitalize="characters" spellcheck="false" autocomplete="off" ' +
            'style="width:100%;box-sizing:border-box;font:600 17px ui-monospace,Menlo,Consolas,monospace;padding:12px;border-radius:10px;border:1px solid #2f373f;background:#0c0f15;color:#fff;text-transform:uppercase">' +
            '<button id="fdLicGo" style="margin-top:10px;width:100%;padding:12px;border:0;border-radius:10px;background:#3fa9f5;color:#fff;font-weight:700;font-size:16px">Check and save</button>' +
            '<p id="fdLicMsg" style="min-height:1.3em;margin:10px 0 0;font-size:14px"></p>' +
            '<p style="margin:6px 0 0;color:#9aa6b1;font-size:13px">No key, or it says it’s in use? Contact the person who sold you the dashboard.</p>' +
            '<button id="fdLicX" style="margin-top:8px;background:none;border:0;color:#9aa6b1;text-decoration:underline;font-size:13px">Not now</button></div>';
        document.body.appendChild(d);
        var go = function () {
            var k = document.getElementById('fdLicIn').value.trim(), m = document.getElementById('fdLicMsg');
            if (!k) { m.textContent = 'Type or paste your key in first.'; return; }
            m.textContent = 'Checking…';
            FD.post({ action: 'setLicence', key: k }).then(function () { m.textContent = '✔ Licence saved'; setTimeout(function () { location.reload(); }, 900); },
                function (e) { m.textContent = '⚠ ' + e.message; });
        };
        document.getElementById('fdLicGo').onclick = go;
        document.getElementById('fdLicIn').onkeydown = function (e) { if (e.key === 'Enter') go(); };
        document.getElementById('fdLicX').onclick = function () { d.remove(); };
    }

    var FD = window.FD = {
        configured: function () { return !!(cfg.url && cfg.code); },
        config: function () { return { url: cfg.url || '', code: cfg.code || '' }; },
        setConfig: function (url, code) { cfg = { url: String(url || '').trim(), code: String(code || '').trim() }; write(cfg); iosInstall(); },
        clearConfig: function () { cfg = {}; try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } },
        parseSetup: parseSetup,

        VERSION: '2026.11.107',     // the phone apps' version (same number as the screen's)
        get: function (action, params, timeout) {
            var q = 'action=' + encodeURIComponent(action) + '&code=' + encodeURIComponent(cfg.code) + '&t=' + Date.now();
            Object.keys(params || {}).forEach(function (k) { q += '&' + k + '=' + encodeURIComponent(params[k]); });
            return fetchJson(cfg.url + (cfg.url.indexOf('?') >= 0 ? '&' : '?') + q, { method: 'GET', timeout: timeout });
        },
        post: function (body, timeout) {
            body = Object.assign({}, body, { code: cfg.code });
            // text/plain keeps it a "simple" request – Apps Script can't answer CORS preflights.
            return fetchJson(cfg.url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), timeout: timeout });
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
        /** Not connected yet: connect from a phone that already is (a code / QR code), use a link this browser already has,
         *  or paste a setup link. */
        setupScreen: function (el, appName, done) {
            var c = FD.config(), other = window.FDPairSend && FDPairSend.saved && FDPairSend.saved();
            var waiter = window.FDPairRecv ? FDPairRecv.receive(function (cfg) {
                FD.setConfig(cfg.url, cfg.code);
                var st = document.getElementById('suState'); if (st) st.textContent = '✔ Connected – starting…';
                FD.get('state').then(function () { done(); }, function () { done(); });
            }, function (state) {
                var st = document.getElementById('suState'); if (!st) return;
                st.textContent = state === 'waiting' ? 'Waiting for your phone…' : state === 'offline' ? 'No internet connection – check it and reload.' : 'Connecting by code isn’t available – use a setup link below.';
            }) : null;
            var qr = '';
            if (waiter && window.qrcode) { try { var q = qrcode(0, 'M'); q.addData(waiter.link); q.make(); qr = q.createSvgTag({ cellSize: 4, margin: 2, scalable: true }); } catch (e) { qr = ''; } }
            el.innerHTML =
                '<div class="setup"><div class="setup-card">' +
                '<img src="' + (/\/setup\//.test(location.pathname) ? '../admin/' : '') + 'icons/icon-192.png" alt="" class="setup-icon">' +
                '<h1>' + FD.esc(appName) + '</h1>' +
                (other ? '<p>This browser is already connected to a Family Dashboard (another of its apps).</p><button class="btn wide" id="suSame">Use the same family</button><div class="or">or</div>' : '') +
                (waiter ? '<p><b>Connect from your phone</b> – on a phone that already has Family Admin: <b>More → Devices → Connect by code</b>, and type</p>' +
                    '<p class="su-code" style="font:800 30px/1.2 ui-monospace,Menlo,Consolas,monospace;letter-spacing:2px;text-align:center;margin:8px 0">' + FD.esc(waiter.code) + '</p>' +
                    (qr ? '<p class="mute small" style="text-align:center">or scan this with the phone’s camera:</p><div style="background:#fff;border-radius:12px;padding:8px;width:180px;margin:6px auto">' + qr + '</div>' : '') +
                    '<p class="mute small" id="suState" style="text-align:center">Waiting for your phone…</p>' : '') +
                '<details' + (waiter ? '' : ' open') + '><summary>Or paste a setup link</summary>' +
                '<label>Setup link</label><input id="suLink" placeholder="Paste setup link" autocomplete="off">' +
                '<div class="or">or</div>' +
                '<label>Web app URL</label><input id="suUrl" placeholder="https://script.google.com/macros/s/…/exec" value="' + FD.esc(c.url) + '" autocomplete="off">' +
                '<label>Access code</label><input id="suCode" placeholder="Access code" value="' + FD.esc(c.code) + '" autocomplete="off" autocapitalize="off">' +
                '<button class="btn wide" id="suGo">Connect</button></details><p id="suErr" class="err"></p></div></div>';
            function use(url, code, btn) {
                FD.setConfig(url, code);
                btn.disabled = true; var was = btn.textContent; btn.textContent = 'Checking…';
                FD.get('state').then(function () { if (waiter) waiter.stop(); done(); }).catch(function (e) {
                    btn.disabled = false; btn.textContent = was;
                    document.getElementById('suErr').textContent = e.message;
                });
            }
            function go() {
                var s = FD.parseSetup(document.getElementById('suLink').value);
                var url = s ? s.url : document.getElementById('suUrl').value, code = s ? s.code : document.getElementById('suCode').value;
                if (!/^https:\/\/script\.google\.com\//.test(String(url).trim()) || !String(code).trim()) {
                    document.getElementById('suErr').textContent = 'That doesn’t look right – check the link, or the URL and code.'; return;
                }
                use(url, code, document.getElementById('suGo'));
            }
            document.getElementById('suGo').onclick = go;
            if (other) document.getElementById('suSame').onclick = function () { use(other.url, other.code, this); };
        },

        registerSW: function () {
            if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function () { /* fine without */ });
            autoUpdate();
        },
    };
})();
