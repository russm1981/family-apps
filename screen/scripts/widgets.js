/* Family Dashboard – widgets.
 * Every widget is a quarter of the screen wide and either full height or half height.
 * FDW.types[type](el, widget, ctx) builds one inside `el` and returns { update(data), show(), hide(), destroy() }.
 * `widget` = { id, type, size, settings } from the Google Sheet; `data` = what the Sheet fetched for it (or null).
 */
(function () {
    'use strict';

    function api() { return window.FDApi; }
    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function errBox(text) { return '<div class="err">' + esc(text) + '</div>'; }
    function loading() { return '<div class="empty">Loading\u2026</div>'; }
    var DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    var DAYNAME = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    function pad(n) { return (n < 10 ? '0' : '') + n; }
    function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
    function parseYmd(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
    function hhmm(d) { return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
    function ago(iso) {
        if (!iso) return '';
        var m = Math.round((Date.now() - Date.parse(iso)) / 60000);
        return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' hr ago' : Math.round(m / 1440) === 1 ? 'yesterday' : Math.round(m / 1440) + ' days ago';
    }
    function visible(el) { return !!(el && el.offsetParent); }
    var MAP_OPTS = { zoomControl: false, attributionControl: true, dragging: false, touchZoom: false,
        scrollWheelZoom: false, doubleClickZoom: false, boxZoom: false, keyboard: false, tap: false,
        zoomAnimation: false, fadeAnimation: false, markerZoomAnimation: false };   // no animations: nothing left running when a page is rebuilt
    /** Base map: TomTom (dark, or light with `light`) when there's a key, otherwise OpenStreetMap. (CARTO's free tiles now need a key of their own.) */
    function baseTiles(key, light) {
        return key ? L.tileLayer('https://api.tomtom.com/map/1/tile/basic/' + (light ? 'main' : 'night') + '/{z}/{x}/{y}.png?key=' + encodeURIComponent(key), { maxZoom: 18, attribution: '\u00a9 TomTom' })
            : L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '\u00a9 OpenStreetMap', className: light ? '' : 'osm-dark' });
    }

    /* --------------------------------------------------------- pop-up card */

    var popTimer = null;
    function pop(title, html, onClick) {
        var p = document.getElementById('pop');
        document.getElementById('popTitle').textContent = title;
        var body = document.getElementById('popBody');
        body.innerHTML = html;
        body.onclick = onClick || null;
        p.classList.add('on');
        clearTimeout(popTimer); popTimer = setTimeout(closePop, 90000);
    }
    function closePop() { document.getElementById('pop').classList.remove('on'); clearTimeout(popTimer); }

    var T = {};

    /* ============================================================ WEATHER */

    /** Fog: a soft cloud over three misty lines, drawn so it looks the same on every screen. */
    var FOG_SVG = '<svg class="wx-fog" viewBox="0 0 64 64" width="1em" height="1em" aria-label="Fog"><path d="M18 34a10 10 0 0 1 1.5-19.9A14 14 0 0 1 46 17a9 9 0 0 1 1 17.9z" fill="#c9d3df"/>' +
        '<g stroke="#9fb0c3" stroke-width="4.5" stroke-linecap="round" fill="none"><path d="M10 42h36"/><path d="M18 50h38"/><path d="M8 58h30"/></g></svg>';
    var WX = {
        0: ['Clear', '\u2600\uFE0F', '\uD83C\uDF19'], 1: ['Mainly clear', '\uD83C\uDF24\uFE0F', '\uD83C\uDF19'],
        2: ['Partly cloudy', '\u26C5', '\u2601\uFE0F'], 3: ['Overcast', '\u2601\uFE0F'],
        45: ['Fog', FOG_SVG], 48: ['Freezing fog', FOG_SVG],     // drawn here: Windows has no fog emoji
        51: ['Light drizzle', '\uD83C\uDF26\uFE0F'], 53: ['Drizzle', '\uD83C\uDF26\uFE0F'], 55: ['Heavy drizzle', '\uD83C\uDF27\uFE0F'],
        56: ['Freezing drizzle', '\uD83C\uDF27\uFE0F'], 57: ['Freezing drizzle', '\uD83C\uDF27\uFE0F'],
        61: ['Light rain', '\uD83C\uDF26\uFE0F'], 63: ['Rain', '\uD83C\uDF27\uFE0F'], 65: ['Heavy rain', '\uD83C\uDF27\uFE0F'],
        66: ['Freezing rain', '\uD83C\uDF27\uFE0F'], 67: ['Freezing rain', '\uD83C\uDF27\uFE0F'],
        71: ['Light snow', '\uD83C\uDF28\uFE0F'], 73: ['Snow', '\uD83C\uDF28\uFE0F'], 75: ['Heavy snow', '\u2744\uFE0F'], 77: ['Snow grains', '\uD83C\uDF28\uFE0F'],
        80: ['Showers', '\uD83C\uDF26\uFE0F'], 81: ['Showers', '\uD83C\uDF27\uFE0F'], 82: ['Heavy showers', '\uD83C\uDF27\uFE0F'],
        85: ['Snow showers', '\uD83C\uDF28\uFE0F'], 86: ['Snow showers', '\uD83C\uDF28\uFE0F'],
        95: ['Thunderstorm', '\u26C8\uFE0F'], 96: ['Thunder & hail', '\u26C8\uFE0F'], 99: ['Thunder & hail', '\u26C8\uFE0F'],
    };
    function wx(code, isDay) {
        var w = WX[code] || ['\u2013', '\u2601\uFE0F'];
        return { label: w[0], icon: isDay === false && w[2] ? w[2] : w[1] };
    }

    T.weather = function (el, w) {
        var s = w.settings;
        if (w.size === 'half') return weatherHalf(el, w);
        el.innerHTML = (s.ShowClock ? '<div class="when"><div class="clock">--:--</div><div class="date"></div></div>' : '') +
            '<div class="wx-now">' + loading() + '</div><div class="wx-hours" style="grid-template-columns:repeat(' + (s.Hours || 8) + ',minmax(0,1fr))"></div><div class="wx-days"></div>';
        var q = function (c) { return el.querySelector(c); };
        function tick() {
            if (!s.ShowClock) return;
            var now = new Date();
            q('.clock').textContent = hhmm(now);
            q('.date').textContent = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
        }
        tick(); var timer = setInterval(tick, 10000);
        return {
            update: function (d) {
                if (!d || d.error) { q('.wx-now').innerHTML = errBox(d ? d.error : 'No weather'); q('.wx-hours').innerHTML = ''; q('.wx-days').innerHTML = ''; return; }
                var n = wx(d.now.code, d.now.isDay), today = d.days[0] || {};
                q('.wx-now').innerHTML = '<span class="wx-icon">' + n.icon + '</span>' +
                    '<div><div class="wx-temp">' + d.now.temp + '\u00b0</div><div class="wx-label">' + esc(n.label) + '</div></div>' +
                    '<div class="wx-meta"><span>High ' + today.max + '\u00b0 \u00b7 Low ' + today.min + '\u00b0</span>' +
                    '<span>Feels ' + d.now.feels + '\u00b0 \u00b7 Wind ' + d.now.wind + ' mph</span>' +
                    '<span>Rain ' + (today.rain == null ? '\u2013' : today.rain + '%') + ' \u00b7 Sunset ' + esc(today.sunset || '') + '</span></div>';
                q('.wx-hours').innerHTML = d.hours.slice(0, s.Hours || 8).map(function (h) {
                    var x = wx(h.code, h.isDay);
                    return '<div class="hr"><span class="t">' + esc(h.time) + '</span><span class="i">' + x.icon + '</span><span class="v">' + h.temp + '\u00b0</span>' +
                        '<span class="r' + (h.rain >= 50 ? ' wet' : '') + '">' + (h.rain || 0) + '%</span></div>';
                }).join('');
                q('.wx-days').innerHTML = d.days.slice(1, 1 + (s.Days || 4)).map(function (x) {
                    var ic = wx(x.code, true), dt = parseYmd(x.date);
                    return '<div class="day"><span class="n">' + DOW[dt.getDay()] + '</span><span class="i">' + ic.icon + '</span>' +
                        '<span class="hl"><b>' + x.max + '\u00b0</b> ' + x.min + '\u00b0</span><span class="r' + (x.rain >= 50 ? ' wet' : '') + '">' + (x.rain || 0) + '%</span></div>';
                }).join('');
            },
            destroy: function () { clearInterval(timer); },
        };
    };

    /** Half height: now, the next few hours and the next few days, all in one compact card. */
    function weatherHalf(el, w) {
        var s = w.settings, hours = Math.min(s.Hours || 6, 6), days = Math.min(s.Days || 4, 4);
        el.innerHTML = '<div class="wx-top">' + loading() + '</div>' +
            '<div class="wx-hours" style="grid-template-columns:repeat(' + hours + ',minmax(0,1fr))"></div><div class="wx-dayrow" style="grid-template-columns:repeat(' + days + ',minmax(0,1fr))"></div>';
        var q = function (c) { return el.querySelector(c); }, last = null;
        function tick() { var c = q('.wx-top .clock'); if (c) c.textContent = hhmm(new Date()); }
        var timer = setInterval(tick, 10000);
        return {
            update: function (d) {
                last = d;
                if (!d || d.error) { q('.wx-top').innerHTML = errBox(d ? d.error : 'No weather'); q('.wx-hours').innerHTML = ''; q('.wx-dayrow').innerHTML = ''; return; }
                var n = wx(d.now.code, d.now.isDay), today = d.days[0] || {};
                q('.wx-top').innerHTML = '<span class="wx-icon">' + n.icon + '</span><div class="wx-tl"><div class="wx-temp">' + d.now.temp + '\u00b0</div>' +
                    '<div class="wx-label">' + esc(n.label) + '</div></div>' +
                    '<div class="wx-meta"><span><b>' + today.max + '\u00b0</b> / ' + today.min + '\u00b0</span><span>Rain ' + (today.rain == null ? '\u2013' : today.rain + '%') +
                    ' \u00b7 ' + d.now.wind + ' mph</span></div>' + (s.ShowClock ? '<div class="clock">' + hhmm(new Date()) + '</div>' : '');
                q('.wx-hours').innerHTML = d.hours.slice(0, hours).map(function (h) {
                    var x = wx(h.code, h.isDay);
                    return '<div class="hr"><span class="t">' + esc(h.time) + '</span><span class="i">' + x.icon + '</span><span class="v">' + h.temp + '\u00b0</span>' +
                        '<span class="r' + (h.rain >= 50 ? ' wet' : '') + '">' + (h.rain || 0) + '%</span></div>';
                }).join('');
                q('.wx-dayrow').innerHTML = d.days.slice(1, 1 + days).map(function (x) {
                    var ic = wx(x.code, true), dt = parseYmd(x.date);
                    return '<div class="dd"><span class="n">' + DOW[dt.getDay()] + '</span><span class="i">' + ic.icon + '</span>' +
                        '<span class="hl"><b>' + x.max + '\u00b0</b> ' + x.min + '\u00b0</span><span class="r' + (x.rain >= 50 ? ' wet' : '') + '">' + (x.rain || 0) + '%</span></div>';
                }).join('');
            },
            destroy: function () { clearInterval(timer); },
        };
    }

    /* ============================================================ TRAFFIC */

    var STATUS = { green: 'Normal', amber: 'A bit slower', red: 'Much slower' };
    var LINE = { green: '#4cd964', amber: '#ffb020', red: '#ff4d4d' };

    T.traffic = function (el, w, ctx) {
        // The map sits in .map-rot so it can be turned: tapping a route zooms to it and turns it to run across the box.
        el.innerHTML = '<div class="map"><div class="map-rot"></div><span class="map-credit">\u00a9 TomTom</span></div><div class="routes">' + loading() + '</div>';
        var outer = el.querySelector('.map'), mapEl = el.querySelector('.map-rot'), box = el.querySelector('.routes');
        var map = null, layers = null, flow = null, bounds = null, key = ctx.tomtomKey, sel = -1, last = null;
        function flowUrl() {
            return 'https://api.tomtom.com/traffic/map/4/tile/flow/relative0-dark/{z}/{x}/{y}.png?key=' + encodeURIComponent(key) + '&t=' + Math.floor(Date.now() / 600000);
        }
        function unturn() {
            outer.classList.remove('turned'); mapEl.style.cssText = ''; outer.style.removeProperty('--unrot');
        }
        function fit() {
            if (!map || !mapEl.isConnected) return;
            try {
                var r = last && sel >= 0 ? last.routes[sel] : null;
                if (r && r.points && r.points.length > 1) { fitRoute(r); return; }
                unturn(); map.invalidateSize();
                if (bounds && mapEl.clientWidth) map.fitBounds(bounds, { paddingTopLeft: [48, 26], paddingBottomRight: [70, 26] });   // tight, leaving room for the labels
            } catch (e) { /* page was rebuilt */ }
        }
        /** Zoom to one route and turn the map so the route runs left to right, filling the box. */
        function fitRoute(r) {
            var W = outer.clientWidth, H = outer.clientHeight; if (!W || !H) return;
            var z0 = map.getZoom(), pts = r.points.concat(last.home ? [last.home] : []).map(function (p) { return map.project(p, z0); });
            var p0 = map.project(r.points[0], z0), p1 = map.project(r.points[r.points.length - 1], z0);
            var a = Math.atan2(p1.y - p0.y, p1.x - p0.x) * 180 / Math.PI;           // start → destination
            if (a > 90) a -= 180; else if (a < -90) a += 180;                       // never upside down
            if (Math.abs(a) < 12) a = 0;                                            // nearly level already: don't bother turning
            var rad = -a * Math.PI / 180, cos = Math.cos(rad), sin = Math.sin(rad);
            var rot = pts.map(function (p) { return { x: p.x * cos - p.y * sin, y: p.x * sin + p.y * cos }; });
            var xs = rot.map(function (p) { return p.x; }), ys = rot.map(function (p) { return p.y; });
            var minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs), minY = Math.min.apply(null, ys), maxY = Math.max.apply(null, ys);
            var scale = Math.min((W - 240) / Math.max(1, maxX - minX), (H - 90) / Math.max(1, maxY - minY));   // room for the labels above the dots
            var cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;                     // centre in the turned frame → back to map pixels
            var c = L.point(cx * Math.cos(-rad) - cy * Math.sin(-rad), cx * Math.sin(-rad) + cy * Math.cos(-rad));
            var D = Math.ceil(Math.sqrt(W * W + H * H)) + 4;                        // a square big enough to cover the box when turned
            outer.classList.toggle('turned', a !== 0);
            mapEl.style.cssText = 'width:' + D + 'px;height:' + D + 'px;left:' + (W - D) / 2 + 'px;top:' + (H - D) / 2 + 'px;transform:rotate(' + (-a) + 'deg)';
            outer.style.setProperty('--unrot', a + 'deg');
            map.invalidateSize();
            map.setView(map.unproject(c, z0), Math.min(17, z0 + Math.log(scale) / Math.LN2));
        }
        /** Tap a route: zoom to it (others fade). Tap it again: back to all routes. */
        box.addEventListener('click', function (e) {
            var row = e.target.closest('.route[data-i]'); if (!row || !last) return;
            var i = +row.getAttribute('data-i');
            sel = sel === i ? -1 : i;
            draw(last, true);
        });
        function draw(t, keepView) {
            if (!window.L) { mapEl.innerHTML = errBox('Map library missing'); return; }
            if (!key) { mapEl.innerHTML = '<div class="map-msg">Add a TomTom key on the Installation tab to see the traffic map</div>'; return; }
            if (!map) {
                map = L.map(mapEl, Object.assign({}, MAP_OPTS, { zoomSnap: 0 }));   // fractional zoom so the routes fill the map
                map.attributionControl.setPrefix('');
                baseTiles(key).addTo(map);
                flow = L.tileLayer(flowUrl(), { maxZoom: 18, opacity: 0.9 }).addTo(map);
                layers = L.layerGroup().addTo(map);
                map.setView([51.6, -2.5], 11);
            } else flow.setUrl(flowUrl());
            layers.clearLayers();
            last = t;
            if (!t || !t.routes) return;
            if (sel >= t.routes.length) sel = -1;
            Array.prototype.forEach.call(box.querySelectorAll('.route[data-i]'), function (row) { row.classList.toggle('sel', +row.getAttribute('data-i') === sel); });
            outer.classList.toggle('picked', sel >= 0);
            var b = [];
            t.routes.forEach(function (r, i) {
                if (r.error || !r.points || !r.points.length) return;
                var dim = sel >= 0 && sel !== i ? 0.25 : 1;
                L.polyline(r.points, { color: '#000', weight: 9, opacity: 0.55 * dim }).addTo(layers);
                L.polyline(r.points, { color: LINE[r.status] || '#3fa9f5', weight: 5, opacity: 0.95 * dim }).addTo(layers);
                (r.jams || []).forEach(function (j) {
                    var seg = r.points.slice(j.from, j.to + 1);
                    if (seg.length > 1) L.polyline(seg, { color: '#ff2d2d', weight: 7, opacity: dim }).addTo(layers);
                });
                if (dim < 1) return;
                L.circleMarker(r.to, { radius: 7, color: '#fff', weight: 2, fillColor: LINE[r.status], fillOpacity: 1 })
                    .bindTooltip('<span class="ml-in">' + esc(r.name) + '</span>', sel >= 0 ? { permanent: true, direction: 'center', className: 'map-label' } : { permanent: true, direction: 'right', className: 'map-label', offset: [8, 0] }).addTo(layers);
                b = b.concat(r.points);
            });
            if (t.home) {
                L.circleMarker(t.home, { radius: 8, color: '#fff', weight: 2, fillColor: '#3fa9f5', fillOpacity: 1 })
                    .bindTooltip('<span class="ml-in">Home</span>', sel >= 0 ? { permanent: true, direction: 'center', className: 'map-label' } : { permanent: true, direction: 'left', className: 'map-label', offset: [-8, 0] }).addTo(layers);
                b.push(t.home);
            }
            bounds = b.length ? b : null;
            fit();
        }
        return {
            update: function (t) {
                if (!t || t.error) { box.innerHTML = errBox(t ? t.error : 'No traffic data'); draw(null); return; }
                box.innerHTML = t.routes.map(function (r, i) {
                    if (r.error) return '<div class="route"><div class="r-l"><span class="r-name">' + esc(r.name) + '</span>' + errBox(r.error) + '</div></div>';
                    var diff = r.mins - r.usualMins;
                    return '<div class="route ' + r.status + '" data-i="' + i + '"><div class="r-l"><span class="r-name">' + esc(r.name) + '</span>' +
                        '<span class="r-sub">' + (diff > 0 ? '+' + diff + ' min \u00b7 usually ' : 'Usually ') + r.usualMins + ' min \u00b7 ' + r.miles + ' mi</span></div>' +
                        '<span class="pill ' + r.status + '">' + STATUS[r.status] + '</span>' +
                        '<div class="r-time"><b>' + r.mins + '</b> min</div></div>';
                }).join('') || '<div class="empty">Add destinations in the admin app</div>';
                draw(t);
            },
            show: function () { setTimeout(fit, 60); },
            destroy: function () { if (map) { map.remove(); map = null; } },
        };
    };

    /* ============================================================= TRAINS */

    T.trains = function (el, w) {
        var rows = w.settings.Rows || 3;
        el.innerHTML = '<div class="board-head"><h3 class="tr-title">Trains</h3><span class="foot tr-upd"></span></div><div class="board">' + loading() + '</div>';
        var box = el.querySelector('.board');
        return {
            update: function (tr) {
                var title = el.querySelector('.tr-title');
                if (!tr || tr.error) { title.textContent = 'Trains'; box.innerHTML = errBox(tr ? tr.error : 'No train data'); return; }
                title.innerHTML = esc(tr.from) + ' <span class="arrow">\u2192</span> ' + esc(tr.to);
                el.querySelector('.tr-upd').textContent = hhmm(new Date());
                if (!tr.services.length) { box.innerHTML = '<div class="empty">No direct trains in the next 3 hours</div>'; return; }
                var html = tr.services.slice(0, rows).map(function (s) {
                    var exp = s.cancelled ? 'Cancelled' : s.etd;
                    var cls = s.cancelled ? 'bad' : (/on time/i.test(s.etd) ? 'good' : (/^\d\d:\d\d$/.test(s.etd) || /delayed/i.test(s.etd) ? 'warn' : ''));
                    return '<div class="dep' + (s.cancelled ? ' cancelled' : '') + '">' +
                        '<span class="d-time">' + esc(s.std) + '</span>' +
                        '<span class="d-main"><span class="d-dest">' + esc(s.destination) + '</span>' +
                        '<span class="d-sub">' + (s.mins ? s.mins + ' min \u00b7 arr ' + esc(s.arrive) + ' \u00b7 ' : '') + esc(s.operator) +
                        (s.reason ? ' \u00b7 ' + esc(s.reason) : '') + '</span></span>' +
                        '<span class="d-plat">' + (s.platform ? 'Plat <b>' + esc(s.platform) + '</b>' : '') + '</span>' +
                        '<span class="d-exp ' + cls + '">' + esc(exp) + '</span></div>';
                }).join('');
                html += (tr.messages || []).slice(0, 1).map(function (m) { return '<div class="nrcc">\u26A0 ' + esc(m) + '</div>'; }).join('');
                box.innerHTML = html;
            },
        };
    };

    /* ======================================================= TODAY & TOMORROW */

    T.agenda = function (el, w) {
        var max = w.settings.MaxPerDay || 4;
        el.innerHTML = '<div class="ag-cols"><div class="ag-col"><h3 class="ag-h1">Today</h3><div class="ag-list l1">' + loading() + '</div></div>' +
            '<div class="ag-col"><h3 class="ag-h2">Tomorrow</h3><div class="ag-list l2"></div></div></div>';
        var q = function (c) { return el.querySelector(c); };
        return {
            update: function (a) {
                if (!a || a.error) { q('.l1').innerHTML = errBox(a ? a.error : 'No calendar'); q('.l2').innerHTML = ''; return; }
                var t = parseYmd(a.today), m = parseYmd(a.tomorrow), bh = a.bankHolidays || {};
                function tags(evs, n) {
                    var b = (evs || []).filter(function (e) { return e.bar; })[0];
                    return (b ? '<em class="ag-hol" style="--hc:' + esc(b.c) + '">' + esc(b.k) + '</em>' : '') + (n ? '<em class="ag-bh">' + esc(n) + '</em>' : '');
                }
                q('.ag-h1').innerHTML = 'Today <span>' + DOW[t.getDay()] + ' ' + t.getDate() + ' ' + MON[t.getMonth()] + '</span>' + tags(a.days.today, bh.today);
                q('.ag-h2').innerHTML = 'Tomorrow <span>' + DOW[m.getDay()] + ' ' + m.getDate() + ' ' + MON[m.getMonth()] + '</span>' + tags(a.days.tomorrow, bh.tomorrow);
                function list(evs, ds) {
                    evs = (evs || []).filter(function (e) { return !e.bar; });
                    if (!evs.length) return '<div class="empty">Nothing on</div>';
                    var cut = evs.length > max ? max - 1 : evs.length;
                    var html = evs.slice(0, cut).map(function (e) {
                        return '<div class="ag-ev" style="--ec:' + esc(e.c) + '"><span class="ag-text">' + esc(e.t) + '</span>' +
                            (e.time ? '<span class="ag-time">' + esc(e.time) + '</span>' : '') + '</div>';
                    }).join('');
                    if (evs.length > cut) html += '<button class="ag-more" data-goday="' + ds + '">+' + (evs.length - cut) + ' more \u203a</button>';
                    return html;
                }
                q('.l1').innerHTML = list(a.days.today, a.today);
                q('.l2').innerHTML = list(a.days.tomorrow, a.tomorrow);
            },
        };
    };

    /* =============================================================== BINS */

    T.bins = function (el, w) {
        var half = w.size === 'half';
        el.innerHTML = '<h3>Bins</h3><div class="bins">' + loading() + '</div>';
        var box = el.querySelector('.bins'), last = null;
        function render() {
            var b = last;
            if (!b || b.error) { box.innerHTML = errBox(b ? b.error : 'No bin data'); return; }
            var now = new Date(), today = parseYmd(ymd(now));
            box.innerHTML = b.upcoming.slice(0, half ? 2 : 4).map(function (u, i) {
                var dt = parseYmd(u.date), away = Math.round((dt - today) / 86400000);
                if (away < 0) return '';
                var label = away === 0 ? 'Today' : away === 1 ? 'Tomorrow' : DAYNAME[dt.getDay()] + ' ' + dt.getDate() + ' ' + MON[dt.getMonth()];
                var alert = (away === 1 && hhmm(now) >= (b.reminderFrom || '15:00')) ? 'Put out tonight' : (away === 0 ? 'Collection today' : '');
                return '<div class="bin-day' + (i === 0 ? ' first' : '') + (alert ? ' alert' : '') + '">' +
                    '<div class="bin-when">' + label + (i === 0 && !alert && away > 1 ? '<span class="bin-in">in ' + away + ' days</span>' : '') +
                    (alert ? '<span class="bin-alert">' + alert + '</span>' : '') + '</div>' +
                    '<div class="bin-list">' + u.bins.map(function (x) { return '<span class="bin ' + esc(x.kind) + '"><i></i>' + esc(x.bin) + '</span>'; }).join('') + '</div></div>';
            }).join('') || '<div class="empty">No collections found</div>';
        }
        var timer = setInterval(function () { if (last) render(); }, 5 * 60000);   // the "put out tonight" time
        return { update: function (b) { last = b; render(); }, destroy: function () { clearInterval(timer); } };
    };

    /* ============================================================ FLIGHTS */

    var PLANE_SVG = '<svg viewBox="0 0 24 24" width="100%" height="100%"><path fill="currentColor" stroke="#000" stroke-width="0.8" stroke-linejoin="round" ' +
        'd="M12 1.5c.9 0 1.5 1 1.5 2.3v5.4l8 4.6v2.1l-8-2.4v4.9l2.3 1.8v1.7L12 21l-3.8.9v-1.7l2.3-1.8v-4.9l-8 2.4v-2.1l8-4.6V3.8c0-1.3.6-2.3 1.5-2.3z"/></svg>';
    var HELI_SVG = '<svg viewBox="0 0 24 24" width="100%" height="100%"><g fill="currentColor" stroke="#000" stroke-width="0.8"><ellipse cx="12" cy="11" rx="3.4" ry="5"/>' +
        '<rect x="11.2" y="15" width="1.6" height="7.5" rx=".8"/><rect x="1.5" y="10.2" width="21" height="1.6" rx=".8" transform="rotate(30 12 11)"/>' +
        '<rect x="1.5" y="10.2" width="21" height="1.6" rx=".8" transform="rotate(-30 12 11)"/></g></svg>';
    function altColour(ft) { return ft < 5000 ? '#ff8a3d' : ft < 15000 ? '#ffd54a' : ft < 30000 ? '#7ee081' : '#5ab4ff'; }
    function n0(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

    T.flights = function (el, w, ctx) {
        var s = w.settings, rows = s.ListRows == null ? 3 : s.ListRows;
        var MODE_KEY = 'familyDashboard.flMode.' + w.id, airlinesOnly = false, light = (s.Map || 'Light') !== 'Dark';
        try { airlinesOnly = localStorage.getItem(MODE_KEY) === 'airlines'; } catch (e) { /* ignore */ }
        if (light) el.classList.add('fl-light');
        el.innerHTML = '<div class="map fl-map"></div><div class="fl-badge"></div><button class="fl-mode" type="button"></button><div class="fl-key"><i style="--pc:#ff8a3d"></i>&lt;5k ft<i style="--pc:#ffd54a"></i>&lt;15k<i style="--pc:#7ee081"></i>&lt;30k<i style="--pc:#5ab4ff"></i>higher</div>' +
            (rows ? '<div class="fl-list">' + loading() + '</div>' : '');
        var mapEl = el.querySelector('.fl-map'), listEl = el.querySelector('.fl-list'), badge = el.querySelector('.fl-badge');
        var map = null, ring = null, rings = null, home = null, markers = {}, planes = [], all = [], at = 0, selected = null, data = null;
        var modeBtn = el.querySelector('.fl-mode');
        /** Airliners: a scheduled flight number (BAW123, EZY45AB), an airline, or a known route. */
        function isAirline(p) { return !!(p.airline || (p.from && p.to) || /^[A-Z]{3}[0-9]/.test(String(p.cs || '').trim())); }
        function filter() { planes = airlinesOnly ? all.filter(isAirline) : all.slice(); }
        function showMode() { modeBtn.innerHTML = airlinesOnly ? '<b>Airlines</b> only' : '<b>All</b> planes'; modeBtn.classList.toggle('on', airlinesOnly); }
        showMode();
        modeBtn.addEventListener('click', function () {
            airlinesOnly = !airlinesOnly;
            try { localStorage.setItem(MODE_KEY, airlinesOnly ? 'airlines' : 'all'); } catch (e) { /* ignore */ }
            showMode(); filter(); if (map) { draw(); list(); badgeText(); }
        });
        function badgeText() {
            if (!data || data.error) return;
            badge.innerHTML = '\u2708 <b>' + planes.length + '</b> ' + (airlinesOnly ? 'airliner' : 'plane') + (planes.length === 1 ? '' : 's') + ' within ' + data.radiusMiles + ' miles <span>' + hhmm(new Date()) + '</span>';
        }
        function ensureMap(d) {
            if (!window.L) { mapEl.innerHTML = errBox('Map library missing'); return false; }
            if (map) return true;
            // Fractional zoom, so the outer ring can fill the box instead of jumping to the next zoom level down.
            map = L.map(mapEl, Object.assign({}, MAP_OPTS, { zoomSnap: 0, zoomDelta: 0.25 }));
            map.attributionControl.setPrefix('');
            // OpenStreetMap: towns and roads, faded back so the planes stand out. (Needs no key.)
            L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '\u00a9 OpenStreetMap contributors',
                opacity: Math.max(0.1, Math.min(1, (Number(s.MapStrength) || 55) / 100)), className: light ? 'fl-tiles' : 'osm-dark' }).addTo(map);
            map.setView(d.centre, 9);
            return true;
        }
        function fit() {
            if (!map || !ring || !mapEl.isConnected) return;
            try { map.invalidateSize(); if (mapEl.clientWidth) map.fitBounds(ring.getBounds(), { padding: [2, 2] }); } catch (e) { /* page was rebuilt */ }
        }
        function icon(p) {
            var c = altColour(p.alt), sel = selected === p.hex;
            return L.divIcon({ className: 'pl-wrap', iconSize: [0, 0], html:
                '<div class="pl' + (sel ? ' sel' : '') + '" style="color:' + c + ';transform:translate(-50%,-50%) rotate(' + (p.track || 0) + 'deg)">' + (p.heli ? HELI_SVG : PLANE_SVG) + '</div>' +
                '<span class="pl-cs' + (sel ? ' sel' : '') + '">' + esc(p.cs || p.reg || p.type) + '</span>' });
        }
        function draw() {
            var seen = {};
            planes.forEach(function (p) {
                seen[p.hex] = 1;
                var m = markers[p.hex];
                if (!m) { m = markers[p.hex] = L.marker([p.lat, p.lon], { icon: icon(p), interactive: true, keyboard: false }).addTo(map); m.on('click', function () { select(p.hex); }); }
                else { m.setIcon(icon(p)); m.setLatLng([p.lat, p.lon]); }
            });
            Object.keys(markers).forEach(function (k) { if (!seen[k]) { map.removeLayer(markers[k]); delete markers[k]; } });
        }
        /** Between updates, move each plane along its heading at its ground speed so the map stays alive. */
        function glide() {
            if (!map || !planes.length || !visible(el)) return;
            var dt = Math.min(90, (Date.now() - at) / 1000);
            planes.forEach(function (p) {
                if (p.track == null || !p.kt) return;
                var m = p.kt * 0.514444 * dt, r = p.track * Math.PI / 180;
                p.lat = p.lat0 + m * Math.cos(r) / 111320;
                p.lon = p.lon0 + m * Math.sin(r) / (111320 * Math.cos(p.lat0 * Math.PI / 180));
                if (markers[p.hex]) markers[p.hex].setLatLng([p.lat, p.lon]);
            });
        }
        function select(hex) { selected = selected === hex ? null : hex; draw(); list(); }
        function list() {
            if (!listEl) return;
            if (!planes.length) { listEl.innerHTML = '<div class="empty">No ' + (airlinesOnly ? 'airliners' : 'planes') + ' within ' + s.RadiusMiles + ' miles right now</div>'; return; }
            var order = planes.slice();
            if (selected) order.sort(function (a, b) { return (b.hex === selected) - (a.hex === selected); });
            listEl.innerHTML = order.slice(0, rows).map(function (p) {
                var route = p.from && p.to ? esc(p.from.city) + ' \u2192 ' + esc(p.to.city) : esc(p.model || p.type || 'Aircraft');
                var sub = [p.airline, p.from && p.to ? p.model : '', p.reg].filter(Boolean).map(esc).join(' \u00b7 ');
                return '<div class="fl-row' + (p.hex === selected ? ' sel' : '') + '" data-hex="' + esc(p.hex) + '"><span class="fl-cs" style="--pc:' + altColour(p.alt) + '">' + esc(p.cs || p.reg || '\u2013') + '</span>' +
                    '<span class="fl-main"><b>' + route + '</b><small>' + sub + '</small></span>' +
                    '<span class="fl-alt">' + n0(p.alt) + ' ft' + (p.climb > 0 ? ' \u2197' : p.climb < 0 ? ' \u2198' : '') + '<small>' + (p.mph ? p.mph + ' mph \u00b7 ' : '') + p.dist + ' mi</small></span></div>';
            }).join('');
        }
        if (listEl) listEl.addEventListener('click', function (e) { var r = e.target.closest('[data-hex]'); if (r) select(r.getAttribute('data-hex')); });
        function update(d) {
            data = d;
            if (!d || d.error) { badge.innerHTML = '\u26A0 ' + esc(d ? d.error : 'No flight data'); if (listEl) listEl.innerHTML = ''; return; }
            if (!ensureMap(d)) return;
            at = Date.now();
            all = d.planes.map(function (p) { return Object.assign({}, p, { lat0: p.lat, lon0: p.lon }); });
            filter();
            if (!ring) {
                ring = L.circle(d.centre, { radius: d.radiusMiles * 1609.34, color: light ? '#1d6fb8' : '#3fa9f5', weight: 1.5, opacity: 0.7, dashArray: '6 8', fill: false, interactive: false }).addTo(map);
                drawRings(d);
                home = L.circleMarker(d.centre, { radius: 7, color: '#fff', weight: 2, fillColor: '#3fa9f5', fillOpacity: 1, interactive: false })
                    .bindTooltip('Home', { permanent: true, direction: 'bottom', className: 'map-label', offset: [0, 8] }).addTo(map);
                setTimeout(fit, 30);    // once the list below has taken its space
            } else { if (ring.getRadius() !== d.radiusMiles * 1609.34) { ring.setRadius(d.radiusMiles * 1609.34); drawRings(d); setTimeout(fit, 30); } ring.setLatLng(d.centre); home.setLatLng(d.centre); }
            if (selected && !planes.some(function (p) { return p.hex === selected; })) selected = null;
            draw(); list(); badgeText();
        }
        /** Distance rings (e.g. 5, 10, 20 miles), each labelled at the top. */
        function drawRings(d) {
            if (rings) map.removeLayer(rings);
            rings = L.layerGroup().addTo(map);
            var r = d.radiusMiles, steps = [r / 4, r / 2].map(function (x) { return x >= 10 ? Math.round(x / 5) * 5 : Math.max(1, Math.round(x)); })
                .filter(function (x, i, a) { return x < r && a.indexOf(x) === i; }).concat([r]);
            steps.forEach(function (m) {
                if (m < r) L.circle(d.centre, { radius: m * 1609.34, color: light ? '#5f7f9f' : '#3fa9f5', weight: 1, opacity: 0.45, fill: false, interactive: false }).addTo(rings);
                var top = [d.centre[0] - (m < r ? m : m * 0.93) * 1609.34 / 111320, d.centre[1]];     // labelled at the bottom (the outer one just inside the edge)
                L.marker(top, { interactive: false, keyboard: false, icon: L.divIcon({ className: 'fl-ringlab', iconSize: [0, 0], html: '<span>' + m + ' mi</span>' }) }).addTo(rings);
            });
        }
        var g = setInterval(glide, 1000);
        // Planes move fast: ask for fresh positions every 20 seconds while this page is on screen.
        var poll = setInterval(function () {
            if (!visible(el) || !api().ready()) return;
            api().get('widget', { id: w.id }).then(function (r) { update(r.data); }).catch(function () { /* keep gliding */ });
        }, 20000);
        return { update: update, show: function () { setTimeout(fit, 60); },
            destroy: function () { clearInterval(g); clearInterval(poll); if (map) { map.remove(); map = null; } } };
    };

    /* =============================================================== NEWS */

    T.news = function (el, w) {
        var s = w.settings, full = w.size === 'full', items = [], lead = 0, data = null;
        el.innerHTML = '<div class="nw-head"><h3 class="nw-title">News</h3><span class="foot nw-time"></span>' +
            '<button class="nw-arrow" data-go="-1" aria-label="Previous">\u2039</button><button class="nw-arrow" data-go="1" aria-label="Next">\u203a</button></div><div class="nw-body">' + loading() + '</div>';
        var body = el.querySelector('.nw-body'), swipe = null, swiped = false, lastMove = 0;
        /** Next / previous page of stories: swipe left or right, or tap the arrows. */
        function go(n) {
            if (items.length < 2) return;
            lead = (lead + n + items.length) % items.length; lastMove = Date.now();
            render();
            body.classList.remove('slide-l', 'slide-r'); void body.offsetWidth; body.classList.add(n > 0 ? 'slide-l' : 'slide-r');
        }
        el.querySelector('.nw-head').addEventListener('click', function (e) { var b = e.target.closest('[data-go]'); if (b) go(+b.getAttribute('data-go')); });
        body.addEventListener('pointerdown', function (e) { swipe = { x: e.clientX, y: e.clientY }; swiped = false; });
        body.addEventListener('pointermove', function (e) {
            if (!swipe) return;
            var dx = e.clientX - swipe.x;
            if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(e.clientY - swipe.y)) { swiped = true; swipe = null; go(dx < 0 ? 1 : -1); }
        });
        window.addEventListener('pointerup', function () { swipe = null; });
        body.addEventListener('click', function (e) { if (swiped) { e.stopPropagation(); e.preventDefault(); swiped = false; } }, true);
        function render() {
            if (!data || data.error) { body.innerHTML = errBox(data ? data.error : 'No news'); return; }
            el.querySelector('.nw-title').textContent = data.title || 'News';
            var it = items[lead % items.length], more = full ? 6 : 2;
            var others = [];
            for (var k = 1; k <= more && k < items.length; k++) others.push(items[(lead + k) % items.length]);
            el.querySelector('.nw-time').textContent = ago(it.at);
            body.innerHTML = '<button class="nw-lead' + (s.Pictures && it.img ? '' : ' noimg') + '" data-i="' + items.indexOf(it) + '">' +
                (s.Pictures && it.img ? '<img src="' + esc(it.img) + '" alt="" referrerpolicy="no-referrer">' : '') +
                '<span class="nw-lt"><b>' + esc(it.title) + '</b>' + (full ? '<small>' + esc(it.text) + '</small>' : '') + '</span></button>' +
                '<div class="nw-more">' + others.map(function (o) {
                    return '<button class="nw-row" data-i="' + items.indexOf(o) + '"><span>' + esc(o.title) + '</span><em>' + esc(ago(o.at)) + '</em></button>';
                }).join('') + '</div>' +
                '<div class="nw-dots">' + items.slice(0, 12).map(function (x, i) { return '<i class="' + (i === lead % items.length ? 'on' : '') + '"></i>'; }).join('') + '</div>';
        }
        body.addEventListener('click', function (e) {
            var b = e.target.closest('[data-i]'); if (!b) return;
            var it = items[+b.getAttribute('data-i')]; if (!it) return;
            pop(data.title || 'News', (it.img ? '<img class="pop-img" src="' + esc(it.img) + '" alt="" referrerpolicy="no-referrer">' : '') +
                '<h2 class="pop-h">' + esc(it.title) + '</h2><p class="pop-p">' + esc(it.text) + '</p><p class="foot">' + esc(ago(it.at)) + '</p>');
        });
        // Moves on by itself, but waits a minute after someone has swiped.
        var rot = setInterval(function () { if (items.length > 1 && visible(el) && Date.now() - lastMove > 60000) { lead = (lead + 1) % items.length; render(); } }, Math.max(5, s.Rotate || 20) * 1000);
        return {
            update: function (d) {
                var before = items.length ? items[lead % items.length].title : '';
                data = d; items = d && d.items ? d.items : [];
                lead = Math.max(0, items.map(function (x) { return x.title; }).indexOf(before));
                render();
            },
            destroy: function () { clearInterval(rot); },
        };
    };

    /* ===================================================== KITCHEN TIMER */

    var alarm = { ctx: null, loop: null, until: 0 };
    /** "Ding-ding-ding": three bell-like notes. */
    function beepOnce() {
        try {
            var a = alarm.ctx || (alarm.ctx = new (window.AudioContext || window.webkitAudioContext)());
            if (a.state === 'suspended') a.resume();
            [[0, 1568], [0.32, 1318], [0.64, 1568]].forEach(function (n) {
                var t = a.currentTime + n[0];
                [1, 2.76].forEach(function (h, k) {          // a bell: the note plus a quieter overtone
                    var o = a.createOscillator(), g = a.createGain();
                    o.type = 'sine'; o.frequency.value = n[1] * h;
                    g.gain.setValueAtTime(0.0001, t);
                    g.gain.exponentialRampToValueAtTime(k ? 0.08 : 0.35, t + 0.008);
                    g.gain.exponentialRampToValueAtTime(0.0001, t + (k ? 0.35 : 0.9));
                    o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + 1);
                });
            });
        } catch (e) { /* no sound available */ }
    }
    var SOUND_MS = 2 * 60000;      // the dings stop after 2 minutes; the screen keeps flashing until someone taps Stop
    function ring(label, sound, onStop) {
        var box = document.getElementById('alarm');
        document.getElementById('alarmText').textContent = label;
        box.classList.add('on'); box.classList.remove('quiet');
        clearInterval(alarm.loop);
        alarm.until = Date.now() + SOUND_MS;
        if (sound) {
            beepOnce();
            alarm.loop = setInterval(function () {
                if (Date.now() > alarm.until) { clearInterval(alarm.loop); alarm.loop = null; box.classList.add('quiet'); }
                else beepOnce();
            }, 2000);
        }
        alarm.onStop = onStop;
    }
    function stopRing() {
        clearInterval(alarm.loop); alarm.loop = null;
        document.getElementById('alarm').classList.remove('on');
        if (alarm.onStop) { var f = alarm.onStop; alarm.onStop = null; f(); }
    }

    T.timer = function (el, w) {
        var s = w.settings, KEY = 'familyDashboard.timer.' + w.id;
        var presets = String(s.Presets || '3,5,10,15,20,30').split(',').map(function (x) { return Number(x.trim()); }).filter(function (x) { return x > 0; }).slice(0, 6);
        // State: set = minutes chosen; end = finish time while running; left = ms left while paused.
        var st = { set: 0, end: 0, left: 0, done: false };
        try { var saved = JSON.parse(localStorage.getItem(KEY) || 'null'); if (saved) st = saved; } catch (e) { /* ignore */ }
        function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* ignore */ } }
        el.innerHTML = '<div class="tm-top"><div class="tm-face"><div class="tm-digits">0:00</div><div class="tm-sub">Pick a time</div></div>' +
            '<button class="tm-go" data-t="go">Start</button></div>' +
            '<div class="tm-presets">' + presets.map(function (m) { return '<button data-t="p" data-m="' + m + '">' + m + '<small>min</small></button>'; }).join('') + '</div>' +
            '<div class="tm-ctl"><button data-t="adj" data-m="-1">\u2212 1 min</button><button data-t="adj" data-m="1">+ 1 min</button><button data-t="adj" data-m="10s">+ 10 s</button><button data-t="reset">Reset</button></div>' +
            '<div class="tm-bar"><span></span></div>';
        var q = function (c) { return el.querySelector(c); };
        function leftMs() { return st.end ? Math.max(0, st.end - Date.now()) : st.left; }
        function fmt(ms) {
            var t = Math.ceil(ms / 1000), h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), sec = t % 60;
            return (h ? h + ':' + pad(m) : m) + ':' + pad(sec);
        }
        function paint() {
            var ms = leftMs(), running = !!st.end;
            if (running && ms <= 0 && !st.done) {
                st.done = true; st.end = 0; st.left = 0; save();
                ring('Timer finished', s.Sound, function () { st.done = false; save(); paint(); });
            }
            el.classList.toggle('running', running);
            el.classList.toggle('ringing', !!st.done);
            q('.tm-digits').textContent = st.done ? '0:00' : fmt(ms);
            q('.tm-sub').textContent = st.done ? 'Time\u2019s up!' : running ? 'Ends at ' + hhmm(new Date(st.end)) : ms ? 'Paused' : 'Pick a time';
            var go = q('.tm-go');
            go.textContent = st.done ? 'Stop' : running ? 'Pause' : ms ? 'Start' : 'Start';
            go.disabled = !st.done && !ms;
            var total = st.set * 60000 || 1;
            q('.tm-bar span').style.width = (running || ms ? Math.max(0, Math.min(100, (1 - ms / total) * 100)) : 0) + '%';
            Array.prototype.forEach.call(el.querySelectorAll('[data-t=p]'), function (b) { b.classList.toggle('on', +b.getAttribute('data-m') === st.set && (running || ms)); });
        }
        el.addEventListener('click', function (e) {
            var b = e.target.closest('[data-t]'); if (!b) return;
            var t = b.getAttribute('data-t');
            if (alarm.ctx && alarm.ctx.state === 'suspended') alarm.ctx.resume();
            if (!alarm.ctx) { try { alarm.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (er) { /* none */ } }   // unlocks sound on this tap
            if (st.done) { stopRing(); return; }
            if (t === 'p') { var m = +b.getAttribute('data-m'); st.set = m; st.left = 0; st.end = Date.now() + m * 60000; }
            else if (t === 'go') {
                if (st.end) { st.left = leftMs(); st.end = 0; }
                else if (st.left) { st.end = Date.now() + st.left; st.left = 0; }
            } else if (t === 'adj') {
                var v = b.getAttribute('data-m'), add = v === '10s' ? 10000 : +v * 60000;
                var ms = Math.max(0, leftMs() + add);
                if (!st.set || ms > st.set * 60000) st.set = Math.ceil(ms / 60000);
                if (st.end) st.end = Date.now() + ms; else st.left = ms;
                if (!ms) { st.end = 0; st.left = 0; }
            } else if (t === 'reset') { st = { set: 0, end: 0, left: 0, done: false }; }
            save(); paint();
        });
        paint();
        var tick = setInterval(paint, 250);
        // The voice assistant: "timer 10 minutes", "stop the timer".
        function onVoice(e) {
            var d = e.detail || {};
            if (d.op === 'start' && d.ms > 0) { if (st.done) stopRing(); st = { set: Math.ceil(d.ms / 60000), end: Date.now() + d.ms, left: 0, done: false }; }
            else if (d.op === 'stop') { if (st.done) stopRing(); st = { set: 0, end: 0, left: 0, done: false }; }
            else if (d.op === 'pause' && st.end) { st.left = leftMs(); st.end = 0; }
            save(); paint();
        }
        window.addEventListener('fd-timer', onVoice);
        window.FDW.hasTimer = true;
        return { update: function () {}, destroy: function () { clearInterval(tick); window.removeEventListener('fd-timer', onVoice); window.FDW.hasTimer = false; } };
    };

    /* ============================================================= PHOTOS */

    T.photos = function (el, w) {
        var s = w.settings, list = [], idx = -1, timer = null, sig = '', cover = s.Fit !== 'Show the whole photo';
        el.innerHTML = '<div class="ph-stage' + (cover ? ' cover' : ' contain') + '"><div class="ph-bg"></div><img class="ph" alt=""><img class="ph" alt=""></div>' +
            '<div class="ph-cap"></div><div class="ph-msg">' + loading() + '</div>';
        var imgs = el.querySelectorAll('img.ph'), cur = 0, bg = el.querySelector('.ph-bg'), cap = el.querySelector('.ph-cap'), msg = el.querySelector('.ph-msg');
        var secs = Math.max(5, s.Seconds || 15);
        function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
        function next(step) {
            if (!list.length) return;
            idx = (idx + (step || 1) + list.length) % list.length;
            var p = list[idx], img = new Image(), tried = false;
            img.referrerPolicy = 'no-referrer';
            img.onload = function () {
                var nxt = imgs[1 - cur];
                nxt.src = img.src;
                nxt.style.animationDuration = (secs + 2) + 's';
                nxt.classList.remove('on'); void nxt.offsetWidth; nxt.classList.add('on');
                imgs[cur].classList.remove('on');
                cur = 1 - cur;
                if (!cover) bg.style.backgroundImage = 'url("' + img.src.replace(/"/g, '%22') + '")';
                var c = s.Caption === 'File name' ? p.name : s.Caption === 'Date added' ? p.added : '';
                cap.textContent = c || ''; cap.style.display = c ? '' : 'none';
            };
            img.onerror = function () { if (!tried && p.alt) { tried = true; img.src = p.alt; } else if (list.length > 1) setTimeout(function () { next(1); }, 500); };
            img.src = p.src;
        }
        function restart() { clearInterval(timer); timer = setInterval(function () { if (visible(el)) next(1); }, secs * 1000); }
        // Swipe left for the next photo, right for the one before; a tap also moves on.
        var sw = null, swiped = false;
        el.addEventListener('pointerdown', function (e) { sw = { x: e.clientX, y: e.clientY }; swiped = false; });
        el.addEventListener('pointermove', function (e) {
            if (!sw) return;
            var dx = e.clientX - sw.x;
            if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(e.clientY - sw.y)) { swiped = true; sw = null; next(dx < 0 ? 1 : -1); restart(); }
        });
        window.addEventListener('pointerup', function () { sw = null; });
        el.addEventListener('click', function () { if (swiped) { swiped = false; return; } next(1); restart(); });
        return {
            update: function (d) {
                if (!d || d.error) { msg.innerHTML = errBox(d ? d.error : 'No photos'); msg.style.display = ''; return; }
                msg.innerHTML = d.warning ? '<div class="err">' + esc(d.warning) + '</div>' : '';
                msg.style.display = d.warning ? '' : 'none';
                var newSig = d.photos.map(function (p) { return p.src; }).join('|');
                if (newSig === sig) return;
                sig = newSig;
                list = d.photos.slice();
                if (s.Order === 'Shuffle') shuffle(list);
                else if (s.Order === 'In order') list.sort(function (a, b) { return a.name < b.name ? -1 : 1; });
                if (!list.length) { msg.innerHTML = '<div class="empty">No photos in "' + esc(d.title) + '" yet</div>'; msg.style.display = ''; return; }
                idx = -1; next(1); restart();
            },
            show: function () { if (list.length && idx < 0) next(1); },
            destroy: function () { clearInterval(timer); },
        };
    };

    /* ============================================================== CLOCK */

    T.clock = function (el, w) {
        var s = w.settings;
        var zones = String(s.Zones || '').split('\n').map(function (l) { var p = l.split('|'); return p.length > 1 ? { name: p[0].trim(), tz: p[1].trim() } : null; }).filter(Boolean).slice(0, 3);
        el.innerHTML = '<div class="ck-main"><div class="ck-time"></div>' + (s.ShowDate ? '<div class="ck-date"></div>' : '') + '</div>' +
            (zones.length ? '<div class="ck-zones">' + zones.map(function (z, i) { return '<div class="ck-z"><span class="ck-zn">' + esc(z.name) + '</span><b class="z' + i + '"></b><em class="d' + i + '"></em></div>'; }).join('') + '</div>' : '');
        var q = function (c) { return el.querySelector(c); };
        function parts(d, tz) {
            var o = {};
            try {
                new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit' })
                    .formatToParts(d).forEach(function (x) { o[x.type] = x.value; });
            } catch (e) { return null; }
            return o;
        }
        function show(h, m, sec) {
            var hh = +h % 24, ap = '';
            if (!s.Hour24) { ap = hh < 12 ? 'am' : 'pm'; hh = hh % 12 || 12; }
            return (s.Hour24 ? pad(hh) : hh) + ':' + m + (sec != null ? '<i>:' + sec + '</i>' : '') + (ap ? '<small>' + ap + '</small>' : '');
        }
        function tick() {
            var now = new Date();
            q('.ck-time').innerHTML = show(now.getHours(), pad(now.getMinutes()), s.Seconds ? pad(now.getSeconds()) : null);
            if (s.ShowDate) q('.ck-date').textContent = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
            var here = ymd(now);
            zones.forEach(function (z, i) {
                var p = parts(now, z.tz);
                if (!p) { q('.z' + i).textContent = '?'; q('.d' + i).textContent = 'unknown zone'; return; }
                q('.z' + i).innerHTML = show(p.hour, p.minute, null);
                var there = p.year + '-' + p.month + '-' + p.day;
                var diffMin = Math.round(((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute) - Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes())) / 60000) / 15) * 15;
                var hrs = diffMin / 60;
                q('.d' + i).textContent = (there > here ? 'Tomorrow, ' : there < here ? 'Yesterday, ' : '') + (hrs === 0 ? 'same time' : (hrs > 0 ? '+' : '\u2212') + Math.abs(hrs) + 'h');
            });
        }
        tick();
        var timer = setInterval(tick, s.Seconds ? 1000 : 5000);
        return { update: function () {}, destroy: function () { clearInterval(timer); } };
    };

    /* =============================================================== LIST */

    T.list = function (el, w) {
        var s = w.settings, full = w.size === 'full', data = null, busy = false;
        el.innerHTML = '<div class="ls-head"><h3 class="ls-title">' + esc(s.ListName) + '</h3><span class="ls-count"></span>' +
            (s.AddOnScreen ? '<button class="ls-btn" data-l="add">+ Add</button>' : '') + '</div><div class="ls-items">' + loading() + '</div>';
        var box = el.querySelector('.ls-items');
        function items() { return (data && data.items || []).filter(function (i) { return s.ShowTicked || !i.done; }); }
        function row(i) {
            return '<button class="ls-it' + (i.done ? ' done' : '') + '" data-l="toggle" data-id="' + esc(i.id) + '"><span class="box"></span><span class="ls-tx">' + esc(i.text) + '</span></button>';
        }
        function render() {
            if (!data || data.error) { box.innerHTML = errBox(data ? data.error : 'No list'); return; }
            var all = items(), left = data.items.filter(function (i) { return !i.done; }).length, ticked = data.items.length - left;
            el.querySelector('.ls-count').textContent = left ? left + ' to get' : 'All done';
            var fit = full ? 20 : 8;      // two columns
            var cut = all.length > fit ? fit - 1 : all.length;
            box.innerHTML = all.length ? all.slice(0, cut).map(row).join('') +
                (all.length > cut ? '<button class="ls-more" data-l="all">+' + (all.length - cut) + ' more \u203a\u203a\u203a</button>' : '') +
                (ticked && s.ShowTicked && all.length <= cut ? '<button class="ls-clear" data-l="clear">Clear ticked (' + ticked + ')</button>' : '')
                : '<div class="empty">Nothing on the list</div>';
        }
        function send(body) {
            if (busy) return;
            busy = true;
            body.action = 'listItem'; body.widget = w.id;
            api().post(body).then(function (r) { data = r.data; render(); if (document.getElementById('pop').classList.contains('on') && popList) openAll(); })
                .catch(function (e) { api().toast('Didn\u2019t save: ' + e.message, true); })
                .finally(function () { busy = false; });
        }
        var popList = false;
        function openAll() {
            popList = true;
            var ticked = data.items.filter(function (i) { return i.done; }).length;
            pop(s.ListName + ' (' + data.items.filter(function (i) { return !i.done; }).length + ' to get)',
                '<div class="ls-all">' + items().map(row).join('') + '</div>' +
                (ticked ? '<button class="ls-clear" data-l="clear">Clear ticked (' + ticked + ')</button>' : ''), onClick);
        }
        function openAdd() {
            popList = false;
            pop('Add to ' + s.ListName, '<div class="ls-add"><input class="ls-in" maxlength="30" placeholder="e.g. Milk" autocomplete="off"><button class="ls-btn big" data-l="save">Add</button></div>' +
                '<p class="foot">You can also add things from the Family Admin app on your phone.</p>', onClick);
            var inp = document.querySelector('#popBody .ls-in');
            inp.focus();
            inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') save(); });
        }
        function save() {
            var inp = document.querySelector('#popBody .ls-in'); if (!inp) return;
            var t = inp.value.trim(); if (!t) return;
            inp.value = ''; inp.focus();
            api().toast('Added \u201c' + t + '\u201d');
            send({ op: 'add', text: t });
        }
        function onClick(e) {
            var b = e.target.closest('[data-l]'); if (!b || !data) return;
            var a = b.getAttribute('data-l');
            if (a === 'toggle') {
                var it = data.items.filter(function (i) { return i.id === b.getAttribute('data-id'); })[0];
                if (it) { it.done = !it.done; b.classList.toggle('done', it.done); setTimeout(render, 0); }
                send({ op: 'toggle', id: b.getAttribute('data-id') });
            } else if (a === 'all') openAll();
            else if (a === 'add') openAdd();
            else if (a === 'save') save();
            else if (a === 'clear') { data.items = data.items.filter(function (i) { return !i.done; }); render(); send({ op: 'clearDone' }); if (popList) closePop(); }
        }
        el.addEventListener('click', onClick);
        return { update: function (d) { if (!busy) { data = d; render(); } } };
    };

    /* ===================================================================== */

    /** Arrange widgets into quarter-width columns: a full-height widget fills a column, two half-height widgets share one. */
    function pack(widgets) {
        var cols = [];
        widgets.forEach(function (w) {
            var last = cols[cols.length - 1];
            if (w.size === 'half' && last && last.length === 1 && last[0].size === 'half') last.push(w);
            else cols.push([w]);
        });
        return cols;
    }

    // Buttons on the shared pop-up and alarm (no inline handlers: the page's security policy blocks them).
    document.addEventListener('click', function (e) {
        if (e.target.closest('#popClose') || e.target.id === 'pop') closePop();
        if (e.target.closest('.alarm-stop') || e.target.id === 'alarm') stopRing();
    });

    window.FDW = { types: T, pack: pack, pop: pop, closePop: closePop, stopAlarm: stopRing,
        util: { esc: esc, errBox: errBox, loading: loading, pad: pad, ymd: ymd, parseYmd: parseYmd, hhmm: hhmm, ago: ago, visible: visible,
            baseTiles: baseTiles, DOW: DOW, DAYNAME: DAYNAME, MON: MON } };
})();
