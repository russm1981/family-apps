/* Family Dashboard – update checks and the privacy notice on the screen.
 * - Every 5 minutes the screen reads version.json from where the apps are hosted (GitHub Pages). If there's a newer
 *   screen version it offers "Update now / Later" (Later = ask again in an hour). (Restarting the PC also picks up the new version.)
 * - If the family's Google script is older than the version the apps need, it says how to update it.
 * - If the privacy notice hasn't been accepted (or has changed since), it must be accepted before carrying on.
 */
(function () {
    'use strict';
    var APP_VERSION = '2026.11.88';
    var SNOOZE_KEY = 'familyDashboard.updateSnooze', SCRIPT_KEY = 'familyDashboard.scriptNag';
    var latest = null, lastLayout = null, privacyOpen = false, lastTouch = Date.now(), updating = false;
    var IDLE_MS = 3 * 60000;
    var LATER_MS = 60 * 60000;     // "Later" on the update banner: ask again in an hour (it still updates itself once nobody's using the screen)       // nobody has touched the screen for 3 minutes → update by itself
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
        stack();
        return b;
    }
    /** More than one notice at once: pile them up from the bottom so none covers another's buttons. */
    function stack() {
        var y = 16;
        Array.prototype.forEach.call(document.querySelectorAll('.notice:not(.stale)'), function (n) {
            if (n.style.display === 'none' || !n.offsetHeight) return;
            n.style.bottom = y + 'px'; y += n.offsetHeight + 10;
        });
    }
    window.addEventListener('resize', function () { setTimeout(stack, 500); });
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
            showUpdate(); showScript(); if (window.FDHealth) FDHealth.redraw();
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
            if (x.getAttribute('data-u') === 'later') { api().store(SNOOZE_KEY, String(Date.now() + LATER_MS)); banner('updBanner', ''); if (window.FDHealth) FDHealth.redraw(); return; }
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
    /** Automatic updates on: ask the Google script to update itself (at most every 15 minutes per version). */
    var scriptUpdating = false;
    function autoScript() {
        // Tried for this version: when, and how many times. GitHub can take a few minutes to have every new file
        // ready, so a failure just tries again 3 minutes later – only after several does it say so.
        var tried = String(api().load('familyDashboard.scriptAuto') || '').split('|'), same = tried[0] === latest.script, fails = same ? Number(tried[2] || 0) : 0;
        if (scriptUpdating || (same && Date.now() - Number(tried[1] || 0) < 3 * 60000)) return false;
        api().store('familyDashboard.scriptAuto', latest.script + '|' + Date.now() + '|' + fails);
        scriptUpdating = true;
        if (!fails) banner('scrBanner', '<span class="n-ico">⚙</span><div class="n-text"><b>Updating the Google script to ' + esc(latest.script) + '…</b></div>');
        var failed = function (msg) {
            scriptUpdating = false;
            api().store('familyDashboard.scriptAuto', latest.script + '|' + Date.now() + '|' + (fails + 1));
            if (fails + 1 < 5) { banner('scrBanner', ''); return; }      // quietly try again in 3 minutes
            banner('scrBanner', '<span class="n-ico">⚙</span><div class="n-text"><b>The Google script couldn’t update itself</b><span>' + esc(msg || '') + '</span></div><button class="n-btn ghost" data-s="ok">OK</button>');
        };
        api().post({ action: 'selfUpdate', why: 'screen' }).then(function (r) {
            if (r && (r.updated || r.upToDate) && !(r.upToDate && newer(latest.script, r.version || ''))) {
                scriptUpdating = false; lastLayout.scriptVersion = r.to || r.version || latest.script; scriptDone(lastLayout.scriptVersion); if (window.FDHealth) FDHealth.note('script', ''); return;
            }
            failed((r && r.message) || 'GitHub doesn’t have the new version ready yet');
        }).catch(function (err) { failed(err.message); });
        var b = document.getElementById('scrBanner');
        b.onclick = function (e) { if (e.target.closest('[data-s]')) { api().store(SCRIPT_KEY, String(Date.now() + 24 * 3600000)); banner('scrBanner', ''); } };
        return true;
    }
    /** The Google script's version, checked every minute: a problem until it's up to date, then a short "all done". */
    var scriptWasBehind = false, scriptOkUntil = 0;
    function scriptDone(v) {
        scriptWasBehind = false; scriptOkUntil = Date.now() + 10 * 60000;
        var b = banner('scrBanner', '<span class="n-ico">✔</span><div class="n-text"><b>The Google script has updated itself</b><span>It’s now version ' + esc(v) + ' – everything is up to date.</span></div><button class="n-btn ghost" data-s="ok">OK</button>');
        b.onclick = function (e) { if (e.target.closest('[data-s]')) { scriptOkUntil = 0; banner('scrBanner', ''); } };
    }
    function showScript() {
        if (!latest || !lastLayout || !lastLayout.scriptVersion) return;
        var behind = newer(latest.script, lastLayout.scriptVersion);
        if (window.FDHealth) FDHealth.note('script', behind ? 'The Google script is version ' + lastLayout.scriptVersion + '; ' + latest.script + ' is available' +
            (lastLayout.autoUpdate ? ' (it updates itself within a few minutes)' : ' – automatic updates are off') : '');
        if (!behind) {
            if (scriptWasBehind) scriptDone(lastLayout.scriptVersion);
            else if (Date.now() > scriptOkUntil) banner('scrBanner', '');
            return;
        }
        scriptWasBehind = true;
        if (lastLayout.autoUpdate && newer(latest.script, lastLayout.scriptVersion) && autoScript()) return;
        if (scriptUpdating) return;
        // Updating itself: no "please update" message while it's still trying (it says so itself after 5 failed tries).
        var t = String(api().load('familyDashboard.scriptAuto') || '').split('|');
        if (lastLayout.autoUpdate && !(t[0] === latest.script && Number(t[2] || 0) >= 5)) { if (!document.getElementById('scrBanner') || !/couldn/.test(document.getElementById('scrBanner').textContent)) banner('scrBanner', ''); return; }
        var nag = Number(api().load(SCRIPT_KEY) || 0);
        if (!newer(latest.script, lastLayout.scriptVersion) || Date.now() < nag) { banner('scrBanner', ''); return; }
        var b = banner('scrBanner', '<span class="n-ico">⚙</span><div class="n-text"><b>Your Google script needs updating</b>' +
            '<span>You have version ' + esc(lastLayout.scriptVersion) + '; the apps now need ' + esc(latest.script) +
            '. Tap the version number (bottom left) → Update the Google script now, or Family Admin → Settings → System → Updates.</span></div>' +
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
    /** No licence: cover the screen with what to do. Free trial: a small reminder in the last week. */
    function showLicence(lic) {
        var el = document.getElementById('licLock');
        if (lic && lic.screenBlocked) {
            // One screen too many for the licence: take over from another screen, or get a bigger licence.
            var sb = lic.screenBlocked, ago = function (t) { var m = Math.round((Date.now() - Date.parse(t)) / 60000); return m < 2 ? 'just now' : m < 120 ? m + ' minutes ago' : m < 2880 ? Math.round(m / 60) + ' hours ago' : Math.round(m / 1440) + ' days ago'; };
            if (!el) { el = document.createElement('div'); el.id = 'licLock'; el.className = 'lic-lock'; document.body.appendChild(el); }
            el.innerHTML = '<div class="lic-box"><div class="lic-ico">🖥</div><h2>Use this screen instead?</h2>' +
                '<p>Your licence is for <b>' + sb.allowed + ' screen' + (sb.allowed > 1 ? 's' : '') + '</b>, and ' + (sb.allowed > 1 ? 'they’re' : 'it’s') + ' already in use. Phones don’t count.</p>' +
                '<div class="scr-list">' + sb.screens.map(function (x) {
                    return '<button class="n-btn" data-old="' + esc(x.id) + '"><span>Use this screen instead of <b>' + esc(x.name) + '</b></span><span class="lic-how">last used ' + ago(x.last) + '</span></button>'; }).join('') + '</div>' +
                '<p class="lic-how">The other screen will then show this message instead. To use more screens at once, ask the seller for a licence with more screens. ' +
                'Setting up a completely separate dashboard (another home)? That needs its own licence – start with the setup app.</p></div>';
            el.style.display = 'flex';
            el.onclick = function (e) {
                var b = e.target.closest('[data-old]'); if (!b) return;
                b.disabled = true;
                var P = window.FDFormat ? FDFormat.params() : {};
                api().post({ action: 'replaceScreen', old: b.getAttribute('data-old'), dev: P.dev, name: P.dn, fmt: P.fmt }).then(function () {
                    el.style.display = 'none'; if (window.FDPages) FDPages.refreshNow(true);
                }).catch(function (err) { b.disabled = false; api().toast(err.message, true); });
            };
            if (window.FDHealth) FDHealth.note('licence', 'This screen isn’t one of the licence’s screens');
            return;
        }
        if (el) el.onclick = null;
        if (lic && lic.required && !lic.ok) {
            if (!el) { el = document.createElement('div'); el.id = 'licLock'; el.className = 'lic-lock'; document.body.appendChild(el); }
            var sig = (lic.state || '') + '|' + (lic.message || '');
            if (el.getAttribute('data-sig') !== sig || el.style.display !== 'flex') {      // don't wipe a key being typed in
                el.setAttribute('data-sig', sig);
                el.innerHTML = '<div class="lic-box"><div class="lic-ico">🔑</div><h2>' + (lic.state === 'missing' ? 'Add your licence key' : 'Licence problem') + '</h2>' +
                    '<p>' + esc(lic.message || '') + '</p>' +
                    '<p class="lic-how">Your key is in your order email: FD- then four groups of five letters and numbers. Type it here:</p>' +
                    '<div class="lic-row"><input id="licIn" placeholder="FD-XXXXX-XXXXX-XXXXX-XXXXX" autocomplete="off" spellcheck="false" autocapitalize="characters"><button class="n-btn" id="licSave">Check and save</button></div>' +
                    '<p class="lic-msg" id="licMsg"></p>' +
                    '<p class="lic-how">Or on your phone: <b>Family Admin → Settings → System → Licence</b>. This screen carries on by itself within a few minutes.</p></div>';
                var go = function () {
                    var inp = document.getElementById('licIn'), k = inp.value.trim(), msg = document.getElementById('licMsg'), btn = document.getElementById('licSave');
                    if (!k) { msg.textContent = 'Type your key in first.'; return; }
                    btn.disabled = true; msg.textContent = 'Checking…';
                    api().post({ action: 'setLicence', key: k }).then(function (d) {
                        msg.textContent = '✔ ' + ((d && d.message) || 'Saved'); el.setAttribute('data-sig', '');
                        setTimeout(function () { el.style.display = 'none'; if (window.FDPages) FDPages.refreshNow(true); }, 1500);
                    }).catch(function (err) { btn.disabled = false; msg.textContent = '⚠ ' + String(err && err.message || err).replace(/^Error:\s*/, ''); });
                };
                document.getElementById('licSave').onclick = go;
                document.getElementById('licIn').onkeydown = function (e) { if (e.key === 'Enter') go(); };
            }
            el.style.display = 'flex';
        } else if (el) el.style.display = 'none';
        if (window.FDHealth) FDHealth.note('licence', lic && lic.required && (!lic.ok || /hasn’t answered/.test(lic.message || '')) ? 'Licence: ' + lic.message : '');
        banner('licTrial', lic && lic.state === 'trial' && lic.daysLeft <= 7 ? '<span>🔑 ' + esc(lic.message) + ' (Family Admin → Settings → Licence)</span>' : '');
    }
    window.FDNotices = {
        version: APP_VERSION,
        layout: function () { return lastLayout; },
        latest: function () { return latest; },
        newer: newer,
        /** For the status panel: whether the screen / script are behind, when "Later" ends, and buttons to update now. */
        snoozedUntil: function () { var t = Number(api().load(SNOOZE_KEY) || 0); return t > Date.now() ? t : 0; },
        updateNow: function () { api().store(SNOOZE_KEY, '0'); update(); },
        updateScript: function () {
            if (!latest || !lastLayout) return Promise.reject(new Error('Not checked yet – try again in a minute'));
            api().store(SCRIPT_KEY, '0'); api().store('familyDashboard.scriptAuto', '');
            return api().post({ action: 'selfUpdate', why: 'screen' }).then(function (r) {
                if (r && (r.updated || r.upToDate)) { lastLayout.scriptVersion = r.to || r.version || latest.script; scriptDone(lastLayout.scriptVersion); if (window.FDHealth) FDHealth.note('script', ''); }
                else throw new Error((r && r.message) || 'The Google script couldn’t update itself');
                return r;
            });
        },
        autoOn: function () {
            return api().post({ action: 'autoUpdate', on: true }).then(function (r) {
                if (lastLayout) lastLayout.autoUpdate = !!(r && r.autoUpdate);
                showScript(); return r;
            });
        },
        recheck: checkForUpdate, stack: stack,
        check: function (L) {
            if (!L) return;
            var first = !lastLayout;
            lastLayout = L;
            if (window.FDSleep && L.sleep) window.FDSleep.config(L.sleep);
            showVersion();
            showLicence(L.licence);
            showPrivacy();
            if (first) checkForUpdate(); else showScript();
        },
    };
    setInterval(checkForUpdate, 5 * 60000);                                  // look for a new version every 5 minutes
    setInterval(function () { if (latest) showUpdate(); }, 60000);            // and update as soon as the screen is left alone
})();
