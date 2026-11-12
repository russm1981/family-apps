/**
 * Family Dashboard backend
 * -------------------------
 * Lives inside a Google Sheet (Extensions > Apps Script).
 * - Serves a JSON API to the dashboard on the XENEON EDGE and to the phone apps.
 * - Serves the Admin page (open the web-app URL in any browser / phone).
 * - The Sheet is the record: every points movement is a row in "Ledger".
 *
 * The screen is made of PAGES (tab "Pages"). A page is either the Boys page, the Calendar page,
 * or a WIDGET page. Widget pages hold WIDGETS (tab "Widgets"): each is a quarter of the screen wide
 * and either full height or half height. Each widget's own settings are in "Widget settings".
 * One-off technical settings (access code, API keys, home address) are in "Installation".
 *
 * First run (or after updating this code): select `setup` in the toolbar and press Run.
 * It creates any missing tabs and moves settings from the old "Settings" tab into the new ones.
 */

const TZ = 'Europe/London';
const SCRIPT_VERSION = '2026.11.39';      // compared with version.json on GitHub to tell families when to update
const APPS_DEFAULT = 'https://russm1981.github.io/family-apps/';
// Run by the loader (the small "Code" file that fetches this program from GitHub)? Then updating is just the loader
// fetching the newer program – no Apps Script API, no saved versions. Otherwise this is the whole program pasted in.
const LOADED = typeof FD_LOADER !== 'undefined' && FD_LOADER ? FD_LOADER : null;
const SHEETS = {
  boys: ['Name', 'Colour'],
  tasks: ['ID', 'Boy', 'Task', 'Points', 'Repeat', 'Order', 'Active'],
  ledger: ['ID', 'Timestamp', 'Boy', 'Type', 'TaskID', 'Description', 'Points'],
  todos: ['Boy', 'Item', 'Days', 'Order'],
  todoLog: ['Date', 'Boy', 'Item'],
  timetable: ['Boy', 'Day', 'Reminder'],
  categories: ['Category', 'Colour', 'Match', 'Group', 'Show', 'Kind'],
  install: ['Setting', 'Value', 'Notes'],
  pages: ['Page', 'Title', 'Type', 'Icon', 'Order', 'Show'],
  widgets: ['Widget', 'Page', 'Order', 'Type', 'Size', 'Show'],
  wset: ['Widget', 'Setting', 'Value'],
  lists: ['List', 'Item', 'Done', 'Added', 'ID'],
  where: ['Person', 'Place', 'Since', 'How'],
  memos: ['ID', 'Text', 'From', 'Added'],
};
const TAB = {
  boys: 'Boys', tasks: 'Tasks', ledger: 'Ledger', todos: 'Todos',
  todoLog: 'TodoLog', timetable: 'Timetable', categories: 'Categories',
  install: 'Installation', pages: 'Pages', widgets: 'Widgets', wset: 'Widget settings', lists: 'Lists',
  where: 'Whereabouts', memos: 'Memos',
};
// Calendar categories. An event's category is the word(s) before the dash in its title, e.g. "Ben – Drums".
// Match = extra words that put an un-prefixed event into the category (e.g. "Football practice" → Josh).
// Group = shown in that group's colour and key entry, with the person's name in brackets: "Drums (Ben)".
// Show  = "bar" draws a strip along the bottom of the days instead of an entry (school holidays).
// Kind  = child / adult (a person), children / adults (the two groups), family, holiday, special. Set by the setup app.
// A new Sheet starts with just the fixed categories; the setup app adds the family.
const DEFAULT_CATEGORIES = [
  ['Children', '#22d3ee', '', '', '', 'children'],
  ['Adults', '#a855f7', '', '', '', 'adults'],
  ['Family', '#c08457', '', '', '', 'family'],
  ['Holiday', '#ef4444', 'flight', '', '', 'holiday'],
  ['School holiday', '#facc15', 'half term, inset, school holiday', '', 'bar', 'special'],
  ['Birthday', '#ffffff', 'birthday', '', '', 'special'],
];
// How many the calendar key can hold neatly: children's group, adults' group, Family, Holiday, up to 3 special, Other.
const FAMILY_LIMITS = { people: 12, children: 6, specials: 3, name: 10, group: 14, special: 16, match: 120 };
const OTHER_COLOUR = '#8a93a3';
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Longest text that fits on the XENEON EDGE screen. Enforced here, on the admin page/app (typing stops),
// and in the Sheet itself (data validation). Anything longer that slips in is cut off with "…" on screen.
const LIMITS = {
  reminder: 12,       // "Swimming kit"
  boyName: 10,
  task: 22,           // "Empty the dishwasher"
  todo: 22,
  destination: 16,    // e.g. "Grandma's house"
  reason: 30,         // reason on a bonus or penalty
  eventTitle: 40,
  eventNote: 300,
  category: 14,
  listItem: 30,       // shopping list item
  memo: 80,           // a note on the Memo widget
  pageTitle: 10,      // fits under the icon in the side bar
  maxPoints: 999,     // a task, bonus or penalty
  maxCashIn: 9999,
  maxPenaltyButtons: 4,
  columns: 4,         // widgets are a quarter of the screen wide
};
function checkLen_(what, value, max) {
  const v = String(value == null ? '' : value).trim();
  if (v.length > max) throw new Error(what + ' \u201c' + v + '\u201d is ' + v.length + ' characters \u2013 the most that fits on the screen is ' + max);
  return v;
}
function checkPoints_(what, n, max) {
  if (!isFinite(n) || Math.round(n) !== n) throw new Error(what + ' must be a whole number');
  if (Math.abs(n) < 1 || Math.abs(n) > max) throw new Error(what + ' must be between 1 and ' + max);
  return n;
}

/* ===================================================== INSTALLATION SETTINGS */
// Set once when the dashboard is installed. Edited on the admin "Installation" tab (except the access code).

const INSTALL = [
  { k: 'AccessCode', label: 'Access code', help: 'Made for you when the Sheet is set up. Change it from the Family Admin app (Install tab) so the rules are checked.', hidden: true },
  { k: 'PrivacyAccepted', label: 'Privacy notice accepted', help: 'Version of the privacy notice accepted, set by the apps.', hidden: true },
  { k: 'PrivacyAcceptedOn', label: 'Privacy notice accepted on', help: 'When and by whom.', hidden: true },
  { k: 'LicenceKey', label: 'Licence key', help: 'Your Family Dashboard licence key (FD-XXXXX-…). Entered in the setup app or the Family Admin app.', hidden: true },
  { k: 'MovedTo', label: 'Moved to', help: 'Set when this dashboard has moved to a fresh Sheet (Start afresh): the new web app address.', hidden: true },
  { k: 'AutoUpdate', label: 'Automatic updates', help: 'Yes = the Google script updates itself from the apps address. Turned on from the admin app, the setup app or the Sheet menu.', hidden: true },
  { k: 'AppsAddress', group: 'advanced', label: 'Apps address', def: APPS_DEFAULT, help: 'Where the screen, phone apps and setup app are hosted (GitHub Pages). Only change this if you host your own copy.' },
  { k: 'HomeAddress', group: 'home', label: 'Home address', def: '',
    help: 'The default place for the weather, the start of traffic routes and the centre of the flights map. Address, postcode or "51.63,-2.46".' },
  { k: 'TomTomKey', group: 'keys', uses: 'Traffic, the flights and traffic maps', label: 'TomTom API key', help: 'From developer.tomtom.com. Traffic times and all the maps.' },
  { k: 'RailDataKey', group: 'keys', uses: 'Trains', label: 'National Rail key', help: 'Either an OpenLDBWS token (from realtime.nationalrail.co.uk/OpenLDBWSRegistration – the same one the Raspberry Pi departure boards use) or a Rail Data Marketplace key (raildata.org.uk).' },
  { k: 'CalendarIds', group: 'calendar', label: 'Calendars to show', def: 'default', help: 'default = your main calendar, all = every calendar, or calendar IDs separated by commas.' },
  { k: 'AddToCalendar', group: 'calendar', label: 'Calendar for new events', def: 'default', help: 'Where + Add saves events: default = your main calendar, or a calendar ID.' },
  { k: 'SleepMinutes', group: 'screen', label: 'Screen sleep after (minutes)', def: '30', help: 'With nobody touching the screen, it goes dark after this many minutes; a touch wakes it. 0 = never.' },
  { k: 'SleepStyle', group: 'screen', label: 'Sleep screen', def: 'Clock', help: 'Clock = black with a small, dim clock. Black = completely black.' },
  { k: 'NightHours', group: 'screen', label: 'Night hours', def: '23:30-06:30', help: 'Between these times the screen sleeps (unless someone touches it), and goes back to sleep after 2 minutes. Blank = no night hours.' },
  { k: 'NasaKey', group: 'keys', uses: 'NASA picture of the day', label: 'NASA API key', def: 'DEMO_KEY', help: 'For the NASA picture of the day. DEMO_KEY works a few times a day; a free key from api.nasa.gov always works.' },
  { k: 'TransportApiId', group: 'keys', uses: 'Bus stop', label: 'TransportAPI app ID', help: 'For live bus times (free account at developer.transportapi.com \u2013 the same service the MagicMirror bus module uses).' },
  { k: 'TransportApiKey', group: 'keys', uses: 'Bus stop', label: 'TransportAPI app key', help: 'From the same TransportAPI account.' },
  { k: 'SpotifyClientId', group: 'keys', uses: 'Spotify', label: 'Spotify Client ID', help: 'From developer.spotify.com → Dashboard → your app. Then tap "Connect Spotify" on the Spotify widget.' },
  { k: 'SpotifyClientSecret', group: 'keys', uses: 'Spotify', label: 'Spotify Client secret', help: 'From the same Spotify app page (View client secret).' },
];

/* ====================================================== PAGES AND WIDGETS */

// Setting types: text, number, bool, select, lines (one per line), time (15:00), crs (station code), url.
const PAGE_TYPES = {
  widgets: { name: 'Widget page', settings: [] },
  boys: { name: 'Boys (points)', single: true, settings: [
    { k: 'CashInPoints', label: 'Points needed to cash in', type: 'number', def: 500, min: 1, max: LIMITS.maxCashIn },
    { k: 'CashInValue', label: 'Cash-in value (\u00a3)', type: 'number', def: 5, min: 1, max: 100 },
    { k: 'PenaltyOptions', label: 'Penalty buttons', type: 'text', def: '10,20,50', max: 20, help: 'Points for each penalty button, separated by commas, e.g. 10,20,50 (up to 4).' },
  ] },
  calendar: { name: 'Calendar', single: true, settings: [
    { k: 'DefaultView', label: 'Opens on', type: 'select', def: '3 months', options: ['3 months', '3 months (scroll)', 'Month', 'Week'] },
    { k: 'AlignWeekdays', label: 'Line up weekdays in the 3-month views (each month starts under its weekday, so weekends form columns)', type: 'bool', def: true },
  ] },
};

const NEWS_FEEDS = {
  'BBC \u2013 Top stories': 'https://feeds.bbci.co.uk/news/rss.xml',
  'BBC \u2013 UK': 'https://feeds.bbci.co.uk/news/uk/rss.xml',
  'BBC \u2013 World': 'https://feeds.bbci.co.uk/news/world/rss.xml',
  'BBC \u2013 England': 'https://feeds.bbci.co.uk/news/england/rss.xml',
  'BBC \u2013 Bristol': 'https://feeds.bbci.co.uk/news/england/bristol/rss.xml',
  'BBC \u2013 Gloucestershire': 'https://feeds.bbci.co.uk/news/england/gloucestershire/rss.xml',
  'BBC \u2013 Business': 'https://feeds.bbci.co.uk/news/business/rss.xml',
  'BBC \u2013 Technology': 'https://feeds.bbci.co.uk/news/technology/rss.xml',
  'BBC \u2013 Science': 'https://feeds.bbci.co.uk/news/science_and_environment/rss.xml',
  'BBC \u2013 Sport': 'https://feeds.bbci.co.uk/sport/rss.xml',
  'Another feed (link below)': '',
};

/**
 * Every kind of widget. sizes = allowed heights (first is the default). ttl = seconds the data is kept
 * before asking the source again. data(settings, id) runs here on Google; widgets without it run on the screen only.
 */
const BIN_SOURCES = ['My council (automatic)', 'Calendar link', 'Repeating schedule'];
const WIDGET_TYPES = {
  weather: { name: 'Weather', icon: '\u2600\uFE0F', sizes: ['full', 'half'], ttl: 20 * 60, about: 'Clock, current weather, the next hours and the next few days.',
    settings: [
      { k: 'Location', label: 'Place', type: 'text', def: '', max: 150, help: 'Leave blank for home, or type a town or postcode.' },
      { k: 'ShowClock', label: 'Show the clock and date', type: 'bool', def: true },
      { k: 'Hours', label: 'Hours ahead', type: 'number', def: 8, min: 4, max: 8 },
      { k: 'Days', label: 'Days ahead', type: 'number', def: 4, min: 2, max: 4 },
    ],
    data: (s) => weather_(s.Location || inst_('HomeAddress')) },
  traffic: { name: 'Traffic', icon: '\uD83D\uDE97', sizes: ['full', 'half'], ttl: 10 * 60, about: 'Live map and journey times compared with the usual time.',
    settings: [
      { k: 'Destinations', label: 'Destinations', type: 'lines', maxLines: 3, def: '',
        help: 'One per line: Label | address or postcode. Up to 3. Labels up to ' + LIMITS.destination + ' characters.' },
      { k: 'From', label: 'Start from', type: 'text', def: '', max: 150, help: 'Leave blank for home.' },
    ],
    data: (s) => traffic_(s.From || inst_('HomeAddress'), s.Destinations) },
  trains: { name: 'Trains', icon: '\uD83D\uDE86', sizes: ['half', 'full'], ttl: 60, about: 'Live departure board between two stations (National Rail).',
    settings: [
      { k: 'From', label: 'From station (code)', type: 'crs', def: 'BPW', help: 'Three-letter code, e.g. BPW for Bristol Parkway. Find codes at nationalrail.co.uk.' },
      { k: 'To', label: 'To station (code)', type: 'crs', def: 'PAD', help: 'e.g. PAD for London Paddington.' },
      { k: 'Rows', label: 'Trains to show', type: 'number', def: 3, min: 1, max: 7, help: 'A half-height widget fits 3; full height fits 7.' },
      { k: 'Disruption', label: 'Disruption messages', type: 'select', def: 'Only about this route', options: ['Only about this route', 'Everything at the station', 'Off'],
        help: '“Only about this route” shows a message only if it mentions one of the stations your trains call at.' },
    ],
    data: (s) => trains_(s.From, s.To, s.Disruption) },
  agenda: { name: 'Today & tomorrow', icon: '\uD83D\uDCC5', sizes: ['half', 'full'], calendar: true, about: 'Calendar entries for today and tomorrow, and a look at the coming weekend.',
    settings: [
      { k: 'MaxPerDay', label: 'Entries per day before "+ more"', type: 'number', def: 3, min: 2, max: 10, help: 'With the weekend showing, a half-height widget fits 3.' },
      { k: 'Weekend', label: 'Show the weekend (on Fridays it takes the place of tomorrow)', type: 'bool', def: true },
    ],
    data: () => agenda_(), nocache: true },
  bins: { name: 'Bins', icon: '\uD83D\uDDD1\uFE0F', sizes: ['full', 'half'], ttl: 3 * 3600, about: 'Bin collections anywhere in the UK, with a “put out tonight” reminder. Set up in Family Admin → Bins → Set up bin days.',
    settings: [
      { k: 'Source', label: 'Collection days from', type: 'select', def: 'My council (automatic)', options: BIN_SOURCES,
        help: 'My council: looked up from your postcode, where your council is connected (see Help). Calendar link: many councils offer an "add to calendar" (iCal / .ics) link on their bin-day page. Repeating schedule: works everywhere.' },
      { k: 'Postcode', label: 'Postcode', type: 'text', def: '', max: 10, when: ['Source', ['My council (automatic)']] },
      { k: 'House', label: 'House name or number', type: 'text', def: '', max: 60, when: ['Source', ['My council (automatic)']], help: 'Words that pick your house out of the council\u2019s list (My council only).' },
      { k: 'CalendarLink', label: 'Council calendar link (iCal / .ics)', type: 'url', def: '', when: ['Source', ['Calendar link']], help: 'Calendar link only. Copy the "subscribe" or "add to calendar" link from your council\u2019s bin-day page.' },
      { k: 'Schedule', label: 'Repeating schedule', type: 'lines', maxLines: 6, def: '', when: ['Source', ['Repeating schedule']],
        help: 'Repeating schedule only. One bin per line: Bin | every how many weeks | a recent or next collection date, e.g. "Black bin | 2 | 2026-11-11" or "Recycling | 1 | 12/11/2026".' },
      { k: 'ReminderFrom', label: '"Put out tonight" from', type: 'time', def: '15:00', help: 'Time the day before a collection when the reminder appears.' },
      { k: 'Council', label: 'Council (code)', type: 'text', def: '', max: 12, advanced: true, help: 'Filled in by “Set up bin days” in the Family Admin app. Blank = worked out from the postcode.' },
      { k: 'UPRN', label: 'Property number (UPRN)', type: 'text', def: '', max: 20, advanced: true, help: 'Your home’s unique property reference number. Some councils need it – “Set up bin days” helps you find it.' },
    ],
    data: (s, id) => bins_(s, id) },
  flights: { name: 'Flights overhead', icon: '\u2708\uFE0F', sizes: ['full'], ttl: 25, about: 'Live map of planes near home, with where they\u2019re going (ADS-B).',
    settings: [
      { k: 'RadiusMiles', label: 'Distance from home (miles)', type: 'number', def: 20, min: 3, max: 60 },
      { k: 'Map', label: 'Map', type: 'select', def: 'Light', options: ['Light', 'Dark'] },
      { k: 'MapStrength', label: 'Map strength (%) – how strongly towns and roads show behind the planes', type: 'number', def: 55, min: 10, max: 100 },
      { k: 'MaxAltitude', label: 'Highest altitude (feet)', type: 'number', def: 45000, min: 1000, max: 60000, help: 'Lower it (e.g. 10000) to see only planes taking off and landing.' },
      { k: 'Routes', label: 'Look up where each flight is going', type: 'bool', def: true },
      { k: 'ListRows', label: 'Flights listed under the map', type: 'number', def: 3, min: 0, max: 5 },
      { k: 'Source', label: 'Data source', type: 'select', def: 'adsb.lol', options: ['adsb.lol', 'airplanes.live'], advanced: true, help: 'Both are free community networks. Try the other if planes stop showing.' },
      { k: 'Centre', label: 'Centre of the map', type: 'text', def: '', max: 150, advanced: true, help: 'Leave blank for home.' },
    ],
    data: (s) => flights_(s) },
  news: { name: 'News', icon: '\uD83D\uDCF0', sizes: ['half', 'full'], ttl: 10 * 60, about: 'Headlines from the BBC or any news feed.',
    settings: [
      { k: 'Feed', label: 'News', type: 'select', def: 'BBC \u2013 Top stories', options: Object.keys(NEWS_FEEDS) },
      { k: 'FeedUrl', label: 'Feed link', type: 'url', def: '', advanced: true, help: 'Only for "Another feed": the RSS address, e.g. https://www.theguardian.com/uk/rss' },
      { k: 'Rotate', label: 'Change the main story every (seconds)', type: 'number', def: 20, min: 5, max: 600 },
      { k: 'Pictures', label: 'Show pictures', type: 'bool', def: true },
    ],
    data: (s) => news_(s) },
  timer: { name: 'Kitchen timer', icon: '\u23F2\uFE0F', sizes: ['half'], about: 'Touch timer with quick buttons. Beeps on any page when it finishes.',
    settings: [
      { k: 'Presets', label: 'Quick buttons (minutes)', type: 'text', def: '3,5,10,15,20,30', max: 30, help: 'Up to 6 numbers separated by commas.' },
      { k: 'Sound', label: 'Beep when finished', type: 'bool', def: true },
    ] },
  photos: { name: 'Photo slideshow', icon: '\uD83D\uDDBC\uFE0F', sizes: ['full', 'half'], ttl: 30 * 60, about: 'Photos from a Google Drive folder or a shared Google Photos album.',
    settings: [
      { k: 'Source', label: 'Photos from', type: 'select', def: 'Google Drive folder', options: ['Google Drive folder', 'Google Photos shared album'] },
      { k: 'DriveFolder', label: 'Google Drive folder link', type: 'url', def: '', help: 'Make a folder in Drive, share it as "Anyone with the link \u2013 Viewer", and paste its link.' },
      { k: 'AlbumLink', label: 'Google Photos album link', type: 'url', def: '', help: 'In Google Photos: open the album \u2192 Share \u2192 Create link, then paste it here.' },
      { k: 'Seconds', label: 'Change photo every (seconds)', type: 'number', def: 15, min: 5, max: 600 },
      { k: 'Order', label: 'Order', type: 'select', def: 'Shuffle', options: ['Shuffle', 'Newest first', 'In order'] },
      { k: 'Fit', label: 'Photo shape', type: 'select', def: 'Fill the box', options: ['Fill the box', 'Show the whole photo'] },
      { k: 'Caption', label: 'Caption', type: 'select', def: 'None', options: ['None', 'File name', 'Date added'] },
    ],
    data: (s) => photos_(s) },
  clock: { name: 'Clock', icon: '\uD83D\uDD52', sizes: ['half', 'full'], about: 'Large clock and date, plus up to three other time zones.',
    settings: [
      { k: 'Hour24', label: '24-hour clock', type: 'bool', def: true },
      { k: 'Seconds', label: 'Show seconds', type: 'bool', def: false },
      { k: 'ShowDate', label: 'Show the date', type: 'bool', def: true },
      { k: 'Zones', label: 'Other places', type: 'lines', maxLines: 3, def: 'New York | America/New_York\nDubai | Asia/Dubai',
        help: 'One per line: Name | time zone, e.g. Orlando | America/New_York, Sydney | Australia/Sydney. Up to 3.' },
    ] },
  list: { name: 'List', icon: '\uD83D\uDED2', sizes: ['half', 'full'], about: 'Shopping or to-do list. Tick items off on the screen; add them from your phone.',
    settings: [
      { k: 'ListName', label: 'List name', type: 'text', def: 'Shopping', max: 16 },
      { k: 'Source', label: 'Kept in', type: 'select', def: 'This Google Sheet', options: ['This Google Sheet', 'Google Tasks'],
        help: 'Google Tasks lets you add items from the Google Tasks app or Gmail. It needs the Google Tasks service turned on in Apps Script (see the instructions).' },
      { k: 'TasksList', label: 'Google Tasks list name', type: 'text', def: '', max: 60, advanced: true, help: 'The list\u2019s name in Google Tasks. Blank = the same as the list name.' },
      { k: 'ShowTicked', label: 'Keep ticked items on screen', type: 'bool', def: true, help: 'Ticked items show crossed out at the bottom until "Clear ticked".' },
      { k: 'AddOnScreen', label: 'Allow adding on the screen', type: 'bool', def: true },
    ],
    data: (s, id) => listData_(s, id), nocache: true },
};


/* Widgets added in November 2026 (layout version 2). */
const QUOTE_CHANGE = ['Every day', 'Every hour', 'Every 10 minutes'];
Object.assign(WIDGET_TYPES, {
  countdown: { name: 'Holiday countdown', icon: '🏖️', sizes: ['half', 'full'], ttl: 15 * 60, calendar: true, about: 'Days to go until the next holiday, from the calendar and your own dates.',
    settings: [
      { k: 'Title', label: 'Title', type: 'text', def: 'Holiday countdown', max: 30 },
      { k: 'Categories', label: 'Calendar categories to count down to', type: 'text', def: 'Holiday', max: 80, help: 'Category names separated by commas, e.g. Holiday, School holiday. Blank = only the dates below.' },
      { k: 'Extra', label: 'Your own dates', type: 'lines', maxLines: 6, def: '', help: 'One per line: Name | date, e.g. Orlando | 3/4/2027 or Christmas | 25 Dec.' },
      { k: 'Show', label: 'How many to show', type: 'number', def: 3, min: 1, max: 6 },
    ],
    data: (s) => countdown_(s) },
  whereabouts: { name: 'Where is everyone? (Weasley clock)', icon: '🕰️', sizes: ['full'], about: 'A clock whose hands show where each person is. Tap a name to move it, or let phones update it automatically.',
    settings: [
      { k: 'People', label: 'People', type: 'lines', maxLines: 6, def: 'Russ | #a855f7\nBecky | #f472b6\nBen | #3fa9f5\nJosh | #f5a623\nAlex | #7ed321',
        help: 'One per line: Name | colour. Up to 6.' },
      { k: 'Places', label: 'Places on the clock', type: 'lines', maxLines: 10, def: 'Home | home\nSchool\nWork\nShops\nSport\nFriends\nHoliday\nTravelling',
        help: 'One per line: Name, optionally | address so phones can set it automatically. "home" means the home address. Anywhere else counts as Travelling. Up to 10.' },
      { k: 'Radius', label: 'How close counts as being there (metres)', type: 'number', def: 300, min: 50, max: 5000, advanced: true },
    ],
    data: (s) => whereabouts_(s), nocache: true },
  bus: { name: 'Bus stop', icon: '\uD83D\uDE8C', sizes: ['half', 'full'], ttl: 60, about: 'Live departures from a bus stop (TransportAPI, as used by the MagicMirror UK bus module). Uses the stop nearest home unless you pick one.',
    settings: [
      { k: 'Source', label: 'Bus times from', type: 'select', def: 'TransportAPI', options: ['TransportAPI', 'bustimes.org'],
        help: 'TransportAPI is the official live feed (free key, 30 updates a day). bustimes.org needs no key but reads its web pages.' },
      { k: 'StopCode', label: 'Bus stop code (ATCO)', type: 'text', def: '', max: 20, help: 'Leave blank to use the stop nearest home. Or find your stop on openstreetmap.org (Transport map \u2192 click the stop \u2192 naptan:AtcoCode).' },
      { k: 'Rows', label: 'Buses to show', type: 'number', def: 4, min: 1, max: 10 },
      { k: 'Times', label: 'Update the times between', type: 'text', def: '07:00-09:15, 14:45-18:00', max: 60,
        help: 'TransportAPI\u2019s free plan allows 30 updates a day, so they\u2019re spread across these times (about every 12 minutes). Outside them the last times stay on screen.' },
      { k: 'StopName', label: 'Stop found', type: 'text', def: '', max: 80, advanced: true, help: 'Filled in automatically.' },
    ],
    data: (s, id) => bus_(s, id) },
  todo: { name: 'To-do (Google Tasks)', icon: '✅', sizes: ['full', 'half'], about: 'Your Google Tasks, with due dates. Tick them off on the screen; add from the Google Tasks app, Gmail, Calendar or here.',
    settings: [
      { k: 'Title', label: 'Title on screen', type: 'text', def: 'To do', max: 16 },
      { k: 'TasksList', label: 'Google Tasks list', type: 'text', def: '', max: 60, help: 'The list’s name in Google Tasks. Blank = your first list (usually "My Tasks").' },
      { k: 'AddOnScreen', label: 'Allow adding on the screen', type: 'bool', def: true },
    ],
    data: (s) => todo_(s), nocache: true },
  parcels: { name: 'Parcels', icon: '📦', sizes: ['half', 'full'], ttl: 15 * 60, about: 'Deliveries on their way, read from delivery emails in your Gmail (Royal Mail, Evri, DPD, Amazon…).',
    settings: [
      { k: 'Days', label: 'Look back (days)', type: 'number', def: 7, min: 1, max: 30 },
      { k: 'KeepDelivered', label: 'Keep delivered parcels on screen (hours)', type: 'number', def: 24, min: 0, max: 168 },
    ],
    data: (s) => parcels_(s) },
  memo: { name: 'Memo', icon: '📌', sizes: ['half', 'full'], about: 'Sticky notes for the family. Add from the phone or the screen; tap one to remove it.',
    settings: [
      { k: 'KeepDays', label: 'Remove notes after (days)', type: 'number', def: 7, min: 1, max: 90 },
      { k: 'AddOnScreen', label: 'Allow adding on the screen', type: 'bool', def: true },
    ],
    data: (s) => memos_(s), nocache: true },
  quote: { name: 'Quote', icon: '💬', sizes: ['half', 'full'], ttl: 12 * 3600, about: 'An encouraging quote that changes every day (or more often).',
    settings: [
      { k: 'Source', label: 'Quotes from', type: 'select', def: 'Built-in (family-friendly)', options: ['Built-in (family-friendly)', 'ZenQuotes (online)'] },
      { k: 'Change', label: 'New quote', type: 'select', def: 'Every day', options: QUOTE_CHANGE },
    ],
    data: (s) => s.Source === 'ZenQuotes (online)' ? zenQuotes_() : null },
  apod: { name: 'NASA picture of the day', icon: '🔭', sizes: ['full', 'half'], ttl: 3 * 3600, about: 'NASA’s Astronomy Picture of the Day. Tap it to read about it.',
    settings: [
      { k: 'ShowText', label: 'Show the title on the picture', type: 'bool', def: true },
    ],
    data: () => apod_() },
  spotify: { name: 'Spotify', icon: '🎵', sizes: ['half'], ttl: 5, about: 'What’s playing on Spotify, with play, pause and skip. Needs Spotify Premium and a one-off connection.',
    settings: [],
    data: () => spotifyNow_() },
  words: { name: 'Word of the day', icon: '🗣️', sizes: ['half'], ttl: 20 * 60, about: 'A new word in another language, plus Duolingo streaks.',
    settings: [
      { k: 'Language', label: 'Language', type: 'select', def: 'Same as Duolingo', options: ['Same as Duolingo', 'French', 'Spanish', 'German', 'Italian'],
        help: 'The language of the word of the day. "Same as Duolingo" uses the language the first Duolingo username below is learning (French if there isn\u2019t one).' },
      { k: 'Change', label: 'New word', type: 'select', def: 'Every hour', options: QUOTE_CHANGE },
      { k: 'Duolingo', label: 'Duolingo usernames', type: 'text', def: '', max: 80, help: 'Optional, separated by commas, to show each person’s streak. Profiles must be public.' },
    ],
    data: (s) => s.Duolingo ? duolingo_(s.Duolingo) : null },
});
const LAYOUT_VER = '7';   // 7: automatic updates switched on (unless someone switched them off on purpose) · 6: settings left at their defaults are written into the Sheet · 5: word of the day switched from Spanish to French · 3: TransportAPI keys added to Installation · 4: Home page all half height, with a memo

const DEFAULT_PAGES = [
  ['home', 'Home', 'widgets', '\u2302', 1, 'Yes'],
  ['boys', 'Boys', 'boys', '\u2605', 2, 'Yes'],
  ['calendar', 'Calendar', 'calendar', '\u25A6', 3, 'Yes'],
  ['other', 'Other', 'widgets', '\u25C8', 4, 'Yes'],
  ['family', 'Family', 'widgets', '\u2726', 5, 'Yes'],
  ['discover', 'Discover', 'widgets', '\u2600', 6, 'Yes'],
];
const DEFAULT_WIDGETS = [
  ['weather1', 'home', 1, 'weather', 'half', 'Yes'],
  ['memo2', 'home', 2, 'memo', 'half', 'Yes'],
  ['traffic1', 'home', 3, 'traffic', 'half', 'Yes'],
  ['trains1', 'home', 4, 'trains', 'half', 'Yes'],
  ['agenda1', 'home', 5, 'agenda', 'half', 'Yes'],
  ['bins1', 'home', 6, 'bins', 'half', 'Yes'],
  ['countdown1', 'home', 7, 'countdown', 'half', 'Yes'],
  ['photos2', 'home', 8, 'photos', 'half', 'Yes'],
  ['flights1', 'other', 1, 'flights', 'full', 'Yes'],
  ['photos1', 'other', 2, 'photos', 'full', 'Yes'],
  ['clock1', 'other', 3, 'clock', 'half', 'Yes'],
  ['timer1', 'other', 4, 'timer', 'half', 'Yes'],
  ['news1', 'other', 5, 'news', 'half', 'Yes'],
  ['list1', 'other', 6, 'list', 'half', 'Yes'],
  ['whereabouts1', 'family', 1, 'whereabouts', 'full', 'Yes'],
  ['todo1', 'family', 2, 'todo', 'full', 'Yes'],
  ['memo1', 'family', 3, 'memo', 'half', 'Yes'],
  ['parcels1', 'family', 4, 'parcels', 'half', 'Yes'],
  ['bus1', 'family', 5, 'bus', 'half', 'Yes'],
  ['quote1', 'family', 6, 'quote', 'half', 'Yes'],
  ['apod1', 'discover', 1, 'apod', 'full', 'Yes'],
  ['spotify1', 'discover', 2, 'spotify', 'half', 'Yes'],
  ['words1', 'discover', 3, 'words', 'half', 'Yes'],
];
const PAGE_ICONS = ['\u2302', '\u25C8', '\u2726', '\u2600', '\u266B', '\u2708', '\u2615', '\u2691', '\u25CF', '\u25B2'];

/* ------------------------------------------------------------------ setup */

function setup() {
  freshCopy_();
  const ss = SpreadsheetApp.getActive();
  ss.setSpreadsheetTimeZone(TZ); // so dates typed in the sheet mean UK dates
  ensureTabs_();
  const def = ss.getSheetByName('Sheet1');
  if (def && def.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(def);

  // Children (the points page) are added by the setup app's "Family & calendar" step.
  const tasks = sheet_('tasks');
  if (tasks.getLastRow() === 1) {
    tasks.getRange(2, 1, 4, 7).setValues([
      [newId_(), 'All', 'Make your bed', 10, 'daily', 1, true],
      [newId_(), 'All', 'Empty the dishwasher', 20, 'daily', 2, true],
      [newId_(), 'All', 'Read for 20 minutes', 15, 'daily', 3, true],
      [newId_(), 'All', 'Wash the car', 100, 'once', 4, true],
    ]);
  }
  const todos = sheet_('todos');
  if (todos.getLastRow() === 1) {
    todos.getRange(2, 1, 3, 4).setValues([
      ['All', 'Teeth brushed', 'Mon-Fri', 1],
      ['All', 'School bag packed', 'Mon-Fri', 2],
      ['All', 'Shoes on', 'Mon-Fri', 3],
    ]);
  }
  const tt = sheet_('timetable');
  if (tt.getLastRow() === 1) {
    tt.getRange(2, 1, 2, 3).setValues([['All', 'Mon', 'PE kit'], ['All', 'Fri', 'Library book']]);
  }
  const cats = sheet_('categories');
  if (cats.getLastRow() === 1) cats.getRange(2, 1, DEFAULT_CATEGORIES.length, 6).setValues(DEFAULT_CATEGORIES);
  else upgradeCategories_();
  migrate_();
  applySheetRules_();
  // Automatic updates are on unless someone has switched them off.
  if (String(inst_('AutoUpdate') || '').trim() === '') { try { setAutoUpdate_(true); } catch (err) { console.warn('Automatic updates: ' + err.message); } }
  // For the next 2 hours the setup wizard may collect the access code once (action=claim), so it needn't be typed in.
  PropertiesService.getScriptProperties().setProperty('claimUntil', String(Date.now() + 2 * 3600000));
  PropertiesService.getScriptProperties().deleteProperty('claimed');
  Logger.log('Access code: ' + inst_('AccessCode'));
}

/** Setup wizard: hand over the access code once, within 2 hours of running setup. */
function claim_() {
  const props = PropertiesService.getScriptProperties();
  const fresh = Date.now() - Number(props.getProperty('installedAt') || 0) < 24 * 3600000;   // a brand-new copy, within a day
  if (props.getProperty('claimed') || (Date.now() > Number(props.getProperty('claimUntil') || 0) && !fresh)) {
    throw new Error('Type the access code instead: it\u2019s in the Installation tab of your Google Sheet (or run setup again).');
  }
  props.setProperty('claimed', String(Date.now()));
  return { ok: true, code: String(inst_('AccessCode')), version: SCRIPT_VERSION };
}

function ensureTabs_() {
  const ss = SpreadsheetApp.getActive();
  Object.keys(TAB).forEach(k => {
    let sh = ss.getSheetByName(TAB[k]);
    if (!sh) sh = ss.insertSheet(TAB[k]);
    if (sh.getLastRow() === 0) {
      sh.appendRow(SHEETS[k]);
      sh.getRange(1, 1, 1, SHEETS[k].length).setFontWeight('bold');
      sh.setFrozenRows(1);
    }
  });
}

/**
 * Move from the old single "Settings" tab to Installation / Pages / Widgets / Widget settings.
 * Safe to run again: it only fills in what's missing. The old tabs are kept, renamed "Old settings" and "Old destinations".
 */
function migrate_() {
  const ss = SpreadsheetApp.getActive();
  ensureTabs_();
  const old = {};
  const oldSh = ss.getSheetByName('Settings');
  if (oldSh) oldSh.getDataRange().getValues().slice(1).forEach(r => { if (r[0]) old[String(r[0]).trim()] = r[1]; });
  const has = v => v !== undefined && v !== null && String(v).trim() !== '';

  const inst = sheet_('install');
  const have = rows_('install').map(r => String(r.Setting));
  INSTALL.forEach(f => {
    if (have.indexOf(f.k) >= 0) return;
    const v = has(old[f.k]) ? old[f.k] : f.k === 'AccessCode' ? genCode_() : (f.def || '');
    if (f.k === 'AccessCode') PropertiesService.getScriptProperties().setProperty('installedAt', String(Date.now()));
    inst.appendRow([f.k, v, f.hidden ? 'Only change this here. The screen and phone apps need the new code.' : f.help]);
  });

  const props = PropertiesService.getScriptProperties();
  const fresh = sheet_('widgets').getLastRow() < 2;
  if (sheet_('pages').getLastRow() < 2) sheet_('pages').getRange(2, 1, DEFAULT_PAGES.length, 6).setValues(DEFAULT_PAGES);
  if (!fresh && props.getProperty('layoutVer') !== LAYOUT_VER) upgradeLayout_();
  props.setProperty('layoutVer', LAYOUT_VER);
  if (fresh) {
    sheet_('widgets').getRange(2, 1, DEFAULT_WIDGETS.length, 6).setValues(DEFAULT_WIDGETS);
    // Carry over what was in the old Settings and Destinations tabs.
    const carry = [
      ['trains1', 'From', old.TrainFrom], ['trains1', 'To', old.TrainTo],
      ['bins1', 'Postcode', old.BinPostcode], ['bins1', 'House', old.BinAddressMatch],
      ['bins1', 'UPRN', old.BinUPRN], ['bins1', 'ReminderFrom', old.BinReminderFrom],
      ['boys', 'CashInPoints', old.CashInPoints], ['boys', 'CashInValue', old.CashInValue], ['boys', 'PenaltyOptions', old.PenaltyOptions],
    ].filter(r => has(r[2]));
    const dest = ss.getSheetByName('Destinations');
    if (dest && dest.getLastRow() > 1) {
      const lines = dest.getDataRange().getValues().slice(1).filter(r => r[0] && r[1]).map(r => String(r[0]).trim() + ' | ' + String(r[1]).trim());
      if (lines.length) carry.push(['traffic1', 'Destinations', lines.slice(0, 3).join('\n')]);
    }
    if (carry.length) sheet_('wset').getRange(sheet_('wset').getLastRow() + 1, 1, carry.length, 3).setValues(carry.map(r => [r[0], r[1], String(r[2])]));
  }
  if (oldSh && !ss.getSheetByName('Old settings')) oldSh.setName('Old settings');
  const oldDest = ss.getSheetByName('Destinations');
  if (oldDest && !ss.getSheetByName('Old destinations')) oldDest.setName('Old destinations');
  bumpVersions_();
}

/**
 * Version 2 (Nov 2026): Bins becomes half height with a holiday countdown under it, and two new pages,
 * Family and Discover, are added with the new widgets. Anything you already have is left alone.
 */
function upgradeLayout_() {
  const pages = rows_('pages').map(p => String(p.Page).trim());
  const ws = rows_('widgets');
  const ids = ws.map(w => String(w.Widget).trim());
  const bins = ws.find(w => String(w.Widget).trim() === 'bins1');
  if (bins && String(bins.Page).trim() === 'home') {
    setColumn_('widgets', 'Size', r => String(r[0]).trim() === 'bins1' ? 'half' : undefined);
    if (ids.indexOf('countdown1') < 0) {
      setColumn_('widgets', 'Order', r => String(r[1]).trim() === 'home' && Number(r[2]) > Number(bins.Order) ? Number(r[2]) + 1 : undefined);
      sheet_('widgets').appendRow(['countdown1', 'home', Number(bins.Order) + 0.5, 'countdown', 'half', 'Yes']);
    }
  }
  let order = rows_('pages').reduce((m, p) => Math.max(m, Number(p.Order) || 0), 0);
  DEFAULT_PAGES.filter(p => pages.indexOf(p[0]) < 0).forEach(p => sheet_('pages').appendRow([p[0], p[1], p[2], p[3], ++order, p[5]]));
  DEFAULT_WIDGETS.filter(w => (w[1] === 'family' || w[1] === 'discover') && ids.indexOf(w[0]) < 0).forEach(w => sheet_('widgets').appendRow(w));
  // Version 4 (Nov 2026): if Home is still the standard layout, make it eight half-height slots:
  // weather, memo / traffic, trains / today & tomorrow, bins / countdown, (space).
  const home = rows_('widgets').filter(w => String(w.Page).trim() === 'home').map(w => String(w.Widget).trim()).sort().join(',');
  if (home === 'agenda1,bins1,countdown1,traffic1,trains1,weather1') {
    const plan = { weather1: 1, traffic1: 3, trains1: 4, agenda1: 5, bins1: 6, countdown1: 7 };
    setColumn_('widgets', 'Size', r => plan[String(r[0]).trim()] && String(r[1]).trim() === 'home' ? 'half' : undefined);
    setColumn_('widgets', 'Order', r => plan[String(r[0]).trim()] && String(r[1]).trim() === 'home' ? plan[String(r[0]).trim()] : undefined);
    if (rows_('widgets').every(w => String(w.Widget).trim() !== 'memo2')) sheet_('widgets').appendRow(['memo2', 'home', 2, 'memo', 'half', 'Yes']);
    // …and a half-height photo slideshow in the last space, showing the same photos as the one on the Other page.
    if (rows_('widgets').every(w => String(w.Widget).trim() !== 'photos2')) {
      sheet_('widgets').appendRow(['photos2', 'home', 8, 'photos', 'half', 'Yes']);
      const copy = rows_('wset').filter(r => String(r.Widget).trim() === 'photos1').map(r => ['photos2', r.Setting, r.Value]);
      if (copy.length) sheet_('wset').getRange(sheet_('wset').getLastRow() + 1, 1, copy.length, 3).setValues(copy);
    }
  }
  // Kitchen timer: the old standard buttons (1–20 minutes) become 3, 5, 10, 15, 20, 30.
  setColumn_('wset', 'Value', r => String(r[1]).trim() === 'Presets' && String(r[2]).replace(/\s/g, '') === '1,3,5,10,15,20' ? '3,5,10,15,20,30' : undefined);
  // Version 5 (Nov 2026): the word of the day was Spanish by default; this family learns French.
  if (PropertiesService.getScriptProperties().getProperty('layoutVer') !== '5') {
    const words = rows_('widgets').filter(w => String(w.Type).trim() === 'words').map(w => String(w.Widget).trim());
    setColumn_('wset', 'Value', r => words.indexOf(String(r[0]).trim()) >= 0 && String(r[1]).trim() === 'Language' && String(r[2]).trim() === 'Spanish' ? 'French' : undefined);
    const has = rows_('wset').filter(r => String(r.Setting).trim() === 'Language').map(r => String(r.Widget).trim());
    words.filter(id => has.indexOf(id) < 0).forEach(id => sheet_('wset').appendRow([id, 'Language', 'French']));
  }
  // Version 6 (Nov 2026): write every setting that's still on its default into the Sheet, so a later change of
  // default (e.g. the home address and destinations becoming blank for new families) never changes this one.
  if (PropertiesService.getScriptProperties().getProperty('layoutVer') !== '6') {
    const have = {}; rows_('install').forEach(r => { have[String(r.Setting).trim()] = 1; });
    INSTALL.filter(f => !f.hidden && f.def != null && f.def !== '' && !have[f.k]).forEach(f => setInst_(f.k, f.def));
    const got = {}; rows_('wset').forEach(r => { got[String(r.Widget).trim() + '|' + String(r.Setting).trim()] = 1; });
    const add = [];
    rows_('widgets').forEach(w => {
      const T = WIDGET_TYPES[String(w.Type).trim()], id = String(w.Widget).trim();
      if (T) T.settings.forEach(f => { if (f.def != null && f.def !== '' && !got[id + '|' + f.k]) add.push([id, f.k, f.def]); });
    });
    if (add.length) sheet_('wset').getRange(sheet_('wset').getLastRow() + 1, 1, add.length, 3).setValues(add);
  }
  // Version 7 (Nov 2026): automatic updates are the default now. Sheets made before that had them off without anyone
  // choosing it – switch them on, unless a person has turned them off on purpose since (autoUpdateChosen).
  if (PropertiesService.getScriptProperties().getProperty('layoutVer') !== '7' && !autoUpdateOn_() &&
      PropertiesService.getScriptProperties().getProperty('autoUpdateChosen') !== 'off') {
    try { setAutoUpdate_(true); } catch (err) { console.warn('Automatic updates: ' + err.message); }
  }
  renumber_('widgets');
}

/** New code, old Sheet: set up the new tabs automatically on the first request. */
/* ---- A copy of someone else's dashboard Sheet must never show their family.
 * "Make my copy" (and File → Make a copy) copies the tabs – people, lists, notes, settings, keys, access code – but not
 * this script's properties. So: properties empty but the Installation tab has an access code → this is a copy of
 * somebody's dashboard. Wipe every family tab and setting before anything is shown; the setup app then starts afresh.
 * (An existing dashboard already has properties, so it's never touched; it just gets its "home" noted.) */
function freshCopy_() {
  const P = PropertiesService.getScriptProperties(), ss = SpreadsheetApp.getActive(), id = ss.getId();
  const home = P.getProperty('homeSheet');
  if (home === id) return false;
  const mine = P.getKeys().filter(k => !/^(fd|trace:)/.test(k));    // the loader's own notes don't count
  if (!home && mine.length) { P.setProperty('homeSheet', id); return false; }
  let code = ''; try { const sh = ss.getSheetByName(TAB.install); if (sh) code = String(inst_('AccessCode') || ''); } catch (e) { code = ''; }
  if (code || home) wipeFamily_();
  P.setProperty('homeSheet', id);
  return true;
}
/** Empty every family tab and setting (keeps the page layout). Used for copies, and the Sheet menu's "Clear everything". */
function wipeFamily_() {
  const ss = SpreadsheetApp.getActive();
  ['boys', 'tasks', 'ledger', 'todos', 'todoLog', 'timetable', 'lists', 'where', 'memos', 'wset'].forEach(k => {
    const sh = ss.getSheetByName(TAB[k]);
    if (sh && sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, Math.max(1, sh.getLastColumn())).clearContent();
  });
  const cat = ss.getSheetByName(TAB.categories);
  if (cat) { if (cat.getLastRow() > 1) cat.getRange(2, 1, cat.getLastRow() - 1, Math.max(1, cat.getLastColumn())).clearContent(); cat.getRange(2, 1, DEFAULT_CATEGORIES.length, 6).setValues(DEFAULT_CATEGORIES); }
  const inst = ss.getSheetByName(TAB.install);
  if (inst && inst.getLastRow() > 1) inst.getRange(2, 2, inst.getLastRow() - 1, 1).clearContent();   // keys, address, access code, licence…
  ['_move', 'Old settings', 'Old destinations'].forEach(n => { const sh = ss.getSheetByName(n); if (sh) ss.deleteSheet(sh); });
  const P = PropertiesService.getScriptProperties();
  P.getKeys().filter(k => !/^fd/.test(k)).forEach(k => P.deleteProperty(k));   // a fresh start: setup, trial, versions
  try { CacheService.getScriptCache().removeAll(['layout', 'binRegistry']); } catch (e) { /* fine */ }
}
function menuWipe() {
  const ui = SpreadsheetApp.getUi();
  if (ui.alert('Clear everything?', 'This empties every family tab and setting in this Sheet – people, points, lists, notes, keys, address and access code – so it can be set up from scratch. The page layout is kept. It can’t be undone (Google Sheets’ version history can still bring old data back).', ui.ButtonSet.OK_CANCEL) !== ui.Button.OK) return;
  wipeFamily_(); PropertiesService.getScriptProperties().setProperty('homeSheet', SpreadsheetApp.getActive().getId());
  setup();
  ui.alert('Done', 'This Sheet is empty and ready to set up. Open the setup app and choose “First-time setup”.', ui.ButtonSet.OK);
}

function ensureMigrated_() {
  freshCopy_();
  const ss = SpreadsheetApp.getActive();
  const ver = PropertiesService.getScriptProperties().getProperty('layoutVer');
  if (ss.getSheetByName(TAB.widgets) && ss.getSheetByName(TAB.install) && ss.getSheetByName(TAB.memos) && ver === LAYOUT_VER) return;
  withLock_(() => migrate_());
}

/* ------------------------------------------------------------ web entry */

function doGet(e) {
  const p = (e && e.parameter) || {};
  rememberUrl_();
  if (p.spotify === 'login') return spotifyLoginPage_(p.key);
  if (p.state && /^sp_/.test(p.state)) return spotifyCallback_(p);
  if (p.action) {
    return json_(() => {
      ensureMigrated_();
      if (p.action === 'binLookup') return binLookup_(p.postcode);
      if (p.action === 'binCouncil') { const c = councilFor_(p.postcode); return { ok: true, council: c.name, code: c.code, automatic: !!BIN_COUNCILS[c.code], message: BIN_COUNCILS[c.code] ? c.name + ' – connected automatically' : binUnsupported_(c) }; }
      if (p.action === 'ping') return { ok: true, app: 'family-dashboard', version: SCRIPT_VERSION, layout: LAYOUT_VER, autoUpdate: autoUpdateOn_(), loader: LOADED ? LOADED.version : '' };
      if (p.action === 'claim') return withLock_(claim_);
      checkCode_(p.code);
      movedCheck_();
      if (['state', 'widget', 'calendar', 'where'].indexOf(p.action) >= 0) requireLicence_();
      if (p.action === 'state') return getState_();
      if (p.action === 'whose') return { ok: true, people: family_().people.map(x => x.name) };   // the pair page: "the dashboard of Russ, Becky…"
      if (p.action === 'page') return getPage_(p.page, p.refresh === '1', p.v, p);
      if (p.action === 'diagnostics') return diagnostics_(p.app);
      if (p.action === 'widget') return getWidget_(p.id, p.refresh === '1');
      if (p.action === 'layout') { const blocked = screenCheck_(p); return Object.assign({ ok: true }, screenLayout_(), { licence: Object.assign({}, licencePublic_(), blocked ? { screenBlocked: blocked } : {}) }); }
      if (p.action === 'calendar') return getCalendar_(p.start, p.end);
      // For phone automations (iPhone Shortcuts, Android): ...&action=where&person=Ben&place=School  or  &lat=..&lon=..
      if (p.action === 'where') return withLock_(() => setWhere_(p));
      throw new Error('Unknown action');
    });
  }
  return (LOADED ? HtmlService.createHtmlOutput(LOADED.html()) : HtmlService.createHtmlOutputFromFile('Admin'))
    .setTitle('Family Dashboard – Admin')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** The web app's own /exec address, noted on the first visit so the Sheet menu can build the setup link. */
function rememberUrl_() {
  try {
    const u = ScriptApp.getService().getUrl() || '';
    const props = PropertiesService.getScriptProperties();
    if (/\/exec$/.test(u) && props.getProperty('execUrl') !== u) props.setProperty('execUrl', u);
  } catch (err) { /* not important */ }
}

function doPost(e) {
  const q = (e && e.parameter) || {};
  if (q.owntracks) return ownTracks_(e);
  return json_(() => {
    ensureMigrated_();
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    checkCode_(body.code);
    if (body.action !== 'moveDone') movedCheck_();
    return withLock_(() => dispatch_(body));
  });
}

/** Actions shared by the screen (via doPost), the phone apps and the admin page (via api). */
function dispatch_(b) {
  if (LICENCE_FREE.indexOf(b.action) < 0) requireLicence_();
  switch (b.action) {
    case 'complete': return completeTask_(b.boy, b.taskId);
    case 'penalty': return addEntry_(b.boy, 'penalty', '', b.reason || 'Penalty', -Math.abs(Number(b.points)));
    case 'adjust': return addEntry_(b.boy, 'adjust', '', b.reason || 'Adjustment', Number(b.points));
    case 'cashin': return cashIn_(b.boy);
    case 'todo': return setTodo_(b.boy, b.item, !!b.done);
    case 'undo': return deleteEntry_(b.id);
    case 'state': return getState_();
    case 'admin': return getAdmin_();
    case 'licence': return { ok: true, licence: licencePublic_(!!b.recheck) };
    case 'versions': return { ok: true, versions: versionsUsed_(true) };
    case 'startAfresh': return startAfresh_();
    case 'moveDone': return moveDone_(b);
    case 'packForAccount': return packForAccount_(b.email);
    case 'importPack': return importPack_(b.pack);
    case 'setLicence': return setLicence_(b.key);
    case 'releaseLicence': return releaseLicence_();
    case 'screens': return { ok: true, screens: screenList_(), allowed: screensAllowed_() };
    case 'replaceScreen': return replaceScreen_(b);
    case 'forgetScreen': { const r = screensReg_(); delete r[String(b.id)]; screensSave_(r); return { ok: true, screens: screenList_(), allowed: screensAllowed_() }; }
    case 'renameScreen': { const r = screensReg_(); if (r[b.id]) r[b.id].name = String(b.name || '').trim().slice(0, 30) || r[b.id].name; screensSave_(r); return { ok: true, screens: screenList_(), allowed: screensAllowed_() }; }
    case 'saveTask': return saveTask_(b.task);
    case 'deleteTask': return deleteRowById_('tasks', b.id);
    case 'saveList': return saveList_(b.list, b.rows);
    case 'saveBoys': return saveList_('boys', b.rows);
    case 'family': return { ok: true, family: family_(), home: String(inst_('HomeAddress') || '') };
    case 'saveFamily': return saveFamily_(b);
    case 'saveInstall': return saveInstall_(b.values);
    case 'saveWidget': return saveWidget_(b.widget);
    case 'addWidget': return addWidget_(b.page, b.type);
    case 'deleteWidget': return deleteWidget_(b.id);
    case 'moveWidget': return moveWidget_(b.id, Number(b.dir));
    case 'savePage': return savePage_(b.page);
    case 'addPage': return addPage_(b.title);
    case 'deletePage': return deletePage_(b.id);
    case 'movePage': return movePage_(b.id, Number(b.dir));
    case 'listItem': return listItem_(b);
    case 'where': return setWhere_(b);
    case 'memo': return memo_(b);
    case 'spotify': return spotifyControl_(b.op);
    case 'addEvent': return addEvent_(b);
    case 'deleteEvent': return deleteEvent_(b);
    case 'changeCode': return changeCode_(b);
    case 'acceptPrivacy': return acceptPrivacy_(b);
    case 'selfUpdate': return selfUpdate_(b.why || 'app');
    case 'autoUpdate': chosen_(!!b.on); return setAutoUpdate_(!!b.on);
    case 'binTry': return { ok: true, data: traced_('binTry', () => bins_(Object.assign({}, b.settings || {}), '')) };   // "Set up bin days": try before saving
    default: throw new Error('Unknown action: ' + b.action);
  }
}

/** Admin page entry point (google.script.run). */
function api(body) {
  ensureMigrated_();
  checkCode_(body && body.code);
  return withLock_(() => dispatch_(body));
}

/* ---------------------------------------------------------------- state */

function getState_() {
  const now = new Date();
  const today = fmt_(now, 'yyyy-MM-dd');
  const dow = DAYS[Number(fmt_(now, 'u')) % 7];
  const tomorrow = Utilities.formatDate(new Date(Date.parse(today + 'T12:00:00Z') + 86400000), 'UTC', 'yyyy-MM-dd');
  const dowTomorrow = DAYS[(DAYS.indexOf(dow) + 1) % 7];
  const boys = rows_('boys').filter(r => r.Name);
  const tasks = rows_('tasks').filter(t => t.Active !== false && String(t.Active).toUpperCase() !== 'FALSE');
  const ledger = rows_('ledger');
  const todos = rows_('todos');
  const todoLog = rows_('todoLog').filter(r => dateStr_(r.Date) === today);
  const timetable = rows_('timetable');
  const ps = pageSettings_('boys');
  const threshold = Number(ps.CashInPoints) || 500;
  const value = Number(ps.CashInValue) || 5;

  const out = boys.map(b => {
    const mine = ledger.filter(l => l.Boy === b.Name);
    const balance = balance_(mine);
    const doneOnce = new Set(mine.filter(l => l.TaskID).map(l => l.TaskID));
    const doneToday = new Set(mine.filter(l => l.TaskID && dateStr_(l.Timestamp) === today).map(l => l.TaskID));
    const open = tasks
      .filter(t => forBoy_(t.Boy, b.Name))
      .filter(t => {
        const rep = String(t.Repeat || 'once').toLowerCase();
        if (rep === 'always') return true;
        if (rep === 'daily') return !doneToday.has(t.ID);
        return !doneOnce.has(t.ID);
      })
      .sort((a, c) => (Number(a.Order) || 999) - (Number(c.Order) || 999));
    const myTodos = todos
      .filter(t => forBoy_(t.Boy, b.Name) && dayMatches_(t.Days, dow))
      .sort((a, c) => (Number(a.Order) || 999) - (Number(c.Order) || 999))
      .map(t => ({ item: t.Item, done: todoLog.some(l => l.Boy === b.Name && l.Item === t.Item) }));
    const remindersFor = (ds, d) => timetable
      .filter(t => t.Reminder && forBoy_(t.Boy, b.Name) && reminderOn_(t.Day, ds, d))
      .map(t => String(t.Reminder));
    const reminders = remindersFor(today, dow);
    const remindersTomorrow = remindersFor(tomorrow, dowTomorrow);
    // The week ahead, for the "Week" panel on the screen.
    const week = [];
    for (let i = 0; i < 7; i++) {
      const ds = Utilities.formatDate(new Date(Date.parse(today + 'T12:00:00Z') + i * 86400000), 'UTC', 'yyyy-MM-dd');
      const items = remindersFor(ds, DAYS[(DAYS.indexOf(dow) + i) % 7]);
      if (items.length) week.push({ date: ds, items: items });
    }
    const statement = mine.slice(-6).reverse().map(l => ({
      id: l.ID, when: fmt_(new Date(l.Timestamp), 'EEE d MMM HH:mm'),
      type: l.Type, text: l.Description, points: Number(l.Points),
    }));
    return {
      name: b.Name, colour: b.Colour || '#3fa9f5', balance,
      tasks: open.slice(0, 3).map(t => ({ id: t.ID, text: t.Task, points: Number(t.Points) })),
      allTasks: open.slice(0, 40).map(t => ({ id: t.ID, text: t.Task, points: Number(t.Points) })),
      openTaskCount: open.length, todos: myTodos, reminders, remindersTomorrow, reminderWeek: week, statement,
    };
  });
  return {
    boys: out, today, dow, tomorrow,
    cashIn: { points: threshold, value },
    penalties: String(ps.PenaltyOptions || '10,20,50').split(',').map(n => Math.abs(Number(n))).filter(Boolean),
    serverTime: now.toISOString(),
  };
}

/* -------------------------------------------------------------- actions */

function completeTask_(boy, taskId) {
  requireBoy_(boy);
  const t = rows_('tasks').find(r => r.ID === taskId);
  if (!t) throw new Error('Task not found');
  if (!forBoy_(t.Boy, boy)) throw new Error('Task is not for ' + boy);
  return addEntry_(boy, 'task', t.ID, t.Task, Number(t.Points));
}

function cashIn_(boy) {
  requireBoy_(boy);
  const ps = pageSettings_('boys');
  const threshold = Number(ps.CashInPoints) || 500;
  const value = Number(ps.CashInValue) || 5;
  const bal = balance_(rows_('ledger').filter(l => l.Boy === boy));
  if (bal < threshold) throw new Error(boy + ' has ' + bal + ' points – needs ' + threshold);
  return addEntry_(boy, 'cashin', '', 'Cashed in for £' + value, -threshold);
}

/** Points balance, worked through the statement in order and never allowed below 0. */
function balance_(entries) {
  return entries.reduce((s, l) => Math.max(0, s + (Number(l.Points) || 0)), 0);
}

function addEntry_(boy, type, taskId, text, points) {
  requireBoy_(boy);
  if (!isFinite(points) || points === 0) throw new Error('Points must be a non-zero number');
  if (type === 'adjust' || type === 'penalty') {
    checkPoints_('Points', points, LIMITS.maxPoints);
    text = checkLen_('Reason', text, LIMITS.reason) || (points > 0 ? 'Bonus' : 'Penalty');
  }
  if (points < 0 && type !== 'cashin') {
    // Penalties stop at zero: only take off what's there.
    const bal = balance_(rows_('ledger').filter(l => l.Boy === boy));
    if (bal <= 0) throw new Error(boy + ' is already on 0 points');
    if (bal + points < 0) { points = -bal; text = text + ' (stopped at 0)'; }
  }
  const id = newId_();
  sheet_('ledger').appendRow([id, new Date(), boy, type, taskId || '', text, points]);
  return { ok: true, id, state: getState_() };
}

function deleteEntry_(id) {
  deleteRowById_('ledger', id);
  return { ok: true, state: getState_() };
}

function setTodo_(boy, item, done) {
  requireBoy_(boy);
  const today = fmt_(new Date(), 'yyyy-MM-dd');
  const sh = sheet_('todoLog');
  const data = sh.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    if (dateStr_(data[i][0]) === today && data[i][1] === boy && data[i][2] === item) {
      if (!done) sh.deleteRow(i + 1);
      return { ok: true, state: getState_() };
    }
  }
  // Leading apostrophe keeps it as plain text, so the sheet's own time zone can't shift the date.
  if (done) sh.appendRow(["'" + today, boy, item]);
  return { ok: true, state: getState_() };
}

/* ---------------------------------------------------------------- admin */

function getAdmin_() {
  const L = layout_();
  const lists = {};
  L.widgets.filter(w => w.type === 'list' || w.type === 'todo').forEach(w => {
    try { lists[w.id] = w.type === 'todo' ? todo_(w.settings) : listData_(w.settings, w.id); } catch (err) { lists[w.id] = { error: String(err && err.message || err) }; }
  });
  return {
    limits: LIMITS,
    boys: rows_('boys'),
    tasks: rows_('tasks').map(t => Object.assign(t, { Active: !(t.Active === false || String(t.Active).toUpperCase() === 'FALSE') })),
    todos: rows_('todos'),
    timetable: rows_('timetable').map(r => Object.assign(r, { Day: r.Day instanceof Date ? fmt_(r.Day, 'yyyy-MM-dd') : r.Day })),
    ledger: rows_('ledger').slice(-300).reverse().map(l => Object.assign(l, {
      Timestamp: fmt_(new Date(l.Timestamp), 'EEE d MMM yyyy HH:mm'),
    })),
    state: getState_(),
    install: INSTALL.filter(f => !f.hidden).map(f => ({ k: f.k, label: f.label, help: f.help, group: f.group || 'other', uses: f.uses || '', value: String(inst_(f.k)) })),
    licence: licencePublic_(),
    versions: versionsUsed_(false),
    screens: screenList_(), screensAllowed: screensAllowed_(),
    screenSeen: (() => { try { return JSON.parse(PropertiesService.getScriptProperties().getProperty('screenSeen') || 'null'); } catch (e) { return null; } })(),
    licenceServerVersion: licenceServerVersion_(),
    moving: (() => { try { return JSON.parse(PropertiesService.getScriptProperties().getProperty('moving') || 'null'); } catch (e) { return null; } })(),
    pages: L.pages, widgets: L.widgets, lists: lists,
    memos: rows_('memos').map(m => ({ id: String(m.ID), text: String(m.Text), from: String(m.From || ''), added: m.Added instanceof Date ? fmt_(m.Added, 'd MMM HH:mm') : String(m.Added) })),
    whereabouts: L.widgets.filter(w => w.type === 'whereabouts').map(w => ({ id: w.id, data: whereabouts_(w.settings) })),
    family: family_(),
    spotifyConnected: !!PropertiesService.getScriptProperties().getProperty('spotifyRefresh'),
    execUrl: PropertiesService.getScriptProperties().getProperty('execUrl') || ScriptApp.getService().getUrl(),
    scriptVersion: SCRIPT_VERSION, loader: LOADED ? LOADED.info() : null, licenceKey: String(inst_('LicenceKey') || ''), privacyAccepted: String(inst_('PrivacyAccepted') || ''), codeWeak: !!codeProblem_(inst_('AccessCode')),
    appsAddress: String(inst_('AppsAddress') || APPS_DEFAULT),
    autoUpdate: autoUpdateOn_(), lastUpdate: PropertiesService.getScriptProperties().getProperty('lastUpdate') || '',
    setupBase: appsBase_() + 'setup/',
    types: Object.keys(WIDGET_TYPES).map(k => schemaOut_(k, WIDGET_TYPES[k])),
    pageTypes: Object.keys(PAGE_TYPES).map(k => schemaOut_(k, PAGE_TYPES[k])),
  };
}
function schemaOut_(k, T) {
  return { type: k, name: T.name, icon: T.icon || '', about: T.about || '', sizes: T.sizes || [], single: !!T.single,
    settings: T.settings.map(f => Object.assign({}, f)) };
}

function saveTask_(t) {
  if (!t || !String(t.Task || '').trim()) throw new Error('Task needs a description');
  t.Task = checkLen_('Task', t.Task, LIMITS.task);
  const pts = checkPoints_('Points', Number(t.Points), LIMITS.maxPoints);
  if (pts < 0) throw new Error('Task points must be above 0');
  const sh = sheet_('tasks');
  const row = [t.ID || newId_(), t.Boy || 'All', t.Task, pts, t.Repeat || 'once', Number(t.Order) || 999, t.Active !== false];
  if (t.ID) {
    const ids = sh.getRange(2, 1, Math.max(sh.getLastRow() - 1, 1), 1).getValues().map(r => r[0]);
    const i = ids.indexOf(t.ID);
    if (i < 0) throw new Error('Task not found');
    sh.getRange(i + 2, 1, 1, row.length).setValues([row]);
  } else {
    sh.appendRow(row);
  }
  return getAdmin_();
}

/** Replace a whole simple list (todos / timetable / boys) with the rows given. */
function saveList_(list, rows) {
  if (['todos', 'timetable', 'boys'].indexOf(list) < 0) throw new Error('Bad list');
  const head = SHEETS[list];
  const sh = sheet_(list);
  const year = fmt_(new Date(), 'yyyy');
  // Check everything first: nothing in the Sheet changes unless the whole list is valid.
  const RULES = {
    todos: { Item: ['To-do', LIMITS.todo] },
    timetable: { Reminder: ['Reminder', LIMITS.reminder] },
    boys: { Name: ['Name', LIMITS.boyName] },
  }[list] || {};
  (rows || []).forEach(r => Object.keys(RULES).forEach(col => { r[col] = checkLen_(RULES[col][0], r[col], RULES[col][1]); }));
  if (list === 'boys') {
    const names = (rows || []).map(r => r.Name).filter(Boolean);
    if (new Set(names.map(n => n.toLowerCase())).size !== names.length) throw new Error('Two children have the same name');
    if (!names.length) throw new Error('There must be at least one child');
    if (names.length > FAMILY_LIMITS.children) throw new Error('The points page holds up to ' + FAMILY_LIMITS.children + ' children');
  }
  const values = (rows || []).filter(r => r[head[0]] || r[head[1]]).map(r => head.map(h => {
    let v = r[h] === undefined ? '' : r[h];
    // One-off reminder dates are stored as plain text 2026-09-23, so the Sheet can't read 05/09 as 9 May.
    if (list === 'timetable' && h === 'Day') { const one = oneOffDate_(v, year); if (one) v = "'" + one; }
    return v;
  }));
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, head.length).clearContent();
  if (values.length) sh.getRange(2, 1, values.length, head.length).setValues(values);
  return getAdmin_();
}

function deleteRowById_(key, id) {
  const sh = sheet_(key);
  const last = sh.getLastRow();
  if (last < 2) throw new Error('Not found');
  const ids = sh.getRange(2, 1, last - 1, 1).getValues().map(r => r[0]);
  const i = ids.indexOf(id);
  if (i < 0) throw new Error('Not found');
  sh.deleteRow(i + 2);
  return key === 'tasks' ? getAdmin_() : { ok: true };
}

/* -------------------------------------------------------------- helpers */

function sheet_(key) {
  const sh = SpreadsheetApp.getActive().getSheetByName(TAB[key]);
  if (!sh) throw new Error('Missing tab "' + TAB[key] + '" – run setup()');
  return sh;
}

function rows_(key) {
  const sh = sheet_(key);
  const data = sh.getDataRange().getValues();
  const head = data.shift() || [];
  return data.filter(r => r.some(c => c !== '')).map(r => {
    const o = {};
    head.forEach((h, i) => { o[h] = r[i]; });
    return o;
  });
}

/** One installation setting (access code, keys, home address…). */
function inst_(k) {
  const sh = SpreadsheetApp.getActive().getSheetByName(TAB.install);
  if (sh) {
    const r = rows_('install').find(s => String(s.Setting).trim() === k);
    if (r) return r.Value === undefined ? '' : r.Value;
  } else {
    // Not migrated yet: read the old Settings tab.
    const old = SpreadsheetApp.getActive().getSheetByName('Settings');
    if (old) { const hit = old.getDataRange().getValues().find(r => r[0] === k); if (hit) return hit[1]; }
  }
  const f = INSTALL.find(x => x.k === k);
  return f && f.def ? f.def : '';
}
function setInst_(k, v) {
  const sh = sheet_('install');
  const keys = sh.getRange(1, 1, sh.getLastRow(), 1).getValues().map(r => String(r[0]).trim());
  const i = keys.indexOf(k);
  if (i >= 0) sh.getRange(i + 1, 2).setValue(v); else sh.appendRow([k, v, '']);
}

/* ---------------------------------------------------------- access code */
// Rules for a code someone types: 8+ characters, letters and numbers, and at least one special character.
// Codes made by the system are 24 random characters, as nobody needs to type them (they travel in setup links).
const CODE_SPECIALS = '-_.~!*';
function codeProblem_(c) {
  c = String(c == null ? '' : c);
  if (c.length < 8) return 'must be at least 8 characters';
  if (c.length > 64) return 'must be 64 characters or fewer';
  if (/\s/.test(c)) return 'can\u2019t contain spaces';
  if (!/[A-Za-z]/.test(c) || !/[0-9]/.test(c)) return 'must contain letters and numbers';
  if (!/[^A-Za-z0-9]/.test(c)) return 'must contain at least one special character, e.g. ! * - _ . ~';
  return '';
}
function genCode_() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const b = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid() + Utilities.getUuid() + Date.now())
    .map(x => (x + 256) % 256);
  let out = '';
  for (let i = 0; i < 24; i++) out += A[b[i] % A.length];
  const chars = out.split('');
  chars[b[24] % 8 + 2] = CODE_SPECIALS[b[25] % CODE_SPECIALS.length];
  chars[b[26] % 8 + 12] = String(2 + b[27] % 8);
  return chars.join('');
}
/** Admin app: change the access code. Blank = make a strong one. Every device then needs its new link. */
function changeCode_(b) {
  const c = String(b.newCode || '').trim() || genCode_();
  const why = codeProblem_(c);
  if (why) throw new Error('The access code ' + why);
  setInst_('AccessCode', c);
  return { ok: true, code: c };
}
function acceptPrivacy_(b) {
  const v = String(b.version || '').trim();
  if (!/^[\w.-]{1,20}$/.test(v)) throw new Error('Missing privacy notice version');
  setInst_('PrivacyAccepted', v);
  setInst_('PrivacyAcceptedOn', fmt_(new Date(), 'd MMM yyyy HH:mm') + (b.who ? ' \u2013 ' + String(b.who).slice(0, 30) : ''));
  return { ok: true, privacyAccepted: v };
}

function checkCode_(code) {
  const real = String(inst_('AccessCode') || '');
  if (!real || String(code || '') !== real) throw new Error('Wrong access code');
}

function requireBoy_(boy) {
  if (!rows_('boys').some(b => b.Name === boy)) throw new Error('Unknown child: ' + boy);
}

function forBoy_(cell, boy) {
  const v = String(cell || 'All').trim();
  if (!v || v.toLowerCase() === 'all') return true;
  return v.split(',').map(s => s.trim()).indexOf(boy) >= 0;
}

/**
 * Reminder "Day" can be a weekday rule (Tue, Mon-Fri, Mon,Wed, Daily…) or a one-off date:
 * 23/09/2026, 23/09, 2026-09-23, 23 Sep, 23rd September 2026 (a date with no year means this year).
 */
function reminderOn_(spec, ds, dow) {
  const one = oneOffDate_(spec, ds.slice(0, 4));
  return one ? one === ds : dayMatches_(spec, dow);
}
function oneOffDate_(spec, year) {
  if (spec instanceof Date) return fmt_(spec, 'yyyy-MM-dd');
  const s = String(spec || '').trim().toLowerCase();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return m[1] + '-' + pad2_(m[2]) + '-' + pad2_(m[3]);
  m = s.match(/^(\d{1,2})[\/.](\d{1,2})(?:[\/.](\d{2,4}))?$/);
  if (m) return fullYear_(m[3], year) + '-' + pad2_(m[2]) + '-' + pad2_(m[1]);
  m = s.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?(?:\s+(\d{2,4}))?$/);
  if (m) return fullYear_(m[3], year) + '-' + pad2_(['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(m[2]) + 1) + '-' + pad2_(m[1]);
  return null;
}
function pad2_(n) { n = String(Number(n)); return n.length < 2 ? '0' + n : n; }
function fullYear_(y, fallback) { if (!y) return fallback; return y.length === 2 ? '20' + y : y; }

/** "Mon-Fri", "Mon,Wed", "Daily"/"All"/blank, "Weekends". */
function dayMatches_(spec, dow) {
  const s = String(spec || '').trim().toLowerCase();
  if (!s || s === 'all' || s === 'daily' || s === 'every day') return true;
  if (s === 'weekdays') return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].indexOf(dow) >= 0;
  if (s === 'weekends') return dow === 'Sat' || dow === 'Sun';
  const order = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const d = dow.toLowerCase();
  return s.split(',').some(part => {
    const p = part.trim().slice(0, 7);
    if (p.indexOf('-') > 0) {
      const [a, b] = p.split('-').map(x => order.indexOf(x.trim().slice(0, 3)));
      const i = order.indexOf(d);
      return a >= 0 && b >= 0 && (a <= b ? i >= a && i <= b : i >= a || i <= b);
    }
    return p.slice(0, 3) === d;
  });
}

function dateStr_(v) {
  if (v instanceof Date) return fmt_(v, 'yyyy-MM-dd');
  const s = String(v || '').replace(/^'/, '');
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  return isNaN(d) ? s : fmt_(d, 'yyyy-MM-dd');
}

function fmt_(d, pattern) { return Utilities.formatDate(d, TZ, pattern); }
function newId_() { return Utilities.getUuid().slice(0, 8); }
function yes_(v, def) {
  if (v === '' || v === null || v === undefined) return !!def;
  if (typeof v === 'boolean') return v;
  return /^(y|yes|true|1|on)$/i.test(String(v).trim());
}
function hash_(s) { s = String(s); let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function json_(fn) {
  let out;
  try { out = fn(); } catch (err) { out = { ok: false, error: String(err && err.message || err) }; if (err && err.moved) out.moved = err.moved; else logError_(out.error); }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

/* ===================================================== LAYOUT & SETTINGS */

/** All rows of "Widget settings" as { widgetOrPageId: { Setting: Value } }. */
function wsetAll_() {
  const out = {};
  rows_('wset').forEach(r => {
    const id = String(r.Widget || '').trim(), k = String(r.Setting || '').trim();
    if (id && k) (out[id] = out[id] || {})[k] = r.Value;
  });
  return out;
}
/** Settings for one widget or page, with defaults filled in and the right types. */
function settingsFor_(owner, schema, all) {
  const raw = (all || wsetAll_())[owner] || {};
  const o = {};
  schema.forEach(f => {
    const v = raw[f.k];
    const missing = v === undefined || (String(v).trim() === '' && f.type !== 'text' && f.type !== 'url');
    o[f.k] = coerce_(f, missing ? f.def : v);
  });
  return o;
}
function coerce_(f, v) {
  if (f.type === 'number') { const n = Number(v); return isFinite(n) ? n : f.def; }
  if (f.type === 'bool') return yes_(v, f.def);
  if (v instanceof Date) return f.type === 'time' ? fmt_(v, 'HH:mm') : fmt_(v, 'yyyy-MM-dd');
  return v === undefined || v === null ? '' : String(v);
}
function pageSettings_(pageType) {
  const p = rows_('pages').find(r => String(r.Type).toLowerCase() === pageType);
  return settingsFor_(p ? String(p.Page).trim() : pageType, PAGE_TYPES[pageType].settings);
}
function setWset_(owner, k, v) {
  const sh = sheet_('wset');
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === owner && String(data[i][1]).trim() === k) { sh.getRange(i + 1, 3).setValue(v); return; }
  }
  sh.appendRow([owner, k, v]);
}
function bumpVersions_() {
  const p = PropertiesService.getScriptProperties();
  p.setProperty('dataVer', String(Date.now()));
  p.setProperty('calVer', String(Date.now()));
}
function dataVer_() { return PropertiesService.getScriptProperties().getProperty('dataVer') || '0'; }

/** Pages (in order) and the widgets on them, with settings. Shared with the screen and the admin apps. */
/*
 * "When to show" (any widget, from Family Admin → Screen → the widget): show it only on some days and between two
 * times; at other times the screen shows another kind of widget in the same space (using the settings of the first
 * widget of that kind, so it needn't be set up twice), or leaves the space empty.
 */
const WHEN_DAYS = { 'Every day': [1, 2, 3, 4, 5, 6, 7], 'Monday to Friday': [1, 2, 3, 4, 5], 'Monday to Thursday': [1, 2, 3, 4], 'Weekends': [6, 7] };
function whenSettings_() {
  return [
    { k: 'ShowDays', label: 'Show on', type: 'select', def: 'Every day', options: Object.keys(WHEN_DAYS) },
    { k: 'ShowFrom', label: 'From', type: 'time', def: '00:00' },
    { k: 'ShowUntil', label: 'Until', type: 'time', def: '24:00' },
    { k: 'OtherTimes', label: 'At other times show', type: 'select', def: '', options: [''].concat(Object.keys(WIDGET_TYPES)) },
  ];
}
function whenLimited_(W) { return !!W && (W.ShowDays !== 'Every day' || W.ShowFrom !== '00:00' || W.ShowUntil !== '24:00'); }
function whenShowing_(W, now) {
  if (!whenLimited_(W)) return true;
  now = now || new Date();
  const day = Number(fmt_(now, 'u')), hm = fmt_(now, 'HH:mm');
  return (WHEN_DAYS[W.ShowDays] || WHEN_DAYS['Every day']).indexOf(day) >= 0 && hm >= W.ShowFrom && hm < W.ShowUntil;
}
/** What fills a widget's space when it's outside its times: another kind of widget, or nothing. */
function whenAlt_(w, widgets) {
  const t = w.when && w.when.OtherTimes, T = WIDGET_TYPES[t];
  if (!T || t === w.type) return null;
  const src = widgets.find(x => x.type === t && !x.alt);
  return { id: w.id + '~alt', page: w.page, order: w.order, type: t, size: T.sizes.indexOf(w.size) >= 0 ? w.size : T.sizes[0], show: true,
    settings: src ? src.settings : settingsFor_('', T.settings, {}), alt: true, src: src ? src.id : '' };
}
/** The layout as the screen sees it right now: widgets outside their times swapped or left out. */
function screenLayout_() {
  const L = layout_(), now = new Date();
  L.widgets = L.widgets.map(w => !w.show || whenShowing_(w.when, now) ? w : whenAlt_(w, L.widgets)).filter(Boolean);
  L.version = hash_(JSON.stringify([L.pages, L.widgets]));
  return L;
}

function layout_() {
  const all = wsetAll_();
  const pages = rows_('pages').filter(p => String(p.Page || '').trim() && PAGE_TYPES[String(p.Type || 'widgets').toLowerCase()])
    .map(p => {
      const type = String(p.Type || 'widgets').toLowerCase(), id = String(p.Page).trim();
      const o = { id: id, title: String(p.Title || id), type: type, icon: String(p.Icon || '\u25C8'), order: Number(p.Order) || 99,
        show: yes_(p.Show, true), settings: settingsFor_(id, PAGE_TYPES[type].settings, all) };
      if (type === 'boys') o.children = Math.min(rows_('boys').filter(r => String(r.Name || '').trim()).length, FAMILY_LIMITS.children);   // 4–6 → split over two screens
      return o;
    }).sort((a, b) => a.order - b.order);
  const pageOrder = {}; pages.forEach((p, i) => { pageOrder[p.id] = i; });
  const widgets = rows_('widgets').filter(w => String(w.Widget || '').trim() && WIDGET_TYPES[String(w.Type || '').trim()])
    .map(w => {
      const type = String(w.Type).trim(), T = WIDGET_TYPES[type], id = String(w.Widget).trim();
      const size = String(w.Size || '').trim().toLowerCase();
      const when = settingsFor_(id, whenSettings_(), all);
      return { id: id, page: String(w.Page || '').trim(), order: Number(w.Order) || 99, type: type,
        size: T.sizes.indexOf(size) >= 0 ? size : T.sizes[0], show: yes_(w.Show, true),
        settings: settingsFor_(id, T.settings, all), when: whenLimited_(when) ? when : null };
    }).sort((a, b) => ((pageOrder[a.page] || 0) - (pageOrder[b.page] || 0)) || (a.order - b.order));
  return { pages: pages, widgets: widgets, tomtomKey: String(inst_('TomTomKey') || ''), columns: LIMITS.columns,
    version: hash_(JSON.stringify([pages, widgets])), scriptVersion: SCRIPT_VERSION,
    privacyAccepted: String(inst_('PrivacyAccepted') || ''), codeWeak: !!codeProblem_(inst_('AccessCode')),
    appsAddress: String(inst_('AppsAddress') || APPS_DEFAULT), autoUpdate: autoUpdateOn_(), sleep: sleepSettings_() };
}

/** Everything a widget page needs: the layout plus the data for each widget on that page. */
function getPage_(pageId, force, screenVer, p) {
  if (screenVer) seen_('screenSeen', screenVer);
  const blocked = screenCheck_(p || {});
  const L = Object.assign({}, screenLayout_(), { licence: Object.assign({}, licencePublic_(), blocked ? { screenBlocked: blocked } : {}) });
  const page = L.pages.find(p => p.id === pageId) || L.pages.find(p => p.type === 'widgets' && p.show);
  const data = {};
  if (page && page.type === 'widgets' && L.licence.ok && !blocked) {      // no licence: the screen shows how to add one instead
    L.widgets.filter(w => w.page === page.id && w.show).forEach(w => { data[w.id] = widgetData_(w, force); });
  }
  return { ok: true, layout: L, page: page ? page.id : '', data: data, serverTime: new Date().toISOString() };
}
function getWidget_(id, force) {
  const all = layout_().widgets;
  let w = all.find(x => x.id === id);
  if (!w && /~alt$/.test(id)) { const base = all.find(x => x.id === id.replace(/~alt$/, '')); w = base && whenAlt_(base, all); }
  if (!w) throw new Error('No widget called ' + id);
  return { ok: true, id: id, data: widgetData_(w, force) };
}
function widgetData_(w, force) {
  const T = WIDGET_TYPES[w.type];
  if (!T.data) return null;
  if (T.nocache) { try { return traced_(w.id, () => T.data(w.settings, w.id)); } catch (err) { return { error: String(err && err.message || err) }; } }
  // Widgets that read the calendar start again whenever the calendar is changed from the dashboard.
  const key = 'w:' + dataVer_() + ':' + (T.calendar ? calVersion_() + ':' : '') + w.id + ':' + hash_(JSON.stringify(w.settings));
  return cached_(CacheService.getScriptCache(), key, T.ttl || 600, force, () => traced_(w.id, () => T.data(w.settings, w.id)));
}

/* ------------------------------------------------------ saving settings */

/** Check one value against its setting definition; returns the value to store. */
function cleanSetting_(f, v) {
  let s = String(v == null ? '' : v).trim();
  const what = '\u201c' + f.label + '\u201d';
  if (f.type === 'number') {
    if (s === '') return '';
    const n = Number(s);
    if (!isFinite(n) || Math.round(n) !== n) throw new Error(what + ' must be a whole number');
    if ((f.min != null && n < f.min) || (f.max != null && n > f.max)) throw new Error(what + ' must be between ' + f.min + ' and ' + f.max);
    return n;
  }
  if (f.type === 'bool') return yes_(v, f.def) ? 'Yes' : 'No';
  if (f.type === 'select') { if (s && f.options.indexOf(s) < 0) throw new Error(what + ': pick one of ' + f.options.join(', ')); return s; }
  if (f.type === 'time') {
    if (!/^\d{1,2}:\d{2}$/.test(s)) throw new Error(what + ' must look like 15:00');
    return "'" + pad2_(s.split(':')[0]) + ':' + s.split(':')[1];
  }
  if (f.type === 'crs') { s = s.toUpperCase(); if (!/^[A-Z]{3}$/.test(s)) throw new Error(what + ' must be a three-letter station code, e.g. BPW'); return s; }
  if (f.type === 'url') { if (s && !/^(https|webcal):\/\/\S+$/i.test(s)) throw new Error(what + ' must be a web link starting https://'); return s.replace(/^webcal:/i, 'https:'); }
  if (f.type === 'lines') {
    const lines = s.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
    if (f.maxLines && lines.length > f.maxLines) throw new Error(what + ': at most ' + f.maxLines + ' lines fit on the screen');
    return lines.join('\n');
  }
  if (f.max && s.length > f.max) throw new Error(what + ' is ' + s.length + ' characters \u2013 the most is ' + f.max);
  return s;
}

/** Extra checks for particular widgets. */
function checkWidget_(type, s) {
  if (type === 'bins') {
    const src = String(s.Source || BIN_SOURCES[0]);
    if (src === BIN_SOURCES[0] && (String(s.Council || '').trim() || String(s.Postcode || '').trim())) {
      const code = String(s.Council || '').trim() || councilFor_(s.Postcode).code;
      if (!BIN_COUNCILS[code]) throw new Error(binUnsupported_({ name: (binRegistry_()[code] || {}).name || 'Your council' }));
    }
    if (src === 'Calendar link' && !/^(https?|webcal):\/\//i.test(String(s.CalendarLink || '').trim())) throw new Error('Paste your council\u2019s calendar link (it starts https:// or webcal://)');
    if (src === 'Repeating schedule') binSchedule_(s.Schedule);   // throws if a line can't be read
  }
  if (type === 'traffic') {
    String(s.Destinations || '').split('\n').filter(Boolean).forEach(line => {
      const p = line.split('|');
      if (p.length < 2 || !p[0].trim() || !p[1].trim()) throw new Error('Each destination needs "Label | address", e.g. "School | BS1 4DJ"');
      checkLen_('Destination label', p[0], LIMITS.destination);
    });
  }
  if (type === 'clock') {
    String(s.Zones || '').split('\n').filter(Boolean).forEach(line => {
      const p = line.split('|');
      if (p.length < 2 || !/^[A-Za-z_]+\/[A-Za-z_\/+-]+$|^UTC$/.test(p[1].trim())) throw new Error('Each place needs "Name | time zone", e.g. "Orlando | America/New_York"');
      checkLen_('Place name', p[0], 12);
    });
  }
  if (type === 'timer') {
    const n = String(s.Presets || '').split(',').map(x => Number(x.trim())).filter(x => x);
    if (!n.length || n.length > 6 || !n.every(x => x > 0 && x <= 180)) throw new Error('Quick buttons: up to 6 numbers of minutes (1 to 180), e.g. 1,3,5,10');
  }
  if (type === 'boys') {
    const n = String(s.PenaltyOptions || '').split(',').map(x => Number(x.trim()));
    if (!n.every(x => x > 0 && x <= LIMITS.maxPoints && Math.round(x) === x)) throw new Error('Penalties must be whole numbers up to ' + LIMITS.maxPoints + ', separated by commas, e.g. 10,20,50');
    if (n.length > LIMITS.maxPenaltyButtons) throw new Error('At most ' + LIMITS.maxPenaltyButtons + ' penalty buttons fit on the screen');
  }
  if (type === 'whereabouts') {
    const ppl = people_(s.People), pl = places_(s.Places);
    if (!ppl.length) throw new Error('Add at least one person to the clock');
    if (pl.length < 2) throw new Error('Add at least two places to the clock');
    ppl.forEach(x => { checkLen_('Name', x.name, 10); if (!/^#[0-9a-f]{6}$/i.test(x.colour)) throw new Error('Colour for ' + x.name + ' must look like #3fa9f5'); });
    pl.forEach(x => checkLen_('Place', x.name, 12));
  }
  if (type === 'countdown') {
    String(s.Extra || '').split('\n').filter(Boolean).forEach(line => {
      const p = line.split('|');
      if (p.length < 2 || !oneOffDate_(p[1].trim(), '2026')) throw new Error('Each date needs "Name | date", e.g. "Orlando | 3/4/2027"');
      checkLen_('Countdown name', p[0], 20);
    });
  }
  if (type === 'photos') {
    if (s.Source === 'Google Drive folder' && s.DriveFolder && !/folders\/[\w-]{10,}|^[\w-]{20,}$/.test(s.DriveFolder)) throw new Error('That doesn\u2019t look like a Google Drive folder link');
    if (s.Source === 'Google Photos shared album' && s.AlbumLink && !/^https:\/\/(photos\.app\.goo\.gl|photos\.google\.com)\//.test(s.AlbumLink)) throw new Error('That doesn\u2019t look like a Google Photos album link (photos.app.goo.gl/\u2026)');
  }
}

/** Admin: save one widget's place, size and settings. Only settings sent are changed. */
function saveWidget_(w) {
  if (!w || !w.id) throw new Error('Nothing to save');
  const sh = sheet_('widgets');
  const data = sh.getDataRange().getValues();
  const head = data[0].map(String);
  const r = data.findIndex((row, i) => i > 0 && String(row[0]).trim() === w.id);
  if (r < 0) throw new Error('Widget not found');
  const type = String(data[r][head.indexOf('Type')]).trim(), T = WIDGET_TYPES[type];
  if (w.page !== undefined) {
    const p = rows_('pages').find(x => String(x.Page).trim() === w.page);
    if (!p || String(p.Type).toLowerCase() !== 'widgets') throw new Error('Widgets can only go on widget pages');
  }
  if (w.size !== undefined && T.sizes.indexOf(w.size) < 0) throw new Error(T.name + ' can be ' + T.sizes.join(' or ') + ' height');
  // Check every setting before writing anything.
  const current = settingsFor_(w.id, T.settings);
  const out = {}, merged = Object.assign({}, current);
  Object.keys(w.settings || {}).forEach(k => {
    const f = T.settings.find(x => x.k === k);
    if (!f) return;
    out[k] = cleanSetting_(f, w.settings[k]);
    merged[k] = coerce_(f, String(out[k]).replace(/^'/, ''));
  });
  checkWidget_(type, merged);
  // "When to show"
  const whenOut = {};
  if (w.when) {
    const defs = whenSettings_(), cur = settingsFor_(w.id, defs), next = Object.assign({}, cur);
    Object.keys(w.when).forEach(k => { const f = defs.find(x => x.k === k); if (!f) return; whenOut[k] = cleanSetting_(f, w.when[k]); next[k] = coerce_(f, String(whenOut[k]).replace(/^'/, '')); });
    if (next.ShowFrom >= next.ShowUntil) throw new Error('“Until” has to be later than “From”');
    if (next.OtherTimes === type) throw new Error('Pick a different kind of widget for other times');
  }
  if (type === 'bins' && (merged.Postcode !== current.Postcode || merged.House !== current.House) && !('UPRN' in (w.settings || {}) && w.settings.UPRN !== current.UPRN)) out.UPRN = '';
  if (w.page !== undefined && w.page !== String(data[r][head.indexOf('Page')]).trim()) {
    sh.getRange(r + 1, head.indexOf('Page') + 1).setValue(w.page);
    sh.getRange(r + 1, head.indexOf('Order') + 1).setValue(99);   // goes to the end of its new page
  }
  if (w.size !== undefined) sh.getRange(r + 1, head.indexOf('Size') + 1).setValue(w.size);
  if (w.show !== undefined) sh.getRange(r + 1, head.indexOf('Show') + 1).setValue(w.show ? 'Yes' : 'No');
  Object.keys(out).forEach(k => setWset_(w.id, k, out[k]));
  Object.keys(whenOut).forEach(k => setWset_(w.id, k, whenOut[k]));
  renumber_('widgets');
  bumpVersions_();
  return getAdmin_();
}

function addWidget_(pageId, type) {
  const T = WIDGET_TYPES[type];
  if (!T) throw new Error('Unknown widget');
  const p = rows_('pages').find(x => String(x.Page).trim() === pageId);
  if (!p || String(p.Type).toLowerCase() !== 'widgets') throw new Error('Pick a widget page');
  const ids = rows_('widgets').map(w => String(w.Widget).trim());
  let n = 1; while (ids.indexOf(type + n) >= 0) n++;
  sheet_('widgets').appendRow([type + n, pageId, 999, type, T.sizes[0], 'Yes']);
  renumber_('widgets');
  bumpVersions_();
  return getAdmin_();
}

function deleteWidget_(id) {
  deleteWhere_('widgets', r => String(r[0]).trim() === id);
  deleteWhere_('wset', r => String(r[0]).trim() === id);
  bumpVersions_();
  return getAdmin_();
}

function moveWidget_(id, dir) {
  const ws = rows_('widgets');
  const me = ws.find(w => String(w.Widget).trim() === id);
  if (!me) throw new Error('Widget not found');
  const same = ws.filter(w => String(w.Page).trim() === String(me.Page).trim()).sort((a, b) => (Number(a.Order) || 99) - (Number(b.Order) || 99));
  const i = same.indexOf(me), j = i + (dir < 0 ? -1 : 1);
  if (j >= 0 && j < same.length) { const t = same[i]; same[i] = same[j]; same[j] = t; }
  const order = {}; same.forEach((w, k) => { order[String(w.Widget).trim()] = k + 1; });
  setColumn_('widgets', 'Order', r => order[String(r[0]).trim()]);
  bumpVersions_();
  return getAdmin_();
}

function savePage_(p) {
  if (!p || !p.id) throw new Error('Nothing to save');
  const row = rows_('pages').find(x => String(x.Page).trim() === p.id);
  if (!row) throw new Error('Page not found');
  const type = String(row.Type).toLowerCase(), PT = PAGE_TYPES[type];
  const updates = {};
  if (p.title !== undefined) { const t = checkLen_('Page name', p.title, LIMITS.pageTitle); if (!t) throw new Error('Give the page a name'); updates.Title = t; }
  if (p.icon !== undefined) updates.Icon = String(p.icon).slice(0, 2) || '\u25C8';
  if (p.show !== undefined) updates.Show = p.show ? 'Yes' : 'No';
  if (updates.Show === 'No' && rows_('pages').filter(x => yes_(x.Show, true) && String(x.Page).trim() !== p.id).length === 0) throw new Error('At least one page must show');
  const out = {}, merged = settingsFor_(p.id, PT.settings);
  Object.keys(p.settings || {}).forEach(k => {
    const f = PT.settings.find(x => x.k === k); if (!f) return;
    out[k] = cleanSetting_(f, p.settings[k]); merged[k] = coerce_(f, out[k]);
  });
  checkWidget_(type, merged);
  Object.keys(updates).forEach(col => setColumn_('pages', col, r => String(r[0]).trim() === p.id ? updates[col] : undefined));
  Object.keys(out).forEach(k => setWset_(p.id, k, out[k]));
  bumpVersions_();
  return getAdmin_();
}

function addPage_(title) {
  const t = checkLen_('Page name', title, LIMITS.pageTitle);
  if (!t) throw new Error('Give the page a name');
  const pages = rows_('pages');
  if (pages.length >= 8) throw new Error('At most 8 pages fit down the side of the screen');
  let id = t.toLowerCase().replace(/[^a-z0-9]+/g, '') || 'page', n = '';
  while (pages.some(p => String(p.Page).trim() === id + n)) n = (Number(n) || 1) + 1;
  const used = pages.map(p => String(p.Icon));
  const icon = PAGE_ICONS.find(i => used.indexOf(i) < 0) || '\u25C8';
  sheet_('pages').appendRow([id + n, t, 'widgets', icon, pages.length + 1, 'Yes']);
  bumpVersions_();
  return getAdmin_();
}

function deletePage_(id) {
  const row = rows_('pages').find(x => String(x.Page).trim() === id);
  if (!row) throw new Error('Page not found');
  if (String(row.Type).toLowerCase() !== 'widgets') throw new Error('The ' + row.Title + ' page can be hidden but not deleted');
  if (rows_('widgets').some(w => String(w.Page).trim() === id)) throw new Error('Move or remove the widgets on this page first');
  if (rows_('pages').filter(p => String(p.Type).toLowerCase() === 'widgets').length < 2) throw new Error('Keep at least one widget page');
  deleteWhere_('pages', r => String(r[0]).trim() === id);
  deleteWhere_('wset', r => String(r[0]).trim() === id);
  renumber_('pages');
  bumpVersions_();
  return getAdmin_();
}

function movePage_(id, dir) {
  const ps = rows_('pages').sort((a, b) => (Number(a.Order) || 99) - (Number(b.Order) || 99));
  const i = ps.findIndex(p => String(p.Page).trim() === id), j = i + (dir < 0 ? -1 : 1);
  if (i < 0) throw new Error('Page not found');
  if (j >= 0 && j < ps.length) { const t = ps[i]; ps[i] = ps[j]; ps[j] = t; }
  const order = {}; ps.forEach((p, k) => { order[String(p.Page).trim()] = k + 1; });
  setColumn_('pages', 'Order', r => order[String(r[0]).trim()]);
  bumpVersions_();
  return getAdmin_();
}

function saveInstall_(values) {
  if (!values || typeof values !== 'object') throw new Error('Nothing to save');
  Object.keys(values).forEach(k => {
    if (k === 'AccessCode') throw new Error('The access code can only be changed in the Sheet');
    const f = INSTALL.find(x => x.k === k);
    if (!f || f.hidden) return;
    const v = String(values[k] == null ? '' : values[k]).trim();
    if (k === 'HomeAddress' && !v) throw new Error('The home address can\u2019t be blank');
    if (v.length > 200) throw new Error(f.label + ' is too long');
    if (v !== String(inst_(k))) setInst_(k, v);
  });
  bumpVersions_();
  return getAdmin_();
}

/** Tidy the Order column of pages/widgets to 1, 2, 3… (per page for widgets). */
function renumber_(key) {
  const rs = rows_(key);
  const group = r => key === 'widgets' ? String(r.Page).trim() : '';
  const order = {};
  const groups = {};
  rs.forEach(r => { (groups[group(r)] = groups[group(r)] || []).push(r); });
  Object.keys(groups).forEach(g => groups[g].sort((a, b) => (Number(a.Order) || 99) - (Number(b.Order) || 99))
    .forEach((r, i) => { order[String(r[SHEETS[key][0]]).trim()] = i + 1; }));
  setColumn_(key, 'Order', r => order[String(r[0]).trim()]);
}
function setColumn_(key, col, fn) {
  const sh = sheet_(key);
  const data = sh.getDataRange().getValues();
  const c = data[0].map(String).indexOf(col);
  if (c < 0 || data.length < 2) return;
  const vals = data.slice(1).map(r => { const v = fn(r); return [v === undefined ? r[c] : v]; });
  sh.getRange(2, c + 1, vals.length, 1).setValues(vals);
}
function deleteWhere_(key, test) {
  const sh = sheet_(key);
  const data = sh.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) if (test(data[i])) sh.deleteRow(i + 1);
}

/* ============================================================ WIDGET DATA */

/* ---- What we asked other services, for the diagnostics report when something doesn't work.
 * Every web request goes through uf_(): the last few in this run are kept in memory. When a widget (or "Set up bin
 * days") fails, its requests and the start of each answer are saved (one small note per widget, replaced each time),
 * and go into the LOCKED part of a diagnostics report – they can contain addresses or property numbers. Keys in web
 * addresses are blanked out. A widget that works again has its note deleted. */
const NET_ = [];
function uf_(url, opts) {
  const t0 = Date.now(), o = opts || {}, rec = { at: new Date().toISOString(), method: String(o.method || 'get').toUpperCase(),
    url: String(url).replace(/([?&](?:key|api_key|apikey|app_key|app_id|token|access_token|client_secret|code)=)[^&]+/gi, '$1***') };
  if (o.payload) rec.sent = String(typeof o.payload === 'string' ? o.payload : JSON.stringify(o.payload)).slice(0, 600).replace(/("?(?:TokenValue|key|token|password)"?\s*[:=>]\s*"?)[^"<,&]+/gi, '$1***');
  try {
    const r = UrlFetchApp.fetch(url, opts);
    rec.status = r.getResponseCode(); rec.ms = Date.now() - t0;
    try { rec.body = String(r.getContentText()).slice(0, 1500); } catch (e) { rec.body = '(not text)'; }
    NET_.push(rec); if (NET_.length > 12) NET_.shift();
    return r;
  } catch (err) {
    rec.error = String(err && err.message || err); rec.ms = Date.now() - t0;
    NET_.push(rec); if (NET_.length > 12) NET_.shift();
    throw err;
  }
}
/** Run fn for one widget; if it fails, keep a note of what it asked and what came back. */
function traced_(id, fn) {
  const n = NET_.length, P = PropertiesService.getScriptProperties();
  try {
    const v = fn();
    if (P.getProperty('trace:' + id)) P.deleteProperty('trace:' + id);   // working again
    return v;
  } catch (err) {
    try {
      const calls = NET_.slice(n).slice(-4);
      let note = { at: new Date().toISOString(), error: String(err && err.message || err), calls: calls };
      let txt = JSON.stringify(note);
      while (txt.length > 8500 && note.calls.some(c => c.body && c.body.length > 100)) {   // a Script property holds up to 9 KB
        note.calls.forEach(c => { if (c.body) c.body = c.body.slice(0, Math.floor(c.body.length / 2)) + '…'; });
        txt = JSON.stringify(note);
      }
      if (txt.length <= 8500) P.setProperty('trace:' + id, txt);
    } catch (e) { /* the note is a nice-to-have */ }
    throw err;
  }
}
/** Run fn, cache its JSON for ttl seconds; on failure return {error}. */
function cached_(cache, key, ttl, force, fn) {
  if (!force) {
    const hit = cache.get(key);
    if (hit) return JSON.parse(hit);
  }
  try {
    const v = fn();
    const s = JSON.stringify(v);
    if (s.length < 95000) cache.put(key, s, ttl);   // the cache holds up to 100KB per item
    return v;
  } catch (err) {
    return { error: String(err && err.message || err) };
  }
}

/** "51.62,-2.47" or any address/postcode → {lat,lng}. Cached for 6 hours. */
function geocode_(place) {
  if (!String(place || '').trim()) throw new Error('Add your home address in Family Admin → Settings → Home & calendar');
  const m = String(place).match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (m) return { lat: Number(m[1]), lng: Number(m[2]) };
  const cache = CacheService.getScriptCache();
  const key = 'geo:' + String(place).slice(0, 200);
  const hit = cache.get(key);
  if (hit) return JSON.parse(hit);
  const res = Maps.newGeocoder().setRegion('uk').geocode(place);
  if (!res.results || !res.results.length) throw new Error('Could not find "' + place + '" on the map');
  const loc = res.results[0].geometry.location;
  const out = { lat: loc.lat, lng: loc.lng };
  cache.put(key, JSON.stringify(out), 6 * 3600);
  return out;
}

function weather_(place) {
  const g = geocode_(place);
  const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + g.lat + '&longitude=' + g.lng +
    '&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,is_day' +
    '&hourly=temperature_2m,precipitation_probability,weather_code,is_day' +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset' +
    '&timezone=Europe%2FLondon&forecast_days=5&wind_speed_unit=mph';
  const d = JSON.parse(uf_(url).getContentText());
  const nowHour = fmt_(new Date(), "yyyy-MM-dd'T'HH:00");
  let i0 = d.hourly.time.indexOf(nowHour);
  if (i0 < 0) i0 = 0;
  const hours = [];
  for (let i = i0 + 1; i < Math.min(i0 + 13, d.hourly.time.length); i++) {   // the next 12 hours (half-height weather shows every 2nd)
    hours.push({ time: d.hourly.time[i].slice(11, 16), temp: Math.round(d.hourly.temperature_2m[i]),
      rain: d.hourly.precipitation_probability[i], code: d.hourly.weather_code[i], isDay: d.hourly.is_day[i] === 1 });
  }
  return {
    now: { temp: Math.round(d.current.temperature_2m), feels: Math.round(d.current.apparent_temperature),
      code: d.current.weather_code, wind: Math.round(d.current.wind_speed_10m), isDay: d.current.is_day === 1,
      rain: d.hourly.precipitation_probability[i0] },
    hours: hours,
    days: d.daily.time.map((t, i) => ({ date: t, code: d.daily.weather_code[i],
      max: Math.round(d.daily.temperature_2m_max[i]), min: Math.round(d.daily.temperature_2m_min[i]),
      rain: d.daily.precipitation_probability_max[i],
      sunrise: String(d.daily.sunrise[i]).slice(11, 16), sunset: String(d.daily.sunset[i]).slice(11, 16) })),
  };
}

/** "Label | address" lines → [{name, address}]. */
function destinations_(text) {
  return String(text || '').split('\n').map(l => l.split('|')).filter(p => p.length >= 2 && p[0].trim() && p[1].trim())
    .slice(0, 3).map(p => ({ name: p[0].trim(), address: p.slice(1).join('|').trim() }));
}

/**
 * Live journey times via TomTom: now (live traffic) vs. usual for this time of day (historic).
 * Status: green = normal, amber = a bit slower, red = a lot slower.
 */
function traffic_(home, destText) {
  const key = String(inst_('TomTomKey') || '').trim();
  if (!key) throw new Error('Add a TomTom API key on the Installation tab of the admin app');
  const from = geocode_(home);
  const routes = destinations_(destText).map(r => {
    try {
      const to = geocode_(r.address);
      const url = 'https://api.tomtom.com/routing/1/calculateRoute/' + from.lat + ',' + from.lng + ':' + to.lat + ',' + to.lng +
        '/json?traffic=true&computeTravelTimeFor=all&sectionType=traffic&routeRepresentation=polyline&departAt=now&key=' + encodeURIComponent(key);
      const res = uf_(url, { muteHttpExceptions: true });
      if (res.getResponseCode() !== 200) throw new Error('TomTom said ' + res.getResponseCode());
      const route = JSON.parse(res.getContentText()).routes[0];
      const sm = route.summary;
      const now = sm.travelTimeInSeconds;
      const usual = sm.historicTrafficTravelTimeInSeconds || sm.noTrafficTravelTimeInSeconds || now;
      const delay = Math.max(0, now - usual);
      const ratio = now / usual;
      const status = (delay < 120 || ratio < 1.15) ? 'green' : (delay >= 300 && ratio >= 1.4) ? 'red' : 'amber';
      const pts = (route.legs[0].points || []).map(p => [round5_(p.latitude), round5_(p.longitude)]);
      const keep = thin_(pts, 250);
      const jams = (route.sections || []).filter(x => x.sectionType === 'TRAFFIC').map(x => ({
        from: keep.map[x.startPointIndex] || 0, to: keep.map[x.endPointIndex] || keep.points.length - 1,
        kind: x.simpleCategory || '', delayMins: Math.round((x.delayInSeconds || 0) / 60),
        severity: x.magnitudeOfDelay || 0,
      }));
      return { name: r.name, status: status, mins: Math.round(now / 60), usualMins: Math.round(usual / 60),
        delayMins: Math.round(delay / 60), miles: Math.round(sm.lengthInMeters / 160.934) / 10,
        from: [from.lat, from.lng], to: [to.lat, to.lng], points: keep.points, jams: jams };
    } catch (err) {
      return { name: r.name, error: String(err && err.message || err) };
    }
  });
  return { home: [from.lat, from.lng], routes: routes };
}
function round5_(n) { return Math.round(n * 1e5) / 1e5; }
/** Keep at most max points; map[oldIndex] = newIndex so traffic sections still line up. */
function thin_(pts, max) {
  const step = Math.max(1, Math.ceil(pts.length / max));
  const points = [], map = {};
  pts.forEach((p, i) => {
    if (i % step === 0 || i === pts.length - 1) points.push(p);
    map[i] = points.length - 1;
  });
  return { points: points, map: map };
}

/** National Rail departures (Rail Data Marketplace, Live Departure Board). */
/**
 * Live departures. Works with either kind of National Rail key:
 *  - an OpenLDBWS token (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx, from realtime.nationalrail.co.uk/OpenLDBWSRegistration –
 *    the one the Raspberry Pi "Train Departure Board" projects use), or
 *  - a Rail Data Marketplace consumer key (raildata.org.uk, "Live Departure Board").
 * If the first kind tried is refused, the other is tried.
 */
function trains_(fromCrs, toCrs, disruption) {
  const key = String(inst_('RailDataKey') || '').trim();
  if (!key) throw new Error('Add a National Rail key on the Installation tab of the admin app');
  const from = String(fromCrs || 'BPW').toUpperCase(), to = String(toCrs || '').toUpperCase();
  const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key);
  const order = guid ? [ldbSoap_, ldbRest_] : [ldbRest_, ldbSoap_];
  let d = null, first = null;
  for (let i = 0; i < order.length && !d; i++) {
    try { d = order[i](key, from, to); } catch (err) { if (!first) first = err; if (!err.auth) throw err; }
  }
  if (!d) throw new Error('National Rail didn’t accept the key (' + (first && first.message) + '). Check it on the Installation tab.');
  const route = {};      // every station the trains call at on the way, for "only about this route"
  const services = (d.trainServices || []).map(s => {
    let arrive = null, calls = [];
    (s.subsequentCallingPoints || []).forEach(list => (list.callingPoint || []).forEach(cp => {
      if (!arrive) { calls.push(cp.locationName); route[cp.locationName] = 1; }
      if (cp.crs === to && !arrive) arrive = { st: cp.st, et: cp.et || cp.at || '' };
    }));
    calls = calls.slice(0, -1);
    return {
      std: s.std, etd: s.etd, platform: s.platform || '', operator: s.operator || '',
      destination: (s.destination || []).map(x => x.locationName).join(' & '),
      cancelled: !!s.isCancelled || String(s.etd).toLowerCase() === 'cancelled',
      reason: s.cancelReason || s.delayReason || '',
      arrive: arrive ? (/^\d\d:\d\d$/.test(arrive.et) ? arrive.et : arrive.st) : '',
      mins: arrive ? journeyMins_(s.std, arrive.st) : null,
      stops: calls.length, via: calls.slice(0, 3),
    };
  });
  const messages = (d.nrccMessages || []).map(m => String(typeof m === 'string' ? m : (m.value || m.Value || m.message || ''))
    .replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()).filter(Boolean);
  route[d.locationName || ''] = 1; route[d.filterLocationName || ''] = 1;
  return { from: d.locationName || from, to: d.filterLocationName || to, services: services, messages: trainMessages_(messages, Object.keys(route), disruption) };
}
/** Disruption messages: all, none, or only those that name a station on the route (or, for longer names, its last word – "Paddington"). */
function trainMessages_(messages, names, mode) {
  if (mode === 'Off') return [];
  if (mode === 'Everything at the station') return messages;
  const generic = /^(road|parkway|central|international|junction|street|park|halt|town|city|airport|bridge|north|south|east|west|parkway)$/i;
  const words = [];
  names.filter(Boolean).forEach(n => {
    words.push(n.toLowerCase());
    const last = n.split(/\s+/).pop();
    if (n.indexOf(' ') > 0 && last.length >= 5 && !generic.test(last)) words.push(last.toLowerCase());
  });
  return messages.filter(m => { const t = m.toLowerCase(); return words.some(w => t.indexOf(w) >= 0); });
}
function railErr_(msg, auth) { const e = new Error(msg); e.auth = !!auth; return e; }

/** Rail Data Marketplace (JSON). */
function ldbRest_(key, from, to) {
  const url = 'https://api1.raildata.org.uk/1010-live-departure-board-dep1_2/LDBWS/api/20220120/GetDepBoardWithDetails/' +
    from + '?numRows=10' + (to ? '&filterCrs=' + to + '&filterType=to' : '') + '&timeWindow=180';
  const res = uf_(url, { headers: { 'x-apikey': key }, muteHttpExceptions: true });
  const code = res.getResponseCode();
  if (code === 401 || code === 403) throw railErr_('Rail Data Marketplace said ' + code, true);
  if (code !== 200) throw railErr_('National Rail said ' + code);
  return JSON.parse(res.getContentText());
}

/** OpenLDBWS (SOAP) – the same service and token as the Raspberry Pi departure board projects. */
function ldbSoap_(key, from, to) {
  const x = v => String(v).replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));
  const body = '<?xml version="1.0" encoding="utf-8"?>' +
    '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:typ="http://thalesgroup.com/RTTI/2013-11-28/Token/types" xmlns:ldb="http://thalesgroup.com/RTTI/2021-11-01/ldb/">' +
    '<soap:Header><typ:AccessToken><typ:TokenValue>' + x(key) + '</typ:TokenValue></typ:AccessToken></soap:Header>' +
    '<soap:Body><ldb:GetDepBoardWithDetailsRequest><ldb:numRows>10</ldb:numRows><ldb:crs>' + x(from) + '</ldb:crs>' +
    (to ? '<ldb:filterCrs>' + x(to) + '</ldb:filterCrs><ldb:filterType>to</ldb:filterType>' : '') +
    '<ldb:timeOffset>0</ldb:timeOffset><ldb:timeWindow>120</ldb:timeWindow></ldb:GetDepBoardWithDetailsRequest></soap:Body></soap:Envelope>';
  const res = uf_('https://lite.realtime.nationalrail.co.uk/OpenLDBWS/ldb12.asmx', {
    method: 'post', contentType: 'text/xml; charset=utf-8', payload: body, muteHttpExceptions: true,
    headers: { SOAPAction: 'http://thalesgroup.com/RTTI/2015-05-14/ldb/GetDepBoardWithDetails' } });
  const code = res.getResponseCode(), text = res.getContentText();
  if (code === 401 || code === 403 || /Unauthori[sz]ed|Invalid.{0,20}token|AccessToken/i.test(code === 200 ? '' : text)) throw railErr_('OpenLDBWS refused the token (' + code + ')', true);
  if (code !== 200) throw railErr_('National Rail said ' + code + (/<faultstring>([^<]+)/.exec(text) ? ': ' + /<faultstring>([^<]+)/.exec(text)[1] : ''));
  // Read the XML by element name, ignoring the many namespaces it uses.
  const root = XmlService.parse(text).getRootElement();
  const kids = (el, name) => el ? el.getChildren().filter(c => c.getName() === name) : [];
  const kid = (el, name) => kids(el, name)[0] || null;
  const txt = (el, name) => { const c = kid(el, name); return c ? c.getText() : ''; };
  const find = (el, name) => { if (!el) return null; if (el.getName() === name) return el; for (const c of el.getChildren()) { const f = find(c, name); if (f) return f; } return null; };
  const board = find(root, 'GetStationBoardResult');
  if (!board) throw railErr_('Unexpected reply from National Rail');
  const loc = l => ({ locationName: txt(l, 'locationName'), crs: txt(l, 'crs') });
  const services = kids(kid(board, 'trainServices'), 'service').map(sv => ({
    std: txt(sv, 'std'), etd: txt(sv, 'etd'), platform: txt(sv, 'platform'), operator: txt(sv, 'operator'),
    isCancelled: txt(sv, 'isCancelled') === 'true', cancelReason: txt(sv, 'cancelReason'), delayReason: txt(sv, 'delayReason'),
    destination: kids(kid(sv, 'destination'), 'location').map(loc),
    subsequentCallingPoints: kids(kid(sv, 'subsequentCallingPoints'), 'callingPointList').map(list => ({
      callingPoint: kids(list, 'callingPoint').map(cp => ({ locationName: txt(cp, 'locationName'), crs: txt(cp, 'crs'), st: txt(cp, 'st'), et: txt(cp, 'et'), at: txt(cp, 'at') })),
    })),
  }));
  return { locationName: txt(board, 'locationName'), filterLocationName: txt(board, 'filterLocationName'), trainServices: services,
    nrccMessages: kids(kid(board, 'nrccMessages'), 'message').map(m => m.getText()) };
}
function journeyMins_(a, b) {
  if (!/^\d\d:\d\d$/.test(a || '') || !/^\d\d:\d\d$/.test(b || '')) return null;
  const m = x => Number(x.slice(0, 2)) * 60 + Number(x.slice(3));
  return (m(b) - m(a) + 1440) % 1440;
}

/* ---------------------------------------------------------------- bins, anywhere in the UK
 * Three ways to know the collection days (setting "Collection days from"):
 *  - My council (automatic): the postcode is looked up on postcodes.io to find the council; councils with a public
 *    collections service have their own little reader in BIN_COUNCILS (keyed by the council's ONS code). Others get a
 *    clear message pointing at the other two ways.
 *  - Calendar link: the iCal (.ics) feed many councils publish on their bin-day page.
 *  - Repeating schedule: "Bin | every N weeks | a known date" – works for every household in the country.
 * (MagicMirror's bin modules work the same way: one module per council, or a calendar/schedule for everyone else.
 *  The big community list of council readers – UKBinCollectionData – needs Python and a web browser to run, which a
 *  Google script can't do, so councils are added here one by one, starting with those that have a proper web service.)
 */
// The councils this script can read, by ONS code (what postcodes.io gives for a postcode). Each reader returns
// { 'yyyy-MM-dd': [ { bin, kind, schedule, status } ] }. Most need the home's UPRN (property number).
// Ported from the community UKBinCollectionData project; the full list of councils and how each can be read is in
// <apps address>/data/bin-councils.json.
const BIN_COUNCILS = {
  E06000025: { name: 'South Gloucestershire Council', read: binsSouthGlos_, needs: ['postcode', 'house'] },
  E06000038: { name: 'Reading Borough Council', read: s => binsFrom_(binJson_('https://api.reading.gov.uk/api/collections/' + binUprn_(s)).collections, c => [c.service.replace(/ Collection Service/i, ' bin'), binDate_(c.date)]) },
  E06000062: { name: 'West Northamptonshire Council', read: s => binsFrom_(binJson_('https://api.westnorthants.digital/openapi/v1/unified-waste-collections/' + binUprn_(s)).collectionItems, c => [c.type, binDate_(c.date)]) },
  E07000240: { name: 'St Albans City and District Council', read: s => binsFrom_(binJson_('https://gis.stalbans.gov.uk/NoticeBoard9/VeoliaProxy.NoticeBoard.asmx/GetServicesByUprnAndNoticeBoard',
    { method: 'post', contentType: 'application/json; charset=UTF-8', payload: JSON.stringify({ uprn: binUprn_(s), noticeBoard: 'default' }) }).d, c => [c.ServiceHeaders[0].TaskType, binDate_(c.ServiceHeaders[0].Next)]) },
  E07000220: { name: 'Rugby Borough Council', read: s => { const w = binJson_('https://apps.cloud9technologies.com/rugby/citizenmobile/webapi/wastecollections/' + binUprn_(s)).wasteCollectionDates || {};
    return binsFrom_(Object.keys(w).filter(k => /^container/.test(k) && w[k]).map(k => w[k]), c => [c.containerDescription, binDate_(c.collectionDate)]); } },
  E06000014: { name: 'City of York Council', read: s => binsFrom_(binJson_('https://waste-api.york.gov.uk/api/Collections/GetBinCollectionDataForUprn/' + binUprn_(s)).services, c => [c.service, binDate_(c.nextCollection)]) },
  S12000042: { name: 'Dundee City Council', read: s => binsFrom_(binJson_('https://www.dundee-mybins.co.uk/get_calendar.php?rn=' + binUprn_(s)), c => [c.title, binDate_(c.start)]) },
  S12000021: { name: 'North Ayrshire Council', read: s => {
    const a = ((binJson_('https://www.maps.north-ayrshire.gov.uk/arcgis/rest/services/AGOL/YourLocationLive/MapServer/8/query?f=json&outFields=*&returnDistinctValues=true&returnGeometry=false&spatialRel=esriSpatialRelIntersects&where=' +
      encodeURIComponent("UPRN = '" + binUprn_(s) + "'")).features || [])[0] || {}).attributes || {};
    return binsFrom_(['BLUE', 'GREY', 'PURPLE', 'BROWN'].filter(k => a[k + '_DATE_TEXT']), k => [k.charAt(0) + k.slice(1).toLowerCase() + ' bin', binDate_(a[k + '_DATE_TEXT'])]); } },
  S12000014: { name: 'Falkirk Council', read: s => { const out = []; (binJson_('https://recycling.falkirk.gov.uk/api/collections/' + binUprn_(s)).collections || []).forEach(c => (c.dates || []).forEach(d => out.push([c.type, d])));
    return binsFrom_(out, x => [x[0], binDate_(x[1])]); } },
  E09000009: { name: 'London Borough of Ealing', read: s => binsFrom_(binJson_('https://www.ealing.gov.uk/site/custom_scripts/WasteCollectionWS/home/FindCollection',
    { method: 'post', contentType: 'application/json', payload: JSON.stringify({ uprn: binUprn_(s) }) }).param2, c => [c.Service, binDate_(c.collectionDate[0])]) },
  E09000015: { name: 'London Borough of Harrow', read: s => binsFrom_((((binJson_('https://www.harrow.gov.uk/ajax/bins?u=' + binUprn_(s) + '&r=12345', { headers: { 'User-Agent': 'Mozilla/5.0' } }).results || {}).collections || {}).all), c => [c.binType, binDate_(c.eventTime)]) },
  E07000008: { name: 'Cambridge City Council', read: s => { const out = [], N = { ORGANIC: 'Green bin', RECYCLE: 'Blue bin', DOMESTIC: 'Black bin' };
    (binJson_('https://servicelayer3c.azure-api.net/wastecalendar/collection/search/' + binUprn_(s) + '/?authority=CCC&numberOfCollections=40').collections || []).forEach(c => (c.roundTypes || []).forEach(t => out.push([N[t] || t, c.date])));
    return binsFrom_(out, x => [x[0], binDate_(x[1])]); } },
  E06000059: { name: 'Dorset Council', read: s => {   // one small web service per kind of bin
    const u = binUprn_(s), out = [];
    ['refuseday', 'recyclingday', 'foodwasteday', 'gardenwasteday'].forEach(t => {
      const r = uf_('https://geoapi.dorsetcouncil.gov.uk/v1/services/' + t + '/' + u, { muteHttpExceptions: true });
      if (r.getResponseCode() !== 200) { if (t === 'refuseday') throw new Error('Dorset Council’s bin service said ' + r.getResponseCode()); return; }
      const v = ((JSON.parse(r.getContentText()) || {}).values || [])[0];
      if (v && v.dateNextVisit) out.push([String(v.type || t.replace(/day$/, '')) + ' bin', v.dateNextVisit]);
    });
    return binsFrom_(out, x => [x[0], binDate_(x[1])]); } },
};
/* ---- helpers for the council readers */
function binUprn_(s) { const u = String(s.UPRN || '').replace(/\D/g, ''); if (!u) throw new Error('This council needs your home’s property number (UPRN) – use “Set up bin days” in the Family Admin app'); return u; }
function binJson_(url, opts) {
  const r = uf_(url, Object.assign({ muteHttpExceptions: true, followRedirects: true }, opts || {}));
  if (r.getResponseCode() !== 200) throw new Error('The council’s bin service said ' + r.getResponseCode());
  try { return JSON.parse(r.getContentText()); } catch (e) { throw new Error('The council’s bin service sent something unexpected'); }
}
/** Any date the councils use → yyyy-MM-dd: 2026-11-11, 2026-11-11T00:00:00, 11/11/2026, 11/11/2026 00:00:00, Wednesday 11 November 2026, /Date(…)/. */
function binDate_(v) {
  const t = String(v == null ? '' : v).trim();
  let m = /^(\d{4})-(\d\d)-(\d\d)/.exec(t); if (m) return m[1] + '-' + m[2] + '-' + m[3];
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(t); if (m) return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
  m = /\/Date\((\d+)/.exec(t); if (m) return fmt_(new Date(Number(m[1])), 'yyyy-MM-dd');
  const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  m = /(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3})[a-z]*\.?\s+(\d{4})/.exec(t); if (m && MON[m[2].toLowerCase()]) return m[3] + '-' + ('0' + MON[m[2].toLowerCase()]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
  const d = new Date(t); return isNaN(d) ? '' : fmt_(d, 'yyyy-MM-dd');
}
/** list + (item → [bin name, yyyy-MM-dd]) → the days map every reader returns. */
function binsFrom_(list, pick) {
  const days = {};
  (list || []).forEach(x => {
    let p; try { p = pick(x); } catch (e) { return; }
    if (!p || !p[1] || !p[0]) return;
    const label = binLabel_(p[0]);
    if (!(days[p[1]] || []).some(y => y.bin === label)) (days[p[1]] = days[p[1]] || []).push({ bin: label, kind: binKind_(p[0]), schedule: '', status: '' });
  });
  if (!Object.keys(days).length) throw new Error('The council’s bin service found no collections for that property – check the property number (UPRN)');
  return days;
}
/** All the councils, and how each can be read (from <apps address>/data/bin-councils.json, kept for 6 hours). */
function binRegistry_() {
  const c = CacheService.getScriptCache(), hit = c.get('binRegistry');
  if (hit) return JSON.parse(hit);
  let reg = {};
  try { reg = JSON.parse(uf_(appsBase_() + 'data/bin-councils.json', { muteHttpExceptions: true }).getContentText()).councils || {}; } catch (e) { reg = {}; }
  Object.keys(BIN_COUNCILS).forEach(k => { reg[k] = Object.assign({ name: BIN_COUNCILS[k].name, how: 'feed' }, reg[k] || {}, { ready: true, needs: BIN_COUNCILS[k].needs || ['uprn'] }); });
  try { c.put('binRegistry', JSON.stringify(reg), 21600); } catch (e) { /* too big – fine, fetched next time */ }
  return reg;
}
/** "Set up bin days": the council for a postcode, and every council to choose from. */
function binLookup_(postcode) {
  const reg = binRegistry_();
  let c = null; try { c = councilFor_(postcode); } catch (e) { c = { error: e.message }; }
  const list = Object.keys(reg).map(k => ({ code: k, name: reg[k].name, how: reg[k].how, ready: !!BIN_COUNCILS[k], needs: reg[k].needs || [], note: reg[k].note || '' })).sort((a, b) => a.name.localeCompare(b.name));
  const mine = c && c.code ? (list.find(x => x.code === c.code) || { code: c.code, name: c.name, how: 'none', ready: false, needs: [] }) : null;
  return { ok: true, council: mine, postcodeError: c && c.error || '', councils: list };
}
/** Which council a postcode is in (postcodes.io, free, no key). Cached for a week. */
function councilFor_(postcode) {
  const pc = String(postcode || '').replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2}$/.test(pc)) throw new Error('That doesn’t look like a UK postcode: ' + postcode);
  const cache = CacheService.getScriptCache(), ck = 'council:' + pc, hit = cache.get(ck);
  if (hit) return JSON.parse(hit);
  const res = uf_('https://api.postcodes.io/postcodes/' + encodeURIComponent(pc), { muteHttpExceptions: true });
  if (res.getResponseCode() === 404) throw new Error('Postcode ' + postcode + ' wasn’t found – check it');
  if (res.getResponseCode() !== 200) throw new Error('The postcode lookup said ' + res.getResponseCode() + ' – try again later');
  const r = JSON.parse(res.getContentText()).result || {};
  const out = { code: (r.codes || {}).admin_district || '', name: r.admin_district || 'your council', country: r.country || '' };
  cache.put(ck, JSON.stringify(out), 6 * 3600);
  return out;
}
function binUnsupported_(c) {
  return c.name + ' can’t be read automatically yet. In Family Admin open the Bins widget → Set up bin days, and enter your bins by hand (or use the council’s calendar link if it has one).';
}
/** Which of the four colours a bin gets on the screen, from its name. */
function binKind_(name) {
  const n = String(name || '').toLowerCase();
  return /food|caddy|kitchen/.test(n) ? 'food' : /garden|green waste|brown/.test(n) ? 'garden' : /recycl|blue|glass|paper|card|plastic|box/.test(n) ? 'recycling' : 'refuse';
}
function binLabel_(name) {
  let n = String(name || '').trim(); if (/^[^a-z]+$/.test(n)) n = n.toLowerCase();   // "REFUSE" → "Refuse"
  n = n.replace(/^./, c => c.toUpperCase()); const k = binKind_(n);
  if (n.length <= 22) return n;
  return { food: 'Food caddy', garden: 'Garden bin', recycling: 'Recycling', refuse: 'Black bin' }[k];
}
function bins_(s, id) {
  const src = String(s.Source || BIN_SOURCES[0]);
  let days;
  if (src === 'Calendar link') days = binsIcs_(s.CalendarLink);
  else if (src === 'Repeating schedule') days = binsRepeat_(binSchedule_(s.Schedule));
  else {
    let code = String(s.Council || '').trim(), c = null;
    if (!code) { if (!String(s.Postcode || '').trim()) throw new Error('Set up your bin days in the Family Admin app (the Bins widget)'); c = councilFor_(s.Postcode); code = c.code; }
    const C = BIN_COUNCILS[code];
    if (!C) throw new Error(binUnsupported_(c || { name: (binRegistry_()[code] || {}).name || 'Your council' }));
    days = C.read(s, id);
  }
  const today = fmt_(new Date(), 'yyyy-MM-dd'), todayMs = Date.parse(today + 'T00:00:00Z');
  return {
    today: today, reminderFrom: String(s.ReminderFrom || '15:00'),
    upcoming: Object.keys(days).filter(d => d >= today).sort().slice(0, 4).map(d => ({ date: d,
      daysAway: Math.round((Date.parse(d + 'T00:00:00Z') - todayMs) / 86400000), bins: days[d] })),
  };
}
/** "Black bin | 2 | 2026-11-11" lines → [{ bin, weeks, date }]. */
function binSchedule_(text) {
  const out = String(text || '').split('\n').map(l => l.trim()).filter(Boolean).map(line => {
    const p = line.split('|').map(x => x.trim());
    const m = /^(\d{4})-(\d\d)-(\d\d)$/.exec(p[2] || '') || /^(\d\d?)\/(\d\d?)\/(\d{4})$/.exec(p[2] || '');
    if (p.length < 3 || !p[0] || !/^\d$/.test(p[1]) || +p[1] < 1 || !m) throw new Error('Each schedule line needs "Bin | every how many weeks | a date", e.g. "Black bin | 2 | 2026-11-11" – this one doesn’t: ' + line);
    const ymd = m[1].length === 4 ? m[1] + '-' + m[2] + '-' + m[3] : m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
    checkLen_('Bin name', p[0], 22);
    return { bin: p[0], weeks: +p[1], date: ymd };
  });
  if (!out.length) throw new Error('Add at least one line to the repeating schedule, e.g. "Black bin | 2 | 2026-11-11"');
  return out;
}
function binsRepeat_(list) {
  const today = Date.parse(fmt_(new Date(), 'yyyy-MM-dd') + 'T00:00:00Z'), days = {}, DAY = 86400000;
  list.forEach(b => {
    const step = b.weeks * 7 * DAY, start = Date.parse(b.date + 'T00:00:00Z');
    let t = start + Math.ceil((today - start) / step) * step;
    for (let i = 0; i < 6; i++, t += step) {
      const d = Utilities.formatDate(new Date(t), 'UTC', 'yyyy-MM-dd');
      (days[d] = days[d] || []).push({ bin: b.bin, kind: binKind_(b.bin), schedule: 'Every ' + (b.weeks === 1 ? 'week' : b.weeks + ' weeks'), status: '' });
    }
  });
  return days;
}
/** A council's iCal feed: each event on a date is a bin (or several: "Black bin and food caddy"). Weekly repeats are understood. */
function binsIcs_(link) {
  const url = String(link || '').trim().replace(/^webcal:/i, 'https:');
  if (!/^https?:\/\//i.test(url)) throw new Error('Paste your council’s calendar link in the Bins settings');
  const res = uf_(url, { muteHttpExceptions: true, followRedirects: true });
  if (res.getResponseCode() !== 200) throw new Error('The council calendar link said ' + res.getResponseCode());
  const text = res.getContentText().replace(/\r?\n[ \t]/g, '');
  if (!/BEGIN:VCALENDAR/.test(text)) throw new Error('That link isn’t a calendar (.ics) – look for "add to calendar" or "subscribe" on the council’s bin-day page');
  const today = fmt_(new Date(), 'yyyy-MM-dd'), until = Utilities.formatDate(new Date(Date.now() + 70 * 86400000), 'UTC', 'yyyy-MM-dd'), days = {};
  const add = (d, summary) => {
    if (d < today || d > until) return;
    String(summary).split(/\s*(?:,|&|\band\b|\+)\s*/i).map(x => x.replace(/collection|day|bin day/ig, '').trim()).filter(Boolean).forEach(x => {
      const label = binLabel_(/bin|caddy|recycl|waste|box|bag/i.test(x) ? x : x + (/food/i.test(x) ? ' caddy' : ''));
      if (!(days[d] || []).some(y => y.bin === label)) (days[d] = days[d] || []).push({ bin: label, kind: binKind_(x), schedule: '', status: '' });
    });
  };
  text.split('BEGIN:VEVENT').slice(1).forEach(ev => {
    const get = k => { const m = new RegExp('^' + k + '[^:\\n]*:(.*)$', 'm').exec(ev); return m ? m[1].trim() : ''; };
    const ds = get('DTSTART').slice(0, 8), summary = get('SUMMARY').replace(/\\,/g, ',');
    if (!/^\d{8}$/.test(ds) || !summary) return;
    const first = ds.slice(0, 4) + '-' + ds.slice(4, 6) + '-' + ds.slice(6, 8);
    const rr = get('RRULE');
    if (/FREQ=WEEKLY/.test(rr)) {
      const n = Number((/INTERVAL=(\d+)/.exec(rr) || [])[1] || 1), stop = (/UNTIL=(\d{8})/.exec(rr) || [])[1];
      let t = Date.parse(first + 'T00:00:00Z');
      for (let i = 0; i < 400; i++, t += n * 7 * 86400000) {
        const d = Utilities.formatDate(new Date(t), 'UTC', 'yyyy-MM-dd');
        if (d > until || (stop && d.replace(/-/g, '') > stop)) break;
        add(d, summary);
      }
    } else add(first, summary);
  });
  if (!Object.keys(days).length) throw new Error('The council calendar has no collections in the next 10 weeks');
  return days;
}

/** South Gloucestershire Council collections. The property number (UPRN) is found once and saved in the widget's settings. */
function binsSouthGlos_(s, id) {
  let uprn = String(s.UPRN || '').trim();
  if (!uprn) {
    const pc = String(s.Postcode || '').trim().toUpperCase();
    const match = String(s.House || '').trim().toUpperCase();
    if (!match) throw new Error('Add your house name or number in the Bins settings');
    const res = uf_('https://webapps.southglos.gov.uk/Webservices/SGC.RefuseCollectionService/RefuseCollectionService.svc/getAddresses/' +
      encodeURIComponent(pc), { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) throw new Error('Council address lookup said ' + res.getResponseCode());
    const list = JSON.parse(res.getContentText()) || [];
    const hit = list.filter(a => [a.Property, a.Street, a.Locality].join(' ').toUpperCase().indexOf(match) >= 0);
    if (hit.length !== 1) {
      throw new Error((hit.length ? 'Several' : 'No') + ' addresses at ' + pc + ' match "' + match + '". Options: ' +
        list.slice(0, 12).map(a => a.Property).join(' / '));
    }
    uprn = String(hit[0].Uprn);
    if (id) setWset_(id, 'UPRN', uprn);
  }
  const res = uf_('https://api.southglos.gov.uk/wastecomp/GetCollectionDetails?uprn=' + encodeURIComponent(uprn), { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error('Council collections said ' + res.getResponseCode());
  const services = (JSON.parse(res.getContentText()).value || []);
  const today = fmt_(new Date(), 'yyyy-MM-dd');
  const NAMES = { refuse: 'Black bin', recycling: 'Recycling', food: 'Food caddy', garden: 'Garden bin' };
  const days = {};
  services.forEach(sv => {
    const name = String(sv.hso_servicename || '').toLowerCase();
    const label = Object.keys(NAMES).filter(k => name.indexOf(k) === 0).map(k => NAMES[k])[0];
    if (!label) return;
    let next = sv.hso_nextcollection ? fmt_(new Date(sv.hso_nextcollection), 'yyyy-MM-dd') : '';
    const last = sv.hso_lastcollection ? fmt_(new Date(sv.hso_lastcollection), 'yyyy-MM-dd') : '';
    const state = String(sv.hso_statename || '');
    // Round still in progress today → today is the collection day.
    if (last === today && state && state.toLowerCase() !== 'closed completed') next = today;
    if (!next || next < today) return;
    (days[next] = days[next] || []).push({ bin: label, kind: name.split(' ')[0], schedule: sv.hso_scheduledescription || '',
      status: next === today ? state : '' });
  });
  return days;
}

/**
 * Today's and tomorrow's calendar entries, and a look at a weekend:
 * Monday–Thursday "This weekend"; Friday "This weekend" in place of tomorrow; Saturday and Sunday "Next weekend".
 */
function agenda_() {
  const now = new Date();
  const today = fmt_(now, 'yyyy-MM-dd'), noon = Date.parse(today + 'T12:00:00Z');
  const day = n => Utilities.formatDate(new Date(noon + n * 86400000), 'UTC', 'yyyy-MM-dd');
  const tomorrow = day(1), dow = new Date(noon).getUTCDay();
  const toSat = dow === 6 ? 7 : 6 - dow;                    // Saturday: the next one. Sunday: 6 days away.
  const next = dow === 6 || dow === 0;
  const wk = [toSat, toSat + 1];
  const cal = getCalendar_(today, day(wk[1] + 1));
  if (cal.error) return { error: cal.error };
  const bh = cal.bankHolidays || {};
  const wDays = wk.map(day);
  return { today: today, tomorrow: tomorrow, friday: dow === 5, days: { today: cal.days[today] || [], tomorrow: cal.days[tomorrow] || [] },
    bankHolidays: { today: bh[today] || '', tomorrow: bh[tomorrow] || '' },
    weekend: { days: wDays, next: next, events: wDays.map(d => cal.days[d] || []), bankHolidays: wDays.map(d => bh[d] || '') } };
}

/* ------------------------------------------------------------- flights */

// Friendly names for the commonest aircraft type codes (ICAO). Anything else shows the code.
const AIRCRAFT = {
  A318: 'Airbus A318', A319: 'Airbus A319', A320: 'Airbus A320', A321: 'Airbus A321', A19N: 'Airbus A319neo', A20N: 'Airbus A320neo',
  A21N: 'Airbus A321neo', A332: 'Airbus A330', A333: 'Airbus A330', A339: 'Airbus A330neo', A343: 'Airbus A340', A346: 'Airbus A340',
  A359: 'Airbus A350', A35K: 'Airbus A350-1000', A388: 'Airbus A380', BCS1: 'Airbus A220', BCS3: 'Airbus A220',
  B737: 'Boeing 737', B738: 'Boeing 737-800', B739: 'Boeing 737-900', B38M: 'Boeing 737 MAX 8', B39M: 'Boeing 737 MAX 9',
  B744: 'Boeing 747', B748: 'Boeing 747-8', B752: 'Boeing 757', B763: 'Boeing 767', B764: 'Boeing 767', B772: 'Boeing 777',
  B77L: 'Boeing 777', B77W: 'Boeing 777-300ER', B788: 'Boeing 787-8', B789: 'Boeing 787-9', B78X: 'Boeing 787-10',
  E190: 'Embraer 190', E195: 'Embraer 195', E290: 'Embraer E190-E2', E295: 'Embraer E195-E2', E75L: 'Embraer 175',
  AT72: 'ATR 72', AT76: 'ATR 72', AT75: 'ATR 72', DH8D: 'Dash 8 Q400', CRJ9: 'CRJ-900', C172: 'Cessna 172', C152: 'Cessna 152',
  PA28: 'Piper PA-28', SR22: 'Cirrus SR22', EC35: 'Airbus H135 helicopter', EC45: 'Airbus H145 helicopter', A139: 'AW139 helicopter',
  A169: 'AW169 helicopter', EH10: 'AW101 helicopter', H60: 'Black Hawk helicopter', C130: 'Hercules', A400: 'Airbus A400M',
  C17: 'C-17 Globemaster', P8: 'P-8 Poseidon', TEX2: 'Texan T1', HAWK: 'BAe Hawk', EUFI: 'Typhoon', F35: 'F-35',
};

/** Planes near home from a free ADS-B network, nearest first, with routes looked up for the closest few. */
function flights_(s) {
  const c = geocode_(s.Centre || inst_('HomeAddress'));
  const miles = Math.max(3, Math.min(60, Number(s.RadiusMiles) || 20));
  const nm = Math.ceil(miles * 0.869);
  const base = s.Source === 'airplanes.live' ? 'https://api.airplanes.live/v2/point/' : 'https://api.adsb.lol/v2/point/';
  const res = uf_(base + c.lat.toFixed(4) + '/' + c.lng.toFixed(4) + '/' + nm,
    { muteHttpExceptions: true, headers: { 'User-Agent': 'FamilyDashboard/1.0 (Google Apps Script)' } });
  if (res.getResponseCode() !== 200) throw new Error(s.Source + ' said ' + res.getResponseCode() + ' \u2013 try the other data source in the widget settings');
  const ac = JSON.parse(res.getContentText()).ac || [];
  const maxAlt = Number(s.MaxAltitude) || 45000;
  const planes = ac.filter(a => isFinite(a.lat) && isFinite(a.lon) && isFinite(Number(a.alt_baro)) && Number(a.alt_baro) <= maxAlt)
    .map(a => {
      const type = String(a.t || '').toUpperCase();
      return {
        hex: String(a.hex || ''), cs: String(a.flight || '').trim(), reg: String(a.r || ''), type: type,
        model: AIRCRAFT[type] || (a.desc ? titleCase_(String(a.desc)) : type),
        alt: Math.round(Number(a.alt_baro) / 100) * 100, mph: isFinite(a.gs) ? Math.round(a.gs * 1.15078) : null,
        kt: isFinite(a.gs) ? a.gs : 0, track: isFinite(a.track) ? Math.round(a.track) : null,
        climb: isFinite(a.baro_rate) ? (a.baro_rate > 400 ? 1 : a.baro_rate < -400 ? -1 : 0) : 0,
        lat: round5_(a.lat), lon: round5_(a.lon), dist: Math.round(miles_(c.lat, c.lng, a.lat, a.lon) * 10) / 10,
        heli: /helicopter/i.test(AIRCRAFT[type] || '') || /^(EC\d|AS\d|R44|R22|B06|S76|S92|H60|EH10|A1\d\d$)/.test(type),
      };
    })
    .filter(p => p.dist <= miles + 1)
    .sort((a, b) => a.dist - b.dist).slice(0, 60);
  if (yes_(s.Routes, true)) {
    const cache = CacheService.getScriptCache();
    planes.filter(p => /^[A-Z]{3}\d/.test(p.cs)).slice(0, 8).forEach(p => {
      const key = 'rt:' + p.cs;
      let r = cache.get(key);
      if (r === null) {
        r = '{}';
        try {
          const q = uf_('https://api.adsbdb.com/v0/callsign/' + encodeURIComponent(p.cs), { muteHttpExceptions: true });
          if (q.getResponseCode() === 200) {
            const fr = (JSON.parse(q.getContentText()).response || {}).flightroute || {};
            const ap = x => x ? { code: x.iata_code || x.icao_code || '', city: x.municipality || x.name || '' } : null;
            r = JSON.stringify({ from: ap(fr.origin), to: ap(fr.destination), airline: (fr.airline || {}).name || '' });
          }
        } catch (err) { /* no route */ }
        cache.put(key, r, 12 * 3600);
      }
      Object.assign(p, JSON.parse(r));
    });
  }
  return { centre: [c.lat, c.lng], radiusMiles: miles, at: Date.now(), planes: planes, source: s.Source };
}
function miles_(lat1, lon1, lat2, lon2) {
  const R = 3958.8, r = Math.PI / 180;
  const dLat = (lat2 - lat1) * r, dLon = (lon2 - lon1) * r;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * R * Math.asin(Math.sqrt(a));
}
function titleCase_(s) { return s.toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase()); }

/* ---------------------------------------------------------------- news */

function news_(s) {
  const url = s.Feed === 'Another feed (link below)' ? String(s.FeedUrl || '').trim() : NEWS_FEEDS[s.Feed] || NEWS_FEEDS['BBC \u2013 Top stories'];
  if (!url) throw new Error('Paste the feed link into the News widget settings');
  const res = uf_(url, { muteHttpExceptions: true, followRedirects: true });
  if (res.getResponseCode() !== 200) throw new Error('The news feed said ' + res.getResponseCode());
  const feed = parseFeed_(res.getContentText());
  if (!feed.items.length) throw new Error('No headlines found in that feed');
  return { title: s.Feed === 'Another feed (link below)' ? feed.title : s.Feed, items: feed.items.slice(0, 20) };
}
/** Small RSS/Atom reader: title, summary, picture and time of each story. */
function parseFeed_(xml) {
  const items = [];
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || [];
  const tag = (src, t) => { const m = new RegExp('<' + t + '(?:\\s[^>]*)?>([\\s\\S]*?)<\\/' + t + '>', 'i').exec(src); return m ? clean_(m[1]) : ''; };
  blocks.slice(0, 30).forEach(b => {
    const img = (/<media:thumbnail[^>]*url="([^"]+)"/i.exec(b) || /<media:content[^>]*url="([^"]+)"[^>]*(?:medium="image"|type="image)/i.exec(b) ||
      /<enclosure[^>]*url="([^"]+)"[^>]*type="image/i.exec(b) || /<img[^>]*src="([^"]+)"/i.exec(b) || [])[1] || '';
    const when = tag(b, 'pubDate') || tag(b, 'updated') || tag(b, 'published') || tag(b, 'dc:date');
    const d = when ? new Date(when) : null;
    items.push({
      title: tag(b, 'title'), text: (tag(b, 'description') || tag(b, 'summary') || tag(b, 'content')).slice(0, 400),
      img: img.replace(/&amp;/g, '&').replace(/\/ace\/standard\/\d+\//, '/ace/standard/480/'),
      at: d && !isNaN(d) ? d.toISOString() : '',
    });
  });
  const head = xml.split(/<item[\s>]|<entry[\s>]/i)[0];
  return { title: tag(head, 'title'), items: items.filter(i => i.title) };
}
function clean_(s) {
  return String(s).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, '\'')
    .replace(/&#(\d+);/g, (m, n) => String.fromCharCode(Number(n))).replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ').trim();
}

/* -------------------------------------------------------------- photos */

function photos_(s) {
  if (s.Source === 'Google Photos shared album') return albumPhotos_(s.AlbumLink);
  return drivePhotos_(s.DriveFolder);
}

/** Every picture in a Drive folder. The folder must be shared "Anyone with the link" so the screen can load them. */
function drivePhotos_(link) {
  const id = (String(link || '').match(/folders\/([\w-]{10,})/) || String(link || '').match(/^([\w-]{20,})$/) || [])[1];
  if (!id) throw new Error('Paste a Google Drive folder link into the Photos widget settings');
  const folder = DriveApp.getFolderById(id);
  const out = [];
  const files = folder.getFiles();
  while (files.hasNext() && out.length < 300) {
    const f = files.next();
    if (!/^image\//.test(f.getMimeType())) continue;
    out.push({ src: 'https://drive.google.com/thumbnail?id=' + f.getId() + '&sz=w1920', alt: 'https://lh3.googleusercontent.com/d/' + f.getId() + '=w1920',
      name: f.getName().replace(/\.[^.]+$/, ''), added: fmt_(f.getDateCreated(), 'd MMM yyyy'), t: f.getDateCreated().getTime() });
  }
  out.sort((a, b) => b.t - a.t);
  const access = folder.getSharingAccess();
  const shared = /^ANYONE/.test(String(access));
  return { title: folder.getName(), photos: out,
    warning: shared ? '' : 'Share the "' + folder.getName() + '" folder as \u201cAnyone with the link \u2013 Viewer\u201d so the screen can show the photos.' };
}

/**
 * A shared Google Photos album (Share → Create link). Google no longer lets apps read albums through its API,
 * so this reads the public album page. It works for shared links but Google could change the page at any time.
 */
function albumPhotos_(link) {
  if (!/^https:\/\/(photos\.app\.goo\.gl|photos\.google\.com)\//.test(String(link || ''))) throw new Error('Paste a Google Photos shared album link (photos.app.goo.gl/\u2026) into the widget settings');
  const res = uf_(link, { muteHttpExceptions: true, followRedirects: true });
  if (res.getResponseCode() !== 200) throw new Error('Google Photos said ' + res.getResponseCode());
  const html = res.getContentText();
  const re = /\["(https:\/\/lh3\.googleusercontent\.com\/pw\/[^"\s]+)",(\d+),(\d+)/g;
  const seen = {}, out = [];
  let m, n = 0;
  while ((m = re.exec(html)) && out.length < 300) {
    if (seen[m[1]] || Number(m[2]) < 300) continue;
    seen[m[1]] = 1;
    out.push({ src: m[1] + '=w1920-h1080', name: '', added: '', t: n++ });
  }
  if (!out.length) throw new Error('Couldn\u2019t find photos in that album. Check it\u2019s a shared link (Share \u2192 Create link).');
  const title = ((/<title>([^<]*)<\/title>/i.exec(html) || [])[1] || 'Album').replace(/\s*[-\u2013]\s*Google Photos\s*$/i, '');
  return { title: clean_(title), photos: out, warning: '' };
}

/* ---------------------------------------------------------------- lists */

function listData_(s, id) {
  if (s.Source === 'Google Tasks') {
    const T = tasksApi_(), listId = tasksListId_(s.TasksList || s.ListName);
    const items = (T.Tasks.list(listId, { showCompleted: true, showHidden: false, maxResults: 100 }).items || [])
      .filter(t => t.title).map(t => ({ id: t.id, text: t.title, done: t.status === 'completed' }));
    return { name: s.ListName, source: 'tasks', items: sortItems_(items) };
  }
  const name = String(s.ListName || '').trim().toLowerCase();
  const items = rows_('lists').filter(r => String(r.List).trim().toLowerCase() === name && r.Item)
    .map(r => ({ id: String(r.ID), text: String(r.Item), done: yes_(r.Done, false) }));
  return { name: s.ListName, source: 'sheet', items: sortItems_(items) };
}
function sortItems_(items) { return items.filter(i => !i.done).concat(items.filter(i => i.done)); }

/** Add, tick/untick, remove or clear ticked items, from the screen or the phone. */
function listItem_(b) {
  const w = layout_().widgets.find(x => x.id === b.widget && (x.type === 'list' || x.type === 'todo'));
  if (!w) throw new Error('List not found');
  const s = w.type === 'todo' ? Object.assign({}, w.settings, { Source: 'Google Tasks', ListName: w.settings.TasksList }) : w.settings, op = b.op;
  if (op === 'add') {
    const text = checkLen_('Item', b.text, LIMITS.listItem);
    if (!text) throw new Error('Type something to add');
  }
  if (s.Source === 'Google Tasks') {
    const T = tasksApi_(), listId = tasksListId_(s.TasksList || s.ListName);
    if (op === 'add') T.Tasks.insert({ title: String(b.text).trim() }, listId);
    else if (op === 'toggle') {
      const t = T.Tasks.get(listId, b.id);
      T.Tasks.patch(t.status === 'completed' ? { status: 'needsAction', completed: null } : { status: 'completed' }, listId, b.id);
    } else if (op === 'remove') T.Tasks.remove(listId, b.id);
    else if (op === 'clearDone') T.Tasks.clear(listId);
    else if (op === 'star') {                                     // priority: kept here, as Google Tasks has no priority field
      const st = todoStars_();
      if (st[b.id]) delete st[b.id]; else st[b.id] = 1;
      PropertiesService.getScriptProperties().setProperty('todoStars', JSON.stringify(st));
    }
    else throw new Error('Unknown list action');
    if (w.type === 'todo') return { ok: true, id: w.id, data: todo_(w.settings) };
  } else {
    const sh = sheet_('lists');
    const name = String(s.ListName).trim();
    const data = sh.getDataRange().getValues();
    const find = () => data.findIndex((r, i) => i > 0 && String(r[4]) === String(b.id));
    if (op === 'add') sh.appendRow([name, String(b.text).trim(), 'No', fmt_(new Date(), 'yyyy-MM-dd HH:mm'), newId_()]);
    else if (op === 'toggle') { const i = find(); if (i < 0) throw new Error('Item not found'); sh.getRange(i + 1, 3).setValue(yes_(data[i][2], false) ? 'No' : 'Yes'); }
    else if (op === 'remove') { const i = find(); if (i < 0) throw new Error('Item not found'); sh.deleteRow(i + 1); }
    else if (op === 'clearDone') deleteWhere_('lists', r => String(r[0]).trim().toLowerCase() === name.toLowerCase() && yes_(r[2], false));
    else throw new Error('Unknown list action');
  }
  return { ok: true, id: w.id, data: listData_(s, w.id) };
}

function tasksApi_() {
  if (typeof Tasks === 'undefined') throw new Error('Turn on Google Tasks: in Apps Script click Services (+), choose "Google Tasks API", Add, then deploy a new version.');
  return Tasks;
}
function tasksListId_(name) {
  const lists = Tasks.Tasklists.list({ maxResults: 100 }).items || [];
  const want = String(name || '').trim().toLowerCase();
  const hit = want ? lists.find(l => String(l.title).trim().toLowerCase() === want) : lists[0];
  if (!hit) throw new Error('No Google Tasks list called "' + name + '". Your lists: ' + lists.map(l => l.title).join(', '));
  return hit.id;
}

/* ============================================================ CALENDAR */

/** Stop over-long text being typed straight into the Sheet (shows a warning and rejects it). */
function applySheetRules_() {
  const rules = [
    ['timetable', 'Reminder', LIMITS.reminder], ['boys', 'Name', LIMITS.boyName], ['tasks', 'Task', LIMITS.task],
    ['todos', 'Item', LIMITS.todo], ['categories', 'Category', LIMITS.category], ['lists', 'Item', LIMITS.listItem],
    ['pages', 'Title', LIMITS.pageTitle], ['memos', 'Text', LIMITS.memo],
  ];
  rules.forEach(([key, col, max]) => {
    const sh = sheet_(key);
    const c = SHEETS[key].indexOf(col) + 1;
    const a1 = sh.getRange(2, c).getA1Notation();
    const rule = SpreadsheetApp.newDataValidation()
      .requireFormulaSatisfied('=LEN(' + a1 + ')<=' + max)
      .setAllowInvalid(false)
      .setHelpText('Up to ' + max + ' characters \u2013 anything longer won\u2019t fit on the dashboard screen.')
      .build();
    sh.getRange(2, c, Math.max(sh.getMaxRows() - 1, 1), 1).setDataValidation(rule);
  });
  const pts = SpreadsheetApp.newDataValidation().requireNumberBetween(1, LIMITS.maxPoints).setAllowInvalid(false)
    .setHelpText('Whole number from 1 to ' + LIMITS.maxPoints).build();
  const t = sheet_('tasks');
  t.getRange(2, SHEETS.tasks.indexOf('Points') + 1, Math.max(t.getMaxRows() - 1, 1), 1).setDataValidation(pts);
}

/** Older sheets: add the Group/Show columns and fill them in for the standard categories. */
function upgradeCategories_() {
  const sh = sheet_('categories');
  const head = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0].map(String);
  SHEETS.categories.forEach(h => { if (head.indexOf(h) < 0) { head.push(h); sh.getRange(1, head.length).setValue(h).setFontWeight('bold'); } });
  const data = sh.getDataRange().getValues();
  const col = n => head.indexOf(n);
  for (let r = 1; r < data.length; r++) {
    const def = DEFAULT_CATEGORIES.find(d => d[0] === String(data[r][col('Category')]).trim());
    if (!def) continue;
    if (!String(data[r][col('Group')] || '').trim() && def[3]) sh.getRange(r + 1, col('Group') + 1).setValue(def[3]);
    if (!String(data[r][col('Show')] || '').trim() && def[4]) sh.getRange(r + 1, col('Show') + 1).setValue(def[4]);
  }
}

/** Category list from the Categories tab. */
function categories_() {
  return rows_('categories').filter(r => r.Category).map(r => ({
    name: String(r.Category).trim(), colour: String(r.Colour || OTHER_COLOUR).trim(),
    keys: String(r.Match || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean),
    group: String(r.Group || '').trim() || String(r.Category).trim(),
    bar: String(r.Show || '').trim().toLowerCase() === 'bar',
  })).map((c, i, all) => {
    const g = all.find(x => x.name === c.group);
    return Object.assign(c, { groupColour: g ? g.colour : c.colour });
  });
}

/* ------------------------------------------------------ family & calendar categories */

/**
 * The family as the setup app sees it, read from the Categories tab:
 * people (each a child or an adult), the names of the two groups, Family and Holiday (always there),
 * and up to 3 special categories (e.g. School holiday shown as a strip, Birthday).
 * Older Sheets without the Kind column are worked out: a group whose members are on the points page is the children's.
 */
function family_() {
  const raw = rows_('categories').filter(r => String(r.Category || '').trim()).map(r => ({
    name: String(r.Category).trim(), colour: String(r.Colour || OTHER_COLOUR).trim(), match: String(r.Match || '').trim(),
    group: String(r.Group || '').trim(), bar: String(r.Show || '').trim().toLowerCase() === 'bar', kind: String(r.Kind || '').trim().toLowerCase(),
  }));
  const kids = rows_('boys').map(b => norm_(b.Name)).filter(Boolean);
  const groupNames = {};
  raw.forEach(c => { if (c.group && c.group !== c.name) groupNames[c.group] = (groupNames[c.group] || []).concat(c.name); });
  const groupKind = {};
  Object.keys(groupNames).forEach(g => { groupKind[g] = groupNames[g].some(n => kids.indexOf(norm_(n)) >= 0) ? 'children' : 'adults'; });
  raw.forEach(c => {
    if (c.kind === 'children' || c.kind === 'adults') groupKind[c.name] = c.kind;
  });
  raw.forEach(c => {
    if (c.kind) return;
    const n = norm_(c.name);
    if (c.group && c.group !== c.name) c.kind = groupKind[c.group] === 'children' ? 'child' : 'adult';
    else if (groupNames[c.name]) c.kind = groupKind[c.name];
    else if (n === 'family') c.kind = 'family';
    else if (n === 'holiday' || n === 'holidays') c.kind = 'holiday';
    else c.kind = 'special';
  });
  const find = k => raw.find(c => c.kind === k);
  const rank = c => { const i = kids.indexOf(norm_(c.name)); return i < 0 ? 99 : i; };
  const g = (k, def, colour) => { const c = find(k); return { name: c ? c.name : def, colour: c ? c.colour : colour, match: c ? c.match : '' }; };
  const fam = find('family'), hol = find('holiday');
  const ps = pageSettings_('boys'), page = rows_('pages').find(p => String(p.Type).toLowerCase() === 'boys');
  return {
    // Children in the order they're on the points page, then the adults.
    people: raw.filter(c => c.kind === 'child').sort((x, y) => rank(x) - rank(y)).concat(raw.filter(c => c.kind === 'adult'))
      // points: is this child on the points page? (With nobody there yet, every child starts ticked.)
      .map(c => ({ name: c.name, colour: c.colour, match: c.match, role: c.kind,
        points: c.kind === 'child' ? (!kids.length || kids.indexOf(norm_(c.name)) >= 0) : false })),
    children: g('children', 'Children', '#22d3ee'), adults: g('adults', 'Adults', '#a855f7'),
    family: { name: 'Family', colour: fam ? fam.colour : '#c08457', match: fam ? fam.match : '' },
    holiday: { name: 'Holiday', colour: hol ? hol.colour : '#ef4444', match: hol ? hol.match : 'flight' },
    specials: raw.filter(c => c.kind === 'special').slice(0, FAMILY_LIMITS.specials).map(c => ({ name: c.name, colour: c.colour, match: c.match, bar: c.bar })),
    pointsTitle: page ? String(page.Title || '') : '', limits: FAMILY_LIMITS,
  };
}

/** Save the family from the setup app: rewrites the Categories tab, the children on the points page and the page's name. */
function saveFamily_(b) {
  const L = FAMILY_LIMITS, hex = /^#[0-9a-f]{6}$/i, used = {};
  const clean = (what, v, max) => {
    v = String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
    if (!v) throw new Error(what + ' needs a name');
    if (v.length > max) throw new Error(what + ' “' + v + '” is too long – up to ' + max + ' characters fit on the calendar key');
    if (/[–—:\-|,]/.test(v)) throw new Error('“' + v + '” can’t contain a dash, colon, comma or |');
    const k = norm_(v);
    if (!k) throw new Error('“' + v + '” needs some letters');
    if (used[k]) throw new Error('“' + v + '” is used twice – every name needs to be different');
    used[k] = 1;
    return v;
  };
  const colour = (what, c) => { c = String(c || '').trim(); if (!hex.test(c)) throw new Error('Colour for ' + what + ' must look like #3fa9f5'); return c; };
  const match = (m, was, name) => {
    const words = String(m || '').split(',').map(x => x.trim()).filter(Boolean);
    // Renamed? Keep events that use the old name ("Boys – Swimming") in the same category.
    if (was && norm_(was) !== norm_(name) && words.map(norm_).indexOf(norm_(was)) < 0) words.push(String(was).trim());
    const out = words.join(', ');
    if (out.length > L.match) throw new Error('Too many matching words for ' + name);
    return out;
  };
  // The fixed ones first so nobody can call a person "Family".
  clean('Family', 'Family', 20); clean('Holiday', 'Holiday', 20);
  const people = (b.people || []).filter(p => p && String(p.name || '').trim());
  if (!people.length) throw new Error('Add at least one person');
  if (people.length > L.people) throw new Error('Up to ' + L.people + ' people');
  const groups = {};
  ['children', 'adults'].forEach(k => {
    const gIn = b[k] || {};
    groups[k] = { name: clean(k === 'children' ? 'The children’s group' : 'The adults’ group', gIn.name, L.group), was: gIn.was };
    groups[k].colour = colour(groups[k].name, gIn.colour);
    groups[k].match = match(gIn.match, gIn.was, groups[k].name);
  });
  const ppl = people.map(p => {
    const role = p.role === 'child' ? 'child' : p.role === 'adult' ? 'adult' : '';
    if (!role) throw new Error('Say whether ' + p.name + ' is an adult or a child');
    const name = clean('Each person', p.name, L.name);
    return { name: name, was: p.was, role: role, colour: colour(name, p.colour), match: match(p.match, p.was, name),
      points: role === 'child' && b.points !== false && p.points !== false };
  });
  const kids = ppl.filter(p => p.role === 'child');
  const onPoints = kids.filter(p => p.points);   // each child can be on or off the points page
  if (kids.length > L.children) throw new Error('Up to ' + L.children + ' children');
  const specials = (b.specials || []).filter(x => x && String(x.name || '').trim());
  if (specials.length > L.specials) throw new Error('Up to ' + L.specials + ' special categories, so the calendar key stays readable');
  const sp = specials.map(x => { const name = clean('Each special category', x.name, L.special); return { name: name, colour: colour(name, x.colour), match: match(x.match, x.was, name), bar: !!x.bar }; });
  const fam = b.family || {}, hol = b.holiday || {};

  const rows = [];
  ['children', 'adults'].forEach(k => {
    const members = ppl.filter(p => p.role === (k === 'children' ? 'child' : 'adult'));
    members.forEach(p => rows.push([p.name, p.colour, p.match, groups[k].name, '', p.role]));
    if (members.length) rows.push([groups[k].name, groups[k].colour, groups[k].match, '', '', k]);
  });
  rows.push(['Family', colour('Family', fam.colour || '#c08457'), match(fam.match, '', 'Family'), '', '', 'family']);
  rows.push(['Holiday', colour('Holiday', hol.colour || '#ef4444'), match(hol.match == null ? 'flight' : hol.match, '', 'Holiday'), '', '', 'holiday']);
  sp.forEach(x => rows.push([x.name, x.colour, x.match, '', x.bar ? 'bar' : '', 'special']));

  {   // (already inside the request lock)
    const sh = sheet_('categories');
    sh.clearContents();
    sh.getRange(1, 1, 1, SHEETS.categories.length).setValues([SHEETS.categories]).setFontWeight('bold');
    sh.getRange(2, 1, rows.length, SHEETS.categories.length).setValues(rows);
    // Renaming a child keeps their points, tasks and reminders.
    kids.forEach(k => { if (k.was && k.was !== k.name) renameChild_(k.was, k.name); });
    // The ticked children are the points page. Someone taken off keeps their points history, so ticking them
    // again later brings it all back. Nobody ticked: the points page is left as it is.
    if (onPoints.length) {
      const bs = sheet_('boys');
      if (bs.getLastRow() > 1) bs.getRange(2, 1, bs.getLastRow() - 1, SHEETS.boys.length).clearContent();
      bs.getRange(2, 1, onPoints.length, 2).setValues(onPoints.map(k => [k.name, k.colour]));
    }
    const title = String(b.pointsTitle || '').trim() || groups.children.name;
    if (title.length > 14) throw new Error('The points page name can be up to 14 characters');
    setColumn_('pages', 'Title', r => String(r[2]).toLowerCase() === 'boys' ? title : undefined);
    bumpCalVersion_(); bumpVersions_();
    return { ok: true, family: family_() };
  }
}

/** A child has been renamed: move their points, tasks, to-dos and reminders to the new name. */
function renameChild_(was, name) {
  [['tasks', 'Boy'], ['ledger', 'Boy'], ['todos', 'Boy'], ['todoLog', 'Boy'], ['timetable', 'Boy']].forEach(t => {
    const sh = SpreadsheetApp.getActive().getSheetByName(TAB[t[0]]); if (!sh) return;
    const data = sh.getDataRange().getValues(), c = data[0].map(String).indexOf(t[1]);
    if (c < 0 || data.length < 2) return;
    const vals = data.slice(1).map(r => [String(r[c]).trim() === was ? name : r[c]]);
    sh.getRange(2, c + 1, vals.length, 1).setValues(vals);
  });
}

function norm_(x) { return String(x || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim(); }

/**
 * Work out an event's category and the text to show.
 * "Ben – Drums" → Ben, "Drums". "Tom Widmann's birthday" → Birthday, "Tom". Otherwise match words, else Other.
 */
function classify_(title, cats) {
  const raw = String(title || '').trim();
  const m = raw.match(/^(.{1,40}?)\s*[–—:-]\s+(.+)$/);
  if (m) {
    const cat = cats.find(c => norm_(c.name) === norm_(m[1]));
    if (cat) return { cat: cat, text: tidyBirthday_(m[2], cat) };
  }
  const t = ' ' + norm_(raw) + ' ';
  let best = null, bestLen = 0;
  cats.forEach(c => c.keys.forEach(k => {
    const kk = ' ' + norm_(k) + ' ';
    if (kk.trim() && t.indexOf(kk) >= 0 && kk.length > bestLen) { best = c; bestLen = kk.length; }
  }));
  return { cat: best, text: best ? tidyBirthday_(raw, best) : raw };
}

/** Birthdays show just the first name: "Becki Mob's birthday" → "Becki". */
function tidyBirthday_(text, cat) {
  if (norm_(cat.name) !== 'birthday') return text;
  const name = String(text).replace(/['’]s\s+birthday.*$/i, '').replace(/\bbirthday\b/i, '').replace(/^happy\s+/i, '').trim();
  const words = name.split(/\s+/).filter(Boolean);
  if (!words.length) return text;
  const lead = /^(uncle|aunt|auntie|aunty|nan|nana|nanny|granny|grandma|grandad|grandpa|cousin|great)$/i.test(words[0]);
  return lead && words[1] ? words[0] + ' ' + words[1] : words[0];
}

/** English (England & Wales) bank holidays from GOV.UK, as { 'yyyy-MM-dd': 'Christmas Day' }. Checked daily. */
function bankHolidays_() {
  const v = cached_(CacheService.getScriptCache(), 'bankhols', 6 * 3600, false, () => {
    const res = uf_('https://www.gov.uk/bank-holidays.json', { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) throw new Error('GOV.UK said ' + res.getResponseCode());
    const out = {};
    (JSON.parse(res.getContentText())['england-and-wales'].events || []).forEach(e => { out[e.date] = e.title; });
    return out;
  });
  return v && !v.error ? v : {};
}

/**
 * Delete a calendar entry from the screen or the Family Calendar app.
 * b.id / b.cal / b.s identify the entry (as sent with the calendar); b.all = true deletes every repeat of a repeating entry,
 * otherwise only that day's one. Only calendars the dashboard shows can be touched.
 */
function deleteEvent_(b) {
  const id = String(b.id || ''), calId = String(b.cal || ''), at = Number(b.s);
  if (!id || !calId || !at) throw new Error('Which entry?');
  const cal = calendarsFrom_(inst_('CalendarIds')).find(c => c.getId() === calId);
  if (!cal) throw new Error('That calendar isn’t one the dashboard shows');
  const t = new Date(at), evs = cal.getEvents(new Date(at - 2 * 86400000), new Date(at + 2 * 86400000));
  const ev = evs.find(e => e.getId() === id && Math.abs((e.isAllDayEvent() ? e.getAllDayStartDate() : e.getStartTime()).getTime() - t.getTime()) < 36 * 3600000)
    || evs.find(e => e.getId() === id);
  if (!ev) throw new Error('Couldn’t find that entry – it may already have gone');
  const title = ev.getTitle();
  try {
    if (b.all && ev.isRecurringEvent()) ev.getEventSeries().deleteEventSeries();
    else ev.deleteEvent();
  } catch (err) { throw new Error('Google Calendar wouldn’t delete it (' + err.message + '). You may only be able to view that calendar.'); }
  bumpCalVersion_();
  return { ok: true, deleted: title };
}

function calVersion_() { return PropertiesService.getScriptProperties().getProperty('calVer') || '0'; }
function bumpCalVersion_() { PropertiesService.getScriptProperties().setProperty('calVer', String(Date.now())); }

function calendarsFrom_(setting) {
  const out = [], used = {};
  String(setting || 'default').split(',').map(x => x.trim()).filter(Boolean).forEach(id => {
    const list = id.toLowerCase() === 'default' ? [CalendarApp.getDefaultCalendar()]
      : id.toLowerCase() === 'all' ? CalendarApp.getAllCalendars() : [CalendarApp.getCalendarById(id)];
    list.forEach(c => { if (c && !used[c.getId()]) { used[c.getId()] = 1; out.push(c); } });
  });
  return out;
}

/** Events between start and end (yyyy-MM-dd, end exclusive), grouped by day, each tagged with a category. */
function getCalendar_(start, end) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start || '') || !/^\d{4}-\d{2}-\d{2}$/.test(end || '')) throw new Error('Bad dates');
  const from = new Date(start + 'T00:00:00Z'), to = new Date(end + 'T00:00:00Z');
  if (to - from > 125 * 86400000 || to <= from) throw new Error('Range too long');
  const cache = CacheService.getScriptCache();
  return cached_(cache, 'cal:' + calVersion_() + ':' + start + ':' + end, 3 * 60, false, () => {
    const cats = categories_();
    const scriptTz = Session.getScriptTimeZone();
    const qFrom = new Date(from.getTime() - 86400000), qTo = new Date(to.getTime() + 86400000);
    const days = {}, seen = {}, dupe = {};
    let other = false;
    calendarsFrom_(inst_('CalendarIds')).forEach(cal => {
      cal.getEvents(qFrom, qTo).forEach(ev => {
        const key = ev.getId() + '|' + ev.getStartTime().getTime();
        if (seen[key]) return; seen[key] = 1;
        const allDay = ev.isAllDayEvent();
        const title = ev.getTitle() || '(busy)';
        const c = classify_(title, cats);
        if (!c.cat) other = true;
        // All-day dates are calendar dates, so read them in the script's own time zone.
        const tz = allDay ? scriptTz : TZ;
        const s = allDay ? ev.getAllDayStartDate() : ev.getStartTime();
        const e = allDay ? ev.getAllDayEndDate() : ev.getEndTime();
        const first = Utilities.formatDate(s, tz, 'yyyy-MM-dd');
        const last = Utilities.formatDate(new Date(e.getTime() - 1000), tz, 'yyyy-MM-dd');
        // The same event copied into two calendars (e.g. birthdays) only shows once.
        const same = first + '|' + title.toLowerCase();
        if (dupe[same]) return; dupe[same] = 1;
        const cat = c.cat;
        const inGroup = cat && cat.group !== cat.name;
        const item = { t: c.text + (inGroup ? ' (' + cat.name + ')' : ''), full: title,
          c: cat ? cat.groupColour : OTHER_COLOUR, k: cat ? cat.group : 'Other', cat: cat ? cat.name : 'Other', bar: !!(cat && cat.bar), allDay: allDay,
          time: allDay ? '' : fmt_(s, 'HH:mm'), note: String(ev.getDescription() || '').slice(0, 300),
          id: ev.getId(), cal: cal.getId(), s: s.getTime(), rec: ev.isRecurringEvent() };   // for deleting
        let d = first, guard = 0;
        while (d <= last && guard++ < 370) {
          if (d >= start && d < end) (days[d] = days[d] || []).push(Object.assign({}, item, { time: d === first ? item.time : '' }));
          d = Utilities.formatDate(new Date(Date.parse(d + 'T12:00:00Z') + 86400000), 'UTC', 'yyyy-MM-dd');
        }
      });
    });
    Object.keys(days).forEach(k => days[k].sort((a, b) => (a.allDay === b.allDay ? (a.time < b.time ? -1 : 1) : a.allDay ? -1 : 1)));
    const legend = [], seenG = {};
    cats.forEach(c => { if (!seenG[c.group]) { seenG[c.group] = 1; legend.push({ name: c.group, colour: c.groupColour, bar: c.bar }); } });
    if (other) legend.push({ name: 'Other', colour: OTHER_COLOUR, bar: false });
    const addable = cats.map(c => ({ name: c.name, colour: c.groupColour }));
    const bh = {}, all = bankHolidays_();
    Object.keys(all).forEach(d => { if (d >= start && d < end) bh[d] = all[d]; });
    return { ok: true, start: start, end: end, days: days, categories: legend, addable: addable, bankHolidays: bh };
  });
}

/** New all-day event (one day or a run of days), saved as "Category – Title". Birthdays repeat every year. */
function addEvent_(b) {
  const cat = categories_().find(c => c.name === b.category);
  if (!cat) throw new Error('Pick a category');
  const text = checkLen_('Title', b.title, LIMITS.eventTitle);
  if (!text) throw new Error('Give the event a name');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.start || '') || !/^\d{4}-\d{2}-\d{2}$/.test(b.end || b.start)) throw new Error('Pick the day(s)');
  let a = b.start, z = b.end || b.start;
  if (z < a) { const x = a; a = z; z = x; }
  const tz = Session.getScriptTimeZone();
  const startDate = Utilities.parseDate(a, tz, 'yyyy-MM-dd');
  const endExcl = Utilities.parseDate(Utilities.formatDate(new Date(Date.parse(z + 'T12:00:00Z') + 86400000), 'UTC', 'yyyy-MM-dd'), tz, 'yyyy-MM-dd');
  if (endExcl - startDate > 366 * 86400000) throw new Error('That is more than a year');
  const cal = calendarsFrom_(inst_('AddToCalendar') || 'default')[0];
  if (!cal) throw new Error('Can’t open the calendar in AddToCalendar');
  const note = checkLen_('Notes', b.note, LIMITS.eventNote);
  const opts = note ? { description: note } : {};
  let ev;
  const time = String(b.time || '').trim();
  if (time && !/^([01]?\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error('Time should look like 14:30');
  if (norm_(cat.name) === 'birthday') {
    const title = /birthday/i.test(text) ? text : text + '’s birthday';
    ev = cal.createAllDayEventSeries(title, startDate, CalendarApp.newRecurrence().addYearlyRule(), opts);
  } else if (time) {
    // A timed entry (from the voice assistant: "Ben drums at 12 on Saturday"). One hour unless told otherwise.
    const st = Utilities.parseDate(a + ' ' + time, tz, 'yyyy-MM-dd HH:mm');
    const mins = Math.max(5, Math.min(24 * 60, Number(b.mins) || 60));
    ev = cal.createEvent(cat.name + ' – ' + text, st, new Date(st.getTime() + mins * 60000), opts);
  } else {
    ev = cal.createAllDayEvent(cat.name + ' – ' + text, startDate, endExcl, opts);
  }
  bumpCalVersion_();
  return { ok: true, id: ev.getId() };
}

/* ======================================================= WIDGETS v2 DATA */

/* ------------------------------------------------------ holiday countdown */

function countdown_(s) {
  const today = fmt_(new Date(), 'yyyy-MM-dd'), year = today.slice(0, 4);
  const out = [];
  String(s.Extra || '').split('\n').forEach(line => {
    const p = line.split('|');
    if (p.length < 2 || !p[0].trim()) return;
    const typed = p[1].trim();
    let d = oneOffDate_(typed, year);
    if (!d) return;
    if (d < today && !/\d{4}|\/\d{2}$/.test(typed)) d = (Number(year) + 1) + d.slice(4);    // "25 Dec" means the next one
    if (d >= today) out.push({ name: p[0].trim(), date: d, colour: '' });
  });
  const want = String(s.Categories || '').split(',').map(norm_).filter(Boolean);
  if (want.length) {
    const cats = categories_(), seen = {};
    const from = new Date(), to = new Date(Date.now() + 400 * 86400000);
    calendarsFrom_(inst_('CalendarIds')).forEach(cal => cal.getEvents(from, to).forEach(ev => {
      const c = classify_(ev.getTitle(), cats);
      if (!c.cat || (want.indexOf(norm_(c.cat.name)) < 0 && want.indexOf(norm_(c.cat.group)) < 0)) return;
      const allDay = ev.isAllDayEvent();
      const d = Utilities.formatDate(allDay ? ev.getAllDayStartDate() : ev.getStartTime(), allDay ? Session.getScriptTimeZone() : TZ, 'yyyy-MM-dd');
      const key = d + '|' + c.text.toLowerCase();
      if (seen[key] || d < today) return;
      seen[key] = 1;
      out.push({ name: c.text, date: d, colour: c.cat.groupColour });
    }));
  }
  out.sort((a, b) => (a.date < b.date ? -1 : 1));
  return { today: today, items: out.slice(0, 12) };
}

/* ------------------------------------------------------ Weasley clock */

function people_(text) {
  return String(text || '').split('\n').map(l => l.split('|')).filter(p => p[0].trim()).slice(0, 6)
    .map((p, i) => ({ name: p[0].trim(), colour: (p[1] || '').trim() || ['#3fa9f5', '#f5a623', '#7ed321', '#a855f7', '#f472b6', '#22d3ee'][i] }));
}
function places_(text) {
  return String(text || '').split('\n').map(l => l.split('|')).filter(p => p[0].trim()).slice(0, 10)
    .map(p => ({ name: p[0].trim(), address: (p[1] || '').trim() }));
}
function whereabouts_(s) {
  const rows = rows_('where');
  return {
    places: places_(s.Places).map(p => p.name),
    people: people_(s.People).map(p => {
      const r = rows.find(x => String(x.Person).trim().toLowerCase() === p.name.toLowerCase());
      const since = r && r.Since ? (r.Since instanceof Date ? r.Since : new Date(r.Since)) : null;
      return { name: p.name, colour: p.colour, place: r ? String(r.Place) : '', how: r ? String(r.How || '') : '',
        since: since && !isNaN(since) ? since.toISOString() : '' };
    }),
  };
}
/** Move someone on the clock: { person, place } or { person, lat, lon } (nearest place within the radius, else Travelling). */
function setWhere_(p) {
  const w = layout_().widgets.find(x => x.type === 'whereabouts');
  if (!w) throw new Error('Add the Weasley clock widget first');
  const s = w.settings, people = people_(s.People), places = places_(s.Places);
  const person = people.find(x => x.name.toLowerCase() === String(p.person || '').trim().toLowerCase());
  if (!person) throw new Error('Unknown person "' + p.person + '". People on the clock: ' + people.map(x => x.name).join(', '));
  let place = String(p.place || '').trim(), how = String(p.how || 'phone');
  if (!place && isFinite(Number(p.lat)) && isFinite(Number(p.lon)) && p.lat !== '' && p.lat != null) {
    place = placeAt_(s, Number(p.lat), Number(p.lon));
  } else {
    const hit = places.find(x => x.name.toLowerCase() === place.toLowerCase());
    if (!hit) throw new Error('Unknown place "' + place + '". Places on the clock: ' + places.map(x => x.name).join(', '));
    place = hit.name;
  }
  const sh = sheet_('where');
  const data = sh.getDataRange().getValues();
  const i = data.findIndex((r, k) => k > 0 && String(r[0]).trim().toLowerCase() === person.name.toLowerCase());
  const row = [person.name, place, new Date(), how.slice(0, 20)];
  if (i > 0) sh.getRange(i + 1, 1, 1, 4).setValues([row]); else sh.appendRow(row);
  return { ok: true, id: w.id, place: place, data: whereabouts_(s) };
}
function placeAt_(s, lat, lon) {
  const radius = Number(s.Radius) || 300;
  const places = places_(s.Places);
  for (let i = 0; i < places.length; i++) {
    const a = places[i].address;
    if (!a) continue;
    try {
      const g = geocode_(a.toLowerCase() === 'home' ? inst_('HomeAddress') : a);
      if (miles_(lat, lon, g.lat, g.lng) * 1609.34 <= radius) return places[i].name;
    } catch (err) { /* skip a place that can't be found */ }
  }
  const t = places.find(p => /travel/i.test(p.name));
  return t ? t.name : 'Travelling';
}
/** OwnTracks app in HTTP mode, posting to …/exec?owntracks=1&code=ACCESS&person=Ben */
function ownTracks_(e) {
  const q = e.parameter || {};
  try {
    ensureMigrated_();
    checkCode_(q.code);
    const b = JSON.parse((e.postData && e.postData.contents) || '{}');
    if (b._type === 'location' && isFinite(b.lat)) withLock_(() => setWhere_({ person: q.person, lat: b.lat, lon: b.lon, how: 'OwnTracks' }));
    else if (b._type === 'transition' && b.event === 'enter' && b.desc) withLock_(() => setWhere_({ person: q.person, place: b.desc, how: 'OwnTracks' }));
  } catch (err) { /* OwnTracks only needs a 200 reply */ }
  return ContentService.createTextOutput('[]').setMimeType(ContentService.MimeType.JSON);
}

/* ------------------------------------------------------ bus stop */

function bus_(s, id) { return s.Source === 'bustimes.org' ? busTimesOrg_(s, id) : busTapi_(s, id); }

/**
 * Live departures from TransportAPI – the same feed and fields as the MagicMirror module MMM-UKLiveBusStopInfo:
 * /v3/uk/bus/stop/{atcocode}/live.json → departures.all[] with line, direction, aimed / expected departure times.
 * The free plan allows 30 calls a day, so calls are spread across the "Times" windows and counted.
 */
const TAPI_PER_DAY = 28;   // keeps 2 spare for finding the nearest stop
function busTapi_(s, id) {
  const appId = String(inst_('TransportApiId') || '').trim(), key = String(inst_('TransportApiKey') || '').trim();
  if (!appId || !key) throw new Error('Add a free TransportAPI app ID and key on the Installation tab (developer.transportapi.com), or switch this widget to bustimes.org');
  const props = PropertiesService.getScriptProperties();
  const auth = 'app_id=' + encodeURIComponent(appId) + '&app_key=' + encodeURIComponent(key);
  let code = String(s.StopCode || '').trim(), name = String(s.StopName || '');
  if (!code) {
    const h = geocode_(inst_('HomeAddress'));
    countTapi_(props);
    const r = uf_('https://transportapi.com/v3/uk/places.json?type=bus_stop&lat=' + h.lat + '&lon=' + h.lng + '&' + auth, { muteHttpExceptions: true });
    if (r.getResponseCode() !== 200) throw new Error('TransportAPI said ' + r.getResponseCode() + ' when looking for the nearest stop' + (r.getResponseCode() === 403 ? ' – check the app ID and key' : ''));
    const m = (JSON.parse(r.getContentText()).member || []).filter(x => x.atcocode).sort((a, b) => (a.distance || 0) - (b.distance || 0))[0];
    if (!m) throw new Error('No bus stops found near home – type a stop code in the widget settings');
    code = m.atcocode;
    name = m.name + (m.description && m.description !== m.name ? ' (' + m.description + ')' : '');
    if (id) { setWset_(id, 'StopCode', code); setWset_(id, 'StopName', name); }
  }
  const lastKey = 'busLast:' + code;
  const last = JSON.parse(props.getProperty(lastKey) || 'null');
  const plan = busPlan_(s.Times), now = Date.now();
  const due = !last || (plan.inWindow && now - last.fetched >= plan.gapMins * 60000);
  if (!due || tapiUsed_(props) >= TAPI_PER_DAY) return Object.assign({}, last || { stop: name, code: code, departures: [] }, { note: plan.note });
  countTapi_(props);
  const res = uf_('https://transportapi.com/v3/uk/bus/stop/' + encodeURIComponent(code) + '/live.json?' + auth + '&group=no&limit=10&nextbuses=no', { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) {
    if (last) return Object.assign({}, last, { note: 'TransportAPI said ' + res.getResponseCode() + ' – showing the last times' });
    throw new Error('TransportAPI said ' + res.getResponseCode() + (res.getResponseCode() === 403 ? ' – check the app ID and key' : ''));
  }
  const d = JSON.parse(res.getContentText());
  const today = fmt_(new Date(), 'yyyy-MM-dd');
  const deps = ((d.departures || {}).all || []).map(b => ({
    service: String(b.line_name || b.line || ''), dest: String(b.direction || ''),
    time: b.expected_departure_time || b.best_departure_estimate || b.aimed_departure_time || '',
    aimed: b.aimed_departure_time || '', live: !!b.expected_departure_time,
    date: b.expected_departure_date || b.date || today,
  })).filter(b => b.time).slice(0, 10);
  const out = { stop: d.name || name, code: code, departures: deps, fetched: now, updated: fmt_(new Date(), 'HH:mm') };
  props.setProperty(lastKey, JSON.stringify(out));
  return Object.assign({}, out, { note: plan.note });
}
/** "07:00-09:15, 14:45-18:00" → is it one of those times now, and how many minutes apart updates must be to fit the allowance. */
function busPlan_(text) {
  const mins = x => { const p = String(x).trim().split(':'); return Number(p[0]) * 60 + Number(p[1] || 0); };
  const wins = String(text || '').split(',').map(w => w.split('-')).filter(w => w.length === 2 && /\d/.test(w[0]) && /\d/.test(w[1]))
    .map(w => [mins(w[0]), mins(w[1])]).filter(w => w[1] > w[0]);
  const list = wins.length ? wins : [[0, 1440]];
  const total = list.reduce((t, w) => t + (w[1] - w[0]), 0);
  const nowM = mins(fmt_(new Date(), 'HH:mm'));
  return { inWindow: list.some(w => nowM >= w[0] && nowM < w[1]), gapMins: Math.max(5, Math.ceil(total / TAPI_PER_DAY)),
    note: wins.length ? 'Live ' + String(text).replace(/\s+/g, ' ').trim() : '' };
}
function tapiUsed_(props) { const v = JSON.parse(props.getProperty('tapiCount') || '{}'); return v.day === fmt_(new Date(), 'yyyy-MM-dd') ? v.n : 0; }
function countTapi_(props) { props.setProperty('tapiCount', JSON.stringify({ day: fmt_(new Date(), 'yyyy-MM-dd'), n: tapiUsed_(props) + 1 })); }

/** Next buses from bustimes.org. It has no official departures feed, so this reads the stop's public page. */
function busTimesOrg_(s, id) {
  let code = String(s.StopCode || '').trim(), name = String(s.StopName || '');
  if (!code) {
    const st = nearestStop_();
    code = st.code; name = st.name;
    if (id) { setWset_(id, 'StopCode', code); setWset_(id, 'StopName', name); }
  }
  const res = uf_('https://bustimes.org/stops/' + encodeURIComponent(code), { muteHttpExceptions: true, headers: { 'User-Agent': 'FamilyDashboard/1.0 (Google Apps Script)' } });
  if (res.getResponseCode() !== 200) throw new Error('bustimes.org said ' + res.getResponseCode() + ' for stop ' + code);
  const html = res.getContentText();
  const h1 = (/<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html) || [])[1];
  const deps = [];
  (html.match(/<tr[\s\S]*?<\/tr>/gi) || []).forEach(tr => {
    if (!/\/services\//.test(tr)) return;
    const tds = (tr.match(/<td[\s\S]*?<\/td>/gi) || []).map(clean_);
    if (tds.length < 2) return;
    const time = tds[tds.length - 1];
    if (!/\d{1,2}:\d{2}|due|min/i.test(time)) return;
    deps.push({ service: tds[0], dest: tds.length > 2 ? tds[1] : '', time: time, live: /live|due|min/i.test(tr) });
  });
  return { stop: h1 ? clean_(h1) : name, code: code, departures: deps.slice(0, 12) };
}
function nearestStop_() {
  const h = geocode_(inst_('HomeAddress'));
  for (let d = 0.012; d <= 0.1; d *= 3) {
    const url = 'https://bustimes.org/stops.json?ymax=' + (h.lat + d).toFixed(5) + '&xmax=' + (h.lng + d * 1.6).toFixed(5) +
      '&ymin=' + (h.lat - d).toFixed(5) + '&xmin=' + (h.lng - d * 1.6).toFixed(5);
    const res = uf_(url, { muteHttpExceptions: true, headers: { 'User-Agent': 'FamilyDashboard/1.0 (Google Apps Script)' } });
    if (res.getResponseCode() !== 200) throw new Error('Couldn’t search for bus stops (bustimes.org said ' + res.getResponseCode() + '). Type a stop code in the widget settings.');
    const f = (JSON.parse(res.getContentText()).features || []).map(x => ({
      code: String((x.properties || {}).url || '').split('/').filter(Boolean).pop(),
      name: [(x.properties || {}).name, (x.properties || {}).indicator].filter(Boolean).join(' '),
      dist: miles_(h.lat, h.lng, x.geometry.coordinates[1], x.geometry.coordinates[0]),
    })).filter(x => x.code).sort((a, b) => a.dist - b.dist);
    if (f.length) return f[0];
  }
  throw new Error('No bus stops found near home. Type a stop code in the widget settings.');
}

/* ------------------------------------------------------ to-do (Google Tasks) */

function todoStars_() { try { return JSON.parse(PropertiesService.getScriptProperties().getProperty('todoStars') || '{}'); } catch (e) { return {}; } }

function todo_(s) {
  const T = tasksApi_(), listId = tasksListId_(s.TasksList);
  const items = (T.Tasks.list(listId, { showCompleted: true, showHidden: false, maxResults: 100 }).items || []).filter(t => t.title)
    .map(t => ({ id: t.id, text: t.title, done: t.status === 'completed', due: t.due ? String(t.due).slice(0, 10) : '', notes: String(t.notes || '').slice(0, 140) }));
  // Priorities (★) first, then by due date.
  const st = todoStars_(), alive = {};
  items.forEach(i => { i.star = !!st[i.id]; if (st[i.id]) alive[i.id] = 1; });
  if (Object.keys(alive).length !== Object.keys(st).length) PropertiesService.getScriptProperties().setProperty('todoStars', JSON.stringify(alive));   // forget deleted tasks
  const open = items.filter(i => !i.done).sort((a, b) => (b.star - a.star) || ((a.due || '9999') < (b.due || '9999') ? -1 : (a.due || '9999') > (b.due || '9999') ? 1 : 0));
  return { name: s.Title, source: 'tasks', today: fmt_(new Date(), 'yyyy-MM-dd'), items: open.concat(items.filter(i => i.done)) };
}

/* ------------------------------------------------------ parcels (Gmail) */

const CARRIERS = [[/royal ?mail/i, 'Royal Mail'], [/parcelforce/i, 'Parcelforce'], [/evri|hermes/i, 'Evri'], [/\bdpd\b|dpd\./i, 'DPD'],
  [/yodel/i, 'Yodel'], [/\bups\b|ups\.com/i, 'UPS'], [/\bdhl\b|dhl\./i, 'DHL'], [/inpost/i, 'InPost'], [/fedex/i, 'FedEx'], [/amazon/i, 'Amazon'],
  [/ebay/i, 'eBay'], [/argos/i, 'Argos'], [/john ?lewis/i, 'John Lewis'], [/apc/i, 'APC']];
const PARCEL_STATUS = [
  [/\bdelivered\b|has been delivered|was delivered/i, 'Delivered', 1],
  [/attempted|missed (?:you|your)|sorry we missed|couldn.?t deliver|card through/i, 'Missed delivery', 6],
  [/out for delivery|with (?:your|the) driver|arriving today|delivered today|due today|coming today/i, 'Arriving today', 5],
  [/arriving tomorrow|delivery tomorrow|due tomorrow/i, 'Arriving tomorrow', 4],
  [/dispatched|despatched|shipped|on (?:its|the) way|has left|in transit|is coming|been sent/i, 'On its way', 3],
];
/** Delivery emails from the last few days, newest status per email thread. */
function parcels_(s) {
  const days = Number(s.Days) || 7, keep = (Number(s.KeepDelivered) || 0) * 3600000;
  const q = 'newer_than:' + days + 'd -in:spam -in:trash subject:(delivered OR delivery OR dispatched OR despatched OR shipped OR parcel OR package OR "on its way" OR "out for delivery" OR arriving OR "missed you")';
  const out = [];
  GmailApp.search(q, 0, 40).forEach(t => {
    const msgs = t.getMessages(), m = msgs[msgs.length - 1];
    const subj = String(m.getSubject() || ''), from = String(m.getFrom() || '');
    let st = PARCEL_STATUS.find(x => x[0].test(subj));
    if (!st) st = PARCEL_STATUS.find(x => x[0].test(String(m.getPlainBody() || '').slice(0, 1500)));
    if (!st) return;
    const when = m.getDate();
    if (st[1] === 'Delivered' && Date.now() - when.getTime() > keep) return;
    const who = (CARRIERS.find(c => c[0].test(from)) || CARRIERS.find(c => c[0].test(subj)) ||
      [null, from.replace(/<.*>/, '').replace(/"/g, '').trim().slice(0, 24) || 'Parcel'])[1];
    out.push({ who: who, status: st[1], rank: st[2], what: subj.replace(/^(re|fw|fwd):\s*/i, '').slice(0, 90), at: when.toISOString() });
  });
  out.sort((a, b) => (b.rank - a.rank) || (a.at < b.at ? 1 : -1));
  return { items: out.slice(0, 12) };
}

/* ------------------------------------------------------ memos */

function memos_(s) {
  const keep = (Number(s.KeepDays) || 7) * 86400000, now = Date.now();
  return { items: rows_('memos').filter(m => m.Text).map(m => {
    const d = m.Added instanceof Date ? m.Added : new Date(m.Added);
    return { id: String(m.ID), text: String(m.Text), from: String(m.From || ''), at: isNaN(d) ? '' : d.toISOString() };
  }).filter(m => !m.at || now - Date.parse(m.at) < keep).reverse() };
}
function memo_(b) {
  if (b.op === 'add') {
    const t = checkLen_('Note', b.text, LIMITS.memo);
    if (!t) throw new Error('Write something first');
    sheet_('memos').appendRow([newId_(), t, checkLen_('From', b.from || '', 12), new Date()]);
  } else if (b.op === 'remove') deleteWhere_('memos', r => String(r[0]) === String(b.id));
  else throw new Error('Unknown memo action');
  const w = layout_().widgets.find(x => x.type === 'memo');
  return { ok: true, id: w ? w.id : '', data: memos_(w ? w.settings : { KeepDays: 7 }) };
}

/* ------------------------------------------------------ quotes, NASA, Duolingo */

function zenQuotes_() {
  const res = uf_('https://zenquotes.io/api/quotes', { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error('ZenQuotes said ' + res.getResponseCode());
  return { quotes: (JSON.parse(res.getContentText()) || []).filter(x => x.q && x.q.length < 160).map(x => ({ q: x.q, a: x.a })), credit: 'Quotes from zenquotes.io' };
}

/**
 * NASA Astronomy Picture of the Day. NASA's API sometimes answers 500 (often around when the new picture goes up),
 * so: try today, then without video thumbnails, then yesterday, then the APOD web page itself.
 * The last good picture is kept and shown if NASA can't be reached at all.
 */
function apod_() {
  const key = String(inst_('NasaKey') || 'DEMO_KEY').trim();
  const props = PropertiesService.getScriptProperties();
  const yesterday = Utilities.formatDate(new Date(Date.now() - 86400000), 'America/New_York', 'yyyy-MM-dd');
  const base = 'https://api.nasa.gov/planetary/apod?api_key=' + encodeURIComponent(key);
  const tries = [base + '&thumbs=true', base, base + '&thumbs=true&date=' + yesterday];
  let d = null, why = '';
  for (let i = 0; i < tries.length && !d; i++) {
    try {
      const res = uf_(tries[i], { muteHttpExceptions: true });
      const code = res.getResponseCode();
      if (code === 429) { why = 'NASA’s demo key has been used up for now. Get a free key at api.nasa.gov and add it on the Installation tab.'; break; }
      if (code === 403) { why = 'NASA didn’t accept the key – check NasaKey on the Installation tab.'; break; }
      if (code !== 200) { why = 'NASA said ' + code; if (code >= 500) break; continue; }   // API down: go straight to the website
      const j = JSON.parse(res.getContentText());
      if (j && (j.url || j.thumbnail_url)) d = j;
    } catch (err) { why = String(err && err.message || err); }
  }
  if (!d) d = apodScience_();                    // APOD now lives on science.nasa.gov (apod.nasa.gov redirects there)
  if (!d) d = apodPage_();                       // the old APOD web page
  let out = null;
  if (d) {
    const img = d.media_type === 'image' ? d.url : (d.thumbnail_url || '');
    if (img) out = { title: d.title, date: d.date, text: d.explanation, img: img, hd: d.hdurl || '', video: d.media_type !== 'image',
      credit: d.copyright ? clean_(d.copyright) : 'NASA' };
    else why = 'Today’s NASA picture is a ' + (d.media_type || 'video') + ' – have a look at apod.nasa.gov';
  }
  if (out) { props.setProperty('apodLast', JSON.stringify(out)); return out; }
  const last = props.getProperty('apodLast');
  if (last) return JSON.parse(last);             // yesterday's picture beats an error message
  throw new Error(why || 'NASA isn’t answering just now');
}
/** Fallback: read today's picture from apod.nasa.gov/apod/astropix.html. */
/** Today's APOD from NASA Science's site feed (no key needed). */
function apodScience_() {
  try {
    const res = uf_('https://science.nasa.gov/wp-json/wp/v2/image-article?categories=22766&per_page=1&_embed=1',
      { muteHttpExceptions: true, headers: { Accept: 'application/json' } });
    if (res.getResponseCode() !== 200) return null;
    const p = (JSON.parse(res.getContentText()) || [])[0];
    if (!p) return null;
    const media = p._embedded && p._embedded['wp:featuredmedia'] && p._embedded['wp:featuredmedia'][0];
    const src = media && media.source_url;
    if (!src) return null;
    const plain = h => String(h || '').replace(/<[^>]+>/g, ' ').replace(/&#8217;|&rsquo;/g, '’').replace(/&#8211;|&ndash;/g, '–').replace(/&#8220;|&#8221;/g, '"')
      .replace(/&amp;/g, '&').replace(/&nbsp;|&#160;/g, ' ').replace(/&#\d+;/g, '').replace(/\s+/g, ' ').trim();
    const title = plain(p.title && p.title.rendered).replace(/^APOD:\s*\d{4}\s+\w+\s+\d{1,2}\s*[–-]\s*/, '');
    const body = plain(p.content && p.content.rendered), ex = /Explanation:\s*([\s\S]*?)(?:Tomorrow[’']s picture|Authors? & editors|$)/.exec(body);
    const credit = /(?:Image|Video) Credit(?:\s*&\s*Copyright)?:\s*([^.]{2,80}?)(?:\s{2}|Explanation|$)/.exec(body);
    return { media_type: 'image', url: src + (src.indexOf('?') < 0 ? '?w=1600' : ''), hdurl: src, title: title || 'Astronomy Picture of the Day',
      date: String(p.date || '').slice(0, 10), explanation: ex ? ex[1].trim().slice(0, 1500) : plain(p.excerpt && p.excerpt.rendered),
      copyright: credit ? credit[1].trim() : '', link: p.link };
  } catch (err) { return null; }
}

function apodPage_() {
  try {
    const res = uf_('https://apod.nasa.gov/apod/astropix.html', { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) return null;
    const h = res.getContentText();
    const img = /<IMG\s+SRC="([^"]+)"/i.exec(h), big = /<a href="(image\/[^"]+)"/i.exec(h);
    const title = /<center>\s*<b>\s*([^<]+?)\s*<\/b>/i.exec(h);
    const expl = /<b>\s*Explanation:\s*<\/b>([\s\S]*?)<p>/i.exec(h);
    if (!img) return null;
    const abs = u => /^https?:/i.test(u) ? u : 'https://apod.nasa.gov/apod/' + u;
    return { media_type: 'image', url: abs(img[1]), hdurl: big ? abs(big[1]) : '', title: title ? title[1] : 'Astronomy Picture of the Day',
      date: fmt_(new Date(), 'yyyy-MM-dd'), explanation: expl ? expl[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '' };
  } catch (err) { return null; }
}

function duolingo_(names) {
  const cache = CacheService.getScriptCache();
  return { users: String(names).split(',').map(x => x.trim()).filter(Boolean).slice(0, 4).map(u => {
    const key = 'duo:' + u.toLowerCase(), hit = cache.get(key);
    if (hit) return JSON.parse(hit);
    let out;
    try {
      // Same public address and fields as the MagicMirror module MMM-Duolingo-Streak.
      const r = uf_('https://www.duolingo.com/2017-06-30/users?username=' + encodeURIComponent(u),
        { muteHttpExceptions: true, headers: { 'User-Agent': 'Mozilla/5.0 (FamilyDashboard)' } });
      const d = r.getResponseCode() === 200 ? (JSON.parse(r.getContentText()).users || [])[0] : null;
      const cur = d && d.streakData && d.streakData.currentStreak;
      out = d ? { name: u, streak: cur ? cur.length || 0 : (d.streak || 0), endDate: cur ? String(cur.endDate || '').slice(0, 10) : '',
        xp: d.totalXp || 0, lang: d.learningLanguage || '' }
        : { name: u, error: r.getResponseCode() === 200 ? 'not found' : 'unavailable' };
    } catch (err) { out = { name: u, error: 'unavailable' }; }
    cache.put(key, JSON.stringify(out), 20 * 60);
    return out;
  }) };
}

/* ------------------------------------------------------ Spotify */

function spotifyRedirect_() { return ScriptApp.getService().getUrl(); }
function page_(title, body) {
  return HtmlService.createHtmlOutput('<div style="font:16px/1.5 system-ui,sans-serif;max-width:560px;margin:40px auto;padding:0 16px">' +
    '<h2>' + title + '</h2>' + body + '</div>').setTitle('Family Dashboard – ' + title).addMetaTag('viewport', 'width=device-width, initial-scale=1');
}
/** …/exec?spotify=login&key=ACCESSCODE – one-off: connect your Spotify account. */
function spotifyLoginPage_(key) {
  try { ensureMigrated_(); checkCode_(key); } catch (err) { return page_('Spotify', '<p>Open this from the Family Admin app (Widgets → Spotify → Connect Spotify).</p>'); }
  const id = String(inst_('SpotifyClientId') || '').trim();
  const redirect = spotifyRedirect_();
  if (!id || !String(inst_('SpotifyClientSecret') || '').trim()) {
    return page_('Connect Spotify', '<p>First add your Spotify <b>Client ID</b> and <b>Client secret</b> on the Installation tab of the admin app.</p>' +
      '<p>In your app at developer.spotify.com, set the Redirect URI to:</p><p><code style="word-break:break-all">' + redirect + '</code></p>');
  }
  const state = 'sp_' + Utilities.getUuid().replace(/-/g, '');
  CacheService.getScriptCache().put(state, '1', 900);
  const url = 'https://accounts.spotify.com/authorize?response_type=code&client_id=' + encodeURIComponent(id) +
    '&scope=' + encodeURIComponent('user-read-playback-state user-modify-playback-state user-read-currently-playing') +
    '&redirect_uri=' + encodeURIComponent(redirect) + '&state=' + state;
  return page_('Connect Spotify', '<p>Check that this exact Redirect URI is saved in your Spotify app (developer.spotify.com → your app → Settings):</p>' +
    '<p><code style="word-break:break-all">' + redirect + '</code></p>' +
    '<p><a href="' + url + '" target="_top" style="display:inline-block;background:#1db954;color:#fff;padding:12px 22px;border-radius:24px;text-decoration:none;font-weight:700">Connect Spotify</a></p>');
}
function spotifyCallback_(p) {
  const cache = CacheService.getScriptCache();
  if (!cache.get(p.state)) return page_('Spotify', '<p>That link has expired. Start again from the admin app.</p>');
  cache.remove(p.state);
  if (p.error) return page_('Spotify', '<p>Spotify said: ' + clean_(p.error) + '</p>');
  const tok = spotifyTokenCall_({ grant_type: 'authorization_code', code: p.code, redirect_uri: spotifyRedirect_() });
  if (!tok.refresh_token) return page_('Spotify', '<p>Spotify didn’t connect: ' + clean_(tok.error_description || tok.error || 'unknown error') + '</p>');
  PropertiesService.getScriptProperties().setProperty('spotifyRefresh', tok.refresh_token);
  cache.put('spAccess', tok.access_token, Math.max(60, (tok.expires_in || 3600) - 120));
  return page_('Spotify connected ✅', '<p>The Spotify widget on the dashboard will show what’s playing within a minute. You can close this page.</p>');
}
function spotifyTokenCall_(payload) {
  const id = String(inst_('SpotifyClientId') || '').trim(), secret = String(inst_('SpotifyClientSecret') || '').trim();
  const res = uf_('https://accounts.spotify.com/api/token', { method: 'post', payload: payload, muteHttpExceptions: true,
    headers: { Authorization: 'Basic ' + Utilities.base64Encode(id + ':' + secret) } });
  return JSON.parse(res.getContentText() || '{}');
}
function spotifyToken_() {
  const cache = CacheService.getScriptCache(), hit = cache.get('spAccess');
  if (hit) return hit;
  const props = PropertiesService.getScriptProperties();
  const tok = spotifyTokenCall_({ grant_type: 'refresh_token', refresh_token: props.getProperty('spotifyRefresh') });
  if (!tok.access_token) {
    if (tok.error === 'invalid_grant') props.deleteProperty('spotifyRefresh');
    throw new Error('Spotify needs connecting again (' + (tok.error_description || tok.error || 'no token') + ')');
  }
  if (tok.refresh_token) props.setProperty('spotifyRefresh', tok.refresh_token);
  cache.put('spAccess', tok.access_token, Math.max(60, (tok.expires_in || 3600) - 120));
  return tok.access_token;
}
function spotifyApi_(method, path, retry) {
  const res = uf_('https://api.spotify.com/v1/me/player' + path, { method: method, muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + spotifyToken_() }, contentType: 'application/json', payload: method === 'get' ? undefined : '' });
  if (res.getResponseCode() === 401 && !retry) { CacheService.getScriptCache().remove('spAccess'); return spotifyApi_(method, path, true); }
  return res;
}
function spotifyNow_() {
  if (!PropertiesService.getScriptProperties().getProperty('spotifyRefresh')) return { needLogin: true, hasClient: !!String(inst_('SpotifyClientId') || '').trim() };
  const res = spotifyApi_('get', '?additional_types=episode');
  if (res.getResponseCode() === 204) return { idle: true };
  if (res.getResponseCode() !== 200) throw new Error('Spotify said ' + res.getResponseCode());
  const d = JSON.parse(res.getContentText() || '{}'), it = d.item || {};
  const imgs = (it.album || it.show || it || {}).images || it.images || [];
  return { playing: !!d.is_playing, track: it.name || '', artists: (it.artists || []).map(a => a.name).join(', ') || ((it.show || {}).name || ''),
    album: (it.album || {}).name || '', art: (imgs[0] || {}).url || '', progress: d.progress_ms || 0, duration: it.duration_ms || 0,
    device: (d.device || {}).name || '', at: Date.now() };
}
function spotifyControl_(op) {
  const map = { play: ['put', '/play'], pause: ['put', '/pause'], next: ['post', '/next'], previous: ['post', '/previous'] }[op];
  if (!map) throw new Error('Unknown Spotify button');
  const res = spotifyApi_(map[0], map[1]);
  const c = res.getResponseCode();
  if (c === 404) throw new Error('Nothing is playing on Spotify – start it on a phone or speaker first');
  if (c === 403) throw new Error('Spotify only allows this with Premium');
  if (c >= 300) throw new Error('Spotify said ' + c);
  Utilities.sleep(350);
  const w = layout_().widgets.find(x => x.type === 'spotify');
  return { ok: true, id: w ? w.id : '', data: spotifyNow_() };
}


/* ============================================================ SHEET MENU */
// A "🏠 Family Dashboard" menu in the Google Sheet: connect devices and check for updates without touching any code.

function onOpen() {
  try { freshCopy_(); } catch (e) { /* a simple trigger may not be allowed to – the first web request does it */ }
  const m = SpreadsheetApp.getUi().createMenu('🏠 Family Dashboard')
    .addItem('▶ Set up & connect my screen and phones', 'menuConnect')
    .addItem('Change family & calendar', 'menuFamily')
    .addItem(LOADED ? 'Load the newest program now' : 'Update the Google script now', 'menuUpdate');
  // With the loader, updates need no switch and use no saved versions, so these two aren't needed.
  if (!LOADED) m.addItem('Turn automatic updates on / off', 'menuAutoUpdate');
  m.addSeparator().addItem('Repair the tabs (runs setup)', 'setup');
  // (Through the loader, a menu item needs a matching name in the loader file – loaders from before 1.1 don't have this one.)
  if (!LOADED || typeof globalThis.menuWipe === 'function') m.addItem('Clear everything and start from scratch…', 'menuWipe');
  if (!LOADED) m.addItem('Start afresh in a new Sheet (copies everything)', 'menuStartAfresh');
  if (SpreadsheetApp.getActive().getSheetByName('_move')) m.addSeparator().addItem('▶ Finish moving here', 'finishMove');
  m.addToUi();
}
function appsBase_() {
  const b = String(inst_('AppsAddress') || APPS_DEFAULT).replace(/\/?$/, '/');
  if (LOADED) { try { LOADED.setBase(b); } catch (e) { /* fine */ } }
  return b;
}
function myUrl_() {
  const saved = PropertiesService.getScriptProperties().getProperty('execUrl');
  if (saved) return saved;
  const u = ScriptApp.getService().getUrl() || '';
  return /\/exec$/.test(u) ? u : '';
}
function dialog_(title, html, h) {
  SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput(
    '<div style="font:15px/1.5 Arial,sans-serif;color:#222">' + html + '</div>').setWidth(520).setHeight(h || 360), title);
}
/** Publish the web app without the Deploy screens (needs the Apps Script API switch, once per Google account). */
function autoPublish_() {
  const list = (scriptApi_('get', '/deployments').deployments || []).filter(d => d.deploymentConfig && d.deploymentConfig.versionNumber &&
    (d.entryPoints || []).some(e => e.entryPointType === 'WEB_APP'));
  let url = '';
  if (list.length) url = ((list[0].entryPoints || []).filter(e => e.webApp)[0] || {}).webApp.url || '';
  else {
    const ver = scriptApi_('post', '/versions', { description: 'Family Dashboard ' + SCRIPT_VERSION });
    const dep = scriptApi_('post', '/deployments', { versionNumber: ver.versionNumber, manifestFileName: 'appsscript', description: 'Family Dashboard' });
    url = ((dep.entryPoints || []).filter(e => e.webApp)[0] || {}).webApp.url || '';
  }
  if (url) PropertiesService.getScriptProperties().setProperty('execUrl', url);
  return url;
}
function menuConnect() {
  setup();
  let url = myUrl_(), apiErr = '';
  // Publishing by itself needs Google's Apps Script API; with the loader we don't ask for that, so it's the Deploy screen.
  if (!url && !LOADED) { try { url = autoPublish_(); } catch (err) { apiErr = err.message; } }
  if (!url && /Apps Script API/.test(apiErr)) {
    dialog_('One switch, then try again', '<p>To publish your dashboard by itself, Google needs one switch turned on (once for your Google account):</p><ol>' +
      '<li>Open <a href="https://script.google.com/home/usersettings" target="_blank">script.google.com/home/usersettings</a></li>' +
      '<li>Turn <b>Google Apps Script API</b> on</li><li>Come back here and choose <b>🏠 Family Dashboard → Connect my screen and phones</b> again</li></ol>' +
      '<p style="color:#888;font-size:13px">The same switch lets your dashboard keep itself up to date.</p>', 300);
    return;
  }
  if (!url) {
    dialog_('Publish it first', '<p>Your dashboard isn’t published yet. In this Sheet:</p><ol>' +
      '<li><b>Extensions → Apps Script</b></li><li><b>Deploy → New deployment</b> → ⚙ <b>Web app</b></li>' +
      '<li>Execute as <b>Me</b>, Who has access <b>Anyone</b> → <b>Deploy</b> (allow access)</li>' +
      '<li>Google asks for permission: <b>Authorize access</b> → your account → “Google hasn’t verified this app” is normal for your own copy: <b>Advanced → Go to Family Dashboard → Allow</b></li>' +
      '<li><b>Click the Web app URL</b> it shows once (a page opens – you can close it)</li></ol>' +
      '<p>Then come back here and choose <b>🏠 Family Dashboard → ▶ Set up &amp; connect my screen and phones</b> again.</p>', 420);
    return;
  }
  const link = appsBase_() + 'setup/#api=' + encodeURIComponent(url) + '&code=' + encodeURIComponent(inst_('AccessCode')) + '&from=sheet';
  dialog_('Published ✅', '<p>✅ Your Family Dashboard is published.</p>' +
    '<p>Click the button to carry on with setup. It opens the setup page already connected to this Sheet – nothing to type:</p>' +
    '<p><a href="' + link + '" target="_blank" style="display:inline-block;background:#3fa9f5;color:#fff;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:bold">Carry on with setup</a></p>' +
    '<p style="color:#888;font-size:13px">That link contains your private access code. Don’t share it outside the family.</p>', 300);
}
/** Opens the setup app straight at "Family & calendar": people, groups, categories and the children's page. */
function menuFamily() {
  const url = myUrl_();
  if (!url) { menuConnect(); return; }
  const link = appsBase_() + 'setup/#api=' + encodeURIComponent(url) + '&code=' + encodeURIComponent(inst_('AccessCode')) + '&go=family';
  dialog_('Change family & calendar', '<p>Add or rename people, change who is an adult or a child, rename the groups and the children’s page, and change the calendar categories and colours.</p>' +
    '<p><a href="' + link + '" target="_blank" style="display:inline-block;background:#3fa9f5;color:#fff;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:bold">Open Family &amp; calendar</a></p>' +
    '<p style="color:#888;font-size:13px">That link contains your private access code. Don’t share it outside the family.</p>', 280);
}
function menuUpdate() {
  let r;
  try { r = selfUpdate_('menu'); } catch (err) { r = { ok: false, message: err.message, apiOff: err.apiOff }; }
  if (r.upToDate) { dialog_('Up to date', '<p>✅ Your Google script is up to date (version ' + SCRIPT_VERSION + ').</p><p>The screen and phone apps update themselves.</p>', 200); return; }
  if (r.updated) {
    dialog_('Updated', '<p>✅ Updated the Google script from ' + clean_(r.from) + ' to <b>' + clean_(r.to) + '</b>. The screen and phones use it straight away.</p>' +
      (r.approve ? '<p><b>One more step:</b> this version needs a new permission. Choose 🏠 Family Dashboard → Update the Google script now once more and approve Google’s screen.</p>' : ''), 240);
    return;
  }
  const url = myUrl_();
  const link = appsBase_() + 'setup/#update' + (url ? '&api=' + encodeURIComponent(url) + '&code=' + encodeURIComponent(inst_('AccessCode')) : '');
  dialog_('Couldn’t update automatically', '<p>' + clean_(r.message || 'Something went wrong.') + '</p>' +
    (r.apiOff ? '<p>Open <a href="https://script.google.com/home/usersettings" target="_blank">script.google.com/home/usersettings</a>, switch <b>Google Apps Script API</b> on, then choose this menu item again.</p>' : '') +
    '<p>Or update by hand: <a href="' + link + '" target="_blank">show me how</a>.</p>', 320);
}
function menuAutoUpdate() {
  const on = !autoUpdateOn_(); chosen_(on);
  let r; try { r = setAutoUpdate_(on); } catch (err) { r = { ok: false, message: err.message }; }
  dialog_('Automatic updates', on
    ? (r.ok ? '<p>✅ Automatic updates are <b>on</b>. The Google script checks every hour, and straight away when the screen spots a new version.</p>' + (r.warning ? '<p>⚠ ' + clean_(r.warning) + '</p>' : '')
        : '<p>' + clean_(r.message) + '</p>')
    : '<p>Automatic updates are <b>off</b>. You’ll be told when there’s a new version, and can update from this menu.</p>', 260);
}

/* ------------------------------------------------------ automatic updates of this script */
// The script updates itself from <apps address>/setup/files/ using Google's Apps Script API:
// it writes the new files into this project, makes a new version and moves the existing web-app deployment to it,
// so the web address (and every connected screen and phone) stays the same.
// Needs: the "Google Apps Script API" switched on at script.google.com/home/usersettings (once per Google account),
// and the script.projects / script.deployments permissions listed in appsscript.json (approved with the others).
const UPDATE_FILES = [['Code', 'SERVER_JS', 'Code.gs'], ['Admin', 'HTML', 'Admin.html'], ['appsscript', 'JSON', 'appsscript.json']];
/** Sleep screen settings for the screen, tidied: minutes (0 = never), style, night hours as "HH:MM" pair or none. */
function sleepSettings_() {
  const mins = Math.max(0, Math.min(720, Math.round(Number(String(inst_('SleepMinutes') === '' ? 30 : inst_('SleepMinutes')).replace(/[^0-9.]/g, '')) || 0)));
  const style = /black/i.test(String(inst_('SleepStyle') || '')) ? 'black' : 'clock';
  const m = /(\d{1,2})[:.](\d{2})\s*[-–to]+\s*(\d{1,2})[:.](\d{2})/.exec(String(inst_('NightHours') || ''));
  const hm = (h, mm) => ('0' + Math.min(23, +h)).slice(-2) + ':' + ('0' + Math.min(59, +mm)).slice(-2);
  return { minutes: mins, style: style, nightFrom: m ? hm(m[1], m[2]) : '', nightTo: m ? hm(m[3], m[4]) : '' };
}
/** A person switched automatic updates on or off (so the one-off "switch them on" never overrides a deliberate off). */
function chosen_(on) { PropertiesService.getScriptProperties().setProperty('autoUpdateChosen', on ? 'on' : 'off'); }
function autoUpdateOn_() { return LOADED ? true : yes_(inst_('AutoUpdate'), false); }   // the loader always picks up new versions
function setAutoUpdate_(on) {
  setInst_('AutoUpdate', on ? 'Yes' : 'No');
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'autoUpdateTick').forEach(t => ScriptApp.deleteTrigger(t));
  if (!on) return { ok: true, autoUpdate: false };
  ScriptApp.newTrigger('autoUpdateTick').timeBased().everyMinutes(5).create();
  PropertiesService.getScriptProperties().setProperty('tickEvery', '5');
  let warning = '';
  if (!LOADED) { try { scriptApi_('get', '/content'); } catch (err) { warning = err.message; } }   // can it reach the Apps Script API?
  return { ok: true, autoUpdate: true, warning: warning };
}
/** Hourly (when automatic updates are on). */
function autoUpdateTick() {
  // Older installs checked less often: switch them to every 5 minutes.
  if (PropertiesService.getScriptProperties().getProperty('tickEvery') !== '5' && autoUpdateOn_()) { try { setAutoUpdate_(true); } catch (e) { /* next time */ } }
  try { licencePublic_(); } catch (e) { /* next time */ } if (autoUpdateOn_()) { try { selfUpdate_('timer'); } catch (err) { console.warn('Auto update: ' + err.message); } } }

function scriptApi_(method, path, body) { return scriptApiAt_(ScriptApp.getScriptId(), method, path, body); }
function scriptApiAt_(projectId, method, path, body) {
  const res = uf_('https://script.googleapis.com/v1/projects' + (projectId ? '/' + projectId : '') + path, {
    method: method, contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, payload: body ? JSON.stringify(body) : undefined });
  const code = res.getResponseCode(), text = res.getContentText();
  if (code >= 200 && code < 300) return text ? JSON.parse(text) : {};
  let msg = text; try { msg = JSON.parse(text).error.message; } catch (e) { /* plain text */ }
  const err = new Error(String(msg).slice(0, 300));
  if (/has not been used|is disabled|not enabled|SERVICE_DISABLED|User has not enabled the Apps Script API/i.test(text)) {
    // Two different switches give this. Say which, and for which Google account, with Google's own words.
    let who = ''; try { who = Session.getEffectiveUser().getEmail(); } catch (e) { /* not known */ }
    const proj = (/project[s]?[ /](\d{6,})/i.exec(text) || [])[1];
    if (proj && !/User has not enabled/i.test(text)) {
      err.message = 'The Apps Script API is off in the Google Cloud project this script is linked to (' + proj + '). Switch it on at ' +
        'https://console.cloud.google.com/apis/library/script.googleapis.com?project=' + proj + ' (signed in as ' + (who || 'the Sheet’s owner') + '), wait a few minutes, and try again.';
    } else {
      err.message = 'The Google Apps Script API is switched off for ' + (who || 'the Google account that owns the Sheet') + '. At script.google.com/home/usersettings make sure you’re signed in as ' +
        (who || 'that account') + ' (top right) and it says On. If it already does, wait 10 minutes – Google takes a while to notice – then try again.';
    }
    err.apiOff = true; err.google = String(msg).slice(0, 300);
  } else if (code === 403 && /scope|insufficient/i.test(text)) {
    err.message = 'The script hasn’t been given permission to update itself yet: in the Sheet choose 🏠 Family Dashboard → Update the Google script now, and approve Google’s screen.';
  } else if (/version/i.test(text) && /limit|maximum|200/i.test(text)) {
    err.message = 'Your script has reached Google’s limit of 200 saved versions. In Apps Script open Project history and delete old versions, then try again.';
  }
  throw err;
}
function deploymentId_() { const m = /\/macros\/s\/([^/]+)\/exec/.exec(myUrl_() || ''); return m ? m[1] : ''; }

/**
 * Bring this script up to the version on the apps address.
 * why: 'menu' (someone is at the Sheet, so new permissions can be approved), 'app' (a button or the screen), 'timer'.
 */
function selfUpdate_(why) {
  const P = PropertiesService.getScriptProperties();
  if (LOADED) {   // the loader fetches the newer program; it's used from the next request on
    try {
      const r = LOADED.refresh(why);
      if (r.updated) { P.setProperty('lastUpdate', JSON.stringify({ at: new Date().toISOString(), result: 'updated', from: r.from, to: r.to, how: why })); try { CacheService.getScriptCache().removeAll(['layout']); } catch (e) { /* fine */ } }
      return r;
    } catch (err) {
      P.setProperty('lastUpdate', JSON.stringify({ at: new Date().toISOString(), result: 'failed', message: err.message }));
      if (why === 'app' || why === 'menu') throw err;
      return { ok: false, message: err.message, error: err.message };
    }
  }
  const busy = Number(P.getProperty('updating') || 0);
  if (Date.now() - busy < 3 * 60000) return { ok: true, busy: true, message: 'An update is already running' };
  const base = appsBase_(), bust = '?t=' + Date.now();
  const fetchText = u => { const r = uf_(u, { muteHttpExceptions: true }); if (r.getResponseCode() !== 200) throw new Error('Couldn’t download ' + u.replace(/\?.*/, '') + ' (' + r.getResponseCode() + ')'); return r.getContentText(); };
  const latest = JSON.parse(fetchText(base + 'version.json' + bust));
  if (!newer_(latest.script, SCRIPT_VERSION)) return { ok: true, upToDate: true, version: SCRIPT_VERSION };
  const dep = deploymentId_();
  if (!dep) throw new Error('Open the web app address once so the script knows its own address, then try again');
  P.setProperty('updating', String(Date.now()));
  try {
    const files = {};
    UPDATE_FILES.forEach(f => { files[f[0]] = fetchText(base + 'setup/files/' + f[2] + bust); });
    // Make sure what we downloaded is whole and is the version advertised (GitHub can lag for a minute or two).
    const m = /const SCRIPT_VERSION = '([^']+)'/.exec(files.Code);
    if (!m || m[1] !== latest.script || files.Code.length < 20000 || !/function doGet\(/.test(files.Code)) throw new Error('The new files on GitHub aren’t ready yet (expected ' + latest.script + '). Try again in a few minutes.');
    const man = JSON.parse(files.appsscript);
    const cur = scriptApi_('get', '/content');
    const curMan = JSON.parse(((cur.files || []).find(f => f.name === 'appsscript') || {}).source || '{}');
    const newScopes = (man.oauthScopes || []).filter(x => (curMan.oauthScopes || []).indexOf(x) < 0);
    // A version that needs a new kind of permission would stop the web app until someone approves it – only do that when someone is at the Sheet.
    if (newScopes.length && curMan.oauthScopes && why !== 'menu') {
      P.setProperty('lastUpdate', JSON.stringify({ at: new Date().toISOString(), result: 'needs approval', to: latest.script }));
      const msg = 'This update needs a new permission. In the Sheet choose 🏠 Family Dashboard → Update the Google script now, and approve.';
      return { ok: false, approval: true, message: msg, error: msg };
    }
    const vu = versionsUsed_(true);
    if (vu && vu.used >= VERSION_MAX - 1) throw new Error('This script has used ' + vu.used + ' of Google’s ' + VERSION_MAX + ' saved versions, so it can’t update any more. Use “Start afresh in a new Sheet” (Family Admin → Settings → My data), or delete old versions in Apps Script → Project history.');
    const keep = (cur.files || []).filter(f => !UPDATE_FILES.some(u => u[0] === f.name)).map(f => ({ name: f.name, type: f.type, source: f.source }));
    scriptApi_('put', '/content', { files: UPDATE_FILES.map(f => ({ name: f[0], type: f[1], source: files[f[0]] })).concat(keep) });
    const ver = scriptApi_('post', '/versions', { description: 'Family Dashboard ' + latest.script });
    scriptApi_('put', '/deployments/' + dep, { deploymentConfig: { scriptId: ScriptApp.getScriptId(), versionNumber: ver.versionNumber,
      manifestFileName: 'appsscript', description: 'Family Dashboard ' + latest.script } });
    P.setProperty('lastUpdate', JSON.stringify({ at: new Date().toISOString(), result: 'updated', from: SCRIPT_VERSION, to: latest.script, how: why }));
    if (vu) P.setProperty('versionsUsed', JSON.stringify({ used: vu.used + 1, at: Date.now() }));
    try { CacheService.getScriptCache().removeAll(['layout']); } catch (e) { /* fine */ }
    return { ok: true, updated: true, from: SCRIPT_VERSION, to: latest.script, version: ver.versionNumber, approve: newScopes.length > 0 };
  } catch (err) {
    P.setProperty('lastUpdate', JSON.stringify({ at: new Date().toISOString(), result: 'failed', message: err.message, to: latest.script }));
    if (why === 'app' || why === 'menu') throw err;
    return { ok: false, message: err.message, error: err.message };
  } finally { P.deleteProperty('updating'); }
}

/* ============================================================== DIAGNOSTICS */
/** The last 25 errors any request hit (kept in the script's own settings). */
function logError_(msg) {
  try {
    if (/Wrong access code|Licence needed/.test(msg)) return;
    const P = PropertiesService.getScriptProperties();
    let log = []; try { log = JSON.parse(P.getProperty('errLog') || '[]'); } catch (e) { log = []; }
    log.unshift({ at: new Date().toISOString(), msg: String(msg).slice(0, 200) });
    P.setProperty('errLog', JSON.stringify(log.slice(0, 25)));
  } catch (e) { /* never let logging break a request */ }
}
/** Note which version a screen is running (at most every 10 minutes). */
function seen_(key, v) {
  try {
    const c = CacheService.getScriptCache(); if (c.get(key) === String(v)) return;
    c.put(key, String(v), 600);
    PropertiesService.getScriptProperties().setProperty(key, JSON.stringify({ v: String(v).slice(0, 20), at: new Date().toISOString() }));
  } catch (e) { /* not important */ }
}
function licenceServerVersion_() {
  const u = licenceServer_(); if (!u) return '';
  return cached_(CacheService.getScriptCache(), 'lsver', 3600, false, () => {
    try { const r = uf_(u + '?action=ping', { muteHttpExceptions: true }); return JSON.parse(r.getContentText()).version || '?'; } catch (e) { return 'unreachable'; }
  });
}
// Shown masked in the report; the real values go in its encrypted part, which only support can open.
const SECRET_KEYS = ['AccessCode', 'TomTomKey', 'RailDataKey', 'NasaKey', 'TransportApiId', 'TransportApiKey', 'SpotifyClientId', 'SpotifyClientSecret', 'LicenceKey', 'MovedTo', 'HomeAddress', 'CalendarIds'];
function mask_(v) { v = String(v || ''); return !v ? '(empty)' : v.length <= 6 ? '(set)' : '(set, ends …' + v.slice(-4) + ')'; }

/**
 * Everything support might need to see what's wrong. The readable part has no access code, keys, addresses, names
 * or calendar entries. Those go in "secrets", which the admin app encrypts with the support key (from the licence
 * server) before the report leaves the phone – only the seller's licence portal can unlock them.
 */
function diagnostics_(appVer) {
  const t0 = Date.now(), P = PropertiesService.getScriptProperties(), ss = SpreadsheetApp.getActive();
  const json = k => { try { return JSON.parse(P.getProperty(k) || 'null'); } catch (e) { return P.getProperty(k); } };
  const L = layout_(), lic = licencePublic_(), secrets = { install: {}, widgetSettings: {} };
  let latest = {}; try { latest = JSON.parse(uf_(appsBase_() + 'version.json?t=' + Date.now(), { muteHttpExceptions: true }).getContentText()); } catch (e) { latest = { error: e.message }; }
  const out = {
    made: new Date().toISOString(), timeZone: Session.getScriptTimeZone(),
    versions: { googleScript: SCRIPT_VERSION, layout: LAYOUT_VER, adminApp: appVer || '?', screenLastSeen: json('screenSeen'),
      latestOnGitHub: { app: latest.app, script: latest.script, licenceServer: latest.licenceServer }, licenceServer: licenceServerVersion_(),
      privacyAccepted: String(inst_('PrivacyAccepted') || '') },
    updates: { automatic: autoUpdateOn_(), checkEveryMinutes: P.getProperty('tickEvery') || '60', lastUpdate: json('lastUpdate'), savedVersions: versionsUsed_(true),
      triggers: ScriptApp.getProjectTriggers().map(t => t.getHandlerFunction()) },
    licence: { state: lic.state, ok: lic.ok, message: lic.message, keyEnds: lic.key || '', installId: installId_().slice(0, 8) + '…', server: licenceServer_() ? 'set' : 'none' },
    webApp: myUrl_() ? 'set' : 'not known yet', appsAddress: appsBase_(), moving: json('moving') ? 'in progress' : '',
    install: {}, tabs: ss.getSheets().map(sh => sh.getName() + ': ' + Math.max(0, sh.getLastRow() - 1) + ' rows' + (sh.isSheetHidden() ? ' (hidden)' : '')),
    pages: L.pages.map(p => [p.id, p.type, p.show ? 'shown' : 'hidden'].join(' · ')),
    recentErrors: (json('errLog') || []).map(e => e.at + ' (message in the locked part)'), widgets: [],
  };
  INSTALL.forEach(f => {
    const v = String(inst_(f.k) == null ? '' : inst_(f.k));
    if (SECRET_KEYS.indexOf(f.k) >= 0) { out.install[f.k] = mask_(v); secrets.install[f.k] = v; } else out.install[f.k] = v;
  });
  // What failing widgets (and the last "Set up bin days" that didn't work) asked, and what came back.
  const traces = {}; Object.keys(P.getProperties()).filter(k => /^trace:/.test(k)).forEach(k => { try { traces[k.slice(6)] = JSON.parse(P.getProperty(k)); } catch (e) { /* skip */ } });
  out.failureNotes = Object.keys(traces).map(k => k + ' (' + traces[k].at + ', ' + traces[k].calls.length + ' requests – details in the locked part)');
  secrets.failureNotes = traces;
  Object.assign(secrets, { webApp: myUrl_(), licenceServer: licenceServer_(), installId: installId_(), sheet: ss.getUrl(),
    pageTitles: L.pages.map(p => p.id + ': ' + p.title), family: family_(), recentErrors: json('errLog') || [], moving: json('moving'), scriptSettings: Object.keys(P.getProperties()).sort() });
  // Each widget: does its data load, how long it takes, what error it gives. Personal settings are masked.
  const PRIVATE_SETTINGS = /address|postcode|house|destinations|people|places|duolingo|folder|album|link|stop|feed|zones|dates|list|calendar|names/i;
  L.widgets.forEach(w => {
    const s0 = Date.now(), row = { id: w.id, type: w.type, page: w.page, size: w.size, shown: w.show };
    if (w.show && Date.now() - t0 < 200000) {
      try { const d = widgetData_(w, false); row.data = d == null ? 'none needed' : d.error ? 'ERROR: ' + d.error : 'ok'; } catch (err) { row.data = 'ERROR: ' + err.message; }
      row.ms = Date.now() - s0;
    }
    row.settings = {};
    Object.keys(w.settings || {}).forEach(k => {
      const v = w.settings[k];
      if (PRIVATE_SETTINGS.test(k) && v !== '' && v != null) { row.settings[k] = '(set)'; (secrets.widgetSettings[w.id] = secrets.widgetSettings[w.id] || {})[k] = v; }
      else row.settings[k] = v;
    });
    out.widgets.push(row);
  });
  const fam = secrets.family;
  out.family = { people: fam.people.length, children: fam.people.filter(p => p.role === 'child').length, onPoints: fam.people.filter(p => p.points).length, specials: fam.specials.length };
  out.tookSeconds = Math.round((Date.now() - t0) / 100) / 10;
  // The support key (public half), so the app can lock the secrets before the report leaves the phone.
  let key = null;
  try { const u = licenceServer_(); if (u) key = JSON.parse(uf_(u + '?action=supportKey', { muteHttpExceptions: true }).getContentText()).publicKey || null; } catch (e) { key = null; }
  return { ok: true, report: out, secrets: secrets, supportKey: key };
}

/* ============================================================== SAVED VERSIONS AND STARTING AFRESH */
/*
 * Google keeps at most 200 saved versions of a script, and every automatic update uses one. The admin app shows
 * how many are used and warns from 190. Two ways out:
 *  - delete old versions in Apps Script → Project history (keeps everything as it is), or
 *  - Start afresh: a brand-new Sheet with a new script (0 versions used). Every tab is copied across with all its
 *    data, the script's own settings come too, the licence moves with it, automatic updates are switched back on,
 *    and the old web address tells the screen and phones the new one, so they switch over by themselves.
 */
const VERSION_MAX = 200, VERSION_WARN = 190;
function versionsUsed_(force) {
  if (LOADED) return null;   // the loader never makes new versions
  const P = PropertiesService.getScriptProperties();
  let c = null; try { c = JSON.parse(P.getProperty('versionsUsed') || 'null'); } catch (e) { c = null; }
  if (!force && c && Date.now() - c.at < 12 * 3600e3) return { used: c.used, max: VERSION_MAX, warn: c.used >= VERSION_WARN };
  try {
    let used = 0, token = '';
    do {
      const r = scriptApi_('get', '/versions?pageSize=50' + (token ? '&pageToken=' + encodeURIComponent(token) : ''));
      used += (r.versions || []).length; token = r.nextPageToken || '';
    } while (token);
    P.setProperty('versionsUsed', JSON.stringify({ used: used, at: Date.now() }));
    return { used: used, max: VERSION_MAX, warn: used >= VERSION_WARN };
  } catch (err) {
    return c ? { used: c.used, max: VERSION_MAX, warn: c.used >= VERSION_WARN, stale: true } : null;   // Apps Script API off: unknown
  }
}
/** Old Sheet after a move: tell the screen and apps where the dashboard is now. */
function movedCheck_() {
  const to = String(inst_('MovedTo') || '');
  if (to) { const e = new Error('This dashboard has moved to a new Google Sheet'); e.moved = to; throw e; }
}
// Script settings that belong to this copy only (everything else is carried to the new Sheet).
const MOVE_SKIP = ['installId', 'licence', 'licenceServerAt', 'updating', 'claimUntil', 'claimed', 'execUrl', 'lastUpdate', 'moving', 'versionsUsed', 'dataVer', 'calVer'];

/** Step 1, in the old Sheet: make the new Sheet and script, copy everything, publish the new web app. */
function startAfresh_() {
  if (LOADED) throw new Error('Not needed any more: this dashboard loads its program from GitHub, so it never uses up Google’s saved versions. To move to another Google account, use “Move to a different Google account”.');
  const P = PropertiesService.getScriptProperties(), ss = SpreadsheetApp.getActive();
  if (inst_('MovedTo')) throw new Error('This dashboard has already moved to a new Sheet');
  const from = myUrl_();
  if (!from) throw new Error('Open the web app address once first, so the script knows its own address');
  const cur = scriptApi_('get', '/content');                    // also checks the Apps Script API is on
  // 1. New Sheet with a copy of every tab (data, formatting, hidden or not).
  const name = ss.getName().replace(/\s*\((old|new)[^)]*\)\s*$/i, '');
  const ns = SpreadsheetApp.create(name + ' (new)');
  const blank = ns.getSheets()[0];
  ss.getSheets().forEach(sh => { const c = sh.copyTo(ns); c.setName(sh.getName()); if (sh.isSheetHidden()) c.hideSheet(); });
  ns.deleteSheet(blank);
  ns.setSpreadsheetTimeZone(ss.getSpreadsheetTimeZone());
  // 2. A new script in it: the same files as this one, published as a web app.
  const proj = scriptApiAt_('', 'post', '', { title: 'Family Dashboard', parentId: ns.getId() });
  scriptApiAt_(proj.scriptId, 'put', '/content', { files: (cur.files || []).map(f => ({ name: f.name, type: f.type, source: f.source })) });
  const ver = scriptApiAt_(proj.scriptId, 'post', '/versions', { description: 'Family Dashboard ' + SCRIPT_VERSION + ' (moved)' });
  const dep = scriptApiAt_(proj.scriptId, 'post', '/deployments', { versionNumber: ver.versionNumber, manifestFileName: 'appsscript', description: 'Family Dashboard' });
  const web = (dep.entryPoints || []).map(e => e.webApp && e.webApp.url).filter(Boolean)[0] || '';
  if (!web) throw new Error('The new web app was made but its address wasn’t returned – open the new Sheet and use Deploy → Manage deployments');
  // 3. What the new script needs to carry on where this one is: its settings, a new installation number for the licence, where it came from.
  const all = P.getProperties(), props = {};
  Object.keys(all).filter(k => MOVE_SKIP.indexOf(k) < 0).forEach(k => { props[k] = all[k]; });
  const carry = { props: props, install: Utilities.getUuid(), from: from, to: web, fromSheet: ss.getUrl(), autoUpdate: autoUpdateOn_(), at: new Date().toISOString() };
  const cs = ns.insertSheet('_move');
  cs.getRange(1, 1).setValue('Moving in progress – open the 🏠 Family Dashboard menu and choose “Finish moving here”. This tab disappears afterwards.');
  cs.getRange(2, 1).setValue(JSON.stringify(carry));
  ns.setActiveSheet(cs);
  const moving = { sheetUrl: ns.getUrl(), sheetId: ns.getId(), url: web, install: carry.install, at: carry.at };
  P.setProperty('moving', JSON.stringify(moving));
  return { ok: true, sheetUrl: ns.getUrl(), url: web, message: 'New Sheet made. Open it, wait for the 🏠 Family Dashboard menu, and choose “Finish moving here”.' };
}

/** Step 2, in the new Sheet (from its menu, so Google can ask for permission once). */
function finishMove() {
  const ui = SpreadsheetApp.getUi(), ss = SpreadsheetApp.getActive(), cs = ss.getSheetByName('_move');
  if (!cs) { ui.alert('Nothing to finish – this Sheet isn’t part of a move.'); return; }
  const carry = JSON.parse(String(cs.getRange(2, 1).getValue()));
  const P = PropertiesService.getScriptProperties();
  P.setProperties(carry.props);
  P.setProperty('installId', carry.install);
  P.setProperty('execUrl', carry.to);
  setup();
  if (carry.autoUpdate) setAutoUpdate_(true);
  // Tell the old Sheet: it hands over the licence and points everyone here.
  let note = '';
  try {
    const r = uf_(carry.from, { method: 'post', contentType: 'text/plain', muteHttpExceptions: true,
      payload: JSON.stringify({ action: 'moveDone', code: inst_('AccessCode'), to: carry.to, install: carry.install }) });
    const d = JSON.parse(r.getContentText());
    if (!d.ok) note = d.error || 'the old Sheet didn’t answer';
    else if (d.licenceNote) note = d.licenceNote;
  } catch (err) { note = String(err.message || err); }
  ss.deleteSheet(cs);
  ss.rename(ss.getName().replace(/\s*\(new\)\s*$/i, ''));
  versionsUsed_(true);
  bumpVersions_();
  ui.alert('Moved', 'Everything is in this Sheet now.' + (carry.autoUpdate ? ' Automatic updates are on.' : '') +
    '\n\nThe screen and phones switch over by themselves within a few minutes (the old Sheet tells them the new address).' +
    '\n\nThe old Sheet is kept as a backup, renamed “(old)”. Keep it for a few weeks: it’s what points older links to here.' +
    (note ? '\n\nNote: ' + note : ''), ui.ButtonSet.OK);
}

/** Step 3, back in the old Sheet (called by the new one): move the licence, point everyone to the new address, stop working. */
function moveDone_(b) {
  const P = PropertiesService.getScriptProperties();
  let mv = null; try { mv = JSON.parse(P.getProperty('moving') || 'null'); } catch (e) { mv = null; }
  const okMove = mv && mv.install === b.install && (mv.mode === 'account' ? !!b.token && b.token === mv.token && /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(String(b.to)) : mv.url === b.to);
  if (!okMove) throw new Error('Not expecting this move');
  let licenceNote = '';
  const key = String(inst_('LicenceKey') || ''), server = licenceServer_();
  if (key && server) {
    try {
      const r = uf_(server, { method: 'post', contentType: 'application/json', muteHttpExceptions: true,
        payload: JSON.stringify({ action: 'move', key: key, install: installId_(), to: b.install, version: SCRIPT_VERSION }) });
      const d = JSON.parse(r.getContentText());
      if (!d.ok) licenceNote = 'The licence couldn’t be moved (' + (d.message || d.error || 'refused') + ') – ask the seller to release it, then enter it again.';
    } catch (err) { licenceNote = 'The licence server couldn’t be reached – if the new Sheet asks for the key, enter it again.'; }
  }
  setInst_('MovedTo', b.to);
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  setInst_('AutoUpdate', 'No');
  try { const ss = SpreadsheetApp.getActive(); ss.rename(ss.getName().replace(/\s*\((old|new)[^)]*\)\s*$/i, '') + ' (old – moved ' + Utilities.formatDate(new Date(), TZ, 'd MMM yyyy') + ')'); } catch (e) { /* fine */ }
  P.deleteProperty('moving');
  return { ok: true, licenceNote: licenceNote };
}
/* ---------- moving to a different Google account */
/**
 * Step 1, in the old account: a "moving pack" – a Sheet with a copy of every tab and the script's settings – shared
 * with the new account. Returns the setup link to open while signed in to the new account.
 */
function packForAccount_(email) {
  email = String(email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Type the new Google account’s email address');
  const me = String(Session.getEffectiveUser().getEmail() || '').toLowerCase();
  if (email === me) throw new Error('That’s the account the dashboard is in now – use “Start afresh” instead');
  if (inst_('MovedTo')) throw new Error('This dashboard has already moved');
  const from = myUrl_();
  if (!from) throw new Error('Open the web app address once first, so the script knows its own address');
  const P = PropertiesService.getScriptProperties(), ss = SpreadsheetApp.getActive();
  const pack = SpreadsheetApp.create('Family Dashboard – moving pack (' + Utilities.formatDate(new Date(), TZ, 'd MMM yyyy') + ')');
  const blank = pack.getSheets()[0];
  ss.getSheets().forEach(sh => { const c = sh.copyTo(pack); c.setName(sh.getName()); if (sh.isSheetHidden()) c.hideSheet(); });
  pack.deleteSheet(blank);
  const all = P.getProperties(), props = {};
  Object.keys(all).filter(k => MOVE_SKIP.indexOf(k) < 0).forEach(k => { props[k] = all[k]; });
  const token = Utilities.getUuid(), install = Utilities.getUuid();
  const cs = pack.insertSheet('_move');
  cs.getRange(1, 1).setValue('Moving pack – open the setup link from the Family Admin app while signed in to ' + email + '. Delete this Sheet once the move is finished.');
  cs.getRange(2, 1).setValue(JSON.stringify({ props: props, install: install, token: token, from: from, autoUpdate: autoUpdateOn_(), at: new Date().toISOString() }));
  pack.addEditor(email);
  P.setProperty('moving', JSON.stringify({ mode: 'account', email: email, sheetUrl: pack.getUrl(), packId: pack.getId(), token: token, install: install, at: new Date().toISOString() }));
  return { ok: true, packId: pack.getId(), email: email, setupLink: appsBase_() + 'setup/#go=import&pack=' + encodeURIComponent(pack.getId()) };
}
/**
 * Step 2, in the new account's new dashboard (from the setup app): bring every tab and setting across, take over the
 * licence, switch automatic updates back on, and tell the old dashboard to point everyone here.
 */
function importPack_(id) {
  id = String(id || '').replace(/[^\w-]/g, '');
  let src;
  try { src = SpreadsheetApp.openById(id); } catch (e) { throw new Error('Can’t open the moving pack – are you signed in to the account it was shared with?'); }
  const cs = src.getSheetByName('_move');
  if (!cs) throw new Error('That isn’t a Family Dashboard moving pack');
  const carry = JSON.parse(String(cs.getRange(2, 1).getValue()));
  const ss = SpreadsheetApp.getActive(), P = PropertiesService.getScriptProperties();
  const tmp = ss.insertSheet('_tmp' + Date.now());
  src.getSheets().filter(sh => sh.getName() !== '_move').forEach(sh => {
    const old = ss.getSheetByName(sh.getName()); if (old) ss.deleteSheet(old);
    const c = sh.copyTo(ss); c.setName(sh.getName()); if (sh.isSheetHidden()) c.hideSheet();
  });
  ss.deleteSheet(tmp);
  P.setProperties(carry.props);
  P.setProperty('installId', carry.install);
  P.deleteProperty('licence');
  setup();
  if (carry.autoUpdate) { try { setAutoUpdate_(true); } catch (e) { /* the user can switch it on */ } }
  const to = myUrl_();
  let note = '';
  try {
    const r = uf_(carry.from, { method: 'post', contentType: 'text/plain', muteHttpExceptions: true,
      payload: JSON.stringify({ action: 'moveDone', code: inst_('AccessCode'), to: to, install: carry.install, token: carry.token }) });
    const d = JSON.parse(r.getContentText());
    if (!d.ok) note = d.error || 'the old dashboard didn’t answer'; else if (d.licenceNote) note = d.licenceNote;
  } catch (err) { note = 'The old dashboard couldn’t be reached (' + err.message + ') – your screen and phones may need their new links.'; }
  bumpVersions_();
  return { ok: true, code: String(inst_('AccessCode')), note: note };
}

function menuStartAfresh() {
  const ui = SpreadsheetApp.getUi();
  if (ui.alert('Start afresh in a new Sheet', 'This makes a brand-new Google Sheet with its own script, copies every tab and setting into it, moves your licence, and switches automatic updates back on. The screen and phones follow by themselves.\n\nThis Sheet is kept as a backup. Go ahead?', ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  try {
    const r = startAfresh_();
    dialog_('Nearly done', '<p>✅ The new Sheet is ready.</p><p><b><a href="' + r.sheetUrl + '" target="_blank">Open the new Sheet</a></b>, wait a few seconds for the <b>🏠 Family Dashboard</b> menu, and choose <b>Finish moving here</b>. Google will ask you to allow the script, as it did the first time.</p>', 260);
  } catch (err) {
    dialog_('Couldn’t start afresh', '<p>' + clean_(err.message) + '</p>' + (/Apps Script API/.test(err.message) ? '<p>Switch on <b>Google Apps Script API</b> at <a href="https://script.google.com/home/usersettings" target="_blank">script.google.com/home/usersettings</a> and try again.</p>' : ''), 240);
  }
}

/* ============================================================== LICENCE */
/*
 * The seller's licence server says whether this dashboard's key is good. Its address is "licence" in version.json
 * on the apps address (read once a day); with no address there, licensing is off.
 * - No key yet: a 14-day trial from when licensing first applied, then the screen and apps ask for a key.
 * - The key is checked once a day. If the licence server can't be reached, the last good answer counts for 21 days.
 * - A key works on one dashboard at a time: each dashboard has a random installation number (nothing else is sent).
 */
const LICENCE = { trialDays: 14, graceDays: 21, recheckHours: 24 };
// What still works without a licence: enough to see the problem and put a key in.
const LICENCE_FREE = ['admin', 'licence', 'setLicence', 'acceptPrivacy', 'selfUpdate', 'autoUpdate', 'changeCode', 'family', 'saveInstall', 'versions', 'startAfresh', 'moveDone', 'releaseLicence', 'packForAccount', 'importPack', 'screens', 'replaceScreen', 'forgetScreen', 'renameScreen'];

function licenceServer_() {
  const P = PropertiesService.getScriptProperties();
  const at = Number(P.getProperty('licenceServerAt') || 0);
  if (Date.now() - at > 24 * 3600e3) {
    P.setProperty('licenceServerAt', String(Date.now()));
    try {
      const r = uf_(appsBase_() + 'version.json?t=' + Date.now(), { muteHttpExceptions: true });
      if (r.getResponseCode() === 200) P.setProperty('licenceServer', String(JSON.parse(r.getContentText()).licence || '').trim());
    } catch (err) { /* keep the last one */ }
  }
  const u = P.getProperty('licenceServer') || '';
  return /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(u) ? u : '';
}
function installId_() {
  const P = PropertiesService.getScriptProperties();
  let id = P.getProperty('installId');
  if (!id) { id = Utilities.getUuid(); P.setProperty('installId', id); }
  return id;
}
function askLicenceServer_(server, key) {
  const r = uf_(server, { method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    payload: JSON.stringify({ action: 'check', key: key, install: installId_(), version: SCRIPT_VERSION }) });
  if (r.getResponseCode() !== 200) throw new Error('The licence server said ' + r.getResponseCode());
  const d = JSON.parse(r.getContentText());
  if (!d.state) throw new Error(d.error || 'The licence server gave no answer');
  return d;
}
/** This dashboard's licence: { required, ok, state, message, daysLeft, name, key (last 5 characters) }. */
function licencePublic_(recheck) {
  const server = licenceServer_();
  if (!server) return { required: false, ok: true, state: 'off' };
  const P = PropertiesService.getScriptProperties(), key = String(inst_('LicenceKey') || '').trim();
  let st = {}; try { st = JSON.parse(P.getProperty('licence') || '{}'); } catch (e) { st = {}; }
  if (!st.since) { st.since = Date.now(); P.setProperty('licence', JSON.stringify(st)); }
  if (!key) {
    const left = Math.ceil(LICENCE.trialDays - (Date.now() - st.since) / 864e5);
    return left > 0 ? { required: true, ok: true, state: 'trial', daysLeft: left, screens: 1, message: 'Free trial: ' + left + ' day' + (left === 1 ? '' : 's') + ' left. Add your licence key to keep using the dashboard.' }
      : { required: true, ok: false, state: 'missing', message: 'The free trial has ended. Add your licence key to carry on.' };
  }
  if (recheck || st.key !== key || Date.now() - (st.checked || 0) > LICENCE.recheckHours * 3600e3) {
    try {
      const d = askLicenceServer_(server, key);
      Object.assign(st, { key: key, state: d.state, message: d.message || '', name: d.name || '', screens: d.screens || 1, checked: Date.now(), offline: '' });
      if (d.ok) st.lastOk = Date.now();
    } catch (err) {
      st.checked = Date.now() - (LICENCE.recheckHours - 1) * 3600e3;    // try again in an hour
      st.offline = String(err && err.message || err);
      if (st.key !== key) Object.assign(st, { key: key, state: 'unchecked', message: 'The licence server couldn’t be reached to check the key' });
    }
    P.setProperty('licence', JSON.stringify(st));
  }
  const tail = key.slice(-5);
  if (st.state === 'active') {
    const left = Math.ceil(LICENCE.graceDays - (Date.now() - (st.lastOk || 0)) / 864e5);
    if (left > 0) return { required: true, ok: true, state: 'active', name: st.name, key: tail, screens: st.screens || 1, message: st.offline && left < LICENCE.graceDays - 2
      ? 'Licensed. The licence server hasn’t answered for a while – it needs to within ' + left + ' days.' : 'Licensed' + (st.name ? ' to ' + st.name : '') };
    return { required: true, ok: false, state: 'offline', key: tail, message: 'The licence couldn’t be checked for ' + LICENCE.graceDays + ' days. Check the internet connection, or contact the seller.' };
  }
  return { required: true, ok: false, state: st.state || 'unchecked', key: tail, message: st.message || 'The licence key couldn’t be checked' };
}
function requireLicence_() {
  const L = licencePublic_();
  if (!L.ok) throw new Error('Licence needed: ' + L.message);
}
/** Check a new key with the licence server and, if it's good, keep it. */
function setLicence_(key) {
  key = String(key || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^FD(?=.{20}$)/, '');
  if (key.length !== 20) throw new Error('A licence key is FD- then four groups of five letters and numbers, e.g. FD-AB2CD-EF3GH-JK4LM-NP5QR');
  key = 'FD-' + key.match(/.{5}/g).join('-');
  const server = licenceServer_();
  if (!server) { setInst_('LicenceKey', key); return { ok: true, licence: licencePublic_(), message: 'Saved. (Licences aren’t being checked yet.)' }; }
  let d;
  try { d = askLicenceServer_(server, key); } catch (err) { throw new Error('Couldn’t reach the licence server – try again in a minute (' + err.message + ')'); }
  if (!d.ok) throw new Error(d.message || 'That key wasn’t accepted');
  setInst_('LicenceKey', key);
  const P = PropertiesService.getScriptProperties();
  let st = {}; try { st = JSON.parse(P.getProperty('licence') || '{}'); } catch (e) { st = {}; }
  Object.assign(st, { key: key, state: 'active', message: d.message, name: d.name || '', screens: d.screens || 1, checked: Date.now(), lastOk: Date.now(), offline: '', since: st.since || Date.now() });
  P.setProperty('licence', JSON.stringify(st));
  bumpVersions_();
  return { ok: true, licence: licencePublic_(), message: d.message || 'Licensed' };
}

/** Free this dashboard's key so it can be entered in a new one (starting again from scratch). This dashboard then goes back to asking for a key. */
function releaseLicence_() {
  const key = String(inst_('LicenceKey') || ''), server = licenceServer_();
  if (!key) throw new Error('This dashboard has no licence key');
  if (server) {
    const r = uf_(server, { method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      payload: JSON.stringify({ action: 'release', key: key, install: installId_() }) });
    const d = JSON.parse(r.getContentText());
    if (!d.ok) throw new Error(d.message || d.error || 'The licence server said no');
  }
  setInst_('LicenceKey', '');
  PropertiesService.getScriptProperties().deleteProperty('licence');
  return { ok: true, key: key, licence: licencePublic_() };
}

/* ---------- screens: how many screens may show the dashboard (from the licence; phones don't count) */
function screensAllowed_() { const L = licencePublic_(); return L.required ? Math.max(1, Number(L.screens) || 1) : 0; }   // 0 = no limit
function screensReg_() { try { return JSON.parse(PropertiesService.getScriptProperties().getProperty('screens') || '{}') || {}; } catch (e) { return {}; } }
function screensSave_(r) { PropertiesService.getScriptProperties().setProperty('screens', JSON.stringify(r)); }
function screenList_() {
  const r = screensReg_();
  return Object.keys(r).map(k => ({ id: k, name: r[k].name, fmt: r[k].fmt || '', first: new Date(r[k].first).toISOString(), last: new Date(r[k].last).toISOString() }))
    .sort((a, b) => b.last.localeCompare(a.last));
}
/**
 * A screen asking for its page. Known screens carry on; a new one joins if the licence has room. Screens not seen
 * for 30 days make room automatically. Otherwise it gets the list of screens it could take over from.
 */
function screenCheck_(p) {
  const dev = String(p.dev || '').replace(/[^\w-]/g, '').slice(0, 40);
  if (!dev) return null;                                   // older screens: not counted
  const reg = screensReg_(), now = Date.now(), name = String(p.dn || '').slice(0, 30) || 'Screen', fmt = String(p.fmt || '').slice(0, 10);
  if (reg[dev]) {
    if (now - reg[dev].last > 10 * 60000 || reg[dev].fmt !== fmt) { reg[dev].last = now; reg[dev].fmt = fmt; screensSave_(reg); }
    return null;
  }
  let changed = false;
  Object.keys(reg).forEach(k => { if (now - reg[k].last > 30 * 864e5) { delete reg[k]; changed = true; } });
  const allowed = screensAllowed_();
  if (!allowed || Object.keys(reg).length < allowed) { reg[dev] = { name: name, fmt: fmt, first: now, last: now }; screensSave_(reg); return null; }
  if (changed) screensSave_(reg);
  return { allowed: allowed, screens: screenList_() };
}
/** This screen takes the place of another one (single-screen licence, new screen). */
function replaceScreen_(b) {
  const dev = String(b.dev || '').replace(/[^\w-]/g, '').slice(0, 40), reg = screensReg_();
  if (!dev) throw new Error('No screen id');
  if (b.old) delete reg[String(b.old)];
  const allowed = screensAllowed_();
  if (allowed && Object.keys(reg).length >= allowed) throw new Error('Choose a screen to take over from');
  reg[dev] = { name: String(b.name || '').slice(0, 30) || 'Screen', fmt: String(b.fmt || '').slice(0, 10), first: Date.now(), last: Date.now() };
  screensSave_(reg);
  return { ok: true };
}

/** "2026.11.4" > "2026.11.3"? */
function newer_(a, b) {
  const x = String(a || '').split('.').map(Number), y = String(b || '').split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); }
  return false;
}
