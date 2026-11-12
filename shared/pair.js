/* Family Dashboard – send this family's link to a new screen that shows a code like K7Q2-M9XD.
 * The link is locked with the code (AES-GCM; key = SHA-256 of the code) before it leaves the phone, and left with
 * the seller's licence server for up to 10 minutes, where the screen collects it. The server can't read it.
 */
(function () {
    'use strict';
    function hex(buf) { return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join(''); }
    function b64(buf) { var s = '', b = new Uint8Array(buf); for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s); }
    function sha(t) { return crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)); }
    function norm(c) { c = String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/0/g, 'O').replace(/1/g, 'I'); return c.length === 8 ? c.slice(0, 4) + '-' + c.slice(4) : ''; }
    function base() { return location.href.replace(/[#?].*$/, '').replace(/(admin|setup|pair|calendar)\/.*$/, '').replace(/index\.html$/, ''); }
    /** cfg: { url, code }. Returns a promise. */
    function send(code, cfg) {
        code = norm(code);
        if (!code) return Promise.reject(new Error('The code is 8 letters and numbers, like K7Q2-M9XD'));
        if (!cfg || !cfg.url || !cfg.code) return Promise.reject(new Error('This phone isn’t connected to a family yet'));
        if (!window.crypto || !crypto.subtle) return Promise.reject(new Error('This browser can’t do that – use the screen link instead'));
        return fetch(base() + 'version.json?t=' + Date.now(), { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (v) {
            if (!v.licence) throw new Error('Connecting by code isn’t available yet');
            var iv = crypto.getRandomValues(new Uint8Array(12));
            return Promise.all([sha('fd-pair-id:' + code), sha('fd-pair-key:' + code).then(function (k) { return crypto.subtle.importKey('raw', k, { name: 'AES-GCM' }, false, ['encrypt']); })])
                .then(function (x) {
                    return crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, x[1], new TextEncoder().encode(JSON.stringify({ url: cfg.url, code: cfg.code })))
                        .then(function (ct) {
                            return fetch(v.licence, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'pairPut', id: hex(x[0]).slice(0, 24), box: b64(iv) + '.' + b64(ct) }) });
                        });
                }).then(function (r) { return r.json(); }).then(function (d) { if (!d.ok) throw new Error(d.error || 'That didn’t work'); return code; });
        });
    }
    /** The family link this device already has (Family Admin, setup or the screen keep it here). */
    function saved() {
        var keys = ['fdapp.cfg.v1', 'fdsetup.v1', 'familyDashboard.cfg.v1'];
        for (var i = 0; i < keys.length; i++) {
            try { var c = JSON.parse(localStorage.getItem(keys[i]) || 'null'); if (c && c.url && c.code) return { url: c.url, code: c.code }; } catch (e) { /* ignore */ }
        }
        return null;
    }
    /** After sending: true once the screen or computer has collected it, false if it's still waiting there. */
    function collected(code) {
        code = norm(code);
        return fetch(base() + 'version.json?t=' + Date.now(), { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (v) {
            return sha('fd-pair-id:' + code).then(function (h) {
                return fetch(v.licence + '?action=pairPeek&id=' + hex(h).slice(0, 24) + '&t=' + Date.now(), { cache: 'no-store' }).then(function (r) { return r.json(); });
            });
        }).then(function (d) { if (!d || !d.ok || !('waiting' in d)) throw new Error('unknown'); return !d.waiting; });
    }
    window.FDPairSend = { send: send, norm: norm, saved: saved, collected: collected };

    /* ---- the other end: this device shows a code, and waits for a connected phone to send the family's link to it. */
    var A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    function newCode() {
        var a = new Uint8Array(8); crypto.getRandomValues(a);
        var c = Array.prototype.map.call(a, function (b) { return A[b % 32]; }).join('');
        return c.slice(0, 4) + '-' + c.slice(4);
    }
    function unb64(t) { var s = atob(t), b = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); return b; }
    function open(code, box) {
        var p = String(box).split('.');
        return sha('fd-pair-key:' + code).then(function (k) { return crypto.subtle.importKey('raw', k, { name: 'AES-GCM' }, false, ['decrypt']); })
            .then(function (key) { return crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(p[0]) }, key, unb64(p[1])); })
            .then(function (plain) { return JSON.parse(new TextDecoder().decode(plain)); });
    }
    /** Start waiting. onLink({url, code}) is called once a phone sends it. Returns { code, link (for a QR code), stop() }, or null if not possible here. */
    function receive(onLink, onState) {
        if (!window.crypto || !crypto.subtle) return null;
        var code = '';
        try { code = sessionStorage.getItem('fdPairCode') || ''; } catch (e) { /* fine */ }
        if (!code) { code = newCode(); try { sessionStorage.setItem('fdPairCode', code); } catch (e) { /* fine */ } }
        var timer = null, relay = '', stopped = false;
        function poll() {
            if (stopped || !relay) return;
            sha('fd-pair-id:' + code).then(function (h) {
                return fetch(relay + '?action=pairGet&id=' + hex(h).slice(0, 24) + '&t=' + Date.now(), { cache: 'no-store' }).then(function (r) { return r.json(); });
            }).then(function (d) {
                if (!d || !d.box || stopped) return;
                return open(code, d.box).then(function (cfg) { stop(); try { sessionStorage.removeItem('fdPairCode'); } catch (e) { /* fine */ } onLink(cfg); });
            }).catch(function () { /* try again shortly */ });
        }
        function stop() { stopped = true; clearInterval(timer); }
        fetch(base() + 'version.json?t=' + Date.now(), { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (v) {
            relay = v.licence || '';
            if (!relay) { if (onState) onState('unavailable'); return; }
            timer = setInterval(poll, 4000); poll(); if (onState) onState('waiting');
        }).catch(function () { if (onState) onState('offline'); });
        return { code: code, link: base() + 'pair/#c=' + code, stop: stop };
    }
    window.FDPairRecv = { receive: receive };
})();
