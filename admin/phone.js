/* Family Admin – the grown-ups' phone app. Written for a narrow phone screen, not a copy of the Configurator website:
 * six buttons along the top, and each page one long list you scroll up and down.
 *
 *   📅 Calendar   add an event; what's coming up (each one can be deleted)
 *   📌 Notes      the notes on the dashboard – add one, take one off
 *   📝 Lists      the General Lists and To-Do (Google)
 *   🎒 Reminders  PE kit, library books… – add, change, clear expired, when tomorrow's show
 *   ⭐ Rewards    View: each child, fully open. Configure: Reward Tasks, Daily To-Dos, Reminder Display, rules, adjustments
 *   🧩 Other      each other widget's own settings, one at a time (the simple ones – the rest are on a computer)
 *   ☰ More       connect a display, add a phone, help, feedback – and everything else is on the computer website
 *
 * Routes: #/calendar #/notes #/lists #/reminders #/points[/tasks|todos|remdisplay|rules|adjust] #/other #/w/<widget id> #/more #/connect #/phones #/feedback
 */
(function () {
    'use strict';
    var FD = window.FD, esc = FD.esc;
    var $ = function (id) { return document.getElementById(id); };
    var DATA = null, CAL = { data: null, page: null, at: 0 };
    try { DATA = JSON.parse(localStorage.getItem('fdadmin.data') || 'null'); } catch (e) { DATA = null; }

    var ROOT = location.href.replace(/[#?].*$/, '').replace(/(admin|setup|settings)\/.*$/, '').replace(/index\.html$/, '');
    var HOST = ROOT.replace(/^https?:\/\//, '').replace(/\/$/, '');
    function IC(k, e) { return (window.FD_ICONS && FD_ICONS[k]) || e; }
    var TABS = [['calendar', '📅', 'Calendar'], ['notes', '📌', 'Notes'], ['lists', IC('lists', '📝'), 'Lists'], ['reminders', IC('reminders', '🎒'), 'Reminders'], ['points', '⭐', 'Rewards'], ['other', IC('other', '🧩'), 'Other'], ['more', '☰', 'More']];
    var OLD = { memos: 'notes', rewards: 'points', family: 'points', widgets: 'other', timetable: 'reminders', settings: 'more', s: 'more', help: 'more', feedback: 'feedback', dhome: 'calendar', home: 'calendar' };
    document.title = 'HouseRunner – Family Admin App';

    /* ------------------------------------------------------------------ data and saving */

    function setData(d) {
        DATA = d; if (d && d.locale && FD.setLocale) FD.setLocale(d.locale);
        try { localStorage.setItem('fdadmin.data', JSON.stringify(d)); } catch (e) { /* too big – fine */ }
    }
    var loading = null;
    function load(quiet) {
        dot('busy');
        loading = FD.post({ action: 'admin' }, 60000).then(function (d) { setData(d); dot('ok'); loading = null; draw(); privacy(); },
            function (e) { dot('err'); loading = null; if (!quiet) FD.toast(e.message, true); if (!DATA) draw(e.message); });
        return loading;
    }
    // One change at a time, in order; the reply updates what's on the phone.
    var queue = Promise.resolve();
    function act(body, ok) {
        dot('busy');
        var run = function () {
            return FD.post(body, 60000).then(function (d) {
                if (d && d.saved && d.rows) DATA[d.saved] = d.rows;
                else if (d && d.layoutOnly) { DATA.pages = d.pages; DATA.widgets = d.widgets; }
                else if (d && d.state && !d.tasks) DATA.state = d.state;
                else if (d && d.tasks) setData(d);
                if (d && d.data && body.widget && DATA.lists) DATA.lists[body.widget] = d.data;
                setData(DATA); dot('ok');
                if (ok) FD.toast(ok, false, d && d.id && /^(adjust|penalty|complete|cashin)$/.test(body.action) ? function () { act({ action: 'undo', id: d.id }, 'Undone').then(draw); } : null);
                return d;
            });
        };
        var p = queue.then(run, run);
        queue = p.catch(function () { /* the next one still goes */ });
        return p.catch(function (e) { dot('err'); FD.toast(e.message, true); throw e; });
    }
    function dot(k) { var s = $('faDot'); if (s) s.className = 'fa-dot ' + k; }

    /* ------------------------------------------------------------------ frame */

    function route() {
        var h = location.hash.replace(/^#\/?/, '').split('/'), t = h[0] || 'calendar';
        if (t === 'w' && h[1]) return { tab: 'other', w: decodeURIComponent(h[1]) };
        if (t === 'rewards' && h[1] === 'timetable') return { tab: 'reminders' };
        if ((t === 'points' || t === 'rewards') && h[1]) return { tab: 'points', sub: h[1] };
        if (t === 's' && /devices|access/.test(h[1] || '')) return { tab: 'more', page: 'connect' };
        if (t === 'connect' || t === 'phones' || t === 'feedback' || t === 'diag') return { tab: 'more', page: t };
        if (OLD[t]) t = OLD[t];
        if (t === 'feedback') return { tab: 'more', page: 'feedback' };
        return { tab: TABS.some(function (x) { return x[0] === t; }) ? t : 'calendar' };
    }
    function go(where) { if (location.hash !== '#/' + where) location.hash = '#/' + where; else draw(); }
    function frame() {
        document.body.classList.remove('desk', 'phone'); document.body.classList.add('fa');
        $('app').innerHTML = '<nav class="fa-top" id="faTop">' + TABS.map(function (t) {
            return '<button data-t="' + t[0] + '"><i>' + t[1] + '</i><span>' + t[2] + '</span>' + (t[0] === 'more' ? '<b class="fa-dot" id="faDot"></b>' : '') + '</button>';
        }).join('') + '</nav><div id="faBanner"></div><main class="fa-main" id="faMain"></main>' +
            '<div class="fa-sheet-bg" id="faSheetBg"><div class="fa-sheet" id="faSheet"></div></div>';
        $('faTop').onclick = function (e) {
            var b = e.target.closest('[data-t]'); if (!b) return;
            var t = b.getAttribute('data-t');
            if (route().tab === t && !route().w && !route().page && !route().sub) { load(); if (t === 'calendar') CAL.at = 0; FD.toast('Refreshing…'); }     // tap again = refresh
            go(t);
        };
        document.addEventListener('click', function (e) { var g = e.target.closest && e.target.closest('[data-go]'); if (g) { e.preventDefault(); go(g.getAttribute('data-go')); } });
        $('faSheetBg').onclick = function (e) { if (e.target === this && !this.hasAttribute('data-must')) closeSheet(); };
        window.addEventListener('hashchange', function () { closeSheet(); draw(); window.scrollTo(0, 0); });
        document.addEventListener('visibilitychange', function () { if (!document.hidden) load(true); });
    }
    function sheet(html, must) { $('faSheet').innerHTML = html; $('faSheetBg').classList.add('on'); if (must) $('faSheetBg').setAttribute('data-must', ''); else $('faSheetBg').removeAttribute('data-must'); }
    function closeSheet() { $('faSheetBg').classList.remove('on'); $('faSheetBg').removeAttribute('data-must'); }

    function draw(err) {
        var r = route();
        Array.prototype.forEach.call(document.querySelectorAll('#faTop [data-t]'), function (b) { b.classList.toggle('on', b.getAttribute('data-t') === r.tab); });
        $('faBanner').innerHTML = banner();
        if (!DATA) { $('faMain').innerHTML = err ? box('<b>Can’t reach your family’s Google Sheet</b><p class="mute">' + esc(err) + '</p><button class="btn wide" id="faRetry">Try again</button>') : '<div class="fa-empty">Loading…</div>'; if ($('faRetry')) $('faRetry').onclick = function () { load(); }; return; }
        $('faMain').onchange = null;
        var page = r.w ? widgetPage : r.page === 'connect' ? connectPage : r.page === 'phones' ? phonesPage : r.page === 'feedback' ? feedbackPage : r.page === 'diag' ? diagPage : PAGES[r.tab];
        page(r.w || r.sub);
    }
    function banner() {
        var L = DATA && DATA.licence;
        if (L && L.required && !L.ok) return '<div class="fa-banner warn">🎫 ' + esc(L.message) + ' – add your licence key on a computer at <b>' + esc(HOST) + '</b> → System → Licence.</div>';
        return '';
    }

    /* ------------------------------------------------------------------ little pieces */

    function h(text, extra) { return '<h2 class="fa-h">' + text + (extra || '') + '</h2>'; }
    function box(html, cls) { return '<section class="fa-box' + (cls ? ' ' + cls : '') + '">' + html + '</section>'; }
    function empty(t) { return '<div class="fa-empty">' + t + '</div>'; }
    function computer(what) {
        return '<p class="fa-pc">💻 ' + what + ' on a computer at <b>' + esc(HOST) + '</b>.</p>';
    }
    var DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    function ymd(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
    function nice(s) { var d = FD.parse(s); return DOW[d.getDay()] + ' ' + FD.dm(d.getDate(), d.getMonth()); }
    function L() { return (DATA && DATA.limits) || { reason: 30, memo: 80, maxNotes: 6, listItem: 30 }; }
    function typeOf(t) { return (DATA.types || []).filter(function (x) { return x.type === t; })[0] || { name: t, icon: '🧩', settings: [], about: '' }; }
    function widgetOf(id) { return (DATA.widgets || []).filter(function (w) { return w.id === id; })[0]; }
    function pageOf(id) { return (DATA.pages || []).filter(function (p) { return p.id === id; })[0]; }
    /** The widgets of some kinds that are on a screen – one of each copy (the same widget on two screens shows once). */
    function onScreens(which) {
        var seen = {};
        return (DATA.widgets || []).filter(function (w) {
            if (!which(w) || !w.show || w.pending) return false;
            var p = pageOf(w.page); if (!p || !p.show) return false;
            var k = w.type + '|' + JSON.stringify(w.settings || {}); if (seen[k]) return false; seen[k] = 1; return true;
        });
    }
    /** The same names as the Configurator uses. */
    function nameOf(w) {
        var T = typeOf(w.type), st = w.settings || {};
        if (w.type === 'list') return st.ListName || 'General List';
        if (w.type === 'todo') return 'To-Do (Google)';
        if (w.type === 'memo') return 'Notes';
        if (w.type === 'whereabouts') return 'Weasley Clock';
        if (w.type === 'countdown') return st.Title || 'Countdown';
        if (w._copies === undefined) otherList();
        return T.name.replace(/ \(.*\)$/, '') + (w._copies > 1 ? ' ' + w._copy : '');
    }

    /* ------------------------------------------------------------------ 📅 Calendar */

    function calendarPage() {
        var cps = (DATA.pages || []).filter(function (p) { return p.type === 'calendar'; }), cur = '';
        try { cur = localStorage.getItem('fdadmin.calPage') || ''; } catch (e) { /* fine */ }
        if (!cps.some(function (p) { return p.id === cur; })) cur = cps.length ? cps[0].id : '';
        var today = new Date(); today.setHours(0, 0, 0, 0);
        var D = CAL.page === cur ? CAL.data : null, addable = D ? D.addable || [] : [];
        var days = D ? Object.keys(D.days || {}).sort() : [];
        var t0 = ymd(today), t1 = ymd(new Date(today.getTime() + 864e5));
        $('faMain').innerHTML =
            (cps.length > 1 ? '<div class="fa-seg" id="calPick">' + cps.map(function (p) { return '<button data-cp="' + esc(p.id) + '"' + (p.id === cur ? ' class="on"' : '') + '>' + esc(p.title) + '</button>'; }).join('') + '</div>' : '') +
            '<button class="btn fa-add" id="evOpen">+ Add an event</button>' +
            h('Coming up', '<small>the next five weeks</small>') +
            '<p class="fa-foot fa-cal-note">The whole calendar – week and month – is in the <a href="' + esc(ROOT) + 'dashboard/">Family Dashboard</a> app.</p>' +
            (!D ? empty('Loading…') : !days.length ? empty('Nothing in the next five weeks') : days.map(function (k) {
                return '<div class="fa-day"><h3>' + (k === t0 ? 'Today' : k === t1 ? 'Tomorrow' : esc(nice(k))) + '</h3>' + D.days[k].map(function (e, n) {
                    return '<div class="fa-row ev"><span class="fa-swatch" style="background:' + esc(e.c || '#888') + '"></span><span class="fa-cat">' + esc(e.cat || '') + '</span><span class="fa-t"><b>' + esc(e.t) + (e.time ? '<span class="fa-time">' + esc(e.time) + '</span>' : '') + '</b></span>' +
                        '<button class="fa-x" data-del="' + esc(k) + '|' + n + '" aria-label="Delete">✕</button></div>';
                }).join('') + '</div>';
            }).join(''));
        if ($('calPick')) $('calPick').onclick = function (e) { var b = e.target.closest('[data-cp]'); if (!b) return; try { localStorage.setItem('fdadmin.calPage', b.getAttribute('data-cp')); } catch (x) { /* fine */ } draw(); };
        var fetchCal = function () {
            var q = { start: t0, end: ymd(new Date(today.getTime() + 35 * 864e5)) }; if (cur) q.page = cur;
            FD.get('calendar', q).then(function (d) { CAL = { data: d, page: cur, at: Date.now() }; if (route().tab === 'calendar' && !$('faSheetBg').classList.contains('on')) draw(); }, function (e) { FD.toast(e.message, true); });
        };
        if (!D || Date.now() - CAL.at > 120000) fetchCal();
        $('evOpen').onclick = function () {
            sheet('<h2>Add an event</h2>' +
                '<label>What</label><input id="evT" maxlength="120" placeholder="e.g. Dentist" autocomplete="off">' +
                '<label>Who or what for</label><select id="evC">' + (addable.length ? addable.map(function (a) { return '<option>' + esc(a.name) + '</option>'; }).join('') : '<option value="">General</option>') + '</select>' +
                '<div class="fa-two"><div><label>Day <b class="fa-nice" id="evSn">' + esc(nice(t0)) + '</b></label><input type="date" id="evS" value="' + t0 + '"></div><div><label>Until <small>(optional)</small> <b class="fa-nice" id="evEn"></b></label><input type="date" id="evE"></div></div>' +
                '<label>Time <small>(leave blank for all day)</small></label><input type="time" id="evH">' +
                '<label>Notes <small>(optional)</small></label><input id="evN" maxlength="300" autocomplete="off">' +
                '<div class="fa-actions"><button class="btn ghost" id="evX">Cancel</button><button class="btn" id="evAdd">+ Add event</button></div>');
            $('evX').onclick = closeSheet;
            ['evS', 'evE'].forEach(function (k) { $(k).oninput = function () { $(k + 'n').textContent = this.value ? nice(this.value) : ''; }; });
            $('evAdd').onclick = function () {
                var b = this, t = $('evT').value.trim(); if (!t) { FD.toast('Give the event a name', true); return; }
                var q = { action: 'addEvent', title: t, category: $('evC').value, start: $('evS').value, end: $('evE').value || $('evS').value, time: $('evH').value, note: $('evN').value.trim() };
                if (cur) q.page = cur;
                b.disabled = true; b.textContent = '⏳ Adding…';
                FD.post(q).then(function () { closeSheet(); FD.toast('Added'); CAL.at = 0; fetchCal(); }, function (e) { FD.toast(e.message, true); b.disabled = false; b.textContent = '+ Add event'; });
            };
        };
        Array.prototype.forEach.call(document.querySelectorAll('[data-del]'), function (x) {
            x.onclick = function () {
                var k = x.getAttribute('data-del').split('|'), e = D.days[k[0]][+k[1]];
                var all = e.rec && confirm('“' + e.t + '” repeats. Delete every one? (Cancel deletes just this one.)');
                if (!e.rec && !confirm('Delete “' + e.t + '”?')) return;
                x.closest('.fa-row').classList.add('gone');
                FD.post({ action: 'deleteEvent', id: e.id, cal: e.cal, s: e.s, all: all }).then(function () { FD.toast('Deleted'); CAL.at = 0; fetchCal(); }, function (er) { FD.toast(er.message, true); draw(); });
            };
        });
    }

    /* ------------------------------------------------------------------ 📌 Notes */

    var COLOURS = ['#ffe58a', '#ffc2d4', '#b9e6ff', '#c8f2b5', '#e3d1ff', '#ffd8a8', '#b2f0e6', '#d8e2ff'];
    function notesPage() {
        var m = DATA.memos || [], max = L().maxNotes || 6, has = onScreens(function (w) { return w.type === 'memo'; }).length;
        var from = ''; try { from = localStorage.getItem('fdadmin.from') || ''; } catch (e) { /* fine */ }
        $('faMain').innerHTML = (has ? '' : '<p class="fa-pc">There’s no Notes widget on a screen yet – add one on a computer at <b>' + esc(HOST) + '</b> → Screens.</p>') +
            (m.length >= max ? '<p class="fa-note">There are ' + max + ' notes – the most that fit. Take one off to add another.</p>' :
                box('<textarea id="mmNew" rows="2" maxlength="' + (L().memo || 80) + '" placeholder="Write a note…"></textarea>' +
                    '<div class="fa-inline"><input id="mmFrom" maxlength="12" placeholder="From (optional)" value="' + esc(from) + '" autocomplete="off"><button class="btn" id="mmAdd">+ Add</button></div>', 'fa-addbox')) +
            h('On the dashboard', '<small>' + m.length + ' of ' + max + '</small>') +
            // Sticky notes, as on the dashboard – two to a row
            (m.length ? '<div class="stickies fa-stickies">' + m.map(function (x, i) {
                return '<div class="sticky" style="--nc:' + COLOURS[i % COLOURS.length] + ';--rot:' + ((i % 3) - 1) * 1.2 + 'deg"><span>' + esc(x.text) + '</span><small>' + (x.from ? '— ' + esc(x.from) + ', ' : '') + esc(x.added) + '</small>' +
                    '<button class="x" data-mrm="' + esc(x.id) + '" aria-label="Take it off">✕</button></div>';
            }).join('') + '</div>' : empty('No notes on the dashboard'));
        if ($('mmAdd')) $('mmAdd').onclick = function () {
            var t = $('mmNew').value.trim(), f = $('mmFrom').value.trim(); if (!t) return;
            try { localStorage.setItem('fdadmin.from', f); } catch (e) { /* fine */ }
            this.disabled = true;
            act({ action: 'memo', op: 'add', text: t, from: f }, 'Note added').then(function () { return load(true); }, function () { draw(); });
        };
        $('faMain').onclick = function (e) {
            var b = e.target.closest('[data-mrm]'); if (!b) return;
            b.closest('.sticky').classList.add('gone');
            act({ action: 'memo', op: 'remove', id: b.getAttribute('data-mrm') }, 'Taken off').then(function () { return load(true); }, function () { draw(); });
        };
    }

    /* ------------------------------------------------------------------ 📝 Lists */

    function listsPage() {
        var ws = onScreens(function (w) { return w.type === 'list' || w.type === 'todo'; }).sort(function (a, b) { return (b.type === 'todo') - (a.type === 'todo'); });      // To-Do (Google) first
        $('faMain').onclick = null;
        if (!ws.length) { $('faMain').innerHTML = empty('No lists on the dashboard') + '<p class="fa-pc">Add a List or To-do widget on a computer at <b>' + esc(HOST) + '</b> → Screens.</p>'; return; }
        var open = ''; try { open = sessionStorage.getItem('fdadmin.openList') || ''; } catch (e) { /* fine */ }
        var w = ws.filter(function (x) { return x.id === open; })[0] || ws[0];
        var d = (DATA.lists || {})[w.id], items = d && d.items || [], done = items.filter(function (i) { return i.done; }).length;
        $('faMain').innerHTML = (ws.length > 1 ? '<div class="fa-seg big' + (ws.length > 2 ? ' grid2' : '') + '" id="lsPick">' + ws.map(function (x) { return '<button data-l="' + esc(x.id) + '"' + (x === w ? ' class="on"' : '') + '>' + FDIco(typeOf(x.type)) + ' ' + esc(nameOf(x)) + '</button>'; }).join('') + '</div>' : h(esc(typeOf(w.type).icon + ' ' + nameOf(w)))) +
            box('<div class="fa-inline"><input id="lsNew" maxlength="' + (L().listItem || 30) + '" placeholder="Add an item…" autocomplete="off"><button class="btn" id="lsAdd">+ Add</button></div>', 'fa-addbox') +
            (!d ? empty('Loading…') : d.error ? '<p class="fa-err">' + esc(d.error) + '</p>' : items.length ? items.map(function (i) {
                return '<div class="fa-row li' + (i.done ? ' done' : '') + '"><button class="fa-tick" data-ltog="' + esc(i.id) + '" aria-label="Tick"></button><span class="fa-t" data-ltog="' + esc(i.id) + '"><b>' + esc(i.text) + '</b>' + (i.due ? '<small>' + esc(nice(i.due)) + '</small>' : '') + '</span>' +
                    (w.type === 'todo' ? '<button class="fa-star' + (i.star ? ' on' : '') + '" data-lstar="' + esc(i.id) + '" aria-label="Important">' + (i.star ? '★' : '☆') + '</button>' : '') +
                    '<button class="fa-x" data-lrm="' + esc(i.id) + '" aria-label="Remove">✕</button></div>';
            }).join('') : empty('Nothing on the list')) +
            (done ? '<button class="btn ghost wide" id="lsClear">Clear ' + done + ' ticked</button>' : '');
        var op = function (body) { body.action = 'listItem'; body.widget = w.id; return act(body).then(draw, draw); };
        if ($('lsPick')) $('lsPick').onclick = function (e) { var b = e.target.closest('[data-l]'); if (!b) return; try { sessionStorage.setItem('fdadmin.openList', b.getAttribute('data-l')); } catch (x) { /* fine */ } draw(); };
        $('lsAdd').onclick = function () { var t = $('lsNew').value.trim(); if (!t) return; $('lsNew').value = ''; op({ op: 'add', text: t }); setTimeout(function () { if ($('lsNew')) $('lsNew').focus(); }, 50); };
        $('lsNew').onkeydown = function (e) { if (e.key === 'Enter') $('lsAdd').onclick(); };
        if ($('lsClear')) $('lsClear').onclick = function () { op({ op: 'clearDone' }); };
        $('faMain').onclick = function (e) {
            var el;
            if ((el = e.target.closest('[data-ltog]'))) { el.closest('.fa-row').classList.toggle('done'); op({ op: 'toggle', id: el.getAttribute('data-ltog') }); }
            else if ((el = e.target.closest('[data-lstar]'))) { el.classList.toggle('on'); op({ op: 'star', id: el.getAttribute('data-lstar') }); }
            else if ((el = e.target.closest('[data-lrm]'))) { el.closest('.fa-row').classList.add('gone'); op({ op: 'remove', id: el.getAttribute('data-lrm') }); }
        };
    }

    /* ------------------------------------------------------------------ ⭐ Points */

    /* Rewards: two buttons at the top – View (each child, fully open) and Configure (everything the computer website has). */
    function rwMode() { var m = 'view'; try { m = localStorage.getItem('fdadmin.rwMode') || 'view'; } catch (e) { /* fine */ } return m; }
    function rwSeg(sub) {
        var m = sub ? 'configure' : rwMode();
        return '<div class="fa-seg big" id="rwSeg"><button data-rw="configure"' + (m === 'configure' ? ' class="on"' : '') + '>⚙ Configure</button><button data-rw="view"' + (m === 'view' ? ' class="on"' : '') + '>👀 View</button></div>';
    }
    function wireRwSeg() {
        $('rwSeg').onclick = function (e) {
            var b = e.target.closest('[data-rw]'); if (!b) return;
            try { localStorage.setItem('fdadmin.rwMode', b.getAttribute('data-rw')); } catch (x) { /* fine */ }
            if (route().sub) go('points'); else draw();
        };
    }
    function pointsPage(sub) {
        $('faMain').onclick = null;
        if (sub || rwMode() === 'configure') { configurePage(sub); return; }
        kidsView();
    }
    function kidsView() {
        var s = DATA.state;
        if (!s || !s.boys || !s.boys.length) { $('faMain').innerHTML = rwSeg() + empty('Nobody takes part in rewards yet') + '<p class="fa-pc">Tick ⭐ Rewards for the children in <b>Family</b> on a computer at <b>' + esc(HOST) + '</b>.</p>'; wireRwSeg(); return; }
        var target = s.cashIn.points;
        $('faMain').innerHTML = rwSeg() + s.boys.map(function (b, i) {
            var pct = Math.min(100, b.balance / target * 100), can = b.balance >= target, tasks = b.allTasks || b.tasks || [];
            var rem = (b.reminders || []).length ? '<p class="fa-rem">🎒 ' + b.reminders.map(esc).join(' · ') + '</p>' : '';
            return '<section class="fa-kid" style="--c:' + esc(b.colour) + '">' +
                '<div class="fa-kid-top"><b>' + esc(b.name) + '</b><span class="fa-pts">' + b.balance + '<small>points</small></span></div>' +
                '<div class="fa-bar"><i style="width:' + pct + '%"></i></div><p class="fa-to">' + (can ? 'Ready to cash in!' : (target - b.balance) + ' more to £' + s.cashIn.value) + '</p>' + rem +
                '<div class="fa-kbtns">' + s.penalties.map(function (p) { return '<button class="fa-pen" data-pen="' + i + ':' + p + '">−' + p + '</button>'; }).join('') +
                    '<button class="fa-plus" data-bonus="' + i + '">+ Points</button>' + (can ? '<button class="btn good" data-cash="' + i + '">Cash in £' + s.cashIn.value + '</button>' : '') + '</div>' +
                '<div class="fa-more open">' +
                    '<h3>Reward Tasks</h3>' + (tasks.length ? tasks.map(function (t) { return '<button class="fa-row task" data-task="' + i + ':' + esc(t.id) + '"><span class="fa-tick"></span><span class="fa-t"><b>' + esc(t.text) + '</b></span><em>+' + t.points + '</em></button>'; }).join('') : empty('No tasks waiting')) +
                    '<h3>Daily To-Dos</h3>' + (b.todos.length ? b.todos.map(function (t, j) { return '<button class="fa-row li' + (t.done ? ' done' : '') + '" data-todo="' + i + ':' + j + '"><span class="fa-tick"></span><span class="fa-t"><b>' + esc(t.item) + '</b></span></button>'; }).join('') : empty('Nothing today')) +
                    '<h3>Statement</h3>' + (b.statement || []).slice(0, 5).map(function (l) { return '<div class="fa-row st"><span class="fa-t"><b>' + esc(l.text) + '</b></span><em class="' + (l.points < 0 ? 'neg' : 'pos') + '">' + (l.points > 0 ? '+' : '') + l.points + '</em></div>'; }).join('') +
                    '<button class="btn ghost wide" data-stmt="' + i + '">The whole statement</button></div></section>';
        }).join('');
        wireRwSeg();
        $('faMain').onclick = function (e) {
            var el;
            if ((el = e.target.closest('[data-pen]'))) {
                var pp = el.getAttribute('data-pen').split(':'), b = s.boys[+pp[0]];
                act({ action: 'penalty', boy: b.name, points: +pp[1], reason: 'Penalty' }, b.name + ' −' + pp[1]).then(draw, draw);
            } else if ((el = e.target.closest('[data-task]'))) {
                var tp = el.getAttribute('data-task').split(':'), bb = s.boys[+tp[0]], t = (bb.allTasks || bb.tasks).filter(function (x) { return x.id === tp[1]; })[0];
                el.classList.add('done');
                act({ action: 'complete', boy: bb.name, taskId: tp[1] }, bb.name + ' +' + t.points + ' for ' + t.text).then(draw, draw);
            } else if ((el = e.target.closest('[data-todo]'))) {
                var dp = el.getAttribute('data-todo').split(':'), b2 = s.boys[+dp[0]], td = b2.todos[+dp[1]];
                td.done = !td.done; el.classList.toggle('done', td.done);
                act({ action: 'todo', boy: b2.name, item: td.item, done: td.done });
            } else if ((el = e.target.closest('[data-cash]'))) {
                var b3 = s.boys[+el.getAttribute('data-cash')];
                if (confirm('Cash in ' + target + ' points for £' + s.cashIn.value + ' for ' + b3.name + '?')) act({ action: 'cashin', boy: b3.name }, b3.name + ' cashed in £' + s.cashIn.value).then(draw, draw);
            } else if ((el = e.target.closest('[data-bonus]'))) bonus(s.boys[+el.getAttribute('data-bonus')]);
            else if ((el = e.target.closest('[data-stmt]'))) { var who = s.boys[+el.getAttribute('data-stmt')].name; load(true).then(function () { statement(DATA.state.boys.filter(function (x) { return x.name === who; })[0]); }); }
        };
    }

    /* ------------------------------------------------------------------ ⭐ Rewards → Configure (the same as the computer website) */

    var CFG = [['tasks', '✅', 'Reward Tasks', 'Jobs that earn points'], ['todos', '☀️', 'Daily To-Dos', 'Daily or weekly checklists'],
        ['remdisplay', IC('reminders', '🎒'), 'Reminder Display', 'On Child’s Rewards or not'], ['rules', '⚖️', 'Reward rules', 'Cash-in and penalty buttons'],
        ['adjust', '✏️', 'Manual adjustments', 'Points by hand, statements']];
    function bpage() { return (DATA.pages || []).filter(function (p) { return p.type === 'boys'; })[0]; }
    function bfields() { return ((DATA.pageTypes || []).filter(function (x) { return x.type === 'boys'; })[0] || { settings: [] }).settings || []; }
    function configurePage(sub) {
        var item = CFG.filter(function (c) { return c[0] === sub; })[0];
        if (!item) {
            $('faMain').innerHTML = rwSeg() +
                box('<p class="fa-how">The children earn points for <b>Reward Tasks</b> and cash them in. <b>Daily To-Dos</b> are checklists with no points. Who takes part is ticked in Family (on a computer).</p>') +
                CFG.map(function (c) { return '<a class="fa-row go" href="#/points/' + c[0] + '"><span class="fa-ico">' + c[1] + '</span><span class="fa-t"><b>' + c[2] + '</b><small>' + c[3] + '</small></span><i>›</i></a>'; }).join('');
            wireRwSeg(); return;
        }
        var top = rwSeg(sub) + '<a class="fa-back" href="#/points">‹ Configure</a>' + h(item[2]);
        ({ tasks: tasksEd, todos: todosEd, remdisplay: remDisplayEd, rules: rulesEd, adjust: adjustEd })[sub](top);
        wireRwSeg();
    }

    /* A list edited on the phone: one box per row, fields one under another; ▲ ▼ to order, ✕ to delete; Save at the bottom. */
    var DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    function parseDays(spec) {
        var s = String(spec || '').trim().toLowerCase(), on = [false, false, false, false, false, false, false];
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
    function dayChips(v, hidden) {
        var on = parseDays(v);
        return '<div class="fa-days"' + (hidden ? ' hidden' : '') + '>' + DAYS.map(function (d, i) { return '<button type="button" class="' + (on[i] ? 'on' : '') + '" data-day="' + i + '">' + d.slice(0, 2) + '</button>'; }).join('') + '</div>';
    }
    function isoOf(v) {
        var s = String(v || '').trim(), m;
        if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) return m[1] + '-' + m[2] + '-' + m[3];
        if ((m = s.match(/^(\d{1,2})[\/.](\d{1,2})(?:[\/.](\d{2,4}))?$/))) { var y = m[3] ? (m[3].length === 2 ? '20' + m[3] : m[3]) : String(new Date().getFullYear()); return y + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2); }
        return '';
    }
    function dmy(iso) { var m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? m[3] + '/' + m[2] + '/' + m[1] : ''; }
    /** For who: Daily To-Dos and Reward Tasks – everyone in Rewards or one child; Reminders – anyone in the family. */
    function whoSel(k, v, wide) {
        var kids = ((DATA.state || {}).boys || []).map(function (b) { return b.name; }), ppl = ((DATA.family || {}).people || []);
        var kidsAll = wide ? kids.concat(ppl.filter(function (p) { return p.role === 'child' && kids.indexOf(p.name) < 0; }).map(function (p) { return p.name; })) : kids;
        var adults = wide ? ppl.filter(function (p) { return p.role === 'adult'; }).map(function (p) { return p.name; }) : [];
        var top = (wide ? [['Family', 'Everyone']] : []).concat([['All', 'Everyone (in Rewards)']]);
        var opt = function (x) { return '<option value="' + esc(x[0]) + '"' + (x[0].toLowerCase() === String(v || 'All').toLowerCase() ? ' selected' : '') + '>' + esc(x[1]) + '</option>'; };
        var known = top.concat(kidsAll.map(function (n) { return [n, n]; }), adults.map(function (n) { return [n, n]; }));
        var extra = v && !known.some(function (x) { return x[0].toLowerCase() === String(v).toLowerCase(); }) ? opt([v, v]) : '';
        return '<select data-k="' + k + '">' + top.map(opt).join('') +
            (wide ? (kidsAll.length ? '<optgroup label="Children">' + kidsAll.map(function (n) { return opt([n, n]); }).join('') + '</optgroup>' : '') +
                (adults.length ? '<optgroup label="Adults">' + adults.map(function (n) { return opt([n, n]); }).join('') + '</optgroup>' : '')
                : kidsAll.map(function (n) { return opt([n, n]); }).join('')) + extra + '</select>';
    }
    function rowBox(inner, opts) {
        return '<section class="fa-box fa-lrow"' + (opts.id ? ' data-id="' + esc(opts.id) + '"' : '') + '><button type="button" class="fa-x" data-rx aria-label="Delete">✕</button>' +
            (opts.order || opts.extra ? '<div class="fa-lrow-top">' + (opts.order ? '<span class="fa-mv"><button type="button" data-mv="up" aria-label="Move up">▲</button><button type="button" data-mv="down" aria-label="Move down">▼</button></span>' : '') + (opts.extra || '') + '</div>' : '') +
            inner + '</section>';
    }
    /** The Save / Undo buttons and the shared clicks of a list editor (order, delete, day buttons). */
    function editorFoot(saveText) {
        return '<hr class="fa-sep"><div class="fa-actions"><button class="btn good" id="edSave">' + saveText + '</button><button class="btn ghost" id="edUndo">Undo changes</button></div>';
    }
    function wireRows(rowsId, blank, onClick) {
        var rows = $(rowsId);
        $('edAdd').onclick = function () { rows.insertAdjacentHTML('beforeend', blank()); var ins = rows.querySelectorAll('.fa-lrow'); var f = ins[ins.length - 1].querySelector('input'); if (f) f.focus(); };
        $('edUndo').onclick = function () { draw(); };
        rows.onclick = function (e) {
            var el, r = e.target.closest('.fa-lrow');
            if ((el = e.target.closest('[data-mv]'))) { var up = el.getAttribute('data-mv') === 'up', sib = up ? r.previousElementSibling : r.nextElementSibling; if (sib) rows.insertBefore(r, up ? sib : sib.nextSibling); }
            else if (e.target.closest('[data-rx]')) { var nm = (r.querySelector('input[data-k]') || {}).value; if (!nm || confirm('Delete “' + nm + '”?')) r.remove(); }
            else if ((el = e.target.closest('[data-day]'))) { el.classList.toggle('on'); }
            else if (onClick) onClick(e, r);
        };
        rows.onchange = function (e) {
            var t = e.target, r = t.closest('.fa-lrow'); if (!r) return;
            if (t.classList.contains('fa-often')) { r.querySelector('.fa-days').hidden = t.value === 'weekly'; r.querySelector('.fa-reset').hidden = t.value !== 'weekly'; }
            if (t.classList.contains('fa-whenmode')) { r.querySelector('.fa-days').hidden = t.value !== 'week'; r.querySelector('.fa-date').hidden = t.value !== 'date'; }
        };
    }
    function daysOf(r) { return formatDays(Array.prototype.map.call(r.querySelectorAll('.fa-days [data-day]'), function (b) { return b.classList.contains('on'); })); }

    /* Reward Tasks */
    function tasksEd(top) {
        var tasks = (DATA.tasks || []).slice().sort(function (a, b) { return (+a.Order || 999) - (+b.Order || 999); });
        var who = ['All'].concat((DATA.boys || []).map(function (b) { return b.Name; }).filter(Boolean));
        var row = function (t) {
            var on = t.Active !== false;
            return rowBox('<label>Task <span class="cnt">max ' + (L().task || 22) + '</span></label><input data-k="Task" maxlength="' + (L().task || 22) + '" value="' + esc(t.Task || '') + '" placeholder="e.g. Tidy your bedroom" autocomplete="off">' +
                '<div class="fa-two"><div><label>Points</label><input data-k="Points" type="number" inputmode="numeric" min="1" value="' + esc(t.Points || '') + '" placeholder="10"></div>' +
                '<div><label>For who</label><select data-k="Boy">' + who.map(function (n) { return '<option value="' + esc(n) + '"' + (n === (t.Boy || 'All') ? ' selected' : '') + '>' + esc(n === 'All' ? 'Everyone' : n) + '</option>'; }).join('') + '</select></div></div>' +
                '<label>Repeats</label><select data-k="Repeat">' + [['once', 'Once – gone when it’s done'], ['daily', 'Every day – back tomorrow'], ['always', 'Always there – any number of times']].map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === (t.Repeat || 'once') ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>',
                { id: t.ID || '', order: true, extra: '<button type="button" class="fa-on' + (on ? ' on' : '') + '" data-act>' + (on ? '✔ On' : '⏸ Paused') + '</button>' });
        };
        $('faMain').innerHTML = top + '<p class="fa-lead">Jobs that earn points. Each child sees their next three on their card, in this order. Points already earned stay when you change or delete one.</p>' +
            '<div id="edRows">' + tasks.map(row).join('') + '</div><button class="btn fa-add" id="edAdd">+ Add a Reward Task</button>' + editorFoot('Save Reward Tasks');
        wireRows('edRows', function () { return row({ Active: true }); }, function (e) {
            var b = e.target.closest('[data-act]'); if (!b) return;
            var on = !b.classList.contains('on'); b.classList.toggle('on', on); b.textContent = on ? '✔ On' : '⏸ Paused';
        });
        $('edSave').onclick = function () {
            var list = Array.prototype.map.call(document.querySelectorAll('#edRows .fa-lrow'), function (r) {
                var o = { ID: r.getAttribute('data-id') || '', Active: r.querySelector('[data-act]').classList.contains('on') };
                r.querySelectorAll('[data-k]').forEach(function (i) { o[i.getAttribute('data-k')] = i.value.trim(); });
                return o;
            }).filter(function (o) { return o.Task; });
            saving(this, act({ action: 'saveTasks', tasks: list }, 'Reward Tasks saved'));
        };
    }
    /** Daily To-Dos: daily on some days, or weekly (resets on one day). */
    function todosEd(top) {
        var rs = (DATA.todos || []).slice().sort(function (a, b) { return (+a.Order || 999) - (+b.Order || 999); });
        var row = function (t) {
            var m = String(t.Days || '').match(/^weekly\s*(\w{3})/i), wk = !!m, rd = m ? m[1].slice(0, 1).toUpperCase() + m[1].slice(1, 3).toLowerCase() : 'Sat';
            return rowBox('<label>To-Do <span class="cnt">max ' + (L().todo || 22) + '</span></label><input data-k="Item" maxlength="' + (L().todo || 22) + '" value="' + esc(t.Item || '') + '" placeholder="e.g. Teeth brushed" autocomplete="off">' +
                '<label>For who</label>' + whoSel('Boy', t.Boy, false) +
                '<label>How often</label><select class="fa-often"><option value="daily"' + (wk ? '' : ' selected') + '>Daily, on…</option><option value="weekly"' + (wk ? ' selected' : '') + '>Weekly – resets on…</option></select>' +
                dayChips(wk ? 'Mon-Fri' : (t.Days || 'Mon-Fri'), wk) +
                '<select class="fa-reset"' + (wk ? '' : ' hidden') + '>' + DAYS.map(function (d) { return '<option' + (d === rd ? ' selected' : '') + '>' + d + '</option>'; }).join('') + '</select>', { order: true });
        };
        $('faMain').innerHTML = top + '<p class="fa-lead">Checklists each child ticks off – no points. <b>Daily</b> ones start afresh each morning, on the days you pick; <b>weekly</b> ones stay ticked until the day they reset.</p>' +
            '<div id="edRows">' + rs.map(row).join('') + '</div><button class="btn fa-add" id="edAdd">+ Add a To-Do</button>' + editorFoot('Save Daily To-Dos');
        wireRows('edRows', function () { return row({}); });
        $('edSave').onclick = function () {
            var out = Array.prototype.map.call(document.querySelectorAll('#edRows .fa-lrow'), function (r, i) {
                var weekly = r.querySelector('.fa-often').value === 'weekly';
                return { Item: r.querySelector('[data-k=Item]').value.trim(), Boy: r.querySelector('[data-k=Boy]').value, Days: weekly ? 'Weekly ' + r.querySelector('.fa-reset').value : daysOf(r), Order: i + 1 };
            }).filter(function (o) { return o.Item; });
            saving(this, act({ action: 'saveList', list: 'todos', rows: out }, 'Daily To-Dos saved'));
        };
    }
    function remDisplayEd(top) {
        var pp = bpage(), f = bfields().filter(function (x) { return x.k === 'ShowReminders'; });
        $('faMain').innerHTML = top + '<p class="fa-lead">Whether each child’s reminders show on their Child’s Rewards widget, on the day and from the evening before.</p>' +
            box((pp ? f.map(function (x) { return field(x, (pp.settings || {})[x.k]); }).join('') : '') +
                '<p class="fa-help">To add or change reminders, use the <a href="#/reminders">Reminders</a> button at the top. The Reminders widget shows everyone’s together, whatever you choose here.</p>', 'fa-form') +
            '<div class="fa-actions"><button class="btn good" id="edSave">Save reminder display</button></div>';
        $('edSave').onclick = function () {
            var c = document.querySelector('#faMain [data-f=ShowReminders]'), v = !!(c && c.checked);
            saving(this, act({ action: 'savePage', page: { id: pp.id, settings: { ShowReminders: v } } }, 'Saved – the screen updates within a minute').then(function (d) { (pp.settings = pp.settings || {}).ShowReminders = v; return d; }));
        };
    }
    function rulesEd(top) {
        var pp = bpage(), st = (pp && pp.settings) || {};
        var fs = bfields().filter(function (f) { return f.k !== 'PenaltyOptions' && f.k !== 'TomorrowFrom' && f.k !== 'ShowReminders'; });
        var pens = String(st.PenaltyOptions || '10,20,50').split(',').map(function (x) { return Math.abs(parseInt(x, 10)); }).filter(function (n) { return n > 0; });
        var drawPens = function () {
            $('pensEd').innerHTML = pens.map(function (n, i) { return '<span class="fa-pen-chip">−' + n + '<button type="button" data-pdel="' + i + '" aria-label="Remove">✕</button></span>'; }).join('') +
                (pens.length < 4 ? '<div class="fa-inline"><input id="penNew" type="number" inputmode="numeric" min="1" max="500" placeholder="e.g. 30"><button type="button" class="btn" id="penAdd">+ Add</button></div>' : '');
        };
        $('faMain').innerHTML = top + '<p class="fa-lead">How many points make a cash-in, what it’s worth, and the penalty buttons on each child’s card.</p>' +
            box((pp ? fs.map(function (f) { return wrapWhen(f, field(f, st[f.k])); }).join('') : ''), 'fa-form') +
            h('Penalty buttons') + '<p class="fa-lead">The buttons for taking points away – up to four.</p>' + box('<div id="pensEd" class="fa-pens"></div>') +
            '<hr class="fa-sep"><div class="fa-actions"><button class="btn good" id="edSave">Save the rules</button><button class="btn ghost" id="edUndo">Undo changes</button></div>';
        drawPens(); whenFields();
        $('pensEd').onclick = function (e) {
            var d = e.target.closest('[data-pdel]');
            if (d) { pens.splice(+d.getAttribute('data-pdel'), 1); drawPens(); }
            if (e.target.closest('#penAdd')) { var n = Math.abs(parseInt($('penNew').value, 10)); if (!n) return; pens.push(n); pens.sort(function (a, b) { return a - b; }); drawPens(); }
        };
        $('edUndo').onclick = function () { draw(); };
        $('edSave').onclick = function () {
            var vals = { PenaltyOptions: pens.join(',') };
            Array.prototype.forEach.call(document.querySelectorAll('#faMain [data-f]'), function (i) { vals[i.getAttribute('data-f')] = i.type === 'checkbox' ? i.checked : i.value.trim(); });
            saving(this, act({ action: 'savePage', page: { id: pp.id, settings: vals } }, 'Saved – the screen updates within a minute').then(function (d) { return load(true).then(function () { return d; }); }));
        };
    }
    function adjustEd(top) {
        var s = DATA.state;
        if (!s || !s.boys || !s.boys.length) { $('faMain').innerHTML = top + empty('Nobody takes part in rewards yet'); return; }
        $('faMain').innerHTML = top + '<p class="fa-lead">Put a child’s points right by hand – it goes on their statement.</p>' + s.boys.map(function (b, i) {
            return box('<div class="fa-kid-top"><b>' + esc(b.name) + '</b><span class="fa-pts">' + b.balance + '<small>points</small></span></div>' +
                '<div class="fa-btncol"><button class="btn ghost" data-bonus="' + i + '">Add or take away points</button><button class="btn ghost" data-setbal="' + i + '">Override the balance</button><button class="btn ghost" data-stmt="' + i + '">See statement</button></div>', 'fa-adj" style="--c:' + esc(b.colour));
        }).join('');
        $('faMain').onclick = function (e) {
            var el;
            if ((el = e.target.closest('[data-bonus]'))) bonus(s.boys[+el.getAttribute('data-bonus')]);
            else if ((el = e.target.closest('[data-setbal]'))) balanceSheet(s.boys[+el.getAttribute('data-setbal')]);
            else if ((el = e.target.closest('[data-stmt]'))) { var who = s.boys[+el.getAttribute('data-stmt')].name; load(true).then(function () { statement(DATA.state.boys.filter(function (x) { return x.name === who; })[0]); }); }
        };
    }
    function balanceSheet(b) {
        sheet('<h2>Set ' + esc(b.name) + '’s balance</h2><p class="mute">Now ' + b.balance + ' points. The change goes on their statement as an adjustment.</p>' +
            '<label>New balance</label><input id="nbPts" type="number" inputmode="numeric" value="' + b.balance + '">' +
            '<div class="fa-actions"><button class="btn good" id="nbSave">Save the balance</button><button class="btn ghost" id="nbX">Cancel</button></div>');
        $('nbX').onclick = closeSheet;
        $('nbSave').onclick = function () {
            var n = Math.round(Number($('nbPts').value)), d = n - b.balance;
            if (isNaN(n) || n < 0) { FD.toast('Enter a balance of 0 or more', true); return; }
            closeSheet(); if (!d) return;
            act({ action: 'adjust', boy: b.name, points: d, reason: 'Balance set to ' + n }, b.name + ': ' + n + ' points').then(draw, draw);
        };
    }
    /** A Save button while it saves: ⏳, then back as it was (the reply redraws the page). */
    function saving(btn, p) {
        var t = btn.textContent; btn.disabled = true; btn.textContent = '⏳ Saving…';
        p.then(function () { draw(); }, function () { btn.disabled = false; btn.textContent = t; });
    }

    /* ------------------------------------------------------------------ 🎒 Reminders */

    function remindersPage() {
        $('faMain').onclick = null;
        var pp = bpage(), from = String(((pp && pp.settings) || {}).TomorrowFrom || '17:00');
        var row = function (t) {
            var iso = isoOf(t.Day), date = !!iso;
            return rowBox('<label>Reminder <span class="cnt">max ' + (L().reminder || 22) + '</span></label><input data-k="Reminder" maxlength="' + (L().reminder || 22) + '" value="' + esc(t.Reminder || '') + '" placeholder="e.g. PE kit" autocomplete="off">' +
                '<label>For who</label>' + whoSel('Boy', t.Boy || 'Family', true) +
                '<label>When</label><select class="fa-whenmode"><option value="week"' + (date ? '' : ' selected') + '>Every week on…</option><option value="date"' + (date ? ' selected' : '') + '>On a date…</option></select>' +
                dayChips(date ? 'Fri' : (t.Day || 'Fri'), date) + '<input type="date" class="fa-date" value="' + esc(iso) + '"' + (date ? '' : ' hidden') + '>', {});
        };
        $('faMain').innerHTML = box('<p class="fa-how">Reminders are things a person needs on a day – PE kit, recorder, library books. They show in the <b>Reminders</b> widget, and on each child’s Child’s Rewards widget unless that’s turned off (Rewards → Configure → Reminder Display).</p>') +
            '<div id="edRows">' + (DATA.timetable || []).map(row).join('') + '</div>' +
            '<div class="fa-btncol"><button class="btn fa-add" id="edAdd">+ Add a reminder</button><button class="btn ghost" id="remClear">🧹 Clear expired reminders</button></div>' +
            box('<label for="remFrom">Switch to tomorrow’s reminders at</label><input type="time" id="remFrom" value="' + esc(from) + '">' +
                '<p class="fa-help">Until this time the screen shows today’s reminders; from this time, tomorrow’s – so things can be got ready the evening before.</p>', 'fa-form') +
            editorFoot('Save reminders');
        wireRows('edRows', function () { return row({}); });
        $('remClear').onclick = function () {
            var d0 = new Date(), today = ymd(d0);
            var old = Array.prototype.filter.call(document.querySelectorAll('#edRows .fa-lrow'), function (r) { var d = r.querySelector('.fa-date'); return r.querySelector('.fa-whenmode').value === 'date' && d.value && d.value < today; });
            if (!old.length) { FD.toast('No reminders have expired – nothing to clear'); return; }
            if (!confirm('Delete ' + (old.length === 1 ? 'this reminder, whose date has passed' : 'these ' + old.length + ' reminders, whose dates have passed') + '?\n\n• ' + old.map(function (r) { return r.querySelector('[data-k=Reminder]').value || 'a reminder'; }).join('\n• '))) return;
            old.forEach(function (r) { r.remove(); }); $('edSave').click();
        };
        $('edSave').onclick = function () {
            var out = Array.prototype.map.call(document.querySelectorAll('#edRows .fa-lrow'), function (r) {
                var byDate = r.querySelector('.fa-whenmode').value === 'date';
                return { Reminder: r.querySelector('[data-k=Reminder]').value.trim(), Boy: r.querySelector('[data-k=Boy]').value, Day: byDate ? dmy(r.querySelector('.fa-date').value) : daysOf(r) };
            }).filter(function (o) { return o.Reminder; });
            var rf = $('remFrom').value, jobs = [];
            if (pp && rf && rf !== from) { jobs.push(act({ action: 'savePage', page: { id: pp.id, settings: { TomorrowFrom: rf } } })); (pp.settings = pp.settings || {}).TomorrowFrom = rf; }
            jobs.push(act({ action: 'saveList', list: 'timetable', rows: out }, 'Reminders saved'));
            saving(this, Promise.all(jobs));
        };
    }

    function bonus(b) {
        sheet('<h2>Points for ' + esc(b.name) + '</h2>' +
            '<div class="fa-quick">' + [5, 10, 20, 50].map(function (n) { return '<button data-q="' + n + '">+' + n + '</button>'; }).join('') + '</div>' +
            '<label>Points <small>(a minus number takes points off)</small></label><input id="bPts" type="number" inputmode="numeric" placeholder="e.g. 20 or -20">' +
            '<label>What for</label><input id="bWhy" maxlength="' + L().reason + '" placeholder="e.g. Helped with the shopping" autocomplete="off">' +
            '<div class="fa-actions"><button class="btn ghost" id="bX">Cancel</button><button class="btn good" id="bSave">Save</button></div>');
        $('faSheet').querySelector('.fa-quick').onclick = function (e) { var q = e.target.closest('[data-q]'); if (q) $('bPts').value = q.getAttribute('data-q'); };
        $('bX').onclick = closeSheet;
        $('bSave').onclick = function () {
            var n = Number($('bPts').value); if (!n) { FD.toast('Enter some points', true); return; }
            closeSheet();
            act({ action: 'adjust', boy: b.name, points: n, reason: $('bWhy').value.trim() || (n > 0 ? 'Bonus' : 'Penalty') }, b.name + ' ' + (n > 0 ? '+' : '') + n).then(draw, draw);
        };
    }
    function statement(b) {
        if (!b) return;
        var rs = (DATA.ledger || []).filter(function (l) { return l.Boy === b.name; });
        sheet('<h2>' + esc(b.name) + '’s statement</h2><p class="mute">' + b.balance + ' points now.</p><div class="fa-scroll">' +
            (rs.length ? rs.map(function (l) {
                return '<div class="fa-row st"><span class="fa-t"><b>' + esc(l.Description) + '</b><small>' + esc(l.Timestamp) + '</small></span><em class="' + (l.Points < 0 ? 'neg' : 'pos') + '">' + (l.Points > 0 ? '+' : '') + esc(l.Points) + '</em>' +
                    '<button class="fa-x" data-rm="' + esc(l.ID) + '" aria-label="Remove">✕</button></div>';
            }).join('') : empty('Nothing yet')) + '</div><div class="fa-actions"><button class="btn ghost" id="sX">Close</button></div>');
        $('sX').onclick = closeSheet;
        $('faSheet').onclick = function (e) {
            var r = e.target.closest('[data-rm]'); if (!r || !confirm('Take this entry off the statement?')) return;
            closeSheet(); act({ action: 'undo', id: r.getAttribute('data-rm') }, 'Removed').then(function () { return load(true); });
        };
    }

    /* ------------------------------------------------------------------ 🧩 Widgets */

    // These have their own button at the top, or are set up on a computer.
    var OWN = { memo: 'notes', list: 'lists', todo: 'lists', child: 'points' };
    /** The widgets listed under Other – the same as on the computer: every one on a screen (hidden ones too), numbered
     *  "copy 1 of 2" when there's more than one, with Always shows / Timed (Primary) / Timed (Secondary) / Hidden. */
    function otherList() {
        var pages = (DATA.pages || []).map(function (p) { return p.id; });
        var all = (DATA.widgets || []).filter(function (w) { return !OWN[w.type] && !w.pending; })
            .sort(function (a, b) { return (pages.indexOf(a.page) - pages.indexOf(b.page)) || ((a.order || 0) - (b.order || 0)); });
        var count = {}, seen = {};
        all.forEach(function (w) { var n = baseName(w); count[n] = (count[n] || 0) + 1; });
        all.forEach(function (w) { var n = baseName(w); w._copies = count[n]; w._copy = count[n] > 1 ? (seen[n] = (seen[n] || 0) + 1) : 0; });
        return all;
    }
    function baseName(w) {
        var T = typeOf(w.type), st = w.settings || {};
        if (w.type === 'whereabouts') return 'Weasley Clock';
        if (w.type === 'countdown') return st.Title || 'Countdown';
        return T.name.replace(/ \(.*\)$/, '');
    }
    /** The widget shown in a timed widget's space the rest of the time (the first of its kind). */
    function backupFor(w) {
        var src = (DATA.widgets || []).filter(function (x) { return x.type === w.type && !x.pending; })[0];
        if (!src || src.id !== w.id) return '';
        return (DATA.widgets || []).filter(function (x) { return x.when && x.when.OtherTimes === w.type; }).map(function (x) { return typeOf(x.type).name.replace(/ \(.*\)$/, ''); }).join(' and ');
    }
    function statusOf(w) {
        return (backupFor(w) ? 'Timed (Secondary)' : w.when ? 'Timed (Primary)' : w.show ? 'Always shows' : 'Hidden') + (w._copies > 1 ? ' · copy ' + w._copy + ' of ' + w._copies : '');
    }
    function timedSay(w) {
        var bk = backupFor(w), span = function (t) { return (t.ShowDays || 'Every day') + ', ' + (t.ShowFrom || '00:00') + '–' + (t.ShowUntil || '24:00'); };
        if (bk) { var main = (DATA.widgets || []).filter(function (x) { return x.when && x.when.OtherTimes === w.type; })[0]; return 'Timed (Secondary): shown in place of ' + bk + ' when it isn’t showing' + (main ? ' – outside ' + span(main.when) : '') + '.'; }
        if (w.when) return 'Timed (Primary): shown ' + span(w.when) + '; at other times ' + (w.when.OtherTimes ? typeOf(w.when.OtherTimes).name.replace(/ \(.*\)$/, '') + ' shows in its place' : 'the space is empty') + '.';
        return w.show ? 'Always shows.' : 'Hidden – on the screen but switched off.';
    }
    function widgetsPage() {
        $('faMain').onclick = null;
        var ws = otherList(), byPage = {}, lost = [];
        ws.forEach(function (w) { if (pageOf(w.page)) (byPage[w.page] = byPage[w.page] || []).push(w); else lost.push(w); });
        var row = function (w) {
            return '<a class="fa-row go" href="#/w/' + encodeURIComponent(w.id) + '"><span class="fa-ico">' + FDIco(typeOf(w.type)) + '</span><span class="fa-t"><b>' + esc(nameOf(w)) + '</b><small>' + esc(statusOf(w)) + '</small></span><i>›</i></a>';
        };
        $('faMain').innerHTML = '<p class="fa-lead">Tap a widget to change its settings.</p>' +
            (DATA.pages || []).filter(function (p) { return byPage[p.id]; }).map(function (p) { return h(esc(p.title) + ' <small>screen</small>') + byPage[p.id].map(row).join(''); }).join('') +
            (lost.length ? h('At other times') + lost.map(row).join('') : '') +
            (ws.length ? '' : empty('No widgets on the dashboard yet')) +
            '<p class="fa-warn">⚠ Widgets that aren’t on any screen (Not in use) aren’t listed here. To see them, add one, or move one to another screen, use a computer at <b>' + esc(HOST) + '</b> → Widgets → Other and Screens.</p>';
    }
    function widgetPage(id) {
        var w = widgetOf(id);
        if (!w) { $('faMain').innerHTML = empty('That widget isn’t on the dashboard any more') + '<a class="btn ghost wide" href="#/other">‹ Other</a>'; return; }
        var T = typeOf(w.type), defs = T.settings || [];
        var simple = defs.filter(function (f) { return !PC_ONLY(f); }), pc = defs.filter(PC_ONLY);
        $('faMain').innerHTML = '<a class="fa-back" href="#/other">‹ Other</a>' +
            '<div class="fa-whead"><span class="fa-ico big">' + FDIco(T) + '</span><div><h1>' + esc(nameOf(w)) + '</h1><p class="mute">' + esc(T.about || '') + '</p></div></div>' +
            '<p class="fa-status">' + esc((pageOf(w.page) ? 'On the ' + pageOf(w.page).title + ' screen · ' : '') + timedSay(w)) + (w._copies > 1 ? ' Copy ' + w._copy + ' of ' + w._copies + ' – each copy has its own settings.' : '') + '</p>' +
            (w.type === 'whereabouts' ? whereBox(w) : '') +
            (simple.length ? box(simple.map(function (f) { return wrapWhen(f, field(f, (w.settings || {})[f.k])); }).join('') +
                '<button class="btn good wide" id="wSave">Save</button>', 'fa-form') : (pc.length ? '' : '<p class="fa-note">Nothing to set – it works as it is.</p>')) +
            (pc.length ? '<p class="fa-pc">💻 ' + pc.map(function (f) { return '<b>' + esc(f.label) + '</b>'; }).join(', ') + (w.type === 'bins' ? ' (and where the bin days come from)' : '') + ' – change ' + (pc.length > 1 ? 'these' : 'this') + ' on a computer at <b>' + esc(HOST) + '</b>.</p>' : '') +
            '<p class="fa-pc">💻 Its height, whether it shows, when it shows (timed), and which screen it’s on are changed on a computer at <b>' + esc(HOST) + '</b> → Widgets → Other.</p>';
        whenFields();
        Array.prototype.forEach.call(document.querySelectorAll('.fa-mins'), function (box) {
            box.onclick = function (e) {
                var b = e.target.closest('[data-m]'); if (!b) return;
                if (!b.classList.contains('on') && box.querySelectorAll('.on').length >= 6) { FD.toast('Up to 6 – tap one to take it off first', true); return; }
                b.classList.toggle('on');
                box.querySelector('[data-f]').value = Array.prototype.map.call(box.querySelectorAll('button.on'), function (x) { return x.getAttribute('data-m'); }).join(',');
            };
        });
        if ($('wSave')) $('wSave').onclick = function () {
            var b = this, vals = {};
            Array.prototype.forEach.call(document.querySelectorAll('#faMain [data-f]'), function (i) { vals[i.getAttribute('data-f')] = i.type === 'checkbox' ? i.checked : i.value.trim(); });
            b.disabled = true; b.textContent = '⏳ Saving…';
            act({ action: 'saveWidget', widget: { id: w.id, settings: vals } }, 'Saved – the dashboard updates within a minute').then(function () {
                Object.keys(vals).forEach(function (k) { (w.settings = w.settings || {})[k] = vals[k]; }); setData(DATA); go('other');
            }, function () { b.disabled = false; b.textContent = 'Save'; });
        };
        Array.prototype.forEach.call(document.querySelectorAll('[data-who]'), function (sel) {
            sel.onchange = function () { if (sel.value) act({ action: 'where', person: sel.getAttribute('data-who'), place: sel.value, how: 'phone app' }, sel.getAttribute('data-who') + ' → ' + sel.value); };
        });
    }
    /** Settings that need a bigger screen (lists of places, rows of routes, categories, dates, bin days): on a computer. */
    function PC_ONLY(f) { return !!f.ui || f.type === 'place' || f.type === 'places'; }
    function field(f, v) {
        var id = 'f_' + f.k, help = f.help ? '<small class="fa-help">' + esc(f.help) + '</small>' : '';
        if (v == null) v = f.def;
        if (f.type === 'bool') return '<label class="fa-tog"><input type="checkbox" id="' + id + '" data-f="' + esc(f.k) + '"' + (v ? ' checked' : '') + '><span>' + esc(f.label) + '</span></label>' + help;
        var lab = '<label for="' + id + '">' + esc(f.label) + '</label>';
        if (f.type === 'minutes') {      // kitchen timer: tap up to 6
            var on = String(v || '').split(',').map(function (x) { return +x.trim(); }).filter(Boolean);
            var all = [1, 2, 3, 4, 5, 8, 10, 12, 15, 20, 25, 30, 40, 45, 60, 90, 120].concat(on).filter(function (n, i, a) { return a.indexOf(n) === i; }).sort(function (a, b) { return a - b; });
            return lab + '<div class="fa-mins"><input type="hidden" data-f="' + esc(f.k) + '" value="' + esc(on.join(',')) + '">' + all.map(function (n) {
                return '<button type="button" class="' + (on.indexOf(n) >= 0 ? 'on' : '') + '" data-m="' + n + '">' + (n >= 60 && n % 60 === 0 ? n / 60 + ' hr' : n + ' min') + '</button>'; }).join('') + '</div>' + help;
        }
        if (f.type === 'select') return lab + '<select id="' + id + '" data-f="' + esc(f.k) + '">' + (f.options || []).map(function (o) { return '<option' + (o === v ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('') + '</select>' + help;
        if (f.type === 'lines') return lab + '<textarea id="' + id + '" data-f="' + esc(f.k) + '" rows="' + Math.max(2, f.maxLines || 3) + '">' + esc(v) + '</textarea>' + help;
        var t = f.type === 'number' ? ' type="number" inputmode="numeric"' + (f.min != null ? ' min="' + f.min + '"' : '') + (f.max != null ? ' max="' + f.max + '"' : '')
            : f.type === 'url' ? ' type="url" inputmode="url"' : f.type === 'time' ? ' type="time"' : f.type === 'crs' ? ' maxlength="3" autocapitalize="characters"' : (f.max ? ' maxlength="' + f.max + '"' : '');
        return lab + '<input id="' + id + '" data-f="' + esc(f.k) + '" value="' + esc(v == null ? '' : v) + '"' + t + ' autocomplete="off">' + help;
    }
    function wrapWhen(f, html) { return f.when ? '<div class="fa-when" data-wk="' + esc(f.when[0]) + '" data-wv="' + esc(JSON.stringify(f.when[1])) + '">' + html + '</div>' : html; }
    function whenFields() {
        var apply = function () {
            Array.prototype.forEach.call(document.querySelectorAll('.fa-when'), function (d) {
                var c = document.querySelector('[data-f="' + d.getAttribute('data-wk') + '"]'); if (!c) return;
                var ok = []; try { ok = JSON.parse(d.getAttribute('data-wv')); } catch (e) { /* show */ }
                d.style.display = ok.indexOf(c.value) >= 0 ? '' : 'none';
            });
        };
        apply(); $('faMain').onchange = apply;
    }
    function whereBox(w) {
        var d = ((DATA.whereabouts || []).filter(function (x) { return x.id === w.id; })[0] || {}).data;
        if (!d) return '';
        return h('Where everyone is') + box(d.people.map(function (p) {
            return '<label>' + esc(p.name) + '</label><select data-who="' + esc(p.name) + '">' + ['<option value="">(not set)</option>'].concat(d.places.map(function (pl) { return '<option' + (pl === p.place ? ' selected' : '') + '>' + esc(pl) + '</option>'; })).join('') + '</select>';
        }).join(''));
    }

    /* ------------------------------------------------------------------ ☰ More */

    function morePage() {
        $('faMain').onclick = null;
        var fam = String(DATA.familyName || '').trim();
        var row = function (href, ico, t, sub, ext) { return '<a class="fa-row go" href="' + href + '"' + (ext ? ' target="_blank" rel="noopener"' : '') + '><span class="fa-ico">' + ico + '</span><span class="fa-t"><b>' + t + '</b><small>' + sub + '</small></span><i>›</i></a>'; };
        $('faMain').innerHTML =
            '<a class="btn good fa-dash" href="' + esc(ROOT) + 'dashboard/">▶ Open the dashboard</a>' +
            h('Devices') + row('#/connect', '🖥', 'Connect a display', 'Type the code a new screen shows') + row('#/phones', '📱', 'Add a phone', 'The QR codes for both phone apps') +
            h('Help') + row(esc(ROOT) + 'help/', '❓', 'Help', 'Short answers, step by step', true) + row('#/feedback', '💬', 'Feedback and support', 'Something not working, or an idea') + row('#/diag', '🩺', 'About and diagnostics', 'Versions, this phone, and a report for support') +
            h('Everything else') + box('<p>💻 Setting up – which widgets go on which screen, the family, rewards, the calendar’s colours, locations, data keys, the licence and your Google data – is on a computer at:</p>' +
                '<div class="fa-addr">' + esc(HOST) + '</div><button class="btn ghost wide" id="mCopy">Copy the address</button>', 'fa-pcbox') +
            h('This phone') + '<p class="fa-note">Connected to ' + (fam ? 'the <b>' + esc(fam) + '</b> family dashboard' : 'your family dashboard') + '. Family Admin version ' + esc(FD.VERSION) + '.</p>' +
            '<button class="btn ghost wide" id="mOut">Disconnect this phone</button>';
        $('mCopy').onclick = function () { (navigator.clipboard ? navigator.clipboard.writeText(ROOT) : Promise.reject()).then(function () { FD.toast('Copied'); }, function () { prompt('Copy this address:', ROOT); }); };
        $('mOut').onclick = function () {
            if (!confirm('Disconnect this phone from the dashboard? You can connect it again with a QR code or code from another family phone.')) return;
            FD.clearConfig(); ['fdapp.cfg.v1', 'fdsetup.v1', 'familyDashboard.cfg.v1', 'fdadmin.data', 'fdadmin.glance'].forEach(function (k) { try { localStorage.removeItem(k); } catch (x) { /* fine */ } });
            location.hash = ''; location.reload();
        };
    }
    /** About and diagnostics: the versions, what this phone is, and a report to send to support. */
    function diagPage() {
        $('faMain').onclick = null;
        var tr = function (a, b) { return '<div class="fa-row st"><span class="fa-t"><small>' + esc(a) + '</small><b>' + esc(b) + '</b></span></div>'; };
        $('faMain').innerHTML = '<a class="fa-back" href="#/more">‹ More</a>' + h('Versions') +
            box(tr('Family Admin (this phone)', FD.VERSION) + tr('Google script', DATA.scriptVersion || '?') + tr('Licence', (DATA.licence && DATA.licence.required) ? DATA.licence.message : 'Not needed')) +
            h('This phone') + box('<div id="devRows"><div class="fa-empty">Finding out…</div></div>') +
            h('Diagnostics report') + '<p class="fa-lead">A text file describing your dashboard – versions, settings, which widgets work and the last errors – to send to support. Your access code, keys, addresses and names are <b>locked</b> so only HouseRunner support can read them.</p>' +
            '<button class="btn wide" id="dGo">Make a diagnostics report</button><div id="dOut"></div>';
        if (window.FDPlatform) FDPlatform().then(function (p) { if ($('devRows')) $('devRows').innerHTML = FDPlatformRows(p).map(function (r) { return tr(r[0], r[1]); }).join(''); });
        $('dGo').onclick = function () {
            var b = this; b.disabled = true; b.textContent = '⏳ Checking everything – up to a minute…';
            FD.get('diagnostics', { app: FD.VERSION }, 240000).then(function (d) { return FD.diagReport(d, 'Family Admin phone app'); }).then(function (txt) {
                b.disabled = false; b.textContent = 'Make it again';
                var name = 'houserunner-diagnostics-' + new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '') + '.txt', file = new File([txt], name, { type: 'text/plain' });
                var canShare = navigator.canShare && navigator.canShare({ files: [file] });
                $('dOut').innerHTML = '<p class="fa-note">✔ Ready (' + Math.round(txt.length / 1024) + ' KB).</p><div class="fa-btncol">' + (canShare ? '<button class="btn good" id="dShare">Share or email it</button>' : '') +
                    '<button class="btn ghost" id="dSave">Download the file</button><button class="btn ghost" id="dCopy">Copy the text</button></div>';
                if ($('dShare')) $('dShare').onclick = function () { navigator.share({ files: [file], title: 'HouseRunner diagnostics', text: 'Diagnostics report for HouseRunner support' }).catch(function () {}); };
                $('dSave').onclick = function () { var a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name; document.body.appendChild(a); a.click(); a.remove(); };
                $('dCopy').onclick = function () { (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(function () { FD.toast('Copied'); }, function () { FD.toast('Couldn’t copy', true); }); };
            }, function (e) { b.disabled = false; b.textContent = 'Try again'; FD.toast(e.message, true); });
        };
    }
    function connectPage() {
        $('faMain').onclick = null;
        $('faMain').innerHTML = '<a class="fa-back" href="#/more">‹ More</a>' + h('Connect a display') +
            '<p class="fa-lead">A new screen – the Corsair XENEON EDGE, a tablet, a Raspberry Pi or a computer – shows a code like <b>K7Q2-M9XD</b>. Type it here:</p>' +
            box('<input id="prCode" class="fa-code" placeholder="K7Q2-M9XD" autocomplete="off" autocapitalize="characters" spellcheck="false"><button class="btn wide" id="prGo">Connect</button><div id="prOut"></div>') +
            '<p class="fa-note">Or scan the QR code on the screen with this phone’s camera. How to start a new screen: <a href="' + esc(ROOT) + 'help/#connect" target="_blank" rel="noopener">Help</a>.</p>';
        $('prGo').onclick = function () {
            if (!window.FDPairSend) { FD.toast('Not available here', true); return; }
            if (!confirm('Connect it to YOUR family’s dashboard? Only do this for a screen in your own home.')) return;
            var b = this; b.disabled = true;
            FDPairSend.send($('prCode').value, FD.config()).then(function (code) {
                b.disabled = false; $('prCode').value = '';
                $('prOut').innerHTML = '<p class="pos">✔ Sent. Waiting for ' + esc(code) + ' to pick it up…</p>';
                var tries = 0;
                (function check() {
                    setTimeout(function () {
                        if (!FDPairSend.collected || !$('prOut')) return;
                        FDPairSend.collected(code).then(function (got) {
                            if (got) { $('prOut').innerHTML = '<p class="pos">✔ Connected – ' + esc(code) + ' has picked it up.</p>'; return; }
                            if (++tries < 4) return check();
                            $('prOut').innerHTML = '<p class="neg">Not picked up yet. Check the code on the screen is <b>' + esc(code) + '</b> and its page is still open, then type it again.</p>';
                        }, function () { $('prOut').innerHTML = '<p class="pos">✔ Sent – it should connect within a few seconds.</p>'; });
                    }, 5000);
                })();
            }, function (e) { b.disabled = false; FD.toast(e.message, true); });
        };
    }
    function link(app) { var c = FD.config(); return ROOT + (app === 'admin' ? '' : app + '/') + '#api=' + encodeURIComponent(c.url) + '&code=' + encodeURIComponent(c.code); }
    function qr(text) { if (!window.qrcode) return ''; try { var q = qrcode(0, 'M'); q.addData(text); q.make(); return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true }); } catch (e) { return ''; } }
    function phonesPage() {
        $('faMain').onclick = null;
        var one = function (k, icon, name, who) {
            return box('<div class="fa-app"><img src="' + esc(ROOT) + (k === 'admin' ? 'admin' : 'dashboard') + '/icons/icon-192.png" alt=""><div><b>' + name + '</b><small>' + who + '</small></div></div>' +
                '<div class="fa-qr">' + qr(link(k)) + '</div>' + (navigator.share ? '<button class="btn ghost wide" data-share="' + k + '">Send the link instead</button>' : ''));
        };
        $('faMain').innerHTML = '<a class="fa-back" href="#/more">‹ More</a>' + h('Add a phone') +
            '<p class="fa-lead">On the other phone, point the camera at a code and open the link – the app opens already connected. Then add it to the home screen: <b>iPhone</b> – Share → Add to Home Screen; <b>Android</b> – ⋮ → Install app.</p>' +
            one('admin', '', 'Family Admin', 'for the grown-ups – this app') + one('dashboard', '', 'Family Dashboard', 'for everyone – the dashboard itself') +
            '<p class="fa-note">These codes contain your private access code – only use them for your own family’s phones.</p>';
        $('faMain').onclick = function (e) {
            var b = e.target.closest('[data-share]'); if (!b) return;
            var k = b.getAttribute('data-share');
            navigator.share({ title: k === 'admin' ? 'Family Admin' : 'Family Dashboard', text: 'Open this on your phone, then add it to your home screen:', url: link(k) }).catch(function () {});
        };
    }
    function feedbackPage() {
        $('faMain').onclick = null;
        var kinds = [['Support request', 'Something isn’t working'], ['Feature request', 'An idea'], ['Feedback', 'What you think']], kind = feedbackPage.kind || kinds[0][0];
        $('faMain').innerHTML = '<a class="fa-back" href="#/more">‹ More</a>' + h('Feedback and support') +
            '<div class="fa-seg" id="fbK">' + kinds.map(function (k) { return '<button data-k="' + k[0] + '"' + (k[0] === kind ? ' class="on"' : '') + '>' + k[0].replace(' request', '') + '</button>'; }).join('') + '</div>' +
            box('<label>Subject</label><input id="fbS" maxlength="120" autocomplete="off"><label>' + (kind === 'Support request' ? 'What’s happening – and what you expected' : 'Tell us more') + '</label><textarea id="fbM" rows="5" maxlength="8000"></textarea>' +
                '<label>Your email <small>(optional – for a reply)</small></label><input id="fbE" type="email" autocomplete="email"><button class="btn wide" id="fbGo">Send</button><div id="fbOut"></div>') +
            '<p class="fa-note">To send a diagnostics report with it, use Feedback on a computer at <b>' + esc(HOST) + '</b>.</p>';
        $('fbK').onclick = function (e) { var b = e.target.closest('[data-k]'); if (b) { feedbackPage.kind = b.getAttribute('data-k'); draw(); } };
        $('fbGo').onclick = function () {
            var b = this, s = $('fbS').value.trim(), m = $('fbM').value.trim(), mail = $('fbE').value.trim();
            if (!s && !m) { FD.toast('Write something first', true); return; }
            b.disabled = true; b.textContent = '⏳ Sending…';
            FD.post({ action: 'feedback', type: kind, subject: s, message: m, email: mail, report: '' }).then(function (d) {
                $('fbOut').innerHTML = '<p class="pos">✔ Sent – thank you. Your reference is <b>' + esc(d.ref) + '</b>.</p>'; $('fbS').value = ''; $('fbM').value = ''; b.disabled = false; b.textContent = 'Send';
            }, function (e) { b.disabled = false; b.textContent = 'Send'; FD.toast(e.message, true); });
        };
    }

    var PAGES = { calendar: calendarPage, notes: notesPage, lists: listsPage, reminders: remindersPage, points: pointsPage, other: widgetsPage, more: morePage };

    /* ------------------------------------------------------------------ the privacy notice (accepted once, on any device) */

    var pvOpen = false;
    function privacy() {
        var P = window.FD_PRIVACY;
        if (!P || !DATA || !('privacyAccepted' in DATA) || DATA.privacyAccepted === P.version || pvOpen) return;
        pvOpen = true;
        sheet('<h2>' + (DATA.privacyAccepted ? 'The privacy notice has changed' : 'Privacy notice') + '</h2><ul class="fa-pv">' + P.summary.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ul>' +
            '<details><summary>Read the full notice</summary><div class="fa-pvfull">' + P.full + '</div></details>' +
            '<div class="fa-actions"><button class="btn good" id="pvOk">I accept</button></div>', true);
        $('pvOk').onclick = function () {
            act({ action: 'acceptPrivacy', version: P.version, who: 'Family Admin app' }, 'Thank you').then(function () { DATA.privacyAccepted = P.version; pvOpen = false; closeSheet(); }, function () {});
        };
    }

    /* ------------------------------------------------------------------ start */

    function start() { frame(); draw(); load(DATA ? true : false); }
    FD.registerSW();
    if (FD.configured()) start();
    else if (document.getElementById('landing')) { document.getElementById('landing').hidden = false; $('app').hidden = true; }     // not connected: the welcome page
    else FD.setupScreen($('app'), 'Family Admin', start);
})();
