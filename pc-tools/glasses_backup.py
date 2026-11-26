"""SENTINEL PC tool: READ-ONLY backup of the G2 glasses' USB drive.

Finds the glasses by their USB identity (serial 2022123456, "CherryUSB MSC DEMO"),
copies every new photo/video to a backup folder, verifies each copy with SHA-256,
checks file structure, and writes a report.
It never writes to, renames or deletes anything on the glasses.

Usage:  python glasses_backup.py [backup_folder]
"""
import hashlib, json, shutil, string, subprocess, sys, datetime, pathlib

SERIAL = "2022123456"
DEFAULT_DEST = pathlib.Path.home() / "Documents" / "G2-Glasses-Diagnostics" / "media-backup"
MEDIA_EXT = {".jpeg", ".jpg", ".mp4", ".mov"}


def find_glasses_drive():
    """Ask Windows which drive letter belongs to the disk with the glasses' serial."""
    ps = "$d=Get-Disk | ? SerialNumber -eq '%s'; if($d){ ($d | Get-Partition | ? DriveLetter).DriveLetter }" % SERIAL
    try:
        out = subprocess.run(["powershell", "-NoProfile", "-Command", ps], capture_output=True, text=True, timeout=30).stdout.strip()
    except Exception:
        out = ""
    return out[:1] if out and out[0] in string.ascii_uppercase else None


def sha256(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def structure_ok(p):
    b = p.read_bytes()
    if p.suffix.lower() in (".jpg", ".jpeg"):
        if b[:2] != b"\xff\xd8":
            return "not a JPEG (likely overwritten by the firmware storage bug)"
        return "ok" if b"\xff\xd9" in b[-32:] else "JPEG cut off"
    i, seen = 0, []
    while i + 8 <= len(b):
        size = int.from_bytes(b[i:i + 4], "big"); t = b[i + 4:i + 8].decode("latin1")
        if size == 1: size = int.from_bytes(b[i + 8:i + 16], "big")
        if size == 0: size = len(b) - i
        if size < 8 or i + size > len(b): return f"damaged '{t}' box"
        seen.append(t); i += size
    missing = [x for x in ("ftyp", "mdat", "moov") if x not in seen]
    return "ok" if not missing else f"missing {missing} (recording not finished)"


def main():
    dest = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_DEST
    dest.mkdir(parents=True, exist_ok=True)
    letter = find_glasses_drive()
    if not letter:
        print("Glasses not found. Plug them in by USB and wait for the drive to appear.")
        return 2
    root = pathlib.Path(f"{letter}:\\")
    sums_file = dest / "SHA256SUMS.txt"
    known = {}
    if sums_file.exists():
        for line in sums_file.read_text().splitlines():
            parts = line.split()
            if len(parts) == 2: known[parts[1]] = parts[0].lower()
    have_hashes = set(known.values())

    report = {"time": datetime.datetime.now().isoformat(timespec="seconds"), "drive": f"{letter}:", "files": []}
    for p in sorted(root.rglob("*")):
        if not p.is_file() or p.suffix.lower() not in MEDIA_EXT or "System Volume Information" in str(p):
            continue
        src_hash = sha256(p)
        why = structure_ok(p)
        entry = {"name": p.name, "bytes": p.stat().st_size, "sha256": src_hash, "structure": why}
        if src_hash in have_hashes:
            entry["action"] = "already backed up"
        else:
            target = dest / p.name
            if target.exists() and sha256(target) != src_hash:
                target = dest / f"{p.stem}.{src_hash[:8]}{p.suffix}"  # never overwrite a different file
            shutil.copy2(p, target)
            if sha256(target) != src_hash:
                entry["action"] = "COPY FAILED VERIFICATION"
            else:
                entry["action"] = "copied + verified"
                with open(sums_file, "a") as f: f.write(f"{src_hash}  {target.name}\n")
                have_hashes.add(src_hash)
        report["files"].append(entry)
        print(f"{entry['action']:<26} {p.name:<28} {why}")

    (dest / f"backup-report-{datetime.datetime.now():%Y%m%d-%H%M%S}.json").write_text(json.dumps(report, indent=1))
    damaged = [f["name"] for f in report["files"] if f["structure"] != "ok"]
    print(f"\n{len(report['files'])} media files on glasses; damaged: {damaged or 'none'}")
    print("Nothing on the glasses was modified.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
