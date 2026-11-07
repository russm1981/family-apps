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
        var pages = (layout ? layout.pages : []).filter(function (p) { return p.show; });
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
            var html = cols.slice(0, COLS).map(function (col) {
                return '<div class="wcol">' + col.map(function (w) {
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
            // Show the last data we had straight away, then refresh.
            try { var cached = JSON.parse(load(DATA_KEY + p.id) || 'null'); if (cached) feed(cached); } catch (e) { /* ignore */ }
        });
        // Calendar opens on the view chosen in the admin app.
        var cal = pages.filter(function (p) { return p.type === 'calendar'; })[0];
        if (cal && window.FDScreens && window.FDScreens.calendar && window.FDScreens.calendar.setDefault) window.FDScreens.calendar.setDefault(cal.settings && cal.settings.DefaultView);
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
    function pageExists(id) { return !!(layout && layout.pages.some(function (p) { return p.id === id && p.show; })); }
    function firstPage() { var p = layout && layout.pages.filter(function (x) { return x.show; })[0]; return p ? p.id : 'home'; }
    function page(id) { return layout && layout.pages.filter(function (p) { return p.id === id; })[0]; }

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
            if (!quiet || !fetched[id] || Date.now() - fetched[id] > POLL_MS) refresh(id);
        } else if (p.type === 'boys') {
            if (window.FDBoys) window.FDBoys.onShow();
        } else if (p.type === 'calendar') {
            if (window.FDScreens && window.FDScreens.calendar) window.FDScreens.calendar.onShow();
        }
    }

    function renderMsg(id) {
        var sec = $('screen-' + id); if (!sec) return;
        var msg = sec.querySelector('.msg.overlay');
        if (!api().ready()) {
            msg.innerHTML = '<b>Not connected yet.</b><br>Start the dashboard with the shortcut that has your web app address and access code.';
            msg.style.display = 'flex';
        } else if (!fetched[id] && errors[id] && !load(DATA_KEY + id)) {
            msg.innerHTML = '<b>Can’t reach the Google Sheet.</b><br>' + esc(errors[id]);
            msg.style.display = 'flex';
        } else msg.style.display = 'none';
    }

    /* ----------------------------------------------------------- refresh */

    function refresh(id, force) {
        if (!api().ready()) return;
        api().sync('busy');
        api().get('page', Object.assign({ page: id || current || '' }, force ? { refresh: '1' } : {})).then(function (d) {
            errors[d.page] = '';
            applyLayout(d.layout);
            fetched[d.page] = Date.now();
            store(DATA_KEY + d.page, JSON.stringify(d.data));
            feed(d.data);
            api().sync('ok');
            renderMsg(d.page);
        }).catch(function (e) {
            errors[id] = e.message; api().sync('err', e.message);
            renderMsg(id);
        });
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
            // First call also brings the latest pages and widgets from the Sheet.
            refresh(current);
            clearInterval(timer);
            timer = setInterval(function () {
                var p = page(current);
                if (p && p.type === 'widgets') refresh(current);
                else if (api().ready()) api().get('layout', {}).then(applyLayout).catch(function () { /* next time */ });
            }, POLL_MS);
        },
        show: show,
        reset: function () { fetched = {}; layout = null; refresh(current, true); },
        current: function () { return page(current); },
        goType: function (type) { var p = layout && layout.pages.filter(function (x) { return x.type === type && x.show; })[0]; if (p) show(p.id); return !!p; },
    };
})();
