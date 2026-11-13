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
    // Opened from Setup → Reconfigure (…&only): just that one page, not a step in the wizard.
    var SOLO = /[#&]only(&|=|$)/.test(location.hash);
    if (SOLO) document.body.classList.add('solo');

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
        return '<div class="copy"><div class="copy-top"><b>' + esc(label) + '</b><button class="btn sm" data-copyfile="../files/' + name + '">Copy the code</button>' +
            '<a class="btn sm ghost" href="../files/' + name + '" download>Download</a></div></div>';
    }
    function okLine(ok, text) { return '<div class="status ' + (ok ? 'ok' : 'bad') + '">' + (ok ? '✔ ' : '⚠ ') + esc(text) + '</div>'; }
    function connected() { return !!(S.url && S.code && S.connected); }
    function needConnect() { return connected() ? '' : '<div class="note bad">Connect to your Google Sheet first (step 2, “Publish & connect”).</div>'; }
    function helpLink(topic) { return '<p class="mute help-l">Stuck? <a href="../../help/#' + topic + '" target="_blank" rel="noopener">Help with this step</a></p>'; }
    function phoneish() { return (window.matchMedia && matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 820) || /iPhone|Android.+Mobile/.test(navigator.userAgent); }
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
        var q = window.qrcode(0, 'L'); q.addData(text); q.make();
        return '<div class="qr">' + q.createSvgTag({ cellSize: 6, margin: 4, scalable: true }) + '</div>';
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
            // Run on a dashboard that's already set up: first, change what's there, or clear it and start again?
            if (connected() && !S.mode) return '<h1>This dashboard is already set up</h1>' +
                '<p class="lead">What would you like to do?</p>' +
                '<div class="card big"><h3>✏️ Change the existing set-up</h3><p>Go through each step with everything you’ve already filled in, and change what you like. Nothing is cleared.</p>' +
                    '<button class="btn" id="suAmend">Change the existing set-up</button></div>' +
                '<div class="card big"><h3>🧹 Clear all the settings and start again</h3><p>First, a full copy of your Google Sheet is saved in your Google Drive as a backup. Then the family, rewards, lists, notes and widget settings are cleared, ' +
                    'and you go through setup from the beginning. Your licence key and access code are kept, so the screen and phones stay connected.</p>' +
                    '<button class="btn" id="suWipe" style="background:#ef4444">Back up, clear everything and start again</button><p id="suWipeSt"></p></div>';
            return (S.mode === 'fresh' && S.backup ? '<div class="note ok">🧹 Cleared, ready to set up again. Your backup is <a href="' + esc(S.backup.url) + '" target="_blank" rel="noopener">' + esc(S.backup.name) + '</a> in your Google Drive.</div>' : '') +
                (connected() ? '<div class="card"><p>This page is connected to a Family Dashboard (Sheet ' + esc(String(S.url).replace(/^https:\/\/script\.google\.com\/macros\/s\//, '').slice(0, 10)) + '…). ' +
                    'Setting up a <b>different</b> family? <button class="link" id="suForget">Disconnect and start a new one</button></p></div>' : '') +
                (S.licKey ? '<div class="note ok">🔑 Your licence key <b class="mono">' + esc(S.licKey) + '</b> came with the link from your email. Setup fills it in for you – nothing to type.</div>' : '') +
                (phoneish() ? '<div class="note bad"><b>📱 This looks like a phone or tablet.</b> Setup needs a <b>computer</b> (Windows PC or Mac) – part of it is done on Google’s website, which doesn’t work properly on a phone. ' +
                    'Open your licence email on your computer and click the link there, or send this page to yourself: <button class="btn sm" id="suSend">Copy this page’s link</button></div>' : '') +
                '<h1>Let’s set up your Family Dashboard</h1>' +
                (connected() ? '' : '<p class="mute">Already have a Family Dashboard, and want this computer to manage it? <a href="../?connect">Connect this computer to your family</a> instead.</p>') +
                '<p class="lead">This page walks you through it one step at a time. It takes about 30 minutes. Press <b>Next</b> at the bottom of each page. ' +
                'You can stop at any point – this page remembers where you got to. Each step explains what it does when you get to it.</p>' +
                '<div class="note warn"><h3>What you need before you start</h3><p>Just a <b>Google (Gmail) account</b> – ideally the one your family calendar is in – and this page open on a <b>computer</b>. ' +
                    'No Google account yet? <a href="https://accounts.google.com/signup" target="_blank" rel="noopener">Create one free</a>, then come back here.</p>' +
                    '<p class="mute small">No licence key yet? That’s fine – you get a 14-day free trial and can add it later. No screen yet? You can try the dashboard in another tab on this computer.</p></div>' +
                '<div class="card big"><h3>How it works</h3>' +
                '<p>Family Dashboard is standard software that runs on your screen and your phones. Everything that belongs to your family – names, the calendar, ' +
                'the children’s points, notes and settings – is kept <b>in your own Google account</b>, in a Google Sheet that only you own.</p>' +
                '<p>The software reaches your Sheet with a <b>private access code</b> that setup creates for you. The code stays on your own screen and phones and isn’t sent ' +
                'anywhere else, so your family’s information stays private – nobody else can see it.</p></div>' +
                '<div class="card big"><h3>What you’ll end up with</h3><ul>' +
                '<li>A touch dashboard: weather, traffic, trains, bins, calendar, points for the children, photos and more.</li>' +
                '<li>A Google Sheet that holds everything – yours, in your own Google account.</li>' +
                '<li>Two phone apps: <b>Family Calendar</b> (everyone) and <b>Family Admin</b> (adults).</li></ul></div>' +
                '<p class="mute">Stuck at any point? Every step has a <b>Help</b> link, or see the <a href="../../help/" target="_blank" rel="noopener">help centre</a>.</p>' +
                '<div class="card privacy"><h3>Privacy notice</h3><ul>' + P.summary.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ul>' +
                '<details><summary>Read the full privacy notice</summary><div class="pv-full">' + P.full + '</div></details>' +
                '<label class="tick"><input type="checkbox" id="pvOk"' + (S.privacy === P.version ? ' checked' : '') + '> I have read and accept the privacy notice (version ' + esc(P.version) + ', ' + esc(P.updated || '') + ')</label></div>';
        }, wire: function () {
            if ($('suAmend')) $('suAmend').onclick = function () { S.mode = 'amend'; save(); render(); };
            if ($('suWipe')) $('suWipe').onclick = function () {
                if (!confirm('Clear all the settings and start again? A backup copy of your Google Sheet is saved in your Google Drive first.')) return;
                var b = this; b.disabled = true; $('suWipeSt').textContent = '⏳ Making the backup, then clearing… (up to a minute)';
                post({ action: 'resetForSetup' }).then(function (d) {
                    S.mode = 'fresh'; S.fam = null; S.backup = { url: d.backupUrl, name: d.backupName }; save();
                    $('suWipeSt').innerHTML = '<div class="status ok">✔ Cleared. The backup is <a href="' + esc(d.backupUrl) + '" target="_blank" rel="noopener">' + esc(d.backupName) + '</a> in your Google Drive.</div>';
                    setTimeout(render, 2500);
                }, function (e) { b.disabled = false; $('suWipeSt').innerHTML = okLine(false, e.message); });
            };
            if ($('suSend')) $('suSend').onclick = function () {
                var u = location.href.split('#')[0] + (S.licKey ? '#key=' + encodeURIComponent(S.licKey) : '');
                navigator.clipboard.writeText(u).then(function () { toast('Copied – paste it into an email or message to yourself'); }, function () { prompt('Copy this link:', u); });
            };
            if ($('suForget')) $('suForget').onclick = function () {
                if (!confirm('Disconnect this page from that dashboard and start setting up a new family? (The other dashboard isn’t changed.)')) return;
                try { localStorage.removeItem(KEY); sessionStorage.removeItem(KEY); } catch (e) { /* fine */ }
                location.replace(location.pathname);
            };
            if ($('pvOk')) $('pvOk').onchange = function () {
                S.privacy = $('pvOk').checked ? P.version : ''; save(); render();
                if (S.privacy) toast('Thanks – press Start at the bottom');
                if (S.privacy && connected()) post({ action: 'acceptPrivacy', version: P.version, who: 'setup app' }).catch(function () {});
            };
        }, ready: function () { return S.privacy === P.version && (!connected() || !!S.mode); }, blocked: 'Choose what to do first – change the existing set-up, or start again – then tick the box to accept the privacy notice' },

        { id: 'sheet', title: 'Make your Google Sheet', render: function () {
            var tpl = CFG.templateId;
            return '<h1>1. Make your own Google Sheet</h1><p class="lead">This makes your family’s own Google Sheet from a blank template, in your Google account. It’s where everything your dashboard shows is kept – only you can see it. <span class="mute">(About 2 minutes.)</span></p>' +
                (tpl ? '<div class="card big"><ol class="howto"><li>Click <a class="btn" target="_blank" rel="noopener" href="https://docs.google.com/spreadsheets/d/' + encodeURIComponent(tpl) + '/copy">Make my copy</a> ' +
                    '<span class="mute">(it opens in a new tab)</span></li>' +
                    '<li>If Google asks you to sign in, use the Google account you want the dashboard in – the one with the family calendar.</li>' +
                    '<li>Google shows <b>“Copy document?”</b> – click the blue <b>Make a copy</b> button. <span class="mute">(If it mentions “Apps Script files”, that’s right – they come too.)</span></li>' +
                    '<li>Your new Sheet opens, called <b>“Copy of Family Dashboard”</b>. Leave that tab open, come back to this tab, and press <b>Next</b>.</li></ol></div>' +
                    helpLink('setup') + '<details class="card"><summary>“Make my copy” not working? Do it by hand</summary>' + manual() + '</details>'
                  : '<div class="note">Whoever gave you this setup page hasn’t added a ready-made Sheet yet, so here’s the by-hand way (about 5 minutes).</div><div class="card big">' + manual() + '</div>');
            function manual() {
                return '<ol class="howto"><li>Open <a href="https://sheets.new" target="_blank" rel="noopener">sheets.new</a> and name the Sheet <b>Family Dashboard</b>.</li>' +
                    '<li><b>Extensions → Apps Script</b>. Replace everything in <b>Code.gs</b> with the <b>loader</b> – a small file that fetches the latest program each time, so it keeps itself up to date:' + filesBox('Loader.gs', 'Loader.gs (goes in Code.gs)') + '</li>' +
                    '<li><b>+</b> → <b>HTML</b>, name it <b>Admin</b>, and replace its contents with:' + filesBox('Admin.html', 'Admin.html') + '</li>' +
                    '<li>⚙ <b>Project Settings</b> → tick <b>Show "appsscript.json"</b>; open it and replace it with:' + filesBox('appsscript.json', 'appsscript.json') + '</li>' +
                    '<li>Save (<b>Ctrl+S</b>).</li></ol>';
            }
        } },

        { id: 'publish', title: 'Publish & connect', render: function () {
            var perms = '<details><summary>Why these permissions?</summary><ul class="mute"><li><b>Sheets</b> – where everything is stored.</li><li><b>Calendar</b> – shows and adds entries.</li>' +
                '<li><b>Gmail (read)</b> – Parcels widget.</li><li><b>Drive</b> – photo slideshow folder.</li><li><b>Tasks</b> – To-do widget.</li><li><b>External requests</b> – weather, traffic, trains…</li>' +
                '<li><b>Run when you’re not there, and connect to external services</b> – the 5-minute timer, and fetching its own newest program from these apps.</li>' +
                '<li>It all runs as you, inside your own Google account.</li></ul></details>';
            if (connected()) return '<h1>2. Publish it and connect</h1><div class="card big">' + okLine(true, 'Done – this page is connected to your Family Dashboard Sheet.') + '<p>Press <b>Next</b>.</p>' +
                '<div id="connStatus"></div></div>' + packAndPair() + otherWay();
            return '<h1>2. Publish it and connect</h1><p class="lead">Your Sheet comes with a small program inside it. “Publishing” switches that program on, so your screen and phones can talk to your Sheet – ' +
                'using the private access code, and nothing else. You do it once. Follow each line in order – it’s mostly clicking.</p>' +
                '<div class="card big"><h3>In the tab with your new Sheet</h3><ol class="howto">' +
                '<li>In the menu along the top of the Sheet, click <b>Extensions</b> → <b>Apps Script</b>. A new tab opens with some code in it. <span class="mute">You don’t need to change anything.</span></li>' +
                '<li>Top right, click the blue <b>Deploy</b> button → <b>New deployment</b>.</li>' +
                '<li>Next to <b>“Select type”</b>, click the ⚙ cog → <b>Web app</b>.</li>' +
                '<li>Under <b>Who has access</b>, choose <b>Anyone</b> <span class="mute">(not “Anyone with Google account”)</span>. Leave <b>Execute as</b> on <b>Me</b>. Click <b>Deploy</b>.</li>' +
                '<li>Google asks for permission. Click <b>Authorize access</b> and choose your account. You’ll see <b>“Google hasn’t verified this app”</b> – that’s normal, because it’s your own private copy. ' +
                    'Click <b>Advanced</b> (small, bottom left) → <b>Go to Family Dashboard (unsafe)</b> → <b>Allow</b>. ' + perms + '</li>' +
                '<li>Google shows <b>“New deployment”</b> with a <b>Web app URL</b>. Click <b>Copy</b> under the URL.</li>' +
                '<li>Come back to this tab, paste it in the box below (Ctrl+V, or ⌘V on a Mac) and click <b>Connect</b>. ' +
                    '<span class="mute">Then go back to Apps Script and click <b>Done</b>.</span></li></ol>' +
                '<div class="row" style="margin-top:10px"><input id="url" placeholder="Paste the Web app URL here – https://script.google.com/macros/s/…/exec" value="' + esc(S.url || '') + '" spellcheck="false"><button class="btn" id="connect">Connect</button></div>' +
                '<p class="mute">Don’t deploy again if it says “Deployment successfully updated” – that means it worked; just copy that URL.</p>' +
                '<details class="card"><summary>Deploy just spins, or Google keeps asking for permission?</summary><ol class="howto">' +
                '<li>This is nearly always because the browser is signed in to <b>more than one Google account</b>. Open a private window (Chrome: Ctrl+Shift+N, or ⌘+Shift+N on a Mac), ' +
                'sign in with <b>only</b> the account your Sheet is in, open the Sheet from <a href="https://drive.google.com" target="_blank" rel="noopener">drive.google.com</a> and do this step again there.</li>' +
                '<li>Use <b>Chrome</b> or <b>Edge</b>, and allow pop-ups if the browser asks – Google’s permission window is a pop-up.</li>' +
                '<li>In Apps Script, press <b>Save</b> (the 💾 icon) once before <b>Deploy</b>.</li>' +
                '<li>Still spinning? Make a fresh copy (step 1) and try again in the private window – a new copy usually deploys straight away.</li></ol></details>' +
                helpLink('setup') +
                '<div id="connStatus"></div></div>' + otherWay();
            function packAndPair() {
                return (S.pairCode && window.FDPairSend ? '<div class="card big" id="pairCard" style="border-color:var(--acc)"><h3>📺 Connect your new screen</h3>' +
                    '<p>The screen showing <b>' + esc(S.pairCode) + '</b> is waiting. Connect it to this family now?</p><button class="btn" id="pairSend">Connect the screen</button><div id="pairStatus" class="mute"></div></div>' : '') +
                (S.pack ? '<div class="card big" id="packCard" style="border-color:var(--acc)"><h3>📦 Bring your family’s information across</h3>' +
                    '<p>This copies everything from your old Google account’s dashboard – people, points, tasks, lists, notes, settings and your licence – into this new one. ' +
                    'Your screen and phones then switch over by themselves.</p><button class="btn" id="packGo">Bring everything across</button><div id="packStatus" class="mute"></div></div>' : '');
            }
            function otherWay() {
                return '<details class="card"' + (S.needCode ? ' open' : '') + '><summary>Lost the URL, or it asks for an access code?</summary>' +
                    '<p class="mute">The URL: in Apps Script, <b>Deploy → Manage deployments</b>, and copy the <b>Web app URL</b> (it ends in /exec)' +
                    (connected() ? '' : ' – then paste it in the box above') + '.</p>' +
                    (connected() ? '<div class="row"><input id="url" placeholder="https://script.google.com/macros/s/…/exec" value="' + esc(S.url || '') + '" spellcheck="false"><button class="btn" id="connect">Connect</button></div>' : '') +
                    '<p class="mute">Or, in your Sheet, reload it and use the menu <b>🏠 Family Dashboard → ▶ Set up &amp; connect my screen and phones</b>.</p>' +
                    '<p class="mute">If it asks for an access code, it’s in the <b>Installation</b> tab of your Sheet:</p>' +
                    '<div class="row"><input id="code" placeholder="Access code" value="' + esc(S.code || '') + '"><button class="btn ghost" id="useCode">Use this code</button></div></details>';
            }
        }, wire: function () {
            $('connect').onclick = function () {
                var u = $('url').value.trim();
                if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(u) && !/^http:\/\/localhost/.test(u)) { $('connStatus').innerHTML = okLine(false, 'That doesn’t look like a web app address – it should start https://script.google.com/macros/s/ and end /exec'); return; }
                S.url = u; S.connected = false; save();
                connect(false);
            };
            $('useCode').onclick = function () { S.code = $('code').value.trim(); save(); $('connect').onclick(); };
            if ($('pairSend')) $('pairSend').onclick = function () {
                var b = this; b.disabled = true;
                FDPairSend.send(S.pairCode, { url: S.url, code: S.code }).then(function () { $('pairStatus').innerHTML = okLine(true, 'Sent – the screen connects within a few seconds.'); S.pairCode = ''; save(); },
                    function (e) { b.disabled = false; $('pairStatus').innerHTML = okLine(false, e.message + ' (The code lasts 10 minutes after it’s sent; if the screen shows a new code, use Family Admin → More → Devices and Phones.)'); });
            };
            if ($('packGo')) $('packGo').onclick = function () {
                var b = this; b.disabled = true; $('packStatus').textContent = 'Copying everything… (up to a minute)';
                post({ action: 'importPack', pack: S.pack }).then(function (d) {
                    if (d.code) { S.code = d.code; }          // the family's own access code comes across too
                    S.pack = ''; save();
                    $('packStatus').innerHTML = okLine(true, 'Everything is here.' + (d.note ? ' Note: ' + d.note : ' Your screen and phones will switch over within a few minutes.'));
                    toast('Moved ✅'); setTimeout(render, 2500);
                }, function (e) { b.disabled = false; $('packStatus').innerHTML = okLine(false, /Unknown action/.test(e.message) ? 'This new dashboard’s script is out of date – update it first (Updates step).' : e.message); });
            };
        }, ready: function () { return connected(); }, blocked: 'Paste the Web app URL in the box and click Connect first' },

        { id: 'licence', title: 'Your licence key', render: function () {
            if (!connected()) return '<h1>3. Your licence key</h1>' + needConnect();
            return '<h1>3. Your licence key</h1><p class="lead">Your key is in the email you got when you bought the dashboard. It starts <b>FD-</b>. <b>No key yet?</b> Just press <b>Next</b> – the dashboard works as a free trial for 14 days, and you can add the key later.</p>' +
                '<div class="card big" id="licCard"><div id="licStatus" class="status">Checking…</div>' +
                '<div id="licForm"><label>Licence key</label><div class="row"><input id="licKey" placeholder="FD-XXXXX-XXXXX-XXXXX-XXXXX" value="' + esc(S.licKey || '') + '" spellcheck="false" autocapitalize="characters" style="font-family:ui-monospace,Menlo,Consolas,monospace">' +
                '<button class="btn" id="licGo">Check and save</button></div>' +
                '<p class="mute">Copy it from the email and paste it in (Ctrl+V), or type it – capitals or not, with or without the dashes.</p></div></div>' +
                '<details class="card"><summary>It says the key is “already in use”</summary><p>Each key works on one dashboard. If it was typed into an app that was connected to <b>someone else’s</b> dashboard, ' +
                'it went to theirs. Ask the person who sold you the licence to <b>release</b> it, then press <b>Check and save</b> again.</p></details>' +
                '<details class="card"><summary>No key yet?</summary><p>You can carry on without one: the dashboard works as a free trial for 14 days. Add the key later in the Family Admin app → More → Software Licence, or the Configurator → Advanced → Software Licence.</p></details>' + helpLink('licence');
        }, wire: function () {
            if (!connected()) return;
            var show = function (L) {
                var good = !L || !L.required || (L.ok && L.state !== 'trial');
                S.licOk = good; save(); renderSteps();
                $('licStatus').innerHTML = !L || !L.required ? okLine(true, 'Licence keys aren’t needed yet – press Next.')
                    : L.ok && L.state !== 'trial' ? okLine(true, L.message + (L.key ? ' (key …' + L.key + ')' : '') + ' – all done, press Next.')
                    : L.state === 'trial' ? '<div class="status">⏳ ' + esc(L.message) + '</div>' : okLine(false, L.message);
                $('licForm').style.display = good ? 'none' : '';
            };
            post({ action: 'licence' }).then(function (d) {
                show(d.licence);
                // Key from the order email's link: check and save it by itself.
                if (S.licKey && d.licence && d.licence.required && (!d.licence.ok || d.licence.state === 'trial')) $('licGo').onclick();
            }, function (e) { $('licStatus').innerHTML = okLine(false, /Unknown action/.test(e.message) ? 'Your Google script needs updating first – see the Updates step.' : e.message); });
            $('licGo').onclick = function () {
                var k = $('licKey').value.trim(); if (!k) { toast('Paste your key in first', true); return; }
                $('licStatus').innerHTML = '<div class="status">Checking your key with the licence server…</div>'; $('licGo').disabled = true;
                post({ action: 'setLicence', key: k }).then(function (d) { $('licGo').disabled = false; S.licensed = true; S.licKey = ''; save(); show(d.licence); toast('Licence saved ✅'); },
                    function (e) { $('licGo').disabled = false; S.licKey = ''; save(); $('licStatus').innerHTML = okLine(false, e.message); });
            };
        } },

        { id: 'family', title: 'Family & calendar', render: function () {
            if (!connected()) return '<h1>4. Your family and calendar</h1>' + needConnect();
            if (!S.fam) {
                setTimeout(function () {
                    post({ action: 'family' }).then(function (d) { S.fam = fromServer(d.family); if (!S.home && d.home) S.home = d.home; save(); render(); })
                        .catch(function (e) { $('famLoad').innerHTML = okLine(false, e.message); });
                }, 0);
                return '<h1>4. Your family and calendar</h1><div class="card" id="famLoad"><div class="status">Reading your Sheet…</div></div>';
            }
            var F = S.fam, LM = F.limits;
            return '<h1>4. Your family and calendar</h1>' +
                '<p class="lead">Who’s in the family, and how the calendar groups and colours them. Change it any time by coming back to this step.</p>' +
                '<div class="card big"><label style="margin-top:0">Home address or postcode</label><input id="home" value="' + esc(S.home || '') + '" placeholder="e.g. 12 High Street, Bristol, BS1 4DJ">' +
                '<p class="mute">Used for the weather, traffic, the nearest bus stop and the flights map.</p></div>' +

                '<div class="card big"><h3>1. Everyone in the family</h3><p class="mute">Up to ' + LM.people + ' people, of whom up to ' + LM.children + ' children. Names up to ' + LM.name + ' letters. Tap ⭐ Points to put a child on the points page, or take them off.</p>' +
                '<div id="ppl">' + F.people.map(personRow).join('') + '</div>' +
                '<button class="btn sm ghost" id="addP">+ Add a person</button></div>' +

                '<div class="card big"><h3>2. The two groups</h3><p class="mute">On the calendar key each person shows in their group’s colour, with their name in brackets, e.g. “Drums (Ben)”.</p>' +
                groupRow('children', 'Children’s group', F.children, 'e.g. Boys, Kids, The girls') +
                groupRow('adults', 'Adults’ group', F.adults, 'e.g. Russ & Becky, Mum & Dad') +
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
                    '<button type="button" class="ptb' + (p.points === false ? '' : ' on') + '" data-pt title="On the points page?">⭐ Points</button>' +
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
                    '<button type="button" class="ptb on" data-pt title="On the points page?">⭐ Points</button>' +
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
                var pt = e.target.closest('[data-pt]');
                if (pt) { pt.classList.toggle('on'); preview(); return; }
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
                    S.fam = fromServer(d.family); S.familyDone = true; save();
                    render(); $('famStatus').innerHTML = okLine(true, 'Saved. The screen and calendar app pick it up within a minute.');
                    // Bin days: say straight away whether this postcode's council can be read automatically.
                    var pc = /\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/i.exec(home);
                    if (pc) get('binCouncil', { postcode: pc[1] }).then(function (b) {
                        $('famStatus').insertAdjacentHTML('beforeend', b.automatic ? okLine(true, 'Bins: ' + b.message + '.')
                            : '<div class="status warn">🗑 <b>Bins:</b> ' + esc(b.message) + ' You can do that later in Family Admin → the Bins widget.</div>');
                    }, function () { /* older Google script – the Check step will say */ });
                }).catch(function (e) { $('famStatus').innerHTML = okLine(false, e.message); });
            };

            function collect() {
                var people = Array.prototype.map.call(document.querySelectorAll('.prow'), function (r) {
                    var on = r.querySelector('.seg .on');
                    var role = on ? on.getAttribute('data-r') : 'child';
                    return { name: r.querySelector('[data-n]').value.trim(), role: role, colour: r.querySelector('[data-c]').value,
                        points: role === 'child' && r.querySelector('[data-pt]').classList.contains('on'),
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
                    pointsTitle: $('ptsTitle').value.trim() };
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
                Array.prototype.forEach.call(document.querySelectorAll('.prow'), function (r) {
                    var on = r.querySelector('.seg .on'); r.classList.toggle('adult', !!on && on.getAttribute('data-r') === 'adult');
                });
                var pk = kids.filter(function (p) { return p.points; }), names = function (a) { return a.map(function (p) { return p.name; }).join(', '); };
                var off = kids.filter(function (p) { return !p.points; });
                $('ptsRow').style.display = pk.length ? '' : 'none';
                $('ptsNote').textContent = (!kids.length ? 'Mark someone as a child to use the points page.'
                    : !pk.length ? 'Nobody has ⭐ Points ticked, so the points page is left as it is.'
                    : 'Each of ' + names(pk) + ' gets a points widget, on a “' + title + '” screen (four fit on a screen). You can move them to any screen in Screen layout.') +
                    (pk.length && off.length ? ' Not on it: ' + names(off) + ' (their points are kept if you tick them again).' : '');
            }
        } },
        { id: 'devices', title: 'Connect your devices', render: function () {
            if (!connected()) return '<h1>5. Connect your screen and phones</h1>' + needConnect();
            return '<h1>5. Connect your screen and phones</h1><p class="lead">These links are <b>private</b> – they point the apps at your Sheet and contain your access code. Only use them on family devices.</p>' +
                '<div class="tabs" id="devTabs"><button data-dev="pc" class="' + (S.dev !== 'other' && S.dev !== 'here' ? 'on' : '') + '">Windows + XENEON EDGE</button><button data-dev="other" class="' + (S.dev === 'other' ? 'on' : '') + '">Raspberry Pi or tablet</button><button data-dev="here" class="' + (S.dev === 'here' ? 'on' : '') + '">No screen yet – use this computer</button></div>' +
                (S.dev === 'here' ? '<div class="card big"><h3>Try it on this computer</h3><p>No screen to connect yet? Open the dashboard in a new tab here – it’s the same as the screen will show, already connected.</p>' +
                    '<a class="btn" href="' + esc(screenUrl()) + '" target="_blank" rel="noopener">Open the dashboard in a new tab</a>' +
                    '<p class="mute">Press <b>F11</b> for full screen, and F11 again to come back. Make the window wide and short to see it like the XENEON EDGE. When you get your screen, connect it from the Family Admin app → More → Devices and Phones.</p></div>'
                  : S.dev === 'other' ? '<div class="card big"><h3>Android / Fire tablet</h3><ol class="howto">' +
                    '<li>On the tablet, install <b>Fully Kiosk Browser</b> (Google Play, or the Amazon Appstore on a Fire tablet).</li>' +
                    '<li>Open it. Where it asks for a <b>Start URL</b> (or in its Settings → Web Content Settings → Start URL), type this short address:' +
                    '<div class="bigaddr">' + esc(appsBase.replace(/^https:\/\//, '') + 'screen/') + '</div>' +
                    '<span class="mute">Or scan this with the tablet’s camera – it’s the same short address:</span>' + qr(appsBase + 'screen/') + '</li>' +
                    '<li>The tablet shows <b>“Connect this screen”</b> and a code like <b>K7Q2-M9XD</b>. Type that code here and click <b>Connect</b>:' +
                    '<div class="row" style="margin-top:8px"><input id="tabCode" placeholder="e.g. K7Q2-M9XD" autocapitalize="characters" spellcheck="false" style="max-width:16rem"><button class="btn" id="tabGo">Connect</button></div><div id="tabStatus" class="mute"></div>' +
                    'The tablet shows your dashboard within a few seconds and remembers it.</li>' +
                    '<li>In Fully Kiosk’s settings, turn on <b>Keep Screen On</b> and, if you like, <b>Kiosk Mode</b>.</li></ol></div>' +
                    '<details class="card"><summary>Raspberry Pi</summary><ol class="howto"><li>Raspberry Pi OS with desktop.</li><li>Terminal:<code class="cmd">chromium --kiosk --noerrdialogs --disable-infobars "' + esc(appsBase) + 'screen/"</code></li>' +
                    '<li>It shows a code: type it in the box above and click Connect.</li><li>To start automatically, put that line in <code>~/.config/labwc/autostart</code>.</li></ol></details>' +
                    '<details class="card"><summary>Or use the private screen link instead of a code</summary>' + copyBox('scr', 'Your screen link', screenUrl(), 3) + '</details>'
                  : '<div class="card big"><ol class="howto"><li>Click <button class="btn" id="bat">Download my start file</button> and move the file somewhere you’ll find it, such as <b>Documents</b>. Doing this on a different computer? Copy the file to the PC the XENEON EDGE is plugged into (a USB stick, or email it to yourself).</li>' +
                    '<li>Double-click it. It asks once whether to start automatically with the PC, then opens the dashboard full screen on the XENEON EDGE, already connected.</li>' +
                    '<li>If Windows says "Windows protected your PC": <b>More info → Run anyway</b>. Close the dashboard with <b>Alt+F4</b>.</li></ol>' +
                    '<details><summary>Or connect by pasting</summary><p class="mute">If the screen says "Connect this screen", copy this link and paste it there:</p>' + copyBox('scr2', 'Your screen link', screenUrl(), 3) + '</details></div>') +
                '<h2>Phones</h2><div class="grid2">' +
                '<div class="card"><h3>⚙ Family Admin (adults)</h3>' + qr(linkFor('admin')) + copyBox('la', 'Admin link', linkFor('admin'), 3) + '</div>' +
                '<div class="card"><h3>📅 Family Calendar (everyone)</h3>' + qr(linkFor('calendar')) + copyBox('lc', 'Calendar link', linkFor('calendar'), 3) + '</div></div>' +
                '<div class="card"><b>Not installed yet?</b> Scan the code, then add to the home screen (Safari: Share → Add to Home Screen; Chrome: ⋮ → Install app).' +
                '<br><b>Scanning connects it too</b> – the code holds your family’s private link. Already have the app? Open it: it asks you to connect – send yourself the link above (e.g. by message), copy it and paste it in.</div>' + helpLink('connect');
        }, wire: function () {
            if (!connected()) return;
            if ($('tabGo')) $('tabGo').onclick = function () {
                var b = this; b.disabled = true; $('tabStatus').textContent = 'Sending…';
                FDPairSend.send($('tabCode').value, { url: S.url, code: S.code }).then(function () { $('tabStatus').innerHTML = okLine(true, 'Sent – the tablet connects within a few seconds.'); b.disabled = false; },
                    function (e) { b.disabled = false; $('tabStatus').innerHTML = okLine(false, e.message); });
            };
            $('devTabs').onclick = function (e) { var b = e.target.closest('[data-dev]'); if (b) { S.dev = b.getAttribute('data-dev'); save(); render(); } };
            if ($('bat')) $('bat').onclick = function () { download('Start Family Dashboard.bat', batFile(screenUrl())); };
        } },

        { id: 'keys', title: 'Free API keys', render: function () {
            if (!connected()) return '<h1>6. Free keys for live data</h1>' + needConnect();
            S.keys = S.keys || {}; S.skip = S.skip || {};
            return '<h1>6. Free keys for live data</h1><p class="lead">Some widgets show live information from other services – train times, bus times, traffic. They fetch it through an <b>API</b>: ' +
                'a way for one computer system to ask another for information. Each service wants to know who’s asking, so you make a free account with it and it gives you a <b>key</b> ' +
                '(a bit like a licence) to paste in here. They’re all free. Skip any you don’t want – that widget is just hidden.</p>' +
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
            return '<h1>7. Check everything</h1><p class="lead">This asks your Sheet to fetch every widget’s live data and reports anything that needs attention.</p>' +
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
                        '<details open><summary>Or switch to the loader – the last time you’ll ever do this</summary><p>The loader is a small file that fetches the newest program from these apps every time the script runs. Paste it in once and the script keeps itself up to date – no switches, no Google Cloud.</p><ol class="howto"><li>Open your Sheet → <b>Extensions → Apps Script</b>.</li>' +
                        '<li>Open <b>Code.gs</b>, select everything (Ctrl+A) and paste the loader:' + filesBox('Loader.gs', 'Loader.gs (goes in Code.gs)') + '</li>' +
                        '<li>Open <b>Admin.html</b> and replace it too (a spare copy, used if the internet is down):' + filesBox('Admin.html', 'Admin.html') + '</li>' +
                        '<li>Project Settings (cog) → tick “Show appsscript.json”, then replace <b>appsscript.json</b>:' + filesBox('appsscript.json', 'appsscript.json') + '</li>' +
                        '<li>Save, then <b>Deploy → Manage deployments → ✎ → Version: New version → Deploy</b>. Your links stay the same.</li>' +
                        '<li>Come back here and press <b>Check again</b>.</li></ol></details>'
                    : mine ? okLine(true, 'Your Google script is up to date (version ' + mine + ').') : '<div class="status">Checking…</div>') +
                    '<p><button class="btn ghost" id="recheck">Check again</button></p>') + '</div>' +
                (connected() && !S.loader ? '<div class="card big"><h3>Automatic updates for the Google script <span class="mute">(older way)</span></h3><p class="mute">Easier: paste in the loader (above) – then nothing needs switching on.</p>' +
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
                    $('updMsg').innerHTML = okLine(false, e.message) + (/Apps Script API/.test(e.message) ? (/console\.cloud\.google\.com/.test(e.message) ? '<p>Open the Google Cloud link in the message above, click <b>Enable</b>, wait 5 minutes, then press Try again – or update by hand below.</p>' : '<p>Switch on <b>Google Apps Script API</b> at <a href="https://script.google.com/home/usersettings" target="_blank" rel="noopener">script.google.com/home/usersettings</a>, then press Try again – or update by hand below.</p>') : '');
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
        return fetch('../../version.json?t=' + Date.now(), { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })
            .then(function (v) { LATEST = v; return connected() ? get('ping').then(function (p) { S.scriptVersion = p.version || ''; S.autoUpdate = !!p.autoUpdate; S.loader = p.loader || ''; save(); }).catch(function () {}) : null; });
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
        // A small start file: it holds only the private link; the real work is in downloads/windows/launcher.ps1,
        // fetched fresh from GitHub every time it starts, so the start file never needs replacing.
        return ["@echo off", "rem Family Dashboard - starts the dashboard full screen in Microsoft Edge. Close it with Alt+F4.", "rem This file only holds your screen link. Each time it starts it fetches the latest launcher from the internet", "rem (so it never needs replacing), keeping a copy for when the internet is down. The dashboard itself also loads", "rem from the internet each time, so it is always the latest version. Nothing else needs to be on this PC.", "rem PRIVATE: this file contains your access code. Don't share it.", 'set "APPS=' + appsBase + '"', "set \"SCREEN=%APPS%screen/\"", 'set "LINK=' + String(link || '').replace(/%/g, '%%') + '"', "set \"FDBAT=%~f0\"", "set \"FDPROFILE=%LOCALAPPDATA%\\FamilyDashboardKiosk\"", "if not exist \"%FDPROFILE%\" mkdir \"%FDPROFILE%\"", "powershell -NoProfile -ExecutionPolicy Bypass -Command \"$f = Join-Path $env:FDPROFILE 'launcher.ps1'; [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12; for ($i = 0; $i -lt 30; $i++) { try { $w = New-Object Net.WebClient; $w.Encoding = [Text.Encoding]::UTF8; $t = $w.DownloadString($env:APPS + 'downloads/windows/launcher.ps1?t=' + [DateTime]::Now.Ticks); if ($t -match 'FAMILY-DASHBOARD-LAUNCHER') { Set-Content -Path $f -Value $t -Encoding UTF8 }; break } catch { if (Test-Path $f) { break }; Start-Sleep -Seconds 2 } }; if (Test-Path $f) { & $f } else { Start-Process 'msedge' -ArgumentList @('--kiosk', $(if ($env:LINK) { $env:LINK } else { $env:SCREEN }), '--edge-kiosk-type=fullscreen') }\"", ""].join('\r\n');
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
        if (v.needLogin) return v.hasClient ? 'Keys saved – now Connect Spotify in the Family Admin app' : 'Add Spotify keys (the “Free API keys” step)';
        switch (w.type) {
            case 'weather': return v.now ? v.now.temp + '° and ' + (v.days || []).length + ' days of forecast' : '';
            case 'traffic': return (v.routes || []).map(function (r) { return r.name + (r.error ? ' ⚠ ' + r.error : ' ' + r.mins + ' min'); }).join(' · ');
            case 'trains': return v.from + ' → ' + v.to + ': ' + (v.services || []).length + ' trains';
            case 'bins': return (v.upcoming || []).length ? 'Next collection ' + v.upcoming[0].date : 'No collections found – check the Bins settings';
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
        return { welcome: S.privacy === P.version, sheet: connected() || S.step > 1, publish: connected(), licence: !!(S.licOk || S.licensed), devices: !!S.devicesSeen, family: !!S.familyDone,
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
        $('page').innerHTML = st.render().replace(/<h1>\d+\.\s*/, S.step && st.id !== 'update' && !SOLO ? '<h1>' + S.step + '. ' : '<h1>');
        if (st.wire) st.wire();
        $('back').style.visibility = S.step ? 'visible' : 'hidden';
        $('next').style.visibility = S.step < STEPS.length - 1 ? 'visible' : 'hidden';
        $('next').textContent = S.step === 0 ? 'Start →' : 'Next →';
        var ok = !st.ready || st.ready();
        $('next').classList.toggle('off', !ok);
        $('next').title = ok ? '' : st.blocked || '';
        $('where').textContent = st.id === 'update' || SOLO ? '' : 'Step ' + S.step + ' of ' + (STEPS.length - 2);
        if (SOLO) { $('back').style.visibility = 'hidden'; $('next').style.visibility = 'visible'; $('next').classList.remove('off'); $('next').textContent = 'Done – back to Setup'; }
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
    $('next').onclick = function () { if (SOLO) { location.href = '../#/tools'; return; } go(S.step + 1); };
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
        if (goTo === 'welcome') { delete S.mode; save(); }      // the whole wizard on this dashboard: ask again what to do
        // Moving from another Google account: remember the moving pack until the new dashboard is connected.
        // A licence key from the order email's link: filled in (and checked) once the Sheet is connected.
        if (p.key) { S.licKey = p.key; save(); }
        // Started from a new screen's QR code: connect that screen once this family is set up.
        if (p.pair) { S.pairCode = p.pair; save(); }
        if (p.pack) { S.pack = p.pack.replace(/[^\w-]/g, ''); save(); setTimeout(function () { toast('Moving your dashboard: set up this new one as usual – at “Publish & connect” you’ll bring everything across'); }, 600); }
        if (p.api && p.code) {
            var changed = p.api !== S.url || p.code !== S.code;
            S.url = p.api; S.code = p.code; if (changed) S.connected = false; save();
        }
        render();
        var after = function () {
            var ids = STEPS.map(function (x) { return x.id; });
            if (goTo && ids.indexOf(goTo) >= 0 && connected()) { if (goTo === 'family') S.fam = null; S.step = S.privacy === P.version || SOLO ? ids.indexOf(goTo) : 0; if (goTo === 'check') S.autoCheck = true; }
            else if (wantUpdate) S.step = ids.indexOf('update');
            else if (p.from === 'sheet' && connected()) S.step = S.privacy === P.version ? ids.indexOf(S.licOk || S.licensed ? 'family' : 'licence') : 0;
            render();
            if (p.from === 'sheet' && connected()) toast('Connected to your Family Dashboard Sheet \u2705');
        };
        var pending = (p.api && p.code) ? connect(true) : Promise.resolve();
        pending.then(refreshVersions).then(after, after);
    })();
})();
