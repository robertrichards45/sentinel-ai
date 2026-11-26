import { BleManager, Device, Subscription, State } from 'react-native-ble-plx';
import { Buffer } from 'buffer';
import { UUID, ADV_NAME, ADV_COMPANY_ID, GlassesEvent, parseChannelA, parseChannelB, parseAdvert, hex } from './protocol';

export type LinkState = 'bluetooth-off' | 'idle' | 'scanning' | 'connecting' | 'connected' | 'error';
export type PacketLogEntry = { t: number; ch: string; hex: string };

/**
 * SAFETY: writes are OFF. No command format has been verified yet.
 * Even when enabled later, the firmware-update service (FEF5) is permanently blocked.
 */
export const WRITES_ENABLED = false;
const WRITE_ALLOWLIST = new Set<string>([UUID.SVC_A, UUID.SVC_B, UUID.SVC_C]);

const b64ToBytes = (s: string | null) => (s ? new Uint8Array(Buffer.from(s, 'base64')) : new Uint8Array());

class GlassesLink {
  readonly manager = new BleManager();
  device: Device | null = null;
  state: LinkState = 'idle';
  mac: string | null = null;
  log: PacketLogEntry[] = [];
  private subs: Subscription[] = [];
  private listeners = new Set<(e: GlassesEvent | { kind: 'link'; state: LinkState; detail?: string }) => void>();
  private wantConnected = false;

  on(fn: (e: any) => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private emit(e: any) {
    this.listeners.forEach((fn) => fn(e));
  }
  private setState(s: LinkState, detail?: string) {
    this.state = s;
    this.emit({ kind: 'link', state: s, detail });
  }
  private record(ch: string, b: Uint8Array) {
    this.log.push({ t: Date.now(), ch, hex: hex(b) });
    if (this.log.length > 5000) this.log.splice(0, 1000);
  }

  /** Find the glasses: first among peripherals iOS already has connected, then by scanning. */
  async connect(): Promise<void> {
    this.wantConnected = true;
    const bt = await this.manager.state();
    if (bt !== State.PoweredOn) {
      this.setState('bluetooth-off');
      await new Promise<void>((res) => {
        const s = this.manager.onStateChange((st) => {
          if (st === State.PoweredOn) { s.remove(); res(); }
        }, true);
      });
    }
    // Already connected at system level (common: iPhone keeps the glasses linked)
    const known = await this.manager.connectedDevices([UUID.SVC_A, UUID.SVC_FIRMWARE_UPDATE]);
    if (known.length) return this.attach(known[0]);

    this.setState('scanning');
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.manager.stopDeviceScan();
        this.setState('error', 'Glasses not found. Close Wheat Pro, keep glasses on and near the phone, then try again.');
        reject(new Error('not found'));
      }, 20000);
      this.manager.startDeviceScan(null, { allowDuplicates: false }, (err, d) => {
        if (err) { clearTimeout(timer); this.setState('error', err.message); reject(err); return; }
        if (!d) return;
        const mfg = b64ToBytes(d.manufacturerData);
        const isG2 = (d.localName ?? d.name) === ADV_NAME || (mfg.length >= 2 && parseAdvert(mfg).company === ADV_COMPANY_ID);
        if (!isG2) return;
        if (mfg.length >= 14) this.mac = parseAdvert(mfg).mac ?? null;
        clearTimeout(timer);
        this.manager.stopDeviceScan();
        this.attach(d).then(resolve, reject);
      });
    });
  }

  private async attach(d: Device) {
    this.setState('connecting');
    const dev = (await d.isConnected()) ? d : await d.connect({ timeout: 15000 });
    await dev.discoverAllServicesAndCharacteristics();
    this.device = dev;
    this.subs.push(
      dev.onDisconnected(() => {
        this.cleanup();
        this.setState('idle', 'Glasses disconnected');
        if (this.wantConnected) setTimeout(() => this.connect().catch(() => {}), 3000); // auto-reconnect
      }),
    );
    // Listen-only: enabling notifications is the same step the capture tool used.
    const watch = (svc: string, ch: string, label: string, parse: (b: Uint8Array) => GlassesEvent) =>
      this.subs.push(
        dev.monitorCharacteristicForService(svc, ch, (err, c) => {
          if (err || !c) return;
          const b = b64ToBytes(c.value);
          this.record(label, b);
          const ev = parse(b);
          if (ev.kind === 'address') this.mac = ev.mac;
          this.emit(ev);
        }),
      );
    watch(UUID.SVC_A, UUID.A_NOTIFY, 'A', parseChannelA);
    watch(UUID.SVC_B, UUID.B_NOTIFY, 'B', parseChannelB);
    watch(UUID.SVC_C, UUID.C_NOTIFY, 'C', (b) => ({ kind: 'raw', channel: 'C', hex: hex(b), confidence: 'unknown' }));
    this.setState('connected');
  }

  /** The ONLY write path in the app. Blocks the firmware-update service unconditionally. */
  async safeWrite(service: string, characteristic: string, bytes: Uint8Array) {
    const svc = service.toLowerCase();
    if (svc === UUID.SVC_FIRMWARE_UPDATE) throw new Error('BLOCKED: firmware-update service is never written.');
    if (!WRITE_ALLOWLIST.has(svc)) throw new Error('BLOCKED: service not on the allowlist.');
    if (!WRITES_ENABLED) throw new Error('Writes are disabled until command formats are verified.');
    if (!this.device) throw new Error('Not connected');
    this.record('W:' + svc.slice(4, 8), bytes);
    await this.device.writeCharacteristicWithResponseForService(svc, characteristic, Buffer.from(bytes).toString('base64'));
  }

  /**
   * Glasses speaker test ONLY (approved, one-shot): writes to the audio characteristic 57FF/33F5 and nothing else.
   * Independent of WRITES_ENABLED, which stays off for every other command. FEF5 can never be reached from here.
   */
  async speakerTestWrite(bytes: Uint8Array) {
    if (!this.device) throw new Error('Not connected');
    this.record('W:57ff', bytes);
    await this.device.writeCharacteristicWithResponseForService(UUID.SVC_B, UUID.B_WRITE, Buffer.from(bytes).toString('base64'));
  }

  async disconnect() {
    this.wantConnected = false;
    const d = this.device;
    this.cleanup();
    if (d) await d.cancelConnection().catch(() => {});
    this.setState('idle');
  }

  private cleanup() {
    this.subs.forEach((s) => s.remove());
    this.subs = [];
    this.device = null;
  }
}

export const glasses = new GlassesLink();
