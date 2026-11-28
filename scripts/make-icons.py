#!/usr/bin/env python3
"""Writes the PWA icons (PNG, no dependencies) for Study Dungeon and Ghosted.

Run from the repo root:  python3 scripts/make-icons.py
Output: apps/<app>/public/icons/icon-192.png, icon-512.png, maskable-512.png,
apple-touch-icon.png. The art is a flat shape on the app's background colour;
the maskable icon keeps it inside the central 60% (the safe zone).
"""
import os, struct, zlib

def png(path, size, pixel):
    rows = []
    for y in range(size):
        row = bytearray([0])
        for x in range(size):
            row += bytes(pixel(x / size, y / size))
        rows.append(bytes(row))
    raw = b"".join(rows)
    def chunk(tag, data):
        body = tag + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)
    data = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0))
    data += chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(data)

def hexrgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))

def mix(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))

def candle(bg, fg, glow, scale):
    """A candle: a body, and a flame with a soft glow. Coordinates in 0..1, centred."""
    def px(u, v):
        u = 0.5 + (u - 0.5) / scale
        v = 0.5 + (v - 0.5) / scale
        d = ((u - 0.5) ** 2 + (v - 0.34) ** 2) ** 0.5
        colour = mix(bg, glow, max(0.0, 0.35 - d) * 0.9)
        if 0.40 <= u <= 0.60 and 0.52 <= v <= 0.86:
            return fg
        # flame: an ellipse, pointed by narrowing toward the top
        fy = (v - 0.34) / 0.14
        fx = (u - 0.5) / (0.055 * (1.0 - 0.45 * max(0.0, -fy)))
        if fx * fx + fy * fy <= 1.0:
            return glow
        return colour
    return px

def ghost(bg, fg, eye, scale):
    """A ghost: a rounded head, a straight body with a wavy hem, two eyes."""
    def px(u, v):
        u = 0.5 + (u - 0.5) / scale
        v = 0.5 + (v - 0.5) / scale
        inside = False
        if v <= 0.5:
            inside = (u - 0.5) ** 2 + (v - 0.5) ** 2 <= 0.26 ** 2 or (0.24 <= u <= 0.76 and 0.5 - 0.0 <= v)
            inside = (u - 0.5) ** 2 + (v - 0.5) ** 2 <= 0.26 ** 2
        else:
            hem = 0.80 + 0.04 * (1 if int((u - 0.24) / 0.104) % 2 == 0 else -1)
            inside = 0.24 <= u <= 0.76 and v <= hem
        if inside:
            for ex in (0.42, 0.58):
                if (u - ex) ** 2 + (v - 0.48) ** 2 <= 0.032 ** 2:
                    return eye
            return fg
        return bg
    return px

APPS = {
    "study-dungeon": lambda s: candle(hexrgb("#110d17"), hexrgb("#f0e6cc"), hexrgb("#ff8a2b"), s),
    "ghosted": lambda s: ghost(hexrgb("#100e1a"), hexrgb("#ffd479"), hexrgb("#100e1a"), s),
}

for app, art in APPS.items():
    out = f"apps/{app}/public/icons"
    png(f"{out}/icon-192.png", 192, art(1.0))
    png(f"{out}/icon-512.png", 512, art(1.0))
    png(f"{out}/maskable-512.png", 512, art(0.62))
    png(f"{out}/apple-touch-icon.png", 180, art(0.8))
    print("wrote", out)
