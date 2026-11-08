/* Family Dashboard – pages.
 * The side bar and the pages come from the "Pages" and "Widgets" tabs of the Google Sheet, so pages and widgets
 * can be added, moved and changed from the admin apps without touching this code.
 * Page types: "widgets" (a grid of quarter-width widgets), "boys" and "calendar" (the two built-in pages).
 */
(function () {
    'use strict';

    var LAYOUT_KEY = 'familyDashboard.layout.v2';
    var DATA_KEY = 'familyDashboard.pagedata.v2.';
    var SCREEN_KEY = 'familyDashboard.screen.v2';
    var POLL_MS = 60 * 1000;
    var COLS = 4;

    var layout = null, current = null, instances = {}, fetched = {}, errors = {}, timer = null;
    var $ = function (id) { return document.getElementById(id); };
    function api() { return window.FDApi; }
    function esc(s) { return api().esc(s); }
    function store(k, v) { api().store(k, v); }
    function load(k) { return api().load(k); }

    /* -------------------------------------------------------------- build */

    function build() {
        Object.keys(instances).forEach(function (k) { try { if (instances[k].destroy) instances[k].destroy(); } catch (e) { /* ignore */ } });
        instances = {};
        Array.prototype.forEach.call(document.querySelectorAll('.screen.wpage'), function (s) { s.remove(); });
        var pages = navPages();
        // Side bar
        $('railPages').innerHTML = pages.map(function (p) {
            return '<button class="nav-btn" data-page="' + esc(p.id) + '" data-type="' + esc(p.type) + '"><span class="ico">' + esc(p.icon) + '</span><span class="nt">' + esc(p.title) + '</span></button>';
        }).join('');
        $('rail').style.setProperty('--n', Math.max(pages.length, 3));
        // Widget pages
        var ctx = { tomtomKey: layout ? layout.tomtomKey : '' };
        pages.filter(function (p) { return p.type === 'widgets'; }).forEach(function (p) {
            var sec = document.createElement('section');
            sec.className = 'screen wpage';
            sec.id = 'screen-' + p.id;
            sec.setAttribute('data-page', p.id);
            var ws = layout.widgets.filter(function (w) { return w.page === p.id && w.show; });
            var cols = window.FDW.pack(ws);
            var html = cols.slice(0, COLS).map(function (col, ci) {
                return '<div class="wcol" data-c="' + ci + '">' + col.map(function (w) {
                    return '<div class="panel wg wg-' + esc(w.type) + ' ' + esc(w.size) + '" data-wid="' + esc(w.id) + '"></div>';
                }).join('') + '</div>';
            }).join('');
            if (!ws.length) html = '<div class="msg on-empty">No widgets on this page yet.<br>Add some in the Family Admin app (Widgets tab).</div>';
            sec.innerHTML = html + (cols.length > COLS ? '<div class="overflow">' + (cols.length - COLS) + ' column' + (cols.length - COLS > 1 ? 's' : '') +
                ' of widgets don’t fit – move or remove some in the admin app</div>' : '') + '<div class="msg overlay"></div>';
            $('screens').appendChild(sec);
            cols.slice(0, COLS).forEach(function (col) {
                col.forEach(function (w) {
                    var el = sec.querySelector('[data-wid="' + w.id + '"]');
                    var make = window.FDW.types[w.type];
                    try { instances[w.id] = make ? make(el, w, ctx) : { update: function () {} }; }
                    catch (e) { el.innerHTML = '<div class="err">' + esc(w.type) + ': ' + esc(e.message) + '</div>'; instances[w.id] = { update: function () {} }; }
                });
            });
            if (window.FDFormat) FDFormat.pager(sec);
            // Show the last data we had straight away, then refresh.
            try { var cached = JSON.parse(load(DATA_KEY + p.id) || 'null'); if (cached) feed(cached); } catch (e) { /* ignore */ }
        });
        // Calendar opens on the view chosen in the admin app.
        var cal = pages.filter(function (p) { return p.type === 'calendar'; })[0];
        if (cal && window.FDScreens && window.FDScreens.calendar && window.FDScreens.calendar.setDefault) window.FDScreens.calendar.setDefault(cal.settings && cal.settings.DefaultView, !(cal.settings && cal.settings.AlignWeekdays === false));
    }

    function feed(data) {
        Object.keys(data || {}).forEach(function (id) {
            var w = instances[id];
            if (w && w.update) { try { w.update(data[id]); } catch (e) { console.error(id, e); } }
        });
    }

    function applyLayout(L) {
        if (!L) return false;
        if (layout && layout.version === L.version) return false;
        layout = L;
        store(LAYOUT_KEY, JSON.stringify(L));
        build();
        show(pageExists(current) ? current : firstPage(), true);
        return true;
    }
    /** Pages as shown in the side bar: a children's page with 4–6 children becomes two buttons ("Boys 1", "Boys 2"). */
    function navPages() {
        var out = [];
        (layout ? layout.pages : []).filter(function (p) { return p.show; }).forEach(function (p) {
            if (p.type === 'boys' && (p.children || 0) > 3) {
                out.push(Object.assign({}, p, { part: 0, title: p.title + ' 1' }));
                out.push(Object.assign({}, p, { id: p.id + '~2', part: 1, title: p.title + ' 2' }));
            } else out.push(p);
        });
        return out;
    }
    function pageExists(id) { return navPages().some(function (p) { return p.id === id; }); }
    function firstPage() { var p = navPages()[0]; return p ? p.id : 'home'; }
    function page(id) { return navPages().filter(function (p) { return p.id === id; })[0]; }

    /* --------------------------------------------------------------- show */

    function show(id, quiet) {
        var p = page(id);
        if (!p) return;
        current = id;
        store(SCREEN_KEY, id);
        Array.prototype.forEach.call(document.querySelectorAll('.nav-btn'), function (b) { b.classList.toggle('on', b.getAttribute('data-page') === id); });
        var target = p.type === 'widgets' ? 'screen-' + id : 'screen-' + p.type;
        Array.prototype.forEach.call(document.querySelectorAll('.screen'), function (s) { s.classList.toggle('on', s.id === target); });
        if (p.type === 'widgets') {
            renderMsg(id);
            layout.widgets.forEach(function (w) { if (w.page === id && instances[w.id] && instances[w.id].show) instances[w.id].show(); });
            // Everything is already built and filled in the background, so switching is instant; only fetch if it's getting old.
            if (!fetched[id] || Date.now() - fetched[id] > POLL_MS) refresh(id);
        } else if (p.type === 'boys') {
            if (window.FDBoys) window.FDBoys.onShow(p.part || 0);
        } else if (p.type === 'calendar') {
            if (window.FDScreens && window.FDScreens.calendar) window.FDScreens.calendar.onShow();
        }
    }

    function renderMsg(id) {
        var sec = $('screen-' + id); if (!sec) return;
        var msg = sec.querySelector('.msg.overlay');
        if (!api().ready() && window.FDPair && FDPair.show()) {
            msg.style.display = 'none';
        } else if (!api().ready()) {
            msg.innerHTML = '<div class="connect"><b>Connect this screen to your Family Dashboard</b>' +
                '<p>On your computer, open the setup app \u2192 <b>Connect devices</b> \u2192 <b>Copy the screen link</b>, then paste it here (Ctrl+V).</p>' +
                '<div class="connect-row"><input id="connectIn" placeholder="Paste your screen link" autocomplete="off" spellcheck="false"><button id="connectGo">Connect</button></div>' +
                '<p class="foot">Or download your personal start file in the setup app \u2013 it connects by itself.</p></div>';
            msg.style.display = 'flex';
            var go = function () { if (!api().connect(document.getElementById('connectIn').value)) api().toast('That isn\u2019t a Family Dashboard link', true); };
            document.getElementById('connectGo').onclick = go;
            document.getElementById('connectIn').onkeydown = function (e) { if (e.key === 'Enter') go(); };
        } else if (!fetched[id] && errors[id] && !load(DATA_KEY + id)) {
            msg.innerHTML = '<b>Can’t reach the Google Sheet.</b><br>' + esc(errors[id]);
            msg.style.display = 'flex';
        } else msg.style.display = 'none';
    }

    /* ----------------------------------------------------------- refresh */

    function refresh(id, force, background) {
        if (!api().ready()) return Promise.resolve();
        if (!background) api().sync('busy');
        return api().get('page', Object.assign({ page: id || current || '', v: (window.FDNotices && FDNotices.version) || '' }, window.FDFormat ? FDFormat.params() : {}, force ? { refresh: '1' } : {})).then(function (d) {
            errors[d.page] = '';
            applyLayout(d.layout);
            if (window.FDNotices) window.FDNotices.check(d.layout);
            fetched[d.page] = Date.now();
            store(DATA_KEY + d.page, JSON.stringify(d.data));
            if (window.FDHealth) window.FDHealth.data(d.data);
            feed(d.data);
            if (!background) api().sync('ok');
            lastOk = Date.now(); stale('');
            renderMsg(d.page);
        }).catch(function (e) {
            errors[id] = e.message;
            if (!background) api().sync('err', e.message);
            if (!background && Date.now() - lastOk > 15 * 60000) stale(e.message);
            renderMsg(id);
        });
    }
    /** Nothing new from the Google Sheet for 15 minutes: say so on the screen (the red dot alone is easy to miss). */
    var lastOk = Date.now();
    function stale(msg) {
        var b = document.getElementById('staleNote');
        if (!msg) { if (b) b.style.display = 'none'; return; }
        if (!b) {
            b = document.createElement('div'); b.id = 'staleNote'; b.className = 'notice stale'; document.body.appendChild(b);
            b.addEventListener('click', function () { refresh(current, true); });
        }
        var t = new Date(lastOk), hm = ('0' + t.getHours()).slice(-2) + ':' + ('0' + t.getMinutes()).slice(-2);
        b.innerHTML = '<span>⚠ <b>Not updated since ' + (Date.now() - lastOk > 20 * 3600e3 ? t.toLocaleDateString('en-GB', { weekday: 'short' }) + ' ' : '') + hm + '.</b> ' + esc(msg) + ' <u>Tap to try again</u></span>';
        b.style.display = 'flex';
    }
    /** Fill every other page in the background, one at a time, so they're ready before anyone taps them. */
    var warming = false;
    function warmAll() {
        if (warming || !api().ready() || !layout) return;
        warming = true;
        var ids = navPages().filter(function (p) { return p.type === 'widgets' && p.id !== current && (!fetched[p.id] || Date.now() - fetched[p.id] > 4 * 60000); })
            .map(function (p) { return p.id; });
        (function next() {
            var id = ids.shift();
            if (!id) { warming = false; return; }
            refresh(id, false, true).then(function () { setTimeout(next, 1500); });
        })();
        // The calendar and the children's page too.
        if (window.FDScreens && window.FDScreens.calendar && window.FDScreens.calendar.warm) window.FDScreens.calendar.warm();
    }

    function onRail(e) {
        var b = e.target.closest('.nav-btn[data-page]'); if (!b) return;
        var id = b.getAttribute('data-page');
        if (id === current && page(id) && page(id).type === 'widgets') refresh(id);   // tap again = refresh now
        else show(id);
    }

    window.FDPages = {
        start: function () {
            try { layout = JSON.parse(load(LAYOUT_KEY) || 'null'); } catch (e) { layout = null; }
            if (!layout) layout = { pages: [{ id: 'home', title: 'Home', type: 'widgets', icon: '⌂', show: true }], widgets: [], version: '' };
            build();
            $('rail').addEventListener('click', onRail);
            var saved = load(SCREEN_KEY);
            current = pageExists(saved) ? saved : firstPage();
            show(current, true);
            // First call also brings the latest pages and widgets from the Sheet; then the other pages fill in behind.
            refresh(current);
            setTimeout(warmAll, 6000);
            setInterval(warmAll, 5 * 60000);
            clearInterval(timer);
            timer = setInterval(function () {
                var p = page(current);
                if (p && p.type === 'widgets') refresh(current);
                else if (api().ready()) api().get('layout', window.FDFormat ? FDFormat.params() : {}).then(function (L) { applyLayout(L); if (window.FDNotices) window.FDNotices.check(L); }).catch(function () { /* next time */ });
            }, POLL_MS);
        },
        show: show,
        /** A page's other half came into view (tablet layout): let its maps etc. redraw. */
        shown: function (id) { (layout ? layout.widgets : []).forEach(function (w) { if (w.page === id && instances[w.id] && instances[w.id].show) instances[w.id].show(); }); },
        reset: function () { fetched = {}; layout = null; refresh(current, true); },
        current: function () { return page(current); },
        pages: function () { return navPages(); },
        layout: function () { return layout; },
        refreshNow: function (force) { var p = page(current); if (p && p.type === 'widgets') refresh(current, force); },
        goType: function (type) { var p = layout && layout.pages.filter(function (x) { return x.type === type && x.show; })[0]; if (p) show(p.id); return !!p; },
    };
})();
