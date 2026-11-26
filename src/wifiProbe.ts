/**
 * Wi-Fi transfer is BLOCKED until the BLE "start hotspot" command and the
 * password reply are captured from Wheat Pro (iPhone Bluetooth log).
 * This probe is read-only: once you have joined G2-xxxx manually, it asks a few
 * likely addresses what they serve, so we can learn the transfer protocol.
 * The candidate addresses/paths are UNVERIFIED (taken from a related product).
 */
const CANDIDATE_IPS = ['192.168.4.1', '192.168.43.1', '192.168.1.1', '192.168.0.1', '10.0.0.1', '192.168.169.1'];
const PATHS = ['/', '/manifest.json', '/files', '/list', '/DCIM'];

export type ProbeHit = { url: string; status: number; type: string; sample: string };

async function get(url: string, ms = 2500): Promise<ProbeHit | null> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    const text = (await r.text()).slice(0, 400);
    return { url, status: r.status, type: r.headers.get('content-type') ?? '?', sample: text.replace(/\s+/g, ' ') };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export async function probeGlassesWifi(onLine: (s: string) => void): Promise<ProbeHit[]> {
  const hits: ProbeHit[] = [];
  for (const ip of CANDIDATE_IPS) {
    onLine(`Trying ${ip} …`);
    const root = await get(`http://${ip}/`);
    if (!root) continue;
    hits.push(root);
    onLine(`✔ ${ip} answered (${root.status})`);
    for (const p of PATHS.slice(1)) {
      const h = await get(`http://${ip}${p}`);
      if (h) { hits.push(h); onLine(`  ${p} → ${h.status} ${h.type}`); }
    }
  }
  if (!hits.length) onLine('No web server found. Make sure the iPhone is joined to the G2 Wi-Fi and Cellular Data is off for this test.');
  return hits;
}
