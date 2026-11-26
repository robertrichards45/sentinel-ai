# SENTINEL AI — feature matrix

Generated 2026-11-26 from `src/features.ts` (the same list the app shows).

| Status | Count |
|---|---|
| Tested (PC) | 8 |
| Built – test on phone | 20 |
| Partial | 4 |
| Blocked | 6 |
| Not possible | 3 |
| Proposed | 2 |

**Tested (PC)** = verified by automated tests on the PC, using real glasses data where possible. **Built** = compiles and bundles; not yet run on the iPhone. Nothing is listed as working on the phone until it has been tried there.

## Tested (PC)

| Area | Feature | Detail | Needs |
|---|---|---|---|
| Glasses | Decode glasses status packets | Media count, clock, address, busy flag decoded from real captures (10/10 tests). |  |
| Media | Damaged-file detection | Caught the overwritten photo; 12/12 good files pass. |  |
| Media | Fix one-month-behind photo dates | In-place, 3 bytes changed, image data untouched (tested on 9 real photos). |  |
| AI | Persistent personal memory | Facts only when you ask; forget/wipe; last 24 turns of context (logic tested). |  |
| AI | Specialised modes + importable mode packs | 9 built-in modes; JSON mode packs validated (tested). |  |
| Assistant | Safe action parsing | Malformed/unknown actions are dropped, never run (tested). |  |
| Diagnostics | PC media backup tool (read-only, verified) | Ran on the real glasses: found by serial, 13 files hash-verified, damaged photo flagged, nothing modified. |  |
| Diagnostics | Glasses storage check/repair | chkdsk found + fixed the bitmap corruption after a verified backup; clean after new recordings. |  |

## Built – test on phone

| Area | Feature | Detail | Needs |
|---|---|---|---|
| Glasses | Connect + auto-reconnect | Finds "G2" by name/manufacturer ID, reuses iOS connection, reconnects 3 s after drop. |  |
| Glasses | Firmware-update write block | All writes off; FEF5 (firmware update) service hard-blocked in code. |  |
| Privacy | Recording indicator / spoken "camera active" | Uses channel-B busy flag (LIKELY camera/mic active). |  |
| Media | Import from Files / USB-C | Pick files, verify, dedupe by SHA-256, save to "SENTINEL Glasses" album. |  |
| Media | Wi-Fi transfer probe (diagnostic) | Read-only scan of the glasses hotspot after manual join. |  |
| AI | ChatGPT voice conversation | Record → gpt-transcribe → gpt-6-luna → iPhone voice through glasses. | Your OpenAI API key |
| AI | Visual reasoning / object recognition | Uses iPhone camera or an imported glasses photo. |  |
| AI | Document scan + spoken reading (OCR) | Vision model reads text in order; reads it aloud in full. |  |
| AI | Environment scan | Hazards, exits, signs from a photo. Not continuous live video. |  |
| AI | Mechanical / electronics repair modes | Specialised prompts with safety rules. |  |
| AI | Computer troubleshooting mode | Reads on-screen errors from a photo and guides fixes. |  |
| AI | Real-time translation | Turn-based (speak, then hear translation). Not simultaneous. |  |
| Assistant | Voice reminders | Creates iOS Reminders after you confirm. |  |
| Assistant | Calendar events | Creates events in your default calendar after you confirm. |  |
| Assistant | Email drafts | Opens a filled-in draft; you press Send. Reading your inbox is not supported. |  |
| Assistant | Voice notes | Saved locally on the phone. |  |
| Location | Where am I | GPS + street address spoken. |  |
| Privacy | Privacy mode + memory wipe | One switch stops all cloud AI; one button erases memory. |  |
| Security | Secure local storage | API key in iOS Keychain (this device only); data protected by iOS encryption; HTTPS to OpenAI. |  |
| Diagnostics | Bluetooth packet recorder + export | Shares a log to help decode new features. |  |

## Partial

| Area | Feature | Detail | Needs |
|---|---|---|---|
| Glasses | Battery level + low alert | Shows heartbeat value; that it is battery % is LIKELY, not proven. |  |
| Glasses | Glasses button starts assistant | Experimental: busy-flag edge. Real button codes need the Wheat Pro capture. | iPhone Bluetooth capture |
| Location | Spoken navigation | Hands off to Apple Maps, whose voice plays through the glasses. |  |
| Voice | Offline basic commands | Status, time, glasses info and memory recall work offline via buttons; offline speech recognition is proposed. |  |

## Blocked

| Area | Feature | Detail | Needs |
|---|---|---|---|
| Glasses | Take photo / start video / settings from app | Command formats unknown. | iPhone Bluetooth capture |
| Glasses | Fix glasses clock/time-zone | Clock read works; setting it needs the command. | iPhone Bluetooth capture |
| Media | Automatic Wi-Fi photo/video sync | Needs hotspot command + password reply. | iPhone Bluetooth capture |
| Media | Automatic Wi-Fi join | Also needs paid Apple Developer account (Hotspot entitlement). | Capture + $99 account |
| Diagnostics | Firmware backup / recovery | Only possible via UART pads inside the frame. No USB/BLE read path exists. | Opening the glasses (your approval) |
| Diagnostics | Custom firmware | No backup, no official image, no recovery path yet. Not attempted. | Backup + recovery + your approval |

## Not possible

| Area | Feature | Detail | Needs |
|---|---|---|---|
| AI | Continuous live video analysis | Glasses only expose stored files; no live stream path found; would drain the 260 mAh battery. |  |
| Security | Encrypted glasses link | The glasses' BLE channels are unencrypted by their firmware. |  |
| Glasses | Higher video quality (1200p/30fps) | Firmware records 720p/20fps; only a firmware change could alter it. |  |

## Proposed

| Area | Feature | Detail | Needs |
|---|---|---|---|
| AI | Authorized remote PC control | Needs a separate signed PC agent with per-action approval. Not built. |  |
| Voice | Custom wake word ("Hey Sentinel") | Needs an on-device speech module; iOS stops the mic when the app is fully closed. |  |
