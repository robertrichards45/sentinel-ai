"""Listen-only BLE scan. Prints every advertiser with a name, plus any unnamed
device carrying service UUIDs or manufacturer data. Does not connect."""
import asyncio, json, sys
from bleak import BleakScanner

SECS = float(sys.argv[1]) if len(sys.argv) > 1 else 30.0

async def main():
    found = await BleakScanner.discover(timeout=SECS, return_adv=True)
    rows = []
    for addr, (dev, adv) in found.items():
        name = adv.local_name or dev.name or ""
        mfg = {f"0x{k:04X}": v.hex() for k, v in adv.manufacturer_data.items()}
        svc_data = {k: v.hex() for k, v in adv.service_data.items()}
        if not (name or adv.service_uuids or mfg):
            continue
        rows.append(dict(addr=addr, rssi=adv.rssi, name=name,
                         services=adv.service_uuids, mfg=mfg,
                         service_data=svc_data, tx=adv.tx_power))
    rows.sort(key=lambda r: r["rssi"], reverse=True)
    print(json.dumps(rows, indent=1))

asyncio.run(main())
