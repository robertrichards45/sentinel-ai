/** "Open Spotify": the iPhone URL each app answers to (pure, unit-tested). */
const APPS: [RegExp, string, string][] = [
  [/^(apple )?maps?$/, 'maps://', 'Maps'], [/^google maps$/, 'comgooglemaps://', 'Google Maps'], [/^waze$/, 'waze://', 'Waze'],
  [/^(apple )?music$/, 'music://', 'Music'], [/^spotify$/, 'spotify://', 'Spotify'], [/^(youtube|you tube)$/, 'youtube://', 'YouTube'], [/^youtube music$/, 'youtubemusic://', 'YouTube Music'], [/^pandora$/, 'pandora://', 'Pandora'], [/^podcasts?$/, 'podcasts://', 'Podcasts'], [/^audible$/, 'audible://', 'Audible'],
  [/^netflix$/, 'nflx://', 'Netflix'], [/^hulu$/, 'hulu://', 'Hulu'], [/^(disney ?plus|disney\+)$/, 'disneyplus://', 'Disney+'], [/^(prime video|amazon prime video)$/, 'aiv://', 'Prime Video'], [/^(hbo ?max|max)$/, 'hbomax://', 'Max'],
  [/^(messages?|imessage|texts?)$/, 'sms:', 'Messages'], [/^(phone|dialer)$/, 'tel:', 'Phone'], [/^facetime$/, 'facetime://', 'FaceTime'], [/^(mail|email|apple mail)$/, 'message://', 'Mail'], [/^gmail$/, 'googlegmail://', 'Gmail'], [/^outlook$/, 'ms-outlook://', 'Outlook'],
  [/^whats ?app$/, 'whatsapp://', 'WhatsApp'], [/^(facebook|fb)$/, 'fb://', 'Facebook'], [/^messenger$/, 'fb-messenger://', 'Messenger'], [/^instagram$/, 'instagram://', 'Instagram'], [/^snap(chat)?$/, 'snapchat://', 'Snapchat'], [/^tik ?tok$/, 'tiktok://', 'TikTok'], [/^(twitter|x)$/, 'twitter://', 'X'], [/^discord$/, 'discord://', 'Discord'], [/^telegram$/, 'tg://', 'Telegram'], [/^signal$/, 'sgnl://', 'Signal'], [/^linked ?in$/, 'linkedin://', 'LinkedIn'], [/^reddit$/, 'reddit://', 'Reddit'], [/^pinterest$/, 'pinterest://', 'Pinterest'], [/^threads$/, 'barcelona://', 'Threads'],
  [/^(teams|microsoft teams)$/, 'msteams://', 'Teams'], [/^zoom$/, 'zoomus://', 'Zoom'], [/^slack$/, 'slack://', 'Slack'], [/^(word|microsoft word)$/, 'ms-word://', 'Word'], [/^(excel|microsoft excel)$/, 'ms-excel://', 'Excel'], [/^(powerpoint|microsoft powerpoint)$/, 'ms-powerpoint://', 'PowerPoint'], [/^(google )?drive$/, 'googledrive://', 'Google Drive'], [/^chrome$/, 'googlechrome://', 'Chrome'],
  [/^(calendar|apple calendar)$/, 'calshow://', 'Calendar'], [/^reminders$/, 'x-apple-reminderkit://', 'Reminders'], [/^notes$/, 'mobilenotes://', 'Notes'], [/^(photos|gallery|camera roll)$/, 'photos-redirect://', 'Photos'], [/^(files|my files)$/, 'shareddocuments://', 'Files'], [/^(settings|alice settings)$/, 'app-settings:', 'Settings'], [/^safari$/, 'x-web-search://', 'Safari'], [/^(app store)$/, 'itms-apps://', 'App Store'], [/^(wallet|apple wallet)$/, 'shoebox://', 'Wallet'], [/^shortcuts$/, 'shortcuts://', 'Shortcuts'], [/^(health|apple health)$/, 'x-apple-health://', 'Health'], [/^(find my|find my iphone)$/, 'findmy://', 'Find My'], [/^(clock|alarms?|timer)$/, 'clock-alarm://', 'Clock'], [/^(weather)$/, 'weather://', 'Weather'], [/^(calculator)$/, 'calc://', 'Calculator'],
  [/^uber$/, 'uber://', 'Uber'], [/^lyft$/, 'lyft://', 'Lyft'], [/^door ?dash$/, 'doordash://', 'DoorDash'], [/^uber eats$/, 'ubereats://', 'Uber Eats'], [/^grub ?hub$/, 'grubhub://', 'Grubhub'], [/^amazon$/, 'com.amazon.mobile.shopping://', 'Amazon'], [/^walmart$/, 'walmart://', 'Walmart'], [/^target$/, 'target://', 'Target'], [/^starbucks$/, 'starbucks://', 'Starbucks'], [/^(mc ?donald'?s)$/, 'mcdonalds://', "McDonald's"],
  [/^venmo$/, 'venmo://', 'Venmo'], [/^(cash ?app)$/, 'squarecash://', 'Cash App'], [/^paypal$/, 'paypal://', 'PayPal'], [/^(wheat|wheat ai)$/, 'wheatai://', 'Wheat'], [/^(meta ai|meta view)$/, 'fb-viewapp://', 'Meta AI'],
];
export function appUrl(name: string): { url: string; label: string } | null {
  const n = name.toLowerCase().replace(/\b(the|app|application|my)\b/g, ' ').replace(/[^a-z0-9+' ]/g, ' ').replace(/\s+/g, ' ').trim();
  for (const [re, url, label] of APPS) if (re.test(n)) return { url, label };
  return null;
}

/** The same apps on Android, by package name (opened with an Android launch intent). */
const ANDROID: Record<string, string> = {
  'Maps': 'com.google.android.apps.maps', 'Google Maps': 'com.google.android.apps.maps', 'Waze': 'com.waze',
  'Music': 'com.google.android.apps.youtube.music', 'Spotify': 'com.spotify.music', 'YouTube': 'com.google.android.youtube', 'YouTube Music': 'com.google.android.apps.youtube.music', 'Pandora': 'com.pandora.android', 'Podcasts': 'com.google.android.apps.podcasts', 'Audible': 'com.audible.application',
  'Netflix': 'com.netflix.mediaclient', 'Hulu': 'com.hulu.plus', 'Disney+': 'com.disney.disneyplus', 'Prime Video': 'com.amazon.avod.thirdpartyclient', 'Max': 'com.wbd.stream',
  'Messages': 'com.samsung.android.messaging', 'Phone': 'com.samsung.android.dialer', 'Mail': 'com.google.android.gm', 'Gmail': 'com.google.android.gm', 'Outlook': 'com.microsoft.office.outlook',
  'WhatsApp': 'com.whatsapp', 'Facebook': 'com.facebook.katana', 'Messenger': 'com.facebook.orca', 'Instagram': 'com.instagram.android', 'Snapchat': 'com.snapchat.android', 'TikTok': 'com.zhiliaoapp.musically', 'X': 'com.twitter.android', 'Discord': 'com.discord', 'Telegram': 'org.telegram.messenger', 'Signal': 'org.thoughtcrime.securesms', 'LinkedIn': 'com.linkedin.android', 'Reddit': 'com.reddit.frontpage', 'Pinterest': 'com.pinterest', 'Threads': 'com.instagram.barcelona',
  'Teams': 'com.microsoft.teams', 'Zoom': 'us.zoom.videomeetings', 'Slack': 'com.Slack', 'Word': 'com.microsoft.office.word', 'Excel': 'com.microsoft.office.excel', 'PowerPoint': 'com.microsoft.office.powerpoint', 'Google Drive': 'com.google.android.apps.docs', 'Chrome': 'com.android.chrome',
  'Uber': 'com.ubercab', 'Lyft': 'me.lyft.android', 'DoorDash': 'com.dd.doordash', 'Uber Eats': 'com.ubercab.eats', 'Grubhub': 'com.grubhub.android', 'Amazon': 'com.amazon.mShop.android.shopping', 'Walmart': 'com.walmart.android',
  'Venmo': 'com.venmo', 'Cash App': 'com.squareup.cash', 'PayPal': 'com.paypal.android.p2pmobile', 'Meta AI': 'com.facebook.stella',
  'Calendar': 'com.samsung.android.calendar', 'Reminders': 'com.samsung.android.app.reminder', 'Notes': 'com.samsung.android.app.notes', 'Photos': 'com.sec.android.gallery3d', 'Files': 'com.sec.android.app.myfiles', 'App Store': 'com.android.vending', 'Wallet': 'com.google.android.apps.walletnfcrel', 'Health': 'com.sec.android.app.shealth', 'Find My': 'com.google.android.apps.adm', 'Clock': 'com.sec.android.app.clockpackage', 'Weather': 'com.sec.android.daemonapp', 'Calculator': 'com.sec.android.app.popupcalculator', 'Settings': 'com.android.settings',
};
export function androidPackage(name: string): { pkg: string; label: string } | null {
  const a = appUrl(name);
  if (!a) return null;
  const pkg = ANDROID[a.label];
  return pkg ? { pkg, label: a.label } : null;
}
