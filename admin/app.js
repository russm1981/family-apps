/* Family Admin – the parents' app. Five tabs:
 *   Family    the points page (live, with the parents' controls), calendar, today & tomorrow, holidays, where everyone is
 *   Lists     notes, shopping lists, to-dos
 *   Other     information (bins, weather, trains, buses, traffic) and everything else
 *   Screen    which widgets go where, and how tall – nothing else (each widget's settings are on its own page)
 *   Settings  see SECTIONS
 * (Older description below.)
 *
 * Home     a landing page: everyday things (points, notes, lists, to-dos, where everyone is), a glance at the live
 *          widgets (weather, trains, bins…) and the set-up sections. Every tile opens its own page.
 * Points   where the children are (like the screen), then setting up tasks, morning to-dos, reminders and the rules.
 * Lists    notes, shopping lists and to-dos together.
 * Screen   pages and widgets: what goes where on the screen, and each widget's settings.
 * Settings Family & calendar · Locations & home · External data (API) keys · System (screen & sleep, licence, updates) ·
 *          My data (Google) · Devices · About & diagnostics · Help.
 *
 * Pages that aren't tabs (one widget, one settings section) are #/w/<widget id> and #/s/<section>, so the phone's
 * back button works.
 */
(function () {
    'use strict';
    var FD = window.FD, esc = FD.esc;
    var $ = function (id) { return document.getElementById(id); };
    var DATA = null, busy = false, GL = {}, glanceAt = 0, glanceBusy = false;
    try { DATA = JSON.parse(localStorage.getItem('fdadmin.data') || 'null'); } catch (e) { DATA = null; }
    try { GL = JSON.parse(localStorage.getItem('fdadmin.glance') || '{}') || {}; } catch (e) { GL = {}; }

    // Two ways in. The phone app (admin/): everyday use and each widget's simple settings. The computer website
    // (setup/, window.FD_DESK – the Setup website): also the screen layout and the rarely-used settings – the phone links to it.
    var DESK = !!window.FD_DESK;
    var TABS = DESK ? [['start', '🚀', 'First-time setup'], ['layout', '▦', 'Screen layout'], ['tools', '🧭', 'Reconfigure'], ['settings', '⚙', 'Settings'],
        ['family', '👪', 'Family'], ['memos', '📌', 'Notes'], ['lists', '☰', 'Lists'], ['other', '◈', 'Widgets']]
        : [['family', '👪', 'Family'], ['memos', '📌', 'Notes'], ['lists', '☰', 'Lists'], ['other', '◈', 'Widgets'], ['settings', '⚙', 'Settings']];
    // Settings sections on the phone (the rest are on the computer website).
    var PHONE_S = { screen: 1, licence: 1, devices: 1, updates: 1 };   // updates: the "update now" override, if the script hasn't updated itself
    function appsRoot() { return location.href.replace(/[#?].*$/, '').replace(/(admin|setup|settings)\/.*$/, ''); }
    function deskUrl() { return appsRoot() + 'setup/'; }
    function guideUrl() { return appsRoot() + 'setup/guide/'; }
    function deskShort() { return deskUrl().replace(/^https?:\/\//, ''); }
    // Which tab each kind of widget lives under.
    var FAMILY_W = { agenda: 1, countdown: 1, whereabouts: 1 }, LIST_W = { list: 1, todo: 1 }, MEMO_W = { memo: 1 }, INFO_W = { bins: 1, weather: 1, trains: 1, bus: 1, traffic: 1 };
    function tabFor(type) { return FAMILY_W[type] ? 'family' : MEMO_W[type] ? 'memos' : LIST_W[type] ? 'lists' : 'other'; }
    // The Settings menu, in order. Sections marked sub: true are reached from another section (System → Licence…).
    var SECTIONS = {
        family: ['👪', 'Family & calendar', 'Children and the points page, calendar groups and colours, which Google calendars'],
        places: ['📍', 'Locations & home', 'Your home address, and the places your widgets use'],
        keys: ['🔑', 'External data (API) keys', 'One place for every key: maps, trains, buses, NASA, Spotify'],
        system: ['🖥️', 'System', 'Screen & sleep, licence and updates'],
        mydata: ['🗂️', 'My data (Google)', 'Reconfigure, start again, move to another Google account, access code'],
        devices: ['📱', 'Devices', 'This phone, another person’s phone, another screen'],
        support: ['🩺', 'About & diagnostics', 'Every version number, what’s new, and a report for support'],
        screen: ['🌙', 'Screen & sleep', 'When the screen goes to sleep, and night hours', true],
        licence: ['🎫', 'Licence', 'Your licence key and screens', true],
        updates: ['⟳', 'Updates', 'Google script version and automatic updates', true],
    };
    var ALIAS = { access: 'devices', advanced: 'mydata', home: 'places' };   // older links
    function menuKeys() { return Object.keys(SECTIONS).filter(function (k) { return DESK ? !SECTIONS[k][3] : PHONE_S[k]; }); }
    function helpUrl() { return location.href.replace(/admin\/.*$/, '') + 'help/'; }

    /* ================================================================ data */

    function sync(k) { var s = $('sync'); if (s) s.className = 'sync ' + k; }
    function setData(d) {
        DATA = d;
        try { localStorage.setItem('fdadmin.data', JSON.stringify(d)); } catch (e) { /* ignore */ }
        render();
    }
    function load() {
        sync('busy');
        return FD.post({ action: 'admin' }).then(function (d) { sync('ok'); setData(d); })
            .catch(function (e) { sync('err'); FD.toast(e.message, true); render(); });
    }
    /** Run an action. Actions that return points state update the points page; others return all admin data. */
    // Changes go to the Google script one after another. A tap while one is still on its way waits its turn –
    // it's never dropped (dropping it used to close the form as if it had been saved).
    var queue = Promise.resolve(), pending = 0;
    function act(body, okText, undoable) {
        pending++; busy = true; sync('busy');
        var run = function () {
            return FD.post(body).then(function (d) {
                if (d.layoutOnly) { if (pending === 1) { DATA.pages = d.pages; DATA.widgets = d.widgets; setData(DATA); } }     // later changes still on their way: keep what's on the phone
                else if (d.state && !d.tasks) { DATA.state = d.state; setData(DATA); }
                else if (d.tasks) setData(d);
                else if (d.data && d.id && DATA.lists) { DATA.lists[d.id] = d.data; setData(DATA); }
                if (okText) FD.toast(okText, false, undoable && d.id ? function () { act({ action: 'undo', id: d.id }, 'Undone'); } : null);
                return d;
            });
        };
        var p = queue.then(run, run);
        queue = p.catch(function () { /* the next change still goes */ });
        return p.then(function (d) { if (--pending === 0) { busy = false; sync('ok'); } return d; },
            function (e) { if (--pending === 0) busy = false; sync('err'); FD.toast(e.message, true); load(); throw e; });
    }
    /** Move a widget or page straight away on this phone, then tell the Google script. */
    function moveNow(kind, id, dir) {
        var list = kind === 'w' ? DATA.widgets : DATA.pages, me = list.filter(function (x) { return x.id === id; })[0];
        if (!me) return;
        var same = kind === 'w' ? list.filter(function (x) { return x.page === me.page; }) : list.slice();
        same.sort(function (a, b) { return a.order - b.order; });
        var i = same.indexOf(me), j = i + (dir < 0 ? -1 : 1);
        if (j < 0 || j >= same.length) return;
        var t = same[i].order; same[i].order = same[j].order; same[j].order = t;
        if (same[i].order === same[j].order) same[i].order += dir;
        var pi = {}; DATA.pages.forEach(function (pg, k) { pi[pg.id] = k; });
        list.sort(function (a, b) { return kind === 'w' ? ((pi[a.page] || 0) - (pi[b.page] || 0)) || (a.order - b.order) : a.order - b.order; });
        setData(DATA);
        act({ action: kind === 'w' ? 'moveWidget' : 'movePage', id: id, dir: dir }).catch(function () { /* load() puts it back */ });
    }
    /** Live data for the glance tiles: one request per widget page (the same as the screen asks for). */
    function fetchGlance(force) {
        if (!DATA || !DATA.widgets || glanceBusy || (!force && Date.now() - glanceAt < 5 * 60000)) return;
        if (DATA.licence && !DATA.licence.ok) return;
        glanceBusy = true; glanceAt = Date.now();
        var pages = {};
        DATA.widgets.forEach(function (w) { if (w.show && GLANCE[w.type]) pages[w.page] = 1; });
        Promise.all(Object.keys(pages).map(function (p) {
            return FD.get('page', { page: p }).then(function (d) { Object.keys(d.data || {}).forEach(function (id) { GL[id] = d.data[id]; }); }, function () { /* leave the old */ });
        })).then(function () {
            glanceBusy = false;
            try { localStorage.setItem('fdadmin.glance', JSON.stringify(GL)); } catch (e) { /* too big – fine */ }
            if (route().tab === 'family' || route().tab === 'other' || route().w) render();
        });
    }
    function fetchWidget(id) {
        return FD.get('widget', { id: id }).then(function (d) { GL[id] = d.data; if (route().w === id) render(); }, function (e) { FD.toast(e.message, true); });
    }

    /* ================================================================ frame and routes */

    function route() {
        var h = location.hash.replace(/^#\/?/, '').split('/');
        if (h[0] === 'w' && h[1]) { var ww = widgetOf(decodeURIComponent(h[1])); return { w: decodeURIComponent(h[1]), tab: ww ? tabFor(ww.type) : 'other' }; }
        if (h[0] === 'points') return { pts: true, tab: 'family' };
        if (h[0] === 'home' || h[0] === '') return { tab: DESK ? 'start' : 'family' };
        if (h[0] === 's' && ALIAS[h[1]]) h[1] = ALIAS[h[1]];
        if (h[0] === 's' && SECTIONS[h[1]]) return { s: h[1], tab: 'settings' };
        return { tab: TABS.some(function (t) { return t[0] === h[0]; }) ? h[0] : h[0] === 'layout' ? 'layout' : (DESK ? 'start' : 'family') };
    }
    function go(where) { if (location.hash !== '#/' + where) location.hash = '#/' + where; else render(); window.scrollTo(0, 0); }
    function frame() {
        $('app').innerHTML =
            '<header class="top"><div class="top-row"><button class="icon-btn back" id="back" aria-label="Back">‹</button><h1 id="title">' + (DESK ? 'Family Dashboard setup' : 'Family Admin') + '</h1><span class="sync" id="sync"></span>' +
            '<button class="icon-btn" id="refresh" aria-label="Refresh">↻</button></div></header>' +
            '<main class="main" id="body"></main>' +
            '<nav class="tabbar" id="tabs">' + TABS.map(function (t) { return '<button data-t="' + t[0] + '"><i>' + t[1] + '</i>' + t[2] + '</button>'; }).join('') + '</nav>' +
            '<div class="sheet-bg" id="sheetBg"><div class="sheet" id="sheet"></div></div>';
        $('tabs').onclick = function (e) { var b = e.target.closest('[data-t]'); if (b) go(b.getAttribute('data-t')); };
        document.addEventListener('click', function (e) { var g = e.target.closest('[data-go]'); if (g) { e.preventDefault(); go(g.getAttribute('data-go')); } });
        $('back').onclick = function () { if (history.length > 1) history.back(); else go(route().tab); };
        $('refresh').onclick = function () { load(); fetchGlance(true); var r = route(); if (r.w) fetchWidget(r.w); };
        $('sheetBg').onclick = function (e) { if (e.target === $('sheetBg')) closeSheet(); };
        window.addEventListener('hashchange', function () { closeSheet(); render(); window.scrollTo(0, 0); });
        document.addEventListener('visibilitychange', function () { if (!document.hidden) { load(); fetchGlance(); } });
    }
    function sheet(html) { $('sheet').innerHTML = '<div class="grab"></div>' + html; $('sheetBg').classList.add('on'); }
    function closeSheet() { if ($('sheetBg')) $('sheetBg').classList.remove('on'); }

    function render() {
        if (!$('body')) return;
        var r = route();
        Array.prototype.forEach.call(document.querySelectorAll('#tabs button'), function (b) { b.classList.toggle('on', b.getAttribute('data-t') === r.tab); });
        $('back').style.display = r.w || r.s || r.pts ? '' : 'none';
        $('body').onclick = null;
        if (!DATA) { $('title').textContent = 'Family Admin'; $('body').innerHTML = '<div class="empty">Loading…</div>'; return; }
        if (!DATA.widgets) { $('body').innerHTML = '<div class="empty">Update the Google Apps Script to the latest version.</div>'; return; }
        if (!DESK && ((r.s && !PHONE_S[r.s]) || (!r.s && !r.w && !r.pts && r.tab === 'layout'))) renderOnComputer(r.s ? SECTIONS[r.s][1] : 'Screen layout');
        else if (r.w) renderWidget(r.w);
        else if (r.s) renderSection(r.s);
        else if (r.pts) renderPointsSetup();
        else ({ family: renderFamily, memos: renderMemos, lists: renderLists, other: renderOther, layout: renderLayout, settings: renderSettings, tools: renderTools, start: renderStart })[r.tab]();
        var n = notices();
        if (n) $('body').insertAdjacentHTML('afterbegin', n);
        privacyCheck();
    }
    function title(t) { $('title').textContent = t; }
    var HOW_IT_WORKS = '<p>Family Dashboard is standard software that runs on your screen and your phones. Everything that belongs to your family – names, the calendar, ' +
        'the children’s points, notes and settings – is kept <b>in your own Google account</b>, in a Google Sheet that only you own.</p>' +
        '<p>The software reaches your Sheet with a <b>private access code</b> that setup created for you. The code stays on your own screen, phones and this computer, ' +
        'and isn’t sent anywhere else – so your family’s information stays private.</p>';
    /** Setup website, first tab: where you are, how it works, and what each tab is for. */
    function renderStart() {
        title('First-time setup');
        var ppl = ((DATA.family || {}).people || []).map(function (p) { return p.name; }).slice(0, 6).join(', ');
        $('body').innerHTML = card('✔ Your dashboard is set up', '<p>This computer is connected to the dashboard of <b>' + esc(ppl || 'your family') + '</b>.</p>' +
                '<p class="mute small">Google script ' + esc(DATA.scriptVersion || '?') + (DATA.licence ? ' · ' + esc(DATA.licence.message || '') : '') + '</p>') +
            card('What each tab is for', '<div class="menu">' +
                '<a class="mrow" data-go="layout" href="#"><span class="m-ico">▦</span><span class="m-tx"><b>Screen layout</b><small>Add screens, drag widgets about, see it as on the Corsair, a tablet or a computer</small></span><i>›</i></a>' +
                '<a class="mrow" data-go="tools" href="#"><span class="m-ico">🧭</span><span class="m-tx"><b>Reconfigure</b><small>Go through any setup step again: family & calendar, connecting screens and phones, keys, licence, checks, updates</small></span><i>›</i></a>' +
                '<a class="mrow" data-go="settings" href="#"><span class="m-ico">⚙</span><span class="m-tx"><b>Settings</b><small>Everything in detail: home & places, API keys, screen sleep, licence, your Google data, diagnostics</small></span><i>›</i></a>' +
                '<a class="mrow" data-go="family" href="#"><span class="m-ico">👪</span><span class="m-tx"><b>Family, Notes, Lists, Widgets</b><small>The everyday things – the same as Family Admin on your phone</small></span><i>›</i></a></div>') +
            card('How it works', HOW_IT_WORKS) +
            card('Setting up a different family?', '<p class="small">A new Google Sheet for someone else – this family’s dashboard stays exactly as it is.</p>' +
                '<a class="btn ghost wide" href="' + esc(guideUrl()) + '" target="_blank" rel="noopener">Start first-time setup for a new family</a>');
    }
    /** The Setup website's guided steps (the setup app), each opening at the right place, already connected. */
    function renderTools() {
        title('Reconfigure');
        var c = FD.config(), base = guideUrl();
        var link = function (step) { return base + '#api=' + encodeURIComponent(c.url) + '&code=' + encodeURIComponent(c.code) + (step ? '&' + step : '') + (step && step !== 'go=welcome' ? '&only' : ''); };
        var row = function (ico, name, what, href, go) {
            return '<a class="mrow" ' + (go ? 'data-go="' + go + '" href="#"' : 'href="' + esc(href) + '"' + (href.indexOf(base) === 0 && /&only/.test(href) ? '' : ' target="_blank" rel="noopener"')) + '><span class="m-ico">' + ico + '</span><span class="m-tx"><b>' + esc(name) + '</b><small>' + esc(what) + '</small></span><i>›</i></a>';
        };
        $('body').innerHTML = '<p class="mute small help">Step-by-step guides. Each opens the setup app at the right step, already connected to your family.</p>' +
            card('Your dashboard', '<div class="menu">' +
                row('👪', 'Family & calendar', 'Who’s in the family, the calendar groups and colours, which Google calendars', link('go=family')) +
                row('📺', 'Connect a screen, tablet or phone', 'Start file for the Corsair PC, a tablet by code, QR codes for phones', link('go=devices')) +
                row('🔑', 'Free keys for live data', 'Traffic, trains, buses, NASA, Spotify – step by step', link('go=keys')) +
                row('🎫', 'Licence key', 'Add or check your licence key', link('go=licence')) +
                row('✅', 'Check everything', 'Asks your Sheet to fetch every widget and reports anything that needs attention', link('go=check')) +
                row('⟳', 'Google script and updates', 'Which version you have, and the loader file', link('update')) +
                row('🧭', 'Go through the whole setup again', 'Every step, with what you’ve already filled in', link('go=welcome')) + '</div>') +
            card('Starting again or moving', '<div class="menu">' +
                row('🗂️', 'My data (Google)', 'Your access code, starting afresh in a new Sheet, moving to another Google account', '', 's/mydata') +
                row('🆕', 'Set up a different family from scratch', 'A new Google Sheet for someone else – this family’s stays as it is', base) + '</div>') +
            card('Help', '<div class="menu">' + row('❓', 'Help centre', 'Plain-English answers, step by step', helpUrl()) + '</div>');
    }
    /** On the phone: a page that's on the computer website instead. */
    function renderOnComputer(what) {
        title(what);
        $('body').innerHTML = card('💻 This is on the computer', '<p><b>' + esc(what) + '</b> is on <b>Setup</b>, the Family Dashboard website for computers. On a computer, open:</p>' +
            '<div class="desk-addr">' + esc(deskShort()) + '</div>' +
            '<p class="mute small">The first time, it shows a code: type it on this phone in <b>Settings → Devices → Connect by code</b>, or open it on the computer you used for setup.</p>' +
            '<button class="btn ghost wide" id="deskCopy">Copy the address</button>');
        $('deskCopy').onclick = function () { (navigator.clipboard ? navigator.clipboard.writeText(deskUrl()) : Promise.reject()).then(function () { FD.toast('Copied'); }, function () { prompt('Copy this address:', deskUrl()); }); };
    }
    function deskCard() {
        return card('💻 More on Setup, on a computer', '<p class="small">The screen layout (which widgets go where), family &amp; calendar set-up, home &amp; places, API keys, updates, your Google data, diagnostics and every step-by-step guide are on <b>Setup</b>:</p>' +
            '<div class="desk-addr">' + esc(deskShort()) + '</div>');
    }

    /* ================================================================ notices: licence, privacy, weak code, updates */

    var LATEST = null, privacyOpen = false;
    function newer(a, b) {
        var x = String(a || '').split('.').map(Number), y = String(b || '').split('.').map(Number);
        for (var i = 0; i < Math.max(x.length, y.length); i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); }
        return false;
    }
    fetch('../version.json?t=' + Date.now(), { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (v) { LATEST = v; render(); }).catch(function () {});
    function notices() {
        if (!DATA || !('privacyAccepted' in DATA)) return '';
        var out = '', L = DATA.licence, r = route();
        if (L && L.required && !L.ok && r.s !== 'licence') out += '<div class="banner warn"><b>🎫 ' + esc(L.message) + '</b> <button class="link" data-go="s/licence">Add your key</button></div>';
        else if (L && L.state === 'trial' && r.tab === 'family' && !r.w && !r.pts) out += '<div class="banner">' + esc(L.message) + ' <button class="link" data-go="s/licence">Add your key</button></div>';
        if (DATA.moving && r.s !== 'updates') out += '<div class="banner warn"><b>Moving to a new Sheet isn’t finished.</b> <button class="link" data-go="s/updates">What to do</button></div>';
        else if (DESK && DATA.versions && DATA.versions.warn && r.s !== 'updates' && !r.w) out += '<div class="banner warn"><b>The Google script has used ' + DATA.versions.used + ' of its ' + DATA.versions.max + ' saved versions.</b> <button class="link" data-go="s/updates">Sort it out</button></div>';
        if (DATA.codeWeak && r.tab === 'family' && !r.w && !r.pts) out += '<div class="banner warn"><b>Your access code is weak.</b> <button class="link" data-go="s/mydata">Fix it</button></div>';
        if (LATEST && DATA.scriptVersion && newer(LATEST.script, DATA.scriptVersion) && r.s !== 'updates' && !r.w && (r.tab === 'layout' || r.tab === 'settings'))
            out += '<div class="banner"><b>Google script update available</b> (' + esc(LATEST.script) + '). <button class="link" data-go="s/updates">Update now</button></div>';
        return out;
    }
    function privacyCheck() {
        var P = window.FD_PRIVACY;
        if (!P || !DATA || !('privacyAccepted' in DATA) || DATA.privacyAccepted === P.version || privacyOpen) return;
        privacyOpen = true;
        sheet('<h2>' + (DATA.privacyAccepted ? 'The privacy notice has changed' : 'Privacy notice') + '</h2><ul class="pvl">' + P.summary.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ul>' +
            '<details class="adv"><summary>Read the full notice</summary><div class="pv-full">' + P.full + '</div></details>' +
            '<p class="mute small">Version ' + esc(P.version) + ', ' + esc(P.updated) + '.</p>' +
            '<div class="sheet-actions"><button class="btn good" id="pvOk">I accept</button></div>');
        $('sheetBg').onclick = null;     // must be accepted
        $('pvOk').onclick = function () {
            act({ action: 'acceptPrivacy', version: P.version, who: 'Family Admin app' }, 'Thank you').then(function () {
                DATA.privacyAccepted = P.version; privacyOpen = false;
                $('sheetBg').onclick = function (e) { if (e.target === $('sheetBg')) closeSheet(); };
                closeSheet(); load();
            }, function () {});
        };
    }

    /* ================================================================ helpers */

    /** A link into the setup app at one step, already connected to this family's Sheet. */
    function setupLink(step) {
        var c = FD.config(), base = guideUrl();
        return base + '#api=' + encodeURIComponent(c.url) + '&code=' + encodeURIComponent(c.code) + '&go=' + step + (step === 'welcome' ? '' : '&only');
    }
    function L() { return (DATA && DATA.limits) || { reminder: 12, boyName: 10, task: 22, todo: 22, destination: 16, reason: 30, maxPoints: 999 }; }
    function typeOf(t) { return (DATA.types || []).filter(function (x) { return x.type === t; })[0] || { name: t, icon: '', settings: [], sizes: ['full'] }; }
    function pageTypeOf(t) { return (DATA.pageTypes || []).filter(function (x) { return x.type === t; })[0] || { name: t, settings: [] }; }
    function pageOf(id) { return (DATA.pages || []).filter(function (p) { return p.id === id; })[0]; }
    function widgetOf(id) { return (DATA.widgets || []).filter(function (w) { return w.id === id; })[0]; }
    function widgetsOn(pid) { return (DATA.widgets || []).filter(function (w) { return w.page === pid; }); }
    function calPage() { return (DATA.pages || []).filter(function (p) { return p.type === 'calendar'; })[0]; }
    function pointsPage() { return (DATA.pages || []).filter(function (p) { return p.type === 'boys'; })[0]; }
    function lines(v) { return String(v || '').split('\n').map(function (l) { return l.split('|')[0].trim(); }).filter(Boolean); }
    var DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    function nice(ymd) { var d = FD.parse(ymd); return DOW[d.getDay()] + ' ' + d.getDate() + ' ' + MON[d.getMonth()]; }
    function daysTo(ymd) { var d = FD.parse(ymd), t = new Date(); t = new Date(t.getFullYear(), t.getMonth(), t.getDate()); return Math.round((d - t) / 864e5); }
    function wx(code) {
        code = +code;
        return code === 0 ? '☀️' : code <= 2 ? '🌤️' : code === 3 ? '☁️' : code === 45 || code === 48 ? '🌫️' : code >= 95 ? '⛈️' : code >= 80 ? '🌦️' : code >= 71 && code <= 77 ? '❄️' : code >= 51 ? '🌧️' : '☁️';
    }
    function card(h, body, cls) { return '<section class="card' + (cls ? ' ' + cls : '') + '">' + (h ? '<h2>' + h + '</h2>' : '') + body + '</section>'; }

    /* ================================================================ home */

    // Widgets with something to show or do in the app. ('do' = everyday things you add to or change.)
    var GLANCE = { weather: 1, traffic: 1, trains: 1, agenda: 1, bins: 1, countdown: 1, news: 1, flights: 1, bus: 1, parcels: 1, photos: 1, apod: 1, words: 1, quote: 1, spotify: 1 };
    var EVERYDAY = { memo: 1, list: 1, todo: 1, whereabouts: 1 };

    /** One widget of each kind (two Memo widgets show the same notes; two lists of the same name are one list). */
    function distinct(filter) {
        var seen = {};
        return (DATA.widgets || []).filter(function (w) {
            if (!filter(w) || (!w.show && !filter.hidden)) return false;
            var k = w.type === 'memo' ? 'memo' : w.type === 'list' ? 'list:' + String(w.settings.ListName || '').toLowerCase() : w.type === 'photos' ? 'photos:' + (w.settings.DriveFolder || w.settings.AlbumLink) : w.id;
            if (seen[k]) return false; seen[k] = 1; return true;
        });
    }
    function tile(go, icon, name, line, cls) {
        return '<button class="tile' + (cls ? ' ' + cls : '') + '" data-go="' + esc(go) + '"><span class="t-ico">' + icon + '</span><b>' + esc(name) + '</b><small>' + (line || '') + '</small></button>';
    }
    function widgetName(w) {
        var T = typeOf(w.type);
        if (w.type === 'list') return w.settings.ListName || 'List';
        if (w.type === 'memo') return 'Notes';
        if (w.type === 'whereabouts') return 'Where is everyone?';
        if (w.type === 'countdown') return w.settings.Title || 'Countdown';
        return T.name.replace(/ \(.*\)$/, '');
    }
    function renderFamily() {
        var pp = pointsPage(), h = new Date().getHours();
        title(h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening');
        var cal = location.href.replace(/admin\/.*$/, '') + 'calendar/', cp = calPage();
        var fam = distinct(function (w) { return FAMILY_W[w.type]; });
        $('body').innerHTML = '<h3 class="sec">Calendar</h3><div class="tiles">' +
            '<a class="tile" href="' + esc(cal) + '"><span class="t-ico">📅</span><b>Family Calendar</b><small>Opens the calendar app – see and add events</small></a>' +
            (cp ? '<button class="tile" id="calSet"><span class="t-ico">⚙</span><b>Calendar page</b><small>' + esc((cp.settings || {}).DefaultView || 'Which view it opens on') + '</small></button>' : '') +
            fam.map(function (w) { return tile('w/' + w.id, esc(typeOf(w.type).icon), widgetName(w), w.type === 'whereabouts' ? esc(everydayLine(w)) : glanceLine(w)); }).join('') + '</div>' +
            (pp && pp.show !== false ? '<h3 class="sec">' + esc(pp.title) + ' <button class="link" data-go="points">Set up points ›</button></h3>' + boysCards() : '') +
            (DESK ? '<a class="link-card" href="' + esc(setupLink('family')) + '"><b>👪 Reconfigure the family ›</b><span class="mute small">Who’s in the family, who’s on the points page, calendar groups and colours, which Google calendars.</span></a>' : '<div class="link-card"><b>👪 Reconfigure the family</b><span class="mute small">Who’s in the family, the points page, calendar groups and colours – on <b>Setup</b>, on a computer: ' + esc(deskShort()) + ' → Reconfigure → Family &amp; calendar.</span></div>');
        if ($('calSet')) $('calSet').onclick = function () { pageSheet(cp); };
        if (pp && pp.show !== false) $('body').onclick = pointsClick;
        fetchGlance();
    }
    function renderOther() {
        title('Widgets');
        // Every widget on the screens (hidden ones too), then every kind that isn't on any screen – its settings can still be changed.
        var fi = function (w) { return INFO_W[w.type]; }, fr = function (w) { return tabFor(w.type) === 'other' && !INFO_W[w.type]; };
        fi.hidden = fr.hidden = true;
        var info = distinct(fi), rest = distinct(fr);
        var order = ['bins', 'weather', 'trains', 'bus', 'traffic'];
        info.sort(function (a, b) { return order.indexOf(a.type) - order.indexOf(b.type); });
        var t = function (w) { return tile('w/' + w.id, esc(typeOf(w.type).icon), widgetName(w) + (w.show ? '' : ' (hidden)'), GLANCE[w.type] ? glanceLine(w) : esc(summary(w))); };
        $('body').innerHTML = (info.length ? '<h3 class="sec">Information <button class="link" id="glRefresh">Refresh</button></h3><div class="tiles">' + info.map(t).join('') + '</div>' : '') +
            (rest.length ? '<h3 class="sec">Everything else</h3><div class="tiles">' + rest.map(t).join('') + '</div>' : '') +
            ((DATA.unused || []).length ? '<h3 class="sec">Not in use</h3><p class="mute small">Not on any screen. Their settings are kept, ready for when they’re added (on Setup, on a computer).</p><div class="tiles">' +
                DATA.unused.map(function (u) { return '<button class="tile unused" data-unused="' + esc(u.id) + '"><span class="t-ico">' + esc(typeOf(u.type).icon) + '</span><b>' + esc(typeOf(u.type).name) + '</b><small>Settings ›</small></button>'; }).join('') + '</div>' : '') +
            (info.length || rest.length ? '' : card('Nothing here yet', '<p class="mute">Widgets are added on the computer, at ' + esc(deskShort()) + '.</p>'));
        if ($('glRefresh')) $('glRefresh').onclick = function () { fetchGlance(true); FD.toast('Refreshing…'); };
        $('body').querySelectorAll('[data-unused]').forEach(function (b) {
            b.onclick = function () { var u = (DATA.unused || []).filter(function (x) { return x.id === b.getAttribute('data-unused'); })[0]; if (u) settingsSheet(u); };
        });
        fetchGlance();
    }
    function everydayLine(w) {
        if (w.type === 'memo') { var n = (DATA.memos || []).length; return n ? n + ' note' + (n > 1 ? 's' : '') + ': ' + DATA.memos[n - 1].text : 'No notes'; }
        if (w.type === 'list' || w.type === 'todo') {
            var d = (DATA.lists || {})[w.id]; if (!d || d.error) return d && d.error ? '⚠ ' + d.error : '';
            var open = d.items.filter(function (i) { return !i.done; });
            return open.length ? open.length + ' to get/do: ' + open.slice(0, 3).map(function (i) { return i.text; }).join(', ') : 'Nothing on it';
        }
        if (w.type === 'whereabouts') {
            var wd = ((DATA.whereabouts || []).filter(function (x) { return x.id === w.id; })[0] || {}).data;
            return wd ? wd.people.map(function (p) { return p.name + ': ' + (p.place || '?'); }).join(' · ') : '';
        }
        return '';
    }
    function sectionLine(k) {
        var L = DATA.licence || {};
        if (k === 'family') return ((DATA.family || {}).people || []).map(function (p) { return p.name; }).join(', ');
        if (k === 'keys') { var miss = missingKeys(); return miss.length ? '⚠ Needed: ' + miss.join(', ') : 'All the keys your widgets need are in'; }
        if (k === 'licence') return L.required ? (L.ok ? (L.state === 'trial' ? L.message : '✔ ' + L.message) : '⚠ ' + L.message) : 'Not needed yet';
        if (k === 'updates') return 'Version ' + (DATA.scriptVersion || '?') + (DATA.autoUpdate ? ' · automatic updates on' : '') + (DATA.versions ? ' · ' + DATA.versions.used + ' of ' + DATA.versions.max + ' saved versions used' : '');
        if (k === 'system') { var sl = sectionLine('licence'); return (L.required && !L.ok ? sl : 'Sleep, licence, updates') + ' · ' + (DATA.autoUpdate ? 'updates itself' : '⚠ automatic updates off'); }
        if (k === 'places') { var ha = ((DATA.install || []).filter(function (f) { return f.k === 'HomeAddress'; })[0] || {}).value; return ha ? 'Home set · ' + placeWidgets().length + ' widgets use places' : '⚠ Add your home address'; }
        if (k === 'devices') { var n = (DATA.screens || []).length; return n + ' screen' + (n === 1 ? '' : 's') + (DATA.screensAllowed ? ' of ' + DATA.screensAllowed : '') + ' · add a phone or a screen'; }
        if (k === 'support') return 'Screen ' + ((DATA.screenSeen || {}).v || '?') + ' · script ' + (DATA.scriptVersion || '?') + ' · apps ' + FD.VERSION;
        return SECTIONS[k][2];
    }
    /** One line of live information for a tile. */
    function glanceLine(w) {
        var d = GL[w.id];
        if (d && d.error) return '<span class="err">⚠ ' + esc(d.error) + '</span>';
        if (!d) return w.type === 'quote' || w.type === 'spotify' ? esc(summary(w)) : '<span class="mute">…</span>';
        try {
            switch (w.type) {
                case 'weather': return wx(d.now.code) + ' ' + Math.round(d.now.temp) + '° now · ' + (d.days[0] ? Math.round(d.days[0].max) + '°/' + Math.round(d.days[0].min) + '°' : '') + (d.now.rain != null ? ' · ' + d.now.rain + '% rain' : '');
                case 'traffic': return esc(d.routes.map(function (r) { return r.name + ' ' + r.mins + ' min' + (r.delayMins > 0 ? ' (+' + r.delayMins + ')' : ''); }).join(' · '));
                case 'trains': var s = d.services.filter(function (x) { return !x.cancelled; })[0]; return s ? esc(s.std + ' to ' + (s.destination || d.to) + ' – ' + s.etd) : 'No trains soon';
                case 'agenda': return d.days.today.length + ' today · ' + d.days.tomorrow.length + ' tomorrow' + (d.days.today[0] ? ': ' + esc((d.days.today[0].time || '') + ' ' + d.days.today[0].t) : '');
                case 'bins': var b = d.upcoming[0]; return b ? esc((b.daysAway === 0 ? 'Today' : b.daysAway === 1 ? 'Tomorrow' : nice(b.date)) + ': ' + b.bins.map(function (x) { return x.bin; }).join(', ')) : 'No collections found';
                case 'countdown': var c = d.items[0]; return c ? esc(c.name + ' in ' + daysTo(c.date) + ' days') : 'Nothing coming up';
                case 'news': return d.items[0] ? esc(d.items[0].title) : '';
                case 'flights': return d.planes.length + ' plane' + (d.planes.length === 1 ? '' : 's') + ' within ' + d.radiusMiles + ' miles';
                case 'bus': var dp = d.departures[0]; return dp ? esc(dp.service + ' to ' + dp.dest + ' at ' + dp.time) : 'No buses soon';
                case 'parcels': var on = d.items.filter(function (i) { return i.rank > 1; }); return on.length ? on.length + ' on the way: ' + esc(on[0].status) : 'Nothing on the way';
                case 'photos': return d.photos.length + ' photos';
                case 'apod': return esc(d.title);
                case 'words': return esc(d.users.map(function (u) { return u.name + ' 🔥' + u.streak; }).join(' · '));
                default: return esc(summary(w));
            }
        } catch (e) { return esc(summary(w)); }
    }

    /* ================================================================ one widget: live view on top, settings below */

    function renderWidget(id) {
        var w = widgetOf(id);
        if (!w) { title('Not found'); $('body').innerHTML = '<div class="empty">That widget has been removed.</div>'; return; }
        var T = typeOf(w.type), p = pageOf(w.page);
        title(widgetName(w));
        var view = VIEWS[w.type] ? VIEWS[w.type](w) : '<p class="mute">This widget is shown on the screen. ' + esc(T.about) + '</p>';
        $('body').innerHTML = '<div class="w-head"><span class="w-ico">' + esc(T.icon) + '</span><span class="mute small">' + esc(T.name) + ' · on the ' + esc(p ? p.title : '?') + ' page' + (w.show ? '' : ' (hidden)') + '</span></div>' +
            '<div id="wView">' + view + '</div>' +
            card('Settings', '<p class="mute small">' + esc(summary(w)) + '</p><button class="btn ghost wide" id="wSet">Change ' + esc(widgetName(w)) + ' settings</button>' +
                (DESK ? '<button class="btn ghost wide" data-go="layout">Where it goes on the screen ›</button>' : '<p class="mute small">Where it goes on the screen, and its height, are set on the computer: ' + esc(deskShort()) + '</p>'), 'w-set');
        $('wSet').onclick = function () { settingsSheet(w); };
        if (WIRE[w.type]) WIRE[w.type](w);
        if (GLANCE[w.type] && !GL[w.id]) fetchWidget(w.id);
    }
    function waiting(w) { var d = GL[w.id]; return !d ? '<div class="empty">Loading…</div>' : d.error ? '<div class="err small">⚠ ' + esc(d.error) + '</div>' : ''; }
    function rows(list, fn, none) { return list.length ? '<div class="rows">' + list.map(fn).join('') + '</div>' : '<div class="empty">' + (none || 'Nothing to show') + '</div>'; }
    function row(left, right, sub, cls) { return '<div class="r' + (cls ? ' ' + cls : '') + '"><span class="r-l">' + left + (sub ? '<small>' + sub + '</small>' : '') + '</span>' + (right != null ? '<b class="r-r">' + right + '</b>' : '') + '</div>'; }

    var VIEWS = {
        memo: function () { return memoEditor(); },
        list: function (w) { return card('On the list', listEditor(w)); },
        todo: function (w) { return card('To do', listEditor(w)); },
        whereabouts: function (w) { return card('Where is everyone now?', whereEditor(w)); },
        spotify: function () { return card('', spotifyBox()); },
        weather: function (w) {
            var d = GL[w.id]; if (!d || d.error) return card('', waiting(w));
            var hrs = d.hours.filter(function (x, i) { return i % 2 === 0; }).slice(0, 6);
            return card('Now', '<div class="wx-now"><span>' + wx(d.now.code) + '</span><b>' + Math.round(d.now.temp) + '°</b><small>Feels ' + Math.round(d.now.feels) + '° · wind ' + Math.round(d.now.wind) + ' mph' + (d.now.rain != null ? ' · ' + d.now.rain + '% rain' : '') + '</small></div>' +
                '<div class="wx-hrs">' + hrs.map(function (x) { return '<div><small>' + esc(x.time) + '</small><span>' + wx(x.code) + '</span><b>' + Math.round(x.temp) + '°</b><small>' + x.rain + '%</small></div>'; }).join('') + '</div>') +
                card('Next few days', rows(d.days, function (x, i) { return row(wx(x.code) + ' ' + (i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : nice(x.date)), Math.round(x.max) + '° / ' + Math.round(x.min) + '°', x.rain + '% rain'); }));
        },
        traffic: function (w) {
            var d = GL[w.id]; if (!d || d.error) return card('', waiting(w));
            return card('Journey times now', rows(d.routes, function (r) {
                return row('<i class="dot ' + esc(r.status) + '"></i>' + esc(r.name), r.mins + ' min', (r.delayMins > 0 ? r.delayMins + ' min slower than usual' : 'Usual time') + ' · ' + r.miles + ' miles');
            }, 'No routes yet – add them in the settings'));
        },
        trains: function (w) {
            var d = GL[w.id]; if (!d || d.error) return card('', waiting(w));
            return card(esc(d.from) + ' → ' + esc(d.to), rows(d.services, function (s) {
                var late = s.cancelled || (s.etd !== 'On time' && s.etd !== s.std);
                return row(esc(s.std) + ' <span class="' + (late ? 'bad-t' : 'good-t') + '">' + esc(s.cancelled ? 'Cancelled' : s.etd) + '</span>', s.platform ? 'Plat ' + esc(s.platform) : '',
                    (s.arrive ? 'Arrives ' + esc(s.arrive) + ' · ' : '') + (s.reason ? esc(s.reason) : esc(s.operator || '')));
            }, 'No trains in the next few hours'));
        },
        agenda: function (w) {
            var d = GL[w.id]; if (!d || d.error) return card('', waiting(w));
            var ev = function (e) { return row('<i class="dot" style="background:' + esc(e.c) + '"></i>' + esc(e.t), e.allDay ? 'All day' : esc(e.time), esc(e.k)); };
            return card('Today', rows(d.days.today, ev, 'Nothing today')) + card('Tomorrow', rows(d.days.tomorrow, ev, 'Nothing tomorrow')) +
                '<a class="btn wide" href="' + esc(location.href.replace(/admin\/.*$/, '') + 'calendar/') + '">Open the Family Calendar app</a>';
        },
        bins: function (w) {
            var d = GL[w.id], set = '<button class="btn wide" id="binSet">' + (d && !d.error ? 'Change how bin days are found' : 'Set up bin days') + '</button>';
            if (!d || d.error) return card('', waiting(w) + set);
            return card('Next collections', rows(d.upcoming, function (u) {
                return row(u.daysAway === 0 ? 'Today' : u.daysAway === 1 ? 'Tomorrow' : nice(u.date), u.daysAway > 1 ? 'in ' + u.daysAway + ' days' : '', esc(u.bins.map(function (b) { return b.bin; }).join(', ')));
            }, 'No collections found') + set);
        },
        countdown: function (w) {
            var d = GL[w.id]; if (!d || d.error) return card('', waiting(w));
            return card('Coming up', rows(d.items, function (c) { return row('<i class="dot" style="background:' + esc(c.colour || '#8a93a3') + '"></i>' + esc(c.name), daysTo(c.date) + ' days', nice(c.date)); }, 'Nothing coming up')) +
                '<p class="mute small">Holidays come from the calendar (the categories in the settings) and from your own dates.</p>';
        },
        news: function (w) {
            var d = GL[w.id]; if (!d || d.error) return card('', waiting(w));
            return card(esc(d.title || 'News'), rows(d.items.slice(0, 12), function (n) { return row(esc(n.title), null, esc(n.text)); }));
        },
        flights: function (w) {
            var d = GL[w.id]; if (!d || d.error) return card('', waiting(w));
            return card('Within ' + d.radiusMiles + ' miles now', rows(d.planes.slice().sort(function (a, b) { return a.dist - b.dist; }).slice(0, 15), function (p) {
                return row((p.heli ? '🚁 ' : '✈️ ') + esc(p.cs || p.reg || p.hex), p.dist + ' mi', esc([p.model, p.alt ? p.alt.toLocaleString() + ' ft' : '', p.from && p.to ? p.from.city + ' → ' + p.to.city : ''].filter(Boolean).join(' · ')));
            }, 'No planes nearby right now'));
        },
        bus: function (w) {
            var d = GL[w.id]; if (!d || d.error) return card('', waiting(w));
            return card(esc(d.stop || 'Bus stop'), rows(d.departures, function (x) { return row('<b class="bus-no">' + esc(x.service) + '</b> ' + esc(x.dest), esc(x.time), x.live ? 'Live' : 'Timetable'); }, 'No buses soon') +
                (d.note ? '<p class="mute small">' + esc(d.note) + '</p>' : ''));
        },
        parcels: function (w) {
            var d = GL[w.id]; if (!d || d.error) return card('', waiting(w));
            return card('Deliveries', rows(d.items, function (p) { return row(esc(p.who) + ' – ' + esc(p.status), null, esc(p.what)); }, 'No delivery emails'));
        },
        photos: function (w) {
            var d = GL[w.id]; if (!d || d.error) return card('', waiting(w));
            return card(esc(d.title || 'Photos') + ' <span class="mute small">(' + d.photos.length + ')</span>', '<div class="ph-grid">' + d.photos.slice(0, 12).map(function (p) {
                return '<img loading="lazy" src="' + esc(p.src.replace(/sz=w\d+/, 'sz=w400')) + '" alt="">'; }).join('') + '</div>');
        },
        apod: function (w) {
            var d = GL[w.id]; if (!d || d.error) return card('', waiting(w));
            return card(esc(d.title), (d.img && !d.video ? '<img class="apod" src="' + esc(d.img) + '" alt="">' : '') + '<p class="small">' + esc(d.text) + '</p><p class="mute small">' + esc(d.credit || '') + ' · ' + esc(d.date) + '</p>');
        },
        words: function (w) {
            var d = GL[w.id]; if (!d) return card('', waiting(w));
            return card('Duolingo streaks', rows((d && d.users) || [], function (u) { return row(esc(u.name), '🔥 ' + u.streak, (u.xp || 0).toLocaleString() + ' XP'); }, 'Add Duolingo usernames in the settings'));
        },
        quote: function (w) { var d = GL[w.id]; return card('', d && d.q ? '<blockquote>' + esc(d.q) + '</blockquote><p class="mute small">' + esc(d.a || '') + '</p>' : '<p class="mute">' + esc(summary(w)) + '. A new quote shows on the screen each day.</p>'); },
    };
    var WIRE = { memo: function () { wireMemo(); }, list: wireList, todo: wireList, whereabouts: wireWhere, bins: function (w) { if ($('binSet')) $('binSet').onclick = function () { binWizard(w); }; } };

    /* ---- "Set up bin days": postcode → council → read it automatically if we can, otherwise enter the bins by hand. */
    var BIN_TYPES = [['Black bin', 'general waste'], ['Recycling', ''], ['Garden bin', 'green waste'], ['Food caddy', 'food waste'], ['Glass', ''], ['Paper & card', ''], ['Other', 'type a name']];
    function binWizard(w) {
        var S = { w: w, postcode: w.settings.Postcode || ((/\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/i.exec(((DATA.install || []).filter(function (f) { return f.k === 'HomeAddress'; })[0] || {}).value || '') || [])[1] || ''),
            house: w.settings.House || '', uprn: w.settings.UPRN || '', link: w.settings.CalendarLink || '', list: null, council: null, rows: null };
        function save(settings, msg) {
            act({ action: 'saveWidget', widget: { id: w.id, settings: settings } }, msg || 'Saved – the screen shows your bin days within a minute')
                .then(function () { closeSheet(); delete GL[w.id]; fetchWidget(w.id); }, function () {});
        }
        function preview(d) {
            return '<div class="rows">' + (d.upcoming || []).map(function (u) { return row(nice(u.date), u.daysAway > 1 ? 'in ' + u.daysAway + ' days' : u.daysAway === 1 ? 'tomorrow' : 'today', esc(u.bins.map(function (b) { return b.bin; }).join(', '))); }).join('') + '</div>';
        }
        function step1() {
            sheet('<h2>🗑️ Set up bin days</h2><p class="mute small">We’ll find your council from your postcode and read your collection days from it if we can. If not, you can type your bins in – it takes a minute.</p>' +
                '<label>Postcode</label><input id="bwPc" value="' + esc(S.postcode) + '" autocapitalize="characters" autocomplete="postal-code" maxlength="10">' +
                '<button class="btn wide" id="bwFind">Find my council</button><div id="bwOut"></div>' +
                '<div class="sheet-actions"><button class="btn ghost" id="bwHand">Skip – enter my bins by hand</button></div>');
            $('bwHand').onclick = manual;
            $('bwFind').onclick = function () {
                S.postcode = $('bwPc').value.trim(); if (!S.postcode) { FD.toast('Type your postcode', true); return; }
                var b = this; b.disabled = true; b.textContent = 'Looking it up…';
                FD.get('binLookup', { postcode: S.postcode }).then(function (d) {
                    S.list = d.councils || []; S.council = d.council;
                    if (d.postcodeError) { b.disabled = false; b.textContent = 'Find my council'; $('bwOut').innerHTML = '<p class="neg small">' + esc(d.postcodeError) + '</p>'; return; }
                    step2();
                }, function (e) { b.disabled = false; b.textContent = 'Find my council'; FD.toast(/Unknown action/.test(e.message) ? 'Update the Google script first' : e.message, true); });
            };
        }
        function step2() {
            var c = S.council || {};
            sheet('<h2>🗑️ Your council</h2><p>Your bins are collected by <b id="bwName">' + esc(c.name || 'a council we don’t know') + '</b>. <button class="link" id="bwChange">Not right?</button></p>' +
                '<div id="bwPick" hidden><select id="bwC">' + (S.list || []).map(function (x) { return '<option value="' + esc(x.code) + '"' + (x.code === c.code ? ' selected' : '') + '>' + esc(x.name) + (x.ready ? ' ✔' : '') + '</option>'; }).join('') +
                (c.code && !(S.list || []).some(function (x) { return x.code === c.code; }) ? '<option value="' + esc(c.code) + '" selected>' + esc(c.name) + '</option>' : '') + '</select>' +
                '<p class="mute small">✔ = its bin days can be read automatically.</p></div><div id="bwHow"></div>' +
                '<div class="sheet-actions"><button class="btn ghost" id="bwBack">Back</button></div>');
            $('bwChange').onclick = function () { $('bwPick').hidden = false; this.hidden = true; };
            $('bwBack').onclick = step1;
            $('bwC').onchange = function () { $('bwName').textContent = this.options[this.selectedIndex].text.replace(/ ✔$/, ''); how(); }; how();
        }
        function how() {
            var code = $('bwC').value, x = (S.list || []).filter(function (y) { return y.code === code; })[0] || { code: code, name: S.council && S.council.name, how: 'none' };
            S.council = x;
            var needUprn = (x.needs || []).indexOf('uprn') >= 0, needHouse = (x.needs || []).indexOf('house') >= 0 || (x.needs || []).indexOf('house_number') >= 0;
            if (x.ready) {
                $('bwHow').innerHTML = '<p class="pos small"><b>✔ We can read ' + esc(x.name) + '’s bin days.</b></p>' +
                    (needHouse ? '<label>House name or number</label><input id="bwHouse" value="' + esc(S.house) + '">' : '') +
                    (needUprn ? '<label>Your property number (UPRN)</label><input id="bwUprn" inputmode="numeric" value="' + esc(S.uprn) + '" placeholder="e.g. 100121234567">' +
                        '<p class="mute small">Every home has one. Find yours at <a href="https://www.findmyaddress.co.uk/search" target="_blank" rel="noopener">findmyaddress.co.uk</a>: search your postcode, pick your address, and copy the <b>UPRN</b> number.</p>' : '') +
                    '<button class="btn wide" id="bwTry">Try it</button><div id="bwRes"></div>';
                $('bwTry').onclick = function () {
                    var set = { Source: 'My council (automatic)', Council: x.code, Postcode: S.postcode };
                    if ($('bwHouse')) set.House = S.house = $('bwHouse').value.trim();
                    if ($('bwUprn')) set.UPRN = S.uprn = $('bwUprn').value.replace(/\D/g, '');
                    var b = this; b.disabled = true; b.textContent = 'Asking ' + x.name + '…';
                    FD.post({ action: 'binTry', settings: set }).then(function (r) {
                        b.disabled = false; b.textContent = 'Try again';
                        if (!r.data || !(r.data.upcoming || []).length) throw new Error('No collections came back');
                        $('bwRes').innerHTML = '<p class="pos small"><b>✔ It works.</b> Your next collections:</p>' + preview(r.data) + '<button class="btn good wide" id="bwUse">Use this</button>';
                        $('bwUse').onclick = function () { set.UPRN = set.UPRN || ''; save(set); };
                    }).catch(function (e) {
                        b.disabled = false; b.textContent = 'Try again';
                        $('bwRes').innerHTML = '<p class="neg small"><b>That didn’t work:</b> ' + esc(e.message) + '</p><p class="small">Check the details above and try again – or enter your bins by hand.</p><button class="btn wide" id="bwM">Enter my bins by hand</button>';
                        $('bwM').onclick = manual;
                    });
                };
            } else {
                $('bwHow').innerHTML = '<p class="small">We can’t read this council’s bin days automatically' + (x.note ? ' – ' + esc(x.note.replace(/^Chichester’s bin-day page is /, 'its website is ').replace(/ – enter your bins by hand\.?$/, '')) : x.how === 'feed' || x.how === 'page' ? ' yet' : '') +
                    '. Entering them takes a minute – and an AI assistant can look them up for you.</p>' +
                    '<button class="btn wide" id="bwM">Enter my bins by hand</button><p class="small center"><button class="link" id="bwI">My council has an “add to calendar” link</button></p>';
                $('bwM').onclick = manual; $('bwI').onclick = ics;
            }
        }
        function ics() {
            sheet('<h2>🗑️ Council calendar link</h2><p class="small">On your council’s “check your bin day” page, look for <b>add to calendar</b>, <b>subscribe</b> or <b>iCal</b>, and copy that link (it ends .ics or starts webcal://).</p>' +
                '<label>Calendar link</label><input id="bwL" type="url" value="' + esc(S.link) + '"><button class="btn wide" id="bwTry">Try it</button><div id="bwRes"></div>' +
                '<div class="sheet-actions"><button class="btn ghost" id="bwBack">Back</button></div>');
            $('bwBack').onclick = step2;
            $('bwTry').onclick = function () {
                var set = { Source: 'Calendar link', CalendarLink: S.link = $('bwL').value.trim(), Postcode: S.postcode };
                FD.post({ action: 'binTry', settings: set }).then(function (r) {
                    $('bwRes').innerHTML = '<p class="pos small"><b>✔ It works.</b></p>' + preview(r.data) + '<button class="btn good wide" id="bwUse">Use this</button>';
                    $('bwUse').onclick = function () { save(set); };
                }, function (e) { $('bwRes').innerHTML = '<p class="neg small">' + esc(e.message) + '</p>'; });
            };
        }
        /* By hand: one row per bin – what it is, how often, and the next (or a recent) collection date. */
        function manual() {
            if (!S.rows) {
                S.rows = String(w.settings.Schedule || '').split('\n').map(function (l) { var p = l.split('|').map(function (x) { return x.trim(); }); return p.length >= 3 ? { name: p[0], weeks: +p[1] || 1, date: toIso(p[2]) } : null; }).filter(Boolean);
                if (!S.rows.length) S.rows = [{ name: 'Black bin', weeks: 2, date: '' }, { name: 'Recycling', weeks: 2, date: '' }];
            }
            var opt = function (r) {
                var known = BIN_TYPES.some(function (t) { return t[0] === r.name; });
                return '<select data-bt>' + BIN_TYPES.map(function (t) { var on = t[0] === r.name || (t[0] === 'Other' && !known); return '<option value="' + t[0] + '"' + (on ? ' selected' : '') + '>' + t[0] + (t[1] ? ' (' + t[1] + ')' : '') + '</option>'; }).join('') + '</select>' +
                    '<input data-bn placeholder="Name, e.g. Blue box" maxlength="22" value="' + esc(known ? '' : r.name) + '"' + (known ? ' hidden' : '') + '>';
            };
            sheet('<h2>🗑️ Your bins</h2><p class="mute small">For each bin: what it is, how often it’s collected, and the date of its next collection (look at your council’s bin calendar).</p>' +
                '<details class="card fold" id="bwAi"><summary><b>✨ Let an AI assistant look it up</b><span class="mute">ChatGPT, Claude, Gemini…</span></summary>' +
                '<p class="small">Copy this request into an AI assistant that can search the web. It finds your council’s bin calendar and replies in a form you paste straight back here.</p>' +
                '<label>House name or number (so it finds your exact address)</label><input id="bwAiHouse" value="' + esc(S.house) + '">' +
                '<textarea id="bwAiText" readonly rows="7" class="small"></textarea><button class="btn wide" id="bwAiCopy">Copy the request</button>' +
                '<label>Then paste the assistant’s answer here</label><textarea id="bwAiIn" rows="5" placeholder="Black bin | 2 | 2026-11-12"></textarea><button class="btn ghost wide" id="bwAiUse">Fill in my bins from this</button><p class="small" id="bwAiMsg"></p></details>' +
                '<div id="bwRows">' + S.rows.map(function (r, i) {
                    return '<div class="card bw-row" data-i="' + i + '">' + opt(r) + '<div class="two"><div><label>Every</label><select data-bw>' + [1, 2, 3, 4].map(function (n) { return '<option value="' + n + '"' + (n === r.weeks ? ' selected' : '') + '>' + (n === 1 ? 'week' : n + ' weeks') + '</option>'; }).join('') + '</select></div>' +
                        '<div><label>Next collection</label><input type="date" data-bd value="' + esc(r.date) + '"></div></div><button class="btn ghost sm" data-bx>Remove</button></div>';
                }).join('') + '</div><button class="btn ghost wide" id="bwAdd">+ Add another bin</button>' +
                '<h3 class="sh">The next few collections</h3><div id="bwPrev" class="small"></div>' +
                '<div class="sheet-actions"><button class="btn ghost" id="bwCancel">Cancel</button><button class="btn good" id="bwSave">Save</button></div>');
            function read() {
                S.rows = Array.prototype.map.call(document.querySelectorAll('.bw-row'), function (el) {
                    var t = el.querySelector('[data-bt]').value, n = el.querySelector('[data-bn]');
                    n.hidden = t !== 'Other';
                    return { name: t === 'Other' ? n.value.trim() : t, weeks: +el.querySelector('[data-bw]').value, date: el.querySelector('[data-bd]').value };
                });
            }
            function prev() {
                read();
                var ok = S.rows.filter(function (r) { return r.name && r.date; }), days = {};
                var today = new Date(); today = new Date(today.getFullYear(), today.getMonth(), today.getDate());
                ok.forEach(function (r) {
                    var d = FD.parse(r.date), step = r.weeks * 7;
                    while (d < today) d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + step);
                    for (var i = 0; i < 4; i++) { var k = d.toISOString().slice(0, 10), key = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); (days[key] = days[key] || []).push(r.name); d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + step); }
                });
                var ks = Object.keys(days).sort().slice(0, 6);
                $('bwPrev').innerHTML = ks.length ? '<div class="rows">' + ks.map(function (k) { return row(nice(k), null, esc(days[k].join(', '))); }).join('') + '</div>' : '<p class="mute">Add a next-collection date to see them here.</p>';
            }
            $('bwRows').oninput = prev; $('bwRows').onchange = prev;
            function aiText() {
                var c = S.council && S.council.name ? S.council.name : 'my local council';
                return 'Please find the bin (waste and recycling) collection days for this home in the UK:\n' +
                    '  ' + ($('bwAiHouse').value.trim() || '[house name or number]') + ', ' + (S.postcode || '[postcode]') + ' – council: ' + c + '\n\n' +
                    'Search the council’s website (its “check your bin day” or bin calendar page) for this address. For every kind of bin or box ' +
                    '(general waste, recycling, food, garden, glass…), work out how often it’s collected and its next collection date on or after ' + new Date().toISOString().slice(0, 10) + '.\n\n' +
                    'Reply with ONLY these lines, one per bin, nothing else:\n' +
                    'Bin name | every how many weeks (1, 2, 3 or 4) | next collection date as YYYY-MM-DD\n\n' +
                    'Example:\nBlack bin | 2 | 2026-11-12\nRecycling | 2 | 2026-11-19\nFood caddy | 1 | 2026-11-12\n\n' +
                    'Keep bin names short (up to 22 letters). If you can’t find this address’s collection days, say so instead of guessing.';
            }
            $('bwAiText').value = aiText();
            $('bwAiHouse').oninput = function () { S.house = this.value; $('bwAiText').value = aiText(); };
            $('bwAiCopy').onclick = function () { var t = $('bwAiText'); try { navigator.clipboard.writeText(t.value).then(function () { FD.toast('Copied – paste it into the assistant'); }); } catch (e) { t.select(); document.execCommand('copy'); FD.toast('Copied'); } };
            $('bwAiUse').onclick = function () {
                var got = parseAi($('bwAiIn').value);
                if (!got.length) { $('bwAiMsg').innerHTML = '<span class="neg">Couldn’t find any “Bin | weeks | date” lines in that. Check the assistant replied in that form.</span>'; return; }
                S.rows = got; manual(); FD.toast(got.length + ' bin' + (got.length > 1 ? 's' : '') + ' filled in – check them, then Save');
            };
            $('bwRows').onclick = function (e) { var x = e.target.closest('[data-bx]'); if (x) { read(); S.rows.splice(+x.closest('.bw-row').getAttribute('data-i'), 1); manual(); } };
            $('bwAdd').onclick = function () { read(); S.rows.push({ name: 'Garden bin', weeks: 2, date: '' }); manual(); };
            $('bwCancel').onclick = closeSheet;
            $('bwSave').onclick = function () {
                read();
                var bad = S.rows.filter(function (r) { return !r.name || !r.date; });
                if (!S.rows.length || bad.length) { FD.toast('Each bin needs a name and its next collection date', true); return; }
                save({ Source: 'Repeating schedule', Schedule: S.rows.map(function (r) { return r.name + ' | ' + r.weeks + ' | ' + r.date; }).join('\n'), Postcode: S.postcode });
            };
            prev();
        }
        /** The assistant's reply → rows. Forgiving: bullets, code fences, "fortnightly", "every 2 weeks", 12/11/2026, 12 Nov 2026. */
        function parseAi(text) {
            var MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
            return String(text || '').split('\n').map(function (l) {
                l = l.replace(/^[\s>*•\-`#|0-9.)]*(?=[A-Za-z])/, '').replace(/`/g, '').trim();
                var p = l.split('|').map(function (x) { return x.trim(); });
                if (p.length < 3 || !p[0]) return null;
                var wk = /fortnight/i.test(p[1]) ? 2 : /week/i.test(p[1]) && !/\d/.test(p[1]) ? 1 : parseInt(p[1], 10);
                if (!(wk >= 1 && wk <= 4)) return null;
                var d = toIso(p[2]), m;
                if (!d && (m = /(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3})[a-z]*\.?\s+(\d{4})/.exec(p[2])) && MON[m[2].toLowerCase()]) d = m[3] + '-' + ('0' + MON[m[2].toLowerCase()]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
                if (!d) return null;
                var name = p[0].replace(/\*/g, '').slice(0, 22), known = BIN_TYPES.filter(function (t) { return t[0].toLowerCase() === name.toLowerCase(); })[0];
                return { name: known ? known[0] : name, weeks: wk, date: d };
            }).filter(Boolean);
        }
        function toIso(t) { t = String(t || '').trim(); var m = /(\d{4})-(\d\d)-(\d\d)/.exec(t); if (m) return m[0]; m = /(\d\d?)\/(\d\d?)\/(\d{4})/.exec(t); return m ? m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2) : ''; }
        if (w.settings.Source === 'Repeating schedule' && w.settings.Schedule) manual(); else step1();
    }

    /* ================================================================ points */

    /** The points page as on the screen, with the parents' controls: penalties, bonus, cash in, ticking tasks and to-dos. */
    function boysCards() {
        var s = DATA.state;
        if (!s || !s.boys.length) return card('No children on the points page', '<p class="mute">Choose who’s on the points page in Settings → Family & calendar.</p><button class="btn wide" data-go="s/family">Family & calendar</button>');
        var target = s.cashIn.points;
        return s.boys.map(function (b, i) {
            var pct = Math.min(100, b.balance / target * 100), can = b.balance >= target;
            return '<section class="card boy" style="--c:' + esc(b.colour) + '">' +
                '<div class="boy-top"><h2>' + esc(b.name) + '</h2><button class="link" data-go="points">Set up points ›</button></div>' + reminders(b) +
                '<div class="score"><b>' + b.balance + '</b><span>points</span><span class="to">' + (can ? 'Ready to cash in!' : (target - b.balance) + ' to £' + s.cashIn.value) + '</span></div>' +
                '<div class="bar"><span style="width:' + pct + '%"></span></div>' +
                '<div class="row-btns">' + s.penalties.map(function (p) { return '<button class="pen" data-pen="' + i + ':' + p + '">−' + p + '</button>'; }).join('') +
                    '<button class="bonus" data-bonus="' + i + '">+ Bonus</button></div>' +
                '<button class="btn wide cash' + (can ? '' : ' off') + '" data-cash="' + i + '"' + (can ? '' : ' disabled') + '>Cash in ' + target + ' for £' + s.cashIn.value + '</button>' +
                '<details class="boy-more"' + (openBoys[b.name] ? ' open' : '') + ' data-boy="' + esc(b.name) + '"><summary>Tasks ' + (b.allTasks || b.tasks).length + ' · this morning ' + b.todos.filter(function (t) { return t.done; }).length + '/' + b.todos.length + ' · statement</summary>' +
                '<h3>Tasks (' + (b.allTasks || b.tasks).length + ')</h3>' + ((b.allTasks || b.tasks).length ? (b.allTasks || b.tasks).map(function (t) {
                    return '<button class="task" data-task="' + i + ':' + esc(t.id) + '"><span class="tick"></span><span class="tx">' + esc(t.text) + '</span><b>+' + t.points + '</b></button>';
                }).join('') : '<div class="mute small">No tasks waiting</div>') +
                '<h3>This morning</h3>' + (b.todos.length ? b.todos.map(function (t, j) {
                    return '<button class="todo' + (t.done ? ' done' : '') + '" data-todo="' + i + ':' + j + '"><span class="box"></span>' + esc(t.item) + '</button>';
                }).join('') : '<div class="mute small">Nothing today</div>') +
                '<h3>Statement <button class="link" data-stmt="' + i + '">See all</button></h3>' + b.statement.slice(0, 3).map(function (l) {
                    return '<div class="st"><span>' + esc(l.text) + '</span><b class="' + (l.points < 0 ? 'neg' : 'pos') + '">' + (l.points > 0 ? '+' : '') + l.points + '</b></div>';
                }).join('') + '</details></section>';
        }).join('');
    }
    var openBoys = {};
    document.addEventListener('toggle', function (e) { var d = e.target; if (d.classList && d.classList.contains('boy-more')) openBoys[d.getAttribute('data-boy')] = d.open; }, true);
    /** Setting up the points page: tasks, morning to-dos, reminders, rules. */
    function renderPointsSetup() {
        var pp = pointsPage(), s = DATA.state;
        title('Set up ' + (pp ? pp.title : 'points'));
        if (!s) { $('body').innerHTML = '<div class="empty">Loading…</div>'; return; }
        var target = s.cashIn.points;
        var tasks = (DATA.tasks || []).slice().sort(function (a, b) { return (+a.Order || 999) - (+b.Order || 999); });
        $('body').innerHTML = '<p class="mute small help">What the children earn points for, what they tick off each morning, their reminders, and the rules.</p>' +
            '<details class="card fold" id="fTasks"><summary><b>Tasks</b><span class="mute">' + tasks.length + ' · what earns points</span></summary>' +
                '<button class="btn wide top-btn" id="newTask">+ New task</button>' + (tasks.length ? tasks.map(function (t) {
                    return '<div class="trow' + (t.Active ? '' : ' paused') + '"><div class="tmain"><b>' + esc(t.Task) + '</b><span class="mute">' + esc(t.Boy || 'All') + ' · ' +
                        esc(t.Repeat || 'once') + (t.Active ? '' : ' · paused') + '</span></div><b class="pos">+' + esc(t.Points) + '</b>' +
                        '<button class="btn ghost sm" data-edit="' + esc(t.ID) + '">Edit</button></div>';
                }).join('') : '<div class="empty">No tasks yet</div>') + '<p class="mute small">Each child sees their next three open tasks on the screen, lowest order first.</p></details>' +
            listFold('todos') + listFold('timetable') +
            '<details class="card fold"><summary><b>Points rules</b><span class="mute">' + target + ' points = £' + s.cashIn.value + ' · penalties ' + esc(s.penalties.join(', ')) + '</span></summary>' +
                '<p class="mute small">How many points make a cash-in, what it’s worth, and the penalty buttons.</p><button class="btn ghost wide" id="rules">Change the rules</button></details>' +
            '<a class="link-card" data-go="s/family" href="#"><b>Who’s on the points page ›</b><span class="mute small">Add or rename children, or take someone off the points page, in Settings → Family & calendar.</span></a>';
        $('body').onclick = pointsClick;
        $('newTask').onclick = function () { taskSheet(null); };
        $('rules').onclick = function () { pageSheet(pp); };
        wireListFold('todos'); wireListFold('timetable');
    }
    var LISTS = {
        todos: { title: 'Morning to-dos', what: 'ticked off each morning', help: 'For: a name, names separated by commas, or All. Days: Mon-Fri, Mon,Wed, Weekends, Daily…',
            cols: [['Item', 'Item'], ['Boy', 'For'], ['Days', 'Days'], ['Order', 'Order']] },
        timetable: { title: 'Reminders', what: 'shown on the day and the evening before', help: 'Shown on the points page on the day, and from 5pm the evening before. Day: Tue, Mon-Fri, Mon,Thu… or a date for a one-off, e.g. 23/09.',
            cols: [['Reminder', 'Reminder'], ['Boy', 'For'], ['Day', 'Day or date']] },
    };
    function listFold(k) {
        var cfg = LISTS[k], rs = (DATA[k] || []).slice();
        if (!rs.length) rs.push({});
        return '<details class="card fold" id="f_' + k + '"><summary><b>' + cfg.title + '</b><span class="mute">' + (DATA[k] || []).length + ' · ' + cfg.what + '</span></summary>' +
            '<p class="mute small help">' + esc(cfg.help) + '</p><div class="lrows" id="rows_' + k + '">' + rs.map(function (r) { return rowCard(k, r); }).join('') + '</div>' +
            '<button class="btn ghost wide" data-ladd="' + k + '">+ Add</button><button class="btn wide" data-lsave="' + k + '">Save ' + cfg.title.toLowerCase() + '</button></details>';
    }
    function wireListFold(k) {
        var box = $('f_' + k);
        box.onclick = function (e) {
            e.stopPropagation();
            var el;
            if ((el = e.target.closest('[data-x]'))) el.closest('.lrow').remove();
            else if (e.target.closest('[data-ladd]')) $('rows_' + k).insertAdjacentHTML('beforeend', rowCard(k, {}));
            else if (e.target.closest('[data-lsave]')) {
                var out = Array.prototype.map.call(box.querySelectorAll('.lrow'), function (r) {
                    var o = {}; r.querySelectorAll('[data-k]').forEach(function (i) { o[i.getAttribute('data-k')] = i.value.trim(); }); return o;
                });
                act({ action: 'saveList', list: k, rows: out }, 'Saved').then(function () { var f = $('f_' + k); if (f) f.open = true; }, function () {});
            }
        };
    }
    function maxFor(list, col) {
        var m = { todos: { Item: L().todo }, timetable: { Reminder: L().reminder } }[list];
        return m && m[col];
    }
    function rowCard(k, r) {
        return '<div class="lrow"><button class="x" data-x>✕</button>' + LISTS[k].cols.map(function (c) {
            var n = maxFor(k, c[0]);
            return '<label>' + esc(c[1]) + (n ? ' <span class="cnt">max ' + n + '</span>' : '') + '</label><input data-k="' + c[0] + '" value="' + esc(r[c[0]]) + '"' + (n ? ' maxlength="' + n + '"' : '') + ' autocomplete="off">';
        }).join('') + '</div>';
    }
    /** Today's and tomorrow's reminders; from 5pm only tomorrow's. */
    function reminders(b) {
        var evening = new Date().getHours() >= 17, tmr = b.remindersTomorrow || [];
        function grp(label, list, cls) {
            return list.length ? '<div class="rems ' + cls + '"><em>' + label + '</em>' + list.map(function (r) { return '<span class="rem">' + esc(r) + '</span>'; }).join('') + '</div>' : '';
        }
        return evening ? grp('Tomorrow', tmr, 'now') : grp('Today', b.reminders || [], 'now') + grp('Tomorrow', tmr, 'next');
    }
    function pointsClick(e) {
        var s = DATA.state, el;
        if ((el = e.target.closest('[data-pen]'))) {
            var pp = el.getAttribute('data-pen').split(':'), b = s.boys[+pp[0]];
            act({ action: 'penalty', boy: b.name, points: +pp[1], reason: 'Penalty' }, b.name + ' −' + pp[1], true);
        } else if ((el = e.target.closest('[data-task]'))) {
            var tp = el.getAttribute('data-task').split(':'), bb = s.boys[+tp[0]], t = (bb.allTasks || bb.tasks).filter(function (x) { return x.id === tp[1]; })[0];
            el.classList.add('done');
            act({ action: 'complete', boy: bb.name, taskId: tp[1] }, bb.name + ' +' + t.points + ' for ' + t.text, true);
        } else if ((el = e.target.closest('[data-todo]'))) {
            var dp = el.getAttribute('data-todo').split(':'), b2 = s.boys[+dp[0]], td = b2.todos[+dp[1]];
            td.done = !td.done; el.classList.toggle('done', td.done);
            act({ action: 'todo', boy: b2.name, item: td.item, done: td.done });
        } else if ((el = e.target.closest('[data-cash]'))) {
            var b3 = s.boys[+el.getAttribute('data-cash')];
            if (confirm('Cash in ' + s.cashIn.points + ' points for £' + s.cashIn.value + ' for ' + b3.name + '?'))
                act({ action: 'cashin', boy: b3.name }, b3.name + ' cashed in £' + s.cashIn.value, true);
        } else if ((el = e.target.closest('[data-bonus]'))) {
            bonusSheet(s.boys[+el.getAttribute('data-bonus')]);
        } else if ((el = e.target.closest('[data-stmt]'))) {
            var who = s.boys[+el.getAttribute('data-stmt')].name;
            load().then(function () { statementSheet(DATA.state.boys.filter(function (x) { return x.name === who; })[0]); });
        } else if ((el = e.target.closest('[data-edit]'))) {
            taskSheet(DATA.tasks.filter(function (t) { return t.ID === el.getAttribute('data-edit'); })[0]);
        }
    }
    function bonusSheet(b) {
        sheet('<h2>Points for ' + esc(b.name) + '</h2><p class="mute">Use a minus number to take points off.</p>' +
            '<div class="chips quick">' + [5, 10, 20, 50].map(function (n) { return '<button class="chip" data-q="' + n + '">+' + n + '</button>'; }).join('') + '</div>' +
            '<label>Points</label><input id="bPts" type="number" inputmode="numeric" placeholder="e.g. 20 or -20">' +
            '<label>Reason <span class="cnt">max ' + L().reason + '</span></label><input id="bWhy" maxlength="' + L().reason + '" placeholder="e.g. Helped with shopping" autocomplete="off">' +
            '<div class="sheet-actions"><button class="btn ghost" id="bCancel">Cancel</button><button class="btn good" id="bSave">Save</button></div>');
        $('sheet').querySelector('.quick').onclick = function (e) { var q = e.target.closest('[data-q]'); if (q) $('bPts').value = q.getAttribute('data-q'); };
        $('bCancel').onclick = closeSheet;
        $('bSave').onclick = function () {
            var n = Number($('bPts').value);
            if (!n) { FD.toast('Enter some points', true); return; }
            closeSheet();
            act({ action: 'adjust', boy: b.name, points: n, reason: $('bWhy').value.trim() || (n > 0 ? 'Bonus' : 'Penalty') }, b.name + ' ' + (n > 0 ? '+' : '') + n, true);
        };
    }
    function statementSheet(b) {
        var rs = (DATA.ledger || []).filter(function (l) { return l.Boy === b.name; });
        sheet('<h2>' + esc(b.name) + '’s statement</h2><p class="mute">Balance ' + b.balance + ' points. Tap Remove to take an entry off.</p>' +
            (rs.length ? rs.map(function (l) {
                return '<div class="st big"><div><span>' + esc(l.Description) + '</span><small>' + esc(l.Timestamp) + '</small></div><b class="' + (l.Points < 0 ? 'neg' : 'pos') + '">' +
                    (l.Points > 0 ? '+' : '') + esc(l.Points) + '</b><button class="btn ghost sm" data-rm="' + esc(l.ID) + '">Remove</button></div>';
            }).join('') : '<div class="empty">Nothing yet</div>') + '<button class="btn ghost wide" id="sClose">Close</button>');
        $('sClose').onclick = closeSheet;
        $('sheet').onclick = function (e) {
            var r = e.target.closest('[data-rm]'); if (!r) return;
            if (!confirm('Remove this entry?')) return;
            closeSheet();
            act({ action: 'undo', id: r.getAttribute('data-rm') }, 'Removed').then(load);
        };
    }
    function taskSheet(t) {
        var names = ['All'].concat(DATA.boys.map(function (b) { return b.Name; }).filter(Boolean));
        t = t || { ID: '', Task: '', Points: '', Boy: 'All', Repeat: 'once', Order: '', Active: true };
        sheet('<h2>' + (t.ID ? 'Edit task' : 'New task') + '</h2>' +
            '<label>Task <span class="cnt">max ' + L().task + '</span></label><input id="tTask" maxlength="' + L().task + '" value="' + esc(t.Task) + '" placeholder="e.g. Tidy your bedroom" autocomplete="off">' +
            '<div class="two"><div><label>Points</label><input id="tPts" type="number" inputmode="numeric" value="' + esc(t.Points) + '"></div>' +
            '<div><label>Order</label><input id="tOrd" type="number" inputmode="numeric" value="' + esc(t.Order) + '" placeholder="10"></div></div>' +
            '<label>For</label><select id="tBoy">' + names.map(function (n) { return '<option' + (n === (t.Boy || 'All') ? ' selected' : '') + '>' + esc(n) + '</option>'; }).join('') + '</select>' +
            '<label>Repeats</label><select id="tRep">' + [['once', 'Once (gone when done)'], ['daily', 'Daily (back tomorrow)'], ['always', 'Always available']].map(function (o) {
                return '<option value="' + o[0] + '"' + (o[0] === t.Repeat ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>' +
            '<div class="sheet-actions"><button class="btn ghost" id="tCancel">Cancel</button><button class="btn good" id="tSave">Save</button></div>' +
            (t.ID ? '<div class="sheet-actions"><button class="btn ghost" id="tPause">' + (t.Active ? 'Pause' : 'Resume') + '</button><button class="btn bad" id="tDel">Delete</button></div>' : ''));
        $('tCancel').onclick = closeSheet;
        $('tSave').onclick = function () {
            var task = { ID: t.ID, Task: $('tTask').value.trim(), Points: $('tPts').value, Boy: $('tBoy').value, Repeat: $('tRep').value, Order: $('tOrd').value, Active: t.Active !== false };
            act({ action: 'saveTask', task: task }, 'Task saved').then(function () { closeSheet(); if ($('fTasks')) $('fTasks').open = true; }, function () {});
        };
        if (t.ID) {
            $('tPause').onclick = function () { act({ action: 'saveTask', task: Object.assign({}, t, { Active: !t.Active }) }, t.Active ? 'Paused' : 'Resumed').then(closeSheet, function () {}); };
            $('tDel').onclick = function () { if (confirm('Delete this task? Points already earned stay.')) act({ action: 'deleteTask', id: t.ID }, 'Deleted').then(closeSheet, function () {}); };
        }
    }

    /* ================================================================ lists: notes, shopping, to-dos together */

    function renderMemos() { renderListsOf('Notes', function (w) { return w.type === 'memo'; }, 'No notes on the screen', 'Add a Memo (notes) widget'); }
    function renderLists() { renderListsOf('Lists', function (w) { return w.type === 'list' || w.type === 'todo'; }, 'No lists on the screen', 'Add a List or To-do widget'); }
    function renderListsOf(name, which, none, how) {
        title(name);
        var ws = distinct(which);
        if (!ws.length) { $('body').innerHTML = card(none, '<p class="mute">' + how + ' on Setup, on a computer: ' + esc(deskShort()) + '.</p>'); return; }
        // Only one list at a time can be edited here (the editors share element ids), so the others show a summary.
        var open = sessionStorage.getItem('fdadmin.openList') || ws[0].id;
        if (!ws.some(function (w) { return w.id === open; })) open = ws[0].id;
        $('body').innerHTML = (ws.length < 2 ? '<div id="lseg"></div>' : '<div class="seg lseg" id="lseg">' + ws.map(function (w) { return '<button data-l="' + esc(w.id) + '" class="' + (w.id === open ? 'on' : '') + '">' + esc(typeOf(w.type).icon) + ' ' + esc(widgetName(w)) + '</button>'; }).join('') + '</div>') +
            '<div id="lone">' + VIEWS[widgetOf(open).type](widgetOf(open)) + '</div>';
        $('lseg').onclick = function (e) { var b = e.target.closest('[data-l]'); if (b) { try { sessionStorage.setItem('fdadmin.openList', b.getAttribute('data-l')); } catch (x) { /* fine */ } render(); } };
        WIRE[widgetOf(open).type](widgetOf(open));
    }

    /* the List and To-do widgets' items, edited right here */
    function listEditor(w) {
        return '<div class="ls-add"><input id="lsNew" maxlength="' + (L().listItem || 30) + '" placeholder="Add an item…" autocomplete="off"><button class="btn sm" id="lsAdd">Add</button></div>' +
            '<div id="lsItems">' + listItems(w) + '</div>';
    }
    function listItems(w) {
        var d = (DATA.lists || {})[w.id];
        if (!d) return '<div class="mute small">Refresh to see the list.</div>';
        if (d.error) return '<div class="err small">' + esc(d.error) + '</div>';
        var done = d.items.filter(function (i) { return i.done; }).length;
        return (d.items.length ? d.items.map(function (i) {
            return '<div class="ls-row"><button class="todo' + (i.done ? ' done' : '') + '" data-ltog="' + esc(i.id) + '"><span class="box"></span><span class="ls-t">' + esc(i.text) +
                (i.due ? '<small>' + esc(daysTo(i.due) < 0 ? 'Overdue · ' + nice(i.due) : nice(i.due)) + '</small>' : '') + '</span></button>' +
                (w.type === 'todo' ? '<button class="star' + (i.star ? ' on' : '') + '" data-lstar="' + esc(i.id) + '" aria-label="Priority">' + (i.star ? '★' : '☆') + '</button>' : '') +
                '<button class="x" data-lrm="' + esc(i.id) + '">✕</button></div>';
        }).join('') : '<div class="mute small">Nothing on the list</div>') +
            (done ? '<button class="btn ghost sm" id="lsClear">Clear ' + done + ' ticked</button>' : '');
    }
    function wireList(w) {
        function op(body) {
            body.action = 'listItem'; body.widget = w.id;
            return act(body).then(function (d) { if (d && d.data) DATA.lists[w.id] = d.data; if ($('lsItems')) { $('lsItems').innerHTML = listItems(w); bindClear(); } });
        }
        function bindClear() { if ($('lsClear')) $('lsClear').onclick = function () { op({ op: 'clearDone' }); }; }
        $('lsAdd').onclick = function () { var t = $('lsNew').value.trim(); if (!t) return; $('lsNew').value = ''; op({ op: 'add', text: t }); };
        $('lsNew').onkeydown = function (e) { if (e.key === 'Enter') $('lsAdd').onclick(); };
        $('lsItems').onclick = function (e) {
            var el;
            if ((el = e.target.closest('[data-ltog]'))) { el.classList.toggle('done'); op({ op: 'toggle', id: el.getAttribute('data-ltog') }); }
            else if ((el = e.target.closest('[data-lstar]'))) { el.classList.toggle('on'); el.textContent = el.classList.contains('on') ? '★' : '☆'; op({ op: 'star', id: el.getAttribute('data-lstar') }); }
            else if ((el = e.target.closest('[data-lrm]'))) op({ op: 'remove', id: el.getAttribute('data-lrm') });
        };
        bindClear();
    }

    /* Memo widget: notes added from the phone */
    var NOTE_COLOURS = ['#ffe58a', '#ffc2d4', '#b9e6ff', '#c8f2b5', '#e3d1ff'];
    /** The notes as they look on the screen (sticky notes, newest last), each with ✕ – then a box to add one. */
    function memoEditor() {
        var max = L().maxNotes || 6, n = (DATA.memos || []).length;
        return '<div id="mmItems">' + memoItems() + '</div>' +
            card('Add a note', n >= max ? '<p class="mute small">There are ' + max + ' notes – the most that fit (3 pages on the screen). Remove one to add another.</p>' :
                '<div class="ls-add"><input id="mmNew" maxlength="' + (L().memo || 80) + '" placeholder="Write a note…" autocomplete="off"></div>' +
                '<div class="ls-add"><input id="mmFrom" maxlength="12" placeholder="From (optional)" value="' + esc(localStorage.getItem('fdadmin.from') || '') + '" autocomplete="off"><button class="btn sm" id="mmAdd">Add</button></div>' +
                '<p class="mute small">' + n + ' of ' + max + ' notes. The screen shows two at a time and turns the page by itself.</p>');
    }
    function memoItems() {
        var m = DATA.memos || [];
        return m.length ? '<div class="stickies">' + m.map(function (x, i) {
            return '<div class="sticky" style="--nc:' + NOTE_COLOURS[i % NOTE_COLOURS.length] + ';--rot:' + ((i % 3) - 1) * 1.2 + 'deg"><span>' + esc(x.text) + '</span><small>' + (x.from ? '— ' + esc(x.from) + ', ' : '') + esc(x.added) + '</small>' +
                '<button class="x" data-mrm="' + esc(x.id) + '" aria-label="Remove">✕</button></div>';
        }).join('') + '</div>' : card('', '<div class="mute small">No notes on the screen</div>');
    }
    function wireMemo() {
        function after() { return load(); }
        if ($('mmAdd')) $('mmAdd').onclick = function () {
            var t = $('mmNew').value.trim(), f = $('mmFrom').value.trim(); if (!t) return;
            try { localStorage.setItem('fdadmin.from', f); } catch (e) { /* ignore */ }
            $('mmNew').value = '';
            act({ action: 'memo', op: 'add', text: t, from: f }, 'Note added').then(after, function () {});
        };
        if ($('mmNew')) $('mmNew').onkeydown = function (e) { if (e.key === 'Enter') $('mmAdd').onclick(); };
        $('mmItems').onclick = function (e) { var b = e.target.closest('[data-mrm]'); if (b) act({ action: 'memo', op: 'remove', id: b.getAttribute('data-mrm') }, 'Removed').then(after, function () {}); };
    }

    /* Weasley clock: move people by hand, and the links for phone automations */
    function whereEditor(w) {
        var d = ((DATA.whereabouts || []).filter(function (x) { return x.id === w.id; })[0] || {}).data;
        if (!d) return '<div class="mute small">Refresh to see everyone.</div>';
        var c = FD.config(), base = c.url + '?action=where&code=' + encodeURIComponent(c.code);
        return d.people.map(function (p) {
            return '<label>' + esc(p.name) + '</label><select data-who="' + esc(p.name) + '">' + ['<option value="">(not set)</option>'].concat(d.places.map(function (pl) {
                return '<option' + (pl === p.place ? ' selected' : '') + '>' + esc(pl) + '</option>'; })).join('') + '</select>';
        }).join('') +
        '<details class="adv"><summary>Move the hands automatically from phones</summary>' +
        '<p class="mute small">iPhone: Shortcuts app → Automation → “When I arrive at / leave” a place → Get contents of URL, with the link below. ' +
        'Android: the same with an automation app (e.g. MacroDroid → HTTP request). Change the name and place in each link.</p>' +
        '<label>Set a place</label><textarea readonly rows="3">' + esc(base + '&person=' + encodeURIComponent(d.people[0] ? d.people[0].name : 'Ben') + '&place=' + encodeURIComponent(d.places[1] || 'School')) + '</textarea>' +
        '<label>Or send the phone’s position (it picks the nearest place, otherwise Travelling)</label><textarea readonly rows="3">' + esc(base + '&person=NAME&lat=LATITUDE&lon=LONGITUDE') + '</textarea>' +
        '<label>OwnTracks app (HTTP mode) URL</label><textarea readonly rows="3">' + esc(c.url + '?owntracks=1&code=' + encodeURIComponent(c.code) + '&person=NAME') + '</textarea>' +
        '<p class="mute small">These links contain your access code – only put them on family phones.</p></details>';
    }
    function wireWhere() {
        Array.prototype.forEach.call(document.querySelectorAll('#body [data-who]'), function (sel) {
            sel.onchange = function () {
                if (!sel.value) return;
                act({ action: 'where', person: sel.getAttribute('data-who'), place: sel.value, how: 'phone app' }, sel.getAttribute('data-who') + ' → ' + sel.value).then(function () { load(); }, function () {});
            };
        });
    }

    /* Spotify: one-off connection */
    function spotifyBox() {
        var c = FD.config(), ok = DATA.spotifyConnected;
        var hasKeys = (DATA.install || []).some(function (f) { return f.k === 'SpotifyClientId' && f.value; });
        return '<h3 class="sh">Spotify account</h3><p class="mute small">' + (ok ? '✅ Connected.' : hasKeys ? 'Not connected yet.' :
            'First create an app at developer.spotify.com and put its Client ID and secret in Settings → API keys.') + ' Spotify needs Premium for play/pause/skip.</p>' +
            (hasKeys ? '<a class="btn wide" target="_blank" rel="noopener" href="' + esc(c.url + '?spotify=login&key=' + encodeURIComponent(c.code)) + '">' + (ok ? 'Reconnect Spotify' : 'Connect Spotify') + '</a>' : '<button class="btn ghost wide" data-go="s/keys">API keys</button>');
    }

    /* ================================================================ screen layout: pages & widgets */

    /** Same packing as the screen: a full widget takes a column, two half widgets share one. */
    function pack(ws) {
        var cols = [];
        ws.filter(function (w) { return w.show; }).forEach(function (w) {
            var last = cols[cols.length - 1];
            if (w.size === 'half' && last && last.length === 1 && last[0].size === 'half') last.push(w); else cols.push([w]);
        });
        return cols;
    }
    function preview(pid) {
        var cols = pack(widgetsOn(pid)), n = (DATA.limits && DATA.limits.columns) || 4, html = '';
        for (var i = 0; i < Math.max(n, cols.length); i++) {
            var c = cols[i] || [];
            html += '<div class="pv-col' + (i >= n ? ' over' : '') + '">' + (c.length ? c.map(function (w) {
                var T = typeOf(w.type);
                return '<button class="pv-w ' + w.size + '" data-w="' + esc(w.id) + '"><span>' + esc(T.icon) + '</span><b>' + esc(T.name) + '</b></button>';
            }).join('') : '<span class="pv-empty">empty</span>') + '</div>';
        }
        var over = cols.length - n;
        return '<div class="pv">' + html + '</div>' + (over > 0 ? '<p class="err small">' + over + ' column' + (over > 1 ? 's' : '') + ' won’t fit on the screen – make some widgets half height, move them to another page or hide them.</p>' : '');
    }
    function renderLayout() {
        title('Screen layout');
        // The Setup website has the drag-and-drop editor (setup/editor.js).
        if (DESK && window.FDEditor) {
            window.FDEditor.render($('body'), { data: function () { return DATA; }, act: act, setData: setData, esc: esc, typeOf: typeOf, pageTypeOf: pageTypeOf,
                widgetSheet: function (id) { widgetSheet(widgetOf(id)); }, pageSheet: function (id) { pageSheet(pageOf(id)); }, summary: summary, toast: FD.toast });
            return;
        }
        var pages = DATA.pages || [];
        $('body').innerHTML = '<p class="mute small help">Which widgets go on each page, and how tall. Each widget is a quarter of the screen wide, full or half height; two half-height widgets share a column. ' +
            'Tap a widget to move, resize or hide it – its own settings are on its page in Family, Lists or Other.</p>' +
            '<details class="card fold"><summary><b>One layout for every screen</b><span class="mute">Corsair, tablet and computer</span></summary><p class="small">' +
            '<b>Corsair:</b> all four columns. <b>Tablet:</b> two columns at a time – a page with more than two columns gets two buttons, e.g. Home 1 and Home 2. The children’s page fits 3 children a screen (on a tablet each child’s card is stacked, thinner and taller), with more buttons if needed. ' +
            '<b>Computer:</b> the Corsair layout, scaled to fit the window (the calendar’s Year view uses the whole window). So you only set it up once.</p></details>' +
            pages.map(function (p, i) {
                var ws = widgetsOn(p.id), isW = p.type === 'widgets';
                return '<section class="card pg' + (p.show ? '' : ' off') + '"><div class="pg-top"><span class="pg-ico">' + esc(p.icon) + '</span><h2>' + esc(p.title) + '</h2>' +
                    '<span class="badge">' + esc(isW ? ws.length + ' widget' + (ws.length === 1 ? '' : 's') : pageTypeOf(p.type).name) + '</span>' + (p.show ? '' : '<span class="badge">hidden</span>') +
                    '<button class="mini" data-pmove="' + esc(p.id) + ':-1"' + (i ? '' : ' disabled') + '>▲</button><button class="mini" data-pmove="' + esc(p.id) + ':1"' + (i < pages.length - 1 ? '' : ' disabled') + '>▼</button>' +
                    '<button class="btn ghost sm" data-pedit="' + esc(p.id) + '">Edit</button></div>' +
                    (isW ? preview(p.id) + '<div class="wl">' + ws.map(function (w, j) {
                        var T = typeOf(w.type);
                        var bk = backupFor(w), tm = w.when ? '⏰ ' + w.when.ShowDays + ' ' + w.when.ShowFrom + '–' + w.when.ShowUntil + (w.when.OtherTimes ? ', then ' + typeOf(w.when.OtherTimes).name : '') : '';
                        return '<div class="wrow' + (w.show ? '' : ' off') + (w.pending ? ' pending' : '') + '"><button class="wmain" data-w="' + esc(w.id) + '"><span class="wico">' + esc(T.icon) + '</span><span class="wtx"><b>' + esc(T.name) + '</b><small>' +
                            esc(bk ? '⏰ Shown in place of ' + bk + ' at other times' : tm || summary(w)) + '</small></span><span class="badge">' + (w.show ? w.size : 'hidden') + '</span></button>' +
                            '<button class="mini" data-wmove="' + esc(w.id) + ':-1"' + (j ? '' : ' disabled') + '>▲</button><button class="mini" data-wmove="' + esc(w.id) + ':1"' + (j < ws.length - 1 ? '' : ' disabled') + '>▼</button></div>';
                    }).join('') + '</div><button class="btn ghost wide" data-wadd="' + esc(p.id) + '">+ Add a widget to ' + esc(p.title) + '</button>' : '') +
                    '</section>';
            }).join('') +
            '<button class="btn ghost wide" id="pAdd">+ New widget page</button>';
        $('pAdd').onclick = function () { newPageSheet(); };
        $('body').onclick = function (e) {
            var el;
            if ((el = e.target.closest('[data-w]'))) widgetSheet(widgetOf(el.getAttribute('data-w')));
            else if ((el = e.target.closest('[data-wmove]'))) { var a = el.getAttribute('data-wmove').split(':'); moveNow('w', a[0], +a[1]); }
            else if ((el = e.target.closest('[data-pmove]'))) { var b = el.getAttribute('data-pmove').split(':'); moveNow('p', b[0], +b[1]); }
            else if ((el = e.target.closest('[data-pedit]'))) pageSheet(pageOf(el.getAttribute('data-pedit')));
            else if ((el = e.target.closest('[data-wadd]'))) addWidgetSheet(el.getAttribute('data-wadd'));
        };
    }
    /** One line under each widget's name: its key settings. */
    function summary(w) {
        var s = w.settings || {};
        switch (w.type) {
            case 'trains': return s.From + ' → ' + s.To;
            case 'traffic': return lines(s.Destinations).join(', ');
            case 'weather': return s.Location || 'Home';
            case 'bins': return s.Source === 'Calendar link' ? 'your council’s calendar link' : s.Source === 'Repeating schedule' ? (lines(s.Schedule).length ? 'entered by hand – ' + lines(s.Schedule).join(', ') : 'not set up yet') : s.Postcode || s.Council ? 'your council, automatically' + (s.Postcode ? ' (' + s.Postcode + ')' : '') : 'not set up yet';
            case 'flights': return 'Within ' + s.RadiusMiles + ' miles';
            case 'news': return s.Feed;
            case 'photos': return s.Source + ((s.Source === 'Google Drive folder' ? s.DriveFolder : s.AlbumLink) ? '' : ' – link needed');
            case 'clock': return lines(s.Zones).join(', ') || 'Local time';
            case 'list': return s.ListName + ' · ' + s.Source;
            case 'timer': return s.Presets + ' min';
            case 'countdown': return s.Categories ? 'Calendar: ' + s.Categories : 'Your own dates';
            case 'whereabouts': return lines(s.People).join(', ');
            case 'bus': return s.StopName || (s.StopCode ? s.StopCode : 'Nearest stop to home');
            case 'todo': return 'Google Tasks' + (s.TasksList ? ' · ' + s.TasksList : '');
            case 'words': return s.Language + (s.Duolingo ? ' · Duolingo: ' + s.Duolingo : '');
            case 'spotify': return DATA.spotifyConnected ? 'Connected' : 'Not connected yet';
            case 'quote': return s.Source + ' · ' + s.Change;
            default: return typeOf(w.type).about || '';
        }
    }

    /** Form fields from the setting definitions sent by the Google script. */
    function field(f, v) {
        var id = 'f_' + f.k, help = f.help ? '<div class="mute small hint">' + esc(f.help) + '</div>' : '';
        var lab = '<label for="' + id + '">' + esc(f.label) + (f.max && f.type === 'text' ? ' <span class="cnt">max ' + f.max + '</span>' : '') + '</label>';
        if (f.type === 'bool') return '<label class="tog"><input type="checkbox" id="' + id + '" data-f="' + esc(f.k) + '"' + (v ? ' checked' : '') + '><span>' + esc(f.label) + '</span></label>' + help;
        if (f.type === 'select') return lab + '<select id="' + id + '" data-f="' + esc(f.k) + '">' + f.options.map(function (o) { return '<option' + (o === v ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('') + '</select>' + help;
        if (f.type === 'lines') return lab + '<textarea id="' + id + '" data-f="' + esc(f.k) + '" rows="' + Math.max(2, (f.maxLines || 3)) + '">' + esc(v) + '</textarea>' + help;
        var t = f.type === 'number' ? ' type="number" inputmode="numeric"' + (f.min != null ? ' min="' + f.min + '"' : '') + (f.max != null ? ' max="' + f.max + '"' : '')
            : f.type === 'url' ? ' type="url" inputmode="url"' : f.type === 'time' ? ' type="time"' : f.type === 'crs' ? ' maxlength="3" autocapitalize="characters"' : (f.max ? ' maxlength="' + f.max + '"' : '');
        return lab + '<input id="' + id + '" data-f="' + esc(f.k) + '" value="' + esc(v) + '"' + t + ' autocomplete="off">' + help;
    }
    function fields(defs, vals) {
        var main = defs.filter(function (f) { return !f.advanced; }), adv = defs.filter(function (f) { return f.advanced; });
        // A setting that only matters for some choices of another (e.g. Bins: the calendar link only for "Calendar link").
        var one = function (f) { var h = field(f, vals[f.k]); return f.when ? '<div class="fwhen" data-wk="' + esc(f.when[0]) + '" data-wv="' + esc(JSON.stringify(f.when[1])) + '">' + h + '</div>' : h; };
        return main.map(one).join('') + (adv.length ? '<details class="adv"><summary>More settings</summary>' + adv.map(one).join('') + '</details>' : '');
    }
    function applyWhen() {
        Array.prototype.forEach.call(document.querySelectorAll('.fwhen'), function (d) {
            var ctl = document.querySelector('[data-f="' + d.getAttribute('data-wk') + '"]'); if (!ctl) return;
            var ok = []; try { ok = JSON.parse(d.getAttribute('data-wv')); } catch (e) { /* show */ }
            d.style.display = ok.indexOf(ctl.value) >= 0 ? '' : 'none';
        });
    }
    document.addEventListener('change', function (e) { if (e.target.closest && e.target.closest('[data-f]')) applyWhen(); });
    function readFields() {
        var out = {};
        Array.prototype.forEach.call(document.querySelectorAll('#sheet [data-f]'), function (i) { out[i.getAttribute('data-f')] = i.type === 'checkbox' ? i.checked : i.value.trim(); });
        return out;
    }

    function widgetSheet(w) {
        if (!w) return;
        var T = typeOf(w.type), pages = DATA.pages.filter(function (p) { return p.type === 'widgets'; });
        sheet('<h2>' + esc(T.icon) + ' ' + esc(T.name) + '</h2><p class="mute small">' + esc(T.about) + '</p>' +
            '<div class="two"><div><label>Page</label><select id="wPage">' + pages.map(function (p) { return '<option value="' + esc(p.id) + '"' + (p.id === w.page ? ' selected' : '') + '>' + esc(p.title) + '</option>'; }).join('') + '</select></div>' +
            '<div><label>Height</label><select id="wSize"' + (T.sizes.length < 2 ? ' disabled' : '') + '>' + T.sizes.map(function (z) { return '<option value="' + z + '"' + (z === w.size ? ' selected' : '') + '>' + (z === 'full' ? 'Full height' : 'Half height') + '</option>'; }).join('') + '</select></div></div>' +
            '<label class="tog"><input type="checkbox" id="wShow"' + (w.show ? ' checked' : '') + '><span>Show on the screen</span></label>' +
            whenHtml(w, T) +
            '<div class="sheet-actions"><button class="btn ghost" id="wCancel">Cancel</button><button class="btn good" id="wSave">Save</button></div>' +
            '<button class="btn ghost wide" data-go="w/' + esc(w.id) + '">' + esc(widgetName(w)) + ' settings ›</button>' +
            '<div class="sheet-actions"><button class="btn bad" id="wDel">Remove this widget</button></div>');
        // At other times: only kinds of widget that can be this height.
        var fitElse = function () {
            var z = $('wSize').value;
            Array.prototype.forEach.call($('whElse').options, function (o) {
                var ok = !o.value || (o.getAttribute('data-sizes') || '').split(' ').indexOf(z) >= 0;
                o.hidden = !ok; o.disabled = !ok;
                if (!ok && o.selected) $('whElse').value = '';
            });
        };
        $('wSize').onchange = fitElse; fitElse();
        $('wCancel').onclick = closeSheet;
        $('wSave').onclick = function () {
            var body = { id: w.id, page: $('wPage').value, size: $('wSize').value, show: $('wShow').checked,
                when: { ShowDays: $('whDays').value, ShowFrom: $('whFrom').value.slice(0, 5) || '00:00', ShowUntil: $('whUntil').value.slice(0, 5) || '24:00', OtherTimes: $('whElse').value } };
            // Shown on the phone straight away; the Google script catches up in the background (an error puts it back).
            savingNow(w, function () { w.page = body.page; w.size = body.size; w.show = body.show; w.when = body.when.ShowDays === 'Every day' && body.when.ShowFrom === '00:00' && body.when.ShowUntil === '24:00' ? null : body.when; });
            act({ action: 'saveWidget', widget: body }, 'Saved – the screen updates within a minute')
                .then(function () { delete GL[w.id]; if (route().w === w.id) fetchWidget(w.id); }, function () {});
        };
        $('wDel').onclick = function () {
            if (confirm('Remove the ' + T.name + ' widget and its settings?')) act({ action: 'deleteWidget', id: w.id }, 'Removed').then(function () { closeSheet(); if (route().w) go('layout'); }, function () {});
        };
    }
    /** The widgets this one stands in for at other times ("When to show"), by name – or ''. */
    function backupFor(w) {
        var src = (DATA.widgets || []).filter(function (x) { return x.type === w.type && !x.pending; })[0];
        if (!src || src.id !== w.id) return '';
        return (DATA.widgets || []).filter(function (x) { return x.when && x.when.OtherTimes === w.type; }).map(function (x) { return typeOf(x.type).name; }).join(' and ');
    }
    /** Show a change on the phone at once and close the form, while it's saved in the background. */
    function savingNow(w, apply) {
        apply(); closeSheet(); setData(DATA);
        FD.toast('Saving…');
    }
    /** A time picked from a list (every half hour) – phone keyboards often have no colon. */
    function timeSel(id, v, end) {
        var opts = [];
        for (var m = end ? 30 : 0; m <= (end ? 1440 : 1410); m += 30) opts.push(('0' + Math.floor(m / 60)).slice(-2) + ':' + ('0' + m % 60).slice(-2));
        if (v && opts.indexOf(v) < 0) { opts.push(v); opts.sort(); }
        return '<select id="' + id + '">' + opts.map(function (t) { return '<option value="' + t + '"' + (t === v ? ' selected' : '') + '>' + t + (t === '24:00' ? ' (midnight)' : t === '00:00' ? ' (midnight)' : t === '12:00' ? ' (midday)' : '') + '</option>'; }).join('') + '</select>';
    }
    /** "When to show": only some days and times, with another kind of widget in its space at other times. */
    function whenHtml(w, T) {
        var W = w.when || { ShowDays: 'Every day', ShowFrom: '00:00', ShowUntil: '24:00', OtherTimes: '' };
        var days = ['Every day', 'Monday to Friday', 'Monday to Thursday', 'Weekends'];
        return '<details class="when"' + (w.when ? ' open' : '') + '><summary>⏰ When to show' + (w.when ? ': ' + esc(W.ShowDays) + ', ' + esc(W.ShowFrom) + '–' + esc(W.ShowUntil) : ' (always)') + '</summary>' +
            '<p class="mute small">For example, trains on weekday mornings only, with the holiday countdown in the same space the rest of the time.</p>' +
            '<label>Show on</label><select id="whDays">' + days.map(function (d) { return '<option' + (d === W.ShowDays ? ' selected' : '') + '>' + d + '</option>'; }).join('') + '</select>' +
            '<div class="two"><div><label>From</label>' + timeSel('whFrom', W.ShowFrom, false) + '</div>' +
            '<div><label>Until</label>' + timeSel('whUntil', W.ShowUntil, true) + '</div></div>' +
            '<label>At other times show</label><select id="whElse"><option value="">Nothing – leave the space empty</option>' +
            DATA.types.filter(function (x) { return x.type !== w.type; }).map(function (x) { return '<option value="' + esc(x.type) + '" data-sizes="' + esc(x.sizes.join(' ')) + '"' + (x.type === W.OtherTimes ? ' selected' : '') + '>' + esc(x.icon + ' ' + x.name) + '</option>'; }).join('') + '</select>' +
            '<p class="mute small">Only widgets that can be the same height are offered. It uses the settings of your existing widget of that kind, if you have one. Midnight to midday is 00:00 until 12:00.</p></details>';
    }
    /** A widget's own settings (from its page in Family / Lists / Other). Where it goes is on the Screen tab. */
    function settingsSheet(w) {
        var T = typeOf(w.type), defs = T.settings, extra = '';
        if (w.type === 'bins') {   // where the bin days come from is set by "Set up bin days"; only the reminder is a setting
            defs = defs.filter(function (f) { return f.k === 'ReminderFrom'; });
            extra = '<p class="small"><b>Bin days come from:</b> ' + esc(summary(w)) + '</p><button class="btn ghost wide" id="wBins">Set up bin days</button>';
        }
        sheet('<h2>' + esc(T.icon) + ' ' + esc(widgetName(w)) + ' settings</h2><p class="mute small">' + esc(T.about) + '</p>' + extra + fields(defs, w.settings) +
            '<div class="sheet-actions"><button class="btn ghost" id="wCancel">Cancel</button><button class="btn good" id="wSave">Save</button></div>');
        applyWhen();
        if ($('wBins')) $('wBins').onclick = function () { binWizard(w); };
        $('wCancel').onclick = closeSheet;
        $('wSave').onclick = function () {
            var vals = readFields();
            savingNow(w, function () { Object.keys(vals).forEach(function (k) { w.settings[k] = vals[k]; }); });
            act({ action: 'saveWidget', widget: { id: w.id, settings: vals } }, 'Saved – the screen updates within a minute')
                .then(function () { delete GL[w.id]; if (route().w === w.id) fetchWidget(w.id); }, function () {});
        };
    }
    function addWidgetSheet(pid) {
        var page = pageOf(pid);
        sheet('<h2>Add a widget to ' + esc(page.title) + '</h2><div class="types">' + DATA.types.map(function (T) {
            return '<button class="type" data-type="' + esc(T.type) + '"><span class="wico">' + esc(T.icon) + '</span><span class="wtx"><b>' + esc(T.name) + '</b><small>' + esc(T.about) + '</small></span>' +
                '<span class="badge">' + T.sizes.join(' / ') + '</span></button>';
        }).join('') + '</div><button class="btn ghost wide" id="aCancel">Cancel</button>');
        $('aCancel').onclick = closeSheet;
        $('sheet').querySelector('.types').onclick = function (e) {
            var b = e.target.closest('[data-type]'); if (!b) return;
            var ty = b.getAttribute('data-type'), T = typeOf(ty);
            // On the phone straight away (greyed until the Google script has added it).
            DATA.widgets.push({ id: 'new-' + Date.now(), page: pid, type: ty, size: T.sizes[0], show: true, order: 999, settings: {}, when: null, pending: true });
            closeSheet(); setData(DATA); FD.toast('Adding…');
            act({ action: 'addWidget', page: pid, type: ty }, 'Added – its settings are on its page in Family, Lists or Other').catch(function () { /* load() puts it back */ });
        };
    }
    function pageSheet(p) {
        if (!p) return;
        var PT = pageTypeOf(p.type), icons = ['⌂', '◈', '✦', '☀', '♫', '✈', '☕', '⚑', '●', '▲', '★', '▦'];
        sheet('<h2>' + esc(p.title) + ' page</h2><p class="mute small">' + esc(PT.name) + '</p>' +
            '<label>Name in the side bar <span class="cnt">max ' + (L().pageTitle || 10) + '</span></label><input id="pTitle" maxlength="' + (L().pageTitle || 10) + '" value="' + esc(p.title) + '" autocomplete="off">' +
            '<label>Icon</label><div class="chips icons" id="pIcons">' + icons.map(function (i) { return '<button class="chip' + (i === p.icon ? ' on' : '') + '" data-i="' + i + '">' + i + '</button>'; }).join('') + '</div>' +
            '<label class="tog"><input type="checkbox" id="pShow"' + (p.show ? ' checked' : '') + '><span>Show this page</span></label>' +
            (PT.settings.length ? '<h3 class="sh">Settings</h3>' + fields(PT.settings, p.settings || {}) : '') +
            '<div class="sheet-actions"><button class="btn ghost" id="pCancel">Cancel</button><button class="btn good" id="pSave">Save</button></div>' +
            (p.type === 'widgets' ? '<div class="sheet-actions"><button class="btn bad" id="pDel">Delete this page</button></div>' : ''));
        var icon = p.icon;
        $('pIcons').onclick = function (e) { var b = e.target.closest('[data-i]'); if (!b) return; icon = b.getAttribute('data-i');
            Array.prototype.forEach.call($('pIcons').children, function (c) { c.classList.toggle('on', c === b); }); };
        $('pCancel').onclick = closeSheet;
        $('pSave').onclick = function () {
            act({ action: 'savePage', page: { id: p.id, title: $('pTitle').value.trim(), icon: icon, show: $('pShow').checked, settings: readFields() } }, 'Saved').then(closeSheet, function () {});
        };
        if ($('pDel')) $('pDel').onclick = function () { if (confirm('Delete the ' + p.title + ' page?')) act({ action: 'deletePage', id: p.id }, 'Deleted').then(closeSheet, function () {}); };
    }
    function newPageSheet() {
        sheet('<h2>New widget page</h2><label>Name <span class="cnt">max ' + (L().pageTitle || 10) + '</span></label><input id="npTitle" maxlength="' + (L().pageTitle || 10) + '" placeholder="e.g. Kitchen" autocomplete="off">' +
            '<div class="sheet-actions"><button class="btn ghost" id="npCancel">Cancel</button><button class="btn good" id="npSave">Add page</button></div>');
        $('npCancel').onclick = closeSheet;
        $('npSave').onclick = function () { act({ action: 'addPage', title: $('npTitle').value.trim() }, 'Page added').then(closeSheet, function () {}); };
    }

    /* ================================================================ settings */

    function renderSettings() {
        title('Settings');
        $('body').innerHTML = '<div class="menu">' + menuKeys().map(function (k) {
            var x = SECTIONS[k];
            return '<button class="mrow" data-go="s/' + k + '"><span class="m-ico">' + x[0] + '</span><span class="m-tx"><b>' + esc(x[1]) + '</b><small>' + esc(sectionLine(k)) + '</small></span><i>›</i></button>';
        }).join('') + '<a class="mrow" href="' + esc(helpUrl()) + '" target="_blank" rel="noopener"><span class="m-ico">❓</span><span class="m-tx"><b>Help</b><small>Plain-English answers, step by step</small></span><i>›</i></a></div>' +
            (DESK ? '' : deskCard()) + '<p class="mute small center">' + (DESK ? 'Family Dashboard setup' : 'Family Admin') + ' · Google script ' + esc(DATA.scriptVersion || '?') + '</p>';
    }
    function renderSection(k) {
        title(SECTIONS[k][1]);
        ({ family: secFamily, places: secPlaces, keys: secKeys, system: secSystem, screen: secScreen, licence: secLicence, updates: secUpdates, mydata: secMyData, devices: secDevices, support: secSupport })[k]();
    }
    /** Installation settings of one group, with a Save button. */
    function installFields(group, keys) {
        var list = (DATA.install || []).filter(function (f) { return keys ? keys.indexOf(f.k) >= 0 : f.group === group; });
        return list.map(function (f) {
            var need = keyNeeded(f.k);
            return '<label>' + esc(f.label) + (need && !f.value ? ' <span class="need">needed</span>' : '') + '</label><input data-set="' + esc(f.k) + '" value="' + esc(f.value) + '" autocomplete="off" autocapitalize="off" spellcheck="false">' +
                '<div class="mute small hint">' + (f.uses ? '<b>Used by:</b> ' + esc(f.uses) + '. ' : '') + esc(f.help || '') + '</div>';
        }).join('');
    }
    function saveInstallBtn(id, text) { return '<button class="btn wide" id="' + id + '">' + (text || 'Save') + '</button>'; }
    function wireSaveInstall(id, scope) {
        $(id).onclick = function () {
            var values = {}; (scope || document).querySelectorAll('[data-set]').forEach(function (i) { values[i.getAttribute('data-set')] = i.value.trim(); });
            act({ action: 'saveInstall', values: values }, 'Saved – the screen picks it up within a minute');
        };
    }
    var KEY_WIDGETS = { TomTomKey: ['traffic'], RailDataKey: ['trains'], NasaKey: [], TransportApiId: ['bus'], TransportApiKey: ['bus'], SpotifyClientId: ['spotify'], SpotifyClientSecret: ['spotify'] };
    function keyNeeded(k) { return (KEY_WIDGETS[k] || []).some(function (t) { return (DATA.widgets || []).some(function (w) { return w.type === t && w.show; }); }); }
    function missingKeys() {
        return (DATA.install || []).filter(function (f) { return f.group === 'keys' && !f.value && keyNeeded(f.k); }).map(function (f) { return f.label.replace(/ (API )?(key|app ID|app key|Client ID|Client secret)$/i, ''); })
            .filter(function (x, i, a) { return a.indexOf(x) === i; });
    }
    function secKeys() {
        title('External data (API) keys');
        $('body').innerHTML = '<p class="mute small help">Every key in one place. Each turns on live data for the widgets that use it; the ones marked <span class="need">needed</span> are for widgets on your screen. They’re all free.</p>' +
            card('', installFields('keys') + saveInstallBtn('kSave', 'Save keys')) +
            '<a class="link-card" href="' + esc(setupLink('keys')) + '" target="_blank" rel="noopener"><b>How to get each key ›</b><span class="mute small">Step-by-step guides in the setup app (easiest on a computer).</span></a>';
        wireSaveInstall('kSave');
    }
    /** Widgets whose settings hold an address or a place (weather location, traffic routes, bins, whereabouts…). */
    var PLACE_KEYS = ['Location', 'From', 'Destinations', 'Postcode', 'House', 'Places', 'Centre', 'Stop', 'StopCode', 'Station'];
    function placeWidgets() {
        return (DATA.widgets || []).filter(function (w) { return typeOf(w.type).settings.some(function (f) { return PLACE_KEYS.indexOf(f.k) >= 0 && (w.type !== 'trains'); }); });
    }
    function secPlaces() {
        var pw = placeWidgets();
        $('body').innerHTML = card('Home', installFields('home') + saveInstallBtn('hSave', 'Save home address'), 'sx-home') +
            (pw.length ? card('Places your widgets use', '<p class="mute small">Each of these has its own addresses or places. Left blank, they use the home address.</p>' + pw.map(function (w) {
                var pg = pageOf(w.page), vals = typeOf(w.type).settings.filter(function (f) { return PLACE_KEYS.indexOf(f.k) >= 0; }).map(function (f) { return lines(w.settings[f.k]).join(', '); }).filter(Boolean).join(' · ');
                return '<button class="mrow" data-go="w/' + esc(w.id) + '"><span class="m-ico">' + esc(typeOf(w.type).icon) + '</span><span class="m-tx"><b>' + esc(widgetName(w)) + (pg ? ' <span class="mute small">(' + esc(pg.title) + ')</span>' : '') + '</b><small>' +
                    esc(vals || 'Uses the home address') + (w.show ? '' : ' · hidden') + '</small></span><i>›</i></button>';
            }).join('')) : '');
        wireSaveInstall('hSave', document.querySelector('.sx-home'));
    }
    function secSystem() {
        $('body').innerHTML = card('Screen & sleep', installFields('screen') + saveInstallBtn('scSave', 'Save') +
                '<p class="mute small">On the Windows PC the start file offers to keep the screen switched on, so the dashboard’s own sleep screen is in charge and a touch always wakes it.</p>') +
            ['licence', 'updates'].map(function (k) { return '<a class="link-card" data-go="s/' + k + '" href="#"><b>' + SECTIONS[k][0] + ' ' + esc(SECTIONS[k][1]) + ' ›</b><span class="mute small">' + esc(sectionLine(k)) + '</span></a>'; }).join('') +
            '<a class="link-card" data-go="layout" href="#"><b>▦ Screen layout ›</b><span class="mute small">Pages, widgets and what goes where.</span></a>';
        wireSaveInstall('scSave');
    }
    function secScreen() {
        $('body').innerHTML = card('Sleep', installFields('screen') + saveInstallBtn('scSave', 'Save')) +
            '<p class="mute small help">On the Windows PC, set Settings → System → Power → “Turn off my screen” to Never, so the dashboard’s own sleep screen is in charge and a touch always wakes it.</p>' +
            '<a class="link-card" data-go="layout" href="#"><b>Screen layout ›</b><span class="mute small">Pages, widgets and what goes where.</span></a>';
        wireSaveInstall('scSave');
    }
    function secMyData() {
        var fresh = guideUrl();
        $('body').innerHTML = '<p class="mute small help">Everything your family puts in the dashboard lives in <b>your own Google Sheet</b>, in your Google account. Nothing is stored anywhere else.</p>' +
            card('Reconfigure', '<p class="mute small">Go through the setup steps again with everything you already have filled in – change what you like, keep the rest. Easiest on a computer.</p>' +
                [['welcome', 'Go through setup again', 'all the steps, already filled in'], ['family', 'Just the family step', 'people, groups and calendars'], ['check', 'Check everything', 'tests every widget'], ['keys', 'Key guides', 'how to get each API key']].map(function (x) {
                    return '<a class="setup-link" href="' + setupLink(x[0]) + '" target="_blank" rel="noopener"><b>' + x[1] + '</b><span>' + x[2] + '</span><i>›</i></a>';
                }).join('')) +
            versionsCard() +
            card('Start again from scratch', '<p class="small">Set up a brand-new family from nothing, in a new Sheet. Your old Sheet stays in Google Drive as a backup. ' +
                'To keep your people, points and lists, move them instead (above).</p><p class="mute small">Free your licence key first (System → Licence), so the new Sheet can use it.</p>' +
                '<a class="btn ghost wide" href="' + esc(fresh) + '" target="_blank" rel="noopener">Open the setup app for a new family</a>') +
            accessCard() +
            card('Where the apps are hosted', installFields('advanced') + saveInstallBtn('aSave'));
        wireAfresh(); wireAccess(); wireSaveInstall('aSave');
    }

    /* ---- licence */
    function secLicence() {
        var Lc = DATA.licence || {};
        $('body').innerHTML = card('Your licence', !Lc.required ? '<p class="mute">Licence keys aren’t being checked yet. You can still add yours now.</p>'
                : '<p class="' + (Lc.ok ? (Lc.state === 'trial' ? '' : 'pos') : 'neg') + '"><b>' + (Lc.ok ? (Lc.state === 'trial' ? '⏳ ' : '✔ ') : '⚠ ') + esc(Lc.message) + '</b></p>' +
                  (DATA.licenceKey ? '<label>Your key</label><div class="row-between"><b class="mono" style="user-select:all">' + esc(DATA.licenceKey) + '</b><button class="btn ghost sm" id="licCopy">Copy</button></div>'
                    : Lc.key ? '<p class="mute small">Key ending …' + esc(Lc.key) + '</p>' : '')) +
            card(Lc.key || DATA.licenceKey ? 'Change the key' : 'Add your key', '<p class="mute small">It’s in your order email: FD- then four groups of five letters and numbers.</p>' +
                '<input id="licKey" class="mono" placeholder="FD-XXXXX-XXXXX-XXXXX-XXXXX" value="' + esc(DATA.licenceKey || '') + '" autocomplete="off" autocapitalize="characters" spellcheck="false">' +
                '<button class="btn wide" id="licGo">Check and save</button>' + (Lc.key ? '<button class="btn ghost wide" id="licRe">Check my licence again now</button>' : '')) +
            (Lc.key ? card('Starting again from scratch?', '<p class="small">If you’re setting up a brand-new Sheet with the setup app (not moving, which takes your licence by itself), free your key here first. ' +
                'You can then enter it in the new Sheet. This Sheet will ask for a key again.</p><button class="btn ghost wide" id="licFree">Free up my licence key</button><div id="licFreeOut"></div>') : '') +
            '<p class="mute small help">A key works on one dashboard at a time. If you move to a new Google Sheet or account, ask the seller to release it first. Once a day your Google script checks the key with the seller; if that can’t happen for 21 days, the screen asks for help.</p>';
        if ($('licCopy')) $('licCopy').onclick = function () { try { navigator.clipboard.writeText(DATA.licenceKey).then(function () { FD.toast('Copied'); }); } catch (e) { FD.toast('Couldn’t copy', true); } };
        $('licGo').onclick = function () {
            var k = $('licKey').value.trim(); if (!k) { FD.toast('Type in your key', true); return; }
            var b = this; b.disabled = true; b.textContent = 'Checking…';
            FD.post({ action: 'setLicence', key: k }).then(function (d) { FD.toast(d.message || 'Saved'); DATA.licence = d.licence; load(); }, function (e) {
                b.disabled = false; b.textContent = 'Check and save'; FD.toast(/Unknown action/.test(e.message) ? 'Update the Google script first (Settings → System → Updates)' : e.message, true);
            });
        };
        if ($('licFree')) $('licFree').onclick = function () {
            if (!confirm('Free your licence key from this Sheet? This dashboard will ask for a key again.')) return;
            FD.post({ action: 'releaseLicence' }).then(function (d) {
                $('licFreeOut').innerHTML = '<p class="pos small"><b>✔ Freed.</b> Your key – write it down for the new Sheet:</p><p class="mono" style="user-select:all">' + esc(d.key) + '</p>';
                DATA.licence = d.licence;
            }, function (e) { FD.toast(/Unknown action/.test(e.message) ? 'Update the Google script first' : e.message, true); });
        };
        if ($('licRe')) $('licRe').onclick = function () {
            FD.post({ action: 'licence', recheck: true }).then(function (d) { DATA.licence = d.licence; FD.toast(d.licence.message, !d.licence.ok); render(); }, function (e) { FD.toast(e.message, true); });
        };
    }

    /* ---- updates */
    function secUpdates() {
        var mine = DATA.scriptVersion || '?', newest = LATEST && LATEST.script, behind = newest && DATA.scriptVersion && newer(newest, DATA.scriptVersion);
        var last = {}; try { last = JSON.parse(DATA.lastUpdate || '{}'); } catch (e) { last = {}; }
        $('body').innerHTML = card('Google script', '<p>' + (behind ? '<b>Version ' + esc(newest) + ' is available</b> – you have ' + esc(mine) + '.' : 'Up to date: version ' + esc(mine) + '.') + '</p>' +
            '<button class="btn wide' + (behind ? '' : ' ghost') + '" id="suNow">' + (behind ? 'Update the Google script now' : 'Check for an update now') + '</button>' +
            (DATA.loader ? '<p class="pos small" style="margin-top:12px"><b>✔ Updates itself.</b> Your script loads its program from GitHub, so new versions arrive within 5 minutes – nothing to switch on, and no saved versions used.</p>' +
                (DATA.loader.newerLoader ? '<p class="neg small"><b>A newer loader is available.</b> Paste <b>Scripts/MainSpreadsheet/Loader.gs</b> into the “Code” file of your Sheet’s Apps Script once more, save, and deploy a new version.</p>' : '')
            : '<div class="row-between" style="margin-top:14px"><span><b>Automatic updates</b><br><span class="mute small">Updates itself within minutes of a new version (and checks hourly)</span></span>' +
            '<button class="btn ' + (DATA.autoUpdate ? 'good' : 'ghost') + '" id="suAuto">' + (DATA.autoUpdate ? 'On' : 'Off') + '</button></div>' +
            '<p class="small"><b>Easier:</b> switch to the loader – one small file you paste in once, after which the script always runs the newest program from GitHub. <a href="' + esc(helpUrl()) + '#updates" target="_blank" rel="noopener">How</a></p>') +
            (function () { var lc = {}; try { lc = JSON.parse(DATA.lastCheck || '{}'); } catch (e) { lc = {}; }
                return lc.at ? '<p class="mute small">Last check of GitHub: ' + esc(String(lc.at).slice(0, 16).replace('T', ' ')) + ' (' + esc(lc.how || '') + ') – ' + esc(lc.result || '') + '</p>' : ''; })() +
            (last.at ? '<p class="mute small">Last automatic update: ' + esc(String(last.at).slice(0, 16).replace('T', ' ')) + ' – ' + esc(last.result || '') + (last.to ? ' (' + esc(last.to) + ')' : '') + (last.message ? '<br>' + esc(last.message) : '') + '</p>' : '') +
            (DATA.loader ? '' : '<details class="adv"><summary>What automatic updates need</summary><p class="small">Once per Google account, switch on <b>Google Apps Script API</b> at ' +
            '<a href="https://script.google.com/home/usersettings" target="_blank" rel="noopener">script.google.com/home/usersettings</a>. ' +
            'Your script then downloads new versions from ' + esc(DATA.appsAddress || '') + ' – only turn this on if you trust whoever publishes that site.</p></details>')) +
            savedCard() +
            (LATEST && LATEST.notes ? card('What’s new', '<ul class="pvl">' + LATEST.notes.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ul>') : '') +
            '<p class="mute small help">The screen and these phone apps update themselves.</p>' +
            '<a class="link-card" data-go="s/support" href="#"><b>Every version number, and diagnostics ›</b><span class="mute small">Screen, phone apps, Google script and licence server.</span></a>';
        $('suNow').onclick = function () {
            var b = $('suNow'); b.disabled = true; b.textContent = 'Updating… (up to a minute)';
            FD.post({ action: 'selfUpdate', why: 'app' }).then(function (r) {
                FD.toast(r.updated ? 'Updated to ' + r.to : r.upToDate ? 'Already up to date' : (r.message || 'Done'), !r.updated && !r.upToDate);
                load();
            }).catch(function (e) {
                FD.toast(e.message, true); b.disabled = false; b.textContent = 'Try again';
                if (/Apps Script API/.test(e.message)) sheet(apiHelp(e.message));
            });
        };
        if ($('suAuto')) $('suAuto').onclick = function () {
            act({ action: 'autoUpdate', on: !DATA.autoUpdate }).then(function (r) {
                FD.toast(r.autoUpdate ? 'Automatic updates on' : 'Automatic updates off');
                if (r.warning) sheet(apiHelp(r.warning));
                load();
            }, function () {});
        };
    }

    /** What to do when the Google script can't use the Apps Script API. Two different switches can be off. */
    function apiHelp(msg) {
        var cloud = /https:\/\/console\.cloud\.google\.com\/\S+?(?=[,)\s]|$)/.exec(msg || '');
        return '<h2>One-time switch needed</h2><p>' + esc(msg) + '</p>' + (cloud
            ? '<ol><li>On a computer, signed in as the Sheet’s owner, open:<br><a class="btn wide" href="' + esc(cloud[0]) + '" target="_blank" rel="noopener">Google Cloud: Apps Script API</a></li><li>Click <b>Enable</b>.</li><li>Wait 5 minutes, then press Update again.</li></ol>'
            : '<ol><li>Open <a href="https://script.google.com/home/usersettings" target="_blank" rel="noopener">script.google.com/home/usersettings</a>, signed in as the Sheet’s owner (check the account at the top right).</li><li>Switch <b>Google Apps Script API</b> on.</li><li>Wait 5 minutes, then press Update again.</li></ol>') +
            '<p class="mute small">Tap outside this box to close it.</p>';
    }

    /* ---- versions and diagnostics */
    function versionTable() {
        var L = LATEST || {}, ss = DATA.screenSeen || {};
        var rowv = function (name, mine, latest, note) {
            var behind = mine && latest && newer(latest, mine);
            return '<div class="r"><span class="r-l">' + name + (note ? '<small>' + note + '</small>' : '') + '</span><b class="r-r ' + (behind ? 'neg' : '') + '">' + esc(mine || '?') +
                (behind ? ' <small>→ ' + esc(latest) + '</small>' : '') + '</b></div>';
        };
        var ago = ss.at ? Math.round((Date.now() - Date.parse(ss.at)) / 60000) : null;
        return '<div class="rows">' +
            rowv('Screen', ss.v, L.app, ago == null ? 'not seen yet' : 'last heard from ' + (ago < 2 ? 'just now' : ago < 120 ? ago + ' min ago' : Math.round(ago / 60) + ' hours ago')) +
            rowv('Phone apps (this phone)', FD.VERSION, L.app) +
            rowv('Google script', DATA.scriptVersion, L.script, DATA.loader ? 'loader ' + DATA.loader.loader + ' – updates itself' : DATA.autoUpdate ? 'updates itself' : 'automatic updates off') +
            rowv('Licence server', DATA.licenceServerVersion || (DATA.licence && DATA.licence.required ? '?' : 'not in use'), null) +
            rowv('Newest on GitHub', L.app ? 'apps ' + L.app + ' · script ' + L.script : '?', null) +
            '<div class="r"><span class="r-l">Saved versions (Google script)<small>Google allows ' + ((DATA.versions || {}).max || 200) + '; each update uses one</small></span><b class="r-r ' + (DATA.versions && DATA.versions.warn ? 'neg' : '') + '">' +
                (DATA.loader ? 'not used (loader)' : DATA.versions ? DATA.versions.used + ' used · ' + (DATA.versions.max - DATA.versions.used) + ' left' : '?') + '</b></div>' +
            '<div class="r"><span class="r-l">Privacy notice accepted</span><b class="r-r">' + esc(DATA.privacyAccepted || '–') + '</b></div></div>';
    }
    function secSupport() {
        $('body').innerHTML = card('Versions', versionTable()) +
            card('Diagnostics report', '<p class="small">Makes a text file describing your dashboard – versions, settings, which widgets work and the last errors – to send to support if something’s wrong.</p>' +
                '<p class="mute small">Your access code, API keys, addresses, names and calendar details go in a <b>locked</b> part that only Family Dashboard support can open. Nothing is sent anywhere until you send the file yourself.</p>' +
                '<button class="btn wide" id="diag">Generate diagnostics</button><div id="diagOut"></div>');
        $('diag').onclick = function () {
            var b = this; b.disabled = true; b.textContent = 'Checking everything… (up to a minute)';
            FD.get('diagnostics', { app: FD.VERSION }, 240000).then(function (d) { return buildReport(d); }).then(function (txt) {
                b.disabled = false; b.textContent = 'Generate again';
                var name = 'family-dashboard-diagnostics-' + new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '') + '.txt';
                var file = new File([txt], name, { type: 'text/plain' });
                var canShare = navigator.canShare && navigator.canShare({ files: [file] });
                $('diagOut').innerHTML = '<p class="pos small" style="margin-top:12px"><b>✔ Ready</b> (' + Math.round(txt.length / 1024) + ' KB).</p>' +
                    (canShare ? '<button class="btn wide" id="dShare">Share / email it</button>' : '') +
                    '<button class="btn ghost wide" id="dSave">Download the file</button><button class="btn ghost wide" id="dCopy">Copy the text</button>' +
                    '<details class="adv"><summary>See what’s in it</summary><textarea readonly rows="14" class="mono" style="font-size:11px">' + esc(txt) + '</textarea></details>';
                if ($('dShare')) $('dShare').onclick = function () { navigator.share({ files: [file], title: 'Family Dashboard diagnostics', text: 'Diagnostics report for Family Dashboard support' }).catch(function () {}); };
                $('dSave').onclick = function () { var a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name; document.body.appendChild(a); a.click(); a.remove(); };
                $('dCopy').onclick = function () { try { navigator.clipboard.writeText(txt).then(function () { FD.toast('Copied'); }); } catch (e) { FD.toast('Couldn’t copy', true); } };
            }).catch(function (e) { b.disabled = false; b.textContent = 'Try again'; FD.toast(/Unknown action/.test(e.message) ? 'Update the Google script first' : e.message, true); });
        };
    }
    function b64(buf) { var s = '', b = new Uint8Array(buf); for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s); }
    /** Readable report, then the private details locked with the support key (RSA-OAEP + AES-GCM). */
    function buildReport(d) {
        var r = d.report, phone = { userAgent: navigator.userAgent, screen: screen.width + '×' + screen.height, online: navigator.onLine, appVersion: FD.VERSION, standalone: !!(window.matchMedia && matchMedia('(display-mode: standalone)').matches) };
        var head = 'FAMILY DASHBOARD – DIAGNOSTICS REPORT\nMade ' + new Date().toString() + '\n\nThe readable part below has no access code, keys, addresses or names.\n' +
            'Those are in the locked part at the end, which only Family Dashboard support can open.\n\n';
        var body = head + JSON.stringify(Object.assign({ thisPhone: phone }, r), null, 2);
        if (!d.supportKey || !window.crypto || !crypto.subtle) return Promise.resolve(body + '\n\n(No locked part: ' + (!d.supportKey ? 'support key not available' : 'this browser can’t encrypt') + '. Nothing private is included.)\n');
        var aes, iv = crypto.getRandomValues(new Uint8Array(12));
        return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt']).then(function (k) {
            aes = k; return crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, k, new TextEncoder().encode(JSON.stringify(d.secrets)));
        }).then(function (data) {
            return Promise.all([data, crypto.subtle.exportKey('raw', aes), crypto.subtle.importKey('jwk', d.supportKey, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt'])]);
        }).then(function (x) {
            return crypto.subtle.encrypt({ name: 'RSA-OAEP' }, x[2], x[1]).then(function (k) {
                var box = btoa(JSON.stringify({ v: 1, k: b64(k), iv: b64(iv), d: b64(x[0]) }));
                return body + '\n\n----- ENCRYPTED PRIVATE PART (only Family Dashboard support can open this) -----\nFDENC1:' + box.replace(/(.{76})/g, '$1\n') + '\n----- END -----\n';
            });
        });
    }

    /* ---- saved versions and starting afresh */
    function versionsCard() {
        var v = DATA.versions, mv = DATA.moving;
        if (mv && mv.mode === 'account') return card('Moving to ' + esc(mv.email), '<p>The moving pack is ready. On a computer signed in as <b>' + esc(mv.email) + '</b>, open the setup app link from when you made it (or make a new pack below), set up, and press <b>Bring everything across</b>.</p>' +
            '<p class="mute small">Until then everything carries on working from this Sheet.</p>') + card('Make a new moving pack', '<label>New Google account’s email</label><input id="mvEmail" type="email" value="' + esc(mv.email) + '"><button class="btn ghost wide" id="mvGo">Make a new moving pack</button><div id="mvOut"></div>');
        if (mv) return card('Finish moving to the new Sheet', '<p>The new Sheet is ready. Open it, wait for the <b>🏠 Family Dashboard</b> menu, and choose <b>Finish moving here</b> – Google asks you to allow the script, as it did the first time.</p>' +
            '<a class="btn wide" href="' + esc(mv.sheetUrl) + '" target="_blank" rel="noopener">Open the new Sheet</a><p class="mute small">Until then everything carries on working from this Sheet.</p>');
        var pct = v ? Math.min(100, v.used / v.max * 100) : 0;
        if (DATA.loader && !v) return card('Moving house', '<p class="mute small">Your script loads its program from GitHub, so Google’s limit of 200 saved versions doesn’t apply and you never need to start afresh.</p>' +
            '<details class="adv"><summary>Move to a different Google account</summary><p class="small">For example a new Gmail account just for the dashboard, so its permissions aren’t on your main account. ' +
            'Everything comes across – people, points, lists, settings and your licence – and the screen and phones follow by themselves.</p>' +
            '<label>The new Google account’s email address</label><input id="mvEmail" type="email" placeholder="ourfamily.dashboard@gmail.com" autocomplete="off" autocapitalize="off">' +
            '<button class="btn wide" id="mvGo">Make a moving pack</button><div id="mvOut"></div></details>');
        return card('Saved versions', (v ? '<p><b>' + v.used + ' of ' + v.max + '</b> used' + (v.stale ? ' (last count)' : '') + ' – each update of the Google script uses one.</p>' +
                '<div class="bar' + (v.warn ? ' warnbar' : '') + '"><span style="width:' + pct + '%"></span></div>'
                : '<p class="mute">Not known – switch on the Google Apps Script API (see Automatic updates above).</p>') +
            (v && v.warn ? '<p class="neg"><b>Nearly full.</b> When it’s full the script can’t update. Start afresh below (easiest), or delete old versions in Apps Script → Project history.</p>' : '') +
            (DATA.loader ? '' : '<details class="adv"' + (v && v.warn ? ' open' : '') + '><summary>Start afresh in a new Sheet</summary><p class="small">Makes a brand-new Google Sheet with its own script (0 versions used) and copies <b>everything</b> into it: every tab and its data, the settings, your licence, and automatic updates. ' +
            'The screen and phones follow by themselves. This Sheet is kept as a backup.</p><p class="small">You’ll need to open the new Sheet once and click Allow, as when you first set up.</p>' +
            '<button class="btn wide" id="afresh">Start afresh</button></details>') +
            '<details class="adv"><summary>Move to a different Google account</summary><p class="small">For example a new Gmail account just for the dashboard, so its permissions aren’t on your main account. ' +
            'Everything comes across – people, points, lists, settings and your licence – and the screen and phones follow by themselves.</p>' +
            '<label>The new Google account’s email address</label><input id="mvEmail" type="email" placeholder="ourfamily.dashboard@gmail.com" autocomplete="off" autocapitalize="off">' +
            '<button class="btn wide" id="mvGo">Make a moving pack</button><div id="mvOut"></div></details>');
    }
    /** Saved versions only (the Updates page); moving house is in My data. */
    function savedCard() {
        var v = DATA.versions; if (!v) return '';
        var pct = Math.min(100, v.used / v.max * 100);
        return card('Saved versions', '<p><b>' + v.used + ' of ' + v.max + '</b> used – each update of the Google script uses one.</p><div class="bar' + (v.warn ? ' warnbar' : '') + '"><span style="width:' + pct + '%"></span></div>' +
            (v.warn ? '<p class="neg"><b>Nearly full.</b> <a href="#" data-go="s/mydata">Start afresh in My data</a> to get a fresh 200.</p>' : ''));
    }
    function wireAfresh() {
        if ($('mvGo')) $('mvGo').onclick = function () {
            var email = $('mvEmail').value.trim(); if (!email) { FD.toast('Type the new account’s email address', true); return; }
            var b = this; b.disabled = true; b.textContent = 'Making the moving pack…';
            FD.post({ action: 'packForAccount', email: email }).then(function (d) {
                b.textContent = 'Moving pack made ✔';
                $('mvOut').innerHTML = '<ol class="small"><li>On a <b>computer</b>, sign in to Google as <b>' + esc(d.email) + '</b> (or open a private window and sign in there).</li>' +
                    '<li>Open this link – it’s the setup app, in “moving” mode:</li></ol><textarea readonly rows="3" id="mvLink">' + esc(d.setupLink) + '</textarea>' +
                    '<button class="btn ghost wide" id="mvCopy">Copy the link</button>' + (navigator.share ? '<button class="btn ghost wide" id="mvShare">Send it to yourself</button>' : '') +
                    '<ol class="small" start="3"><li>Follow the setup steps for the new account (make the Sheet, publish it). At “Publish &amp; connect” press <b>Bring everything across</b>.</li>' +
                    '<li>That’s it – the screen, phones and licence switch over by themselves. This Sheet is kept as a backup.</li></ol>';
                $('mvCopy').onclick = function () { try { navigator.clipboard.writeText(d.setupLink).then(function () { FD.toast('Copied'); }); } catch (e) { $('mvLink').select(); } };
                if ($('mvShare')) $('mvShare').onclick = function () { navigator.share({ title: 'Move Family Dashboard', text: 'Open on a computer, signed in as ' + d.email + ':', url: d.setupLink }).catch(function () {}); };
            }, function (e) { b.disabled = false; b.textContent = 'Make a moving pack'; FD.toast(/Unknown action/.test(e.message) ? 'Update the Google script first' : e.message, true); });
        };
        if (!$('afresh')) return;
        $('afresh').onclick = function () {
            if (!confirm('Make a new Sheet and copy everything into it?')) return;
            var b = this; b.disabled = true; b.textContent = 'Copying everything… (up to a minute)';
            FD.post({ action: 'startAfresh' }).then(function (d) { FD.toast('New Sheet ready'); DATA.moving = { sheetUrl: d.sheetUrl, url: d.url }; render(); load(); },
                function (e) { b.disabled = false; b.textContent = 'Start afresh'; FD.toast(/Unknown action/.test(e.message) ? 'Update the Google script first' : e.message, true); });
        };
    }

    /* ---- screens counted by the licence */
    function screensCard() {
        var list = DATA.screens || [], allowed = DATA.screensAllowed;
        var ago = function (t) { var m = Math.round((Date.now() - Date.parse(t)) / 60000); return m < 2 ? 'just now' : m < 120 ? m + ' min ago' : m < 2880 ? Math.round(m / 60) + ' hours ago' : Math.round(m / 1440) + ' days ago'; };
        return card('Screens', '<p class="mute small">' + (allowed ? 'Your licence allows <b>' + allowed + ' screen' + (allowed > 1 ? 's' : '') + '</b> (Corsair, tablet or computer). Phones don’t count. ' +
                'A screen not used for 30 days frees its place by itself; a new screen over the limit offers to take over from another.' : 'Every screen that shows the dashboard.') + '</p>' +
            (list.length ? '<div class="rows" id="scrRows">' + list.map(function (x) {
                return '<div class="r"><span class="r-l"><b>' + esc(x.name) + '</b><small>' + esc(x.fmt === 'standard' ? 'Tablet / computer layout' : 'Wide layout') + ' · last used ' + ago(x.last) + '</small></span>' +
                    '<button class="btn ghost sm" data-sren="' + esc(x.id) + '">Rename</button><button class="btn ghost sm" data-sdel="' + esc(x.id) + '">Disconnect</button></div>';
            }).join('') + '</div>' : '<p class="mute small">No screens yet.</p>'));
    }
    function wireScreens() {
        var box = $('scrRows'); if (!box) return;
        box.onclick = function (e) {
            var b = e.target.closest('[data-sdel],[data-sren]'); if (!b) return;
            var id = b.getAttribute('data-sdel') || b.getAttribute('data-sren');
            if (b.hasAttribute('data-sdel')) {
                if (!confirm('Disconnect this screen? It frees its place on the licence; if it’s still switched on it will offer to take a place back.')) return;
                FD.post({ action: 'forgetScreen', id: id }).then(function (d) { DATA.screens = d.screens; render(); FD.toast('Disconnected'); }, function (e2) { FD.toast(e2.message, true); });
            } else {
                var n = prompt('Name for this screen (e.g. Kitchen, Lounge tablet):'); if (!n) return;
                FD.post({ action: 'renameScreen', id: id, name: n }).then(function (d) { DATA.screens = d.screens; render(); }, function (e2) { FD.toast(e2.message, true); });
            }
        };
    }

    /* ---- access code (My data) */
    function codeProblem(v) {
        if (v.length < 8) return 'at least 8 characters';
        if (/\s/.test(v)) return 'no spaces';
        if (!/[A-Za-z]/.test(v) || !/[0-9]/.test(v)) return 'letters and numbers';
        if (!/[^A-Za-z0-9]/.test(v)) return 'at least one special character, e.g. ! * - _ . ~';
        return '';
    }
    function accessCard() {
        return card('Access code', '<p class="mute small">' + (DATA.codeWeak ? '⚠ Your access code is weak. ' : '') + 'The code is your dashboard’s password: anyone with your links and code can use it. ' +
            'After changing it, every other phone and screen needs connecting again (Devices). This phone updates itself.</p>' +
            '<button class="btn wide" id="cNew">Make a new strong code for me</button>' +
            '<label>Or choose your own <span class="cnt">8+ characters, letters, numbers and a special character</span></label>' +
            '<input id="cOwn" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="e.g. Garden-Gnome-42">' +
            '<div class="mute small hint" id="cHint"></div><button class="btn ghost wide" id="cSet">Use this code</button><div id="cDone"></div>');
    }
    function wireAccess() {
        $('cOwn').oninput = function () { var p = codeProblem($('cOwn').value); $('cHint').textContent = $('cOwn').value ? (p ? 'Needs ' + p : '✔ Good') : ''; };
        function changeCode(newCode) {
            if (!confirm('Change the access code? Other phones, tablets and the screen will need connecting again.')) return;
            act({ action: 'changeCode', newCode: newCode }).then(function (d) {
                var cc = FD.config();
                FD.setConfig(cc.url, d.code);
                $('cDone').innerHTML = '<p class="small"><b>✔ Changed.</b> Now reconnect the other phones and screens: <a href="#" data-go="s/devices">Devices ›</a></p>';
                DATA.codeWeak = false;
            }, function () {});
        }
        $('cNew').onclick = function () { changeCode(''); };
        $('cSet').onclick = function () { var v = $('cOwn').value.trim(), p = codeProblem(v); if (p) { FD.toast('The code needs ' + p, true); return; } changeCode(v); };
    }

    /* ---- devices: this phone, another person's phone, another screen */
    function appLink(app) { var c = FD.config(); return location.href.replace(/admin\/.*$/, '') + app + '/#api=' + encodeURIComponent(c.url) + '&code=' + encodeURIComponent(c.code); }
    function qrSvg(text) {
        if (!window.qrcode) return '';
        try { var q = qrcode(0, 'M'); q.addData(text); q.make(); return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true }); } catch (e) { return ''; }
    }
    var devPick = 'calendar';
    function secDevices() {
        var c = FD.config(), base = location.href.replace(/admin\/.*$/, '');
        var APPS = { calendar: ['📅 Family Calendar', 'for everyone – the calendar and adding events'], admin: ['⚙ Family Admin', 'for adults – this app: points, notes, lists, settings'] };
        $('body').innerHTML =
            card('Add another person’s phone', '<div class="seg" id="devApp">' + Object.keys(APPS).map(function (k) { return '<button type="button" data-app="' + k + '"' + (devPick === k ? ' class="on"' : '') + '>' + APPS[k][0] + '</button>'; }).join('') + '</div>' +
                '<p class="mute small">' + esc(APPS[devPick][1]) + '</p>' +
                '<div class="qr-box">' + qrSvg(appLink(devPick)) + '</div>' +
                '<ol class="small"><li>On their phone, point the camera at this code and open the link.</li>' +
                '<li><b>iPhone:</b> in Safari tap Share → <b>Add to Home Screen</b>. <b>Android:</b> in Chrome tap ⋮ → <b>Install app</b>.</li>' +
                '<li>Open it from the new icon – it’s already connected.</li></ol>' +
                (navigator.share ? '<button class="btn ghost wide" id="devShare">Send the link instead</button>' : '<button class="btn ghost wide" id="devCopy">Copy the link</button>') +
                '<p class="mute small">The link contains your access code – only share it with family.</p>') +
            card('Connect by code', '<p class="small">A new screen (tablet, Raspberry Pi, computer) – or Family Admin or Family Calendar opened on a computer – shows a code like <b>K7Q2-M9XD</b> and a QR code. Scan the QR code with this phone, or type the code here:</p>' +
                '<input id="prCode" class="mono" placeholder="K7Q2-M9XD" autocomplete="off" autocapitalize="characters" spellcheck="false"><button class="btn wide" id="prGo">Connect the screen</button><div id="prOut"></div>' +
                '<p class="small"><b>A new screen:</b> on it open <b>' + esc(base.replace(/^https?:\/\//, '')) + 'screen/</b>. <b>Windows PC (like the Corsair):</b> download the start file from <b>' + esc(base.replace(/^https?:\/\//, '')) + 'downloads/windows/</b>, run it, and type the code it shows here. ' +
                'It asks whether to start with Windows and whether to keep the screen on, and updates itself.</p>' +
                '<details class="adv"><summary>Or open the screen link directly (tablets)</summary><div class="qr-box">' + qrSvg(appLink('screen')) + '</div><p class="mute small">Scan this with the tablet itself – it opens the dashboard already connected.</p></details>') +
            screensCard() +
            card('This phone', '<p class="small">Connected to the dashboard of <b>' + esc(((DATA.family || {}).people || []).map(function (p) { return p.name; }).slice(0, 6).join(', ') || 'your family') + '</b> <span class="mute">(Sheet ' + esc(c.url.replace(/^https:\/\/script\.google\.com\/macros\/s\//, '').slice(0, 10)) + '…)</span>. Wrong family? Disconnect, then connect to the right one.</p><button class="btn ghost wide" id="sOut">Disconnect this phone</button>');
        $('devApp').onclick = function (e) { var b = e.target.closest('[data-app]'); if (b) { devPick = b.getAttribute('data-app'); secDevices(); } };
        if ($('devShare')) $('devShare').onclick = function () { navigator.share({ title: APPS[devPick][0].slice(2), text: 'Open this on your phone, then add it to your Home Screen:', url: appLink(devPick) }).catch(function () {}); };
        if ($('devCopy')) $('devCopy').onclick = function () { try { navigator.clipboard.writeText(appLink(devPick)).then(function () { FD.toast('Copied'); }); } catch (e) { FD.toast('Couldn’t copy', true); } };
        wireScreens();
        $('prGo').onclick = function () {
            if (!confirm('Connect it to YOUR family’s dashboard? Only do this for a screen or computer in your own home – it will show your calendar, points, notes and photos. (Setting up someone else? They need their own setup.)')) return;
            var b = this; b.disabled = true;
            FDPairSend.send($('prCode').value, FD.config()).then(function (code) {
                $('prOut').innerHTML = '<p class="pos small"><b>✔ Sent.</b> Waiting for ' + esc(code) + ' to pick it up…</p>'; b.disabled = false; $('prCode').value = '';
                // Check it was collected – a code typed wrongly, or from a page that's been closed, would otherwise look like it worked.
                var tries = 0;
                (function check() {
                    setTimeout(function () {
                        if (!FDPairSend.collected) return;
                        FDPairSend.collected(code).then(function (got) {
                            if (got) { $('prOut').innerHTML = '<p class="pos small"><b>✔ Connected.</b> ' + esc(code) + ' has picked it up.</p>'; return; }
                            if (++tries < 4) return check();
                            $('prOut').innerHTML = '<p class="neg small"><b>Not picked up yet.</b> Check the code on the screen or computer is <b>' + esc(code) + '</b>, and that its page is still open – then type it again.</p>';
                        }, function () { $('prOut').innerHTML = '<p class="pos small"><b>✔ Sent.</b> ' + esc(code) + ' should connect within a few seconds.</p>'; });
                    }, 5000);
                })();
            },
                function (e) { b.disabled = false; FD.toast(e.message, true); });
        };
        $('sOut').onclick = function () { if (confirm('Disconnect this phone? You’ll need a QR code or link from another family phone to connect it again.')) { FD.clearConfig(); try { localStorage.removeItem('fdadmin.data'); } catch (e) { /* ignore */ } location.reload(); } };
    }

    /* ---- family & children (the same as the setup app's family step) */
    var COLOURS = ['#3fa9f5', '#f5a623', '#7ed321', '#f472b6', '#a855f7', '#22d3ee', '#ef4444', '#facc15', '#14b8a6', '#fb923c', '#94a3b8', '#e879f9'];
    function secFamily() {
        var F = DATA.family, LM = F.limits || { people: 12, children: 6, specials: 3, name: 10, group: 14, special: 16 };
        if (!F) { $('body').innerHTML = '<div class="empty">Update the Google script to change the family here.</div>'; return; }
        var person = function (p) {
            return '<div class="fam-p' + (p.role === 'adult' ? ' adult' : '') + '" data-was="' + esc(p.was != null ? p.was : p.name) + '">' +
                '<div class="fp-top"><input data-n placeholder="Name" maxlength="' + LM.name + '" value="' + esc(p.name) + '"><input type="color" data-c value="' + esc(p.colour || '#3fa9f5') + '"><button class="x" data-del aria-label="Remove">✕</button></div>' +
                '<div class="fp-bot"><div class="seg role"><button type="button" data-r="adult"' + (p.role === 'adult' ? ' class="on"' : '') + '>Adult</button><button type="button" data-r="child"' + (p.role !== 'adult' ? ' class="on"' : '') + '>Child</button></div>' +
                '<button type="button" class="ptb' + (p.points === false ? '' : ' on') + '" data-pt>⭐ Points page</button></div>' +
                '<input class="match" data-m placeholder="Matching words, e.g. football, Cubs" value="' + esc(p.match || '') + '"></div>';
        };
        var special = function (x) {
            return '<div class="fam-s" data-was="' + esc(x.was != null ? x.was : x.name) + '"><div class="fp-top"><input data-n placeholder="e.g. School holiday" maxlength="' + LM.special + '" value="' + esc(x.name) + '">' +
                '<input type="color" data-c value="' + esc(x.colour || '#14b8a6') + '"><button class="x" data-del aria-label="Remove">✕</button></div>' +
                '<label class="tog sm"><input type="checkbox" data-b' + (x.bar ? ' checked' : '') + '><span>Show as a strip along the bottom of each day</span></label>' +
                '<input class="match" data-m placeholder="Matching words, e.g. half term, inset" value="' + esc(x.match || '') + '"></div>';
        };
        var group = function (k, label, g) {
            return '<div class="fam-g" data-g="' + k + '" data-was="' + esc(g.name) + '"><label>' + label + '</label><div class="fp-top"><input data-n maxlength="' + LM.group + '" value="' + esc(g.name) + '"><input type="color" data-c value="' + esc(g.colour) + '"></div>' +
                '<input class="match" data-m placeholder="Matching words" value="' + esc(g.match || '') + '"></div>';
        };
        var pp = pointsPage();
        $('body').innerHTML = '<div id="famForm">' +
            card('Everyone in the family', '<p class="mute small">Up to ' + LM.people + ' people, of whom up to ' + LM.children + ' children. Tap ⭐ to put a child on the points page, or take them off – their points are kept.</p>' +
                '<div id="ppl">' + F.people.map(person).join('') + '</div><button class="btn ghost wide" id="addP">+ Add a person</button>') +
            card('Groups on the calendar', '<p class="mute small">Each person shows in their group’s colour on the calendar key, with their name in brackets, e.g. “Drums (Ben)”.</p>' +
                group('children', 'Children’s group', F.children) + group('adults', 'Adults’ group', F.adults) +
                '<label>Points page name <span class="cnt">max 14</span></label><input id="ptsTitle" maxlength="14" value="' + esc(pp ? pp.title : (F.pointsTitle || '')) + '" placeholder="Same as the children’s group">') +
            card('Categories everyone shares', '<div class="fixed-c"><span>🔒 <b>Family</b> <span class="mute small">things you all do together</span></span><input type="color" id="famC" value="' + esc(F.family.colour) + '"></div>' +
                '<div class="fixed-c"><span>🔒 <b>Holiday</b> <span class="mute small">trips away (flights go here too)</span></span><input type="color" id="holC" value="' + esc(F.holiday.colour) + '"></div>' +
                '<h3 class="sh">Special categories (up to ' + LM.specials + ')</h3><div id="sps">' + F.specials.map(special).join('') + '</div>' +
                '<div class="chips" id="spAdd"><button class="chip" data-sug="School holiday">+ School holidays</button><button class="chip" data-sug="Birthday">+ Birthdays</button><button class="chip" data-sug="">+ Other</button></div>') +
            '<label class="tog"><input type="checkbox" id="showMatch"><span>Show matching words (advanced)</span></label>' +
            '<p class="mute small">Events go in a category by the name at the start of their title – “Ben – Drums”, “Family – Zoo”. Matching words catch events without one, e.g. “football” → Josh.</p>' +
            '<p class="mute small" id="famNote"></p><button class="btn wide" id="famSave">Save family</button></div>' +
            '<a class="link-card" data-go="points" href="#"><b>★ Points set-up ›</b><span class="mute small">Tasks, morning to-dos, reminders and the rules – under the points page.</span></a>' +
            card('Which Google calendars', installFields('calendar') + saveInstallBtn('cSave', 'Save calendars'), 'sx-cal') +
            (calPage() ? card('Calendar page on the screen', '<p class="mute small">Which view it opens on, and lining up the weekends in the 3-month views.</p><button class="btn ghost wide" id="calPage">Calendar page settings</button>') : '');
        wireSaveInstall('cSave', document.querySelector('.sx-cal'));
        if ($('calPage')) $('calPage').onclick = function () { pageSheet(calPage()); };
        var form = $('famForm');
        $('showMatch').onchange = function () { form.classList.toggle('show-match', this.checked); };
        $('addP').onclick = function () {
            var n = form.querySelectorAll('.fam-p').length;
            if (n >= LM.people) { FD.toast('Up to ' + LM.people + ' people', true); return; }
            $('ppl').insertAdjacentHTML('beforeend', person({ name: '', role: 'child', colour: COLOURS[n % COLOURS.length], was: '' }));
            $('ppl').lastChild.querySelector('[data-n]').focus(); note();
        };
        $('spAdd').onclick = function (e) {
            var b = e.target.closest('[data-sug]'); if (!b) return;
            if (form.querySelectorAll('.fam-s').length >= LM.specials) { FD.toast('Up to ' + LM.specials + ' special categories', true); return; }
            var sug = b.getAttribute('data-sug');
            $('sps').insertAdjacentHTML('beforeend', special(sug === 'School holiday' ? { name: sug, colour: '#facc15', match: 'half term, inset, school holiday', bar: true, was: '' }
                : sug === 'Birthday' ? { name: sug, colour: '#ffffff', match: 'birthday', bar: false, was: '' } : { name: '', colour: '#14b8a6', match: '', bar: false, was: '' }));
        };
        form.onclick = function (e) {
            var r = e.target.closest('.role [data-r]');
            if (r) { Array.prototype.forEach.call(r.parentNode.children, function (x) { x.classList.toggle('on', x === r); }); r.closest('.fam-p').classList.toggle('adult', r.getAttribute('data-r') === 'adult'); note(); return; }
            var pt = e.target.closest('[data-pt]'); if (pt) { pt.classList.toggle('on'); note(); return; }
            var d = e.target.closest('[data-del]'); if (d) { d.closest('.fam-p, .fam-s').remove(); note(); }
        };
        form.oninput = note;
        function collect() {
            var people = Array.prototype.map.call(form.querySelectorAll('.fam-p'), function (r) {
                var role = r.querySelector('.role .on').getAttribute('data-r');
                return { name: r.querySelector('[data-n]').value.trim(), role: role, colour: r.querySelector('[data-c]').value, match: r.querySelector('[data-m]').value.trim(),
                    was: r.getAttribute('data-was') || '', points: role === 'child' && r.querySelector('[data-pt]').classList.contains('on') };
            }).filter(function (p) { return p.name; });
            var grp = function (k) { var r = form.querySelector('[data-g="' + k + '"]'); return { name: r.querySelector('[data-n]').value.trim(), colour: r.querySelector('[data-c]').value, was: r.getAttribute('data-was'), match: r.querySelector('[data-m]').value.trim() }; };
            var specials = Array.prototype.map.call(form.querySelectorAll('.fam-s'), function (r) {
                return { name: r.querySelector('[data-n]').value.trim(), colour: r.querySelector('[data-c]').value, bar: r.querySelector('[data-b]').checked, match: r.querySelector('[data-m]').value.trim(), was: r.getAttribute('data-was') || '' };
            }).filter(function (x) { return x.name; });
            return { people: people, children: grp('children'), adults: grp('adults'), specials: specials,
                family: { colour: $('famC').value, match: F.family.match }, holiday: { colour: $('holC').value, match: F.holiday.match }, pointsTitle: $('ptsTitle').value.trim() };
        }
        function problem(f) {
            if (!f.people.length) return 'Add at least one person';
            if (!f.children.name || !f.adults.name) return 'Give both groups a name';
            var seen = {}, dup = '';
            [f.children.name, f.adults.name, 'Family', 'Holiday'].concat(f.people.map(function (p) { return p.name; }), f.specials.map(function (x) { return x.name; })).forEach(function (n) {
                var k = n.toLowerCase().replace(/[^a-z0-9]+/g, ''); if (k && seen[k]) dup = dup || n; seen[k] = 1; });
            if (dup) return '“' + dup + '” is used twice – every name needs to be different';
            if (f.people.filter(function (p) { return p.role === 'child'; }).length > LM.children) return 'Up to ' + LM.children + ' children';
            return '';
        }
        function note() {
            var f = collect(), on = f.people.filter(function (p) { return p.points; }), off = f.people.filter(function (p) { return p.role === 'child' && !p.points; });
            var names = function (a) { return a.map(function (p) { return p.name; }).join(', '); };
            $('famNote').textContent = !on.length ? 'Nobody is on the points page, so it’s left as it is.' :
                'Points page: ' + names(on) + (on.length > 3 ? ' (split over two screens)' : '') + '.' + (off.length ? ' Not on it: ' + names(off) + '.' : '');
        }
        note();
        $('famSave').onclick = function () {
            var f = collect(), err = problem(f);
            if (err) { FD.toast(err, true); return; }
            act(Object.assign({ action: 'saveFamily' }, f), 'Family saved – the screen updates within a minute').then(load, function () {});
        };
    }

    /* ================================================================ start */

    function start() { frame(); render(); load().then(function () { fetchGlance(); }); }
    FD.registerSW();
    // The website on a computer that's already been used for setup (or has Family Admin) connects by itself.
    if (DESK && !FD.configured() && window.FDPairSend) { var sv = FDPairSend.saved(); if (sv) FD.setConfig(sv.url, sv.code); }
    if (FD.configured()) start();
    else if (DESK && !/[?&]connect\b/.test(location.search)) {
        $('app').innerHTML = '<div class="desk-welcome"><h1>Family Dashboard setup</h1>' +
            '<div class="dw-cards"><a class="dw-card first" href="guide/"><span>🚀</span><b>First-time setup</b><small>New to Family Dashboard? Set up your family’s dashboard, one step at a time (about 30 minutes).</small><i class="btn">Start</i></a>' +
            '<a class="dw-card" href="?connect"><span>🔗</span><b>Already set up?</b><small>Connect this computer to your family’s dashboard to change the screen layout, settings and more. You’ll need your phone with Family Admin.</small><i class="btn ghost">Connect this computer</i></a></div>' +
            '<section class="card"><h2>How it works</h2>' + HOW_IT_WORKS.replace('setup created', 'setup creates') + '</section>' +
            '<p class="mute small center"><a href="../">Family Dashboard home page</a> · <a href="../help/">Help</a></p></div>';
    } else FD.setupScreen($('app'), DESK ? 'Family Dashboard setup' : 'Family Admin', start);
})();
