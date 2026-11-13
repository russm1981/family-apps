/*
 * The calendar set-up on the Setup website (Screens & widgets → a calendar page):
 *   1. Categories – shared by every calendar page: the general categories (Holiday, School holiday…) and the people
 *      ones (Family is everyone; drag people into the groups). Behind the scenes each has one of Google Calendar's event
 *      colours (worked out by the Google script), so an event made in Google Calendar or Gmail lands in the right one.
 *   2. How each category looks, on every calendar page: shown in its own colour (a box, or – up to two – a line under the
 *      day) or not shown, when its events go in Other; and whether Other shows at all.
 *   3. Tidying up the Google calendar – a table of events that aren't in a category, are in the old "Ben – " form, or
 *      have a title that's too long, with a fix for each.
 */
(function () {
    'use strict';
    var H, box, pageId, CS, cats, look, dragN = null;
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

    /* ------------------------------------------------------------ 1. categories, and how each looks */

    // Each category is shown in its own colour (a box, or a line under the day) or not shown – then its events go in
    // Other, in grey. Other itself can be left off. It's the same on every calendar page.
    function ink(hex) {
        var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex || '')); if (!m) return '#fff';
        var l = (0.299 * parseInt(m[1], 16) + 0.587 * parseInt(m[2], 16) + 0.114 * parseInt(m[3], 16)) / 255;
        return l > 0.6 ? '#111' : '#fff';
    }
    function catOf(ref) { return (ref[0] === 'g' ? cats.groups : cats.generals)[+ref.slice(1)]; }
    function preview(c) {
        if (!c.show) return look.other ? '<span class="cs-loz" style="background:#8a93a3;color:#111">Other</span>' : '<span class="mute small">not shown</span>';
        if (c.line) return '<span class="cs-pday"><b>14</b><i style="background:' + esc(c.colour) + '"></i></span>';
        return '<span class="cs-loz" style="background:' + esc(c.colour) + ';color:' + ink(c.colour) + '">' + esc(c.name || 'Name') + '</span>';
    }
    function row(c, ref, nameCell, del) {
        return '<div class="cs-row" data-row="' + ref + '">' + '<span class="cs-nm">' + nameCell + '</span>' + swatch(ref, c.colour) +
            '<label class="cs-tk' + (c.show ? '' : ' off') + '" title="A coloured line under each day, instead of a box – good for things that last days or weeks"><input type="checkbox" data-line="' + ref + '"' + (c.line ? ' checked' : '') + (c.show ? '' : ' disabled') + '><span>As a line</span></label>' +
            '<label class="cs-tk" title="Shown in its own colour – or, unticked, its events go in Other"><input type="checkbox" data-show="' + ref + '"' + (c.show ? ' checked' : '') + '><span>Shown</span></label>' +
            '<span class="cs-pv">' + preview(c) + '</span>' + (del || '<span></span>') + '</div>';
    }
    function headRow() { return '<div class="cs-row cs-rhead"><span>Name</span><span>Colour</span><span>Line</span><span>Shown</span><span>How it looks</span><span></span></div>'; }

    function catsHtml() {
        var L = CS.limits, n = all().length;
        var fam = cats.groups.filter(function (g) { return g.fixed; })[0], own = cats.groups.filter(function (g) { return !g.fixed; });
        var noGroup = CS.people.filter(function (p) { return !own.some(function (g) { return g.members.indexOf(p.name) >= 0; }); });
        var gi = function (g) { return cats.groups.indexOf(g); };
        var nameIn = function (attr, i, v, ph) { return '<input class="cs-name" ' + attr + '="' + i + '" maxlength="' + L.name + '" value="' + esc(v) + '" placeholder="' + ph + '">'; };
        return '<div class="cs-card"><h3>Categories</h3><p class="cs-sub">These apply to all of your calendar pages.</p>' +
            '<p>You can have up to <b>' + L.cats + '</b> categories' + ' <span class="cs-count' + (n > L.cats ? ' bad' : '') + '">(you’re using ' + n + ')</span>. They’re either <b>general</b> categories – for events that aren’t about particular people – ' +
            'or <b>people</b> categories, for a group of people or everyone. Use the settings below to choose how each one appears on your calendars: its colour, a box or a line under the day, and whether it’s shown at all.</p>' +

            '<h4>General categories</h4><p class="mute small cs-expl">Holidays, school holidays, birthdays, work…</p>' +
            headRow() + cats.generals.map(function (c, i) {
                return row(c, 'c' + i, nameIn('data-cname', i, c.name, 'Name'), '<button class="cs-x" data-cdel="' + i + '" title="Remove">✕</button>');
            }).join('') +
            (n < L.cats ? '<div class="chips cs-sug">' + SUGGEST.filter(function (x) { return !cats.generals.some(function (c) { return c.name.toLowerCase() === x.toLowerCase(); }); }).map(function (x) {
                return '<button class="chip" data-sug="' + esc(x) + '">+ ' + esc(x) + '</button>'; }).join('') + '<button class="chip" data-sug="">+ Add another…</button></div>' : '<p class="mute small">That’s the most (' + L.cats + ').</p>') +

            '<h4>People categories</h4><p class="mute small cs-expl"><b>Family</b> is everyone. You can make up to ' + L.groups + ' groups – the children, the grown-ups… – and drag people into them. ' +
                'Someone’s own events (“Drums (Ben)”) appear in their group’s colour, or Family’s if they aren’t in a group.</p>' +
            headRow() +
            (fam ? row(fam, 'g' + gi(fam), '<b>Family</b> <span class="mute small">everyone – things you all do together</span>') : '') +
            own.map(function (g) {
                var i = gi(g);
                return '<div class="cs-grp" data-zone="group" data-i="' + i + '">' + row(g, 'g' + i, nameIn('data-gname', i, g.name, 'Group name, e.g. The children'), '<button class="cs-x" data-gdel="' + i + '" title="Remove this group">✕</button>') +
                    '<div class="cs-members">' + (g.members.length ? g.members.map(function (m) { return chip(m); }).join('') : '<span class="mute small">Drag people here</span>') + '</div></div>';
            }).join('') +
            (own.length < L.groups && n < L.cats ? '<button class="btn ghost sm" id="csAddGroup">+ Add a group</button>' : '') +
            '<div class="cs-grp cs-nogroup" data-zone="group" data-i="-1"><b>Not in a group</b> <span class="mute small">– their own events appear as Family. ✋ Drag a name onto a group to put them in it.</span><div class="cs-members">' +
                (noGroup.length ? noGroup.map(function (p) { return chip(p.name); }).join('') : '<span class="mute small">Everyone is in a group</span>') + '</div></div>' +

            '<h4>Everything else</h4>' +
            '<div class="cs-row cs-orow"><span class="cs-nm"><b>Other</b> <span class="mute small">events in no category, or in one that isn’t shown</span></span><span></span><span></span>' +
                '<label class="cs-tk"><input type="checkbox" id="csOther"' + (look.other ? ' checked' : '') + '><span>Shown</span></label>' +
                '<span class="cs-pv">' + (look.other ? '<span class="cs-loz" style="background:#8a93a3;color:#111">Other</span>' : '<span class="mute small">not shown</span>') + '</span><span></span></div>' +
            '<p class="mute small">Up to two shown categories can be lines. Tap a day on the screen to see each event’s own category.</p>' +
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

    /** What every calendar page's key becomes: the shown categories, general ones first. */
    function keyFromCats() {
        var shown = cats.generals.concat(cats.groups.filter(function (g) { return g.fixed; }), cats.groups.filter(function (g) { return !g.fixed; }))
            .filter(function (c) { return c.show && String(c.name).trim(); });
        return { slots: shown.map(function (c) { return String(c.name).trim(); }), lines: shown.filter(function (c) { return c.line; }).map(function (c) { return String(c.name).trim(); }), hide: [], other: look.other };
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
                (rows.length ? '<div class="cs-tablewrap"><table class="cs-table"><thead><tr><th><input type="checkbox" id="csTAll" title="Tick or untick them all"></th><th>When</th><th>Now</th><th>Category</th><th>New title</th><th></th></tr></thead><tbody>' + rows.map(function (r, i) {
                    return '<tr data-i="' + i + '"><td><input type="checkbox" class="cs-tick"' + (r.cat ? ' checked' : '') + '></td><td class="nowrap">' + esc(r.date) + (r.time ? ' ' + esc(r.time) : '') + (r.rec ? ' ↻' : '') + '</td>' +
                        '<td>' + esc(r.title) + '</td><td><select class="cs-cat">' + opts(r.cat) + '</select></td>' +
                        '<td><input class="cs-title" value="' + esc(r.text) + '" maxlength="80"><small class="cs-len"></small></td><td>' + (r.problem ? '<span class="cs-prob">' + esc(r.problem) + '</span>' : '') + '</td></tr>';
                }).join('') + '</tbody></table></div>' : '') +
                '<div class="sheet-actions">' + (rows.length ? '<button class="btn good" id="csTApply">Apply the ticked ones</button>' : '') + '<button class="btn ghost" id="csTClose">Close</button></div><p class="mute small" id="csTMsg"></p>';
            var len = function (tr) {
                var v = tr.querySelector('.cs-title').value.trim(), cat = tr.querySelector('.cs-cat').value, p = CS.people.some(function (x) { return x.name === cat; });
                var full = v.length + (p ? cat.length + 3 : 0), small = tr.querySelector('.cs-len');
                small.textContent = full + '/' + d.max; small.className = 'cs-len' + (full > d.max ? ' bad' : '');
                if (cat) tr.querySelector('.cs-tick').checked = true;
            };
            Array.prototype.forEach.call(ov.querySelectorAll('tbody tr'), function (tr) { len(tr); tr.oninput = function () { len(tr); }; tr.onchange = function () { len(tr); }; });
            ov.querySelector('#csTClose').onclick = close;
            var ticks = function () { return Array.prototype.slice.call(ov.querySelectorAll('tbody .cs-tick')); };
            var allBox = ov.querySelector('#csTAll'), sync = function () { if (!allBox) return; var t = ticks(), n = t.filter(function (x) { return x.checked; }).length; allBox.checked = n === t.length && n > 0; allBox.indeterminate = n > 0 && n < t.length; };
            if (allBox) { allBox.onchange = function () { ticks().forEach(function (x) { x.checked = allBox.checked; }); }; ov.querySelector('tbody').addEventListener('change', sync); sync(); }
            if (ov.querySelector('#csTApply')) ov.querySelector('#csTApply').onclick = function () {
                var items = Array.prototype.filter.call(ov.querySelectorAll('tbody tr'), function (tr) { return tr.querySelector('.cs-tick').checked; }).map(function (tr) {
                    var r = rows[+tr.getAttribute('data-i')];
                    return { id: r.id, cal: r.cal, rec: r.rec, cat: tr.querySelector('.cs-cat').value, text: tr.querySelector('.cs-title').value.trim() };
                });
                if (!items.length) { close(); return; }
                var btn = this, done = 0, failed = [], total = items.length;
                btn.disabled = true;
                var next = function () {
                    var part = items.splice(0, 15);
                    if (!part.length) {
                        ov.querySelector('#csTMsg').textContent = '✔ ' + done + ' changed' + (failed.length ? ' · ' + failed.length + ' couldn’t be (' + failed[0].error + ')' : '') + '.';
                        btn.textContent = 'Done'; btn.disabled = false; btn.onclick = close; H.toast('Calendar tidied – the screen updates within a few minutes');
                        return;
                    }
                    ov.querySelector('#csTMsg').textContent = 'Changing… ' + done + ' of ' + total + ' done';
                    window.FD.post({ action: 'calFix', items: part }, 90000).then(function (x) {
                        if (x.error) throw new Error(x.error);
                        done += x.done.length; failed = failed.concat(x.failed);
                        if (x.left && x.left.length) items = part.filter(function (it) { return x.left.indexOf(it.id) >= 0; }).concat(items);      // not reached yet: send again
                        next();
                    },
                        function (e) { ov.querySelector('#csTMsg').textContent = 'Stopped: ' + e.message + ' (' + done + ' of ' + total + ' changed so far). Press Apply again to carry on – the ones already done are fine to send again.'; btn.disabled = false; });
                };
                next();
            };
        }).catch(function (e) { ov.querySelector('.cs-modal').innerHTML = '<h2>Tidy up your Google calendar</h2><p class="bad">' + esc(e.message) + '</p><div class="sheet-actions"><button class="btn" id="csTClose">Close</button></div>'; ov.querySelector('#csTClose').onclick = close; });
    }

    /* ------------------------------------------------------------ drawing and wiring */

    function draw() {
        box.innerHTML = catsHtml() + tidyHtml();
    }
    function canShow() { return all().filter(function (x) { return x.show; }).length < CS.limits.key - 1; }
    function wire() {
        box.oninput = function (e) {
            var t = e.target, i;
            if ((i = t.getAttribute('data-gname')) !== null) cats.groups[+i].name = t.value;
            else if ((i = t.getAttribute('data-cname')) !== null) cats.generals[+i].name = t.value;
            else return;
            var r = t.closest('[data-row]'); if (r) r.querySelector('.cs-pv').innerHTML = preview(catOf(r.getAttribute('data-row')));
        };
        box.onchange = function (e) {
            var t = e.target, ref, c;
            if (t.id === 'csOther') { look.other = t.checked; draw(); return; }
            if ((ref = t.getAttribute('data-show')) !== null) {
                c = catOf(ref);
                var nShown = all().filter(function (x) { return x.show; }).length;
                if (t.checked && nShown >= CS.limits.key - 1) { t.checked = false; H.toast('Up to ' + (CS.limits.key - 1) + ' categories can be shown – untick one first', true); return; }
                c.show = t.checked; if (!c.show) c.line = false; draw(); return;
            }
            if ((ref = t.getAttribute('data-line')) !== null) {
                c = catOf(ref);
                if (t.checked && all().filter(function (x) { return x.line && x.show; }).length >= 2) { t.checked = false; H.toast('Up to two can be lines – untick one first', true); return; }
                c.line = t.checked; draw();
            }
        };
        box.onclick = function (e) {
            var t;
            if ((t = e.target.closest('[data-sw]'))) { openPalette(t); return; }
            if ((t = e.target.closest('#csAddGroup'))) { cats.groups.splice(cats.groups.length - 1, 0, { name: '', colour: nextColour(), members: [], show: canShow() }); draw(); }
            else if ((t = e.target.closest('[data-gdel]'))) { cats.groups.splice(+t.getAttribute('data-gdel'), 1); draw(); }
            else if ((t = e.target.closest('[data-cdel]'))) { cats.generals.splice(+t.getAttribute('data-cdel'), 1); draw(); }
            else if ((t = e.target.closest('[data-sug]'))) { cats.generals.push({ name: t.getAttribute('data-sug'), colour: nextColour(), show: canShow() }); draw();
                if (!t.getAttribute('data-sug')) { var ins = box.querySelectorAll('[data-cname]'); if (ins.length) ins[ins.length - 1].focus(); } }
            else if ((t = e.target.closest('#csSaveCats'))) {
                if (cats.generals.concat(cats.groups).some(function (c) { return !String(c.name).trim(); })) { H.toast('Give every category a name (or remove it)', true); return; }
                H.act({ action: 'saveCalCats', groups: cats.groups, generals: cats.generals, key: keyFromCats() }, 'Categories saved – the screen updates within a few minutes');
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
        };
    }

    window.FDCalSetup = {
        render: function (el, id, hooks) {
            H = hooks; box = el; pageId = id; CS = (H.data() || {}).calSetup;
            if (!CS) { el.innerHTML = '<div class="cs-card"><h3>Categories and the key</h3><p class="cs-warn">⚠ Your Google application needs updating before the calendar’s categories and key can be set up here. Go to <a href="#/advanced/updates">Advanced → Software updates</a> and press Update now, then come back to this page.</p></div>'; return; }
            cats = { groups: clone(CS.groups).map(function (g) { g.was = g.name; return g; }), generals: clone(CS.generals).map(function (g) { g.was = g.name; return g; }) };
            var key = (CS.keys || []).filter(function (k) { return k.page === id; })[0] || (CS.keys || [])[0] || { slots: [], lines: [], hide: [] };
            look = { other: key.other !== false };
            all().forEach(function (c) { c.show = key.slots.indexOf(c.name) >= 0; c.line = c.show && key.lines.indexOf(c.name) >= 0; });
            try { draw(); wire(); }
            catch (e) { el.innerHTML = '<div class="cs-card"><p class="cs-warn">⚠ The calendar set-up couldn’t be shown: ' + esc(e.message) + '. Try reloading the page; if it keeps happening, send a report from Advanced → About &amp; diagnostics.</p></div>'; }
        },
    };
})();
