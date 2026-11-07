/* Family Dashboard – first-time setup wizard.
 * Walks a new family through: copying the Google Sheet + code, running setup, publishing the web app,
 * entering their details and API keys (saved straight into their Sheet), starting the screen and the phone apps,
 * and finally checks every widget is working.
 */
(function () {
    'use strict';
    var KEY = 'fdsetup.v1';
    var CFG = window.FD_SETUP || {};
    var S = load();
    var $ = function (id) { return document.getElementById(id); };
    function load() { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; } }
    function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ignore */ } }
    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function toast(t, bad) { var el = $('toast'); el.textContent = t; el.className = 'toast on' + (bad ? ' bad' : ''); clearTimeout(toast.h); toast.h = setTimeout(function () { el.className = 'toast'; }, 3500); }
    var appsBase = location.href.replace(/setup\/.*$/, '');

    /* ------------------------------------------------------------ talking to the user's Google script */

    function call(url, opts) {
        var ctl = new AbortController(), t = setTimeout(function () { ctl.abort(); }, 60000);
        opts = opts || {}; opts.signal = ctl.signal; opts.redirect = 'follow';
        return fetch(url, opts).then(function (r) {
            if (!r.ok) throw new Error('Google said ' + r.status);
            return r.text();
        }).then(function (txt) {
            var d;
            try { d = JSON.parse(txt); } catch (e) { throw new Error(/<html/i.test(txt) ? 'That address opened a Google page instead of the app – check "Who has access" is set to Anyone' : 'Unexpected reply'); }
            if (d && d.ok === false) throw new Error(d.error || 'Request failed');
            return d;
        }).catch(function (e) {
            if (e.name === 'AbortError') throw new Error('No reply from Google after a minute – try again');
            if (/Failed to fetch|NetworkError|Load failed/i.test(e.message)) throw new Error('Couldn’t reach that address. Check it ends in /exec and that the deployment is "Anyone".');
            throw e;
        }).finally(function () { clearTimeout(t); });
    }
    function get(action, params) {
        var q = 'action=' + action + (S.code ? '&code=' + encodeURIComponent(S.code) : '') + '&t=' + Date.now();
        Object.keys(params || {}).forEach(function (k) { q += '&' + k + '=' + encodeURIComponent(params[k]); });
        return call(S.url + (S.url.indexOf('?') >= 0 ? '&' : '?') + q);
    }
    function post(body) {
        body.code = S.code;
        return call(S.url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) });
    }

    /* ------------------------------------------------------------ helpers for pages */

    function copyBox(id, label, text, rows) {
        return '<div class="copy"><div class="copy-top"><b>' + esc(label) + '</b><button class="btn sm" data-copy="' + id + '">Copy</button></div>' +
            '<textarea id="' + id + '" readonly rows="' + (rows || 3) + '">' + esc(text || '') + '</textarea></div>';
    }
    function filesBox(name, label) {
        return '<div class="copy"><div class="copy-top"><b>' + esc(label) + '</b><button class="btn sm" data-copyfile="files/' + name + '">Copy the code</button>' +
            '<a class="btn sm ghost" href="files/' + name + '" download>Download</a></div></div>';
    }
    function okLine(ok, text) { return '<div class="status ' + (ok ? 'ok' : 'bad') + '">' + (ok ? '✔ ' : '⚠ ') + esc(text) + '</div>'; }
    function connected() { return !!(S.url && S.code && S.connected); }
    function needConnect() { return connected() ? '' : '<div class="note bad">Connect to your Google Sheet first (step 4).</div>'; }
    function linkFor(app) { return appsBase + app + '/#api=' + encodeURIComponent(S.url) + '&code=' + encodeURIComponent(S.code); }
    function screenUrl() { return appsBase + 'screen/?api=' + encodeURIComponent(S.url) + '&code=' + encodeURIComponent(S.code); }
    function qr(text) {
        if (!window.qrcode) return '';
        var q = window.qrcode(0, 'M'); q.addData(text); q.make();
        return '<div class="qr">' + q.createSvgTag({ cellSize: 4, margin: 2, scalable: true }) + '</div>';
    }

    /* ------------------------------------------------------------ the steps */

    var KEYS = [
        { k: 'TomTomKey', name: 'TomTom', need: 'Traffic times and all the maps (traffic and flights)', widgets: ['traffic'], free: 'Free: 2,500 requests a day – plenty.',
          steps: ['Go to <a href="https://developer.tomtom.com/" target="_blank" rel="noopener">developer.tomtom.com</a> and click <b>Register</b> (free).',
                  'Confirm your email, then sign in and open your <b>Dashboard</b>.',
                  'Under <b>Keys</b> you’ll see "My first API key" – click it and copy the key.'] },
        { k: 'RailDataKey', name: 'National Rail (Rail Data Marketplace)', need: 'The live train departure board', widgets: ['trains'], free: 'Free.',
          steps: ['Go to <a href="https://raildata.org.uk/" target="_blank" rel="noopener">raildata.org.uk</a> and register (free).',
                  'Search the catalogue for <b>Live Departure Board</b> (from Rail Delivery Group) and click <b>Subscribe</b>.',
                  'Open <b>My subscriptions</b> → that product → <b>Specification</b> and copy the <b>Consumer key</b>.'] },
        { k: 'TransportApiId', k2: 'TransportApiKey', name: 'TransportAPI', need: 'Live bus times', widgets: ['bus'], free: 'Free: 30 updates a day (the screen spreads them over school-run times).',
          steps: ['Go to <a href="https://developer.transportapi.com/signup" target="_blank" rel="noopener">developer.transportapi.com/signup</a> and sign up for the free plan.',
                  'Sign in and open <b>Applications</b> (or Dashboard).',
                  'Copy the <b>Application ID</b> and the <b>Key</b>.'] },
        { k: 'NasaKey', name: 'NASA', need: 'The NASA picture of the day', widgets: ['apod'], free: 'Free. Works without one for a while (DEMO_KEY), but that runs out.',
          steps: ['Go to <a href="https://api.nasa.gov/" target="_blank" rel="noopener">api.nasa.gov</a> and fill in the short form under <b>Generate API Key</b>.',
                  'The key appears straight away (and is emailed to you). Copy it.'] },
        { k: 'SpotifyClientId', k2: 'SpotifyClientSecret', name: 'Spotify', need: 'What’s playing, with play/pause/skip (needs Spotify Premium)', widgets: ['spotify'], free: 'Free for you; needs a Premium account.',
          steps: ['Go to <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noopener">developer.spotify.com/dashboard</a>, log in and click <b>Create app</b>.',
                  'Any name and description. For <b>Redirect URI</b> paste your web app address (copy it below). Tick <b>Web API</b>, agree, Save.',
                  'Open the app’s <b>Settings</b>: copy the <b>Client ID</b>, then <b>View client secret</b> and copy that too.',
                  'After saving here, open the Family Admin app → Widgets → Spotify → <b>Connect Spotify</b> (one-off).'] },
    ];

    var STEPS = [
        { id: 'welcome', title: 'Welcome', render: function () {
            return '<h1>Let’s set up your Family Dashboard</h1>' +
                '<p class="lead">About 30–45 minutes, mostly copying keys from free websites. You can stop at any point and come back.</p>' +
                '<div class="grid2"><div class="card"><h3>What you’ll end up with</h3><ul>' +
                '<li>A touch dashboard: weather, traffic, trains, bins, calendar, the boys’ points, flights overhead, photos and more.</li>' +
                '<li>A Google Sheet that holds everything – yours, in your own Google account.</li>' +
                '<li>Two phone apps: <b>Family Calendar</b> and <b>Family Admin</b>.</li></ul></div>' +
                '<div class="card"><h3>What you need</h3><ul><li>A Google (Gmail) account.</li>' +
                '<li>A screen: a Windows PC with a Corsair XENEON EDGE, a Raspberry Pi with a screen, or a wall tablet.</li>' +
                '<li>This page open on a computer (easier than a phone for the copying).</li></ul></div></div>' +
                '<div class="note">Nothing is sent anywhere except your own Google account and the free services you choose.</div>';
        } },
        { id: 'sheet', title: 'Make your Google Sheet', render: function () {
            var tpl = CFG.templateId;
            return '<h1>1. Make your Google Sheet</h1>' +
                (tpl ? '<div class="card big"><h3>The quick way</h3><p>This makes your own copy of the Family Dashboard Sheet, with all the code already inside.</p>' +
                    '<a class="btn" target="_blank" rel="noopener" href="https://docs.google.com/spreadsheets/d/' + encodeURIComponent(tpl) + '/copy">Make my copy</a>' +
                    '<p class="mute">Google shows "Copy document" → click <b>Make a copy</b>. It opens your new Sheet. Then go to step 2.</p></div>' +
                    '<details class="card"><summary>Or do it by hand</summary>' + manual() + '</details>'
                  : '<div class="card big">' + manual() + '</div>');
            function manual() {
                return '<ol class="howto"><li>Open <a href="https://sheets.new" target="_blank" rel="noopener">sheets.new</a> – a new, empty Google Sheet. Name it <b>Family Dashboard</b>.</li>' +
                    '<li>Menu <b>Extensions → Apps Script</b>. A code editor opens in a new tab.</li>' +
                    '<li>Click the file <b>Code.gs</b> on the left, select everything in it and delete it. Then paste the code:' + filesBox('Code.gs', 'Code.gs') + '</li>' +
                    '<li>Click <b>+</b> next to Files → <b>HTML</b>, name it <b>Admin</b> (no .html). Replace its contents with:' + filesBox('Admin.html', 'Admin.html') + '</li>' +
                    '<li>Click the ⚙ <b>Project Settings</b> (left), tick <b>Show "appsscript.json" manifest file in editor</b>, go back to the editor, open <b>appsscript.json</b> and replace it with:' +
                    filesBox('appsscript.json', 'appsscript.json') + '<p class="mute">This turns on Google Tasks and sets the time zone for you.</p></li>' +
                    '<li>Press <b>Ctrl+S</b> (save).</li></ol>';
            }
        } },
        { id: 'run', title: 'Run setup', render: function () {
            return '<h1>2. Run setup (one click, then allow)</h1><div class="card big"><ol class="howto">' +
                '<li>In the Apps Script editor (Sheet → <b>Extensions → Apps Script</b>), choose <b>setup</b> in the drop-down at the top, then click <b>▷ Run</b>.</li>' +
                '<li>Google asks for permission: <b>Review permissions</b> → pick your account.</li>' +
                '<li>You’ll see "Google hasn’t verified this app". That’s normal – it’s your own code. Click <b>Advanced</b> → <b>Go to Family Dashboard (unsafe)</b> → <b>Allow</b>.</li>' +
                '<li>Wait for "Execution completed". Your Sheet now has tabs like Boys, Tasks, Installation and Widgets.</li></ol>' +
                '<details><summary>Why does it need these permissions?</summary><ul class="mute">' +
                '<li><b>Spreadsheets</b> – the Sheet is where everything is stored.</li><li><b>Calendar</b> – shows and adds calendar entries.</li>' +
                '<li><b>Gmail (read only)</b> – the Parcels widget looks for delivery emails.</li><li><b>Drive</b> – the photo slideshow reads a folder you choose.</li>' +
                '<li><b>Tasks</b> – the To-do widget. <b>External requests</b> – weather, traffic, trains and so on.</li>' +
                '<li>It all runs inside your own Google account; nobody else can see it.</li></ul></details></div>';
        } },
        { id: 'deploy', title: 'Publish & connect', render: function () {
            return '<h1>3. Publish it, and connect this page</h1><div class="card big"><ol class="howto">' +
                '<li>In the Apps Script editor click <b>Deploy → New deployment</b>.</li>' +
                '<li>Click the ⚙ next to "Select type" → <b>Web app</b>.</li>' +
                '<li>Execute as: <b>Me</b>. Who has access: <b>Anyone</b>. Click <b>Deploy</b> (allow access again if asked).</li>' +
                '<li>Copy the <b>Web app URL</b> (it ends in <b>/exec</b>) and paste it here:</li></ol>' +
                '<div class="row"><input id="url" placeholder="https://script.google.com/macros/s/…/exec" value="' + esc(S.url || '') + '" spellcheck="false">' +
                '<button class="btn" id="connect">Connect</button></div>' +
                '<details' + (S.needCode ? ' open' : '') + '><summary>Asked for an access code?</summary><p class="mute">It’s in the <b>Installation</b> tab of your Sheet, next to AccessCode.</p>' +
                '<div class="row"><input id="code" placeholder="Access code" value="' + esc(S.code || '') + '"><button class="btn ghost" id="useCode">Use this code</button></div></details>' +
                '<div id="connStatus">' + (connected() ? okLine(true, 'Connected to your Family Dashboard Sheet.') : '') + '</div></div>' +
                '<p class="mute">Changed the code later? In Apps Script use <b>Deploy → Manage deployments → ✎ → Version: New version → Deploy</b> so the address stays the same.</p>';
        }, wire: function () {
            $('connect').onclick = function () {
                var u = $('url').value.trim();
                if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(u) && !/^http:\/\/localhost/.test(u)) { $('connStatus').innerHTML = okLine(false, 'That doesn’t look like a web app address – it should start https://script.google.com/macros/s/ and end /exec'); return; }
                S.url = u; S.connected = false; save();
                $('connStatus').innerHTML = '<div class="status">Connecting…</div>';
                get('ping').then(function () {
                    return S.code ? get('state') : get('claim').then(function (d) { S.code = d.code; save(); });
                }).then(function () { return get('state'); }).then(function () {
                    S.connected = true; S.needCode = false; save();
                    $('connStatus').innerHTML = okLine(true, 'Connected! Your access code is ' + S.code + ' – keep it somewhere safe.');
                    renderSteps();
                }).catch(function (e) {
                    if (/access code/i.test(e.message)) { S.needCode = true; save(); }
                    $('connStatus').innerHTML = okLine(false, e.message);
                });
            };
            $('useCode').onclick = function () { S.code = $('code').value.trim(); save(); $('connect').onclick(); };
        } },
        { id: 'family', title: 'Home & family', render: function () {
            if (!connected()) return '<h1>4. Your home and family</h1>' + needConnect();
            var kids = S.kids || [{ Name: '', Colour: '#3fa9f5' }, { Name: '', Colour: '#f5a623' }, { Name: '', Colour: '#7ed321' }];
            return '<h1>4. Your home and family</h1><div class="card big">' +
                '<label>Home address or postcode</label><input id="home" value="' + esc(S.home || '') + '" placeholder="e.g. 12 High Street, Falfield, GL12 8DQ">' +
                '<p class="mute">Used for the weather, traffic routes, the bus stop and the flights map.</p>' +
                '<label>Children (for the points page) – up to 6</label><div id="kids">' + kids.map(kidRow).join('') + '</div>' +
                '<button class="btn sm ghost" id="addKid">+ Add a child</button>' +
                '<div class="row" style="margin-top:18px"><button class="btn" id="saveFamily">Save to my Sheet</button></div><div id="famStatus"></div></div>' +
                '<p class="mute">Everything else – reminders, tasks, bins address, train stations – is set in the Family Admin app later.</p>';
            function kidRow(k) { return '<div class="row kid"><input data-n placeholder="Name" maxlength="10" value="' + esc(k.Name) + '"><input type="color" data-c value="' + esc(k.Colour || '#3fa9f5') + '"></div>'; }
        }, wire: function () {
            if (!connected()) return;
            $('addKid').onclick = function () { if ($('kids').children.length < 6) $('kids').insertAdjacentHTML('beforeend', '<div class="row kid"><input data-n placeholder="Name" maxlength="10"><input type="color" data-c value="#a855f7"></div>'); };
            $('saveFamily').onclick = function () {
                var home = $('home').value.trim();
                var kids = Array.prototype.map.call(document.querySelectorAll('.kid'), function (r) { return { Name: r.querySelector('[data-n]').value.trim(), Colour: r.querySelector('[data-c]').value }; }).filter(function (k) { return k.Name; });
                if (!home) { $('famStatus').innerHTML = okLine(false, 'Add your home address'); return; }
                S.home = home; S.kids = kids; save();
                $('famStatus').innerHTML = '<div class="status">Saving…</div>';
                post({ action: 'saveInstall', values: { HomeAddress: home } }).then(function () {
                    return kids.length ? post({ action: 'saveBoys', rows: kids }) : null;
                }).then(function () { $('famStatus').innerHTML = okLine(true, 'Saved.'); S.familyDone = true; save(); renderSteps(); })
                  .catch(function (e) { $('famStatus').innerHTML = okLine(false, e.message); });
            };
        } },
        { id: 'keys', title: 'Free API keys', render: function () {
            if (!connected()) return '<h1>5. Free keys for live data</h1>' + needConnect();
            S.keys = S.keys || {}; S.skip = S.skip || {};
            return '<h1>5. Free keys for live data</h1><p class="lead">Each one turns on a widget. They’re all free; skip any you don’t want and that widget is hidden.</p>' +
                '<p class="mute">Weather, bins, news, flights, quotes and photos need no key at all.</p>' +
                KEYS.map(function (x, i) {
                    var done = S.keys[x.k], skipped = S.skip[x.k];
                    return '<details class="card key' + (done ? ' done' : skipped ? ' skipped' : '') + '"' + (!done && !skipped && !KEYS.slice(0, i).some(function (y) { return !S.keys[y.k] && !S.skip[y.k]; }) ? ' open' : '') + '>' +
                        '<summary><span class="kname">' + esc(x.name) + '</span><span class="kneed">' + esc(x.need) + '</span><span class="kstate">' + (done ? '✔ saved' : skipped ? 'skipped' : '') + '</span></summary>' +
                        '<ol class="howto">' + x.steps.map(function (st) { return '<li>' + st + '</li>'; }).join('') + '</ol>' +
                        (x.k === 'SpotifyClientId' ? copyBox('redir' + i, 'Your Redirect URI', S.url, 2) : '') +
                        '<p class="mute">' + esc(x.free) + '</p>' +
                        '<div class="row"><input data-key="' + x.k + '" placeholder="' + (x.k2 ? (x.k === 'TransportApiId' ? 'Application ID' : 'Client ID') : 'Paste the key') + '" value="' + esc(S.keys[x.k] || '') + '" spellcheck="false">' +
                        (x.k2 ? '<input data-key="' + x.k2 + '" placeholder="' + (x.k2 === 'TransportApiKey' ? 'Key' : 'Client secret') + '" value="' + esc(S.keys[x.k2] || '') + '" spellcheck="false">' : '') + '</div>' +
                        '<div class="row"><button class="btn" data-savekey="' + i + '">Save</button><button class="btn ghost" data-skip="' + i + '">' + (skipped ? 'Use it after all' : 'Skip – hide this widget') + '</button></div>' +
                        '<div class="kmsg" id="kmsg' + i + '"></div></details>';
                }).join('');
        }, wire: function () {
            if (!connected()) return;
            document.querySelectorAll('[data-savekey]').forEach(function (b) {
                b.onclick = function () {
                    var x = KEYS[+b.getAttribute('data-savekey')], box = b.closest('details'), vals = {};
                    box.querySelectorAll('[data-key]').forEach(function (i) { vals[i.getAttribute('data-key')] = i.value.trim(); });
                    if (!vals[x.k] || (x.k2 && !vals[x.k2])) { $('kmsg' + b.getAttribute('data-savekey')).innerHTML = okLine(false, 'Paste the key' + (x.k2 ? 's' : '') + ' first'); return; }
                    post({ action: 'saveInstall', values: vals }).then(function () {
                        Object.keys(vals).forEach(function (k) { S.keys[k] = vals[k]; });
                        delete S.skip[x.k]; save();
                        return showWidgets(x.widgets, true);
                    }).then(function () { toast(x.name + ' saved'); render(); })
                      .catch(function (e) { $('kmsg' + b.getAttribute('data-savekey')).innerHTML = okLine(false, e.message); });
                };
            });
            document.querySelectorAll('[data-skip]').forEach(function (b) {
                b.onclick = function () {
                    var x = KEYS[+b.getAttribute('data-skip')], skipping = !S.skip[x.k];
                    if (skipping) S.skip[x.k] = 1; else delete S.skip[x.k];
                    save();
                    showWidgets(x.widgets, !skipping).then(function () { toast(skipping ? x.name + ' skipped – its widget is hidden' : x.name + ' widget is back'); render(); })
                        .catch(function (e) { toast(e.message, true); });
                };
            });
        } },
        { id: 'screen', title: 'Start the screen', render: function () {
            if (!connected()) return '<h1>6. Start the screen</h1>' + needConnect();
            return '<h1>6. Start the screen</h1><div class="tabs" id="devTabs"><button data-dev="pc" class="' + (S.dev !== 'other' ? 'on' : '') + '">Windows PC + XENEON EDGE</button>' +
                '<button data-dev="other" class="' + (S.dev === 'other' ? 'on' : '') + '">Raspberry Pi or tablet</button></div>' +
                (S.dev === 'other' ? '<div class="card big"><p>Open this address full screen in the device’s browser:</p>' + copyBox('scr', 'Your screen address (private – contains your access code)', screenUrl(), 3) +
                    '<div class="grid2"><div><h3>Raspberry Pi</h3><ol class="howto"><li>Raspberry Pi OS (with desktop), connected to the screen.</li>' +
                    '<li>Open Terminal and run:<code class="cmd">chromium --kiosk --noerrdialogs --disable-infobars "PASTE-THE-ADDRESS"</code></li>' +
                    '<li>To start it automatically, add that line to <code>~/.config/labwc/autostart</code>.</li></ol></div>' +
                    '<div><h3>Android / Fire tablet</h3><ol class="howto"><li>Install <b>Fully Kiosk Browser</b> (Play Store / Amazon Appstore).</li>' +
                    '<li>Set its Start URL to the address (scan the code on the right with the tablet camera).</li><li>Turn on <b>Kiosk mode</b> and <b>Keep screen on</b>.</li></ol></div></div>' + qr(screenUrl()) + '</div>'
                : '<div class="card big"><ol class="howto"><li>Download the screen files and unzip them into <b>Documents\\Family Dashboard</b>:' +
                    '<p><a class="btn" href="../downloads/family-dashboard-screen.zip" download>Download the screen files</a></p></li>' +
                    '<li>Download your personal start file and put it in the same folder:<p><button class="btn" id="bat">Download "Start Family Dashboard.bat"</button></p>' +
                    '<p class="mute">It contains your address and access code, so don’t share it.</p></li>' +
                    '<li>Make sure the XENEON EDGE is the PC’s screen (or set as the main display) and double-click <b>Start Family Dashboard.bat</b>. ' +
                    'If Windows says "Windows protected your PC": <b>More info → Run anyway</b>. Close it with <b>Alt+F4</b>.</li>' +
                    '<li>To start it when the PC turns on: right-click the .bat → <b>Create shortcut</b>, press <b>Win+R</b>, type <code>shell:startup</code>, and move the shortcut into that folder.</li></ol></div>');
        }, wire: function () {
            if (!connected()) return;
            $('devTabs').onclick = function (e) { var b = e.target.closest('[data-dev]'); if (b) { S.dev = b.getAttribute('data-dev'); save(); render(); } };
            if ($('bat')) $('bat').onclick = function () {
                var bat = ['@echo off', 'rem Family Dashboard - opens full screen on this PC using Microsoft Edge.', 'rem To close it: press Alt+F4.',
                    'set "API=' + S.url + '"', 'set "CODE=' + S.code + '"', 'set "HERE=%~dp0"', 'powershell -NoProfile -ExecutionPolicy Bypass -Command ^',
                    ' "$page = [uri](Join-Path $env:HERE \'index.html\');" ^',
                    ' "$url = $page.AbsoluteUri + \'?api=\' + [uri]::EscapeDataString($env:API) + \'&code=\' + [uri]::EscapeDataString($env:CODE);" ^',
                    ' "$prof = Join-Path $env:LOCALAPPDATA \'FamilyDashboardKiosk\';" ^', ' "$q = [char]34;" ^',
                    ' "Start-Process \'msedge\' -ArgumentList @(\'--kiosk\', $url, \'--edge-kiosk-type=fullscreen\', \'--no-first-run\', \'--disable-pinch\', \'--overscroll-history-navigation=0\', (\'--user-data-dir=\' + $q + $prof + $q))"', ''].join('\r\n');
                var a = document.createElement('a');
                a.href = URL.createObjectURL(new Blob([bat], { type: 'application/octet-stream' }));
                a.download = 'Start Family Dashboard.bat'; document.body.appendChild(a); a.click(); a.remove();
            };
        } },
        { id: 'phones', title: 'Phone apps', render: function () {
            if (!connected()) return '<h1>7. The phone apps</h1>' + needConnect();
            return '<h1>7. The phone apps</h1><p class="lead">Scan with the phone’s camera, open the link, then add it to the home screen.</p>' +
                '<div class="grid2"><div class="card"><h3>Family Admin (parents)</h3><p class="mute">Points, tasks, reminders, widgets and settings.</p>' + qr(linkFor('admin')) + copyBox('la', 'Link', linkFor('admin'), 3) + '</div>' +
                '<div class="card"><h3>Family Calendar (everyone)</h3><p class="mute">See and add calendar entries.</p>' + qr(linkFor('calendar')) + copyBox('lc', 'Link', linkFor('calendar'), 3) + '</div></div>' +
                '<div class="card"><b>Add to home screen:</b> iPhone – open in <b>Safari</b> → Share → <b>Add to Home Screen</b>. Android – open in <b>Chrome</b> → ⋮ → <b>Install app</b>.' +
                '<p class="mute">These links contain your access code. Only send them to family.</p></div>';
        } },
        { id: 'check', title: 'Check everything', render: function () {
            if (!connected()) return '<h1>8. Check everything</h1>' + needConnect();
            return '<h1>8. Check everything</h1><p class="lead">This asks your Sheet to fetch every widget’s live data and reports anything that needs attention.</p>' +
                '<button class="btn" id="runCheck">Run the check</button><div id="checkOut"></div>';
        }, wire: function () {
            if (!connected()) return;
            $('runCheck').onclick = runCheck;
            if (S.autoCheck) { S.autoCheck = false; runCheck(); }
        } },
    ];

    /** Show or hide every widget of the given types (used by "Skip"). */
    function showWidgets(types, show) {
        return post({ action: 'admin' }).then(function (d) {
            var ws = (d.widgets || []).filter(function (w) { return types.indexOf(w.type) >= 0 && w.show !== show; });
            return ws.reduce(function (p, w) { return p.then(function () { return post({ action: 'saveWidget', widget: { id: w.id, show: show } }); }); }, Promise.resolve());
        });
    }

    function runCheck() {
        var out = $('checkOut');
        out.innerHTML = '<div class="status">Checking… this can take up to a minute.</div>';
        var rows = [];
        get('layout').then(function (L) {
            var pages = L.pages.filter(function (p) { return p.show; });
            var names = {}; (L.widgets || []).forEach(function (w) { names[w.id] = w; });
            return pages.reduce(function (p, pg) {
                return p.then(function () {
                    if (pg.type === 'boys') return get('state').then(function (s) { rows.push([pg.title, 'Points page', true, s.boys.length + ' children: ' + s.boys.map(function (b) { return b.name; }).join(', ')]); });
                    if (pg.type === 'calendar') {
                        var t = new Date(), a = t.toISOString().slice(0, 10), z = new Date(t.getTime() + 7 * 864e5).toISOString().slice(0, 10);
                        return get('calendar', { start: a, end: z }).then(function (c) { var n = 0; Object.keys(c.days || {}).forEach(function (k) { n += c.days[k].length; }); rows.push([pg.title, 'Calendar', true, n + ' entries in the next week']); },
                            function (e) { rows.push([pg.title, 'Calendar', false, e.message]); });
                    }
                    return get('page', { page: pg.id }).then(function (d) {
                        L.widgets.filter(function (w) { return w.page === pg.id && w.show; }).forEach(function (w) {
                            var v = d.data[w.id], err = v && v.error, info = summary(w, v);
                            rows.push([pg.title, typeName(w.type), !err, err || info]);
                        });
                    });
                });
            }, Promise.resolve());
        }).then(function () {
            var bad = rows.filter(function (r) { return !r[2]; }).length;
            out.innerHTML = (bad ? '<div class="note bad">' + bad + ' thing' + (bad > 1 ? 's' : '') + ' to look at – each has a hint below. Fix it in the Family Admin app (Widgets / Install tabs), then run the check again.</div>'
                : '<div class="note ok">🎉 Everything is working. Enjoy your dashboard!</div>') +
                '<table class="check"><thead><tr><th>Page</th><th>Widget</th><th></th><th>Details</th></tr></thead><tbody>' + rows.map(function (r) {
                    return '<tr class="' + (r[2] ? 'ok' : 'bad') + '"><td>' + esc(r[0]) + '</td><td>' + esc(r[1]) + '</td><td>' + (r[2] ? '✔' : '⚠') + '</td><td>' + esc(r[3]) + '</td></tr>';
                }).join('') + '</tbody></table>';
        }).catch(function (e) { out.innerHTML = okLine(false, e.message); });
    }
    var TYPE_NAMES = { weather: 'Weather', traffic: 'Traffic', trains: 'Trains', agenda: 'Today & tomorrow', bins: 'Bins', flights: 'Flights overhead',
        news: 'News', timer: 'Kitchen timer', photos: 'Photo slideshow', clock: 'Clock', list: 'List', countdown: 'Holiday countdown', whereabouts: 'Weasley clock',
        bus: 'Bus stop', todo: 'To-do', parcels: 'Parcels', memo: 'Notes', quote: 'Quote', apod: 'NASA picture', spotify: 'Spotify', words: 'Word of the day' };
    function typeName(t) { return TYPE_NAMES[t] || t; }
    function summary(w, v) {
        if (v == null) return 'Works on the screen itself';
        if (v.needLogin) return v.hasClient ? 'Keys saved – now Connect Spotify in the Family Admin app' : 'Add Spotify keys (step 5)';
        switch (w.type) {
            case 'weather': return v.now ? v.now.temp + '° and ' + (v.days || []).length + ' days of forecast' : '';
            case 'traffic': return (v.routes || []).map(function (r) { return r.name + (r.error ? ' ⚠ ' + r.error : ' ' + r.mins + ' min'); }).join(' · ');
            case 'trains': return v.from + ' → ' + v.to + ': ' + (v.services || []).length + ' trains';
            case 'bins': return (v.upcoming || []).length ? 'Next collection ' + v.upcoming[0].date : 'No collections found – check postcode and house name';
            case 'flights': return (v.planes || []).length + ' planes within ' + v.radiusMiles + ' miles right now';
            case 'news': return (v.items || []).length + ' headlines';
            case 'photos': return v.warning || (v.photos || []).length + ' photos in "' + v.title + '"';
            case 'bus': return (v.stop || '') + ' – ' + (v.departures || []).length + ' buses';
            case 'todo': case 'list': return (v.items || []).length + ' items';
            case 'parcels': return (v.items || []).length + ' deliveries found';
            case 'apod': return v.title || '';
            case 'spotify': return v.idle ? 'Connected (nothing playing)' : v.track ? 'Playing: ' + v.track : 'Connected';
            case 'countdown': return (v.items || []).length ? 'Next: ' + v.items[0].name : 'Nothing to count down to yet';
            default: return 'OK';
        }
    }

    /* ------------------------------------------------------------ frame */

    function isDone(id) {
        return { welcome: S.step > 0, sheet: S.step > 1, run: S.step > 2, deploy: connected(), family: !!S.familyDone,
            keys: KEYS.every(function (x) { return S.keys && S.keys[x.k] || S.skip && S.skip[x.k]; }), screen: S.step > 6, phones: S.step > 7, check: false }[id];
    }
    function renderSteps() {
        $('steps').innerHTML = STEPS.map(function (st, i) {
            return '<li class="' + (i === S.step ? 'on' : '') + (isDone(st.id) ? ' done' : '') + '" data-i="' + i + '"><span class="n">' + (isDone(st.id) ? '✔' : i) + '</span>' + esc(st.title) + '</li>';
        }).join('');
    }
    function render() {
        S.step = Math.max(0, Math.min(STEPS.length - 1, S.step || 0)); save();
        var st = STEPS[S.step];
        $('page').innerHTML = st.render();
        if (st.wire) st.wire();
        $('back').style.visibility = S.step ? 'visible' : 'hidden';
        $('next').style.visibility = S.step < STEPS.length - 1 ? 'visible' : 'hidden';
        $('next').textContent = S.step === 0 ? 'Start →' : 'Next →';
        $('where').textContent = 'Step ' + S.step + ' of ' + (STEPS.length - 1);
        renderSteps();
        window.scrollTo(0, 0);
    }
    $('steps').onclick = function (e) { var li = e.target.closest('[data-i]'); if (li) { S.step = +li.getAttribute('data-i'); render(); } };
    $('back').onclick = function () { S.step--; render(); };
    $('next').onclick = function () { S.step++; if (STEPS[S.step] && STEPS[S.step].id === 'check') S.autoCheck = true; render(); };
    document.addEventListener('click', function (e) {
        var c = e.target.closest('[data-copy]');
        if (c) { var t = $(c.getAttribute('data-copy')); navigator.clipboard.writeText(t.value).then(function () { toast('Copied'); }, function () { t.select(); toast('Press Ctrl+C to copy'); }); }
        var f = e.target.closest('[data-copyfile]');
        if (f) {
            fetch(f.getAttribute('data-copyfile'), { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error(); return r.text(); })
                .then(function (txt) { return navigator.clipboard.writeText(txt); })
                .then(function () { toast('Code copied – now paste it into the editor (Ctrl+V)'); }, function () { toast('Couldn’t copy – use Download instead', true); });
        }
    });
    render();
})();
