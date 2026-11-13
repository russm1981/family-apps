/* Family Dashboard – how healthy is the screen?
 *
 * The dot by the microphone:
 *   green  = everything works: the Google Sheet answers and every widget gets its information
 *   orange = the Sheet answers, but something isn't right (a widget's service failing, the Google script out of date…)
 *   red    = the Google Sheet can't be reached at all
 * It pulses while a request is on its way.
 *
 * Tapping the version number (very bottom of the side bar) opens the status panel: what's wrong, every widget's
 * status, every version number, a full check and a diagnostics report saved to this PC.
 */
(function () {
    'use strict';
    var H = { ok: true, msg: '', at: 0, busy: false, w: {}, notes: {} };
    function api() { return window.FDApi; }
    function esc(s) { return api() ? api().esc(s) : String(s); }
    function $(id) { return document.getElementById(id); }

    function widgets() { var L = window.FDPages && FDPages.layout(); return (L && L.widgets) || []; }
    function pages() { var L = window.FDPages && FDPages.layout(); return (L && L.pages) || []; }
    function nameOf(id) {
        var w = widgets().filter(function (x) { return x.id === id; })[0]; if (!w) return id;
        var p = pages().filter(function (x) { return x.id === w.page; })[0];
        var n = { weather: 'Weather', traffic: 'Traffic', trains: 'Trains', agenda: 'Today & tomorrow', bins: 'Bins', countdown: 'Holiday countdown', news: 'News',
            flights: 'Planes', photos: 'Photos', bus: 'Buses', parcels: 'Parcels', apod: 'NASA picture', words: 'Word of the day', quote: 'Quote', spotify: 'Spotify',
            list: 'List', todo: 'To-do', memo: 'Notes', whereabouts: 'Where is everyone', clock: 'Clocks', timer: 'Timer' }[w.type] || w.type;
        return n + (p ? ' (' + p.title + ')' : '');
    }
    /** Everything wrong except the connection itself: [{ text, help }] */
    function problems() {
        var out = [];
        Object.keys(H.notes).forEach(function (k) { out.push({ text: H.notes[k], kind: k }); });
        var shown = {}; widgets().forEach(function (w) { if (w.show) shown[w.id] = 1; });
        Object.keys(H.w).forEach(function (id) { if (H.w[id].error && shown[id]) out.push({ text: nameOf(id) + ': ' + H.w[id].error, kind: 'widget' }); });
        return out;
    }
    function level() { return !H.ok ? 'err' : problems().length ? 'warn' : 'ok'; }
    function paint() {
        var el = $('sync'); if (!el) return;
        var lv = level(), n = problems().length;
        el.className = 'sync ' + lv + (H.busy ? ' pulse' : '');
        el.title = lv === 'err' ? 'Can’t reach the Google Sheet: ' + H.msg : lv === 'warn' ? n + ' problem' + (n > 1 ? 's' : '') + ' – tap the version number below for details' : 'Everything is working';
        var v = $('appVer'); if (v) v.classList.toggle('attn', lv !== 'ok');
        if ($('health') && $('health').classList.contains('on')) draw();
    }

    /* ---------------------------------------------------------------- the panel */
    var full = null, fullAt = 0, checking = false;
    function open() {
        var el = $('health');
        if (!el) {
            el = document.createElement('div'); el.id = 'health'; el.className = 'health';
            el.innerHTML = '<div class="hl-card"><div class="hl-head"><h2>Status</h2><button class="n-btn ghost" data-h="close">Close</button></div><div class="hl-body"></div></div>';
            document.body.appendChild(el);
            el.addEventListener('click', function (e) {
                if (e.target === el) return close();
                var b = e.target.closest('[data-h]'); if (!b) return;
                var a = b.getAttribute('data-h');
                if (a === 'close') close();
                else if (a === 'check') fullCheck();
                else if (a === 'save') saveReport(b);
                else if (a === 'retry') {
                    b.disabled = true; b.textContent = 'Asking the Sheet…';
                    if (window.FDPages) FDPages.refreshNow(true);
                    (window.FDBoys ? FDBoys.refresh() : Promise.resolve()).then(function () {
                        var t = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
                        if (H.ok) api().toast('✔ Connected – the Sheet answered at ' + t);
                        else api().toast('Still can’t reach the Sheet (' + t + '): ' + H.msg, true);
                        draw();
                    });
                }
                else if (a === 'forget') { if (confirm('Disconnect this screen from this family’s dashboard? It then shows a code to connect it again – to this family or another one.')) api().forget(); }
                else if (a === 'updApp') { b.disabled = true; b.textContent = 'Updating…'; FDNotices.updateNow(); }
                else if (a === 'updScript') busyBtn(b, 'Updating the Google script…', FDNotices.updateScript().then(function (r) { api().toast(r.upToDate ? 'Already up to date' : 'Google script updated'); }));
                else if (a === 'autoOn') busyBtn(b, 'Turning on…', FDNotices.autoOn().then(function (r) { api().toast(r.autoUpdate ? 'Automatic updates are on' + (r.warning ? ' – but: ' + r.warning : '') : 'Couldn’t turn them on', !r.autoUpdate || !!r.warning); }));
                else if (a === 'recheck') { FDNotices.recheck(); api().toast('Checking…'); }
            });
        }
        el.classList.add('on'); draw();
        clearTimeout(open.t); open.t = setTimeout(close, 5 * 60000);
    }
    function close() { var el = $('health'); if (el) el.classList.remove('on'); }
    function draw() {
        var body = document.querySelector('#health .hl-body'); if (!body) return;
        var lv = level(), probs = problems(), N = window.FDNotices, L = (N && N.layout()) || {}, latest = (N && N.latest()) || {};
        var headline = lv === 'err' ? '<b>Can’t reach the Google Sheet.</b> ' + esc(H.msg) : lv === 'warn' ? '<b>Working, with ' + probs.length + ' problem' + (probs.length > 1 ? 's' : '') + '.</b>' : '<b>Everything is working.</b>';
        var rows = widgets().filter(function (w) { return w.show; }).map(function (w) {
            var s = full && full[w.id] ? full[w.id] : H.w[w.id], st, cls;
            if (!s) { st = NO_DATA[w.type] ? 'Works on this screen' : 'Not checked yet'; cls = NO_DATA[w.type] ? 'ok' : 'mute'; }
            else if (s.error) { st = s.error; cls = 'bad'; }
            else { st = 'Working' + (s.ms >= 1500 ? ' (slow: ' + (s.ms / 1000).toFixed(1) + ' s)' : ''); cls = 'ok'; }
            return '<tr><td>' + esc(nameOf(w.id)) + '</td><td class="hl-' + cls + '">' + esc(st) + '</td></tr>';
        }).join('');
        var lic = L.licence || {};
        var vrow = function (k, v, warn) { return '<tr><td>' + k + '</td><td' + (warn ? ' class="hl-bad"' : '') + '>' + esc(v || '?') + '</td></tr>'; };
        var behind = function (a, b) { return a && b && N && N.newer(b, a); };
        body.innerHTML = '<div class="hl-sum hl-' + lv + '"><i class="sync ' + lv + '"></i><span>' + headline + '</span></div>' +
            (probs.length ? '<ul class="hl-probs">' + probs.map(function (p) { return '<li>' + esc(p.text) + '</li>'; }).join('') + '</ul>' : '') +
            '<div class="hl-cols"><div><h3>Widgets</h3><table class="hl-t">' + rows + '</table></div>' +
            '<div>' + updBlock(N, L, latest) + '<h3>Versions</h3><table class="hl-t">' +
                vrow('Screen', (N && N.version) + (behind(N && N.version, latest.app) ? ' (newer: ' + latest.app + ')' : ' – up to date'), behind(N && N.version, latest.app)) +
                vrow('Google script', (L.scriptVersion || '?') + (behind(L.scriptVersion, latest.script) ? ' (newer: ' + latest.script + ')' : L.scriptVersion && latest.script ? ' – up to date' : ''), behind(L.scriptVersion, latest.script)) +
                vrow('Newest available', latest.app ? 'apps ' + latest.app + ', script ' + latest.script : '?') +
                vrow('Automatic updates', L.autoUpdate ? 'On' : 'Off', !L.autoUpdate) +
                vrow('Licence', lic.required ? lic.message : 'Not needed', lic.required && !lic.ok) +
                vrow('Last answer from the Sheet', H.at ? new Date(H.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : 'none yet', !H.ok) +
            '</table><div class="hl-btns"><button class="n-btn" data-h="check"' + (checking ? ' disabled' : '') + '>' + (checking ? 'Checking every widget…' : 'Check everything now') + '</button>' +
            '<button class="n-btn ghost" data-h="retry">Try the Sheet again</button>' +
            '<button class="n-btn ghost" data-h="save">Save a diagnostics report to this PC</button>' +
            '<button class="n-btn ghost" data-h="forget">Disconnect this screen</button></div>' +
            '</div></div>' + qrBlock() + '<div><div>' +
            '<p class="hl-foot">To email a report to support, use Family Admin on your phone → Settings → Versions & diagnostics. ' +
            'Private details (access code, keys, addresses, names) are locked so only support can read them.</p></div></div>';
    }
    /** Updates: what's waiting, what's been put off, and buttons to do it now. */
    function updBlock(N, L, latest) {
        if (!N) return '';
        var t = function (ms) { return new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); };
        var appBehind = latest.app && N.newer(latest.app, N.version), scrBehind = latest.script && L.scriptVersion && N.newer(latest.script, L.scriptVersion);
        var items = [];
        if (appBehind) {
            var sz = N.snoozedUntil();
            items.push('<li><b>Screen update ' + esc(latest.app) + ' is available</b> – not installed yet. ' +
                (sz ? 'You chose “Later”: it asks again at ' + t(sz) + ', or updates by itself once nobody has touched the screen for 3 minutes.' : 'It installs itself once nobody has touched the screen for 3 minutes.') +
                ' <button class="n-btn" data-h="updApp">Update the screen now</button></li>');
        }
        if (scrBehind) items.push('<li><b>Google script ' + esc(latest.script) + ' is available</b> – you have ' + esc(L.scriptVersion) + '. ' +
            (L.autoUpdate ? 'It should update itself within a few minutes.' : 'Automatic updates are off, so it won’t update by itself.') +
            ' <button class="n-btn" data-h="updScript">Update the Google script now</button></li>');
        if (!L.autoUpdate) items.push('<li><b>Automatic updates are off.</b> Turn them on and the Google script keeps itself up to date (it checks every 5 minutes). ' +
            '<button class="n-btn" data-h="autoOn">Turn automatic updates on</button></li>');
        var head = '<h3>Updates</h3>';
        if (!latest.app) return head + '<p class="hl-upd-ok">Not checked yet. <button class="n-btn ghost" data-h="recheck">Check for updates</button></p>';
        if (!items.length) return head + '<p class="hl-upd-ok">✔ Everything is up to date and installed. <button class="n-btn ghost" data-h="recheck">Check again</button></p>';
        return head + '<ul class="hl-upd">' + items.join('') + '</ul>';
    }
    function busyBtn(b, text, p) {
        b.disabled = true; b.textContent = text;
        p.then(function () { draw(); }, function (e) { api().toast(e.message, true); draw(); });
    }
    /** QR codes: the phone apps (already connected to this family), this screen for a tablet, and the Family Dashboard home page. */
    function appsBase() {
        if (/^https?:/.test(location.protocol)) return new URL('../', location.href).href;
        var L = window.FDNotices && FDNotices.layout(); return L && L.appsAddress ? String(L.appsAddress).replace(/\/?$/, '/') : '';
    }
    function qrSvg(text) {
        if (!window.qrcode || !text) return '';
        try { var q = qrcode(0, 'M'); q.addData(text); q.make(); return q.createSvgTag({ cellSize: 3, margin: 2, scalable: true }); } catch (e) { return ''; }
    }
    function qrBlock() {
        var base = appsBase(), c = api() && api().config ? api().config() : {};
        if (!base) return '';
        var hash = c.url && c.code ? '#api=' + encodeURIComponent(c.url) + '&code=' + encodeURIComponent(c.code) : '';
        var items = [['Family Calendar', 'phone app – everyone', base + 'calendar/' + hash], ['Family Admin', 'phone app – parents', base + 'admin/' + hash],
            ['Tablet or Pi screen', 'opens this dashboard', base + 'screen/' + hash], ['Family Dashboard home', 'setup, help, what’s new', base]];
        return '<div class="hl-qr"><h3>Scan with a phone</h3><div class="hl-qrs">' + items.map(function (x) {
            return '<div class="hl-q"><div class="hl-qi">' + qrSvg(x[2]) + '</div><b>' + esc(x[0]) + '</b><span>' + esc(x[1]) + '</span></div>'; }).join('') +
            '</div><p class="hl-foot">The first three already know your family’s access code – only let family members scan them.</p></div>';
    }
    // Widgets that need nothing from the Sheet.
    var NO_DATA = { clock: 1, timer: 1, memo: 1, quote: 1 };

    function fullCheck() {
        if (checking || !api() || !api().ready()) return;
        checking = true; draw();
        api().get('diagnostics', { app: window.FDNotices ? FDNotices.version : '' }, 240000).then(function (d) {
            checking = false; full = {}; fullAt = Date.now();
            (d.report.widgets || []).forEach(function (w) {
                full[w.id] = /^ERROR: /.test(w.data || '') ? { error: w.data.slice(7) } : { ok: true, ms: w.ms };
                H.w[w.id] = full[w.id];
            });
            fullCheck.last = d; paint(); draw();
        }).catch(function (e) { checking = false; draw(); api().toast('The check didn’t finish: ' + e.message, true); });
    }
    function b64(buf) { var s = '', b = new Uint8Array(buf); for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s); }
    function saveReport(btn) {
        btn.disabled = true; btn.textContent = 'Making the report…';
        var got = fullCheck.last && Date.now() - fullAt < 10 * 60000 ? Promise.resolve(fullCheck.last) : api().get('diagnostics', { app: window.FDNotices ? FDNotices.version : '' }, 240000);
        got.then(function (d) {
            var screenInfo = { from: 'the screen', userAgent: navigator.userAgent, size: innerWidth + '×' + innerHeight, online: navigator.onLine, status: level(), problems: problems().map(function (p) { return p.kind === 'widget' ? p.text.replace(/:.*/, ': (error – see locked part)') : p.text; }) };
            var body = 'FAMILY DASHBOARD – DIAGNOSTICS REPORT (from the screen)\nMade ' + new Date().toString() + '\n\nThe readable part has no access code, keys, addresses or names; those are in the locked part at the end.\n\n' +
                JSON.stringify(Object.assign({ thisScreen: screenInfo }, d.report), null, 2);
            if (!d.supportKey || !window.crypto || !crypto.subtle) return body + '\n\n(No locked part: support key not available. Nothing private is included.)\n';
            var secrets = Object.assign({ screenProblems: problems().map(function (p) { return p.text; }), screenLastError: H.msg }, d.secrets), aes, iv = crypto.getRandomValues(new Uint8Array(12));
            return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt']).then(function (k) { aes = k; return crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, k, new TextEncoder().encode(JSON.stringify(secrets))); })
                .then(function (data) { return Promise.all([data, crypto.subtle.exportKey('raw', aes), crypto.subtle.importKey('jwk', d.supportKey, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt'])]); })
                .then(function (x) { return crypto.subtle.encrypt({ name: 'RSA-OAEP' }, x[2], x[1]).then(function (k) {
                    return body + '\n\n----- ENCRYPTED PRIVATE PART (only Family Dashboard support can open this) -----\nFDENC1:' + btoa(JSON.stringify({ v: 1, k: b64(k), iv: b64(iv), d: b64(x[0]) })).replace(/(.{76})/g, '$1\n') + '\n----- END -----\n'; }); });
        }).then(function (txt) {
            var a = document.createElement('a'), name = 'family-dashboard-diagnostics-' + new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '') + '.txt';
            a.href = URL.createObjectURL(new Blob([txt], { type: 'text/plain' })); a.download = name; document.body.appendChild(a); a.click(); a.remove();
            btn.disabled = false; btn.textContent = 'Saved to Downloads ✔';
        }).catch(function (e) { btn.disabled = false; btn.textContent = 'Save a diagnostics report to this PC'; api().toast(e.message, true); });
    }

    // Tap the version number (bottom of the side bar) to open the panel.
    document.addEventListener('click', function (e) { if (e.target.closest('#appVer') || e.target.closest('.rail-foot .sync')) open(); });

    window.FDHealth = {
        redraw: function () { if ($('health') && $('health').classList.contains('on')) draw(); },
        /** From the connection: 'busy', 'ok' or 'err' (+ message). */
        sync: function (kind, msg) {
            if (kind === 'busy') H.busy = true;
            else { H.busy = false; H.ok = kind !== 'err'; H.msg = kind === 'err' ? (msg || 'No answer') : ''; if (H.ok) H.at = Date.now(); }
            paint();
        },
        /** A page's data arrived: note which widgets got their information and which gave an error. */
        data: function (data) {
            Object.keys(data || {}).forEach(function (id) {
                var d = data[id];
                if (d && d.error) H.w[id] = { error: String(d.error) }; else H.w[id] = { ok: true };
            });
            paint();
        },
        /** Something else that's wrong (key → text), or '' when it's fine again. */
        note: function (key, text) { if (text) H.notes[key] = text; else delete H.notes[key]; paint(); },
        level: level, problems: problems, open: open,
    };
})();
