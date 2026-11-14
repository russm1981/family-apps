/* Countries for the setup: [code, name, currency symbol, usual time zone]. The UK first; "Other" at the end. */
window.FD_COUNTRIES = [
    ['GB', 'United Kingdom', '£', 'Europe/London'],
    ['IE', 'Ireland', '€', 'Europe/Dublin'], ['US', 'United States', '$', 'America/New_York'], ['CA', 'Canada', '$', 'America/Toronto'],
    ['AU', 'Australia', '$', 'Australia/Sydney'], ['NZ', 'New Zealand', '$', 'Pacific/Auckland'], ['ZA', 'South Africa', 'R', 'Africa/Johannesburg'],
    ['AT', 'Austria', '€', 'Europe/Vienna'], ['BE', 'Belgium', '€', 'Europe/Brussels'], ['BR', 'Brazil', 'R$', 'America/Sao_Paulo'],
    ['CH', 'Switzerland', 'CHF ', 'Europe/Zurich'], ['CY', 'Cyprus', '€', 'Asia/Nicosia'], ['CZ', 'Czechia', 'Kč ', 'Europe/Prague'],
    ['DE', 'Germany', '€', 'Europe/Berlin'], ['DK', 'Denmark', 'kr ', 'Europe/Copenhagen'], ['ES', 'Spain', '€', 'Europe/Madrid'],
    ['FI', 'Finland', '€', 'Europe/Helsinki'], ['FR', 'France', '€', 'Europe/Paris'], ['GR', 'Greece', '€', 'Europe/Athens'],
    ['HK', 'Hong Kong', '$', 'Asia/Hong_Kong'], ['HU', 'Hungary', 'Ft ', 'Europe/Budapest'], ['IN', 'India', '₹', 'Asia/Kolkata'],
    ['IT', 'Italy', '€', 'Europe/Rome'], ['JP', 'Japan', '¥', 'Asia/Tokyo'], ['LU', 'Luxembourg', '€', 'Europe/Luxembourg'],
    ['MT', 'Malta', '€', 'Europe/Malta'], ['MX', 'Mexico', '$', 'America/Mexico_City'], ['NL', 'Netherlands', '€', 'Europe/Amsterdam'],
    ['NO', 'Norway', 'kr ', 'Europe/Oslo'], ['PL', 'Poland', 'zł ', 'Europe/Warsaw'], ['PT', 'Portugal', '€', 'Europe/Lisbon'],
    ['SE', 'Sweden', 'kr ', 'Europe/Stockholm'], ['SG', 'Singapore', '$', 'Asia/Singapore'], ['AE', 'United Arab Emirates', 'AED ', 'Asia/Dubai']
];
/** A <select> of countries, and of time zones (every one the browser knows; the computer's own is suggested). */
window.FD_countrySelect = function (id, cur) {
    return '<select id="' + id + '">' + FD_COUNTRIES.map(function (c) { return '<option value="' + c[0] + '"' + (c[0] === cur ? ' selected' : '') + '>' + c[1] + '</option>'; }).join('') + '</select>';
};
window.FD_tzSelect = function (id, cur) {
    var all = []; try { all = Intl.supportedValuesOf('timeZone'); } catch (e) { all = ['Europe/London']; }
    if (cur && all.indexOf(cur) < 0) all.unshift(cur);
    return '<select id="' + id + '">' + all.map(function (z) { return '<option' + (z === cur ? ' selected' : '') + '>' + z + '</option>'; }).join('') + '</select>';
};
/** The usual country for this browser (from its language, e.g. en-GB → GB), else the UK. */
window.FD_guessCountry = function () {
    var m = /-([A-Z]{2})$/.exec(navigator.language || ''); var c = m && m[1];
    return c && FD_COUNTRIES.some(function (x) { return x[0] === c; }) ? c : 'GB';
};
/** How a country usually writes dates: the day weeks start on and the date order (the setup fills these in from the country; you can change them). */
window.FD_SUNDAY = ['US', 'CA', 'MX', 'BR', 'JP', 'HK', 'IN', 'ZA'];
window.FD_localeFor = function (code) {
    return { WeekStart: FD_SUNDAY.indexOf(code) >= 0 ? 'Sunday' : 'Monday', DateOrder: code === 'US' ? 'Month first' : 'Day first' };
};
window.FD_pick = function (id, opts, cur, attr) {
    return '<select id="' + id + '"' + (attr || '') + '>' + opts.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === cur ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>';
};
window.FD_weekSelect = function (id, cur, attr) { return FD_pick(id, [['Monday', 'Monday'], ['Sunday', 'Sunday']], cur || 'Monday', attr); };
window.FD_orderSelect = function (id, cur, attr) { return FD_pick(id, [['Day first', 'Day first – 14 Nov'], ['Month first', 'Month first – Nov 14']], cur || 'Day first', attr); };
