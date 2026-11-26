# SENTINEL AI

An unofficial, modular AI platform for the **G2 AI Smart Glasses Pro** (Beken BK7258), replacing the Wheat Pro app.
Heavy AI runs on the iPhone and in the cloud, not on the glasses' small processor and 260 mAh battery.

> Honest status: see **docs/FEATURE_MATRIX.md** (also shown in the app under Settings → Feature status).

## Architecture

```
 Glasses (BK7258 + BLE chip)            iPhone: SENTINEL AI app                     Cloud / PC
 ───────────────────────────           ─────────────────────────────               ──────────────────
 BLE 56FF/57FF/FA00 (status) ──────▶  src/ble.ts          link + auto-reconnect    OpenAI (HTTPS)
 BLE FEF5 firmware update   ──╳──     src/protocol.ts     decoder (tested)          • gpt-transcribe
 Classic BT headset audio  ◀──────▶  src/voice.ts        mic in / voice out        • gpt-6-luna (text+image)
 USB drive (photos/videos) ─(Files)▶ src/media*.ts       import, verify, fix dates
 Wi-Fi hotspot (blocked)   ─ ─ ─ ▶   src/wifiProbe.ts    read-only probe          PC: pc-tools/*.py
                                      src/assistant.ts    turn orchestration           backup, BLE scan,
                                      src/intents.ts      strict action parsing        GATT dump, capture
                                      src/actions.ts      reminders, calendar, mail,
                                                          maps, location (confirmed)
                                      src/memory*.ts      local personal memory
                                      src/modes.ts        specialised AI modes + packs
                                      src/features.ts     feature matrix (source of truth)
```

**Extensibility:** new AI modes install as JSON *mode packs* (Settings → Mode packs) without an app update. New glasses features plug in by adding a record type to `protocol.ts` once captured. New actions get added to `intents.ts` (with a test) and `actions.ts`.

**Safety:** BLE writes are disabled globally, and the firmware-update service is hard-blocked. Every reminder, event, email and navigation request asks for confirmation. Privacy mode stops all cloud traffic. The API key lives in the iOS Keychain (this device only).

## Develop (Windows)
```
npm install
npx tsc --noEmit                 # type check
npx tsx test/protocol.test.ts    # decoder vs real BLE captures
npx tsx test/core.test.ts        # media/intents/memory/modes (+ real photos on Robert's PC)
npx tsx scripts/matrix.ts        # regenerate docs/FEATURE_MATRIX.md
npx expo export --platform ios   # prove the iOS bundle builds
```
The iPhone build runs on GitHub's Mac runners: `.github/workflows/ios-build.yml` produces an unsigned `.ipa`. Install instructions: docs/INSTALL.md.

## PC tools (`pc-tools/`)
`glasses_backup.py` (read-only verified media backup), `ble_scan.py`, `gatt_dump.py`, `notify_listen.py`, `check_media.py`, `mp4_info.py`.

Not affiliated with the glasses manufacturer or the Wheat Pro app.
