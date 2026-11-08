/* Family Dashboard – screen formats.
 *
 * Two layouts, chosen from the shape of the screen:
 *   wide      the Corsair XENEON EDGE (2560×720, 32:9) and similar very wide screens: four columns of widgets.
 *   standard  tablets (benchmark: Amazon Fire HD 10, 1920×1200 = 16:10) and computer browsers (16:9 / 16:10):
 *             two columns at a time – the page's other two columns are a swipe (or a tap on the arrows) away,
 *             and it turns over by itself every 30 seconds when nobody is touching it.
 * Anything else (a phone, a tablet held upright, a very odd window) gets the nearer layout, a warning and an orange dot.
 *
 * Also gives this screen a name and a random id, so the licence can count screens (phones don't count).
 */
(function () {
    'use strict';
    var WIDE = 32 / 9, STD = 16 / 10;
    var RANGES = { wide: [2.8, 4.3], standard: [1.3, 2.15] };
    var F = { kind: 'wide', supported: true, ratio: WIDE };

    function detect() {
        var w = window.innerWidth, h = window.innerHeight, r = w / Math.max(1, h);
        var forced = /[?&#]format=(wide|standard)/.exec(location.href);
        var kind = forced ? forced[1] : (Math.abs(Math.log(r / WIDE)) < Math.abs(Math.log(r / STD)) ? 'wide' : 'standard');
        var rg = RANGES[kind];
        F = { kind: kind, ratio: r, width: w, height: h, supported: !!forced || (r >= rg[0] && r <= rg[1]), portrait: r < 1 };
        document.body.classList.toggle('fmt-wide', kind === 'wide');
        document.body.classList.toggle('fmt-standard', kind === 'standard');
        var msg = F.supported ? '' : 'This screen is ' + w + '×' + h + (F.portrait ? ' and upright' : '') + '. The dashboard is made for the Corsair XENEON EDGE (very wide), a tablet such as the Fire HD 10 held sideways, or a computer browser – it’s showing the ' +
            (kind === 'wide' ? 'wide' : 'tablet') + ' layout, but some things may not fit.' + (F.portrait ? ' Turn the tablet sideways.' : '');
        if (window.FDHealth) FDHealth.note('format', msg);
        warn(msg);
        return F;
    }
    function warn(msg) {
        var b = document.getElementById('fmtNote');
        if (!msg) { if (b) b.style.display = 'none'; return; }
        try { if (sessionStorage.getItem('fdFmtSeen') === msg) return; } catch (e) { /* fine */ }
        if (!b) { b = document.createElement('div'); b.id = 'fmtNote'; b.className = 'notice'; document.body.appendChild(b); }
        b.innerHTML = '<span class="n-ico">▭</span><div class="n-text"><b>This screen is an unusual shape</b><span>' + msg + '</span></div><button class="n-btn ghost" data-f="ok">OK</button>';
        b.style.display = 'flex';
        b.onclick = function (e) { if (e.target.closest('[data-f]')) { b.style.display = 'none'; try { sessionStorage.setItem('fdFmtSeen', msg); } catch (x) { /* fine */ } } };
    }

    /* ---- this screen's identity (for the licence's screen count) */
    function deviceId() {
        var k = 'familyDashboard.deviceId', id = '';
        try { id = localStorage.getItem(k) || ''; } catch (e) { /* fine */ }
        if (!id) {
            var a = new Uint8Array(9); (window.crypto || {}).getRandomValues ? crypto.getRandomValues(a) : a.forEach(function (x, i) { a[i] = Math.random() * 256; });
            id = 'scr-' + Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
            try { localStorage.setItem(k, id); } catch (e) { /* fine */ }
        }
        return id;
    }
    function deviceName() {
        var ua = navigator.userAgent;
        var what = F.kind === 'wide' ? (Math.abs(F.ratio - WIDE) < 0.15 && F.width >= 2400 ? 'Corsair screen' : 'Wide screen')
            : /Silk|KF[A-Z]{2,4}/.test(ua) ? 'Fire tablet' : /iPad|Android(?!.*Mobile)/.test(ua) ? 'Tablet' : /Mobile/.test(ua) ? 'Phone' : 'Computer';
        return what + ' ' + deviceId().slice(-4);
    }

    /* ---- standard layout: two columns at a time */
    var flipTimer = null, lastTouch = Date.now();
    document.addEventListener('pointerdown', function () { lastTouch = Date.now(); }, true);
    function pager(sec) {
        var cols = sec.querySelectorAll(':scope > .wcol').length;
        var pg = sec.querySelector('.half-pager');
        if (F.kind !== 'standard' || cols <= 2) { sec.removeAttribute('data-half'); if (pg) pg.remove(); return; }
        if (!sec.hasAttribute('data-half')) sec.setAttribute('data-half', '0');
        if (!pg) {
            pg = document.createElement('div'); pg.className = 'half-pager';
            pg.innerHTML = '<button data-hp="-1" aria-label="Previous">‹</button><span></span><button data-hp="1" aria-label="Next">›</button>';
            sec.appendChild(pg);
            pg.addEventListener('click', function (e) { var b = e.target.closest('[data-hp]'); if (b) turn(sec, +b.getAttribute('data-hp')); });
            // Swipe left / right on the page.
            var x0 = null;
            sec.addEventListener('pointerdown', function (e) { x0 = e.clientX; }, true);
            sec.addEventListener('pointerup', function (e) { if (x0 != null && Math.abs(e.clientX - x0) > 80 && !e.target.closest('.leaflet-container')) turn(sec, e.clientX < x0 ? 1 : -1); x0 = null; }, true);
        }
        label(sec);
    }
    function label(sec) { var s = sec.querySelector('.half-pager span'); if (s) s.textContent = (+sec.getAttribute('data-half') + 1) + ' / 2'; }
    function turn(sec, dir) {
        var h = (+sec.getAttribute('data-half') + (dir > 0 ? 1 : 1)) % 2;     // only two halves: either way flips
        sec.setAttribute('data-half', String(h)); label(sec);
        if (window.FDPages && FDPages.shown) FDPages.shown(sec.getAttribute('data-page'));
    }
    function autoFlip() {
        clearInterval(flipTimer);
        flipTimer = setInterval(function () {
            if (F.kind !== 'standard' || Date.now() - lastTouch < 2 * 60000) return;
            var sec = document.querySelector('.screen.wpage.on[data-half]');
            if (sec && !document.querySelector('.pop.on, #health.on')) turn(sec, 1);
        }, 30000);
    }

    var rt = null;
    window.addEventListener('resize', function () {
        clearTimeout(rt);
        rt = setTimeout(function () { var was = F.kind; detect(); if (was !== F.kind) location.reload(); else Array.prototype.forEach.call(document.querySelectorAll('.screen.wpage'), pager); }, 400);
    });
    function start() { detect(); autoFlip(); }
    if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);

    window.FDFormat = {
        get: function () { return F; },
        detect: detect, pager: pager,
        deviceId: deviceId, deviceName: deviceName,
        /** Sent with the screen's page requests. */
        params: function () { return { dev: deviceId(), dn: deviceName(), fmt: F.kind }; },
    };
})();
