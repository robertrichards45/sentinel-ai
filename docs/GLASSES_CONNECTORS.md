# Glasses connectors

Alice is one assistant; the glasses are swappable. Everything brand-specific sits behind a connector
(`src/glasses/catalog.ts`, `src/glasses/connector.ts`). The chosen model is `settings.glassesModel`,
picked on first launch (`src/screens/Onboarding.tsx`) and changeable in Settings > Your glasses.

| Model | How Alice connects | Mic | Speakers | Button | Battery | Glasses camera |
| --- | --- | --- | --- | --- | --- | --- |
| `g2` - G2 AI Smart Glasses (+ Wheat/WheatAi look-alikes) | Own Bluetooth data link (`src/ble.ts`, protocol in `src/protocol.ts`) + headphones command | Glasses (data link) | Glasses (A2DP) | Yes | Yes | Not yet (photo transfer unknown) |
| `headphones` - any Bluetooth audio glasses | Plain iPhone Bluetooth audio | Glasses hands-free mic | Glasses | No (use "Hey Alice" / orb) | No | No (phone camera) |
| `meta` - Ray-Ban / Oakley Meta | Today: as `headphones`. Planned: Meta Wearables Device Access Toolkit | Glasses | Glasses | Planned | Planned | Planned (toolkit supports photo + video streaming) |
| `none` - phone only | - | Phone | Phone | - | - | Phone camera |

## Adding a brand
1. Add an entry to `GLASSES` in `catalog.ts` with its capabilities.
2. If it needs more than Bluetooth audio, add its link module (like `ble.ts`) and start it in `startGlasses()`.
3. Gate any UI on `caps` (Home and Settings already do).

## Meta connector - what is needed
- Meta Wearables Developer Center account (free); glasses in Developer Mode via the Meta AI app.
- The iOS toolkit (Swift) wrapped as an Expo native module + config plugin; app registered with Meta (application ID).
- Public release waits for Meta to open submissions (developer mode allows one registered third-party app at a time).
