import '@babylonjs/loaders/glTF';
import {
  AbstractMesh,
  LoadAssetContainerAsync,
  MirrorTexture,
  Plane,
  PBRMaterial,
  Color3,
  DynamicTexture,
  GlowLayer,
  HemisphericLight,
  Mesh,
  MeshBuilder,
  PointLight,
  Scene,
  StandardMaterial,
  TransformNode,
  Vector3,
} from '@babylonjs/core';
import { ACCESSORIES, BOTTOMS, findItem, hexRgb, Look, skinRgb, TOPS } from './look';
import { buildCity, tuneLagosMaterial } from './city';
import { Club, clubOf } from './venues';
import { addFloorReflection, addKeyShadows, applySurface, contactShadow, quality } from './render';

export type Portal = { kind: string; label: string; position: Vector3 };

export type VenueHandles = {
  bounds: { x: number; z: number };
  playerSpawn: Vector3;
  portals: Portal[];
  animate: (t: number, dt: number) => void;
  /** Register a mesh as a shadow caster for the venue's key light (no-op on low quality). */
  castShadow: (mesh: AbstractMesh) => void;
  /** Resolves once streamed assets (the city kit) are in the scene. */
  ready?: Promise<void>;
  /** Camera limits for big outdoor spaces. */
  camera?: { upperRadius?: number; maxZ?: number; /** Initial heading (ArcRotate alpha); default looks +Z. */ alpha?: number };
  /** Slide a move from `from` to `to` along walls and water; returns where the player actually ends up. */
  collide?: (from: Vector3, to: Vector3) => Vector3;
  /** Game-clock hour (0..24, fractional) for outdoor lighting. */
  setHour?: (hour: number) => void;
  /** Waypoints for a walk from `from` to `to` around buildings (tap-to-move). */
  route?: (from: Vector3, to: Vector3) => Vector3[];
  /** The building a ray hits first: where to walk to (its door) and the venue it opens, if any. */
  pick?: (origin: Vector3, dir: Vector3, from: Vector3) => { point: Vector3; portal?: string; distance: number } | null;
  /** How far the camera can sit from `target` towards `camPos` before a building gets in the way. */
  occlude?: (target: Vector3, camPos: Vector3) => number;
};

type VenueBuild = Omit<VenueHandles, 'castShadow'> & { roomMeshes?: AbstractMesh[] };

export function material(scene: Scene, name: string, color: Color3, emissive = Color3.Black()) {
  const mat = new StandardMaterial(name, scene);
  mat.diffuseColor = color;
  mat.emissiveColor = emissive;
  mat.specularColor = new Color3(0.12, 0.12, 0.12);
  // Venues mix several neon point lights with the key light; the default of 4 drops some of them.
  mat.maxSimultaneousLights = quality() === 'high' ? 12 : 6;
  return mat;
}

const rgb = (c: [number, number, number]) => new Color3(c[0], c[1], c[2]);

/** Text rendered onto a plane (name tags, neon signs). */
export function makeLabel(scene: Scene, name: string, text: string, opts: { color?: string; bg?: string; width?: number; height?: number; font?: number; billboard?: boolean } = {}) {
  const w = opts.width ?? 1.4;
  const h = opts.height ?? 0.35;
  const tex = new DynamicTexture(`${name}-tex`, { width: 512, height: Math.round((512 * h) / w) }, scene, true);
  tex.hasAlpha = true;
  const size = tex.getSize();
  const ctx = tex.getContext() as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, size.width, size.height);
  if (opts.bg !== 'none') {
    ctx.fillStyle = opts.bg ?? 'rgba(8, 6, 20, 0.72)';
    ctx.beginPath();
    ctx.roundRect(size.width * 0.1, size.height * 0.18, size.width * 0.8, size.height * 0.64, size.height * 0.32);
    ctx.fill();
  }
  ctx.font = `bold ${opts.font ?? 48}px Inter, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = opts.color ?? '#ffffff';
  ctx.shadowColor = opts.color ?? '#ffffff';
  ctx.shadowBlur = opts.bg === 'none' ? 18 : 0;
  ctx.fillText(text.slice(0, 22), size.width / 2, size.height / 2);
  tex.update();

  const mat = new StandardMaterial(`${name}-mat`, scene);
  mat.diffuseTexture = tex;
  mat.opacityTexture = tex;
  // Name tags stay crisp: just under the bloom threshold and out of the glow layer. Neon signs (bg 'none') still glow.
  const neonSign = opts.bg === 'none';
  mat.emissiveColor = neonSign ? Color3.White() : new Color3(0.82, 0.82, 0.82);
  mat.disableLighting = true;
  mat.backFaceCulling = false;

  const plane = MeshBuilder.CreatePlane(name, { width: w, height: h }, scene);
  plane.material = mat;
  plane.isPickable = false;
  if (opts.billboard !== false) plane.billboardMode = Mesh.BILLBOARDMODE_ALL;
  if (!neonSign) scene.effectLayers?.forEach((l) => { if (l instanceof GlowLayer) l.addExcludedMesh(plane); });
  return plane;
}

/**
 * Primitive humanoid driven by the full appearance model. It is a stand-in until real
 * rigged character models are wired in; every slider in the creator maps to something visible.
 */
export function makeHumanoid(scene: Scene, name: string, look: Look, accent: Color3, label?: string, labelColor?: string) {
  const root = new TransformNode(name, scene);
  const female = look.gender === 'female';
  const nb = look.gender === 'non_binary';
  const width = 0.85 + look.body_type * 0.4;
  const skin = material(scene, `${name}-skin`, rgb(skinRgb(look.skin_tone)));
  skin.specularColor = new Color3(0.28, 0.22, 0.2);
  skin.specularPower = 28;
  const top = findItem(TOPS, look.top);
  const bottom = findItem(BOTTOMS, look.bottom);
  const topMat = material(scene, `${name}-top`, rgb(hexRgb(top.color)));
  const bottomMat = material(scene, `${name}-bottom`, rgb(hexRgb(bottom.color)));
  const hairMat = material(scene, `${name}-hair-mat`, rgb(hexRgb(look.hair_color)));
  const parts: AbstractMesh[] = [];
  const add = <T extends Mesh>(m: T) => { m.parent = root; parts.push(m); return m; };

  // Legs (skin under skirts/dresses, cloth otherwise)
  const showLegs = bottom.kind === 'skirt' || top.kind === 'dress';
  const legs: Mesh[] = [];
  for (const side of [-1, 1]) {
    const leg = add(MeshBuilder.CreateCapsule(`${name}-leg-${side}`, { height: 0.92, radius: 0.085 + look.body_type * 0.03 }, scene));
    leg.material = showLegs ? skin : bottomMat;
    leg.position = new Vector3(side * 0.11 * width, 0.46, 0);
    const shoe = MeshBuilder.CreateBox(`${name}-shoe-${side}`, { width: 0.13, height: 0.08, depth: 0.24 }, scene);
    shoe.material = material(scene, `${name}-shoe-mat-${side}`, new Color3(0.92, 0.92, 0.95));
    shoe.position = new Vector3(0, -0.43, 0.04);
    shoe.parent = leg;
    legs.push(leg);
  }

  // Hips: skirt or dress flare
  if (bottom.kind === 'skirt' || top.kind === 'dress') {
    const skirt = add(MeshBuilder.CreateCylinder(`${name}-skirt`, { diameterTop: 0.42 * width, diameterBottom: 0.62 * width, height: 0.38, tessellation: 20 }, scene));
    skirt.material = top.kind === 'dress' ? topMat : bottomMat;
    skirt.position.y = 0.82;
  } else {
    const hips = add(MeshBuilder.CreateCylinder(`${name}-hips`, { diameter: 0.4 * width, height: 0.2, tessellation: 16 }, scene));
    hips.material = bottomMat;
    hips.position.y = 0.92;
  }

  // Torso, shaped slightly by gender presentation
  const torso = add(MeshBuilder.CreateCapsule(`${name}-torso`, { height: 0.72, radius: 0.21 }, scene));
  torso.material = top.kind === 'cami' ? skin : topMat;
  torso.position.y = 1.25;
  torso.scaling = new Vector3(width * (female ? 1.0 : nb ? 1.05 : 1.12), 1, 0.85 + look.body_type * 0.2);
  if (top.kind === 'cami') {
    const cami = add(MeshBuilder.CreateCylinder(`${name}-cami`, { diameter: 0.43, height: 0.42, tessellation: 18 }, scene));
    cami.material = topMat;
    cami.position.y = 1.2;
    cami.scaling = new Vector3(width, 1, 0.85 + look.body_type * 0.2);
  }
  if (top.kind === 'jacket' || top.kind === 'blazer') {
    const coat = add(MeshBuilder.CreateCapsule(`${name}-coat`, { height: 0.76, radius: 0.225 }, scene));
    coat.material = topMat;
    coat.position.y = 1.23;
    coat.scaling = new Vector3(width * 1.16, 1, 0.92 + look.body_type * 0.2);
    const inner = add(MeshBuilder.CreateBox(`${name}-inner`, { width: 0.12, height: 0.5, depth: 0.02 }, scene));
    inner.material = material(scene, `${name}-inner-mat`, new Color3(0.1, 0.1, 0.12));
    inner.position = new Vector3(0, 1.28, 0.2 + look.body_type * 0.04);
  }

  // Arms: sleeves for jackets/shirts/blazers
  const sleeves = ['jacket', 'blazer', 'shirt'].includes(top.kind);
  const arms: Mesh[] = [];
  for (const side of [-1, 1]) {
    const arm = add(MeshBuilder.CreateCapsule(`${name}-arm-${side}`, { height: 0.68, radius: 0.065 + look.body_type * 0.02 }, scene));
    arm.material = sleeves ? topMat : skin;
    const torsoHalf = 0.21 * width * (female ? 1.0 : nb ? 1.05 : 1.12);
    arm.position = new Vector3(side * (torsoHalf + 0.075), 1.22, 0);
    arm.rotation.z = side * 0.06;
    arms.push(arm);
  }

  // Head: facial structure pads stretch width/height/jaw subtly
  const [fx, fy, gx, gy] = look.face;
  const neck = add(MeshBuilder.CreateCylinder(`${name}-neck`, { diameter: 0.11, height: 0.12 }, scene));
  neck.material = skin;
  neck.position.y = 1.64;
  const head = add(MeshBuilder.CreateSphere(`${name}-head`, { diameter: 0.34, segments: 24 }, scene));
  head.material = skin;
  head.position.y = 1.82;
  // pad 1: x = narrow/wide, y = short/long face; pad 2: x = flat/defined, y = soft/strong jaw
  head.scaling = new Vector3(0.92 + fx * 0.08 + gy * 0.03, 1.08 + fy * 0.08, 0.98 + gx * 0.05);
  const white = material(scene, `${name}-sclera`, new Color3(0.95, 0.95, 0.95));
  const pupil = material(scene, `${name}-pupil`, new Color3(0.05, 0.03, 0.02));
  for (const side of [-1, 1]) {
    const eye = add(MeshBuilder.CreateSphere(`${name}-eye-${side}`, { diameter: 0.05, segments: 10 }, scene));
    eye.material = white;
    eye.position = new Vector3(side * 0.058, 1.845, 0.142 + gx * 0.006);
    eye.scaling.y = 0.75;
    const p = add(MeshBuilder.CreateSphere(`${name}-pupil-${side}`, { diameter: 0.026, segments: 8 }, scene));
    p.material = pupil;
    p.position = new Vector3(side * 0.058, 1.845, 0.165 + gx * 0.006);
    const brow = add(MeshBuilder.CreateBox(`${name}-brow-${side}`, { width: 0.06, height: 0.012, depth: 0.02 }, scene));
    brow.material = hairMat;
    brow.position = new Vector3(side * 0.058, 1.885, 0.155);
    brow.rotation.z = side * -0.12;
  }
  const nose = add(MeshBuilder.CreateSphere(`${name}-nose`, { diameter: 0.045, segments: 8 }, scene));
  nose.material = skin;
  nose.position = new Vector3(0, 1.8, 0.172 + gx * 0.008);
  nose.scaling = new Vector3(0.9, 1.1, 0.8);
  const mouth = add(MeshBuilder.CreateBox(`${name}-mouth`, { width: 0.06, height: 0.012, depth: 0.01 }, scene));
  mouth.material = material(scene, `${name}-mouth-mat`, new Color3(0.45, 0.18, 0.18));
  mouth.position = new Vector3(0, 1.755 - fy * 0.008, 0.158);

  // Hair: a cap tilted back so its rim sits at the hairline rather than across the face.
  const cap = add(MeshBuilder.CreateSphere(`${name}-hair`, { diameter: 0.365, slice: 0.5, segments: 20 }, scene));
  cap.material = hairMat;
  cap.position = new Vector3(0, 1.85, -0.02);
  cap.rotation.x = -0.45;
  cap.scaling = head.scaling.multiply(new Vector3(1.03, 1.0, 1.03));
  if (look.hair_length > 0.35) {
    const len = 0.15 + look.hair_length * 0.55;
    const back = add(MeshBuilder.CreateCapsule(`${name}-hair-back`, { height: len, radius: 0.15 + look.hair_length * 0.03 }, scene));
    back.material = hairMat;
    back.position = new Vector3(0, 1.86 - len / 2 + 0.08, -0.07);
    back.scaling.z = 0.6;
  }

  // Accessories
  const acc = findItem(ACCESSORIES, look.accessory);
  const accMat = material(scene, `${name}-acc-mat`, rgb(hexRgb(acc.color)));
  if (acc.kind === 'hat' || acc.kind === 'sunhat') {
    const brim = add(MeshBuilder.CreateCylinder(`${name}-brim`, { diameter: acc.kind === 'sunhat' ? 0.62 : 0.46, height: 0.02, tessellation: 24 }, scene));
    brim.material = accMat;
    brim.position.y = 1.97;
    const crown = add(MeshBuilder.CreateCylinder(`${name}-crown`, { diameter: 0.3, height: 0.14, tessellation: 20 }, scene));
    crown.material = accMat;
    crown.position.y = 2.04;
  } else if (acc.kind === 'cap') {
    const crown = add(MeshBuilder.CreateSphere(`${name}-cap`, { diameter: 0.38, slice: 0.5 }, scene));
    crown.material = accMat;
    crown.position.y = 1.9;
    const peak = add(MeshBuilder.CreateBox(`${name}-peak`, { width: 0.24, height: 0.02, depth: 0.16 }, scene));
    peak.material = accMat;
    peak.position = new Vector3(0, 1.92, 0.2);
  } else if (acc.kind === 'glasses' || acc.kind === 'shades') {
    for (const side of [-1, 1]) {
      const lens = add(MeshBuilder.CreateTorus(`${name}-lens-${side}`, { diameter: 0.075, thickness: 0.012, tessellation: 16 }, scene));
      lens.material = accMat;
      lens.rotation.x = Math.PI / 2;
      lens.position = new Vector3(side * 0.06, 1.84, 0.17);
      if (acc.kind === 'shades') {
        const tint = add(MeshBuilder.CreateDisc(`${name}-tint-${side}`, { radius: 0.036 }, scene));
        tint.material = accMat;
        tint.position = new Vector3(side * 0.06, 1.84, 0.172);
      }
    }
  }

  const shadow = contactShadow(scene, `${name}-contact`, 0.38 * width);
  shadow.parent = root;

  const ring = MeshBuilder.CreateTorus(`${name}-ring`, { diameter: 0.9, thickness: 0.03, tessellation: 32 }, scene);
  ring.material = material(scene, `${name}-ring-mat`, Color3.Black(), accent);
  ring.position.y = 0.03;
  ring.parent = root;

  if (label) {
    const tag = makeLabel(scene, `${name}-tag`, label, { color: labelColor });
    tag.position.y = 2.35;
    tag.parent = root;
  }

  let phase = 0;
  const animateWalk = (moving: boolean, dt: number) => {
    phase = moving ? phase + dt * 9 : phase * 0.85;
    const swing = Math.sin(phase) * 0.5;
    legs[0].rotation.x = swing;
    legs[1].rotation.x = -swing;
    arms[0].rotation.x = -swing * 0.8;
    arms[1].rotation.x = swing * 0.8;
  };

  return { root, ring, animateWalk, meshes: parts };
}

export type Humanoid = ReturnType<typeof makeHumanoid>;

/**
 * Lagos waterfront backdrop: lagoon, a tall Eko/VI-style skyline and a cable-stayed link bridge
 * (a nod to the Lekki-Ikoyi bridge). Stylized silhouettes only, so cheap: shared materials, one line system.
 * `z` is where the bridge crosses; `y` is the water level relative to the venue floor.
 */
export function addLagosSkyline(scene: Scene, opts: { z: number; y: number; width: number }) {
  const { z, y, width } = opts;
  const unfogged = (m: StandardMaterial) => { m.fogEnabled = false; return m; };

  const water = MeshBuilder.CreateGround('lagoon', { width: width * 1.4, height: 70 }, scene);
  water.position = new Vector3(0, y, z + 18);
  const waterMat = unfogged(material(scene, 'lagoon-mat', new Color3(0.02, 0.03, 0.08), new Color3(0.03, 0.05, 0.14)));
  waterMat.specularColor = new Color3(0.5, 0.45, 0.7);
  water.material = waterMat;

  // Skyline: deterministic towers with a few shared materials (lit floors read as emissive bands).
  const towerMats = [
    new Color3(0.08, 0.06, 0.2), new Color3(0.12, 0.07, 0.24), new Color3(0.05, 0.08, 0.2), new Color3(0.16, 0.08, 0.22),
  ].map((e, i) => unfogged(material(scene, `skyline-mat-${i}`, new Color3(0.03, 0.03, 0.07), e.scale(0.38))));
  const bandMat = unfogged(material(scene, 'skyline-band', Color3.Black(), new Color3(0.95, 0.72, 0.42)));
  const beaconMat = unfogged(material(scene, 'skyline-beacon', Color3.Black(), new Color3(1, 0.1, 0.15)));
  const beacons: Mesh[] = [];
  const count = 30;
  for (let i = 0; i < count; i++) {
    const x = -width / 2 + (i + 0.5) * (width / count) + (((i * 37) % 7) - 3);
    const h = 8 + ((i * 53) % 23) + (Math.abs(x) < width * 0.2 ? 10 : 0); // taller towards the centre (VI/Eko)
    const w = 2.5 + ((i * 11) % 4);
    const tz = z + 14 + ((i * 29) % 12);
    const tower = MeshBuilder.CreateBox(`skyline-${i}`, { width: w, height: h, depth: w }, scene);
    tower.position = new Vector3(x, y + h / 2, tz);
    tower.material = towerMats[i % towerMats.length];
    for (let b = 0; b < Math.floor(h / 6); b++) {
      if ((i + b) % 3 === 0) continue;
      const band = MeshBuilder.CreatePlane(`skyline-${i}-band-${b}`, { width: w * 0.8, height: 0.25 }, scene);
      band.position = new Vector3(x, y + 3 + b * 5.5, tz - w / 2 - 0.02);
      band.material = bandMat;
    }
    if (h > 24) {
      const beacon = MeshBuilder.CreateSphere(`skyline-${i}-beacon`, { diameter: 0.5 }, scene);
      beacon.position = new Vector3(x, y + h + 0.3, tz);
      beacon.material = beaconMat;
      beacons.push(beacon);
    }
  }

  // Cable-stayed bridge: deck, one tall pylon, fanned cables, warm deck lights.
  const deckY = y + 3;
  const deck = MeshBuilder.CreateBox('bridge-deck', { width: width, height: 0.5, depth: 1.6 }, scene);
  deck.position = new Vector3(0, deckY, z);
  deck.material = unfogged(material(scene, 'bridge-deck-mat', new Color3(0.1, 0.1, 0.14), new Color3(0.08, 0.07, 0.12)));
  const pylonX = -width * 0.08;
  const pylonH = 20;
  const pylonMat = unfogged(material(scene, 'bridge-pylon-mat', new Color3(0.15, 0.15, 0.2), new Color3(0.16, 0.14, 0.24)));
  const pylon = MeshBuilder.CreateBox('bridge-pylon', { width: 0.9, height: pylonH, depth: 0.9 }, scene);
  pylon.position = new Vector3(pylonX, y + pylonH / 2, z);
  pylon.material = pylonMat;
  for (let i = 0; i < 6; i++) {
    const pier = MeshBuilder.CreateBox(`bridge-pier-${i}`, { width: 0.6, height: 3, depth: 0.6 }, scene);
    pier.position = new Vector3(-width / 2 + (i + 0.5) * (width / 6), y + 1.5, z);
    pier.material = pylonMat;
  }
  const top = new Vector3(pylonX, y + pylonH - 0.5, z);
  const lines: Vector3[][] = [];
  for (let i = 1; i <= 9; i++) {
    for (const dir of [-1, 1]) {
      lines.push([top.add(new Vector3(0, -i * 0.6, 0)), new Vector3(pylonX + dir * i * 2.6, deckY + 0.25, z)]);
    }
  }
  const cables = MeshBuilder.CreateLineSystem('bridge-cables', { lines }, scene);
  cables.color = new Color3(0.75, 0.9, 1);
  cables.applyFog = false;
  const lampMat = unfogged(material(scene, 'bridge-lamp-mat', Color3.Black(), new Color3(1, 0.8, 0.5)));
  for (let i = 0; i < 24; i++) {
    const lamp = MeshBuilder.CreateBox(`bridge-lamp-${i}`, { size: 0.22 }, scene);
    lamp.position = new Vector3(-width / 2 + (i + 0.5) * (width / 24), deckY + 0.4, z - 0.8);
    lamp.material = lampMat;
  }
  const tip = MeshBuilder.CreateSphere('bridge-tip', { diameter: 0.5 }, scene);
  tip.position = new Vector3(pylonX, y + pylonH + 0.3, z);
  tip.material = beaconMat;

  return (t: number) => {
    const on = Math.sin(t * 2.4) > 0.2 ? 1 : 0.15;
    beaconMat.emissiveColor = new Color3(on, 0.1 * on, 0.15 * on);
    waterMat.emissiveColor = new Color3(0.03, 0.05 + Math.sin(t * 0.8) * 0.01, 0.14);
  };
}

/** Per-venue key light: direction, colour and strength of the shadow-casting light (ADR 0012). */
const KEY_LIGHTS: Record<string, { direction: Vector3; intensity: number; color: Color3; area: number }> = {
  lounge: { direction: new Vector3(-0.25, -1, 0.3), intensity: 0.28, color: new Color3(1, 0.62, 0.86), area: 12 },
  rooftop: { direction: new Vector3(0, -0.7, 1), intensity: 0.45, color: new Color3(1, 0.62, 0.38), area: 14 },
  private_room: { direction: new Vector3(0.2, -1, 0.25), intensity: 0.3, color: new Color3(1, 0.55, 0.5), area: 6 },
};

/** `from` is the venue you just left: back in the city you come out of its door. */
export function buildVenue(scene: Scene, kind: string, from?: string): VenueHandles {
  if (kind === 'city') return buildCity(scene, from);
  const glow = new GlowLayer('venue-glow', scene);
  glow.intensity = 0.55;
  const ambient = new HemisphericLight('ambient', new Vector3(0, 1, 0), scene);

  const club = clubOf(kind) ?? clubOf('neon_lounge')!;
  const open = club.style === 'rooftop' || club.style === 'beach';
  const build = kind === 'private_room' ? buildPrivateRoom(scene, glow, ambient)
    : club.style === 'beach' ? buildBeach(scene, glow, ambient, club)
    : open ? buildRooftop(scene, glow, ambient, club)
    : buildLounge(scene, glow, ambient, club);
  const shadows = addKeyShadows(scene, KEY_LIGHTS[kind === 'private_room' ? kind : open ? 'rooftop' : 'lounge']);
  build.ready?.then(() => build.roomMeshes?.forEach((m) => shadows.cast(m)));
  return { ...build, castShadow: shadows.cast };
}

/** The club's name in neon over the back wall. */
function clubSign(scene: Scene, club: Club, at: Vector3) {
  const sign = makeLabel(scene, 'club-sign', club.name.toUpperCase(), { color: club.color, bg: 'none', width: 6, height: 1.1, font: 72, billboard: false });
  sign.position = at;
  return sign;
}

/** Exit door mounted on the left (-X) wall, facing into the room. */
function exitDoor(scene: Scene, wallX: number, z: number, club: Club): Portal {
  const frame = MeshBuilder.CreateBox('exit-door', { width: 0.1, height: 2.3, depth: 1.4 }, scene);
  frame.position = new Vector3(wallX + 0.06, 1.15, z);
  frame.material = material(scene, 'exit-door-mat', new Color3(0.06, 0.06, 0.08), new Color3(0.01, 0.12, 0.16));
  const sign = makeLabel(scene, 'exit-sign', `EXIT → ${club.area.toUpperCase()}`, { color: '#8defff', bg: 'none', width: 2.6, height: 0.45, billboard: false });
  sign.position = new Vector3(wallX + 0.12, 2.65, z);
  sign.rotation.y = -Math.PI / 2;
  const marker = MeshBuilder.CreateDisc('exit-marker', { radius: 0.7, tessellation: 24 }, scene);
  marker.rotation.x = Math.PI / 2;
  marker.position = new Vector3(wallX + 1.0, 0.02, z);
  marker.material = material(scene, 'exit-marker-mat', Color3.Black(), new Color3(0.02, 0.2, 0.26));
  return { kind: 'city', label: club.street, position: new Vector3(wallX + 1.0, 0, z) };
}

/**
 * A room from the venue kit (`public/world/venues.glb`, built in Blender: scripts/blender). Its `neon` and `neon2`
 * accents take the club's two colours; `dancefloor` panels pulse. Resolves with the room's meshes.
 */
function loadRoom(scene: Scene, name: string, club: Club) {
  const accents: { mat: PBRMaterial; base: Color3; pulse: boolean }[] = [];
  const meshes: AbstractMesh[] = [];
  const ready = LoadAssetContainerAsync('/world/venues.glb', scene).then((c) => {
    if (scene.isDisposed) return;
    c.addAllToScene();
    const root = c.meshes.find((m) => m.name === '__root__');
    for (const holder of root?.getChildren() ?? []) {
      if (holder.name === name) meshes.push(...(holder as TransformNode).getChildMeshes(false));
      else holder.dispose(false, false);
    }
    for (const m of c.materials as PBRMaterial[]) {
      tuneLagosMaterial(m);
      // Range-based falloff like the StandardMaterial lights the venues are lit with.
      m.usePhysicalLightFalloff = false;
      m.maxSimultaneousLights = quality() === 'high' ? 8 : 4;
      const [base, variant] = m.name.split('.');
      if (base === 'neon' || base === 'neon2' || base === 'dancefloor') {
        const col = Color3.FromHexString(base === 'neon2' || variant === 'b' ? club.accent : club.color);
        m.albedoColor = Color3.Black();
        m.emissiveColor = col.scale(variant === 'dim' ? 0.16 : base === 'dancefloor' ? 0.28 : 0.8);
        accents.push({ mat: m, base: m.emissiveColor.clone(), pulse: base === 'dancefloor' });
      } else if (base === 'terrazzo' && quality() === 'high') {
        // Polished floor: a blurred planar reflection of the bar, the neon and the people on it.
        const mirror = new MirrorTexture(`${name}-floor-mirror`, 1024, scene, true);
        mirror.mirrorPlane = new Plane(0, -1, 0, 0);
        mirror.adaptiveBlurKernel = 12;
        mirror.level = 0.35;
        mirror.renderList = scene.meshes.filter((x) => !x.material?.name.startsWith('terrazzo'));
        scene.onNewMeshAddedObservable.add((x) => mirror.renderList?.push(x));
        m.reflectionTexture = mirror;
      }
    }
    for (const m of meshes) m.isPickable = false;
  });
  const animate = (t: number) => {
    accents.forEach((a, i) => { if (a.pulse) a.mat.emissiveColor = a.base.scale(0.55 + 0.45 * Math.max(0, Math.sin(t * 6.3 + i * 1.9))); });
  };
  return { ready, meshes, animate };
}

/** Keeps the player out of furniture: axis-aligned rectangles [x0, z0, x1, z1] inside the room's bounds. */
function furniture(bounds: { x: number; z: number }, rects: [number, number, number, number][]) {
  const R = 0.3;
  const blocked = (x: number, z: number) => Math.abs(x) > bounds.x || Math.abs(z) > bounds.z
    || rects.some(([x0, z0, x1, z1]) => x > x0 - R && x < x1 + R && z > z0 - R && z < z1 + R);
  return (from: Vector3, to: Vector3) => {
    if (!blocked(to.x, to.z)) return to;
    if (!blocked(to.x, from.z)) return new Vector3(to.x, to.y, from.z);
    if (!blocked(from.x, to.z)) return new Vector3(from.x, to.y, to.z);
    return from;
  };
}

function buildLounge(scene: Scene, glow: GlowLayer, ambient: HemisphericLight, club: Club): VenueBuild {
  const main = Color3.FromHexString(club.color);
  const second = Color3.FromHexString(club.accent);
  scene.clearColor.set(0.02, 0.02, 0.05, 1);
  ambient.intensity = 0.55;
  ambient.groundColor = new Color3(0.12, 0.06, 0.16);
  const pink = new PointLight('pink', new Vector3(-4, 3.8, -2), scene);
  pink.diffuse = main;
  pink.intensity = 1.0;
  pink.range = 16;
  const cyan = new PointLight('cyan', new Vector3(4, 3.6, 3), scene);
  cyan.diffuse = second;
  cyan.intensity = 0.8;
  cyan.range = 16;
  // Warm pendants over the bar, like the reference's lounge.
  const bar = new PointLight('bar-light', new Vector3(0, 2.2, 5.0), scene);
  bar.diffuse = new Color3(1, 0.78, 0.52);
  bar.intensity = 0.9;
  bar.range = 6;

  const room = loadRoom(scene, 'lounge-room', club);
  const exit = exitDoor(scene, -7.85, -4.5, club);
  clubSign(scene, club, new Vector3(0, 3.75, 7.66));
  const bounds = { x: 7.2, z: 7.2 };

  return {
    bounds,
    playerSpawn: new Vector3(-5.2, 0, -4.5),
    portals: [exit],
    ready: room.ready,
    roomMeshes: room.meshes,
    collide: furniture(bounds, [[-3.1, 4.8, 3.1, 8], [-2.8, 7.1, 2.8, 8], [-8, -0.6, -5.6, 3.6], [4.2, 6.2, 7.6, 8], [6.3, -2.6, 8, 2.6]]),
    animate: (t) => {
      glow.intensity = 0.4 + Math.sin(t * 2.2) * 0.06;
      room.animate(t);
      pink.intensity = 0.9 + Math.max(0, Math.sin(t * 5.8)) * 0.25;
    },
  };
}

function buildRooftop(scene: Scene, glow: GlowLayer, ambient: HemisphericLight, club: Club): VenueBuild {
  scene.clearColor.set(0.03, 0.015, 0.07, 1);
  ambient.intensity = 0.42;
  ambient.diffuse = new Color3(0.75, 0.65, 1);
  ambient.groundColor = new Color3(0.25, 0.15, 0.2);
  const sunset = new PointLight('sunset', new Vector3(0, 6, 9), scene);
  sunset.diffuse = new Color3(1, 0.5, 0.2);
  sunset.intensity = 1.1;
  sunset.range = 30;
  const pool = new PointLight('pool-light', new Vector3(3.75, 0.6, 2.3), scene);
  pool.diffuse = new Color3(0.2, 0.75, 1);
  pool.intensity = 0.7;
  pool.range = 6;

  const room = loadRoom(scene, 'rooftop-room', club);
  const skyline = addLagosSkyline(scene, { z: 60, y: -14, width: 180 });
  const bulbs = stringLights(scene, -8, 8, 3, -2);
  const exit = exitDoor(scene, -8.85, -5, club);
  clubSign(scene, club, new Vector3(4.5, 3.4, 8.55));
  const bounds = { x: 8.4, z: 8.4 };

  return {
    bounds,
    playerSpawn: new Vector3(-6.4, 0, -5),
    portals: [exit],
    ready: room.ready,
    roomMeshes: room.meshes,
    collide: furniture(bounds, [[1.2, 0.5, 6.3, 4.1], [2.0, 7.2, 7.0, 9], [-6.0, 7.1, -2.0, 9]]),
    animate: (t) => {
      glow.intensity = 0.5 + Math.sin(t * 1.5) * 0.06;
      skyline(t);
      room.animate(t);
      bulbs(t);
    },
  };
}

function buildBeach(scene: Scene, glow: GlowLayer, ambient: HemisphericLight, club: Club): VenueBuild {
  scene.clearColor.set(0.04, 0.03, 0.09, 1);
  ambient.intensity = 0.5;
  ambient.diffuse = new Color3(0.62, 0.62, 0.95);
  ambient.groundColor = new Color3(0.3, 0.22, 0.2);
  const fire = new PointLight('fire', new Vector3(3, 1.2, -3), scene);
  fire.diffuse = new Color3(1, 0.5, 0.15);
  fire.intensity = 1.2;
  fire.range = 9;
  const barLight = new PointLight('beach-bar', new Vector3(4.4, 2.8, 7.6), scene);
  barLight.diffuse = Color3.FromHexString(club.color);
  barLight.intensity = 0.9;
  barLight.range = 10;

  const room = loadRoom(scene, 'beach-room', club);
  // The Atlantic: dark water to the horizon with a moonlit sheen and a line of surf.
  const sea = MeshBuilder.CreateGround('sea', { width: 400, height: 200 }, scene);
  sea.position = new Vector3(0, -0.05, -110);
  const seaMat = material(scene, 'sea-mat', new Color3(0.02, 0.05, 0.1), new Color3(0.01, 0.03, 0.07));
  seaMat.specularColor = new Color3(0.6, 0.6, 0.8);
  seaMat.specularPower = 96;
  sea.material = seaMat;
  const surf = MeshBuilder.CreateGround('surf', { width: 400, height: 1.2 }, scene);
  surf.position = new Vector3(0, -0.02, -10.4);
  const surfMat = material(scene, 'surf-mat', Color3.Black(), new Color3(0.55, 0.6, 0.7));
  surfMat.alpha = 0.5;
  surf.material = surfMat;
  const bulbs = stringLights(scene, -8, 8, 3.4, 4.6);
  const exit = exitDoor(scene, -8.85, -1.5, club);
  clubSign(scene, club, new Vector3(4.4, 4.1, 6.5));
  const bounds = { x: 8.4, z: 8.4 };

  return {
    bounds,
    playerSpawn: new Vector3(-6.4, 0, -1.5),
    portals: [exit],
    ready: room.ready,
    roomMeshes: room.meshes,
    collide: furniture(bounds, [[1.4, 7.1, 7.4, 9], [-7.8, -6.4, -5.4, -4.0], [-4.6, -6.4, -2.2, -4.0], [1.6, -4.6, 4.4, -1.4]]),
    animate: (t) => {
      glow.intensity = 0.45;
      room.animate(t);
      bulbs(t);
      fire.intensity = 1.1 + Math.sin(t * 13) * 0.08 + Math.sin(t * 7.1) * 0.06;
      surf.position.z = -10.4 + Math.sin(t * 0.6) * 0.5;
      surfMat.alpha = 0.35 + Math.sin(t * 0.6) * 0.15;
    },
  };
}

/** A sagging string of warm bulbs from x0 to x1 at height y along z. */
function stringLights(scene: Scene, x0: number, x1: number, y: number, z: number) {
  const mats: StandardMaterial[] = [];
  for (let i = 0; i < 16; i++) {
    const f = i / 15;
    const bulb = MeshBuilder.CreateSphere(`bulb-${z}-${i}`, { diameter: 0.16, segments: 6 }, scene);
    bulb.position = new Vector3(x0 + (x1 - x0) * f, y - Math.sin(Math.PI * f) * 0.5, z);
    const m = material(scene, `bulb-mat-${z}-${i}`, Color3.Black(), new Color3(1, 0.75, 0.35));
    bulb.material = m;
    bulb.isPickable = false;
    mats.push(m);
  }
  return (t: number) => mats.forEach((m, i) => { m.emissiveColor = new Color3(1, 0.65 + Math.sin(t * 3 + i) * 0.15, 0.3); });
}

function buildPrivateRoom(scene: Scene, glow: GlowLayer, ambient: HemisphericLight): VenueBuild {
  scene.clearColor.set(0.04, 0.01, 0.03, 1);
  ambient.intensity = 0.45;
  ambient.groundColor = new Color3(0.15, 0.05, 0.08);
  const warm = new PointLight('warm', new Vector3(0, 3, 0), scene);
  warm.diffuse = new Color3(1, 0.35, 0.45);
  warm.intensity = 1.0;
  warm.range = 9;

  const floor = MeshBuilder.CreateGround('floor', { width: 8, height: 8 }, scene);
  const floorMat = applySurface(material(scene, 'floor-mat', new Color3(0.3, 0.16, 0.14)), 'wood', [3, 3], { gloss: 64, specular: 0.3 });
  floor.material = floorMat;
  addFloorReflection(scene, floor, floorMat, 0.35);
  for (const [x, z, w, d] of [[0, 4, 8, 0.1], [0, -4, 8, 0.1], [4, 0, 0.1, 8], [-4, 0, 0.1, 8]] as const) {
    const wall = MeshBuilder.CreateBox(`wall-${x}-${z}`, { width: w, height: 3, depth: d }, scene);
    wall.position = new Vector3(x, 1.5, z);
    wall.material = applySurface(material(scene, `wall-mat-${x}-${z}`, new Color3(0.26, 0.08, 0.14)), 'plaster', [3, 1]);
  }
  const couch = MeshBuilder.CreateBox('couch', { width: 3, height: 0.5, depth: 1 }, scene);
  couch.position = new Vector3(0, 0.25, 3.2);
  couch.material = applySurface(material(scene, 'couch-mat', new Color3(0.55, 0.08, 0.2)), 'fabric', [4, 1], { gloss: 12, specular: 0.05 });
  const back = MeshBuilder.CreateBox('couch-back', { width: 3, height: 0.7, depth: 0.25 }, scene);
  back.position = new Vector3(0, 0.75, 3.6);
  back.material = couch.material;
  const candleMats: StandardMaterial[] = [];
  for (let i = 0; i < 4; i++) {
    const candle = MeshBuilder.CreateCylinder(`candle-${i}`, { diameter: 0.12, height: 0.3 }, scene);
    candle.position = new Vector3(-1.5 + i, 0.15, 1.6);
    const m = material(scene, `candle-mat-${i}`, Color3.Black(), new Color3(1, 0.55, 0.2));
    candle.material = m;
    candleMats.push(m);
  }

  return {
    bounds: { x: 3.5, z: 3.5 },
    playerSpawn: new Vector3(0, 0, -1.5),
    portals: [],
    animate: (t) => {
      glow.intensity = 0.6;
      warm.intensity = 0.95 + Math.sin(t * 5) * 0.06;
      candleMats.forEach((m, i) => { m.emissiveColor = new Color3(1, 0.5 + Math.sin(t * 9 + i) * 0.08, 0.2); });
    },
  };
}
