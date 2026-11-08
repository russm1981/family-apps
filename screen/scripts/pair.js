/* Family Dashboard – connecting a new screen without a keyboard (a Raspberry Pi or tablet straight out of the box).
 *
 * The screen shows a QR code and a short code (e.g. K7Q2-M9XD). On a phone:
 *   - scan the QR code: if that phone already uses Family Admin, one tap connects the screen;
 *     if it's a brand-new family, it goes to first-time setup, and connects the screen at the end;
 *   - or in Family Admin → Settings → Devices → Add another screen, type the code.
 * The phone locks the family's link with the code (AES-GCM, key from the code) and leaves it with the seller's
 * licence server for up to 10 minutes; this screen collects it and unlocks it. The server never sees the link.
 */
(function () {
    'use strict';
    var A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    var el = null, timer = null, relay = '', code = '';
    function api() { return window.FDApi; }
    function esc(s) { return api() ? api().esc(s) : String(s); }
    function base() { return /^https?:/.test(location.protocol) ? new URL('../', location.href).href : 'https://russm1981.github.io/family-apps/'; }
    function newCode() {
        var a = new Uint8Array(8); crypto.getRandomValues(a);
        var c = Array.prototype.map.call(a, function (b) { return A[b % 32]; }).join('');
        return c.slice(0, 4) + '-' + c.slice(4);
    }
    function hex(buf) { return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join(''); }
    function sha(t) { return crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)); }
    function unb64(t) { var s = atob(t), b = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); return b; }
    function idOf(c) { return sha('fd-pair-id:' + c).then(function (h) { return hex(h).slice(0, 24); }); }
    function open(c, box) {
        var p = String(box).split('.');
        return sha('fd-pair-key:' + c).then(function (k) { return crypto.subtle.importKey('raw', k, { name: 'AES-GCM' }, false, ['decrypt']); })
            .then(function (key) { return crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(p[0]) }, key, unb64(p[1])); })
            .then(function (plain) { return JSON.parse(new TextDecoder().decode(plain)); });
    }
    function qr(text) {
        if (!window.qrcode) return '';
        var q = qrcode(0, 'M'); q.addData(text); q.make(); return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
    }
    function poll() {
        if (!relay || !code) return;
        idOf(code).then(function (id) {
            return fetch(relay + '?action=pairGet&id=' + id + '&t=' + Date.now(), { cache: 'no-store' }).then(function (r) { return r.json(); });
        }).then(function (d) {
            if (!d || !d.box) return;
            return open(code, d.box).then(function (cfg) {
                stop();
                el.querySelector('.pr-state').textContent = '✔ Connected – starting…';
                api().connect('#api=' + encodeURIComponent(cfg.url) + '&code=' + encodeURIComponent(cfg.code));
            });
        }).catch(function () { /* try again shortly */ });
    }
    function stop() { clearInterval(timer); timer = null; }
    function show() {
        if (!window.crypto || !crypto.subtle) return false;                 // file:// – the old paste box is used instead
        if (el && el.style.display === 'flex') return true;
        var saved = ''; try { saved = sessionStorage.getItem('fdPairCode') || ''; } catch (e) { /* fine */ }
        code = saved || newCode();
        try { sessionStorage.setItem('fdPairCode', code); } catch (e) { /* fine */ }
        var link = base() + 'pair/#c=' + code;
        if (!el) { el = document.createElement('div'); el.id = 'pairScreen'; el.className = 'pair-screen'; document.body.appendChild(el); }
        el.innerHTML = '<div class="pr-card"><div class="pr-qr">' + qr(link) + '</div><div class="pr-text"><h1>Hello! Let’s connect this screen</h1>' +
            '<ol><li>Scan the code with your phone’s camera.</li>' +
            '<li><b>New to Family Dashboard?</b> Your phone takes you through setting up first (about 30 minutes), then connects this screen.</li>' +
            '<li><b>Already set up?</b> One tap on your phone connects it.</li></ol>' +
            '<p class="pr-code">Or in Family Admin → Settings → Devices → <b>Add another screen</b>, and type <span class="pr-c">' + esc(code) + '</span></p>' +
            '<p class="pr-state">Waiting for your phone…</p>' +
            '<details class="pr-paste"><summary>Have a keyboard? Paste a screen link instead</summary><div class="connect-row"><input id="pairIn" placeholder="Paste your screen link" autocomplete="off" spellcheck="false"><button id="pairGo">Connect</button></div></details>' +
            '</div></div>';
        el.style.display = 'flex';
        var go = function () { if (!api().connect(document.getElementById('pairIn').value)) api().toast('That isn’t a Family Dashboard link', true); };
        document.getElementById('pairGo').onclick = go;
        document.getElementById('pairIn').onkeydown = function (e) { if (e.key === 'Enter') go(); };
        // Where to collect the link from: the licence server named in version.json.
        fetch(base() + 'version.json?t=' + Date.now(), { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (v) {
            relay = v.licence || '';
            if (!relay) { el.querySelector('.pr-state').textContent = 'Connecting by phone isn’t available yet – paste a screen link instead.'; return; }
            stop(); timer = setInterval(poll, 4000); poll();
        }).catch(function () { el.querySelector('.pr-state').textContent = 'No internet yet – check this screen’s Wi-Fi or cable.'; setTimeout(function () { el.style.display = 'none'; show(); }, 15000); });
        return true;
    }
    window.FDPair = { show: show, hide: function () { stop(); if (el) el.style.display = 'none'; } };
})();
