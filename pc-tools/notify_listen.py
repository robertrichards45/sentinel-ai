"""Listen-only capture. Enables notifications on the three vendor reply channels
and logs every packet with a timestamp. Sends NO commands. Never touches the
FEF5 (SUOTA firmware update) service."""
import asyncio, sys, time, json
from bleak import BleakClient, BleakScanner

ADDR = "C4:01:03:00:4E:31"
SECS = float(sys.argv[1]) if len(sys.argv) > 1 else 75
OUT = sys.argv[2] if len(sys.argv) > 2 else "notify_capture.jsonl"
CHANNELS = {
    "000033f4-0000-1000-8000-00805f9b34fb": "56FF/33F4",
    "000033f6-0000-1000-8000-00805f9b34fb": "57FF/33F6",
    "0000ea01-0000-1000-8000-00805f9b34fb": "FA00/EA01",
}
t0 = time.time()

async def main():
    dev = await BleakScanner.find_device_by_address(ADDR, timeout=20)
    if not dev:
        print("device not found"); return
    f = open(OUT, "w")
    def mk(label):
        def cb(_, data: bytearray):
            b = bytes(data)
            rec = {"t": round(time.time() - t0, 3), "ch": label, "len": len(b), "hex": b.hex(),
                   "ascii": "".join(chr(c) if 32 <= c < 127 else "." for c in b)}
            f.write(json.dumps(rec) + "\n"); f.flush()
            print(f"{rec['t']:8.3f}  {label:10s}  len={len(b):3d}  {b.hex()}  |{rec['ascii']}|", flush=True)
        return cb
    async with BleakClient(dev, timeout=30) as c:
        for uuid, label in CHANNELS.items():
            try:
                await c.start_notify(uuid, mk(label)); print("subscribed", label, flush=True)
            except Exception as e:
                print("subscribe failed", label, e, flush=True)
        print(f"LISTENING {SECS}s from t={time.time()-t0:.1f}", flush=True)
        await asyncio.sleep(SECS)
        for uuid in CHANNELS:
            try: await c.stop_notify(uuid)
            except Exception: pass
    f.close(); print("DONE", flush=True)

asyncio.run(main())
