/* Family Admin – the parents' app.
 *
 * Home     a landing page: everyday things (points, notes, lists, to-dos, where everyone is), a glance at the live
 *          widgets (weather, trains, bins…) and the set-up sections. Every tile opens its own page.
 * Points   where the children are (like the screen), then setting up tasks, morning to-dos, reminders and the rules.
 * Lists    notes, shopping lists and to-dos together.
 * Screen   pages and widgets: what goes where on the screen, and each widget's settings.
 * Settings family, API keys, home & calendar, screen & sleep, licence, updates, access code & devices.
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

    var TABS = [['home', '⌂', 'Home'], ['points', '★', 'Points'], ['lists', '☰', 'Lists'], ['layout', '▦', 'Screen'], ['settings', '⚙', 'Settings']];
    var SECTIONS = {
        family: ['👪', 'Family & children', 'Who’s in the family, who’s on the points page, calendar groups and colours'],
        keys: ['🔑', 'API keys', 'One place for every key: maps, trains, buses, NASA, Spotify'],
        home: ['🏠', 'Home & calendar', 'Home address, which calendars to show, the calendar page'],
        screen: ['🖥️', 'Screen & sleep', 'When the screen goes to sleep, and night hours'],
        licence: ['🎫', 'Licence', 'Your licence key'],
        updates: ['⟳', 'Updates', 'Google script version and automatic updates'],
        access: ['🔒', 'Access code & devices', 'Connect phones and the screen, change the access code'],
        support: ['🩺', 'Versions & diagnostics', 'Every version number, and a report to send to support'],
        advanced: ['🧰', 'Advanced', 'Where the apps are hosted, the full setup app'],
    };

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
    function act(body, okText, undoable) {
        if (busy) return Promise.resolve();
        busy = true; sync('busy');
        return FD.post(body).then(function (d) {
            sync('ok');
            if (d.state && !d.tasks) { DATA.state = d.state; setData(DATA); }
            else if (d.tasks) setData(d);
            else if (d.data && d.id && DATA.lists) { DATA.lists[d.id] = d.data; setData(DATA); }
            if (okText) FD.toast(okText, false, undoable && d.id ? function () { act({ action: 'undo', id: d.id }, 'Undone'); } : null);
            return d;
        }).catch(function (e) { sync('err'); FD.toast(e.message, true); throw e; })
          .finally(function () { busy = false; });
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
            if (route().tab === 'home' || route().w) render();
        });
    }
    function fetchWidget(id) {
        return FD.get('widget', { id: id }).then(function (d) { GL[id] = d.data; if (route().w === id) render(); }, function (e) { FD.toast(e.message, true); });
    }

    /* ================================================================ frame and routes */

    function route() {
        var h = location.hash.replace(/^#\/?/, '').split('/');
        if (h[0] === 'w' && h[1]) return { w: decodeURIComponent(h[1]), tab: 'home' };
        if (h[0] === 's' && SECTIONS[h[1]]) return { s: h[1], tab: 'settings' };
        return { tab: TABS.some(function (t) { return t[0] === h[0]; }) ? h[0] : 'home' };
    }
    function go(where) { if (location.hash !== '#/' + where) location.hash = '#/' + where; else render(); window.scrollTo(0, 0); }
    function frame() {
        $('app').innerHTML =
            '<header class="top"><div class="top-row"><button class="icon-btn back" id="back" aria-label="Back">‹</button><h1 id="title">Family Admin</h1><span class="sync" id="sync"></span>' +
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
        $('back').style.display = r.w || r.s ? '' : 'none';
        $('body').onclick = null;
        if (!DATA) { $('title').textContent = 'Family Admin'; $('body').innerHTML = '<div class="empty">Loading…</div>'; return; }
        if (!DATA.widgets) { $('body').innerHTML = '<div class="empty">Update the Google Apps Script to the latest version.</div>'; return; }
        if (r.w) renderWidget(r.w);
        else if (r.s) renderSection(r.s);
        else ({ home: renderHome, points: renderPoints, lists: renderLists, layout: renderLayout, settings: renderSettings })[r.tab]();
        var n = notices();
        if (n) $('body').insertAdjacentHTML('afterbegin', n);
        privacyCheck();
    }
    function title(t) { $('title').textContent = t; }

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
        else if (L && L.state === 'trial' && r.tab === 'home' && !r.w) out += '<div class="banner">' + esc(L.message) + ' <button class="link" data-go="s/licence">Add your key</button></div>';
        if (DATA.moving && r.s !== 'updates') out += '<div class="banner warn"><b>Moving to a new Sheet isn’t finished.</b> <button class="link" data-go="s/updates">What to do</button></div>';
        else if (DATA.versions && DATA.versions.warn && r.s !== 'updates' && !r.w) out += '<div class="banner warn"><b>The Google script has used ' + DATA.versions.used + ' of its ' + DATA.versions.max + ' saved versions.</b> <button class="link" data-go="s/updates">Sort it out</button></div>';
        if (DATA.codeWeak && r.tab === 'home' && !r.w) out += '<div class="banner warn"><b>Your access code is weak.</b> <button class="link" data-go="s/access">Fix it</button></div>';
        if (LATEST && DATA.scriptVersion && newer(LATEST.script, DATA.scriptVersion) && r.s !== 'updates' && !r.w && (r.tab === 'home' || r.tab === 'settings'))
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
        var c = FD.config(), base = location.href.replace(/admin\/.*$/, '') + 'setup/';
        return base + '#api=' + encodeURIComponent(c.url) + '&code=' + encodeURIComponent(c.code) + '&go=' + step;
    }
    function L() { return (DATA && DATA.limits) || { reminder: 12, boyName: 10, task: 22, todo: 22, destination: 16, reason: 30, maxPoints: 999 }; }
    function typeOf(t) { return (DATA.types || []).filter(function (x) { return x.type === t; })[0] || { name: t, icon: '', settings: [], sizes: ['full'] }; }
    function pageTypeOf(t) { return (DATA.pageTypes || []).filter(function (x) { return x.type === t; })[0] || { name: t, settings: [] }; }
    function pageOf(id) { return (DATA.pages || []).filter(function (p) { return p.id === id; })[0]; }
    function widgetOf(id) { return (DATA.widgets || []).filter(function (w) { return w.id === id; })[0]; }
    function widgetsOn(pid) { return (DATA.widgets || []).filter(function (w) { return w.page === pid; }); }
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
            if (!w.show || !filter(w)) return false;
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
    function renderHome() {
        title('Family Admin');
        var h = new Date().getHours(), pp = pointsPage();
        var everyday = (pp && pp.show ? tile('points', '★', pp.title, esc(DATA.state.boys.map(function (b) { return b.name + ' ' + b.balance; }).join(' · '))) : '') +
            distinct(function (w) { return EVERYDAY[w.type]; }).map(function (w) { return tile('w/' + w.id, esc(typeOf(w.type).icon), widgetName(w), esc(everydayLine(w))); }).join('') +
            tile('lists', '☰', 'All lists', 'Notes, shopping and to-dos together');
        var glance = distinct(function (w) { return GLANCE[w.type]; }).map(function (w) { return tile('w/' + w.id, esc(typeOf(w.type).icon), widgetName(w), glanceLine(w)); }).join('');
        var cal = location.href.replace(/admin\/.*$/, '') + 'calendar/';
        $('body').innerHTML = '<p class="hello">' + (h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening') + '</p>' +
            '<h3 class="sec">Everyday</h3><div class="tiles">' + everyday +
            '<a class="tile" href="' + esc(cal) + '"><span class="t-ico">📅</span><b>Calendar</b><small>Opens the Family Calendar app</small></a></div>' +
            (glance ? '<h3 class="sec">At a glance <button class="link" id="glRefresh">Refresh</button></h3><div class="tiles">' + glance + '</div>' : '') +
            '<h3 class="sec">Set up</h3><div class="tiles">' + tile('layout', '▦', 'Screen layout', 'What goes where on the screen') +
            Object.keys(SECTIONS).filter(function (k) { return k !== 'advanced'; }).map(function (k) { var x = SECTIONS[k]; return tile('s/' + k, x[0], x[1], esc(sectionLine(k))); }).join('') + '</div>';
        if ($('glRefresh')) $('glRefresh').onclick = function () { fetchGlance(true); FD.toast('Refreshing…'); };
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
                '<button class="btn ghost wide" data-go="layout">Move it on the screen</button>', 'w-set');
        $('wSet').onclick = function () { widgetSheet(w); };
        if (WIRE[w.type]) WIRE[w.type](w);
        if (GLANCE[w.type] && !GL[w.id]) fetchWidget(w.id);
    }
    function waiting(w) { var d = GL[w.id]; return !d ? '<div class="empty">Loading…</div>' : d.error ? '<div class="err small">⚠ ' + esc(d.error) + '</div>' : ''; }
    function rows(list, fn, none) { return list.length ? '<div class="rows">' + list.map(fn).join('') + '</div>' : '<div class="empty">' + (none || 'Nothing to show') + '</div>'; }
    function row(left, right, sub, cls) { return '<div class="r' + (cls ? ' ' + cls : '') + '"><span class="r-l">' + left + (sub ? '<small>' + sub + '</small>' : '') + '</span>' + (right != null ? '<b class="r-r">' + right + '</b>' : '') + '</div>'; }

    var VIEWS = {
        memo: function () { return card('Notes on the screen', memoEditor()); },
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
            var d = GL[w.id]; if (!d || d.error) return card('', waiting(w));
            return card('Next collections', rows(d.upcoming, function (u) {
                return row(u.daysAway === 0 ? 'Today' : u.daysAway === 1 ? 'Tomorrow' : nice(u.date), u.daysAway > 1 ? 'in ' + u.daysAway + ' days' : '', esc(u.bins.map(function (b) { return b.bin; }).join(', ')));
            }, 'No collections found'));
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
    var WIRE = { memo: function () { wireMemo(); }, list: wireList, todo: wireList, whereabouts: wireWhere };

    /* ================================================================ points */

    function renderPoints() {
        var pp = pointsPage(), s = DATA.state;
        title(pp ? pp.title : 'Points');
        if (!s || !s.boys.length) {
            $('body').innerHTML = card('No children on the points page', '<p class="mute">Choose who’s on the points page in Family & children.</p><button class="btn wide" data-go="s/family">Family & children</button>');
            return;
        }
        var target = s.cashIn.points;
        var tasks = (DATA.tasks || []).slice().sort(function (a, b) { return (+a.Order || 999) - (+b.Order || 999); });
        $('body').innerHTML = s.boys.map(function (b, i) {
            var pct = Math.min(100, b.balance / target * 100), can = b.balance >= target;
            return '<section class="card boy" style="--c:' + esc(b.colour) + '">' +
                '<div class="boy-top"><h2>' + esc(b.name) + '</h2></div>' + reminders(b) +
                '<div class="score"><b>' + b.balance + '</b><span>points</span><span class="to">' + (can ? 'Ready to cash in!' : (target - b.balance) + ' to £' + s.cashIn.value) + '</span></div>' +
                '<div class="bar"><span style="width:' + pct + '%"></span></div>' +
                '<div class="row-btns">' + s.penalties.map(function (p) { return '<button class="pen" data-pen="' + i + ':' + p + '">−' + p + '</button>'; }).join('') +
                    '<button class="bonus" data-bonus="' + i + '">+ Bonus</button></div>' +
                '<button class="btn wide cash' + (can ? '' : ' off') + '" data-cash="' + i + '"' + (can ? '' : ' disabled') + '>Cash in ' + target + ' for £' + s.cashIn.value + '</button>' +
                '<h3>Tasks (' + (b.allTasks || b.tasks).length + ')</h3>' + ((b.allTasks || b.tasks).length ? (b.allTasks || b.tasks).map(function (t) {
                    return '<button class="task" data-task="' + i + ':' + esc(t.id) + '"><span class="tick"></span><span class="tx">' + esc(t.text) + '</span><b>+' + t.points + '</b></button>';
                }).join('') : '<div class="mute small">No tasks waiting</div>') +
                '<h3>This morning</h3>' + (b.todos.length ? b.todos.map(function (t, j) {
                    return '<button class="todo' + (t.done ? ' done' : '') + '" data-todo="' + i + ':' + j + '"><span class="box"></span>' + esc(t.item) + '</button>';
                }).join('') : '<div class="mute small">Nothing today</div>') +
                '<h3>Statement <button class="link" data-stmt="' + i + '">See all</button></h3>' + b.statement.slice(0, 3).map(function (l) {
                    return '<div class="st"><span>' + esc(l.text) + '</span><b class="' + (l.points < 0 ? 'neg' : 'pos') + '">' + (l.points > 0 ? '+' : '') + l.points + '</b></div>';
                }).join('') + '</section>';
        }).join('') +
            '<h3 class="sec">Set up points</h3>' +
            '<details class="card fold" id="fTasks"><summary><b>Tasks</b><span class="mute">' + tasks.length + ' · what earns points</span></summary>' +
                '<button class="btn wide top-btn" id="newTask">+ New task</button>' + (tasks.length ? tasks.map(function (t) {
                    return '<div class="trow' + (t.Active ? '' : ' paused') + '"><div class="tmain"><b>' + esc(t.Task) + '</b><span class="mute">' + esc(t.Boy || 'All') + ' · ' +
                        esc(t.Repeat || 'once') + (t.Active ? '' : ' · paused') + '</span></div><b class="pos">+' + esc(t.Points) + '</b>' +
                        '<button class="btn ghost sm" data-edit="' + esc(t.ID) + '">Edit</button></div>';
                }).join('') : '<div class="empty">No tasks yet</div>') + '<p class="mute small">Each child sees their next three open tasks on the screen, lowest order first.</p></details>' +
            listFold('todos') + listFold('timetable') +
            '<details class="card fold"><summary><b>Points rules</b><span class="mute">' + target + ' points = £' + s.cashIn.value + ' · penalties ' + esc(s.penalties.join(', ')) + '</span></summary>' +
                '<p class="mute small">How many points make a cash-in, what it’s worth, and the penalty buttons.</p><button class="btn ghost wide" id="rules">Change the rules</button></details>' +
            '<a class="link-card" data-go="s/family" href="#"><b>Who’s on the points page ›</b><span class="mute small">Add or rename children, or take someone off the points page, in Family & children.</span></a>';
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

    function renderLists() {
        title('Lists');
        var ws = distinct(function (w) { return w.type === 'memo' || w.type === 'list' || w.type === 'todo'; });
        if (!ws.length) { $('body').innerHTML = card('No lists on the screen', '<p class="mute">Add a Memo, List or To-do widget on the Screen tab.</p><button class="btn wide" data-go="layout">Screen layout</button>'); return; }
        // Only one list at a time can be edited here (the editors share element ids), so the others show a summary.
        var open = sessionStorage.getItem('fdadmin.openList') || ws[0].id;
        if (!ws.some(function (w) { return w.id === open; })) open = ws[0].id;
        $('body').innerHTML = '<div class="seg lseg" id="lseg">' + ws.map(function (w) { return '<button data-l="' + esc(w.id) + '" class="' + (w.id === open ? 'on' : '') + '">' + esc(typeOf(w.type).icon) + ' ' + esc(widgetName(w)) + '</button>'; }).join('') + '</div>' +
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
    function memoEditor() {
        return '<div class="ls-add"><input id="mmNew" maxlength="' + (L().memo || 80) + '" placeholder="Write a note…" autocomplete="off"></div>' +
            '<div class="ls-add"><input id="mmFrom" maxlength="12" placeholder="From (optional)" value="' + esc(localStorage.getItem('fdadmin.from') || '') + '" autocomplete="off"><button class="btn sm" id="mmAdd">Add</button></div>' +
            '<div id="mmItems">' + memoItems() + '</div>';
    }
    function memoItems() {
        var m = DATA.memos || [];
        return m.length ? m.slice().reverse().map(function (x) {
            return '<div class="ls-row"><span class="mm-x"><b>' + esc(x.text) + '</b><small>' + (x.from ? esc(x.from) + ' · ' : '') + esc(x.added) + '</small></span><button class="x" data-mrm="' + esc(x.id) + '">✕</button></div>';
        }).join('') : '<div class="mute small">No notes</div>';
    }
    function wireMemo() {
        function after() { return load().then(function () { if ($('mmItems')) $('mmItems').innerHTML = memoItems(); }); }
        $('mmAdd').onclick = function () {
            var t = $('mmNew').value.trim(), f = $('mmFrom').value.trim(); if (!t) return;
            try { localStorage.setItem('fdadmin.from', f); } catch (e) { /* ignore */ }
            $('mmNew').value = '';
            act({ action: 'memo', op: 'add', text: t, from: f }, 'Note added').then(after, function () {});
        };
        $('mmNew').onkeydown = function (e) { if (e.key === 'Enter') $('mmAdd').onclick(); };
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
        var pages = DATA.pages || [];
        $('body').innerHTML = '<p class="mute small help">Each widget is a quarter of the screen wide, full or half height. Two half-height widgets share a column. Tap a widget to change its settings.</p>' +
            pages.map(function (p, i) {
                var ws = widgetsOn(p.id), isW = p.type === 'widgets';
                return '<section class="card pg' + (p.show ? '' : ' off') + '"><div class="pg-top"><span class="pg-ico">' + esc(p.icon) + '</span><h2>' + esc(p.title) + '</h2>' +
                    '<span class="badge">' + esc(isW ? ws.length + ' widget' + (ws.length === 1 ? '' : 's') : pageTypeOf(p.type).name) + '</span>' + (p.show ? '' : '<span class="badge">hidden</span>') +
                    '<button class="mini" data-pmove="' + esc(p.id) + ':-1"' + (i ? '' : ' disabled') + '>▲</button><button class="mini" data-pmove="' + esc(p.id) + ':1"' + (i < pages.length - 1 ? '' : ' disabled') + '>▼</button>' +
                    '<button class="btn ghost sm" data-pedit="' + esc(p.id) + '">Edit</button></div>' +
                    (isW ? preview(p.id) + '<div class="wl">' + ws.map(function (w, j) {
                        var T = typeOf(w.type);
                        return '<div class="wrow' + (w.show ? '' : ' off') + '"><button class="wmain" data-w="' + esc(w.id) + '"><span class="wico">' + esc(T.icon) + '</span><span class="wtx"><b>' + esc(T.name) + '</b><small>' +
                            esc(summary(w)) + '</small></span><span class="badge">' + (w.show ? w.size : 'hidden') + '</span></button>' +
                            '<button class="mini" data-wmove="' + esc(w.id) + ':-1"' + (j ? '' : ' disabled') + '>▲</button><button class="mini" data-wmove="' + esc(w.id) + ':1"' + (j < ws.length - 1 ? '' : ' disabled') + '>▼</button></div>';
                    }).join('') + '</div><button class="btn ghost wide" data-wadd="' + esc(p.id) + '">+ Add a widget to ' + esc(p.title) + '</button>' : '') +
                    '</section>';
            }).join('') +
            '<button class="btn ghost wide" id="pAdd">+ New widget page</button>';
        $('pAdd').onclick = function () { newPageSheet(); };
        $('body').onclick = function (e) {
            var el;
            if ((el = e.target.closest('[data-w]'))) widgetSheet(widgetOf(el.getAttribute('data-w')));
            else if ((el = e.target.closest('[data-wmove]'))) { var a = el.getAttribute('data-wmove').split(':'); act({ action: 'moveWidget', id: a[0], dir: +a[1] }); }
            else if ((el = e.target.closest('[data-pmove]'))) { var b = el.getAttribute('data-pmove').split(':'); act({ action: 'movePage', id: b[0], dir: +b[1] }); }
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
            case 'bins': return s.Postcode + ' · ' + s.House;
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
        return main.map(function (f) { return field(f, vals[f.k]); }).join('') +
            (adv.length ? '<details class="adv"><summary>More settings</summary>' + adv.map(function (f) { return field(f, vals[f.k]); }).join('') + '</details>' : '');
    }
    function readFields() {
        var out = {};
        Array.prototype.forEach.call(document.querySelectorAll('#sheet [data-f]'), function (i) { out[i.getAttribute('data-f')] = i.type === 'checkbox' ? i.checked : i.value.trim(); });
        return out;
    }

    function widgetSheet(w) {
        if (!w) return;
        var T = typeOf(w.type), pages = DATA.pages.filter(function (p) { return p.type === 'widgets'; });
        sheet('<h2>' + esc(T.icon) + ' ' + esc(T.name) + '</h2><p class="mute small">' + esc(T.about) + '</p>' +
            (route().w !== w.id && (VIEWS[w.type]) ? '<button class="btn ghost wide open-w" data-go="w/' + esc(w.id) + '">Open ' + esc(widgetName(w)) + ' ›</button>' : '') +
            '<div class="two"><div><label>Page</label><select id="wPage">' + pages.map(function (p) { return '<option value="' + esc(p.id) + '"' + (p.id === w.page ? ' selected' : '') + '>' + esc(p.title) + '</option>'; }).join('') + '</select></div>' +
            '<div><label>Height</label><select id="wSize"' + (T.sizes.length < 2 ? ' disabled' : '') + '>' + T.sizes.map(function (z) { return '<option value="' + z + '"' + (z === w.size ? ' selected' : '') + '>' + (z === 'full' ? 'Full height' : 'Half height') + '</option>'; }).join('') + '</select></div></div>' +
            '<label class="tog"><input type="checkbox" id="wShow"' + (w.show ? ' checked' : '') + '><span>Show on the screen</span></label>' +
            '<h3 class="sh">Settings</h3>' + fields(T.settings, w.settings) +
            '<div class="sheet-actions"><button class="btn ghost" id="wCancel">Cancel</button><button class="btn good" id="wSave">Save</button></div>' +
            '<div class="sheet-actions"><button class="btn bad" id="wDel">Remove this widget</button></div>');
        $('wCancel').onclick = closeSheet;
        $('wSave').onclick = function () {
            act({ action: 'saveWidget', widget: { id: w.id, page: $('wPage').value, size: $('wSize').value, show: $('wShow').checked, settings: readFields() } }, 'Saved – the screen updates within a minute')
                .then(function () { closeSheet(); delete GL[w.id]; if (route().w === w.id) fetchWidget(w.id); }, function () {});
        };
        $('wDel').onclick = function () {
            if (confirm('Remove the ' + T.name + ' widget and its settings?')) act({ action: 'deleteWidget', id: w.id }, 'Removed').then(function () { closeSheet(); if (route().w) go('layout'); }, function () {});
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
            act({ action: 'addWidget', page: pid, type: b.getAttribute('data-type') }, 'Added – tap it to change its settings').then(closeSheet, function () {});
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
        $('body').innerHTML = '<div class="menu">' + Object.keys(SECTIONS).map(function (k) {
            var x = SECTIONS[k];
            return '<button class="mrow" data-go="s/' + k + '"><span class="m-ico">' + x[0] + '</span><span class="m-tx"><b>' + esc(x[1]) + '</b><small>' + esc(sectionLine(k)) + '</small></span><i>›</i></button>';
        }).join('') + '</div><p class="mute small center">Family Admin · Google script ' + esc(DATA.scriptVersion || '?') + '</p>';
    }
    function renderSection(k) {
        title(SECTIONS[k][1]);
        ({ family: secFamily, keys: secKeys, home: secHome, screen: secScreen, licence: secLicence, updates: secUpdates, access: secAccess, advanced: secAdvanced, support: secSupport })[k]();
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
        $('body').innerHTML = '<p class="mute small help">Every key in one place. Each turns on live data for the widgets that use it; the ones marked <span class="need">needed</span> are for widgets on your screen. They’re all free.</p>' +
            card('', installFields('keys') + saveInstallBtn('kSave', 'Save keys')) +
            '<a class="link-card" href="' + esc(setupLink('keys')) + '" target="_blank" rel="noopener"><b>How to get each key ›</b><span class="mute small">Step-by-step guides in the setup app (easiest on a computer).</span></a>';
        wireSaveInstall('kSave');
    }
    function secHome() {
        var cp = (DATA.pages || []).filter(function (p) { return p.type === 'calendar'; })[0];
        $('body').innerHTML = card('Home', installFields('home') + saveInstallBtn('hSave', 'Save home address'), 'sx-home') +
            card('Calendars', installFields('calendar') + saveInstallBtn('cSave', 'Save calendars'), 'sx-cal') +
            (cp ? card('Calendar page on the screen', '<p class="mute small">Which view it opens on, and lining up the weekends in the 3-month views.</p><button class="btn ghost wide" id="calPage">Calendar page settings</button>') : '') +
            '<a class="link-card" data-go="s/family" href="#"><b>Calendar groups, categories and colours ›</b><span class="mute small">In Family & children.</span></a>';
        wireSaveInstall('hSave', document.querySelector('.sx-home')); wireSaveInstall('cSave', document.querySelector('.sx-cal'));
        if ($('calPage')) $('calPage').onclick = function () { pageSheet(cp); };
    }
    function secScreen() {
        $('body').innerHTML = card('Sleep', installFields('screen') + saveInstallBtn('scSave', 'Save')) +
            '<p class="mute small help">On the Windows PC, set Settings → System → Power → “Turn off my screen” to Never, so the dashboard’s own sleep screen is in charge and a touch always wakes it.</p>' +
            '<a class="link-card" data-go="layout" href="#"><b>Screen layout ›</b><span class="mute small">Pages, widgets and what goes where.</span></a>';
        wireSaveInstall('scSave');
    }
    function secAdvanced() {
        $('body').innerHTML = card('Where the apps are hosted', installFields('advanced') + saveInstallBtn('aSave')) +
            card('Setup app', '<p class="mute small">The full setup app, already connected. Easiest on a computer.</p>' +
                [['welcome', 'Start of the setup app', 'all the steps'], ['check', 'Check everything', 'tests every widget'], ['keys', 'Key guides', 'how to get each API key']].map(function (x) {
                    return '<a class="setup-link" href="' + setupLink(x[0]) + '" target="_blank" rel="noopener"><b>' + x[1] + '</b><span>' + x[2] + '</span><i>›</i></a>';
                }).join(''));
        wireSaveInstall('aSave');
    }

    /* ---- licence */
    function secLicence() {
        var Lc = DATA.licence || {};
        $('body').innerHTML = card('Your licence', !Lc.required ? '<p class="mute">Licence keys aren’t being checked yet. You can still add yours now.</p>'
                : '<p class="' + (Lc.ok ? (Lc.state === 'trial' ? '' : 'pos') : 'neg') + '"><b>' + (Lc.ok ? (Lc.state === 'trial' ? '⏳ ' : '✔ ') : '⚠ ') + esc(Lc.message) + '</b></p>' +
                  (Lc.key ? '<p class="mute small">Key ending …' + esc(Lc.key) + '</p>' : '')) +
            card(Lc.key ? 'Change the key' : 'Add your key', '<p class="mute small">It’s in your order email: FD- then four groups of five letters and numbers.</p>' +
                '<input id="licKey" class="mono" placeholder="FD-XXXXX-XXXXX-XXXXX-XXXXX" autocomplete="off" autocapitalize="characters" spellcheck="false">' +
                '<button class="btn wide" id="licGo">Check and save</button>' + (Lc.key ? '<button class="btn ghost wide" id="licRe">Check my licence again now</button>' : '')) +
            '<p class="mute small help">A key works on one dashboard at a time. If you move to a new Google Sheet or account, ask the seller to release it first. Once a day your Google script checks the key with the seller; if that can’t happen for 21 days, the screen asks for help.</p>';
        $('licGo').onclick = function () {
            var k = $('licKey').value.trim(); if (!k) { FD.toast('Type in your key', true); return; }
            var b = this; b.disabled = true; b.textContent = 'Checking…';
            FD.post({ action: 'setLicence', key: k }).then(function (d) { FD.toast(d.message || 'Saved'); DATA.licence = d.licence; load(); }, function (e) {
                b.disabled = false; b.textContent = 'Check and save'; FD.toast(/Unknown action/.test(e.message) ? 'Update the Google script first (Settings → Updates)' : e.message, true);
            });
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
            '<div class="row-between" style="margin-top:14px"><span><b>Automatic updates</b><br><span class="mute small">Updates itself within minutes of a new version (and checks hourly)</span></span>' +
            '<button class="btn ' + (DATA.autoUpdate ? 'good' : 'ghost') + '" id="suAuto">' + (DATA.autoUpdate ? 'On' : 'Off') + '</button></div>' +
            (last.at ? '<p class="mute small">Last automatic update: ' + esc(String(last.at).slice(0, 16).replace('T', ' ')) + ' – ' + esc(last.result || '') + (last.to ? ' (' + esc(last.to) + ')' : '') + (last.message ? '<br>' + esc(last.message) : '') + '</p>' : '') +
            '<details class="adv"><summary>What automatic updates need</summary><p class="small">Once per Google account, switch on <b>Google Apps Script API</b> at ' +
            '<a href="https://script.google.com/home/usersettings" target="_blank" rel="noopener">script.google.com/home/usersettings</a>. ' +
            'Your script then downloads new versions from ' + esc(DATA.appsAddress || '') + ' – only turn this on if you trust whoever publishes that site.</p></details>') +
            versionsCard() +
            (LATEST && LATEST.notes ? card('What’s new', '<ul class="pvl">' + LATEST.notes.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ul>') : '') +
            '<p class="mute small help">The screen and these phone apps update themselves.</p>' +
            '<a class="link-card" data-go="s/support" href="#"><b>Every version number, and diagnostics ›</b><span class="mute small">Screen, phone apps, Google script and licence server.</span></a>';
        wireAfresh();
        $('suNow').onclick = function () {
            var b = $('suNow'); b.disabled = true; b.textContent = 'Updating… (up to a minute)';
            FD.post({ action: 'selfUpdate', why: 'app' }).then(function (r) {
                FD.toast(r.updated ? 'Updated to ' + r.to : r.upToDate ? 'Already up to date' : (r.message || 'Done'), !r.updated && !r.upToDate);
                load();
            }).catch(function (e) {
                FD.toast(e.message, true); b.disabled = false; b.textContent = 'Try again';
                if (/Apps Script API/.test(e.message)) sheet('<h2>One-time switch needed</h2><p>' + esc(e.message) + '</p><ol><li>Open <a href="https://script.google.com/home/usersettings" target="_blank" rel="noopener">script.google.com/home/usersettings</a> (signed in as the Sheet’s owner).</li><li>Switch <b>Google Apps Script API</b> on.</li><li>Come back and press Update again.</li></ol><p class="mute small">Tap outside this box to close it.</p>');
            });
        };
        $('suAuto').onclick = function () {
            act({ action: 'autoUpdate', on: !DATA.autoUpdate }).then(function (r) {
                FD.toast(r.autoUpdate ? 'Automatic updates on' : 'Automatic updates off');
                if (r.warning) sheet('<h2>Automatic updates are on, but…</h2><p>' + esc(r.warning) + '</p><p>Switch on <b>Google Apps Script API</b> at <a href="https://script.google.com/home/usersettings" target="_blank" rel="noopener">script.google.com/home/usersettings</a>.</p>');
                load();
            }, function () {});
        };
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
            rowv('Google script', DATA.scriptVersion, L.script, DATA.autoUpdate ? 'updates itself' : 'automatic updates off') +
            rowv('Licence server', DATA.licenceServerVersion || (DATA.licence && DATA.licence.required ? '?' : 'not in use'), null) +
            rowv('Newest on GitHub', L.app ? 'apps ' + L.app + ' · script ' + L.script : '?', null) +
            '<div class="r"><span class="r-l">Saved versions (Google script)<small>Google allows ' + ((DATA.versions || {}).max || 200) + '; each update uses one</small></span><b class="r-r ' + (DATA.versions && DATA.versions.warn ? 'neg' : '') + '">' +
                (DATA.versions ? DATA.versions.used + ' used · ' + (DATA.versions.max - DATA.versions.used) + ' left' : '?') + '</b></div>' +
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
        if (mv) return card('Finish moving to the new Sheet', '<p>The new Sheet is ready. Open it, wait for the <b>🏠 Family Dashboard</b> menu, and choose <b>Finish moving here</b> – Google asks you to allow the script, as it did the first time.</p>' +
            '<a class="btn wide" href="' + esc(mv.sheetUrl) + '" target="_blank" rel="noopener">Open the new Sheet</a><p class="mute small">Until then everything carries on working from this Sheet.</p>');
        var pct = v ? Math.min(100, v.used / v.max * 100) : 0;
        return card('Saved versions', (v ? '<p><b>' + v.used + ' of ' + v.max + '</b> used' + (v.stale ? ' (last count)' : '') + ' – each update of the Google script uses one.</p>' +
                '<div class="bar' + (v.warn ? ' warnbar' : '') + '"><span style="width:' + pct + '%"></span></div>'
                : '<p class="mute">Not known – switch on the Google Apps Script API (see Automatic updates above).</p>') +
            (v && v.warn ? '<p class="neg"><b>Nearly full.</b> When it’s full the script can’t update. Start afresh below (easiest), or delete old versions in Apps Script → Project history.</p>' : '') +
            '<details class="adv"' + (v && v.warn ? ' open' : '') + '><summary>Start afresh in a new Sheet</summary><p class="small">Makes a brand-new Google Sheet with its own script (0 versions used) and copies <b>everything</b> into it: every tab and its data, the settings, your licence, and automatic updates. ' +
            'The screen and phones follow by themselves. This Sheet is kept as a backup.</p><p class="small">You’ll need to open the new Sheet once and click Allow, as when you first set up.</p>' +
            '<button class="btn wide" id="afresh">Start afresh</button></details>');
    }
    function wireAfresh() {
        if (!$('afresh')) return;
        $('afresh').onclick = function () {
            if (!confirm('Make a new Sheet and copy everything into it?')) return;
            var b = this; b.disabled = true; b.textContent = 'Copying everything… (up to a minute)';
            FD.post({ action: 'startAfresh' }).then(function (d) { FD.toast('New Sheet ready'); DATA.moving = { sheetUrl: d.sheetUrl, url: d.url }; render(); load(); },
                function (e) { b.disabled = false; b.textContent = 'Start afresh'; FD.toast(/Unknown action/.test(e.message) ? 'Update the Google script first' : e.message, true); });
        };
    }

    /* ---- access code & devices */
    function secAccess() {
        var c = FD.config();
        $('body').innerHTML = card('Connect phones and the screen', '<p class="mute small">QR codes, links and the Windows start file are in the setup app.</p>' +
                '<a class="setup-link" href="' + setupLink('devices') + '" target="_blank" rel="noopener"><b>Connect your devices</b><span>QR codes, links and the PC start file</span><i>›</i></a>') +
            card('Access code', '<p class="mute small">' + (DATA.codeWeak ? '⚠ Your access code is weak. ' : '') + 'The code protects your dashboard: anyone with your links and code can use it. ' +
                'After changing it, every other device needs its new link and the PC needs its new start file. This phone updates itself.</p>' +
                '<button class="btn wide" id="cNew">Make a new strong code for me</button>' +
                '<label>Or choose your own <span class="cnt">8+ characters, letters, numbers and a special character</span></label>' +
                '<input id="cOwn" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="e.g. Garden-Gnome-42">' +
                '<div class="mute small hint" id="cHint"></div><button class="btn ghost wide" id="cSet">Use this code</button><div id="cDone"></div>') +
            card('This phone', '<p class="mute small">Connected to ' + esc(c.url.replace(/^https:\/\/script\.google\.com\/macros\/s\//, '').slice(0, 14)) + '…</p><button class="btn ghost wide" id="sOut">Disconnect this phone</button>');
        function codeProblem(v) {
            if (v.length < 8) return 'at least 8 characters';
            if (/\s/.test(v)) return 'no spaces';
            if (!/[A-Za-z]/.test(v) || !/[0-9]/.test(v)) return 'letters and numbers';
            if (!/[^A-Za-z0-9]/.test(v)) return 'at least one special character, e.g. ! * - _ . ~';
            return '';
        }
        $('cOwn').oninput = function () { var p = codeProblem($('cOwn').value); $('cHint').textContent = $('cOwn').value ? (p ? 'Needs ' + p : '✔ Good') : ''; };
        function changeCode(newCode) {
            if (!confirm('Change the access code? Other phones, tablets and the screen will need their new link.')) return;
            act({ action: 'changeCode', newCode: newCode }).then(function (d) {
                var cc = FD.config();
                FD.setConfig(cc.url, d.code);
                var base = location.href.replace(/admin\/.*$/, '');
                var link = function (app) { return base + app + '/#api=' + encodeURIComponent(cc.url) + '&code=' + encodeURIComponent(d.code); };
                $('cDone').innerHTML = '<p class="small"><b>✔ Changed.</b> New links (private):</p>' +
                    ['admin', 'calendar', 'screen'].map(function (a) { return '<label>' + { admin: 'Family Admin', calendar: 'Family Calendar', screen: 'Screen' }[a] + '</label><textarea readonly rows="3">' + esc(link(a)) + '</textarea>'; }).join('') +
                    '<p class="mute small">Or open the setup app on a computer → Connect your devices, for QR codes and the new start file.</p>';
                DATA.codeWeak = false;
            }, function () {});
        }
        $('cNew').onclick = function () { changeCode(''); };
        $('cSet').onclick = function () { var v = $('cOwn').value.trim(), p = codeProblem(v); if (p) { FD.toast('The code needs ' + p, true); return; } changeCode(v); };
        $('sOut').onclick = function () { if (confirm('Disconnect this phone? You’ll need the setup link again.')) { FD.clearConfig(); try { localStorage.removeItem('fdadmin.data'); } catch (e) { /* ignore */ } location.reload(); } };
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
            '<p class="mute small" id="famNote"></p><button class="btn wide" id="famSave">Save family</button></div>';
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
    if (FD.configured()) start(); else FD.setupScreen($('app'), 'Family Admin', start);
})();
