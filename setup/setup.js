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
    function needConnect() { return connected() ? '' : '<div class="note bad">Connect to your Google Sheet first (step 3).</div>'; }
    /** Family as the server sends it → the form, remembering each name so renames can be followed. */
    function fromServer(f) {
        f = JSON.parse(JSON.stringify(f || {}));
        f.limits = f.limits || { people: 12, children: 6, specials: 3, name: 10, group: 14, special: 16 };
        f.people = (f.people || []).map(function (p) { p.was = p.name; return p; });
        if (!f.people.length) f.people = [{ name: '', role: 'adult', colour: '#a855f7' }, { name: '', role: 'adult', colour: '#f472b6' }, { name: '', role: 'child', colour: '#3fa9f5' }, { name: '', role: 'child', colour: '#f5a623' }];
        ['children', 'adults'].forEach(function (k) { f[k] = f[k] || {}; f[k].was = f[k].name; });
        (f.specials || []).forEach(function (x) { x.was = x.name; });
        f.specials = f.specials || [];
        return f;
    }
    function specialHtml(x, LM) {
        return '<div class="srow" data-was="' + esc(x.was || '') + '"><input data-n placeholder="e.g. School holiday" maxlength="' + LM.special + '" value="' + esc(x.name) + '">' +
            '<label class="tick sm"><input type="checkbox" data-b' + (x.bar ? ' checked' : '') + '> Show as a strip</label>' +
            '<input type="color" data-c value="' + esc(x.colour || '#14b8a6') + '"><button type="button" class="x" data-del title="Remove">✕</button>' +
            '<input class="match" data-m placeholder="Matching words, e.g. half term, inset" value="' + esc(x.match || '') + '"></div>';
    }
    function linkFor(app) { return appsBase + app + '/#api=' + encodeURIComponent(S.url) + '&code=' + encodeURIComponent(S.code); }
    function screenUrl() { return appsBase + 'screen/#api=' + encodeURIComponent(S.url) + '&code=' + encodeURIComponent(S.code); }
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
        { k: 'RailDataKey', name: 'National Rail', need: 'The live train departure board', widgets: ['trains'], free: 'Free.',
          steps: ['Easiest: go to <a href="https://realtime.nationalrail.co.uk/OpenLDBWSRegistration" target="_blank" rel="noopener">realtime.nationalrail.co.uk/OpenLDBWSRegistration</a> and fill in the form (free).',
                  'National Rail emails you a <b>token</b> that looks like <code>xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx</code> – paste that here. (It’s the same token the Raspberry Pi departure boards use.)',
                  'Or, if you already have one: a <b>Live Departure Board</b> consumer key from <a href="https://raildata.org.uk/" target="_blank" rel="noopener">raildata.org.uk</a> works too.'] },
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

    var P = window.FD_PRIVACY || { version: '0', summary: [], full: '' };
    var STEPS = [
        { id: 'welcome', title: 'Welcome & privacy', render: function () {
            return '<h1>Let’s set up your Family Dashboard</h1>' +
                '<p class="lead">About 20–30 minutes. No code to copy: you make your own copy of the Family Dashboard Sheet, publish it, and this page connects everything.</p>' +
                '<div class="grid2"><div class="card"><h3>What you’ll end up with</h3><ul>' +
                '<li>A touch dashboard: weather, traffic, trains, bins, calendar, points for the children, flights overhead, photos and more.</li>' +
                '<li>A Google Sheet that holds everything – yours, in your own Google account.</li>' +
                '<li>Two phone apps: <b>Family Calendar</b> and <b>Family Admin</b>.</li></ul></div>' +
                '<div class="card"><h3>What you need</h3><ul><li>A Google (Gmail) account.</li>' +
                '<li>A screen: a Windows PC with a Corsair XENEON EDGE, a Raspberry Pi with a screen, or a wall tablet.</li>' +
                '<li>This page open on a computer.</li></ul></div></div>' +
                '<div class="card privacy"><h3>Privacy notice</h3><ul>' + P.summary.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ul>' +
                '<details><summary>Read the full privacy notice</summary><div class="pv-full">' + P.full + '</div></details>' +
                '<label class="tick"><input type="checkbox" id="pvOk"' + (S.privacy === P.version ? ' checked' : '') + '> I have read and accept the privacy notice (version ' + esc(P.version) + ', ' + esc(P.updated || '') + ')</label></div>';
        }, wire: function () {
            $('pvOk').onchange = function () {
                S.privacy = $('pvOk').checked ? P.version : ''; save(); render();
                if (S.privacy && connected()) post({ action: 'acceptPrivacy', version: P.version, who: 'setup app' }).catch(function () {});
            };
        }, ready: function () { return S.privacy === P.version; }, blocked: 'Tick the box to accept the privacy notice first' },

        { id: 'apps', title: 'Get the apps', render: function () {
            return '<h1>1. Get the apps</h1><p class="lead">Install them now – you’ll connect them to your own Sheet in step 4.</p>' +
                '<div class="grid3">' +
                '<div class="card app"><h3>🖥 Screen (Windows + XENEON EDGE)</h3><p class="mute">Download, unzip into Documents\\Family Dashboard. (In step 4 you’ll get a personal start file that connects it by itself.)</p>' +
                '<a class="btn" href="../downloads/family-dashboard-windows.zip" download>Download for Windows</a>' +
                '<p class="mute">Raspberry Pi or tablet? Nothing to download – step 4 gives you the address to open.</p></div>' +
                '<div class="card app"><h3>📅 Family Calendar</h3><p class="mute">For everyone. Scan with the phone camera, then add to the home screen.</p>' + qr(appsBase + 'calendar/') + '</div>' +
                '<div class="card app"><h3>⚙ Family Admin</h3><p class="mute">For parents: points, tasks, widgets, settings.</p>' + qr(appsBase + 'admin/') + '</div></div>' +
                '<div class="card"><b>Add to the home screen:</b> iPhone – open in <b>Safari</b> → Share → <b>Add to Home Screen</b>. Android – open in <b>Chrome</b> → ⋮ → <b>Install app</b>.' +
                '<p class="mute">The phone apps and the screen update themselves from the internet – nothing to reinstall later.</p></div>';
        } },

        { id: 'sheet', title: 'Make your Google Sheet', render: function () {
            var tpl = CFG.templateId;
            return '<h1>2. Make your own Google Sheet</h1>' +
                (tpl ? '<div class="card big"><p>This makes <b>your own copy</b> of the Family Dashboard Sheet in your Google account – with all the code already inside.</p>' +
                    '<a class="btn big" target="_blank" rel="noopener" href="https://docs.google.com/spreadsheets/d/' + encodeURIComponent(tpl) + '/copy">Make my copy</a>' +
                    '<p class="mute">Google asks "Copy document?" → <b>Make a copy</b>. Your new Sheet opens in a new tab – keep it open for step 3.</p></div>' +
                    '<details class="card"><summary>No "Make my copy" button working? Do it by hand</summary>' + manual() + '</details>'
                  : '<div class="note">Whoever gave you this setup page hasn’t added a ready-made Sheet yet, so here’s the by-hand way (about 5 minutes).</div><div class="card big">' + manual() + '</div>');
            function manual() {
                return '<ol class="howto"><li>Open <a href="https://sheets.new" target="_blank" rel="noopener">sheets.new</a> and name the Sheet <b>Family Dashboard</b>.</li>' +
                    '<li><b>Extensions → Apps Script</b>. Replace everything in <b>Code.gs</b> with:' + filesBox('Code.gs', 'Code.gs') + '</li>' +
                    '<li><b>+</b> → <b>HTML</b>, name it <b>Admin</b>, and replace its contents with:' + filesBox('Admin.html', 'Admin.html') + '</li>' +
                    '<li>⚙ <b>Project Settings</b> → tick <b>Show "appsscript.json"</b>; open it and replace it with:' + filesBox('appsscript.json', 'appsscript.json') + '</li>' +
                    '<li>Save (<b>Ctrl+S</b>).</li></ol>';
            }
        } },

        { id: 'publish', title: 'Publish & connect', render: function () {
            return '<h1>3. Publish it and connect</h1><div class="card big"><ol class="howto">' +
                '<li>In your new Sheet: <b>Extensions → Apps Script</b>.</li>' +
                '<li><b>Deploy → New deployment</b> → ⚙ next to "Select type" → <b>Web app</b>.</li>' +
                '<li>Execute as <b>Me</b>, Who has access <b>Anyone</b> → <b>Deploy</b>.</li>' +
                '<li>Google asks for permission: <b>Authorise access</b> → your account → "Google hasn’t verified this app" is normal for your own copy: <b>Advanced → Go to Family Dashboard → Allow</b>. ' +
                '<details><summary>Why these permissions?</summary><ul class="mute"><li><b>Sheets</b> – where everything is stored.</li><li><b>Calendar</b> – shows and adds entries.</li>' +
                '<li><b>Gmail (read)</b> – Parcels widget.</li><li><b>Drive</b> – photo slideshow folder.</li><li><b>Tasks</b> – To-do widget.</li><li><b>External requests</b> – weather, traffic, trains…</li>' +
                '<li><b>Manage your Apps Script projects and deployments</b> – only used if you turn on automatic updates (Updates step); it lets the script install new versions of itself.</li>' +
                '<li>It all runs as you, inside your own Google account.</li></ul></details></li>' +
                '<li><b>Click the Web app URL</b> it shows (a page opens – close it), then <b>Done</b>.</li>' +
                '<li>Back in your Sheet, <b>reload the page</b>. A new menu appears: <b>🏠 Family Dashboard → Connect my screen and phones → Open the setup app</b>. ' +
                'This page reopens already connected – nothing to type.</li></ol>' +
                '<div id="connStatus">' + (connected() ? okLine(true, 'Connected to your Family Dashboard Sheet.') : '') + '</div></div>' +
                '<details class="card"' + (S.needCode ? ' open' : '') + '><summary>Or paste the Web app URL here instead</summary>' +
                '<div class="row"><input id="url" placeholder="https://script.google.com/macros/s/…/exec" value="' + esc(S.url || '') + '" spellcheck="false"><button class="btn" id="connect">Connect</button></div>' +
                '<p class="mute">If it asks for an access code, it’s in the <b>Installation</b> tab of your Sheet:</p>' +
                '<div class="row"><input id="code" placeholder="Access code" value="' + esc(S.code || '') + '"><button class="btn ghost" id="useCode">Use this code</button></div></details>';
        }, wire: function () {
            $('connect').onclick = function () {
                var u = $('url').value.trim();
                if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(u) && !/^http:\/\/localhost/.test(u)) { $('connStatus').innerHTML = okLine(false, 'That doesn’t look like a web app address – it should start https://script.google.com/macros/s/ and end /exec'); return; }
                S.url = u; S.connected = false; save();
                connect(false);
            };
            $('useCode').onclick = function () { S.code = $('code').value.trim(); save(); $('connect').onclick(); };
        }, ready: function () { return connected(); }, blocked: 'Connect to your Sheet first (the menu in your Sheet, or paste the address)' },

        { id: 'devices', title: 'Connect your devices', render: function () {
            if (!connected()) return '<h1>4. Connect your screen and phones</h1>' + needConnect();
            return '<h1>4. Connect your screen and phones</h1><p class="lead">These links are <b>private</b> – they point the apps at your Sheet and contain your access code. Only use them on family devices.</p>' +
                '<div class="tabs" id="devTabs"><button data-dev="pc" class="' + (S.dev !== 'other' ? 'on' : '') + '">Windows + XENEON EDGE</button><button data-dev="other" class="' + (S.dev === 'other' ? 'on' : '') + '">Raspberry Pi or tablet</button></div>' +
                (S.dev === 'other' ? '<div class="card big"><p>Open this address full screen on the device:</p>' + copyBox('scr', 'Your screen link', screenUrl(), 3) + qr(screenUrl()) +
                    '<div class="grid2"><div><h3>Raspberry Pi</h3><ol class="howto"><li>Raspberry Pi OS with desktop.</li><li>Terminal:<code class="cmd">chromium --kiosk --noerrdialogs --disable-infobars "PASTE-THE-LINK"</code></li>' +
                    '<li>To start automatically, put that line in <code>~/.config/labwc/autostart</code>.</li></ol></div>' +
                    '<div><h3>Android / Fire tablet</h3><ol class="howto"><li>Install <b>Fully Kiosk Browser</b>.</li><li>Scan the code above with the tablet and set it as the Start URL.</li><li>Turn on Kiosk mode and Keep screen on.</li></ol></div></div></div>'
                  : '<div class="card big"><ol class="howto"><li><button class="btn" id="bat">Download my start file</button> and put it in <b>Documents\\Family Dashboard</b> (replace the one from step 1).</li>' +
                    '<li>Double-click it. It asks once whether to start automatically with the PC, then opens the dashboard full screen on the XENEON EDGE, already connected.</li>' +
                    '<li>If Windows says "Windows protected your PC": <b>More info → Run anyway</b>. Close the dashboard with <b>Alt+F4</b>.</li></ol>' +
                    '<details><summary>Or connect by pasting</summary><p class="mute">If the screen says "Connect this screen", copy this link and paste it there:</p>' + copyBox('scr2', 'Your screen link', screenUrl(), 3) + '</details></div>') +
                '<h2>Phones</h2><div class="grid2">' +
                '<div class="card"><h3>⚙ Family Admin (parents)</h3>' + qr(linkFor('admin')) + copyBox('la', 'Admin link', linkFor('admin'), 3) + '</div>' +
                '<div class="card"><h3>📅 Family Calendar (everyone)</h3>' + qr(linkFor('calendar')) + copyBox('lc', 'Calendar link', linkFor('calendar'), 3) + '</div></div>' +
                '<div class="card"><b>Not installed yet?</b> Scan the code, then add to the home screen (Safari: Share → Add to Home Screen; Chrome: ⋮ → Install app).' +
                '<br><b>Already installed from step 1?</b> Open the app: it asks you to connect – send yourself the link above (e.g. by message), copy it and paste it into the app.</div>';
        }, wire: function () {
            if (!connected()) return;
            $('devTabs').onclick = function (e) { var b = e.target.closest('[data-dev]'); if (b) { S.dev = b.getAttribute('data-dev'); save(); render(); } };
            if ($('bat')) $('bat').onclick = function () { download('Start Family Dashboard.bat', batFile(screenUrl())); };
        } },

        { id: 'family', title: 'Family & calendar', render: function () {
            if (!connected()) return '<h1>5. Your family and calendar</h1>' + needConnect();
            if (!S.fam) {
                setTimeout(function () {
                    post({ action: 'family' }).then(function (d) { S.fam = fromServer(d.family); if (!S.home && d.home) S.home = d.home; save(); render(); })
                        .catch(function (e) { $('famLoad').innerHTML = okLine(false, e.message); });
                }, 0);
                return '<h1>5. Your family and calendar</h1><div class="card" id="famLoad"><div class="status">Reading your Sheet…</div></div>';
            }
            var F = S.fam, LM = F.limits;
            return '<h1>5. Your family and calendar</h1>' +
                '<p class="lead">Who’s in the family, and how the calendar groups and colours them. Change it any time by coming back to this step.</p>' +
                '<div class="card big"><label style="margin-top:0">Home address or postcode</label><input id="home" value="' + esc(S.home || '') + '" placeholder="e.g. 12 High Street, Falfield, GL12 8DQ">' +
                '<p class="mute">Used for the weather, traffic, the nearest bus stop and the flights map.</p></div>' +

                '<div class="card big"><h3>1. Everyone in the family</h3><p class="mute">Up to ' + LM.people + ' people, of whom up to ' + LM.children + ' children. Names up to ' + LM.name + ' letters.</p>' +
                '<div id="ppl">' + F.people.map(personRow).join('') + '</div>' +
                '<button class="btn sm ghost" id="addP">+ Add a person</button></div>' +

                '<div class="card big"><h3>2. The two groups</h3><p class="mute">On the calendar key each person shows in their group’s colour, with their name in brackets, e.g. “Drums (Ben)”.</p>' +
                groupRow('children', 'Children’s group', F.children, 'e.g. Boys, Kids, The girls') +
                groupRow('adults', 'Adults’ group', F.adults, 'e.g. Russ & Becky, Mum & Dad') +
                '<label class="tick"><input type="checkbox" id="pts"' + (F.points === false ? '' : ' checked') + '> Put the children on the points page too</label>' +
                '<div class="row" id="ptsRow"><span style="flex:none">Points page name</span><input id="ptsTitle" maxlength="14" value="' + esc(F.pointsTitle || '') + '" placeholder="Same as the children’s group"></div>' +
                '<p class="mute" id="ptsNote"></p></div>' +

                '<div class="card big"><h3>3. Categories everyone shares</h3>' +
                '<div class="row cat-fixed"><span class="lock">🔒</span><b>Family</b><span class="mute" style="flex:1">Always there: things you all do together</span><input type="color" id="famC" value="' + esc(F.family.colour) + '"></div>' +
                '<div class="row cat-fixed"><span class="lock">🔒</span><b>Holiday</b><span class="mute" style="flex:1">Always there: trips away (flights go here too)</span><input type="color" id="holC" value="' + esc(F.holiday.colour) + '"></div>' +
                '<h3 style="margin-top:18px">Special categories <span class="mute">(up to ' + LM.specials + ')</span></h3>' +
                '<div id="sps">' + F.specials.map(specialRow).join('') + '</div>' +
                '<div class="row" id="spAdd"><button class="btn sm ghost" data-sug="School holiday">+ School holidays</button><button class="btn sm ghost" data-sug="Birthday">+ Birthdays</button><button class="btn sm ghost" data-sug="">+ Other…</button></div>' +
                '<label class="tick" style="margin-top:10px"><input type="checkbox" id="showMatch"' + (S.showMatch ? ' checked' : '') + '> Show matching words (advanced)</label>' +
                '<p class="mute">Events are put in a category by the name at the start of their title – “Ben – Drums”, “Family – Zoo”. Matching words catch events without one, e.g. “football” → Josh.</p></div>' +

                '<div class="card big"><h3>How the calendar key will look</h3><div id="keyPrev" class="keyprev"></div><p class="mute" id="keyNote"></p>' +
                '<div class="row" style="margin-top:14px"><button class="btn" id="saveFamily">Save to my Sheet</button></div><div id="famStatus"></div></div>';
            function personRow(p) {
                return '<div class="prow" data-was="' + esc(p.was || '') + '" data-match="' + esc(p.match || '') + '">' +
                    '<input data-n placeholder="Name" maxlength="' + LM.name + '" value="' + esc(p.name) + '">' +
                    '<div class="seg"><button type="button" data-r="adult"' + (p.role === 'adult' ? ' class="on"' : '') + '>Adult</button><button type="button" data-r="child"' + (p.role !== 'adult' ? ' class="on"' : '') + '>Child</button></div>' +
                    '<input type="color" data-c value="' + esc(p.colour || '#3fa9f5') + '"><button type="button" class="x" data-del title="Remove">✕</button>' +
                    '<input class="match" data-m placeholder="Matching words, e.g. football, Cubs" value="' + esc(p.match || '') + '"></div>';
            }
            function groupRow(k, label, g, ph) {
                return '<div class="row grow" data-g="' + k + '" data-was="' + esc(g.was || '') + '"><span class="glabel">' + label + '</span>' +
                    '<input data-n maxlength="' + LM.group + '" value="' + esc(g.name) + '" placeholder="' + esc(ph) + '"><input type="color" data-c value="' + esc(g.colour) + '"></div>' +
                    '<div class="row grow-m" data-gm="' + k + '"><span class="glabel"></span><input class="match" data-m placeholder="Matching words" value="' + esc(g.match || '') + '"></div>';
            }
            function specialRow(x) { return specialHtml(x, LM); }
        }, wire: function () {
            if (!connected() || !S.fam) return;
            var F = S.fam, LM = F.limits;
            var body = $('page');
            var colours = ['#3fa9f5', '#f5a623', '#7ed321', '#f472b6', '#a855f7', '#22d3ee', '#ef4444', '#facc15', '#14b8a6', '#fb923c', '#94a3b8', '#e879f9'];
            function toggleMatch() { body.classList.toggle('show-match', $('showMatch').checked); }
            toggleMatch();
            $('showMatch').onchange = function () { S.showMatch = this.checked; save(); toggleMatch(); };
            $('addP').onclick = function () {
                var n = document.querySelectorAll('.prow').length;
                if (n >= LM.people) { toast('Up to ' + LM.people + ' people', true); return; }
                $('ppl').insertAdjacentHTML('beforeend', '<div class="prow" data-was="" data-match=""><input data-n placeholder="Name" maxlength="' + LM.name + '">' +
                    '<div class="seg"><button type="button" data-r="adult">Adult</button><button type="button" data-r="child" class="on">Child</button></div>' +
                    '<input type="color" data-c value="' + colours[n % colours.length] + '"><button type="button" class="x" data-del title="Remove">✕</button>' +
                    '<input class="match" data-m placeholder="Matching words, e.g. football, Cubs"></div>');
                $('ppl').lastChild.querySelector('[data-n]').focus(); preview();
            };
            $('spAdd').onclick = function (e) {
                var b = e.target.closest('[data-sug]'); if (!b) return;
                if (document.querySelectorAll('.srow').length >= LM.specials) { toast('Up to ' + LM.specials + ' special categories, so the key stays readable', true); return; }
                var sug = b.getAttribute('data-sug');
                var x = sug === 'School holiday' ? { name: sug, colour: '#facc15', match: 'half term, inset, school holiday', bar: true }
                    : sug === 'Birthday' ? { name: sug, colour: '#ffffff', match: 'birthday', bar: false } : { name: '', colour: '#14b8a6', match: '', bar: false };
                $('sps').insertAdjacentHTML('beforeend', specialHtml(x, LM)); preview();
                if (!sug) $('sps').lastChild.querySelector('[data-n]').focus();
            };
            body.onclick = function (e) {
                var r = e.target.closest('.seg [data-r]');
                if (r) { Array.prototype.forEach.call(r.parentNode.children, function (x) { x.classList.toggle('on', x === r); }); preview(); return; }
                var d = e.target.closest('[data-del]');
                if (d) { d.closest('.prow, .srow').remove(); preview(); }
            };
            body.oninput = preview; body.onchange = function (e) { if (e.target.id !== 'showMatch') preview(); };
            preview();

            $('saveFamily').onclick = function () {
                var f = collect(), home = $('home').value.trim();
                var err = problems(f);
                if (!home) err = err || 'Add your home address';
                if (err) { $('famStatus').innerHTML = okLine(false, err); return; }
                S.home = home; save();
                $('famStatus').innerHTML = '<div class="status">Saving…</div>';
                post({ action: 'saveInstall', values: { HomeAddress: home } }).then(function () {
                    return post(Object.assign({ action: 'saveFamily' }, f));
                }).then(function (d) {
                    S.fam = fromServer(d.family); S.fam.points = f.points; S.familyDone = true; save();
                    render(); $('famStatus').innerHTML = okLine(true, 'Saved. The screen and calendar app pick it up within a minute.');
                }).catch(function (e) { $('famStatus').innerHTML = okLine(false, e.message); });
            };

            function collect() {
                var people = Array.prototype.map.call(document.querySelectorAll('.prow'), function (r) {
                    var on = r.querySelector('.seg .on');
                    return { name: r.querySelector('[data-n]').value.trim(), role: on ? on.getAttribute('data-r') : 'child', colour: r.querySelector('[data-c]').value,
                        match: r.querySelector('[data-m]').value.trim(), was: r.getAttribute('data-was') || '' };
                }).filter(function (p) { return p.name; });
                var grp = function (k) {
                    var r = document.querySelector('[data-g="' + k + '"]');
                    return { name: r.querySelector('[data-n]').value.trim(), colour: r.querySelector('[data-c]').value, was: r.getAttribute('data-was') || '',
                        match: document.querySelector('[data-gm="' + k + '"] [data-m]').value.trim() };
                };
                var specials = Array.prototype.map.call(document.querySelectorAll('.srow'), function (r) {
                    return { name: r.querySelector('[data-n]').value.trim(), colour: r.querySelector('[data-c]').value, bar: r.querySelector('[data-b]').checked,
                        match: r.querySelector('[data-m]').value.trim(), was: r.getAttribute('data-was') || '' };
                }).filter(function (x) { return x.name; });
                return { people: people, children: grp('children'), adults: grp('adults'), specials: specials,
                    family: { colour: $('famC').value, match: F.family.match }, holiday: { colour: $('holC').value, match: F.holiday.match },
                    points: $('pts').checked, pointsTitle: $('ptsTitle').value.trim() };
            }
            function problems(f) {
                if (!f.people.length) return 'Add at least one person';
                var seen = {}, dup = '';
                var all = [f.children.name, f.adults.name, 'Family', 'Holiday'].concat(f.people.map(function (p) { return p.name; }), f.specials.map(function (x) { return x.name; }));
                all.forEach(function (n) { var k = n.toLowerCase().replace(/[^a-z0-9]+/g, ''); if (k && seen[k]) dup = dup || n; seen[k] = 1; });
                if (!f.children.name || !f.adults.name) return 'Give both groups a name';
                if (dup) return '“' + dup + '” is used twice – every name needs to be different';
                var bad = all.filter(function (n) { return /[–—:\-|,]/.test(n); })[0];
                if (bad) return '“' + bad + '” can’t contain a dash, colon, comma or |';
                var kids = f.people.filter(function (p) { return p.role === 'child'; }).length;
                if (kids > LM.children) return 'Up to ' + LM.children + ' children';
                if (f.points && !kids) return 'Mark at least one person as a child for the points page (or untick it)';
                return '';
            }
            function preview() {
                var f = collect(), kids = f.people.filter(function (p) { return p.role === 'child'; }), adults = f.people.filter(function (p) { return p.role === 'adult'; });
                var key = [];
                if (kids.length) key.push({ n: f.children.name || 'Children', c: f.children.colour, who: kids.map(function (p) { return p.name; }).join(', ') });
                if (adults.length) key.push({ n: f.adults.name || 'Adults', c: f.adults.colour, who: adults.map(function (p) { return p.name; }).join(', ') });
                key.push({ n: 'Family', c: $('famC').value }, { n: 'Holiday', c: $('holC').value });
                f.specials.forEach(function (x) { key.push({ n: x.name, c: x.colour, bar: x.bar }); });
                key.push({ n: 'Other', c: '#8a93a3' });
                $('keyPrev').innerHTML = key.map(function (k) {
                    return '<span class="kp' + (k.bar ? ' bar' : '') + '" style="--kc:' + esc(k.c) + '"><i></i>' + esc(k.n) + (k.who ? '<small>' + esc(k.who) + '</small>' : '') + '</span>';
                }).join('');
                $('keyNote').textContent = key.length + ' entries on the key' + (f.specials.some(function (x) { return x.bar; }) ? ' · strips show as a bar along the bottom of each day' : '') + '.';
                var title = $('ptsTitle').value.trim() || f.children.name || 'Children';
                $('ptsRow').style.display = $('pts').checked ? '' : 'none';
                $('ptsNote').textContent = !$('pts').checked ? 'The points page is left as it is.'
                    : !kids.length ? 'Mark at least one person as a child.'
                    : kids.length <= 3 ? 'The “' + title + '” page shows ' + kids.map(function (p) { return p.name; }).join(', ') + ' side by side.'
                    : 'With ' + kids.length + ' children the page is split in two to keep it neat: “' + title + ' 1” (' + kids.slice(0, Math.ceil(kids.length / 2)).map(function (p) { return p.name; }).join(', ') +
                      ') and “' + title + ' 2” (' + kids.slice(Math.ceil(kids.length / 2)).map(function (p) { return p.name; }).join(', ') + ').';
            }
        } },
        { id: 'keys', title: 'Free API keys', render: function () {
            if (!connected()) return '<h1>6. Free keys for live data</h1>' + needConnect();
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
        { id: 'check', title: 'Check everything', render: function () {
            if (!connected()) return '<h1>7. Check everything</h1>' + needConnect();
            return '<h1>8. Check everything</h1><p class="lead">This asks your Sheet to fetch every widget’s live data and reports anything that needs attention.</p>' +
                '<button class="btn" id="runCheck">Run the check</button><div id="checkOut"></div>';
        }, wire: function () {
            if (!connected()) return;
            $('runCheck').onclick = runCheck;
            if (S.autoCheck) { S.autoCheck = false; runCheck(); }
        } },

        { id: 'update', title: 'Updates', render: function () {
            var mine = S.scriptVersion || '', newest = LATEST && LATEST.script;
            var behind = mine && newest && newer(newest, mine);
            return '<h1>Updates</h1><div class="card big"><h3>Screen and phone apps</h3><p>These update themselves. The screen checks every 10 minutes and updates when nobody is using it; the phone apps pick it up the next time they’re opened.</p></div>' +
                '<div class="card big"><h3>Your Google script</h3>' + (!connected() ? needConnect() :
                    (behind ? '<div class="note bad">An update is available: version <b>' + esc(newest) + '</b> (you have ' + esc(mine) + ').</div>' +
                        (LATEST.notes ? '<ul>' + LATEST.notes.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ul>' : '') +
                        '<p><button class="btn big" id="updNow">Update the Google script now</button></p><div id="updMsg"></div>' +
                        '<details><summary>Or update it by hand</summary><ol class="howto"><li>Open your Sheet → <b>Extensions → Apps Script</b>.</li>' +
                        '<li>Open <b>Code.gs</b>, select everything (Ctrl+A) and paste the new code:' + filesBox('Code.gs', 'Code.gs') + '</li>' +
                        '<li>Open <b>Admin.html</b> and do the same:' + filesBox('Admin.html', 'Admin.html') + '</li>' +
                        '<li>Project Settings (cog) → tick “Show appsscript.json”, then replace <b>appsscript.json</b>:' + filesBox('appsscript.json', 'appsscript.json') + '</li>' +
                        '<li>Save, then <b>Deploy → Manage deployments → ✎ → Version: New version → Deploy</b>. Your links stay the same.</li>' +
                        '<li>Come back here and press <b>Check again</b>.</li></ol></details>'
                    : mine ? okLine(true, 'Your Google script is up to date (version ' + mine + ').') : '<div class="status">Checking…</div>') +
                    '<p><button class="btn ghost" id="recheck">Check again</button></p>') + '</div>' +
                (connected() ? '<div class="card big"><h3>Automatic updates for the Google script <span class="mute">(optional)</span></h3>' +
                    '<p>With this on, your Google script updates itself – within minutes of a new version, and it checks every hour – so you never have to copy code again.</p>' +
                    '<div class="note"><b>Before you switch it on:</b> your script will download its new code from <b>' + esc(location.href.replace(/setup\/.*$/, '')) + '</b>. ' +
                    'That code runs with the access you gave the script (your Sheet, calendar, Gmail delivery emails, Tasks and photos folder). Only switch it on if you trust whoever publishes these apps.</div>' +
                    '<ol class="howto"><li>Once per Google account: open <a href="https://script.google.com/home/usersettings" target="_blank" rel="noopener">script.google.com/home/usersettings</a> ' +
                    '(signed in as the Sheet’s owner) and switch <b>Google Apps Script API</b> on.</li>' +
                    '<li>Then: <button class="btn sm' + (S.autoUpdate ? ' ghost' : '') + '" id="autoBtn">' + (S.autoUpdate ? 'Turn automatic updates off' : 'Turn automatic updates on') + '</button></li></ol>' +
                    '<div id="autoMsg">' + (S.autoUpdate ? okLine(true, 'Automatic updates are on.') : '') + '</div></div>' : '');
        }, wire: function () {
            if ($('recheck')) $('recheck').onclick = function () { S.scriptVersion = ''; save(); refreshVersions().then(render); };
            if ($('updNow')) $('updNow').onclick = function () {
                var b = $('updNow'); b.disabled = true; b.textContent = 'Updating… (up to a minute)';
                post({ action: 'selfUpdate', why: 'app' }).then(function (r) {
                    $('updMsg').innerHTML = okLine(!!(r.updated || r.upToDate), r.updated ? 'Updated to ' + r.to + '.' : r.upToDate ? 'Already up to date.' : (r.message || ''));
                    S.scriptVersion = ''; save(); setTimeout(function () { refreshVersions().then(render); }, 1500);
                }).catch(function (e) {
                    b.disabled = false; b.textContent = 'Try again';
                    $('updMsg').innerHTML = okLine(false, e.message) + (/Apps Script API/.test(e.message) ? '<p>Switch on <b>Google Apps Script API</b> at <a href="https://script.google.com/home/usersettings" target="_blank" rel="noopener">script.google.com/home/usersettings</a>, then press Try again – or update by hand below.</p>' : '');
                });
            };
            if ($('autoBtn')) $('autoBtn').onclick = function () {
                post({ action: 'autoUpdate', on: !S.autoUpdate }).then(function (r) {
                    S.autoUpdate = !!r.autoUpdate; save(); render();
                    if (r.warning) $('autoMsg').innerHTML = okLine(false, r.warning) + '<p>Switch on <b>Google Apps Script API</b> (step 1), then it will work.</p>';
                }).catch(function (e) { $('autoMsg').innerHTML = okLine(false, e.message); });
            };
        } },
    ];

    /* ------------------------------------------------------------ connecting, versions, privacy */

    var LATEST = null;
    function newer(a, b) {
        var x = String(a || '').split('.').map(Number), y = String(b || '').split('.').map(Number);
        for (var i = 0; i < Math.max(x.length, y.length); i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); }
        return false;
    }
    function refreshVersions() {
        return fetch('../version.json?t=' + Date.now(), { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })
            .then(function (v) { LATEST = v; return connected() ? get('ping').then(function (p) { S.scriptVersion = p.version || ''; S.autoUpdate = !!p.autoUpdate; save(); }).catch(function () {}) : null; });
    }
    /** Connect with S.url (+ S.code if known): fetch the code once if needed, check it works, record privacy acceptance. */
    function connect(quiet) {
        var st = $('connStatus');
        if (st) st.innerHTML = '<div class="status">Connecting…</div>';
        return get('ping').then(function (p) {
            S.scriptVersion = p.version || '';
            return S.code ? null : get('claim').then(function (d) { S.code = d.code; save(); });
        }).then(function () { return get('layout'); }).then(function (L) {
            S.connected = true; S.needCode = false;
            if (L.privacyAccepted === P.version) S.privacy = P.version;   // already accepted on the screen or a phone
            save();
            if (S.privacy === P.version && L.privacyAccepted !== P.version) post({ action: 'acceptPrivacy', version: P.version, who: 'setup app' }).catch(function () {});
            if (st) st.innerHTML = okLine(true, 'Connected to your Family Dashboard Sheet.' + (L.codeWeak ? ' Tip: your access code is weak – change it in the Family Admin app (Install tab).' : ''));
            renderSteps();
            return true;
        }).catch(function (e) {
            S.connected = false;
            if (/access code/i.test(e.message)) { S.needCode = true; }
            save();
            if (st) st.innerHTML = okLine(false, e.message); else if (!quiet) toast(e.message, true);
            return false;
        });
    }
    function download(name, text) {
        var a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([text], { type: 'application/octet-stream' }));
        a.download = name; document.body.appendChild(a); a.click(); a.remove();
    }
    function batFile(link) {
        return ['@echo off', 'rem Family Dashboard - starts the dashboard full screen in Microsoft Edge. Close it with Alt+F4.',
            'rem The dashboard is loaded from the internet each time, so it is always the latest version.',
            'rem PRIVATE: this file contains your access code. Don\'t share it.',
            'set "SCREEN=' + appsBase + 'screen/"', 'set "LINK=' + String(link || '').replace(/%/g, '%%') + '"', 'set "FDPROFILE=%LOCALAPPDATA%\\FamilyDashboardKiosk"',
            'if not exist "%FDPROFILE%" mkdir "%FDPROFILE%"',
            'rem Start with Windows? Asked once; the answer is remembered. If Yes, the startup shortcut is (re)made every time, pointing at this file.',
            'set "ANS="',
            'if exist "%FDPROFILE%\\startup-answer.txt" set /p ANS=<"%FDPROFILE%\\startup-answer.txt"',
            'if not defined ANS (',
            '  choice /C YN /M "Start the Family Dashboard automatically when this PC turns on"',
            '  if errorlevel 2 (set "ANS=N") else (set "ANS=Y")',
            ')',
            '>"%FDPROFILE%\\startup-answer.txt" echo %ANS%',
            'if /i "%ANS%"=="Y" powershell -NoProfile -ExecutionPolicy Bypass -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath(\'Startup\')+\'\\Family Dashboard.lnk\'); $s.TargetPath=\'%~f0\'; $s.WorkingDirectory=\'%~dp0\'; $s.WindowStyle=7; $s.Save()"',
            'rem Wait (up to a minute) for the internet after the PC starts, so the dashboard doesn\'t open on an error page.',
            'powershell -NoProfile -ExecutionPolicy Bypass -Command "for ($i = 0; $i -lt 30; $i++) { try { $null = Invoke-WebRequest -UseBasicParsing -Method Head -TimeoutSec 3 $env:SCREEN; break } catch { Start-Sleep -Seconds 2 } }"',
            'powershell -NoProfile -ExecutionPolicy Bypass -Command ^', ' "$u = if ($env:LINK) { $env:LINK } else { $env:SCREEN };" ^', ' "$q = [char]34;" ^',
            ' "Start-Process \'msedge\' -ArgumentList @(\'--kiosk\', $u, \'--edge-kiosk-type=fullscreen\', \'--no-first-run\', \'--autoplay-policy=no-user-gesture-required\', \'--use-fake-ui-for-media-stream\', \'--disable-pinch\', \'--overscroll-history-navigation=0\', (\'--user-data-dir=\' + $q + $env:FDPROFILE + $q))"', ''].join('\r\n');
    }

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
            S.checkedOk = !bad; save(); renderSteps();
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
        return { welcome: S.privacy === P.version, apps: S.step > 1, sheet: connected() || S.step > 2, publish: connected(), devices: !!S.devicesSeen, family: !!S.familyDone,
            keys: KEYS.every(function (x) { return S.keys && S.keys[x.k] || S.skip && S.skip[x.k]; }), check: !!S.checkedOk, update: false }[id];
    }
    function renderSteps() {
        $('steps').innerHTML = STEPS.map(function (st, i) {
            return '<li class="' + (i === S.step ? 'on' : '') + (isDone(st.id) ? ' done' : '') + '" data-i="' + i + '"><span class="n">' + (isDone(st.id) ? '✔' : i) + '</span>' + esc(st.title) + '</li>';
        }).join('');
    }
    function render() {
        S.step = Math.max(0, Math.min(STEPS.length - 1, S.step || 0)); save();
        var st = STEPS[S.step];
        if (st.id === 'devices' && connected()) S.devicesSeen = true;
        var pg = $('page'); pg.onclick = pg.oninput = pg.onchange = null; pg.classList.remove('show-match');
        $('page').innerHTML = st.render();
        if (st.wire) st.wire();
        $('back').style.visibility = S.step ? 'visible' : 'hidden';
        $('next').style.visibility = S.step < STEPS.length - 1 ? 'visible' : 'hidden';
        $('next').textContent = S.step === 0 ? 'Start →' : 'Next →';
        var ok = !st.ready || st.ready();
        $('next').classList.toggle('off', !ok);
        $('next').title = ok ? '' : st.blocked || '';
        $('where').textContent = st.id === 'update' ? '' : 'Step ' + S.step + ' of ' + (STEPS.length - 2);
        renderSteps();
        window.scrollTo(0, 0);
    }
    /** Steps that need something first (privacy accepted, connected) can't be skipped past. */
    function canLeave(i) { var st = STEPS[i]; return !st.ready || st.ready(); }
    function go(i) {
        for (var k = 0; k < i; k++) if (!canLeave(k)) { S.step = k; render(); toast(STEPS[k].blocked, true); return; }
        S.step = i;
        if (STEPS[i] && STEPS[i].id === 'check') S.autoCheck = true;
        if (STEPS[i] && STEPS[i].id === 'family') S.fam = null;   // read it fresh from the Sheet
        render();
    }
    $('steps').onclick = function (e) { var li = e.target.closest('[data-i]'); if (li) go(+li.getAttribute('data-i')); };
    $('back').onclick = function () { S.step--; render(); };
    $('next').onclick = function () { go(S.step + 1); };
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
    /* ------------------------------------------------------------ start */
    // Opened from the Sheet's menu (or an update link): …/setup/#api=…&code=…  – connect straight away.
    (function boot() {
        var h = location.hash.replace(/^#/, ''), p = {};
        h.split('&').forEach(function (kv) { var x = kv.split('='); if (x[0]) { try { p[x[0]] = decodeURIComponent(x.slice(1).join('=')); } catch (e) { /* skip */ } } });
        if (location.hash && history.replaceState) history.replaceState(null, '', location.pathname);
        var wantUpdate = 'update' in p, goTo = p.go || '';
        if (p.api && p.code) {
            var changed = p.api !== S.url || p.code !== S.code;
            S.url = p.api; S.code = p.code; if (changed) S.connected = false; save();
        }
        render();
        var after = function () {
            var ids = STEPS.map(function (x) { return x.id; });
            if (goTo && ids.indexOf(goTo) >= 0 && connected()) { if (goTo === 'family') S.fam = null; S.step = S.privacy === P.version ? ids.indexOf(goTo) : 0; }
            else if (wantUpdate) S.step = ids.indexOf('update');
            else if (p.from === 'sheet' && connected()) S.step = S.privacy === P.version ? STEPS.map(function (x) { return x.id; }).indexOf('devices') : 0;
            render();
            if (p.from === 'sheet' && connected()) toast('Connected to your Family Dashboard Sheet \u2705');
        };
        var pending = (p.api && p.code) ? connect(true) : Promise.resolve();
        pending.then(refreshVersions).then(after, after);
    })();
})();
