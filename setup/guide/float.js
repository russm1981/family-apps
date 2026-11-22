/* HouseRunner – the floating step guide.
 * After "Make my copy", the 9 steps for the Sheet float in a small window that stays on top of the Sheet and Apps Script tabs
 * (Chrome and Edge: Document Picture-in-Picture). Other browsers get a small separate window instead.
 * One step at a time: its picture, a line of help and, once there's a video, a "Show me" clip.
 * It closes itself when the Sheet's "Open HouseRunner" brings you back to the setup page. */
(function () {
    // The first two happen on the setup page and Google's copy page; then the 9 steps on the Sheet's Start HERE tab.
    var PRE = [
        ['Click Make my copy', 'It’s the blue <b>Make my copy</b> button on the HouseRunner setup page, behind this window. Your copy opens in a new tab.', ''],
        ['Google asks “Copy document?” – click Make a copy', 'If Google asks you to sign in, use the account you want the dashboard in – the one with the family calendar. Your new Sheet then opens on its <b>Start HERE</b> tab.', '../../shared/brand/copy-document.png']
    ];
    var STEPS = [
        ['In this Sheet: Extensions → Apps Script', 'Two clicks: <b>Extensions</b> in the menu, then <b>Apps Script</b>. Apps Script opens in a new tab.'],
        ['Click Deploy (top right) → New deployment', 'The blue <b>Deploy</b> button is at the top right of Apps Script.'],
        ['⚙ → Web app. Execute as: Me · Who has access: Anyone → Deploy', 'Click the cog ⚙ next to “Select type” and choose <b>Web app</b>. Check <b>Me</b> and <b>Anyone</b>, then <b>Deploy</b>.'],
        ['Authorize access → choose your Google account', 'Choose the account you want the family dashboard in.'],
        ['Advanced → Go to HouseRunner (unsafe)', 'Google warns because the copy is yours – you’re its “developer”. That’s normal: click <b>Advanced</b>, then <b>Go to HouseRunner (unsafe)</b>.'],
        ['Tick Select all → Continue', 'Every permission is needed – tick <b>Select all</b> at the top.'],
        ['Click the Web app URL – a new tab says “published”', 'It’s under <b>Web app</b> in the <b>Deployment successfully created</b> box. A new tab opens saying <b>HouseRunner is published</b>.'],
        ['Close the two extra tabs: “published” and Apps Script', 'Click the ✕ on each. No need to click <b>Done</b> first – it’s already published. That leaves you on your <b>Sheet</b>.'],
        ['In your Sheet: 🏠 HouseRunner → ▶ SETUP', 'Wait for <b>Published ✅</b>, then click <b>Open HouseRunner</b>. Then close the Sheet’s tab too – setup carries on in your HouseRunner setup tab, and this guide closes by itself.<br><span class="mute">No 🏠 HouseRunner menu? Reload the Sheet.</span>']
    ];
    // The setup video, once there is one: its address and each step's part of it, in seconds ([from, to]).
    var VIDEO = { src: '../../shared/brand/setup.mp4', from: [3, 8.5, 17, 30, 39, 51, 60, 60, 66, 76, 92.6] };   // where each step starts in it (the two before step 1 first)
    var ALL = PRE.map(function (x) { return [x[0], x[1], x[2], '']; }).concat(STEPS.map(function (x, k) { return [x[0], x[1], '../../shared/brand/steps/s' + (k + 1) + '.png', String(k + 1)]; }));

    var KEY = 'hrfloat.step', win = null, i = 0;
    try { i = Math.min(ALL.length - 1, Math.max(0, +localStorage.getItem(KEY) || 0)); } catch (e) { i = 0; }
    function abs(u) { return new URL(u, location.href).href; }
    function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

    var CSS = '*{box-sizing:border-box}html,body{margin:0;height:100%}body{background:#0f141b;color:#e6edf3;font:15px/1.45 "Segoe UI",Roboto,Arial,sans-serif;display:flex;flex-direction:column}' +
        '.hd{display:flex;align-items:center;gap:8px;padding:10px 14px 6px;font-size:12.5px;color:#9fb0c2}.hd b{color:#e6edf3}.hd .n{margin-left:auto;font-weight:700;color:#3fa9f5}' +
        '.bar{height:4px;background:#243040;margin:0 14px;border-radius:3px;overflow:hidden}.bar i{display:block;height:100%;background:#3fa9f5;transition:width .2s}' +
        '.bd{flex:1;overflow:auto;padding:10px 14px}h2{font-size:18px;line-height:1.25;margin:4px 0 10px;display:flex;gap:9px}h2 span{flex:none;width:28px;height:28px;border-radius:50%;background:#3fa9f5;color:#fff;display:flex;align-items:center;justify-content:center;font-size:15px}' +
        '.pic{display:block;width:100%;border-radius:10px;background:#fff;border:1px solid #2b3a4c}p{margin:10px 0 0;color:#cbd6e2}p b{color:#fff}.mute{color:#8a9bb0;font-size:13px}' +
        '.vl{color:#7cc4fa;font-weight:700;text-decoration:none}.vl:hover{text-decoration:underline}' +
        '.ft{display:flex;gap:8px;align-items:center;padding:10px 14px 12px;border-top:1px solid #1e2a38}' +
        'button{font:inherit;font-weight:700;border-radius:10px;padding:9px 16px;cursor:pointer;border:1px solid transparent}.go{background:#3fa9f5;color:#fff;margin-left:auto}.gh{background:transparent;color:#cbd6e2;border-color:#33465c}' +
        'button:disabled{opacity:.35;cursor:default}.dots{display:flex;flex-wrap:wrap;gap:4px;justify-content:center;padding:0 14px 10px}.dots button{width:22px;height:22px;padding:0;border-radius:50%;font-size:11px;background:#1b2633;color:#9fb0c2}.dots .on{background:#3fa9f5;color:#fff}.dots .done{background:#1f5f3a;color:#bff0cf}' +
        '.wait{margin-top:12px;padding:9px 11px;border-radius:10px;background:#13283b;border:1px solid #23527a;font-size:13.5px}';

    function draw() {
        if (!win || win.closed) return;
        var d = win.document, s = ALL[i], last = i === ALL.length - 1, n = s[3];
        d.body.innerHTML =
            '<div class="hd"><b>HouseRunner setup</b> · ' + (n ? 'in your Sheet' : 'getting your copy') + '<span class="n">' + (n ? 'Step ' + n + ' of ' + STEPS.length : 'Before step 1') + '</span></div>' +
            '<div class="bar"><i style="width:' + Math.round((i + 1) / ALL.length * 100) + '%"></i></div>' +
            '<div class="bd"><h2><span>' + (n || '★') + '</span>' + esc(s[0]) + '</h2>' +
            (s[2] ? '<img class="pic" alt="" src="' + abs(s[2]) + '">' : '') +
            '<p>' + s[1] + '</p>' +
            (VIDEO ? '<p><a class="vl" target="_blank" rel="noopener" href="' + abs(VIDEO.src) + '#t=' + VIDEO.from[i] + '">▶ Show full video in new tab</a> <span class="mute">– starts at this step</span></p>' : '') +
            (last ? '<div class="wait">⏳ The setup page is waiting for your Sheet to say <b>Published ✅</b>. This window closes by itself when you’re back in setup – or close it now.</div>' : '') + '</div>' +
            '<div class="dots">' + ALL.map(function (x, k) { return '<button data-k="' + k + '" class="' + (k === i ? 'on' : k < i ? 'done' : '') + '" title="' + esc(x[0]) + '">' + (k < i ? '✓' : x[3] || '★') + '</button>'; }).join('') + '</div>' +
            '<div class="ft"><button class="gh" id="bk"' + (i ? '' : ' disabled') + '>← Back</button>' +
            (last ? '<button class="go" id="cl">✕ Close this step window</button>' : '<button class="go" id="nx">Done – next step →</button>') + '</div>';
        var on = function (id, f) { var b = d.getElementById(id); if (b) b.onclick = f; };
        on('bk', function () { go(i - 1); });
        on('nx', function () { go(i + 1); });
        on('cl', function () { HRFloat.close(); });
        Array.prototype.forEach.call(d.querySelectorAll('.dots button'), function (b) { b.onclick = function () { go(+b.getAttribute('data-k')); }; });
    }
    function go(k) {
        i = Math.min(ALL.length - 1, Math.max(0, k));
        try { localStorage.setItem(KEY, String(i)); } catch (e) { /* fine */ }
        draw();
    }
    function attach(w) {
        win = w;
        var d = w.document;
        d.title = 'HouseRunner – setup steps';
        var st = d.createElement('style'); st.textContent = CSS; d.head.appendChild(st);
        w.addEventListener('keydown', function (e) { if (e.key === 'ArrowRight') go(i + 1); if (e.key === 'ArrowLeft') go(i - 1); });
        w.addEventListener('pagehide', function () { if (win === w) win = null; if (HRFloat.onchange) HRFloat.onchange(); });
        draw();
        if (HRFloat.onchange) HRFloat.onchange();
    }
    function popup() {
        var wd = 400, ht = 660;
        var w = window.open('', 'hrguide', 'popup,width=' + wd + ',height=' + ht + ',left=' + Math.max(0, (screen.availWidth || 1200) - wd - 20) + ',top=60');
        if (!w) return false;
        w.document.open(); w.document.write('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head><body></body></html>'); w.document.close();
        attach(w);
        return true;
    }

    window.HRFloat = {
        floats: 'documentPictureInPicture' in window,      // stays on top of other tabs (Chrome, Edge)
        isOpen: function () { return !!(win && !win.closed); },
        /** Must be called straight from a click. fresh: start again at step 1. */
        open: function (fresh) {
            if (fresh) go(0);
            if (win && !win.closed) { try { win.focus(); } catch (e) { /* fine */ } return Promise.resolve(true); }
            if (window.documentPictureInPicture) {
                var p;
                try { p = documentPictureInPicture.requestWindow({ width: 400, height: 660 }); } catch (e) { return Promise.resolve(popup()); }
                return p.then(function (w) { attach(w); return true; }, function () { return false; });
            }
            return Promise.resolve(popup());
        },
        /** Move to a step: 'copied' = Make my copy was just clicked. */
        at: function (what) { if (what === 'copied' && i < 1) go(1); },
        close: function () { if (win && !win.closed) { try { win.close(); } catch (e) { /* fine */ } } win = null; },
        onchange: null
    };
})();
