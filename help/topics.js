/* Family Dashboard – help topics.
 * Each topic: id, icon, title, summary (one or two plain sentences for the front page), body (the full page).
 * The front page (../index.html) and the help page (./index.html) both read this list.
 */
window.FD_HELP = [
  {
    id: 'where', icon: '🧭', title: 'houserunner.app and the Family Admin app',
    summary: 'Setting things up is on houserunner.app, on a computer. Everyday things – the calendar, notes, lists and points – are in the Family Admin app on your phone.',
    body: `
<p><b>The houserunner.app (computer)</b> – <b>houserunner.app</b> – is in two parts. <b>⚙ Setup</b>: the Setup wizard, Screens (which widgets go where, and the calendar pages), Family, Rewards and System. <b>⚙ Widgets</b>: the calendar, notes, lists, reminders and the other widgets’ settings. <b>Help</b> and <b>Feedback</b> are at the top, by the title.</p>
<p><b>Family Admin (phone)</b> – six buttons along the top: <b>Calendar</b> (add an event, see what’s coming up), <b>Notes</b>, <b>Lists</b>, <b>Points</b> (give and take away points, tick off tasks), <b>Widgets</b> (each widget’s simple settings) and <b>More</b> (connect a display, add a phone, help and feedback). Everything else is set up at houserunner.app.</p>
<p>The first time you open houserunner.app on a computer that’s already set up for your family, it shows a code: on your phone, <b>Family Admin → More → Connect a display</b>. On the computer you used for setup, it connects by itself.</p>`
  },
  {
    id: 'permissions', icon: '🔐', title: 'Google permissions: what they’re for',
    summary: 'What Google asks you to allow when you set up HouseRunner, why each is needed – and using a separate Google account instead.',
    body: `
<p>HouseRunner’s program runs inside a Google Sheet in <b>your own Google account</b>, as you. Google asks you to allow what it uses. Nobody else – including us – gets access to your account.</p>
<h2>“Google hasn’t verified this app”</h2>
<p>On the way, Google shows a red ⚠ page saying the developer – <b>your own email address</b> – hasn’t had the app verified. That’s normal: the copy is yours, so Google counts you as its developer. Click <b>Advanced</b> (small, bottom left) → <b>Go to HouseRunner (unsafe)</b>. Don’t press <b>Back to safety</b>.</p>
<h2>All of them are needed – click Select all</h2>
<ul>
<li><b>See, edit, create and delete only the specific spreadsheets this application has been installed in</b> – your family’s information is kept in your own Sheet. HouseRunner can’t see your other spreadsheets.</li>
<li><b>Google Calendar</b> – the calendar screen, adding events, Today &amp; tomorrow, birthdays and the holiday countdown.</li>
<li><b>View your email messages and settings</b> (Gmail, read only) – the <b>Parcels</b> widget looks for delivery emails. It can’t change, send or delete anything.</li>
<li><b>Send email as you</b> – HouseRunner emails <b>you</b> a backup of your private links.</li>
<li><b>Google Drive</b> (see and download files) – the <b>Photo slideshow</b> from a folder you choose. Read only.</li>
<li><b>Google Tasks</b> – the <b>To-Do List (Google)</b>.</li>
<li><b>Connect to an external service</b> – downloading the HouseRunner program, live information (weather, trains, buses, traffic, flights, news) and the daily licence check.</li>
<li><b>Display and run third-party web content in prompts and sidebars</b> – the 🏠 HouseRunner menu and its windows in your Sheet.</li>
<li><b>Allow this application to run when you are not present</b> – the timers that keep it up to date and check the licence.</li>
<li><b>Create and update Google Apps Script projects and deployments</b> – so it can publish itself, without you using Google’s Deploy screens.</li>
</ul>
<p>If one is unticked, ▶ HouseRunner – SETUP asks again until all are allowed. If one is taken away later, only the part that needs it stops, and says which permission it needs.</p>
<h2>Rather not give your main Google account these permissions? Use a separate one</h2>
<p>If you’d rather not give your main Google account these permissions, make a <a href="https://accounts.google.com/signup" target="_blank" rel="noopener">new Google account</a> just for HouseRunner and do the setup signed in to it. The catch: the calendar, parcels, photos and tasks it shows are that account’s. Share your family calendar with the new account (Google Calendar → ⚙ Settings → your calendar → <b>Share with specific people</b>, “Make changes to events”), and add the new account on your phone if you want to add events or tasks from Google’s own apps. HouseRunner’s phone apps work either way.</p>
`
  },
  {
    id: 'setup', icon: '🧭', title: 'Help with first-time setup',
    summary: 'Setting up from your licence email: what to click at each step, and what to do where people most often get stuck.',
    body: `
<h2>Where to start</h2>
<p>Open your licence email <b>on a computer</b> (not a phone) and click the link in it. Setup starts in Google Sheets: click <b>Make my copy</b>, then in your new Sheet choose <b>🏠 HouseRunner → ▶ HouseRunner – SETUP</b>. A window shows each step; when it says <b>Published ✅</b>, click <b>Open HouseRunner</b>. That opens this website already connected, for three short steps – press <b>Next</b> at the bottom of each.</p>
<h2>Common sticking points</h2>
<dl>
<dt>“Make my copy” asks me to sign in, or copies into the wrong account</dt><dd>Sign in with the Google account the dashboard should live in – the one with the family calendar. If you’re signed into two accounts, Google uses the one shown at the top right; switch there and click <b>Make my copy</b> again.</dd>
<dt>There’s no 🏠 HouseRunner menu in my Sheet</dt><dd>It appears a few seconds after the Sheet opens, at the end of the menus along the top (after <b>Help</b>). If it doesn’t, reload the Sheet’s tab. Still nothing? Use <b>Publish it by hand instead</b> on the setup page.</dd>
<dt>It asks me to turn on the “Google Apps Script API”</dt><dd>That’s Google’s switch that lets your copy publish itself. Open <b>script.google.com/home/usersettings</b>, turn <b>Google Apps Script API</b> on, and go back to the SETUP window – it waits and carries on by itself (if you closed it, choose <b>🏠 HouseRunner → ▶ HouseRunner – SETUP</b> again). Check it’s the same Google account as your Sheet (top right). You only do it once.</dd>
<dt>I can’t find Deploy</dt><dd>You only need Deploy if you’re publishing by hand. It’s in the <b>Apps Script</b> tab, not the Sheet: in the Sheet click <b>Extensions → Apps Script</b>. <b>Deploy</b> is the blue button at the top right of that tab.</dd>
<dt>Deploy just spins, or Google keeps asking for permission</dt><dd>Nearly always the browser is signed in to more than one Google account. Open a private window (Chrome: Ctrl+Shift+N), sign in with only the account the Sheet is in, open the Sheet from drive.google.com and deploy there. Use Chrome or Edge and allow pop-ups. Press Save (💾) in Apps Script before Deploy. If it still spins, make a fresh copy and deploy that in the private window.</dd>
<dt>“Google hasn’t verified this app”</dt><dd>That’s normal: it’s your own private copy, which Google hasn’t reviewed. Click <b>Advanced</b> (small, bottom left), then <b>Go to HouseRunner (unsafe)</b>, then <b>Select all</b> → <b>Continue</b>.</dd>
<dt>The 🏠 HouseRunner menu doesn’t appear in the Sheet</dt><dd>Reload the Sheet’s tab (F5, or ⌘R on a Mac) and wait about 10 seconds – it appears after <b>Help</b> along the top.</dd>
<dt>The setup page says “Couldn’t reach that address” or “opened a Google page instead”</dt><dd>In Apps Script: <b>Deploy → Manage deployments → ✎ (pencil)</b>, check <b>Who has access</b> is <b>Anyone</b>, and click <b>Deploy</b>.</dd>
<dt>The licence key isn’t accepted</dt><dd>See <a href="#licence">Licence key</a>. You can carry on without it for 14 days and add it later.</dd>
<dt>I closed the setup page</dt><dd>Open it again from the same computer and browser – it remembers where you were. Or in your Sheet: <b>🏠 HouseRunner → ▶ HouseRunner – SETUP</b>.</dd>
</dl>`
  },
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
<dt>“Wrong access code”</dt><dd>The access code was changed, so this screen needs connecting again. On your phone: <b>Family Admin → More → Connect a display</b>. For the Windows PC, make a new start file at houserunner.app (<b>Setup wizard</b>, step “Connect your devices”) and replace the old one.</dd>
<dt>“The Google script sent back an error page” or “needs approving again”</dt><dd>Google wants you to approve the script again (this happens after some updates). On a computer: open your HouseRunner Google Sheet → <b>Extensions → Apps Script</b> → choose <b>setup</b> at the top → <b>Run</b> → follow Google’s “Review permissions” screens and press <b>Allow</b>. Then in the same window: <b>Deploy → Manage deployments → pencil ✎ → Version: New version → Deploy</b>.</dd>
<dt>“This PC is offline”</dt><dd>The computer has no internet. Check its Wi-Fi or cable.</dd>
<dt>“No answer from the Google script for 20 seconds”</dt><dd>Google was slow. It usually sorts itself out; if it keeps happening, check the internet speed.</dd>
<dt>“This dashboard has moved to a new Google Sheet”</dt><dd>Someone moved it (another Google account, or “Start afresh” on an older Sheet). The screen should follow automatically; if not, make a new start file as above.</dd>
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
<dt>Traffic or maps: “needs a TomTom key”</dt><dd>Add a free TomTom key: <b>houserunner.app → System → Data keys</b>. See <a href="#keys">Free API keys</a> for how to get one.</dd>
<dt>Trains: “needs a Rail Data key” or no trains</dt><dd>Add a National Rail key in <b>System → External data keys</b>. Check the station codes in the Trains widget settings (three letters, for example VIC for London Victoria – find yours at nationalrail.co.uk).</dd>
<dt>Photos: “Paste a Google Drive folder link”</dt><dd>See <a href="#photos">Photos</a>.</dd>
<dt>Buses: no departures</dt><dd>Needs the TransportAPI app ID and key in <b>System → External data keys</b>, and the right bus stop in the widget’s settings.</dd>
<dt>Spotify: “Not connected”</dt><dd>In the Family Admin app open the Spotify widget and press <b>Connect Spotify</b>. Play/pause needs Spotify Premium.</dd>
<dt>Anything saying “unavailable”, “didn’t answer” or a number like 500</dt><dd>The outside service is having a problem. Wait an hour – it usually comes back by itself.</dd>
</dl>
<h2>How to change a widget’s settings</h2>
<ol><li>Open <b>Family Admin</b> on your phone.</li><li>On the Home page, tap the widget’s tile (or go to <b>Screen</b> and tap the widget).</li><li>Press <b>Change … settings</b>, make the change and <b>Save</b>. The screen picks it up within a minute.</li></ol>
<p>To see every widget’s status, tap the version number at the bottom of the screen’s side bar and press <b>Check everything now</b>.</p>`
  },
  {
    id: 'updates', icon: '⟳', title: 'Updates',
    summary: 'Everything updates itself: the screen and the phone apps within minutes, and your Google script too. You shouldn’t need to do anything.',
    body: `
<h2>What updates itself</h2>
<ul>
<li><b>The screen</b> checks every 5 minutes and updates itself when nobody is touching it. Its version number is at the bottom of the side bar.</li>
<li><b>The phone apps</b> check when you open them, when you come back to them, and every 15 minutes, and restart themselves.</li>
<li><b>Your Google script</b> (the part inside your Google Sheet) runs a small <b>loader</b> that fetches the newest program every time, so new versions arrive within 5 minutes. Nothing to switch on.</li>
</ul>
<h2>“Your Google script needs updating”</h2>
<p>Your Sheet was set up before the loader existed. Switch to it once – the last time you’ll paste anything:</p>
<ol>
<li>On a computer open <b>System → Software updates</b>, or open your Sheet → <b>Extensions → Apps Script</b>.</li>
<li>Replace everything in <b>Code.gs</b> with <b>Loader.gs</b> (System → Software updates has a Copy button; it’s also on GitHub in Scripts/MainSpreadsheet). Replace <b>Admin.html</b> and <b>appsscript.json</b> too.</li>
<li>Save, then <b>Deploy → Manage deployments → ✎ → Version: New version → Deploy</b>. Your links stay the same.</li>
</ol>
<p>The old way (the script rewriting itself) needs Google’s Apps Script API switched on in two places – your account settings and the script’s own Google Cloud project, which Google often won’t let you open. The loader avoids all of that.</p>
<p>Very rarely an update needs a new kind of Google permission or a newer loader. Family Admin then says so: paste <b>Loader.gs</b> and <b>appsscript.json</b> again as above, deploy a new version, and press <b>Allow</b> on Google’s screens.</p>
<h2>Saved versions (Google’s limit of 200)</h2>
<p>With the loader this doesn’t apply – the script never changes, so no versions are used. Without it: Google keeps up to 200 saved versions of a script, and each update uses one. The Family Admin app (<b>Settings → System → Updates</b>) shows how many are left and warns you from 190. When it does, use <a href="#afresh">Start afresh</a> – it takes a couple of minutes and resets the count.</p>`
  },
  {
    id: 'connect', icon: '📱', title: 'Connect a new phone, tablet or screen',
    summary: 'Each phone or screen needs your family’s private link once. Get it from the Family Admin app on a phone that’s already connected, or from houserunner.app on a computer.',
    body: `
<p>Your dashboard is private: each device needs a link containing your family’s access code before it can show anything. You only do this once per device.</p>
<h2>houserunner.app on a computer</h2>
<p>Open it: it shows a code like <b>K7Q2-M9XD</b> and a QR code. On your phone: <b>Family Admin → More → Connect a display</b>, type the code (or scan the QR code with the phone’s camera) – the computer connects within a few seconds. If the computer’s browser already has another of the apps connected, it just offers <b>Use the same family</b>.</p>
<h2>A new phone (Family Admin or Family Dashboard)</h2>
<ol>
<li>On a phone that’s <b>already connected</b>: <b>Family Admin → More → Add a phone</b>. This shows QR codes.</li>
<li>On the new phone, point the camera at the right QR code and open the link.</li>
<li>Add it to the home screen: iPhone – Safari → Share → <b>Add to Home Screen</b>. Android – Chrome → ⋮ → <b>Install app</b>.</li>
</ol>
<h2>A new display</h2>
<p>On the new display, start the dashboard – it shows a code like <b>K7Q2-M9XD</b>. Then, on a phone or computer that’s already set up for your family: <b>Family Admin → More → Connect a display</b>, or <b>houserunner.app → Home → Type a display’s code</b> – and type it in.</p>
<ul>
<li><b>Corsair XENEON EDGE (running Windows), or any Windows PC:</b> see <a href="#windows">Corsair XENEON EDGE or a Windows PC</a>.</li>
<li><b>Raspberry Pi or tablet:</b> see <a href="#pi">Raspberry Pi or tablet</a>.</li>
<li><b>Any other computer:</b> go to <b>houserunner.app/dashboard</b> in a browser and press <b>F11</b> for full-screen.</li>
</ul>
<h2>How many screens?</h2>
<p>Your licence says how many <b>displays</b> (Corsair XENEON EDGE, tablet or computer) can show the dashboard at once – most are for one. Phones – Family Admin and the Family Dashboard app – don’t count. If a new screen would be one too many, it asks whether to <b>use this screen instead of</b> the old one. Screens not used for 30 days free their place by themselves, and you can disconnect one in <b>houserunner.app → System → Devices and Phones</b> on a computer.</p>
<p>Setting up a <b>completely separate</b> dashboard (another home)? That needs its own licence – start with First-time setup.</p>
<p>Lost every connected device? On a computer open your Google Sheet → <b>🏠 HouseRunner → Connect my screen and phones</b>.</p>`
  },
  {
    id: 'windows', icon: '🖥', title: 'Corsair XENEON EDGE or a Windows PC: connecting a new display',
    summary: 'On the PC, go to houserunner.app/windows, download the zip file, unzip it and double-click Start HouseRunner. Then type the code it shows into houserunner.app.',
    body: `
<ol>
<li>On the PC the Corsair XENEON EDGE is plugged into, go to <b>houserunner.app/windows</b> in a browser and press <b>Download</b>.</li>
<li>It’s a small <b>zip file</b>. Open your Downloads folder, right-click it → <b>Extract All…</b>, and put the folder somewhere permanent, such as <b>Documents</b>.</li>
<li>In the folder, double-click <b>Start HouseRunner</b>. If Windows says “Windows protected your PC”: <b>More info → Run anyway</b>.</li>
<li>The first time it asks two Yes/No questions: start when the PC turns on, and keep the screen switched on. <b>Yes</b> to both is best.</li>
<li>The dashboard opens full screen and shows a code like <b>K7Q2-M9XD</b>. On a phone or computer that’s already set up for your family: <b>Family Admin → More → Connect a display</b>, or <b>houserunner.app → Home → Type a display’s code</b>.</li>
</ol>
<p>Close the dashboard with <b>Alt+F4</b>. Nothing needs updating by hand – it fetches the newest version each time it starts. If it doesn’t start with the PC, see <a href="#startup">The dashboard doesn’t start when the PC turns on</a>.</p>`
  },
  {
    id: 'pi', icon: '🍓', title: 'Raspberry Pi or tablet: connecting a new display',
    summary: 'A new display shows a QR code. Scan it with your phone: if you’re new it takes you through setup first, otherwise one tap connects the display.',
    body: `
<h2>Switching on a ready-made Raspberry Pi</h2>
<ol>
<li>Plug in the monitor, the internet (a network cable is easiest) and the power. After a minute the dashboard opens full-screen.</li>
<li>It shows a <b>QR code</b> and a code like <code>K7Q2-M9XD</code>. Scan the QR code with your phone’s camera.</li>
<li><b>New to HouseRunner?</b> Your phone opens setup. Follow it (about 30 minutes – easiest on a computer). At “Publish &amp; connect” press <b>Connect the display</b>.</li>
<li><b>Already set up?</b> Press <b>Yes – Connect it</b> on your phone. (If the page says it can’t see your family, open Family Admin → More → <b>Connect a display</b> and type the code.)</li>
<li>The display connects within a few seconds and remembers it from then on.</li>
</ol>
<h2>No network cable?</h2>
<p>If the Pi was prepared with Wi-Fi set-up, it makes a Wi-Fi network called <b>Pi-HouseRunner</b>. Join it from your phone, choose your home Wi-Fi and type its password; the Pi then restarts on your Wi-Fi.</p>
<h2>Updates</h2>
<p>Nothing of the dashboard is stored on the Pi’s card – it loads the latest version from the internet every time, installs security updates by itself and restarts at 4 am. A Pi that’s been in a drawer for a year is up to date as soon as it’s switched on.</p>
<h2>Making your own Pi</h2>
<p>Follow the steps at <a href="../pi/">houserunner.app/pi</a>. In short: put Raspberry Pi OS (64-bit, with desktop) on the card with Raspberry Pi Imager, then in the Pi’s Terminal type<br><code>curl -sL houserunner.app/pi.sh | bash</code><br>and restart it.</p>
<h2>A tablet</h2>
<p>Go to <b>houserunner.app/dashboard</b> in the tablet’s browser (on Fire and Android tablets the free <i>Fully Kiosk Browser</i> keeps it full-screen and starts it by itself – set that address as its Start URL). It shows the same QR code and code to connect it.</p>`
  },
  {
    id: 'screens', icon: '▭', title: 'Which screens work best',
    summary: 'The dashboard is made for two shapes: the very wide Corsair XENEON EDGE, and a tablet or computer screen. On anything else it shows a warning and the dot goes orange.',
    body: `
<table class="t">
<tr><td><b>Wide</b></td><td>The Corsair XENEON EDGE (2560×720) and similar very wide screens. Four columns of widgets side by side.</td></tr>
<tr><td><b>Tablet</b></td><td>A tablet held sideways – we test on the Amazon Fire HD 10 (1920×1200). Two columns at a time: a page with more than two columns gets two buttons in the side bar (the house with a 1, the house with a 2). Tap the screen once and it goes full screen – or add it to the home screen (browser menu → Add to Home screen) and open it from there. A tablet doesn’t use the dashboard’s sleep screen: just press its power button. The children’s page shows 3 children a screen, each card stacked to fit, with more buttons if needed.</td></tr>
<tr><td><b>Computer</b></td><td>A computer’s web browser shows the Corsair XENEON EDGE layout at its own shape, scaled to fit the window. The calendar’s <b>Year</b> view is a wall planner – a row for each month – using the whole window (on a tablet too).</td></tr>
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
<li>On a computer (or in Family Admin): <b>System → My data (Google) → Move to a different Google account</b>. Type the new account’s email and press <b>Make a moving pack</b>. It gives you a link – copy it or send it to yourself.</li>
<li>On a <b>computer</b>, sign in to Google as the new account (a private/incognito window is easiest) and open the link. It’s the setup wizard, in “moving” mode.</li>
<li>Follow the setup steps for the new account: make the Sheet and publish it (steps 2 and 3).</li>
<li>At <b>Publish &amp; connect</b>, press <b>Bring everything across</b>.</li>
</ol>
<p>That’s it: people, points, tasks, lists, notes, settings and your licence move to the new account, and your screen and phones switch over by themselves. The old Sheet is kept as a backup – keep it for a few weeks, as it points older links to the new one, then you can delete it.</p>
<p>Calendars: the new account needs to see your family calendar. In Google Calendar (on the old account) share the calendar with the new account, then add its ID in <b>houserunner.app → System → Locations &amp; home</b>.</p>`
  },
  {
    id: 'licence', icon: '🎫', title: 'Licence key',
    summary: 'Your licence key is in your order email and looks like FD-XXXXX-XXXXX-XXXXX-XXXXX. Enter it once in the Family Admin app; new dashboards get a 14-day free trial first.',
    body: `
<h2>Entering your key</h2>
<ol><li>Find your order email – the key looks like <code>FD-AB2CD-EF3GH-JK4LM-NP5QR</code>.</li>
<li>When you first set up, the setup wizard has a step <b>“Your licence key”</b> – the link in your email fills it in for you.</li>
<li>Later: on a computer, <b>houserunner.app → System → Licence</b>, paste it in and press <b>Check and save</b>. If the screen says <b>“Add your licence key”</b>, you can also type it straight in on the screen.</li></ol>
<h2>Messages</h2>
<dl>
<dt>“Free trial: N days left”</dt><dd>Everything works; add your key before the trial ends.</dd>
<dt>“That licence key isn’t recognised”</dt><dd>Check it against your email – it’s easy to mix up similar letters. Letters O and I and numbers 0 and 1 are never used.</dd>
<dt>“Already in use on another dashboard”</dt><dd>A key works on one dashboard at a time, and it belongs to the first dashboard it was entered on. If it was typed into an app that was connected to <b>someone else’s</b> dashboard (for example a phone that was set up for a relative’s family), it went to theirs. Ask the seller to <b>release</b> it, then enter it again. If you moved to a new Sheet, free the key on the old one first (<b>Settings → System → Licence → Free up my licence key</b>).</dd>
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
<p>On a computer, <b>houserunner.app → System → Display Sleep</b>: how many minutes before it sleeps (0 = never), a small clock or completely black, and the night hours.</p>
<h2>The screen goes completely black and a touch doesn’t wake it</h2>
<p>That’s Windows switching the display off, not the dashboard. The start file (the one you download from <b>houserunner.app/windows</b>) offers to fix this the first time (“keep the screen switched on?” – Yes). Or on the PC: <b>Settings → System → Power</b> (or <b>Power &amp; battery</b>) → <b>Screen and sleep</b> → set “Turn off my screen” and “Put my device to sleep” to <b>Never</b>. The dashboard’s own sleep screen then takes care of it.</p>`
  },
  {
    id: 'startup', icon: '🖥', title: 'The dashboard doesn’t start when the PC turns on',
    summary: 'The start file adds itself to Windows start-up the first time you run it. Double-click it once and it starts by itself from then on.',
    body: `
<ol>
<li>Find the <b>Start HouseRunner</b> file on the PC – in the folder you unzipped (usually in Documents) – and double-click it. Don’t have it? <a href="#windows">Download it again</a>.</li>
<li>The first time, two Windows boxes ask: <b>start automatically when the PC is switched on?</b> and <b>keep the screen switched on?</b> Press <b>Yes</b> to both (recommended).</li>
<li>Your answers are remembered – from then on it starts by itself.</li>
</ol>
<p>Pressed No by mistake? On the PC open the folder <code>%LOCALAPPDATA%\\FamilyDashboardKiosk</code> (paste it into the File Explorer address bar), delete <code>startup-answer.txt</code> and/or <code>screen-answer.txt</code>, and run the start file again – it asks again.</p>
<p>To check: press <b>Windows key + R</b>, type <code>shell:startup</code> and press Enter – there should be a “HouseRunner” shortcut (on older set-ups, “Family Dashboard”).</p>
<p>The start file updates itself: it only holds your link, and fetches the latest launcher from the internet every time it starts – you never need to download it again unless your access code changes.</p>
<p>If the PC starts before its internet is ready, the start file waits up to a minute for it. Windows may also show “Windows protected your PC” the first time – choose <b>More info → Run anyway</b>.</p>`
  },
  {
    id: 'keys', icon: '🔑', title: 'Free API keys (maps, trains, buses, NASA, Spotify)',
    summary: 'Some widgets use free services that need a key – a long code that identifies you. They’re free and take a few minutes each; you only need the ones for the widgets you use.',
    body: `
<p>An <b>API key</b> is like a free library card for an online service. You sign up on their website, they give you a long code, and you paste it into <b>houserunner.app → System → Data keys</b>. That page marks the ones your widgets need.</p>
<table class="t">
<tr><td><b>TomTom</b></td><td>Traffic times and the traffic map. Free at developer.tomtom.com.</td></tr>
<tr><td><b>National Rail</b></td><td>Train departures. Free from the Rail Data Marketplace (raildata.org.uk) or National Rail’s OpenLDBWS.</td></tr>
<tr><td><b>TransportAPI</b></td><td>Live bus times. Free at developer.transportapi.com (an app ID and an app key).</td></tr>
<tr><td><b>NASA</b></td><td>Optional – the NASA Daily Picture works without one.</td></tr>
<tr><td><b>Spotify</b></td><td>Only for the Spotify widget (a Client ID and secret from developer.spotify.com).</td></tr>
</table>
<p>Step-by-step guides with pictures are in the setup wizard’s <b>External data keys</b> step – easiest on a computer.</p>`
  },
  {
    id: 'bins', icon: '🗑', title: 'Bin days',
    summary: 'The Bins widget works anywhere in the UK. Other → Bins → Set up bin days: type your postcode, we find your council, and read your bin days from it if we can – otherwise you type your bins in once.',
    body: `
<ol>
<li>On a computer: <b>houserunner.app → Other → Bins → Set up bin days</b>.</li>
<li>Type your postcode → <b>Find my council</b>. Check it’s the council that collects your bins (choose another from the list if not). Councils marked ✔ can be read automatically.</li>
<li><b>Council marked ✔:</b> most need your home’s <b>property number (UPRN)</b> – find it at <a href="https://www.findmyaddress.co.uk/search" target="_blank" rel="noopener">findmyaddress.co.uk</a> (search your postcode, pick your address, copy the UPRN). Press <b>Try it</b>: if your next collections appear, press <b>Use this</b>. If not, you can enter your bins by hand.</li>
<li><b>Any other council:</b> enter your bins by hand – for each bin, what it is, how often (every 1–4 weeks) and its next collection date. You see the next few collections before you save. Or, if your council’s bin-day page has an “add to calendar” link, use that.<br><b>Shortcut:</b> open <b>✨ Let an AI assistant look it up</b> – copy the ready-written request into ChatGPT, Claude or Gemini, then paste its answer back and your bins fill themselves in. Check the dates against the council’s calendar before saving.</li>
</ol>
<p>More councils are being added over time; ones you’ve set up by hand can switch over later. Bank-holiday changes aren’t known when you’ve entered your bins by hand.</p>
<p>If it stops working, a diagnostics report (System → About &amp; diagnostics) includes what the council’s service said, so support can see why.</p>`
  },
  {
    id: 'voice', icon: '🎙', title: 'Voice commands',
    summary: 'Tap the microphone at the bottom of the side bar, wait for the beep, and say things like “Oliver add 15 points” or “add milk to the shopping list”.',
    body: `
<p>Tap the microphone, wait for the beep, then speak. The screen shows what it heard and does it after 4 seconds unless you tap Cancel.</p>
<table class="t">
<tr><td>Points</td><td>“Oliver add 15 points” · “take 10 points off Amelia” · “Noah has done make your bed”</td></tr>
<tr><td>Calendar</td><td>“calendar add Oliver drums at 12 on Saturday” · “calendar add family zoo tomorrow”</td></tr>
<tr><td>Notes &amp; lists</td><td>“memo dentist moved to Thursday” · “add milk to the shopping list”</td></tr>
<tr><td>Timer</td><td>“timer 10 minutes” · “stop the timer”</td></tr>
<tr><td>Pages</td><td>“go to calendar” · say “help” for more</td></tr>
</table>
<h2>It says “The microphone is blocked” or hears nothing</h2>
<ul><li>The start file allows the microphone by itself (it keeps itself up to date).</li>
<li>Windows: <b>Settings → Privacy &amp; security → Microphone</b> – turn on “Microphone access” and “Let desktop apps access your microphone”.</li>
<li>Windows: <b>Settings → System → Sound</b> – under Input choose your microphone and check the bar moves when you speak.</li>
<li>Voice recognition needs the internet.</li></ul>`
  },
  {
    id: 'points', icon: '★', title: 'Rewards: points, Reward Tasks and reminders',
    summary: 'Children earn points for Reward Tasks, lose them for penalties and cash them in for pocket money. Parents set it up at houserunner.app → Rewards, and give points day to day in the Family Admin app → Points.',
    body: `
<ul>
<li><b>Reward Tasks</b> earn points. Each child sees their next three on the screen; tap one when it’s done. Tasks can be once-only, daily or always available.</li>
<li><b>Morning to-dos</b> are ticked off each morning (teeth, bag, shoes…).</li>
<li><b>Reminders</b> show on the day, and from 5 pm the evening before (sports kit, library book…).</li>
<li><b>Cashing in</b>: when a child reaches the target (e.g. 500 points = £5) the Cash in button appears.</li>
</ul>
<p>Set it up in <b>Rewards</b>. Choose which children take part in <b>Family</b> (the ⭐ button). Each of them gets a <b>points widget</b> – a full-height card you can put on any screen, or two on one, in <b>Screens</b>.</p>
<p>Made a mistake? Each change shows an <b>Undo</b> for a few seconds, and you can remove any entry from a child’s statement.</p>`
  },
  {
    id: 'calendar', icon: '📅', title: 'Calendar colours and categories',
    summary: 'Each category is one of Google Calendar’s event colours. For one person, put their name in brackets at the end: “Drums (Oliver)”.',
    body: `
<p>The dashboard reads your family’s Google Calendar. Each <b>category</b> – a family group like “Children” or “Adam &amp; Eve”, Family (everyone), or a general one like Holiday or School holiday – is one of <b>Google Calendar’s event colours</b>. When you make an event in Google Calendar or Gmail, pick its colour and it lands in that category on the dashboard.</p>
<ul><li>An event for <b>one person</b>: colour it <b>Graphite</b> and put their name in brackets at the end – “Drums <b>(Oliver)</b>”. The dashboard shows it in Oliver’s colour, or his group’s.</li>
<li>An event with <b>no colour</b> goes in <b>Other</b>.</li>
<li>Adding an event from the dashboard does all this for you – pick General, a group or one person.</li></ul>
<p>Older events written as “Oliver – Drums” or “Family – Zoo” still work. To put them all into the new form at once: <b>Screens → your calendar page → Tidy up your Google calendar</b>.</p>
<p>The categories, who’s in each group, and what each calendar page shows on its key (up to 9, plus Other; up to two as lines under the day; or hidden) are all set on the calendar page in <b>Screens</b>.</p>
<h2>Birthday and Holiday</h2>
<p>These two categories are always there – the Birthdays and Holiday countdown widgets need them. You can still show them, hide them, or show them as Other. While one is showing, the calendar has a button for it: <b>🎂</b> shows only the birthdays and <b>🌴</b> only the holidays (in full, even if Holiday is normally a line under the day). Press it again to see everything.</p>`
  },
  {
    id: 'afresh', icon: '🔄', title: 'Starting again: a fresh Sheet, or from scratch',
    summary: 'Want a clean start? Set up a new family from scratch – your old Sheet is kept as a backup. (Moving everything to another Google account is a separate option.)',
    body: `
<h2>Start afresh – only for older Sheets</h2>
<p>Dashboards that use the <b>loader</b> (everything set up from November 2026, or switched over – see <a href="#updates">Updates</a>) never need this: Google’s limit of 200 saved versions doesn’t apply to them. On an older Sheet that’s nearly at the limit, <b>houserunner.app → System → My data (Google) → Start afresh in a new Sheet</b> copies everything into a new Sheet – but switching to the loader is easier.</p>
<h2>From scratch – a brand-new family set-up</h2>
<p>Use this for a completely clean start (new people, new settings). Your old Sheet isn’t changed, so it stays in your Google Drive as a backup.</p>
<ol><li>Free your licence key first: <b>houserunner.app → System → Licence → Free up my licence key</b> (on a computer). Note the key.</li>
<li>Run the <a href="../setup/guide/">setup wizard</a> from the start, and enter the key when asked.</li>
<li>Connect your screen and phones again (the setup wizard shows how).</li></ol>`
  },
  {
    id: 'report', icon: '🩺', title: 'Ask support for help (with a diagnostics report)',
    summary: 'Send a support request from the Feedback button – tick “attach a diagnostics report” and support can see exactly what’s wrong. You can follow its progress there too.',
    body: `
<h2>The easiest way</h2>
<ol><li>On a computer, open the <b>houserunner.app</b> and press <b>💬 Feedback</b> at the top, by the title. (In the Family Admin app on your phone it’s under <b>Help &amp; support</b>.)</li>
<li>Choose <b>Support request</b>, say what’s wrong in a sentence or two, and leave <b>Attach a diagnostics report</b> ticked.</li>
<li>Press <b>Send</b>. You get a reference number, and the same page shows your requests and support’s replies as they come in.</li></ol>
<h2>From the screen</h2>
<p>Tap the version number at the bottom of the side bar → <b>Save a diagnostics report to this PC</b>. It goes in the PC’s Downloads folder, if support asks you for it.</p>
<h2>What’s in a diagnostics report</h2>
<p>Version numbers, which widgets work, recent errors, and your settings. Your access code, API keys, addresses, names and calendar details are <b>encrypted</b> – they look like a block of random letters and only HouseRunner support can unlock them. Nothing is sent unless you send it.</p>`
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
