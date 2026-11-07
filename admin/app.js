/* Family Admin – parents' phone app: boys' points, tasks, lists, widgets and installation settings. */
(function () {
    'use strict';
    var FD = window.FD, esc = FD.esc;
    var $ = function (id) { return document.getElementById(id); };
    var tab = 'boys', listTab = 'todos', DATA = null, busy = false;
    try { DATA = JSON.parse(localStorage.getItem('fdadmin.data') || 'null'); } catch (e) { DATA = null; }

    var LISTS = {
        todos: { label: 'To-dos', title: 'Morning to-dos', help: 'For: a name, names separated by commas, or All. Days: Mon-Fri, Mon,Wed, Weekends, Daily…',
            cols: [['Item', 'Item'], ['Boy', 'For'], ['Days', 'Days'], ['Order', 'Order']] },
        timetable: { label: 'Reminders', title: 'Reminders', help: 'Shown on the Boys screen on the day, and from 5pm the evening before. Day: Tue, Mon-Fri, Mon,Thu… or a date for a one-off, e.g. 23/09.',
            cols: [['Reminder', 'Reminder'], ['Boy', 'For'], ['Day', 'Day or date']] },
        boys: { label: 'Children', title: 'Children', help: 'Points are stored against the name – rename before points are earned.', fixed: true,
            cols: [['Name', 'Name'], ['Colour', 'Colour']] },
    };
    /* ------------------------------------------------------------ data */

    function sync(k) { var s = $('sync'); if (s) s.className = 'sync ' + k; }
    function setData(d) {
        DATA = d;
        try { localStorage.setItem('fdadmin.data', JSON.stringify(d)); } catch (e) { /* ignore */ }
        render();
    }
    function load() {
        sync('busy');
        return FD.post({ action: 'admin' }).then(function (d) { sync('ok'); setData(d); })
            .catch(function (e) { sync('err'); FD.toast(e.message, true); render(); });
    }
    /** Run an action. Actions that return points state update the Boys screen; others return all admin data. */
    function act(body, okText, undoable) {
        if (busy) return Promise.resolve();
        busy = true; sync('busy');
        return FD.post(body).then(function (d) {
            sync('ok');
            if (d.state && !d.tasks) { DATA.state = d.state; setData(DATA); }
            else if (d.tasks) setData(d);
            else if (d.data && d.id && DATA.lists) { DATA.lists[d.id] = d.data; setData(DATA); }
            if (okText) FD.toast(okText, false, undoable && d.id ? function () { act({ action: 'undo', id: d.id }, 'Undone'); } : null);
            return d;
        }).catch(function (e) { sync('err'); FD.toast(e.message, true); throw e; })
          .finally(function () { busy = false; });
    }

    /* ------------------------------------------------------------ frame */

    function frame() {
        $('app').innerHTML =
            '<header class="top"><div class="top-row"><h1 id="title">Family Admin</h1><span class="sync" id="sync"></span>' +
            '<button class="icon-btn" id="refresh" aria-label="Refresh">↻</button></div></header>' +
            '<main class="main" id="body"></main>' +
            '<nav class="tabbar" id="tabs">' +
              '<button data-t="boys"><i>★</i>Boys</button><button data-t="tasks"><i>✔</i>Tasks</button>' +
              '<button data-t="lists"><i>☰</i>Lists</button><button data-t="widgets"><i>▦</i>Widgets</button><button data-t="install"><i>⚙</i>Install</button></nav>' +
            '<div class="sheet-bg" id="sheetBg"><div class="sheet" id="sheet"></div></div>';
        $('tabs').onclick = function (e) { var b = e.target.closest('[data-t]'); if (b) { tab = b.getAttribute('data-t'); window.scrollTo(0, 0); render(); } };
        document.addEventListener('click', function (e) { var g = e.target.closest('[data-goto]'); if (g) { tab = g.getAttribute('data-goto'); window.scrollTo(0, 0); render(); } });
        $('refresh').onclick = load;
        $('sheetBg').onclick = function (e) { if (e.target === $('sheetBg')) closeSheet(); };
        document.addEventListener('visibilitychange', function () { if (!document.hidden) load(); });
    }
    function sheet(html) { $('sheet').innerHTML = '<div class="grab"></div>' + html; $('sheetBg').classList.add('on'); }
    function closeSheet() { $('sheetBg').classList.remove('on'); }

    /* ------------------------------------------------------------ notices: privacy, weak code, updates */

    var LATEST = null, privacyOpen = false;
    function newer(a, b) {
        var x = String(a || '').split('.').map(Number), y = String(b || '').split('.').map(Number);
        for (var i = 0; i < Math.max(x.length, y.length); i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); }
        return false;
    }
    fetch('../version.json?t=' + Date.now(), { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (v) { LATEST = v; render(); }).catch(function () {});
    function notices() {
        if (!DATA || !('privacyAccepted' in DATA)) return '';
        var out = '';
        if (DATA.codeWeak) out += '<div class="banner warn"><b>Your access code is weak.</b> Make a strong one on the Install tab. <button class="link" data-goto="install">Fix it</button></div>';
        if (LATEST && DATA.scriptVersion && newer(LATEST.script, DATA.scriptVersion))
            out += '<div class="banner"><b>Google script update available</b> (' + esc(LATEST.script) + '). <a class="link" href="../setup/#update">How to update</a></div>';
        return out;
    }
    function privacyCheck() {
        var P = window.FD_PRIVACY;
        if (!P || !DATA || !('privacyAccepted' in DATA) || DATA.privacyAccepted === P.version || privacyOpen) return;
        privacyOpen = true;
        sheet('<h2>' + (DATA.privacyAccepted ? 'The privacy notice has changed' : 'Privacy notice') + '</h2><ul class="pvl">' + P.summary.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ul>' +
            '<details class="adv"><summary>Read the full notice</summary><div class="pv-full">' + P.full + '</div></details>' +
            '<p class="mute small">Version ' + esc(P.version) + ', ' + esc(P.updated) + '.</p>' +
            '<div class="sheet-actions"><button class="btn good" id="pvOk">I accept</button></div>');
        $('sheetBg').onclick = null;     // must be accepted
        $('pvOk').onclick = function () {
            act({ action: 'acceptPrivacy', version: P.version, who: 'Family Admin app' }, 'Thank you').then(function () {
                DATA.privacyAccepted = P.version; privacyOpen = false;
                $('sheetBg').onclick = function (e) { if (e.target === $('sheetBg')) closeSheet(); };
                closeSheet(); load();
            }, function () {});
        };
    }

    function render() {
        if (!$('body')) return;
        Array.prototype.forEach.call(document.querySelectorAll('#tabs button'), function (b) { b.classList.toggle('on', b.getAttribute('data-t') === tab); });
        $('title').textContent = { boys: 'Boys', tasks: 'Tasks', lists: 'Lists', widgets: 'Pages & widgets', install: 'Installation settings' }[tab];
        if (!DATA) { $('body').innerHTML = '<div class="empty">Loading…</div>'; return; }
        if ((tab === 'widgets' || tab === 'install') && !DATA.widgets) { $('body').innerHTML = '<div class="empty">Update the Google Apps Script to the latest version to see this tab.</div>'; return; }
        ({ boys: renderBoys, tasks: renderTasks, lists: renderLists, widgets: renderWidgets, install: renderInstall })[tab]();
        var n = notices();
        if (n) $('body').insertAdjacentHTML('afterbegin', n);
        privacyCheck();
    }

    /* ------------------------------------------------------------ boys */

    /** A link into the setup app at one step, already connected to this family's Sheet. */
    function setupLink(step) {
        var c = FD.config(), base = location.href.replace(/admin\/.*$/, '') + 'setup/';
        return base + '#api=' + encodeURIComponent(c.url) + '&code=' + encodeURIComponent(c.code) + '&go=' + step;
    }
    function renderBoys() {
        var s = DATA.state, target = s.cashIn.points;
        $('body').innerHTML = s.boys.map(function (b, i) {
            var pct = Math.min(100, b.balance / target * 100), can = b.balance >= target;
            return '<section class="card boy" style="--c:' + esc(b.colour) + '">' +
                '<div class="boy-top"><h2>' + esc(b.name) + '</h2></div>' + reminders(b) +
                '<div class="score"><b>' + b.balance + '</b><span>points</span><span class="to">' + (can ? 'Ready to cash in!' : (target - b.balance) + ' to £' + s.cashIn.value) + '</span></div>' +
                '<div class="bar"><span style="width:' + pct + '%"></span></div>' +
                '<div class="row-btns">' + s.penalties.map(function (p) { return '<button class="pen" data-pen="' + i + ':' + p + '">−' + p + '</button>'; }).join('') +
                    '<button class="bonus" data-bonus="' + i + '">+ Bonus</button></div>' +
                '<button class="btn wide cash' + (can ? '' : ' off') + '" data-cash="' + i + '"' + (can ? '' : ' disabled') + '>Cash in ' + target + ' for £' + s.cashIn.value + '</button>' +
                '<h3>Tasks (' + (b.allTasks || b.tasks).length + ')</h3>' + ((b.allTasks || b.tasks).length ? (b.allTasks || b.tasks).map(function (t) {
                    return '<button class="task" data-task="' + i + ':' + esc(t.id) + '"><span class="tick"></span><span class="tx">' + esc(t.text) + '</span><b>+' + t.points + '</b></button>';
                }).join('') : '<div class="mute small">No tasks waiting</div>') +
                '<h3>This morning</h3>' + (b.todos.length ? b.todos.map(function (t, j) {
                    return '<button class="todo' + (t.done ? ' done' : '') + '" data-todo="' + i + ':' + j + '"><span class="box"></span>' + esc(t.item) + '</button>';
                }).join('') : '<div class="mute small">Nothing today</div>') +
                '<h3>Statement <button class="link" data-stmt="' + i + '">See all</button></h3>' + b.statement.slice(0, 3).map(function (l) {
                    return '<div class="st"><span>' + esc(l.text) + '</span><b class="' + (l.points < 0 ? 'neg' : 'pos') + '">' + (l.points > 0 ? '+' : '') + l.points + '</b></div>';
                }).join('') + '</section>';
        }).join('') + '<a class="link-card" href="' + setupLink('family') + '" target="_blank" rel="noopener"><b>Change children, family or calendar ›</b><span class="mute small">Add or rename children, rename this page, change the calendar groups, categories and colours.</span></a>';
        $('body').onclick = boysClick;
    }
    /** Today's and tomorrow's reminders; from 5pm only tomorrow's. */
    function reminders(b) {
        var evening = new Date().getHours() >= 17, tmr = b.remindersTomorrow || [];
        function grp(label, list, cls) {
            return list.length ? '<div class="rems ' + cls + '"><em>' + label + '</em>' + list.map(function (r) { return '<span class="rem">' + esc(r) + '</span>'; }).join('') + '</div>' : '';
        }
        return evening ? grp('Tomorrow', tmr, 'now') : grp('Today', b.reminders || [], 'now') + grp('Tomorrow', tmr, 'next');
    }
    function boysClick(e) {
        var s = DATA.state, el;
        if ((el = e.target.closest('[data-pen]'))) {
            var pp = el.getAttribute('data-pen').split(':'), b = s.boys[+pp[0]];
            act({ action: 'penalty', boy: b.name, points: +pp[1], reason: 'Penalty' }, b.name + ' −' + pp[1], true);
        } else if ((el = e.target.closest('[data-task]'))) {
            var tp = el.getAttribute('data-task').split(':'), bb = s.boys[+tp[0]], t = (bb.allTasks || bb.tasks).filter(function (x) { return x.id === tp[1]; })[0];
            el.classList.add('done');
            act({ action: 'complete', boy: bb.name, taskId: tp[1] }, bb.name + ' +' + t.points + ' for ' + t.text, true);
        } else if ((el = e.target.closest('[data-todo]'))) {
            var dp = el.getAttribute('data-todo').split(':'), b2 = s.boys[+dp[0]], td = b2.todos[+dp[1]];
            td.done = !td.done; el.classList.toggle('done', td.done);
            act({ action: 'todo', boy: b2.name, item: td.item, done: td.done });
        } else if ((el = e.target.closest('[data-cash]'))) {
            var b3 = s.boys[+el.getAttribute('data-cash')];
            if (confirm('Cash in ' + s.cashIn.points + ' points for £' + s.cashIn.value + ' for ' + b3.name + '?'))
                act({ action: 'cashin', boy: b3.name }, b3.name + ' cashed in £' + s.cashIn.value, true);
        } else if ((el = e.target.closest('[data-bonus]'))) {
            bonusSheet(s.boys[+el.getAttribute('data-bonus')]);
        } else if ((el = e.target.closest('[data-stmt]'))) {
            var who = s.boys[+el.getAttribute('data-stmt')].name;
            load().then(function () { statementSheet(DATA.state.boys.filter(function (x) { return x.name === who; })[0]); });
        }
    }
    function bonusSheet(b) {
        sheet('<h2>Points for ' + esc(b.name) + '</h2><p class="mute">Use a minus number to take points off.</p>' +
            '<div class="chips quick">' + [5, 10, 20, 50].map(function (n) { return '<button class="chip" data-q="' + n + '">+' + n + '</button>'; }).join('') + '</div>' +
            '<label>Points</label><input id="bPts" type="number" inputmode="numeric" placeholder="e.g. 20 or -20">' +
            '<label>Reason <span class="cnt">max ' + L().reason + '</span></label><input id="bWhy" maxlength="' + L().reason + '" placeholder="e.g. Helped with shopping" autocomplete="off">' +
            '<div class="sheet-actions"><button class="btn ghost" id="bCancel">Cancel</button><button class="btn good" id="bSave">Save</button></div>');
        $('sheet').querySelector('.quick').onclick = function (e) { var q = e.target.closest('[data-q]'); if (q) $('bPts').value = q.getAttribute('data-q'); };
        $('bCancel').onclick = closeSheet;
        $('bSave').onclick = function () {
            var n = Number($('bPts').value);
            if (!n) { FD.toast('Enter some points', true); return; }
            closeSheet();
            act({ action: 'adjust', boy: b.name, points: n, reason: $('bWhy').value.trim() || (n > 0 ? 'Bonus' : 'Penalty') }, b.name + ' ' + (n > 0 ? '+' : '') + n, true);
        };
    }
    function statementSheet(b) {
        var rows = (DATA.ledger || []).filter(function (l) { return l.Boy === b.name; });
        sheet('<h2>' + esc(b.name) + '’s statement</h2><p class="mute">Balance ' + b.balance + ' points. Tap Remove to take an entry off.</p>' +
            (rows.length ? rows.map(function (l) {
                return '<div class="st big"><div><span>' + esc(l.Description) + '</span><small>' + esc(l.Timestamp) + '</small></div><b class="' + (l.Points < 0 ? 'neg' : 'pos') + '">' +
                    (l.Points > 0 ? '+' : '') + esc(l.Points) + '</b><button class="btn ghost sm" data-rm="' + esc(l.ID) + '">Remove</button></div>';
            }).join('') : '<div class="empty">Nothing yet</div>') + '<button class="btn ghost wide" id="sClose">Close</button>');
        $('sClose').onclick = closeSheet;
        $('sheet').onclick = function (e) {
            var r = e.target.closest('[data-rm]'); if (!r) return;
            if (!confirm('Remove this entry?')) return;
            closeSheet();
            act({ action: 'undo', id: r.getAttribute('data-rm') }, 'Removed').then(load);
        };
    }

    /* ------------------------------------------------------------ tasks */

    function renderTasks() {
        var tasks = (DATA.tasks || []).slice().sort(function (a, b) { return (+a.Order || 999) - (+b.Order || 999); });
        $('body').innerHTML = '<button class="btn wide top-btn" id="newTask">+ New task</button>' + (tasks.length ? tasks.map(function (t) {
            return '<div class="card trow' + (t.Active ? '' : ' paused') + '"><div class="tmain"><b>' + esc(t.Task) + '</b><span class="mute">' + esc(t.Boy || 'All') + ' · ' +
                esc(t.Repeat || 'once') + (t.Active ? '' : ' · paused') + '</span></div><b class="pos">+' + esc(t.Points) + '</b>' +
                '<button class="btn ghost sm" data-edit="' + esc(t.ID) + '">Edit</button></div>';
        }).join('') : '<div class="empty">No tasks yet</div>') + '<p class="mute small">Each boy sees his next three open tasks, lowest order first.</p>';
        $('newTask').onclick = function () { taskSheet(null); };
        $('body').onclick = function (e) { var b = e.target.closest('[data-edit]'); if (b) taskSheet(DATA.tasks.filter(function (t) { return t.ID === b.getAttribute('data-edit'); })[0]); };
    }
    function taskSheet(t) {
        var names = ['All'].concat(DATA.boys.map(function (b) { return b.Name; }).filter(Boolean));
        t = t || { ID: '', Task: '', Points: '', Boy: 'All', Repeat: 'once', Order: '', Active: true };
        sheet('<h2>' + (t.ID ? 'Edit task' : 'New task') + '</h2>' +
            '<label>Task <span class="cnt">max ' + L().task + '</span></label><input id="tTask" maxlength="' + L().task + '" value="' + esc(t.Task) + '" placeholder="e.g. Tidy your bedroom" autocomplete="off">' +
            '<div class="two"><div><label>Points</label><input id="tPts" type="number" inputmode="numeric" value="' + esc(t.Points) + '"></div>' +
            '<div><label>Order</label><input id="tOrd" type="number" inputmode="numeric" value="' + esc(t.Order) + '" placeholder="10"></div></div>' +
            '<label>For</label><select id="tBoy">' + names.map(function (n) { return '<option' + (n === (t.Boy || 'All') ? ' selected' : '') + '>' + esc(n) + '</option>'; }).join('') + '</select>' +
            '<label>Repeats</label><select id="tRep">' + [['once', 'Once (gone when done)'], ['daily', 'Daily (back tomorrow)'], ['always', 'Always available']].map(function (o) {
                return '<option value="' + o[0] + '"' + (o[0] === t.Repeat ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>' +
            '<div class="sheet-actions"><button class="btn ghost" id="tCancel">Cancel</button><button class="btn good" id="tSave">Save</button></div>' +
            (t.ID ? '<div class="sheet-actions"><button class="btn ghost" id="tPause">' + (t.Active ? 'Pause' : 'Resume') + '</button><button class="btn bad" id="tDel">Delete</button></div>' : ''));
        $('tCancel').onclick = closeSheet;
        $('tSave').onclick = function () {
            var task = { ID: t.ID, Task: $('tTask').value.trim(), Points: $('tPts').value, Boy: $('tBoy').value, Repeat: $('tRep').value, Order: $('tOrd').value, Active: t.Active !== false };
            act({ action: 'saveTask', task: task }, 'Task saved').then(closeSheet, function () {});
        };
        if (t.ID) {
            $('tPause').onclick = function () { act({ action: 'saveTask', task: Object.assign({}, t, { Active: !t.Active }) }, t.Active ? 'Paused' : 'Resumed').then(closeSheet, function () {}); };
            $('tDel').onclick = function () { if (confirm('Delete this task? Points already earned stay.')) act({ action: 'deleteTask', id: t.ID }, 'Deleted').then(closeSheet, function () {}); };
        }
    }

    /* ------------------------------------------------------------ lists */

    function renderLists() {
        var cfg = LISTS[listTab], rows = (DATA[listTab] || []).slice();
        if (!rows.length) rows.push({});
        $('body').innerHTML = '<div class="seg" id="lseg">' + Object.keys(LISTS).map(function (k) {
                return '<button data-l="' + k + '" class="' + (k === listTab ? 'on' : '') + '">' + LISTS[k].label + '</button>'; }).join('') + '</div>' +
            '<p class="mute small help">' + esc(cfg.help) + '</p><div id="lrows">' + rows.map(function (r) { return rowCard(cfg, r); }).join('') + '</div>' +
            (cfg.fixed ? '' : '<button class="btn ghost wide" id="lAdd">+ Add</button>') + '<button class="btn wide" id="lSave">Save ' + esc(cfg.label.toLowerCase()) + '</button>';
        $('lseg').onclick = function (e) { var b = e.target.closest('[data-l]'); if (b) { listTab = b.getAttribute('data-l'); render(); } };
        if ($('lAdd')) $('lAdd').onclick = function () { $('lrows').insertAdjacentHTML('beforeend', rowCard(cfg, {})); };
        $('lrows').onclick = function (e) { var x = e.target.closest('[data-x]'); if (x) x.closest('.lrow').remove(); };
        $('lSave').onclick = function () {
            var out = Array.prototype.map.call(document.querySelectorAll('.lrow'), function (row) {
                var o = {}; row.querySelectorAll('[data-k]').forEach(function (i) { o[i.getAttribute('data-k')] = i.value.trim(); }); return o;
            });
            act({ action: 'saveList', list: listTab, rows: out }, 'Saved');
        };
    }
    /** Longest text that fits on the Edge screen (sent by the Google script). */
    function L() { return (DATA && DATA.limits) || { reminder: 12, boyName: 10, task: 22, todo: 22, destination: 16, reason: 30, maxPoints: 999 }; }
    function maxFor(list, col) {
        var m = { todos: { Item: L().todo }, timetable: { Reminder: L().reminder }, boys: { Name: L().boyName } }[list];
        return m && m[col];
    }
    function rowCard(cfg, r) {
        return '<div class="card lrow">' + (cfg.fixed ? '' : '<button class="x" data-x>✕</button>') + cfg.cols.map(function (c) {
            var n = maxFor(listTab, c[0]);
            return '<label>' + esc(c[1]) + (n ? ' <span class="cnt">max ' + n + '</span>' : '') + '</label><input data-k="' + c[0] + '" value="' + esc(r[c[0]]) + '"' +
                (c[0] === 'Colour' ? ' type="color"' : '') + (n ? ' maxlength="' + n + '"' : '') + ' autocomplete="off">';
        }).join('') + '</div>';
    }

    /* ------------------------------------------------------------ pages & widgets */

    function typeOf(t) { return (DATA.types || []).filter(function (x) { return x.type === t; })[0] || { name: t, icon: '', settings: [], sizes: ['full'] }; }
    function pageTypeOf(t) { return (DATA.pageTypes || []).filter(function (x) { return x.type === t; })[0] || { name: t, settings: [] }; }
    function widgetsOn(pid) { return (DATA.widgets || []).filter(function (w) { return w.page === pid; }); }
    /** Same packing as the screen: a full widget takes a column, two half widgets share one. */
    function pack(ws) {
        var cols = [];
        ws.filter(function (w) { return w.show; }).forEach(function (w) {
            var last = cols[cols.length - 1];
            if (w.size === 'half' && last && last.length === 1 && last[0].size === 'half') last.push(w); else cols.push([w]);
        });
        return cols;
    }
    function preview(pid) {
        var cols = pack(widgetsOn(pid)), n = (DATA.limits && DATA.limits.columns) || 4, html = '';
        for (var i = 0; i < Math.max(n, cols.length); i++) {
            var c = cols[i] || [];
            html += '<div class="pv-col' + (i >= n ? ' over' : '') + '">' + (c.length ? c.map(function (w) {
                var T = typeOf(w.type);
                return '<button class="pv-w ' + w.size + '" data-w="' + esc(w.id) + '"><span>' + esc(T.icon) + '</span><b>' + esc(T.name) + '</b></button>';
            }).join('') : '<span class="pv-empty">empty</span>') + '</div>';
        }
        var over = cols.length - n;
        return '<div class="pv">' + html + '</div>' + (over > 0 ? '<p class="err small">' + over + ' column' + (over > 1 ? 's' : '') + ' won’t fit on the screen – make some widgets half height, move them to another page or hide them.</p>' : '');
    }

    function renderWidgets() {
        var pages = DATA.pages || [];
        $('body').innerHTML = '<p class="mute small help">Each widget is a quarter of the screen wide, full or half height. Two half-height widgets share a column. Tap a widget to change it.</p>' +
            pages.map(function (p, i) {
                var ws = widgetsOn(p.id), isW = p.type === 'widgets';
                return '<section class="card pg' + (p.show ? '' : ' off') + '"><div class="pg-top"><span class="pg-ico">' + esc(p.icon) + '</span><h2>' + esc(p.title) + '</h2>' +
                    '<span class="badge">' + esc(isW ? ws.length + ' widget' + (ws.length === 1 ? '' : 's') : pageTypeOf(p.type).name) + '</span>' + (p.show ? '' : '<span class="badge">hidden</span>') +
                    '<button class="mini" data-pmove="' + esc(p.id) + ':-1"' + (i ? '' : ' disabled') + '>▲</button><button class="mini" data-pmove="' + esc(p.id) + ':1"' + (i < pages.length - 1 ? '' : ' disabled') + '>▼</button>' +
                    '<button class="btn ghost sm" data-pedit="' + esc(p.id) + '">Edit</button></div>' +
                    (isW ? preview(p.id) + '<div class="wl">' + ws.map(function (w, j) {
                        var T = typeOf(w.type);
                        return '<div class="wrow' + (w.show ? '' : ' off') + '"><button class="wmain" data-w="' + esc(w.id) + '"><span class="wico">' + esc(T.icon) + '</span><span class="wtx"><b>' + esc(T.name) + '</b><small>' +
                            esc(summary(w)) + '</small></span><span class="badge">' + (w.show ? w.size : 'hidden') + '</span></button>' +
                            '<button class="mini" data-wmove="' + esc(w.id) + ':-1"' + (j ? '' : ' disabled') + '>▲</button><button class="mini" data-wmove="' + esc(w.id) + ':1"' + (j < ws.length - 1 ? '' : ' disabled') + '>▼</button></div>';
                    }).join('') + '</div><button class="btn ghost wide" data-wadd="' + esc(p.id) + '">+ Add a widget to ' + esc(p.title) + '</button>' : '') +
                    '</section>';
            }).join('') +
            '<button class="btn ghost wide" id="pAdd">+ New widget page</button>';
        $('pAdd').onclick = function () { newPageSheet(); };
        $('body').onclick = function (e) {
            var el;
            if ((el = e.target.closest('[data-w]'))) widgetSheet(DATA.widgets.filter(function (w) { return w.id === el.getAttribute('data-w'); })[0]);
            else if ((el = e.target.closest('[data-wmove]'))) { var a = el.getAttribute('data-wmove').split(':'); act({ action: 'moveWidget', id: a[0], dir: +a[1] }); }
            else if ((el = e.target.closest('[data-pmove]'))) { var b = el.getAttribute('data-pmove').split(':'); act({ action: 'movePage', id: b[0], dir: +b[1] }); }
            else if ((el = e.target.closest('[data-pedit]'))) pageSheet(DATA.pages.filter(function (p) { return p.id === el.getAttribute('data-pedit'); })[0]);
            else if ((el = e.target.closest('[data-wadd]'))) addWidgetSheet(el.getAttribute('data-wadd'));
        };
    }
    /** One line under each widget's name: its key settings. */
    function summary(w) {
        var s = w.settings || {};
        switch (w.type) {
            case 'trains': return s.From + ' → ' + s.To;
            case 'traffic': return String(s.Destinations || '').split('\n').map(function (l) { return l.split('|')[0].trim(); }).filter(Boolean).join(', ');
            case 'weather': return s.Location || 'Home';
            case 'bins': return s.Postcode + ' · ' + s.House;
            case 'flights': return 'Within ' + s.RadiusMiles + ' miles';
            case 'news': return s.Feed;
            case 'photos': return s.Source + ((s.Source === 'Google Drive folder' ? s.DriveFolder : s.AlbumLink) ? '' : ' – link needed');
            case 'clock': return String(s.Zones || '').split('\n').map(function (l) { return l.split('|')[0].trim(); }).filter(Boolean).join(', ') || 'Local time';
            case 'list': return s.ListName + ' · ' + s.Source;
            case 'timer': return s.Presets + ' min';
            case 'countdown': return s.Categories ? 'Calendar: ' + s.Categories : 'Your own dates';
            case 'whereabouts': return String(s.People || '').split('\n').map(function (l) { return l.split('|')[0].trim(); }).filter(Boolean).join(', ');
            case 'bus': return s.StopName || (s.StopCode ? s.StopCode : 'Nearest stop to home');
            case 'todo': return 'Google Tasks' + (s.TasksList ? ' · ' + s.TasksList : '');
            case 'words': return s.Language + (s.Duolingo ? ' · Duolingo: ' + s.Duolingo : '');
            case 'spotify': return DATA.spotifyConnected ? 'Connected' : 'Not connected yet';
            case 'quote': return s.Source + ' · ' + s.Change;
            default: return typeOf(w.type).about || '';
        }
    }

    /** Form fields from the setting definitions sent by the Google script. */
    function field(f, v) {
        var id = 'f_' + f.k, help = f.help ? '<div class="mute small hint">' + esc(f.help) + '</div>' : '';
        var lab = '<label for="' + id + '">' + esc(f.label) + (f.max && f.type === 'text' ? ' <span class="cnt">max ' + f.max + '</span>' : '') + '</label>';
        if (f.type === 'bool') return '<label class="tog"><input type="checkbox" id="' + id + '" data-f="' + esc(f.k) + '"' + (v ? ' checked' : '') + '><span>' + esc(f.label) + '</span></label>' + help;
        if (f.type === 'select') return lab + '<select id="' + id + '" data-f="' + esc(f.k) + '">' + f.options.map(function (o) { return '<option' + (o === v ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('') + '</select>' + help;
        if (f.type === 'lines') return lab + '<textarea id="' + id + '" data-f="' + esc(f.k) + '" rows="' + Math.max(2, (f.maxLines || 3)) + '">' + esc(v) + '</textarea>' + help;
        var t = f.type === 'number' ? ' type="number" inputmode="numeric"' + (f.min != null ? ' min="' + f.min + '"' : '') + (f.max != null ? ' max="' + f.max + '"' : '')
            : f.type === 'url' ? ' type="url" inputmode="url"' : f.type === 'time' ? ' type="time"' : f.type === 'crs' ? ' maxlength="3" autocapitalize="characters"' : (f.max ? ' maxlength="' + f.max + '"' : '');
        return lab + '<input id="' + id + '" data-f="' + esc(f.k) + '" value="' + esc(v) + '"' + t + ' autocomplete="off">' + help;
    }
    function fields(defs, vals) {
        var main = defs.filter(function (f) { return !f.advanced; }), adv = defs.filter(function (f) { return f.advanced; });
        return main.map(function (f) { return field(f, vals[f.k]); }).join('') +
            (adv.length ? '<details class="adv"><summary>More settings</summary>' + adv.map(function (f) { return field(f, vals[f.k]); }).join('') + '</details>' : '');
    }
    function readFields() {
        var out = {};
        Array.prototype.forEach.call(document.querySelectorAll('#sheet [data-f]'), function (i) { out[i.getAttribute('data-f')] = i.type === 'checkbox' ? i.checked : i.value.trim(); });
        return out;
    }

    function widgetSheet(w) {
        if (!w) return;
        var T = typeOf(w.type), pages = DATA.pages.filter(function (p) { return p.type === 'widgets'; });
        sheet('<h2>' + esc(T.icon) + ' ' + esc(T.name) + '</h2><p class="mute small">' + esc(T.about) + '</p>' +
            '<div class="two"><div><label>Page</label><select id="wPage">' + pages.map(function (p) { return '<option value="' + esc(p.id) + '"' + (p.id === w.page ? ' selected' : '') + '>' + esc(p.title) + '</option>'; }).join('') + '</select></div>' +
            '<div><label>Height</label><select id="wSize"' + (T.sizes.length < 2 ? ' disabled' : '') + '>' + T.sizes.map(function (z) { return '<option value="' + z + '"' + (z === w.size ? ' selected' : '') + '>' + (z === 'full' ? 'Full height' : 'Half height') + '</option>'; }).join('') + '</select></div></div>' +
            '<label class="tog"><input type="checkbox" id="wShow"' + (w.show ? ' checked' : '') + '><span>Show on the screen</span></label>' +
            '<h3 class="sh">Settings</h3>' + fields(T.settings, w.settings) +
            (w.type === 'list' || w.type === 'todo' ? listEditor(w) : '') + (w.type === 'memo' ? memoEditor() : '') +
            (w.type === 'whereabouts' ? whereEditor(w) : '') + (w.type === 'spotify' ? spotifyBox() : '') +
            '<div class="sheet-actions"><button class="btn ghost" id="wCancel">Cancel</button><button class="btn good" id="wSave">Save</button></div>' +
            '<div class="sheet-actions"><button class="btn bad" id="wDel">Remove this widget</button></div>');
        $('wCancel').onclick = closeSheet;
        $('wSave').onclick = function () {
            act({ action: 'saveWidget', widget: { id: w.id, page: $('wPage').value, size: $('wSize').value, show: $('wShow').checked, settings: readFields() } }, 'Saved – the screen updates within a minute')
                .then(closeSheet, function () {});
        };
        $('wDel').onclick = function () {
            if (confirm('Remove the ' + T.name + ' widget and its settings?')) act({ action: 'deleteWidget', id: w.id }, 'Removed').then(closeSheet, function () {});
        };
        if (w.type === 'list' || w.type === 'todo') wireList(w);
        if (w.type === 'memo') wireMemo();
        if (w.type === 'whereabouts') wireWhere(w);
    }

    /* the List widget's items, edited right here */
    function listEditor(w) {
        return '<h3 class="sh">Items on the list</h3><div class="ls-add"><input id="lsNew" maxlength="' + (L().listItem || 30) + '" placeholder="Add an item…" autocomplete="off"><button class="btn sm" id="lsAdd">Add</button></div>' +
            '<div id="lsItems">' + listItems(w) + '</div>';
    }
    function listItems(w) {
        var d = (DATA.lists || {})[w.id];
        if (!d) return '<div class="mute small">Save the widget first, then reopen it to see the list.</div>';
        if (d.error) return '<div class="err small">' + esc(d.error) + '</div>';
        var done = d.items.filter(function (i) { return i.done; }).length;
        return (d.items.length ? d.items.map(function (i) {
            return '<div class="ls-row"><button class="todo' + (i.done ? ' done' : '') + '" data-ltog="' + esc(i.id) + '"><span class="box"></span>' + esc(i.text) + '</button><button class="x" data-lrm="' + esc(i.id) + '">✕</button></div>';
        }).join('') : '<div class="mute small">Nothing on the list</div>') +
            (done ? '<button class="btn ghost sm" id="lsClear">Clear ' + done + ' ticked</button>' : '');
    }
    function wireList(w) {
        function op(body) {
            body.action = 'listItem'; body.widget = w.id;
            return act(body).then(function (d) { DATA.lists[w.id] = d.data; $('lsItems').innerHTML = listItems(w); bindClear(); });
        }
        function bindClear() { if ($('lsClear')) $('lsClear').onclick = function () { op({ op: 'clearDone' }); }; }
        $('lsAdd').onclick = function () { var t = $('lsNew').value.trim(); if (!t) return; $('lsNew').value = ''; op({ op: 'add', text: t }); };
        $('lsNew').onkeydown = function (e) { if (e.key === 'Enter') $('lsAdd').onclick(); };
        $('lsItems').onclick = function (e) {
            var el;
            if ((el = e.target.closest('[data-ltog]'))) { el.classList.toggle('done'); op({ op: 'toggle', id: el.getAttribute('data-ltog') }); }
            else if ((el = e.target.closest('[data-lrm]'))) op({ op: 'remove', id: el.getAttribute('data-lrm') });
        };
        bindClear();
    }

    /* Memo widget: notes added from the phone */
    function memoEditor() {
        return '<h3 class="sh">Notes on the screen</h3><div class="ls-add"><input id="mmNew" maxlength="' + (L().memo || 80) + '" placeholder="Write a note…" autocomplete="off"></div>' +
            '<div class="ls-add"><input id="mmFrom" maxlength="12" placeholder="From (optional)" value="' + esc(localStorage.getItem('fdadmin.from') || '') + '" autocomplete="off"><button class="btn sm" id="mmAdd">Add</button></div>' +
            '<div id="mmItems">' + memoItems() + '</div>';
    }
    function memoItems() {
        var m = DATA.memos || [];
        return m.length ? m.slice().reverse().map(function (x) {
            return '<div class="ls-row"><span class="mm-x"><b>' + esc(x.text) + '</b><small>' + (x.from ? esc(x.from) + ' · ' : '') + esc(x.added) + '</small></span><button class="x" data-mrm="' + esc(x.id) + '">✕</button></div>';
        }).join('') : '<div class="mute small">No notes</div>';
    }
    function wireMemo() {
        function after(d) { return load().then(function () { $('mmItems').innerHTML = memoItems(); }); }
        $('mmAdd').onclick = function () {
            var t = $('mmNew').value.trim(), f = $('mmFrom').value.trim(); if (!t) return;
            try { localStorage.setItem('fdadmin.from', f); } catch (e) { /* ignore */ }
            $('mmNew').value = '';
            act({ action: 'memo', op: 'add', text: t, from: f }, 'Note added').then(after, function () {});
        };
        $('mmItems').onclick = function (e) { var b = e.target.closest('[data-mrm]'); if (b) act({ action: 'memo', op: 'remove', id: b.getAttribute('data-mrm') }, 'Removed').then(after, function () {}); };
    }

    /* Weasley clock: move people by hand, and the links for phone automations */
    function whereEditor(w) {
        var d = ((DATA.whereabouts || []).filter(function (x) { return x.id === w.id; })[0] || {}).data;
        if (!d) return '<div class="mute small">Save the widget first, then reopen it.</div>';
        var c = FD.config(), base = c.url + '?action=where&code=' + encodeURIComponent(c.code);
        return '<h3 class="sh">Where is everyone now?</h3>' + d.people.map(function (p) {
            return '<label>' + esc(p.name) + '</label><select data-who="' + esc(p.name) + '">' + ['<option value="">(not set)</option>'].concat(d.places.map(function (pl) {
                return '<option' + (pl === p.place ? ' selected' : '') + '>' + esc(pl) + '</option>'; })).join('') + '</select>';
        }).join('') +
        '<details class="adv"><summary>Move the hands automatically from phones</summary>' +
        '<p class="mute small">iPhone: Shortcuts app → Automation → “When I arrive at / leave” a place → Get contents of URL, with the link below. ' +
        'Android: the same with an automation app (e.g. MacroDroid → HTTP request). Change the name and place in each link.</p>' +
        '<label>Set a place</label><textarea readonly rows="3">' + esc(base + '&person=' + encodeURIComponent(d.people[0] ? d.people[0].name : 'Ben') + '&place=' + encodeURIComponent(d.places[1] || 'School')) + '</textarea>' +
        '<label>Or send the phone’s position (it picks the nearest place, otherwise Travelling)</label><textarea readonly rows="3">' + esc(base + '&person=NAME&lat=LATITUDE&lon=LONGITUDE') + '</textarea>' +
        '<label>OwnTracks app (HTTP mode) URL</label><textarea readonly rows="3">' + esc(c.url + '?owntracks=1&code=' + encodeURIComponent(c.code) + '&person=NAME') + '</textarea>' +
        '<p class="mute small">These links contain your access code – only put them on family phones.</p></details>';
    }
    function wireWhere(w) {
        Array.prototype.forEach.call(document.querySelectorAll('#sheet [data-who]'), function (sel) {
            sel.onchange = function () {
                if (!sel.value) return;
                act({ action: 'where', person: sel.getAttribute('data-who'), place: sel.value, how: 'phone app' }, sel.getAttribute('data-who') + ' → ' + sel.value).then(function () { load(); }, function () {});
            };
        });
    }

    /* Spotify: one-off connection */
    function spotifyBox() {
        var c = FD.config(), ok = DATA.spotifyConnected;
        var hasKeys = (DATA.install || []).some(function (f) { return f.k === 'SpotifyClientId' && f.value; });
        return '<h3 class="sh">Spotify account</h3><p class="mute small">' + (ok ? '✅ Connected.' : hasKeys ? 'Not connected yet.' :
            'First create an app at developer.spotify.com and put its Client ID and secret on the Install tab.') + ' Spotify needs Premium for play/pause/skip.</p>' +
            (hasKeys ? '<a class="btn wide" target="_blank" rel="noopener" href="' + esc(c.url + '?spotify=login&key=' + encodeURIComponent(c.code)) + '">' + (ok ? 'Reconnect Spotify' : 'Connect Spotify') + '</a>' : '');
    }

    function addWidgetSheet(pid) {
        var page = DATA.pages.filter(function (p) { return p.id === pid; })[0];
        sheet('<h2>Add a widget to ' + esc(page.title) + '</h2><div class="types">' + DATA.types.map(function (T) {
            return '<button class="type" data-type="' + esc(T.type) + '"><span class="wico">' + esc(T.icon) + '</span><span class="wtx"><b>' + esc(T.name) + '</b><small>' + esc(T.about) + '</small></span>' +
                '<span class="badge">' + T.sizes.join(' / ') + '</span></button>';
        }).join('') + '</div><button class="btn ghost wide" id="aCancel">Cancel</button>');
        $('aCancel').onclick = closeSheet;
        $('sheet').querySelector('.types').onclick = function (e) {
            var b = e.target.closest('[data-type]'); if (!b) return;
            act({ action: 'addWidget', page: pid, type: b.getAttribute('data-type') }, 'Added – tap it to change its settings').then(closeSheet, function () {});
        };
    }

    function pageSheet(p) {
        var PT = pageTypeOf(p.type), icons = ['⌂', '◈', '✦', '☀', '♫', '✈', '☕', '⚑', '●', '▲', '★', '▦'];
        sheet('<h2>' + esc(p.title) + ' page</h2><p class="mute small">' + esc(PT.name) + '</p>' +
            '<label>Name in the side bar <span class="cnt">max ' + (L().pageTitle || 10) + '</span></label><input id="pTitle" maxlength="' + (L().pageTitle || 10) + '" value="' + esc(p.title) + '" autocomplete="off">' +
            '<label>Icon</label><div class="chips icons" id="pIcons">' + icons.map(function (i) { return '<button class="chip' + (i === p.icon ? ' on' : '') + '" data-i="' + i + '">' + i + '</button>'; }).join('') + '</div>' +
            '<label class="tog"><input type="checkbox" id="pShow"' + (p.show ? ' checked' : '') + '><span>Show this page</span></label>' +
            (PT.settings.length ? '<h3 class="sh">Settings</h3>' + fields(PT.settings, p.settings || {}) : '') +
            '<div class="sheet-actions"><button class="btn ghost" id="pCancel">Cancel</button><button class="btn good" id="pSave">Save</button></div>' +
            (p.type === 'widgets' ? '<div class="sheet-actions"><button class="btn bad" id="pDel">Delete this page</button></div>' : ''));
        var icon = p.icon;
        $('pIcons').onclick = function (e) { var b = e.target.closest('[data-i]'); if (!b) return; icon = b.getAttribute('data-i');
            Array.prototype.forEach.call($('pIcons').children, function (c) { c.classList.toggle('on', c === b); }); };
        $('pCancel').onclick = closeSheet;
        $('pSave').onclick = function () {
            act({ action: 'savePage', page: { id: p.id, title: $('pTitle').value.trim(), icon: icon, show: $('pShow').checked, settings: readFields() } }, 'Saved').then(closeSheet, function () {});
        };
        if ($('pDel')) $('pDel').onclick = function () { if (confirm('Delete the ' + p.title + ' page?')) act({ action: 'deletePage', id: p.id }, 'Deleted').then(closeSheet, function () {}); };
    }
    function newPageSheet() {
        sheet('<h2>New widget page</h2><label>Name <span class="cnt">max ' + (L().pageTitle || 10) + '</span></label><input id="npTitle" maxlength="' + (L().pageTitle || 10) + '" placeholder="e.g. Kitchen" autocomplete="off">' +
            '<div class="sheet-actions"><button class="btn ghost" id="npCancel">Cancel</button><button class="btn good" id="npSave">Add page</button></div>');
        $('npCancel').onclick = closeSheet;
        $('npSave').onclick = function () { act({ action: 'addPage', title: $('npTitle').value.trim() }, 'Page added').then(closeSheet, function () {}); };
    }

    /* ------------------------------------------------------------ installation */

    function renderInstall() {
        var c = FD.config();
        $('body').innerHTML = '<p class="mute small help">Set once when the dashboard is installed: keys for the map, trains and calendar. Each widget’s own settings are on the Widgets tab.</p>' +
            '<section class="card">' + (DATA.install || []).map(function (f) {
                return '<label>' + esc(f.label) + '</label><input data-set="' + esc(f.k) + '" value="' + esc(f.value) + '" autocomplete="off" autocapitalize="off" spellcheck="false">' +
                    (f.help ? '<div class="mute small hint">' + esc(f.help) + '</div>' : '');
            }).join('') + '</section>' +
            '<button class="btn wide" id="sSave">Save installation settings</button>' +
            '<section class="card" style="margin-top:16px"><h2>Change your setup</h2><p class="mute small">Opens the setup app at that step, already connected. Easiest on a computer, but works on a phone.</p>' +
            [['family', 'Family & calendar', 'people, groups, categories, children’s page'], ['devices', 'Connect devices', 'QR codes, links and the PC start file'],
             ['keys', 'Free API keys', 'maps, trains, buses, Spotify…'], ['check', 'Check everything', 'tests every widget'], ['update', 'Updates', 'is your Google script up to date?']].map(function (x) {
                return '<a class="setup-link" href="' + setupLink(x[0]) + '" target="_blank" rel="noopener"><b>' + x[1] + '</b><span>' + x[2] + '</span><i>›</i></a>';
            }).join('') + '</section>' +
            '<section class="card" style="margin-top:16px"><h2>Access code</h2>' +
            '<p class="mute small">' + (DATA.codeWeak ? '⚠ Your access code is weak. ' : '') + 'The code protects your dashboard: anyone with your links and code can use it. ' +
            'After changing it, every other device needs its new link (setup app → Connect your devices) and the PC needs its new start file. This phone updates itself.</p>' +
            '<button class="btn wide" id="cNew">Make a new strong code for me</button>' +
            '<label>Or choose your own <span class="cnt">8+ characters, letters, numbers and a special character</span></label>' +
            '<input id="cOwn" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="e.g. Garden-Gnome-42">' +
            '<div class="mute small hint" id="cHint"></div><button class="btn ghost wide" id="cSet">Use this code</button>' +
            '<div id="cDone"></div></section>' +
            '<section class="card" style="margin-top:16px"><h2>This phone</h2><p class="mute small">Connected to ' + esc(c.url.replace(/^https:\/\/script\.google\.com\/macros\/s\//, '').slice(0, 14)) + '… ' +
            'To change the access code use the Access code section above.</p><button class="btn ghost wide" id="sOut">Disconnect this phone</button></section>';
        function codeProblem(c) {
            if (c.length < 8) return 'at least 8 characters';
            if (/\s/.test(c)) return 'no spaces';
            if (!/[A-Za-z]/.test(c) || !/[0-9]/.test(c)) return 'letters and numbers';
            if (!/[^A-Za-z0-9]/.test(c)) return 'at least one special character, e.g. ! * - _ . ~';
            return '';
        }
        $('cOwn').oninput = function () { var p = codeProblem($('cOwn').value); $('cHint').textContent = $('cOwn').value ? (p ? 'Needs ' + p : '✔ Good') : ''; };
        function changeCode(newCode) {
            if (!confirm('Change the access code? Other phones, tablets and the screen will need their new link.')) return;
            act({ action: 'changeCode', newCode: newCode }).then(function (d) {
                var c = FD.config();
                FD.setConfig(c.url, d.code);
                var base = location.href.replace(/admin\/.*$/, '');
                var link = function (app) { return base + app + '/#api=' + encodeURIComponent(c.url) + '&code=' + encodeURIComponent(d.code); };
                $('cDone').innerHTML = '<p class="small"><b>✔ Changed.</b> New links (private):</p>' +
                    ['admin', 'calendar', 'screen'].map(function (a) { return '<label>' + { admin: 'Family Admin', calendar: 'Family Calendar', screen: 'Screen' }[a] + '</label><textarea readonly rows="3">' + esc(link(a)) + '</textarea>'; }).join('') +
                    '<p class="mute small">Or open the setup app on a computer → Connect your devices, for QR codes and the new start file.</p>';
                DATA.codeWeak = false;
            }, function () {});
        }
        $('cNew').onclick = function () { changeCode(''); };
        $('cSet').onclick = function () { var v = $('cOwn').value.trim(), p = codeProblem(v); if (p) { FD.toast('The code needs ' + p, true); return; } changeCode(v); };
        $('sSave').onclick = function () {
            var values = {}; document.querySelectorAll('[data-set]').forEach(function (i) { values[i.getAttribute('data-set')] = i.value.trim(); });
            act({ action: 'saveInstall', values: values }, 'Installation settings saved');
        };
        $('sOut').onclick = function () { if (confirm('Disconnect this phone? You’ll need the setup link again.')) { FD.clearConfig(); try { localStorage.removeItem('fdadmin.data'); } catch (e) { /* ignore */ } location.reload(); } };
    }

    /* ------------------------------------------------------------ start */

    function start() { frame(); render(); load(); }
    FD.registerSW();
    if (FD.configured()) start(); else FD.setupScreen($('app'), 'Family Admin', start);
})();
