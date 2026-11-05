"""Read-only scan of an uncompressed .blend: dump ID names per block code (OB objects, GR collections, ME meshes, MA).
Usage: python -I blend_names.py <file.blend> <out.json>   (no Blender required, executes nothing from the file)"""
import struct, sys, json, collections
src, out = sys.argv[1], sys.argv[2]
d = open(src, 'rb').read()
assert d[:7] == b'BLENDER'
ptr = 8 if d[7:8] == b'-' else 4
pos = 12
res = collections.defaultdict(list)
sizes = {}
while pos < len(d):
    code = d[pos:pos+4].rstrip(b'\0').decode('latin1')
    size, = struct.unpack('<I', d[pos+4:pos+8])
    hdr = 8 + ptr + 8
    body = pos + hdr
    if code == 'ENDB': break
    if code in ('OB', 'GR', 'ME', 'MA') and size > 100:
        # ID.name is char[66] after next/prev/newid/lib(/asset_data in 3.x)
        for off in (32, 40):
            nm = d[body+off:body+off+66].split(b'\0')[0]
            if nm[:2] == code.encode() and len(nm) > 2:
                res[code].append(nm[2:].decode('utf8', 'replace'))
                sizes[(code, nm[2:].decode('utf8','replace'))] = size
                break
    pos = body + size
json.dump({k: v for k, v in res.items()}, open(out, 'w'), ensure_ascii=False, indent=0)
print({k: len(v) for k, v in res.items()})
