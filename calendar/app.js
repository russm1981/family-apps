/* Family Calendar – phone app. Month, Week and List views of the family calendar, with + to add entries. */
(function () {
    'use strict';
    var FD = window.FD, esc = FD.esc, ink = FD.ink, ymd = FD.ymd, P = FD.parse, add = FD.addDays;
    var $ = function (id) { return document.getElementById(id); };

    var view = 'month';                   // month | week | list | year (year: on a computer or a wide window only)
    function wideEnough() { return window.innerWidth >= 900; }
    try { if (localStorage.getItem('fdcal.view') === 'year' && wideEnough()) view = 'year'; } catch (e) { /* fine */ }
    var anchor = new Date();              // a day inside what's shown
    var selected = ymd(new Date());       // highlighted day in month view
    var cache = {}, loading = '', lastErr = '';
    var legend = [], addable = [];
    try { legend = JSON.parse(localStorage.getItem('fdcal.legend') || '[]'); addable = JSON.parse(localStorage.getItem('fdcal.addable') || '[]'); } catch (e) { /* ignore */ }

    /* ------------------------------------------------------------ data */

    function range() {
        if (view === 'week') { var m = FD.monday(anchor); return { start: ymd(m), end: ymd(add(m, 7)) }; }
        if (view === 'list') { var t = new Date(); return { start: ymd(t), end: ymd(add(t, 56)) }; }
        if (view === 'year') return { start: anchor.getFullYear() + '-01-01', end: (anchor.getFullYear() + 1) + '-01-01' };
        var first = new Date(anchor.getFullYear(), anchor.getMonth(), 1), g = FD.monday(first);
        return { start: ymd(g), end: ymd(add(g, 42)) };
    }
    // Which calendar page to show (?page=…, from the Setup website): its own Google calendars. None: the family's.
    var PAGE = (location.search.match(/[?&]page=([^&]+)/) || [])[1]; PAGE = PAGE ? decodeURIComponent(PAGE) : '';
    function load(force) {
        var r = range(), key = r.start + ':' + r.end;
        render();
        if (cache[key] && !force && Date.now() - cache[key].at < 120000) return;
        loading = key; sync('busy');
        if (PAGE) r.page = PAGE;
        // A year is fetched a quarter at a time (the Google script answers up to about four months at once), then put together.
        var fetch = view !== 'year' ? FD.get('calendar', r) : Promise.all([0, 3, 6, 9].map(function (m) {
            var y = anchor.getFullYear(), q = { start: ymd(new Date(y, m, 1)), end: ymd(new Date(y, m + 3, 1)) }; if (PAGE) q.page = PAGE;
            return FD.get('calendar', q);
        })).then(function (all) {
            var out = { days: {}, bankHolidays: {} };
            all.forEach(function (d) { if (d.locale) out.locale = d.locale; Object.assign(out.days, d.days || {}); Object.assign(out.bankHolidays, d.bankHolidays || {}); if (d.categories) { out.categories = d.categories; out.addable = d.addable; } });
            return out;
        });
        fetch.then(function (d) {
            if (d.locale) FD.setLocale(d.locale);
            cache[key] = { at: Date.now(), days: d.days || {}, bh: d.bankHolidays || {} };
            if (d.categories) { legend = d.categories; addable = d.addable || []; try { localStorage.setItem('fdcal.legend', JSON.stringify(legend)); localStorage.setItem('fdcal.addable', JSON.stringify(addable)); } catch (e) { /* ignore */ } }
            lastErr = ''; sync('ok');
        }).catch(function (e) { lastErr = e.message; sync('err'); FD.toast(e.message, true); })
          .finally(function () { if (loading === key) loading = ''; render(); });
    }
    function current() { var r = range(); return cache[r.start + ':' + r.end] || { days: {}, bh: {} }; }
    function parts(c, ds) {
        var evs = [], bar = null;
        (c.days[ds] || []).forEach(function (e) { if (e.bar) bar = bar || e; else evs.push(e); });
        return { evs: evs, bar: bar, bh: c.bh[ds] || '' };
    }
    function sync(k) { var s = $('sync'); if (s) s.className = 'sync ' + k; }

    /* ------------------------------------------------------------ frame */

    function frame() {
        $('app').innerHTML =
            '<header class="top">' +
              '<div class="top-row"><button class="icon-btn" id="prev">‹</button><h1 id="title"></h1><span class="sync" id="sync"></span>' +
              '<button class="icon-btn" id="next">›</button></div>' +
              '<div class="top-row row2"><div class="seg" id="views"><button data-v="month">Month</button><button data-v="week">Week</button><button data-v="list">List</button><button data-v="year" id="vYear">Year</button></div>' +
              '<button class="btn ghost sm" id="today">Today</button><button class="icon-btn" id="who" aria-label="Which family">⚙</button></div>' +
              '<div class="legend" id="legend"></div>' +
            '</header>' +
            '<main class="main" id="body"></main>' +
            '<button class="fab" id="fab" aria-label="Add">+</button>' +
            '<div class="sheet-bg" id="sheetBg"><div class="sheet" id="sheet"></div></div>';
        $('prev').onclick = function () { step(-1); };
        $('next').onclick = function () { step(1); };
        $('today').onclick = function () { anchor = new Date(); selected = ymd(anchor); load(true); };
        // Which family this app shows, and a way to disconnect it (e.g. it was connected to someone else's dashboard).
        $('who').onclick = function () {
            $('sheet').innerHTML = '<div class="grab"></div><h2>This app</h2><p id="whoTx">Connected to your family’s dashboard.</p>' +
                '<p class="small" style="opacity:.7">Version ' + esc(FD.VERSION) + '</p>' +
                '<button class="btn ghost wide" id="whoOut">Disconnect this app</button><p class="small" style="opacity:.7">Then connect it to the right family: a code from a phone that has Family Admin, or a setup link.</p>';
            $('sheetBg').classList.add('on');
            FD.get('whose').then(function (d) { var ppl = (d.people || []).slice(0, 8).join(', '); $('whoTx').innerHTML = 'Connected to ' + (d.familyName ? 'the <b>' + esc(d.familyName) + ' family</b> dashboard' : 'your <b>family dashboard</b>') + (ppl ? ' (' + esc(ppl) + ')' : '') + '.'; }, function () { /* fine */ });
            $('whoOut').onclick = function () { if (confirm('Disconnect this app from this family’s dashboard?')) { FD.clearConfig(); location.reload(); } };
        };
        $('views').onclick = function (e) { var b = e.target.closest('[data-v]'); if (b) { view = b.getAttribute('data-v'); try { localStorage.setItem('fdcal.view', view); } catch (x) { /* fine */ } load(); } };
        window.addEventListener('resize', function () { var y = $('vYear'); if (y) y.style.display = wideEnough() ? '' : 'none'; if (view === 'year' && !wideEnough()) { view = 'month'; load(); } });
        $('fab').onclick = function () { openAdd(view === 'month' ? selected : ymd(new Date())); };
        $('sheetBg').onclick = function (e) { if (e.target === $('sheetBg')) closeSheet(); };
        $('body').onclick = function (e) {
            var ev = e.target.closest('[data-ev]');
            if (ev && EVS[+ev.getAttribute('data-ev')]) { openEvent(EVS[+ev.getAttribute('data-ev')]); return; }
            var d = e.target.closest('[data-day]'); if (!d) return;
            var ds = d.getAttribute('data-day');
            if (view === 'year') { view = 'month'; anchor = P(ds); selected = ds; load(); return; }
            if (view === 'month') { selected = ds; render(); var dl = $('dayList'); if (dl) dl.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
            else openAdd(ds);
        };
        // Swipe left/right to move.
        var sx = null, sy = null;
        $('body').addEventListener('touchstart', function (e) { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
        $('body').addEventListener('touchend', function (e) {
            if (sx == null || view === 'list') return;
            var dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy; sx = null;
            if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1);
        }, { passive: true });
        document.addEventListener('visibilitychange', function () { if (!document.hidden) load(true); });
    }
    function step(dir) {
        if (view === 'week') anchor = add(anchor, 7 * dir);
        else if (view === 'month') anchor = new Date(anchor.getFullYear(), anchor.getMonth() + dir, 1);
        else if (view === 'year') anchor = new Date(anchor.getFullYear() + dir, 0, 1);
        else return;
        load();
    }

    function render() {
        EVS = [];
        if (!$('body')) return;
        Array.prototype.forEach.call(document.querySelectorAll('#views button'), function (b) { b.classList.toggle('on', b.getAttribute('data-v') === view); });
        $('prev').style.visibility = $('next').style.visibility = view === 'list' ? 'hidden' : '';
        $('legend').innerHTML = legend.map(function (c) {
            return '<span class="lg"><i class="' + (c.bar ? 'bar' : '') + '" style="background:' + esc(c.colour) + '"></i>' + esc(c.name) + '</span>';
        }).join('');
        var c = current(), today = ymd(new Date());
        var yb = $('vYear'); if (yb) yb.style.display = wideEnough() ? '' : 'none';
        if (view === 'month') renderMonth(c, today);
        else if (view === 'year') renderYear(c, today);
        else if (view === 'week') renderWeek(c, today);
        else renderList(c, today);
    }

    var EVS = [];      // the entries on screen, so tapping one can open it
    function evRow(e, big) {
        EVS.push(e);
        return '<div class="ev' + (big ? ' big' : '') + '" data-ev="' + (EVS.length - 1) + '" style="--ec:' + esc(e.c) + ';--et:' + ink(e.c) + '">' +
            '<span class="ev-time">' + (e.time ? esc(e.time) : 'All day') + '</span>' +
            '<span class="ev-main"><b>' + esc(e.t) + '</b>' + (e.note ? '<small>' + esc(e.note) + '</small>' : '') + '</span>' +
            '<span class="ev-grp">' + esc(e.k) + '</span></div>';
    }
    function dayTags(p) {
        return (p.bh ? '<span class="tag bh">' + esc(p.bh) + '</span>' : '') +
            (p.bar ? '<span class="tag hol" style="--hc:' + esc(p.bar.c) + '">' + esc(p.bar.k) + '</span>' : '');
    }

    function renderMonth(c, today) {
        var first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
        $('title').textContent = FD.MONTH[first.getMonth()] + ' ' + first.getFullYear();
        var g = FD.monday(first), dim = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
        var weeks = Math.ceil((FD.col(first) + dim) / 7);
        if (selected.slice(0, 7) !== ymd(first).slice(0, 7)) selected = ymd(today.slice(0, 7) === ymd(first).slice(0, 7) ? P(today) : first);
        var html = '<div class="mgrid"><div class="mhead">' + FD.weekLetters().map(function (d, i) { return '<b class="' + (FD.isWeekend(add(g, i)) ? 'we' : '') + '">' + d + '</b>'; }).join('') + '</div>';
        for (var w = 0; w < weeks; w++) {
            html += '<div class="mrow">';
            for (var k = 0; k < 7; k++) {
                var dt = add(g, w * 7 + k), ds = ymd(dt), p = parts(c, ds);
                var prevBar = parts(c, ymd(add(dt, -1))).bar, nextBar = parts(c, ymd(add(dt, 1))).bar;
                var cls = 'mcell' + (dt.getMonth() !== first.getMonth() ? ' out' : '') + (FD.isWeekend(dt) || p.bh ? ' we' : '') + (ds === today ? ' today' : '') + (ds === selected ? ' sel' : '');
                var evs = p.evs.slice(0, 3).map(function (e) { return '<span class="mev" style="--ec:' + esc(e.c) + ';--et:' + ink(e.c) + '">' + esc(e.t) + '</span>'; }).join('');
                if (p.evs.length > 3) evs += '<span class="mmore">+' + (p.evs.length - 3) + '</span>';
                html += '<button class="' + cls + '" data-day="' + ds + '"><span class="mnum">' + dt.getDate() + '</span>' + evs +
                    (p.bar ? '<span class="hbar' + (prevBar && k > 0 ? '' : ' s') + (nextBar && k < 6 ? '' : ' e') + '" style="--hc:' + esc(p.bar.c) + '"></span>' : '') + '</button>';
            }
            html += '</div>';
        }
        html += '</div>';
        var sp = parts(c, selected);
        html += '<section class="daylist" id="dayList"><h2>' + FD.DAY[P(selected).getDay()] + ' ' + FD.dm(P(selected).getDate(), P(selected).getMonth()) + dayTags(sp) + '</h2>' +
            (sp.evs.length ? sp.evs.map(function (e) { return evRow(e, true); }).join('') : '<div class="empty">Nothing on' + (loading ? '…' : '') + '</div>') +
            '<button class="btn wide" data-add="' + selected + '">+ Add on this day</button></section>';
        $('body').innerHTML = html;
        var ab = document.querySelector('[data-add]'); if (ab) ab.onclick = function (e) { e.stopPropagation(); openAdd(selected); };
    }

    /** Year: a wall planner – a row for each month, a column for each day of the month. Click a day for that month. */
    function renderYear(c, today) {
        var y = anchor.getFullYear();
        $('title').textContent = String(y);
        var html = '<div class="ygrid"><div class="yrow yhead"><span class="ym"></span>';
        for (var n = 1; n <= 31; n++) html += '<b>' + n + '</b>';
        html += '</div>';
        for (var m = 0; m < 12; m++) {
            var dim = new Date(y, m + 1, 0).getDate();
            html += '<div class="yrow"><span class="ym">' + FD.MON[m] + '</span>';
            for (var d = 1; d <= 31; d++) {
                if (d > dim) { html += '<span class="ycell none"></span>'; continue; }
                var dt = new Date(y, m, d), ds = ymd(dt), p = parts(c, ds), wd = dt.getDay();
                var dots = p.evs.slice(0, 4).map(function (e) { return '<i style="background:' + esc(e.c) + ';color:' + ink(e.c) + '">' + esc(e.t) + '</i>'; }).join('') +
                    (p.evs.length > 4 ? '<em>+' + (p.evs.length - 4) + '</em>' : '');
                var tip = FD.DAY[dt.getDay()] + ' ' + FD.dm(d, m) + (p.bh ? ' – ' + p.bh : '') + (p.bar ? ' – ' + p.bar.k : '') + p.evs.map(function (e) { return '\n• ' + e.t; }).join('');
                html += '<button class="ycell' + (wd === 0 || wd === 6 || p.bh ? ' we' : '') + (ds === today ? ' today' : '') + '" data-day="' + ds + '" title="' + esc(tip) + '">' +
                    '<span class="yd">' + ['S', 'M', 'T', 'W', 'T', 'F', 'S'][wd] + '</span><span class="yev">' + dots + '</span>' +
                    (p.bar ? '<span class="ybar" style="background:' + esc(p.bar.c) + '"></span>' : '') + '</button>';
            }
            html += '</div>';
        }
        $('body').innerHTML = html + '</div><p class="ynote">Click a day to open that month.</p>';
    }

    function renderWeek(c, today) {
        var m = FD.monday(anchor), s = add(m, 6);
        $('title').textContent = FD.dm(m.getDate(), m.getMonth()) + ' – ' + FD.dm(s.getDate(), s.getMonth());
        var html = '';
        for (var k = 0; k < 7; k++) {
            var dt = add(m, k), ds = ymd(dt), p = parts(c, ds);
            html += '<section class="wday' + (ds === today ? ' today' : '') + (FD.isWeekend(dt) || p.bh ? ' we' : '') + (p.bar ? ' hol' : '') + '" style="' + (p.bar ? '--hc:' + esc(p.bar.c) : '') + '">' +
                '<div class="wd-head" data-day="' + ds + '"><b>' + FD.DAY[dt.getDay()] + '</b><span>' + FD.dm(dt.getDate(), dt.getMonth()) + '</span>' + dayTags(p) + '<i>+</i></div>' +
                (p.evs.length ? p.evs.map(function (e) { return evRow(e); }).join('') : '<div class="wd-empty">Nothing on</div>') + '</section>';
        }
        $('body').innerHTML = html;
    }

    function renderList(c, today) {
        $('title').textContent = 'Next 8 weeks';
        var html = '', t = P(today), any = false;
        for (var k = 0; k < 56; k++) {
            var dt = add(t, k), ds = ymd(dt), p = parts(c, ds);
            if (!p.evs.length && !p.bh) continue;
            any = true;
            html += '<section class="lday' + (ds === today ? ' today' : '') + '"><div class="ld-head" data-day="' + ds + '"><b>' + (k === 0 ? 'Today' : k === 1 ? 'Tomorrow' : FD.DAY[dt.getDay()]) +
                '</b><span>' + FD.dm(dt.getDate(), dt.getMonth()) + '</span>' + dayTags(p) + '</div>' + p.evs.map(function (e) { return evRow(e); }).join('') + '</section>';
        }
        $('body').innerHTML = any ? html : '<div class="empty">' + (loading ? 'Loading…' : 'Nothing in the next 8 weeks') + '</div>';
    }

    /* ------------------------------------------------------------ add */

    var form = null;
    /** The categories to pick from: general ones, family groups and one person – under headings when the Google script sorts them. */
    function catChips(cats) {
        var one = function (c) { return '<button class="chip' + (form.cat === c.name ? ' on' : '') + '" data-cat="' + esc(c.name) + '" style="--ec:' + esc(c.colour) + ';--et:' + ink(c.colour) + '">' + esc(c.name) + '</button>'; };
        if (!cats.some(function (c) { return c.kind; })) return cats.map(one).join('');
        return [['general', 'General'], ['group', 'Family groups'], ['person', 'One person']].map(function (k) {
            var list = cats.filter(function (c) { return c.kind === k[0]; });
            return list.length ? '<div class="chip-h">' + k[1] + '</div>' + list.map(one).join('') : '';
        }).join('');
    }
    function openAdd(ds) {
        form = { cat: form && form.cat || '', start: ds, end: ds };
        var cats = addable.length ? addable : legend.filter(function (c) { return c.name !== 'Other'; });
        $('sheet').innerHTML = '<div class="grab"></div><h2>New entry</h2>' +
            '<label>Who / what</label><div class="chips" id="fCats">' + catChips(cats) + '</div>' +
            '<label>Title</label><input id="fTitle" maxlength="40" placeholder="e.g. Drums" autocomplete="off">' +
            '<label>Notes or time (optional)</label><input id="fNote" maxlength="300" placeholder="e.g. 12:00 at the music school" autocomplete="off">' +
            '<div class="dates"><div><label>From</label><input type="date" id="fFrom" value="' + ds + '"></div><div><label>To</label><input type="date" id="fTo" value="' + ds + '"></div></div>' +
            '<p class="err" id="fErr"></p>' +
            '<div class="sheet-actions"><button class="btn ghost" id="fCancel">Cancel</button><button class="btn good" id="fSave">Save</button></div>';
        $('fCats').onclick = function (e) {
            var b = e.target.closest('[data-cat]'); if (!b) return;
            form.cat = b.getAttribute('data-cat');
            Array.prototype.forEach.call($('fCats').querySelectorAll('[data-cat]'), function (x) { x.classList.toggle('on', x === b); });
        };
        $('fFrom').onchange = function () { if ($('fTo').value < $('fFrom').value) $('fTo').value = $('fFrom').value; };
        $('fCancel').onclick = closeSheet;
        $('fSave').onclick = save;
        $('sheetBg').classList.add('on');
    }
    /** Tap an entry: see it in full, and delete it (repeating ones: just this one, or every repeat). */
    function openEvent(e) {
        var when = e.s ? new Date(e.s) : null;
        $('sheet').innerHTML = '<div class="grab"></div><h2>' + esc(e.full || e.t) + '</h2>' +
            '<p class="ev-info"><span class="ev-dot" style="--ec:' + esc(e.c) + '"></span>' + esc(e.cat || e.k || '') +
            (when ? ' \u00b7 ' + when.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }) : '') + ' \u00b7 ' + (e.time ? esc(e.time) : 'All day') +
            (e.rec ? ' \u00b7 repeats' : '') + '</p>' +
            (e.note ? '<p class="ev-note">' + esc(e.note) + '</p>' : '') +
            '<div id="evMsg"></div>' +
            (e.id ? '<div class="sheet-actions">' + (e.rec ? '<button class="btn bad" data-delete="one">Delete this one</button><button class="btn bad" data-delete="all">Delete every repeat</button>'
                : '<button class="btn bad" data-delete="one">Delete</button>') + '</div>' : '') +
            '<div class="sheet-actions"><button class="btn ghost" id="evClose">Close</button></div>';
        $('sheetBg').classList.add('on');
        $('evClose').onclick = closeSheet;
        Array.prototype.forEach.call(document.querySelectorAll('[data-delete]'), function (b) {
            b.onclick = function () {
                var all = b.getAttribute('data-delete') === 'all';
                if (b.getAttribute('data-sure') !== '1') {        // second tap confirms
                    b.setAttribute('data-sure', '1'); b.textContent = all ? 'Tap again: delete every repeat' : 'Tap again to delete'; return;
                }
                b.disabled = true; b.textContent = 'Deleting\u2026';
                FD.post({ action: 'deleteEvent', id: e.id, cal: e.cal, s: e.s, all: all }).then(function () {
                    closeSheet(); FD.toast('Deleted'); cache = {}; load(true);
                }).catch(function (err) { b.disabled = false; b.removeAttribute('data-sure'); b.textContent = all ? 'Delete every repeat' : 'Delete'; $('evMsg').innerHTML = '<p class="ev-err">' + esc(err.message) + '</p>'; });
            };
        });
    }
    function closeSheet() { $('sheetBg').classList.remove('on'); }
    function save() {
        var body = { action: 'addEvent', page: PAGE || undefined, category: form.cat, title: $('fTitle').value.trim(), note: $('fNote').value.trim(), start: $('fFrom').value, end: $('fTo').value || $('fFrom').value };
        if (!body.category) { $('fErr').textContent = 'Pick who or what it’s for'; return; }
        if (!body.title) { $('fErr').textContent = 'Give it a title'; return; }
        if (!body.start) { $('fErr').textContent = 'Pick a date'; return; }
        var b = $('fSave'); b.disabled = true; b.textContent = 'Saving…';
        FD.post(body).then(function () {
            closeSheet(); FD.toast('Added “' + body.title + '”');
            cache = {}; selected = body.start; if (view === 'month') anchor = P(body.start); load(true);
        }).catch(function (e) { $('fErr').textContent = e.message; b.disabled = false; b.textContent = 'Save'; });
    }

    /* ------------------------------------------------------------ start */

    function start() { frame(); load(true); }
    FD.registerSW();
    if (FD.configured()) start(); else FD.setupScreen($('app'), 'Family Calendar', start);
})();
