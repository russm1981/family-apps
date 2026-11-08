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

    var calView = '3m';           // '3m' (default), '3ms' (3 months, scrolling), '1m', 'week' or 'year' (computer: 12 months, whole window; tablet: 6)
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

    /** Year view: a computer shows the whole year (January–December); a tablet half a year (January–June or July–December). */
    function yearMonths() { var F = window.FDFormat && FDFormat.get(); return F && F.kind === 'standard' ? 6 : 12; }
    function yearAvailable() { var F = window.FDFormat && FDFormat.get(); return !!F && (F.kind === 'computer' || F.kind === 'standard'); }
    function yearStart(d) { var n = yearMonths(); return new Date(d.getFullYear(), n === 12 ? 0 : Math.floor(d.getMonth() / n) * n, 1); }
    function calRange() {
        if (calView === 'year') return { start: ymd(calStart), end: ymd(addMonths(calStart, yearMonths())) };
        if (calView === 'week') return { start: ymd(calWeek), end: ymd(addDays(calWeek, 7)) };
        if (calView === '1m') { var g = monthGrid(); return { start: ymd(g.first), end: ymd(addDays(g.first, g.weeks * 7)) }; }
        return { start: ymd(calStart), end: ymd(addMonths(calStart, 3)) };
    }

    function setView(v, anchor) {
        calView = v;
        var a = anchor || new Date();
        if (v === 'year' && !yearAvailable()) v = calView = '3m';
        if (v === 'week') calWeek = mondayOf(a);
        else if (v === 'year') calStart = yearStart(a);
        else calStart = monthStart(a);
        fullWindow();
        Array.prototype.forEach.call(document.querySelectorAll('.vw-btn'), function (b) { b.classList.toggle('on', b.getAttribute('data-view') === v); });
        loadCalendar();
    }
    function step(dir) {
        if (calView === 'week') calWeek = addDays(calWeek, 7 * dir);
        else if (calView === 'year') calStart = addMonths(calStart, yearMonths() * dir);
        else calStart = addMonths(calStart, dir);   // 3-month and month views both move one month at a time
        loadCalendar();
    }
    function goToday() { setView(calView, new Date()); loadCalendar(true); }

    /** Cached days covering a range (one fetched block covers the 3-month, month and week views together). */
    try { var kept = JSON.parse(localStorage.getItem('familyDashboard.calBlock.v1') || 'null'); if (kept && kept.key) calCache[kept.key] = { at: 1, days: kept.days, bh: kept.bh }; } catch (e) { /* ignore */ }
    /** A range longer than one block (the year view): split into 3-month pieces. */
    function pieces(r) {
        var out = [], s0 = monthStart(parseYmd(r.start));
        while (ymd(s0) < r.end) { var e0 = addMonths(s0, 3); out.push({ start: ymd(s0), end: ymd(e0) < r.end ? ymd(e0) : r.end }); s0 = e0; }
        return out;
    }
    function long(r) { return parseYmd(r.end) - parseYmd(r.start) > 100 * 86400000; }
    function cover(r) {
        if (long(r)) {
            var parts = pieces(r).map(cover1);
            if (parts.some(function (x) { return !x; })) return null;
            var m = { at: Infinity, days: {}, bh: {} };
            parts.forEach(function (x) { m.at = Math.min(m.at, x.at); Object.assign(m.days, x.days); Object.assign(m.bh, x.bh); });
            return m;
        }
        return cover1(r);
    }
    function cover1(r) {
        var best = null;
        Object.keys(calCache).forEach(function (k) {
            var p = k.split(':');
            if (p[0] <= r.start && p[1] >= r.end && (!best || calCache[k].at > best.at)) best = calCache[k];
        });
        return best;
    }
    /** The block to fetch for a range: from the Monday before its month starts to a week after three months. */
    function block(r) {
        var ms = monthStart(parseYmd(r.start));
        var a = ymd(mondayOf(ms)), b = ymd(addDays(addMonths(ms, 3), 7));
        return { start: a < r.start ? a : r.start, end: b > r.end ? b : r.end };
    }
    var fetching = {};
    function fetchBlock(r, quiet) {
        if (long(r)) return Promise.all(pieces(r).map(function (x) { return fetchBlock(x, quiet); }));
        var b = block(r), key = b.start + ':' + b.end;
        if (fetching[key]) return fetching[key];
        fetching[key] = api().get('calendar', b).then(function (d) {
            delete fetching[key];
            if (d.error) throw new Error(d.error);
            calCache[key] = { at: Date.now(), days: d.days || {}, bh: d.bankHolidays || {} };
            // Remember the block with today in it, so the calendar appears straight away after a restart.
            var t = ymd(new Date());
            if (b.start <= t && b.end > t) { try { localStorage.setItem('familyDashboard.calBlock.v1', JSON.stringify({ key: key, days: calCache[key].days, bh: calCache[key].bh })); } catch (e) { /* full */ } }
            if (d.categories && d.categories.length) {
                calCats = d.categories; calAdd = d.addable || [];
                try { localStorage.setItem('familyDashboard.cats.v2', JSON.stringify(calCats)); localStorage.setItem('familyDashboard.add.v2', JSON.stringify(calAdd)); } catch (e) { /* ignore */ }
            }
            return key;
        }, function (e) { delete fetching[key]; throw e; });
        return fetching[key];
    }
    /** Load the months after the ones on screen in the background, so ▶ is instant too. */
    function warmNext() {
        if (!api().ready() || !calStart) return;
        var k = calView === 'year' ? yearMonths() : 3;
        var n = addMonths(calStart, k), r = { start: ymd(n), end: ymd(addMonths(n, k)) };
        var c = cover(r); if (!c || Date.now() - c.at > 10 * 60000) fetchBlock(r, true).catch(function () { /* later */ });
    }

    function loadCalendar(force) {
        if (!calStart) calStart = monthStart(new Date());
        if (!calWeek) calWeek = mondayOf(new Date());
        var r = calRange(), key = r.start + ':' + r.end;
        renderCalendar();
        if (!api().ready()) return;
        var have = cover(r);
        if (have && !force && Date.now() - have.at < 5 * 60000) { warmNext(); return; }
        calLoading = key; calErr = '';
        $('calStatus').textContent = have ? '' : 'Updating…';
        fetchBlock(r).then(function () {
            if (calLoading === key) { calLoading = ''; renderCalendar(); }
            warmNext();
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
        var r = calRange(), c = cover(r) || {};
        var data = c.days || {};
        curBH = c.bh || {};
        var today = ymd(new Date());
        $('calStatus').textContent = !api().ready() ? 'Not connected' : calErr ? '⚠ ' + calErr : calLoading ? 'Updating…' : '';
        $('calRows').className = 'cal-rows view-' + calView + (alignDays ? '' : ' no-align');
        if (calView === 'week') renderWeek(data, today);
        else if (calView === 'year') renderYear(data, today);
        else if (calView === '1m') renderMonth(data, today);
        else render3m(data, today, calView === '3ms');
        renderKey();
    }

    var scrollFor = '', drag = null, dragged = false, alignDays = true;   // alignDays: months start under their weekday (setting)
    /** 3 months, or "3 months (scroll)": wider days (about 10 across) that you drag left and right. */
    function render3m(data, today, scroll) {
        var oldWrap = scroll ? $('calRows').querySelector('.cs-wrap') : null, oldLeft = oldWrap ? oldWrap.scrollLeft : 0;
        var last = addMonths(calStart, 2);
        $('calYear').textContent = calStart.getFullYear() === last.getFullYear() ? calStart.getFullYear() : calStart.getFullYear() + ' – ' + last.getFullYear();
        $('calRange').textContent = MON[calStart.getMonth()] + ' – ' + MON[last.getMonth()];
        var html = '';
        for (var m = 0; m < 3; m++) {
            var ms = addMonths(calStart, m);
            var dim = new Date(ms.getFullYear(), ms.getMonth() + 1, 0).getDate();
            html += '<div class="cal-row"><button class="cal-month" data-month="' + ymd(ms) + '"><b>' + MON[ms.getMonth()] + '</b><span>' + ms.getFullYear() + '</span></button>';
            // Each month starts under its own weekday, so Mondays (and weekends) line up down the page: 37 columns.
            var off = alignDays ? (ms.getDay() + 6) % 7 : 0, cols = alignDays ? 37 : 31;
            for (var col = 0; col < cols; col++) {
                var d = col - off + 1;
                if (d < 1 || d > dim) { html += '<div class="cal-cell none"></div>'; continue; }
                var dt = new Date(ms.getFullYear(), ms.getMonth(), d);
                var ds = ymd(dt);
                var evs = dayParts(data, ds).evs, hb = barHtml(data, dt);
                var lim = scroll ? 5 : 4, cut = evs.length > lim ? lim - 1 : evs.length;
                var shown = evs.slice(0, scroll ? cut : 4).map(function (e) {
                    return '<div class="ev" ' + evStyle(e) + '>' + (scroll && e.time ? '<span class="et">' + esc(e.time) + '</span> ' : '') + esc(e.t) + '</div>';
                }).join('');
                if (scroll ? evs.length > cut : evs.length > 4) shown += '<div class="ev more">+' + (evs.length - (scroll ? cut : 4)) + ' more</div>';
                html += '<button class="cal-cell' + cellClass(dt, ds, today, hb.cls) + '" data-day="' + ds + '"><span class="cd"><b>' + d + '</b><i>' + (scroll ? DOW[dt.getDay()] : DOW[dt.getDay()].charAt(0)) + '</i></span>' + shown + hb.html + '</button>';
            }
            html += '</div>';
        }
        if (!scroll) { $('calRows').innerHTML = html; return; }
        $('calRows').innerHTML = '<div class="cs-wrap"><div class="cs-inner">' + html + '</div></div>';
        var wrap = $('calRows').querySelector('.cs-wrap');
        // About 10 days across the screen.
        var label = 4.2 * parseFloat(getComputedStyle(document.documentElement).fontSize), gap = 0.18 * parseFloat(getComputedStyle(document.documentElement).fontSize);
        var cw = Math.max(60, (wrap.clientWidth - label - 10 * gap) / 10);
        wrap.style.setProperty('--cw', cw + 'px');
        var key = ymd(calStart);
        if (scrollFor !== key) {
            scrollFor = key;
            var t = new Date(), first = calStart.getFullYear() === t.getFullYear() && calStart.getMonth() === t.getMonth();
            wrap.scrollLeft = first ? Math.max(0, ((alignDays ? (calStart.getDay() + 6) % 7 : 0) + t.getDate() - 3) * (cw + gap)) : 0;
        } else wrap.scrollLeft = oldLeft;
    }
    /** Mouse dragging for the scroll view (fingers scroll it natively). */
    function dragStart(e) {
        if (calView !== '3ms' || e.pointerType === 'touch') return;
        var wrap = e.target.closest('.cs-wrap'); if (!wrap) return;
        drag = { wrap: wrap, x: e.clientX, left: wrap.scrollLeft, id: e.pointerId }; dragged = false;
    }
    function dragMove(e) {
        if (!drag) return;
        var dx = e.clientX - drag.x;
        if (Math.abs(dx) > 8) dragged = true;
        if (dragged) { drag.wrap.scrollLeft = drag.left - dx; e.preventDefault(); }
    }
    function dragEnd() { drag = null; setTimeout(function () { dragged = false; }, 0); }

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

    /** Year view: little month calendars (4 × 3 on a computer, 3 × 2 on a tablet). Each day shows its first entries as
     *  coloured lines and holidays as a coloured band; tap a day for everything on it, or a month's name to open it. */
    function renderYear(data, today) {
        var n = yearMonths(), last = addMonths(calStart, n - 1);
        $('calYear').textContent = calStart.getFullYear();
        $('calRange').textContent = n === 12 ? 'Whole year' : MON[calStart.getMonth()] + ' – ' + MON[last.getMonth()];
        var html = '<div class="yv yv-' + n + '">';
        for (var m = 0; m < n; m++) {
            var ms = addMonths(calStart, m), first = mondayOf(ms), mon = ms.getMonth();
            html += '<div class="yv-m"><button class="yv-t" data-month="' + ymd(ms) + '">' + MONTHNAME[mon] + '</button><div class="yv-g">' +
                ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map(function (x, i) { return '<b class="' + (i > 4 ? 'we' : '') + '">' + x + '</b>'; }).join('');
            for (var i = 0; i < 42; i++) {
                var dt = addDays(first, i), ds = ymd(dt);
                if (dt.getMonth() !== mon) { html += '<span class="yv-x"></span>'; continue; }
                var evs = dayParts(data, ds).evs, hb = barHtml(data, dt);
                var lines = evs.slice(0, 2).map(function (e) { return '<i ' + evStyle(e) + '>' + esc(e.t) + '</i>'; }).join('') + (evs.length > 2 ? '<i class="yv-more">+' + (evs.length - 2) + '</i>' : '');
                var tip = evs.map(function (e) { return e.t; }).join(', ');
                html += '<button class="cal-cell yv-d' + cellClass(dt, ds, today, hb.cls) + '" data-day="' + ds + '"' + (tip ? ' title="' + esc(tip) + '"' : '') + '><span class="yv-n">' + dt.getDate() + '</span>' + lines + hb.html + '</button>';
            }
            html += '</div></div>';
        }
        $('calRows').innerHTML = html + '</div>';
    }
    /** On a computer the year uses the whole window; everything else stays at the Corsair's shape. */
    function fullWindow() {
        if (window.FDFormat && FDFormat.full) FDFormat.full(calView === 'year' && visible('screen-calendar') && FDFormat.get().kind === 'computer');
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

    var dayEvents = [];
    /** Delete: tap the bin, then confirm. Repeating entries ask: just this one, or all of them. */
    function onDayListClick(e) {
        var b = e.target.closest('[data-del]');
        if (b) {
            var i = +b.getAttribute('data-del'), ev = dayEvents[i], row = b.closest('.dl-row');
            if (!ev || row.querySelector('.dl-confirm')) return;
            var box = document.createElement('div'); box.className = 'dl-confirm';
            box.innerHTML = '<span>Delete \u201c' + esc(ev.full || ev.t) + '\u201d?</span>' +
                (ev.rec ? '<button data-go="one">Just this one</button><button data-go="all" class="danger">Every repeat</button>' : '<button data-go="one" class="danger">Delete</button>') +
                '<button data-go="no">Cancel</button>';
            box.setAttribute('data-i', i);
            row.appendChild(box);
            return;
        }
        var g = e.target.closest('[data-go]'); if (!g) return;
        var conf = g.closest('.dl-confirm'), r2 = conf.closest('.dl-row'), ev2 = dayEvents[+conf.getAttribute('data-i')], how = g.getAttribute('data-go');
        if (how === 'no') { conf.remove(); return; }
        conf.innerHTML = '<span>Deleting\u2026</span>';
        api().post({ action: 'deleteEvent', id: ev2.id, cal: ev2.cal, s: ev2.s, all: how === 'all' }).then(function () {
            r2.classList.add('gone'); setTimeout(function () { r2.remove(); }, 250);
            api().toast('Deleted');
            calCache = {}; loadCalendar(true);
            if (window.FDPages && window.FDPages.refreshNow) window.FDPages.refreshNow(true);
        }).catch(function (err) { conf.innerHTML = '<span class="bad">' + esc(err.message) + '</span><button data-go="no">OK</button>'; });
    }

    function openDay(ds) {
        var r = calRange(), data = ((cover(r) || {}).days || {})[ds] || [];
        var dt = parseYmd(ds);
        $('calDayTitle').textContent = dt.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        var bars = data.filter(function (e) { return e.bar; });
        data = data.filter(function (e) { return !e.bar; });
        var bhName = ((cover(r) || {}).bh || {})[ds];
        var top = (bhName ? '<div class="dl-bh">Bank holiday \u00b7 ' + esc(bhName) + '</div>' : '') + bars.map(function (e) { return '<div class="dl-bar" style="--hc:' + esc(e.c) + '"><span>' + esc(e.k) + '</span> ' + esc(e.t) + '</div>'; }).join('');
        dayEvents = data;
        $('calDayList').innerHTML = top + (data.length ? data.map(function (e, i) {
            return '<div class="dl-row" data-i="' + i + '" style="--ec:' + esc(e.c) + '"><span class="dl-time">' + (e.allDay ? 'All day' : esc(e.time || '')) + '</span>' +
                '<span class="dl-main"><span>' + esc(e.t) + '</span>' + (e.note ? '<span class="dl-note">' + esc(e.note) + '</span>' : '') + '</span>' +
                '<span class="dl-cat" style="--ec:' + esc(e.c) + ';--et:' + ink(e.c) + '">' + esc(e.k || '') + '</span>' +
                (e.id ? '<button class="dl-del" data-del="' + i + '" aria-label="Delete">\uD83D\uDDD1</button>' : '') + '</div>';
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
            if (cover(r) && ds >= r.start && ds < r.end) { openDay(ds); return; }
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
                // The Year button only where there's room for it (a computer or a tablet, not the Corsair).
                var yb = document.querySelector('.vw-btn[data-view="year"]');
                var showYear = function () { if (yb) yb.style.display = yearAvailable() ? '' : 'none'; if (calView === 'year' && !yearAvailable()) setView('3m'); };
                showYear(); window.addEventListener('fdbox', showYear);
                // Leaving the calendar page: back to the Corsair shape. Coming back to the year: the whole window again.
                if (window.MutationObserver) new MutationObserver(fullWindow).observe($('screen-calendar'), { attributes: true, attributeFilter: ['class'] });
                window.addEventListener('fdbox', function () { if (visible('screen-calendar')) renderCalendar(); });
                $('calRows').addEventListener('pointerdown', dragStart);
                window.addEventListener('pointermove', dragMove);
                window.addEventListener('pointerup', dragEnd);
                // A drag isn't a tap on a day.
                $('calRows').addEventListener('click', function (e) { if (dragged) { e.stopPropagation(); e.preventDefault(); } }, true);
                // Scrolling by finger: a tiny scroll shouldn't open the day either.
                $('calRows').addEventListener('scroll', function () { if (calView === '3ms') { dragged = true; clearTimeout(dragStart.t); dragStart.t = setTimeout(function () { dragged = false; }, 120); } }, true);
                window.addEventListener('resize', function () { if (calView === '3ms' && visible('screen-calendar')) renderCalendar(); });
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
                $('calDayList').addEventListener('click', onDayListClick);
                renderCalendar();
                setInterval(function () { if (visible('screen-calendar')) loadCalendar(true); }, 15 * 60000);
                // Ready before anyone taps Calendar: fetch this block and the next in the background, and keep them fresh.
                var warm = function () {
                    if (!api().ready() || visible('screen-calendar')) return;
                    var c = cover(calRange());
                    if (!c || Date.now() - c.at > 10 * 60000) fetchBlock(calRange(), true).then(warmNext, function () { /* later */ }); else warmNext();
                };
                setTimeout(warm, 8000); setInterval(warm, 10 * 60000);
            },
            onShow: function () { loadCalendar(); },
            /** Admin setting "Opens on": 3 months, Month or Week. Used until someone picks a view on the screen. */
            setDefault: function (v, align) {
                align = align !== false;
                if (align !== alignDays) { alignDays = align; if (visible('screen-calendar')) renderCalendar(); }
                var view = { '3 months': '3m', '3 months (scroll)': '3ms', 'Month': '1m', 'Week': 'week', 'Year': 'year' }[v] || '3m';
                if (view === 'year' && !yearAvailable()) view = '3m';
                if (defaultView === view) return;
                defaultView = view;
                if (!touched) setView(view, new Date());
            },
            reset: function () { calCache = {}; if (visible('screen-calendar')) loadCalendar(true); },
            /** Background: fetch the months on screen (and the next ones) before anyone opens the calendar. */
            warm: function () {
                if (!calStart) calStart = monthStart(new Date());
                if (!calWeek) calWeek = mondayOf(new Date());
                var r = calRange(), c = cover(r);
                if (!c || Date.now() - c.at > 4 * 60000) fetchBlock(r, true).then(function () { if (visible('screen-calendar')) renderCalendar(); warmNext(); }).catch(function () { /* later */ });
                else warmNext();
            },
        },
    };
})();
