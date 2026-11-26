# Firmware: findings, rules and the recovery plan

## What is known (verified 2026-11-25)
- Main SoC: **Beken BK7258** (named in every photo's EXIF). Camera, Wi-Fi, storage.
- A second Bluetooth front end exposes **Dialog/Renesas SUOTA** (service FEF5), an over-the-air **firmware update** path.
- USB exposes only a 242 MB exFAT media drive ("CherryUSB MSC DEMO", VID/PID FFFF). No update, debug or serial interface over USB.
- Recording: 720p / 20 fps H.264, 1600x1200 JPEG. Firmware bugs: EXIF month −1, mixed UTC/local file names, exFAT bitmap corruption that overwrote a photo.

## Rules SENTINEL follows
1. The app never writes to FEF5. The block is in code (`src/ble.ts`, `safeWrite`), and all BLE writes are off until a command format is verified.
2. Nothing is flashed, erased or overwritten without Robert's explicit approval **and** a verified, checksummed full backup **and** a tested way back.
3. Media is backed up (SHA-256 verified) before any storage repair. (Done: 13 files.)

## Why there is no firmware backup yet
- The firmware lives in the BK7258's internal flash and in the Bluetooth chip. Neither is readable over USB or BLE.
- A read requires the chip's UART download mode, through test pads inside the frame arm. That means opening the glasses.

## Recovery plan (needs approval before step 3)
1. Identify the board: open the arm, photograph both sides, find the BK7258 UART pads (TX, RX, GND, CEN/boot).
2. Use a 3.3 V USB-UART adapter. **Read only**: dump the full flash with Beken's official loader, twice, and compare SHA-256 values. Keep 3 copies (PC, cloud, USB stick).
3. Only with matching dumps and a test-restore plan: discuss whether any change is worth the risk.
4. If the vendor publishes an official OTA image, prefer it over any custom image.

## Custom firmware feasibility
- Toolchain: Beken's Armino SDK supports BK7258, but the board-specific configuration (pins, camera sensor, power, audio codec, Bluetooth-chip link) is unknown. A wrong build can brick the glasses.
- Realistic gains: fixing the date/file-name bugs and the storage bug, maybe 1080p video. These are not worth the risk until a verified backup exists.
- Everything else (AI, memory, translation, navigation, vision) runs better on the iPhone, so SENTINEL does not depend on firmware changes.
