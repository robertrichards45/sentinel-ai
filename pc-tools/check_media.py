"""Structural check of JPEG/MP4 files (read-only)."""
import struct, sys, pathlib

def jpeg(p):
    b = p.read_bytes()
    return f"start={b[:2].hex()} end={b[-2:].hex()} complete={b[:2]==b'\xff\xd8' and b'\xff\xd9' in b[-16:]} size={len(b)} zero_tail={len(b)-len(b.rstrip(b'\x00'))}"

def mp4(p):
    b = p.read_bytes(); i = 0; atoms = []
    while i + 8 <= len(b):
        size, typ = struct.unpack(">I4s", b[i:i+8])
        t = typ.decode("latin1")
        if size == 1: size = struct.unpack(">Q", b[i+8:i+16])[0]
        if size == 0: size = len(b) - i
        atoms.append(f"{t}:{size}")
        if size < 8: atoms.append("BAD_SIZE"); break
        i += size
    has_moov = any(a.startswith("moov") for a in atoms)
    return f"atoms={atoms} moov_present={has_moov} trailing={len(b)-i}"

for a in sys.argv[1:]:
    p = pathlib.Path(a)
    print(p.name, "->", jpeg(p) if p.suffix.lower() in (".jpg", ".jpeg") else mp4(p))
