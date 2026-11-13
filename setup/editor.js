/* The screen layout editor on the Setup website (computer only).
 *   left    the screens (pages): pick one, reorder, add one (widgets or calendar; each child is a widget)
 *   middle  the chosen screen as it will look on a Corsair XENEON EDGE, a tablet or a computer – drag widgets about
 *   right   every kind of widget: drag one onto the screen to add it
 * A widget with "When to show" is drawn split diagonally: itself top-left, the widget shown at other times bottom-right,
 * with the times across the middle. Click any widget for its height, page, When to show, or to remove it.
 * It packs widgets exactly as the screen does: a full-height widget takes a column; two half-height ones share one.
 */
(function () {
    'use strict';
    var H = null, el = null, dragging = null;
    var KEY_P = 'fdedit.page', KEY_F = 'fdedit.format';
    function load(k, d) { try { return localStorage.getItem(k) || d; } catch (e) { return d; } }
    function store(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* fine */ } }

    var FORMATS = [['wide', 'Corsair XENEON EDGE', '32:9 · 4 columns'], ['standard', 'Tablet', '16:10 · 2 columns a screen'], ['computer', 'Computer screen', '16:9 · the Corsair layout, centred']];
    var DAYS = { 'Every day': 'Every day', 'Monday to Friday': 'Mon–Fri', 'Monday to Thursday': 'Mon–Thu', 'Weekends': 'Sat–Sun' };

    function D() { return H.data(); }
    function esc(s) { return H.esc(s); }
    function pages() { return (D().pages || []).filter(function (p) { return p.type !== 'boys'; }).slice().sort(function (a, b) { return a.order - b.order; }); }
    function onPage(pid, all) { return (D().widgets || []).filter(function (w) { return w.page === pid && (all || w.show); }).sort(function (a, b) { return a.order - b.order; }); }
    function pack(ws) {   // the same as the screen (widgets.js)
        var cols = [];
        ws.forEach(function (w) {
            var last = cols[cols.length - 1];
            if (w.size === 'half' && last && last.length === 1 && last[0].size === 'half') last.push(w); else cols.push([w]);
        });
        return cols;
    }
    var MAX_SCREENS = 6;
    var INFO_HTML = '<h2>ℹ️ How your dashboard is put together</h2>' +
        '<p>Your dashboard is made of <b>widgets</b> – the weather, trains, notes, each child’s rewards card and so on – arranged on <b>screens</b> you flick between down the side. ' +
        'Use this page to choose which widgets you want and which screen each goes on. There are two kinds of screen: <b>widget screens</b>, and <b>calendar screens</b> (each can show different Google calendars).</p>' +
        '<h3>One layout, three shapes of screen</h3><p>The same layout works on the long, thin <b>Corsair</b> (four widgets across), a <b>tablet</b> held landscape (two across – a screen is split over two if it needs to be) and a <b>computer</b>. ' +
        'Use the buttons at the top to see how yours will look on each.</p>' +
        '<h3>Moving widgets about</h3><p>Drag a widget from the list on the right onto a screen; drag widgets to move them, or onto another screen on the left. To remove one, drag it to the bin or use the 🗑 on it.</p>' +
        '<h3>Clicking a widget</h3><p>On the left, <b>how it appears</b>: <b>full height</b> or <b>half height</b> (two half-height widgets share a space), and <b>When to show</b>. ' +
        'On the right, <b>its own settings</b> – the stations, the routes, the album…</p>' +
        '<h3>Showing a widget only at certain times</h3><p>Any widget can show only on some days or at some times – trains on weekday mornings, say. You then pick another widget to show in the same space the rest of the time; ' +
        'the screen layout shows both, split by a diagonal line, and clicking either half opens that widget’s settings.</p>' +
        '<h3>How many</h3><p>Up to ' + MAX_SCREENS + ' screens – that’s what fits neatly down the side of the Corsair.</p>';
    function current() {
        var ps = pages(), id = load(KEY_P, '');
        return ps.filter(function (p) { return p.id === id; })[0] || ps.filter(function (p) { return p.type === 'widgets'; })[0] || ps[0];
    }

    /* ------------------------------------------------------------------ drawing */

    function tile(w) {
        var T = H.typeOf(w.type), W = w.when, B = W && W.OtherTimes ? H.typeOf(W.OtherTimes) : null;
        var cls = 'ed-tile ' + (w.size === 'full' ? 'full' : 'half') + (w.pending ? ' pending' : '');
        var bin = w.pending ? '' : '<button class="ed-del" data-del="' + esc(w.id) + '" title="Remove this widget">🗑</button>';
        if (W && B) {
            return '<div class="' + cls + ' split" draggable="true" data-id="' + esc(w.id) + '" title="Click for its settings · drag to move">' + bin +
                '<div class="sp-a"><span class="ico">' + esc(T.icon) + '</span><b>' + esc(T.name) + '</b></div>' +
                '<div class="sp-b"' + (backupOf(W.OtherTimes) ? ' data-sub="' + esc(backupOf(W.OtherTimes).id) + '" title="Click for the ' + esc(B.name) + ' settings"' : '') + '><span class="ico">' + esc(B.icon) + '</span><b>' + esc(B.name) + '</b></div>' +
                '<svg class="sp-line" viewBox="0 0 100 100" preserveAspectRatio="none"><line x1="100" y1="0" x2="0" y2="100"/></svg>' +
                '<div class="sp-time">' + esc(DAYS[W.ShowDays] || W.ShowDays) + ' ' + esc(W.ShowFrom) + '–' + esc(W.ShowUntil) + '<small>other times →</small></div></div>';
        }
        if (W) {   // limited times, nothing in its place
            return '<div class="' + cls + '" draggable="true" data-id="' + esc(w.id) + '">' + bin + '<span class="ico">' + esc(T.icon) + '</span><b>' + esc(T.name) + '</b>' +
                '<small class="when">⏰ ' + esc(DAYS[W.ShowDays] || W.ShowDays) + ' ' + esc(W.ShowFrom) + '–' + esc(W.ShowUntil) + ' · empty otherwise</small></div>';
        }
        if (w.type === 'child') return '<div class="' + cls + ' kid" draggable="true" data-id="' + esc(w.id) + '" title="Click for its settings · drag to move">' + bin + '<span class="ico">' + esc(T.icon) + '</span><b>' + esc(w.settings && w.settings.Child || 'Child') + '</b>' +
            '<small>Points, tasks, morning to-dos and reminders</small></div>';
        return '<div class="' + cls + '" draggable="true" data-id="' + esc(w.id) + '" title="Click for its settings · drag to move">' + bin + '<span class="ico">' + esc(T.icon) + '</span><b>' + esc(T.name) + '</b>' +
            '<small>' + esc(w.pending ? 'Adding…' : H.summary(w) || '') + '</small></div>';
    }
    /** The widget that holds the settings of what's shown at other times (the first of that kind – usually a hidden one the Sheet made). */
    function backupOf(type) { return (D().widgets || []).filter(function (x) { return x.type === type; })[0]; }
    /** Hidden only so it can hold those settings: not worth showing – click its half of the split widget instead. */
    function isBackup(w) { return !w.show && (D().widgets || []).some(function (x) { return x.when && x.when.OtherTimes === w.type; }) && backupOf(w.type) === w; }
    function column(c) {
        if (c.length === 1 && c[0].size === 'half') return '<div class="ed-col">' + tile(c[0]) + '<div class="ed-slot" data-after="' + esc(c[0].id) + '">Drop a half-height widget here</div></div>';
        return '<div class="ed-col">' + c.map(tile).join('') + '</div>';
    }
    /** The menu down the left of the screen: a button for each screen (click one to go to it, or drop a widget on it). */
    // The screen's own menu, exactly as the screen builds it: every screen that's shown (the points screen too, one button
    // for each 3 children), and on a tablet a widget screen with more than two columns in two parts (Home 1, Home 2).
    // Then the microphone with its status dot, and the version.
    // The screen's calendar button: a calendar outline with today's date, in the button's own colour.
    var CAL_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4.5" width="18" height="16.5" rx="3" fill="none" stroke="currentColor" stroke-width="1.8"/>' +
        '<path d="M3 9.5h18" stroke="currentColor" stroke-width="1.8"/><path d="M8 2.5v4M16 2.5v4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>' +
        '<text x="12" y="18.3" text-anchor="middle" font-size="8.5" font-weight="700" font-family="system-ui,sans-serif" fill="currentColor">' + new Date().getDate() + '</text></svg>';
    function rail(p, part) {
        var tab = load(KEY_F, 'wide') === 'standard', out = '', all = (D().pages || []).slice().sort(function (a, b) { return a.order - b.order; });
        all.filter(function (x) { return x.show || x.id === p.id; }).forEach(function (x) {
            var n = x.type === 'boys' ? Math.max(1, Math.ceil((x.children || 0) / 3)) : tab && x.type === 'widgets' && pack(onPage(x.id)).length > 2 ? 2 : 1;
            for (var k = 0; k < n; k++) {
                var t = n > 1 ? x.title + ' ' + (k + 1) : x.title, on = x.id === p.id && (n === 1 || k === (part || 0));
                out += '<div class="' + (x.type === 'boys' ? '' : 'ed-page ') + 'ed-rb' + (on ? ' on' : '') + '" data-page="' + esc(x.id) + '" title="' + esc(t) + '"><span>' + (x.type === 'calendar' ? CAL_ICON : esc(x.icon)) + '</span>' + (tab ? '' : '<small>' + esc(t) + '</small>') + '</div>';
            }
        });
        var ver = (window.FD && window.FD.VERSION) || '';
        return '<div class="ed-rail">' + out + '<div class="ed-rfoot"><span class="ed-rmic">🎤<i></i></span>' + (ver ? '<small>v' + esc(ver) + '</small>' : '') + '</div></div>';
    }
    function frame(cols, n, label, cls, p, part) {
        var shown = cols.slice(0, n), body = shown.map(column).join('');
        for (var i = shown.length; i < n; i++) body += '<div class="ed-col empty"><div class="ed-slot end">' + (i === shown.length ? 'Drop a widget here' : '') + '</div></div>';
        return '<div class="ed-frame has-rail ' + cls + '">' + (label ? '<div class="ed-flabel">' + esc(label) + '</div>' : '') + rail(p, part) + '<div class="ed-grid" style="grid-template-columns:repeat(' + n + ',minmax(0,1fr))">' + body + '</div></div>';
    }
    /** A simple picture of the calendar page as the screen draws it, in the view it opens on (no real entries):
     * 3 months – a row per month, days across (lined up under their weekday, so weekends make columns, or starting at
     * the left); 3 months (scroll) – the same with wider days you drag along; Month – a grid of weeks; Week – a column a day. */
    function calInner(fmt, align, view) {
        var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], DN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        var COL = ['#3fa9f5', '#a855f7', '#d97757'], now = new Date(), body = '', title = '';
        var ev = function (d, m) { var k = (d * 5 + m * 3) % 11; return k < 3 ? COL[k] : ''; };
        view = view || '3 months';
        if (view === 'Month') {
            var first = new Date(now.getFullYear(), now.getMonth(), 1), lead = (first.getDay() + 6) % 7, dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
            var weeks = Math.ceil((lead + dim) / 7), cells = '<span></span>' + DN.map(function (d, i) { return '<b class="' + (i > 4 ? 'we' : '') + '">' + d + '</b>'; }).join('');
            for (var w = 0; w < weeks; w++) {
                cells += '<i class="wk">wk</i>';
                for (var k = 0; k < 7; k++) {
                    var d = w * 7 + k - lead + 1, c = d >= 1 && d <= dim ? ev(d, 0) : '';
                    cells += '<i class="' + (d < 1 || d > dim ? 'out' : k > 4 ? 'we' : '') + '"><u>' + (d >= 1 && d <= dim ? d : '') + '</u>' + (c ? '<s style="--ec:' + c + '"></s>' : '') + (c && d % 3 === 0 ? '<s style="--ec:' + COL[(d + 1) % 3] + '"></s>' : '') + '</i>';
                }
            }
            title = MON[now.getMonth()]; body = '<div class="mkm" style="grid-template-rows:auto repeat(' + weeks + ',1fr)">' + cells + '</div>';
        } else if (view === 'Week') {
            var mon = new Date(now); mon.setDate(now.getDate() - (now.getDay() + 6) % 7);
            body = '<div class="mkw">' + DN.map(function (n, i) {
                var dt = new Date(mon); dt.setDate(mon.getDate() + i);
                var evs = ''; for (var j = 0; j < (i * 7 + 3) % 4; j++) evs += '<s style="--ec:' + COL[(i + j) % 3] + '"><em></em></s>';
                return '<div class="' + (i > 4 ? 'we' : '') + '"><b>' + n + ' ' + dt.getDate() + '</b>' + (evs || '<small>Nothing on</small>') + '</div>';
            }).join('') + '</div>';
            title = 'This week';
        } else {
            var scroll = view === '3 months (scroll)', rows = '';
            for (var m = 0; m < 3; m++) {
                var d1 = new Date(now.getFullYear(), now.getMonth() + m, 1), days = new Date(d1.getFullYear(), d1.getMonth() + 1, 0).getDate();
                var off = align ? (d1.getDay() + 6) % 7 : 0, cols = align ? 37 : 31, cl = '';
                for (var col = 0; col < (scroll ? Math.min(cols, 14) : cols); col++) {
                    var dd = col - off + 1;
                    if (dd < 1 || dd > days) { cl += '<i class="gap"></i>'; continue; }
                    var dow = (d1.getDay() + dd - 1) % 7, c2 = ev(dd, m);
                    cl += '<i class="' + (dow === 0 || dow === 6 ? 'we' : '') + '">' + (scroll ? '<u>' + dd + '</u>' : '') + (c2 ? '<s style="--ec:' + c2 + '"></s>' : '') + '</i>';
                }
                rows += '<div class="mk3r"><b>' + MON[d1.getMonth()] + '</b><div class="mk3c" style="grid-template-columns:repeat(' + (scroll ? 14 : cols) + ',minmax(0,1fr))">' + cl + '</div></div>';
            }
            title = MON[now.getMonth()] + ' – ' + MON[(now.getMonth() + 2) % 12];
            body = '<div class="mk3' + (scroll ? ' scroll' : '') + '">' + rows + (scroll ? '<span class="mk-drag">⟵ drag along ⟶</span>' : '') + '</div>';
        }
        return '<div class="mk-cal"><div class="mk-top"><b>' + esc(title) + '</b><span>3 months · 3 months (scroll) · Month · Week' + (fmt === 'wide' ? '' : ' · Year') + '</span></div>' + body + '</div>';
    }
    /** A drawing of a calendar or points screen (no real names or entries), the same size as a widget screen. */
    function mockFrame(p, fmt, n) {
        var inner;
        if (p.type === 'calendar') {
            inner = calInner(fmt, (p.settings || {}).AlignWeekdays !== false, (p.settings || {}).DefaultView);
        } else {
            var cards = '';
            for (var i = 0; i < n; i++) cards += '<div class="mk-kid"><b>Child ' + (i + 1) + '</b><span class="mk-pts">123</span><small>points</small><i></i><i></i><i></i></div>';
            for (var j = n; j < 3; j++) cards += '<div class="mk-kid empty"></div>';
            inner = '<div class="mk-kids">' + cards + '</div>';
        }
        return '<div class="ed-frame has-rail ' + (fmt === 'standard' ? 'tab' : 'wide') + ' mock">' + rail(p) + '<div class="mk-in">' + inner + '</div></div>';
    }
    function otherView(p) {
        var fmt = load(KEY_F, 'wide'), out = '';
        if (p.type === 'calendar') {
            out = fmt === 'computer' ? '<div class="ed-monitor">' + mockFrame(p, 'wide') + '</div>' : mockFrame(p, fmt);
            // This page's few settings first, then the picture of it, then the categories and key.
            return (H.pageForm ? '<section class="ed-pset ed-pset-top" data-pset="' + esc(p.id) + '">' + H.pageForm(p.id) +
                    '<button class="btn good" data-psave="' + esc(p.id) + '">Save</button></section>' : '') + out +
                '<p class="mute small">The calendar fills the screen; on a tablet or computer it also has a whole-year wall planner. You can have more than one calendar page, each linked to a different Google calendar.</p>' +
                (H.calSetup ? '<div class="cs-box" data-cs="' + esc(p.id) + '"></div>' : '');
        }
        var kids = Math.max(1, p.children || 1), screens = Math.ceil(kids / 3), frames = '';
        for (var k = 0; k < screens; k++) {
            var nHere = Math.min(3, kids - k * 3), f = mockFrame(p, fmt === 'computer' ? 'wide' : fmt, nHere);
            frames += '<div class="ed-mockwrap">' + (screens > 1 ? '<div class="ed-flabel">' + esc(p.title) + ' ' + (k + 1) + '</div>' : '') + (fmt === 'computer' ? '<div class="ed-monitor">' + f + '</div>' : f) + '</div>';
        }
        return '<div class="ed-tabs' + (fmt === 'standard' ? ' stack' : ' one') + '">' + frames + '</div>' +
            '<p class="mute small">One card for each child on the points page, up to 3 a screen. With more children, extra screens are added by themselves (' + esc(p.title) + ' 1, ' + esc(p.title) + ' 2…). ' +
            'Who’s on the points page is set in <b>Reconfigure → Family &amp; calendar</b>.</p>';
    }
    function screenView(p) {
        var fmt = load(KEY_F, 'wide'), cols = pack(onPage(p.id));
        if (p.type !== 'widgets') return otherView(p);
        var out = '', over = cols.length - 4;
        if (fmt === 'standard') {
            var n = Math.max(1, Math.ceil(Math.min(cols.length, 4) / 2));
            for (var k = 0; k < n; k++) out += frame(cols.slice(k * 2, k * 2 + 2), 2, n > 1 ? p.title + ' ' + (k + 1) + ' of ' + n : p.title, 'tab', p, k);
            out = '<div class="ed-tabs side">' + out + '</div>' + (n > 1 ? '<p class="mute small">On a tablet this screen is in ' + n + ' parts – each has its own button in the menu.</p>' : '');
        } else if (fmt === 'computer') {
            out = '<div class="ed-monitor">' + frame(cols, 4, '', 'wide', p) + '</div>';
        } else out = frame(cols, 4, '', 'wide', p);
        // What doesn't fit: shown underneath, to drag elsewhere or click to remove
        if (over > 0) out += '<div class="ed-over">⚠ ' + over + ' column' + (over > 1 ? 's' : '') + ' won’t fit on the screen. Drag ' + (over > 1 ? 'them' : 'it') +
            ' onto another screen on the left, make widgets half height, or click one to hide or remove it.</div>' +
            '<div class="ed-overflow"><div class="ed-grid" style="grid-template-columns:repeat(' + Math.max(over, 2) + ',minmax(0,1fr))">' + cols.slice(4).map(column).join('') + '</div></div>';
        var hidden = onPage(p.id, true).filter(function (w) { return !w.show && !isBackup(w); });
        if (hidden.length) out += '<div class="ed-hidden"><h4>Hidden on this screen <small>– drag one onto the screen to show it</small></h4>' +
            hidden.map(function (w) {
                var bk = (D().widgets || []).some(function (x) { return x.when && x.when.OtherTimes === w.type; });
                return '<div class="ed-chip" draggable="true" data-id="' + esc(w.id) + '"><span>' + esc(H.typeOf(w.type).icon) + '</span>' + esc(H.typeOf(w.type).name) + (bk ? ' <small>(shown at other times)</small>' : '') + '</div>';
            }).join('') + '</div>';
        return out;
    }
    function render() {
        var info = load(KEY_P, '') === '__info', p = info ? { id: '__info', type: 'info', title: 'How this works', icon: 'ℹ️', show: true } : current(), ps = pages(), fmt = load(KEY_F, 'wide');
        if (!p) { el.innerHTML = '<div class="empty">No screens yet.</div>'; return; }
        var full = ps.length >= MAX_SCREENS;
        el.innerHTML = '<div class="ed">' +
            '<div class="ed-top"><span class="mute">Show it as on a</span>' + FORMATS.map(function (f) {
                return '<button class="ed-fmt' + (f[0] === fmt ? ' on' : '') + '" data-fmt="' + f[0] + '"><b>' + esc(f[1]) + '</b><small>' + esc(f[2]) + '</small></button>';
            }).join('') + '</div>' +
            '<div class="ed-main nopal">' +
            '<aside class="ed-pages"><div class="ed-page info' + (info ? ' on' : '') + '" data-page="__info"><span class="pi">ℹ️</span><span class="pt"><b>How this works</b><small>Start here</small></span></div>' +
            '<h3>Screens <span class="mute small">' + ps.length + ' of ' + MAX_SCREENS + '</span></h3>' + ps.map(function (x, i) {
                return '<div class="ed-page' + (x.id === p.id ? ' on' : '') + (x.show ? '' : ' off') + '" data-page="' + esc(x.id) + '"><span class="pi">' + esc(x.icon) + '</span>' +
                    '<span class="pt"><b>' + esc(x.title) + '</b><small>' + esc(x.type === 'widgets' ? onPage(x.id).length + ' widgets' : H.pageTypeOf(x.type).name) + (x.show ? '' : ' · hidden') + '</small></span>' +
                    '<span class="pm"><button data-pm="' + esc(x.id) + ':-1"' + (i ? '' : ' disabled') + ' title="Move up">▲</button><button data-pm="' + esc(x.id) + ':1"' + (i < ps.length - 1 ? '' : ' disabled') + ' title="Move down">▼</button>' +
                    (canDelete(x) ? '<button data-pdel="' + esc(x.id) + '" title="Delete this screen">🗑</button>' : '') + '</span></div>';
            }).join('') +
            (full ? '<p class="mute small ed-full">That’s the most screens (' + MAX_SCREENS + ') – they fit neatly down the side of the Corsair. Remove one to add another.</p>' :
            '<div class="ed-add"><h4>Add a screen</h4><input id="edName" maxlength="10" placeholder="Name, e.g. Kitchen"><select id="edType"><option value="widgets">Widgets</option><option value="calendar">Calendar</option></select>' +
            '<button class="btn sm" id="edAdd">Add</button></div>') + '</aside>' +
            (info ? '<section class="ed-canvas ed-info">' + INFO_HTML + '</section></div></div>' : '') +
            (info ? '' : '<section class="ed-canvas"><div class="ed-head"><h2>' + esc(p.icon) + ' ' + esc(p.title) + '</h2>' + (p.show ? '' : '<span class="mute small">hidden</span>') +
            '<button class="btn ghost sm" data-pedit="' + esc(p.id) + '">Name, icon, show/hide…</button></div>' +
            (p.type === 'widgets' ? '<p class="ed-how">✋ Drag a widget to move it – along this screen, or onto another screen’s button in the menu on the left. ' +
                'Drag one up from the list underneath to add it. Click a widget for its height, When to show and its settings.</p>' : '') +
            screenView(p) +
            (p.type === 'widgets' ? '<div class="ed-trash" title="Drag a widget here to remove it">🗑 Drag a widget here to remove it – its settings are kept</div>' +
                '<div class="ed-palette ed-below"><h3>Add a widget</h3><p class="mute small">Drag one up onto the screen.</p>' +
                '<div class="ed-types">' + (D().types || []).filter(function (T) { return !REWARD_T[T.type]; }).map(typeTile).join('') + '</div>' +
                '<h3 class="ed-h2">⭐ Add a child’s rewards card</h3><p class="mute small">One for each child who takes part in rewards. The rewards themselves are set up on the Rewards tab.</p>' +
                '<div class="ed-types">' + (D().types || []).filter(function (T) { return REWARD_T[T.type]; }).map(typeTile).join('') + '</div></div>' : '') +
            '</section></div></div>');
        wire(p);
        if (H.afterForm) H.afterForm();
        var csb = el.querySelector('.cs-box'); if (csb && H.calSetup) H.calSetup(csb, csb.getAttribute('data-cs'));
    }

    var REWARD_T = { child: 1 };
    /** A widget screen (if there's another) or a second calendar page can be deleted. */
    function canDelete(x) { var same = pages().filter(function (y) { return y.type === x.type; }).length; return (x.type === 'widgets' || x.type === 'calendar') && same > 1; }
    function typeTile(T) {
        return '<div class="ed-type" draggable="true" data-type="' + esc(T.type) + '" title="' + esc(T.about) + '"><span>' + esc(T.icon) + '</span><b>' + esc(T.name) + '</b><small>' + esc(T.sizes.join(' / ')) + '</small></div>';
    }

    /* ------------------------------------------------------------------ changes */

    function allIds(pid) { return onPage(pid, true).map(function (w) { return w.id; }); }
    /** Put widget id (from any screen) on screen pid, before widget `before` (or at the end). */
    function place(id, pid, before, after) {
        var ids = allIds(pid).filter(function (x) { return x !== id; });
        var i = before ? ids.indexOf(before) : after ? ids.indexOf(after) + 1 : ids.length;
        if (i < 0) i = ids.length;
        ids.splice(i, 0, id);
        var w = (D().widgets || []).filter(function (x) { return x.id === id; })[0], wasHidden = w && !w.show;
        // On the screen straight away; saved in the background.
        ids.forEach(function (x, k) { var ww = (D().widgets || []).filter(function (y) { return y.id === x; })[0]; if (ww) { ww.page = pid; ww.order = k + 1; } });
        if (w) w.show = true;
        H.setData(D());
        (wasHidden ? H.act({ action: 'saveWidget', widget: { id: id, show: true } }) : Promise.resolve()).then(function () {
            return H.act({ action: 'arrangeWidgets', page: pid, ids: ids }, 'Saved – the screen updates within a minute');
        }).catch(function () { /* the app reloads */ });
    }
    function addType(type, pid, before, after) {
        var ids = allIds(pid), i = before ? ids.indexOf(before) : after ? ids.indexOf(after) + 1 : ids.length;
        if (i < 0) i = ids.length;
        var T = H.typeOf(type);
        D().widgets.forEach(function (w) { if (w.page === pid && w.order > i) w.order++; });
        var defs = {}; (T.settings || []).forEach(function (f) { defs[f.k] = f.def; });      // its standard settings, until the Sheet answers
        D().widgets.push({ id: 'new-' + Date.now(), page: pid, type: type, size: T.sizes[0], show: true, order: i + 0.5, settings: defs, when: null, pending: true });
        H.setData(D());
        H.act({ action: 'addWidget', page: pid, type: type, at: i }, 'Added – click it for its height and settings').catch(function () { /* the app reloads */ });
    }

    function remove(id) {
        var w = (D().widgets || []).filter(function (x) { return x.id === id; })[0]; if (!w) return;
        var others = (D().widgets || []).some(function (x) { return x.id !== id && x.type === w.type; });
        if (!confirm('Remove the ' + H.typeOf(w.type).name + ' widget from the screen?' + (others ? '' : ' Its settings are kept, in case you add it again.'))) return;
        D().widgets = D().widgets.filter(function (x) { return x.id !== id; });
        H.setData(D());
        H.act({ action: 'deleteWidget', id: id }, 'Removed').catch(function () { /* the app reloads and puts it back, with the reason */ });
    }
    function wire(p) {
        // Ticking "line up the days of the week" shows it on the picture straight away.
        // Changing the view it opens on, or lining up the days, shows on the picture straight away.
        el.querySelector('.ed').addEventListener('change', function (e) {
            var k = e.target.getAttribute && e.target.getAttribute('data-f'), box = e.target.closest && e.target.closest('.ed-pset');
            if (!box || (k !== 'AlignWeekdays' && k !== 'DefaultView')) return;
            var al = box.querySelector('[data-f=AlignWeekdays]'), vw = box.querySelector('[data-f=DefaultView]');
            Array.prototype.forEach.call(el.querySelectorAll('.ed-frame.mock .mk-in'), function (m) { m.innerHTML = calInner(load(KEY_F, 'wide'), al ? al.checked : true, vw ? vw.value : '3 months'); });
        });
        el.querySelector('.ed').onclick = function (e) {
            var t;
            if ((t = e.target.closest('[data-fmt]'))) { store(KEY_F, t.getAttribute('data-fmt')); render(); return; }
            if ((t = e.target.closest('[data-pdel]'))) {
                e.stopPropagation();
                var pid = t.getAttribute('data-pdel'), pg = pages().filter(function (x) { return x.id === pid; })[0]; if (!pg) return;
                var n = onPage(pid).length;
                if (n) { H.toast('Move or remove the ' + (n === 1 ? 'widget' : n + ' widgets') + ' on ' + pg.title + ' first – drag them to another screen or onto the bin', true); return; }
                if (!confirm('Delete the ' + pg.title + ' screen?')) return;
                if (load(KEY_P, '') === pid) store(KEY_P, '');
                H.act({ action: 'deletePage', id: pid }, pg.title + ' deleted').catch(function () { /* the app reloads */ });
                return;
            }
            if ((t = e.target.closest('[data-pm]'))) { var a = t.getAttribute('data-pm').split(':'); H.act({ action: 'movePage', id: a[0], dir: +a[1] }); return; }
            if ((t = e.target.closest('[data-pedit]'))) { H.pageSheet(t.getAttribute('data-pedit')); return; }
            if ((t = e.target.closest('[data-psave]'))) {
                var box = t.closest('.ed-pset'), vals = {}, inst = {};
                Array.prototype.forEach.call(box.querySelectorAll('[data-f]'), function (i) { vals[i.getAttribute('data-f')] = i.type === 'checkbox' ? i.checked : i.value.trim(); });
                Array.prototype.forEach.call(box.querySelectorAll('[data-set]'), function (i) { inst[i.getAttribute('data-set')] = i.value.trim(); });
                t.disabled = true; t.textContent = 'Saving…';
                H.savePageSettings(t.getAttribute('data-psave'), vals, inst).then(function () { render(); }, function () { render(); });
                return;
            }
            if ((t = e.target.closest('[data-del]'))) { e.stopPropagation(); remove(t.getAttribute('data-del')); return; }
            if ((t = e.target.closest('.ed-page'))) { store(KEY_P, t.getAttribute('data-page')); render(); return; }
            if ((t = e.target.closest('[data-sub]')) && !e.target.closest('.pending')) { H.widgetSheet(t.getAttribute('data-sub')); return; }
            if ((t = e.target.closest('.ed-tile, .ed-chip')) && !t.classList.contains('pending')) { H.widgetSheet(t.getAttribute('data-id')); return; }
        };
        var add = el.querySelector('#edAdd');
        if (add) add.onclick = function () {
            var type = el.querySelector('#edType').value, name = el.querySelector('#edName').value.trim() || (type === 'calendar' ? 'Calendar' : type === 'boys' ? 'Points' : '');
            if (!name) { H.toast('Give the screen a name', true); return; }
            H.act({ action: 'addPage', title: name, type: type }, 'Screen added').catch(function () {});
        };
        // Drag and drop
        el.querySelectorAll('[draggable=true]').forEach(function (d) {
            d.addEventListener('dragstart', function (e) {
                dragging = d.getAttribute('data-type') ? { type: d.getAttribute('data-type') } : { id: d.getAttribute('data-id') };
                e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', JSON.stringify(dragging)); } catch (x) { /* fine */ }
                d.classList.add('dragging');
            });
            d.addEventListener('dragend', function () { d.classList.remove('dragging'); dragging = null; clearOver(); });
        });
        function clearOver() { el.querySelectorAll('.over').forEach(function (x) { x.classList.remove('over'); }); }
        function target(e) { return e.target.closest('.ed-tile, .ed-slot, .ed-page, .ed-col.empty, .ed-trash'); }
        el.ondragover = function (e) {
            var t = target(e); if (!t || !dragging) return;
            if (t.classList.contains('ed-page') && (dragging.type || t.getAttribute('data-page') === p.id)) return;
            if (t.classList.contains('ed-trash') && !dragging.id) return;
            e.preventDefault(); clearOver(); t.classList.add('over');
        };
        el.ondrop = function (e) {
            var t = target(e); if (!t || !dragging) return;
            e.preventDefault(); clearOver();
            var d = dragging; dragging = null;
            if (t.classList.contains('ed-trash')) { if (d.id) remove(d.id); return; }
            if (t.classList.contains('ed-page')) { var to = t.getAttribute('data-page'), pg = pages().filter(function (x) { return x.id === to; })[0];
                if (!pg || pg.type !== 'widgets') { H.toast('Widgets go on widget screens', true); return; }
                if (d.id) place(d.id, to); return; }
            if (p.type !== 'widgets') return;
            var before = t.classList.contains('ed-tile') ? t.getAttribute('data-id') : null, after = t.getAttribute('data-after');
            if (before && before === d.id) return;
            if (d.type) addType(d.type, p.id, before, after); else place(d.id, p.id, before, after);
        };
    }

    window.FDEditor = { render: function (body, hooks) { H = hooks; el = body; render(); } };
})();
