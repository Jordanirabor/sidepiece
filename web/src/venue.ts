import {
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

export type Portal = { kind: string; label: string; position: Vector3 };

export type VenueHandles = {
  bounds: { x: number; z: number };
  playerSpawn: Vector3;
  portals: Portal[];
  animate: (t: number) => void;
};

export function material(scene: Scene, name: string, color: Color3, emissive = Color3.Black()) {
  const mat = new StandardMaterial(name, scene);
  mat.diffuseColor = color;
  mat.emissiveColor = emissive;
  mat.specularColor = new Color3(0.12, 0.12, 0.12);
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
  mat.emissiveColor = Color3.White();
  mat.disableLighting = true;
  mat.backFaceCulling = false;

  const plane = MeshBuilder.CreatePlane(name, { width: w, height: h }, scene);
  plane.material = mat;
  plane.isPickable = false;
  if (opts.billboard !== false) plane.billboardMode = Mesh.BILLBOARDMODE_ALL;
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
  const top = findItem(TOPS, look.top);
  const bottom = findItem(BOTTOMS, look.bottom);
  const topMat = material(scene, `${name}-top`, rgb(hexRgb(top.color)));
  const bottomMat = material(scene, `${name}-bottom`, rgb(hexRgb(bottom.color)));
  const hairMat = material(scene, `${name}-hair-mat`, rgb(hexRgb(look.hair_color)));
  const parts: Mesh[] = [];
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

  return { root, ring, animateWalk };
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
  ].map((e, i) => unfogged(material(scene, `skyline-mat-${i}`, new Color3(0.03, 0.03, 0.07), e)));
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

export function buildVenue(scene: Scene, kind: string): VenueHandles {
  const glow = new GlowLayer('venue-glow', scene);
  glow.intensity = 0.55;
  const ambient = new HemisphericLight('ambient', new Vector3(0, 1, 0), scene);

  if (kind === 'city') return buildCity(scene, glow, ambient);
  if (kind === 'rooftop_party') return buildRooftop(scene, glow, ambient);
  if (kind === 'private_room') return buildPrivateRoom(scene, glow, ambient);
  return buildLounge(scene, glow, ambient);
}

/** Exit door mounted on the left (-X) wall, facing into the room. */
function exitDoor(scene: Scene, wallX: number, z: number): Portal {
  const frame = MeshBuilder.CreateBox('exit-door', { width: 0.1, height: 2.3, depth: 1.4 }, scene);
  frame.position = new Vector3(wallX + 0.06, 1.15, z);
  frame.material = material(scene, 'exit-door-mat', new Color3(0.05, 0.05, 0.08), new Color3(0.02, 0.35, 0.45));
  const sign = makeLabel(scene, 'exit-sign', 'EXIT → LEKKI', { color: '#8defff', bg: 'none', width: 1.8, height: 0.45, billboard: false });
  sign.position = new Vector3(wallX + 0.12, 2.65, z);
  sign.rotation.y = -Math.PI / 2;
  const marker = MeshBuilder.CreateDisc('exit-marker', { radius: 0.7, tessellation: 24 }, scene);
  marker.rotation.x = Math.PI / 2;
  marker.position = new Vector3(wallX + 1.0, 0.02, z);
  marker.material = material(scene, 'exit-marker-mat', Color3.Black(), new Color3(0.02, 0.3, 0.38));
  return { kind: 'city', label: 'Lekki Phase 1', position: new Vector3(wallX + 1.0, 0, z) };
}

function buildCity(scene: Scene, glow: GlowLayer, ambient: HemisphericLight): VenueHandles {
  scene.clearColor.set(0.06, 0.04, 0.14, 1);
  ambient.intensity = 0.85;
  ambient.diffuse = new Color3(0.62, 0.58, 1);
  ambient.groundColor = new Color3(0.22, 0.12, 0.3);
  scene.fogMode = Scene.FOGMODE_EXP2;
  scene.fogDensity = 0.018;
  scene.fogColor = new Color3(0.06, 0.04, 0.14);

  // Street lamps down both sidewalks.
  for (const side of [-1, 1]) {
    for (let z = -16; z <= 16; z += 8) {
      const pole = MeshBuilder.CreateCylinder(`lamp-${side}-${z}`, { diameter: 0.09, height: 3.6 }, scene);
      pole.position = new Vector3(side * 6.3, 1.8, z + side * 2);
      pole.material = material(scene, `lamp-mat-${side}-${z}`, new Color3(0.08, 0.08, 0.1));
      const bulb = MeshBuilder.CreateSphere(`lamp-bulb-${side}-${z}`, { diameter: 0.32 }, scene);
      bulb.position = new Vector3(side * 6.3, 3.65, z + side * 2);
      bulb.material = material(scene, `lamp-bulb-mat-${side}-${z}`, Color3.Black(), new Color3(1, 0.85, 0.6));
      const light = new PointLight(`lamp-light-${side}-${z}`, bulb.position.clone(), scene);
      light.diffuse = new Color3(1, 0.82, 0.6);
      light.intensity = 0.8;
      light.range = 9;
    }
  }

  const street = MeshBuilder.CreateGround('street', { width: 12, height: 44 }, scene);
  street.material = material(scene, 'street-mat', new Color3(0.16, 0.15, 0.2));
  for (const side of [-1, 1]) {
    const walk = MeshBuilder.CreateBox(`sidewalk-${side}`, { width: 3, height: 0.12, depth: 44 }, scene);
    walk.position = new Vector3(side * 7.5, 0.06, 0);
    walk.material = material(scene, `sidewalk-mat-${side}`, new Color3(0.3, 0.28, 0.34));
  }
  for (let z = -20; z <= 20; z += 4) {
    const dash = MeshBuilder.CreateBox(`dash-${z}`, { width: 0.12, height: 0.01, depth: 1.6 }, scene);
    dash.position = new Vector3(0, 0.01, z);
    dash.material = material(scene, `dash-mat-${z}`, Color3.Black(), new Color3(0.6, 0.55, 0.3));
  }

  const signs: { mat: StandardMaterial; base: Color3 }[] = [];
  const neon = ['#ff2f91', '#8defff', '#b934ff', '#ffb02e', '#3fdc8f'];
  for (const side of [-1, 1]) {
    for (let i = 0; i < 6; i++) {
      const h = 8 + ((i * 5 + (side > 0 ? 3 : 0)) % 9);
      const b = MeshBuilder.CreateBox(`bldg-${side}-${i}`, { width: 5, height: h, depth: 6.5 }, scene);
      b.position = new Vector3(side * 11.5, h / 2, -18 + i * 7.2);
      b.material = material(scene, `bldg-mat-${side}-${i}`, new Color3(0.16, 0.13, 0.26), new Color3(0.04, 0.03, 0.08));
      // lit windows
      for (let r = 0; r < Math.floor(h / 2.2); r++) {
        const win = MeshBuilder.CreatePlane(`win-${side}-${i}-${r}`, { width: 3.6, height: 0.5 }, scene);
        win.position = new Vector3(side * 8.98, 3 + r * 2.1, -18 + i * 7.2);
        win.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
        win.material = material(scene, `win-mat-${side}-${i}-${r}`, Color3.Black(), (i + r) % 4 === 0 ? new Color3(0.9, 0.7, 0.4) : new Color3(0.22 + ((i + r) % 3) * 0.08, 0.18, 0.4));
      }
      const c = hexRgb(neon[(i + (side > 0 ? 2 : 0)) % neon.length]);
      const strip = MeshBuilder.CreateBox(`neon-${side}-${i}`, { width: 0.08, height: 0.08, depth: 5.6 }, scene);
      strip.position = new Vector3(side * 8.96, 3.2, -18 + i * 7.2);
      const base = new Color3(c[0], c[1], c[2]);
      const m = material(scene, `neon-mat-${side}-${i}`, Color3.Black(), base);
      strip.material = m;
      signs.push({ mat: m, base });
    }
  }

  const venueDoor = (kind: string, signText: string, label: string, color: string, x: number, z: number) => {
    const side = Math.sign(x);
    const door = MeshBuilder.CreateBox(`door-${kind}`, { width: 0.12, height: 2.6, depth: 2 }, scene);
    door.position = new Vector3(x, 1.3, z);
    const c = hexRgb(color);
    door.material = material(scene, `door-mat-${kind}`, new Color3(0.04, 0.03, 0.06), new Color3(c[0] * 0.75, c[1] * 0.75, c[2] * 0.75));
    // glowing floor marker so the entrance reads from a distance
    const mat = MeshBuilder.CreateDisc(`door-marker-${kind}`, { radius: 1.1, tessellation: 32 }, scene);
    mat.rotation.x = Math.PI / 2;
    mat.position = new Vector3(x - side * 1.3, 0.14, z);
    mat.material = material(scene, `door-marker-mat-${kind}`, Color3.Black(), new Color3(c[0] * 0.6, c[1] * 0.6, c[2] * 0.6));
    const sign = makeLabel(scene, `sign-${kind}`, signText, { color, bg: 'none', width: 4.2, height: 0.9, font: 64, billboard: false });
    sign.position = new Vector3(x - side * 0.05, 3.9, z);
    sign.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
    const light = new PointLight(`door-light-${kind}`, new Vector3(x - side * 1.5, 3, z), scene);
    light.diffuse = new Color3(c[0], c[1], c[2]);
    light.intensity = 1.4;
    light.range = 7;
    return { kind, label, position: new Vector3(x - side * 1.2, 0, z) };
  };

  // The street ends at the lagoon: promenade wall, then the Lagos skyline and link bridge.
  const promenade = MeshBuilder.CreateBox('promenade', { width: 18, height: 0.7, depth: 0.4 }, scene);
  promenade.position = new Vector3(0, 0.35, 22);
  promenade.material = material(scene, 'promenade-mat', new Color3(0.22, 0.2, 0.28), new Color3(0.05, 0.03, 0.08));
  const skyline = addLagosSkyline(scene, { z: 40, y: -0.8, width: 140 });

  const portals: Portal[] = [
    venueDoor('neon_lounge', 'IKOYI LOUNGE', 'Ikoyi Lounge', '#ff2f91', -8.95, -3.6),
    venueDoor('rooftop_party', 'VI ROOFTOP ↑', 'Victoria Island Rooftop', '#ffb02e', 8.95, 3.6),
  ];

  return {
    bounds: { x: 8.6, z: 20 },
    playerSpawn: new Vector3(0, 0, -12),
    portals,
    animate: (t) => {
      glow.intensity = 0.5 + Math.sin(t * 1.7) * 0.07;
      skyline(t);
      signs.forEach(({ mat, base }, i) => {
        const flicker = 0.75 + Math.sin(t * (2 + (i % 3)) + i) * 0.25;
        mat.emissiveColor = base.scale(flicker);
      });
    },
  };
}

function buildLounge(scene: Scene, glow: GlowLayer, ambient: HemisphericLight): VenueHandles {
  scene.clearColor.set(0.02, 0.02, 0.05, 1);
  ambient.intensity = 0.55;
  ambient.groundColor = new Color3(0.12, 0.06, 0.16);
  const pink = new PointLight('pink', new Vector3(-4, 5, -2), scene);
  pink.diffuse = new Color3(1, 0.1, 0.55);
  pink.intensity = 1.1;
  pink.range = 16;
  const cyan = new PointLight('cyan', new Vector3(4, 4, 3), scene);
  cyan.diffuse = new Color3(0, 0.85, 1);
  cyan.intensity = 0.9;
  cyan.range = 16;

  const floor = MeshBuilder.CreateGround('floor', { width: 16, height: 16 }, scene);
  floor.material = material(scene, 'floor-mat', new Color3(0.035, 0.035, 0.08));
  const back = MeshBuilder.CreateBox('back-wall', { width: 16, height: 4, depth: 0.12 }, scene);
  back.position = new Vector3(0, 2, 7.9);
  back.material = material(scene, 'back-mat', new Color3(0.07, 0.04, 0.14));
  const left = MeshBuilder.CreateBox('left-wall', { width: 0.12, height: 4, depth: 16 }, scene);
  left.position = new Vector3(-7.9, 2, 0);
  left.material = material(scene, 'left-mat', new Color3(0.045, 0.04, 0.11));

  const bar = MeshBuilder.CreateBox('bar', { width: 5.8, height: 1.05, depth: 0.95 }, scene);
  bar.position = new Vector3(0, 0.53, 5.4);
  bar.material = material(scene, 'bar-mat', new Color3(0.15, 0.08, 0.3));
  const barTop = MeshBuilder.CreateBox('bar-top', { width: 6, height: 0.06, depth: 1.08 }, scene);
  barTop.position = new Vector3(0, 1.09, 5.4);
  const barTopMat = material(scene, 'bar-top-mat', new Color3(0.05, 0.02, 0.08), new Color3(1, 0.05, 0.42));
  barTop.material = barTopMat;

  const dance = MeshBuilder.CreateCylinder('dance', { diameter: 4.2, height: 0.05, tessellation: 48 }, scene);
  dance.position = new Vector3(1.8, 0.04, -1.4);
  const danceMat = material(scene, 'dance-mat', new Color3(0.07, 0.05, 0.14), new Color3(0.02, 0.2, 0.35));
  dance.material = danceMat;

  for (let i = 0; i < 5; i++) {
    const table = MeshBuilder.CreateCylinder(`table-${i}`, { diameter: 0.9, height: 0.16, tessellation: 24 }, scene);
    table.position = new Vector3(-5.5 + i * 2.2, 0.45, -5.2 + (i % 2) * 1.4);
    table.material = material(scene, `table-mat-${i}`, new Color3(0.11, 0.07, 0.18), i % 2 ? new Color3(0, 0.25, 0.4) : new Color3(0.4, 0.02, 0.18));
  }
  for (let i = 0; i < 9; i++) {
    const strip = MeshBuilder.CreateBox(`neon-${i}`, { width: 0.045, height: 0.045, depth: 12 }, scene);
    strip.position = new Vector3(-7 + i * 1.75, 0.06, 0);
    strip.material = material(scene, `neon-mat-${i}`, Color3.Black(), i % 2 ? new Color3(0, 0.8, 1) : new Color3(1, 0, 0.5));
  }
  const exit = exitDoor(scene, -7.85, -4.5);

  return {
    bounds: { x: 7.2, z: 7.2 },
    playerSpawn: new Vector3(-5.2, 0, -4.5),
    portals: [exit],
    animate: (t) => {
      glow.intensity = 0.4 + Math.sin(t * 2.2) * 0.06;
      danceMat.emissiveColor = new Color3(0.02, 0.16 + Math.sin(t * 3) * 0.05, 0.32);
      barTopMat.emissiveColor = new Color3(0.85 + Math.sin(t * 4) * 0.12, 0.04, 0.38);
    },
  };
}

function buildRooftop(scene: Scene, glow: GlowLayer, ambient: HemisphericLight): VenueHandles {
  scene.clearColor.set(0.06, 0.03, 0.12, 1);
  ambient.intensity = 0.7;
  ambient.diffuse = new Color3(0.75, 0.6, 1);
  ambient.groundColor = new Color3(0.25, 0.15, 0.2);
  const sunset = new PointLight('sunset', new Vector3(0, 6, 9), scene);
  sunset.diffuse = new Color3(1, 0.45, 0.15);
  sunset.intensity = 1.3;
  sunset.range = 30;

  const deck = MeshBuilder.CreateGround('deck', { width: 18, height: 18 }, scene);
  deck.material = material(scene, 'deck-mat', new Color3(0.16, 0.11, 0.09));
  const pool = MeshBuilder.CreateBox('pool', { width: 5, height: 0.08, depth: 3 }, scene);
  pool.position = new Vector3(3.5, 0.04, 2.5);
  const poolMat = material(scene, 'pool-mat', new Color3(0, 0.3, 0.4), new Color3(0, 0.35, 0.5));
  pool.material = poolMat;

  for (const [x, z, w, d] of [[0, 9, 18, 0.08], [0, -9, 18, 0.08], [9, 0, 0.08, 18], [-9, 0, 0.08, 18]] as const) {
    const rail = MeshBuilder.CreateBox(`rail-${x}-${z}`, { width: w, height: 1, depth: d }, scene);
    rail.position = new Vector3(x, 0.5, z);
    const m = material(scene, `rail-mat-${x}-${z}`, new Color3(0.4, 0.5, 0.7));
    m.alpha = 0.25;
    rail.material = m;
  }
  const skyline = addLagosSkyline(scene, { z: 60, y: -14, width: 180 });
  for (let i = 0; i < 28; i++) {
    const angle = (i / 28) * Math.PI * 2;
    if (Math.sin(angle) > 0.5) continue; // the lagoon side stays open
    const h = 3 + ((i * 7) % 9);
    const tower = MeshBuilder.CreateBox(`tower-${i}`, { width: 1.6, height: h, depth: 1.6 }, scene);
    tower.position = new Vector3(Math.cos(angle) * 22, h / 2 - 4, Math.sin(angle) * 22);
    tower.material = material(scene, `tower-mat-${i}`, new Color3(0.05, 0.05, 0.12), new Color3(0.05, 0.04 + (i % 3) * 0.04, 0.14));
  }
  const bulbs: StandardMaterial[] = [];
  for (let i = 0; i < 16; i++) {
    const bulb = MeshBuilder.CreateSphere(`bulb-${i}`, { diameter: 0.18 }, scene);
    bulb.position = new Vector3(-8 + i * 1.07, 3 + Math.sin(i * 0.6) * 0.25, -2);
    const m = material(scene, `bulb-mat-${i}`, Color3.Black(), new Color3(1, 0.75, 0.35));
    bulb.material = m;
    bulbs.push(m);
  }
  const dj = MeshBuilder.CreateBox('dj', { width: 3, height: 1, depth: 1 }, scene);
  dj.position = new Vector3(-4, 0.5, 6.5);
  dj.material = material(scene, 'dj-mat', new Color3(0.1, 0.05, 0.15), new Color3(0.5, 0.1, 0.8));
  const wall = MeshBuilder.CreateBox('stair-wall', { width: 0.2, height: 3, depth: 3 }, scene);
  wall.position = new Vector3(-8.95, 1.5, -5);
  wall.material = material(scene, 'stair-wall-mat', new Color3(0.12, 0.1, 0.16));
  const exit = exitDoor(scene, -8.85, -5);

  return {
    bounds: { x: 8.4, z: 8.4 },
    playerSpawn: new Vector3(-6.4, 0, -5),
    portals: [exit],
    animate: (t) => {
      glow.intensity = 0.5 + Math.sin(t * 1.5) * 0.06;
      skyline(t);
      poolMat.emissiveColor = new Color3(0, 0.3 + Math.sin(t * 2) * 0.06, 0.5);
      bulbs.forEach((m, i) => { m.emissiveColor = new Color3(1, 0.65 + Math.sin(t * 3 + i) * 0.15, 0.3); });
    },
  };
}

function buildPrivateRoom(scene: Scene, glow: GlowLayer, ambient: HemisphericLight): VenueHandles {
  scene.clearColor.set(0.04, 0.01, 0.03, 1);
  ambient.intensity = 0.45;
  ambient.groundColor = new Color3(0.15, 0.05, 0.08);
  const warm = new PointLight('warm', new Vector3(0, 3, 0), scene);
  warm.diffuse = new Color3(1, 0.35, 0.45);
  warm.intensity = 1.0;
  warm.range = 9;

  const floor = MeshBuilder.CreateGround('floor', { width: 8, height: 8 }, scene);
  floor.material = material(scene, 'floor-mat', new Color3(0.12, 0.04, 0.06));
  for (const [x, z, w, d] of [[0, 4, 8, 0.1], [0, -4, 8, 0.1], [4, 0, 0.1, 8], [-4, 0, 0.1, 8]] as const) {
    const wall = MeshBuilder.CreateBox(`wall-${x}-${z}`, { width: w, height: 3, depth: d }, scene);
    wall.position = new Vector3(x, 1.5, z);
    wall.material = material(scene, `wall-mat-${x}-${z}`, new Color3(0.18, 0.05, 0.1));
  }
  const couch = MeshBuilder.CreateBox('couch', { width: 3, height: 0.5, depth: 1 }, scene);
  couch.position = new Vector3(0, 0.25, 3.2);
  couch.material = material(scene, 'couch-mat', new Color3(0.45, 0.05, 0.15));
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
