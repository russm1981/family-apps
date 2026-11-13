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
    function frame(cols, n, label, cls) {
        var shown = cols.slice(0, n), body = shown.map(column).join('');
        for (var i = shown.length; i < n; i++) body += '<div class="ed-col empty"><div class="ed-slot end">' + (i === shown.length ? 'Drop a widget here' : '') + '</div></div>';
        return '<div class="ed-frame ' + cls + '">' + (label ? '<div class="ed-flabel">' + esc(label) + '</div>' : '') + '<div class="ed-grid" style="grid-template-columns:repeat(' + n + ',minmax(0,1fr))">' + body + '</div></div>';
    }
    /** A drawing of a calendar or points screen (no real names or entries), the same size as a widget screen. */
    function mockFrame(p, fmt, n) {
        var inner;
        if (p.type === 'calendar') {
            var cols = fmt === 'standard' ? 7 : 14, rows = 3, cells = '';
            for (var r = 0; r < rows; r++) for (var c = 0; c < cols; c++) {
                var k = (r * 7 + c * 3) % 9;
                cells += '<div class="mk-day">' + (k < 3 ? '<i style="background:' + ['#3fa9f5', '#a855f7', '#d97757'][k] + '"></i>' : '') + (k === 1 ? '<i style="background:#22c55e;width:60%"></i>' : '') + '</div>';
            }
            inner = '<div class="mk-cal"><div class="mk-top"><b>📅 The family calendar</b><span>3 months · Month · Week' + (fmt === 'wide' ? '' : ' · Year') + '</span></div>' +
                '<div class="mk-grid" style="grid-template-columns:repeat(' + cols + ',1fr)">' + cells + '</div></div>';
        } else {
            var cards = '';
            for (var i = 0; i < n; i++) cards += '<div class="mk-kid"><b>Child ' + (i + 1) + '</b><span class="mk-pts">123</span><small>points</small><i></i><i></i><i></i></div>';
            for (var j = n; j < 3; j++) cards += '<div class="mk-kid empty"></div>';
            inner = '<div class="mk-kids">' + cards + '</div>';
        }
        return '<div class="ed-frame ' + (fmt === 'standard' ? 'tab' : 'wide') + ' mock">' + inner + '</div>';
    }
    function otherView(p) {
        var fmt = load(KEY_F, 'wide'), out = '';
        if (p.type === 'calendar') {
            out = fmt === 'computer' ? '<div class="ed-monitor">' + mockFrame(p, 'wide') + '</div>' : mockFrame(p, fmt);
            return out + '<p class="mute small">The calendar fills the screen; on a tablet or computer it also has a whole-year wall planner. You can have more than one calendar page, each showing different Google calendars.</p>' +
                (H.pageForm ? '<section class="ed-pset" data-pset="' + esc(p.id) + '"><h3>This calendar page’s settings</h3>' + H.pageForm(p.id) +
                    '<p class="mute small">The categories and colours (who’s who on the calendar) are the whole family’s – change them in <a href="' + esc(H.familyLink()) + '">Reconfigure → Family &amp; calendar</a>.</p>' +
                    '<button class="btn good" data-psave="' + esc(p.id) + '">Save</button></section>' : '');
        }
        var kids = Math.max(1, p.children || 1), screens = Math.ceil(kids / 3), frames = '';
        for (var k = 0; k < screens; k++) {
            var nHere = Math.min(3, kids - k * 3), f = mockFrame(p, fmt === 'computer' ? 'wide' : fmt, nHere);
            frames += '<div class="ed-mockwrap">' + (screens > 1 ? '<div class="ed-flabel">' + esc(p.title) + ' ' + (k + 1) + '</div>' : '') + (fmt === 'computer' ? '<div class="ed-monitor">' + f + '</div>' : f) + '</div>';
        }
        return '<div class="ed-tabs' + (fmt === 'standard' ? '' : ' one') + '">' + frames + '</div>' +
            '<p class="mute small">One card for each child on the points page, up to 3 a screen. With more children, extra screens are added by themselves (' + esc(p.title) + ' 1, ' + esc(p.title) + ' 2…). ' +
            'Who’s on the points page is set in <b>Reconfigure → Family &amp; calendar</b>.</p>';
    }
    function screenView(p) {
        var fmt = load(KEY_F, 'wide'), cols = pack(onPage(p.id));
        if (p.type !== 'widgets') return otherView(p);
        var out = '', over = cols.length - 4;
        if (fmt === 'standard') {
            var n = Math.max(1, Math.ceil(Math.min(cols.length, 4) / 2));
            for (var k = 0; k < n; k++) out += frame(cols.slice(k * 2, k * 2 + 2), 2, n > 1 ? p.title + ' ' + (k + 1) : p.title, 'tab');
            out = '<div class="ed-tabs">' + out + '</div>';
        } else if (fmt === 'computer') {
            out = '<div class="ed-monitor">' + frame(cols, 4, '', 'wide') + '</div>';
        } else out = frame(cols, 4, '', 'wide');
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
        var p = current(), ps = pages(), fmt = load(KEY_F, 'wide');
        if (!p) { el.innerHTML = '<div class="empty">No screens yet.</div>'; return; }
        el.innerHTML = '<div class="ed">' +
            '<div class="ed-top"><span class="mute">Show it as on a</span>' + FORMATS.map(function (f) {
                return '<button class="ed-fmt' + (f[0] === fmt ? ' on' : '') + '" data-fmt="' + f[0] + '"><b>' + esc(f[1]) + '</b><small>' + esc(f[2]) + '</small></button>';
            }).join('') + '</div>' +
            '<div class="ed-main">' +
            '<aside class="ed-pages"><h3>Screens</h3>' + ps.map(function (x, i) {
                return '<div class="ed-page' + (x.id === p.id ? ' on' : '') + (x.show ? '' : ' off') + '" data-page="' + esc(x.id) + '"><span class="pi">' + esc(x.icon) + '</span>' +
                    '<span class="pt"><b>' + esc(x.title) + '</b><small>' + esc(x.type === 'widgets' ? onPage(x.id).length + ' widgets' : H.pageTypeOf(x.type).name) + (x.show ? '' : ' · hidden') + '</small></span>' +
                    '<span class="pm"><button data-pm="' + esc(x.id) + ':-1"' + (i ? '' : ' disabled') + '>▲</button><button data-pm="' + esc(x.id) + ':1"' + (i < ps.length - 1 ? '' : ' disabled') + '>▼</button></span></div>';
            }).join('') +
            '<div class="ed-add"><h4>Add a screen</h4><input id="edName" maxlength="10" placeholder="Name, e.g. Kitchen"><select id="edType"><option value="widgets">Widgets</option><option value="calendar">Calendar</option></select>' +
            '<button class="btn sm" id="edAdd">Add</button></div></aside>' +
            '<section class="ed-canvas"><div class="ed-head"><h2>' + esc(p.icon) + ' ' + esc(p.title) + '</h2><span class="mute small">' + esc(H.pageTypeOf(p.type).name) + (p.show ? '' : ' · hidden') + '</span>' +
            '<button class="btn ghost sm" data-pedit="' + esc(p.id) + '">Name, icon, show/hide…</button></div>' + screenView(p) +
            (p.type === 'widgets' ? '<div class="ed-trash" title="Drag a widget here to remove it">🗑 Drag a widget here to remove it</div>' +
                '<p class="mute small">Drag widgets to move them, or onto another screen on the left. Click one for its height and When to show (a widget at some times, another at others). The 🗑 on each widget removes it – its settings are kept.</p>' : '') + '</section>' +
            (p.type === 'widgets' ? '<aside class="ed-palette"><h3>Add a widget</h3><p class="mute small">Drag one onto the screen.</p>' + (D().types || []).map(function (T) {
                return '<div class="ed-type" draggable="true" data-type="' + esc(T.type) + '" title="' + esc(T.about) + '"><span>' + esc(T.icon) + '</span><b>' + esc(T.name) + '</b><small>' + esc(T.sizes.join(' / ')) + '</small></div>';
            }).join('') + '</aside>' : '<aside class="ed-palette ed-blank"></aside>') + '</div></div>';
        wire(p);
        if (H.afterForm) H.afterForm();
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
        el.querySelector('.ed').onclick = function (e) {
            var t;
            if ((t = e.target.closest('[data-fmt]'))) { store(KEY_F, t.getAttribute('data-fmt')); render(); return; }
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
