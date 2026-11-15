/* What this device is – for the diagnostics reports (the screen, the Configurator and the phone apps).
 * FDPlatform() → a promise of { device, os, browser, screen, … } in plain words. Chrome and Edge say exactly which
 * version of Windows/Android and which phone model; Safari and Firefox only say what's in the browser's user agent. */
(function () {
    'use strict';
    function fromUA(ua) {
        var os = 'Unknown', m;
        if ((m = /Windows NT ([\d.]+)/.exec(ua))) os = 'Windows ' + ({ '10.0': '10 or 11', '6.3': '8.1', '6.2': '8', '6.1': '7' }[m[1]] || m[1]);
        else if ((m = /(iPhone|iPad|iPod).*? OS ([\d_]+)/.exec(ua))) os = 'iOS ' + m[2].replace(/_/g, '.');
        else if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) os = 'iPadOS (reports as Mac)';
        else if ((m = /Mac OS X ([\d_.]+)/.exec(ua))) os = 'macOS ' + m[1].replace(/_/g, '.');
        else if ((m = /Android ([\d.]+)/.exec(ua))) os = 'Android ' + m[1];
        else if (/CrOS/.test(ua)) os = 'ChromeOS';
        else if (/Linux/.test(ua)) os = /armv|aarch64/.test(ua) ? 'Linux (ARM – e.g. Raspberry Pi)' : 'Linux';
        var br = 'Unknown';
        if ((m = /Edg\/([\d.]+)/.exec(ua))) br = 'Edge ' + m[1];
        else if ((m = /OPR\/([\d.]+)/.exec(ua))) br = 'Opera ' + m[1];
        else if ((m = /SamsungBrowser\/([\d.]+)/.exec(ua))) br = 'Samsung Internet ' + m[1];
        else if ((m = /CriOS\/([\d.]+)/.exec(ua))) br = 'Chrome (iOS) ' + m[1];
        else if ((m = /FxiOS\/([\d.]+)/.exec(ua))) br = 'Firefox (iOS) ' + m[1];
        else if ((m = /Firefox\/([\d.]+)/.exec(ua))) br = 'Firefox ' + m[1];
        else if ((m = /Chrome\/([\d.]+)/.exec(ua))) br = 'Chrome ' + m[1];
        else if ((m = /Version\/([\d.]+).*Safari/.exec(ua))) br = 'Safari ' + m[1];
        if (/iCUE|Corsair/i.test(ua)) br += ' (iCUE)';
        var touch = navigator.maxTouchPoints > 0, small = Math.min(screen.width, screen.height) < 600;
        var device = /iPad/.test(ua) || (/Macintosh/.test(ua) && touch) ? 'Tablet (iPad)' : /iPhone|iPod/.test(ua) ? 'Phone (iPhone)'
            : /Android/.test(ua) ? (/Mobile/.test(ua) || small ? 'Phone (Android)' : 'Tablet (Android)') : touch ? 'Computer with a touch screen' : 'Computer';
        return { device: device, os: os, browser: br };
    }
    window.FDPlatform = function () {
        var ua = navigator.userAgent, base = fromUA(ua);
        var out = {
            device: base.device, os: base.os, browser: base.browser,
            screen: screen.width + '×' + screen.height + ' at ' + (window.devicePixelRatio || 1) + '× pixels',
            window: innerWidth + '×' + innerHeight + (matchMedia && matchMedia('(orientation: portrait)').matches ? ' (portrait)' : ' (landscape)'),
            touch: navigator.maxTouchPoints > 0 ? 'yes (' + navigator.maxTouchPoints + ' points)' : 'no',
            installedApp: !!((window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone),
            language: navigator.language || '', timeZone: (function () { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { return ''; } })(),
            cpuCores: navigator.hardwareConcurrency || '', memoryGB: navigator.deviceMemory || '',
            connection: navigator.connection ? (navigator.connection.effectiveType || '') + (navigator.connection.downlink ? ', ~' + navigator.connection.downlink + ' Mb/s' : '') : '',
            online: navigator.onLine, cookies: navigator.cookieEnabled, userAgent: ua
        };
        var uad = navigator.userAgentData;
        if (!uad || !uad.getHighEntropyValues) return Promise.resolve(out);
        return uad.getHighEntropyValues(['platform', 'platformVersion', 'model', 'architecture', 'bitness', 'fullVersionList']).then(function (h) {
            if (h.platform === 'Windows' && h.platformVersion) out.os = 'Windows ' + (parseInt(h.platformVersion, 10) >= 13 ? '11' : '10') + ' (' + h.platformVersion + ')';
            else if (h.platform === 'Android' && h.platformVersion) out.os = 'Android ' + h.platformVersion;
            else if (h.platform === 'macOS' && h.platformVersion) out.os = 'macOS ' + h.platformVersion;
            else if (h.platform) out.os = h.platform + (h.platformVersion ? ' ' + h.platformVersion : '');
            if (h.model) out.device += ' – ' + h.model;
            if (h.architecture) out.processor = h.architecture + (h.bitness ? ' ' + h.bitness + '-bit' : '');
            var b = (h.fullVersionList || []).filter(function (x) { return !/Not.?A.?Brand|Chromium/i.test(x.brand); })[0];
            if (b) out.browser = b.brand.replace('Google ', '').replace('Microsoft ', '') + ' ' + b.version + (/iCUE|Corsair/i.test(ua) ? ' (iCUE)' : '');
            return out;
        }, function () { return out; });
    };
    /** The same, as lines for a page: [label, value]. */
    window.FDPlatformRows = function (p) {
        return [['Device', p.device], ['Operating system', p.os], ['Browser', p.browser], ['Screen', p.screen], ['Window', p.window], ['Touch', p.touch],
            ['Installed as an app', p.installedApp ? 'yes' : 'no'], ['Processor', p.processor || (p.cpuCores ? p.cpuCores + ' cores' : '')], ['Memory', p.memoryGB ? 'about ' + p.memoryGB + ' GB' : ''],
            ['Connection', p.online ? (p.connection || 'online') : 'offline'], ['Language · time zone', p.language + ' · ' + p.timeZone]].filter(function (r) { return r[1]; });
    };
})();
