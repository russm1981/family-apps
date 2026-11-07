/* Family Dashboard – more widgets (November 2026): holiday countdown, Weasley clock, bus stop, to-do (Google Tasks),
 * parcels, memo, quote, NASA picture of the day, Spotify and word of the day.
 * Same rules as widgets.js: FDW.types[type](el, widget, ctx) → { update(data), show(), destroy() }.
 */
(function () {
    'use strict';
    var U = window.FDW.util, T = window.FDW.types, pop = window.FDW.pop, closePop = window.FDW.closePop;
    var esc = U.esc, errBox = U.errBox, loading = U.loading, pad = U.pad, ymd = U.ymd, parseYmd = U.parseYmd, ago = U.ago, visible = U.visible;
    function api() { return window.FDApi; }
    function daysTo(ds) { return Math.round((parseYmd(ds) - parseYmd(ymd(new Date()))) / 86400000); }
    function niceDate(ds) { var d = parseYmd(ds); return U.DOW[d.getDay()] + ' ' + d.getDate() + ' ' + U.MON[d.getMonth()] + (d.getFullYear() !== new Date().getFullYear() ? ' ' + d.getFullYear() : ''); }
    /** Which item of a list to show now: changes every day, hour or 10 minutes, the same on every screen. */
    function pick(n, change, salt) {
        var now = new Date(), k = change === 'Every 10 minutes' ? Math.floor(now.getTime() / 600000) : change === 'Every hour' ? Math.floor(now.getTime() / 3600000)
            : Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86400000);
        return n ? ((k * 7919 + (salt || 0)) % n + n) % n : 0;
    }
    function post(body, done) {
        return api().post(body).then(function (r) { if (done) done(r); return r; })
            .catch(function (e) { api().toast('Didn’t save: ' + e.message, true); throw e; });
    }

    /* ===================================================== HOLIDAY COUNTDOWN */

    T.countdown = function (el, w) {
        var s = w.settings, data = null;
        el.innerHTML = '<div class="cd-body">' + loading() + '</div>';
        var body = el.querySelector('.cd-body');
        function render() {
            if (!data || data.error) { body.innerHTML = errBox(data ? data.error : 'No dates'); return; }
            var items = data.items.filter(function (x) { return daysTo(x.date) >= 0; });
            if (!items.length) { body.innerHTML = '<div class="empty">Nothing to count down to yet.<br>Add a Holiday to the calendar or a date in the admin app.</div>'; return; }
            var a = items[0], n = daysTo(a.date);
            var big = n === 0 ? '<b class="cd-num today">Today!</b>' : '<b class="cd-num">' + n + '</b><span class="cd-lbl">' + (n === 1 ? 'sleep to go' : n < 15 ? 'sleeps to go' : 'days to go') + '</span>';
            body.innerHTML = '<div class="cd-main" style="--cc:' + esc(a.colour || '#ffd54a') + '"><div class="cd-left">' + big + '</div>' +
                '<div class="cd-what"><span class="cd-ico">🏖️</span><b>' + esc(a.name) + '</b><span>' + esc(niceDate(a.date)) + '</span></div></div>' +
                '<div class="cd-next">' + items.slice(1, Math.max(1, s.Show || 3)).map(function (x) {
                    var d = daysTo(x.date);
                    return '<div class="cd-row"><i style="background:' + esc(x.colour || '#8a93a3') + '"></i><span>' + esc(x.name) + '</span><em>' + esc(niceDate(x.date)) + '</em><b>' + d + ' day' + (d === 1 ? '' : 's') + '</b></div>';
                }).join('') + '</div>';
        }
        var t = setInterval(function () { if (data) render(); }, 30 * 60000);
        return { update: function (d) { data = d; render(); }, destroy: function () { clearInterval(t); } };
    };

    /* ========================================================= WEASLEY CLOCK */

    /** "07:45" today, "Tue" this week, otherwise "3 Nov". */
    function since(iso) {
        var d = new Date(iso), now = new Date();
        if (ymd(d) === ymd(now)) return U.hhmm(d);
        return now - d < 6 * 86400000 ? U.DOW[d.getDay()] : d.getDate() + ' ' + U.MON[d.getMonth()];
    }
    T.whereabouts = function (el, w) {
        var data = null;
        el.innerHTML = '<div class="wc-face"></div><div class="wc-people">' + loading() + '</div>';
        var face = el.querySelector('.wc-face'), list = el.querySelector('.wc-people');
        function angle(i, n) { return -90 + (360 / n) * i; }       // degrees, place 0 at the top
        function render() {
            if (!data || data.error) { list.innerHTML = errBox(data ? data.error : 'No clock'); return; }
            var P = data.places, n = Math.max(P.length, 2), R = 100, svg = '';
            // dial: ring, ticks between places, place names around the edge
            svg += '<circle cx="0" cy="0" r="98" class="wc-ring"/><circle cx="0" cy="0" r="90" class="wc-dial"/>';
            P.forEach(function (name, i) {
                var a = (angle(i, n) + 180 / n) * Math.PI / 180;
                svg += '<line x1="' + (Math.cos(a) * 62).toFixed(1) + '" y1="' + (Math.sin(a) * 62).toFixed(1) + '" x2="' + (Math.cos(a) * 90).toFixed(1) + '" y2="' + (Math.sin(a) * 90).toFixed(1) + '" class="wc-tick"/>';
                var b = angle(i, n) * Math.PI / 180, x = Math.cos(b) * 76, y = Math.sin(b) * 76;
                svg += '<text x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" class="wc-place" text-anchor="middle" dominant-baseline="central">' + esc(name) + '</text>';
            });
            // hands: everyone at the same place fans out a little, longest first
            var at = {};
            data.people.forEach(function (p) { var i = P.indexOf(p.place); if (i < 0) i = P.length - 1; (at[i] = at[i] || []).push(p); });
            Object.keys(at).forEach(function (k) {
                var group = at[k], i = +k;
                group.forEach(function (p, j) {
                    var spread = (j - (group.length - 1) / 2) * Math.min(16, 60 / group.length);
                    var a = (angle(i, n) + spread) * Math.PI / 180, len = 60 - j * 9;
                    var x = Math.cos(a) * len, y = Math.sin(a) * len;
                    svg += '<g class="wc-hand" style="--hc:' + esc(p.colour) + '"><line x1="0" y1="0" x2="' + x.toFixed(1) + '" y2="' + y.toFixed(1) + '"/>' +
                        '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="7.5"/><text x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" text-anchor="middle" dominant-baseline="central">' + esc(p.name.charAt(0)) + '</text></g>';
                });
            });
            svg += '<circle cx="0" cy="0" r="5" class="wc-pin"/>';
            face.innerHTML = '<svg viewBox="-' + R + ' -' + R + ' ' + 2 * R + ' ' + 2 * R + '">' + svg + '</svg>';
            list.innerHTML = data.people.map(function (p, i) {
                return '<button class="wc-p" data-i="' + i + '" style="--hc:' + esc(p.colour) + '"><i>' + esc(p.name.charAt(0)) + '</i><span><b>' + esc(p.name) + '</b><small>' +
                    esc(p.place || 'not set') + (p.since ? ' · ' + esc(since(p.since)) : '') + '</small></span></button>';
            }).join('');
        }
        list.addEventListener('click', function (e) {
            var b = e.target.closest('[data-i]'); if (!b || !data) return;
            var p = data.people[+b.getAttribute('data-i')];
            pop('Where is ' + p.name + '?', '<div class="wc-pick">' + data.places.map(function (pl) {
                return '<button class="' + (pl === p.place ? 'on' : '') + '" data-pl="' + esc(pl) + '">' + esc(pl) + '</button>';
            }).join('') + '</div><p class="foot">Phones can move the hands automatically too – see the instructions.</p>', function (ev) {
                var x = ev.target.closest('[data-pl]'); if (!x) return;
                closePop();
                p.place = x.getAttribute('data-pl'); p.since = new Date().toISOString(); render();
                post({ action: 'where', person: p.name, place: p.place, how: 'screen' }, function (r) { data = r.data; render(); });
            });
        });
        return { update: function (d) { data = d; render(); } };
    };

    /* ============================================================== BUS STOP */

    T.bus = function (el, w) {
        var rows = w.settings.Rows || 4;
        el.innerHTML = '<div class="bs-head"><h3 class="bs-title">Buses</h3><span class="foot bs-upd"></span></div><div class="bs-list">' + loading() + '</div><div class="foot bs-note"></div>';
        var box = el.querySelector('.bs-list');
        return {
            update: function (d) {
                if (!d || d.error) { box.innerHTML = errBox(d ? d.error : 'No bus data'); return; }
                el.querySelector('.bs-title').innerHTML = '🚌 ' + esc(d.stop || 'Bus stop');
                el.querySelector('.bs-upd').textContent = d.updated ? 'updated ' + d.updated : U.hhmm(new Date());
                el.querySelector('.bs-note').textContent = d.note || '';
                // Hide buses that have already gone (times kept from an earlier update).
                var nowT = U.hhmm(new Date()), today = ymd(new Date());
                var list = d.departures.filter(function (x) { return !/^\d\d:\d\d$/.test(x.time) || (x.date || today) > today || x.time >= nowT; });
                box.innerHTML = list.slice(0, rows).map(function (x) {
                    var late = x.live && x.aimed && x.time > x.aimed;
                    return '<div class="bs-row"><span class="bs-svc">' + esc(x.service) + '</span><span class="bs-dest">' + esc(x.dest) + '</span>' +
                        '<span class="bs-time' + (x.live ? ' live' : '') + (late ? ' late' : '') + '">' + (x.live ? '<i></i>' : '') + esc(x.time) +
                        (late ? '<s>' + esc(x.aimed) + '</s>' : '') + '</span></div>';
                }).join('') || '<div class="empty">No buses due from this stop soon</div>';
            },
        };
    };

    /* ========================================================= TO-DO (TASKS) */

    T.todo = function (el, w) {
        var s = w.settings, full = w.size === 'full', data = null, busy = false;
        el.innerHTML = '<div class="ls-head"><h3 class="ls-title">' + esc(s.Title || 'To do') + '</h3><span class="ls-count"></span>' +
            (s.AddOnScreen ? '<button class="ls-btn" data-l="add">+ Add</button>' : '') + '</div><div class="td-items">' + loading() + '</div>';
        var box = el.querySelector('.td-items');
        function due(i) {
            if (!i.due) return '';
            var n = daysTo(i.due);
            var t = n < 0 ? (n === -1 ? 'Yesterday' : -n + ' days late') : n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : n < 7 ? U.DAYNAME[parseYmd(i.due).getDay()] : niceDate(i.due);
            return '<em class="td-due ' + (n < 0 ? 'late' : n === 0 ? 'now' : '') + '">' + esc(t) + '</em>';
        }
        function row(i) {
            return '<button class="td-it' + (i.done ? ' done' : '') + '" data-l="toggle" data-id="' + esc(i.id) + '"><span class="box"></span>' +
                '<span class="td-tx"><span>' + esc(i.text) + '</span>' + (i.notes && full ? '<small>' + esc(i.notes) + '</small>' : '') + '</span>' + (i.done ? '' : due(i)) + '</button>';
        }
        function shown() { return (data && data.items || []).filter(function (i) { return s.ShowTicked || !i.done; }); }
        function render() {
            if (!data || data.error) { box.innerHTML = errBox(data ? data.error : 'No tasks'); return; }
            var all = shown(), left = data.items.filter(function (i) { return !i.done; }).length;
            var late = data.items.filter(function (i) { return !i.done && i.due && daysTo(i.due) < 0; }).length;
            el.querySelector('.ls-count').innerHTML = left ? left + ' to do' + (late ? ' · <b class="late">' + late + ' late</b>' : '') : 'All done 🎉';
            var fit = full ? 9 : 4, cut = all.length > fit ? fit - 1 : all.length;
            var ticked = data.items.length - left;
            box.innerHTML = all.length ? all.slice(0, cut).map(row).join('') +
                (all.length > cut ? '<button class="ls-more" data-l="all">+' + (all.length - cut) + ' more ›››</button>' : '') +
                (ticked && s.ShowTicked && all.length <= cut ? '<button class="ls-clear" data-l="clear">Clear ticked (' + ticked + ')</button>' : '')
                : '<div class="empty">Nothing to do 🎉</div>';
        }
        function send(b) {
            if (busy) return; busy = true;
            b.action = 'listItem'; b.widget = w.id;
            post(b, function (r) { data = r.data; render(); if (popAll && document.getElementById('pop').classList.contains('on')) openAll(); })
                .catch(function () {}).finally(function () { busy = false; });
        }
        var popAll = false;
        function openAll() {
            popAll = true;
            pop(s.Title || 'To do', '<div class="td-all">' + shown().map(row).join('') + '</div>', click);
        }
        function openAdd() {
            popAll = false;
            pop('Add to ' + (s.Title || 'To do'), '<div class="ls-add"><input class="ls-in" maxlength="60" placeholder="e.g. Book the dentist" autocomplete="off"><button class="ls-btn big" data-l="save">Add</button></div>' +
                '<p class="foot">This goes into Google Tasks, so it also shows in Gmail, Google Calendar and the Google Tasks app.</p>', click);
            var inp = document.querySelector('#popBody .ls-in');
            inp.focus(); inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') save(); });
        }
        function save() {
            var inp = document.querySelector('#popBody .ls-in'); if (!inp || !inp.value.trim()) return;
            var t = inp.value.trim(); inp.value = '';
            api().toast('Added “' + t + '”'); send({ op: 'add', text: t });
        }
        function click(e) {
            var b = e.target.closest('[data-l]'); if (!b || !data) return;
            var a = b.getAttribute('data-l');
            if (a === 'toggle') {
                var it = data.items.filter(function (i) { return i.id === b.getAttribute('data-id'); })[0];
                if (it) { it.done = !it.done; b.classList.toggle('done', it.done); setTimeout(render, 0); }
                send({ op: 'toggle', id: b.getAttribute('data-id') });
            } else if (a === 'all') openAll();
            else if (a === 'add') openAdd();
            else if (a === 'save') save();
            else if (a === 'clear') { send({ op: 'clearDone' }); if (popAll) closePop(); }
        }
        el.addEventListener('click', click);
        return { update: function (d) { if (!busy) { data = d; render(); } } };
    };

    /* =============================================================== PARCELS */

    var PARCEL = { 'Arriving today': ['today', '🚚'], 'Missed delivery': ['missed', '⚠️'], 'Arriving tomorrow': ['tomorrow', '📅'],
        'On its way': ['way', '📦'], 'Delivered': ['done', '✅'] };
    T.parcels = function (el, w) {
        var full = w.size === 'full';
        el.innerHTML = '<div class="pc-head"><h3>Parcels</h3><span class="foot pc-sum"></span></div><div class="pc-list">' + loading() + '</div>';
        var box = el.querySelector('.pc-list');
        return {
            update: function (d) {
                if (!d || d.error) { box.innerHTML = errBox(d ? d.error : 'No parcel data'); return; }
                var today = d.items.filter(function (x) { return x.status === 'Arriving today'; }).length;
                el.querySelector('.pc-sum').textContent = today ? today + ' arriving today' : '';
                box.innerHTML = d.items.slice(0, full ? 9 : 4).map(function (x) {
                    var k = PARCEL[x.status] || ['way', '📦'];
                    return '<div class="pc-row ' + k[0] + '"><span class="pc-ico">' + k[1] + '</span><span class="pc-main"><b>' + esc(x.who) + ' <em>' + esc(x.status) + '</em></b>' +
                        '<small>' + esc(x.what) + '</small></span><span class="pc-when">' + esc(ago(x.at)) + '</span></div>';
                }).join('') || '<div class="empty">No deliveries on the way</div>';
            },
        };
    };

    /* ================================================================= MEMO */

    var NOTE_COLOURS = ['#ffe58a', '#ffc2d4', '#b9e6ff', '#c8f2b5', '#e3d1ff'];
    T.memo = function (el, w) {
        var s = w.settings, full = w.size === 'full', data = null;
        el.innerHTML = '<div class="mm-head"><h3>Notes</h3>' + (s.AddOnScreen ? '<button class="ls-btn" data-m="add">+ Note</button>' : '') + '</div><div class="mm-notes">' + loading() + '</div>';
        var box = el.querySelector('.mm-notes');
        function render() {
            if (!data || data.error) { box.innerHTML = errBox(data ? data.error : 'No notes'); return; }
            var fit = full ? 6 : 4, items = data.items, cut = items.length > fit ? fit - 1 : items.length;
            box.innerHTML = items.length ? items.slice(0, cut).map(function (m, i) {
                return '<button class="mm-note" data-m="open" data-id="' + esc(m.id) + '" style="--nc:' + NOTE_COLOURS[i % NOTE_COLOURS.length] + ';--rot:' + ((i % 3) - 1) * 1.2 + 'deg">' +
                    '<span class="mm-tx">' + esc(m.text) + '</span><small>' + (m.from ? '— ' + esc(m.from) + ', ' : '') + esc(ago(m.at)) + '</small></button>';
            }).join('') + (items.length > cut ? '<button class="mm-note more" data-m="all">+' + (items.length - cut) + ' more</button>' : '')
                : '<div class="empty">No notes. Add one from the Family Admin app' + (s.AddOnScreen ? ' or tap + Note' : '') + '.</div>';
        }
        function click(e) {
            var b = e.target.closest('[data-m]'); if (!b || !data) return;
            var a = b.getAttribute('data-m');
            if (a === 'open') {
                var m = data.items.filter(function (x) { return x.id === b.getAttribute('data-id'); })[0]; if (!m) return;
                pop('Note', '<p class="mm-big">' + esc(m.text) + '</p><p class="foot">' + (m.from ? 'From ' + esc(m.from) + ' · ' : '') + esc(ago(m.at)) + '</p>' +
                    '<button class="ls-btn big danger" data-m="remove" data-id="' + esc(m.id) + '">Remove this note</button>', click);
            } else if (a === 'remove') {
                closePop();
                var id = b.getAttribute('data-id');
                data.items = data.items.filter(function (x) { return x.id !== id; }); render();
                post({ action: 'memo', op: 'remove', id: id }, function (r) { data = r.data; render(); }).catch(function () {});
            } else if (a === 'all') {
                pop('Notes', '<div class="mm-notes all">' + data.items.map(function (m, i) {
                    return '<button class="mm-note" data-m="open" data-id="' + esc(m.id) + '" style="--nc:' + NOTE_COLOURS[i % NOTE_COLOURS.length] + ';--rot:0deg"><span class="mm-tx">' + esc(m.text) + '</span><small>' +
                        (m.from ? '— ' + esc(m.from) + ', ' : '') + esc(ago(m.at)) + '</small></button>';
                }).join('') + '</div>', click);
            } else if (a === 'add') {
                pop('New note', '<div class="ls-add"><input class="ls-in mm-in" maxlength="80" placeholder="e.g. Dentist moved to Thursday" autocomplete="off"></div>' +
                    '<div class="ls-add"><input class="ls-in mm-from" maxlength="12" placeholder="From (optional)" autocomplete="off"><button class="ls-btn big" data-m="save">Add note</button></div>', click);
                document.querySelector('#popBody .mm-in').focus();
            } else if (a === 'save') {
                var t = document.querySelector('#popBody .mm-in').value.trim(), f = document.querySelector('#popBody .mm-from').value.trim();
                if (!t) return;
                closePop();
                post({ action: 'memo', op: 'add', text: t, from: f }, function (r) { data = r.data; render(); }).catch(function () {});
            }
        }
        el.addEventListener('click', click);
        var t = setInterval(function () { if (data) render(); }, 10 * 60000);
        return { update: function (d) { data = d; render(); }, destroy: function () { clearInterval(t); } };
    };

    /* ================================================================ QUOTE */

    var QUOTES = [
        ['It always seems impossible until it’s done.', 'Nelson Mandela'], ['Believe you can and you’re halfway there.', 'Theodore Roosevelt'],
        ['Do what you can, with what you have, where you are.', 'Theodore Roosevelt'], ['No act of kindness, no matter how small, is ever wasted.', 'Aesop'],
        ['Slow and steady wins the race.', 'Aesop'], ['It does not matter how slowly you go as long as you do not stop.', 'Confucius'],
        ['A journey of a thousand miles begins with a single step.', 'Lao Tzu'], ['Mistakes are proof that you are trying.', 'Anonymous'],
        ['Every expert was once a beginner.', 'Anonymous'], ['Be kind whenever possible. It is always possible.', 'Dalai Lama'],
        ['Whether you think you can, or you think you can’t – you’re right.', 'Henry Ford'], ['Try to be a rainbow in someone’s cloud.', 'Maya Angelou'],
        ['If you want to lift yourself up, lift up someone else.', 'Booker T. Washington'], ['Act as if what you do makes a difference. It does.', 'William James'],
        ['Well done is better than well said.', 'Benjamin Franklin'], ['Hard work beats talent when talent doesn’t work hard.', 'Tim Notke'],
        ['Fall seven times, stand up eight.', 'Japanese proverb'], ['Little by little, a little becomes a lot.', 'Tanzanian proverb'],
        ['Kindness is free. Sprinkle it everywhere.', 'Anonymous'], ['What you do today can improve all your tomorrows.', 'Ralph Marston'],
        ['Strive for progress, not perfection.', 'Anonymous'], ['You can’t use up creativity. The more you use, the more you have.', 'Maya Angelou'],
        ['Start where you are. Use what you have. Do what you can.', 'Arthur Ashe'], ['The expert in anything was once a beginner.', 'Helen Hayes'],
        ['It’s not whether you get knocked down, it’s whether you get up.', 'Vince Lombardi'], ['Keep your face always toward the sunshine, and shadows will fall behind you.', 'Walt Whitman'],
        ['Happiness is not by chance, but by choice.', 'Jim Rohn'], ['The secret of getting ahead is getting started.', 'Mark Twain'],
        ['You miss 100% of the shots you don’t take.', 'Wayne Gretzky'], ['In the middle of every difficulty lies opportunity.', 'Albert Einstein'],
        ['Be yourself; everyone else is already taken.', 'Oscar Wilde'], ['Great things never came from comfort zones.', 'Anonymous'],
        ['Dream big and dare to fail.', 'Norman Vaughan'], ['Teamwork makes the dream work.', 'John C. Maxwell'],
        ['Do your best and forget the rest.', 'Tony Horton'], ['The best way to predict the future is to create it.', 'Peter Drucker'],
        ['Practice makes progress.', 'Proverb'], ['Be the reason someone smiles today.', 'Anonymous'],
        ['Don’t watch the clock; do what it does. Keep going.', 'Sam Levenson'], ['Tough times never last, but tough people do.', 'Robert H. Schuller'],
    ];
    T.quote = function (el, w) {
        var s = w.settings, online = null;
        el.innerHTML = '<div class="qt-mark">“</div><blockquote class="qt-text"></blockquote><div class="qt-by"></div><div class="qt-credit foot"></div>';
        function render() {
            var list = online && online.quotes && online.quotes.length ? online.quotes.map(function (x) { return [x.q, x.a]; }) : QUOTES;
            var q = list[pick(list.length, s.Change, 3)];
            var t = el.querySelector('.qt-text');
            t.textContent = q[0];
            t.className = 'qt-text' + (q[0].length > 90 ? ' long' : q[0].length < 45 ? ' short' : '');
            el.querySelector('.qt-by').textContent = '— ' + q[1];
            el.querySelector('.qt-credit').textContent = online && online.credit ? online.credit : '';
        }
        render();
        var t = setInterval(render, 60000);
        return { update: function (d) { online = d && !d.error ? d : null; render(); }, destroy: function () { clearInterval(t); } };
    };

    /* ================================================= NASA PICTURE OF THE DAY */

    T.apod = function (el, w) {
        var s = w.settings, data = null;
        el.innerHTML = '<div class="ap-stage"><img class="ap-img" alt="" referrerpolicy="no-referrer"></div><div class="ap-tag">🔭 NASA picture of the day</div>' +
            '<div class="ap-cap"></div><div class="ap-msg">' + loading() + '</div>';
        var img = el.querySelector('.ap-img'), cap = el.querySelector('.ap-cap'), msg = el.querySelector('.ap-msg');
        img.onload = function () { img.classList.add('on'); };
        el.addEventListener('click', function () {
            if (!data || data.error) return;
            pop(data.title, '<img class="pop-img" src="' + esc(data.img) + '" alt="" referrerpolicy="no-referrer"><p class="pop-p">' + esc(data.text) + '</p>' +
                '<p class="foot">' + esc(data.date) + ' · ' + esc(data.credit) + (data.video ? ' · today’s is a video – this is a still from it' : '') + '</p>');
        });
        return {
            update: function (d) {
                data = d;
                if (!d || d.error) { msg.innerHTML = errBox(d ? d.error : 'No picture'); msg.style.display = ''; return; }
                msg.style.display = 'none';
                if (img.getAttribute('src') !== d.img) { img.classList.remove('on'); img.src = d.img; }
                cap.style.display = s.ShowText ? '' : 'none';
                cap.innerHTML = '<b>' + esc(d.title) + '</b><span>' + esc(d.credit) + ' · tap to read about it</span>';
            },
        };
    };

    /* ============================================================== SPOTIFY */

    function mmss(ms) { var t = Math.max(0, Math.round(ms / 1000)); return Math.floor(t / 60) + ':' + pad(t % 60); }
    T.spotify = function (el, w) {
        var data = null, base = 0, busy = false;
        el.innerHTML = '<div class="sp-body">' + loading() + '</div>';
        var body = el.querySelector('.sp-body');
        function render() {
            if (!data || data.error) { body.innerHTML = errBox(data ? data.error : 'No Spotify'); return; }
            if (data.needLogin) {
                body.innerHTML = '<div class="sp-msg"><span class="sp-logo">♫</span><b>Connect Spotify</b><span>' + (data.hasClient ? 'Open the Family Admin app → Widgets → Spotify → Connect Spotify.'
                    : 'Add your Spotify app keys on the Installation tab, then connect from the Spotify widget in the admin app.') + '</span></div>';
                return;
            }
            if (data.idle || !data.track) { body.innerHTML = '<div class="sp-msg"><span class="sp-logo">♫</span><b>Nothing playing</b><span>Start Spotify on a phone, speaker or this PC.</span></div>'; return; }
            body.innerHTML = '<div class="sp-art"' + (data.art ? ' style="background-image:url(\'' + esc(data.art).replace(/'/g, '%27') + '\')"' : '') + '></div>' +
                '<div class="sp-info"><b class="sp-track">' + esc(data.track) + '</b><span class="sp-artist">' + esc(data.artists) + '</span>' +
                '<span class="sp-dev">' + (data.device ? '🔊 ' + esc(data.device) : '') + '</span>' +
                '<div class="sp-prog"><span class="sp-t1"></span><div class="sp-bar"><i></i></div><span class="sp-t2">' + mmss(data.duration) + '</span></div>' +
                '<div class="sp-ctl"><button data-sp="previous" aria-label="Previous">⏮</button><button class="main" data-sp="' + (data.playing ? 'pause' : 'play') + '">' + (data.playing ? '⏸' : '▶') + '</button>' +
                '<button data-sp="next" aria-label="Next">⏭</button></div></div>';
            tick();
        }
        function tick() {
            if (!data || !data.track || !el.querySelector('.sp-bar')) return;
            var p = Math.min(data.duration, data.progress + (data.playing ? Date.now() - base : 0));
            el.querySelector('.sp-bar i').style.width = (data.duration ? p / data.duration * 100 : 0) + '%';
            el.querySelector('.sp-t1').textContent = mmss(p);
        }
        el.addEventListener('click', function (e) {
            var b = e.target.closest('[data-sp]'); if (!b || busy) return;
            busy = true; b.disabled = true;
            post({ action: 'spotify', op: b.getAttribute('data-sp') }, function (r) { update(r.data); }).catch(function () {}).finally(function () { busy = false; });
        });
        function update(d) { data = d; base = Date.now(); render(); }
        var t = setInterval(tick, 1000);
        var poll = setInterval(function () {
            if (!visible(el) || !api().ready() || busy) return;
            api().get('widget', { id: w.id }).then(function (r) { update(r.data); }).catch(function () {});
        }, 10000);
        return { update: update, destroy: function () { clearInterval(t); clearInterval(poll); } };
    };

    /* ======================================================== WORD OF THE DAY */

    var LANG = { Spanish: [1, '🇪🇸'], French: [2, '🇫🇷'], German: [3, '🇩🇪'], Italian: [4, '🇮🇹'] };
    var WORDS = [ // emoji, English, Spanish, French, German, Italian
        ['🐶', 'dog', 'el perro', 'le chien', 'der Hund', 'il cane'], ['🐱', 'cat', 'el gato', 'le chat', 'die Katze', 'il gatto'],
        ['🏠', 'house', 'la casa', 'la maison', 'das Haus', 'la casa'], ['🍎', 'apple', 'la manzana', 'la pomme', 'der Apfel', 'la mela'],
        ['🍞', 'bread', 'el pan', 'le pain', 'das Brot', 'il pane'], ['💧', 'water', 'el agua', 'l’eau', 'das Wasser', 'l’acqua'],
        ['🥛', 'milk', 'la leche', 'le lait', 'die Milch', 'il latte'], ['🧀', 'cheese', 'el queso', 'le fromage', 'der Käse', 'il formaggio'],
        ['🍌', 'banana', 'el plátano', 'la banane', 'die Banane', 'la banana'], ['🍓', 'strawberry', 'la fresa', 'la fraise', 'die Erdbeere', 'la fragola'],
        ['☀️', 'sun', 'el sol', 'le soleil', 'die Sonne', 'il sole'], ['🌙', 'moon', 'la luna', 'la lune', 'der Mond', 'la luna'],
        ['⭐', 'star', 'la estrella', 'l’étoile', 'der Stern', 'la stella'], ['🌧️', 'rain', 'la lluvia', 'la pluie', 'der Regen', 'la pioggia'],
        ['❄️', 'snow', 'la nieve', 'la neige', 'der Schnee', 'la neve'], ['🌳', 'tree', 'el árbol', 'l’arbre', 'der Baum', 'l’albero'],
        ['🌸', 'flower', 'la flor', 'la fleur', 'die Blume', 'il fiore'], ['🐟', 'fish', 'el pez', 'le poisson', 'der Fisch', 'il pesce'],
        ['🐦', 'bird', 'el pájaro', 'l’oiseau', 'der Vogel', 'l’uccello'], ['🐴', 'horse', 'el caballo', 'le cheval', 'das Pferd', 'il cavallo'],
        ['🐮', 'cow', 'la vaca', 'la vache', 'die Kuh', 'la mucca'], ['🐷', 'pig', 'el cerdo', 'le cochon', 'das Schwein', 'il maiale'],
        ['🐑', 'sheep', 'la oveja', 'le mouton', 'das Schaf', 'la pecora'], ['🦁', 'lion', 'el león', 'le lion', 'der Löwe', 'il leone'],
        ['🐘', 'elephant', 'el elefante', 'l’éléphant', 'der Elefant', 'l’elefante'], ['🚗', 'car', 'el coche', 'la voiture', 'das Auto', 'la macchina'],
        ['🚌', 'bus', 'el autobús', 'le bus', 'der Bus', 'l’autobus'], ['🚂', 'train', 'el tren', 'le train', 'der Zug', 'il treno'],
        ['✈️', 'plane', 'el avión', 'l’avion', 'das Flugzeug', 'l’aereo'], ['🚲', 'bike', 'la bicicleta', 'le vélo', 'das Fahrrad', 'la bicicletta'],
        ['📚', 'book', 'el libro', 'le livre', 'das Buch', 'il libro'], ['✏️', 'pencil', 'el lápiz', 'le crayon', 'der Bleistift', 'la matita'],
        ['🏫', 'school', 'la escuela', 'l’école', 'die Schule', 'la scuola'], ['⚽', 'football', 'el fútbol', 'le football', 'der Fußball', 'il calcio'],
        ['🥁', 'drum', 'el tambor', 'le tambour', 'die Trommel', 'il tamburo'], ['🎂', 'cake', 'la tarta', 'le gâteau', 'der Kuchen', 'la torta'],
        ['🎁', 'present', 'el regalo', 'le cadeau', 'das Geschenk', 'il regalo'], ['👟', 'shoes', 'los zapatos', 'les chaussures', 'die Schuhe', 'le scarpe'],
        ['🧦', 'socks', 'los calcetines', 'les chaussettes', 'die Socken', 'i calzini'], ['🛏️', 'bed', 'la cama', 'le lit', 'das Bett', 'il letto'],
        ['🚪', 'door', 'la puerta', 'la porte', 'die Tür', 'la porta'], ['🥕', 'carrot', 'la zanahoria', 'la carotte', 'die Karotte', 'la carota'],
        ['🥚', 'egg', 'el huevo', 'l’œuf', 'das Ei', 'l’uovo'], ['🍦', 'ice cream', 'el helado', 'la glace', 'das Eis', 'il gelato'],
        ['🌊', 'sea', 'el mar', 'la mer', 'das Meer', 'il mare'], ['🏖️', 'beach', 'la playa', 'la plage', 'der Strand', 'la spiaggia'],
        ['⛰️', 'mountain', 'la montaña', 'la montagne', 'der Berg', 'la montagna'], ['👋', 'hello', 'hola', 'bonjour', 'hallo', 'ciao'],
        ['🙏', 'please', 'por favor', 's’il vous plaît', 'bitte', 'per favore'], ['😊', 'thank you', 'gracias', 'merci', 'danke', 'grazie'],
        ['👍', 'yes', 'sí', 'oui', 'ja', 'sì'], ['👎', 'no', 'no', 'non', 'nein', 'no'],
        ['🌅', 'good morning', 'buenos días', 'bonjour', 'guten Morgen', 'buongiorno'], ['🌃', 'good night', 'buenas noches', 'bonne nuit', 'gute Nacht', 'buonanotte'],
        ['❤️', 'love', 'el amor', 'l’amour', 'die Liebe', 'l’amore'], ['👪', 'family', 'la familia', 'la famille', 'die Familie', 'la famiglia'],
        ['👦', 'brother', 'el hermano', 'le frère', 'der Bruder', 'il fratello'], ['🔴', 'red', 'rojo', 'rouge', 'rot', 'rosso'],
        ['🔵', 'blue', 'azul', 'bleu', 'blau', 'blu'], ['🟢', 'green', 'verde', 'vert', 'grün', 'verde'],
        ['🟡', 'yellow', 'amarillo', 'jaune', 'gelb', 'giallo'], ['3️⃣', 'three', 'tres', 'trois', 'drei', 'tre'],
        ['🔟', 'ten', 'diez', 'dix', 'zehn', 'dieci'], ['😀', 'happy', 'feliz', 'heureux', 'glücklich', 'felice'],
        ['😴', 'tired', 'cansado', 'fatigué', 'müde', 'stanco'], ['🍽️', 'I’m hungry', 'tengo hambre', 'j’ai faim', 'ich habe Hunger', 'ho fame'],
        ['⏰', 'What time is it?', '¿Qué hora es?', 'Quelle heure est-il ?', 'Wie spät ist es?', 'Che ore sono?'],
    ];
    T.words = function (el, w) {
        var s = w.settings, L = LANG[s.Language] || LANG.Spanish, duo = null;
        el.innerHTML = '<div class="wd-head"><h3>' + L[1] + ' ' + esc(s.Language || 'Spanish') + ' word</h3></div><div class="wd-body"></div><div class="wd-duo"></div>';
        function render() {
            var x = WORDS[pick(WORDS.length, s.Change, 11)];
            el.querySelector('.wd-body').innerHTML = '<span class="wd-emoji">' + x[0] + '</span><div class="wd-words"><b class="wd-word">' + esc(x[L[0] + 1]) + '</b>' +
                '<span class="wd-en">' + esc(x[1]) + '</span></div>';
            el.querySelector('.wd-duo').innerHTML = duo && duo.users ? duo.users.map(function (u) {
                // Like MMM-Duolingo-Streak: fire if today's lesson is done, cold face if not yet.
                var done = u.endDate && u.endDate >= ymd(new Date());
                return '<span class="wd-u' + (u.error ? ' off' : done ? '' : ' cold') + '">' + (u.error ? esc(u.name) + ' \u2013 ' + esc(u.error)
                    : (done ? '\uD83D\uDD25' : '\uD83E\uDD76') + ' <b>' + u.streak + '</b> ' + esc(u.name) + (done ? '' : ' <small>not done today</small>')) + '</span>';
            }).join('') : '';
        }
        render();
        var t = setInterval(render, 60000);
        return { update: function (d) { duo = d && !d.error ? d : null; render(); }, destroy: function () { clearInterval(t); } };
    };
})();
