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
    // The family and the calendar set-up, read from the Sheet (not kept in the browser: the Sheet is the record).
    var ADM = null, FAM = null, admBusy = false;
    function instV(k) { return ((ADM && ADM.install || []).filter(function (f) { return f.k === k; })[0] || {}).value || ''; }
    function loadAdm() {
        if (admBusy) return; admBusy = true;
        setTimeout(function () {
            post({ action: 'admin' }).then(function (d) { admBusy = false; ADM = d; render(); },
                function (e) { admBusy = false; var b = $('admLoad'); if (b) b.innerHTML = okLine(false, e.message); });
        }, 0);
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
        { k: 'RailDataKey', name: 'National Rail', uk: true, need: 'The live train departure board (UK only)', widgets: ['trains'], free: 'Free.',
          steps: ['Easiest: go to <a href="https://realtime.nationalrail.co.uk/OpenLDBWSRegistration" target="_blank" rel="noopener">realtime.nationalrail.co.uk/OpenLDBWSRegistration</a> and fill in the form (free).',
                  'National Rail emails you a <b>token</b> that looks like <code>xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx</code> – paste that here. (It’s the same token the Raspberry Pi departure boards use.)',
                  'Or, if you already have one: a <b>Live Departure Board</b> consumer key from <a href="https://raildata.org.uk/" target="_blank" rel="noopener">raildata.org.uk</a> works too.'] },
        { k: 'TransportApiId', k2: 'TransportApiKey', name: 'TransportAPI', uk: true, need: 'UK only – live bus times', widgets: ['bus'], free: 'Free: 30 updates a day (the screen spreads them over school-run times).',
          steps: ['Go to <a href="https://developer.transportapi.com/signup" target="_blank" rel="noopener">developer.transportapi.com/signup</a> and sign up for the free plan.',
                  'Sign in and open <b>Applications</b> (or Dashboard).',
                  'Copy the <b>Application ID</b> and the <b>Key</b>.'] },
        { k: 'NasaKey', name: 'NASA', need: 'The NASA Daily Picture', widgets: ['apod'], free: 'Free. Works without one for a while (DEMO_KEY), but that runs out.',
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
        { id: 'welcome', title: 'Welcome', render: function () {
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
                '<div class="note warn"><h3>What you need before you start</h3><ul class="need">' +
                    '<li><b>A Google (Gmail) account</b> – ideally the one your family calendar is in. No Google account yet? <a href="https://accounts.google.com/signup" target="_blank" rel="noopener">Create one free</a>, then come back here.</li>' +
                    '<li><b>This page open on a computer.</b></li>' +
                    '<li><b>Your phone</b> – you’ll put the <b>Family Admin</b> app on it. It’s important: if this website ever forgets your family, the app is how you connect it again (we’ll also email you a backup link).</li></ul>' +
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
                '<p class="mute">Stuck at any point? Every step has a <b>Help</b> link, or see the <a href="../../help/" target="_blank" rel="noopener">help centre</a>.</p>';
        }, wire: function () {
            if ($('suAmend')) $('suAmend').onclick = function () { S.mode = 'amend'; save(); render(); };
            if ($('suWipe')) $('suWipe').onclick = function () {
                if (!confirm('Clear all the settings and start again? A backup copy of your Google Sheet is saved in your Google Drive first.')) return;
                var b = this; b.disabled = true; $('suWipeSt').textContent = '⏳ Making the backup, then clearing… (up to a minute)';
                post({ action: 'resetForSetup' }).then(function (d) {
                    S.mode = 'fresh'; S.fam = null; ADM = null; FAM = null; S.backup = { url: d.backupUrl, name: d.backupName }; save();
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
        }, ready: function () { return !connected() || !!S.mode; }, blocked: 'Choose what to do first – change the existing set-up, or start again' },

        { id: 'privacy', title: 'Your privacy', render: function () {
            return '<h1>1. Your privacy</h1><p class="lead">Before you start: what the dashboard keeps about your family, and where. In short – everything stays in your own Google account.</p>' +
                '<div class="card big privacy"><h3>Privacy notice</h3><ul>' + P.summary.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ul>' +
                '<details><summary>Read the full privacy notice</summary><div class="pv-full">' + P.full + '</div></details></div>' +
                '<div class="card big"><label class="tick"><input type="checkbox" id="pvOk"' + (S.privacy === P.version ? ' checked' : '') + '> I have read and accept the privacy notice (version ' + esc(P.version) + ', ' + esc(P.updated || '') + ')</label></div>';
        }, wire: function () {
            if ($('pvOk')) $('pvOk').onchange = function () {
                S.privacy = $('pvOk').checked ? P.version : ''; save(); render();
                if (S.privacy) toast('Thanks – press Next at the bottom');
                if (S.privacy && connected()) post({ action: 'acceptPrivacy', version: P.version, who: 'setup app' }).catch(function () {});
            };
        }, ready: function () { return S.privacy === P.version; }, blocked: 'Tick the box to accept the privacy notice first' },

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
                '<button class="btn good" id="licGo">Check and save</button></div>' +
                '<p class="mute">By adding your key you agree to the <a href="../../licence.html" target="_blank" rel="noopener">licence agreement</a> – one short page.</p>' +
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

        { id: 'family', title: 'Your family', render: function () {
            if (!connected()) return '<h1>4. Your family</h1>' + needConnect();
            if (!ADM) { loadAdm(); return '<h1>4. Your family</h1><div class="card" id="admLoad"><div class="status">Reading your Sheet…</div></div>'; }
            if (!FAM) FAM = { name: ADM.familyName || '', people: ((ADM.family || {}).people || []).map(function (p) { return { name: p.name, was: p.name, colour: p.colour, rewards: !!p.points }; }) };
            return '<h1>4. Your family</h1>' +
                '<p class="lead">Who’s in the family. Each person has a colour of their own, and you tick <b>⭐ Rewards</b> for anyone who takes part in the reward system (usually the children). ' +
                    'You can change all of this later in the Configurator → Family. <span class="mute">(About 5 minutes.)</span></p>' +
                '<div class="card big"><h3>Your family’s name</h3><p class="mute">Shown on the Home page – e.g. “Smith” for “The Smith family”.</p>' +
                    '<input id="fwName" maxlength="30" placeholder="e.g. Smith" value="' + esc(FAM.name) + '"></div>' +
                '<div class="card big"><h3>Where you live</h3><p class="mute">Your country sets the public holidays, map searches and units, and which widgets work there – a few (bin days from your council, trains, buses) are UK-only.</p>' +
                    '<div class="grid2"><div><label>Country</label>' + FD_countrySelect('fwCountry', S.country || instV('Country') || FD_guessCountry()) + '</div>' +
                    '<div><label>Time zone</label>' + FD_tzSelect('fwTz', S.tz || (instV('TimeZone') !== 'Europe/London' && instV('TimeZone')) || (Intl.DateTimeFormat().resolvedOptions() || {}).timeZone || 'Europe/London') + '</div></div>' +
                    '<div class="grid2"><div><label>Weeks start on</label>' + FD_weekSelect('fwWeek', S.week || (instV('Country') ? instV('WeekStart') : FD_localeFor(FD_guessCountry()).WeekStart)) + '</div>' +
                    '<div><label>How dates are written</label>' + FD_orderSelect('fwOrder', S.order || (instV('Country') ? instV('DateOrder') : FD_localeFor(FD_guessCountry()).DateOrder)) + '</div></div>' +
                    '<p class="mute">Filled in from your country – change them if you like.</p>' +
                    '<label>Home address or postcode</label><p class="mute">Used for the weather, traffic, the nearest bus stop, bin days and the flights map.</p>' +
                    '<input id="home" value="' + esc(S.home || ((ADM.install || []).filter(function (f) { return f.k === 'HomeAddress'; })[0] || {}).value || '') + '" placeholder="e.g. London, SW1A 0AA"></div>' +
                '<div class="card big"><h3>Everyone in the family</h3><div id="fwRows">' + FAM.people.map(famRow).join('') + '</div>' +
                    (FAM.people.length < 10 ? '<button class="btn sm" id="fwAdd">+ Add a person</button>' : '<p class="mute">That’s the most (10).</p>') +
                    '<p class="mute">Up to 10 people. Ticking ⭐ Rewards gives them points for tasks, daily to-dos and reminders, and a Reward Widget of their own to put on a screen. ' +
                    'Grouping people for the calendar – “the children”, “Adam &amp; Eve” – is the next step.</p>' +
                    '<div class="row" style="margin-top:14px"><button class="btn good" id="fwSave">Save the family</button></div><div id="famStatus"></div></div>';
            function famRow(p, i) {
                return '<div class="fw-row"><input type="color" data-fc="' + i + '" value="' + esc(p.colour || '#3fa9f5') + '" title="Their colour">' +
                    '<input data-fn="' + i + '" maxlength="10" value="' + esc(p.name) + '" placeholder="Name" autocomplete="off">' +
                    '<button type="button" class="ptb' + (p.rewards ? ' on' : '') + '" data-fr="' + i + '">⭐ Rewards</button>' +
                    '<button type="button" class="x" data-fx="' + i + '" title="Remove">✕</button></div>';
            }
        }, wire: function () {
            if (!connected() || !ADM || !FAM) return;
            var PAL = ['#3fa9f5', '#f5a623', '#7ed321', '#a855f7', '#f472b6', '#22d3ee', '#facc15', '#fb7185', '#34d399', '#c084fc'];
            $('fwName').oninput = function () { FAM.name = this.value; };
            $('fwCountry').onchange = function () { var c = FD_COUNTRIES.filter(function (x) { return x[0] === $('fwCountry').value; })[0]; if (c) $('fwTz').value = c[3]; var lc = FD_localeFor($('fwCountry').value); $('fwWeek').value = lc.WeekStart; $('fwOrder').value = lc.DateOrder; };
            $('fwRows').oninput = function (e) { var t = e.target, k;
                if ((k = t.getAttribute('data-fn')) !== null) FAM.people[+k].name = t.value; else if ((k = t.getAttribute('data-fc')) !== null) FAM.people[+k].colour = t.value; };
            $('fwRows').onclick = function (e) { var t;
                if ((t = e.target.closest('[data-fr]'))) { var p = FAM.people[+t.getAttribute('data-fr')]; p.rewards = !p.rewards; t.classList.toggle('on', p.rewards); }
                else if ((t = e.target.closest('[data-fx]'))) { var q = FAM.people[+t.getAttribute('data-fx')];
                    if (q.was && !confirm('Take ' + (q.name || 'this person') + ' out of the family?' + (q.rewards ? ' Their points are kept.' : ''))) return;
                    FAM.people.splice(+t.getAttribute('data-fx'), 1); render(); } };
            if ($('fwAdd')) $('fwAdd').onclick = function () {
                var used = FAM.people.map(function (p) { return p.colour; }), c = PAL.filter(function (x) { return used.indexOf(x) < 0; })[0] || PAL[FAM.people.length % PAL.length];
                FAM.people.push({ name: '', colour: c, rewards: false }); render();
                var ins = document.querySelectorAll('[data-fn]'); if (ins.length) ins[ins.length - 1].focus();
            };
            $('fwSave').onclick = function () {
                var home = $('home').value.trim(), list = FAM.people.filter(function (p) { return p.name.trim(); });
                if (!list.length) { $('famStatus').innerHTML = okLine(false, 'Add at least one person'); return; }
                if (!home) { $('famStatus').innerHTML = okLine(false, 'Add your home address or postcode'); return; }
                var b = this; b.disabled = true; S.home = home; save();
                $('famStatus').innerHTML = '<div class="status">Saving…</div>';
                var ctry = $('fwCountry').value, cinfo = FD_COUNTRIES.filter(function (x) { return x[0] === ctry; })[0];
                S.country = ctry; S.tz = $('fwTz').value; S.week = $('fwWeek').value; S.order = $('fwOrder').value; save();
                post({ action: 'saveInstall', values: { HomeAddress: home, Country: ctry, TimeZone: S.tz, WeekStart: S.week, DateOrder: S.order, Currency: cinfo ? cinfo[2].trim() : '£' } }).then(function () {
                    return post({ action: 'saveFamilyPeople', people: list, familyName: $('fwName').value.trim() });
                }).then(function (d) {
                    ADM = d; FAM = null; S.familyDone = true; save(); render();
                    $('famStatus').innerHTML = okLine(true, 'Saved. Press Next to set up the calendar.');
                    var pc = ctry === 'GB' && /\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/i.exec(home);     // bin days: can this council be read automatically?
                    if (pc) get('binCouncil', { postcode: pc[1] }).then(function (x) {
                        $('famStatus').insertAdjacentHTML('beforeend', x.automatic ? okLine(true, 'Bins: ' + x.message + '.')
                            : '<div class="status warn">🗑 <b>Bins:</b> ' + esc(x.message) + ' You can do that later in Family Admin → the Bins widget.</div>');
                    }, function () { /* older Google script – the Check step will say */ });
                }).catch(function (e) { b.disabled = false; $('famStatus').innerHTML = okLine(false, e.message); });
            };
        } },
        { id: 'calendar', title: 'Your calendar', render: function () {
            if (!connected()) return '<h1>5. Your calendar</h1>' + needConnect();
            if (!ADM) { loadAdm(); return '<h1>5. Your calendar</h1><div class="card" id="admLoad"><div class="status">Reading your Sheet…</div></div>'; }
            return '<h1>5. Your calendar</h1>' +
                '<p class="lead">How the dashboard colours your Google Calendar. Every event goes in a <b>category</b> – a group of people (Family is everyone), a person, or a general one like Holiday – ' +
                    'and each category has one of Google Calendar’s colours, so events you add in Google Calendar land in the right place. This is the same as the Configurator → Screens → your calendar page. ' +
                    '<span class="mute">(About 5 minutes.)</span></p>' +
                '<div id="calBox" class="cs-box"></div>';
        }, wire: function () {
            if (!connected() || !ADM || !window.FDCalSetup) return;
            var cal = (ADM.pages || []).filter(function (p) { return p.type === 'calendar'; })[0];
            window.FD = window.FD || { post: function (b) { return post(b); } };
            var hooks = { data: function () { return ADM; }, toast: function (m, bad) { toast(m, bad); },
                act: function (b, msg) {
                    return post(b).then(function (d) { if (d && d.calSetup) ADM = d; S.calDone = true; save(); if (msg) toast(msg); draw(); return d; },
                        function (e) { toast(e.message, true); });
                } };
            var draw = function () { window.FDCalSetup.render($('calBox'), cal ? cal.id : '', hooks); renderSteps(); };
            draw();
        } },
        { id: 'devices', title: 'Connect your display', render: function () {
            if (!connected()) return '<h1>6. Connect your display</h1>' + needConnect();
            var dev = ({ pc: 1, pi: 1, tab: 1, here: 1 })[S.dev] ? S.dev : 'pc';
            var tab = function (k, t) { return '<button data-dev="' + k + '" class="' + (dev === k ? 'on' : '') + '">' + t + '</button>'; };
            var codeBox = function (what) {
                return '<li>The ' + what + ' shows <b>“Connect this screen”</b> and a code like <b>K7Q2-M9XD</b>. Type that code here and click <b>Connect</b>:' +
                    '<div class="row" style="margin-top:8px"><input id="tabCode" placeholder="e.g. K7Q2-M9XD" autocapitalize="characters" spellcheck="false" style="max-width:16rem"><button class="btn" id="tabGo">Connect</button></div><div id="tabStatus" class="mute"></div>' +
                    'It shows your dashboard within a few seconds and remembers it.</li>';
            };
            var pasteLink = '<details class="card"><summary>Or use the private screen link instead of a code</summary><p class="mute">If the screen says “Connect this screen”, you can paste this link there instead.</p>' + copyBox('scr', 'Your screen link', screenUrl(), 3) + '</details>';
            var body = dev === 'pc' ? '<div class="card big"><h3>XENEON EDGE on a Windows PC</h3><p class="mute">The XENEON EDGE plugs into your Windows PC as a second screen. A small start file opens the dashboard full screen on it.</p>' + '<ol class="howto"><li>Click <button class="btn" id="bat">Download my start file</button> and move the file somewhere you’ll find it, such as <b>Documents</b>. Doing this on a different computer? Copy the file to the PC the XENEON EDGE is plugged into (a USB stick, or email it to yourself).</li>' +
                    '<li>Double-click it. It asks once whether to start automatically with the PC, then opens the dashboard full screen on the XENEON EDGE, already connected.</li>' +
                    '<li>If Windows says "Windows protected your PC": <b>More info → Run anyway</b>. Close the dashboard with <b>Alt+F4</b>.</li></ol>' +
                    '<details><summary>Or connect by pasting</summary><p class="mute">If the screen says "Connect this screen", copy this link and paste it there:</p>' + copyBox('scr2', 'Your screen link', screenUrl(), 3) + '</details></div>'
                : dev === 'pi' ? '<div class="card big"><h3>XENEON EDGE on a Raspberry Pi</h3><p class="mute">The XENEON EDGE plugged into a Raspberry Pi, which runs the dashboard on its own – no PC needed.</p><ol class="howto">' +
                    '<li>Install <b>Raspberry Pi OS with desktop</b>, and connect it to your Wi-Fi.</li>' +
                    '<li>Open <b>Terminal</b> and type:<code class="cmd">chromium --kiosk --noerrdialogs --disable-infobars "' + esc(appsBase) + 'screen/"</code></li>' +
                    codeBox('screen') +
                    '<li>To start it automatically when the Pi switches on, put that line in <code>~/.config/labwc/autostart</code>.</li></ol></div>' + pasteLink
                : dev === 'tab' ? '<div class="card big"><h3>A tablet</h3><p class="mute">An Android or Amazon Fire tablet – on the wall or the kitchen worktop.</p><ol class="howto">' +
                    '<li>On the tablet, install <b>Fully Kiosk Browser</b> (Google Play, or the Amazon Appstore on a Fire tablet).</li>' +
                    '<li>Open it. Where it asks for a <b>Start URL</b> (or in its Settings → Web Content Settings → Start URL), type this short address:' +
                    '<div class="bigaddr">' + esc(appsBase.replace(/^https:\/\//, '') + 'screen/') + '</div>' +
                    '<span class="mute">Or scan this with the tablet’s camera – it’s the same short address:</span>' + qr(appsBase + 'screen/') + '</li>' +
                    codeBox('tablet') +
                    '<li>In Fully Kiosk’s settings, turn on <b>Keep Screen On</b> and, if you like, <b>Kiosk Mode</b>.</li></ol></div>' + pasteLink
                : '<div class="card big"><h3>In a browser on this computer</h3><p>No screen to connect yet, or just want to try it? Open the dashboard in a new tab here – it’s what the screen will show, already connected.</p>' +
                    '<a class="btn" href="' + esc(screenUrl()) + '" target="_blank" rel="noopener">Open the dashboard in a new tab</a>' +
                    '<p class="mute">Press <b>F11</b> for full screen, and F11 again to come back. Make the window wide and short to see it like the XENEON EDGE. When you get your screen, come back to this step, or use the Family Admin app → More → Devices and Phones.</p></div>';
            return '<h1>6. Connect your display</h1><p class="lead">The display is what shows the dashboard – the XENEON EDGE, a tablet, or a browser. Choose yours below. ' +
                    'These links are <b>private</b>: they point at your Sheet and contain your access code, so only use them on your own devices. <span class="mute">(About 5 minutes.)</span></p>' +
                '<div class="tabs" id="devTabs">' + tab('pc', 'XENEON EDGE (Windows)') + tab('pi', 'XENEON EDGE (Raspberry Pi)') + tab('tab', 'Tablet') + tab('here', 'PC browser') + '</div>' + body + helpLink('connect');
        }, wire: function () {
            if (!connected()) return;
            if ($('tabGo')) $('tabGo').onclick = function () {
                var b = this; b.disabled = true; $('tabStatus').textContent = 'Sending…';
                FDPairSend.send($('tabCode').value, { url: S.url, code: S.code }).then(function () { $('tabStatus').innerHTML = okLine(true, 'Sent – the screen connects within a few seconds.'); b.disabled = false; },
                    function (e) { b.disabled = false; $('tabStatus').innerHTML = okLine(false, e.message); });
            };
            $('devTabs').onclick = function (e) { var b = e.target.closest('[data-dev]'); if (b) { S.dev = b.getAttribute('data-dev'); save(); render(); } };
            if ($('bat')) $('bat').onclick = function () { download('Start Family Dashboard.bat', batFile(screenUrl())); };
        } },
        { id: 'phones', title: 'Connect your phones', render: function () {
            if (!connected()) return '<h1>7. Connect your phones</h1>' + needConnect();
            var app = S.papp === 'calendar' ? 'calendar' : 'admin', os = S.pos === 'android' ? 'android' : 'iphone';
            var tab = function (attr, k, cur, t) { return '<button ' + attr + '="' + k + '" class="' + (cur === k ? 'on' : '') + '">' + t + '</button>'; };
            var A = app === 'admin'
                ? { ico: '⚙', name: 'Family Admin', who: 'for the adults', what: 'The grown-ups’ app: give and take away the children’s points and tick off their tasks, add notes and shopping-list items, change the widgets’ everyday settings, and look after the screen and the licence. Put it on each adult’s phone.' }
                : { ico: '📅', name: 'Family Calendar', who: 'for everyone', what: 'The family’s shared calendar: see what’s on and add events, in the same colours as the screen. Put it on everyone’s phone – the children’s too, if they have one. It can’t change points or settings.' };
            return '<h1>7. Connect your phones</h1><p class="lead">There are two phone apps – choose one below and set it up on the phones that need it, then do the same for the other. <span class="mute">(About 5 minutes.)</span></p>' +
                '<div class="note warn"><p><b>Do put Family Admin on your own phone.</b> If the Configurator website on your computer ever forgets your family, it shows a code – and Family Admin is how you connect it again. ' +
                    'A backup of your private links has also been emailed to your Google account (“Your Family Dashboard links”).</p></div>' +
                '<div class="tabs" id="appTabs">' + tab('data-papp', 'admin', app, '⚙ Family Admin (adults)') + tab('data-papp', 'calendar', app, '📅 Family Calendar (everyone)') + '</div>' +
                '<div class="card big"><h3>' + A.ico + ' ' + A.name + ' <span class="mute">– ' + A.who + '</span></h3><p>' + A.what + '</p>' +
                    '<ol class="howto"><li><b>Scan this code</b> with the phone’s camera and tap the link that appears. It opens ' + A.name + ', already connected to your family – the code holds your family’s private link.' +
                    qr(linkFor(app)) +
                    '<details><summary>No camera, or scanning doesn’t work?</summary>' + copyBox('lnk', A.name + ' link', linkFor(app), 3) + '<p class="mute">Send yourself this link (e.g. in a message) and open it on the phone.</p></details></li>' +
                    '<li><b>Install it and add it to the home screen.</b> It doesn’t come from the App Store or Google Play – you add it from the page that opened:' +
                    '<div class="tabs" id="osTabs">' + tab('data-pos', 'iphone', os, 'iPhone') + tab('data-pos', 'android', os, 'Android') + '</div>' +
                    (os === 'iphone' ? '<ol class="howto"><li>It needs to be open in <b>Safari</b> – if it opened somewhere else, tap “Open in Safari” (or the compass).</li>' +
                        '<li>Tap the <b>Share</b> button – the square with an arrow – at the bottom of the screen.</li><li>Scroll down, tap <b>Add to Home Screen</b>, then <b>Add</b>.</li>' +
                        '<li>From now on, open it from the new <b>' + A.name + '</b> icon on your home screen.</li></ol>'
                      : '<ol class="howto"><li>It needs to be open in <b>Chrome</b>.</li><li>Tap <b>Install</b> if it offers it – or tap the <b>⋮</b> menu (top right) and choose <b>Install app</b> or <b>Add to Home screen</b>.</li>' +
                        '<li>Tap <b>Install</b> to confirm.</li><li>From now on, open it from the new <b>' + A.name + '</b> icon on your home screen.</li></ol>') + '</li>' +
                    '<li>Already had the app on this phone? Open it – if it asks you to connect, scan the code again or paste the link.</li></ol></div>' + helpLink('connect');
        }, wire: function () {
            if (!connected()) return;
            $('appTabs').onclick = function (e) { var b = e.target.closest('[data-papp]'); if (b) { S.papp = b.getAttribute('data-papp'); save(); render(); } };
            $('osTabs').onclick = function (e) { var b = e.target.closest('[data-pos]'); if (b) { S.pos = b.getAttribute('data-pos'); save(); render(); } };
        } },

        { id: 'keys', title: 'Free API keys', render: function () {
            if (!connected()) return '<h1>8. Free keys for live data</h1>' + needConnect();
            S.keys = S.keys || {}; S.skip = S.skip || {};
            // Outside the UK, the UK-only services (trains, buses) are skipped – their widgets wouldn't work
            if (S.country && S.country !== 'GB') KEYS.forEach(function (x) { if (x.uk && !S.keys[x.k] && !S.skip[x.k]) { S.skip[x.k] = 1; showWidgets(x.widgets, false).catch(function () {}); } });
            return '<h1>8. Free keys for live data</h1><p class="lead">Some widgets show live information from other services – train times, bus times, traffic. They fetch it through an <b>API</b>: ' +
                'a way for one computer system to ask another for information. Each service wants to know who’s asking, so you make a free account with it and it gives you a <b>key</b> ' +
                '(a bit like a licence) to paste in here. They’re all free. Skip any you don’t want – that widget is just hidden.</p>' +
                '<p class="mute">Weather, bins, news, flights, quotes and photos need no key at all.</p>' +
                keysHtml();
            function keysHtml() {
                var n = KEYS.length, at = Math.max(0, Math.min(n, +S.kstep || 0));
                var bar = '<div class="kprog">' + KEYS.map(function (x, i) {
                    var st = S.keys[x.k] ? 'done' : S.skip[x.k] ? 'skipped' : '';
                    return '<button type="button" class="kp-i ' + st + (i === at ? ' on' : '') + '" data-kgo="' + i + '"><span>' + (st === 'done' ? '✔' : st === 'skipped' ? '–' : i + 1) + '</span>' + esc(x.name) + '</button>';
                }).join('<i class="kp-sep"></i>') + '</div>';
                if (at >= n) {
                    var got = KEYS.filter(function (x) { return S.keys[x.k]; }), sk = KEYS.filter(function (x) { return S.skip[x.k]; });
                    return bar + '<div class="card big"><h3>✔ That’s all the services</h3>' +
                        '<p>' + (got.length ? 'Added: <b>' + got.map(function (x) { return esc(x.name); }).join(', ') + '</b>. ' : '') + (sk.length ? 'Skipped (their widgets are hidden): ' + sk.map(function (x) { return esc(x.name); }).join(', ') + '. ' : '') +
                        'You can add or change any of them later in the Configurator → Advanced → External data (API) keys.</p>' +
                        '<div class="row"><button class="btn ghost" data-kgo="' + (n - 1) + '">← Back to ' + esc(KEYS[n - 1].name) + '</button></div><p class="mute">Press <b>Next</b> at the bottom to carry on.</p></div>';
                }
                var x = KEYS[at], done = S.keys[x.k], skipped = S.skip[x.k];
                return bar + '<div class="card big key' + (done ? ' done' : skipped ? ' skipped' : '') + '">' +
                    '<div class="khead"><span class="kcount">' + (at + 1) + ' of ' + n + '</span><h3>' + esc(x.name) + '</h3><span class="kstate">' + (done ? '✔ saved' : skipped ? 'skipped' : '') + '</span></div>' +
                    '<p><b>For:</b> ' + esc(x.need) + '</p>' +
                    '<ol class="howto">' + x.steps.map(function (st) { return '<li>' + st + '</li>'; }).join('') + '</ol>' +
                    (x.k === 'SpotifyClientId' ? copyBox('redir' + at, 'Your Redirect URI', S.url, 2) : '') +
                    '<p class="mute">' + esc(x.free) + '</p>' +
                    '<div class="row"><input data-key="' + x.k + '" placeholder="' + (x.k2 ? (x.k === 'TransportApiId' ? 'Application ID' : 'Client ID') : 'Paste the key') + '" value="' + esc(S.keys[x.k] || '') + '" spellcheck="false">' +
                    (x.k2 ? '<input data-key="' + x.k2 + '" placeholder="' + (x.k2 === 'TransportApiKey' ? 'Key' : 'Client secret') + '" value="' + esc(S.keys[x.k2] || '') + '" spellcheck="false">' : '') + '</div>' +
                    '<div class="kmsg" id="kmsg"></div>' +
                    '<div class="row knav">' + (at ? '<button class="btn ghost" data-kgo="' + (at - 1) + '">← ' + esc(KEYS[at - 1].name) + '</button>' : '<span></span>') +
                    '<span class="kgrow"></span><button class="btn ghost" id="kSkip">Skip – hide this widget</button><button class="btn good" id="kSave">Save and continue →</button></div></div>';
            }
        }, wire: function () {
            if (!connected()) return;
            var n = KEYS.length, at = Math.max(0, Math.min(n, +S.kstep || 0)), x = KEYS[at];
            var go = function (i) { S.kstep = i; save(); render(); };
            $('page').querySelectorAll('[data-kgo]').forEach(function (b) { b.onclick = function () { go(+b.getAttribute('data-kgo')); }; });
            if (!x) return;
            $('kSave').onclick = function () {
                var vals = {}, b = this;
                $('page').querySelectorAll('[data-key]').forEach(function (i) { vals[i.getAttribute('data-key')] = i.value.trim(); });
                if (!vals[x.k] || (x.k2 && !vals[x.k2])) { $('kmsg').innerHTML = okLine(false, 'Paste the key' + (x.k2 ? 's' : '') + ' first – or press Skip if you don’t want ' + x.name); return; }
                b.disabled = true; b.textContent = 'Saving…';
                post({ action: 'saveInstall', values: vals }).then(function () {
                    Object.keys(vals).forEach(function (k) { S.keys[k] = vals[k]; });
                    delete S.skip[x.k]; save();
                    return showWidgets(x.widgets, true);
                }).then(function () { toast(x.name + ' saved'); go(at + 1); })
                  .catch(function (e) { b.disabled = false; b.textContent = 'Save and continue →'; $('kmsg').innerHTML = okLine(false, e.message); });
            };
            $('kSkip').onclick = function () {
                S.skip[x.k] = 1; save();
                showWidgets(x.widgets, false).then(function () { toast(x.name + ' skipped – its widget is hidden'); }, function (e) { toast(e.message, true); });
                go(at + 1);
            };
        } },
        { id: 'check', title: 'Check everything', render: function () {
            if (!connected()) return '<h1>9. Check everything</h1>' + needConnect();
            return '<h1>9. Check everything</h1><p class="lead">Two last checks: that every widget can fetch its live data, and that your software is up to date.</p>' +
                '<div class="card big"><h3>1. The widgets</h3><p class="mute">This asks your Sheet to fetch every widget’s live data and reports anything that needs attention.</p>' +
                '<button class="btn" id="runCheck">Run the check</button><div id="checkOut"></div></div>' +
                '<h2 style="margin-top:28px">2. Software updates</h2>' + updatesHtml();
            function updatesHtml() {
            var mine = S.scriptVersion || '', newest = LATEST && LATEST.script;
            var behind = mine && newest && newer(newest, mine);
            return '<div class="card big"><h3>Screen and phone apps</h3><p>These update themselves. The screen checks every 10 minutes and updates when nobody is using it; the phone apps pick it up the next time they’re opened.</p></div>' +
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
            }
        }, wire: function () {
            if (!connected()) return;
            $('runCheck').onclick = runCheck;
            if (S.autoCheck) { S.autoCheck = false; runCheck(); }
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
        { id: 'finish', title: 'Finish', render: function () {
            var mine = S.scriptVersion || '', newest = LATEST && LATEST.script, behind = mine && newest && newer(newest, mine);
            var nKeys = KEYS.filter(function (x) { return S.keys && S.keys[x.k]; }).length, nSkip = KEYS.filter(function (x) { return S.skip && S.skip[x.k]; }).length;
            // [step, ok, what it says]. ok: true = fine, 'note' = fine but worth knowing, false = needs doing.
            var rows = [
                ['privacy', isDone('privacy'), isDone('privacy') ? 'Privacy notice accepted' : 'The privacy notice hasn’t been accepted'],
                ['publish', connected(), connected() ? 'Your Google Sheet is made, published and connected' : 'Your Google Sheet isn’t connected yet'],
                ['licence', S.licOk || S.licensed ? true : 'note', S.licOk || S.licensed ? 'Licence key added' : 'No licence key yet – the dashboard runs as a 14-day free trial. Add your key before it ends.'],
                ['family', isDone('family'), isDone('family') ? 'Family saved' : 'The family hasn’t been saved'],
                ['calendar', isDone('calendar') ? true : 'note', isDone('calendar') ? 'Calendar colour coding saved' : 'Calendar colour coding not saved in this setup – fine if it was already set up'],
                ['devices', isDone('devices'), isDone('devices') ? 'Display step done' : 'Your display isn’t connected yet'],
                ['phones', isDone('phones'), isDone('phones') ? 'Phone apps step done – keep Family Admin on your phone: it reconnects this website if it ever forgets your family' : 'The phone apps aren’t set up yet – Family Admin on your phone is how you reconnect this website if it forgets your family'],
                ['keys', isDone('keys') ? true : false, isDone('keys') ? nKeys + ' live-data service' + (nKeys === 1 ? '' : 's') + ' added' + (nSkip ? ', ' + nSkip + ' skipped' : '') : 'Some live-data services haven’t been added or skipped'],
                ['check', S.checkedOk ? (behind ? 'note' : true) : false, (S.checkedOk ? 'All the widgets work' : 'The widget check hasn’t passed yet') + (behind ? ' · an update to the Google script is available' : '')]
            ];
            var ids = STEPS.map(function (x) { return x.id; }), probs = rows.filter(function (r) { return r[1] === false; });
            return '<h1>' + (probs.length ? 'Nearly there' : '🎉 You’re all set') + '</h1>' +
                '<p class="lead">' + (probs.length ? 'Everything with a ⚠ still needs doing – press <b>Go to this step</b> to go back to it. Anything with an ℹ is fine, but worth knowing.' : 'Every step is done. Your dashboard is ready to use.') + '</p>' +
                '<div class="card big fin">' + rows.map(function (r) {
                    var i = ids.indexOf(r[0]), cls = r[1] === true ? 'ok' : r[1] === 'note' ? 'info' : 'bad';
                    return '<div class="fin-r ' + cls + '"><span class="fin-i">' + (cls === 'ok' ? '✔' : cls === 'info' ? 'ℹ' : '⚠') + '</span><span class="fin-t"><b>' + esc(STEPS[i].title) + '</b><small>' + esc(r[2]) + '</small></span>' +
                        (cls === 'ok' ? '' : '<button class="btn sm ghost" data-fin="' + i + '">Go to this step</button>') + '</div>';
                }).join('') + '</div>' +
                (probs.length ? '' : '<div class="card big"><h3>What next</h3><ul><li>Change anything later in the <a href="../">Configurator</a> on this computer, or the Family Admin app on your phone.</li>' +
                    '<li>Set up the reward system – tasks, daily to-dos and reminders – in the Configurator → Rewards.</li><li>Arrange the widgets on each screen in the Configurator → Screens.</li></ul>' +
                    '<a class="btn" href="../">Open the Configurator</a></div>');
        }, wire: function () {
            $('page').querySelectorAll('[data-fin]').forEach(function (b) { b.onclick = function () { go(+b.getAttribute('data-fin')); }; });
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
            if (st) st.innerHTML = okLine(true, 'Connected to your Family Dashboard Sheet.' + (L.codeWeak ? ' Tip: your access code is weak – change it in the Configurator → Advanced → My data.' : ''));
            if (!S.linksEmailed) post({ action: 'emailLinks' }).then(function (d) { S.linksEmailed = d.to || true; save(); toast('A backup of your private links has been emailed to ' + (d.to || 'you')); }, function () { /* older Google script – fine */ });
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
        news: 'News', timer: 'Kitchen timer', photos: 'Photo slideshow', clock: 'Clock', list: 'List', countdown: 'Holiday countdown', whereabouts: 'Weasley Clock',
        bus: 'Bus stop', todo: 'To-do', parcels: 'Parcels', memo: 'Notes', quote: 'Quote', apod: 'NASA Daily Picture', spotify: 'Spotify', words: 'Word of the day' };
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
        return { welcome: S.step > 0 || S.privacy === P.version, privacy: S.privacy === P.version, sheet: connected() || S.step > 1, publish: connected(), licence: !!(S.licOk || S.licensed), devices: !!S.devicesSeen, phones: !!S.phonesSeen, family: !!S.familyDone, calendar: !!S.calDone,
            keys: KEYS.every(function (x) { return S.keys && S.keys[x.k] || S.skip && S.skip[x.k]; }), check: !!S.checkedOk, finish: false }[id];
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
        if (st.id === 'phones' && connected()) S.phonesSeen = true;
        var pg = $('page'); pg.onclick = pg.oninput = pg.onchange = null; pg.classList.remove('show-match');
        $('page').innerHTML = st.render().replace(/<h1>\d+\.\s*/, S.step && st.id !== 'finish' && !SOLO ? '<h1>' + S.step + '. ' : '<h1>');
        if (st.wire) st.wire();
        $('back').style.visibility = S.step ? 'visible' : 'hidden';
        $('next').style.visibility = S.step < STEPS.length - 1 ? 'visible' : 'hidden';
        $('next').textContent = S.step === 0 ? 'Start →' : 'Next →';
        var ok = !st.ready || st.ready();
        $('next').classList.toggle('off', !ok);
        $('next').title = ok ? '' : st.blocked || '';
        $('where').textContent = st.id === 'finish' || st.id === 'welcome' || SOLO ? '' : 'Step ' + S.step + ' of ' + (STEPS.length - 2);
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
        if (STEPS[i] && (STEPS[i].id === 'family' || STEPS[i].id === 'calendar')) { ADM = null; FAM = null; }   // read it fresh from the Sheet
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
            if (goTo && ids.indexOf(goTo) >= 0 && connected()) { if (goTo === 'family' || goTo === 'calendar') { ADM = null; FAM = null; } S.step = S.privacy === P.version || SOLO ? ids.indexOf(goTo) : ids.indexOf('privacy'); if (goTo === 'check') S.autoCheck = true; }
            else if (wantUpdate) S.step = ids.indexOf('check');
            else if (p.from === 'sheet' && connected()) S.step = S.privacy === P.version ? ids.indexOf(S.licOk || S.licensed ? 'family' : 'licence') : ids.indexOf('privacy');
            render();
            if (p.from === 'sheet' && connected()) toast('Connected to your Family Dashboard Sheet \u2705');
        };
        var pending = (p.api && p.code) ? connect(true) : Promise.resolve();
        pending.then(refreshVersions).then(after, after);
    })();
})();
