/* HouseRunner – a few menu icons drawn here (rather than emoji), so they're in colour on every computer and phone. */
window.FD_ICONS = {
    screens: '<svg class="mi" viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="3.5" width="20" height="13.5" rx="2" fill="#cfd6e0"/><rect x="3.6" y="5.1" width="16.8" height="10.3" rx="1" fill="#1b2230"/>' +
        '<rect x="5" y="6.5" width="6" height="7.5" rx=".8" fill="#3fa9f5"/><rect x="12.3" y="6.5" width="6.7" height="3.4" rx=".8" fill="#f5a623"/><rect x="12.3" y="10.6" width="6.7" height="3.4" rx=".8" fill="#4cd964"/>' +
        '<path d="M9.5 17h5l.8 2.6H8.7z" fill="#9aa4b2"/><rect x="7" y="19.4" width="10" height="1.6" rx=".8" fill="#cfd6e0"/></svg>',
    lists: '<svg class="mi" viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="2.5" width="14" height="19" rx="2" fill="#f4f6f9"/><rect x="3.5" y="2.5" width="14" height="4" rx="2" fill="#fbbf24"/><rect x="3.5" y="4.5" width="14" height="2" fill="#fbbf24"/>' +
        '<rect x="6" y="9" width="9" height="1.6" rx=".8" fill="#8a93a3"/><rect x="6" y="12.4" width="9" height="1.6" rx=".8" fill="#8a93a3"/><rect x="6" y="15.8" width="6" height="1.6" rx=".8" fill="#8a93a3"/>' +
        '<path d="M14.2 19.6l1-3.4 6-6.2 2.4 2.4-6 6.2z" fill="#f59e0b"/><path d="M14.2 19.6l1-3.4 2.4 2.4z" fill="#fde68a"/></svg>',
    reminders: '<svg class="mi" viewBox="0 0 24 24" aria-hidden="true"><circle cx="4.5" cy="6" r="2" fill="#e8ecf2"/><rect x="8.5" y="4.8" width="13" height="2.6" rx="1.3" fill="#3fa9f5"/>' +
        '<circle cx="4.5" cy="12" r="2" fill="#e8ecf2"/><rect x="8.5" y="10.8" width="13" height="2.6" rx="1.3" fill="#f5a623"/>' +
        '<circle cx="4.5" cy="18" r="2" fill="#e8ecf2"/><rect x="8.5" y="16.8" width="13" height="2.6" rx="1.3" fill="#4cd964"/></svg>',
    other: '<svg class="mi" viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="2.5" width="8.5" height="8.5" rx="2.2" fill="#3fa9f5"/><rect x="13" y="2.5" width="8.5" height="8.5" rx="4.25" fill="#f5a623"/>' +
        '<rect x="2.5" y="13" width="8.5" height="8.5" rx="2.2" fill="#a855f7"/><path d="M17.25 13.5v7.5M13.5 17.25h7.5" stroke="#4cd964" stroke-width="2.8" stroke-linecap="round"/></svg>'
};

/* The two kinds of list widget: a plain tick for a list you make yourself, and a tick with Google's "G" for Google Tasks. */
window.FD_ICONS.w_list = '<svg class="mi" viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="2.5" width="19" height="19" rx="4.5" fill="#22c55e"/><path d="M7 12.4l3.3 3.3L17.2 8.6" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
window.FD_ICONS.w_todo = '<svg class="mi" viewBox="0 0 24 24" aria-hidden="true"><rect x="1.5" y="1.5" width="17" height="17" rx="4" fill="#3b82f6"/><path d="M5.3 10.2l2.9 2.9 6-6.2" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<circle cx="17.6" cy="17.6" r="6" fill="#fff"/><path d="M21.1 15.4a4 4 0 1 0 .45 3.1" fill="none" stroke="#ea4335" stroke-width="1.9"/><path d="M14.1 15.6a4 4 0 0 0 0 4" fill="none" stroke="#fbbc05" stroke-width="1.9"/>' +
    '<path d="M14.3 20.1a4 4 0 0 0 6.9-.4" fill="none" stroke="#34a853" stroke-width="1.9"/><path d="M17.7 17.6h3.9a4 4 0 0 1-.4 2.1" fill="none" stroke="#4285f4" stroke-width="1.9"/></svg>';
/** A widget kind's icon: the drawn one if there is one, otherwise its emoji. */
window.FDIco = function (T) {
    var svg = T && window.FD_ICONS['w_' + T.type]; if (svg) return svg;
    var d = document.createElement('i'); d.textContent = (T && T.icon) || ''; return d.innerHTML;
};
