/* Family Dashboard – sleep screen.
 * After a set time with no touches the screen goes black, or black with a small dim clock. One touch wakes it
 * (that touch doesn't press anything underneath). During night hours it sleeps unless someone touches it, and goes
 * back to sleep 2 minutes after the last touch. It never sleeps over a ringing timer, a pop-up being used, the
 * keyboard or a voice command, and a timer going off wakes it.
 * Settings (admin app → Install): Screen sleep after (minutes), Sleep screen (Clock / Black), Night hours.
 */
(function () {
    'use strict';
    var cfg = { minutes: 30, style: 'clock', nightFrom: '23:30', nightTo: '06:30' };
    var NIGHT_IDLE = 2 * 60000;
    var lastTouch = Date.now(), asleep = false, el = null, clockT = null;

    function mins(hm) { var p = String(hm || '').split(':'); return p.length === 2 ? (+p[0]) * 60 + (+p[1]) : -1; }
    function isNight(d) {
        var f = mins(cfg.nightFrom), t = mins(cfg.nightTo); if (f < 0 || t < 0 || f === t) return false;
        var n = d.getHours() * 60 + d.getMinutes();
        return f < t ? (n >= f && n < t) : (n >= f || n < t);            // e.g. 23:30–06:30 crosses midnight
    }
    function busy() {
        return ['alarm', 'voice', 'osk', 'privacy'].some(function (id) { var e = document.getElementById(id); return e && (e.classList.contains('on') || id === 'privacy'); }) ||
            !!document.querySelector('#pop.on input:focus, #calDay.on .dl-confirm');
    }
    function build() {
        el = document.createElement('div');
        el.id = 'sleep'; el.className = 'sleep';
        el.innerHTML = '<div class="sl-clock"><b class="sl-time"></b><span class="sl-date"></span></div>';
        document.body.appendChild(el);
        // A touch on the dark screen only wakes it.
        ['pointerdown', 'pointerup', 'click', 'touchstart', 'touchend', 'mousedown', 'mouseup'].forEach(function (t) {
            el.addEventListener(t, function (e) { e.preventDefault(); e.stopPropagation(); if (t === 'pointerdown' || t === 'touchstart' || t === 'mousedown') wake(); }, { capture: true, passive: false });
        });
    }
    function paintClock() {
        if (!el) return;
        var d = new Date();
        el.querySelector('.sl-time').textContent = ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
        el.querySelector('.sl-date').textContent = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
        // Drift the clock slowly round the screen so nothing stays lit in one place all night.
        var m = d.getHours() * 60 + d.getMinutes(), c = el.querySelector('.sl-clock');
        c.style.left = (10 + (m * 7) % 70) + '%'; c.style.top = (18 + (m * 13) % 50) + '%';
    }
    function sleep() {
        if (asleep) return;
        if (!el) build();
        asleep = true;
        el.className = 'sleep on ' + (cfg.style === 'black' ? 'black' : 'clock');
        paintClock(); clearInterval(clockT); clockT = setInterval(paintClock, 20000);
        try { localStorage.setItem(KEEP, '1'); } catch (e) { /* ignore */ }
        if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    }
    function wake() {
        lastTouch = Date.now();
        if (!asleep) return;
        asleep = false; clearInterval(clockT);
        try { localStorage.removeItem(KEEP); } catch (e) { /* ignore */ }
        el.className = 'sleep';
    }
    // Any touch, click or key counts as someone using the screen.
    ['pointerdown', 'keydown', 'wheel'].forEach(function (t) { document.addEventListener(t, function () { if (!asleep) lastTouch = Date.now(); }, true); });

    function tick() {
        var now = new Date(), idle = Date.now() - lastTouch;
        if (asleep) {
            if (document.getElementById('alarm') && document.getElementById('alarm').classList.contains('on')) wake();   // the timer's going off
            return;
        }
        if (busy()) return;
        var limit = isNight(now) ? NIGHT_IDLE : (cfg.minutes > 0 ? cfg.minutes * 60000 : Infinity);
        if (idle >= limit) sleep();
    }
    setInterval(tick, 5000);
    // Asleep when the page reloaded (e.g. an automatic update in the night)? Stay asleep.
    var KEEP = 'familyDashboard.asleep';
    try { if (localStorage.getItem(KEEP) === '1') { if (document.body) sleep(); else document.addEventListener('DOMContentLoaded', sleep); } } catch (e) { /* ignore */ }

    window.FDSleep = {
        config: function (s) { if (s) { cfg = Object.assign(cfg, s); } },
        sleep: sleep, wake: wake, isAsleep: function () { return asleep; },
    };
})();
