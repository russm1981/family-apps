/* Family Dashboard – update checks and the privacy notice on the screen.
 * - Every 10 minutes the screen reads version.json from where the apps are hosted (GitHub Pages). If there's a newer
 *   screen version it offers "Update now / Later". (Restarting the PC also picks up the new version.)
 * - If the family's Google script is older than the version the apps need, it says how to update it.
 * - If the privacy notice hasn't been accepted (or has changed since), it must be accepted before carrying on.
 */
(function () {
    'use strict';
    var APP_VERSION = '2026.11.14';
    var SNOOZE_KEY = 'familyDashboard.updateSnooze', SCRIPT_KEY = 'familyDashboard.scriptNag';
    var latest = null, lastLayout = null, privacyOpen = false, lastTouch = Date.now(), updating = false;
    var IDLE_MS = 3 * 60000;       // nobody has touched the screen for 3 minutes → update by itself
    document.addEventListener('pointerdown', function () { lastTouch = Date.now(); }, true);
    /** Something on screen that an automatic reload would interrupt: an alarm, a pop-up, the keyboard, voice, adding to the calendar. */
    function busyScreen() {
        return ['alarm', 'pop', 'voice', 'osk'].some(function (id) { var e = document.getElementById(id); return e && e.classList.contains('on'); }) ||
            !!document.querySelector('#screen-calendar.adding') || privacyOpen;
    }
    function api() { return window.FDApi; }
    function esc(s) { return api().esc(s); }
    function newer(a, b) {
        var x = String(a || '').split('.').map(Number), y = String(b || '').split('.').map(Number);
        for (var i = 0; i < Math.max(x.length, y.length); i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); }
        return false;
    }
    function banner(id, html) {
        var b = document.getElementById(id);
        if (!b) { b = document.createElement('div'); b.id = id; b.className = 'notice'; document.body.appendChild(b); }
        b.innerHTML = html; b.style.display = html ? 'flex' : 'none';
        return b;
    }
    function versionUrl() {
        // Hosted: …/family-apps/screen/ → …/family-apps/version.json. Running from files on the PC: ask the hosted copy.
        if (/^https?:/.test(location.protocol)) return new URL('../version.json', location.href).href;
        var base = lastLayout && lastLayout.appsAddress;
        return base ? base.replace(/\/?$/, '/') + 'version.json' : '';
    }
    function checkForUpdate() {
        var u = versionUrl(); if (!u) return;
        fetch(u + '?t=' + Date.now(), { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (v) {
            if (!v) return;
            latest = v;
            showUpdate(); showScript();
        }).catch(function () { /* offline or running from files – try later */ });
    }
    function showUpdate() {
        var snooze = Number(api().load(SNOOZE_KEY) || 0);
        if (!latest || !newer(latest.app, APP_VERSION)) { banner('updBanner', ''); return; }
        // Nobody using it: just update. (Also after a "Later", once the screen is idle.)
        if (Date.now() - lastTouch > IDLE_MS && !busyScreen()) {
            var tried = String(api().load('familyDashboard.autoUpdate') || '').split('|');   // "version|time" of the last try
            if (tried[0] !== latest.app || Date.now() - Number(tried[1] || 0) > 30 * 60000) {
                api().store('familyDashboard.autoUpdate', latest.app + '|' + Date.now());
                update(); return;
            }
        }
        if (Date.now() < snooze) { banner('updBanner', ''); return; }
        var b = banner('updBanner', '<span class="n-ico">⬆</span><div class="n-text"><b>Update available (' + esc(latest.app) + ')</b>' +
            (latest.notes ? '<span>' + latest.notes.map(esc).join(' · ') + '</span>' : '') + '</div>' +
            '<button class="n-btn" data-u="now">Update now</button><button class="n-btn ghost" data-u="later">Later</button>');
        b.onclick = function (e) {
            var x = e.target.closest('[data-u]'); if (!x) return;
            if (x.getAttribute('data-u') === 'later') { api().store(SNOOZE_KEY, String(Date.now() + 24 * 3600000)); banner('updBanner', ''); return; }
            b.innerHTML = '<span class="n-ico">⏳</span><div class="n-text"><b>Updating…</b></div>';
            update();
        };
    }
    /** Fetch fresh copies of every file first (so the browser cache can't hand back the old ones), then reload. */
    function update() {
        if (updating) return; updating = true;
        var files = ['index.html'];
        Array.prototype.forEach.call(document.querySelectorAll('script[src], link[rel=stylesheet]'), function (el) {
            var u = el.getAttribute('src') || el.getAttribute('href');
            if (u && !/^https?:/.test(u)) files.push(u);
        });
        Promise.all(files.map(function (f) { return fetch(f, { cache: 'reload' }).catch(function () { /* ignore */ }); }))
            .then(function () { location.reload(); });
    }
    function showScript() {
        if (!latest || !lastLayout || !lastLayout.scriptVersion) return;
        var nag = Number(api().load(SCRIPT_KEY) || 0);
        if (!newer(latest.script, lastLayout.scriptVersion) || Date.now() < nag) { banner('scrBanner', ''); return; }
        var b = banner('scrBanner', '<span class="n-ico">⚙</span><div class="n-text"><b>Your Google script needs updating</b>' +
            '<span>You have version ' + esc(lastLayout.scriptVersion) + '; the apps now need ' + esc(latest.script) +
            '. On a computer open your Google Sheet → 🏠 Family Dashboard → Check for updates.</span></div>' +
            '<button class="n-btn ghost" data-s="ok">OK</button>');
        b.onclick = function (e) { if (e.target.closest('[data-s]')) { api().store(SCRIPT_KEY, String(Date.now() + 24 * 3600000)); banner('scrBanner', ''); } };
    }
    function showPrivacy() {
        var P = window.FD_PRIVACY;
        if (!P || !lastLayout || privacyOpen || !('privacyAccepted' in lastLayout)) return;   // older Google scripts can't store it
        if (lastLayout.privacyAccepted === P.version) { var o = document.getElementById('privacy'); if (o) o.remove(); return; }
        privacyOpen = true;
        var el = document.createElement('div');
        el.id = 'privacy'; el.className = 'privacy';
        el.innerHTML = '<div class="pv-card"><h2>' + (lastLayout.privacyAccepted ? 'The privacy notice has changed' : 'Before you start: privacy') + '</h2>' +
            '<ul>' + P.summary.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ul>' +
            '<div class="pv-full" hidden>' + P.full + '</div>' +
            '<div class="pv-btns"><button class="n-btn ghost" data-p="read">Read the full notice</button><button class="n-btn" data-p="ok">I accept</button></div>' +
            '<p class="foot">Version ' + esc(P.version) + ', ' + esc(P.updated) + '. You can also accept it in the setup app or the Family Admin app.</p></div>';
        document.body.appendChild(el);
        el.onclick = function (e) {
            var x = e.target.closest('[data-p]'); if (!x) return;
            if (x.getAttribute('data-p') === 'read') { var f = el.querySelector('.pv-full'); f.hidden = !f.hidden; x.textContent = f.hidden ? 'Read the full notice' : 'Hide the full notice'; return; }
            x.disabled = true; x.textContent = 'Saving…';
            api().post({ action: 'acceptPrivacy', version: P.version, who: 'screen' }).then(function () {
                lastLayout.privacyAccepted = P.version; el.remove(); privacyOpen = false;
            }).catch(function (err) { x.disabled = false; x.textContent = 'I accept'; api().toast('Didn’t save: ' + err.message, true); });
        };
    }
    /** The version number, small, at the bottom of the side bar – so you can see when it has updated. */
    function showVersion() {
        var foot = document.querySelector('#rail .rail-foot');
        if (!foot) return;
        var v = document.getElementById('appVer');
        if (!v) { v = document.createElement('div'); v.id = 'appVer'; v.className = 'app-ver'; foot.appendChild(v); }
        v.textContent = 'v' + APP_VERSION;
        v.title = 'Screen ' + APP_VERSION + (lastLayout && lastLayout.scriptVersion ? ' · Google script ' + lastLayout.scriptVersion : '');
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', showVersion); else setTimeout(showVersion, 0);
    window.FDNotices = {
        version: APP_VERSION,
        check: function (L) {
            if (!L) return;
            var first = !lastLayout;
            lastLayout = L;
            showVersion();
            showPrivacy();
            if (first) checkForUpdate(); else showScript();
        },
    };
    setInterval(checkForUpdate, 10 * 60000);                                 // look for a new version every 10 minutes
    setInterval(function () { if (latest) showUpdate(); }, 60000);            // and update as soon as the screen is left alone
})();
