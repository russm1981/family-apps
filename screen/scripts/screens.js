/* Family Dashboard – Calendar page (3 months, month and week views, adding events).
 * Uses window.FDApi from app.js for talking to the Google Sheet backend.
 */
(function () {
    'use strict';

    var $ = function (id) { return document.getElementById(id); };
    function api() { return window.FDApi; }
    function esc(s) { return api().esc(s); }
    function visible(id) { var el = $(id); return el && el.classList.contains('on'); }

    var DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
    function pad(n) { return (n < 10 ? '0' : '') + n; }
    function parseYmd(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }

    /* ============================================================ CALENDAR */

    var calStart = null, calCache = {}, calLoading = '', calErr = '', calCats = [], calAdd = [];
    var adding = null;   // { cat, start, end } while the add-event bar is open
    var openDayStr = null;
    try { calCats = JSON.parse(localStorage.getItem('familyDashboard.cats.v2') || '[]'); calAdd = JSON.parse(localStorage.getItem('familyDashboard.add.v2') || '[]'); } catch (e) { calCats = []; calAdd = []; }

    /** Split a day into normal entries and the school-holiday style bar (if any). */
    function dayParts(data, ds) {
        var all = data[ds] || [], evs = [], bar = null;
        all.forEach(function (e) { if (e.bar) bar = bar || e; else evs.push(e); });
        return { evs: evs, bar: bar };
    }
    function barHtml(data, d) {      // d = Date
        var ds = ymd(d), p = dayParts(data, ds).bar;
        if (!p) return { cls: '', html: '' };
        var prev = dayParts(data, ymd(addDays(d, -1))).bar, next = dayParts(data, ymd(addDays(d, 1))).bar;
        return { cls: ' hol' + (prev ? '' : ' hol-s') + (next ? '' : ' hol-e'), html: '<span class="holbar" style="--hc:' + esc(p.c) + '"></span>' };
    }

    /** Dark or light text, whichever reads better on a colour. */
    function ink(hex) {
        var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex || ''));
        if (!m) return '#fff';
        var l = 0.299 * parseInt(m[1], 16) + 0.587 * parseInt(m[2], 16) + 0.114 * parseInt(m[3], 16);
        return l > 160 ? '#151515' : '#fff';
    }
    function fmtDay(ds) { var d = parseYmd(ds); return DOW[d.getDay()] + ' ' + d.getDate() + ' ' + MON[d.getMonth()]; }

    function monthStart(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
    function addMonths(d, n) { return new Date(d.getFullYear(), d.getMonth() + n, 1); }

    var calView = '3m';           // '3m' (default), '1m' or 'week'
    var defaultView = '3m', touched = false;
    var calWeek = null;           // Monday of the week shown in week view
    var DAYNAME = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    var MONTHNAME = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
    function mondayOf(d) { return addDays(new Date(d.getFullYear(), d.getMonth(), d.getDate()), -((d.getDay() + 6) % 7)); }
    function monthGrid() {               // Monday on/before the 1st, and how many weeks are needed
        var first = mondayOf(calStart);
        var dim = new Date(calStart.getFullYear(), calStart.getMonth() + 1, 0).getDate();
        var weeks = Math.ceil((((calStart.getDay() + 6) % 7) + dim) / 7);
        return { first: first, weeks: weeks };
    }

    function calRange() {
        if (calView === 'week') return { start: ymd(calWeek), end: ymd(addDays(calWeek, 7)) };
        if (calView === '1m') { var g = monthGrid(); return { start: ymd(g.first), end: ymd(addDays(g.first, g.weeks * 7)) }; }
        return { start: ymd(calStart), end: ymd(addMonths(calStart, 3)) };
    }

    function setView(v, anchor) {
        calView = v;
        var a = anchor || new Date();
        if (v === 'week') calWeek = mondayOf(a);
        else calStart = monthStart(a);
        Array.prototype.forEach.call(document.querySelectorAll('.vw-btn'), function (b) { b.classList.toggle('on', b.getAttribute('data-view') === v); });
        loadCalendar();
    }
    function step(dir) {
        if (calView === 'week') calWeek = addDays(calWeek, 7 * dir);
        else calStart = addMonths(calStart, dir);   // 3-month and month views both move one month at a time
        loadCalendar();
    }
    function goToday() { setView(calView, new Date()); loadCalendar(true); }

    function loadCalendar(force) {
        if (!calStart) calStart = monthStart(new Date());
        if (!calWeek) calWeek = mondayOf(new Date());
        var r = calRange(), key = r.start + ':' + r.end;
        renderCalendar();
        if (!api().ready()) return;
        if (calCache[key] && !force && Date.now() - calCache[key].at < 5 * 60000) return;
        calLoading = key; calErr = '';
        $('calStatus').textContent = 'Updating…';
        api().get('calendar', r).then(function (d) {
            if (d.error) throw new Error(d.error);
            calCache[key] = { at: Date.now(), days: d.days || {}, bh: d.bankHolidays || {} };
            if (d.categories && d.categories.length) {
                calCats = d.categories; calAdd = d.addable || [];
                try { localStorage.setItem('familyDashboard.cats.v2', JSON.stringify(calCats)); localStorage.setItem('familyDashboard.add.v2', JSON.stringify(calAdd)); } catch (e) { /* ignore */ }
            }
            if (calLoading === key) { calLoading = ''; renderCalendar(); }
        }).catch(function (e) {
            if (calLoading === key) { calLoading = ''; calErr = e.message; renderCalendar(); }
        });
    }

    var curBH = {};
    function isSel(ds) { return adding && adding.start && ds >= adding.start && ds <= (adding.end || adding.start); }
    function cellClass(dt, ds, today, extra) {
        var dow = dt.getDay();
        return (dow === 0 || dow === 6 || curBH[ds] ? ' wkend' : '') + (curBH[ds] ? ' bankhol' : '') + (ds === today ? ' today' : '') + (ds < today ? ' past' : '') + (isSel(ds) ? ' sel' : '') + (extra || '');
    }
    function evStyle(e) { return 'style="--ec:' + esc(e.c) + ';--et:' + ink(e.c) + '"'; }

    function renderCalendar() {
        var r = calRange(), key = r.start + ':' + r.end;
        var data = (calCache[key] || {}).days || {};
        curBH = (calCache[key] || {}).bh || {};
        var today = ymd(new Date());
        $('calStatus').textContent = !api().ready() ? 'Not connected' : calErr ? '⚠ ' + calErr : calLoading ? 'Updating…' : '';
        $('calRows').className = 'cal-rows view-' + calView;
        if (calView === 'week') renderWeek(data, today);
        else if (calView === '1m') renderMonth(data, today);
        else render3m(data, today);
        renderKey();
    }

    function render3m(data, today) {
        var last = addMonths(calStart, 2);
        $('calYear').textContent = calStart.getFullYear() === last.getFullYear() ? calStart.getFullYear() : calStart.getFullYear() + ' – ' + last.getFullYear();
        $('calRange').textContent = MON[calStart.getMonth()] + ' – ' + MON[last.getMonth()];
        var html = '';
        for (var m = 0; m < 3; m++) {
            var ms = addMonths(calStart, m);
            var dim = new Date(ms.getFullYear(), ms.getMonth() + 1, 0).getDate();
            html += '<div class="cal-row"><button class="cal-month" data-month="' + ymd(ms) + '"><b>' + MON[ms.getMonth()] + '</b><span>' + ms.getFullYear() + '</span></button>';
            for (var d = 1; d <= 31; d++) {
                if (d > dim) { html += '<div class="cal-cell none"></div>'; continue; }
                var dt = new Date(ms.getFullYear(), ms.getMonth(), d);
                var ds = ymd(dt);
                var evs = dayParts(data, ds).evs, hb = barHtml(data, dt);
                var shown = evs.slice(0, 4).map(function (e) { return '<div class="ev" ' + evStyle(e) + '>' + esc(e.t) + '</div>'; }).join('');
                if (evs.length > 4) shown += '<div class="ev more">+' + (evs.length - 4) + ' more</div>';
                html += '<button class="cal-cell' + cellClass(dt, ds, today, hb.cls) + '" data-day="' + ds + '"><span class="cd"><b>' + d + '</b><i>' + DOW[dt.getDay()].charAt(0) + '</i></span>' + shown + hb.html + '</button>';
            }
            html += '</div>';
        }
        $('calRows').innerHTML = html;
    }

    function renderMonth(data, today) {
        $('calYear').textContent = MONTHNAME[calStart.getMonth()];
        $('calRange').textContent = calStart.getFullYear();
        var g = monthGrid();
        var html = '<div class="mv-head"><span></span>' + [1, 2, 3, 4, 5, 6, 0].map(function (i) { return '<b class="' + (i === 0 || i === 6 ? 'we' : '') + '">' + DAYNAME[i] + '</b>'; }).join('') + '</div>';
        html += '<div class="mv-grid" style="grid-template-rows:repeat(' + g.weeks + ',minmax(0,1fr))">';
        for (var w = 0; w < g.weeks; w++) {
            var mon = addDays(g.first, w * 7);
            html += '<button class="mv-wk" data-week="' + ymd(mon) + '" title="Open this week">' + mon.getDate() + '<br>' + MON[mon.getMonth()] + '<i>week</i></button>';
            for (var k = 0; k < 7; k++) {
                var dt = addDays(mon, k), ds = ymd(dt);
                var outside = dt.getMonth() !== calStart.getMonth();
                var evs = dayParts(data, ds).evs, hb = barHtml(data, dt);
                var lim = g.weeks >= 6 ? 3 : g.weeks === 5 ? 4 : 5;          // what fits in a day box
                var cut = evs.length > lim ? lim - 1 : evs.length;
                var shown = evs.slice(0, cut).map(function (e) {
                    return '<div class="mev" ' + evStyle(e) + '>' + (e.time ? '<span class="mt">' + esc(e.time) + '</span>' : '') +
                        '<span class="mx">' + esc(e.t) + '</span></div>';
                }).join('');
                if (evs.length > cut) shown += '<div class="mv-more">+' + (evs.length - cut) + ' more – tap to see</div>';
                html += '<button class="cal-cell mv-cell' + cellClass(dt, ds, today, (outside ? ' out' : '') + hb.cls) + '" data-day="' + ds + '"><span class="cd"><b>' + dt.getDate() + '</b>' +
                    (dt.getDate() === 1 ? '<i>' + MON[dt.getMonth()] + '</i>' : '') + '</span>' + shown + hb.html + '</button>';
            }
        }
        $('calRows').innerHTML = html + '</div>';
    }

    function renderWeek(data, today) {
        var sun = addDays(calWeek, 6);
        $('calYear').textContent = calWeek.getDate() + (calWeek.getMonth() !== sun.getMonth() ? ' ' + MON[calWeek.getMonth()] : '') + ' – ' + sun.getDate() + ' ' + MON[sun.getMonth()];
        $('calRange').textContent = sun.getFullYear() + (ymd(calWeek) <= today && today < ymd(addDays(calWeek, 7)) ? ' · this week' : '');
        var html = '';
        for (var k = 0; k < 7; k++) {
            var dt = addDays(calWeek, k), ds = ymd(dt);
            var evs = dayParts(data, ds).evs, hb = barHtml(data, dt);
            var list = evs.length ? evs.map(function (e) {
                return '<div class="wev" ' + evStyle(e) + '><div class="wtop">' +
                    (e.time ? '<span class="wt">' + esc(e.time) + '</span>' : (e.allDay ? '<span class="wt">All day</span>' : '')) + '</div>' +
                    '<div class="wx">' + esc(e.t) + '</div>' + (e.note ? '<div class="wn">' + esc(e.note) + '</div>' : '') + '</div>';
            }).join('') : '<div class="empty">Nothing on</div>';
            html += '<button class="cal-cell wv-col' + cellClass(dt, ds, today, hb.cls) + '" data-day="' + ds + '">' +
                '<span class="wv-head"><b>' + DAYNAME[dt.getDay()] + '</b><i>' + dt.getDate() + ' ' + MON[dt.getMonth()] + '</i>' +
                (curBH[ds] ? '<em class="bhn">' + esc(curBH[ds]) + '</em>' : '') + '</span>' +
                '<span class="wv-list">' + list + '</span>' + hb.html + '</button>';
        }
        $('calRows').innerHTML = html;
    }

    function renderKey() {
        $('calKey').innerHTML = calCats.map(function (c) {
            return '<span class="key"><i class="' + (c.bar ? 'bar' : '') + '" style="background:' + esc(c.colour) + '"></i>' + esc(c.name) + '</span>';
        }).join('');
    }

    /* ---------------------------------------------------------- add an event */

    function startAdding(ds) {
        $('calDay').classList.remove('on');
        adding = { cat: adding && adding.cat || '', start: ds || null, end: ds || null };
        $('abTitle').value = ''; $('abNote').value = '';
        $('screen-calendar').classList.add('adding');
        renderAddBar(); renderCalendar();
    }
    function stopAdding() {
        adding = null;
        $('screen-calendar').classList.remove('adding');
        try { document.activeElement.blur(); } catch (e) { /* ignore */ }
        renderCalendar();
    }
    function renderAddBar() {
        if (!adding) return;
        var cats = calAdd;
        $('abCats').innerHTML = cats.length ? cats.map(function (c) {
            var on = adding.cat === c.name;
            return '<button class="ab-cat' + (on ? ' on' : '') + '" data-cat="' + esc(c.name) + '" style="--ec:' + esc(c.colour) + ';--et:' + ink(c.colour) + '">' + esc(c.name) + '</button>';
        }).join('') : '<span class="ab-hint">Run setup in Apps Script to create the category calendars</span>';
        var a = adding.start, z = adding.end || adding.start;
        var n = a ? Math.round((parseYmd(z) - parseYmd(a)) / 86400000) + 1 : 0;
        $('abDates').innerHTML = !a ? '<span class="ab-hint">Tap a day below</span>' :
            '<b>' + fmtDay(a) + '</b>' + (n > 1 ? ' → <b>' + fmtDay(z) + '</b> <span class="ab-hint">' + n + ' days</span>' :
            ' <span class="ab-hint">tap another day for a longer event</span>');
        $('abSave').disabled = !(adding.cat && a && $('abTitle').value.trim());
    }
    function pickDay(ds) {
        if (!adding.start || adding.end !== adding.start) { adding.start = ds; adding.end = ds; }
        else if (ds < adding.start) { adding.end = adding.start; adding.start = ds; }
        else { adding.end = ds; }
        renderAddBar(); renderCalendar();
    }
    function saveEvent() {
        if (!adding || $('abSave').disabled) return;
        var body = { action: 'addEvent', category: adding.cat, title: $('abTitle').value.trim(), note: $('abNote').value.trim(),
            start: adding.start, end: adding.end || adding.start };
        $('abSave').disabled = true; $('abSave').textContent = 'Saving…';
        api().post(body).then(function () {
            api().toast('Added “' + body.title + '” to ' + body.category);
            stopAdding(); calCache = {}; loadCalendar(true);
        }).catch(function (e) {
            api().toast('Didn’t save: ' + e.message, true);
            renderAddBar();
        }).finally(function () { $('abSave').textContent = 'Save'; });
    }

    function openDay(ds) {
        var r = calRange(), data = ((calCache[r.start + ':' + r.end] || {}).days || {})[ds] || [];
        var dt = parseYmd(ds);
        $('calDayTitle').textContent = dt.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        var bars = data.filter(function (e) { return e.bar; });
        data = data.filter(function (e) { return !e.bar; });
        var bhName = ((calCache[r.start + ':' + r.end] || {}).bh || {})[ds];
        var top = (bhName ? '<div class="dl-bh">Bank holiday \u00b7 ' + esc(bhName) + '</div>' : '') + bars.map(function (e) { return '<div class="dl-bar" style="--hc:' + esc(e.c) + '"><span>' + esc(e.k) + '</span> ' + esc(e.t) + '</div>'; }).join('');
        $('calDayList').innerHTML = top + (data.length ? data.map(function (e) {
            return '<div class="dl-row" style="--ec:' + esc(e.c) + '"><span class="dl-time">' + (e.allDay ? 'All day' : esc(e.time || '')) + '</span>' +
                '<span class="dl-main"><span>' + esc(e.t) + '</span>' + (e.note ? '<span class="dl-note">' + esc(e.note) + '</span>' : '') + '</span>' +
                '<span class="dl-cat" style="--ec:' + esc(e.c) + ';--et:' + ink(e.c) + '">' + esc(e.k || '') + '</span></div>';
        }).join('') : (top ? '' : '<div class="empty">Nothing in the calendar</div>'));
        openDayStr = ds;
        $('calDay').classList.add('on');
    }

    /* ============================================================== wiring */

    /** From the Home screen: open the Calendar and show one day in full. */
    function goToDay(ds) {
        if (!window.FDPages || !window.FDPages.goType('calendar')) return;
        var r0 = calRange();
        if (!(ds >= r0.start && ds < r0.end)) setView(calView, parseYmd(ds));
        var tries = 0;
        (function wait() {
            var r = calRange();
            if (calCache[r.start + ':' + r.end] && ds >= r.start && ds < r.end) { openDay(ds); return; }
            if (tries++ < 40) setTimeout(wait, 150);
        })();
    }
    document.addEventListener('click', function (e) {
        var b = e.target.closest('[data-goday]'); if (b) goToDay(b.getAttribute('data-goday'));
    });

    window.FDScreens = {
        calendar: {
            init: function () {
                calStart = monthStart(new Date());
                $('calPrev').addEventListener('click', function () { step(-1); });
                $('calNext').addEventListener('click', function () { step(1); });
                $('calToday').addEventListener('click', goToday);
                $('calViews').addEventListener('click', function (e) {
                    var b = e.target.closest('[data-view]'); if (!b) return;
                    touched = true;
                    // Keep today in view when it's on screen; otherwise keep the period you were looking at.
                    var r = calRange(), t = ymd(new Date());
                    var anchor = (t >= r.start && t < r.end) ? new Date() : (calView === 'week' ? calWeek : calStart);
                    setView(b.getAttribute('data-view'), anchor);
                });
                $('calRows').addEventListener('click', function (e) {
                    var mo = e.target.closest('[data-month]'); if (mo && !adding) { setView('1m', parseYmd(mo.getAttribute('data-month'))); return; }
                    var wk = e.target.closest('[data-week]'); if (wk && !adding) { setView('week', parseYmd(wk.getAttribute('data-week'))); return; }
                    var c = e.target.closest('.cal-cell[data-day]'); if (!c) return;
                    if (adding) pickDay(c.getAttribute('data-day')); else openDay(c.getAttribute('data-day'));
                });
                $('calAdd').addEventListener('click', function () { if (adding) stopAdding(); else startAdding(null); });
                $('calDayAdd').addEventListener('click', function () { startAdding(openDayStr); });
                $('abCancel').addEventListener('click', stopAdding);
                $('abSave').addEventListener('click', saveEvent);
                $('abCats').addEventListener('click', function (e) {
                    var b = e.target.closest('[data-cat]'); if (!b || !adding) return;
                    adding.cat = b.getAttribute('data-cat'); renderAddBar();
                });
                $('abTitle').addEventListener('input', renderAddBar);
                $('abTitle').addEventListener('keydown', function (e) { if (e.key === 'Enter') saveEvent(); });
                $('abNote').addEventListener('keydown', function (e) { if (e.key === 'Enter') saveEvent(); });
                $('calDay').addEventListener('click', function (e) { if (e.target === $('calDay') || e.target.closest('#calDayClose')) $('calDay').classList.remove('on'); });
                renderCalendar();
                setInterval(function () { if (visible('screen-calendar')) loadCalendar(true); }, 15 * 60000);
            },
            onShow: function () { loadCalendar(); },
            /** Admin setting "Opens on": 3 months, Month or Week. Used until someone picks a view on the screen. */
            setDefault: function (v) {
                var view = { '3 months': '3m', 'Month': '1m', 'Week': 'week' }[v] || '3m';
                if (defaultView === view) return;
                defaultView = view;
                if (!touched) setView(view, new Date());
            },
            reset: function () { calCache = {}; if (visible('screen-calendar')) loadCalendar(true); },
        },
    };
})();
