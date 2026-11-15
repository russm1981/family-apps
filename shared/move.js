/* HouseRunner – moving from the old GitHub address to houserunner.app.
 * A browser keeps saved details separately for each web address, so a screen, phone or computer that still opens
 * russm1981.github.io/family-apps/… carries its connection across in the new address (#api=…&code=…), once,
 * then always opens houserunner.app. Nothing happens until houserunner.app is up. */
(function () {
    if (!/^russm1981\.github\.io$/i.test(location.hostname)) return;
    var NEW = 'https://houserunner.app', path = location.pathname.replace(/^\/family-apps/i, '') || '/';
    function saved(k) { try { var c = JSON.parse(localStorage.getItem(k) || 'null'); return c && c.url && c.code ? c : null; } catch (e) { return null; } }
    var screen = /^\/(screen|dashboard)\//.test(path);
    var c = screen ? (saved('familyDashboard.cfg.v1') || saved('fdapp.cfg.v1')) : (saved('fdapp.cfg.v1') || saved('familyDashboard.cfg.v1'));
    var hash = location.hash;
    if (c && !/[#&]api=/.test(hash)) hash = '#api=' + encodeURIComponent(c.url) + '&code=' + encodeURIComponent(c.code);
    fetch(NEW + '/version.json?t=' + Date.now(), { cache: 'no-store' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (v) { if (v && v.app) location.replace(NEW + path + location.search + hash); })
        .catch(function () { /* not up yet – stay here */ });
})();
