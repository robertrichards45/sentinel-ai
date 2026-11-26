"""Inspect a built .ipa (read-only): bundle info, permissions, background modes, JS bundle, native frameworks."""
import plistlib, sys, zipfile

ipa = sys.argv[1]
z = zipfile.ZipFile(ipa)
names = z.namelist()
app = next(n.split("/")[1] for n in names if n.startswith("Payload/") and n.split("/")[1].endswith(".app"))
info = plistlib.loads(z.read(f"Payload/{app}/Info.plist"))
print("App bundle      :", app)
for k in ("CFBundleDisplayName", "CFBundleIdentifier", "CFBundleShortVersionString", "CFBundleVersion", "MinimumOSVersion", "DTXcode", "DTSDKName"):
    print(f"{k:<28}: {info.get(k)}")
print("UIBackgroundModes           :", info.get("UIBackgroundModes"))
print("NSAppTransportSecurity      :", info.get("NSAppTransportSecurity"))
print("Permission prompts:")
for k in sorted(k for k in info if k.startswith("NS") and k.endswith("UsageDescription")):
    print(f"  {k}: {info[k][:70]}")
exe = info.get("CFBundleExecutable")
print("Executable present          :", f"Payload/{app}/{exe}" in names)
js = [n for n in names if n.endswith("main.jsbundle")]
print("JS bundle                   :", js[0] if js else "MISSING", (z.getinfo(js[0]).file_size // 1024, "KB") if js else "")
fw = sorted({n.split("/")[3] for n in names if n.startswith(f"Payload/{app}/Frameworks/") and len(n.split("/")) > 3})
print("Frameworks                  :", len(fw), fw[:8])
print("Signed                      :", any("_CodeSignature/CodeResources" in n for n in names))
