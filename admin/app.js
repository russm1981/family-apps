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
    // The website: setting up (first-time setup, screens & widgets, family, rewards, advanced), help, then the apps.
    var TABS = DESK ? [['dhome', '🏠', 'Home'], ['start', '🚀', 'Setup wizard'], ['layout', '▦', 'Screens'], ['famcfg', '👪', 'Family'], ['rewards', '⭐', 'Rewards'], ['advanced', '⚙', 'Advanced'], ['calendar', '📅', 'Calendar'], ['memos', '📌', 'Notes'], ['lists', '☰', 'Lists'], ['reminders', '🎒', 'Reminders'], ['other', '◈', 'Other widgets']]
        // The phone: the everyday part of the Configurator – rewards and the apps – with help, support and settings under More.
        : [['calendar', '📅', 'Calendar'], ['memos', '📌', 'Notes'], ['lists', '☰', 'Lists'], ['rewards', '⭐', 'Rewards'], ['other', '◈', 'Apps'], ['more', '⋯', 'More']];
    // Settings sections on the phone (the rest are on the computer website).
    var PHONE_S = { screen: 1, licence: 1, devices: 1, updates: 1, support: 1 };   // updates: the "update now" override, if the script hasn't updated itself
    function appsRoot() { return location.href.replace(/[#?].*$/, '').replace(/(admin|setup|settings)\/.*$/, ''); }
    function deskUrl() { return appsRoot() + 'setup/'; }
    function guideUrl() { return appsRoot() + 'setup/guide/'; }
    function deskShort() { return deskUrl().replace(/^https?:\/\//, ''); }
    // Which tab each kind of widget lives under.
    var FAMILY_W = { agenda: 1, whereabouts: 1 }, LIST_W = { list: 1, todo: 1 }, MEMO_W = { memo: 1 }, INFO_W = { bins: 1, weather: 1, trains: 1, bus: 1, traffic: 1 };
    function tabFor(type) { return FAMILY_W[type] ? 'other' : MEMO_W[type] ? 'memos' : LIST_W[type] ? 'lists' : 'other'; }
    // The Settings menu, in order. Sections marked sub: true are reached from another section (System → Licence…).
    var SECTIONS = {
        family: ['👪', 'Family', 'Who’s in the family, their colours, who takes part in rewards, calendar groups'],
        places: ['📍', 'Locations & home', 'Your home address, and the places your widgets use'],
        keys: ['🔑', 'External data (API) keys', 'One place for every key: maps, trains, buses, NASA, Spotify'],
        system: ['🖥️', 'System', 'Screen & sleep, licence and updates'],
        mydata: ['🗂️', 'My data (Google)', 'Reconfigure, start again, move to another Google account, access code'],
        devices: ['📱', 'Devices and Phones', 'This phone, another person’s phone, another screen'],
        support: ['🩺', 'About & diagnostics', 'Every version number, what’s new, and a report for support'],
        screen: ['🌙', 'Screen & sleep', 'When the screen goes to sleep, and night hours', true],
        licence: ['🎫', 'Software Licence', 'Your licence key and screens', true],
        updates: ['⟳', 'Software updates', 'The application held within Google (Google script) – its version and automatic updates', true],
    };
    var ALIAS = { access: 'devices', advanced: 'mydata', home: 'places' };   // older links
    function menuKeys() { return Object.keys(SECTIONS).filter(function (k) { return DESK ? !SECTIONS[k][3] : PHONE_S[k]; }); }
    function helpUrl() { return appsRoot() + 'help/'; }

    /* ================================================================ data */

    // The dot by the title: green = up to date with the Google Sheet, blue = talking to it, red = the last try didn't work
    // (hover or tap it to see why; it tries again by itself).
    var syncWhy = '', syncRetry = null;
    function sync(k, why) {
        var s = $('sync'); if (!s) return;
        s.className = 'sync ' + k;
        if (k === 'err') syncWhy = why || syncWhy || 'Couldn’t reach the Google Sheet';
        s.title = k === 'ok' ? 'Up to date with your Google Sheet' : k === 'busy' ? 'Talking to your Google Sheet…' : 'Last try didn’t work: ' + syncWhy + ' – tap to try again';
        clearTimeout(syncRetry);
        if (k === 'err') syncRetry = setTimeout(function () { if (!pending) load(true); }, 60000);
    }
    function setData(d) {
        DATA = d;
        try { localStorage.setItem('fdadmin.data', JSON.stringify(d)); } catch (e) { /* ignore */ }
        if (hasEdits()) { stale = true; return; }      // never redraw over changes you haven't saved yet
        render();
    }
    // quiet: a refresh nobody asked for (coming back to the window, a retry) – if it fails, the dot goes red but no
    // message pops up; the Google script can take a while to wake up, so it has a minute to answer.
    function load(quiet) {
        sync('busy');
        return FD.post({ action: 'admin' }, 60000).then(function (d) { sync('ok'); setData(d); })
            .catch(function (e) { sync('err', e.message); if (quiet !== true) FD.toast(e.message, true); if (!hasEdits()) render(); });
    }

    /* ---- Unsaved changes and saving.
     * Typing in a part of a page that has a Save button marks that part as changed. While anything is unsaved, data
     * arriving in the background (coming back to the app, a refresh, another save finishing) doesn't redraw the page –
     * it's drawn once everything is saved, or when you go to another page. Pressing Save locks that part
     * (⏳ Saving…) until the save has finished, so you can't get ahead of it; if it fails your changes stay. */
    var edits = [], stale = false, locks = [], actsAt = 0;
    function isSave(b) { return b && b.tagName === 'BUTTON' && (b.hasAttribute('data-lsave') || b.hasAttribute('data-psave') || /^Save\b/.test(b.textContent.trim())); }
    function partOf(el) {      // the smallest part of the page around el that has a Save button
        for (var n = el; n && n.id !== 'body' && n !== document.body; n = n.parentElement)
            if (Array.prototype.some.call(n.querySelectorAll('button'), isSave)) return n;
        return null;
    }
    function hasEdits() { edits = edits.filter(function (n) { return n.isConnected; }); return edits.length > 0; }
    function markEdit(e) {
        var b = $('body'); if (!b || !b.contains(e.target)) return;
        if (e.type === 'click' && !e.target.closest('[data-x],[data-mv],[data-ladd],.dp-day,.cd-add,.cd-x')) return;
        var part = partOf(e.target);
        if (part && edits.indexOf(part) < 0) edits.push(part);
    }
    ['input', 'change', 'click'].forEach(function (t) { document.addEventListener(t, markEdit, true); });
    document.addEventListener('click', function (e) {
        var b = e.target.closest && e.target.closest('button'); if (!isSave(b)) return;
        var part = b.closest('#sheet') || partOf(b) || b.parentElement;
        var mine = edits.filter(function (n) { return n.contains(b); });
        edits = edits.filter(function (n) { return mine.indexOf(n) < 0; });
        var started = actsAt;
        setTimeout(function () {      // nothing was sent (e.g. something needs fixing first): it's still unsaved
            if (actsAt === started && !pending) { edits = edits.concat(mine); return; }
            lock(part, b, mine);
        }, 0);
    }, true);
    function lock(part, btn, mine) {
        if (!part || !part.isConnected || part.hasAttribute('inert')) return;
        part.setAttribute('inert', ''); part.classList.add('is-saving');
        var was = btn.innerHTML; btn.innerHTML = '⏳ Saving…'; btn.classList.add('saving');
        locks.push({ part: part, btn: btn, was: was, mine: mine });
    }
    function unlock(failed) {
        locks.forEach(function (l) {
            l.part.removeAttribute('inert'); l.part.classList.remove('is-saving');
            l.btn.innerHTML = l.was; l.btn.classList.remove('saving');
            if (failed) edits = edits.concat(l.mine.filter(function (n) { return n.isConnected; }));
        });
        locks = [];
        if (!failed && stale && !hasEdits()) { stale = false; render(); }
    }
    window.addEventListener('beforeunload', function (e) { if (hasEdits() || pending) { e.preventDefault(); e.returnValue = ''; } });
    /** Run an action. Actions that return points state update the points page; others return all admin data. */
    // Changes go to the Google script one after another. A tap while one is still on its way waits its turn –
    // it's never dropped (dropping it used to close the form as if it had been saved).
    var queue = Promise.resolve(), pending = 0;
    // While a change is on its way to Google: an hourglass, a "Saving…" note, and nothing else can be changed until
    // it's saved (shown only if it takes more than a moment, so quick ones don't flicker).
    var actingT = null;
    function acting(on) {
        clearTimeout(actingT);
        if (on) actingT = setTimeout(function () { document.body.classList.add('acting'); }, 250);
        else document.body.classList.remove('acting');
    }
    function act(body, okText, undoable) {
        pending++; actsAt++; busy = true; sync('busy'); acting(true);
        var run = function () {
            return FD.post(body, 60000).then(function (d) {
                if (d.saved && d.rows) { DATA[d.saved] = d.rows; setData(DATA); }      // a list on its own: quicker
                else if (d.layoutOnly) { if (pending === 1) { DATA.pages = d.pages; DATA.widgets = d.widgets; setData(DATA); } }     // later changes still on their way: keep what's on the phone
                else if (d.state && !d.tasks) { DATA.state = d.state; setData(DATA); }
                else if (d.tasks) setData(d);
                else if (d.data && d.id && DATA.lists) { DATA.lists[d.id] = d.data; setData(DATA); }
                if (okText) FD.toast(okText, false, undoable && d.id ? function () { act({ action: 'undo', id: d.id }, 'Undone'); } : null);
                return d;
            });
        };
        var p = queue.then(run, run);
        queue = p.catch(function () { /* the next change still goes */ });
        return p.then(function (d) { if (--pending === 0) { busy = false; sync('ok'); unlock(false); acting(false); } return d; },
            function (e) { if (--pending === 0) { busy = false; acting(false); } sync('err', e.message); unlock(true); FD.toast(e.message, true); load(true); throw e; });
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
            if ((route().tab === 'family' || route().tab === 'other' || route().w) && !hasEdits()) render();
        });
    }
    function fetchWidget(id) {
        return FD.get('widget', { id: id }).then(function (d) { GL[id] = d.data; if (route().w === id) render(); }, function (e) { FD.toast(e.message, true); });
    }

    /* ================================================================ frame and routes */

    function route() {
        var h = location.hash.replace(/^#\/?/, '').split('/');
        if (h[0] === 'w' && h[1]) { var ww = widgetOf(decodeURIComponent(h[1])); return { w: decodeURIComponent(h[1]), tab: ww ? tabFor(ww.type) : 'other' }; }
        // On the computer, Reminders is its own page under Apps (the Reminders item in Rewards goes there).
        if (DESK && (h[0] === 'points' || h[0] === 'rewards') && h[1] === 'timetable') { try { history.replaceState(null, '', '#/reminders'); } catch (e) { /* fine */ } return { tab: 'reminders' }; }
        if (h[0] === 'points') return { tab: 'rewards', sub: h[1] || '' };
        if (DESK && ({ family: 1, tools: 1, settings: 1 })[h[0]]) return { tab: h[0] === 'family' ? 'rewards' : h[0] === 'tools' ? 'start' : 'advanced' };
        if (!DESK && h[0] === 'family') return { tab: 'rewards' };       // older phone links
        if (!DESK && h[0] === 'settings') return { tab: 'more' };
        if (h[0] === 'home' || h[0] === '') return { tab: DESK ? 'dhome' : 'calendar' };
        if (h[0] === 's' && ALIAS[h[1]]) h[1] = ALIAS[h[1]];
        if (h[0] === 's' && h[1] === 'family' && DESK) return { tab: 'famcfg' };
        if (DESK && h[0] === 's' && h[1]) return { tab: 'advanced', sub: ALIAS[h[1]] || h[1] };      // settings open in the Advanced page's side menu
        if (DESK && h[0] === 'advanced') return { tab: h[0], sub: h[1] || '' };
        if (h[0] === 'rewards') return { tab: 'rewards', sub: h[1] || '' };
        if (h[0] === 's' && SECTIONS[h[1]]) return { s: h[1], tab: DESK ? 'advanced' : 'more' };
        if (h[0] === 'help') return { tab: DESK ? 'help' : 'more', help: true };      // Help: the button by the title
        if (h[0] === 'feedback') return { tab: 'feedback', sub: h[1] || '' };
        return { tab: TABS.some(function (t) { return t[0] === h[0]; }) ? h[0] : h[0] === 'layout' ? 'layout' : (DESK ? 'dhome' : 'calendar') };
    }
    function go(where) {
        if (hasEdits() && !confirm('You haven’t saved your changes on this page. Leave without saving them?')) return;
        edits = [];
        if (location.hash !== '#/' + where) location.hash = '#/' + where; else render(); window.scrollTo(0, 0); }
    function frame() {
        $('app').innerHTML =
            '<header class="top"><div class="top-row"><button class="icon-btn back" id="back" aria-label="Back">‹</button><h1 id="title">' + (DESK ? 'Family Dashboard Configurator' : 'Family Admin') + '</h1><span class="sync" id="sync"></span>' +
            (DESK ? '<a class="hdr-help" id="hdrFb" data-go="feedback" href="#">💬 Feedback</a><a class="hdr-help" id="hdrHelp" data-go="help" href="#">❓ Help</a>' : '') +
            '<button class="icon-btn" id="refresh" aria-label="Refresh">↻</button></div></header>' +
            '<main class="main" id="body"></main>' +
            '<nav class="tabbar" id="tabs">' + TABS.map(function (t, i) {
                // On the computer: the setting-up tabs, then the everyday ones (the same as the phone app)
                var grp = !DESK ? '' : i === 1 ? '<span class="tab-sep"></span><span class="tab-grp">Set up</span>' : i === 6 ? '<span class="tab-sep"></span><span class="tab-grp">Apps</span>' : '';
                return grp + '<button data-t="' + t[0] + '"><i>' + t[1] + '</i>' + t[2] + '</button>';
            }).join('') + '</nav>' +
            '<div class="sheet-bg" id="sheetBg"><div class="sheet" id="sheet"></div></div>';
        $('tabs').onclick = function (e) { var b = e.target.closest('[data-t]'); if (b) go(b.getAttribute('data-t')); };
        document.addEventListener('click', function (e) { var g = e.target.closest('[data-go]'); if (g) { e.preventDefault(); go(g.getAttribute('data-go')); } });
        $('back').onclick = function () { if (history.length > 1) history.back(); else go(route().tab); };
        $('sync').onclick = function () { if (this.classList.contains('err')) { FD.toast(syncWhy + ' – trying again…', true); load(); } else FD.toast(this.title); };
        $('refresh').onclick = function () { load(); fetchGlance(true); var r = route(); if (r.w) fetchWidget(r.w); };
        $('sheetBg').onclick = function (e) { if (e.target === $('sheetBg')) closeSheet(); };
        window.addEventListener('hashchange', function () { closeSheet(); render(); window.scrollTo(0, 0); });
        document.addEventListener('visibilitychange', function () { if (!document.hidden) { load(true); fetchGlance(); } });
    }
    function sheet(html) { $('sheet').classList.remove('wide'); $('sheet').innerHTML = '<div class="grab"></div>' + html; $('sheetBg').classList.add('on'); }
    function closeSheet() { if ($('sheetBg')) $('sheetBg').classList.remove('on'); }

    function render() {
        var bo = document.getElementById('bodyOuter'); if (bo) bo.id = 'body';      // leaving a page with a side menu
        pageName = ''; stale = false;
        if (!$('body')) return;
        var r = route();
        Array.prototype.forEach.call(document.querySelectorAll('#tabs button'), function (b) { b.classList.toggle('on', b.getAttribute('data-t') === r.tab); });
        if ($('hdrHelp')) $('hdrHelp').classList.toggle('on', r.tab === 'help');
        orient(r.tab === 'calendar' && !r.w);
        if ($('hdrFb')) $('hdrFb').classList.toggle('on', r.tab === 'feedback');
        $('back').style.display = r.w || r.s || r.pts ? '' : 'none';
        $('body').onclick = null;
        if (r.tab !== 'famcfg') { famEdit = null; famName = null; }      // unsaved changes on the Family page go when you leave it
        if (!DATA) { $('title').textContent = 'Family Admin'; $('body').innerHTML = '<div class="empty">Loading…</div>'; return; }
        if (!DATA.widgets) { $('body').innerHTML = '<div class="empty">Update the Google Apps Script to the latest version.</div>'; return; }
        if (!DESK && ((r.s && !PHONE_S[r.s]) || (!r.s && !r.w && !r.pts && r.tab === 'layout'))) renderOnComputer(r.s ? SECTIONS[r.s][1] : 'Screen layout');
        else if (r.w) renderWidget(r.w);
        else if (r.s) renderSection(r.s);
        else if (r.pts) renderPointsSetup();
        else ({ family: renderFamily, memos: renderMemos, lists: renderLists, other: renderOther, layout: renderLayout, settings: renderSettings, tools: renderTools, start: renderStart,
            famcfg: renderFamCfg, dhome: renderHome, rewards: function () { renderRewards(r.sub); }, reminders: function () { renderRewards('timetable', true); }, advanced: function () { renderAdvanced(r.sub); }, help: renderHelp, calendar: renderCalApp, feedback: function () { renderFeedback(r.sub); }, more: r.help ? renderHelp : renderMore })[r.tab]();
        var n = notices();
        if (n) $('body').insertAdjacentHTML('afterbegin', n);
        // On the website the title bar always says "Family Dashboard Configurator"; the page's own name is its heading.
        if (DESK && pageName && r.tab !== 'layout' && r.tab !== 'rewards' && !$('body').querySelector('.page-h')) $('body').insertAdjacentHTML('afterbegin', '<h1 class="page-h">' + esc(pageName) + '</h1>');
        privacyCheck();
    }
    /** On a phone only the Calendar tab turns sideways. Android: the other tabs are locked upright. iPhone (which can't
     * lock one screen and not another): turned sideways, the other tabs ask you to turn the phone upright. */
    function orient(cal) {
        if (DESK) return;
        document.body.classList.toggle('tab-calendar', !!cal);
        try {
            var o = screen.orientation;
            if (o && o.lock) { if (cal) { if (o.unlock) o.unlock(); } else o.lock('portrait').catch(function () { /* not allowed here (iPhone, a browser tab) */ }); }
        } catch (e) { /* fine */ }
    }
    var pageName = '';
    function title(t) {
        if (!DESK) { $('title').textContent = t; return; }
        $('title').textContent = 'Family Dashboard Configurator';      // always the same; each page has its own heading
        pageName = t || '';
    }
    var HOW_IT_WORKS = '<p>Family Dashboard is standard software that runs on your screen and your phones. Everything that belongs to your family – names, the calendar, ' +
        'the children’s points, notes and settings – is kept <b>in your own Google account</b>, in a Google Sheet that only you own.</p>' +
        '<p>The software reaches your Sheet with a <b>private access code</b> that setup created for you. The code stays on your own screen, phones and this computer, ' +
        'and isn’t sent anywhere else – so your family’s information stays private.</p>';
    /** Setup website, first tab: where you are, how it works, and what each tab is for. */
    /** The family's name (e.g. "The MacMillan family"), and who's in it, from the Family page. */
    function familyLine() {
        var ppl = ((DATA.family || {}).people || []).map(function (p) { return p.name; }), fn = String(DATA.familyName || '').trim();
        return '<b>' + esc(fn ? 'The ' + fn + ' family' : 'your family') + '</b>' + (ppl.length ? ' <span class="mute">(' + esc(ppl.join(', ')) + ')</span>' : '');
    }
    /** "the MacMillan family dashboard (Ben, Josh, Alex, Russ, Becky)" – the same words on every device. */
    function familyDash() {
        var ppl = ((DATA.family || {}).people || []).map(function (p) { return p.name; }), fn = String(DATA.familyName || '').trim();
        return (fn ? 'the <b>' + esc(fn) + ' family</b> dashboard' : 'your <b>family dashboard</b>') + (ppl.length ? ' <span class="mute">(' + esc(ppl.join(', ')) + ')</span>' : '');
    }
    function statusCard() {
        return card('✔ Your dashboard is set up', '<p>This computer is connected to ' + familyDash() + '. <a href="#" id="hmOut" class="mute small">Not yours? Disconnect this computer</a></p>' +
            '<p class="mute small">Application held within Google (Google script) ' + esc(DATA.scriptVersion || '?') + (DATA.licence ? ' · ' + esc(DATA.licence.message || '') : '') + '</p>');
    }
    /** Home: the two ways in for someone new, how it works, then the configurator's two parts. */
    function renderHome() {
        title('Home');
        var btn = function (go, ico, name, what) { return '<a class="hm-btn" data-go="' + go + '" href="#"><span>' + ico + '</span><b>' + esc(name) + '</b><small>' + esc(what) + '</small></a>'; };
        $('body').innerHTML = statusCard() +
            '<div class="card hm-new"><b>🚀 New to Family Dashboard?</b> Start with the <a href="#" data-go="start">Setup wizard</a> – it takes you through everything, step by step.</div>' +
            '<a class="card hm-new hm-go" href="' + esc(guideUrl()) + '" target="_blank" rel="noopener"><b>✨ Start the setup wizard for a new family</b><span>It makes a new Google Sheet for the family – a dashboard that’s already set up stays exactly as it is.</span><i>›</i></a>' +
            card('How it works', HOW_IT_WORKS) +
            '<p class="mute help">The configurator website is in two parts – <b>Set up</b> and <b>Apps</b>. Stuck? <a href="#" data-go="help">Help</a> is at the top, by the title.</p>' +
            card('1 · Set up', '<p class="small">How your dashboard is set up – what’s on the screens, who’s in the family, the reward system, and the settings you’ll rarely need.</p><div class="hm-grid">' +
                btn('start', '🚀', 'Setup wizard', 'Step by step – setting up for the first time, or doing one step again') +
                btn('layout', '▦', 'Screens', 'Which widgets go on which screen, each widget’s settings, and the calendar pages') +
                btn('famcfg', '👪', 'Family', 'The family’s name, who’s in it, their colours, who takes part in rewards') +
                btn('rewards', '⭐', 'Rewards', 'Points-earning tasks, daily to-dos, reminders, the reward rules – and each child') +
                btn('advanced', '⚙', 'Advanced', 'Locations, data keys, screen sleep, licence, software updates, your data, devices') + '</div>') +
            card('2 · Apps', '<p class="small">The apps your family uses every day, on this computer – the same as on the dashboard and your phones.</p><div class="hm-grid">' +
                btn('calendar', '📅', 'Calendar', 'See and add events') + btn('memos', '📌', 'Notes', 'The notes on the dashboard') + btn('lists', '☰', 'Lists', 'Shopping and other lists') + btn('reminders', '🎒', 'Reminders', 'PE kit, library books – the things to remember each day') +
                btn('other', '◈', 'Other widgets', 'Everyday settings for the other widgets') + '</div>');
    }
    /** The setup wizard: setting up for the first time, a single step again, the calendar. */
    function renderStart() {
        title('Setup wizard');
        $('body').innerHTML = statusCard() +
            card('Start full wizard', '' +
                '<p class="small">The setup wizard takes you through everything step by step: your Google Sheet, the licence, the family, connecting the screen and phones, and the free keys for live data.</p>' +
                '<a class="btn wide" href="' + esc(guideUrl()) + '" target="_blank" rel="noopener">Start the setup wizard for a new family (setting up for the first time)</a>' +
                '<a class="btn wide" href="' + esc(guideUrl() + '#api=' + encodeURIComponent(FD.config().url) + '&code=' + encodeURIComponent(FD.config().code) + '&go=welcome') + '">Rerun the wizard to reconfigure the current ' + esc(String(DATA.familyName || '').trim() ? DATA.familyName + ' family' : 'family') + ' data</a>' +
                '<p class="mute small" style="margin-top:14px">A new family gets its own new Google Sheet. Rerunning it on your family lets you change what’s there, or clear it and start again – a backup copy is kept in your Google Drive first.</p>') +
            stepsCard();
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
                row('👪', 'Your family', 'Who’s in the family, their colours and who takes part in rewards', link('go=family')) +
                row('📅', 'Your calendar', 'The calendar’s categories, groups and colours, and tidying up the Google calendar', link('go=calendar')) +
                row('📺', 'Connect your display', 'The XENEON EDGE (Windows or Raspberry Pi), a tablet, or a browser on this computer', link('go=devices')) +
            row('📱', 'Connect your phones', 'The Family Admin and Family Calendar apps – scan, then add to the home screen', link('go=phones')) +
                row('🔑', 'Free keys for live data', 'Traffic, trains, buses, NASA, Spotify – step by step', link('go=keys')) +
                row('🎫', 'Licence key', 'Add or check your licence key', link('go=licence')) +
                row('✅', 'Check everything', 'Asks your Sheet to fetch every widget and reports anything that needs attention', link('go=check')) +
                row('⟳', 'Software updates', 'The version of the application held within Google (Google script), and the loader file', link('update')) +
                row('🧭', 'Go through the whole setup again', 'Every step, with what you’ve already filled in', link('go=welcome')) + '</div>') +
            card('Starting again or moving', '<div class="menu">' +
                row('🗂️', 'My data (Google)', 'Your access code, starting afresh in a new Sheet, moving to another Google account', '', 's/mydata') +
                row('🆕', 'Set up a different family from scratch', 'A new Google Sheet for someone else – this family’s stays as it is', base) + '</div>') +
            card('Help', '<div class="menu">' + row('❓', 'Help centre', 'Plain-English answers, step by step', helpUrl()) + '</div>');
    }
    document.addEventListener('click', function (e) {
        if (!e.target.closest || !e.target.closest('#goCalSetup')) return;
        e.preventDefault();
        var cp = calPage(); try { if (cp) localStorage.setItem('fdedit.page', cp.id); } catch (x) { /* fine */ }
        go('layout');
    });
    /** First-time setup tab: any single step of the guided setup again, already connected. */
    function stepsCard() {
        var c = FD.config(), base = guideUrl();
        var link = function (step) { return base + '#api=' + encodeURIComponent(c.url) + '&code=' + encodeURIComponent(c.code) + '&' + step + (step !== 'go=welcome' ? '&only' : ''); };
        var row = function (ico, name, what, href) { return '<a class="mrow" href="' + esc(href) + '"><span class="m-ico">' + ico + '</span><span class="m-tx"><b>' + esc(name) + '</b><small>' + esc(what) + '</small></span><i>›</i></a>'; };
        return card('Do one step from the Setup wizard again', '<div class="menu">' +
            row('👪', 'Your family', 'Who’s in the family, their colours and who takes part in rewards', link('go=family')) +
            '<a class="mrow" href="#" id="goCalSetup"><span class="m-ico">📅</span><span class="m-tx"><b>Your calendar – colour coding and tidy-up</b><small>Using a Google Calendar you already had? Set up its categories and the screen’s key, then tidy up so every event is in a category</small></span><i>›</i></a>' +
            row('📺', 'Connect your display', 'The XENEON EDGE (Windows or Raspberry Pi), a tablet, or a browser on this computer', link('go=devices')) +
            row('📱', 'Connect your phones', 'The Family Admin and Family Calendar apps – scan, then add to the home screen', link('go=phones')) +
            row('🔑', 'Get free keys for external data sources', 'Traffic, trains, buses, NASA, Spotify – step by step', link('go=keys')) +
            row('🎫', 'Add licence key', 'The licence key links the software to your original purchase', link('go=licence')) +
            row('✅', 'Check everything (diagnostics)', 'Run full diagnostics to check the widgets, settings and software', link('go=check')) +
            row('⟳', 'Software updates', 'The version of the application held within Google (Google script), and the loader file', link('update')) + '</div>');
    }
    function explain(t, html) { return '<details class="card explain" open><summary><b>ℹ️ ' + t + '</b></summary>' + html + '</details>'; }
    /** Family: who's in it, their colours, who takes part in rewards. (Groups and categories are on the calendar page.) */
    var famEdit = null, famName = null;
    function renderFamCfg() {
        title('Family');
        var F = DATA.family || {}, PAL = ['#3fa9f5', '#f5a623', '#7ed321', '#a855f7', '#f472b6', '#22d3ee', '#facc15', '#fb7185', '#34d399', '#c084fc'];
        if (!famEdit) famEdit = (F.people || []).map(function (p) { return { name: p.name, was: p.name, colour: p.colour, rewards: !!p.points }; });
        var row = function (p, i) {
            return '<div class="fp-row" data-i="' + i + '"><input type="color" data-fc="' + i + '" value="' + esc(p.colour) + '" title="Their colour">' +
                '<input data-fn="' + i + '" maxlength="10" value="' + esc(p.name) + '" placeholder="Name" autocomplete="off">' +
                '<button type="button" class="ptb' + (p.rewards ? ' on' : '') + '" data-fr="' + i + '">⭐ Rewards</button>' +
                '<button class="cs-x" data-fx="' + i + '" title="Remove">✕</button></div>';
        };
        $('body').innerHTML = explain('How the family works',
                '<p>Add up to <b>10 people</b>. Each has a colour of their own – it’s used for them on the calendar when they have their own place on its key – and you can change it.</p>' +
                '<p><b>⭐ Rewards</b>: tick it for anyone who takes part in the reward system (usually the children). They get points for tasks, daily to-dos and reminders, and a rewards card of their own to put on a screen. That’s the only thing it changes.</p>' +
                '<p>Grouping people for the calendar – “the boys”, “Russ &amp; Becky” – is part of the calendar set-up: <a href="#" data-go="layout">Screens &amp; widgets</a> → your calendar page.</p>') +
            card('Your family’s name', '<p class="mute small">Shown on the Home page – e.g. “MacMillan” for “The MacMillan family”.</p><input id="fpName" maxlength="30" placeholder="e.g. MacMillan" value="' + esc(famName == null ? (DATA.familyName || '') : famName) + '" autocomplete="off">') +
            card('Everyone in the family', '<div id="fpRows">' + famEdit.map(row).join('') + '</div>' +
                (famEdit.length < 10 ? '<button class="btn ghost fp-add" id="fpAdd">+ Add a person</button>' : '<p class="mute small">That’s the most (10).</p>') +
                '<div class="fp-notes"><p class="mute small">Ticking <b>⭐ Rewards</b> for someone includes them in the reward system – points, tasks, daily to-dos and reminders, with a rewards card of their own.</p>' +
                '<p class="mute small">Renaming someone keeps their points, tasks and calendar events. Taking someone out of rewards keeps their points, in case they come back.</p></div>' +
                '<div class="sheet-actions"><button class="btn good" id="fpSave">Save the family</button><button class="btn ghost" id="fpUndo">Undo changes</button></div>');
        $('fpRows').oninput = function (e) { var t = e.target, k;
            if ((k = t.getAttribute('data-fn')) !== null) famEdit[+k].name = t.value; else if ((k = t.getAttribute('data-fc')) !== null) famEdit[+k].colour = t.value; };
        $('fpRows').onclick = function (e) { var t;
            if ((t = e.target.closest('[data-fr]'))) { var p = famEdit[+t.getAttribute('data-fr')]; p.rewards = !p.rewards; t.classList.toggle('on', p.rewards); }
            else if ((t = e.target.closest('[data-fx]'))) { var q = famEdit[+t.getAttribute('data-fx')];
                if (q.was && !confirm('Take ' + (q.name || 'this person') + ' out of the family?' + (q.rewards ? ' Their points are kept.' : ''))) return;
                famEdit.splice(+t.getAttribute('data-fx'), 1); renderFamCfg(); } };
        if ($('fpAdd')) $('fpAdd').onclick = function () {
            var used = famEdit.map(function (p) { return p.colour; }), c = PAL.filter(function (x) { return used.indexOf(x) < 0; })[0] || PAL[famEdit.length % PAL.length];
            famEdit.push({ name: '', colour: c, rewards: false }); renderFamCfg();
            var ins = document.querySelectorAll('[data-fn]'); if (ins.length) ins[ins.length - 1].focus();
        };
        $('fpName').oninput = function () { famName = this.value; };
        $('fpUndo').onclick = function () { famEdit = null; famName = null; renderFamCfg(); };
        $('fpSave').onclick = function () {
            var list = famEdit.filter(function (p) { return p.name.trim(); });
            act({ action: 'saveFamilyPeople', people: list, familyName: $('fpName').value.trim() }, 'Family saved').then(function () { famEdit = null; famName = null; render(); }, function () {});
        };
    }
    /** Rewards: the reward system, a part at a time from the menu on the left. */
    /** solo: just the Reminders part, as its own page (the Reminders tab under Apps on the computer). */
    function renderRewards(sub, solo) {
        var s = DATA.state, pp = pointsPage();
        var nT = (DATA.tasks || []).length, nD = (DATA.todos || []).length, nR = (DATA.timetable || []).length;
        if (!DESK && !sub) sub = 'adjust';      // on the phone, open on the children's cards
        var cur = solo ? 'timetable' : sidePane('rewards', [['info', 'ℹ️', 'How rewards work'],
            ['-', 'Set up'], ['tasks', '✅', 'Tasks', 'Set up points-earning tasks'], ['todos', '☀️', 'Daily to-dos', 'Set up daily or weekly checklists'],
            ['timetable', '🎒', 'Reminders', 'e.g. PE kit, library books'], ['rules', '⚖️', 'Reward rules', 'Set up the main reward rules'],
            ['-', 'The children'], ['adjust', '✏️', 'Manual adjustments', 'Points by hand, statements']], sub === 'cards' ? 'adjust' : sub);
        title(solo ? 'Reminders' : 'Rewards');
        if (!s) { $('body').innerHTML = '<div class="empty">Loading…</div>'; return; }
        var flat = function (k) { return listFold(k).replace('<details class="card fold"', '<div class="card"').replace(/<summary>[\s\S]*?<\/summary>/, '').replace(/<\/details>$/, '</div>'); };
        var head = function (t, what) { return (solo ? '' : '<h2 class="pane-h">' + t + '</h2>') + (what ? '<p class="mute pane-what">' + what + '</p>' : ''); };
        var html = '';
        if (cur === 'info') html = explain('How rewards work',
                '<p>The reward system lets the children earn points and cash them in. Who takes part is ticked in <a href="#" data-go="famcfg">Family</a>; each of them has a card you can put on any screen (in <b>Screens</b>).</p>' +
                '<ul class="small"><li><b>Tasks</b> – jobs that earn points, e.g. “Empty the dishwasher +20”. Each child sees their next three on their card and taps one when it’s done.</li>' +
                '<li><b>Daily to-dos</b> – checklists with no points: daily ones for getting ready (teeth, dressed, bag), which start afresh each morning, and weekly ones (TTRS, drums practice) that reset on a day you choose.</li>' +
                '<li><b>Reminders</b> – things to remember on a day, e.g. “PE kit” on Fridays. Shown on the child’s card on the day, and from the evening before (5 pm, or the time you set on the Reminders page). The <b>Reminders</b> widget shows every child’s together.</li>' +
                '<li><b>Reward rules</b> – how many points make a cash-in, what that’s worth, and the penalty buttons.</li>' +
                '<li><b>Manual adjustments</b> – add or take away points, override a balance, see a statement.</li></ul>');
        else if (cur === 'tasks') {
            var tasks = (DATA.tasks || []).slice().sort(function (a, b) { return (+a.Order || 999) - (+b.Order || 999); });
            html = head('Tasks', 'Jobs that earn points. Each child sees their next three open tasks on their card, lowest order first; “Repeat” is how often a task comes back once it’s done.') +
                '<div class="card" id="fTasks">' + (tasks.length ? tasks.map(function (t) {
                    return '<div class="trow' + (t.Active ? '' : ' paused') + '"><div class="tmain"><b>' + esc(t.Task) + '</b><span class="mute">' + esc(t.Boy || 'All') + ' · ' +
                        esc(t.Repeat || 'once') + (t.Active ? '' : ' · paused') + '</span></div><b class="pos">+' + esc(t.Points) + '</b>' +
                        '<button class="btn ghost sm" data-edit="' + esc(t.ID) + '">Edit</button></div>';
                }).join('') : '<div class="empty">No tasks yet</div>') + '<button class="btn ghost fp-add" id="newTask">+ New task</button></div>';
        } else if (cur === 'todos') html = head('Daily to-dos', 'Checklists each child ticks off – no points. <b>Daily</b> ones (teeth, school bag) start afresh each morning, on the days you pick. <b>Weekly</b> ones (TTRS, Numbots, drums practice) stay ticked until they reset on the day you pick. The arrows put them in order (the order they show on the card).') + flat('todos');
        else if (cur === 'timetable') html = head('Reminders', 'Things to remember on a day – shown on the child’s card on the day, and from the evening before (5 pm unless you change it below). Each one is either every week on the days you pick, or on one date.') + flat('timetable');
        else if (cur === 'rules') html = head('Reward rules', 'How many points make a cash-in, what it’s worth, and the penalty buttons on each child’s card.') +
            '<div class="card" id="rulesBox">' + (pp ? fields(pageTypeOf('boys').settings.filter(function (f) { return f.k !== 'PenaltyOptions' && f.k !== 'TomorrowFrom'; }), pp.settings || {}) : '') +
                '<label>Penalty buttons</label><p class="mute small">The buttons on each child’s card for taking points away – up to four.</p><div class="pens-ed" id="pensEd"></div>' +
                '<input type="hidden" data-f="PenaltyOptions" id="pensVal" value="' + esc(((pp || {}).settings || {}).PenaltyOptions || '10,20,50') + '">' +
                '<button class="btn wide" id="rulesSave">Save the rules</button></div>';
        else html = head('Manual adjustments', 'Put a child’s points right by hand – it goes on their statement. Below, each child’s card as it shows on the dashboard (you can tick things off and give points there too).') +
            '<div class="card">' + s.boys.map(function (b, bi) {
                return '<div class="adj-row"><span class="dot" style="background:' + esc(b.colour) + '"></span><b>' + esc(b.name) + '</b><span class="adj-bal">' + b.balance + ' points</span>' +
                    '<button class="btn ghost sm" data-bonus="' + bi + '">Add or take away points</button><button class="btn ghost sm" data-setbal="' + bi + '">Override the balance</button><button class="btn ghost sm" data-stmt="' + bi + '">See statement</button></div>';
            }).join('') + '</div><h3 class="sec">As on the dashboard</h3><div class="boys-row">' + boysCards() + '</div>';
        $('body').innerHTML = html;
        $('body').onclick = function (e) {
            var el = e.target.closest('[data-setbal]');
            if (el) { balanceSheet(s.boys[+el.getAttribute('data-setbal')]); return; }
            if (e.target.closest('#f_todos, #f_timetable')) return;
            pointsClick(e);
        };
        if ($('newTask')) $('newTask').onclick = function () { taskSheet(null); };
        if (cur === 'todos' || cur === 'timetable') wireListFold(cur);
        if ($('pensEd')) {      // penalty buttons: add and remove, no commas
            var drawPens = function () {
                var list = $('pensVal').value.split(',').map(function (x) { return Math.abs(parseInt(x, 10)); }).filter(function (n) { return n > 0; });
                $('pensEd').innerHTML = list.map(function (n, i) { return '<span class="pen-chip">−' + n + '<button data-pdel="' + i + '" title="Remove">✕</button></span>'; }).join('') +
                    (list.length < 4 ? '<span class="pen-add"><input id="penNew" type="number" min="1" max="500" placeholder="e.g. 30"><button class="btn ghost sm" id="penAdd">+ Add</button></span>' : '');
                $('pensEd').onclick = function (e) {
                    var d = e.target.closest('[data-pdel]');
                    if (d) { list.splice(+d.getAttribute('data-pdel'), 1); $('pensVal').value = list.join(','); drawPens(); }
                    if (e.target.closest('#penAdd')) { var n = Math.abs(parseInt($('penNew').value, 10)); if (!n) return; list.push(n); list.sort(function (a, b) { return a - b; }); $('pensVal').value = list.join(','); drawPens(); }
                };
            };
            drawPens();
        }
        if ($('rulesSave')) $('rulesSave').onclick = function () {
            var vals = {}; Array.prototype.forEach.call($('rulesBox').querySelectorAll('[data-f]'), function (i) { vals[i.getAttribute('data-f')] = i.type === 'checkbox' ? i.checked : i.value.trim(); });
            act({ action: 'savePage', page: { id: pp.id, settings: vals } }, 'Saved – the screen updates within a minute');
        };
    }
    function balanceSheet(b) {
        sheet('<h2>Set ' + esc(b.name) + '’s balance</h2><p class="mute">Now ' + b.balance + ' points. The change goes on their statement as an adjustment.</p>' +
            '<label>New balance</label><input id="nbPts" type="number" inputmode="numeric" value="' + b.balance + '">' +
            '<div class="sheet-actions"><button class="btn ghost" id="nbCancel">Cancel</button><button class="btn good" id="nbSave">Save</button></div>');
        $('nbCancel').onclick = closeSheet;
        $('nbSave').onclick = function () {
            var n = Math.round(Number($('nbPts').value)), d = n - b.balance;
            if (isNaN(n) || n < 0) { FD.toast('Enter a balance of 0 or more', true); return; }
            closeSheet(); if (!d) return;
            act({ action: 'adjust', boy: b.name, points: d, reason: 'Balance set to ' + n }, b.name + ': ' + n + ' points', true);
        };
    }
    /**
     * A page with a menu down the left (Rewards, Advanced): the first item tells you about the page; clicking an item
     * opens it on the right. The right-hand side becomes "body" while it's showing, so each section draws as usual.
     */
    function sidePane(tab, items, sub) {
        var real = items.filter(function (i) { return i[0] !== '-'; }), cur = real.some(function (i) { return i[0] === sub; }) ? sub : real[0][0];
        var outer = $('body');
        outer.innerHTML = '<div class="pane"><nav class="pane-nav">' + items.map(function (i) {
            return i[0] === '-' ? '<div class="pn-h">' + esc(i[1]) + '</div>' : '<a class="pn' + (i[0] === cur ? ' on' : '') + '" href="#/' + tab + '/' + i[0] + '"><span class="pn-i">' + i[1] + '</span><span class="pn-t"><b>' + esc(i[2]) + '</b>' + (i[3] ? '<small>' + esc(i[3]) + '</small>' : '') + '</span></a>';
        }).join('') + '</nav><div class="pane-body" id="paneIn"></div></div>';
        outer.id = 'bodyOuter'; $('paneIn').id = 'body';
        if (!DESK) { var on = outer.querySelector('.pn.on'); if (on && on.scrollIntoView) setTimeout(function () { on.scrollIntoView({ inline: 'center', block: 'nearest' }); }, 0); }      // the phone's button row
        return cur;
    }
    /** Advanced: the settings that aren't screens, family or rewards – in a menu down the left. */
    function renderAdvanced(sub) {
        var line = function (k) { try { return sectionLine(k); } catch (e) { return ''; } };
        var items = [['info', 'ℹ️', 'About these settings'],
            ['-', 'Settings'], ['places', '📍', 'Locations & home', line('places')], ['keys', '🔑', 'External data (API) keys', line('keys')], ['screen', '🌙', 'Screen & sleep'], ['licence', '🎫', 'Software Licence'], ['updates', '⟳', 'Software updates'],
            ['-', 'My data'], ['mydata', '🗂️', 'My data (Google)'],
            ['-', 'My devices'], ['devices', '📱', 'Devices and Phones'],
            ['-', 'System'], ['support', '🩺', 'About & diagnostics']];
        if (sub === 'system') sub = 'screen';
        var cur = sidePane('advanced', items, sub);
        if (cur !== 'info') { renderSection(cur); return; }
        title('Advanced');
        $('body').innerHTML = explain('About these settings',
            '<p>The settings you’ll rarely need – everything that isn’t the screens, the family or rewards. Pick one on the left.</p>' +
            '<ul class="small"><li><b>Locations &amp; home</b> – your home address, and the places widgets use (stations, routes, schools…).</li>' +
            '<li><b>External data (API) keys</b> – free keys some widgets need for live data: traffic, trains, buses, NASA, Spotify.</li>' +
            '<li><b>Screen &amp; sleep</b> – when the screen dims and sleeps at night.</li><li><b>Licence</b> – your licence key.</li><li><b>Software updates</b> – the version of the application held within Google (Google script), and automatic updates.</li>' +
            '<li><b>My data</b> – your family’s information lives in a Google Sheet in your own Google account: your access code, starting afresh, moving to another account.</li>' +
            '<li><b>Devices</b> – the screens, tablets, phones and computers connected to your dashboard, and connecting another.</li>' +
            '<li><b>About &amp; diagnostics</b> – every version number, what’s new, and a report to send if something goes wrong.</li></ul>') +
            '<p class="mute small">Family Dashboard Configurator · application held within Google (Google script) ' + esc(DATA.scriptVersion || '?') + '</p>';
    }
    function renderHelp() {
        title('Help');
        $('body').innerHTML = '<div class="frame-bar"><a class="link" href="' + esc(helpUrl()) + '" target="_blank" rel="noopener">Open in a new tab ↗</a></div><iframe class="desk-frame" src="' + esc(helpUrl()) + '" title="Help"></iframe>';
    }
    /** Feedback, a feature request or a support request – sent to Family Dashboard support (through the family's own
     * Google script, which adds the licence key and installation number). Below: what you've sent and where it's up to. */
    var FB_KINDS = [['Support request', '🛠', 'Something isn’t working'], ['Feature request', '💡', 'An idea for something new'], ['Feedback', '💬', 'Tell us what you think']];
    function renderFeedback(sub) {
        title('Feedback and support');
        var kind = sub === 'support' ? 'Support request' : sub === 'idea' ? 'Feature request' : sub === 'feedback' ? 'Feedback' : (renderFeedback.kind || 'Support request');
        renderFeedback.kind = kind;
        $('body').innerHTML = '<div class="fb-wrap">' + card('Send something to Family Dashboard support',
            '<div class="fb-kinds">' + FB_KINDS.map(function (k) { return '<button type="button" class="fb-kind' + (k[0] === kind ? ' on' : '') + '" data-kind="' + k[0] + '"><span>' + k[1] + '</span><b>' + k[0] + '</b><small>' + k[2] + '</small></button>'; }).join('') + '</div>' +
            '<label for="fbSubj">Subject</label><input id="fbSubj" maxlength="120" placeholder="' + (kind === 'Support request' ? 'e.g. The traffic widget says it can’t find my route' : kind === 'Feature request' ? 'e.g. A widget for the tide times' : 'In a few words') + '">' +
            '<label for="fbMsg">' + (kind === 'Support request' ? 'What’s happening – and what you expected' : 'Tell us more') + '</label><textarea id="fbMsg" rows="6" maxlength="8000"></textarea>' +
            '<label for="fbMail">Your email <span class="mute small">(optional – so support can reply by email; replies also show below)</span></label><input id="fbMail" type="email" maxlength="120" autocomplete="email">' +
            (kind === 'Support request' ? '<label class="tog"><input type="checkbox" id="fbDiag" checked><span>Attach a diagnostics report (recommended) – it shows support exactly what’s going on. Your access code, keys, addresses and names in it are locked so only support can read them.</span></label>' : '') +
            '<button class="btn good wide" id="fbSend">Send</button><div id="fbOut"></div>') +
            card('What you’ve sent', '<div id="fbMine" class="mute">Looking…</div>') + '</div>';
        $('body').querySelector('.fb-kinds').onclick = function (e) { var b = e.target.closest('[data-kind]'); if (!b) return; renderFeedback.kind = b.getAttribute('data-kind'); renderFeedback(''); };
        $('fbSend').onclick = function () {
            var b = this, subj = $('fbSubj').value.trim(), msg = $('fbMsg').value.trim(), mail = $('fbMail').value.trim(), diag = $('fbDiag') && $('fbDiag').checked;
            if (!subj && !msg) { FD.toast('Write something first', true); return; }
            if (mail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) { FD.toast('That email address doesn’t look right', true); return; }
            b.disabled = true; b.textContent = diag ? '⏳ Making the diagnostics report… (up to a minute)' : '⏳ Sending…';
            (diag ? FD.get('diagnostics', { app: FD.VERSION }, 240000).then(buildReport) : Promise.resolve('')).then(function (report) {
                b.textContent = '⏳ Sending…';
                return FD.post({ action: 'feedback', type: kind, subject: subj, message: msg, email: mail, report: report });
            }).then(function (d) {
                $('fbOut').innerHTML = '<p class="pos"><b>✔ Sent – thank you.</b> Your reference is <b>' + esc(d.ref) + '</b>. Replies show below.</p>';
                $('fbSubj').value = ''; $('fbMsg').value = ''; b.disabled = false; b.textContent = 'Send another';
                fbMine();
            }, function (e) { b.disabled = false; b.textContent = 'Send'; $('fbOut').innerHTML = '<p class="bad">Couldn’t send it: ' + esc(e.message) + '</p>'; });
        };
        fbMine();
    }
    function fbMine() {
        FD.post({ action: 'myFeedback' }).then(function (d) {
            if (!$('fbMine')) return;
            $('fbMine').classList.remove('mute');
            $('fbMine').innerHTML = (d.rows || []).length ? d.rows.map(function (r) {
                var done = r.status === 'Resolved' || r.status === 'Closed';
                return '<div class="fb-row"><div class="fb-rh"><b>' + esc(r.subject || r.type) + '</b><span class="fb-st' + (done ? ' done' : '') + '">' + esc(r.status) + '</span></div>' +
                    '<div class="mute small">' + esc(r.type) + ' · ' + esc(r.ref) + ' · sent ' + esc(r.date) + (r.updated && r.updated !== r.date ? ' · updated ' + esc(r.updated) : '') + '</div>' +
                    (r.reply ? '<div class="fb-reply"><b>Support replied:</b> ' + esc(r.reply) + '</div>' : '') + '</div>';
            }).join('') : '<p class="mute">Nothing yet.</p>';
        }, function (e) { if ($('fbMine')) $('fbMine').textContent = 'Couldn’t check just now (' + e.message + ').'; });
    }
    /** The calendar app, on the computer – with a switch between calendar pages when there's more than one. */
    function renderCalApp() {
        title('Calendar');
        var cps = (DATA.pages || []).filter(function (p) { return p.type === 'calendar'; }), cur = '';
        try { cur = localStorage.getItem('fdadmin.calPage') || ''; } catch (e) { /* fine */ }
        if (!cps.some(function (p) { return p.id === cur; })) cur = cps.length ? cps[0].id : '';
        var src = appsRoot() + 'calendar/' + (cur ? '?page=' + encodeURIComponent(cur) : '');
        $('body').innerHTML = '<div class="frame-bar">' + (cps.length > 1 ? '<div class="chips" id="calPick">' + cps.map(function (p) { return '<button class="chip' + (p.id === cur ? ' on' : '') + '" data-cp="' + esc(p.id) + '">' + esc(p.title) + '</button>'; }).join('') + '</div>' : '<span></span>') +
            '<a class="link" href="' + esc(src) + '" target="_blank" rel="noopener">Open in a new tab ↗</a></div><iframe class="desk-frame" src="' + esc(src) + '" title="Calendar"></iframe>';
        if ($('calPick')) $('calPick').onclick = function (e) { var b = e.target.closest('[data-cp]'); if (!b) return; try { localStorage.setItem('fdadmin.calPage', b.getAttribute('data-cp')); } catch (x) { /* fine */ } render(); };
    }
    /** On the phone: a page that's on the computer website instead. */
    function renderOnComputer(what) {
        title(what);
        $('body').innerHTML = card('💻 This is on the computer', '<p><b>' + esc(what) + '</b> is on the <b>Family Dashboard Configurator</b>, the website for computers. On a computer, open:</p>' +
            '<div class="desk-addr">' + esc(deskShort()) + '</div>' +
            '<p class="mute small">The first time, it shows a code: type it on this phone in <b>More → Devices and Phones → Connect by code</b>, or open it on the computer you used for setup.</p>' +
            '<button class="btn ghost wide" id="deskCopy">Copy the address</button>');
        $('deskCopy').onclick = function () { (navigator.clipboard ? navigator.clipboard.writeText(deskUrl()) : Promise.reject()).then(function () { FD.toast('Copied'); }, function () { prompt('Copy this address:', deskUrl()); }); };
    }
    function deskCard() {
        return card('💻 Everything else is on the Configurator', '<p class="small">The Setup wizard, which widgets go on which screen, the family, the calendar’s categories, locations, data keys and your Google data are on the <b>Family Dashboard Configurator</b>, on a computer:</p>' +
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
    /** Points are in use: a child widget on a screen (or, on an older layout, the points page showing). */
    function pointsOn() { var pp = pointsPage(); return (DATA.widgets || []).some(function (w) { return w.type === 'child'; }) || !!(pp && pp.show !== false); }
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
        // Calendar (the calendar app – a new tab on the computer), today & tomorrow, where is everyone, and reconfiguring the family.
        var cal = appsRoot() + 'calendar/';
        var fam = distinct(function (w) { return FAMILY_W[w.type]; });
        var nTasks = (DATA.tasks || []).length, nTodos = (DATA.todos || []).length, nRem = (DATA.timetable || []).length, S = DATA.state;
        $('body').innerHTML = '<h3 class="sec">Family links and apps</h3><div class="tiles fam-tiles">' +
            '<a class="tile" href="' + esc(cal) + '"' + (DESK ? ' target="_blank" rel="noopener"' : '') + '><span class="t-ico">📅</span><b>Family Calendar</b><small>' + (DESK ? 'Opens in a new tab' : 'Opens the calendar app') + ' – see and add events</small></a>' +
            fam.map(function (w) { return tile('w/' + w.id, esc(typeOf(w.type).icon), widgetName(w), w.type === 'whereabouts' ? esc(everydayLine(w)) : glanceLine(w)); }).join('') +
            (DESK ? '<a class="tile" href="' + esc(setupLink('family')) + '"><span class="t-ico">👪</span><b>Reconfigure the family</b><small>Who’s in the family, who has points, calendar groups and colours</small></a>' : '') + '</div>' +
            (pp && pointsOn() ? '<h3 class="sec">Set up rewards – tasks, to-dos and reminders</h3><div class="tiles fam-tiles">' +
                tile('points/tasks', '✅', 'Set up tasks', nTasks + ' task' + (nTasks === 1 ? '' : 's') + ' – what earns points') +
                tile('points/todos', '☀️', 'Set up daily to-dos', nTodos + ' – daily or weekly checklists') +
                tile('points/timetable', '🎒', 'Set up reminders', nRem + ' – PE kit, library books…') +
                '<button class="tile" id="ptsRules"><span class="t-ico">⚖️</span><b>Set up reward rules</b><small>' + (S ? S.cashIn.points + ' points = £' + S.cashIn.value + ' · penalties ' + esc(S.penalties.join(', ')) : 'Cash-in and penalties') + '</small></button></div>' +
                '<h3 class="sec">Each child as they’ll show on the dashboard</h3><div class="boys-row">' + boysCards() + '</div>' : '') +
            (DESK ? '' : '<div class="link-card"><b>👪 Reconfigure the family</b><span class="mute small">Who’s in the family, who has points, calendar groups and colours – on <b>Setup</b>, on a computer: ' + esc(deskShort()) + ' → Reconfigure → Family &amp; calendar.</span></div>');
        if (pp && pointsOn()) $('body').onclick = pointsClick;
        if ($('ptsRules')) $('ptsRules').onclick = function (e) { e.stopPropagation(); rulesSheet(); };
        fetchGlance();
    }
    function renderOther() {
        title(DESK ? 'Other widgets' : 'Apps');
        // Every widget on the screens (hidden ones too), then every kind that isn't on any screen – its settings can still be changed.
        var fi = function (w) { return INFO_W[w.type]; }, fr = function (w) { return tabFor(w.type) === 'other' && !INFO_W[w.type] && w.type !== 'child'; };   // children: on the Family tab
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
        if (!s || !s.boys.length) return card('Nobody takes part in rewards yet', '<p class="mute">Tick ⭐ Rewards for the children in Family.</p><button class="btn wide" data-go="s/family">Family & calendar</button>');
        var target = s.cashIn.points;
        return s.boys.map(function (b, i) {
            var pct = Math.min(100, b.balance / target * 100), can = b.balance >= target;
            return '<section class="card boy" style="--c:' + esc(b.colour) + '">' +
                '<div class="boy-top"><h2>' + esc(b.name) + '</h2></div>' + reminders(b) +
                '<div class="score"><b>' + b.balance + '</b><span>points</span><span class="to">' + (can ? 'Ready to cash in!' : (target - b.balance) + ' to £' + s.cashIn.value) + '</span></div>' +
                '<div class="bar"><span style="width:' + pct + '%"></span></div>' +
                '<div class="row-btns">' + s.penalties.map(function (p) { return '<button class="pen" data-pen="' + i + ':' + p + '">−' + p + '</button>'; }).join('') +
                    '<button class="bonus" data-bonus="' + i + '">+ Bonus</button></div>' +
                '<button class="btn wide cash' + (can ? '' : ' off') + '" data-cash="' + i + '"' + (can ? '' : ' disabled') + '>Cash in ' + target + ' for £' + s.cashIn.value + '</button>' +
                '<details class="boy-more"' + (openBoys[b.name] || (DESK && openBoys[b.name] !== false) ? ' open' : '') + ' data-boy="' + esc(b.name) + '"><summary>Tasks ' + (b.allTasks || b.tasks).length + ' · this morning ' + b.todos.filter(function (t) { return t.done; }).length + '/' + b.todos.length + ' · statement</summary>' +
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
    /** Setting up one part of the children's points (from the Family tab): tasks, morning to-dos or reminders. */
    function renderPointsSetup() {
        var s = DATA.state, sec = route().sec || 'tasks';
        var names = { tasks: 'Set up tasks', todos: 'Set up daily to-dos', timetable: 'Set up reminders' };
        title(names[sec] || 'Set up tasks');
        if (!s) { $('body').innerHTML = '<div class="empty">Loading…</div>'; return; }
        var tasks = (DATA.tasks || []).slice().sort(function (a, b) { return (+a.Order || 999) - (+b.Order || 999); });
        var other = Object.keys(names).filter(function (k) { return k !== sec; }).map(function (k) { return '<button class="chip" data-go="points/' + k + '">' + names[k] + '</button>'; }).join('') +
            '<button class="chip" id="rules">Set up reward rules</button>';
        var body = sec === 'tasks' ? '<details class="card fold" id="fTasks" open><summary><b>Tasks</b><span class="mute">' + tasks.length + ' · what earns points</span></summary>' +
                '<button class="btn wide top-btn" id="newTask">+ New task</button>' + (tasks.length ? tasks.map(function (t) {
                    return '<div class="trow' + (t.Active ? '' : ' paused') + '"><div class="tmain"><b>' + esc(t.Task) + '</b><span class="mute">' + esc(t.Boy || 'All') + ' · ' +
                        esc(t.Repeat || 'once') + (t.Active ? '' : ' · paused') + '</span></div><b class="pos">+' + esc(t.Points) + '</b>' +
                        '<button class="btn ghost sm" data-edit="' + esc(t.ID) + '">Edit</button></div>';
                }).join('') : '<div class="empty">No tasks yet</div>') + '<p class="mute small">Each child sees their next three open tasks on the screen, lowest order first.</p></details>'
            : listFold(sec).replace('<details class="card fold"', '<details class="card fold" open');
        $('body').innerHTML = body + '<div class="chips pts-more">' + other + '</div>';
        $('body').onclick = pointsClick;
        if ($('newTask')) $('newTask').onclick = function () { taskSheet(null); };
        $('rules').onclick = rulesSheet;
        if (sec !== 'tasks') wireListFold(sec);
    }
    /** Picking a Google calendar from the ones the family's Google account can see. */
    function calPick(label, attr, cur, family) {
        var list = ((DATA.calSetup || {}).calendars || []), o = [];
        if (family) o.push(['', 'The family’s calendar (as on the main calendar page)']);
        o.push(['default', 'Your main Google calendar' + (list.filter(function (c) { return c.main; }).map(function (c) { return ' (' + c.name + ')'; })[0] || '')]);
        list.filter(function (c) { return !c.main; }).forEach(function (c) { o.push([c.id, c.name]); });
        o.push(['all', 'Every calendar you can see']);
        if (cur && !o.some(function (x) { return x[0] === cur; })) o.push([cur, cur]);
        return '<label>' + esc(label) + '</label><select ' + attr + '>' + o.map(function (x) { return '<option value="' + esc(x[0]) + '"' + (x[0] === cur ? ' selected' : '') + '>' + esc(x[1]) + '</option>'; }).join('') + '</select>';
    }
    /** The points rules: points for a cash-in, what it's worth, the penalty buttons. */
    function rulesSheet() {
        var pp = pointsPage(); if (!pp) return;
        sheet('<h2>Reward rules</h2><p class="mute small">How many points make a cash-in, what it’s worth, and the penalty buttons on each child’s card.</p>' + fields(pageTypeOf('boys').settings.filter(function (f) { return f.k !== 'TomorrowFrom'; }), pp.settings || {}) +
            '<div class="sheet-actions"><button class="btn ghost" id="rCancel">Cancel</button><button class="btn good" id="rSave">Save</button></div>');
        $('rCancel').onclick = closeSheet;
        $('rSave').onclick = function () { act({ action: 'savePage', page: { id: pp.id, settings: readFields() } }, 'Saved – the screen updates within a minute').then(closeSheet, function () {}); };
    }
    var LISTS = {
        todos: { title: 'Daily to-dos', what: 'daily or weekly checklists', help: 'Pick who it’s for, and daily (on which days) or weekly (which day it resets). Use the arrows to put them in order.',
            cols: [['Item', 'To-do'], ['Boy', 'For who'], ['Days', 'How often']], ordered: true },
        timetable: { title: 'Reminders', what: 'shown on the day and the evening before', help: 'Shown on each child’s card on the day, and from the evening before (5pm, or the time set below) – every week on some days, or on one date.',
            cols: [['Reminder', 'Reminder'], ['Boy', 'For who'], ['Day', 'When']] },
    };
    function listFold(k) {
        var cfg = LISTS[k], rs = (DATA[k] || []).slice();
        if (cfg.ordered) rs.sort(function (a, b) { return (+a.Order || 999) - (+b.Order || 999); });
        if (!rs.length) rs.push({});
        return '<details class="card fold" id="f_' + k + '"><summary><b>' + cfg.title + '</b><span class="mute">' + (DATA[k] || []).length + ' · ' + cfg.what + '</span></summary>' +
            (DESK ? '' : '<p class="mute small help">' + esc(cfg.help) + '</p>') +
            (DESK ? '<div class="lhead l-' + k + '">' + (cfg.ordered ? '<span></span>' : '') + cfg.cols.map(function (c) { var n = maxFor(k, c[0]); return '<span>' + esc(c[1]) + (n ? ' <small>max ' + n + '</small>' : '') + '</span>'; }).join('') + '</div>' : '') +
            '<div class="lrows" id="rows_' + k + '">' + rs.map(function (r) { return rowCard(k, r); }).join('') + '</div>' +
            (k === 'timetable' ? '<div class="ladd-row"><button class="btn ghost" data-ladd="' + k + '">+ Add</button><button class="btn ghost" data-lclear title="Deletes every reminder whose date has passed. Weekly ones are kept.">🧹 Clear expired reminders</button></div>' + remFromRow()
                : '<button class="btn ghost wide" data-ladd="' + k + '">+ Add</button>') +
            '<button class="btn wide" data-lsave="' + k + '">Save ' + cfg.title.toLowerCase() + '</button></details>';
    }
    /** When the screen switches from today's reminders to tomorrow's (a Rewards setting, set with the reminders). */
    function remFrom() { var pp = pointsPage(); return String(((pp && pp.settings) || {}).TomorrowFrom || '17:00'); }
    function remFromRow() {
        return '<div class="rem-from"><label for="remFrom">Switch to tomorrow’s reminders at</label><input type="time" id="remFrom" value="' + esc(remFrom()) + '">' +
            '<p class="mute small">Until this time the screen shows today’s reminders (with a preview of tomorrow); from this time, tomorrow’s – so school things can be got ready the evening before.</p></div>';
    }
    function wireListFold(k) {
        var box = $('f_' + k);
        box.onchange = function (e) {
            var t = e.target, o = t.closest('.opick');
            if (o) {
                var weekly = o.querySelector('.op-mode').value === 'weekly';
                o.querySelector('.op-daily').hidden = weekly; o.querySelector('.op-weekly').hidden = !weekly;
                o.querySelector('.op-val').value = weekly ? 'Weekly ' + o.querySelector('.op-reset').value : o.querySelector('.op-daily input[type=hidden]').value;
                return;
            }
            var w = t.closest('.rpick'); if (!w) return;
            if (t.classList.contains('rp-mode')) { w.querySelector('.dpick').hidden = t.value !== 'week'; w.querySelector('.rp-date').hidden = t.value !== 'date';
                w.querySelector('.rp-val').value = t.value === 'week' ? w.querySelector('.dpick input[type=hidden]').value : dmy(w.querySelector('.rp-dt').value); }
            if (t.classList.contains('rp-dt')) { w.querySelector('.rp-val').value = dmy(t.value); w.querySelector('.rp-say').innerHTML = esc(longDate(t.value) || 'Pick a date') + ' <i>📅</i>'; }
        };
        box.addEventListener('click', function (e) {      // a day button inside a reminder: that's the reminder's value too
            var d = e.target.closest('.rpick .dp-day, .opick .dp-day'); if (!d) return;
            var w = d.closest('.rpick, .opick'); setTimeout(function () { (w.querySelector('.rp-val') || w.querySelector('.op-val')).value = w.querySelector('.dpick input[type=hidden]').value; }, 0);
        }, true);
        box.onclick = function (e) {
            e.stopPropagation();
            var el;
            if ((el = e.target.closest('[data-x]'))) el.closest('.lrow').remove();
            else if ((el = e.target.closest('[data-mv]'))) {      // ▲ ▼: the order on the card is the order in the list
                var row = el.closest('.lrow'), up = el.getAttribute('data-mv') === 'up', sib = up ? row.previousElementSibling : row.nextElementSibling;
                if (sib) row.parentNode.insertBefore(row, up ? sib : sib.nextSibling);
            }
            else if ((el = e.target.closest('.dp-day'))) {
                el.classList.toggle('on');
                var dp = el.closest('.dpick'), on = Array.prototype.map.call(dp.querySelectorAll('.dp-day'), function (b) { return b.classList.contains('on'); });
                dp.querySelector('input[type=hidden]').value = formatDays(on);
                dp.querySelector('.dp-say').textContent = daysSay(on);
            }
            else if (e.target.closest('[data-ladd]')) $('rows_' + k).insertAdjacentHTML('beforeend', rowCard(k, {}));
            else if (e.target.closest('[data-lclear]')) {      // one-date reminders whose date has gone (weekly ones never expire)
                var d0 = new Date(), today = d0.getFullYear() * 1e4 + (d0.getMonth() + 1) * 100 + d0.getDate();
                var old = Array.prototype.filter.call(box.querySelectorAll('.lrow'), function (r) {
                    var m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(((r.querySelector('.rp-val') || {}).value || '').trim());
                    return m && +m[3] * 1e4 + +m[2] * 100 + +m[1] < today;
                });
                if (!old.length) { FD.toast('No reminders have expired – nothing to clear'); return; }
                var names = old.map(function (r) { var i = r.querySelector('[data-k=Reminder]'); return i && i.value.trim() || 'a reminder'; });
                if (!confirm('Delete ' + (old.length === 1 ? 'this reminder, whose date has passed' : 'these ' + old.length + ' reminders, whose dates have passed') + '?\n\n• ' + names.join('\n• '))) return;
                old.forEach(function (r) { r.remove(); });
                if (!box.querySelector('.lrow')) $('rows_' + k).insertAdjacentHTML('beforeend', rowCard(k, {}));
                box.querySelector('[data-lsave]').click();
            }
            else if (e.target.closest('[data-lsave]')) {
                var out = Array.prototype.map.call(box.querySelectorAll('.lrow'), function (r, i) {
                    var o = {}; r.querySelectorAll('[data-k]').forEach(function (inp) { o[inp.getAttribute('data-k')] = inp.value.trim(); });
                    if (LISTS[k].ordered) o.Order = i + 1;
                    return o;
                });
                var rf = $('remFrom'), pp = pointsPage();
                if (k === 'timetable' && rf && pp && rf.value && rf.value !== remFrom()) {
                    act({ action: 'savePage', page: { id: pp.id, settings: { TomorrowFrom: rf.value } } });
                    (pp.settings = pp.settings || {}).TomorrowFrom = rf.value; if (DATA.state) DATA.state.remindersFrom = rf.value;
                }
                act({ action: 'saveList', list: k, rows: out }, 'Saved').then(function () { var f = $('f_' + k); if (f) f.open = true; }, function () {});
            }
        };
    }
    function maxFor(list, col) {
        var m = { todos: { Item: L().todo }, timetable: { Reminder: L().reminder } }[list];
        return m && m[col];
    }
    function rowCard(k, r) {
        return '<div class="lrow l-' + k + '"><button class="x" data-x>✕</button>' + (LISTS[k].ordered ? '<span class="mv"><button data-mv="up" title="Move up">▲</button><button data-mv="down" title="Move down">▼</button></span>' : '') +
            LISTS[k].cols.map(function (c) {
                var n = maxFor(k, c[0]), v = r[c[0]] == null ? '' : String(r[c[0]]), lab = '<label>' + esc(c[1]) + (n ? ' <span class="cnt">max ' + n + '</span>' : '') + '</label>';
                if (c[0] === 'Boy') return '<div class="lc">' + lab + forWho(v) + '</div>';
                if (c[0] === 'Days') return '<div class="lc">' + lab + oftenPick(v || 'Mon-Fri') + '</div>';
                if (c[0] === 'Day') return '<div class="lc">' + lab + whenPick(v) + '</div>';
                return '<div class="lc">' + lab + '<input data-k="' + c[0] + '" value="' + esc(v) + '"' + (n ? ' maxlength="' + n + '"' : '') + ' autocomplete="off"></div>';
            }).join('') + '</div>';
    }
    /** For who: everyone in rewards, or one of them. */
    function forWho(v) {
        var kids = ((DATA.state || {}).boys || []).map(function (b) { return b.name; }), o = [['All', 'Everyone (in rewards)']].concat(kids.map(function (n) { return [n, n]; }));
        if (v && !o.some(function (x) { return x[0].toLowerCase() === v.toLowerCase(); })) o.push([v, v]);
        return '<select data-k="Boy">' + o.map(function (x) { return '<option value="' + esc(x[0]) + '"' + (x[0].toLowerCase() === (v || 'All').toLowerCase() ? ' selected' : '') + '>' + esc(x[1]) + '</option>'; }).join('') + '</select>';
    }
    var DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    function parseDays(spec) {
        var s = String(spec || '').trim().toLowerCase(), on = [0, 0, 0, 0, 0, 0, 0].map(function () { return false; });
        if (!s || s === 'all' || s === 'daily' || s === 'every day') return on.map(function () { return true; });
        if (s === 'weekdays') return on.map(function (x, i) { return i < 5; });
        if (s === 'weekends') return on.map(function (x, i) { return i > 4; });
        var idx = function (x) { return ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].indexOf(x.trim().slice(0, 3)); };
        s.split(',').forEach(function (part) {
            if (part.indexOf('-') > 0) { var a = idx(part.split('-')[0]), b = idx(part.split('-')[1]); if (a < 0 || b < 0) return; for (var i = a; ; i = (i + 1) % 7) { on[i] = true; if (i === b) break; } }
            else if (idx(part) >= 0) on[idx(part)] = true;
        });
        return on;
    }
    function formatDays(on) {
        var n = on.filter(Boolean).length;
        if (n === 7 || !n) return 'Daily';
        if (n === 2 && on[5] && on[6]) return 'Weekends';
        var first = on.indexOf(true), last = on.lastIndexOf(true);
        if (n > 2 && last - first + 1 === n) return DAYS[first] + '-' + DAYS[last];
        return DAYS.filter(function (d, i) { return on[i]; }).join(',');
    }
    function daysSay(on) {
        var f = formatDays(on);
        return f === 'Daily' ? 'every day' : f === 'Weekends' ? 'weekends' : f === 'Mon-Fri' ? 'school days (Mon–Fri)' : '';
    }
    function dayPick(key, v) {
        var on = parseDays(v);
        return '<div class="dpick">' + DAYS.map(function (d, i) { return '<button type="button" class="dp-day' + (on[i] ? ' on' : '') + '" title="' + d + '">' + d.slice(0, 2) + '</button>'; }).join('') +
            '<span class="dp-say mute small">' + esc(daysSay(on)) + '</span><input type="hidden"' + (key ? ' data-k="' + key + '"' : '') + ' value="' + esc(formatDays(on)) + '"></div>';
    }
    /** A to-do's "how often": daily on some days, or weekly – shown every day, reset on one day ("Weekly Sat"). */
    function oftenPick(v) {
        var m = String(v || '').match(/^weekly\s*(\w{3})/i), wk = !!m, rd = m ? m[1].slice(0, 1).toUpperCase() + m[1].slice(1, 3).toLowerCase() : 'Sat';
        return '<div class="opick"><select class="op-mode"><option value="daily"' + (wk ? '' : ' selected') + '>Daily, on…</option><option value="weekly"' + (wk ? ' selected' : '') + '>Weekly – resets on…</option></select>' +
            '<div class="op-daily"' + (wk ? ' hidden' : '') + '>' + dayPick('', wk ? 'Mon-Fri' : v) + '</div>' +
            '<div class="op-weekly"' + (wk ? '' : ' hidden') + '><select class="op-reset">' + DAYS.map(function (d) { return '<option' + (d === rd ? ' selected' : '') + '>' + d + '</option>'; }).join('') + '</select><span class="mute small">ticked off once a week</span></div>' +
            '<input type="hidden" class="op-val" data-k="Days" value="' + esc(wk ? 'Weekly ' + rd : formatDays(parseDays(v))) + '"></div>';
    }
    /** A reminder's "when": every week on some days, or on one date (shown as e.g. 23 December 2026). */
    function isoOf(v) {
        var s = String(v || '').trim(), m;
        if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/))) return s;
        if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})T/))) { var d = new Date(s); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
        if ((m = s.match(/^(\d{1,2})[\/.](\d{1,2})(?:[\/.](\d{2,4}))?$/))) { var y = m[3] ? (m[3].length === 2 ? '20' + m[3] : m[3]) : String(new Date().getFullYear()); return y + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2); }
        return '';
    }
    function dmy(iso) { var m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? m[3] + '/' + m[2] + '/' + m[1] : ''; }
    // A reminder's date: a button showing the date in words; pressing it opens the calendar to pick from.
    document.addEventListener('click', function (e) {
        var d = e.target.closest && e.target.closest('.rp-date'); if (!d) return;
        var inp = d.querySelector('.rp-dt'); try { if (inp.showPicker) { inp.showPicker(); e.preventDefault(); } else inp.focus(); } catch (x) { inp.focus(); }
    });
    function longDate(iso) { var m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }) : ''; }
    function whenPick(v) {
        var iso = isoOf(v), date = !!iso;
        return '<div class="rpick"><select class="rp-mode"><option value="week"' + (date ? '' : ' selected') + '>Every week on…</option><option value="date"' + (date ? ' selected' : '') + '>On a date…</option></select>' +
            '<div class="rp-week">' + dayPick('', date ? 'Fri' : v || 'Fri').replace('<div class="dpick">', '<div class="dpick"' + (date ? ' hidden' : '') + '>') + '</div>' +
            '<div class="rp-date"' + (date ? '' : ' hidden') + '><span class="rp-say">' + esc(longDate(iso) || 'Pick a date') + ' <i>📅</i></span><input type="date" class="rp-dt" value="' + esc(iso) + '" aria-label="Date"></div>' +
            '<input type="hidden" class="rp-val" data-k="Day" value="' + esc(date ? dmy(iso) : formatDays(parseDays(v || 'Fri'))) + '"></div>';
    }
    /** Today's and tomorrow's reminders; from the switch time (5pm unless set on the Reminders page) only tomorrow's. */
    function reminders(b) {
        var at = String((DATA.state && DATA.state.remindersFrom) || '17:00'), d = new Date();
        if (at.length === 4) at = '0' + at;
        var evening = ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2) >= at, tmr = b.remindersTomorrow || [];
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
        title(DESK ? 'Screens & widgets' : 'Screen layout');
        // The Setup website has the drag-and-drop editor (setup/editor.js).
        if (DESK && window.FDEditor) {
            window.FDEditor.render($('body'), { data: function () { return DATA; }, act: act, setData: setData, esc: esc, typeOf: typeOf, pageTypeOf: pageTypeOf,
                widgetSheet: function (id) { widgetSheet(widgetOf(id)); }, pageSheet: function (id) { pageSheet(pageOf(id)); }, summary: summary, toast: FD.toast,
                // A calendar page's own settings, shown under its picture in the editor.
                // The first calendar page also holds the family's calendars (Today & tomorrow, the countdown and the phone app use them too).
                pageForm: function (id) {
                    var p = pageOf(id); if (!p) return '';
                    var main = calPage() && calPage().id === id, defs = pageTypeOf(p.type).settings.filter(function (f) { return f.k === 'DefaultView' || f.k === 'AlignWeekdays'; });
                    var inst = function (k) { return ((DATA.install || []).filter(function (f) { return f.k === k; })[0] || {}).value || ''; };
                    // New events go in the same calendar (or your main one, when it shows every calendar).
                    return '<div class="ps-grid"><div class="ps-cal">' + (main ? calPick('Which Google Calendar to link to', 'data-set="CalendarIds"', inst('CalendarIds') || 'default', false)
                        : calPick('Which Google Calendar to link to', 'data-f="Calendars"', (p.settings || {}).Calendars || '', true)) + '</div>' +
                        '<div class="ps-look">' + fields(defs, p.settings || {}) + '</div></div>';
                },
                afterForm: applyWhen, familyLink: function () { return '#/famcfg'; },
                calSetup: function (el, id) { if (window.FDCalSetup) window.FDCalSetup.render(el, id, { data: function () { return DATA; }, act: act, toast: FD.toast }); },
                savePageSettings: function (id, vals, inst) {
                    if (inst && 'CalendarIds' in inst) inst.AddToCalendar = inst.CalendarIds === 'all' ? 'default' : inst.CalendarIds;
                    if ('Calendars' in vals) vals.AddTo = vals.Calendars && vals.Calendars !== 'all' ? vals.Calendars : '';
                    var p = pageOf(id); if (p) Object.keys(vals).forEach(function (k) { (p.settings = p.settings || {})[k] = vals[k]; });
                    var first = inst && Object.keys(inst).length ? act({ action: 'saveInstall', values: inst }) : Promise.resolve();
                    return first.then(function () { return act({ action: 'savePage', page: { id: id, settings: vals } }, 'Saved – the screen updates within a minute'); }); } });
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
    /** Calendar categories as tick boxes – stored as "Holiday, School holiday". */
    var MONS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    function catsField(f, v, lab, help) {
        var cs = DATA.calSetup;
        if (!cs || !cs.groups) return null;
        var have = String(v == null ? '' : v).split(',').map(function (x) { return x.trim(); }).filter(Boolean);
        var key = function (x) { return String(x).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); };
        var names = cs.generals.map(function (c) { return c.name; }).concat(cs.groups.map(function (c) { return c.name; }));
        have.forEach(function (h) { if (!names.some(function (n) { return key(n) === key(h); })) names.push(h); });
        var colour = function (n) { var c = cs.generals.concat(cs.groups).filter(function (x) { return x.name === n; })[0]; return c ? c.colour : '#999'; };
        var on = function (n) { return have.some(function (h) { return key(h) === key(n); }); };
        return lab + '<div class="cd-cats" data-cd="cats">' + (names.length ? names.map(function (n) {
            return '<label class="cd-cat"><input type="checkbox" value="' + esc(n) + '"' + (on(n) ? ' checked' : '') + '><i style="background:' + esc(colour(n)) + '"></i><span>' + esc(n) + '</span></label>';
        }).join('') : '<p class="mute small">No calendar categories yet – add them under Calendar.</p>') +
            '<textarea hidden data-f="' + esc(f.k) + '">' + esc(have.join(', ')) + '</textarea></div>' + help;
    }
    /** "Your own dates" as rows: name, date picker, every year – stored as "Name | 3/4/2027" or "Name | 25 Dec". */
    function datesField(f, v, lab, help) {
        var rows = String(v == null ? '' : v).split('\n').map(function (line) {
            var p = line.split('|'); if (p.length < 2) return null;
            var name = p[0].trim(), spec = p.slice(1).join('|').trim().toLowerCase(), m, y = '', mo = '', d = '';
            if ((m = spec.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) { y = m[1]; mo = m[2]; d = m[3]; }
            else if ((m = spec.match(/^(\d{1,2})[\/.](\d{1,2})(?:[\/.](\d{2,4}))?$/))) { d = m[1]; mo = m[2]; y = m[3] || ''; }
            else if ((m = spec.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3})[a-z]*\.?(?:\s+(\d{2,4}))?$/))) { d = m[1]; mo = MONS.map(function (x) { return x.toLowerCase(); }).indexOf(m[2]) + 1; y = m[3] || ''; }
            if (!d || !mo) return { name: name, iso: '', yearly: false };
            if (y && y.length === 2) y = '20' + y;
            var yearly = !y; if (yearly) y = String(new Date().getFullYear());
            return { name: name, iso: y + '-' + pad(mo) + '-' + pad(d), yearly: yearly };
        }).filter(Boolean);
        return lab + '<div class="cd-dates" data-cd="dates" data-max="' + (f.maxLines || 6) + '"><div class="cd-rows">' + rows.map(dateRow).join('') + '</div>' +
            '<button type="button" class="btn ghost small cd-add"' + (rows.length >= (f.maxLines || 6) ? ' disabled' : '') + '>+ Add a date</button>' +
            '<textarea hidden data-f="' + esc(f.k) + '">' + esc(v || '') + '</textarea></div>' + help;
    }
    function pad(n) { n = String(Number(n)); return n.length < 2 ? '0' + n : n; }
    function dateRow(r) {
        r = r || { name: '', iso: '', yearly: false };
        return '<div class="cd-row"><input class="cd-name" placeholder="e.g. Florida" maxlength="30" value="' + esc(r.name) + '">' +
            '<input class="cd-date" type="date" value="' + esc(r.iso) + '">' +
            '<label class="cd-yr" title="Comes round on this date every year"><input type="checkbox"' + (r.yearly ? ' checked' : '') + '><span>Every year</span></label>' +
            '<button type="button" class="cd-x" title="Remove" aria-label="Remove this date">✕</button></div>';
    }
    function cdSync(box) {
        var out = box.querySelector('[data-f]');
        if (box.getAttribute('data-cd') === 'cats') {
            out.value = Array.prototype.filter.call(box.querySelectorAll('input[type=checkbox]'), function (c) { return c.checked; }).map(function (c) { return c.value; }).join(', ');
            return;
        }
        out.value = Array.prototype.map.call(box.querySelectorAll('.cd-row'), function (row) {
            var name = row.querySelector('.cd-name').value.replace(/\|/g, ' ').trim(), iso = row.querySelector('.cd-date').value, yearly = row.querySelector('.cd-yr input').checked;
            if (!name || !iso) return '';
            var p = iso.split('-');
            return name + ' | ' + (yearly ? Number(p[2]) + ' ' + MONS[Number(p[1]) - 1] : Number(p[2]) + '/' + Number(p[1]) + '/' + p[0]);
        }).filter(Boolean).join('\n');
        var add = box.querySelector('.cd-add');
        add.disabled = box.querySelectorAll('.cd-row').length >= Number(box.getAttribute('data-max'));
    }
    document.addEventListener('input', function (e) { var b = e.target.closest && e.target.closest('[data-cd]'); if (b) cdSync(b); });
    document.addEventListener('change', function (e) { var b = e.target.closest && e.target.closest('[data-cd]'); if (b) cdSync(b); });
    document.addEventListener('click', function (e) {
        var b = e.target.closest && e.target.closest('[data-cd=dates]'); if (!b) return;
        if (e.target.closest('.cd-add')) {
            if (b.querySelectorAll('.cd-row').length >= Number(b.getAttribute('data-max'))) return;
            b.querySelector('.cd-rows').insertAdjacentHTML('beforeend', dateRow());
            var rs = b.querySelectorAll('.cd-name'); rs[rs.length - 1].focus();
        } else if (e.target.closest('.cd-x')) e.target.closest('.cd-row').remove();
        else return;
        cdSync(b);
    });

    /* A list setting as rows of boxes, instead of typing "Name | address" lines. The server says what's in each row
     * (f.rows); it's still stored as one line per row, the parts separated by |. With f.timed, each row can be shown all
     * the time or only on some days and between two times. */
    var TZS = [['Europe/London', 'UK'], ['Europe/Dublin', 'Ireland'], ['Atlantic/Canary', 'Canary Islands'], ['Europe/Lisbon', 'Portugal'], ['Europe/Paris', 'France, and most of Europe'], ['Europe/Madrid', 'Spain'],
        ['Europe/Athens', 'Greece, Cyprus'], ['Europe/Istanbul', 'Turkey'], ['Africa/Cairo', 'Egypt'], ['Africa/Johannesburg', 'South Africa'], ['Asia/Dubai', 'Dubai'], ['Asia/Kolkata', 'India'],
        ['Asia/Bangkok', 'Thailand'], ['Asia/Singapore', 'Singapore'], ['Asia/Hong_Kong', 'Hong Kong'], ['Asia/Shanghai', 'China'], ['Asia/Tokyo', 'Japan'], ['Australia/Perth', 'Perth'],
        ['Australia/Sydney', 'Sydney, Melbourne'], ['Pacific/Auckland', 'New Zealand'], ['America/New_York', 'New York, Orlando (US Eastern)'], ['America/Chicago', 'Chicago (US Central)'],
        ['America/Denver', 'Denver (US Mountain)'], ['America/Los_Angeles', 'Los Angeles (US Pacific)'], ['America/Toronto', 'Toronto'], ['America/Sao_Paulo', 'Brazil'], ['UTC', 'UTC']];
    function rwInput(c, i, v) {
        var a = ' class="rw-in" data-c="' + i + '"';
        if (c.type === 'colour') return '<input type="color"' + a + ' value="' + esc(/^#[0-9a-f]{6}$/i.test(v) ? v : '#3fa9f5') + '">';
        if (c.type === 'number') return '<input type="number" inputmode="numeric"' + a + (c.min != null ? ' min="' + c.min + '"' : '') + (c.max != null ? ' max="' + c.max + '"' : '') + ' placeholder="' + esc(c.ph || '') + '" value="' + esc(v) + '">';
        if (c.type === 'date') { var m = /^(\d\d?)\/(\d\d?)\/(\d{4})$/.exec(v || ''); return '<input type="date"' + a + ' value="' + esc(m ? m[3] + '-' + pad(m[2]) + '-' + pad(m[1]) : v) + '">'; }
        if (c.type === 'tz') {
            var list = TZS.slice(); if (v && !list.some(function (z) { return z[0] === v; })) list.push([v, v]);
            return '<select' + a + '>' + list.map(function (z) { return '<option value="' + esc(z[0]) + '"' + (z[0] === (v || 'America/New_York') ? ' selected' : '') + '>' + esc(z[1]) + '</option>'; }).join('') + '</select>';
        }
        return '<input' + a + (c.max ? ' maxlength="' + c.max + '"' : '') + ' placeholder="' + esc(c.ph || '') + '" value="' + esc(v) + '">';
    }
    function rwRow(f, parts) {
        parts = parts || [];
        var main = f.rows.map(function (c, i) {
            if (c.type === 'days' || c.type === 'span') return '';
            return '<label class="rw-c rw-' + c.type + '"><small>' + esc(c.label) + '</small>' + rwInput(c, i, parts[i] || '') + '</label>';
        }).join('');
        var when = '';
        if (f.timed) {
            var di = f.rows.findIndex(function (c) { return c.type === 'days'; }), ti = f.rows.findIndex(function (c) { return c.type === 'span'; });
            var days = parts[di] || '', t = /^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/.exec(parts[ti] || ''), some = !!(days || t);
            var hm = function (x) { return x ? pad(x.split(':')[0]) + ':' + x.split(':')[1] : ''; };
            when = '<div class="rw-when"><select class="rw-mode"><option value="all"' + (some ? '' : ' selected') + '>Show it all the time</option><option value="some"' + (some ? ' selected' : '') + '>Only on some days and times…</option></select>' +
                '<div class="rw-some"' + (some ? '' : ' hidden') + '>' + dayPick(null, days || 'Mon-Fri') +
                '<span class="rw-span">from <input type="time" class="rw-from" title="Leave both times empty for all day" value="' + esc(t ? hm(t[1]) : '') + '"> to <input type="time" class="rw-until" value="' + esc(t ? hm(t[2]) : '') + '"></span>' +
                '</div></div>';
        }
        return '<div class="rw-row"><div class="rw-main">' + main + '<button type="button" class="rw-x" title="Remove" aria-label="Remove">✕</button></div>' + when + '</div>';
    }
    function rowsField(f, v, lab, help) {
        var lines = String(v == null ? '' : v).split('\n').filter(function (l) { return l.trim(); });
        var max = f.maxLines || 6;
        return lab + help + '<div class="rw" data-rows="' + esc(f.k) + '" data-max="' + max + '"><div class="rw-list">' +
            lines.map(function (l) { return rwRow(f, l.split('|').map(function (x) { return x.trim(); })); }).join('') + '</div>' +
            '<button type="button" class="btn ghost small rw-add"' + (lines.length >= max ? ' disabled' : '') + '>' + esc(f.addLabel || '+ Add') + '</button>' +
            '<textarea hidden data-f="' + esc(f.k) + '">' + esc(v || '') + '</textarea></div>';
    }
    var RW = {};      // the row definitions of each list setting on show, by key
    function rwSync(box) {
        var f = RW[box.getAttribute('data-rows')]; if (!f) return;
        box.querySelector('[data-f]').value = Array.prototype.map.call(box.querySelectorAll('.rw-row'), function (row) {
            var parts = f.rows.map(function (c, i) {
                if (c.type === 'days' || c.type === 'span') {
                    if (row.querySelector('.rw-mode').value !== 'some') return '';
                    if (c.type === 'days') { var d = formatDays(Array.prototype.map.call(row.querySelectorAll('.dp-day'), function (b) { return b.classList.contains('on'); })); return d === 'Daily' ? '' : d; }
                    var a = row.querySelector('.rw-from').value, b = row.querySelector('.rw-until').value;
                    return a && b ? a + '-' + b : '';
                }
                var inp = row.querySelector('[data-c="' + i + '"]'); return inp ? inp.value.replace(/\|/g, ' ').trim() : '';
            });
            if (!parts[0]) return '';
            while (parts.length && !parts[parts.length - 1]) parts.pop();
            return parts.join(' | ');
        }).filter(Boolean).join('\n');
        box.querySelector('.rw-add').disabled = box.querySelectorAll('.rw-row').length >= Number(box.getAttribute('data-max'));
    }
    document.addEventListener('input', function (e) { var b = e.target.closest && e.target.closest('[data-rows]'); if (b) rwSync(b); });
    document.addEventListener('change', function (e) {
        var b = e.target.closest && e.target.closest('[data-rows]'); if (!b) return;
        if (e.target.classList.contains('rw-mode')) e.target.closest('.rw-when').querySelector('.rw-some').hidden = e.target.value !== 'some';
        rwSync(b);
    });
    document.addEventListener('click', function (e) {
        var b = e.target.closest && e.target.closest('[data-rows]'); if (!b) return;
        var f = RW[b.getAttribute('data-rows')], t;
        if ((t = e.target.closest('.rw-add'))) {
            if (b.querySelectorAll('.rw-row').length >= Number(b.getAttribute('data-max'))) return;
            b.querySelector('.rw-list').insertAdjacentHTML('beforeend', rwRow(f, []));
            var ins = b.querySelectorAll('.rw-row'); var first = ins[ins.length - 1].querySelector('.rw-in'); if (first) first.focus();
        } else if ((t = e.target.closest('.rw-x'))) t.closest('.rw-row').remove();
        else if ((t = e.target.closest('.dp-day'))) {
            t.classList.toggle('on');
            var dp = t.closest('.dpick'), on = Array.prototype.map.call(dp.querySelectorAll('.dp-day'), function (x) { return x.classList.contains('on'); });
            dp.querySelector('.dp-say').textContent = daysSay(on);
        } else return;
        rwSync(b);
    });

    function field(f, v) {
        var id = 'f_' + f.k, help = f.help ? '<div class="mute small hint">' + esc(f.help) + '</div>' : '';
        var lab = '<label for="' + id + '">' + esc(f.label) + (f.max && f.type === 'text' ? ' <span class="cnt">max ' + f.max + '</span>' : '') + '</label>';
        if (f.ui === 'rows' && f.rows) { RW[f.k] = f; return rowsField(f, v, '<label>' + esc(f.label) + '</label>', help); }
        if (f.ui === 'cats' || f.ui === 'dates') {
            var lab2 = '<label>' + esc(f.label) + '</label>', h = f.ui === 'cats' ? catsField(f, v, lab2, help) : datesField(f, v, lab2, help);
            if (h) return h;
        }
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

    /** A widget, clicked on the screen layout: how it appears (left) and its own settings (right), saved together.
     * A widget that only stands in for another at other times gets just its settings – its height and times are the other one's. */
    function widgetSheet(w) {
        if (!w) return;
        var T = typeOf(w.type), bk = backupFor(w) && !w.show ? backupFor(w) : '';
        var defs = T.settings, extra = '';
        if (w.type === 'bins') {   // where the bin days come from is set by "Set up bin days"; only the reminder is a setting
            defs = defs.filter(function (f) { return f.k === 'ReminderFrom'; });
            extra = '<p class="small"><b>Bin days come from:</b> ' + esc(summary(w)) + '</p><button class="btn ghost wide" id="wBins">Set up bin days</button>';
        }
        if (w.type === 'kidrem') extra += '<p class="ws-note">🎒 The reminders themselves, and the time it switches to tomorrow’s, are set ' + (DESK ? 'on the <a href="#" data-go="reminders">Reminders</a> page (under Apps).' : 'on the <a href="#" data-go="rewards/timetable">Rewards</a> tab (Reminders).') + '</p>';
        if (w.type === 'child') extra += '<p class="ws-note">⭐ To set up the reward system – tasks, daily to-dos, reminders and the reward rules – use the <a href="#" data-go="rewards">Rewards</a> tab at the top.</p>';
        var own = '<section class="ws-set"><h3 class="ws-h">' + esc(T.name) + ' settings</h3>' + extra +
            (defs.length ? fields(defs, w.settings) : '<p class="mute small">Nothing to set up – it works as it is.</p>') + '</section>';
        var place = bk ? '' : '<section class="ws-place"><h3 class="ws-h">On the screen</h3>' +
            '<label>Height</label><select id="wSize"' + (T.sizes.length < 2 ? ' disabled' : '') + '>' + T.sizes.map(function (z) { return '<option value="' + z + '"' + (z === w.size ? ' selected' : '') + '>' + (z === 'full' ? 'Full height' : 'Half height') + '</option>'; }).join('') + '</select>' +
            '<label class="tog"><input type="checkbox" id="wShow"' + (w.show ? ' checked' : '') + '><span>Show on the screen</span></label>' +
            whenHtml(w, T) +
            '<button class="btn bad wide" id="wDel">Remove this widget</button></section>';
        sheet('<h2>' + esc(T.icon) + ' ' + esc(widgetName(w)) + '</h2><p class="mute small">' + esc(T.about) + '</p>' +
            (bk ? '<p class="ws-note">⏰ Shown in place of <b>' + esc(bk) + '</b> at other times, in the same space – its height and times are set on ' + esc(bk) + '.</p>' : '') +
            '<div class="ws-cols' + (bk ? ' one' : '') + '">' + place + own + '</div>' +
            '<div class="sheet-actions"><button class="btn ghost" id="wCancel">Cancel</button><button class="btn good" id="wSave">Save</button></div>');
        $('sheet').classList.add('wide');
        applyWhen();
        if ($('wBins')) $('wBins').onclick = function () { binWizard(w); };
        // At other times: only kinds of widget that can be this height.
        var fitElse = function () {
            var z = $('wSize').value;
            Array.prototype.forEach.call($('whElse').options, function (o) {
                var ok = !o.value || (o.getAttribute('data-sizes') || '').split(' ').indexOf(z) >= 0;
                o.hidden = !ok; o.disabled = !ok;
                if (!ok && o.selected) $('whElse').value = '';
            });
        };
        if ($('wSize')) { $('wSize').onchange = fitElse; fitElse(); }
        if ($('whMode')) $('whMode').onchange = function () { $('whMore').hidden = this.value === 'always'; };
        $('wCancel').onclick = closeSheet;
        $('wSave').onclick = function () {
            var vals = readFields(), body = { id: w.id, settings: vals };
            if (!bk) {
                body.size = $('wSize').value; body.show = $('wShow').checked;
                body.when = { ShowDays: $('whDays').value, ShowFrom: $('whFrom').value.slice(0, 5) || '00:00', ShowUntil: $('whUntil').value.slice(0, 5) || '24:00', OtherTimes: $('whElse').value };
                if ($('whMode') && $('whMode').value === 'always') body.when = { ShowDays: 'Every day', ShowFrom: '00:00', ShowUntil: '24:00', OtherTimes: '' };
            }
            // Shown straight away; the Google script catches up in the background (an error puts it back).
            savingNow(w, function () {
                Object.keys(vals).forEach(function (k) { w.settings[k] = vals[k]; });
                if (bk) return;
                w.size = body.size; w.show = body.show; w.when = body.when.ShowDays === 'Every day' && body.when.ShowFrom === '00:00' && body.when.ShowUntil === '24:00' ? null : body.when;
            });
            act({ action: 'saveWidget', widget: body }, 'Saved – the screen updates within a minute')
                .then(function () { closeSheet(); delete GL[w.id]; if (route().w === w.id) fetchWidget(w.id); }, function () {});
        };
        if ($('wDel')) $('wDel').onclick = function () {
            var others = (DATA.widgets || []).some(function (x) { return x.id !== w.id && x.type === w.type; });
            if (!confirm('Remove the ' + T.name + ' widget from the screen?' + (others ? '' : ' Its settings are kept, in case you add it again.'))) return;
            // Gone from the layout straight away; if the Google script says no (e.g. it's another widget's backup), it comes back with the reason.
            DATA.widgets = DATA.widgets.filter(function (x) { return x.id !== w.id; }); closeSheet(); setData(DATA);
            act({ action: 'deleteWidget', id: w.id }, 'Removed').then(function () { if (route().w) go('layout'); }, function () {});
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
        if (CHECKED_W[w.type]) return;      // checked by the Google script first (addresses, codes…): the box stays open until it's saved
        apply(); closeSheet(); setData(DATA);
        FD.toast('Saving…');
    }
    var CHECKED_W = { traffic: 1, bins: 1, clock: 1, timer: 1, trains: 1 };
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
        return '<div class="when"><label>When to show</label><select id="whMode"><option value="always"' + (w.when ? '' : ' selected') + '>Always</option><option value="some"' + (w.when ? ' selected' : '') + '>Only on some days or at some times…</option></select>' +
            '<div id="whMore"' + (w.when ? '' : ' hidden') + '><p class="mute small">For example, trains on weekday mornings only, with the holiday countdown in the same space the rest of the time.</p>' +
            '<label>Show on</label><select id="whDays">' + days.map(function (d) { return '<option' + (d === W.ShowDays ? ' selected' : '') + '>' + d + '</option>'; }).join('') + '</select>' +
            '<div class="two"><div><label>From</label>' + timeSel('whFrom', W.ShowFrom, false) + '</div>' +
            '<div><label>Until</label>' + timeSel('whUntil', W.ShowUntil, true) + '</div></div>' +
            '<label>At other times show</label><select id="whElse"><option value="">Nothing – leave the space empty</option>' +
            DATA.types.filter(function (x) { return x.type !== w.type; }).map(function (x) { return '<option value="' + esc(x.type) + '" data-sizes="' + esc(x.sizes.join(' ')) + '"' + (x.type === W.OtherTimes ? ' selected' : '') + '>' + esc(x.icon + ' ' + x.name) + '</option>'; }).join('') + '</select>' +
            '<p class="mute small">Only widgets that can be the same height are offered. Midnight to midday is 00:00 until 12:00.</p></div></div>';
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
                .then(function () { closeSheet(); delete GL[w.id]; if (route().w === w.id) fetchWidget(w.id); }, function () {});
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
            var defs = {}; (T.settings || []).forEach(function (f) { defs[f.k] = f.def; });
            DATA.widgets.push({ id: 'new-' + Date.now(), page: pid, type: ty, size: T.sizes[0], show: true, order: 999, settings: defs, when: null, pending: true });
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
            (PT.settings.length && !(DESK && p.type === 'calendar') ? '<h3 class="sh">Settings</h3>' + fields(PT.settings, p.settings || {}) : '') +
            (DESK && p.type === 'calendar' ? '<p class="mute small">This calendar page’s settings (which calendars, what it opens on…) are under its picture on the Screen layout page.</p>' : '') +
            '<div class="sheet-actions"><button class="btn ghost" id="pCancel">Cancel</button><button class="btn good" id="pSave">Save</button></div>' +
            (p.type === 'widgets' || (p.type === 'calendar' && (DATA.pages || []).filter(function (x) { return x.type === 'calendar'; }).length > 1) ? '<div class="sheet-actions"><button class="btn bad" id="pDel">Delete this page</button></div>' : ''));
        var icon = p.icon;
        $('pIcons').onclick = function (e) { var b = e.target.closest('[data-i]'); if (!b) return; icon = b.getAttribute('data-i');
            Array.prototype.forEach.call($('pIcons').children, function (c) { c.classList.toggle('on', c === b); }); };
        $('pCancel').onclick = closeSheet;
        $('pSave').onclick = function () {
            var pg = { id: p.id, title: $('pTitle').value.trim(), icon: icon, show: $('pShow').checked };
            if (!(DESK && p.type === 'calendar')) pg.settings = readFields();
            act({ action: 'savePage', page: pg }, 'Saved').then(closeSheet, function () {});
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
            (DESK ? '' : deskCard()) + '<p class="mute small center">' + (DESK ? 'Family Dashboard Configurator' : 'Family Admin') + ' · Google script ' + esc(DATA.scriptVersion || '?') + '</p>';
    }
    /** Disconnect this phone or computer from the family's dashboard: it goes back to "connect to a dashboard". */
    function disconnectHere(e) {
        if (e && e.preventDefault) e.preventDefault();
        if (!confirm('Disconnect this ' + (DESK ? 'computer' : 'phone') + ' from the dashboard? It goes back to the start, where you connect it – to this family or another one – with a code or link from a family phone.')) return;
        FD.clearConfig(); try { localStorage.removeItem('fdadmin.data'); } catch (x) { /* ignore */ }
        location.hash = ''; location.reload();
    }
    document.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('#hmOut, [data-out]')) disconnectHere(e); });
    /** The phone's More: help and support, then the few settings that are on the phone, then the Configurator. */
    function renderMore() {
        title('More');
        var row = function (go, ico, name, what) { return '<button class="mrow" data-go="' + go + '"><span class="m-ico">' + ico + '</span><span class="m-tx"><b>' + esc(name) + '</b><small>' + esc(what) + '</small></span><i>›</i></button>'; };
        $('body').innerHTML = '<h3 class="sec">Help and support</h3><div class="menu">' +
            row('help', '❓', 'Help', 'Answers to common questions, by topic') +
            row('feedback', '💬', 'Feedback and support', 'Ask for help, suggest something, tell us what you think – and see replies') +
            row('s/support', '🩺', 'About & diagnostics', SECTIONS.support[2]) + '</div>' +
            '<h3 class="sec">Settings</h3><div class="menu">' + ['screen', 'licence', 'devices', 'updates'].map(function (k) { return row('s/' + k, SECTIONS[k][0], SECTIONS[k][1], sectionLine(k)); }).join('') + '</div>' +
            '<h3 class="sec">This phone</h3><div class="menu"><button class="mrow" data-out><span class="m-ico">⏏</span><span class="m-tx"><b>Disconnect this phone</b><small>Connected to ' + familyDash().replace(/<[^>]+>/g, '') + '</small></span><i>›</i></button></div>' +
            '<h3 class="sec">Advanced</h3>' + deskCard() + '<p class="mute small center">Family Admin · ' + esc(FD.VERSION) + ' · Google script ' + esc(DATA.scriptVersion || '?') + '</p>';
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
    // Each service, the keys it gives you, what it's for, and how to get them (the same steps as the setup wizard).
    var KEY_HELP = [
        { keys: ['TomTomKey'], name: 'TomTom', ico: '🚗', need: 'Traffic times and all the maps (traffic and flights)', free: 'Free: 2,500 requests a day – plenty.',
          steps: ['Go to <a href="https://developer.tomtom.com/" target="_blank" rel="noopener">developer.tomtom.com</a> and click <b>Register</b> (free).',
                  'Confirm your email, then sign in and open your <b>Dashboard</b>.',
                  'Under <b>Keys</b> you’ll see “My first API key” – click it, copy the key and paste it above.'] },
        { keys: ['RailDataKey'], name: 'National Rail', ico: '🚆', need: 'The live train departure board', free: 'Free.',
          steps: ['Go to <a href="https://realtime.nationalrail.co.uk/OpenLDBWSRegistration" target="_blank" rel="noopener">realtime.nationalrail.co.uk/OpenLDBWSRegistration</a> and fill in the form (free).',
                  'National Rail emails you a <b>token</b> that looks like <code>xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx</code> – paste it above.',
                  'Or a <b>Live Departure Board</b> key from <a href="https://raildata.org.uk/" target="_blank" rel="noopener">raildata.org.uk</a> works too.'] },
        { keys: ['TransportApiId', 'TransportApiKey'], name: 'TransportAPI', ico: '🚌', need: 'Live bus times', free: 'Free: 30 updates a day (the screen spreads them over the school run).',
          steps: ['Go to <a href="https://developer.transportapi.com/signup" target="_blank" rel="noopener">developer.transportapi.com/signup</a> and sign up for the free plan.',
                  'Sign in and open <b>Applications</b> (or the Dashboard).',
                  'Copy the <b>Application ID</b> and the <b>Key</b> into the two boxes above.'] },
        { keys: ['NasaKey'], name: 'NASA', ico: '🔭', need: 'The NASA picture of the day', free: 'Free. It works for a while without one, but that runs out.',
          steps: ['Go to <a href="https://api.nasa.gov/" target="_blank" rel="noopener">api.nasa.gov</a> and fill in the short form under <b>Generate API Key</b>.',
                  'The key appears straight away (and is emailed to you) – copy it above.'] },
        { keys: ['SpotifyClientId', 'SpotifyClientSecret'], name: 'Spotify', ico: '🎵', need: 'What’s playing, with play, pause and skip (needs Spotify Premium)', free: 'Free; needs a Premium account.',
          steps: ['Go to <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noopener">developer.spotify.com/dashboard</a>, log in and click <b>Create app</b>.',
                  'Any name and description. For <b>Redirect URI</b> paste your web app address: <button type="button" class="btn ghost sm" data-copyurl>Copy it</button>. Tick <b>Web API</b>, agree and save.',
                  'Open the app’s <b>Settings</b>: copy the <b>Client ID</b>, then <b>View client secret</b> and copy that too – into the two boxes above.',
                  'Save here, then in the Family Admin app: Apps → Spotify → <b>Connect Spotify</b> (one-off).'] },
    ];
    function secKeys() {
        title('External data (API) keys');
        var inst = function (k) { return (DATA.install || []).filter(function (f) { return f.k === k; })[0]; };
        var listed = {};
        var cards = KEY_HELP.map(function (h) {
            var fs = h.keys.map(inst).filter(Boolean); if (!fs.length) return '';
            fs.forEach(function (f) { listed[f.k] = 1; });
            var have = fs.every(function (f) { return f.value; }), need = fs.some(function (f) { return keyNeeded(f.k); });
            var pill = have ? '<span class="kc-pill ok">✔ Added</span>' : need ? '<span class="kc-pill warn">Needed – a widget on your screen uses it</span>' : '<span class="kc-pill">Not added – optional</span>';
            return '<section class="kc' + (have ? ' have' : need ? ' needs' : '') + '"><header><span class="kc-ico">' + h.ico + '</span><div><h3>' + esc(h.name) + '</h3><small>For: ' + esc(h.need) + '</small></div>' + pill + '</header>' +
                fs.map(function (f) { return '<label>' + esc(f.label) + '</label><input data-set="' + esc(f.k) + '" value="' + esc(f.value) + '" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Paste the ' + esc(f.label.toLowerCase()) + ' here">'; }).join('') +
                '<details class="kc-how"' + (have ? '' : ' open') + '><summary>' + (have ? 'How to get a new one' : 'How to get one – about 5 minutes') + '</summary><ol>' + h.steps.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ol><p class="mute small">' + esc(h.free) + '</p></details></section>';
        }).join('');
        // Any key not described above (a newer one): as a plain box.
        var rest = (DATA.install || []).filter(function (f) { return f.group === 'keys' && !listed[f.k]; });
        $('body').innerHTML = '<p class="mute small help">Each service below gives the dashboard live information – it’s free, and you sign up once. The ones marked <span class="need">needed</span> are for widgets on your screen; the others only matter if you add those widgets.</p>' +
            '<div class="kcs">' + cards + (rest.length ? '<section class="kc"><header><span class="kc-ico">🔑</span><div><h3>Other keys</h3></div></header>' + installFields(null, rest.map(function (f) { return f.k; })) + '</section>' : '') + '</div>' +
            saveInstallBtn('kSave', 'Save the keys');
        wireSaveInstall('kSave');
        Array.prototype.forEach.call(document.querySelectorAll('[data-copyurl]'), function (b) {
            b.onclick = function () { var u = FD.config().url; (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(function () { FD.toast('Copied'); }, function () { prompt('Copy this address:', u); }); };
        });
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
            card('Reconfigure your existing setup', '<p class="mute small">Opens the step-by-step setup with everything you already have filled in – change what you like, keep the rest.</p><div class="setup-links">' +
                [['welcome', 'Go through the whole setup again', 'every step, already filled in'], ['family', 'Repeat just the family step', 'who’s in the family'], ['check', 'Test all the widgets', 'asks your Sheet to fetch every widget and reports anything that needs attention'], ['keys', 'Step-by-step guide to the external data sources', 'getting the free keys for traffic, trains, buses…']].map(function (x) {
                    return '<a class="setup-link" href="' + setupLink(x[0]) + '" target="_blank" rel="noopener"><b>' + x[1] + '</b><span>' + x[2] + '</span><i>›</i></a>';
                }).join('') + '</div>') +
            versionsCard() +
            card('Start again from scratch', '<p class="small">Set up a brand-new family from nothing, in a new Sheet. Your old Sheet stays in Google Drive as a backup. ' +
                'To keep your people, points and lists, move them instead (above).</p><p class="mute small">Free your licence key first (Advanced → Software Licence), so the new Sheet can use it.</p>' +
                '<a class="btn ghost wide" href="' + esc(fresh) + '" target="_blank" rel="noopener">Open the setup app for a new family</a>') +
            accessCard();
        wireAfresh(); wireAccess();
    }

    /* ---- licence */
    function secLicence() {
        var Lc = DATA.licence || {};
        title('Software Licence');
        var day = function (t) { return t ? new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : ''; };
        var dl = function (rows) { return '<dl class="lic-dl">' + rows.filter(function (r) { return r[1]; }).map(function (r) { return '<dt>' + r[0] + '</dt><dd>' + r[1] + '</dd>'; }).join('') + '</dl>'; };
        var n = Lc.screens || 1, used = Lc.screensUsed;
        var keyHtml = DATA.licenceKey ? '<span class="row-between"><b class="mono" style="user-select:all">' + esc(DATA.licenceKey) + '</b><button class="btn ghost sm" id="licCopy">Copy</button></span>' : Lc.key ? '…' + esc(Lc.key) : '';
        var details = !Lc.required ? '<p class="mute">Licence keys aren’t being checked yet. You can still add yours now.</p>' + dl([['Your key', keyHtml]])
            : '<p class="' + (Lc.ok ? (Lc.state === 'trial' ? '' : 'pos') : 'neg') + '"><b>' + (Lc.ok ? (Lc.state === 'trial' ? '⏳ ' : '✔ ') : '⚠ ') + esc(Lc.message) + '</b></p>' +
              dl(Lc.state === 'active' ? [
                  ['Licensed to', esc(Lc.name || '')],
                  ['Your key', keyHtml],
                  ['Screens', n + ' screen' + (n > 1 ? 's' : '') + ' at once' + (used != null ? ' · ' + used + ' in use now' : '') + ' <a href="#" data-go="s/devices" class="small">see which ›</a><br><span class="mute small">The Corsair, a tablet or a computer showing the dashboard. Phones with the apps don’t count – connect as many as you like.</span>'],
                  ['Valid until', 'No end date – it’s a one-off purchase, and updates are included'],
                  ['Activated', day(Lc.activated)],
                  ['Last checked', Lc.lastOk ? day(Lc.lastOk) + ' <span class="mute small">(checked automatically once a day)</span>' : '']
                ] : Lc.state === 'trial' ? [['Screens', '1 screen during the trial'], ['Trial ends', day(Date.now() + (Lc.daysLeft || 0) * 864e5)], ['Your key', keyHtml]] : [['Your key', keyHtml]]);
        $('body').innerHTML = '<p class="mute small help">A licence is your permission to use the Family Dashboard software. You buy it once and get a <b>licence key</b> (FD- then four groups of five letters and numbers) in your order email. ' +
                'The key is linked to this dashboard – your family’s Google Sheet – and says how many screens can show it. Your family’s information never goes to the seller: only the key and a random installation number are checked.</p>' +
            card('Your licence', details) +
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
        // Is everything up to date? The three parts: the application held within Google, the dashboard screen, and these apps.
        var appNew = LATEST && LATEST.app, ss = DATA.screenSeen || {}, when = function (iso) { return iso ? String(iso).slice(0, 16).replace('T', ' ') : ''; };
        var vrow = function (what, sub, ver, latest, note) {
            var ok = !latest || !ver || ver === '?' || !newer(latest, ver);
            return '<div class="up-row"><span class="up-ok ' + (ok ? 'pos' : 'neg') + '">' + (ok ? '✔' : '⬆') + '</span><span class="up-t"><b>' + what + '</b><small>' + sub + '</small></span>' +
                '<span class="up-v">' + esc(ver || '?') + (ok ? '' : '<small>' + esc(latest) + ' available</small>') + (note ? '<small>' + note + '</small>' : '') + '</span></div>';
        };
        $('body').innerHTML = card('Is everything up to date?',
                vrow('Application held within Google (Google script)', 'your family’s own copy, in your Google account', mine, newest, '') +
                vrow('The dashboard screen', 'updates itself when nobody is using it', ss.v || '?', appNew, ss.at ? 'last seen ' + esc(when(ss.at)) : '') +
                vrow('This website and the phone apps', 'update themselves when opened', FD.VERSION, appNew, '') +
                '<p class="mute small">Only the dashboard screen tells the Sheet its version, so other tablets and phones aren’t listed – they update themselves the same way. You can see the screen’s and this device’s versions on <a href="#" data-go="s/support">About &amp; diagnostics</a>.</p>') +
            card('Application held within Google (Google script)', '<p>' + (behind ? '<b>Version ' + esc(newest) + ' is available</b> – you have ' + esc(mine) + '.' : 'Up to date: version ' + esc(mine) + '.') + '</p>' +
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
            (LATEST && LATEST.notes ? card('What’s new in the latest version (' + esc(LATEST.app || '') + ')', '<ul class="pvl">' + LATEST.notes.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ul>' +
                '<p class="small">The changes are to the whole system – the screen, the apps and the application held within Google; each part updates as above.</p>' +
                '<a class="btn ghost wide" href="' + esc(appsRoot() + 'whatsnew.html') + '" target="_blank" rel="noopener">Show full version history ↗</a>') : '') +
            '<a class="link-card" data-go="s/support" href="#"><b>Go to About &amp; diagnostics ›</b><span class="mute small">Use this settings screen to see all the different version numbers on different devices, and to generate diagnostic reports for use by support.</span></a>';
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
            rowv('Application held within Google (Google script)', DATA.scriptVersion, L.script, DATA.loader ? 'loader ' + DATA.loader.loader + ' – updates itself' : DATA.autoUpdate ? 'updates itself' : 'automatic updates off') +
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
            var b = this; b.disabled = true; b.textContent = '⏳ Checking everything – this can take up to a minute…';
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
        if (DATA.loader && !v) return card('Port my data to a different Google account', '<p class="small">For example a new Gmail account just for the dashboard, so its permissions aren’t on your main account. ' +
            'Everything comes across – people, points, lists, settings and your licence – and the screen and phones switch over by themselves. The new account is emailed the steps.</p>' +
            '<label>The new Google account’s email address</label><input id="mvEmail" type="email" placeholder="ourfamily.dashboard@gmail.com" autocomplete="off" autocapitalize="off">' +
            '<button class="btn wide" id="mvGo">Make a moving pack</button><div id="mvOut"></div>');
        return card('Saved versions', (v ? '<p><b>' + v.used + ' of ' + v.max + '</b> used' + (v.stale ? ' (last count)' : '') + ' – each update of the Google script uses one.</p>' +
                '<div class="bar' + (v.warn ? ' warnbar' : '') + '"><span style="width:' + pct + '%"></span></div>'
                : '<p class="mute">Not known – switch on the Google Apps Script API (see Automatic updates above).</p>') +
            (v && v.warn ? '<p class="neg"><b>Nearly full.</b> When it’s full the script can’t update. Start afresh below (easiest), or delete old versions in Apps Script → Project history.</p>' : '') +
            (DATA.loader ? '' : '<details class="adv"' + (v && v.warn ? ' open' : '') + '><summary>Start afresh in a new Sheet</summary><p class="small">Makes a brand-new Google Sheet with its own script (0 versions used) and copies <b>everything</b> into it: every tab and its data, the settings, your licence, and automatic updates. ' +
            'The screen and phones follow by themselves. This Sheet is kept as a backup.</p><p class="small">You’ll need to open the new Sheet once and click Allow, as when you first set up.</p>' +
            '<button class="btn wide" id="afresh">Start afresh</button></details>') +
            '<details class="adv"><summary>Port my data to a different Google account</summary><p class="small">For example a new Gmail account just for the dashboard, so its permissions aren’t on your main account. ' +
            'Everything comes across – people, points, lists, settings and your licence – and the screen and phones switch over by themselves. The new account is emailed the steps.</p>' +
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
                $('mvOut').innerHTML = (d.emailed ? '<p class="pos small"><b>✔ Emailed to ' + esc(d.email) + '</b> – the email has these steps, and what happens to your screens and phones. You can also do it now:</p>' : '') + '<ol class="small"><li>On a <b>computer</b>, sign in to Google as <b>' + esc(d.email) + '</b> (or open a private window and sign in there).</li>' +
                    '<li>Open this link – it’s the setup app, in “moving” mode:</li></ol><textarea readonly rows="3" id="mvLink">' + esc(d.setupLink) + '</textarea>' +
                    '<button class="btn ghost wide" id="mvCopy">Copy the link</button>' + (navigator.share ? '<button class="btn ghost wide" id="mvShare">Send it to yourself</button>' : '') +
                    '<ol class="small" start="3"><li>Follow the setup steps for the new account (make the Sheet, publish it). At “Publish &amp; connect” press <b>Bring everything across</b>.</li>' +
                    '<li>That’s it – the screen, phones and licence switch over by themselves within a few minutes; you don’t connect them again. If one is switched off at the time, reload it when it’s back on (if it asks for a code, connect it again from Devices). This Sheet is kept as a backup.</li></ol>';
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
        return card('Access code', '<p class="small"><b>What it is:</b> the access code is your dashboard’s password. Every screen, tablet and phone sends it with each request to your Google Sheet, and the Sheet only answers if it’s right – so nobody else can see or change your family’s information, even if they find your links.</p>' + (DATA.codeWeak ? '<div class="redbox"><b>⚠ Your access code is weak.</b> It’s easy to guess, and anyone with your links and code can use your dashboard. Make a new strong one below.</div>' : '') +
            '<p class="mute small">After changing it, every other phone and screen needs connecting again (Devices and Phones). ' + (DESK ? 'This computer' : 'This phone') + ' updates itself.</p>' +
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
            card(DESK ? 'This computer' : 'This phone', '<p class="small">Connected to ' + familyDash() + ' <span class="mute">(Sheet ' + esc(c.url.replace(/^https:\/\/script\.google\.com\/macros\/s\//, '').slice(0, 10)) + '…)</span>. Wrong family? Disconnect, then connect to the right one.</p><button class="btn ghost wide" id="sOut">Disconnect this ' + (DESK ? 'computer' : 'phone') + '</button>');
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
        $('sOut').onclick = disconnectHere;
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
                '<button type="button" class="ptb' + (p.points === false ? '' : ' on') + '" data-pt>⭐ Rewards</button></div>' +
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
            card('Everyone in the family', '<p class="mute small">Up to ' + LM.people + ' people. Tap ⭐ Rewards for anyone who takes part in the reward system (up to ' + LM.children + '); taking someone off keeps their points.</p>' +
                '<div id="ppl">' + F.people.map(person).join('') + '</div><button class="btn ghost wide" id="addP">+ Add a person</button>') +
            card('Groups on the calendar', '<p class="mute small">Each person shows in their group’s colour on the calendar key, with their name in brackets, e.g. “Drums (Ben)”.</p>' +
                group('children', 'Children’s group', F.children) + group('adults', 'Adults’ group', F.adults) +
                '<label>Name of the rewards screen <span class="cnt">max 14</span></label><input id="ptsTitle" maxlength="14" value="' + esc(pp ? pp.title : (F.pointsTitle || '')) + '" placeholder="Same as the children’s group">') +
            card('Categories everyone shares', '<div class="fixed-c"><span>🔒 <b>Family</b> <span class="mute small">things you all do together</span></span><input type="color" id="famC" value="' + esc(F.family.colour) + '"></div>' +
                '<div class="fixed-c"><span>🔒 <b>Holiday</b> <span class="mute small">trips away (flights go here too)</span></span><input type="color" id="holC" value="' + esc(F.holiday.colour) + '"></div>' +
                '<h3 class="sh">Special categories (up to ' + LM.specials + ')</h3><div id="sps">' + F.specials.map(special).join('') + '</div>' +
                '<div class="chips" id="spAdd"><button class="chip" data-sug="School holiday">+ School holidays</button><button class="chip" data-sug="Birthday">+ Birthdays</button><button class="chip" data-sug="">+ Other</button></div>') +
            '<label class="tog"><input type="checkbox" id="showMatch"><span>Show matching words (advanced)</span></label>' +
            '<p class="mute small">Events go in a category by the name at the start of their title – “Ben – Drums”, “Family – Zoo”. Matching words catch events without one, e.g. “football” → Josh.</p>' +
            '<p class="mute small" id="famNote"></p><button class="btn wide" id="famSave">Save family</button></div>' +
            '<p class="mute small">Which Google calendars are shown, and each calendar page’s settings, are in <b>Screen layout</b> – pick the calendar page.</p>';
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
            $('famNote').textContent = !on.length ? 'Nobody takes part in rewards.' :
                'In rewards: ' + names(on) + ' – each has a card to put on a screen (in Screens & widgets).' + (off.length ? ' Not in rewards: ' + names(off) + '.' : '');
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
    } else FD.setupScreen($('app'), DESK ? 'Family Dashboard Configurator' : 'Family Admin', start);
})();
