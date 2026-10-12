"""Lagos city kit (ADR 0018/0019): realistic buildings, streets, palms and props → web/public/world/lagos.glb.

Run headless (after `node scripts/blender/fetch.mjs`), then pack both files (see README.md):
    /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup -P scripts/blender/build_city.py -- <out dir>

Everything is generated from code and Poly Haven CC0 PBR textures, so the kit is reproducible. Each asset is a
top-level node (an empty) named like the models `web/src/city.ts` places (`house-a`, `tower-c`, `road-bend`...), sitting
at the origin. Geometry is authored in game space (Babylon, metres): +X east, +Y up, +Z north, buildings' fronts facing
-Z, and converted to Blender space on the way out. Surfaces use world-scale UVs so textures keep real-world size.
"""
import math
import os
import random
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, ".cache")
# Output directory: lagos.glb (the city) and venues.glb (club interiors) are written there.
OUT_DIR = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else os.path.join(HERE, "../../web/public/world")
TILE = 11.0
LOT = TILE * 0.92  # city.ts scales anything wider than this down

bpy.ops.wm.read_factory_settings(use_empty=True)
rng = random.Random(20261012)

# ---------------------------------------------------------------- materials
# name -> (poly haven texture, metres per repeat). Tints are applied in city.ts by material-name suffix, so one
# texture serves many paint colours.
TEXTURED = {
    "asphalt": ("asphalt_02", 6.0),
    "pavers": ("herringbone_pavement_03", 1.6),
    "kerb": ("brushed_concrete", 1.2),
    "concrete": ("concrete_pavement", 3.0),
    "plaster": ("white_stucco", 2.5),
    "plaster2": ("painted_plaster_wall", 2.5),
    "roof-tiles": ("grey_roof_tiles", 2.5),
    "roof-clay": ("clay_roof_tiles_02", 2.5),
    "facade-dark": ("rectangular_facade_tiles", 3.0),
    "facade-light": ("concrete_tile_facade", 3.0),
    "shutter": ("painted_metal_shutter", 2.0),
    "gate": ("box_profile_metal_sheet", 1.6),
    "grass": ("leafy_grass", 3.0),
    "sand": ("coast_sand_01", 4.0),
    "plaza": ("large_grey_tiles", 2.4),
    "deck": ("wood_floor_deck", 2.4),
    "bark": ("palm_tree_bark", 1.0),
    "terrazzo": ("terrazzo_tiles", 2.0),
    "walnut": ("black_walnut_veneer_01", 1.2),
    "marble": ("marble_01", 1.5),
    "leather": ("leather_red_02", 0.8),
    "cushion": ("leather_white", 0.8),
    "planks": ("dark_wooden_planks", 2.0),
}
# name -> (base colour, roughness, metallic, emission strength)
PLAIN = {
    "glass": ((0.03, 0.04, 0.05), 0.06, 0.1, 0.0),
    "frame": ((0.12, 0.12, 0.13), 0.35, 0.8, 0.0),
    "frame-white": ((0.86, 0.86, 0.84), 0.45, 0.0, 0.0),
    "marking": ((0.85, 0.85, 0.82), 0.6, 0.0, 0.0),
    "marking-yellow": ((0.85, 0.65, 0.12), 0.6, 0.0, 0.0),
    "tank": ((0.03, 0.03, 0.035), 0.45, 0.0, 0.0),
    "steel": ((0.35, 0.36, 0.38), 0.4, 0.9, 0.0),
    "ac": ((0.78, 0.79, 0.8), 0.5, 0.2, 0.0),
    "grille": ((0.08, 0.08, 0.09), 0.6, 0.5, 0.0),
    "sign": ((0.05, 0.05, 0.06), 0.4, 0.3, 0.0),
    "brass": ((0.8, 0.6, 0.25), 0.25, 1.0, 0.0),
    "door": ((0.18, 0.11, 0.07), 0.5, 0.0, 0.0),
    "beacon": ((1.0, 0.05, 0.05), 0.5, 0.0, 4.0),
    "coconut": ((0.25, 0.18, 0.08), 0.6, 0.0, 0.0),
    "soil": ((0.12, 0.08, 0.05), 0.95, 0.0, 0.0),
    "pool": ((0.05, 0.55, 0.75), 0.03, 0.0, 0.6),
    "pooltile": ((0.55, 0.78, 0.86), 0.2, 0.0, 0.0),
    "canvas": ((0.92, 0.88, 0.8), 0.8, 0.0, 0.0),
    "thatch": ((0.42, 0.32, 0.18), 0.95, 0.0, 0.0),
    "fire": ((1.0, 0.42, 0.08), 0.8, 0.0, 6.0),
    "bottle-green": ((0.05, 0.3, 0.1), 0.05, 0.0, 0.25),
    "bottle-amber": ((0.5, 0.25, 0.04), 0.05, 0.0, 0.3),
    "bottle-clear": ((0.6, 0.65, 0.68), 0.05, 0.0, 0.2),
    "bottle-blue": ((0.08, 0.18, 0.55), 0.05, 0.0, 0.3),
}
# Emissive accents tinted per club in venue.ts / city.ts (`neon` = club colour, `neon2` = its second colour).
EMISSIVE = ("neon", "neon2", "dancefloor")
NEON = "neon"  # emissive white; city.ts tints it per club
LIT = ("win-lit", "win-dim")


def img(path, data=False):
    im = bpy.data.images.load(path, check_existing=True)
    if data:
        im.colorspace_settings.name = "Non-Color"
    return im


def principled(name):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    return m, m.node_tree, m.node_tree.nodes["Principled BSDF"]


MATS = {}


def mat(name):
    """Material by name; `plaster.cream` style names reuse the base material's textures under a new name."""
    if name in MATS:
        return MATS[name]
    base = name.split(".")[0]
    if base in TEXTURED:
        tex, _ = TEXTURED[base]
        d = os.path.join(CACHE, "textures", tex)
        m, nt, b = principled(name)
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = img(os.path.join(d, "diff.jpg"))
        nt.links.new(t.outputs["Color"], b.inputs["Base Color"])
        r = nt.nodes.new("ShaderNodeTexImage")
        r.image = img(os.path.join(d, "rough.jpg"), True)
        nt.links.new(r.outputs["Color"], b.inputs["Roughness"])
        n = nt.nodes.new("ShaderNodeTexImage")
        n.image = img(os.path.join(d, "nor_gl.jpg"), True)
        nm = nt.nodes.new("ShaderNodeNormalMap")
        nt.links.new(n.outputs["Color"], nm.inputs["Color"])
        nt.links.new(nm.outputs["Normal"], b.inputs["Normal"])
        b.inputs["Metallic"].default_value = 0.6 if base in ("shutter", "gate") else 0.0
    elif base in PLAIN:
        col, rough, metal, emit = PLAIN[base]
        m, nt, b = principled(name)
        b.inputs["Base Color"].default_value = (*col, 1)
        b.inputs["Roughness"].default_value = rough
        b.inputs["Metallic"].default_value = metal
        if emit:
            b.inputs["Emission Color"].default_value = (*col, 1)
            b.inputs["Emission Strength"].default_value = emit
    elif base == "railglass":
        m, nt, b = principled(name)
        b.inputs["Base Color"].default_value = (0.7, 0.8, 0.85, 1)
        b.inputs["Roughness"].default_value = 0.05
        b.inputs["Alpha"].default_value = 0.16
        m.surface_render_method = "BLENDED"
    elif base in EMISSIVE:
        m, nt, b = principled(name)
        b.inputs["Base Color"].default_value = (1, 1, 1, 1)
        b.inputs["Emission Color"].default_value = (1, 1, 1, 1)
        b.inputs["Emission Strength"].default_value = 1.0
    elif base in LIT:
        m, nt, b = principled(name)
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = window_atlas()
        nt.links.new(t.outputs["Color"], b.inputs["Base Color"])
        nt.links.new(t.outputs["Color"], b.inputs["Emission Color"])
        b.inputs["Emission Strength"].default_value = 1.0 if base == "win-lit" else 0.4
        b.inputs["Roughness"].default_value = 0.1
    elif base == "leaves":
        m, nt, b = principled(name)
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = leaf_texture()
        nt.links.new(t.outputs["Color"], b.inputs["Base Color"])
        nt.links.new(t.outputs["Alpha"], b.inputs["Alpha"])
        b.inputs["Roughness"].default_value = 0.45
        m.use_backface_culling = False
        m.surface_render_method = "DITHERED"
    elif base == "frond":
        m, nt, b = principled(name)
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = frond_texture()
        nt.links.new(t.outputs["Color"], b.inputs["Base Color"])
        nt.links.new(t.outputs["Alpha"], b.inputs["Alpha"])
        b.inputs["Roughness"].default_value = 0.7
        m.use_backface_culling = False
        m.surface_render_method = "DITHERED"
    else:
        raise KeyError(name)
    MATS[name] = m
    return m


def uv_scale(name):
    base = name.split(".")[0]
    return TEXTURED[base][1] if base in TEXTURED else 2.0


# ---------------------------------------------------------------- generated textures
_atlas = None


def window_atlas():
    """2×2 atlas of lit rooms seen through a window: warm with curtains, cool with blinds, TV-blue, warm sheers."""
    global _atlas
    if _atlas:
        return _atlas
    S = 256
    y, x = np.mgrid[0:S, 0:S] / S  # y = 0 at the bottom (Blender image origin)
    cells = []
    # warm room, curtains drawn to the sides
    c = np.stack([1.0 - 0.35 * (1 - y), 0.78 - 0.38 * (1 - y), 0.5 - 0.3 * (1 - y)], -1)
    curtain = (x < 0.18) | (x > 0.82)
    folds = 0.75 + 0.25 * np.sin(x * 90)
    c[curtain] = (np.stack([0.45 * folds, 0.12 * folds, 0.1 * folds], -1))[curtain]
    cells.append(c)
    # cool office/kitchen light with horizontal blinds
    c = np.stack([0.82 + 0 * y, 0.88 + 0 * y, 0.95 + 0 * y], -1) * (0.75 + 0.25 * y)[..., None]
    c *= np.where(np.sin(y * 120) > 0.55, 0.45, 1.0)[..., None]
    cells.append(c)
    # TV flicker: dim blue room, sofa silhouette
    c = np.stack([0.18 + 0.12 * y, 0.26 + 0.16 * y, 0.55 + 0.25 * y], -1)
    sofa = (y < 0.3) & (np.abs(x - 0.5) < 0.38)
    c[sofa] *= 0.25
    cells.append(c)
    # warm sheer curtain across the whole window
    c = np.stack([1.0 + 0 * y, 0.72 + 0 * y, 0.42 + 0 * y], -1) * (0.7 + 0.3 * np.sin(x * 60) ** 2)[..., None] * (0.7 + 0.3 * y)[..., None]
    cells.append(c)
    rgba = np.ones((2 * S, 2 * S, 4), np.float32)
    for i, c in enumerate(cells):
        cy, cx = divmod(i, 2)
        frame = (x < 0.03) | (x > 0.97) | (y < 0.03) | (y > 0.97)
        c = c.copy()
        c[frame] = 0.05
        rgba[cy * S:(cy + 1) * S, cx * S:(cx + 1) * S, :3] = np.clip(c, 0, 1)
    im = bpy.data.images.new("window-atlas", 2 * S, 2 * S, alpha=False)
    im.pixels.foreach_set(rgba.ravel())
    im.pack()
    _atlas = im
    return im


_leaves = None


def leaf_texture():
    """A cluster of broad glossy tropical leaves (ixora/croton hedges, the kind behind every Lagos gate), alpha cut-out."""
    global _leaves
    if _leaves:
        return _leaves
    S = 512
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
    col = np.zeros((S, S, 3), np.float32)
    alpha = np.zeros((S, S), np.float32)
    lr = np.random.default_rng(11)
    for _ in range(170):
        cx, cy = lr.uniform(40, S - 40, 2)
        # keep the cluster roughly round so card edges don't show
        if math.hypot(cx - S / 2, cy - S / 2) > S * 0.42:
            continue
        ang = lr.uniform(0, math.pi)
        L, Wd = lr.uniform(28, 52), lr.uniform(10, 18)
        ca, sa = math.cos(ang), math.sin(ang)
        x0, x1 = int(max(0, cx - L)), int(min(S, cx + L))
        y0, y1 = int(max(0, cy - L)), int(min(S, cy + L))
        px, py = xx[y0:y1, x0:x1] - cx, yy[y0:y1, x0:x1] - cy
        u = (px * ca + py * sa) / L
        v = (-px * sa + py * ca) / Wd
        inside = (u * u + v * v * (1 + 0.6 * u) ** -2) < 1
        tone = lr.uniform(0.6, 1.1)
        variety = lr.random()
        base = np.array([0.10, 0.30, 0.07]) if variety < 0.8 else np.array([0.45, 0.22, 0.06])  # some croton leaves
        shade = (0.75 + 0.35 * (1 - np.abs(v[inside]))) * tone
        vein = np.where(np.abs(v[inside]) < 0.08, 1.25, 1.0)
        c = base[None, :] * (shade * vein)[:, None]
        col[y0:y1, x0:x1][inside] = c
        alpha[y0:y1, x0:x1][inside] = 1
    rgba = np.concatenate([np.clip(col, 0, 1), alpha[..., None]], -1)
    im = bpy.data.images.new("bush-leaves", S, S, alpha=True)
    im.pixels.foreach_set(rgba.ravel())
    im.pack()
    _leaves = im
    return im


_frond = None


def frond_texture():
    """A palm frond on a strip: rachis along the middle (v = 0.5), leaflets sweeping to the tip (u = 1), alpha cut-out."""
    global _frond
    if _frond:
        return _frond
    W, H = 1024, 256
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    alpha = np.zeros((H, W), np.float32)
    col = np.zeros((H, W, 3), np.float32)
    frng = np.random.default_rng(7)
    # rachis
    rach = np.abs(yy - H / 2) < (3.0 - 2.0 * xx / W)
    alpha[rach] = 1
    col[rach] = (0.32, 0.36, 0.14)
    for side in (-1, 1):
        for k in range(64):
            t0 = 0.03 + k / 64 * 0.95
            if frng.random() < 0.06:
                continue  # a torn leaflet here and there
            reach = 0.47 * math.sin(math.pi * min(1.0, t0 * 1.02)) ** 0.6 * (0.85 + 0.15 * frng.random())
            ax, ay = t0 * W, H / 2
            bx, by = ax + (0.07 + 0.05 * t0) * W, ay + side * reach * H
            x0, x1 = int(max(0, min(ax, bx) - 6)), int(min(W, max(ax, bx) + 6))
            y0, y1 = int(max(0, min(ay, by) - 6)), int(min(H, max(ay, by) + 6))
            px, py = xx[y0:y1, x0:x1], yy[y0:y1, x0:x1]
            dx, dy = bx - ax, by - ay
            s = np.clip(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy), 0, 1)
            dist = np.hypot(px - (ax + s * dx), py - (ay + s * dy))
            width = 4.2 * (1 - s) ** 0.8 + 0.6
            inside = dist < width
            g = 0.75 + 0.25 * frng.random()
            tip = s[inside]
            c = np.stack([0.16 + 0.22 * tip ** 3, 0.32 + 0.1 * tip, 0.08 + 0.02 * tip], -1) * g
            shade = 0.8 + 0.2 * (1 - dist[inside] / width[inside])
            region = alpha[y0:y1, x0:x1]
            ccol = col[y0:y1, x0:x1]
            ccol[inside] = c * shade[:, None]
            region[inside] = 1
    rgba = np.concatenate([col, alpha[..., None]], -1)
    im = bpy.data.images.new("palm-frond", W, H, alpha=True)
    im.pixels.foreach_set(rgba.ravel())
    im.pack()
    _frond = im
    return im


# ---------------------------------------------------------------- geometry in game space
def g2b(p):
    return Vector((-p[0], -p[2], p[1]))


class Geo:
    def __init__(self):
        self.polys = []  # (points, material, normal, uvs or None, smooth)

    def poly(self, pts, m, n, uvs=None, smooth=False):
        self.polys.append(([tuple(p) for p in pts], m, tuple(n), uvs, smooth))

    def box(self, x0, y0, z0, x1, y1, z1, m, skip=(), mats=None):
        x0, x1 = min(x0, x1), max(x0, x1)
        y0, y1 = min(y0, y1), max(y0, y1)
        z0, z1 = min(z0, z1), max(z0, z1)
        c = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0), (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
        faces = {
            "-z": ((0, 1, 2, 3), (0, 0, -1)), "+z": ((5, 4, 7, 6), (0, 0, 1)),
            "-x": ((4, 0, 3, 7), (-1, 0, 0)), "+x": ((1, 5, 6, 2), (1, 0, 0)),
            "-y": ((4, 5, 1, 0), (0, -1, 0)), "+y": ((3, 2, 6, 7), (0, 1, 0)),
        }
        for k, (idx, n) in faces.items():
            if k not in skip:
                self.poly([c[i] for i in idx], (mats or {}).get(k, m), n)

    def cyl(self, cx, y0, cz, r, h, m, sides=12, cap=True, r1=None):
        r1 = r if r1 is None else r1
        ring = lambda y, rr: [(cx + rr * math.cos(2 * math.pi * i / sides), y, cz + rr * math.sin(2 * math.pi * i / sides)) for i in range(sides)]
        lo, hi = ring(y0, r), ring(y0 + h, r1)
        for i in range(sides):
            j = (i + 1) % sides
            a = 2 * math.pi * (i + 0.5) / sides
            self.poly([lo[i], lo[j], hi[j], hi[i]], m, (math.cos(a), 0, math.sin(a)), smooth=True)
        if cap:
            self.poly(hi, m, (0, 1, 0))


class Frame:
    """A wall's local frame: `s` along the wall, `y` up, `d` into the building. `o` is the wall's outer corner at s=0."""

    def __init__(self, geo, o, along, out):
        self.g, self.o, self.a, self.n = geo, Vector(o), Vector(along), Vector(out)

    def p(self, s, y, d):
        q = self.o + self.a * s - self.n * d
        return (q.x, y, q.z)

    def box(self, s0, s1, y0, y1, d0, d1, m, skip=(), mats=None):
        c = [self.p(s, y, d) for (s, y, d) in [(s0, y0, d0), (s1, y0, d0), (s1, y1, d0), (s0, y1, d0), (s0, y0, d1), (s1, y0, d1), (s1, y1, d1), (s0, y1, d1)]]
        a, n = tuple(self.a), tuple(self.n)
        neg = lambda v: tuple(-x for x in v)
        faces = {
            "out": ((0, 1, 2, 3), n), "in": ((5, 4, 7, 6), neg(n)),
            "s0": ((4, 0, 3, 7), neg(a)), "s1": ((1, 5, 6, 2), a),
            "bottom": ((4, 5, 1, 0), (0, -1, 0)), "top": ((3, 2, 6, 7), (0, 1, 0)),
        }
        for k, (idx, nn) in faces.items():
            if k not in skip:
                self.g.poly([c[i] for i in idx], (mats or {}).get(k, m), nn)

    def quad(self, s0, s1, y0, y1, d, m, uvs=None):
        self.g.poly([self.p(s0, y0, d), self.p(s1, y0, d), self.p(s1, y1, d), self.p(s0, y1, d)], m, tuple(self.n), uvs)


def walls(geo, x0, z0, x1, z1):
    """Frames for the four outer walls of a rectangle (front = -Z), each with its length."""
    return [
        (Frame(geo, (x0, 0, z0), (1, 0, 0), (0, 0, -1)), x1 - x0),  # front
        (Frame(geo, (x1, 0, z1), (-1, 0, 0), (0, 0, 1)), x1 - x0),  # back
        (Frame(geo, (x0, 0, z1), (0, 0, -1), (-1, 0, 0)), z1 - z0),  # west
        (Frame(geo, (x1, 0, z0), (0, 0, 1), (1, 0, 0)), z1 - z0),  # east
    ]


def pane(f, s0, s1, y0, y1, d, lit_share=0.42):
    """A window pane: dark reflective glass, or a lit room from the atlas."""
    r = rng.random()
    if r < lit_share:
        cell = rng.randrange(4)
        u0, v0 = (cell % 2) * 0.5, (cell // 2) * 0.5
        m = "win-lit" if r < lit_share * 0.65 else "win-dim"
        f.quad(s0, s1, y0, y1, d, m, uvs=[(u0, v0), (u0 + 0.5, v0), (u0 + 0.5, v0 + 0.5), (u0, v0 + 0.5)])
    else:
        f.quad(s0, s1, y0, y1, d, "glass")


def window_wall(f, length, y0, h, cols, wall, *, sill=0.9, wh=1.5, ww=1.3, t=0.25, frame="frame", lit=0.42,
                door_cols=(), band=None, ac=0.0, skip_sides=False):
    """One storey of wall with `cols` recessed windows: spandrel, lintel, piers, frames, sills and glass."""
    gap = (length - cols * ww) / (cols + 1)
    top = y0 + h
    sides = ("s0", "s1") if skip_sides else ()
    if cols == 0:
        f.box(0, length, y0, top, 0, t, wall, skip=("in",) + sides)
        return
    s = gap
    lowest = min([sill] + [0.05 for c in door_cols])
    f.box(0, length, y0, y0 + lowest, 0, t, wall, skip=("in", "bottom") + sides)
    for c in range(cols):
        door = c in door_cols
        ys, ye = (y0 + 0.05, y0 + 2.35) if door else (y0 + sill, y0 + sill + wh)
        # pier to the left, spandrel under (windows only), lintel over
        f.box(s - gap, s, y0 + lowest, top, 0, t, wall, skip=("in", "top", "bottom") + (sides if c == 0 else ()))
        if ys > y0 + lowest + 1e-3:
            f.box(s, s + ww, y0 + lowest, ys, 0, t, wall, skip=("in", "bottom", "s0", "s1"))
        f.box(s, s + ww, ye, top, 0, t, wall, skip=("in", "top", "s0", "s1"))
        # frame, mullion, glass, sill
        fd = t * 0.55
        for (a0, a1, b0, b1) in [(s, s + 0.06, ys, ye), (s + ww - 0.06, s + ww, ys, ye), (s, s + ww, ys, ys + 0.06), (s, s + ww, ye - 0.06, ye)]:
            f.box(a0, a1, b0, b1, fd - 0.03, fd + 0.03, frame, skip=("in",))
        if ww > 1.1:
            f.box(s + ww / 2 - 0.03, s + ww / 2 + 0.03, ys, ye, fd - 0.03, fd + 0.03, frame, skip=("in",))
        pane(f, s + 0.06, s + ww - 0.06, ys + 0.06, ye - 0.06, fd + 0.01, lit)
        if not door:
            f.box(s - 0.05, s + ww + 0.05, ys - 0.06, ys, -0.06, t * 0.5, "concrete", skip=("in",))
            if rng.random() < ac:
                f.box(s + ww * 0.1, s + ww * 0.1 + 0.8, ys - 0.65, ys - 0.1, -0.32, 0, "ac", mats={"out": "grille"}, skip=("in",))
        s += ww + gap
    f.box(s - gap, length, y0 + lowest, top, 0, t, wall, skip=("in", "top", "bottom") + sides)
    if band:
        f.box(-0.05, length + 0.05, top - 0.14, top + 0.06, -0.06, t, band, skip=("in",) + (() if not skip_sides else ("s0", "s1")))


def flat_roof(geo, x0, z0, x1, z1, y, wall, parapet=0.9, t=0.22):
    geo.box(x0, y - 0.25, z0, x1, y, z1, "concrete", skip=("-y",))
    geo.box(x0, y, z0, x1, y + parapet, z0 + t, wall)
    geo.box(x0, y, z1 - t, x1, y + parapet, z1, wall)
    geo.box(x0, y, z0 + t, x0 + t, y + parapet, z1 - t, wall, skip=("-z", "+z"))
    geo.box(x1 - t, y, z0 + t, x1, y + parapet, z1 - t, wall, skip=("-z", "+z"))
    for (a, b, c, d) in [(x0 - 0.04, z0 - 0.04, x1 + 0.04, z0 + t + 0.04), (x0 - 0.04, z1 - t - 0.04, x1 + 0.04, z1 + 0.04)]:
        geo.box(a, y + parapet, b, c, y + parapet + 0.08, d, "concrete", skip=("-y",))


def water_tank(geo, x, y, z, stand=0.0):
    """Lagos rooftop staple: a black plastic tank, sometimes on a steel stand."""
    if stand:
        for dx in (-0.6, 0.6):
            for dz in (-0.6, 0.6):
                geo.box(x + dx - 0.05, y, z + dz - 0.05, x + dx + 0.05, y + stand, z + dz + 0.05, "steel")
        geo.box(x - 0.8, y + stand, z - 0.8, x + 0.8, y + stand + 0.08, z + 0.8, "steel")
        y += stand + 0.08
    geo.cyl(x, y, z, 0.7, 1.45, "tank", sides=14, r1=0.66)
    geo.cyl(x, y + 1.45, z, 0.22, 0.1, "tank", sides=10)


def hip_roof(geo, x0, z0, x1, z1, y, rise, m, over=0.5):
    x0, z0, x1, z1 = x0 - over, z0 - over, x1 + over, z1 + over
    w, d = x1 - x0, z1 - z0
    sc = uv_scale(m)
    if w >= d:
        r0, r1 = (x0 + d / 2, y + rise, (z0 + z1) / 2), (x1 - d / 2, y + rise, (z0 + z1) / 2)
        faces = [
            ([(x0, y, z0), (x1, y, z0), r1, r0], (1, 0, 0), (0, 0, -1)),
            ([(x1, y, z1), (x0, y, z1), r0, r1], (-1, 0, 0), (0, 0, 1)),
            ([(x0, y, z1), (x0, y, z0), r0], (0, 0, -1), (-1, 0, 0)),
            ([(x1, y, z0), (x1, y, z1), r1], (0, 0, 1), (1, 0, 0)),
        ]
    else:
        r0, r1 = ((x0 + x1) / 2, y + rise, z0 + w / 2), ((x0 + x1) / 2, y + rise, z1 - w / 2)
        faces = [
            ([(x1, y, z0), (x1, y, z1), r1, r0], (0, 0, 1), (1, 0, 0)),
            ([(x0, y, z1), (x0, y, z0), r0, r1], (0, 0, -1), (-1, 0, 0)),
            ([(x0, y, z0), (x1, y, z0), r0], (1, 0, 0), (0, 0, -1)),
            ([(x1, y, z1), (x0, y, z1), r1], (-1, 0, 0), (0, 0, 1)),
        ]
    for pts, along, out in faces:
        # UVs on the slope: u along the eave, v up the slope, so tile rows run level on every face.
        e = Vector(along)
        up = (Vector(pts[-1]) - Vector(pts[0]))
        up = (up - e * up.dot(e)).normalized()
        n = e.cross(up) if e.cross(up).dot(Vector(out)) > 0 else up.cross(e)
        uvs = [(Vector(p).dot(e) / sc, Vector(p).dot(up) / sc) for p in pts]
        geo.poly(pts, m, tuple(n), uvs)
    # fascia and soffit
    geo.box(x0, y - 0.22, z0, x1, y, z0 + 0.04, "frame-white")
    geo.box(x0, y - 0.22, z1 - 0.04, x1, y, z1, "frame-white")
    geo.box(x0, y - 0.22, z0, x0 + 0.04, y, z1, "frame-white")
    geo.box(x1 - 0.04, y - 0.22, z0, x1, y, z1, "frame-white")
    geo.poly([(x0, y - 0.2, z0), (x0, y - 0.2, z1), (x1, y - 0.2, z1), (x1, y - 0.2, z0)], "frame-white", (0, -1, 0))


# ---------------------------------------------------------------- Lagos typologies
PAINTS = ["white", "cream", "sand", "peach", "grey", "terracotta", "sky", "mint"]


def house(variant):
    """Lekki duplex behind a compound wall with a sliding gate, a tank on a stand and a pitched tile roof."""
    g = Geo()
    paint = rng.choice(PAINTS)
    wall = f"plaster.{paint}"
    fence = f"plaster2.{rng.choice(['cream', 'white', 'grey', 'sand'])}"
    half = LOT / 2
    # compound wall with pillars and a gate
    gate_w, gate_at = 3.6, rng.choice([-2.2, 2.2])
    fh = 2.2
    segs = [(-half, gate_at - gate_w / 2), (gate_at + gate_w / 2, half)]
    for a, b in segs:
        g.box(a, 0, -half, b, fh, -half + 0.22, fence)
    g.box(-half, 0, half - 0.22, half, fh, half, fence)
    g.box(-half, 0, -half + 0.22, -half + 0.22, fh, half - 0.22, fence, skip=("-z", "+z"))
    g.box(half - 0.22, 0, -half + 0.22, half, fh, half - 0.22, fence, skip=("-z", "+z"))
    for x in [-half, -half / 2, gate_at - gate_w / 2 - 0.2, gate_at + gate_w / 2 + 0.2, half / 2, half]:
        x = max(-half + 0.2, min(half - 0.2, x))
        g.box(x - 0.22, 0, -half - 0.05, x + 0.22, fh + 0.25, -half + 0.3, fence)
        g.box(x - 0.27, fh + 0.25, -half - 0.1, x + 0.27, fh + 0.33, -half + 0.35, "concrete")
    gate_paint = rng.choice(["black", "black", "wine", "green", "navy"])
    g.box(gate_at - gate_w / 2, 0.05, -half + 0.05, gate_at + gate_w / 2, fh - 0.05, -half + 0.12, f"gate.{gate_paint}")
    g.poly([(-half + 0.22, 0.02, -half + 0.22), (half - 0.22, 0.02, -half + 0.22), (half - 0.22, 0.02, half - 0.22), (-half + 0.22, 0.02, half - 0.22)], "pavers", (0, 1, 0))
    # the house, set back behind the wall
    hw = rng.uniform(6.6, 7.8)
    x0, x1 = -hw / 2, hw / 2
    z0, z1 = rng.uniform(-2.2, -1.2), half - 0.9
    floors, fh2 = 2, 3.2
    flat = variant % 3 == 2
    for i in range(floors):
        for k, (f, length) in enumerate(walls(g, x0, z0, x1, z1)):
            cols = max(1, int(length // 2.4))
            door = (cols // 2,) if (i == 0 and k == 0) else ((cols // 2,) if (i == 1 and k == 0 and variant % 2 == 0) else ())
            window_wall(f, length, i * fh2, fh2, cols, wall, frame="frame-white", ww=1.2, wh=1.5, door_cols=door,
                        band="concrete" if i < floors - 1 else None, ac=0.25 if k > 1 else 0.1, skip_sides=k > 1, lit=0.5)
    top = floors * fh2
    if flat:
        flat_roof(g, x0, z0, x1, z1, top, wall, parapet=1.1)
        water_tank(g, x1 - 1.0, top, z1 - 1.0)
    else:
        g.box(x0, top - 0.2, z0, x1, top, z1, "concrete", skip=("+y",))
        hip_roof(g, x0, z0, x1, z1, top, rng.uniform(1.6, 2.3), f"roof-{'clay' if rng.random() < 0.35 else 'tiles'}.{rng.choice(['charcoal', 'red', 'blue', 'brown'])}")
    # porch: slab on two columns over the front door, a balcony on top
    px = rng.uniform(-1.0, 1.0)
    g.box(px - 1.8, fh2 - 0.25, z0 - 1.8, px + 1.8, fh2, z0, "concrete")
    for cx in (px - 1.6, px + 1.6):
        g.cyl(cx, 0, z0 - 1.6, 0.16, fh2 - 0.25, "frame-white", sides=10, cap=False)
    g.box(px - 1.8, fh2, z0 - 1.8, px + 1.8, fh2 + 1.0, z0 - 1.62, wall)
    # boys' quarters at the back corner and a tank on a stand
    bq = -1 if gate_at > 0 else 1
    g.box(bq * half - bq * 0.22 - (3.0 if bq > 0 else 0), 0, z1 - 0.1, bq * half - bq * 0.22 + (0 if bq > 0 else 3.0), 2.8, half - 0.22, wall, skip=("+z",))
    water_tank(g, -bq * (half - 1.2), 0, half - 1.2, stand=3.4)
    return g


def apartment(variant, shops=False):
    """Mid-rise block: balconies on the front, AC units on the sides, tanks and a stair core on the roof."""
    g = Geo()
    paint = rng.choice(PAINTS)
    wall = f"plaster.{paint}"
    floors = rng.randint(2, 3) if shops else rng.randint(4, 6)
    fh = 3.1
    w, d = rng.uniform(9.0, LOT - 0.2), rng.uniform(7.6, 9.4)
    x0, x1, z0, z1 = -w / 2, w / 2, -d / 2 + 0.6, d / 2
    cols = 3 if w < 9.6 else 4
    for i in range(floors):
        for k, (f, length) in enumerate(walls(g, x0, z0, x1, z1)):
            if shops and i == 0:
                if k == 0:
                    shopfront(g, f, length, fh, wall)
                else:
                    window_wall(f, length, 0, fh, 0, wall, skip_sides=k > 1)
                continue
            c = cols if k < 2 else max(2, int(length // 2.6))
            doors = tuple(range(c)) if (k == 0 and not shops and i > 0 and variant % 2 == 0) else ()
            window_wall(f, length, i * fh, fh, c, wall, door_cols=doors, band=f"plaster2.{rng.choice(['white', 'grey', 'cream'])}",
                        ac=0.35 if k >= 1 else 0.15, skip_sides=k > 1, lit=0.45, ww=1.4)
        if i > 0 and not shops and variant % 2 == 0:
            # full-width front balcony with a solid parapet
            g.box(x0 + 0.3, i * fh - 0.18, z0 - 1.25, x1 - 0.3, i * fh, z0, "concrete")
            g.box(x0 + 0.3, i * fh, z0 - 1.25, x1 - 0.3, i * fh + 1.05, z0 - 1.1, wall)
            for xx in (x0 + 0.3, x1 - 0.45):
                g.box(xx, i * fh, z0 - 1.1, xx + 0.15, i * fh + 1.05, z0, wall, skip=("+z",))
    top = floors * fh
    flat_roof(g, x0, z0, x1, z1, top, wall)
    g.box(x1 - 3.0, top, z1 - 3.0, x1 - 0.4, top + 2.6, z1 - 0.4, wall)
    flat_roof(g, x1 - 3.0, z1 - 3.0, x1 - 0.4, z1 - 0.4, top + 2.6, wall, parapet=0.3, t=0.12)
    for i in range(rng.randint(2, 4)):
        water_tank(g, x0 + 1.2 + i * 1.6, top + 2.6 if i == 0 else top, z1 - 1.2 if i else z1 - 1.7)
    if shops:
        g.box(x0, 0, z0 - 1.8, x1, 0.02, z0, "pavers", skip=("-y",))
    return g


def shopfront(g, f, length, fh, wall):
    """Ground-floor shops: glazed bays between piers, some behind half-drawn roller shutters, a fascia band above."""
    bays = max(2, int(length // 3.0))
    bw = (length - (bays + 1) * 0.4) / bays
    s = 0.4
    g_lintel = 2.9
    f.box(0, 0.4, 0, fh, 0, 0.3, wall, skip=("in", "top", "bottom"))
    for b in range(bays):
        f.box(s, s + bw, g_lintel, fh, 0, 0.3, wall, skip=("in", "top", "s0", "s1"))
        f.box(s, s + bw, 0, 0.25, 0, 0.3, "concrete", skip=("in", "bottom", "s0", "s1"))
        shut = rng.random()
        if shut < 0.35:
            f.quad(s, s + bw, 0.25, g_lintel, 0.12, "shutter.grey")
        else:
            drop = 0.4 if shut < 0.6 else 0.0
            if drop:
                f.quad(s, s + bw, g_lintel - drop, g_lintel, 0.08, "shutter.grey")
            f.box(s, s + bw, g_lintel - drop - 0.06, g_lintel - drop, 0.14, 0.2, "frame", skip=("in",))
            for k in range(1, 3):
                f.box(s + bw * k / 3 - 0.03, s + bw * k / 3 + 0.03, 0.25, g_lintel - drop, 0.14, 0.2, "frame", skip=("in",))
            pane(f, s, s + bw, 0.25, g_lintel - drop, 0.2, lit_share=0.8)
        f.box(s + bw, s + bw + 0.4, 0, fh, 0, 0.3, wall, skip=("in", "top", "bottom"))
        s += bw + 0.4
    # fascia for the shop signs (city.ts mounts neon here) and an awning slab
    f.box(-0.05, length + 0.05, g_lintel + 0.05, fh - 0.05, -0.12, 0, "sign", skip=("in",))
    f.box(0, length, g_lintel - 0.12, g_lintel, -1.4, 0, "concrete", skip=("in",))


def tower(variant):
    """Victoria Island office tower: podium, curtain wall of glass bays between fins, spandrel bands, crown and mast."""
    g = Geo()
    w = rng.uniform(8.8, LOT - 0.1)
    d = rng.uniform(8.8, LOT - 0.1)
    x0, x1, z0, z1 = -w / 2, w / 2, -d / 2, d / 2
    floors = rng.randint(10, 17)
    fh = 3.6
    skin = rng.choice(["facade-dark.black", "facade-dark.bronze", "facade-light.white", "facade-light.grey"])
    bay = 1.5
    pod = 2
    for k, (f, length) in enumerate(walls(g, x0, z0, x1, z1)):
        n = max(3, int(length // bay))
        bw = length / n
        # podium: double-height lobby glazing
        f.box(0, length, 0, 0.4, 0, 0.3, "concrete", skip=("in",))
        for i in range(n):
            pane(f, i * bw + 0.08, (i + 1) * bw - 0.08, 0.4, pod * fh - 0.6, 0.25, lit_share=0.7 if k == 0 else 0.4)
            f.box(i * bw - 0.06, i * bw + 0.06, 0.4, pod * fh - 0.6, -0.05, 0.3, "frame", skip=("in",))
        f.box(-0.1, length + 0.1, pod * fh - 0.6, pod * fh, -0.15, 0.3, skin, skip=("in",))
        # tower floors: a glass band and a spandrel band per storey
        for fl in range(pod, floors):
            y = fl * fh
            f.box(0, length, y, y + 0.9, 0, 0.3, skin, skip=("in", "s0", "s1"))
            for i in range(n):
                pane(f, i * bw, (i + 1) * bw, y + 0.9, y + fh, 0.18, lit_share=0.38)
        # vertical fins over the full height
        for i in range(n + 1):
            f.box(i * bw - 0.07, i * bw + 0.07, pod * fh, floors * fh, -0.18, 0.18, "frame", skip=("in", "bottom"))
    # corners close the side-wall overlap
    for (cx, cz) in [(x0, z0), (x1, z0), (x0, z1), (x1, z1)]:
        g.box(cx - 0.2, 0, cz - 0.2, cx + 0.2, floors * fh + 0.4, cz + 0.2, skin)
    top = floors * fh
    flat_roof(g, x0, z0, x1, z1, top, skin, parapet=1.2)
    # crown: a set-back plant room and a mast with an aviation light
    g.box(x0 + 2, top, z0 + 2, x1 - 2, top + 3.2, z1 - 2, skin)
    g.box(-0.08, top + 3.2, -0.08, 0.08, top + 3.2 + rng.uniform(5, 10), 0.08, "steel")
    g.box(-0.2, top + 3.2 + 4.8, -0.2, 0.2, top + 3.2 + 5.2, 0.2, "beacon")
    return g


def club(kind):
    """Club fronts: dark cladding, a lit canopy over the door, LED fins and rope posts. city.ts tints `neon` per club."""
    g = Geo()
    if kind == "beach":
        return beach_club(g)
    tall = kind == "tower"
    w, d = LOT - 0.2, LOT - 0.4
    x0, x1, z0, z1 = -w / 2, w / 2, -d / 2, d / 2
    skin = "facade-dark.black" if kind == "box" else "facade-dark.bronze"
    if tall:
        t = tower(0)
        g.polys.extend(t.polys)
        return g
    h = 8.5 if kind == "box" else 10.0
    for k, (f, length) in enumerate(walls(g, x0, z0, x1, z1)):
        if k == 0:
            # entrance: recessed doors in a glowing portal
            dw = 3.2
            s0 = (length - dw) / 2
            f.box(0, s0, 0, h, 0, 0.4, skin, skip=("in",))
            f.box(s0 + dw, length, 0, h, 0, 0.4, skin, skip=("in",))
            f.box(s0, s0 + dw, 3.0, h, 0, 0.4, skin, skip=("in", "s0", "s1"))
            f.quad(s0, s0 + dw, 0, 3.0, 1.2, "glass")
            for (a, b) in [(s0, s0 + 0.12), (s0 + dw - 0.12, s0 + dw)]:
                f.box(a, b, 0, 3.0, -0.02, 1.2, NEON, skip=("in",))
            f.box(s0, s0 + dw, 2.88, 3.0, -0.02, 1.2, NEON, skip=("in",))
            # canopy with an LED edge
            f.box(s0 - 1.6, s0 + dw + 1.6, 3.4, 3.7, -2.6, 0, "sign", skip=("in",))
            f.box(s0 - 1.6, s0 + dw + 1.6, 3.38, 3.42, -2.62, -2.5, NEON, skip=("in",))
            # LED fins up the facade
            for s in (0.6, 1.4, length - 1.4, length - 0.6):
                f.box(s - 0.05, s + 0.05, 0.5, h - 0.5, -0.12, 0, NEON, skip=("in",))
            if kind == "two":
                # VIP level: a lit glass band
                for i in range(4):
                    pane(f, 2.0 + i * (length - 4) / 4, 2.0 + (i + 1) * (length - 4) / 4 - 0.1, 5.0, 8.4, 0.2, lit_share=0.9)
            # rope posts
            for s in (s0 - 1.2, s0 - 0.2, s0 + dw + 0.2, s0 + dw + 1.2):
                p = f.p(s, 0, -1.8)
                g.cyl(p[0], 0, p[2], 0.05, 1.0, "brass", sides=8)
        else:
            f.box(0, length, 0, h, 0, 0.4, skin, skip=("in",) + (("s0", "s1") if k > 1 else ()))
    flat_roof(g, x0, z0, x1, z1, h, skin, parapet=0.6)
    g.box(x0 - 0.05, h + 0.6, z0 - 0.05, x1 + 0.05, h + 0.68, z0 + 0.1, NEON)
    for i in range(3):
        g.box(x0 + 1.2 + i * 2.4, h, z1 - 2.6, x0 + 3.0 + i * 2.4, h + 1.4, z1 - 0.8, "ac", mats={"-z": "grille"})
    return g


def beach_club(g):
    """Oniru beach club: a timber deck on the sand, a slatted pavilion roof on posts, a bar and day beds."""
    w = LOT - 0.2
    g.box(-w / 2, 0, -w / 2, w / 2, 0.45, w / 2, "deck")
    for x in (-w / 2 + 0.4, 0, w / 2 - 0.4):
        for z in (-w / 2 + 0.4, w / 2 - 0.4):
            g.cyl(x, 0.45, z, 0.14, 3.2, "deck", sides=8, cap=False)
    g.box(-w / 2 - 0.4, 3.65, -w / 2 - 0.4, w / 2 + 0.4, 3.9, w / 2 + 0.4, "deck")
    g.box(-w / 2 - 0.42, 3.62, -w / 2 - 0.42, w / 2 + 0.42, 3.66, -w / 2 - 0.3, NEON)
    g.box(-3.0, 0.45, w / 2 - 2.2, 3.0, 1.55, w / 2 - 1.4, "sign", mats={"-z": "deck"})
    g.box(-3.05, 1.55, w / 2 - 2.25, 3.05, 1.62, w / 2 - 1.35, "brass")
    for x in (-3.4, -1.1, 1.2, 3.4):
        g.box(x - 0.8, 0.45, -w / 2 + 1.0, x + 0.8, 0.75, -w / 2 + 2.9, "frame-white")
    return g


# ---------------------------------------------------------------- streets (11 m tiles, connections as in city.ts)
CARRIAGE = 3.5  # half-width of the asphalt
KERB = 0.15


def road(links, crossing=False, bridge=False):
    """A street tile. `links` ⊂ {N,E,S,W} at rotation 0 (see roadPiece in city.ts); +Z is north."""
    g = Geo()
    h = TILE / 2
    c = CARRIAGE
    if bridge:
        # deck over the lagoon: carriageway, raised walkways, parapets and a box girder underneath
        g.box(-c, -0.02, -h, c, 0.02, h, "asphalt", skip=("-y", "-z", "+z"))
        for sx in (-1, 1):
            a, b = sorted((sx * c, sx * (h - 0.25)))
            g.box(a, 0, -h, b, KERB, h, "pavers", skip=("-z", "+z"), mats={"-x": "kerb", "+x": "kerb"})
            a, b = sorted((sx * (h - 0.25), sx * h))
            g.box(a, 0, -h, b, 1.1, h, "concrete", skip=("-z", "+z"))
        g.box(-h, -1.6, -h, h, -0.02, h, "concrete", skip=("-z", "+z", "+y"))
        for z in (-h + 1, h - 1):
            g.box(-c + 0.15, 0.021, z - 0.6, -c + 0.3, 0.022, z + 0.6, "marking")
        g.box(-0.08, 0.021, -h, 0.08, 0.022, h, "marking-yellow")
        return g
    g.box(-c, -0.02, -c, c, 0.02, c, "asphalt", skip=("-y", "-x", "+x", "-z", "+z"))
    arms = {"E": (c, -c, h, c), "W": (-h, -c, -c, c), "N": (-c, c, c, h), "S": (-c, -h, c, -c)}
    for k, (ax0, az0, ax1, az1) in arms.items():
        if k in links:
            g.box(ax0, -0.02, az0, ax1, 0.02, az1, "asphalt", skip=("-y", "-x", "+x", "-z", "+z"))
        else:
            # pavement where the arm would be
            g.box(ax0, 0, az0, ax1, KERB, az1, "pavers", skip=("-y",), mats={f: "kerb" for f in ("-x", "+x", "-z", "+z")})
    for sx in (-1, 1):
        for sz in (-1, 1):
            a, b = sorted((sx * c, sx * h))
            e, f = sorted((sz * c, sz * h))
            g.box(a, 0, e, b, KERB, f, "pavers", skip=("-y",), mats={k: "kerb" for k in ("-x", "+x", "-z", "+z")})
    # markings: a dashed centre line and solid edge lines on every arm, zebra stripes on crossings
    for k in links:
        horiz = k in "EW"
        sign = 1 if k in "EN" else -1
        for i in range(3):
            a = sign * (c + 0.4 + i * 0.75)
            b = a + sign * 0.45
            a, b = sorted((a, b))
            if horiz:
                g.box(a, 0.021, -0.07, b, 0.022, 0.07, "marking", skip=("-y",))
            else:
                g.box(-0.07, 0.021, a, 0.07, 0.022, b, "marking", skip=("-y",))
        for off in (-c + 0.25, c - 0.25):
            a, b = sorted((sign * c, sign * h))
            if horiz:
                g.box(a, 0.021, off - 0.06, b, 0.022, off + 0.06, "marking", skip=("-y",))
            else:
                g.box(off - 0.06, 0.021, a, off + 0.06, 0.022, b, "marking", skip=("-y",))
    if len(links) == 2 and set(links) == {"E", "W"}:
        for i in range(-2, 3):
            a = i * 1.6
            g.box(a - 0.45, 0.021, -0.07, a + 0.45, 0.022, 0.07, "marking", skip=("-y",))
        if crossing:
            for i in range(7):
                z = -c + 0.5 + i * 1.0
                g.box(-1.6, 0.023, z - 0.3, 1.6, 0.024, z + 0.3, "marking", skip=("-y",))
    return g


def ground(m):
    g = Geo()
    h = TILE / 2
    g.poly([(-h, 0, -h), (h, 0, -h), (h, 0, h), (-h, 0, h)], m, (0, 1, 0))
    return g


# ---------------------------------------------------------------- palms
def palm(height, lean, fronds=15, seed=0):
    r = random.Random(seed)
    g = Geo()
    segs, sides = 12, 8
    ring_prev = None
    pts = []
    for i in range(segs + 1):
        t = i / segs
        x = lean * height * t * t
        y = height * t
        rad = 0.2 + 0.07 * (1 - t) ** 3 + 0.12 * max(0, 0.15 - t) / 0.15
        pts.append((x, y, rad))
    for i in range(segs + 1):
        x, y, rad = pts[i]
        ring = [(x + rad * math.cos(2 * math.pi * k / sides), y, rad * math.sin(2 * math.pi * k / sides)) for k in range(sides + 1)]
        if ring_prev:
            for k in range(sides):
                a = 2 * math.pi * (k + 0.5) / sides
                uvs = [(k / sides * 2, (i - 1) * height / segs), ((k + 1) / sides * 2, (i - 1) * height / segs),
                       ((k + 1) / sides * 2, i * height / segs), (k / sides * 2, i * height / segs)]
                g.poly([ring_prev[k], ring_prev[k + 1], ring[k + 1], ring[k]], "bark", (math.cos(a), 0, math.sin(a)), uvs, smooth=True)
        ring_prev = ring
    top = Vector((pts[-1][0], pts[-1][1], 0))
    for k in range(4):
        a = k * math.pi / 2 + 0.4
        g.cyl(top.x + 0.22 * math.cos(a), top.y - 0.35, 0.22 * math.sin(a), 0.11, 0.2, "coconut", sides=6)
    for f in range(fronds):
        az = 2 * math.pi * f / fronds + r.uniform(-0.15, 0.15)
        elev = r.uniform(-0.35, 0.75) if f % 3 else r.uniform(0.5, 1.0)
        L = r.uniform(3.2, 4.4)
        droop = r.uniform(0.9, 1.5)
        d = Vector((math.cos(az), 0, math.sin(az)))
        side = Vector((-d.z, 0, d.x))
        n = 8
        spine = []
        for i in range(n + 1):
            t = i / n
            p = top + d * (L * t * math.cos(elev * 0.6)) + Vector((0, L * (math.sin(elev) * t - droop * 0.5 * t * t), 0))
            spine.append(p)
        for i in range(n):
            t0, t1 = i / n, (i + 1) / n
            w0 = 0.7 * math.sin(math.pi * min(1, t0 * 1.05 + 0.04)) ** 0.6
            w1 = 0.7 * math.sin(math.pi * min(1, t1 * 1.05 + 0.04)) ** 0.6
            fold = Vector((0, 0.18, 0))
            for sgn in (-1, 1):
                a0, a1 = spine[i], spine[i + 1]
                b0, b1 = a0 + side * sgn * w0 + fold * w0, a1 + side * sgn * w1 + fold * w1
                v = 0.5 + sgn * 0.5
                g.poly([tuple(a0), tuple(a1), tuple(b1), tuple(b0)], "frond", (0, 1, 0), [(t0, 0.5), (t1, 0.5), (t1, v), (t0, v)])
    return g


def bush(radius, height, cards=18, seed=0):
    """A rounded hedge shrub: leaf-cluster cards in a dome, crossing each other so it looks full from every side."""
    r = random.Random(seed)
    g = Geo()
    for i in range(cards):
        a = r.uniform(0, math.pi)
        tilt = r.uniform(-0.5, 0.5)
        cx, cz = r.uniform(-radius * 0.35, radius * 0.35), r.uniform(-radius * 0.35, radius * 0.35)
        cy = r.uniform(height * 0.35, height * 0.65)
        size = r.uniform(0.75, 1.0) * radius
        d = Vector((math.cos(a), 0, math.sin(a)))
        up = Vector((0, 1, 0)) * math.cos(tilt) + Vector((-d.z, 0, d.x)) * math.sin(tilt)
        c = Vector((cx, cy, cz))
        pts = [c - d * size - up * size * height / radius / 2, c + d * size - up * size * height / radius / 2,
               c + d * size + up * size * height / radius / 2, c - d * size + up * size * height / radius / 2]
        n = d.cross(up)
        g.poly([tuple(p) for p in pts], "leaves", tuple(n), [(0, 0), (1, 0), (1, 1), (0, 1)])
    # a few flat cards on top so it doesn't look hollow from above
    for i in range(4):
        a = i * math.pi / 4
        d = Vector((math.cos(a), 0, math.sin(a)))
        e = Vector((-d.z, 0, d.x))
        c = Vector((0, height * 0.82, 0))
        pts = [c - d * radius * 0.8 - e * radius * 0.8, c + d * radius * 0.8 - e * radius * 0.8, c + d * radius * 0.8 + e * radius * 0.8, c - d * radius * 0.8 + e * radius * 0.8]
        g.poly([tuple(p) for p in pts], "leaves", (0, 1, 0), [(0, 0), (1, 0), (1, 1), (0, 1)])
    return g


# ---------------------------------------------------------------- to Blender
def to_object(name, geo):
    names = sorted({p[1] for p in geo.polys})
    slot = {n: i for i, n in enumerate(names)}
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new("UVMap")
    for pts, m, n, uvs, smooth in geo.polys:
        verts = [bm.verts.new(g2b(p)) for p in pts]
        try:
            face = bm.faces.new(verts)
        except ValueError:
            continue
        face.material_index = slot[m]
        face.smooth = smooth
        face.normal_update()
        if face.normal.dot(g2b(n)) < 0:
            face.normal_flip()
        sc = uv_scale(m)
        ax = max(range(3), key=lambda i: abs(n[i]))
        coords = {}
        for i, (v, p) in enumerate(zip(verts, pts)):
            if uvs:
                coords[v] = uvs[i]
            elif ax == 1:
                coords[v] = (p[0] / sc, p[2] / sc)
            elif ax == 0:
                coords[v] = (p[2] / sc, p[1] / sc)
            else:
                coords[v] = (p[0] / sc, p[1] / sc)
        for loop in face.loops:
            loop[uv].uv = coords[loop.vert]
    me = bpy.data.meshes.new(name + "-mesh")
    bm.to_mesh(me)
    bm.free()
    for n in names:
        me.materials.append(mat(n))
    ob = bpy.data.objects.new(name + "-mesh", me)
    bpy.context.scene.collection.objects.link(ob)
    holder = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(holder)
    ob.parent = holder
    return holder


def load_prop(ph_id, height, max_tris):
    """A Poly Haven model as one mesh object at the origin: scaled to `height` metres, merged and decimated."""
    path = os.path.join(CACHE, "models", ph_id, ph_id + ".gltf")
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    new_names = [o.name for o in new]
    meshes = [o for o in new if o.type == "MESH"]
    for o in new:
        o.select_set(o in meshes)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.parent = None
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for n in new_names:
        o = bpy.data.objects.get(n)
        if o is not None and o is not ob:
            bpy.data.objects.remove(o)
    # Specular maps and single-channel roughness maps don't survive the WebP export (and add little at this size):
    # drop them and use a constant roughness.
    for slot in ob.material_slots:
        if slot.material and slot.material.node_tree:
            nt = slot.material.node_tree
            for node in list(nt.nodes):
                name = node.image.name.lower() if node.type == "TEX_IMAGE" and node.image else ""
                if "spec" in name or "_rough" in name:
                    nt.nodes.remove(node)
            bsdf = nt.nodes.get("Principled BSDF")
            if bsdf and not bsdf.inputs["Roughness"].is_linked:
                bsdf.inputs["Roughness"].default_value = 0.65
    zs = [v.co.z for v in ob.data.vertices]
    s = height / (max(zs) - min(zs))
    ob.scale = (s, s, s)
    bpy.ops.object.transform_apply(scale=True)
    xs = [v.co.x for v in ob.data.vertices]
    ys = [v.co.y for v in ob.data.vertices]
    zs = [v.co.z for v in ob.data.vertices]
    for v in ob.data.vertices:
        v.co.x -= (max(xs) + min(xs)) / 2
        v.co.y -= (max(ys) + min(ys)) / 2
        v.co.z -= min(zs)
    tris = sum(len(p.vertices) - 2 for p in ob.data.polygons)
    if tris > max_tris:
        mod = ob.modifiers.new("decimate", "DECIMATE")
        mod.ratio = max_tris / tris
        bpy.ops.object.modifier_apply(modifier=mod.name)
    print(f"prop {ph_id}: {tris} -> {sum(len(p.vertices) - 2 for p in ob.data.polygons)} tris")
    return ob


def import_prop(name, ph_id, height, max_tris):
    ob = load_prop(ph_id, height, max_tris)
    ob.name = name + "-mesh"
    holder = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(holder)
    ob.parent = holder
    return holder


def copies(holder, src, places):
    """Linked duplicates of `src` under `holder` at game-space (x, y, z, yaw): one mesh in the file, many nodes."""
    for i, (x, y, z, yaw) in enumerate(places):
        o = src.copy()
        o.name = f"{holder.name}-{src.name}-{i}"
        bpy.context.scene.collection.objects.link(o)
        o.location = g2b((x, y, z))
        o.rotation_euler = (0, 0, -yaw)  # game yaw (Babylon, clockwise from above) is -Z in Blender
        o.parent = holder


# ---------------------------------------------------------------- venue interiors (ADR 0019)
# Rooms are authored around the spots the game already uses: the exit door on the west wall at z = -4.5, the player
# spawn at (-5.2, -4.5), NPCs at the bar (Maya -2.8,3.6; Dre 2.4,4.6) or by the DJ (Kai -4,6; Zara -3.5,4.5), and the
# date tables (lounge -2.2,2.6; rooftop 0,6.3). `neon` and `neon2` are tinted per club in venue.ts.


def lounge_room():
    """Club/lounge interior, 16 × 16 m: terrazzo floor, walnut slat walls, a marble-topped bar with backlit bottles,
    leather booths, a DJ booth and an LED dance floor."""
    g = Geo()
    h = 8.0
    g.poly([(-h, 0, -h), (h, 0, -h), (h, 0, h), (-h, 0, h)], "terrazzo.slate", (0, 1, 0))
    wall_h = 4.4
    g.box(-h, 0, 7.85, h, wall_h, 8.1, "plaster2.charcoal")
    g.box(-8.1, 0, -h, -7.85, wall_h, 7.85, "plaster2.charcoal")
    # walnut wainscot on the side wall, slat panelling behind the bar
    g.box(-7.85, 0, -h, -7.8, 1.1, -5.4, "walnut")
    g.box(-7.85, 0, -3.6, -7.8, 1.1, 7.85, "walnut")
    for i in range(46):
        x = -4.6 + i * 0.2
        g.box(x, 0.0, 7.72, x + 0.1, wall_h - 0.4, 7.85, "walnut", skip=("+z", "-y"))
    # neon lines along the top of the walls (the reference's ceiling line)
    g.box(-h, wall_h - 0.12, 7.78, h, wall_h - 0.06, 7.85, "neon")
    g.box(-7.85, wall_h - 0.12, -h, -7.78, wall_h - 0.06, 7.78, "neon")
    # bar: fluted walnut front, marble top, brass foot rail, LED under the lip
    g.box(-3.0, 0, 4.95, 3.0, 1.05, 5.85, "walnut", skip=("-y",))
    for i in range(40):
        x = -2.95 + i * 0.15
        g.cyl(x, 0.08, 4.95, 0.055, 0.92, "walnut", sides=6, cap=False)
    g.box(-3.1, 1.05, 4.82, 3.1, 1.11, 5.95, "marble")
    g.box(-3.0, 0.98, 4.84, 3.0, 1.03, 4.88, "neon2")
    g.box(-3.0, 0.18, 4.72, 3.0, 0.22, 4.76, "brass")
    g.box(-3.0, 0.0, 4.86, 3.0, 0.08, 4.95, "sign")
    # back bar: cabinet, glass shelves, backlit panel, bottles
    g.box(-2.8, 0, 7.15, 2.8, 1.0, 7.72, "walnut", skip=("-y",))
    g.box(-2.8, 1.0, 7.1, 2.8, 1.04, 7.72, "marble")
    g.box(-2.6, 1.3, 7.7, 2.6, 3.1, 7.71, "neon2.dim")
    bottle_mats = ["bottle-green", "bottle-amber", "bottle-clear", "bottle-amber", "bottle-green", "bottle-blue"]
    br = random.Random(4)
    for k, y in enumerate((1.04, 1.62, 2.22)):
        if k:
            g.box(-2.6, y - 0.03, 7.45, 2.6, y, 7.7, "glass")
        for i in range(18):
            x = -2.45 + i * 0.29 + br.uniform(-0.04, 0.04)
            hb = br.uniform(0.24, 0.34)
            g.cyl(x, y, 7.58, 0.04, hb * 0.7, bottle_mats[(i + k) % len(bottle_mats)], sides=8)
            g.cyl(x, y + hb * 0.7, 7.58, 0.016, hb * 0.3, bottle_mats[(i + k) % len(bottle_mats)], sides=6, r1=0.012)
    # U-shaped leather booth on the west wall with a marble table
    g.box(-7.8, 0, -0.6, -7.0, 0.46, 3.6, "leather", mats={"+y": "leather"})
    g.box(-7.8, 0.46, -0.6, -7.55, 1.25, 3.6, "leather")
    for z0, z1 in ((-0.6, 0.2), (2.8, 3.6)):
        g.box(-7.0, 0, z0, -5.6, 0.46, z1, "leather")
        g.box(-7.0, 0.46, z0 if z0 < 0 else z1 - 0.25, -5.6, 1.1, z0 + 0.25 if z0 < 0 else z1, "leather")
    g.cyl(-6.4, 0, 1.5, 0.08, 0.7, "brass", sides=8, cap=False)
    g.cyl(-6.4, 0.7, 1.5, 0.55, 0.05, "marble", sides=20)
    # DJ booth in the back-right corner with speaker stacks
    g.box(4.2, 0, 6.2, 6.9, 1.1, 7.3, "sign", mats={"-z": "walnut"})
    g.box(4.2, 0.2, 6.18, 6.9, 0.26, 6.2, "neon")
    g.box(4.3, 1.1, 6.3, 6.8, 1.13, 7.2, "sign")
    for x in (4.85, 6.25):
        g.cyl(x, 1.13, 6.75, 0.24, 0.03, "steel", sides=16)
    for x in (3.6, 7.2):
        g.box(x - 0.35, 0, 6.6, x + 0.35, 1.9, 7.3, "sign", mats={"-z": "grille"})
    # LED dance floor: 5 × 5 panels with thin joints
    for i in range(5):
        for j in range(5):
            x, z = 1.8 + (i - 2) * 0.86, -1.4 + (j - 2) * 0.86
            g.box(x - 0.41, 0, z - 0.41, x + 0.41, 0.04, z + 0.41, "dancefloor" if (i + j) % 2 else "dancefloor.b", skip=("-y",))
    # high tables around the floor
    for (x, z) in ((-1.0, -4.6), (4.9, -3.6), (-0.6, -0.6)):
        g.cyl(x, 0, z, 0.05, 1.05, "steel", sides=8, cap=False)
        g.cyl(x, 0, z, 0.28, 0.03, "steel", sides=12)
        g.cyl(x, 1.05, z, 0.38, 0.04, "marble", sides=16)
    return g


def rooftop_room():
    """Sky Garden: a timber deck with a lit pool, glass balustrade, planters with palms, loungers and a bar kiosk."""
    g = Geo()
    h = 9.0
    px0, px1, pz0, pz1 = 1.5, 6.0, 0.8, 3.8
    # deck around the pool opening
    for (a, b, c, d) in ((-h, -h, h, pz0), (-h, pz1, h, h), (-h, pz0, px0, pz1), (px1, pz0, h, pz1)):
        g.poly([(a, 0, b), (c, 0, b), (c, 0, d), (a, 0, d)], "deck", (0, 1, 0))
    g.box(px0, -1.2, pz0, px1, 0, pz0 + 0.02, "pooltile", skip=("-z",))
    g.box(px0, -1.2, pz1 - 0.02, px1, 0, pz1, "pooltile", skip=("+z",))
    g.box(px0, -1.2, pz0, px0 + 0.02, 0, pz1, "pooltile", skip=("-x",))
    g.box(px1 - 0.02, -1.2, pz0, px1, 0, pz1, "pooltile", skip=("+x",))
    g.poly([(px0, -0.12, pz0), (px1, -0.12, pz0), (px1, -0.12, pz1), (px0, -0.12, pz1)], "pool", (0, 1, 0))
    for (a, b, c, d) in ((px0 - 0.3, pz0 - 0.3, px1 + 0.3, pz0), (px0 - 0.3, pz1, px1 + 0.3, pz1 + 0.3), (px0 - 0.3, pz0, px0, pz1), (px1, pz0, px1 + 0.3, pz1)):
        g.box(a, 0, b, c, 0.06, d, "marble", skip=("-y",))
    # glass balustrade with a steel handrail on three sides (the stairs side stays open)
    for (a, b, c, d) in ((-h, h - 0.06, h, h), (-h, -h, h, -h + 0.06), (h - 0.06, -h, h, h)):
        g.box(a, 0, b, c, 1.05, d, "railglass")
        g.box(a, 1.05, b - 0.02, c, 1.1, d + 0.02, "steel")
    g.box(-h - 0.15, 0, -h, -h, 3.0, -3.0, "plaster2.charcoal")
    g.box(-h - 0.15, 0, -7.0, -h, 3.0, -3.0, "plaster2.charcoal")
    # planters with palms and bushes along the edges
    for (x, z) in ((-7.6, 7.6), (7.6, 7.6), (7.6, -7.6), (-2.0, -7.6), (7.6, 0.0)):
        g.box(x - 0.7, 0, z - 0.7, x + 0.7, 0.75, z + 0.7, "concrete")
        g.poly([(x - 0.6, 0.72, z - 0.6), (x + 0.6, 0.72, z - 0.6), (x + 0.6, 0.72, z + 0.6), (x - 0.6, 0.72, z + 0.6)], "soil", (0, 1, 0))
        p = palm(3.6, 0.06, fronds=12, seed=int(x * 3 + z))
        for pts, m, n, uvs, smooth in p.polys:
            g.poly([(a * 0.75 + x, b * 0.75 + 0.72, c * 0.75 + z) for (a, b, c) in pts], m, n, uvs, smooth)
    # loungers by the pool
    for i in range(3):
        x = 1.9 + i * 1.5
        g.box(x - 0.35, 0.0, -1.9, x + 0.35, 0.32, 0.1, "frame-white")
        g.box(x - 0.32, 0.32, -1.85, x + 0.32, 0.42, 0.05, "cushion")
        g.box(x - 0.32, 0.42, -0.4, x + 0.32, 0.75, 0.05, "cushion")
    # parasols
    for (x, z) in ((3.4, -3.6), (-5.6, -0.5)):
        g.cyl(x, 0, z, 0.04, 2.5, "steel", sides=8, cap=False)
        g.cyl(x, 2.2, z, 1.6, 0.5, "canvas", sides=16, r1=0.05)
        g.cyl(x, 0, z, 0.3, 0.08, "steel", sides=12)
    # bar kiosk on the north-east (DJ and NPCs keep the north-west)
    g.box(2.2, 0, 7.4, 6.8, 1.05, 8.2, "walnut", skip=("-y",))
    g.box(2.1, 1.05, 7.3, 6.9, 1.11, 8.3, "marble")
    g.box(2.2, 0.96, 7.28, 6.8, 1.0, 7.32, "neon2")
    g.box(2.0, 0, 8.6, 7.0, 3.0, 8.9, "walnut")
    g.box(2.2, 1.4, 8.58, 6.8, 2.6, 8.6, "neon2.dim")
    # DJ riser behind Kai
    g.box(-6.0, 0, 6.8, -2.0, 0.3, 8.6, "sign")
    g.box(-5.5, 0.3, 7.2, -2.5, 1.3, 7.9, "sign", mats={"-z": "walnut"})
    g.box(-5.5, 0.5, 7.18, -2.5, 0.56, 7.2, "neon")
    return g


def beach_room():
    """Moist Beach Club, Oniru: sand, a raised timber deck with a bar, cabanas with day beds, palms and a fire pit."""
    g = Geo()
    h = 9.0
    g.poly([(-h - 6, 0, -h - 6), (h + 6, 0, -h - 6), (h + 6, 0, h + 6), (-h - 6, 0, h + 6)], "sand", (0, 1, 0))
    # deck along the back with the bar
    g.box(-h, 0, 5.5, h, 0.35, h, "deck", skip=("-y",))
    for x in (-5.0, -1.0):
        g.box(x - 0.6, 0.35, 5.9, x + 0.6, 0.55, 6.4, "deck")  # steps
    g.box(1.6, 0.35, 7.3, 7.2, 1.4, 8.1, "walnut", skip=("-y",))
    g.box(1.5, 1.4, 7.2, 7.3, 1.46, 8.2, "marble")
    g.box(1.6, 1.32, 7.18, 7.2, 1.36, 7.22, "neon2")
    for x in (1.6, 7.2):
        for z in (6.9, 8.6):
            g.cyl(x, 0.35, z, 0.1, 2.9, "deck", sides=8, cap=False)
    g.box(1.2, 3.25, 6.6, 7.6, 3.45, 8.9, "thatch")
    g.box(1.15, 3.2, 6.55, 7.65, 3.24, 6.6, "neon")
    # cabanas with day beds facing the sea (south)
    for x in (-6.6, -3.4):
        z = -5.2
        for dx in (-1.1, 1.1):
            for dz in (-1.1, 1.1):
                g.cyl(x + dx, 0, z + dz, 0.07, 2.6, "frame-white", sides=8, cap=False)
        g.box(x - 1.25, 2.6, z - 1.25, x + 1.25, 2.68, z + 1.25, "canvas")
        g.box(x - 0.95, 0, z - 0.95, x + 0.95, 0.4, z + 0.95, "frame-white")
        g.box(x - 0.9, 0.4, z - 0.9, x + 0.9, 0.55, z + 0.9, "cushion")
        g.box(x - 0.9, 0.55, z + 0.6, x + 0.9, 0.9, z + 0.9, "cushion")
    # fire pit with a glowing bed of coals
    g.cyl(3.0, 0, -3.0, 0.9, 0.35, "concrete", sides=16)
    g.cyl(3.0, 0.35, -3.0, 0.7, 0.04, "fire", sides=16)
    for i in range(6):
        a = i * math.pi / 3
        g.box(3.0 + 1.5 * math.cos(a) - 0.25, 0, -3.0 + 1.5 * math.sin(a) - 0.25, 3.0 + 1.5 * math.cos(a) + 0.25, 0.42, -3.0 + 1.5 * math.sin(a) + 0.25, "deck")
    # palms on the sand
    for (x, z, hh, s) in ((-8.0, 3.0, 9.0, 1), (8.0, -6.0, 8.0, 2), (-1.0, -8.0, 7.5, 3), (8.5, 3.5, 10.0, 4)):
        p = palm(hh, 0.12, seed=s)
        for pts, m, n, uvs, smooth in p.polys:
            g.poly([(a + x, b, c + z) for (a, b, c) in pts], m, n, uvs, smooth)
    return g


def room(name, geo, props):
    holder = to_object(name, geo)
    for ob, places in props:
        copies(holder, ob, places)
    return holder


def export(path, holders):
    bpy.ops.object.select_all(action="DESELECT")
    for hld in holders:
        hld.select_set(True)
        for c in hld.children_recursive:
            c.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=os.path.abspath(path),
        export_format="GLB",
        export_image_format="WEBP",
        export_image_quality=82,
        export_yup=True,
        export_apply=True,
        export_materials="EXPORT",
        use_selection=True,
    )
    print(f"wrote {path}: {len(holders)} assets, {os.path.getsize(path) / 1e6:.1f} MB")


# ---------------------------------------------------------------- build
ASSETS = {}
for i, v in enumerate("abcdef"):
    ASSETS[f"house-{v}"] = house(i)
for i, v in enumerate("abcdef"):
    ASSETS[f"apartment-{v}"] = apartment(i)
for i, v in enumerate("abcd"):
    ASSETS[f"shop-{v}"] = apartment(i, shops=True)
for i, v in enumerate("abcdef"):
    ASSETS[f"tower-{v}"] = tower(i)
for k in ("box", "two", "tower", "beach"):
    ASSETS[f"club-{k}"] = club(k)
R = {"road-straight": "EW", "road-crossroad": "NESW", "road-intersection": "NEW", "road-bend": "NE", "road-end-round": "W"}
for name, links in R.items():
    ASSETS[name] = road(set(links))
ASSETS["road-crossing"] = road({"E", "W"}, crossing=True)
ASSETS["road-bridge"] = road({"N", "S"}, bridge=True)
for m in ("grass", "sand", "plaza"):
    ASSETS[f"ground-{m}"] = ground(m)
for i, (h, lean) in enumerate([(7.5, 0.06), (9.5, 0.1), (11.5, 0.05), (8.5, 0.14)]):
    ASSETS[f"palm-{'abcd'[i]}"] = palm(h, lean, seed=i)
ASSETS["shrub"] = bush(0.9, 1.2, seed=3)
ASSETS["shrub-b"] = bush(1.3, 1.6, cards=22, seed=5)

city = [to_object(name, geo) for name, geo in ASSETS.items()]
city.append(import_prop("street-lamp", "street_lamp_01", 7.0, 1500))
city.append(import_prop("generator", "portable_generator", 0.75, 1200))
city.append(import_prop("trash-bin", "metal_trash_can", 0.95, 600))
city.append(import_prop("monobloc", "plastic_monobloc_chair_01", 0.82, 600))
city.append(import_prop("barrier", "concrete_road_barrier", 0.85, 300))

# Furniture for the rooms (kept out of the scene root; linked copies are placed per room).
stool = load_prop("bar_chair_round_01", 0.78, 900)
sofa = load_prop("sofa_02", 0.85, 2500)
chair = load_prop("mid_century_lounge_chair", 0.95, 1800)
pendant = load_prop("modern_ceiling_lamp_01", 1.6, 600)
plant = load_prop("potted_plant_02", 1.4, 1500)
bistro = load_prop("outdoor_table_chair_set_01", 0.95, 1500)
venues = [
    room("lounge-room", lounge_room(), [
        (stool, [(x, 0, 4.25, 0) for x in (-2.0, -1.0, 0.0, 1.0)]),
        (pendant, [(x, 2.3, 5.4, 0) for x in (-2.0, 0.0, 2.0)]),
        (sofa, [(6.9, 0, 1.6, -math.pi / 2), (6.9, 0, -1.6, -math.pi / 2)]),
        (chair, [(4.6, 0, -6.4, 0.3), (6.4, 0, -6.4, -0.3)]),
        (plant, [(-7.2, 0, -7.3, 0), (-7.2, 0, 7.2, 0), (7.4, 0, 4.9, 0), (2.2, 0, -7.3, 0)]),
    ]),
    room("rooftop-room", rooftop_room(), [
        (bistro, [(-6.2, 0, -6.6, 0.4), (-3.6, 0, -4.4, 1.2), (5.6, 0, -6.4, 2.0)]),
        (stool, [(x, 0, 6.85, 0) for x in (3.0, 4.2, 5.4)]),
        (plant, [(-8.3, 0, 2.0, 0), (8.2, 0, 4.0, 0)]),
    ]),
    room("beach-room", beach_room(), [
        (stool, [(x, 0.35, 6.75, 0) for x in (2.6, 3.8, 5.0, 6.2)]),
        (bistro, [(-0.4, 0, -1.4, 0.5), (6.6, 0, 1.6, 1.4), (-6.8, 0, 1.2, 2.4)]),
    ]),
]
for ob in (stool, sofa, chair, pendant, plant, bistro):
    ob.hide_set(True)

# Downscale the big maps: 1k albedo stays, normals and roughness go to 512 to keep the kits light on phones.
# Props are small on screen, so all their maps go to 512 as well.
for im in bpy.data.images:
    small = "nor_gl" in im.filepath or "rough" in im.filepath or os.sep + "models" + os.sep in im.filepath
    if im.filepath and small and im.size[0] > 512:
        im.scale(512, 512)

os.makedirs(os.path.abspath(OUT_DIR), exist_ok=True)
export(os.path.join(OUT_DIR, "lagos.glb"), city)
export(os.path.join(OUT_DIR, "venues.glb"), venues)
