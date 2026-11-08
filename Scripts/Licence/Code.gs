/**
 * Family Dashboard – licence server.
 *
 * Lives in the seller's own Google account, in a Sheet of its own ("Family Dashboard Licences").
 * The Sheet is the register: one row per licence key.
 *
 *   Licences  Key | Status | Name | Email | Order | Source | Issued | Emailed | Activated | Install | Last check | Version | Checks | Notes
 *   Activity  When | Key | Event | Install | Detail
 *
 * Status:  Issued  = made, not used yet
 *          Active  = in use on one dashboard (Install = that dashboard's random installation number)
 *          Revoked = switched off (refund, abuse…). The dashboard locks at its next daily check.
 *
 * Each family's Google script calls this web app once a day:  { action: 'check', key, install, version }.
 * A key works on one dashboard at a time. To move it (new Sheet, new Google account) use Release in the admin portal.
 *
 * The admin portal is this web app's own page. It needs the admin password (shown once by setup, and from the
 * menu), or being signed in as the owner when opened from the Sheet's menu.
 */

const LS_VERSION = '2026.11.3';
// Where new versions of this licence server are published (version.json "licenceServer", files in Scripts/Licence/).
const APPS_BASE = 'https://russm1981.github.io/family-apps/';
const TABS = { lic: 'Licences', log: 'Activity' };
const COLS = ['Key', 'Status', 'Name', 'Email', 'Order', 'Source', 'Issued', 'Emailed', 'Activated', 'Install', 'Last check', 'Version', 'Checks', 'Notes'];
const LOGCOLS = ['When', 'Key', 'Event', 'Install', 'Detail'];
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';     // no 0/O, 1/I – easy to read out and type
const DEFAULTS = {
  sellerName: 'Family Dashboard',
  subject: 'Your Family Dashboard licence key',
  body: 'Hello {name},\n\nThank you for buying Family Dashboard.\n\nYour licence key is:\n\n    {key}\n\n' +
    'To set up your dashboard, open {setup} on a computer and follow the steps. You will be asked for this key.\n\n' +
    'Keep this email: you need the key again if you ever set the dashboard up from scratch.\n\nBest wishes,\n{seller}',
  setupLink: 'https://russm1981.github.io/family-apps/',
};

/* ================================================================ menu & setup */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('🔑 Licences')
    .addItem('Open the licence admin portal', 'menuPortal')
    .addItem('Show the web addresses', 'menuAddresses')
    .addItem('Make a new admin password', 'menuPassword')
    .addSeparator()
    .addItem('Update the licence server now', 'menuUpdate')
    .addItem('Set up / repair the tabs', 'setup')
    .addToUi();
}

/** Make the tabs; the first time, also an admin password and a key for the owner. */
function setup() {
  const ss = SpreadsheetApp.getActive();
  [[TABS.lic, COLS], [TABS.log, LOGCOLS]].forEach(([name, cols]) => {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold').setBackground('#1f2937').setFontColor('#ffffff');
    sh.setFrozenRows(1);
    sh.getRange('A:A').setNumberFormat('@').setFontFamily('Roboto Mono');
  });
  const lic = ss.getSheetByName(TABS.lic);
  lic.setColumnWidth(1, 250);
  const blank = ss.getSheetByName('Sheet1');
  if (blank && blank.getLastRow() === 0 && ss.getSheets().length > 2) ss.deleteSheet(blank);
  const P = PropertiesService.getScriptProperties();
  let msg = 'The Licences and Activity tabs are ready.';
  if (!P.getProperty('adminHash')) {
    const pw = newPassword_();
    msg += '\n\nYOUR ADMIN PASSWORD (write it down – it is only shown now; you can make a new one from the menu):\n\n' + pw;
  }
  if (lic.getLastRow() < 2) {
    const k = issue_({ name: 'Owner', source: 'Made by setup', notes: 'For your own dashboard' })[0];
    msg += '\n\nA first key has been made for your own dashboard:\n\n' + k;
  }
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'updateTick').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('updateTick').timeBased().everyHours(1).create();
  msg += '\n\nAutomatic updates: on (checks every hour).';
  msg += '\n\nNext (first time only): Deploy > New deployment > Web app, Execute as: Me, Who has access: Anyone. Then 🔑 Licences > Show the web addresses.';
  try { SpreadsheetApp.getUi().alert('Licence server', msg, SpreadsheetApp.getUi().ButtonSet.OK); } catch (e) { console.log(msg); }
}

function menuPortal() {
  const t = HtmlService.createTemplateFromFile('Admin');
  t.inSheet = true;
  SpreadsheetApp.getUi().showModalDialog(t.evaluate().setWidth(1200).setHeight(780), 'Family Dashboard licences');
}
function menuAddresses() {
  const u = ScriptApp.getService().getUrl() || '';
  const ui = SpreadsheetApp.getUi();
  if (!/\/exec$/.test(u)) { ui.alert('Not deployed yet', 'Deploy > New deployment > Web app (Execute as: Me, Who has access: Anyone), then try again.', ui.ButtonSet.OK); return; }
  ui.alert('Web addresses',
    'LICENCE SERVER ADDRESS (goes in version.json on GitHub, as "licence"):\n' + u + '\n\n' +
    'ADMIN PORTAL (bookmark it on your phone and computer; it asks for the admin password):\n' + u + '?admin=1', ui.ButtonSet.OK);
}
function menuPassword() {
  const ui = SpreadsheetApp.getUi();
  if (ui.alert('New admin password', 'Make a new admin password? The old one stops working.', ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  ui.alert('New admin password', 'Your new admin password:\n\n' + newPassword_() + '\n\nWrite it down – it is only shown now.', ui.ButtonSet.OK);
}

/* ================================================================ web entry */

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.action) return json_(() => api_(p));
  const t = HtmlService.createTemplateFromFile('Admin');
  t.inSheet = false;
  return t.evaluate().setTitle('Family Dashboard licences').addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}
function doPost(e) {
  return json_(() => api_(JSON.parse((e && e.postData && e.postData.contents) || '{}')));
}
function json_(fn) {
  let out;
  try { out = fn(); } catch (err) { out = { ok: false, error: String(err && err.message || err) }; }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

/** The public part: what dashboards call. */
function api_(b) {
  switch (b.action) {
    case 'ping': return { ok: true, app: 'family-dashboard-licences', version: LS_VERSION };
    case 'check': case 'activate': return withLock_(() => verify_(b));
    case 'move': return withLock_(() => move_(b));
    default: throw new Error('Unknown action');
  }
}

/**
 * Is this key good for this dashboard? A key that isn't in use yet is given to the first dashboard that asks.
 * Answers: state active | unknown | revoked | in-use | bad-format.
 */
function verify_(b) {
  const key = normKey_(b.key), install = String(b.install || '').replace(/[^A-Za-z0-9-]/g, '').slice(0, 64);
  const version = String(b.version || '').slice(0, 20);
  if (!install) throw new Error('No installation number');
  // Slow down anyone guessing keys: 30 wrong keys an hour per dashboard.
  const cache = CacheService.getScriptCache(), failKey = 'fail:' + install, fails = Number(cache.get(failKey) || 0);
  if (fails >= 30) return { ok: false, state: 'busy', message: 'Too many wrong keys – try again in an hour' };
  const bad = (state, message) => { cache.put(failKey, String(fails + 1), 3600); log_(key || String(b.key || '').slice(0, 40), 'Refused: ' + state, install, message); return { ok: false, state: state, message: message }; };
  if (!key) return bad('bad-format', 'That doesn’t look like a licence key – it’s FD- followed by four groups of five letters and numbers');
  const sh = sheet_(TABS.lic), row = findRow_(key);
  if (!row) return bad('unknown', 'That licence key isn’t recognised – check it against your email');
  const C = colIndex_(), rec = sh.getRange(row, 1, 1, COLS.length).getValues()[0];
  const status = String(rec[C.Status]), bound = String(rec[C.Install] || '');
  if (status === 'Revoked') return bad('revoked', 'This licence has been switched off. Please contact the seller.');
  if (bound && bound !== install) return bad('in-use', 'This licence key is already in use on another dashboard. Ask the seller to release it if you have moved.');
  const now = new Date();
  if (!bound) {
    rec[C.Status] = 'Active'; rec[C.Install] = install; rec[C.Activated] = now;
    log_(key, 'Activated', install, 'version ' + version);
  }
  rec[C['Last check']] = now; rec[C.Version] = version; rec[C.Checks] = (Number(rec[C.Checks]) || 0) + 1;
  sh.getRange(row, 1, 1, COLS.length).setValues([rec]);
  return { ok: true, state: 'active', name: String(rec[C.Name] || ''), message: 'Licensed' + (rec[C.Name] ? ' to ' + rec[C.Name] : '') };
}

/** A dashboard moving to a fresh Sheet ("Start afresh") hands its key to the new installation. Only the dashboard the key is on can do this. */
function move_(b) {
  const key = normKey_(b.key), from = String(b.install || ''), to = String(b.to || '').replace(/[^A-Za-z0-9-]/g, '').slice(0, 64);
  if (!key || !from || !to) return { ok: false, message: 'Missing details' };
  const row = findRow_(key);
  if (!row) return { ok: false, message: 'Unknown key' };
  const C = colIndex_(), sh = sheet_(TABS.lic), rec = sh.getRange(row, 1, 1, COLS.length).getValues()[0];
  if (String(rec[C.Status]) === 'Revoked') return { ok: false, message: 'This licence has been switched off' };
  if (String(rec[C.Install]) !== from) return { ok: false, message: 'This key isn’t in use on the dashboard that asked' };
  rec[C.Install] = to; rec[C.Status] = 'Active'; rec[C['Last check']] = new Date();
  sh.getRange(row, 1, 1, COLS.length).setValues([rec]);
  log_(key, 'Moved to a new Sheet', to, 'from ' + from);
  return { ok: true, state: 'active' };
}

/* ================================================================ keys */

/** FD-XXXXX-XXXXX-XXXXX-XXXXX; the last character is a check letter so typing mistakes are caught. */
function makeKey_() {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid() + Utilities.getUuid() + Date.now() + Math.random());
  let s = '';
  for (let i = 0; i < 19; i++) s += ALPHABET[((bytes[i] + 256) % 256) % 32];
  s += checkChar_(s);
  return 'FD-' + s.match(/.{5}/g).join('-');
}
function checkChar_(s19) {
  let sum = 0;
  for (let i = 0; i < s19.length; i++) sum += (ALPHABET.indexOf(s19[i]) + 1) * (i + 3);
  return ALPHABET[sum % 32];
}
/** Tidy what someone typed (spaces, lower case, O for 0…) and check it; '' if it can't be a key. */
function normKey_(k) {
  const s = String(k || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^FD(?=.{20}$)/, '');
  if (s.length !== 20 || s.split('').some(c => ALPHABET.indexOf(c) < 0)) return '';
  if (checkChar_(s.slice(0, 19)) !== s[19]) return '';
  return 'FD-' + s.match(/.{5}/g).join('-');
}

/** Make keys and add them to the register. opts: { count, name, email, order, source, notes }. Returns the keys. */
function issue_(opts) {
  const n = Math.max(1, Math.min(500, Number(opts.count) || 1));
  const sh = sheet_(TABS.lic), have = {};
  keysCol_().forEach(k => { have[k] = 1; });
  const rows = [], keys = [], now = new Date();
  while (keys.length < n) {
    const k = makeKey_(); if (have[k]) continue; have[k] = 1; keys.push(k);
    const r = COLS.map(() => '');
    const C = colIndex_();
    r[C.Key] = k; r[C.Status] = 'Issued'; r[C.Name] = clip_(opts.name, 60); r[C.Email] = clip_(opts.email, 120);
    r[C.Order] = clip_(opts.order, 60); r[C.Source] = clip_(opts.source || 'Issued by hand', 80); r[C.Issued] = now; r[C.Checks] = 0;
    r[C.Notes] = clip_(opts.notes, 200);
    rows.push(r);
  }
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, COLS.length).setValues(rows);
  CacheService.getScriptCache().remove('rows');
  keys.forEach(k => log_(k, 'Issued', '', [opts.name, opts.email, opts.order].filter(Boolean).join(' · ')));
  return keys;
}

/* ================================================================ admin (called from the portal page) */

/**
 * Every admin call comes through here. Allowed when the person is signed in as the owner (the Sheet's menu),
 * or with the right admin password (the web page). Too many wrong passwords lock the portal for 15 minutes.
 */
function admin(password, op, args) {
  adminAuth_(password);
  args = args || {};
  switch (op) {
    case 'hello': return { ok: true };
    case 'summary': return summary_();
    case 'list': return { ok: true, rows: allRows_() };
    case 'issue': return withLock_(() => ({ ok: true, keys: issue_({ count: args.count, name: args.name, email: args.email, order: args.order, notes: args.notes, source: 'Issued by hand' }),
      emailed: args.email && args.send ? emailKeys_(args.email) : 0 }));
    case 'import': return withLock_(() => import_(args.rows || [], args.source, !!args.send));
    case 'update': return withLock_(() => update_(args.key, args.fields || {}));
    case 'revoke': return withLock_(() => setStatus_(args.key, 'Revoked', args.reason));
    case 'reinstate': return withLock_(() => setStatus_(args.key, 'reinstate', args.reason));
    case 'release': return withLock_(() => release_(args.key));
    case 'delete': return withLock_(() => delete_(args.key));
    case 'email': return withLock_(() => ({ ok: true, sent: emailKeys_(null, [args.key]) }));
    case 'emailUnsent': return withLock_(() => ({ ok: true, sent: emailKeys_(null, null, true) }));
    case 'log': return { ok: true, rows: logRows_(args.key, 300) };
    case 'settings': return { ok: true, settings: settings_(), url: ScriptApp.getService().getUrl() || '', quota: MailApp.getRemainingDailyQuota() };
    case 'saveSettings': return { ok: true, settings: saveSettings_(args) };
    case 'password': return { ok: true, password: setPassword_(args.password) };
    case 'selfUpdate': return Object.assign({ ok: true }, selfUpdate_('portal'));
    default: throw new Error('Unknown admin action');
  }
}

function adminAuth_(password) {
  try {
    const me = Session.getActiveUser().getEmail(), owner = Session.getEffectiveUser().getEmail();
    if (me && owner && me === owner && !password) return;          // opened from the Sheet by its owner
  } catch (e) { /* not signed in */ }
  const cache = CacheService.getScriptCache(), fails = Number(cache.get('adminFails') || 0);
  if (fails >= 10) throw new Error('Too many wrong passwords. The portal is locked for 15 minutes.');
  const P = PropertiesService.getScriptProperties(), hash = P.getProperty('adminHash'), salt = P.getProperty('adminSalt') || '';
  if (!hash) throw new Error('Run setup in the Sheet first (🔑 Licences > Set up)');
  if (!password || hash_(salt + String(password)) !== hash) {
    cache.put('adminFails', String(fails + 1), 900);
    throw new Error('Wrong admin password');
  }
}
function newPassword_() {
  const words = ['Amber', 'Basil', 'Cedar', 'Delta', 'Ember', 'Fable', 'Grove', 'Hazel', 'Iris', 'Juniper', 'Kestrel', 'Lark', 'Maple', 'Nectar', 'Otter',
    'Pebble', 'Quartz', 'Robin', 'Saffron', 'Thistle', 'Umber', 'Violet', 'Willow', 'Yarrow', 'Zephyr'];
  const b = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid() + Date.now()).map(x => (x + 256) % 256);
  const pw = [0, 1, 2, 3].map(i => words[b[i] % words.length]).join('-') + '-' + (100 + (b[5] * 256 + b[6]) % 900);
  setPassword_(pw);
  return pw;
}
function setPassword_(pw) {
  pw = String(pw || '');
  if (pw.length < 12) throw new Error('The admin password needs at least 12 characters');
  const P = PropertiesService.getScriptProperties(), salt = Utilities.getUuid();
  P.setProperties({ adminSalt: salt, adminHash: hash_(salt + pw) });
  return 'changed';
}
function hash_(s) { return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8)); }

function summary_() {
  const rows = allRows_(), weekAgo = Date.now() - 7 * 864e5, monthAgo = Date.now() - 30 * 864e5;
  const c = { total: rows.length, issued: 0, active: 0, revoked: 0, unsent: 0, seenWeek: 0, quiet: 0 };
  rows.forEach(r => {
    if (r.Status === 'Issued') c.issued++; else if (r.Status === 'Active') c.active++; else if (r.Status === 'Revoked') c.revoked++;
    if (r.Status !== 'Revoked' && r.Email && !r.Emailed) c.unsent++;
    const seen = r['Last check'] ? Date.parse(r['Last check']) : 0;
    if (r.Status === 'Active' && seen > weekAgo) c.seenWeek++;
    if (r.Status === 'Active' && seen && seen < monthAgo) c.quiet++;
  });
  const versions = {};
  rows.filter(r => r.Status === 'Active' && r.Version).forEach(r => { versions[r.Version] = (versions[r.Version] || 0) + 1; });
  let upd = {}; try { upd = JSON.parse(PropertiesService.getScriptProperties().getProperty('lastUpdate') || '{}'); } catch (e) { upd = {}; }
  return { ok: true, counts: c, versions: versions, recent: logRows_(null, 15), version: LS_VERSION, lastUpdate: upd, saved: lsVersionsUsed_(),
    autoUpdate: ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'updateTick') };
}

/** Rows as objects with dates as text (for the page). */
function allRows_() {
  const sh = sheet_(TABS.lic), last = sh.getLastRow();
  if (last < 2) return [];
  const tz = Session.getScriptTimeZone();
  return sh.getRange(2, 1, last - 1, COLS.length).getValues().filter(r => r[0]).map(r => {
    const o = {};
    COLS.forEach((h, i) => { o[h] = r[i] instanceof Date ? Utilities.formatDate(r[i], tz, "yyyy-MM-dd'T'HH:mm") : r[i]; });
    return o;
  });
}

/**
 * Import buyers from a shop's CSV. rows: [{ name, email, order, qty }]. A row whose order (or, with no order
 * number, whose email) already has its keys is skipped, so the same file can be imported twice safely.
 */
function import_(rows, source, send) {
  if (!rows.length) throw new Error('Nothing to import');
  if (rows.length > 500) throw new Error('Up to 500 rows at a time');
  const have = {};
  allRows_().forEach(r => { const id = idOf_(r.Order, r.Email); if (id) have[id] = (have[id] || 0) + 1; });
  const made = [], skipped = [], src = clip_(source || 'CSV import', 60) + ' ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'd MMM yyyy');
  rows.forEach((r, i) => {
    const email = String(r.email || '').trim(), order = String(r.order || '').trim(), qty = Math.max(1, Math.min(20, Number(r.qty) || 1));
    if (!email && !order) { skipped.push({ row: i + 1, why: 'no email or order number' }); return; }
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { skipped.push({ row: i + 1, why: 'email doesn’t look right: ' + email }); return; }
    const id = idOf_(order, email), already = have[id] || 0;
    if (already >= qty) { skipped.push({ row: i + 1, why: 'already has ' + (already === 1 ? 'a key' : already + ' keys') + ' (' + (order || email) + ')' }); return; }
    const keys = issue_({ count: qty - already, name: r.name, email: email, order: order, source: src, notes: r.notes });
    have[id] = qty;
    keys.forEach(k => made.push({ key: k, name: r.name || '', email: email, order: order }));
  });
  let sent = 0;
  if (send) sent = emailKeys_(null, made.filter(m => m.email).map(m => m.key));
  return { ok: true, made: made, skipped: skipped, sent: sent };
}
function idOf_(order, email) { order = String(order || '').trim().toLowerCase(); email = String(email || '').trim().toLowerCase(); return order ? 'o:' + order : email ? 'e:' + email : ''; }

function update_(key, f) {
  const row = mustRow_(key), C = colIndex_(), sh = sheet_(TABS.lic);
  const rec = sh.getRange(row, 1, 1, COLS.length).getValues()[0];
  if ('name' in f) rec[C.Name] = clip_(f.name, 60);
  if ('email' in f) { const e = String(f.email || '').trim(); if (e && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw new Error('That email doesn’t look right'); rec[C.Email] = e; }
  if ('order' in f) rec[C.Order] = clip_(f.order, 60);
  if ('notes' in f) rec[C.Notes] = clip_(f.notes, 200);
  sh.getRange(row, 1, 1, COLS.length).setValues([rec]);
  log_(normKey_(key), 'Edited', '', '');
  return { ok: true };
}
function setStatus_(key, to, reason) {
  const row = mustRow_(key), C = colIndex_(), sh = sheet_(TABS.lic);
  const cur = String(sh.getRange(row, C.Status + 1).getValue()), bound = sh.getRange(row, C.Install + 1).getValue();
  const next = to === 'reinstate' ? (bound ? 'Active' : 'Issued') : to;
  sh.getRange(row, C.Status + 1).setValue(next);
  log_(normKey_(key), to === 'reinstate' ? 'Reinstated' : 'Revoked', '', clip_(reason, 120) || cur + ' → ' + next);
  return { ok: true, status: next };
}
/** Let the key be used on a different dashboard (the old one locks at its next check). */
function release_(key) {
  const row = mustRow_(key), C = colIndex_(), sh = sheet_(TABS.lic);
  const was = sh.getRange(row, C.Install + 1).getValue(), status = sh.getRange(row, C.Status + 1).getValue();
  sh.getRange(row, C.Install + 1).setValue('');
  if (status === 'Active') sh.getRange(row, C.Status + 1).setValue('Issued');
  log_(normKey_(key), 'Released', String(was), 'can now be used on another dashboard');
  return { ok: true };
}
function delete_(key) {
  const row = mustRow_(key), C = colIndex_(), sh = sheet_(TABS.lic);
  if (sh.getRange(row, C.Install + 1).getValue()) throw new Error('This key is in use – revoke it instead');
  sh.deleteRow(row);
  log_(normKey_(key), 'Deleted', '', '');
  return { ok: true };
}

/** Email keys to their buyers: given keys, or every key with an email that hasn't been sent. Returns how many were sent. */
function emailKeys_(toEmail, keys, unsentOnly) {
  const S = settings_(), sh = sheet_(TABS.lic), C = colIndex_(), last = sh.getLastRow();
  if (last < 2) return 0;
  const data = sh.getRange(2, 1, last - 1, COLS.length).getValues();
  const want = keys ? keys.map(normKey_) : null;
  const byEmail = {};
  data.forEach((r, i) => {
    const email = String(r[C.Email] || '').trim();
    if (!email || r[C.Status] === 'Revoked') return;
    if (want && want.indexOf(String(r[C.Key])) < 0) return;
    if (toEmail && email.toLowerCase() !== String(toEmail).toLowerCase()) return;
    if (unsentOnly && r[C.Emailed]) return;
    if (toEmail && r[C.Emailed]) return;
    (byEmail[email] = byEmail[email] || []).push({ i: i, key: r[C.Key], name: String(r[C.Name] || '') });
  });
  let sent = 0;
  const emails = Object.keys(byEmail);
  if (emails.length > MailApp.getRemainingDailyQuota()) throw new Error('Google lets this account send ' + MailApp.getRemainingDailyQuota() + ' more emails today – try fewer, or tomorrow');
  emails.forEach(email => {
    const list = byEmail[email], name = (list[0].name || '').split(' ')[0] || 'there';
    const keyText = list.map(x => x.key).join('\n    ');
    const fill = t => String(t).replace(/\{name\}/g, name).replace(/\{key\}/g, keyText).replace(/\{setup\}/g, S.setupLink).replace(/\{seller\}/g, S.sellerName);
    MailApp.sendEmail({ to: email, subject: fill(S.subject), body: fill(S.body), name: S.sellerName });
    const now = new Date();
    list.forEach(x => { sh.getRange(x.i + 2, C.Emailed + 1).setValue(now); log_(String(x.key), 'Emailed', '', email); });
    sent += list.length;
  });
  return sent;
}

function settings_() {
  const P = PropertiesService.getScriptProperties(), o = {};
  Object.keys(DEFAULTS).forEach(k => { o[k] = P.getProperty('set_' + k) || DEFAULTS[k]; });
  return o;
}
function saveSettings_(a) {
  const P = PropertiesService.getScriptProperties();
  Object.keys(DEFAULTS).forEach(k => { if (k in a) { const v = String(a[k] || '').slice(0, 4000); if (v.trim()) P.setProperty('set_' + k, v); else P.deleteProperty('set_' + k); } });
  if (settings_().body.indexOf('{key}') < 0) throw new Error('The email must contain {key}');
  return settings_();
}

/* ================================================================ helpers */

function sheet_(name) {
  const sh = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sh) throw new Error('Missing tab "' + name + '" – run setup from the 🔑 Licences menu');
  return sh;
}
function colIndex_() { const o = {}; COLS.forEach((h, i) => { o[h] = i; }); return o; }
function keysCol_() { const sh = sheet_(TABS.lic), last = sh.getLastRow(); return last < 2 ? [] : sh.getRange(2, 1, last - 1, 1).getValues().map(r => String(r[0])); }
function findRow_(key) { const i = keysCol_().indexOf(key); return i < 0 ? 0 : i + 2; }
function mustRow_(key) { const k = normKey_(key); const row = k && findRow_(k); if (!row) throw new Error('No such key: ' + key); return row; }
function clip_(v, n) { return String(v == null ? '' : v).replace(/[\r\n\t]+/g, ' ').trim().slice(0, n); }
function withLock_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error('Busy – try again');
  try { return fn(); } finally { lock.releaseLock(); }
}
function log_(key, event, install, detail) {
  try { sheet_(TABS.log).appendRow([new Date(), key || '', event, install || '', clip_(detail, 200)]); } catch (e) { /* the log never stops a licence */ }
}
function logRows_(key, max) {
  const sh = sheet_(TABS.log), last = sh.getLastRow();
  if (last < 2) return [];
  const n = Math.min(last - 1, key ? 5000 : max), tz = Session.getScriptTimeZone();
  return sh.getRange(last - n + 1, 1, n, LOGCOLS.length).getValues().reverse()
    .filter(r => !key || r[1] === normKey_(key)).slice(0, max)
    .map(r => ({ when: r[0] instanceof Date ? Utilities.formatDate(r[0], tz, 'd MMM yyyy HH:mm') : String(r[0]), key: r[1], event: r[2], install: r[3], detail: r[4] }));
}

/* ================================================================ automatic updates of this licence server */
// Every hour it compares LS_VERSION with "licenceServer" in version.json on GitHub. If there's a newer one it downloads
// Scripts/Licence/Code.gs, Admin.html and appsscript.json, writes them into this project with Google's Apps Script API,
// makes a new version and moves the web app to it – so the web address stays the same.
// Needs the "Google Apps Script API" switched on at script.google.com/home/usersettings (once per Google account).
const LS_FILES = [['Code', 'SERVER_JS', 'Code.gs'], ['Admin', 'HTML', 'Admin.html'], ['appsscript', 'JSON', 'appsscript.json']];

function updateTick() { try { selfUpdate_('timer'); } catch (err) { console.warn('Licence server update: ' + err.message); } }
function menuUpdate() {
  const ui = SpreadsheetApp.getUi();
  try {
    const r = selfUpdate_('menu');
    ui.alert('Licence server', r.updated ? 'Updated from ' + r.from + ' to ' + r.to + '.' : r.upToDate ? 'Already up to date (' + LS_VERSION + ').' : (r.message || 'Done'), ui.ButtonSet.OK);
  } catch (err) { ui.alert('Licence server', 'The update didn’t work: ' + err.message, ui.ButtonSet.OK); }
}
function lsApi_(method, path, body) {
  const res = UrlFetchApp.fetch('https://script.googleapis.com/v1/projects/' + ScriptApp.getScriptId() + path, {
    method: method, contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, payload: body ? JSON.stringify(body) : undefined });
  const code = res.getResponseCode(), text = res.getContentText();
  if (code >= 200 && code < 300) return text ? JSON.parse(text) : {};
  let msg = text; try { msg = JSON.parse(text).error.message; } catch (e) { /* plain text */ }
  if (/has not been used|is disabled|not enabled|SERVICE_DISABLED|User has not enabled the Apps Script API/i.test(text)) msg = 'The Google Apps Script API is switched off for your Google account (script.google.com/home/usersettings).';
  else if (/version/i.test(text) && /limit|maximum|200/i.test(text)) msg = 'Google’s limit of 200 saved versions has been reached. In Apps Script open Project history, delete old versions, then try again.';
  throw new Error(String(msg).slice(0, 300));
}
/** The web app deployment (the one with a version number, most recently changed). */
/** How many of Google's 200 saved versions this licence server has used (each automatic update uses one). */
function lsVersionsUsed_() {
  try {
    let used = 0, token = '';
    do {
      const r = lsApi_('get', '/versions?pageSize=50' + (token ? '&pageToken=' + encodeURIComponent(token) : ''));
      used += (r.versions || []).length; token = r.nextPageToken || '';
    } while (token);
    return { used: used, max: 200, warn: used >= 190 };
  } catch (err) { return null; }
}
function lsDeployment_() {
  const list = (lsApi_('get', '/deployments').deployments || []).filter(d => d.deploymentConfig && d.deploymentConfig.versionNumber &&
    (d.entryPoints || []).some(e => e.entryPointType === 'WEB_APP'));
  list.sort((a, b) => String(b.updateTime).localeCompare(String(a.updateTime)));
  return list[0] ? list[0].deploymentId : '';
}
function lsNewer_(a, b) {
  const x = String(a || '').split('.').map(Number), y = String(b || '').split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  return false;
}
function selfUpdate_(why) {
  const P = PropertiesService.getScriptProperties();
  if (Date.now() - Number(P.getProperty('updating') || 0) < 3 * 60000) return { busy: true, message: 'An update is already running' };
  const bust = '?t=' + Date.now();
  const get = u => { const r = UrlFetchApp.fetch(u, { muteHttpExceptions: true }); if (r.getResponseCode() !== 200) throw new Error('Couldn’t download ' + u.replace(/\?.*/, '') + ' (' + r.getResponseCode() + ')'); return r.getContentText(); };
  const latest = JSON.parse(get(APPS_BASE + 'version.json' + bust));
  if (!latest.licenceServer || !lsNewer_(latest.licenceServer, LS_VERSION)) return { upToDate: true, version: LS_VERSION };
  P.setProperty('updating', String(Date.now()));
  const note = o => P.setProperty('lastUpdate', JSON.stringify(Object.assign({ at: new Date().toISOString(), to: latest.licenceServer }, o)));
  try {
    const files = {};
    LS_FILES.forEach(f => { files[f[0]] = get(APPS_BASE + 'Scripts/Licence/' + f[2] + bust); });
    const m = /const LS_VERSION = '([^']+)'/.exec(files.Code);
    if (!m || m[1] !== latest.licenceServer || !/function verify_\(/.test(files.Code)) throw new Error('The new files on GitHub aren’t ready yet (expected ' + latest.licenceServer + ')');
    const cur = lsApi_('get', '/content');
    const curMan = JSON.parse(((cur.files || []).find(f => f.name === 'appsscript') || {}).source || '{}');
    const newScopes = (JSON.parse(files.appsscript).oauthScopes || []).filter(x => (curMan.oauthScopes || []).indexOf(x) < 0);
    // A new kind of permission would stop the web app until approved – only when you're at the Sheet.
    if (newScopes.length && why !== 'menu') {
      const msg = 'This update needs a new permission: in the licence Sheet choose 🔑 Licences → Update the licence server now, and approve.';
      note({ result: 'needs approval', message: msg });
      return { approval: true, message: msg };
    }
    const dep = lsDeployment_();
    if (!dep) throw new Error('No web app deployment found – Deploy > New deployment > Web app first');
    const keep = (cur.files || []).filter(f => !LS_FILES.some(u => u[0] === f.name)).map(f => ({ name: f.name, type: f.type, source: f.source }));
    lsApi_('put', '/content', { files: LS_FILES.map(f => ({ name: f[0], type: f[1], source: files[f[0]] })).concat(keep) });
    const ver = lsApi_('post', '/versions', { description: 'Licence server ' + latest.licenceServer });
    lsApi_('put', '/deployments/' + dep, { deploymentConfig: { scriptId: ScriptApp.getScriptId(), versionNumber: ver.versionNumber,
      manifestFileName: 'appsscript', description: 'Licence server ' + latest.licenceServer } });
    note({ result: 'updated', from: LS_VERSION, how: why });
    return { updated: true, from: LS_VERSION, to: latest.licenceServer };
  } catch (err) {
    note({ result: 'failed', message: err.message });
    if (why !== 'timer') throw err;
    return { failed: true, message: err.message };
  } finally { P.deleteProperty('updating'); }
}
