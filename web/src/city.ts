import '@babylonjs/loaders/glTF';
import {
  AbstractMesh,
  CascadedShadowGenerator,
  Color3,
  Constants,
  DirectionalLight,
  DynamicTexture,
  GlowLayer,
  HDRCubeTexture,
  HemisphericLight,
  LoadAssetContainerAsync,
  Matrix,
  Mesh,
  MeshBuilder,
  PBRMaterial,
  Quaternion,
  Ray,
  Scene,
  StandardMaterial,
  Texture,
  TransformNode,
  Vector3,
  Vector4,
  VertexData,
} from '@babylonjs/core';
import { quality } from './render';
import type { Portal, VenueHandles } from './venue';
import { makeLabel } from './venue';
import { CLUBS } from './venues';

/**
 * Lagos, the open city (ADR 0017): a stylized diorama built from Kenney's CC0 city kits (`public/world/kit.glb`, made by
 * `scripts/world/build.mjs`) on an 11 m street grid. Victoria Island and Ikoyi sit west of the lagoon, Lekki Phase 1
 * east of it, joined by the Link Bridge, with the Atlantic beach along the south. Every repeated model is drawn with
 * thin instances, so the whole city costs about one draw call per kit mesh. Lighting follows the game clock.
 */
export const TILE = 11;
const W = 48;
const H = 32;

type Cell = 'grass' | 'road' | 'bridge' | 'water' | 'ocean' | 'sand' | 'plaza' | 'lot' | 'park' | 'venue' | 'border';
type Dir = 'N' | 'E' | 'S' | 'W';
const STEP: Record<Dir, [number, number]> = { N: [0, 1], E: [1, 0], S: [0, -1], W: [-1, 0] };
/** Rotation that makes a Kenney building (front door towards -Z at rest) face each direction. */
const FACE: Record<Dir, number> = { S: 0, W: Math.PI / 2, N: Math.PI, E: (3 * Math.PI) / 2 };

/** Cell centre in world space. +X is east, +Z is north. */
export const cellPos = (c: number, r: number) => new Vector3((c - (W - 1) / 2) * TILE, 0, (r - (H - 1) / 2) * TILE);
const cellAt = (x: number, z: number) => [Math.round(x / TILE + (W - 1) / 2), Math.round(z / TILE + (H - 1) / 2)] as const;

// Street plan: [row, fromCol, toCol] and [col, fromRow, toRow].
const STREETS_EW: [number, number, number][] = [[4, 1, 46], [9, 1, 20], [13, 1, 20], [18, 1, 20], [18, 26, 26], [18, 32, 46], [24, 1, 20], [30, 1, 20], [10, 26, 46], [24, 26, 46], [30, 26, 46]];
const STREETS_NS: [number, number, number][] = [[1, 4, 30], [7, 4, 30], [14, 4, 30], [20, 4, 30], [26, 4, 30], [36, 4, 30], [46, 4, 30]];
const LAGOON = { c0: 21, c1: 25, r0: 6, r1: H - 1 };
const BRIDGE_ROW = 18;
const PLAZA = { c0: 27, c1: 31, r0: 16, r1: 20 };
const SPAWN: [number, number] = [29, 18];
/**
 * Where each club stands (ADR 0019): its lot, the street it faces and the building it uses. Real streets are mapped
 * onto the grid in `STREET_NAMES`, so a club on Adeola Odeku Street fronts the row named Adeola Odeku Street.
 */
const VENUE_LOTS: Record<string, { cell: [number, number]; face: Dir; model: string }> = {
  quilox: { cell: [19, 11], face: 'E', model: 'club-two' },
  vaniti: { cell: [3, 12], face: 'N', model: 'club-box' },
  rooftop_party: { cell: [10, 14], face: 'S', model: 'club-tower' },
  escape: { cell: [17, 12], face: 'N', model: 'club-box' },
  zaza: { cell: [15, 11], face: 'W', model: 'club-two' },
  the_pulse: { cell: [8, 7], face: 'W', model: 'club-box' },
  club_dna: { cell: [4, 8], face: 'N', model: 'club-box' },
  alba: { cell: [11, 10], face: 'S', model: 'club-two' },
  neon_lounge: { cell: [19, 19], face: 'S', model: 'club-two' },
  the_loft: { cell: [12, 19], face: 'S', model: 'club-two' },
  stage_lagos: { cell: [8, 29], face: 'N', model: 'club-box' },
  bay_lounge: { cell: [27, 13], face: 'W', model: 'club-two' },
  bayrock: { cell: [33, 25], face: 'S', model: 'club-box' },
  moist_beach: { cell: [29, 3], face: 'N', model: 'club-beach' },
};
const VENUES = CLUBS.filter((c) => VENUE_LOTS[c.kind]).map((c) => ({ ...c, ...VENUE_LOTS[c.kind], label: c.name, sign: c.name.toUpperCase() }));

/** Real Lagos street names on the grid: [row or column, from, to, name]. */
const STREET_NAMES: { ew: [number, number, number, string][]; ns: [number, number, number, string][] } = {
  ew: [[4, 1, 20, 'Ahmadu Bello Way'], [4, 21, 46, 'Oniru Coastal Road'], [9, 1, 20, 'Adetokunbo Ademola St'], [13, 1, 20, 'Adeola Odeku St'],
    [18, 1, 20, 'Awolowo Road'], [18, 21, 46, 'Lekki-Ikoyi Link Bridge'], [24, 1, 20, 'Kingsway Road'], [30, 1, 20, 'Glover Road'],
    [10, 26, 46, 'Fola Osibo Road'], [24, 26, 46, 'Adebayo Doherty Road'], [30, 26, 46, 'Freedom Way']],
  ns: [[1, 4, 30, 'Ajose Adeogun St'], [7, 4, 17, 'Idejo St'], [7, 18, 30, 'Bourdillon Road'], [14, 4, 17, 'Akin Adesola St'], [14, 18, 30, 'Alexander Road'],
    [20, 4, 17, 'Ozumba Mbadiwe Ave'], [20, 18, 30, 'Falomo Road'], [26, 4, 30, 'Admiralty Road'], [36, 4, 30, 'Admiralty Way'], [46, 4, 30, 'Durosimi Etti Drive']],
};

const district = (c: number, r: number) => (c <= 20 ? (r < BRIDGE_ROW ? 'vi' : 'ikoyi') : c >= 26 ? 'lekki' : 'strip');

/** Deterministic noise so every player sees the same city. */
const hash = (c: number, r: number, salt = 0) => {
  let h = (c * 374761393 + r * 668265263 + salt * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const pick = <T,>(xs: T[], v: number) => xs[Math.floor(v * xs.length) % xs.length];

function layout() {
  const grid: Cell[][] = Array.from({ length: H }, () => Array<Cell>(W).fill('grass'));
  const set = (c: number, r: number, v: Cell) => { if (c >= 0 && c < W && r >= 0 && r < H) grid[r][c] = v; };
  for (let c = 0; c < W; c++) { set(c, 0, 'ocean'); set(c, 1, 'ocean'); set(c, 2, 'sand'); set(c, 3, 'sand'); }
  for (let r = LAGOON.r0; r <= LAGOON.r1; r++) for (let c = LAGOON.c0; c <= LAGOON.c1; c++) set(c, r, 'water');
  for (const [r, c0, c1] of STREETS_EW) for (let c = c0; c <= c1; c++) set(c, r, 'road');
  for (const [c, r0, r1] of STREETS_NS) for (let r = r0; r <= r1; r++) set(c, r, 'road');
  for (let c = LAGOON.c0; c <= LAGOON.c1; c++) set(c, BRIDGE_ROW, 'bridge');
  for (let r = PLAZA.r0; r <= PLAZA.r1; r++) for (let c = PLAZA.c0; c <= PLAZA.c1; c++) set(c, r, 'plaza');
  for (const v of VENUES) set(v.cell[0], v.cell[1], 'venue');
  for (let r = 4; r < H; r++) { set(0, r, 'border'); set(W - 1, r, 'border'); }
  for (let c = 0; c < W; c++) if (grid[H - 1][c] === 'grass') set(c, H - 1, 'border');
  // Remaining land: a lot when it fronts a street, otherwise a park or garden.
  for (let r = 4; r < H; r++) for (let c = 0; c < W; c++) {
    if (grid[r][c] !== 'grass' || district(c, r) === 'strip') continue;
    grid[r][c] = frontage(grid, c, r) ? 'lot' : 'park';
  }
  return grid;
}

const at = (grid: Cell[][], c: number, r: number): Cell | undefined => grid[r]?.[c];
const isStreet = (v?: Cell) => v === 'road' || v === 'bridge';
function frontage(grid: Cell[][], c: number, r: number): Dir | null {
  for (const d of ['S', 'N', 'W', 'E'] as Dir[]) if (at(grid, c + STEP[d][0], r + STEP[d][1]) === 'road') return d;
  return null;
}

/** Road piece and rotation from the four neighbours (orientations measured on the kit, see ADR 0017). */
function roadPiece(grid: Cell[][], c: number, r: number): [string, number] {
  const links = { N: false, E: false, S: false, W: false } as Record<Dir, boolean>;
  for (const d of Object.keys(STEP) as Dir[]) links[d] = isStreet(at(grid, c + STEP[d][0], r + STEP[d][1]));
  // The bridge road runs into the plaza at both ends.
  if (r === BRIDGE_ROW && c === PLAZA.c0 - 1) links.E = true;
  if (r === BRIDGE_ROW && c === PLAZA.c1 + 1) links.W = true;
  const n = Object.values(links).filter(Boolean).length;
  const R = Math.PI / 2;
  if (n === 4) return ['road-crossroad', 0];
  if (n === 3) return ['road-intersection', !links.S ? 0 : !links.W ? R : !links.N ? 2 * R : 3 * R];
  if (n === 2) {
    if (links.E && links.W) return ['road-straight', 0];
    if (links.N && links.S) return ['road-straight', R];
    return ['road-bend', links.N && links.E ? 0 : links.E && links.S ? R : links.S && links.W ? 2 * R : 3 * R];
  }
  if (n === 1) return ['road-end-round', links.W ? 0 : links.N ? R : links.E ? 2 * R : 3 * R];
  return ['road-straight', 0];
}

type Model = { meshes: Mesh[]; min: Vector3; max: Vector3 };
type Box = { x0: number; z0: number; x1: number; z1: number };
/** A clickable building: its footprint and height, the spot on the pavement in front of its door, and a venue kind. */
type Building = Box & { h: number; door: Vector3; portal?: string };
/** Thin-instance chunk size: small enough for frustum and shadow-cascade culling, big enough to keep draw calls low. */
const CHUNK = 12 * TILE;

/** Sky, sun and lamp colours through the day; `d` = daylight 0..1. */
const SKY_DAY = { top: new Color3(0.46, 0.7, 0.9), horizon: new Color3(0.86, 0.92, 0.9) };
const SKY_DUSK = { top: new Color3(0.28, 0.25, 0.5), horizon: new Color3(0.98, 0.62, 0.42) };
const SKY_NIGHT = { top: new Color3(0.09, 0.04, 0.2), horizon: new Color3(0.42, 0.17, 0.45) };
/** Lagos after dark: the city always renders at this hour (the game clock still runs in the HUD). `?hour=` overrides. */
const AFTER_DARK = 22;
/** Neon colours for shop fronts and towers: the design system's pink, cyan, violet and amber. */
const NEON = ['#ff2f91', '#22d3ee', '#a855f7', '#ffb02e'];

export function buildCity(scene: Scene, from?: string): VenueHandles {
  const grid = layout();
  const high = quality() === 'high';

  // Lights: sky fill plus a sun that moves with the game clock and casts the city's shadows (high quality).
  const hemi = new HemisphericLight('city-sky', new Vector3(0.2, 1, 0.3), scene);
  const sun = new DirectionalLight('city-sun', new Vector3(-0.5, -1, 0.4), scene);
  sun.position = new Vector3(200, 300, -160);
  let csm: CascadedShadowGenerator | null = null;
  if (high) {
    csm = new CascadedShadowGenerator(2048, sun);
    csm.numCascades = 3;
    csm.lambda = 0.85;
    csm.shadowMaxZ = 160;
    csm.stabilizeCascades = true;
    csm.usePercentageCloserFiltering = true;
    csm.filteringQuality = CascadedShadowGenerator.QUALITY_MEDIUM;
    csm.darkness = 0.35;
    csm.bias = 0.004;
    csm.normalBias = 0.02;
    scene.onNewMeshAddedObservable.add((m) => { m.receiveShadows = true; });
  }
  // Image-based light from a CC0 sky (Poly Haven): characters' skin, hair and clothes pick up real ambient colour
  // instead of looking flat. Kit materials are StandardMaterial and ignore it.
  // No prefilter pass: it runs asynchronously and crashed (`postProcessManager` of null) when you left the city mid-way.
  // Spherical harmonics still give characters the sky's ambient colour.
  const env = new HDRCubeTexture('/world/sky.hdr', scene, 128, false, true, false, false);
  scene.environmentTexture = env;
  const glow = new GlowLayer('city-glow', scene, { mainTextureRatio: 0.5, blurKernelSize: 24 });
  glow.intensity = 0;
  // Only neon glows (signs, door thresholds, bridge strips); everything else would bloom into haze.
  const glowing = (m: AbstractMesh) => { glow.addIncludedOnlyMesh(m as Mesh); return m; };

  // Sky dome with a vertical gradient that's repainted as the hour changes.
  const skyTex = new DynamicTexture('city-sky-tex', { width: 4, height: 256 }, scene, false);
  const sky = MeshBuilder.CreateSphere('city-sky-dome', { diameter: 2400, segments: 16, sideOrientation: Mesh.BACKSIDE }, scene);
  const skyMat = new StandardMaterial('city-sky-mat', scene);
  skyMat.emissiveTexture = skyTex;
  skyMat.disableLighting = true;
  skyMat.fogEnabled = false;
  skyMat.backFaceCulling = false;
  sky.material = skyMat;
  sky.infiniteDistance = true;
  sky.isPickable = false;
  scene.fogMode = Scene.FOGMODE_LINEAR;
  scene.fogStart = 220;
  scene.fogEnd = 700;

  // Ground: grass everywhere, sand along the beach, sea to the horizon, the lagoon through the middle.
  const flat = (name: string, color: Color3, spec = 0.02) => {
    const m = new StandardMaterial(name, scene);
    m.diffuseColor = color;
    m.specularColor = new Color3(spec, spec, spec);
    return m;
  };
  const ground = MeshBuilder.CreateGround('city-ground', { width: W * TILE + 2000, height: H * TILE + 2000 }, scene);
  ground.position.y = -0.05;
  ground.material = flat('city-grass', new Color3(0.5, 0.66, 0.38));
  ground.isPickable = true; // tap-to-move lands on it
  const sandMat = flat('city-sand', new Color3(0.93, 0.84, 0.62));
  const sand = MeshBuilder.CreateGround('city-sand', { width: W * TILE + 2000, height: 2 * TILE }, scene);
  sand.position = new Vector3(0, -0.02, cellPos(0, 2.5).z);
  sand.material = sandMat;
  const waterMat = flat('city-water', new Color3(0.2, 0.62, 0.74), 0.5);
  waterMat.specularPower = 48;
  const sea = MeshBuilder.CreateGround('city-sea', { width: W * TILE + 2400, height: 1200 }, scene);
  sea.position = new Vector3(0, 0.01, cellPos(0, 1.5).z - 600);
  sea.material = waterMat;
  const lagoon = MeshBuilder.CreateGround('city-lagoon', { width: (LAGOON.c1 - LAGOON.c0 + 1) * TILE, height: (LAGOON.r1 - LAGOON.r0 + 1) * TILE + 1200 }, scene);
  lagoon.position = new Vector3(cellPos((LAGOON.c0 + LAGOON.c1) / 2, 0).x, 0.01, cellPos(0, (LAGOON.r0 + LAGOON.r1) / 2).z + 600);
  lagoon.material = waterMat;
  // Lagoon banks: a low concrete edge so the water reads as a channel, not a hole.
  const bankMat = flat('city-bank', new Color3(0.78, 0.76, 0.72));
  for (const side of [-1, 1]) {
    const bank = MeshBuilder.CreateBox(`city-bank-${side}`, { width: 0.8, height: 0.9, depth: (LAGOON.r1 - LAGOON.r0 + 1) * TILE + 1200 }, scene);
    bank.position = new Vector3(lagoon.position.x + side * ((LAGOON.c1 - LAGOON.c0 + 1) * TILE) / 2, -0.1, lagoon.position.z);
    bank.material = bankMat;
  }

  // The spawn plaza: warm stone paving (the kit's tiles are a cold lilac that glares at night).
  const plaza = MeshBuilder.CreateGround('city-plaza', { width: (PLAZA.c1 - PLAZA.c0 + 1) * TILE, height: (PLAZA.r1 - PLAZA.r0 + 1) * TILE }, scene);
  plaza.position = cellPos((PLAZA.c0 + PLAZA.c1) / 2, (PLAZA.r0 + PLAZA.r1) / 2).add(new Vector3(0, 0.03, 0));
  plaza.material = pavingMaterial(scene);
  plaza.isPickable = true;

  // Collision: building footprints and water, bucketed per cell.
  const boxes: Box[][] = Array.from({ length: W * H }, () => []);
  const addBox = (b: Box) => {
    const [ca, ra] = cellAt(b.x0, b.z0);
    const [cb, rb] = cellAt(b.x1, b.z1);
    for (let r = Math.max(0, ra); r <= Math.min(H - 1, rb); r++) for (let c = Math.max(0, ca); c <= Math.min(W - 1, cb); c++) boxes[r * W + c].push(b);
  };
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    const v = grid[r][c];
    if (v === 'water' || v === 'ocean' || v === 'border') {
      const p = cellPos(c, r);
      addBox({ x0: p.x - TILE / 2, z0: p.z - TILE / 2, x1: p.x + TILE / 2, z1: p.z + TILE / 2 });
    }
  }
  // The bridge deck is narrower than its cell: keep people off the railings.
  for (let c = LAGOON.c0; c <= LAGOON.c1; c++) {
    const p = cellPos(c, BRIDGE_ROW);
    addBox({ x0: p.x - TILE / 2, z0: p.z + TILE / 2 - 1.2, x1: p.x + TILE / 2, z1: p.z + TILE / 2 });
    addBox({ x0: p.x - TILE / 2, z0: p.z - TILE / 2, x1: p.x + TILE / 2, z1: p.z - TILE / 2 + 1.2 });
  }
  const buildings: Building[] = [];
  const RADIUS = 0.35;
  const blocked = (x: number, z: number) => {
    const [c, r] = cellAt(x, z);
    if (c < 0 || c >= W || r < 0 || r >= H) return true;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      for (const b of boxes[(r + dr) * W + (c + dc)] ?? []) {
        if (x > b.x0 - RADIUS && x < b.x1 + RADIUS && z > b.z0 - RADIUS && z < b.z1 + RADIUS) return true;
      }
    }
    return false;
  };

  // Portals sit on the street in front of each venue door.
  const portals: Portal[] = VENUES.map((v) => {
    const [dc, dr] = STEP[v.face];
    return { kind: v.kind, label: v.label, position: cellPos(v.cell[0] + dc, v.cell[1] + dr).add(new Vector3(-dc * 1.5, 0, -dr * 1.5)) };
  });

  // Night dressing that fades in with the dark: neon signs, lamp pools, bridge lights.
  const neon: { mat: { emissiveColor: Color3 }; base: Color3 }[] = [];
  const lampPools: Mesh[] = [];
  const castShadow = (m: AbstractMesh) => { csm?.addShadowCaster(m, false); };
  const deckLights: StandardMaterial[] = [];
  const neonStrips: Matrix[][] = NEON.map(() => []);
  const neonPosts: Matrix[][] = NEON.map(() => []);
  const neonMats: StandardMaterial[] = [];
  const beams: { mesh: Mesh; phase: number }[] = [];
  const kitMats = new Map<string, StandardMaterial>();
  const traffic: { node: TransformNode; axis: 'x' | 'z'; lane: number; speed: number; min: number; max: number }[] = [];

  const ready = Promise.all([LoadAssetContainerAsync('/world/kit.glb', scene), LoadAssetContainerAsync('/world/lagos.glb', scene)]).then(([container, lagos]) => {
    if (scene.isDisposed) return;
    container.addAllToScene();
    lagos.addAllToScene();
    const root = container.meshes.find((m) => m.name === '__root__');
    const lagosRoot = lagos.meshes.find((m) => m.name === '__root__');
    if (!root || !lagosRoot) return;
    // Kenney's palette textures (cars, traffic lights, parasols) look best flat-lit, as StandardMaterial.
    const mats = kitMats;
    const flatten = (m: AbstractMesh) => {
      const src = m.material as unknown as { name: string; uniqueId: number; albedoTexture?: StandardMaterial['diffuseTexture'] } | null;
      if (!src) return;
      // Every kit names its material "colormap", so key by identity, not name.
      const key = String(src.uniqueId);
      let mat = mats.get(key);
      if (!mat) {
        mat = new StandardMaterial(`kit-${src.name}-${key}`, scene);
        mat.diffuseTexture = src.albedoTexture ?? null;
        mat.specularColor = new Color3(0.06, 0.06, 0.06);
        mat.maxSimultaneousLights = 6; // sky, moon and the venues' colour spills
        mats.set(key, mat);
      }
      m.material = mat;
    };
    const models = new Map<string, Model>();
    // The Lagos kit (scripts/blender) is PBR: textured plaster, asphalt, tiles and glass. It is loaded second, so its
    // roads replace Kenney's pieces of the same name.
    const lagosNames = new Set(lagosRoot.getChildren().map((n) => n.name));
    for (const m of lagos.materials) tuneLagosMaterial(m as PBRMaterial);
    const kitMat = (name: string) => lagos.materials.find((m) => m.name === name) as PBRMaterial | undefined;
    // Real surfaces underfoot: grass, beach sand and the plaza's stone tiles.
    ground.material = tiled(scene, kitMat('grass'), (W * TILE + 2000) / 3) ?? ground.material;
    sand.material = tiled(scene, kitMat('sand'), (W * TILE + 2000) / 4) ?? sand.material;
    if (sand.material instanceof PBRMaterial) (sand.material.albedoTexture as Texture).vScale = (2 * TILE) / 4;
    plaza.material = tiled(scene, kitMat('plaza'), ((PLAZA.c1 - PLAZA.c0 + 1) * TILE) / 2.4) ?? plaza.material;
    for (const holder of [...root.getChildren(), ...lagosRoot.getChildren()]) {
      const pbr = holder.parent === lagosRoot;
      if (!pbr && lagosNames.has(holder.name)) { (holder as TransformNode).getChildMeshes(false).forEach((m) => m.dispose()); continue; }
      const meshes = (holder as TransformNode).getChildMeshes(false).filter((m): m is Mesh => m instanceof Mesh && m.getTotalVertices() > 0);
      const min = new Vector3(Infinity, Infinity, Infinity);
      const max = new Vector3(-Infinity, -Infinity, -Infinity);
      for (const m of meshes) {
        // Bake the glTF handedness flip and kit scale into the vertices so instances need only their own transform.
        const world = m.computeWorldMatrix(true).clone();
        m.makeGeometryUnique();
        m.parent = null;
        m.position.setAll(0);
        m.rotationQuaternion = null;
        m.rotation.setAll(0);
        m.scaling.setAll(1);
        m.bakeTransformIntoVertices(world);
        m.refreshBoundingInfo();
        const bb = m.getBoundingInfo().boundingBox;
        min.minimizeInPlace(bb.minimum);
        max.maximizeInPlace(bb.maximum);
        if (!pbr) flatten(m);
        m.isPickable = false;
      }
      models.set(holder.name, { meshes, min, max });
    }
    root.dispose(false, false);
    lagosRoot.dispose(false, false);

    const placements = new Map<string, Matrix[]>();
    const place = (model: string, x: number, z: number, rot = 0, scale = 1, y = 0, yScale = 1) => {
      if (!models.has(model)) return;
      let list = placements.get(model);
      if (!list) placements.set(model, (list = []));
      list.push(Matrix.Compose(new Vector3(scale, scale * yScale, scale), Quaternion.RotationYawPitchRoll(rot, 0, 0), new Vector3(x, y, z)));
    };
    /** Footprint of a placed model, for collision. */
    const footprint = (model: string, x: number, z: number, rot: number, scale: number, inset = 0.4, door?: Vector3, portal?: string, yScale = 1) => {
      const m = models.get(model);
      if (!m) return;
      const corners = [[m.min.x, m.min.z], [m.max.x, m.min.z], [m.min.x, m.max.z], [m.max.x, m.max.z]].map(([cx, cz]) => {
        const c = Math.cos(rot), s = Math.sin(rot);
        return [x + (cx * c + cz * s) * scale, z + (-cx * s + cz * c) * scale];
      });
      const box = {
        x0: Math.min(...corners.map((p) => p[0])) + inset, x1: Math.max(...corners.map((p) => p[0])) - inset,
        z0: Math.min(...corners.map((p) => p[1])) + inset, z1: Math.max(...corners.map((p) => p[1])) - inset,
      };
      addBox(box);
      if (door) buildings.push({ ...box, h: m.max.y * scale * yScale, door, portal });
    };
    /** A club's building: its own meshes (not thin instances), so its neon can take the club's colour. */
    const placeVenue = (model: string, x: number, z: number, rot: number, scale: number, color: string) => {
      const src = models.get(model);
      if (!src) return;
      const node = new TransformNode(`venue-${model}-${Math.round(x)}-${Math.round(z)}`, scene);
      node.position.set(x, 0, z);
      node.rotation.y = rot;
      node.scaling.setAll(scale);
      for (const m of src.meshes) {
        const mesh = new Mesh(`${node.name}-${m.name}`, scene);
        VertexData.ExtractFromMesh(m).applyToMesh(mesh);
        mesh.parent = node;
        mesh.isPickable = true;
        if (m.material?.name.startsWith('neon')) {
          const nm = (m.material as PBRMaterial).clone(`neon-${color}`);
          nm.emissiveColor = Color3.FromHexString(color).scale(0.7);
          nm.albedoColor = Color3.Black();
          mesh.material = nm;
          glowing(mesh);
          neon.push({ mat: nm, base: nm.emissiveColor.clone() });
        } else {
          mesh.material = m.material;
          castShadow(mesh);
        }
      }
    };
    const fits = (names: string[], maxTiles: number) => names.filter((n) => {
      const m = models.get(n);
      return m && Math.max(m.max.x - m.min.x, m.max.z - m.min.z) <= maxTiles * TILE;
    });
    const letters = (prefix: string, s: string) => s.split('').map((l) => prefix + l);
    const houses = fits(letters('house-', 'abcdef'), 1);
    const apartments = fits(letters('apartment-', 'abcdef'), 1);
    const shops = fits(letters('shop-', 'abcd'), 1);
    const towers = fits(letters('tower-', 'abcdef'), 1);
    const palmModels = letters('palm-', 'abcd');
    const cars = ['sedan', 'taxi', 'suv', 'suv-luxury', 'hatchback-sports', 'sedan-sports', 'van'];

    // Streets, bridge deck, plaza paving and street lights.
    const lampHeads: Vector3[] = [];
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
      const v = grid[r][c];
      const p = cellPos(c, r);
      if (v === 'road') {
        const [piece, rot] = roadPiece(grid, c, r);
        // Zebra crossings on the approach to every junction.
        const ns = rot !== 0;
        const nextTo = (dc: number, dr: number) => at(grid, c + dc, r + dr) === 'road' && ['road-crossroad', 'road-intersection'].includes(roadPiece(grid, c + dc, r + dr)[0]);
        const crossing = piece === 'road-straight' && (ns ? nextTo(0, 1) || nextTo(0, -1) : nextTo(1, 0) || nextTo(-1, 0));
        place(crossing ? 'road-crossing' : piece, p.x, p.z, rot);
        if (piece === 'road-crossroad') {
          place('traffic-light', p.x + TILE / 2 - 0.6, p.z + TILE / 2 - 0.6, Math.PI);
          place('traffic-light', p.x - TILE / 2 + 0.6, p.z - TILE / 2 + 0.6, 0);
        }
        if (piece === 'road-straight' && !crossing && (c + r) % 2 === 0) {
          const side = (c + r) % 2 ? 1 : -1;
          const off = TILE / 2 - 0.7;
          const lx = ns ? p.x + side * off : p.x;
          const lz = ns ? p.z : p.z + side * off;
          place('street-lamp', lx, lz, ns ? (side > 0 ? Math.PI / 2 : (3 * Math.PI) / 2) : side > 0 ? 0 : Math.PI);
          lampHeads.push(new Vector3(ns ? lx - side * 1.0 : lx, 0, ns ? lz : lz - side * 1.0));
        }
      } else if (v === 'bridge') {
        place('road-bridge', p.x, p.z, Math.PI / 2);
      }
    }

    // Buildings face their street; parks get trees and palms; Lekki and VI streets get parked cars.
    const palm = (x: number, z: number, s: number, rot: number) => place(pick(palmModels, (rot * 7.31) % 1), x, z, rot, s);
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
      const v = grid[r][c];
      const p = cellPos(c, r);
      const h = hash(c, r);
      const d = district(c, r);
      if (v === 'lot') {
        const face = frontage(grid, c, r) ?? 'S';
        const rot = FACE[face];
        const busy = d === 'vi' || (d === 'lekki' && (c === 35 || c === 37 || r === 5 || r === 9 || r === 11));
        // Lagos by district: VI towers and shops, Ikoyi apartment blocks and old houses, Lekki duplexes behind walls.
        let model: string;
        const yScale = 1;
        const k = hash(c, r, 1);
        if (d === 'vi' && h < 0.4) model = pick(towers, k);
        else if (busy) model = h < 0.75 ? pick(shops, k) : pick(apartments, k);
        else if (d === 'ikoyi') model = h < 0.5 ? pick(apartments, k) : pick(houses, k);
        else model = h < 0.82 ? pick(houses, k) : pick(apartments, k);
        // VI and shopping streets are paved to the kerb.
        if (d === 'vi' || busy) place('ground-plaza', p.x, p.z, 0, 1, 0.01);
        const m = models.get(model);
        const size = m ? Math.max(m.max.x - m.min.x, m.max.z - m.min.z) : TILE;
        const scale = Math.min(1, (TILE * 0.92) / size);
        // Set the building back from the street so its front sits on the pavement line.
        const depth = m ? (m.max.z - m.min.z) * scale : TILE;
        const [sx, sz] = STEP[face];
        const back = Math.max(0, (TILE - depth) / 2 - 0.3);
        place(model, p.x - sx * back, p.z - sz * back, rot, scale, 0, yScale);
        // Its door spot is on the pavement just inside the street tile.
        footprint(model, p.x - sx * back, p.z - sz * back, rot, scale, 0.4, p.add(new Vector3(sx * (TILE / 2 + 1.2), 0, sz * (TILE / 2 + 1.2))), undefined, yScale);
        if (!busy && h > 0.55) palm(p.x + sx * 3.8 + (h - 0.5) * 6, p.z + sz * 3.8, 0.9 + h * 0.3, h * 6);
        // Nightlife: a neon band over every shop front; towers also get neon running up their front corners.
        const tower = model.startsWith('tower');
        if ((busy || tower) && m && hash(c, r, 9) < (tower ? 0.5 : 0.35)) {
          const col = Math.floor(hash(c, r, 7) * NEON.length);
          const width = (m.max.x - m.min.x) * scale * 0.86;
          const fx = p.x - sx * back + sx * (depth / 2 + 0.14);
          const fz = p.z - sz * back + sz * (depth / 2 + 0.14);
          const q = Quaternion.RotationYawPitchRoll(rot, 0, 0);
          // On the shop fascia, or over a tower's lobby.
          neonStrips[col].push(Matrix.Compose(new Vector3(width, 1, 1), q, new Vector3(fx, model.startsWith('shop') ? 2.98 : 6.6, fz)));
          if (tower && hash(c, r, 11) < 0.4) {
            const height = m.max.y * scale * yScale;
            for (const side of [-1, 1]) {
              neonPosts[(col + 1) % NEON.length].push(Matrix.Compose(new Vector3(1, height * 0.92, 1), q,
                new Vector3(fx - sz * side * width / 2, height * 0.48, fz + sx * side * width / 2)));
            }
            neonStrips[(col + 2) % NEON.length].push(Matrix.Compose(new Vector3(width, 1, 1), q, new Vector3(fx, height * 0.94, fz)));
          }
        }
      } else if (v === 'park' || v === 'border') {
        const n = v === 'border' ? 3 : 2 + Math.floor(h * 3);
        for (let i = 0; i < n; i++) {
          const x = p.x + (hash(c, r, 10 + i) - 0.5) * (TILE - 2);
          const z = p.z + (hash(c, r, 20 + i) - 0.5) * (TILE - 2);
          const k = hash(c, r, 30 + i);
          if (k < 0.3) place(k < 0.15 ? 'shrub-b' : 'shrub', x, z, k * 20, 1 + k);
          else palm(x, z, 0.85 + k * 0.4, k * 6);
        }
        if (v === 'park' && d !== 'ikoyi' && h > 0.7) place(pick(cars, hash(c, r, 5)), p.x, p.z, hash(c, r, 6) > 0.5 ? 0 : Math.PI / 2);
      } else if (v === 'sand') {
        if (r === 3 && c % 3 === 0) palm(p.x + (h - 0.5) * 4, p.z + 2, 1 + h * 0.3, h * 6);
        if (r === 2 && h > 0.45) place(h > 0.7 ? 'detail-parasol-a' : 'detail-parasol-b', p.x + (h - 0.5) * 5, p.z, h * 6, 0.6);
      } else if (v === 'grass' && r === 5 && c >= LAGOON.c0 && c <= LAGOON.c1) {
        palm(p.x, p.z, 1.1, h * 6);
      }
    }
    // Parked cars along the busy kerbs.
    for (const [row, c0, c1] of STREETS_EW) for (let c = c0; c <= c1; c++) {
      const h = hash(c, row, 40);
      if (grid[row][c] !== 'road' || h > 0.22 || roadPiece(grid, c, row)[0] !== 'road-straight') continue;
      const p = cellPos(c, row);
      place(pick(cars, hash(c, row, 41)), p.x + (h - 0.1) * 6, p.z + (h > 0.11 ? 2.4 : -2.4), h > 0.11 ? Math.PI / 2 : -Math.PI / 2);
    }
    // Plaza: parasols, planters and palms around the spawn square.
    const sp = cellPos(...SPAWN);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      palm(sp.x + Math.cos(a) * 19, sp.z + Math.sin(a) * 19, 1.1, a);
      if (i % 2) place('shrub', sp.x + Math.cos(a + 0.4) * 12, sp.z + Math.sin(a + 0.4) * 12, a, 1.6);
    }

    // Billboards with (made-up) Lagos ads, like MyAbujaLife's: along the beach road, round the plaza and up Admiralty Way.
    const boards: [number, number, number, number][] = [[6, 3, 0, 0], [16, 3, 0, 1], [30, 3, 0, 2], [40, 3, 0, 3], [12, 3, 0, 8],
      [PLAZA.c0, PLAZA.r1, -1, 4], [PLAZA.c1, PLAZA.r0, 1, 5], [36, H - 1, 2, 6], [26, H - 1, 2, 7]];
    for (const [c, r, facing, ad] of boards) {
      const p = cellPos(c, r);
      // facing: 0 = north (beach boards face the road), 2 = south, ±1 = towards the plaza centre.
      const rot = facing === 0 ? Math.PI : facing === 2 ? 0 : facing < 0 ? (3 * Math.PI) / 4 : -Math.PI / 4;
      const node = makeBillboard(scene, ADS[ad % ADS.length], `board-${c}-${r}`);
      node.position = new Vector3(p.x + (facing === 1 ? 2.5 : facing === -1 ? -2.5 : 0), 0, p.z + (facing === 0 ? -1.5 : facing === 2 ? 2 : facing === 1 ? -2.5 : 2.5));
      node.rotation.y = rot;
      node.getChildMeshes().forEach((m) => castShadow(m));
    }

    // Plaza fountain, in view from spawn.
    const fountain = makeFountain(scene);
    fountain.position = sp.add(new Vector3(0, 0, 13));
    fountain.getChildMeshes().forEach((m) => { castShadow(m); if (m.name.includes('water')) glowing(m); });
    addBox({ x0: sp.x - 3.2, x1: sp.x + 3.2, z0: sp.z + 13 - 3.2, z1: sp.z + 13 + 3.2 });

    const poolTex = new DynamicTexture('lamp-pool-tex', { width: 64, height: 64 }, scene, false);
    const ctx = poolTex.getContext() as CanvasRenderingContext2D;
    const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,206,140,0.62)');
    g.addColorStop(0.45, 'rgba(255,206,140,0.3)');
    g.addColorStop(1, 'rgba(255,206,140,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    poolTex.hasAlpha = true;
    poolTex.update();

    // Street-name signs at the junctions, Lagos green.
    addStreetSigns(scene, grid);

    // Venues: a landmark building, a neon sign over the door and a glowing threshold.
    for (const v of VENUES) {
      const p = cellPos(...v.cell);
      const rot = FACE[v.face];
      const m = models.get(v.model);
      const tower = v.model === 'club-tower';
      const scale = m ? Math.min(1, (TILE * 0.95) / Math.max(m.max.x - m.min.x, m.max.z - m.min.z)) : 1;
      placeVenue(v.model, p.x, p.z, rot, scale, v.color);
      footprint(v.model, p.x, p.z, rot, scale, 0.4, portals.find((x) => x.kind === v.kind)!.position, v.kind);
      const [dx, dz] = STEP[v.face];
      const front = (m ? (m.max.z - m.min.z) * scale : TILE) / 2 + 0.15;
      const sign = makeLabel(scene, `sign-${v.kind}`, v.sign, { color: v.color, bg: 'none', width: 9, height: 1.8, font: 72, billboard: false });
      sign.position = new Vector3(p.x + dx * front, tower ? 6 : v.model === 'club-beach' ? 4.7 : 5.6, p.z + dz * front);
      sign.rotation.y = rot;
      // Not in the glow layer: the label's own neon halo is enough, and bloom made the name unreadable.
      const sm = sign.material as StandardMaterial;
      neon.push({ mat: sm, base: sm.emissiveColor.clone() });
      // Searchlights sweeping the sky from the roof, and the venue's colour spilling onto the street.
      const roof = (m ? m.max.y * scale : 12) + 0.5;
      for (let i = 0; i < 2; i++) {
        const beam = MeshBuilder.CreateCylinder(`beam-${v.kind}-${i}`, { height: 160, diameterTop: 16, diameterBottom: 0.7, tessellation: 18, cap: Mesh.NO_CAP }, scene);
        beam.setPivotPoint(new Vector3(0, -80, 0));
        beam.position = new Vector3(p.x + (i ? 2 : -2), roof + 80, p.z);
        const bm = new StandardMaterial(`beam-mat-${v.kind}-${i}`, scene);
        bm.disableLighting = true;
        bm.emissiveColor = Color3.FromHexString(i ? '#ffffff' : v.color).scale(0.5);
        bm.alpha = 0.09;
        bm.alphaMode = Constants.ALPHA_ADD;
        bm.backFaceCulling = false;
        bm.fogEnabled = false;
        bm.disableDepthWrite = true;
        beam.material = bm;
        beam.isPickable = false;
        beams.push({ mesh: beam, phase: i * Math.PI + v.cell[0] });
      }
      // A floating neon name over the club, readable from across the city.
      const beacon = makeLabel(scene, `beacon-${v.kind}`, v.label.toUpperCase(), { color: v.color, bg: 'none', width: 22, height: 3.4, font: 72, billboard: true });
      beacon.position = new Vector3(p.x, roof + 7, p.z); // emissive but kept out of the glow layer, so it stays legible
      const bmat = beacon.material as StandardMaterial;
      neon.push({ mat: bmat, base: bmat.emissiveColor.clone() });
      // The club's colour spilling onto the pavement. A pool, not a point light: with 14 clubs, point lights would
      // exceed every material's light budget and some streets would drop their moonlight.
      const spill = MeshBuilder.CreateGround(`spill-${v.kind}`, { width: 16, height: 16 }, scene);
      spill.position = portals.find((x) => x.kind === v.kind)!.position.add(new Vector3(0, 0.18, 0));
      const spm = new StandardMaterial(`spill-mat-${v.kind}`, scene);
      spm.diffuseTexture = poolTex;
      spm.useAlphaFromDiffuseTexture = true;
      spm.emissiveColor = Color3.FromHexString(v.color).scale(0.55);
      spm.disableLighting = true;
      spm.alphaMode = Constants.ALPHA_ADD;
      spm.zOffset = -3;
      spill.material = spm;
      spill.isPickable = false;
      lampPools.push(spill);
      const door = MeshBuilder.CreateDisc(`door-${v.kind}`, { radius: 1.4, tessellation: 32 }, scene);
      door.rotation.x = Math.PI / 2;
      const portal = portals.find((x) => x.kind === v.kind)!;
      door.position = portal.position.add(new Vector3(0, 0.19, 0));
      const dm = new StandardMaterial(`door-mat-${v.kind}`, scene);
      const col = Color3.FromHexString(v.color);
      dm.diffuseColor = Color3.Black();
      dm.emissiveColor = col.scale(0.8);
      dm.alpha = 0.85;
      door.material = dm;
      glowing(door);
      neon.push({ mat: dm, base: dm.emissiveColor.clone() });
    }

    // Lekki–Ikoyi Link Bridge: one white pylon with cables fanning down to both halves of the deck.
    const mid = cellPos((LAGOON.c0 + LAGOON.c1) / 2, BRIDGE_ROW);
    const pylonMat = flat('bridge-pylon', new Color3(0.94, 0.94, 0.92), 0.2);
    const pylon = MeshBuilder.CreateCylinder('bridge-pylon', { height: 46, diameterTop: 1.0, diameterBottom: 2.4, tessellation: 6 }, scene);
    pylon.position = new Vector3(mid.x, 23, mid.z);
    pylon.material = pylonMat;
    castShadow(pylon);
    const cables: Mesh[] = [];
    for (const side of [-1, 1]) for (let i = 1; i <= 9; i++) {
      for (const lane of [-1, 1]) {
        const top = new Vector3(mid.x, 44 - i * 2.2, mid.z);
        const deck = new Vector3(mid.x + side * i * 2.9, 0.8, mid.z + lane * (TILE / 2 - 1.4));
        cables.push(MeshBuilder.CreateTube('cable', { path: [top, deck], radius: 0.06, tessellation: 4 }, scene));
      }
    }
    const cable = Mesh.MergeMeshes(cables, true);
    if (cable) cable.material = pylonMat;
    // Deck lights: the real bridge glows in changing colours at night.
    for (const lane of [-1, 1]) {
      const strip = MeshBuilder.CreateBox(`bridge-strip-${lane}`, { width: (LAGOON.c1 - LAGOON.c0 + 1) * TILE, height: 0.12, depth: 0.12 }, scene);
      strip.position = new Vector3(mid.x, 1.1, mid.z + lane * (TILE / 2 - 1.3));
      const m = new StandardMaterial(`bridge-strip-mat-${lane}`, scene);
      m.diffuseColor = Color3.Black();
      strip.material = m;
      glowing(strip);
      deckLights.push(m);
    }

    // Lamp pools: soft warm discs under each street light, only at night.
    const poolMat = new StandardMaterial('lamp-pool-mat', scene);
    poolMat.diffuseTexture = poolTex;
    poolMat.useAlphaFromDiffuseTexture = true;
    poolMat.emissiveColor = new Color3(1, 0.84, 0.6);
    poolMat.disableLighting = true;
    poolMat.zOffset = -3;
    const pool = MeshBuilder.CreateGround('lamp-pool', { width: 10, height: 10 }, scene);
    pool.material = poolMat;
    pool.position.y = 0.17; // over the 15 cm pavement too, so the light runs across the kerb
    pool.isPickable = false;
    pool.alwaysSelectAsActiveMesh = true;
    pool.thinInstanceAdd(lampHeads.map((h) => Matrix.Translation(h.x, 0, h.z)));
    lampPools.push(pool);

    // Traffic needs clean copies of the car meshes before they get instance buffers.
    const carData = new Map<Mesh, VertexData>();
    for (const name of [...cars, 'van']) for (const m of models.get(name)?.meshes ?? []) carData.set(m, VertexData.ExtractFromMesh(m));

    // Commit the instances in spatial chunks, so the camera and each shadow cascade only draw nearby city.
    // Babylon keeps thin-instance buffers on the geometry, so each chunk needs its own copy (sharing one made
    // instanced draws read past the end of another chunk's buffer).
    const commit = (src: Mesh, list: Matrix[], shadow: boolean) => {
      const chunks = new Map<string, Matrix[]>();
      for (const mx of list) {
        const key = `${Math.floor(mx.m[12] / CHUNK)},${Math.floor(mx.m[14] / CHUNK)}`;
        let c = chunks.get(key);
        if (!c) chunks.set(key, (c = []));
        c.push(mx);
      }
      let first = true;
      for (const [key, part] of chunks) {
        const mesh = first ? src : src.clone(`${src.name}@${key}`, null, true)!;
        if (!first) mesh.makeGeometryUnique();
        first = false;
        mesh.thinInstanceAdd(part);
        mesh.thinInstanceRefreshBoundingInfo(false);
        // Tapping any object (car, tree, palm, building) walks you to it, so the kit is pickable per instance.
        mesh.isPickable = true;
        mesh.thinInstanceEnablePicking = true;
        if (shadow) castShadow(mesh);
      }
    };

    // Neon: one emissive material per colour, thin-instanced bands and posts, all in the glow layer.
    NEON.forEach((hex, i) => {
      const mat = new StandardMaterial(`neon-${i}`, scene);
      mat.diffuseColor = Color3.Black();
      mat.emissiveColor = Color3.FromHexString(hex);
      mat.disableLighting = true;
      neonMats.push(mat);
      for (const [list, size] of [[neonStrips[i], { width: 1, height: 0.18, depth: 0.12 }], [neonPosts[i], { width: 0.16, height: 1, depth: 0.12 }]] as const) {
        if (!list.length) continue;
        const bar = MeshBuilder.CreateBox(`neon-bar-${i}-${size.width}`, size, scene);
        bar.material = mat;
        bar.isPickable = false;
        bar.thinInstanceAdd(list);
        bar.thinInstanceRefreshBoundingInfo(false);
        glowing(bar);
      }
    });

    // Party lights strung round the plaza between the palms, with a few runs across it.
    const bulbs: [Matrix[], Matrix[]] = [[], []];
    const ring = Array.from({ length: 8 }, (_, i) => { const a = (i / 8) * Math.PI * 2; return new Vector3(sp.x + Math.cos(a) * 19, 5.4, sp.z + Math.sin(a) * 19); });
    const strand = (a: Vector3, b: Vector3, n: number) => {
      for (let k = 1; k < n; k++) {
        const f = k / n;
        const pt = Vector3.Lerp(a, b, f);
        pt.y -= Math.sin(Math.PI * f) * 1.1;
        bulbs[k % 2].push(Matrix.Translation(pt.x, pt.y, pt.z));
      }
    };
    ring.forEach((a, i) => strand(a, ring[(i + 1) % 8], 9));
    ['#ffd08a', '#ff5fa8'].forEach((hex, i) => {
      const bulb = MeshBuilder.CreateSphere(`bulb-${i}`, { diameter: 0.15, segments: 6 }, scene);
      const mat = new StandardMaterial(`bulb-mat-${i}`, scene);
      mat.diffuseColor = Color3.Black();
      mat.emissiveColor = Color3.FromHexString(hex);
      mat.disableLighting = true;
      bulb.material = mat;
      bulb.isPickable = false;
      bulb.thinInstanceAdd(bulbs[i]);
      bulb.thinInstanceRefreshBoundingInfo(false);
      glowing(bulb);
    });
    for (const [name, model] of models) {
      const list = placements.get(name);
      for (const m of model.meshes) {
        // Unused kit meshes stay (hidden) as geometry sources for traffic.
        if (!list?.length) { m.setEnabled(false); continue; }
        commit(m, list, /^(house|apartment|shop|tower|palm|street-lamp|shrub)/.test(name) || cars.includes(name));
      }
    }

    // Traffic: a few cars cruising the coastal road and Admiralty Way. Danfo buses are vans painted yellow.
    const danfo = new StandardMaterial('danfo-mat', scene);
    danfo.diffuseTexture = (models.get('van')?.meshes[0]?.material as StandardMaterial | undefined)?.diffuseTexture ?? null;
    danfo.diffuseColor = new Color3(1, 0.78, 0.1);
    danfo.specularColor = new Color3(0.08, 0.08, 0.08);
    const routes: { axis: 'x' | 'z'; fixed: number; min: number; max: number }[] = [
      { axis: 'x', fixed: cellPos(0, 4).z, min: cellPos(1, 0).x, max: cellPos(46, 0).x },
      { axis: 'z', fixed: cellPos(36, 0).x, min: cellPos(0, 4).z, max: cellPos(0, 30).z },
      { axis: 'z', fixed: cellPos(26, 0).x, min: cellPos(0, 4).z, max: cellPos(0, 30).z },
    ];
    routes.forEach((route, k) => { for (let i = 0; i < 4; i++) {
      const isDanfo = (k + i) % 3 === 0;
      const name = isDanfo ? 'van' : cars[(k * 3 + i) % cars.length];
      const src = models.get(name);
      if (!src) continue;
      const node = new TransformNode(`traffic-${k}-${i}`, scene);
      for (const m of src.meshes) {
        // Own vertex data: the kit mesh's geometry also carries its thin-instance buffers.
        const car = new Mesh(`${node.name}-${m.name}`, scene);
        carData.get(m)?.applyToMesh(car);
        car.material = isDanfo ? danfo : m.material;
        car.parent = node;
        car.isPickable = false;
        castShadow(car);
      }
      const lane = i % 2 ? 2 : -2;
      const speed = (i % 2 ? 1 : -1) * (7 + hash(k, i) * 5);
      const start = route.min + ((i + 0.5) / 4) * (route.max - route.min);
      if (route.axis === 'x') node.position = new Vector3(start, 0, route.fixed + lane);
      else node.position = new Vector3(route.fixed + lane, 0, start);
      node.rotation.y = route.axis === 'x' ? (speed > 0 ? Math.PI / 2 : -Math.PI / 2) : speed > 0 ? 0 : Math.PI;
      traffic.push({ node, axis: route.axis, lane, speed, min: route.min, max: route.max });
    } });
    setHour(hour);
  });

  // Time of day. 6:00 sunrise, 19:00 sunset; `n` (night) drives neon, lamp pools and the bridge lights.
  const pinnedHour = new URLSearchParams(window.location.search).has('hour');
  let hour = AFTER_DARK;
  let night = 0;
  const paintSky = (top: Color3, horizon: Color3) => {
    const c = skyTex.getContext() as CanvasRenderingContext2D;
    const grad = c.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, top.toHexString());
    grad.addColorStop(0.55, Color3.Lerp(top, horizon, 0.6).toHexString());
    grad.addColorStop(0.75, horizon.toHexString());
    grad.addColorStop(1, horizon.toHexString());
    c.fillStyle = grad;
    c.fillRect(0, 0, 4, 256);
    skyTex.update();
  };
  function setHour(h: number) {
    hour = h;
    const t = (h - 6) / 13; // 0 at sunrise, 1 at sunset
    const elevation = Math.sin(Math.PI * Math.min(1, Math.max(0, t)));
    const day = t <= 0 || t >= 1 ? 0 : Math.min(1, elevation * 3);
    const dusk = day > 0 && day < 1 ? 1 - Math.abs(day - 0.5) * 2 : 0;
    night = 1 - day;
    const azimuth = Math.PI * (0.15 + Math.min(1, Math.max(0, t)) * 0.7);
    const el = Math.max(0.25, elevation) * 1.1;
    sun.direction = new Vector3(-Math.cos(azimuth), -el, 0.45).normalize();
    sun.position = sun.direction.scale(-400);
    // Night is moonlit, not black: the city has to stay readable at the hours people actually go out.
    sun.intensity = 0.45 + 0.7 * day;
    sun.diffuse = Color3.Lerp(new Color3(0.58, 0.5, 1), Color3.Lerp(new Color3(1, 0.74, 0.5), new Color3(1, 0.97, 0.9), day), Math.min(1, day * 2));
    hemi.intensity = 0.92 - 0.17 * day;
    hemi.diffuse = Color3.Lerp(new Color3(0.62, 0.58, 0.9), new Color3(0.9, 0.94, 0.97), day);
    hemi.groundColor = Color3.Lerp(new Color3(0.32, 0.2, 0.36), new Color3(0.5, 0.52, 0.44), day);
    const base = Color3.Lerp(SKY_NIGHT.top, SKY_DAY.top, day);
    const hz = Color3.Lerp(SKY_NIGHT.horizon, SKY_DAY.horizon, day);
    const top = Color3.Lerp(base, SKY_DUSK.top, dusk * 0.6);
    const horizon = Color3.Lerp(hz, SKY_DUSK.horizon, dusk * 0.75);
    paintSky(top, horizon);
    scene.fogColor = horizon;
    scene.clearColor.set(horizon.r, horizon.g, horizon.b, 1);
    glow.intensity = 0.1 + night * 0.5;
    beams.forEach((b) => b.mesh.setEnabled(night > 0.5));
    scene.environmentIntensity = 0.12 + 0.38 * day;
    lampPools.forEach((p) => p.setEnabled(night > 0.35));
  }
  setHour(hour);


  /** Ray against building boxes: distance along the ray to the nearest hit (slab test), or Infinity. */
  const rayHit = (o: Vector3, d: Vector3, b: Building, maxT: number) => {
    let t0 = 0, t1 = maxT;
    for (const [oa, da, lo, hi] of [[o.x, d.x, b.x0, b.x1], [o.y, d.y, 0, b.h], [o.z, d.z, b.z0, b.z1]]) {
      if (Math.abs(da) < 1e-9) { if (oa < lo || oa > hi) return Infinity; continue; }
      let a = (lo - oa) / da, c = (hi - oa) / da;
      if (a > c) [a, c] = [c, a];
      t0 = Math.max(t0, a); t1 = Math.min(t1, c);
      if (t0 > t1) return Infinity;
    }
    return t0;
  };
  /** Tile-level A* along walkable tiles (streets, plaza, parks, beach), then straightened where nothing's in the way. */
  const walkable = (c: number, r: number) => {
    const v = at(grid, c, r);
    return v !== undefined && v !== 'lot' && v !== 'venue' && v !== 'water' && v !== 'ocean' && v !== 'border';
  };
  const clear = (a: Vector3, b: Vector3) => {
    const n = Math.ceil(Vector3.Distance(a, b) / 0.8);
    for (let i = 1; i < n; i++) { const p = Vector3.Lerp(a, b, i / n); if (blocked(p.x, p.z)) return false; }
    return true;
  };
  /** The closest spot you can stand on near `p`: back along the line towards `from`, else the nearest ring. */
  const nearestFree = (p: Vector3, from: Vector3) => {
    const q = new Vector3(p.x, 0, p.z);
    if (!blocked(q.x, q.z)) return q;
    const back = from.subtract(q);
    back.y = 0;
    const len = back.length();
    if (len > 0.01) {
      back.scaleInPlace(1 / len);
      for (let d = 0.5; d < Math.min(len, 40); d += 0.5) { const c = q.add(back.scale(d)); if (!blocked(c.x, c.z)) return c; }
    }
    for (let r = 1; r <= 16; r++) for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const c = q.add(new Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
      if (!blocked(c.x, c.z)) return c;
    }
    return from.clone();
  };
  const route = (from: Vector3, to: Vector3): Vector3[] => {
    if (clear(from, to)) return [to];
    const [sc, sr] = cellAt(from.x, from.z);
    let [gc, gr] = cellAt(to.x, to.z);
    if (!walkable(gc, gr)) {
      const n = (Object.values(STEP) as [number, number][]).map(([dc, dr]) => [gc + dc, gr + dr]).find(([c, r]) => walkable(c, r));
      if (!n) return [to];
      [gc, gr] = n;
    }
    const key = (c: number, r: number) => r * W + c;
    const came = new Map<number, number>();
    const cost = new Map<number, number>([[key(sc, sr), 0]]);
    const open: [number, number, number][] = [[0, sc, sr]];
    while (open.length) {
      open.sort((a, b) => a[0] - b[0]);
      const [, c, r] = open.shift()!;
      if (c === gc && r === gr) break;
      for (const [dc, dr] of Object.values(STEP)) {
        const nc = c + dc, nr = r + dr;
        if (!walkable(nc, nr) && !(nc === gc && nr === gr)) continue;
        const g = cost.get(key(c, r))! + 1;
        if (g < (cost.get(key(nc, nr)) ?? Infinity)) {
          cost.set(key(nc, nr), g);
          came.set(key(nc, nr), key(c, r));
          open.push([g + Math.abs(nc - gc) + Math.abs(nr - gr), nc, nr]);
        }
      }
    }
    if (!came.has(key(gc, gr))) return [to];
    const cells: Vector3[] = [];
    for (let k = key(gc, gr); k !== key(sc, sr); k = came.get(k)!) cells.unshift(cellPos(k % W, Math.floor(k / W)));
    const path = [...cells.slice(0, -1), to];
    // String-pull: skip waypoints we can see past.
    const out: Vector3[] = [];
    let here = from;
    for (let i = 0; i < path.length; i++) {
      let j = path.length - 1;
      while (j > i && !clear(here, path[j])) j--;
      out.push(path[j]);
      here = path[j];
      i = j;
    }
    return out;
  };
  const half = { x: ((W - 2) / 2) * TILE, z: ((H - 2) / 2) * TILE };
  // Coming out of a club: stand at its door, facing the street. Otherwise the plaza, facing west over the bridge.
  const leftClub = VENUES.find((v) => v.kind === from);
  const exitDoor = leftClub && portals.find((p) => p.kind === leftClub.kind);
  const exitStep = leftClub ? STEP[leftClub.face] : null;
  return {
    bounds: half,
    playerSpawn: exitDoor && exitStep ? exitDoor.position.add(new Vector3(exitStep[0] * 2.2, 0, exitStep[1] * 2.2)) : cellPos(...SPAWN),
    portals,
    castShadow,
    ready,
    // Arrive facing west, over the bridge towards the clubs.
    camera: { upperRadius: 32, maxZ: 2600, alpha: exitStep ? Math.atan2(-exitStep[1], -exitStep[0]) : 0 },
    collide: (from, to) => {
      if (!blocked(to.x, to.z)) return to;
      if (!blocked(to.x, from.z)) return new Vector3(to.x, to.y, from.z);
      if (!blocked(from.x, to.z)) return new Vector3(from.x, to.y, to.z);
      return from;
    },
    // Lagos after dark: ignore the clock unless QA pins an hour.
    setHour: (h) => setHour(pinnedHour ? h : AFTER_DARK),
    route,
    pick: (origin, dir, from) => {
      const hit = scene.pickWithRay(new Ray(origin, dir, 3000), (m) => m.isPickable && m.isEnabled());
      if (!hit?.hit || !hit.pickedPoint) return null;
      const pt = hit.pickedPoint;
      // A building: walk to its door (and into it, if it's a venue).
      const building = buildings.find((b) => pt.x > b.x0 - 1.5 && pt.x < b.x1 + 1.5 && pt.z > b.z0 - 1.5 && pt.z < b.z1 + 1.5 && pt.y > 0.3);
      if (building) return { point: building.door.clone(), portal: building.portal, distance: hit.distance };
      // Anything else (ground, car, tree, palm, billboard, water): the nearest spot you can stand on.
      return { point: nearestFree(pt, from), distance: hit.distance };
    },
    occlude: (target, camPos) => {
      const d = camPos.subtract(target);
      const len = d.length();
      d.scaleInPlace(1 / len);
      let t = len;
      for (const b of buildings) {
        if (Math.max(b.x0 - target.x, target.x - b.x1, b.z0 - target.z, target.z - b.z1) > len) continue;
        t = Math.min(t, rayHit(target, d, b, t));
      }
      return t;
    },
    animate: (t, dt) => {
      const pulse = 0.4 + night * 0.6;
      neon.forEach(({ mat, base }, i) => { mat.emissiveColor = base.scale(pulse * (0.85 + Math.sin(t * (2 + (i % 3)) + i) * 0.15)); });
      waterMat.diffuseColor.set(0.2 + Math.sin(t * 0.6) * 0.012, 0.62 * (1 - night * 0.6), 0.74 * (1 - night * 0.5));
      // Neon breathes on an Afrobeats-ish pulse (~110 bpm), each colour slightly off the others.
      neonMats.forEach((m, i) => { m.emissiveColor = Color3.FromHexString(NEON[i]).scale(0.78 + Math.max(0, Math.sin(t * 11.5 + i * 1.7)) * 0.22 * night); });
      beams.forEach(({ mesh, phase }) => { mesh.rotation.z = Math.sin(t * 0.35 + phase) * 0.45; mesh.rotation.x = Math.cos(t * 0.27 + phase) * 0.3; });
      deckLights.forEach((m, i) => { m.emissiveColor = Color3.FromHSV(((t * 0.05 + i * 0.5) % 1) * 360, 0.8, night); });
      for (const car of traffic) {
        const p = car.node.position;
        if (car.axis === 'x') { p.x += car.speed * dt; if (p.x > car.max) p.x = car.min; if (p.x < car.min) p.x = car.max; }
        else { p.z += car.speed * dt; if (p.z > car.max) p.z = car.min; if (p.z < car.min) p.z = car.max; }
      }
    },
  };
}

/** Paint colours for the Lagos kit: a material named `plaster.peach` is the plaster texture tinted peach. */
const TINTS: Record<string, string> = {
  white: '#f2efe8', cream: '#f0e3c4', sand: '#dcc59a', peach: '#f2c4a0', grey: '#b4b6b8', terracotta: '#c87452',
  sky: '#b3d0e3', mint: '#b8dcc6', black: '#2a2a2e', bronze: '#8a6a4c', wine: '#5a1420', green: '#1f4a2e', navy: '#1c2848',
  charcoal: '#4a4a50', slate: '#6a6470', red: '#a8442e', blue: '#4a6a94', brown: '#7a5638',
};

export function tuneLagosMaterial(m: PBRMaterial) {
  const [base, tint] = m.name.split('.');
  if (tint && TINTS[tint]) m.albedoColor = Color3.FromHexString(TINTS[tint]);
  if (base === 'glass') {
    // Night glass: dark, glossy, and reflecting a dusky violet rather than the HDR's daylight sky.
    m.reflectionColor = new Color3(0.42, 0.36, 0.62);
  } else if (base === 'win-lit' || base === 'win-dim') {
    m.emissiveIntensity = base === 'win-lit' ? 0.62 : 0.26;
  } else if (base === 'asphalt') {
    m.albedoColor = new Color3(1.3, 1.3, 1.32); // lifts the near-black asphalt so lanes and cracks read at night
  } else if (base === 'frond' || base === 'leaves') {
    m.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHATEST;
    m.alphaCutOff = 0.5;
    m.backFaceCulling = false;
    m.twoSidedLighting = true;
  } else if (base === 'marking' || base === 'marking-yellow') {
    m.emissiveColor = m.albedoColor.scale(0.08); // reflective road paint catches headlights
  }
}

/** A kit material with its textures repeated `repeat` times, for big ground planes. */
function tiled(scene: Scene, src: PBRMaterial | undefined, repeat: number) {
  if (!src) return null;
  const m = src.clone(`${src.name}-x${Math.round(repeat)}`);
  for (const key of ['albedoTexture', 'bumpTexture', 'metallicTexture'] as const) {
    const t = src[key] as Texture | null;
    if (!t) continue;
    const c = t.clone();
    c.uScale = c.vScale = repeat;
    m[key] = c;
  }
  return m;
}

const streetAt = (axis: 'ew' | 'ns', c: number, r: number) =>
  STREET_NAMES[axis].find(([line, a, b]) => (axis === 'ew' ? r === line && c >= a && c <= b : c === line && r >= a && r <= b))?.[3];

/**
 * Lagos street signs at every junction: a pole on the corner with one blade per street. All names share one texture
 * atlas and all blades are merged into one mesh, so the whole city's signage is two draw calls.
 */
function addStreetSigns(scene: Scene, grid: Cell[][]) {
  const names = [...new Set([...STREET_NAMES.ew, ...STREET_NAMES.ns].map((s) => s[3]))];
  const ROW = 64;
  const tex = new DynamicTexture('street-sign-tex', { width: 512, height: ROW * names.length }, scene, true);
  const c = tex.getContext() as CanvasRenderingContext2D;
  names.forEach((name, i) => {
    const y = i * ROW;
    c.fillStyle = '#1d6b45';
    c.fillRect(0, y, 512, ROW);
    c.strokeStyle = '#f4f4f0';
    c.lineWidth = 4;
    c.strokeRect(6, y + 6, 500, ROW - 12);
    c.fillStyle = '#f4f4f0';
    c.font = '700 34px "Plus Jakarta Sans Variable", system-ui, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(name, 256, y + ROW / 2 + 2, 470);
  });
  tex.update();
  const mat = new StandardMaterial('street-sign-mat', scene);
  mat.diffuseTexture = tex;
  mat.emissiveTexture = tex;
  mat.emissiveColor = new Color3(0.28, 0.28, 0.28); // reflective sheeting catches headlights; readable at night
  mat.specularColor = new Color3(0.1, 0.1, 0.1);
  const blades: Mesh[] = [];
  const poles: Matrix[] = [];
  const blade = (name: string, x: number, y: number, z: number, rot: number) => {
    const i = names.indexOf(name);
    const v0 = 1 - (i + 1) / names.length, v1 = 1 - i / names.length;
    const b = MeshBuilder.CreatePlane('street-blade', {
      width: 2.4, height: 0.3, sideOrientation: Mesh.DOUBLESIDE,
      frontUVs: new Vector4(0, v0, 1, v1), backUVs: new Vector4(1, v0, 0, v1),
    }, scene);
    b.position = new Vector3(x, y, z);
    b.rotation.y = rot;
    blades.push(b);
  };
  for (let r = 0; r < H; r++) for (let col = 0; col < W; col++) {
    if (grid[r][col] !== 'road') continue;
    const [piece] = roadPiece(grid, col, r);
    if (piece !== 'road-crossroad' && piece !== 'road-intersection') continue;
    const ew = streetAt('ew', col, r);
    const ns = streetAt('ns', col, r);
    if (!ew && !ns) continue;
    const p = cellPos(col, r);
    const x = p.x - TILE / 2 + 0.7, z = p.z - TILE / 2 + 0.7;
    poles.push(Matrix.Translation(x, 1.75, z));
    if (ew) blade(ew, x + 1.2, 3.35, z, 0);
    if (ns) blade(ns, x, 3.0, z + 1.2, Math.PI / 2);
  }
  if (blades.length) {
    const merged = Mesh.MergeMeshes(blades, true, true)!;
    merged.name = 'street-signs';
    merged.material = mat;
    merged.isPickable = false;
  }
  const pole = MeshBuilder.CreateCylinder('street-sign-pole', { height: 3.5, diameter: 0.09, tessellation: 8 }, scene);
  const pm = new StandardMaterial('street-sign-pole-mat', scene);
  pm.diffuseColor = new Color3(0.45, 0.46, 0.48);
  pole.material = pm;
  pole.isPickable = false;
  pole.thinInstanceAdd(poles);
}

const ADS: { title: string; line: string; bg: string; fg: string }[] = [
  { title: 'JOLLOF REPUBLIC', line: 'Party jollof. Every night.', bg: '#f0603a', fg: '#fff6e8' },
  { title: 'DANFO DASH', line: 'Ride Lagos, no wahala', bg: '#f5c518', fg: '#141416' },
  { title: 'EKO WAVES 99.1', line: 'Afrobeats till sunrise', bg: '#6c3ce0', fg: '#ffffff' },
  { title: 'SUYA & CHILL', line: 'Lekki · open late', bg: '#2a1530', fg: '#ffb02e' },
  { title: 'SIDE PIECE', line: 'Same people. New options.', bg: '#ff2f91', fg: '#ffffff' },
  { title: 'ZOBO CO.', line: 'Cold zobo, warm vibes', bg: '#9b1530', fg: '#ffe9ef' },
  { title: 'LAGOS LIGHTS FEST', line: 'This Friday · Victoria Island', bg: '#13a8b8', fg: '#ffffff' },
  { title: 'NAIRA NEST', line: 'Save small, ball big', bg: '#1f8a4c', fg: '#f2fff6' },
  { title: 'OWAMBE OUTFITTERS', line: 'Aso-ebi for every party', bg: '#f07a2a', fg: '#1b0f08' },
];

/** A roadside billboard: two posts, a lit board and a painted ad (one material each; there are only a handful). */
function makeBillboard(scene: Scene, ad: (typeof ADS)[number], name: string): TransformNode {
  const node = new TransformNode(name, scene);
  const metal = new StandardMaterial(`${name}-metal`, scene);
  metal.diffuseColor = new Color3(0.32, 0.33, 0.36);
  for (const x of [-2.6, 2.6]) {
    const post = MeshBuilder.CreateBox(`${name}-post`, { width: 0.3, height: 6, depth: 0.3 }, scene);
    post.position = new Vector3(x, 3, 0.2);
    post.material = metal;
    post.parent = node;
  }
  const frame = MeshBuilder.CreateBox(`${name}-frame`, { width: 7.6, height: 3.8, depth: 0.35 }, scene);
  frame.position = new Vector3(0, 7.4, 0.2);
  frame.material = metal;
  frame.parent = node;
  const tex = new DynamicTexture(`${name}-tex`, { width: 512, height: 256 }, scene, true);
  const c = tex.getContext() as CanvasRenderingContext2D;
  c.fillStyle = ad.bg;
  c.fillRect(0, 0, 512, 256);
  c.fillStyle = 'rgba(255,255,255,0.12)';
  c.beginPath(); c.arc(430, 40, 150, 0, Math.PI * 2); c.fill();
  c.fillStyle = ad.fg;
  c.textAlign = 'left';
  c.font = '800 54px "Bricolage Grotesque Variable", system-ui, sans-serif';
  c.fillText(ad.title, 30, 120, 452);
  c.font = '600 28px "Plus Jakarta Sans Variable", system-ui, sans-serif';
  c.fillText(ad.line, 32, 172, 448);
  tex.update();
  const face = MeshBuilder.CreatePlane(`${name}-face`, { width: 7.2, height: 3.4 }, scene);
  face.position = new Vector3(0, 7.4, 0.0);
  const mat = new StandardMaterial(`${name}-face-mat`, scene);
  mat.diffuseTexture = tex;
  mat.emissiveTexture = tex;
  mat.emissiveColor = new Color3(0.35, 0.35, 0.35);
  mat.specularColor = new Color3(0.05, 0.05, 0.05);
  face.material = mat;
  face.parent = node;
  for (const m of node.getChildMeshes()) m.isPickable = false;
  return node;
}

/** A round plaza fountain: stone basin, water and a tiered spout. */
function makeFountain(scene: Scene): TransformNode {
  const node = new TransformNode('fountain', scene);
  const stone = new StandardMaterial('fountain-stone', scene);
  stone.diffuseColor = new Color3(0.86, 0.82, 0.74);
  stone.specularColor = new Color3(0.05, 0.05, 0.05);
  const water = new StandardMaterial('fountain-water', scene);
  water.diffuseColor = new Color3(0.25, 0.7, 0.85);
  water.emissiveColor = new Color3(0.04, 0.18, 0.24);
  water.specularColor = new Color3(0.8, 0.8, 0.8);
  water.specularPower = 64;
  const part = (m: Mesh, mat: StandardMaterial, y: number) => { m.position.y = y; m.material = mat; m.parent = node; m.isPickable = false; };
  part(MeshBuilder.CreateCylinder('fountain-basin', { diameter: 6.4, height: 0.7, tessellation: 24 }, scene), stone, 0.35);
  part(MeshBuilder.CreateCylinder('fountain-water', { diameter: 5.8, height: 0.08, tessellation: 24 }, scene), water, 0.62);
  part(MeshBuilder.CreateCylinder('fountain-column', { diameterTop: 0.5, diameterBottom: 0.8, height: 2.2, tessellation: 12 }, scene), stone, 1.1);
  part(MeshBuilder.CreateCylinder('fountain-bowl', { diameterTop: 2.2, diameterBottom: 0.6, height: 0.5, tessellation: 16 }, scene), stone, 2.2);
  part(MeshBuilder.CreateCylinder('fountain-water-top', { diameter: 1.9, height: 0.06, tessellation: 16 }, scene), water, 2.45);
  part(MeshBuilder.CreateSphere('fountain-water-jet', { diameter: 0.5, segments: 8 }, scene), water, 2.8);
  return node;
}

/** Warm sandstone paving with soft joints, drawn once. */
function pavingMaterial(scene: Scene) {
  const tex = new DynamicTexture('paving-tex', { width: 256, height: 256 }, scene, true);
  const c = tex.getContext() as CanvasRenderingContext2D;
  c.fillStyle = '#e4d6bf';
  c.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    const v = ((x * 7 + y * 13) % 5) * 4;
    c.fillStyle = `rgb(${222 - v}, ${208 - v}, ${184 - v})`;
    c.fillRect(x * 64 + 2, y * 64 + 2, 60, 60);
  }
  tex.update();
  tex.uScale = tex.vScale = 14;
  const mat = new StandardMaterial('paving-mat', scene);
  mat.diffuseTexture = tex;
  mat.specularColor = new Color3(0.04, 0.04, 0.04);
  return mat;
}
