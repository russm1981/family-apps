/* Family Calendar – phone app. Month, Week and List views of the family calendar, with + to add entries. */
(function () {
    'use strict';
    var FD = window.FD, esc = FD.esc, ink = FD.ink, ymd = FD.ymd, P = FD.parse, add = FD.addDays;
    var $ = function (id) { return document.getElementById(id); };

    var view = 'month';                   // month | week | list
    var anchor = new Date();              // a day inside what's shown
    var selected = ymd(new Date());       // highlighted day in month view
    var cache = {}, loading = '', lastErr = '';
    var legend = [], addable = [];
    try { legend = JSON.parse(localStorage.getItem('fdcal.legend') || '[]'); addable = JSON.parse(localStorage.getItem('fdcal.addable') || '[]'); } catch (e) { /* ignore */ }

    /* ------------------------------------------------------------ data */

    function range() {
        if (view === 'week') { var m = FD.monday(anchor); return { start: ymd(m), end: ymd(add(m, 7)) }; }
        if (view === 'list') { var t = new Date(); return { start: ymd(t), end: ymd(add(t, 56)) }; }
        var first = new Date(anchor.getFullYear(), anchor.getMonth(), 1), g = FD.monday(first);
        return { start: ymd(g), end: ymd(add(g, 42)) };
    }
    function load(force) {
        var r = range(), key = r.start + ':' + r.end;
        render();
        if (cache[key] && !force && Date.now() - cache[key].at < 120000) return;
        loading = key; sync('busy');
        FD.get('calendar', r).then(function (d) {
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
              '<div class="top-row row2"><div class="seg" id="views"><button data-v="month">Month</button><button data-v="week">Week</button><button data-v="list">List</button></div>' +
              '<button class="btn ghost sm" id="today">Today</button></div>' +
              '<div class="legend" id="legend"></div>' +
            '</header>' +
            '<main class="main" id="body"></main>' +
            '<button class="fab" id="fab" aria-label="Add">+</button>' +
            '<div class="sheet-bg" id="sheetBg"><div class="sheet" id="sheet"></div></div>';
        $('prev').onclick = function () { step(-1); };
        $('next').onclick = function () { step(1); };
        $('today').onclick = function () { anchor = new Date(); selected = ymd(anchor); load(true); };
        $('views').onclick = function (e) { var b = e.target.closest('[data-v]'); if (b) { view = b.getAttribute('data-v'); load(); } };
        $('fab').onclick = function () { openAdd(view === 'month' ? selected : ymd(new Date())); };
        $('sheetBg').onclick = function (e) { if (e.target === $('sheetBg')) closeSheet(); };
        $('body').onclick = function (e) {
            var d = e.target.closest('[data-day]'); if (!d) return;
            var ds = d.getAttribute('data-day');
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
        else return;
        load();
    }

    function render() {
        if (!$('body')) return;
        Array.prototype.forEach.call(document.querySelectorAll('#views button'), function (b) { b.classList.toggle('on', b.getAttribute('data-v') === view); });
        $('prev').style.visibility = $('next').style.visibility = view === 'list' ? 'hidden' : '';
        $('legend').innerHTML = legend.map(function (c) {
            return '<span class="lg"><i class="' + (c.bar ? 'bar' : '') + '" style="background:' + esc(c.colour) + '"></i>' + esc(c.name) + '</span>';
        }).join('');
        var c = current(), today = ymd(new Date());
        if (view === 'month') renderMonth(c, today);
        else if (view === 'week') renderWeek(c, today);
        else renderList(c, today);
    }

    function evRow(e, big) {
        return '<div class="ev' + (big ? ' big' : '') + '" style="--ec:' + esc(e.c) + ';--et:' + ink(e.c) + '">' +
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
        var weeks = Math.ceil((((first.getDay() + 6) % 7) + dim) / 7);
        if (selected.slice(0, 7) !== ymd(first).slice(0, 7)) selected = ymd(today.slice(0, 7) === ymd(first).slice(0, 7) ? P(today) : first);
        var html = '<div class="mgrid"><div class="mhead">' + ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map(function (d, i) { return '<b class="' + (i > 4 ? 'we' : '') + '">' + d + '</b>'; }).join('') + '</div>';
        for (var w = 0; w < weeks; w++) {
            html += '<div class="mrow">';
            for (var k = 0; k < 7; k++) {
                var dt = add(g, w * 7 + k), ds = ymd(dt), p = parts(c, ds);
                var prevBar = parts(c, ymd(add(dt, -1))).bar, nextBar = parts(c, ymd(add(dt, 1))).bar;
                var cls = 'mcell' + (dt.getMonth() !== first.getMonth() ? ' out' : '') + (k > 4 || p.bh ? ' we' : '') + (ds === today ? ' today' : '') + (ds === selected ? ' sel' : '');
                var evs = p.evs.slice(0, 3).map(function (e) { return '<span class="mev" style="--ec:' + esc(e.c) + ';--et:' + ink(e.c) + '">' + esc(e.t) + '</span>'; }).join('');
                if (p.evs.length > 3) evs += '<span class="mmore">+' + (p.evs.length - 3) + '</span>';
                html += '<button class="' + cls + '" data-day="' + ds + '"><span class="mnum">' + dt.getDate() + '</span>' + evs +
                    (p.bar ? '<span class="hbar' + (prevBar && k > 0 ? '' : ' s') + (nextBar && k < 6 ? '' : ' e') + '" style="--hc:' + esc(p.bar.c) + '"></span>' : '') + '</button>';
            }
            html += '</div>';
        }
        html += '</div>';
        var sp = parts(c, selected);
        html += '<section class="daylist" id="dayList"><h2>' + FD.DAY[P(selected).getDay()] + ' ' + P(selected).getDate() + ' ' + FD.MON[P(selected).getMonth()] + dayTags(sp) + '</h2>' +
            (sp.evs.length ? sp.evs.map(function (e) { return evRow(e, true); }).join('') : '<div class="empty">Nothing on' + (loading ? '…' : '') + '</div>') +
            '<button class="btn ghost wide" data-add="' + selected + '">+ Add on this day</button></section>';
        $('body').innerHTML = html;
        var ab = document.querySelector('[data-add]'); if (ab) ab.onclick = function (e) { e.stopPropagation(); openAdd(selected); };
    }

    function renderWeek(c, today) {
        var m = FD.monday(anchor), s = add(m, 6);
        $('title').textContent = m.getDate() + (m.getMonth() !== s.getMonth() ? ' ' + FD.MON[m.getMonth()] : '') + ' – ' + s.getDate() + ' ' + FD.MON[s.getMonth()];
        var html = '';
        for (var k = 0; k < 7; k++) {
            var dt = add(m, k), ds = ymd(dt), p = parts(c, ds);
            html += '<section class="wday' + (ds === today ? ' today' : '') + (k > 4 || p.bh ? ' we' : '') + (p.bar ? ' hol' : '') + '" style="' + (p.bar ? '--hc:' + esc(p.bar.c) : '') + '">' +
                '<div class="wd-head" data-day="' + ds + '"><b>' + FD.DAY[dt.getDay()] + '</b><span>' + dt.getDate() + ' ' + FD.MON[dt.getMonth()] + '</span>' + dayTags(p) + '<i>+</i></div>' +
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
                '</b><span>' + dt.getDate() + ' ' + FD.MON[dt.getMonth()] + '</span>' + dayTags(p) + '</div>' + p.evs.map(function (e) { return evRow(e); }).join('') + '</section>';
        }
        $('body').innerHTML = any ? html : '<div class="empty">' + (loading ? 'Loading…' : 'Nothing in the next 8 weeks') + '</div>';
    }

    /* ------------------------------------------------------------ add */

    var form = null;
    function openAdd(ds) {
        form = { cat: form && form.cat || '', start: ds, end: ds };
        var cats = addable.length ? addable : legend.filter(function (c) { return c.name !== 'Other'; });
        $('sheet').innerHTML = '<div class="grab"></div><h2>New entry</h2>' +
            '<label>Who / what</label><div class="chips" id="fCats">' + cats.map(function (c) {
                return '<button class="chip' + (form.cat === c.name ? ' on' : '') + '" data-cat="' + esc(c.name) + '" style="--ec:' + esc(c.colour) + ';--et:' + ink(c.colour) + '">' + esc(c.name) + '</button>';
            }).join('') + '</div>' +
            '<label>Title</label><input id="fTitle" maxlength="40" placeholder="e.g. Drums" autocomplete="off">' +
            '<label>Notes or time (optional)</label><input id="fNote" maxlength="300" placeholder="e.g. 12:00 at the music school" autocomplete="off">' +
            '<div class="dates"><div><label>From</label><input type="date" id="fFrom" value="' + ds + '"></div><div><label>To</label><input type="date" id="fTo" value="' + ds + '"></div></div>' +
            '<p class="err" id="fErr"></p>' +
            '<div class="sheet-actions"><button class="btn ghost" id="fCancel">Cancel</button><button class="btn good" id="fSave">Save</button></div>';
        $('fCats').onclick = function (e) {
            var b = e.target.closest('[data-cat]'); if (!b) return;
            form.cat = b.getAttribute('data-cat');
            Array.prototype.forEach.call($('fCats').children, function (x) { x.classList.toggle('on', x === b); });
        };
        $('fFrom').onchange = function () { if ($('fTo').value < $('fFrom').value) $('fTo').value = $('fFrom').value; };
        $('fCancel').onclick = closeSheet;
        $('fSave').onclick = save;
        $('sheetBg').classList.add('on');
    }
    function closeSheet() { $('sheetBg').classList.remove('on'); }
    function save() {
        var body = { action: 'addEvent', category: form.cat, title: $('fTitle').value.trim(), note: $('fNote').value.trim(), start: $('fFrom').value, end: $('fTo').value || $('fFrom').value };
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
