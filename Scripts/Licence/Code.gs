/**
 * Family Dashboard – licence server.
 *
 * Lives in the seller's own Google account, in a Sheet of its own ("Family Dashboard Licences").
 * The Sheet is the register: one row per licence key.
 *
 *   Licences  Key | Status | Name | Email | Order | Source | Issued | Emailed | Activated | Install | Last check | Version | Checks | Notes
 *   Activity  When | Key | Event | Install | Detail
 *   Feedback  Ref | Received | Type | Status | Subject | Message | Email | Key | Install | Version | Report | Updated | Reply | Notes
 *   Reports   Ref | Part | Text   (diagnostics reports sent with a support request, in pieces – a cell holds 50,000 characters)
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

const LS_VERSION = '2026.11.18';
// Run by the loader (the small "Code" file that fetches this program from GitHub)? Then updating needs nothing else.
const LOADED = typeof FD_LOADER !== 'undefined' && FD_LOADER ? FD_LOADER : null;
function adminTemplate_() { return LOADED ? HtmlService.createTemplate(LOADED.html()) : HtmlService.createTemplateFromFile('Admin'); }
// Where new versions of this licence server are published (version.json "licenceServer", files in Scripts/Licence/).
const APPS_BASE = 'https://russm1981.github.io/family-apps/';
const TABS = { lic: 'Licences', log: 'Activity', fb: 'Feedback', rep: 'Reports' };
const FBCOLS = ['Ref', 'Received', 'Type', 'Status', 'Subject', 'Message', 'Email', 'Key', 'Install', 'Version', 'Report', 'Updated', 'Reply', 'Notes'];
const FB_TYPES = ['Feedback', 'Feature request', 'Support request'];
const FB_STATUS = ['New', 'In progress', 'Waiting for them', 'Resolved', 'Closed'];   // Resolved and Closed are done; the rest are outstanding
const COLS = ['Key', 'Status', 'Name', 'Email', 'Order', 'Source', 'Issued', 'Emailed', 'Activated', 'Install', 'Last check', 'Version', 'Checks', 'Notes', 'Screens'];
// Screens: how many screens (Corsair, tablet, computer…) may show this family's dashboard at once. Phones don't count.
const LOGCOLS = ['When', 'Key', 'Event', 'Install', 'Detail'];
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';     // no 0/O, 1/I – easy to read out and type
const DEFAULTS = {
  sellerName: 'Family Dashboard',
  subject: 'Your Family Dashboard licence key – and how to get started',
  body: 'Hello {name},\n\nThank you for buying Family Dashboard. This email has everything you need.\n\n' +
    'YOUR LICENCE KEY\n\n    {key}\n\nKeep this email: you need the key again if you ever set the dashboard up from scratch.\n\n' +
    'HOW IT WORKS\n\n' +
    'Family Dashboard is standard software that runs on your screen and your phones. Everything that belongs to your family – names, ' +
    'the calendar, the children’s points, notes and settings – is kept in your own Google account, in a Google Sheet that only you own.\n\n' +
    'The software reaches your Sheet with a private access code that setup creates for you. The code stays on your own screen and phones and isn’t sent ' +
    'anywhere else, so your family’s information stays private – nobody else can see it, including us.\n\n' +
    'WHAT SETUP DOES\n\n' +
    'Setup takes about 30 minutes on a computer. It goes one step at a time and explains each one:\n\n' +
    '1. Your own copy. It makes your family’s Google Sheet from a blank template, in your Google account.\n\n' +
    '2. Switching it on. You “publish” your Sheet so your screen and phones can talk to it. Google asks you to allow this – that’s normal.\n\n' +
    '3. Your licence key. It’s filled in for you from this email.\n\n' +
    '4. Your family. Names and colours for the calendar and the children’s points.\n\n' +
    '5. Your screen and phones. Each is connected with a short code or by scanning a QR code.\n\n' +
    '6. Live information (optional). Trains, buses and traffic come from other services through an “API” – a way for the dashboard to fetch ' +
    'information from them. Most need a free account with that service, which gives you your own key (a bit like a licence). Setup shows you how ' +
    'to get each one, and you can skip any you don’t want.\n\n' +
    '7. A final check that everything works.\n\n' +
    'START HERE\n\n' +
    'On a computer (not a phone or tablet), click the link below. It opens setup with your licence key already in it:\n\n{setup}\n\n' +
    'STUCK?\n\nThere’s help for every step here: {help}\nOr just reply to this email.\n\nBest wishes,\n{seller}',
  setupLink: 'https://russm1981.github.io/family-apps/setup/',
};
// Earlier standard wording: treated as "not changed", so buyers get the current wording.
const OLD_DEFAULTS = {
  subject: ['Your Family Dashboard licence key'],
  body: ["Hello {name},\n\nThank you for buying Family Dashboard. Everything you need to get started is in this email.\n\nYOUR LICENCE KEY\n\n    {key}\n\nKeep this email: you need the key again if you ever set the dashboard up from scratch.\n\nHOW TO GET STARTED\n\n1. Use a computer (a Windows PC or a Mac), not a phone or tablet – part of setup is done on Google’s website.\n\n2. Click the link below. It opens the setup page with your licence key already filled in:\n\n{setup}\n\n3. Press Start, then follow the page one step at a time, pressing Next at the bottom of each one. It takes about 30 minutes, and if you stop, the page remembers where you got to.\n\nWHAT YOU’LL NEED\n\n- A Google (Gmail) account – ideally the one your family calendar is in\n- Your screen: a Windows PC with a Corsair XENEON EDGE, a tablet, or a Raspberry Pi with a screen\n- About half an hour\n\nSTUCK?\n\nThere’s help for every step here: {help}\nOr just reply to this email.\n\nBest wishes,\n{seller}",
    'Hello {name},\n\nThank you for buying Family Dashboard.\n\nYour licence key is:\n\n    {key}\n\n' +
    'To set up your dashboard, open {setup} on a computer and follow the steps. You will be asked for this key.\n\n' +
    'Keep this email: you need the key again if you ever set the dashboard up from scratch.\n\nBest wishes,\n{seller}'],
  setupLink: ['https://russm1981.github.io/family-apps/', 'https://russm1981.github.io/family-apps'],
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
  ScriptApp.newTrigger('updateTick').timeBased().everyMinutes(5).create();
  PropertiesService.getScriptProperties().setProperty('tickEvery', '5');
  msg += '\n\nAutomatic updates: on (checks every 5 minutes).';
  msg += '\n\nNext (first time only): Deploy > New deployment > Web app, Execute as: Me, Who has access: Anyone. Then 🔑 Licences > Show the web addresses.';
  try { SpreadsheetApp.getUi().alert('Licence server', msg, SpreadsheetApp.getUi().ButtonSet.OK); } catch (e) { console.log(msg); }
}

function menuPortal() {
  const t = adminTemplate_();
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
  let t;
  try { t = adminTemplate_(); } catch (err) {
    return HtmlService.createHtmlOutput('<div style="font:16px system-ui;max-width:560px;margin:60px auto;line-height:1.5"><h2>The licence portal page is missing</h2>' +
      '<p>This script has no HTML file called exactly <b>Admin</b>. To fix it: open your licence Google Sheet and choose ' +
      '<b>🔑 Licences → Update the licence server now</b>. That puts every file back from GitHub and republishes this page.</p>' +
      '<p>Or by hand: Extensions → Apps Script, add an HTML file named <b>Admin</b> (or rename the one that’s there), paste in ' +
      'Scripts/Licence/Admin.html from GitHub, then Deploy → Manage deployments → Edit → New version → Deploy.</p></div>').setTitle('Family Dashboard licences');
  }
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
  if (b.action === 'check' || b.action === 'activate') ensureCols_();
  switch (b.action) {
    case 'ping': return { ok: true, app: 'family-dashboard-licences', version: LS_VERSION };
    // The public half of the support key: dashboards lock the private parts of a diagnostics report with it.
    case 'supportKey': { const k = PropertiesService.getScriptProperties().getProperty('supportPublic'); return { ok: true, publicKey: k ? JSON.parse(k) : null }; }
    // Connecting a new screen from a phone: the phone leaves the family's link here, locked with the code shown on
    // the screen (this server can't read it); the screen collects it. Kept for 10 minutes, collected once.
    case 'pairPut': {
      const id = String(b.id || ''), box = String(b.box || '');
      if (!/^[0-9a-f]{24}$/.test(id) || box.length > 4000 || !/^[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+$/.test(box)) throw new Error('Bad pairing request');
      CacheService.getScriptCache().put('pair:' + id, box, 600);
      return { ok: true };
    }
    case 'pairPeek': {   // the phone that sent it: has the screen collected it yet? (nothing is read or removed)
      const id = String(b.id || '');
      if (!/^[0-9a-f]{24}$/.test(id)) throw new Error('Bad pairing request');
      return { ok: true, waiting: !!CacheService.getScriptCache().get('pair:' + id) };
    }
    case 'pairGet': {
      const id = String(b.id || ''), c = CacheService.getScriptCache();
      if (!/^[0-9a-f]{24}$/.test(id)) throw new Error('Bad pairing request');
      const box = c.get('pair:' + id);
      if (box) c.remove('pair:' + id);
      return { ok: true, box: box || '' };
    }
    case 'check': case 'activate': return withLock_(() => verify_(b));
    case 'move': return withLock_(() => move_(b));
    case 'release': return withLock_(() => selfRelease_(b));
    // Feedback, feature requests and support requests, sent from a family's dashboard (through their Google script).
    case 'feedback': return withLock_(() => feedbackIn_(b));
    case 'myFeedback': return myFeedback_(b);
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
  if (bound && bound !== install) return bad('in-use', 'This licence key is already in use on another dashboard. If it was typed into an app that was connected to someone else’s dashboard, it went there. Ask the seller to release it, then enter it again.');
  const now = new Date();
  if (!bound) {
    rec[C.Status] = 'Active'; rec[C.Install] = install; rec[C.Activated] = now;
    log_(key, 'Activated', install, 'version ' + version);
  }
  rec[C['Last check']] = now; rec[C.Version] = version; rec[C.Checks] = (Number(rec[C.Checks]) || 0) + 1;
  sh.getRange(row, 1, 1, COLS.length).setValues([rec]);
  const screens = Math.max(1, Number(rec[C.Screens]) || 1);
  const act = rec[C.Activated] instanceof Date ? rec[C.Activated] : now;
  return { ok: true, state: 'active', screens: screens, activated: act.getTime(), name: String(rec[C.Name] || ''), message: 'Licensed' + (rec[C.Name] ? ' to ' + rec[C.Name] : '') + ' · ' + screens + ' screen' + (screens > 1 ? 's' : '') };
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

/** A dashboard frees its own key (the family is starting again from scratch). Only the dashboard the key is on can do this. */
function selfRelease_(b) {
  const key = normKey_(b.key), from = String(b.install || '');
  const row = key && findRow_(key);
  if (!row) return { ok: false, message: 'Unknown key' };
  const C = colIndex_(), sh = sheet_(TABS.lic);
  if (String(sh.getRange(row, C.Install + 1).getValue()) !== from) return { ok: false, message: 'This key isn’t in use on the dashboard that asked' };
  sh.getRange(row, C.Install + 1).setValue('');
  if (sh.getRange(row, C.Status + 1).getValue() === 'Active') sh.getRange(row, C.Status + 1).setValue('Issued');
  log_(key, 'Released by its dashboard', from, 'starting again');
  return { ok: true };
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
    r[C.Screens] = Math.max(1, Math.min(20, Number(opts.screens) || 1));
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
  ensureCols_();
  args = args || {};
  switch (op) {
    case 'hello': return { ok: true };
    case 'feedbackList': return { ok: true, rows: fbRows_(), statuses: FB_STATUS };
    case 'feedbackReport': return { ok: true, text: fbReport_(args.ref) };
    case 'feedbackUpdate': return withLock_(() => fbUpdate_(args.ref, args));
    case 'summary': return summary_();
    case 'list': return { ok: true, rows: allRows_() };
    case 'issue': return withLock_(() => ({ ok: true, keys: issue_({ count: args.count, name: args.name, email: args.email, order: args.order, notes: args.notes, screens: args.screens, source: 'Issued by hand' }),
      emailed: args.email && args.send ? emailKeys_(args.email) : 0 }));
    case 'import': return withLock_(() => import_(args.rows || [], args.source, !!args.send, args.screens));
    case 'update': return withLock_(() => update_(args.key, args.fields || {}));
    case 'revoke': return withLock_(() => setStatus_(args.key, 'Revoked', args.reason));
    case 'reinstate': return withLock_(() => setStatus_(args.key, 'reinstate', args.reason));
    case 'release': return withLock_(() => release_(args.key));
    case 'delete': return withLock_(() => delete_(args.key));
    case 'email': return withLock_(() => ({ ok: true, sent: emailKeys_(null, [args.key]) }));
    case 'emailUnsent': return withLock_(() => ({ ok: true, sent: emailKeys_(null, null, true) }));
    case 'testEmail': {      // a sample of the buyers' email, to you (the owner of this licence server)
      const me = Session.getEffectiveUser().getEmail(), m = emailFor_(settings_(), 'there', ['FD-SAMPL-EKEYS-AMPLE-KEYXX']);
      if (!me) throw new Error('Couldn’t tell which account to send it to');
      MailApp.sendEmail({ to: me, subject: '[Sample] ' + m.subject, body: m.body, htmlBody: m.html, name: settings_().sellerName });
      return { ok: true, to: me };
    }
    case 'log': return { ok: true, rows: logRows_(args.key, 300) };
    case 'settings': return { ok: true, settings: settings_(), url: ScriptApp.getService().getUrl() || '', quota: MailApp.getRemainingDailyQuota() };
    case 'saveSettings': return { ok: true, settings: saveSettings_(args) };
    case 'password': return { ok: true, password: setPassword_(args.password) };
    case 'selfUpdate': return Object.assign({ ok: true }, selfUpdate_('portal'));
    case 'supportKey': { const P = PropertiesService.getScriptProperties(); return { ok: true, has: !!P.getProperty('supportPrivate'), privateKey: args.withPrivate && P.getProperty('supportPrivate') ? JSON.parse(P.getProperty('supportPrivate')) : null }; }
    case 'saveSupportKey': {
      const P = PropertiesService.getScriptProperties();
      if (P.getProperty('supportPrivate') && !args.replace) throw new Error('There is already a support key');
      if (!args.publicKey || !args.privateKey || args.publicKey.kty !== 'RSA' || !args.privateKey.d) throw new Error('That isn’t a key pair');
      P.setProperties({ supportPublic: JSON.stringify(args.publicKey), supportPrivate: JSON.stringify(args.privateKey) });
      log_('', 'Support key made', '', '');
      return { ok: true };
    }
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
  const fbOpen = fbRows_().filter(r => ['Resolved', 'Closed'].indexOf(r.Status) < 0).length;
  return { ok: true, counts: c, feedbackOpen: fbOpen, versions: versions, recent: logRows_(null, 15), version: LS_VERSION, loader: LOADED ? LOADED.info() : null, lastUpdate: upd, saved: lsVersionsUsed_(),
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
function import_(rows, source, send, defScreens) {
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
    const keys = issue_({ count: qty - already, name: r.name, email: email, order: order, source: src, notes: r.notes, screens: r.screens || defScreens });
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
  if ('screens' in f) rec[C.Screens] = Math.max(1, Math.min(20, Number(f.screens) || 1));
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
    const m = emailFor_(S, name, list.map(x => x.key));
    MailApp.sendEmail({ to: email, subject: m.subject, body: m.body, htmlBody: m.html, name: S.sellerName });
    const now = new Date();
    list.forEach(x => { sh.getRange(x.i + 2, C.Emailed + 1).setValue(now); log_(String(x.key), 'Emailed', '', email); });
    sent += list.length;
  });
  return sent;
}

/** The licence email for these keys: plain text, and an HTML copy with a big "Start setting up" button. */
function emailFor_(S, name, keys) {
  // One key: the setup link carries it, so setup fills it in by itself.
  let base = String(S.setupLink || DEFAULTS.setupLink).trim();
  if (/github\.io\/family-apps\/?$/.test(base)) base = base.replace(/\/?$/, '/') + 'setup/';     // straight to setup, not the home page
  const link = base + (keys.length === 1 ? '#key=' + encodeURIComponent(keys[0]) : '');
  const help = APPS_BASE + 'help/#setup';
  const keyText = keys.join('\n    ');
  const fill = t => String(t).replace(/\{name\}/g, name).replace(/\{key\}/g, keyText).replace(/\{setup\}/g, link).replace(/\{help\}/g, help).replace(/\{seller\}/g, S.sellerName);
  const body = fill(S.body);
  const e = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const linkify = t => e(t).replace(/https?:\/\/[^\s<]+/g, u => '<a href="' + u + '" style="color:#1f6f5c">' + (u === e(help) ? 'the setup help page' : u.length > 60 ? u.slice(0, 57) + '…' : u) + '</a>');
  const html = body.split(/\n{2,}/).map(par => {
    const p = par.trim();
    if (!p) return '';
    if (p === link) return '<p style="margin:18px 0"><a href="' + e(link) + '" style="display:inline-block;background:#1f6f5c;color:#ffffff;padding:14px 26px;border-radius:10px;text-decoration:none;font-weight:bold;font-size:17px">Start setting up →</a></p>';
    if (keys.indexOf(p) >= 0 || p.split(/\s+/).every(w => keys.indexOf(w) >= 0)) return '<p style="font:bold 22px ui-monospace,Menlo,Consolas,monospace;letter-spacing:1px;background:#f3f1ea;padding:12px 16px;border-radius:8px;display:inline-block">' + p.split(/\s+/).map(e).join('<br>') + '</p>';
    if (/^[A-Z’' ?]+$/.test(p) && p.length < 40) return '<h3 style="margin:22px 0 6px;font-size:15px;letter-spacing:.5px;color:#1f6f5c">' + e(p) + '</h3>';
    return '<p style="margin:8px 0">' + linkify(p).replace(/\n/g, '<br>') + '</p>';
  }).join('');
  return { subject: fill(S.subject), body: body,
    html: '<div style="font:16px/1.5 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1d2329;max-width:560px">' + html + '</div>' };
}

function settings_() {
  const P = PropertiesService.getScriptProperties(), o = {};
  Object.keys(DEFAULTS).forEach(k => {
    const v = P.getProperty('set_' + k);
    o[k] = v && (OLD_DEFAULTS[k] || []).indexOf(v) < 0 ? v : DEFAULTS[k];
  });
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
/** Older registers lack newer columns (e.g. Screens): add the headings, once. */
function ensureCols_() {
  const sh = sheet_(TABS.lic);
  if (sh.getLastColumn() >= COLS.length) return;
  sh.getRange(1, 1, 1, COLS.length).setValues([COLS]).setFontWeight('bold').setBackground('#1f2937').setFontColor('#ffffff');
  const last = sh.getLastRow();
  if (last > 1) sh.getRange(2, COLS.indexOf('Screens') + 1, last - 1, 1).setValues(Array.from({ length: last - 1 }, () => [1]));
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

function updateTick() {
  const P = PropertiesService.getScriptProperties();
  if (P.getProperty('tickEvery') !== '5') {     // checked less often: switch to every 5 minutes
    try { ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'updateTick').forEach(t => ScriptApp.deleteTrigger(t));
      ScriptApp.newTrigger('updateTick').timeBased().everyMinutes(5).create(); P.setProperty('tickEvery', '5'); } catch (e) { /* next time */ }
  }
  try { selfUpdate_('timer'); } catch (err) { console.warn('Licence server update: ' + err.message); } }
function menuUpdate() {
  const ui = SpreadsheetApp.getUi();
  try {
    // The portal page (the HTML file "Admin") missing or misnamed? Put every file back from GitHub, even if up to date.
    let missing = false; try { adminTemplate_(); } catch (e) { missing = true; }
    const r = selfUpdate_('menu', missing);
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
  if (/has not been used|is disabled|not enabled|SERVICE_DISABLED|User has not enabled the Apps Script API/i.test(text)) {
    let who = ''; try { who = Session.getEffectiveUser().getEmail(); } catch (e) { /* not known */ }
    const proj = (/project[s]?[ /](\d{6,})/i.exec(text) || [])[1];
    msg = proj && !/User has not enabled/i.test(text)
      ? 'The Apps Script API is off in this script’s Google Cloud project (' + proj + '). Switch it on at https://console.cloud.google.com/apis/library/script.googleapis.com?project=' + proj + (who ? ' (signed in as ' + who + ')' : '') + ', wait a few minutes, then Check for an update.'
      : 'The Google Apps Script API is switched off for ' + (who || 'this Google account') + ' (script.google.com/home/usersettings – check the account at the top right). If it already says On, wait 10 minutes and try again.';
  }
  else if (/version/i.test(text) && /limit|maximum|200/i.test(text)) msg = 'Google’s limit of 200 saved versions has been reached. In Apps Script open Project history, delete old versions, then try again.';
  throw new Error(String(msg).slice(0, 300));
}
/** The web app deployment (the one with a version number, most recently changed). */
/** How many of Google's 200 saved versions this licence server has used (each automatic update uses one). */
function lsVersionsUsed_() {
  if (LOADED) return null;   // the loader never makes new versions
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
function selfUpdate_(why, force) {
  const P = PropertiesService.getScriptProperties();
  if (LOADED) {
    try {
      const r = LOADED.refresh(why);
      P.setProperty('lastUpdate', JSON.stringify(r.updated ? { at: new Date().toISOString(), result: 'updated', from: r.from, to: r.to, how: why } : { at: new Date().toISOString(), result: 'up to date', to: r.version }));
      return r;
    } catch (err) {
      P.setProperty('lastUpdate', JSON.stringify({ at: new Date().toISOString(), result: 'failed', message: err.message }));
      if (why !== 'timer') throw err;
      return { failed: true, message: err.message };
    }
  }
  if (Date.now() - Number(P.getProperty('updating') || 0) < 3 * 60000) return { busy: true, message: 'An update is already running' };
  const bust = '?t=' + Date.now();
  const get = u => { const r = UrlFetchApp.fetch(u, { muteHttpExceptions: true }); if (r.getResponseCode() !== 200) throw new Error('Couldn’t download ' + u.replace(/\?.*/, '') + ' (' + r.getResponseCode() + ')'); return r.getContentText(); };
  const latest = JSON.parse(get(APPS_BASE + 'version.json' + bust));
  if (!force && (!latest.licenceServer || !lsNewer_(latest.licenceServer, LS_VERSION))) {
    // Up to date now (perhaps updated by hand): an old "failed" note no longer applies.
    try { const old = JSON.parse(P.getProperty('lastUpdate') || '{}'); if (old.result === 'failed' && !lsNewer_(old.to || '', LS_VERSION)) P.setProperty('lastUpdate', JSON.stringify({ at: new Date().toISOString(), result: 'up to date', to: LS_VERSION })); } catch (e) { /* fine */ }
    return { upToDate: true, version: LS_VERSION };
  }
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


/* ================================================================ feedback and support requests */

/** The Feedback and Reports tabs, made the first time they're needed. */
function fbSheet_(name) {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    const head = name === TABS.fb ? FBCOLS : ['Ref', 'Part', 'Text'];
    sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold').setBackground('#1f2937').setFontColor('#ffffff');
    sh.setFrozenRows(1);
    if (name === TABS.fb) {
      sh.getRange(2, FBCOLS.indexOf('Status') + 1, 999, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(FB_STATUS, true).build());
      sh.setColumnWidth(FBCOLS.indexOf('Message') + 1, 420);
    }
  }
  return sh;
}
function feedbackIn_(b) {
  const key = normKey_(b.key), install = String(b.install || '').replace(/[^A-Za-z0-9-]/g, '').slice(0, 64);
  if (!install) throw new Error('No installation number');
  const type = FB_TYPES.indexOf(String(b.type)) >= 0 ? String(b.type) : 'Feedback';
  const subject = clip_(b.subject, 120), message = String(b.message || '').trim().slice(0, 8000);
  if (!subject && !message) throw new Error('Write something first');
  const email = String(b.email || '').trim().slice(0, 120);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('That email address doesn’t look right');
  // A few an hour from each dashboard is plenty.
  const c = CacheService.getScriptCache(), rk = 'fb:' + install, n = Number(c.get(rk) || 0);
  if (n >= 10) throw new Error('Lots sent already – try again in an hour');
  c.put(rk, String(n + 1), 3600);
  const ref = 'FB-' + Utilities.formatDate(new Date(), 'Europe/London', 'yyMMdd') + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
  const report = String(b.report || '').slice(0, 400000);
  if (report) {
    const rs = fbSheet_(TABS.rep), parts = [];
    for (let i = 0; i < report.length; i += 45000) parts.push([ref, parts.length + 1, report.slice(i, i + 45000)]);
    rs.getRange(rs.getLastRow() + 1, 1, parts.length, 3).setValues(parts);
  }
  const now = new Date();
  fbSheet_(TABS.fb).appendRow([ref, now, type, 'New', subject, message, email, key || '', install, clip_(b.version, 20), report ? Math.ceil(report.length / 1024) + ' KB' : '', now, '', '']);
  // Tell the owner (best effort).
  try {
    MailApp.sendEmail(Session.getEffectiveUser().getEmail(), 'Family Dashboard ' + type.toLowerCase() + ' ' + ref + (subject ? ': ' + subject : ''),
      type + ' ' + ref + '\n\n' + (subject ? subject + '\n\n' : '') + message + '\n\n' + (email ? 'Reply to: ' + email + '\n' : '') + 'Licence: ' + (key || 'none') + '\n' +
      (report ? 'A diagnostics report is attached in the licence portal (Feedback).\n' : '') + '\nOpen the licence portal to reply or change its status.');
  } catch (e) { /* the row is saved – that's what matters */ }
  return { ok: true, ref: ref };
}
/** A dashboard's own requests and where they're up to (only its own – matched on its installation number). */
function myFeedback_(b) {
  const install = String(b.install || '').replace(/[^A-Za-z0-9-]/g, '').slice(0, 64);
  if (!install) throw new Error('No installation number');
  const sh = SpreadsheetApp.getActive().getSheetByName(TABS.fb);
  if (!sh || sh.getLastRow() < 2) return { ok: true, rows: [] };
  const I = {}; FBCOLS.forEach((h, i) => { I[h] = i; });
  const rows = sh.getRange(2, 1, sh.getLastRow() - 1, FBCOLS.length).getValues().filter(r => String(r[I.Install]) === install).reverse().slice(0, 30);
  const d = v => v instanceof Date ? Utilities.formatDate(v, 'Europe/London', 'yyyy-MM-dd') : String(v || '');
  return { ok: true, rows: rows.map(r => ({ ref: r[I.Ref], date: d(r[I.Received]), type: r[I.Type], subject: r[I.Subject], status: r[I.Status], reply: r[I.Reply], updated: d(r[I.Updated]) })) };
}
function fbRows_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(TABS.fb);
  if (!sh || sh.getLastRow() < 2) return [];
  const tz = Session.getScriptTimeZone();
  return sh.getRange(2, 1, sh.getLastRow() - 1, FBCOLS.length).getValues().map(r => {
    const o = {}; FBCOLS.forEach((h, i) => { o[h] = r[i] instanceof Date ? Utilities.formatDate(r[i], tz, 'yyyy-MM-dd HH:mm') : r[i]; });
    return o;
  }).reverse();
}
function fbReport_(ref) {
  const sh = SpreadsheetApp.getActive().getSheetByName(TABS.rep);
  if (!sh || sh.getLastRow() < 2) return '';
  return sh.getRange(2, 1, sh.getLastRow() - 1, 3).getValues().filter(r => String(r[0]) === String(ref)).sort((a, b) => a[1] - b[1]).map(r => String(r[2])).join('');
}
function fbUpdate_(ref, a) {
  const sh = fbSheet_(TABS.fb), last = sh.getLastRow();
  const refs = last < 2 ? [] : sh.getRange(2, 1, last - 1, 1).getValues().map(r => String(r[0]));
  const i = refs.indexOf(String(ref)); if (i < 0) throw new Error('Not found: ' + ref);
  const row = i + 2, col = h => FBCOLS.indexOf(h) + 1;
  if (a.status != null) { if (FB_STATUS.indexOf(a.status) < 0) throw new Error('Unknown status'); sh.getRange(row, col('Status')).setValue(a.status); }
  if (a.reply != null) sh.getRange(row, col('Reply')).setValue(String(a.reply).slice(0, 4000));
  if (a.notes != null) sh.getRange(row, col('Notes')).setValue(String(a.notes).slice(0, 4000));
  sh.getRange(row, col('Updated')).setValue(new Date());
  return { ok: true };
}
