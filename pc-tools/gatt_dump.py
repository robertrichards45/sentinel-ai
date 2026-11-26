"""Read-only GATT enumeration. Connects, lists every service/characteristic/descriptor
with properties, and READS only characteristics marked 'read'. No writes, no
notification subscriptions (those would write a CCCD descriptor)."""
import asyncio, json, sys
from bleak import BleakClient, BleakScanner

ADDR = sys.argv[1] if len(sys.argv) > 1 else "C4:01:03:00:4E:31"

def show(b):
    txt = "".join(chr(c) if 32 <= c < 127 else "." for c in b)
    return {"hex": b.hex(), "ascii": txt, "len": len(b)}

async def main():
    dev = await BleakScanner.find_device_by_address(ADDR, timeout=20)
    if not dev:
        print(json.dumps({"error": "device not found"})); return
    out = {"address": ADDR, "services": []}
    async with BleakClient(dev, timeout=30) as c:
        out["mtu"] = c.mtu_size
        for s in c.services:
            sd = {"uuid": s.uuid, "desc": s.description, "handle": s.handle, "chars": []}
            for ch in s.characteristics:
                cd = {"uuid": ch.uuid, "desc": ch.description, "handle": ch.handle,
                      "props": ch.properties, "descriptors": [d.uuid for d in ch.descriptors]}
                if "read" in ch.properties:
                    try:
                        cd["value"] = show(bytes(await c.read_gatt_char(ch)))
                    except Exception as e:
                        cd["read_error"] = str(e)[:120]
                sd["chars"].append(cd)
            out["services"].append(sd)
    print(json.dumps(out, indent=1))

asyncio.run(main())
