/* HouseRunner – the one page header for the pages outside the main app (help, licence, privacy, what's new, pairing, Windows):
 * the logo on the left; ▶ Dashboard (when this browser is connected to a family) and ❓ Help on the right.
 * Use: <header class="hr-head" data-base="../" data-help="windows"></header><script src="../shared/head.js"></script> */
(function () {
    var h = document.querySelector('header.hr-head'); if (!h) return;
    var base = h.getAttribute('data-base') || './', help = h.getAttribute('data-help');
    var connected = false;
    try { connected = ['familyDashboard.cfg.v1', 'fdapp.cfg.v1', 'fdsetup.v1'].some(function (k) { var v = localStorage.getItem(k); return v && /"(url|api)"/.test(v); }); } catch (e) { /* fine */ }
    h.innerHTML = '<a class="hr-title" href="' + base + '"><img src="' + base + 'shared/brand/mark.svg" alt="" class="hr-mini"><span>House<span class="hr-acc">Runner</span></span></a>' +
        '<nav>' + (connected ? '<a class="hr-hdash" href="' + base + 'dashboard/">▶ Dashboard</a>' : '') +
        (help === 'none' ? '' : '<a class="hr-hbtn" href="' + base + 'help/' + (help ? '#' + help : '') + '">❓ Help</a>') + '</nav>';
})();
