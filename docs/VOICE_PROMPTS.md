# Factory voice prompts: findings, recovery plan and voice-pack design

Status 2026-11-25: **investigation only. Nothing has been written to the glasses.** Any firmware change needs Robert's explicit approval after the gates below are met.

Labels: **Verified** = observed on Robert's glasses. **Source** = vendor documentation. **Inference** = reasoned, not proven. **Unknown** = needs a firmware image.

## 1. Chips and firmware architecture
| Item | Finding | Label |
|---|---|---|
| Main SoC | Beken BK7258 (named in photo EXIF) | Verified |
| BK7258 radio | Wi-Fi 6 + dual-mode Bluetooth 5.4 incl. Classic BR/EDR, so one chip can do headset audio and prompts | Source |
| Flash | 4 or 8 MB inside the chip package (variant unknown) | Source |
| Audio out | one mono DAC, SBC accelerator | Source |
| Update paths | BLE service FEF5 (Dialog SUOTA layout, idle); chip UART download on GPIO10/GPIO11 | Verified / Source |
| Debug | SWD pins exist; whether locked is unknown | Source / Unknown |
| USB | exFAT media drive only (253.7 MB, one partition, no hidden data) | Verified |
| Device info over BLE | none (no model/firmware version readable) | Verified |
| Second audio chip | not seen; not ruled out | Unknown |

## 2. Where the prompts live
- **Not** on the USB drive (verified: only photos, videos and Windows files).
- Therefore in the internal flash, either compiled into the app image or in a resource partition (inference).
- Format, sample rate, number of prompts, slot sizes: **unknown until a firmware image is read**. Typical for this SDK class: 16 kHz mono, MP3/Opus/ADPCM/G.711/PCM.

## 3. Can single prompts be replaced?
Only if all of these turn out true (each is unknown today):
1. Prompts sit in their own partition or a contiguous table with known offsets/lengths.
2. The boot chain does not verify a signature over that region (or the image is unsigned).
3. Flash is not encrypted with a device key.
4. New audio fits the original slot sizes (or the table can be rewritten consistently).
5. Any CRC/checksum in the image header can be recomputed.

Even then, it is still a **flash write**, so it is a firmware modification and needs approval. Beken's OTA packaging supports AES-encrypted, LZMA-compressed images, so the OTA route (BLE FEF5 or Wi-Fi) is not usable without the vendor's format and key. Only the UART route is under our control.

Adding brand-new prompts, such as "Alice is ready", needs code that plays them on a new event. That means rebuilding the application firmware, which is far riskier and not recommended.

## 4. Getting the firmware image (read-only, each needs approval)
**A. Vendor update file (glasses untouched).** Route the iPhone through a PC proxy (mitmproxy) and trigger "check for update" in Wheat Pro to capture the download URL and file. Needs: installing mitmproxy on the PC, and a temporary proxy setting plus trusted certificate on the iPhone. This may fail if the app pins certificates or if no update is offered.

**B. Full flash read over UART (opens the glasses).**
1. Open the temple arm and photograph both sides of the board.
2. Find UART0 (GPIO10 RX, GPIO11 TX), GND, CEN/reset.
3. Use a 3.3 V USB-UART adapter (~$8) and Beken's official download tool in **read** mode only.
4. Read the whole flash twice, compare SHA-256, and keep 3 copies (PC, cloud, USB stick).

## 5. Verified backup and recovery procedure (gate before any write)
1. Two identical full dumps (SHA-256 match), plus the vendor OTA file if obtained.
2. Prove the ROM download mode works on this unit: handshake, flash-ID read and a re-read all succeed. The UART loader lives in the chip's mask ROM, so it survives a bad flash, *unless* an eFuse disables it. Check this before any write.
3. Document the exact write command and its address range, and confirm by dry-run (tool validation without writing).
4. First write is a **restore of the original dump** to a test region or the same region (byte-identical, so it changes nothing), then a read-back and hash compare. Only after that does a modified image get written.
5. Stop rules: any hash mismatch, unknown partition, encryption or signature check means stop and report.

## 6. Voice-pack feature design (only if section 3 passes)
User flow in Alice: Settings → Glasses voice → choose a pack (e.g. "Alice Warm", "Futuristic AI", "British") → preview each prompt on the phone → Install (PC required).
- **Pack format:** `manifest.json` (pack id, voice, style, target firmware hash) plus one audio file per prompt id (`power_on`, `power_off`, `bt_connected`, `bt_disconnected`, `low_battery`, `charging`, `photo`, `video_start`, `video_stop`, `wake_chirp`…), using the exact list discovered in the dump.
- **Generation:** Alice's server TTS (gemini-3.8-flash-tts) → resample to the original rate → encode to the original codec → trim/pad to each slot's byte limit → loudness-match to the original.
- **Build (PC tool, `pc-tools/voicepack.py`):** verify the dump hash matches the pack's target → patch prompt slots → recompute checksums → write a new image + diff report (only prompt bytes may change) → keep the original.
- **Install:** UART only, via the PC tool, with automatic read-back verify and one-click restore of the original dump. OTA install is not offered (vendor key, brick risk).
- **App side (already shipping):** Alice's own replies use the chosen natural voice through the glasses' speaker. This part needs no firmware change.

## 7. Recommendation
Keep the factory prompts for now. Alice's own voice (already selectable) covers what you hear during use. If the short factory announcements still matter, start with route **4A** (no hardware risk), which tells us the format, encryption and signature status. Decide on 4B only after that.
