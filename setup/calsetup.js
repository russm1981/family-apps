/*
 * The calendar set-up on the Setup website (Screens & widgets → a calendar page):
 *   1. Categories – shared by every calendar page: the family groups (Family is everyone; drag people into the others)
 *      and the general categories (Holiday, School holiday…). Behind the scenes each has one of Google Calendar's event
 *      colours (worked out by the Google script), so an event made in Google Calendar or Gmail lands in the right one.
 *   2. This page's key – what has a place on the key (the last place is always Other), up to two shown as lines, and
 *      what's hidden on this page. Every person needs a home: their own place, their group's, or Family's.
 *   3. Tidying up the Google calendar – a table of events that aren't in a category, are in the old "Ben – " form, or
 *      have a title that's too long, with a fix for each.
 */
(function () {
    'use strict';
    var H, box, pageId, CS, cats, key, dragN = null;
    var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
    var clone = function (o) { return JSON.parse(JSON.stringify(o)); };
    var SUGGEST = ['Holiday', 'School holiday', 'Birthday', 'Work', 'Clubs', 'Appointments'];

    var PALETTE = ['#22d3ee', '#3fa9f5', '#6366f1', '#a855f7', '#f472b6', '#ef4444', '#f97316', '#f59e0b', '#facc15', '#84cc16', '#22c55e', '#14b8a6', '#c08457', '#94a3b8', '#ffffff'];
    function all() { return cats.groups.concat(cats.generals); }
    /** A colour swatch: click for the colours to choose from, or any colour you like. */
    function swatch(ref, colour) { return '<button type="button" class="cs-sw" data-sw="' + ref + '" style="background:' + esc(colour) + '" title="Change the colour"></button>'; }
    function chip(n, extra) {
        var p = CS.people.filter(function (x) { return x.name === n; })[0], c = p || all().filter(function (x) { return x.name === n; })[0];
        var kind = p ? 'person' : cats.groups.some(function (x) { return x.name === n; }) ? 'group' : 'general';
        return '<span class="cs-chip k-' + kind + '" draggable="true" data-n="' + esc(n) + '"><i style="background:' + esc(c ? c.colour : '#888') + '"></i>' + esc(n) + (extra || '') + '</span>';
    }

    /* ------------------------------------------------------------ 1. categories */

    function catsHtml() {
        var L = CS.limits, n = all().length;
        var fam = cats.groups.filter(function (g) { return g.fixed; })[0], own = cats.groups.filter(function (g) { return !g.fixed; });
        var noGroup = CS.people.filter(function (p) { return !own.some(function (g) { return g.members.indexOf(p.name) >= 0; }); });
        var gi = function (g) { return cats.groups.indexOf(g); };
        return '<div class="cs-card"><h3>Categories <span class="mute small">– the same on every calendar page</span></h3>' +
            '<p class="mute small">Every event on the calendar is in a category, which gives it its colour. Up to <b>' + L.cats + '</b> categories in all (' + n + ' now). ' +
            'When you add an event in Google Calendar or Gmail, give it the category’s colour there and it lands in that category here – the dashboard looks after matching the colours up. Names up to ' + L.name + ' letters, so they fit on the key.</p>' +

            '<h4>Family groups</h4><p class="mute small cs-expl">For events about some of the family. <b>Family</b> is everyone. You can make up to ' + L.groups + ' more – the children, the grown-ups… – and drag each person into one of them. ' +
                'Someone’s own events (“Drums (Ben)”) show in their group’s colour, unless they have a place of their own on the key.</p>' +
            '<div class="cs-groups">' +
                (fam ? '<div class="cs-group cs-famg"><div class="cs-ghead">' + swatch('g' + gi(fam), fam.colour) + '<b>Family</b><span class="mute small">everyone – for things you all do together</span></div></div>' : '') +
                own.map(function (g) {
                    var i = gi(g);
                    return '<div class="cs-group" data-zone="group" data-i="' + i + '"><div class="cs-ghead">' + swatch('g' + i, g.colour) +
                        '<input class="cs-name" data-gname="' + i + '" maxlength="' + L.name + '" value="' + esc(g.name) + '" placeholder="Group name, e.g. The children">' +
                        '<button class="cs-x" data-gdel="' + i + '" title="Remove this group">✕</button></div>' +
                        '<div class="cs-members">' + (g.members.length ? g.members.map(function (m) { return chip(m); }).join('') : '<span class="mute small">Drag people here</span>') + '</div></div>';
                }).join('') +
                '<div class="cs-group cs-nogroup" data-zone="group" data-i="-1"><div class="cs-ghead"><b>Not in a group</b></div>' +
                    '<p class="mute small">Only in Family – their own events show in Family’s colour. Drag someone here to take them out of a group.</p><div class="cs-members">' +
                    (noGroup.length ? noGroup.map(function (p) { return chip(p.name); }).join('') : '<span class="mute small">Everyone is in a group</span>') + '</div></div>' +
            '</div>' +
            (own.length < L.groups && n < L.cats ? '<button class="btn ghost sm" id="csAddGroup">+ Add a group</button>' : '') +

            '<h4>General categories</h4><p class="mute small cs-expl">For events that aren’t about particular people – holidays, school holidays, birthdays, work…</p>' +
            '<div class="cs-gens">' + cats.generals.map(function (c, i) {
                return '<div class="cs-gen">' + swatch('c' + i, c.colour) + '<input class="cs-name" data-cname="' + i + '" maxlength="' + L.name + '" value="' + esc(c.name) + '" placeholder="Name">' +
                    '<button class="cs-x" data-cdel="' + i + '" title="Remove">✕</button></div>';
            }).join('') + '</div>' +
            (n < L.cats ? '<div class="chips cs-sug">' + SUGGEST.filter(function (x) { return !cats.generals.some(function (c) { return c.name.toLowerCase() === x.toLowerCase(); }); }).map(function (x) {
                return '<button class="chip" data-sug="' + esc(x) + '">+ ' + esc(x) + '</button>'; }).join('') + '<button class="chip" data-sug="">+ Other…</button></div>' : '<p class="mute small">That’s the most (' + L.cats + ').</p>') +
            '<details class="cs-gmap"><summary>Which colour to pick in Google Calendar</summary><p class="mute small">When you add an event in Google Calendar or Gmail, choose its colour from this list:</p><ul>' +
                CS.groups.concat(CS.generals).filter(function (c) { return c.g && CS.gcolours[c.g]; }).map(function (c) {
                    return '<li><i style="background:' + CS.gcolours[c.g][1] + '"></i><b>' + esc(CS.gcolours[c.g][0]) + '</b> → ' + esc(c.name) + '</li>'; }).join('') +
                (CS.gcolours[CS.personG] ? '<li><i style="background:' + CS.gcolours[CS.personG][1] + '"></i><b>' + esc(CS.gcolours[CS.personG][0]) + '</b> → one person – with their name in brackets at the end, e.g. “Drums (Ben)”</li>' : '') +
                '<li><i style="background:#8a93a3"></i><b>No colour</b> → Other</li></ul></details>' +
            '<button class="btn good" id="csSaveCats">Save the categories</button></div>';
    }
    function nextColour() { var used = all().map(function (c) { return c.colour; }); return PALETTE.filter(function (x) { return used.indexOf(x) < 0; })[0] || PALETTE[0]; }
    function openPalette(btn) {
        closePalette();
        var ref = btn.getAttribute('data-sw'), list = ref[0] === 'g' ? cats.groups : cats.generals, c = list[+ref.slice(1)];
        var pop = document.createElement('div');
        pop.className = 'cs-pop';
        pop.innerHTML = PALETTE.map(function (x) { return '<button type="button" class="cs-pc' + (x === c.colour ? ' on' : '') + '" data-pc="' + x + '" style="background:' + x + '"></button>'; }).join('') +
            '<label class="cs-custom">Any colour <input type="color" value="' + esc(c.colour) + '"></label>';
        var r = btn.getBoundingClientRect();
        pop.style.left = (r.left + window.scrollX) + 'px'; pop.style.top = (r.bottom + window.scrollY + 6) + 'px';
        document.body.appendChild(pop);
        pop.onclick = function (e) { var b = e.target.closest('[data-pc]'); if (!b) return; c.colour = b.getAttribute('data-pc'); closePalette(); draw(); };
        pop.querySelector('input').onchange = function () { c.colour = this.value; closePalette(); draw(); };
        setTimeout(function () { document.addEventListener('click', outside, true); }, 0);
    }
    function outside(e) { if (!e.target.closest('.cs-pop')) closePalette(); }
    function closePalette() { var p = document.querySelector('.cs-pop'); if (p) p.remove(); document.removeEventListener('click', outside, true); }

    /* ------------------------------------------------------------ 2. this page's key */

    function homes() {
        var out = [];
        CS.people.forEach(function (p) {
            var g = cats.groups.filter(function (x) { return !x.fixed && x.members.indexOf(p.name) >= 0; })[0];
            if (key.hide.indexOf(p.name) >= 0 || (g && key.hide.indexOf(g.name) >= 0)) return;
            if (key.slots.indexOf(p.name) >= 0 || (g && key.slots.indexOf(g.name) >= 0) || key.slots.indexOf('Family') >= 0) return;
            out.push(p.name + (g ? ' (or ' + g.name + ')' : ''));
        });
        return out;
    }
    function keyHtml() {
        var L = CS.limits, all = cats.groups.concat(cats.generals).map(function (c) { return c.name; }).concat(CS.people.map(function (p) { return p.name; }));
        var pool = all.filter(function (n) { return key.slots.indexOf(n) < 0 && key.hide.indexOf(n) < 0; }), h = homes();
        return '<div class="cs-card"><h3>The key, as it will appear on this calendar page</h3>' +
            '<p class="mute small">Drag into the key what should have a place (and a colour) of its own – a category, a group or one person. Up to <b>' + (L.key - 1) + '</b>, and the last place is always <b>Other</b>. ' +
            'Anything not on the key still shows, in grey, as <b>Other</b> – tap the day on the screen and it shows its real category. ' +
            'Someone not on the key shows in their group’s colour, or Family’s. Tick <b>as a line</b> for up to <b>two</b> of them to draw them as a line under each day instead of a box (good for school holidays). <b>Hidden</b> ones don’t show on this page at all.</p>' +
            '<div class="cs-zone cs-key" data-zone="key">' + key.slots.map(function (n) {
                var li = key.lines.indexOf(n);
                return chip(n, '<label class="cs-linebox" title="Draw it as a line under each day instead of a box"><input type="checkbox" data-line="' + esc(n) + '"' + (li >= 0 ? ' checked' : '') + '>as a line</label>');
            }).join('') + '<span class="cs-chip cs-other"><i style="background:#8a93a3"></i>Other</span>' +
            (key.slots.length < L.key - 1 ? '<span class="cs-room">' + (L.key - 1 - key.slots.length) + ' more place' + (L.key - 1 - key.slots.length === 1 ? '' : 's') + '</span>' : '') + '</div>' +
            '<h4>Not on the key <span class="mute small">– shown as Other</span></h4><div class="cs-zone" data-zone="pool">' + (pool.length ? pool.map(function (n) { return chip(n); }).join('') : '<span class="mute small">Everything is on the key or hidden</span>') + '</div>' +
            '<h4>Hidden on this page</h4><div class="cs-zone cs-hide" data-zone="hide">' + (key.hide.length ? key.hide.map(function (n) { return chip(n); }).join('') : '<span class="mute small">Drag here to leave something off this page</span>') + '</div>' +
            (h.length ? '<p class="cs-warn">⚠ These people’s own events will show as Other on this page: ' + esc(h.join(', ')) + '. Put them, their group or Family on the key if you want them coloured.</p>' : '') +
            '<button class="btn good" id="csSaveKey">Save this page’s key</button></div>';
    }

    /* ------------------------------------------------------------ 3. tidying up */

    function tidyHtml() {
        return '<div class="cs-card"><h3>Tidy up your Google calendar</h3><p class="mute small">Goes through the last three months and the next year of your family calendar and lists anything to put right: ' +
            'events in the old “Ben – Drums” form (they become “Drums (Ben)”), events with no category, and titles too long for the screen. You choose; nothing changes until you press Apply.</p>' +
            '<button class="btn" id="csScan">Check the Google calendar</button></div>';
    }
    function tidy() {
        var ov = document.createElement('div');
        ov.className = 'cs-ov'; ov.innerHTML = '<div class="cs-modal"><h2>Tidy up your Google calendar</h2><div class="empty">Looking through the calendar…</div></div>';
        document.body.appendChild(ov);
        var close = function () { ov.remove(); };
        window.FD.post({ action: 'calScan' }).then(function (d) {
            if (d.error) throw new Error(d.error);
            var rows = d.rows || [], ch = d.choices || [];
            var opts = function (cur) {
                var grp = function (k, label) { return '<optgroup label="' + label + '">' + ch.filter(function (c) { return c.kind === k; }).map(function (c) { return '<option' + (c.name === cur ? ' selected' : '') + '>' + esc(c.name) + '</option>'; }).join('') + '</optgroup>'; };
                return '<option value=""' + (cur ? '' : ' selected') + '>— none (Other)</option>' + grp('general', 'General') + grp('group', 'Family groups') + grp('person', 'One person');
            };
            ov.querySelector('.cs-modal').innerHTML = '<h2>Tidy up your Google calendar</h2>' +
                '<p class="mute small">' + d.total + ' events looked at' + (d.skipped ? ' (' + d.skipped + ' in calendars you can’t change, e.g. shared ones, left alone)' : '') + '. ' +
                (rows.length ? rows.length + (d.more ? '+' : '') + ' to put right – problems first. Untick any you’d rather leave. Repeating events change every time they come round.' : 'Nothing to put right – it’s all in order.') + '</p>' +
                (rows.length ? '<div class="cs-tablewrap"><table class="cs-table"><thead><tr><th></th><th>When</th><th>Now</th><th>Category</th><th>New title</th><th></th></tr></thead><tbody>' + rows.map(function (r, i) {
                    return '<tr data-i="' + i + '"><td><input type="checkbox" class="cs-tick"' + (r.cat ? ' checked' : '') + '></td><td class="nowrap">' + esc(r.date) + (r.time ? ' ' + esc(r.time) : '') + (r.rec ? ' ↻' : '') + '</td>' +
                        '<td>' + esc(r.title) + '</td><td><select class="cs-cat">' + opts(r.cat) + '</select></td>' +
                        '<td><input class="cs-title" value="' + esc(r.text) + '" maxlength="80"><small class="cs-len"></small></td><td>' + (r.problem ? '<span class="cs-prob">' + esc(r.problem) + '</span>' : '') + '</td></tr>';
                }).join('') + '</tbody></table></div>' : '') +
                '<div class="sheet-actions"><button class="btn ghost" id="csTClose">' + (rows.length ? 'Skip for now' : 'Close') + '</button>' + (rows.length ? '<button class="btn good" id="csTApply">Apply</button>' : '') + '</div><p class="mute small" id="csTMsg"></p>';
            var len = function (tr) {
                var v = tr.querySelector('.cs-title').value.trim(), cat = tr.querySelector('.cs-cat').value, p = CS.people.some(function (x) { return x.name === cat; });
                var full = v.length + (p ? cat.length + 3 : 0), small = tr.querySelector('.cs-len');
                small.textContent = full + '/' + d.max; small.className = 'cs-len' + (full > d.max ? ' bad' : '');
                if (cat) tr.querySelector('.cs-tick').checked = true;
            };
            Array.prototype.forEach.call(ov.querySelectorAll('tbody tr'), function (tr) { len(tr); tr.oninput = function () { len(tr); }; tr.onchange = function () { len(tr); }; });
            ov.querySelector('#csTClose').onclick = close;
            if (ov.querySelector('#csTApply')) ov.querySelector('#csTApply').onclick = function () {
                var items = Array.prototype.filter.call(ov.querySelectorAll('tbody tr'), function (tr) { return tr.querySelector('.cs-tick').checked; }).map(function (tr) {
                    var r = rows[+tr.getAttribute('data-i')];
                    return { id: r.id, cal: r.cal, rec: r.rec, cat: tr.querySelector('.cs-cat').value, text: tr.querySelector('.cs-title').value.trim() };
                });
                if (!items.length) { close(); return; }
                var btn = this, done = 0, failed = [];
                btn.disabled = true;
                var next = function () {
                    var part = items.splice(0, 50);
                    if (!part.length) {
                        ov.querySelector('#csTMsg').textContent = '✔ ' + done + ' changed' + (failed.length ? ' · ' + failed.length + ' couldn’t be (' + failed[0].error + ')' : '') + '.';
                        btn.textContent = 'Done'; btn.disabled = false; btn.onclick = close; H.toast('Calendar tidied – the screen updates within a few minutes');
                        return;
                    }
                    ov.querySelector('#csTMsg').textContent = 'Changing… ' + done + ' done';
                    window.FD.post({ action: 'calFix', items: part }).then(function (x) { if (x.error) throw new Error(x.error); done += x.done.length; failed = failed.concat(x.failed); next(); },
                        function (e) { ov.querySelector('#csTMsg').textContent = 'Stopped: ' + e.message + ' (' + done + ' changed)'; btn.disabled = false; });
                };
                next();
            };
        }).catch(function (e) { ov.querySelector('.cs-modal').innerHTML = '<h2>Tidy up your Google calendar</h2><p class="bad">' + esc(e.message) + '</p><div class="sheet-actions"><button class="btn" id="csTClose">Close</button></div>'; ov.querySelector('#csTClose').onclick = close; });
    }

    /* ------------------------------------------------------------ drawing and wiring */

    function draw() {
        box.innerHTML = catsHtml() + keyHtml() + tidyHtml();
    }
    function moveTo(n, zone, before) {
        key.slots = key.slots.filter(function (x) { return x !== n; }); key.hide = key.hide.filter(function (x) { return x !== n; });
        if (zone === 'key') {
            if (key.slots.length >= CS.limits.key - 1) { H.toast('The key has ' + (CS.limits.key - 1) + ' places (plus Other) – take something off first', true); return; }
            var i = before ? key.slots.indexOf(before) : -1;
            if (i >= 0) key.slots.splice(i, 0, n); else key.slots.push(n);
        } else if (zone === 'hide') key.hide.push(n);
        key.lines = key.lines.filter(function (x) { return key.slots.indexOf(x) >= 0; });
        draw();
    }
    function wire() {
        box.oninput = function (e) {
            var t = e.target, i;
            if ((i = t.getAttribute('data-gname')) !== null) cats.groups[+i].name = t.value;
            else if ((i = t.getAttribute('data-cname')) !== null) cats.generals[+i].name = t.value;
        };
        box.onchange = function (e) {
            var t = e.target, n = t.getAttribute('data-line');
            if (n === null) return;
            var i = key.lines.indexOf(n);
            if (t.checked && i < 0) { if (key.lines.length >= 2) { t.checked = false; H.toast('Up to two can be lines – untick one first', true); return; } key.lines.push(n); }
            if (!t.checked && i >= 0) key.lines.splice(i, 1);
        };
        box.onclick = function (e) {
            var t;
            if ((t = e.target.closest('[data-sw]'))) { openPalette(t); return; }
            if (e.target.closest('.cs-linebox')) return;
            if ((t = e.target.closest('#csAddGroup'))) { cats.groups.splice(cats.groups.length - 1, 0, { name: '', colour: nextColour(), members: [] }); draw(); }
            else if ((t = e.target.closest('[data-gdel]'))) { cats.groups.splice(+t.getAttribute('data-gdel'), 1); draw(); }
            else if ((t = e.target.closest('[data-cdel]'))) { cats.generals.splice(+t.getAttribute('data-cdel'), 1); draw(); }
            else if ((t = e.target.closest('[data-sug]'))) { cats.generals.push({ name: t.getAttribute('data-sug'), colour: nextColour() }); draw();
                if (!t.getAttribute('data-sug')) { var ins = box.querySelectorAll('[data-cname]'); if (ins.length) ins[ins.length - 1].focus(); } }
            else if ((t = e.target.closest('#csSaveCats'))) {
                t.disabled = true; t.textContent = 'Saving…';
                H.act({ action: 'saveCalCats', groups: cats.groups, generals: cats.generals }, 'Categories saved – the screen updates within a few minutes');
            }
            else if ((t = e.target.closest('#csSaveKey'))) {
                t.disabled = true; t.textContent = 'Saving…';
                H.act({ action: 'saveCalKey', page: pageId, slots: key.slots, lines: key.lines, hide: key.hide }, 'Key saved – the screen updates within a few minutes');
            }
            else if ((t = e.target.closest('#csScan'))) tidy();
        };
        box.ondragstart = function (e) { var c = e.target.closest && e.target.closest('.cs-chip[data-n]'); if (!c) return; dragN = c.getAttribute('data-n'); try { e.dataTransfer.setData('text/plain', dragN); } catch (x) { /* fine */ } };
        box.ondragend = function () { dragN = null; Array.prototype.forEach.call(box.querySelectorAll('.over'), function (x) { x.classList.remove('over'); }); };
        box.ondragover = function (e) { var z = e.target.closest('[data-zone]'); if (z && dragN) { e.preventDefault(); z.classList.add('over'); } };
        box.ondragleave = function (e) { var z = e.target.closest('[data-zone]'); if (z) z.classList.remove('over'); };
        box.ondrop = function (e) {
            var z = e.target.closest('[data-zone]'), n = dragN; if (!z || !n) return;
            e.preventDefault(); dragN = null;
            var zone = z.getAttribute('data-zone');
            if (zone === 'group') {     // people into family groups
                if (!CS.people.some(function (p) { return p.name === n; })) { H.toast('Only people go into groups', true); draw(); return; }
                cats.groups.forEach(function (g) { g.members = g.members.filter(function (m) { return m !== n; }); });
                var gi = +z.getAttribute('data-i'); if (gi >= 0 && !cats.groups[gi].fixed) cats.groups[gi].members.push(n);
                draw(); return;
            }
            var before = e.target.closest('.cs-chip[data-n]'); moveTo(n, zone, before && zone === 'key' ? before.getAttribute('data-n') : null);
        };
    }

    window.FDCalSetup = {
        render: function (el, id, hooks) {
            H = hooks; box = el; pageId = id; CS = (H.data() || {}).calSetup;
            if (!CS) { el.innerHTML = '<p class="mute small">Update the Google script to set up the calendar categories here.</p>'; return; }
            cats = { groups: clone(CS.groups).map(function (g) { g.was = g.name; return g; }), generals: clone(CS.generals).map(function (g) { g.was = g.name; return g; }) };
            key = clone((CS.keys || []).filter(function (k) { return k.page === id; })[0] || { slots: [], lines: [], hide: [] });
            draw(); wire();
        },
    };
})();
