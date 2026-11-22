/* HouseRunner – "working…" feedback, the same on every page.
 * When something you clicked (or pressed Enter/Space on) talks to the Google Sheet, the button you clicked is greyed out
 * and the mouse pointer shows it's working, until the reply comes back. Requests nobody clicked for (background
 * refreshes) change nothing. Requests that follow straight on from each other (a save done in parts) count as one. */
(function () {
    if (window.HRBUSY || !window.fetch) return;
    var n = 0, last = 0, btn = null, root = document.documentElement;
    var mark = function (e) {
        last = Date.now();
        var b = e.target && e.target.closest && e.target.closest('button, .btn, [role=button]');
        btn = b && !b.disabled ? b : null;
    };
    document.addEventListener('pointerdown', mark, true);
    document.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') mark(e); }, true);
    function start() {
        if (Date.now() - last > 1500) return function () {};      // not from a click just now: a background request
        var b = n === 0 ? btn : null;
        n++; root.classList.add('hr-busy');
        if (b && b.isConnected && !b.disabled && b.tagName === 'BUTTON') { b.disabled = true; b.setAttribute('data-hrbusy', ''); } else b = null;
        var done = false;
        return function () {
            if (done) return; done = true;
            last = Date.now();       // a next part sent straight after still counts as part of this
            setTimeout(function () {
                if (--n > 0) return;
                n = 0; root.classList.remove('hr-busy');
                Array.prototype.forEach.call(document.querySelectorAll('[data-hrbusy]'), function (x) { x.removeAttribute('data-hrbusy'); x.disabled = false; });
            }, 120);
        };
    }
    var real = window.fetch;
    window.fetch = function () {
        var end = start();
        try { var p = real.apply(this, arguments); } catch (e) { end(); throw e; }
        p.then(end, end);
        return p;
    };
    window.HRBUSY = { start: start };
})();
