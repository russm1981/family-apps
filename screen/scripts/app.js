/* Family Dashboard – XENEON EDGE
 * Start-up, talking to the Google Sheet, and the Boys page (points, tasks, morning to-dos, reminders).
 * Widget pages are in pages.js / widgets.js, the Calendar page in screens.js.
 * Data lives in a Google Sheet behind an Apps Script web app (see apps-script/Code.gs).
 */
(function () {
    'use strict';

    var POLL_MS = 60 * 1000;
    var ARM_MS = 3000;      // second tap must come within this window
    var UNDO_MS = 10000;    // how long the Undo button stays up
    var CACHE_KEY = 'familyDashboard.state.v1';

    var state = null;
    var cfg = { url: '', code: '' };
    var pollTimer = null;
    var armed = null;       // { key, timer }
    var busy = false;
    var undoId = null, toastTimer = null;

    var $ = function (id) { return document.getElementById(id); };
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    function store(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } }
    function load(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }

    /* ---------------------------------------------------------- config */

    /**
     * Which family's Google Sheet this screen talks to. It arrives once in the screen link
     * (…/screen/#api=…&code=…, from the setup app or the start file), is kept on this device, and is then
     * removed from the address bar. Older start files put it in ?api=…&code=… – that still works.
     */
    var CFG_KEY = 'familyDashboard.cfg.v1';
    function fromLink(text) {
        var t = String(text || '').trim(), i = t.search(/[#?]/), out = {};
        if (i < 0) return out;
        t.slice(i + 1).split(/[&#?]/).forEach(function (kv) {
            var p = kv.split('='); if (p.length < 2) return;
            try { out[p[0]] = decodeURIComponent(p.slice(1).join('=').replace(/\+/g, ' ')); } catch (e) { /* skip */ }
        });
        return out;
    }
    function readConfig() {
        var link = fromLink(location.href), saved = {};
        try { saved = JSON.parse(load(CFG_KEY) || '{}') || {}; } catch (e) { saved = {}; }
        // A link that was mangled on the way (e.g. by an old start file) isn't used: the screen asks to be connected instead.
        if (saved.url && !/^https?:\/\/[^/]+\//.test(saved.url)) saved = {};
        if (link.api && link.code && /^https?:\/\/[^/]+\//.test(link.api)) {
            saved = { url: link.api, code: link.code };
            store(CFG_KEY, JSON.stringify(saved));
            if (/#/.test(location.href) && history.replaceState) history.replaceState(null, '', location.pathname + location.search.replace(/([?&])(api|code)=[^&]*/g, '$1').replace(/[?&]+$/, ''));
        }
        var url = (typeof apiUrl !== 'undefined' && apiUrl) || saved.url || '';
        var code = (typeof accessCode !== 'undefined' && accessCode) || saved.code || '';
        var changed = url !== cfg.url || code !== cfg.code;
        cfg.url = String(url).trim();
        cfg.code = String(code).trim();
        return changed;
    }

    /* ------------------------------------------------------------- api */

    function apiGet() {
        var u = cfg.url + (cfg.url.indexOf('?') >= 0 ? '&' : '?') +
            'action=state&code=' + encodeURIComponent(cfg.code) + '&t=' + Date.now();
        return fetchJson(u, { method: 'GET' });
    }
    function apiPost(body) {
        body.code = cfg.code;
        // text/plain keeps this a "simple" request – no CORS preflight, which Apps Script can't answer.
        return fetchJson(cfg.url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) });
    }
    function fetchJson(url, opts) {
        var ctl = new AbortController();
        var t = setTimeout(function () { ctl.abort(); }, opts.timeout || 20000);
        opts.signal = ctl.signal; opts.cache = 'no-store'; opts.redirect = 'follow';
        return fetch(url, opts).then(function (r) {
            if (!r.ok) throw new Error('Server said ' + r.status);
            return r.text().then(function (txt) {
                try { return JSON.parse(txt); } catch (e) { throw new Error('The Google script sent back an error page instead of data – it may need approving again (in the Sheet: Extensions → Apps Script → Run setup)'); }
            });
        }, function (e) {
            if (e && e.name === 'AbortError') throw new Error('No answer from the Google script for 20 seconds');
            if (navigator.onLine === false) throw new Error('This PC is offline – check its Wi-Fi or network cable');
            // A Google error page (e.g. "authorisation required", or Google having a problem) has no CORS headers, so the browser
            // just says "Failed to fetch". Ask again without needing the headers: if that gets through, Google is answering –
            // just not with data; if it doesn't, this PC can't reach Google at all.
            var c2 = new AbortController(), t2 = setTimeout(function () { c2.abort(); }, 10000);
            return fetch(url, { method: 'GET', mode: 'no-cors', cache: 'no-store', signal: c2.signal }).then(function () {
                throw new Error('Google answered, but with an error instead of data – the Google script may have stopped or need approving again. Open Family Admin on your phone: if it works there, it’s this PC (try restarting the browser)');
            }, function () {
                throw new Error('This PC can’t reach Google at all – check its internet connection (other websites, Wi-Fi), or restart the PC');
            }).finally(function () { clearTimeout(t2); });
        }).then(function (d) {
            // The dashboard has moved to a new Sheet ("Start afresh"): remember the new address and ask again there.
            if (d && d.moved && /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(d.moved) && url.indexOf(cfg.url) === 0 && !opts.moved) {
                var old = cfg.url; cfg.url = d.moved;
                store(CFG_KEY, JSON.stringify({ url: cfg.url, code: cfg.code }));
                opts.moved = true;
                return fetchJson(d.moved + url.slice(old.length), opts);
            }
            if (d && d.ok === false) throw new Error(d.error || 'Request failed');
            return d;
        }).finally(function () { clearTimeout(t); });
    }

    // Shared with screens.js (Home and Calendar screens).
    window.FDApi = {
        ready: function () { return !!(cfg.url && cfg.code); },
        config: function () { return { url: cfg.url, code: cfg.code }; },
        /** Connect this screen with a pasted screen/setup link. */
        connect: function (text) {
            var l = fromLink(text);
            if (!l.api || !l.code) return false;
            store(CFG_KEY, JSON.stringify({ url: l.api, code: l.code }));
            location.replace(location.pathname);
            return true;
        },
        forget: function () { try { localStorage.removeItem(CFG_KEY); } catch (e) { /* ignore */ } location.replace(location.pathname); },
        get: function (action, params, timeout) {
            var q = 'action=' + encodeURIComponent(action) + '&code=' + encodeURIComponent(cfg.code) + '&t=' + Date.now();
            Object.keys(params || {}).forEach(function (k) { q += '&' + k + '=' + encodeURIComponent(params[k]); });
            return fetchJson(cfg.url + (cfg.url.indexOf('?') >= 0 ? '&' : '?') + q, { method: 'GET', timeout: timeout });
        },
        post: function (body) { return apiPost(body); },
        sync: function (kind, msg) { setSync(kind, msg); },
        toast: function (text, bad) { showToast(text, null, bad); },
        esc: esc, store: store, load: load,
    };
    function screens() { return window.FDScreens || {}; }
    var boysPart = 0, boysParts = 1;
    /** Which children are on screen "part" of "parts": shared out evenly (5 over 2 screens = 3 + 2). */
    function boysRange(n, part, parts) {
        parts = parts || boysParts || 1; part = Math.min(part || 0, parts - 1);
        var base = Math.floor(n / parts), extra = n % parts, start = part * base + Math.min(part, extra);
        return [start, start + base + (part < extra ? 1 : 0)];
    }
    window.FDBoys = { paint: function () { paintChildren(); }, click: function (e) { onBoysClick(e); }, onShow: function (part, parts) { boysPart = part || 0; boysParts = parts || 1; renderBoys(); if (!busy) refresh(); }, range: boysRange,
        state: function () { return state; }, refresh: function () { return refresh(); } };

    /* ---------------------------------------------------------- refresh */

    function refresh() {
        if (!cfg.url || !cfg.code) { setSync('off'); renderBoys(); return Promise.resolve(); }
        setSync('busy');
        return apiGet().then(function (d) {
            setState(d); setSync('ok');
        }).catch(function (e) {
            setSync('err', e.message);
            renderBoys();
        });
    }
    function setState(d) {
        state = d;
        store(CACHE_KEY, JSON.stringify({ at: Date.now(), state: d }));
        renderBoys();
    }
    function startPolling() {
        clearInterval(pollTimer);
        pollTimer = setInterval(function () { if (!busy) refresh(); }, POLL_MS);
    }
    var lastSyncError = '';
    function setSync(kind, msg) {
        if (window.FDHealth) window.FDHealth.sync(kind, msg); else $('sync').className = 'sync ' + kind;
        lastSyncError = kind === 'err' ? (msg || 'Offline') : '';
    }

    /* ----------------------------------------------------------- boys */

    function renderBoys() {
        var grid = $('boysGrid'), msg = $('boysMsg');
        if (!cfg.url || !cfg.code) {
            grid.innerHTML = '';
            msg.innerHTML = '<b>Not connected yet.</b><br>In iCUE, open this widget’s settings and paste the web app URL and access code from your Google Sheet.';
            msg.style.display = 'flex';
            paintChildren();
            return;
        }
        if (!state) {
            grid.innerHTML = '';
            msg.innerHTML = lastSyncError ? '<b>Can’t reach the Google Sheet.</b><br>' + esc(lastSyncError) : 'Loading…';
            msg.style.display = 'flex';
            paintChildren();
            return;
        }
        msg.style.display = 'none';
        var s = state, target = s.cashIn.points;
        // 1–3 children share one screen; 4–6 are split over two (4 → 2+2, 5 → 3+2, 6 → 3+3).
        var rng = boysRange(s.boys.length, boysPart);
        grid.style.gridTemplateColumns = 'repeat(' + Math.max(rng[1] - rng[0], 1) + ', minmax(0, 1fr))';
        grid.innerHTML = s.boys.map(function (b, bi) { return bi < rng[0] || bi >= rng[1] ? '' : boyCard(b, bi, s); }).join('');
        paintChildren();
        if (panel) renderPanel();
    }
    /** Child widgets (on any widget page): each shows one child's card, found by name. */
    function paintChildren() {
        Array.prototype.forEach.call(document.querySelectorAll('.child-slot'), function (el) {
            var name = el.getAttribute('data-child') || '', s = state;
            if (!cfg.url || !cfg.code) { el.innerHTML = '<div class="child-msg">Not connected yet.</div>'; return; }
            if (!s) { el.innerHTML = '<div class="child-msg">' + (lastSyncError ? 'Can’t reach the Google Sheet.<br>' + esc(lastSyncError) : 'Loading…') + '</div>'; return; }
            var bi = -1;
            s.boys.forEach(function (b, i) { if (bi < 0 && String(b.name).toLowerCase() === name.toLowerCase()) bi = i; });
            if (bi < 0 && !name && s.boys.length) bi = 0;
            el.innerHTML = bi < 0 ? '<div class="child-msg"><b>' + esc(name || 'No child picked') + '</b><br>isn’t on the points list – pick a child in this widget’s settings.</div>' : boyCard(s.boys[bi], bi, s, true);
        });
    }
    function boyCard(b, bi, s, compact) {     // compact: the child widget (a quarter of the screen) – two tasks, not three
        var target = s.cashIn.points;
        {
            var pct = Math.max(0, Math.min(100, (b.balance / target) * 100));
            var canCash = b.balance >= target;
            var shownTasks = compact ? b.tasks.slice(0, 2) : b.tasks;
            var tasks = shownTasks.length ? shownTasks.map(function (t) { return taskBtn(bi, t); }).join('') : '<div class="empty">No tasks waiting 🎉</div>';
            var nTasks = b.openTaskCount || b.tasks.length;
            // Only 3 to-dos fit: show what's still to do first, then the rest as "+2 more".
            var order = b.todos.map(function (t, ti) { return ti; }).sort(function (x, y) { return (b.todos[x].done - b.todos[y].done) || (x - y); });
            var showN = order.length > 3 ? 2 : order.length;
            var todos = b.todos.length ? order.slice(0, showN).map(function (ti) {
                var t = b.todos[ti];
                return '<button class="todo' + (t.done ? ' done' : '') + '" data-act="todo" data-boy="' + bi + '" data-i="' + ti + '">' +
                    '<span class="box"></span><span>' + esc(t.item) + '</span></button>';
            }).join('') + (order.length > showN ? '<button class="todo-more" data-act="panel" data-sec="todos" data-boy="' + bi + '">+' + (order.length - showN) + ' more \u2013 ' +
                order.slice(showN).filter(function (ti) { return !b.todos[ti].done; }).length + ' still to do</button>' : '')
                : '<div class="empty">Nothing this morning</div>';
            // Before 5pm: today's reminders in yellow, tomorrow's in outline. From 5pm: just tomorrow's, in yellow.
            var evening = new Date().getHours() >= 17;
            // Show at most `max` chips per day; the rest become "+2".
            var group = function (label, list, cls, max) {
                if (!list.length) return '';
                var shown = list.slice(0, max).map(function (r) { return '<span class="chip">' + esc(r) + '</span>'; }).join('');
                if (list.length > max) shown += '<span class="chip more">+' + (list.length - max) + '</span>';
                return '<span class="rem-grp ' + cls + '"><em>' + label + '</em>' + shown + '</span>';
            };
            var tday = b.reminders || [], tmr = b.remindersTomorrow || [];
            var rem = evening ? group('Tomorrow', tmr, 'now', 3)
                : group('Today', tday, 'now', 2) + group('Tomorrow', tmr, 'next', tday.length >= 2 ? 0 : tday.length === 1 ? 1 : 2);
            if (!rem) rem = '<span class="rem-none">No reminders</span>';
            var pens = s.penalties.map(function (p) {
                var key = 'pen:' + bi + ':' + p;
                return '<button class="pen' + (isArmed(key) ? ' armed' : '') + '" data-act="pen" data-boy="' + bi + '" data-p="' + p + '">' + (isArmed(key) ? 'Sure?' : '−' + p) + '</button>';
            }).join('');
            var stmt = b.statement.slice(0, 3).map(function (l) {
                return '<div class="st-row"><span class="st-text">' + esc(l.text) + '</span><span class="st-pts ' + (l.points < 0 ? 'neg' : 'pos') + '">' +
                    (l.points > 0 ? '+' : '') + l.points + '</span></div>';
            }).join('') || '<div class="empty">No points yet</div>';
            var cashKey = 'cash:' + bi;
            return '<article class="boy" style="--c:' + esc(b.colour) + '">' +
                '<header class="boy-head"><span class="dot"></span><h2>' + esc(b.name) + '</h2></header>' +
                '<div class="chips rem-row">' + rem + '<button class="more-btn wk" data-act="panel" data-sec="rem" data-boy="' + bi + '" title="Reminders for the week">\u203a\u203a\u203a</button></div>' +
                '<div class="boy-body">' +
                    '<div class="col-left">' +
                        '<div class="score"><span class="num">' + b.balance + '</span><span class="lbl">points</span></div>' +
                        '<div class="bar"><span style="width:' + pct + '%"></span></div>' +
                        '<div class="bar-lbl">' + (canCash ? 'Ready to cash in!' : (target - b.balance) + ' more for £' + s.cashIn.value) + '</div>' +
                        '<button class="cash' + (canCash ? ' ready' : '') + (isArmed(cashKey) ? ' armed' : '') + '" data-act="cash" data-boy="' + bi + '"' + (canCash ? '' : ' disabled') + '>' +
                            (isArmed(cashKey) ? 'Tap again: cash ' + target + ' for £' + s.cashIn.value : 'Cash in £' + s.cashIn.value) + '</button>' +
                        '<div class="pens">' + pens + '</div>' +
                        '<div class="stmt">' + stmt + '</div>' +
                    '</div>' +
                    '<div class="col-right">' +
                        '<h3>Next tasks' + (nTasks > shownTasks.length ? '<button class="more-btn" data-act="panel" data-sec="tasks" data-boy="' + bi + '" title="All ' + nTasks + ' tasks">\u203a\u203a\u203a</button>' : '') + '</h3>' +
                        '<div class="tasks">' + tasks + '</div>' +
                        '<h3>This morning' + (order.length > showN ? '<button class="more-btn" data-act="panel" data-sec="todos" data-boy="' + bi + '" title="All ' + order.length + ' to-dos">\u203a\u203a\u203a</button>' : '') + '</h3>' +
                        '<div class="todos">' + todos + '</div>' +
                    '</div>' +
                '</div>' +
            '</article>';
        }
    }

    function taskBtn(bi, t) {
        var key = 'task:' + bi + ':' + t.id;
        return '<button class="task' + (isArmed(key) ? ' armed' : '') + '" data-act="task" data-boy="' + bi + '" data-id="' + esc(t.id) + '">' +
            '<span class="tick"></span><span class="t-text">' + (isArmed(key) ? 'Tap again to confirm' : esc(t.text)) + '</span>' +
            '<span class="t-pts">+' + t.points + '</span></button>';
    }

    /* ---------------------------------------------- "see everything" panel for one boy */

    var panel = null, panelTimer = null;     // { bi, sec }
    var PDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    var PMON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    function openPanel(bi, sec) { panel = { bi: bi, sec: sec, scrolled: false }; renderPanel(); poke(); }
    function closePanel() { panel = null; clearTimeout(panelTimer); $('boyPanel').classList.remove('on'); }
    function poke() { clearTimeout(panelTimer); panelTimer = setTimeout(closePanel, 60000); }   // closes itself after a minute
    function renderPanel() {
        var el = $('boyPanel');
        if (!panel || !state || !state.boys[panel.bi]) { el.classList.remove('on'); return; }
        var b = state.boys[panel.bi], bi = panel.bi;
        var keep = {};
        Array.prototype.forEach.call(el.querySelectorAll('.bp-col'), function (c) { keep[c.getAttribute('data-sec')] = c.scrollTop; });
        var todayStr = state.today, tomorrowStr = state.tomorrow;
        var week = (b.reminderWeek || []).map(function (d) {
            var p = d.date.split('-'), dt = new Date(+p[0], +p[1] - 1, +p[2]);
            var label = d.date === todayStr ? 'Today' : d.date === tomorrowStr ? 'Tomorrow' : PDAY[dt.getDay()];
            return '<div class="bp-day"><b>' + label + '</b><span>' + dt.getDate() + ' ' + PMON[dt.getMonth()] + '</span><div class="bp-chips">' +
                d.items.map(function (r) { return '<span class="chip">' + esc(r) + '</span>'; }).join('') + '</div></div>';
        }).join('') || '<div class="empty">No reminders this week</div>';
        var all = (b.allTasks || b.tasks);
        var tasks = all.length ? all.map(function (t) { return taskBtn(bi, t); }).join('') : '<div class="empty">No tasks waiting</div>';
        var todos = b.todos.length ? b.todos.map(function (t, ti) {
            return '<button class="todo' + (t.done ? ' done' : '') + '" data-act="todo" data-boy="' + bi + '" data-i="' + ti + '"><span class="box"></span><span>' + esc(t.item) + '</span></button>';
        }).join('') : '<div class="empty">Nothing this morning</div>';
        el.style.setProperty('--c', b.colour || '#3fa9f5');
        el.innerHTML = '<div class="bp-card"><header><span class="dot"></span><h2>' + esc(b.name) + '</h2><span class="bp-pts">' + b.balance + ' points</span>' +
            '<button class="bp-close" data-close>\u2715 Close</button></header><div class="bp-cols">' +
            '<section class="bp-col' + (panel.sec === 'rem' ? ' focus' : '') + '" data-sec="rem"><h3>Reminders \u2013 next 7 days</h3>' + week + '</section>' +
            '<section class="bp-col' + (panel.sec === 'tasks' ? ' focus' : '') + '" data-sec="tasks"><h3>All tasks (' + all.length + ')</h3><div class="tasks">' + tasks + '</div></section>' +
            '<section class="bp-col' + (panel.sec === 'todos' ? ' focus' : '') + '" data-sec="todos"><h3>This morning (' + b.todos.filter(function (t) { return !t.done; }).length + ' to do)</h3><div class="todos">' + todos + '</div></section>' +
            '</div></div>';
        Array.prototype.forEach.call(el.querySelectorAll('.bp-col'), function (c) { var k = c.getAttribute('data-sec'); if (keep[k]) c.scrollTop = keep[k]; });
        el.classList.add('on');
    }

    function isArmed(key) { return armed && armed.key === key; }
    function arm(key) {
        if (armed) clearTimeout(armed.timer);
        armed = { key: key, timer: setTimeout(function () { armed = null; renderBoys(); }, ARM_MS) };
        renderBoys();
    }
    function disarm() { if (armed) { clearTimeout(armed.timer); armed = null; } }

    function onBoysClick(e) {
        var btn = e.target.closest('button[data-act]');
        if (!btn || btn.disabled || busy || !state) return;
        var bi = Number(btn.getAttribute('data-boy'));
        var boy = state.boys[bi]; if (!boy) return;
        var act = btn.getAttribute('data-act');
        if (act === 'panel') { openPanel(bi, btn.getAttribute('data-sec')); return; }

        if (act === 'todo') {
            var t = boy.todos[Number(btn.getAttribute('data-i'))];
            t.done = !t.done; renderBoys();                       // optimistic
            send({ action: 'todo', boy: boy.name, item: t.item, done: t.done }, null);
            return;
        }
        var key, body, label;
        if (act === 'task') {
            var id = btn.getAttribute('data-id');
            var task = (boy.allTasks || boy.tasks).filter(function (x) { return x.id === id; })[0];
            key = 'task:' + bi + ':' + id;
            body = { action: 'complete', boy: boy.name, taskId: id };
            label = boy.name + ': +' + task.points + ' for “' + task.text + '”';
        } else if (act === 'pen') {
            var p = Number(btn.getAttribute('data-p'));
            key = 'pen:' + bi + ':' + p;
            body = { action: 'penalty', boy: boy.name, points: p, reason: 'Penalty' };
            label = boy.name + ': −' + p + ' points';
        } else if (act === 'cash') {
            key = 'cash:' + bi;
            body = { action: 'cashin', boy: boy.name };
            label = boy.name + ' cashed in for £' + state.cashIn.value;
        } else return;

        if (!isArmed(key)) { arm(key); return; }
        disarm();
        send(body, label);
    }

    function send(body, label) {
        busy = true; setSync('busy');
        document.body.classList.add('busy');
        apiPost(body).then(function (d) {
            if (d.state) setState(d.state);
            setSync('ok');
            if (label) showToast(label, d.id);
        }).catch(function (e) {
            setSync('err', e.message);
            showToast('Didn’t save: ' + e.message, null, true);
            refresh();
        }).finally(function () {
            busy = false; document.body.classList.remove('busy');
        });
    }

    /* ----------------------------------------------------------- toast */

    function showToast(text, id, bad) {
        undoId = id || null;
        $('toastText').textContent = text;
        $('toastUndo').style.display = undoId ? '' : 'none';
        var t = $('toast');
        t.classList.toggle('bad', !!bad);
        t.classList.add('on');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { t.classList.remove('on'); undoId = null; }, UNDO_MS);
    }
    function onUndo() {
        if (!undoId || busy) return;
        var id = undoId; undoId = null;
        $('toast').classList.remove('on');
        send({ action: 'undo', id: id }, null);
    }

    /* ------------------------------------------------------------ boot */

    var started = false;
    function start() {
        if (started) return; started = true;
        readConfig();
        try {
            var cached = JSON.parse(load(CACHE_KEY) || 'null');
            if (cached && cached.state) state = cached.state;
        } catch (e) { /* ignore */ }

        $('boysGrid').addEventListener('click', onBoysClick);
        if ($('screens')) $('screens').appendChild($('boyPanel'));     // over whichever page is showing (child widgets are on widget pages)
        $('boyPanel').addEventListener('click', function (e) {
            poke();
            if (e.target.closest('[data-close]') || e.target === $('boyPanel')) { closePanel(); return; }
            onBoysClick(e);
        });
        $('boyPanel').addEventListener('scroll', poke, true);
        $('toastUndo').addEventListener('click', onUndo);

        Object.keys(screens()).forEach(function (k) { if (screens()[k].init) screens()[k].init(); });
        window.FDPages.start();
        renderBoys();
        refresh();
        startPolling();
    }

    function onData() {
        if (readConfig() && started) {
            state = null; renderBoys(); refresh();
            Object.keys(screens()).forEach(function (k) { if (screens()[k].reset) screens()[k].reset(); });
            window.FDPages.reset();
        }
    }

    // iCUE hooks (see docs.elgato.com/icue/widgets/specification)
    window.icueEvents = { onICUEInitialized: start, onDataUpdated: onData };
    if (typeof iCUE_initialized !== 'undefined' && iCUE_initialized) { start(); onData(); }
    // Fallback so the widget also runs in a normal browser for testing (?api=...&code=...)
    window.addEventListener('load', function () { setTimeout(start, 300); });
})();
