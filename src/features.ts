/**
 * Alice feature matrix — the single source of truth shown in the app.
 * Status meanings:
 *   tested     logic verified by automated tests on the PC (real glasses data where possible)
 *   built      code written and compiles; NOT yet tested on the iPhone
 *   partial    works with a stated limitation
 *   blocked    needs something we don't have yet (named in `needs`)
 *   unsupported hardware/iOS cannot do it
 *   proposed   designed, not built
 * Nothing is "working on phone" until you run it and we update this file.
 */
export type Status = 'tested' | 'built' | 'partial' | 'blocked' | 'unsupported' | 'proposed';
export type Feature = { id: string; area: string; name: string; status: Status; detail: string; needs?: string };

export const FEATURES: Feature[] = [
  // Glasses link
  { id: 'ble-decode', area: 'Glasses', name: 'Decode glasses status packets', status: 'tested', detail: 'Media count, clock, address, busy flag decoded from real captures (10/10 tests).' },
  { id: 'ble-connect', area: 'Glasses', name: 'Connect + auto-reconnect', status: 'built', detail: 'Finds "G2" by name/manufacturer ID, reuses iOS connection, reconnects 3 s after drop.' },
  { id: 'fw-guard', area: 'Glasses', name: 'Firmware-update write block', status: 'built', detail: 'Only commands copied byte-for-byte from the official app are sent; FEF5 (firmware update) is never reachable.' },
  { id: 'battery', area: 'Glasses', name: 'Battery level + low alert', status: 'tested', detail: 'Heartbeat value tracked 100 -> 99 -> 95 over a night of use; shown on Home, spoken warning when low.' },
  { id: 'rec-indicator', area: 'Privacy', name: 'Photo / video announcements', status: 'built', detail: '"Photo saved" when the photo count rises; "Recording video" only when the glasses stay busy with no microphone use.' },
  { id: 'button', area: 'Glasses', name: 'Glasses button: talk to Alice', status: 'tested', detail: 'Press, talk, Alice answers, then listens for a follow-up (official app\'s button/mic commands).' },
  { id: 'glasses-cmds', area: 'Glasses', name: 'Take photo from the app', status: 'partial', detail: 'Command found (04..01) in the official app\'s traffic; not wired in yet.' },
  { id: 'timezone', area: 'Glasses', name: 'Fix glasses clock/time-zone', status: 'blocked', detail: 'Clock read works; setting it needs the command.', needs: 'iPhone Bluetooth capture' },
  // Media
  { id: 'import-files', area: 'Media', name: 'Import from Files / USB-C', status: 'built', detail: 'Pick files, verify, dedupe by SHA-256, save to "SENTINEL Glasses" album.' },
  { id: 'integrity', area: 'Media', name: 'Damaged-file detection', status: 'tested', detail: 'Caught the overwritten photo; 12/12 good files pass.' },
  { id: 'exif-fix', area: 'Media', name: 'Fix one-month-behind photo dates', status: 'tested', detail: 'In-place, 3 bytes changed, image data untouched (tested on 9 real photos).' },
  { id: 'wifi-sync', area: 'Media', name: 'Automatic Wi-Fi photo/video sync', status: 'blocked', detail: 'Needs hotspot command + password reply.', needs: 'iPhone Bluetooth capture' },
  { id: 'wifi-auth', area: 'Media', name: 'Automatic Wi-Fi join', status: 'blocked', detail: 'Also needs paid Apple Developer account (Hotspot entitlement).', needs: 'Capture + $99 account' },
  { id: 'wifi-probe', area: 'Media', name: 'Wi-Fi transfer probe (diagnostic)', status: 'built', detail: 'Read-only scan of the glasses hotspot after manual join.' },
  // AI
  { id: 'chat', area: 'AI', name: 'Voice conversation through the glasses', status: 'tested', detail: 'Glasses mic in, Alice\'s voice out through the glasses\' speakers (headphones mode, verified 2026-11-26).' },
  { id: 'memory', area: 'AI', name: 'Persistent personal memory', status: 'tested', detail: 'Facts only when you ask; forget/wipe; last 24 turns of context (logic tested).' },
  { id: 'vision', area: 'AI', name: 'Visual reasoning / "what am I looking at"', status: 'partial', detail: 'Uses the iPhone camera or an imported glasses photo. Getting a glasses photo automatically needs the transfer method.', needs: 'Capture of the official app showing a glasses photo' },
  { id: 'reader', area: 'AI', name: 'Document scan + spoken reading (OCR)', status: 'built', detail: 'Vision model reads text in order; reads it aloud in full.' },
  { id: 'scene', area: 'AI', name: 'Environment scan', status: 'built', detail: 'Hazards, exits, signs from a photo. Not continuous live video.' },
  { id: 'live-video', area: 'AI', name: 'Continuous live video analysis', status: 'unsupported', detail: 'Glasses only expose stored files; no live stream path found; would drain the 260 mAh battery.' },
  { id: 'repair', area: 'AI', name: 'Mechanical / electronics repair modes', status: 'built', detail: 'Specialised prompts with safety rules.' },
  { id: 'pc-help', area: 'AI', name: 'Computer troubleshooting mode', status: 'built', detail: 'Reads on-screen errors from a photo and guides fixes.' },
  { id: 'pc-control', area: 'AI', name: 'Authorized remote PC control', status: 'proposed', detail: 'Needs a separate signed PC agent with per-action approval. Not built.' },
  { id: 'modes', area: 'AI', name: 'Specialised modes + importable mode packs', status: 'tested', detail: '9 built-in modes; JSON mode packs validated (tested).' },
  { id: 'translate', area: 'AI', name: 'Real-time translation', status: 'built', detail: 'Turn-based (speak, then hear translation). Not simultaneous.' },
  // Productivity
  { id: 'reminders', area: 'Assistant', name: 'Voice reminders', status: 'built', detail: 'Creates iOS Reminders after you confirm.' },
  { id: 'calendar', area: 'Assistant', name: 'Calendar events', status: 'built', detail: 'Creates events in your default calendar after you confirm.' },
  { id: 'email', area: 'Assistant', name: 'Email drafts', status: 'built', detail: 'Opens a filled-in draft; you press Send. Reading your inbox is not supported.' },
  { id: 'notes', area: 'Assistant', name: 'Voice notes', status: 'built', detail: 'Saved locally on the phone.' },
  { id: 'actions-parse', area: 'Assistant', name: 'Safe action parsing', status: 'tested', detail: 'Malformed/unknown actions are dropped, never run (tested).' },
  { id: 'where', area: 'Location', name: 'Where am I', status: 'built', detail: 'GPS + street address spoken.' },
  { id: 'nav', area: 'Location', name: 'Spoken navigation', status: 'built', detail: 'Hands off to Apple Maps; its voice plays through the glasses when they are connected as headphones.' },
  // Voice
  { id: 'wake-word', area: 'Voice', name: 'Custom wake word ("Hey Alice")', status: 'proposed', detail: 'Needs an on-device speech module; iOS stops the mic when the app is fully closed.' },
  { id: 'offline', area: 'Voice', name: 'Offline basic commands', status: 'partial', detail: 'Status, time, glasses info and memory recall work offline via buttons; offline speech recognition is proposed.' },
  // Platform
  { id: 'privacy-mode', area: 'Privacy', name: 'Privacy mode + memory wipe', status: 'built', detail: 'One switch stops all cloud AI; one button erases memory.' },
  { id: 'secure-store', area: 'Security', name: 'No keys on the phone', status: 'built', detail: 'AI keys live only on Alice\'s server; the phone holds a short-lived signed token. HTTPS everywhere.' },
  { id: 'ble-encryption', area: 'Security', name: 'Encrypted glasses link', status: 'unsupported', detail: 'The glasses\' BLE channels are unencrypted by their firmware.' },
  { id: 'packet-log', area: 'Diagnostics', name: 'Bluetooth packet recorder + export', status: 'built', detail: 'Shares a log to help decode new features.' },
  { id: 'pc-backup', area: 'Diagnostics', name: 'PC media backup tool (read-only, verified)', status: 'tested', detail: 'Ran on the real glasses: found by serial, 13 files hash-verified, damaged photo flagged, nothing modified.' },
  { id: 'storage-repair', area: 'Diagnostics', name: 'Glasses storage check/repair', status: 'tested', detail: 'chkdsk found + fixed the bitmap corruption after a verified backup; clean after new recordings.' },
  { id: 'fw-backup', area: 'Diagnostics', name: 'Firmware backup / recovery', status: 'blocked', detail: 'Only possible via UART pads inside the frame. No USB/BLE read path exists.', needs: 'Opening the glasses (your approval)' },
  { id: 'custom-fw', area: 'Diagnostics', name: 'Custom firmware', status: 'blocked', detail: 'No backup, no official image, no recovery path yet. Not attempted.', needs: 'Backup + recovery + your approval' },
  { id: 'video-quality', area: 'Glasses', name: 'Higher video quality (1200p/30fps)', status: 'unsupported', detail: 'Firmware records 720p/20fps; only a firmware change could alter it.' },
];

export const STATUS_LABEL: Record<Status, string> = {
  tested: 'Tested (PC)', built: 'Built – test on phone', partial: 'Partial', blocked: 'Blocked', unsupported: 'Not possible', proposed: 'Proposed',
};
