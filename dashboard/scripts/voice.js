/* Family Dashboard – voice assistant.
 * Tap the microphone in the side bar, wait for the beep, then speak. Examples:
 *   "Oliver add 15 points"   "take 10 points off Amelia"   "Noah has done make your bed"   "Oliver cash in"
 *   "calendar add Oliver drums at 12 on Saturday"   "add to calendar family zoo tomorrow"
 *   "memo dentist moved to Thursday"   "add milk to the shopping list"
 *   "timer 10 minutes"   "stop the timer"   "go to calendar"   "help"
 * What it understood is shown first, and it goes ahead after a few seconds unless you tap Cancel.
 * Uses the browser's speech recognition (Microsoft Edge / Chrome; needs the internet and a microphone).
 */
(function () {
    'use strict';
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    var $ = function (id) { return document.getElementById(id); };
    function api() { return window.FDApi; }
    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    var DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    var MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
    var EXAMPLES = ['“Oliver add 15 points”', '“Take 10 points off Amelia”', '“Noah has done make your bed”', '“Calendar add Oliver drums at 12 on Saturday”',
        '“Memo dentist moved to Thursday”', '“Add milk to the shopping list”', '“Timer 10 minutes”', '“Go to calendar”'];
    var rec = null, listening = false, panel = null, countdown = null, closeT = null, stopListening = function () { if (rec) try { rec.stop(); } catch (e) { /* ignore */ } };

    /* ------------------------------------------------------------ sounds */
    var actx = null;
    function tone(freqs, len) {
        try {
            actx = actx || new (window.AudioContext || window.webkitAudioContext)();
            if (actx.state === 'suspended') actx.resume();
            freqs.forEach(function (f, i) {
                var t = actx.currentTime + i * len, o = actx.createOscillator(), g = actx.createGain();
                o.type = 'sine'; o.frequency.value = f;
                g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
                o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + len + 0.02);
            });
        } catch (e) { /* no sound */ }
    }

    /* ------------------------------------------------------------ words → meaning */
    var UNITS = { zero: 0, one: 1, a: 1, an: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
        fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
    var TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
    /** "fifteen" → 15, "twenty five" → 25, "a hundred" → 100, "one hundred and fifty" → 150 (only when they're numbers). */
    function wordsToNumbers(t) {
        var w = t.split(' '), out = [], i = 0;
        while (i < w.length) {
            var n = null, j = i, cur = 0, any = false;
            while (j < w.length) {
                var x = w[j];
                if (x in TENS) { cur += TENS[x]; any = true; j++; }
                else if (x in UNITS && !(x === 'a' || x === 'an') ) { cur += UNITS[x]; any = true; j++; }
                else if ((x === 'a' || x === 'an') && w[j + 1] === 'hundred') { cur += 1; any = true; j++; }
                else if (x === 'hundred' && any) { cur *= 100; j++; if (w[j] === 'and' && (w[j + 1] in UNITS || w[j + 1] in TENS)) j++; }
                else break;
            }
            if (any) { n = cur; out.push(String(n)); i = j; } else { out.push(w[i]); i++; }
        }
        return out.join(' ');
    }
    function clean(t) {
        t = String(t || '').toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9:.'&\- ]+/g, ' ').replace(/\s+/g, ' ').trim();
        t = t.replace(/(\d)\.(\d\d)\b/g, '$1:$2').replace(/\.(\s|$)/g, ' ').replace(/\s+/g, ' ').trim();
        return wordsToNumbers(t);
    }
    function cap(s) {
        s = String(s || '').trim();
        // Names keep their capital letters ("speak to Oliver"): the children and the calendar's people and groups.
        var names = children().map(function (b) { return b.name; }).concat(categories().map(function (c) { return c && (c.name || c.k || c); }))
            .filter(function (n) { return typeof n === 'string' && n.length > 1; });
        names.forEach(function (n) { s = s.replace(new RegExp('\\b' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'gi'), n); });
        return s.charAt(0).toUpperCase() + s.slice(1);
    }
    function near(a, b) {   // a spoken word is "near" a name: same, or one letter different for longer names
        a = a.toLowerCase(); b = b.toLowerCase();
        if (a === b || a === b + 's' || a === b + "'s") return true;
        if (b.length < 4 || Math.abs(a.length - b.length) > 1) return false;
        var m = [], i, j;
        for (i = 0; i <= a.length; i++) { m[i] = [i]; }
        for (j = 0; j <= b.length; j++) { m[0][j] = j; }
        for (i = 1; i <= a.length; i++) for (j = 1; j <= b.length; j++) m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        return m[a.length][b.length] <= 1;
    }
    /** Find one of `names` (single or several words) in the text; returns { name, at, len } for the earliest. */
    function findName(text, names) {
        var w = text.split(' '), best = null;
        names.forEach(function (n) {
            var nw = String(n).toLowerCase().replace(/&/g, ' & ').replace(/\s+/g, ' ').trim().split(' ');
            for (var i = 0; i + nw.length <= w.length; i++) {
                var ok = nw.every(function (x, k) { return x === '&' ? (w[i + k] === '&' || w[i + k] === 'and') : near(w[i + k], x); });
                if (ok && (!best || i < best.at || (i === best.at && nw.length > best.len))) { best = { name: n, at: i, len: nw.length }; break; }
            }
        });
        return best;
    }
    function without(text, hit) { var w = text.split(' '); w.splice(hit.at, hit.len); return w.join(' ').replace(/\s+/g, ' ').trim(); }

    function children() { var s = window.FDBoys && window.FDBoys.state(); return s && s.boys ? s.boys : []; }
    function categories() { try { return JSON.parse(localStorage.getItem('familyDashboard.add.v2') || '[]'); } catch (e) { return []; } }
    function widgets(type) { var L = window.FDPages && window.FDPages.layout(); return L ? L.widgets.filter(function (w) { return w.type === type && w.show; }) : []; }
    function pad(n) { return (n < 10 ? '0' : '') + n; }
    function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
    function nice(d) { return d.toLocaleDateString(window.FDL ? FDL.lang() : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long' }); }

    /** Pull a time out: "at 12", "at 3:30", "at 3 30", "at 3pm", "half past 4", "at quarter to 6". Returns { time, rest }. */
    function takeTime(t) {
        var m, h, min = 0, ap = '';
        if ((m = t.match(/\b(?:at )?(half|quarter) (past|to) (\d{1,2})\b/))) {
            h = +m[3]; min = m[1] === 'half' ? 30 : 15;
            if (m[2] === 'to') { h = h - 1; min = 60 - min; }
        } else if ((m = t.match(/\bat (\d{1,2})(?::| )?(\d\d)? ?(am|pm|a m|p m|o'clock|oclock)?\b/)) || (m = t.match(/\b(\d{1,2})(?::(\d\d))? ?(am|pm|a m|p m)\b/))) {
            h = +m[1]; min = m[2] ? +m[2] : 0; ap = (m[3] || '').replace(/ /g, '');
        } else return { time: '', rest: t };
        if (h > 23 || min > 59) return { time: '', rest: t };
        if (ap === 'pm' && h < 12) h += 12;
        else if (ap === 'am' && h === 12) h = 0;
        else if (!ap || ap.indexOf('clock') >= 0) { if (h >= 1 && h <= 7) h += 12; }     // "at 4" means 4 pm for family things
        return { time: pad(h) + ':' + pad(min), rest: t.replace(m[0], ' ').replace(/\s+/g, ' ').trim() };
    }
    /** Pull a day out: today, tomorrow, (on|next) friday, on the 14th, 14th of november, november 14. Returns { date, rest }. */
    function takeDay(t) {
        var now = new Date(), d = null, m;
        var base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        if ((m = t.match(/\b(?:on )?(today|tonight|this (?:morning|afternoon|evening))\b/))) d = base;
        else if ((m = t.match(/\b(?:on )?(?:the day after tomorrow)\b/))) d = new Date(base.getTime() + 2 * 864e5);
        else if ((m = t.match(/\b(?:on )?tomorrow(?: (?:morning|afternoon|evening|night))?\b/))) d = new Date(base.getTime() + 864e5);
        else if ((m = t.match(/\b(?:on |this |next )?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/))) {
            var want = DAYS.indexOf(m[1]), add = (want - base.getDay() + 7) % 7;
            if (/\bnext /.test(m[0]) && add === 0) add = 7;
            d = new Date(base.getTime() + add * 864e5);
        } else if ((m = t.match(/\b(?:on )?(?:the )?(\d{1,2})(?:st|nd|rd|th)?(?: of)? (january|february|march|april|may|june|july|august|september|october|november|december)\b/)) ||
                   (m = t.match(/\b(?:on )?(january|february|march|april|may|june|july|august|september|october|november|december) (?:the )?(\d{1,2})(?:st|nd|rd|th)?\b/))) {
            var day = +(isNaN(+m[1]) ? m[2] : m[1]), mon = MONTHS.indexOf(isNaN(+m[1]) ? m[1] : m[2]);
            d = new Date(base.getFullYear(), mon, day);
            if (d < base) d = new Date(base.getFullYear() + 1, mon, day);
        } else if ((m = t.match(/\bon the (\d{1,2})(?:st|nd|rd|th)?\b/))) {
            d = new Date(base.getFullYear(), base.getMonth(), +m[1]);
            if (d < base) d = new Date(base.getFullYear(), base.getMonth() + 1, +m[1]);
        }
        if (!d) return { date: null, rest: t };
        return { date: d, weekday: DAYS.some(function (x) { return m[0].indexOf(x) >= 0; }), rest: t.replace(m[0], ' ').replace(/\s+/g, ' ').trim() };
    }

    /* ------------------------------------------------------------ commands */
    /** Each parser returns null, or { say: 'what will happen', run: function () → Promise, quick: true for no countdown }. */
    var PARSERS = [
        function help(t) {
            if (!/^(help|what can i say|what can you do)\b/.test(t)) return null;
            return { help: true };
        },
        function stopAlarm(t) {
            if (!/^(stop|ok|okay|quiet|silence)( (it|that|the alarm|alarm|ringing))?$/.test(t)) return null;
            return { say: 'Stop the alarm', quick: true, run: function () { if (window.FDW && window.FDW.stopAlarm) window.FDW.stopAlarm(); return Promise.resolve(); } };
        },
        function timer(t) {
            var m;
            if (/\b(stop|cancel|reset|clear) (the )?timer\b/.test(t)) return needTimer() || { say: 'Stop the kitchen timer', quick: true, run: function () { fire({ op: 'stop' }); return Promise.resolve(); } };
            if (/\bpause (the )?timer\b/.test(t)) return needTimer() || { say: 'Pause the kitchen timer', quick: true, run: function () { fire({ op: 'pause' }); return Promise.resolve(); } };
            if (!/\btimer\b/.test(t) && !/^(set|start) (a )?\d/.test(t)) return null;
            var ms = 0, txt = [];
            var re = /(\d+(?:\.\d+)?|half an?) ?(hours?|hrs?|minutes?|mins?|seconds?|secs?)\b/g;
            while ((m = re.exec(t))) {
                var n = /half/.test(m[1]) ? 0.5 : +m[1], u = m[2].charAt(0);
                ms += n * (u === 'h' ? 3600000 : u === 'm' ? 60000 : 1000); txt.push((/half/.test(m[1]) ? 'half an' : m[1]) + ' ' + m[2]);
            }
            if (!ms && (m = t.match(/\btimer (?:for )?(\d+)$/))) { ms = +m[1] * 60000; txt.push(m[1] + ' minutes'); }
            if (!ms || ms > 24 * 3600000) return null;
            return needTimer() || { say: 'Start the kitchen timer: ' + txt.join(' '), quick: true, run: function () { fire({ op: 'start', ms: ms }); return Promise.resolve(); } };
            function fire(d) { window.dispatchEvent(new CustomEvent('fd-timer', { detail: d })); }
        },
        function calendar(t) {
            var m = t.match(/^(?:calendar|diary)(?: add| new| entry)? (.+)$/) || t.match(/^(?:add|put) (?:(?:this|it|an? (?:entry|event)) )?(?:to|in|into|on) (?:the )?(?:calendar|diary) (.+)$/) ||
                t.match(/^(?:add|put) (.+?) (?:to|in|into|on) (?:the )?(?:calendar|diary)$/) || t.match(/^(?:new|add an?) (?:calendar )?(?:entry|event) (.+)$/);
            if (!m) return null;
            var rest = m[1].replace(/^(add|for) /, '');
            var cats = categories(); if (!cats.length) return { fail: 'Open the calendar page once so I know your categories.' };
            var tm = takeTime(rest); rest = tm.rest;
            var dy = takeDay(rest); rest = dy.rest;
            // "on Saturday" said on a Saturday after that time means next Saturday.
            if (dy.date && dy.weekday && tm.time && ymd(dy.date) === ymd(new Date())) {
                var hm = tm.time.split(':'), w0 = new Date(); w0.setHours(+hm[0], +hm[1], 0, 0);
                if (w0 < new Date()) dy.date = new Date(dy.date.getTime() + 7 * 864e5);
            }
            // The most specific category mentioned: a person ("Oliver") wins over their group ("Children").
            var people = cats.map(function (c) { return c.name; });
            var hits = [], txt = rest, h;
            while ((h = findName(txt, people))) { hits.push(h.name); txt = without(txt, h); }
            if (!hits.length) return { fail: 'Say who it’s for, e.g. “calendar add Oliver drums at 12”. Categories: ' + people.join(', ') + '.' };
            // If both a group ("Children") and someone in it ("Oliver") were said, the person wins.
            var groups = []; try { groups = JSON.parse(localStorage.getItem('familyDashboard.cats.v2') || '[]').map(function (c) { return c.name; }); } catch (e) { groups = []; }
            var specific = hits.filter(function (n) { return groups.indexOf(n) < 0; });
            var cat = (specific.length ? specific : hits)[0];
            var title = txt.replace(/^(?:at|for|is|has|to|-|–)\s+/, '').replace(/\s+(?:at|on|for)$/, '').replace(/^(?:at|for|is|has|to)\s+/, '').trim();
            if (!title) return { fail: 'Say what it is, e.g. “calendar add Oliver drums at 12”.' };
            var d = dy.date || new Date();
            if (!dy.date && tm.time) {          // "at 12" with no day: today, or tomorrow if that time has gone
                var p = tm.time.split(':'), when = new Date(); when.setHours(+p[0], +p[1], 0, 0);
                if (when < new Date()) d = new Date(Date.now() + 864e5);
            }
            title = cap(title).slice(0, 40);
            return { say: 'Add to the calendar: <b>' + esc(cat) + ' – ' + esc(title) + '</b>, ' + nice(d) + (tm.time ? ' at ' + tm.time : ' (all day)'),
                run: function () {
                    return api().post({ action: 'addEvent', category: cat, title: title, note: '', start: ymd(d), end: ymd(d), time: tm.time }).then(function () {
                        if (window.FDScreens && window.FDScreens.calendar && window.FDScreens.calendar.reset) window.FDScreens.calendar.reset();
                        if (window.FDPages) window.FDPages.refreshNow(true);
                    });
                } };
        },
        function memo(t) {
            var m = t.match(/^(?:memo|note|sticky note|reminder note)(?: add| to say| saying| that)? (.+)$/) || t.match(/^(?:add|new|make|write) (?:a )?(?:memo|note|sticky note)(?: to say| saying| that)? (.+)$/);
            if (!m) return null;
            if (!widgets('memo').length) return { fail: 'There’s no Memo widget on the screen – add one in the admin app.' };
            var text = cap(m[1]).slice(0, 80);
            return { say: 'New memo: <b>' + esc(text) + '</b>', run: function () {
                return api().post({ action: 'memo', op: 'add', text: text, from: '' }).then(function () { if (window.FDPages) window.FDPages.refreshNow(true); });
            } };
        },
        function points(t) {
            var kids = children(); if (!kids.length) return null;
            var who = findName(t, kids.map(function (b) { return b.name; })); if (!who) return null;
            var rest = without(t, who), m, n = 0, sign = 0;
            if ((m = rest.match(/\b(?:add|plus|give|gets?|got|earns?|earned|award|bonus|reward)(?: him| her| them)? (\d+)(?: points?| bonus points?)?\b/)) ||
                (m = rest.match(/^(\d+)(?: points?)? (?:to|for)\b/)) || (m = rest.match(/^(?:plus |\+)(\d+)/))) { n = +m[1]; sign = 1; }
            else if ((m = rest.match(/\b(?:minus|lose|loses|lost|take|takes|took|remove|deduct|subtract|penalty|fine)(?: away)?(?: of)? (\d+)(?: points?)?/)) || (m = rest.match(/^-(\d+)/))) { n = +m[1]; sign = -1; }
            if (n && sign) {
                if (n > 1000) return { fail: 'That’s a lot of points – the most is 1000.' };
                return { say: (sign > 0 ? 'Give <b>' + esc(who.name) + '</b> ' + n + ' bonus points' : 'Take <b>' + n + '</b> points off <b>' + esc(who.name) + '</b>'),
                    run: function () {
                        return api().post(sign > 0 ? { action: 'adjust', boy: who.name, points: n, reason: 'Bonus' } : { action: 'penalty', boy: who.name, points: n, reason: 'Penalty' })
                            .then(function () { return window.FDBoys && window.FDBoys.refresh(); });
                    } };
            }
            if (/\bcash(?:es|ed)? (?:in|out)\b/.test(rest)) {
                return { say: 'Cash in <b>' + esc(who.name) + '</b>’s points', run: function () {
                    return api().post({ action: 'cashin', boy: who.name }).then(function () { return window.FDBoys && window.FDBoys.refresh(); });
                } };
            }
            if ((m = rest.match(/^(?:has |'s |is )?(?:done|did|finished|completed|complete|tick|ticked)(?: off)?(?: the| his| her| their)? (.+)$/) ||
                     rest.match(/^(?:tick|done|complete)(?: off)? (.+)$/))) {
                var STOP = ['the', 'your', 'his', 'her', 'their', 'and', 'for', 'with', 'all', 'some', 'has', 'have', 'did', 'done'];
                var want = m[1].split(' ').filter(function (x) { return x.length > 2 && STOP.indexOf(x) < 0; });
                var kid = kids.filter(function (b) { return b.name === who.name; })[0], tasks = kid.allTasks || kid.tasks || [];
                var best = null, score = 0;
                tasks.forEach(function (tk) {
                    var tw = String(tk.text || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/);
                    var sc = want.filter(function (x) { return tw.some(function (y) { return near(x, y) || (y.length > 3 && x.indexOf(y) === 0); }); }).length;
                    if (sc > score) { score = sc; best = tk; }
                });
                // Most of the important words have to match, or it's probably a different task.
                if (!best || score < Math.max(1, Math.ceil(want.length / 2))) return { fail: 'I couldn’t find “' + m[1] + '” in ' + who.name + '’s tasks (it may already be done).' };
                var name = best.text;
                return { say: 'Tick off <b>' + esc(name) + '</b> for <b>' + esc(who.name) + '</b>' + (best.points ? ' (+' + best.points + ')' : ''), run: function () {
                    return api().post({ action: 'complete', boy: who.name, taskId: best.id }).then(function () { return window.FDBoys && window.FDBoys.refresh(); });
                } };
            }
            return null;
        },
        function list(t) {
            var lists = widgets('list').concat(widgets('todo'));
            if (!lists.length) return null;
            var names = lists.map(function (w) { return { w: w, n: String(w.type === 'todo' ? (w.settings.Title || 'to do') : (w.settings.ListName || 'shopping')).toLowerCase() }; });
            var m = t.match(/^(?:add|put) (.+?) (?:to|on|onto) (?:the |my )?(.+?)(?: list)?$/) || t.match(/^(.+?)(?: list)? add (.+)$/);
            if (!m) return null;
            var item, target, isAdd = /^(add|put) /.test(t);
            if (isAdd) { item = m[1]; target = m[2]; } else { target = m[1]; item = m[2]; }
            if (/^(the )?(calendar|diary)$/.test(target)) return null;
            var hit = names.filter(function (x) { return near(target.replace(/^the /, '').replace(/ list$/, ''), x.n) || target.indexOf(x.n) >= 0 || x.n.indexOf(target) >= 0; })[0];
            if (!hit && /^(shopping|list|groceries|shop)$/.test(target)) hit = names.filter(function (x) { return x.w.type === 'list'; })[0];
            if (!hit) return null;
            var text = cap(item).slice(0, 60);
            return { say: 'Add <b>' + esc(text) + '</b> to ' + esc(cap(hit.n)), run: function () {
                return api().post({ action: 'listItem', widget: hit.w.id, op: 'add', text: text }).then(function () { if (window.FDPages) window.FDPages.refreshNow(true); });
            } };
        },
        function nav(t) {
            var m = t.match(/^(?:go to|show(?: me)?|open|switch to)(?: the)? (.+?)(?: page| screen)?$/) || t.match(/^(.+?)(?: page| screen)$/);
            var pages = window.FDPages ? window.FDPages.pages() : [];
            var want = m ? m[1] : t;
            var hit = findName(want, pages.map(function (p) { return p.title; }));
            if (!hit || (!m && hit.len !== want.split(' ').length)) return null;
            var p = pages.filter(function (x) { return x.title === hit.name; })[0];
            return { say: 'Show the ' + esc(p.title) + ' page', quick: true, run: function () { window.FDPages.show(p.id); return Promise.resolve(); } };
        },
    ];
    function needTimer() { return window.FDW && window.FDW.hasTimer ? null : { fail: 'There’s no kitchen timer on the screen – add one in the admin app (Widgets).' }; }

    function understand(alts) {
        var fail = null;
        for (var i = 0; i < alts.length; i++) {
            var t = clean(alts[i]);
            if (!t) continue;
            for (var k = 0; k < PARSERS.length; k++) {
                var r = null;
                try { r = PARSERS[k](t); } catch (e) { r = null; }
                if (r && !r.fail) return Object.assign(r, { heard: alts[i] });
                if (r && r.fail && !fail) fail = Object.assign(r, { heard: alts[i] });
            }
        }
        return fail || { heard: alts[0] || '', fail: 'Sorry, I didn’t understand that.' };
    }

    /* ------------------------------------------------------------ panel */
    function show(html, cls) {
        if (!panel) {
            panel = document.createElement('div'); panel.id = 'voice'; panel.className = 'voice';
            document.body.appendChild(panel);
            panel.addEventListener('click', function (e) {
                var b = e.target.closest('[data-v]'); if (!b) { if (e.target === panel) close(); return; }
                var a = b.getAttribute('data-v');
                if (a === 'cancel') close(); else if (a === 'done') stopListening(); else if (a === 'again') start(); else if (a === 'do' && panel.pending) go(panel.pending);
            });
        }
        clearTimeout(closeT);
        panel.className = 'voice on ' + (cls || '');
        panel.innerHTML = '<div class="vc-card">' + html + '</div>';
    }
    function close() {
        clearInterval(countdown); clearTimeout(closeT);
        if (rec && listening) { try { rec.abort(); } catch (e) { /* ignore */ } }
        listening = false; setMic(false);
        if (panel) { panel.className = 'voice'; panel.pending = null; }
    }
    function helpHtml() { return '<div class="vc-help"><b>Try saying</b>' + EXAMPLES.map(function (x) { return '<span>' + x + '</span>'; }).join('') + '</div>'; }
    function setMic(on) { var b = $('micBtn'); if (b) b.classList.toggle('on', !!on); }

    function handle(alts) {
        var r = understand(alts);
        var heard = '<div class="vc-heard">“' + esc(r.heard) + '”</div>';
        if (r.help) { show('<div class="vc-state">🎤 Voice commands</div>' + helpHtml() + btns(['again', 'Speak'], ['cancel', 'Close'])); return; }
        if (r.fail) { tone([440, 330], 0.15); show('<div class="vc-state bad">🤔 ' + esc(r.fail) + '</div>' + heard + helpHtml() + btns(['again', 'Try again'], ['cancel', 'Close']), 'fail'); return; }
        panel && (panel.pending = null);
        if (r.quick) { go(r); return; }
        var n = 4;
        show('<div class="vc-state">' + r.say + '</div>' + heard + btns(['do', 'Do it (' + n + ')'], ['cancel', 'Cancel']));
        panel.pending = r;
        clearInterval(countdown);
        countdown = setInterval(function () {
            n--;
            var b = panel.querySelector('[data-v=do]'); if (b) b.textContent = 'Do it (' + n + ')';
            if (n <= 0) { clearInterval(countdown); if (panel.pending === r) go(r); }
        }, 1000);
    }
    function btns() {
        return '<div class="vc-btns">' + Array.prototype.map.call(arguments, function (b) { return '<button data-v="' + b[0] + '" class="vc-b ' + b[0] + '">' + b[1] + '</button>'; }).join('') + '</div>';
    }
    function go(r) {
        clearInterval(countdown);
        panel.pending = null;
        show('<div class="vc-state">⏳ ' + r.say + '</div>');
        r.run().then(function () {
            tone([880, 1320], 0.1);
            show('<div class="vc-state good">✔ ' + r.say + '</div>', 'done');
            closeT = setTimeout(close, 2200);
        }).catch(function (e) {
            tone([440, 330], 0.15);
            show('<div class="vc-state bad">⚠ ' + esc(e.message || 'That didn’t work') + '</div>' + btns(['again', 'Try again'], ['cancel', 'Close']), 'fail');
        });
    }

    /* ------------------------------------------------------------ listening */
    function start() {
        if (!SR) { show('<div class="vc-state bad">Voice needs Microsoft Edge or Google Chrome.</div>' + btns(['cancel', 'Close']), 'fail'); return; }
        if (!api() || !api().ready()) { show('<div class="vc-state bad">Connect the screen to your Google Sheet first.</div>' + btns(['cancel', 'Close']), 'fail'); return; }
        if (listening) { stopListening(); return; }
        clearInterval(countdown);
        rec = new SR();
        // Keep listening through short pauses ("memo … speak to Oliver"): finish 2.5 seconds after the last word,
        // after 8 seconds if nothing is said, after 25 seconds at most, or when Done (or the microphone) is tapped.
        rec.lang = 'en-GB'; rec.interimResults = true; rec.maxAlternatives = 4; rec.continuous = true;
        var finals = [], lastAlts = null, interim = '', quiet = null, cap = null;
        var stopNow = function () { clearTimeout(quiet); clearTimeout(cap); try { rec.stop(); } catch (e) { /* ignore */ } };
        var wait = function (ms) { clearTimeout(quiet); quiet = setTimeout(stopNow, ms); };
        var heardText = function () { return (finals.join(' ') + ' ' + interim).replace(/\s+/g, ' ').trim(); };
        rec.onstart = function () { listening = true; setMic(true); wait(8000); cap = setTimeout(stopNow, 25000); };
        rec.onresult = function (e) {
            finals = []; interim = ''; lastAlts = null;
            for (var i = 0; i < e.results.length; i++) {
                var r = e.results[i];
                if (r.isFinal) { finals.push(r[0].transcript.trim()); lastAlts = Array.prototype.map.call(r, function (a) { return a.transcript.trim(); }); }
                else interim += r[0].transcript;
            }
            var h = panel && panel.querySelector('.vc-heard'); if (h) h.textContent = '“' + heardText() + '…”';
            wait(2500);
        };
        rec.onerror = function (e) {
            clearTimeout(quiet); clearTimeout(cap);
            if (e.error === 'no-speech' && heardText()) return;           // a pause after speaking – onend handles what was said
            listening = false; setMic(false);
            var msg = { 'no-speech': 'I didn’t hear anything.', 'not-allowed': 'The microphone is blocked. Allow it for this page (see the update notes).',
                'service-not-allowed': 'Speech recognition isn’t allowed in this browser.', 'audio-capture': 'No microphone found – is it plugged in?',
                network: 'Speech recognition needs the internet.' }[e.error] || ('Voice error: ' + e.error);
            if (e.error === 'aborted') return;
            show('<div class="vc-state bad">🎤 ' + esc(msg) + '</div>' + btns(['again', 'Try again'], ['cancel', 'Close']), 'fail');
        };
        rec.onend = function () {
            clearTimeout(quiet); clearTimeout(cap);
            listening = false; setMic(false);
            var text = heardText();
            if (text) {
                // Alternatives for the last stretch of speech, with what came before it in front.
                var before = (lastAlts && !interim ? finals.slice(0, -1).join(' ') : '');
                var alts = lastAlts && !interim ? lastAlts.map(function (a) { return (before + ' ' + a).trim(); }) : [text];
                if (alts.indexOf(text) < 0) alts.unshift(text);
                handle(alts);
            } else if (panel && /listening/.test(panel.className)) show('<div class="vc-state bad">🎤 I didn’t hear anything.</div>' + helpHtml() + btns(['again', 'Try again'], ['cancel', 'Close']), 'fail');
        };
        stopListening = stopNow;
        show('<div class="vc-state"><span class="vc-dot"></span>Listening… take your time</div><div class="vc-heard">Speak after the beep</div>' + btns(['done', 'Done'], ['cancel', 'Cancel']), 'listening');
        tone([660, 990], 0.12);
        setTimeout(function () { try { rec.start(); } catch (e) { show('<div class="vc-state bad">' + esc(e.message) + '</div>' + btns(['cancel', 'Close']), 'fail'); } }, 260);
    }

    function addButton() {
        var foot = document.querySelector('#rail .rail-foot');
        if (!foot || $('micBtn')) return;
        var b = document.createElement('button');
        b.id = 'micBtn'; b.className = 'mic-btn' + (SR ? '' : ' off'); b.type = 'button'; b.setAttribute('aria-label', 'Voice commands');
        b.innerHTML = '<svg viewBox="0 0 24 24" width="100%" height="100%"><path fill="currentColor" d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z"/></svg>';
        b.addEventListener('click', start);
        foot.insertBefore(b, foot.firstChild);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addButton); else addButton();

    window.FDVoice = { start: start, close: close, understand: function (t) { var r = understand([].concat(t)); return { say: r.say, fail: r.fail, help: r.help }; } };
})();
