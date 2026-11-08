/* Family Dashboard – help topics.
 * Each topic: id, icon, title, summary (one or two plain sentences for the front page), body (the full page).
 * The front page (../index.html) and the help page (./index.html) both read this list.
 */
window.FD_HELP = [
  {
    id: 'dot', icon: '🟢', title: 'The coloured dot on the screen',
    summary: 'The small dot next to the microphone tells you at a glance whether everything is working: green is fine, orange means something needs a look, red means the screen can’t get any information.',
    body: `
<h2>What the colours mean</h2>
<table class="t">
<tr><td><span class="dot g"></span> <b>Green</b></td><td>Everything is working. The screen is talking to your Google Sheet and every widget is getting its information.</td></tr>
<tr><td><span class="dot o"></span> <b>Orange</b></td><td>The screen is working, but <b>one thing</b> isn’t right – for example one widget can’t get its information, a setting is missing, or the Google script is out of date. Everything else carries on as normal.</td></tr>
<tr><td><span class="dot r"></span> <b>Red</b></td><td>The screen can’t reach your Google Sheet at all, so nothing is being updated. What you see is what it last knew.</td></tr>
</table>
<p>The dot flickers briefly while the screen is asking for new information – that’s normal.</p>
<h2>Finding out what’s wrong</h2>
<ol>
<li>Tap the small <b>version number</b> at the very bottom of the screen’s left-hand bar (or the dot itself).</li>
<li>A <b>Status</b> page opens. At the top it says, in plain words, what isn’t right.</li>
<li>Underneath is every widget, marked <b>Working</b> or with the problem it has.</li>
<li>Press <b>Check everything now</b> to test every widget there and then.</li>
</ol>
<p>Then look up the problem below:</p>
<ul>
<li>Red, “Can’t reach the Google Sheet” → <a href="#sheet">The screen can’t reach the Google Sheet</a></li>
<li>A widget with a problem → <a href="#widget">A widget shows a problem</a></li>
<li>“The Google script is version …” → <a href="#updates">Updates</a></li>
<li>Something about the licence → <a href="#licence">Licence key</a></li>
</ul>`
  },
  {
    id: 'sheet', icon: '🔴', title: 'The screen can’t reach the Google Sheet',
    summary: 'A red dot, or a red box saying “Not updated since…”, means the screen can’t get information from your Google Sheet. It’s nearly always the internet, or a link that has changed.',
    body: `
<p>Everything the dashboard shows comes from your own Google Sheet, over the internet. When the screen can’t reach it, the dot turns red and, after 15 minutes, a box at the top right says when it last got anything and why.</p>
<h2>Quick checks (in this order)</h2>
<ol>
<li><b>Is the internet working?</b> Try a website on the same computer or on your phone using the same Wi-Fi.</li>
<li><b>Tap the red box</b> (or the version number → <b>Try the Sheet again</b>). After a power cut or a sleep the PC sometimes needs a minute to reconnect.</li>
<li><b>Open the Family Admin app on your phone.</b> If that works, the Sheet is fine and the problem is only the screen’s link or its internet. If the app also can’t connect, the problem is with the Sheet itself (see below).</li>
</ol>
<h2>What the message says, and what to do</h2>
<dl>
<dt>“Wrong access code”</dt><dd>The access code was changed. Make a new start file: on your phone, <b>Family Admin → Settings → Access code &amp; devices → Connect your devices</b>, and on the PC replace the old start file with the new one.</dd>
<dt>“The Google script sent back an error page” or “needs approving again”</dt><dd>Google wants you to approve the script again (this happens after some updates). On a computer: open your Family Dashboard Google Sheet → <b>Extensions → Apps Script</b> → choose <b>setup</b> at the top → <b>Run</b> → follow Google’s “Review permissions” screens and press <b>Allow</b>. Then in the same window: <b>Deploy → Manage deployments → pencil ✎ → Version: New version → Deploy</b>.</dd>
<dt>“This PC is offline”</dt><dd>The computer has no internet. Check its Wi-Fi or cable.</dd>
<dt>“No answer from the Google script for 20 seconds”</dt><dd>Google was slow. It usually sorts itself out; if it keeps happening, check the internet speed.</dd>
<dt>“This dashboard has moved to a new Google Sheet”</dt><dd>Someone used “Start afresh”. The screen should follow automatically; if not, make a new start file as above.</dd>
</dl>
`
  },
  {
    id: 'widget', icon: '🧩', title: 'A widget shows a problem',
    summary: 'If one widget (weather, trains, photos…) shows a message instead of information, it’s usually a setting that’s missing or a free key that hasn’t been added.',
    body: `
<p>Each widget gets its information from a different free service. If one service is down, or the widget needs something you haven’t given it yet, just that widget shows a message and the dot turns orange. The rest keep working.</p>
<h2>Common messages</h2>
<dl>
<dt>Traffic or maps: “needs a TomTom key”</dt><dd>Add a free TomTom key: <b>Family Admin → Settings → API keys</b>. See <a href="#keys">Free API keys</a> for how to get one.</dd>
<dt>Trains: “needs a Rail Data key” or no trains</dt><dd>Add a National Rail key in <b>Settings → API keys</b>. Check the station codes in the Trains widget settings (three letters, e.g. BPW for Bristol Parkway – find yours at nationalrail.co.uk).</dd>
<dt>Photos: “Paste a Google Drive folder link”</dt><dd>See <a href="#photos">Photos</a>.</dd>
<dt>Buses: no departures</dt><dd>Needs the TransportAPI app ID and key in <b>Settings → API keys</b>, and the right bus stop in the widget’s settings.</dd>
<dt>Spotify: “Not connected”</dt><dd>In the Family Admin app open the Spotify widget and press <b>Connect Spotify</b>. Play/pause needs Spotify Premium.</dd>
<dt>Anything saying “unavailable”, “didn’t answer” or a number like 500</dt><dd>The outside service is having a problem. Wait an hour – it usually comes back by itself.</dd>
</dl>
<h2>How to change a widget’s settings</h2>
<ol><li>Open <b>Family Admin</b> on your phone.</li><li>On the Home page, tap the widget’s tile (or go to <b>Screen</b> and tap the widget).</li><li>Press <b>Change … settings</b>, make the change and <b>Save</b>. The screen picks it up within a minute.</li></ol>
<p>To see every widget’s status, tap the version number at the bottom of the screen’s side bar and press <b>Check everything now</b>.</p>`
  },
  {
    id: 'updates', icon: '⟳', title: 'Updates',
    summary: 'Everything updates itself: the screen and the phone apps within minutes, and your Google script too once automatic updates are on. You shouldn’t need to do anything.',
    body: `
<h2>What updates itself</h2>
<ul>
<li><b>The screen</b> checks every 5 minutes and updates itself when nobody is touching it. Its version number is at the bottom of the side bar.</li>
<li><b>The phone apps</b> update the next time you open them.</li>
<li><b>Your Google script</b> (the part inside your Google Sheet) checks every 5 minutes and updates itself – as long as <b>automatic updates</b> are on (they are, unless someone turned them off).</li>
</ul>
<h2>“Your Google script needs updating”</h2>
<p>If automatic updates are on, this message changes to “✔ The Google script has updated itself” within a few minutes – there’s nothing to do. If it stays:</p>
<ol>
<li>On your phone: <b>Family Admin → Settings → Updates → Update the Google script now</b>.</li>
<li>If it says “The Google Apps Script API is switched off”: on a computer, signed in to the Google account that owns the Sheet, open <a href="https://script.google.com/home/usersettings" target="_blank" rel="noopener">script.google.com/home/usersettings</a> and switch <b>Google Apps Script API</b> on. Then try step 1 again.</li>
<li>If it says the update “needs a new permission”: open your Google Sheet on a computer → <b>🏠 Family Dashboard → Update the Google script now</b>, and press <b>Allow</b> on Google’s screens.</li>
</ol>
<h2>Saved versions (Google’s limit of 200)</h2>
<p>Google keeps up to 200 saved versions of a script, and each update uses one. The Family Admin app (<b>Settings → Updates</b>) shows how many are left and warns you from 190. When it does, use <a href="#afresh">Start afresh</a> – it takes a couple of minutes and resets the count.</p>`
  },
  {
    id: 'connect', icon: '📱', title: 'Connect a new phone, tablet or screen',
    summary: 'Each phone or screen needs your family’s private link once. Get it from the Family Admin app on a phone that’s already connected, or from the setup app.',
    body: `
<p>Your dashboard is private: each device needs a link containing your family’s access code before it can show anything. You only do this once per device.</p>
<h2>A new phone (Family Admin or Family Calendar)</h2>
<ol>
<li>On a phone that’s <b>already connected</b>: <b>Family Admin → Settings → Access code &amp; devices → Connect your devices</b>. This shows QR codes.</li>
<li>On the new phone, point the camera at the right QR code and open the link.</li>
<li>Add it to the home screen: iPhone – Safari → Share → <b>Add to Home Screen</b>. Android – Chrome → ⋮ → <b>Install app</b>.</li>
</ol>
<h2>A new screen (Windows PC)</h2>
<ol>
<li>On the same <b>Connect your devices</b> page, download the <b>start file</b> for Windows.</li>
<li>Put it on the PC (for example in Documents) and double-click it. Answer Y to start with Windows.</li>
</ol>
<h2>A tablet or Raspberry Pi</h2>
<p>Open the <b>screen link</b> from the same page in the device’s browser (or scan the “Tablet or Pi screen” code on the main screen’s status page – tap its version number) and make it full-screen (on Android tablets, the free <i>Fully Kiosk Browser</i> app works well).</p>
<h2>How many screens?</h2>
<p>Your licence says how many <b>screens</b> (Corsair, tablet or computer) can show the dashboard at once – most are for one. Phones with Family Admin or Family Calendar don’t count. If a new screen would be one too many, it asks whether to <b>use this screen instead of</b> the old one. Screens not used for 30 days free their place by themselves, and you can disconnect one in <b>Family Admin → Settings → Access code &amp; devices</b>.</p>
<p>Setting up a <b>completely separate</b> dashboard (another home)? That needs its own licence – start with First-time setup.</p>
<p>Lost every connected device? On a computer open your Google Sheet → <b>🏠 Family Dashboard → Connect my screen and phones</b>.</p>`
  },
  {
    id: 'pi', icon: '🍓', title: 'Raspberry Pi or tablet: connecting a new screen',
    summary: 'A new screen shows a QR code. Scan it with your phone: if you’re new it takes you through setup first, otherwise one tap connects the screen.',
    body: `
<h2>Switching on a ready-made Raspberry Pi</h2>
<ol>
<li>Plug in the screen, the internet (a network cable is easiest) and the power. After a minute the dashboard opens full-screen.</li>
<li>It shows a <b>QR code</b> and a code like <code>K7Q2-M9XD</code>. Scan the QR code with your phone’s camera.</li>
<li><b>New to Family Dashboard?</b> Your phone opens setup. Follow it (about 30 minutes – easiest on a computer). At “Publish &amp; connect” press <b>Connect the screen</b>.</li>
<li><b>Already set up?</b> Press <b>Connect the screen</b> on your phone. (If the page says it can’t see your family, open Family Admin → Settings → Access code &amp; devices → <b>Connect a screen</b> and type the code.)</li>
<li>The screen connects within a few seconds and remembers it from then on.</li>
</ol>
<h2>No network cable?</h2>
<p>If the Pi was prepared with Wi-Fi set-up, it makes a Wi-Fi network called <b>FamilyDashboard-…</b>. Join it from your phone, choose your home Wi-Fi and type its password; the Pi then restarts on your Wi-Fi.</p>
<h2>Updates</h2>
<p>Nothing of the dashboard is stored on the Pi’s card – it loads the latest version from the internet every time, installs security updates by itself and restarts at 4 am. A Pi that’s been in a drawer for a year is up to date as soon as it’s switched on.</p>
<h2>Making your own Pi</h2>
<p>Install Raspberry Pi OS (64-bit, with desktop) with Raspberry Pi Imager, then in a terminal on the Pi run:<br><code>curl -fsSL https://russm1981.github.io/family-apps/downloads/raspberry-pi/setup-pi.sh | bash</code><br>and restart it.</p>
<h2>A tablet</h2>
<p>Open the Family Dashboard home page in the tablet’s browser → <b>Open the screen</b> (on Fire and Android tablets the free <i>Fully Kiosk Browser</i> keeps it full-screen and starts it by itself). It shows the same QR code to connect it.</p>`
  },
  {
    id: 'screens', icon: '▭', title: 'Which screens work best',
    summary: 'The dashboard is made for two shapes: the very wide Corsair XENEON EDGE, and a tablet or computer screen. On anything else it shows a warning and the dot goes orange.',
    body: `
<table class="t">
<tr><td><b>Wide</b></td><td>The Corsair XENEON EDGE (2560×720) and similar very wide screens. Four columns of widgets side by side.</td></tr>
<tr><td><b>Tablet / computer</b></td><td>A tablet held sideways – we test on the Amazon Fire HD 10 (1920×1200) – or a computer’s web browser. Two columns at a time: <b>swipe</b>, or tap the ‹ › at the bottom, to see the other two. It turns over by itself every 30 seconds when nobody is touching it.</td></tr>
</table>
<p>On a different shape – a phone, a tablet held upright, or a strangely sized window – the dashboard uses the nearer layout and shows <i>“This screen is an unusual shape”</i>. It will still work, but some things may not fit. On a tablet, turn it sideways; on a computer, make the browser window full-screen (F11).</p>
<p>The children’s page and the calendar are drawn a little smaller on tablets so everything fits.</p>`
  },
  {
    id: 'account', icon: '📦', title: 'Move to a different Google account',
    summary: 'You can move the whole dashboard to another Google account – for example a Gmail account just for the dashboard – and keep everything.',
    body: `
<p>Some families prefer the dashboard’s permissions (calendar, Gmail for parcels…) to be on a separate Google account rather than their main one. Moving takes about 10 minutes and nothing is lost.</p>
<ol>
<li>If you haven’t got one, make the new Google account (e.g. at gmail.com).</li>
<li>On your phone: <b>Family Admin → Settings → Updates → Move to a different Google account</b>. Type the new account’s email and press <b>Make a moving pack</b>. It gives you a link – copy it or send it to yourself.</li>
<li>On a <b>computer</b>, sign in to Google as the new account (a private/incognito window is easiest) and open the link. It’s the setup app, in “moving” mode.</li>
<li>Follow the setup steps for the new account: make the Sheet and publish it (steps 2 and 3).</li>
<li>At <b>Publish &amp; connect</b>, press <b>Bring everything across</b>.</li>
</ol>
<p>That’s it: people, points, tasks, lists, notes, settings and your licence move to the new account, and your screen and phones switch over by themselves. The old Sheet is kept as a backup – keep it for a few weeks, as it points older links to the new one, then you can delete it.</p>
<p>Calendars: the new account needs to see your family calendar. In Google Calendar (on the old account) share the calendar with the new account, then add its ID in <b>Family Admin → Settings → Home &amp; calendar</b>.</p>`
  },
  {
    id: 'licence', icon: '🎫', title: 'Licence key',
    summary: 'Your licence key is in your order email and looks like FD-XXXXX-XXXXX-XXXXX-XXXXX. Enter it once in the Family Admin app; new dashboards get a 14-day free trial first.',
    body: `
<h2>Entering your key</h2>
<ol><li>Find your order email – the key looks like <code>FD-AB2CD-EF3GH-JK4LM-NP5QR</code>.</li>
<li>On your phone: <b>Family Admin → Settings → Licence</b>, type it in and press <b>Check and save</b>. (Or in the setup app, at the “Publish &amp; connect” step.)</li></ol>
<h2>Messages</h2>
<dl>
<dt>“Free trial: N days left”</dt><dd>Everything works; add your key before the trial ends.</dd>
<dt>“That licence key isn’t recognised”</dt><dd>Check it against your email – it’s easy to mix up similar letters. Letters O and I and numbers 0 and 1 are never used.</dd>
<dt>“Already in use on another dashboard”</dt><dd>A key works on one dashboard at a time. If you moved to a new Sheet, free the key on the old one first (<b>Settings → Licence → Free up my licence key</b>), or ask the seller to release it.</dd>
<dt>“Use this screen instead?”</dt><dd>Your licence is for a set number of screens and they’re in use. Choose which screen this one replaces, or ask the seller for a licence with more screens. See <a href="#connect">Connect a new phone, tablet or screen</a>.</dd>
<dt>“Couldn’t be checked for 21 days”</dt><dd>The dashboard checks its key once a day. Check the internet; if it carries on, contact the seller.</dd>
</dl>`
  },
  {
    id: 'sleep', icon: '🌙', title: 'The screen goes dark or shows a small clock',
    summary: 'After 30 minutes without a touch the screen dims to a small clock to save power, and at night (23:30–06:30) it stays dim. One touch wakes it.',
    body: `
<p>This is the <b>sleep screen</b>. One touch anywhere wakes the dashboard – that touch doesn’t press anything underneath. A kitchen timer going off wakes it too.</p>
<h2>Changing it</h2>
<p><b>Family Admin → Settings → Screen &amp; sleep</b>: how many minutes before it sleeps (0 = never), a small clock or completely black, and the night hours.</p>
<h2>The screen goes completely black and a touch doesn’t wake it</h2>
<p>That’s Windows switching the display off, not the dashboard. The start file offers to fix this the first time (“keep the screen switched on?” – Yes). Or on the PC: <b>Settings → System → Power</b> (or <b>Power &amp; battery</b>) → <b>Screen and sleep</b> → set “Turn off my screen” and “Put my device to sleep” to <b>Never</b>. The dashboard’s own sleep screen then takes care of it.</p>`
  },
  {
    id: 'startup', icon: '🖥', title: 'The dashboard doesn’t start when the PC turns on',
    summary: 'The start file adds itself to Windows start-up the first time you run it. Double-click it once and it starts by itself from then on.',
    body: `
<ol>
<li>Find the <b>Start Family Dashboard</b> file on the PC (usually in Documents) and double-click it.</li>
<li>The first time, two Windows boxes ask: <b>start automatically when the PC is switched on?</b> and <b>keep the screen switched on?</b> Press <b>Yes</b> to both (recommended).</li>
<li>Your answers are remembered – from then on it starts by itself.</li>
</ol>
<p>Pressed No by mistake? On the PC open the folder <code>%LOCALAPPDATA%\\FamilyDashboardKiosk</code> (paste it into the File Explorer address bar), delete <code>startup-answer.txt</code> and/or <code>screen-answer.txt</code>, and run the start file again – it asks again.</p>
<p>To check: press <b>Windows key + R</b>, type <code>shell:startup</code> and press Enter – there should be a “Family Dashboard” shortcut.</p>
<p>If the PC starts before its internet is ready, the start file waits up to a minute for it. Windows may also show “Windows protected your PC” the first time – choose <b>More info → Run anyway</b>.</p>`
  },
  {
    id: 'keys', icon: '🔑', title: 'Free API keys (maps, trains, buses, NASA, Spotify)',
    summary: 'Some widgets use free services that need a key – a long code that identifies you. They’re free and take a few minutes each; you only need the ones for the widgets you use.',
    body: `
<p>An <b>API key</b> is like a free library card for an online service. You sign up on their website, they give you a long code, and you paste it into <b>Family Admin → Settings → API keys</b>. That page marks the ones your widgets need.</p>
<table class="t">
<tr><td><b>TomTom</b></td><td>Traffic times and the traffic map. Free at developer.tomtom.com.</td></tr>
<tr><td><b>National Rail</b></td><td>Train departures. Free from the Rail Data Marketplace (raildata.org.uk) or National Rail’s OpenLDBWS.</td></tr>
<tr><td><b>TransportAPI</b></td><td>Live bus times. Free at developer.transportapi.com (an app ID and an app key).</td></tr>
<tr><td><b>NASA</b></td><td>Optional – the picture of the day works without one.</td></tr>
<tr><td><b>Spotify</b></td><td>Only for the Spotify widget (a Client ID and secret from developer.spotify.com).</td></tr>
</table>
<p>Step-by-step guides with pictures are in the setup app’s <b>Free API keys</b> step – easiest on a computer.</p>`
  },
  {
    id: 'photos', icon: '🖼', title: 'Photos',
    summary: 'The photo slideshow shows the pictures in a Google Drive folder. The folder must be shared “Anyone with the link”.',
    body: `
<ol>
<li>In Google Drive make a folder (e.g. “Dashboard photos”) and put photos in it.</li>
<li>Right-click it → <b>Share</b> → under General access choose <b>Anyone with the link</b> → <b>Copy link</b>.</li>
<li><b>Family Admin</b> → tap the Photos tile → <b>Change Photos settings</b> → paste the link → <b>Save</b>.</li>
</ol>
<p>New photos in the folder appear within an hour. If it says the folder isn’t shared, repeat step 2.</p>`
  },
  {
    id: 'voice', icon: '🎙', title: 'Voice commands',
    summary: 'Tap the microphone at the bottom of the side bar, wait for the beep, and say things like “Ben add 15 points” or “add milk to the shopping list”.',
    body: `
<p>Tap the microphone, wait for the beep, then speak. The screen shows what it heard and does it after 4 seconds unless you tap Cancel.</p>
<table class="t">
<tr><td>Points</td><td>“Ben add 15 points” · “take 10 points off Josh” · “Alex has done make your bed”</td></tr>
<tr><td>Calendar</td><td>“calendar add Ben drums at 12 on Saturday” · “calendar add family zoo tomorrow”</td></tr>
<tr><td>Notes &amp; lists</td><td>“memo dentist moved to Thursday” · “add milk to the shopping list”</td></tr>
<tr><td>Timer</td><td>“timer 10 minutes” · “stop the timer”</td></tr>
<tr><td>Pages</td><td>“go to calendar” · say “help” for more</td></tr>
</table>
<h2>It says “The microphone is blocked” or hears nothing</h2>
<ul><li>Use the latest start file (it allows the microphone).</li>
<li>Windows: <b>Settings → Privacy &amp; security → Microphone</b> – turn on “Microphone access” and “Let desktop apps access your microphone”.</li>
<li>Windows: <b>Settings → System → Sound</b> – under Input choose your microphone and check the bar moves when you speak.</li>
<li>Voice recognition needs the internet.</li></ul>`
  },
  {
    id: 'points', icon: '★', title: 'Points, tasks and reminders',
    summary: 'Children earn points for tasks, lose them for penalties and cash them in for pocket money. Parents set it all up in the Family Admin app → Points.',
    body: `
<ul>
<li><b>Tasks</b> earn points. Each child sees their next three on the screen; tap one when it’s done. Tasks can be once-only, daily or always available.</li>
<li><b>Morning to-dos</b> are ticked off each morning (teeth, bag, shoes…).</li>
<li><b>Reminders</b> show on the day, and from 5 pm the evening before (PE kit, library book…).</li>
<li><b>Cashing in</b>: when a child reaches the target (e.g. 500 points = £5) the Cash in button appears.</li>
</ul>
<p>Set it up in <b>Family Admin → Points</b> → “Set up points”. Choose which children are on the points page in <b>Settings → Family &amp; children</b> (the ⭐ button).</p>
<p>Made a mistake? Each change shows an <b>Undo</b> for a few seconds, and you can remove any entry from a child’s statement.</p>`
  },
  {
    id: 'calendar', icon: '📅', title: 'Calendar colours and categories',
    summary: 'Entries are coloured by who they’re for. Start the title with a name – “Ben – Drums” – or a category like “Family – Zoo”.',
    body: `
<p>The dashboard reads your Google Calendar(s). It colours each entry by the <b>name at the start of its title</b>:</p>
<ul><li>“<b>Ben</b> – Drums” → Ben’s colour</li><li>“<b>Family</b> – Zoo” → Family</li><li>“<b>Holiday</b> – Cornwall” → Holiday (also counted down on the screen)</li></ul>
<p>Entries without a name are matched by words, e.g. “football” → Josh – set these in <b>Family Admin → Settings → Family &amp; children → Show matching words</b>.</p>
<p>Which calendars are shown, and which one new entries go into: <b>Settings → Home &amp; calendar</b>.</p>`
  },
  {
    id: 'afresh', icon: '🔄', title: 'Starting again: a fresh Sheet, or from scratch',
    summary: 'There are two ways to start again. “Start afresh” moves everything into a brand-new Sheet. “From scratch” sets up a new family from nothing, and your old Sheet is kept as a backup.',
    body: `
<h2>Start afresh – keep everything (recommended)</h2>
<p>Use this if Google’s limit of 200 saved versions is nearly reached, or the Sheet has got into a muddle. It makes a new Google Sheet and copies <b>everything</b> into it – people, points, tasks, lists, notes, settings, your licence – and the screen and phones switch over by themselves.</p>
<ol><li><b>Family Admin → Settings → Updates → Start afresh in a new Sheet</b>.</li>
<li>When it says the new Sheet is ready, open it on a computer, wait for the <b>🏠 Family Dashboard</b> menu and choose <b>Finish moving here</b>. Press <b>Allow</b> on Google’s screens.</li>
<li>Your old Sheet is kept and renamed “(old – moved …)”. Keep it for a few weeks – it points older links to the new one.</li></ol>
<h2>From scratch – a brand-new family set-up</h2>
<p>Use this for a completely clean start (new people, new settings). Your old Sheet isn’t changed, so it stays in your Google Drive as a backup.</p>
<ol><li>Free your licence key first: <b>Family Admin → Settings → Licence → Free up my licence key</b>. Note the key.</li>
<li>Run the <a href="../setup/">setup app</a> from the start, and enter the key when asked.</li>
<li>Connect your screen and phones again (the setup app shows how).</li></ol>`
  },
  {
    id: 'report', icon: '🩺', title: 'Send a diagnostics report to support',
    summary: 'If something’s wrong and you can’t fix it, make a diagnostics report and email it to support. Your private details in it are locked so only support can read them.',
    body: `
<h2>From your phone (easiest)</h2>
<ol><li><b>Family Admin → Settings → Versions &amp; diagnostics → Generate diagnostics</b>. It takes up to a minute.</li>
<li>Press <b>Share / email it</b> and send it to the support address in your order email, with a sentence about what’s wrong.</li></ol>
<h2>From the screen</h2>
<p>Tap the version number at the bottom of the side bar → <b>Save a diagnostics report to this PC</b>. It goes in the PC’s Downloads folder.</p>
<h2>What’s in it</h2>
<p>Version numbers, which widgets work, recent errors, and your settings. Your access code, API keys, addresses, names and calendar details are <b>encrypted</b> – they look like a block of random letters and only Family Dashboard support can unlock them. Nothing is sent anywhere until you send the file yourself.</p>`
  },
  {
    id: 'privacy', icon: '🔒', title: 'Your data and privacy',
    summary: 'Everything about your family stays in your own Google account. The apps and this website hold no family data.',
    body: `
<ul>
<li>Your calendar, points, lists, notes and settings live in <b>your own Google Sheet</b>, in your Google account.</li>
<li>The apps and the screen talk only to your Sheet, using your private link and access code.</li>
<li>Once a day your Sheet checks your licence key with the seller – it sends only the key, a random number for your dashboard and the version.</li>
<li>Diagnostics reports are only sent if you send them, and their private parts are encrypted.</li>
</ul>
<p>Read the full <a href="../privacy.html">privacy notice</a>.</p>`
  },
];
