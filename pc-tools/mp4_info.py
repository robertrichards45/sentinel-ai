"""Read-only MP4 header parser: duration, tracks, codec, size, sample counts."""
import struct, sys

CONTAINERS = {b"moov", b"trak", b"mdia", b"minf", b"stbl", b"edts", b"dinf", b"udta"}

def walk(b, s, e, depth, out):
    i = s
    while i + 8 <= e:
        size, typ = struct.unpack(">I4s", b[i:i+8]); hdr = 8
        if size == 1: size = struct.unpack(">Q", b[i+8:i+16])[0]; hdr = 16
        if size < 8 or i + size > e: out.append("  " * depth + f"BAD {typ} size={size}"); return
        body = b[i+hdr:i+size]; t = typ.decode("latin1"); info = ""
        if typ == b"mvhd":
            v = body[0]; ts, dur = (struct.unpack(">II", body[12:20]) if v == 0 else struct.unpack(">IQ", body[20:32]))
            info = f"timescale={ts} duration={dur} -> {dur/ts if ts else 'n/a'} s"
        elif typ == b"tkhd":
            w, h = struct.unpack(">II", body[-8:]); info = f"width={w>>16} height={h>>16}"
        elif typ == b"mdhd":
            v = body[0]; ts, dur = (struct.unpack(">II", body[12:20]) if v == 0 else struct.unpack(">IQ", body[20:32]))
            info = f"timescale={ts} duration={dur} -> {dur/ts if ts else 'n/a'} s"
        elif typ == b"hdlr":
            info = f"handler={body[8:12].decode('latin1')}"
        elif typ == b"stsd":
            fmt = body[12:16].decode("latin1"); info = f"codec={fmt}"
            if fmt in ("avc1", "hvc1", "hev1", "mp4v", "jpeg", "mjpa", "mjpg"):
                w, h = struct.unpack(">HH", body[8+8+24:8+8+28]); info += f" {w}x{h}"
            elif fmt in ("mp4a", "alaw", "ulaw", "sowt", "twos", "ima4"):
                ch, bits = struct.unpack(">HH", body[8+8+16:8+8+20]); sr = struct.unpack(">I", body[8+8+24:8+8+28])[0] >> 16
                info += f" channels={ch} bits={bits} rate={sr}"
        elif typ == b"stsz":
            ss, cnt = struct.unpack(">II", body[4:12]); info = f"samples={cnt} fixed_size={ss}"
        elif typ == b"stts":
            n = struct.unpack(">I", body[4:8])[0]
            ent = [struct.unpack(">II", body[8+8*k:16+8*k]) for k in range(min(n, 4))]
            info = f"entries={n} first={ent}"
        out.append("  " * depth + f"{t} ({size}) {info}")
        if typ in CONTAINERS: walk(b, i + hdr, i + size, depth + 1, out)
        i += size

def sniff(p):
    b = open(p, "rb").read(64)
    sigs = {b"\xff\xd8": "JPEG", b"\x00\x00\x00\x01": "H.264/H.265 Annex-B NAL", b"RIFF": "RIFF/WAV/AVI"}
    for k, v in sigs.items():
        if b.startswith(k): return v
    if b[4:8] in (b"ftyp", b"mdat", b"moov"): return "MP4 box"
    return "unknown: " + b[:32].hex()

for a in sys.argv[1:]:
    print("==", a)
    if a.lower().endswith(".mp4"):
        b = open(a, "rb").read(); out = []; walk(b, 0, len(b), 0, out); print("\n".join(out))
        m = b.find(b"\x00\x00\x00\x01", 0, 4096); print("first Annex-B start code in first 4KB at:", m)
    else:
        print("signature:", sniff(a))
        b = open(a, "rb").read(); print("contains JPEG SOI at:", b.find(b"\xff\xd8\xff"), " EOI count:", b.count(b"\xff\xd9"))
