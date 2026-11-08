/* Family Dashboard – screen formats.
 *
 * Two layouts, chosen from the shape of the screen:
 *   wide      the Corsair XENEON EDGE (2560×720, 32:9) and similar very wide screens: four columns of widgets.
 *   standard  tablets (benchmark: Amazon Fire HD 10, 1920×1200 = 16:10): two columns at a time – each page with more
 *             than two columns gets two buttons in the side bar ("Home 1", "Home 2"); the children's page 2 a screen.
 *   computer  a computer browser (mouse, not touch): the Corsair layout, kept at its 32:9 shape and scaled to fit the
 *             window with black bars. The calendar's Year view uses the whole window (FDFormat.full).
 * Anything else (a phone, a tablet held upright, a very odd window) gets the nearer layout, a warning and an orange dot.
 *
 * Also gives this screen a name and a random id, so the licence can count screens (phones don't count).
 */
(function () {
    'use strict';
    var WIDE = 32 / 9, STD = 16 / 10;
    var RANGES = { wide: [2.8, 4.3], standard: [1.3, 2.15] };
    var F = { kind: 'wide', supported: true, ratio: WIDE };

    /** A computer: the main pointer is a mouse or trackpad (tablets and the Corsair's touch screen report "coarse"). */
    function isComputer() {
        try { return matchMedia('(pointer: fine)').matches && !/Android|iPad|iPhone|Silk|KF[A-Z]{2,4}|Mobile/.test(navigator.userAgent); } catch (e) { return false; }
    }
    var fullWin = false;
    /** Computer: size the page to 32:9 inside the window (or the whole window while fullWin), via CSS variables. */
    function box() {
        var root = document.documentElement, w = window.innerWidth, h = window.innerHeight;
        var on = F.kind === 'computer';
        root.classList.toggle('fmt-computer', on);
        root.classList.toggle('fmt-full', on && fullWin);
        if (!on) { ['--vh', '--vw', '--appW', '--appH'].forEach(function (k) { root.style.removeProperty(k); }); return; }
        var bw = w, bh = h;
        if (!fullWin) { bw = Math.min(w, h * WIDE); bh = bw / WIDE; }
        bw = Math.floor(bw); bh = Math.floor(bh);
        root.style.setProperty('--appW', bw + 'px'); root.style.setProperty('--appH', bh + 'px');
        root.style.setProperty('--vh', (bh / 100) + 'px'); root.style.setProperty('--vw', (bw / 100) + 'px');
    }
    function detect() {
        var w = window.innerWidth, h = window.innerHeight, r = w / Math.max(1, h);
        var forced = /[?&#]format=(wide|standard|computer)/.exec(location.href);
        var nearer = Math.abs(Math.log(r / WIDE)) < Math.abs(Math.log(r / STD)) ? 'wide' : 'standard';
        var kind = forced ? forced[1] : (nearer === 'standard' || r < RANGES.wide[0]) && isComputer() && r >= 1 ? 'computer' : nearer;
        var rg = RANGES[kind];
        F = { kind: kind, ratio: r, width: w, height: h, supported: !!forced || kind === 'computer' || (r >= rg[0] && r <= rg[1]), portrait: r < 1 };
        document.body.classList.toggle('fmt-wide', kind === 'wide' || kind === 'computer');   // a computer shows the Corsair layout
        document.body.classList.toggle('fmt-computer', kind === 'computer');
        document.body.classList.toggle('fmt-standard', kind === 'standard');
        box();
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
        if (window.FDNotices && FDNotices.stack) FDNotices.stack();
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
        var what = F.kind === 'computer' ? 'Computer' : F.kind === 'wide' ? (Math.abs(F.ratio - WIDE) < 0.15 && F.width >= 2400 ? 'Corsair screen' : 'Wide screen')
            : /Silk|KF[A-Z]{2,4}/.test(ua) ? 'Fire tablet' : /iPad|Android(?!.*Mobile)/.test(ua) ? 'Tablet' : /Mobile/.test(ua) ? 'Phone' : 'Computer';
        return what + ' ' + deviceId().slice(-4);
    }

    /* ---- standard layout (tablets): two columns at a time. Each half of a page has its own button in the side bar
     * ("Home 1", "Home 2" – pages.js); this just tidies up after the old on-page pager. */
    function pager(sec) {
        var pg = sec.querySelector('.half-pager'); if (pg) pg.remove();
        if (F.kind !== 'standard') sec.removeAttribute('data-half');
    }
    var rt = null;
    window.addEventListener('resize', function () {
        clearTimeout(rt);
        rt = setTimeout(function () { var was = F.kind; detect(); window.dispatchEvent(new Event('fdbox')); if (was !== F.kind) location.reload(); else Array.prototype.forEach.call(document.querySelectorAll('.screen.wpage'), pager); }, 400);
    });
    function start() { detect(); }
    if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);

    window.FDFormat = {
        get: function () { return F; },
        detect: detect, pager: pager,
        /** Year view on a computer: use the whole window (true) or go back to the 32:9 shape (false). */
        full: function (on) {
            on = !!on; if (on === fullWin) return;
            fullWin = on; box();
            window.dispatchEvent(new Event('fdbox'));
        },
        deviceId: deviceId, deviceName: deviceName,
        /** Sent with the screen's page requests. */
        params: function () { return { dev: deviceId(), dn: deviceName(), fmt: F.kind }; },
    };
})();
