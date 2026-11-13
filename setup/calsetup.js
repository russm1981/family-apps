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
    var H, box, pageId, CS, cats, look, people = [];
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
    function catOf(ref) { return ref[0] === 'p' ? people[+ref.slice(1)] : (ref[0] === 'g' ? cats.groups : cats.generals)[+ref.slice(1)]; }
    var SHOW = [['show', 'Show'], ['other', 'Group in Other'], ['hide', 'Hide']];
    /** How many things get a colour (and a place on the key) of their own – the calendar shows up to CS.limits.key. */
    function colourCount() {
        return all().filter(function (c) { return c.show === 'show'; }).length + people.filter(function (p) { return p.display === 'me'; }).length + (look.other ? 1 : 0);
    }
    function sel(attr, ref, opts, cur) {
        return '<select class="cs-sel" ' + attr + '="' + ref + '">' + opts.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (o[0] === cur ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select>';
    }
    // A colour square; as a line, the colour is a bar along the bottom of the square (how it looks on the calendar).
    function swatchOf(ref, c) { return '<button type="button" class="cs-sw' + (c.line ? ' line' : '') + '" data-sw="' + ref + '" style="--sc:' + esc(c.colour) + '" title="Change the colour"></button>'; }
    function catRow(c, ref, nameCell, del) {
        return '<div class="cs-row" data-row="' + ref + '"><span class="cs-nm">' + nameCell + '</span>' + swatchOf(ref, c) +
            '<span class="cs-ck"><input type="checkbox" data-line="' + ref + '"' + (c.line ? ' checked' : '') + (c.show === 'show' ? '' : ' disabled') + ' title="Draw it as a line along the bottom of each day"></span>' +
            sel('data-show', ref, SHOW, c.show) + (del || '<span></span>') + '</div>';
    }
    function head(cols) { return '<div class="cs-row cs-rhead">' + cols.map(function (c) { return '<span>' + c + '</span>'; }).join('') + '</div>'; }

    function catsHtml() {
        var L = CS.limits, n = colourCount(), over = n > L.key;
        var fam = cats.groups.filter(function (g) { return g.fixed; })[0], own = cats.groups.filter(function (g) { return !g.fixed; });
        var gi = function (g) { return cats.groups.indexOf(g); };
        var nameIn = function (attr, i, v, ph) { return '<input class="cs-name" ' + attr + '="' + i + '" maxlength="' + L.name + '" value="' + esc(v) + '" placeholder="' + ph + '">'; };
        var where = [['me', 'Individually'], ['family', 'In Family']].concat(own.map(function (g) { return ['g' + gi(g), 'In ' + (g.name || 'a group')]; })).concat([['hide', 'Hide']]);
        return '<div class="cs-card"><h3 class="cs-h1">Colour coding</h3><p class="cs-sub">The same on all of your calendar pages.</p>' +
            '<p>Events can be in a <b>category</b> (holidays, birthdays…) or be about <b>people</b>. People’s events can be coloured for each person, or – with lots of people – put together in family groups to keep the calendar simple.</p>' +
            '<div class="cs-limit' + (over ? ' bad' : '') + '">' + (over
                ? '⚠ <b>' + n + ' things are set to show in their own colour – the calendar can show up to ' + L.key + '.</b> Set some to “Group in Other” or “Hide”, or show some people in a family group, then save.'
                : 'The calendar can show up to <b>' + L.key + '</b> colours. You’re using <b>' + n + '</b>' + (look.other ? ' (including Other)' : '') + '.') + '</div>' +

            '<h3 class="cs-h2">General categories</h3>' +
            head(['Name', 'Colour', 'Line?', 'Show?', '']) +
            cats.generals.map(function (c, i) { return catRow(c, 'c' + i, nameIn('data-cname', i, c.name, 'Name'), '<button class="cs-x" data-cdel="' + i + '" title="Remove">✕</button>'); }).join('') +
            (all().length < L.cats ? '<div class="chips cs-sug">' + SUGGEST.filter(function (x) { return !cats.generals.some(function (c) { return c.name.toLowerCase() === x.toLowerCase(); }); }).map(function (x) {
                return '<button class="chip" data-sug="' + esc(x) + '">+ ' + esc(x) + '</button>'; }).join('') + '<button class="chip" data-sug="">+ Add another…</button></div>' : '') +

            '<h3 class="cs-h2">People in the family</h3>' +
            '<div class="cs-row cs-prow cs-rhead"><span>Name</span><span>Colour</span><span>Display</span><span></span></div>' +
            people.map(function (p, i) {
                return '<div class="cs-row cs-prow" data-row="p' + i + '"><span class="cs-nm"><b>' + esc(p.name) + '</b></span>' + swatchOf('p' + i, p) + sel('data-pshow', 'p' + i, where, p.display) + '<span></span></div>';
            }).join('') +
            '<p class="mute small">“In Family” or “In” a group: their own events (“Drums (Ben)”) are shown in that colour.</p>' +

            '<h3 class="cs-h2">Family groups</h3>' +
            head(['Name', 'Colour', 'Line?', 'Show?', '']) +
            (fam ? catRow(fam, 'g' + gi(fam), '<b>Family</b> <span class="mute small">everyone – things you all do together</span>') : '') +
            own.map(function (g) { return catRow(g, 'g' + gi(g), nameIn('data-gname', gi(g), g.name, 'Group name, e.g. The children'), '<button class="cs-x" data-gdel="' + gi(g) + '" title="Remove this group">✕</button>'); }).join('') +
            (own.length < L.groups && all().length < L.cats ? '<button class="btn ghost sm" id="csAddGroup">+ Add a group</button>' : '') +

            '<h3 class="cs-h2">Everything else</h3>' +
            '<div class="cs-row cs-orow"><span class="cs-nm"><b>Other</b> <span class="mute small">events in no category, and anything set to “Group in Other”</span></span><span class="cs-sw" style="--sc:#8a93a3"></span><span></span>' +
                sel('data-oshow', 'o', [['show', 'Show'], ['hide', 'Hide']], look.other ? 'show' : 'hide') + '<span></span></div>' +
            '<p class="mute small">Up to two categories or groups can be lines – drawn along the bottom of each day, good for things that last days or weeks.</p>' +
            '<button class="btn good" id="csSaveCats"' + (over ? ' disabled' : '') + '>Save the colour coding</button></div>';
    }
    function nextColour() { var used = all().map(function (c) { return c.colour; }); return PALETTE.filter(function (x) { return used.indexOf(x) < 0; })[0] || PALETTE[0]; }
    function openPalette(btn) {
        closePalette();
        var ref = btn.getAttribute('data-sw'), c = catOf(ref); if (!c) return;
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

    /** What every calendar page's key becomes: the shown categories (general ones first), groups, and people shown on their own. */
    function keyFromCats() {
        var nm = function (c) { return String(c.name).trim(); };
        var order = cats.generals.concat(cats.groups.filter(function (g) { return g.fixed; }), cats.groups.filter(function (g) { return !g.fixed; })).filter(function (c) { return nm(c); });
        var shown = order.filter(function (c) { return c.show === 'show'; });
        return { slots: shown.map(nm).concat(people.filter(function (p) { return p.display === 'me'; }).map(function (p) { return p.name; })),
            lines: shown.filter(function (c) { return c.line; }).map(nm),
            hide: order.filter(function (c) { return c.show === 'hide'; }).map(nm).concat(people.filter(function (p) { return p.display === 'hide'; }).map(function (p) { return p.name; })),
            other: look.other };
    }
    /** Group membership comes from each person's Display. */
    function applyMembers() {
        cats.groups.forEach(function (g) { if (!g.fixed) g.members = []; });
        people.forEach(function (p) { var m = /^g(\d+)$/.exec(p.display || ''); if (m && cats.groups[+m[1]] && !cats.groups[+m[1]].fixed) cats.groups[+m[1]].members.push(p.name); });
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
    function wire() {
        box.oninput = function (e) {
            var t = e.target, i;
            if ((i = t.getAttribute('data-gname')) !== null) cats.groups[+i].name = t.value;
            else if ((i = t.getAttribute('data-cname')) !== null) cats.generals[+i].name = t.value;
        };
        // A group's new name shows in the people's Display lists once you leave the box.
        box.addEventListener('focusout', function (e) { if (e.target.getAttribute && e.target.getAttribute('data-gname') !== null) draw(); });
        box.onchange = function (e) {
            var t = e.target, ref, c;
            if (t.getAttribute('data-oshow') !== null) { look.other = t.value === 'show'; draw(); return; }
            if ((ref = t.getAttribute('data-show')) !== null) { c = catOf(ref); c.show = t.value; if (c.show !== 'show') c.line = false; draw(); return; }
            if ((ref = t.getAttribute('data-pshow')) !== null) { catOf(ref).display = t.value; applyMembers(); draw(); return; }
            if ((ref = t.getAttribute('data-line')) !== null) {
                c = catOf(ref);
                if (t.checked && all().filter(function (x) { return x.line && x.show === 'show'; }).length >= 2) { t.checked = false; H.toast('Up to two can be lines – untick one first', true); return; }
                c.line = t.checked; draw();
            }
        };
        box.onclick = function (e) {
            var t;
            if ((t = e.target.closest('[data-sw]'))) { openPalette(t); return; }
            if ((t = e.target.closest('#csAddGroup'))) { cats.groups.splice(cats.groups.length - 1, 0, { name: '', colour: nextColour(), members: [], show: 'show' }); draw(); var gs = box.querySelectorAll('[data-gname]'); if (gs.length) gs[gs.length - 1].focus(); }
            else if ((t = e.target.closest('[data-gdel]'))) {
                var gi = +t.getAttribute('data-gdel');
                people.forEach(function (p) { var m = /^g(\d+)$/.exec(p.display || ''); if (m) { if (+m[1] === gi) p.display = 'family'; else if (+m[1] > gi) p.display = 'g' + (+m[1] - 1); } });
                cats.groups.splice(gi, 1); applyMembers(); draw();
            }
            else if ((t = e.target.closest('[data-cdel]'))) { cats.generals.splice(+t.getAttribute('data-cdel'), 1); draw(); }
            else if ((t = e.target.closest('[data-sug]'))) { cats.generals.push({ name: t.getAttribute('data-sug'), colour: nextColour(), show: 'show' }); draw();
                if (!t.getAttribute('data-sug')) { var ins = box.querySelectorAll('[data-cname]'); if (ins.length) ins[ins.length - 1].focus(); } }
            else if ((t = e.target.closest('#csSaveCats'))) {
                if (cats.generals.concat(cats.groups).some(function (c) { return !String(c.name).trim(); })) { H.toast('Give every category and group a name (or remove it)', true); return; }
                if (colourCount() > CS.limits.key) { H.toast('The calendar can show up to ' + CS.limits.key + ' colours – group some in Other, or hide them', true); return; }
                applyMembers();
                var pc = {}; people.forEach(function (p) { pc[p.name] = p.colour; });
                H.act({ action: 'saveCalCats', groups: cats.groups, generals: cats.generals, peopleColours: pc, key: keyFromCats() }, 'Colour coding saved – the screen updates within a few minutes');
            }
            else if ((t = e.target.closest('#csScan'))) tidy();
        };
    }

    window.FDCalSetup = {
        render: function (el, id, hooks) {
            H = hooks; box = el; pageId = id; CS = (H.data() || {}).calSetup;
            if (!CS) { el.innerHTML = '<div class="cs-card"><h3>Colour coding</h3><p class="cs-warn">⚠ Your Google application needs updating before the calendar’s colour coding can be set up here. Go to <a href="#/advanced/updates">Advanced → Software updates</a> and press Update now, then come back to this page.</p></div>'; return; }
            cats = { groups: clone(CS.groups).map(function (g) { g.was = g.name; return g; }), generals: clone(CS.generals).map(function (g) { g.was = g.name; return g; }) };
            var key = (CS.keys || []).filter(function (k) { return k.page === id; })[0] || (CS.keys || [])[0] || { slots: [], lines: [], hide: [] };
            look = { other: key.other !== false };
            var st = function (n) { return key.slots.indexOf(n) >= 0 ? 'show' : key.hide.indexOf(n) >= 0 ? 'hide' : 'other'; };
            all().forEach(function (c) { c.show = st(c.name); c.line = c.show === 'show' && key.lines.indexOf(c.name) >= 0; });
            people = CS.people.map(function (p) {
                var g = cats.groups.filter(function (x) { return !x.fixed && x.members.indexOf(p.name) >= 0; })[0];
                return { name: p.name, colour: p.colour, display: key.slots.indexOf(p.name) >= 0 ? 'me' : key.hide.indexOf(p.name) >= 0 ? 'hide' : g ? 'g' + cats.groups.indexOf(g) : 'family' };
            });
            try { draw(); wire(); }
            catch (e) { el.innerHTML = '<div class="cs-card"><p class="cs-warn">⚠ The calendar set-up couldn’t be shown: ' + esc(e.message) + '. Try reloading the page; if it keeps happening, send a report from Advanced → About &amp; diagnostics.</p></div>'; }
        },
    };
})();
