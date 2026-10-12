import '@babylonjs/loaders/glTF';
import {
  AbstractMesh,
  AnimationGroup,
  AssetContainer,
  Color3,
  LoadAssetContainerAsync,
  Matrix,
  Mesh,
  MeshBuilder,
  Node,
  PBRMaterial,
  Scene,
  StandardMaterial,
  TransformNode,
  Vector3,
} from '@babylonjs/core';
import { BOTTOMS, DEFAULT_SHOES, Frame, frameOf, hexRgb, Look, resolveHair, resolveItem, SHOES, skinRgb, TOPS } from './look';
import { quality } from './render';
import { makeHumanoid } from './venue';

/**
 * Modular characters (ADR 0017): Quaternius Ultimate Modular Men/Women (CC0), one GLB per frame in
 * `public/characters/` (built by `scripts/characters/build.mjs`). Every outfit part is skinned to the same 62-bone
 * rig, so a character is one head + top + bottom + shoes chosen from that file, with skin, hair and clothing
 * recoloured per character. The primitive humanoid shows while the model loads, and stays if it fails.
 */
/** Warm the HTTP cache with both frames at app start, so characters appear the moment a scene asks for them. */
export function prefetchCharacters() {
  for (const frame of ['female', 'male']) fetch(`/characters/${frame}.glb`).catch(() => {});
}

const containers = new WeakMap<Scene, Map<Frame, Promise<AssetContainer>>>();

function load(scene: Scene, frame: Frame) {
  let perScene = containers.get(scene);
  if (!perScene) { perScene = new Map(); containers.set(scene, perScene); }
  let hit = perScene.get(frame);
  if (!hit) {
    hit = LoadAssetContainerAsync(`/characters/${frame}.glb`, scene);
    perScene.set(frame, hit);
  }
  return hit;
}

type Rig = {
  root: TransformNode;
  meshes: AbstractMesh[];
  head?: TransformNode;
  animate: (moving: boolean, dt: number, running?: boolean) => void;
  dispose: () => void;
};

let rigCount = 0;
class SceneGone extends Error {}

/** glTF colours are linear; our look colours are sRGB hex / 0..1 sRGB. */
const linear = (rgb: [number, number, number]) => new Color3(...rgb).toLinearSpace();

async function loadRig(scene: Scene, look: Look): Promise<Rig> {
  const frame = frameOf(look);
  const container = await load(scene, frame);
  // Previews rebuild their scene on every creator change; don't instantiate into one that's already gone.
  if (scene.isDisposed) throw new SceneGone();
  const prefix = `rig${rigCount++}:`;
  const entries = container.instantiateModelsToScene((n) => prefix + n, true, { doNotInstantiate: true });
  const gltfRoot = entries.rootNodes[0] as TransformNode;
  const strip = (n: string) => (n.startsWith(prefix) ? n.slice(prefix.length) : n);

  const top = resolveItem(TOPS, look.top, frame);
  const bottom = resolveItem(BOTTOMS, look.bottom, frame);
  const shoes = resolveItem(SHOES, look.shoes || DEFAULT_SHOES[frame], frame);
  const hair = resolveHair(look, frame);
  const [headSet, hairMats] = hair.heads[frame]!;
  const wanted = new Map<string, { material?: string; color?: string }>([
    [`${headSet}_Head`, {}],
    [`${top.parts[frame]![0]}_Body`, { material: top.parts[frame]![1], color: look.top_color || top.color }],
    [`${bottom.parts[frame]![0]}_Legs`, { material: bottom.parts[frame]![1], color: look.bottom_color || bottom.color }],
    [`${shoes.parts[frame]![0]}_Feet`, {}],
  ]);

  const skin = linear(skinRgb(look.skin_tone));
  const hairColor = linear(hexRgb(look.hair_color));
  const meshes: AbstractMesh[] = [];
  for (const m of gltfRoot.getChildMeshes(false)) {
    // Multi-material parts load as `<part>` with `<part>_primitiveN` children.
    const part = strip(m.name).replace(/_primitive\d+$/, '');
    const spec = wanted.get(part);
    if (!spec) { m.dispose(false, false); continue; }
    m.isPickable = false;
    // Skinned parts keep their bind-pose bounds (in the rig's centimetre space), which culls them at some camera
    // distances (the full-body preview showed only a floating cap). There are only a handful of characters.
    m.alwaysSelectAsActiveMesh = true;
    if (m.getTotalVertices() > 0) meshes.push(m);
    const mat = m.material;
    if (!(mat instanceof PBRMaterial)) continue;
    // Match StandardMaterial lighting: our lights use `range`, not physical falloff (AGENTS.md gotcha).
    mat.usePhysicalLightFalloff = false;
    mat.maxSimultaneousLights = quality() === 'high' ? 12 : 6;
    mat.metallic = 0;
    mat.roughness = 0.7;
    // No environment map, so lift direct light a little or deep skin tones and dark clothes read as silhouettes.
    mat.directIntensity = 1.5;
    mat.specularIntensity = 0.6;
    const name = strip(mat.name);
    if (name === 'Skin') mat.albedoColor = skin;
    else if (name === 'Skin_Darker') mat.albedoColor = skin.scale(0.85);
    else if (part.endsWith('_Head') && hairMats.includes(name)) mat.albedoColor = hairColor;
    else if (spec.material === name && spec.color) {
      // Parts share materials (a dress and its skirt are both "LimeGreen"), so recolour a private copy.
      const own = mat.clone(`${mat.name}:${part}`);
      own.albedoColor = linear(hexRgb(spec.color));
      m.material = own;
    }
  }

  // Body type: a wrapper node, because the glTF root carries the handedness flip in its scaling.
  const fit = new TransformNode(`${prefix}fit`, scene);
  const width = 0.93 + look.body_type * 0.16;
  fit.scaling = new Vector3(width, 1, width);
  gltfRoot.parent = fit;

  const byName = new Map<string, Node>();
  for (const n of gltfRoot.getDescendants(false)) byName.set(strip(n.name), n);
  const head = byName.get('Head') as TransformNode | undefined;

  // Face pads: subtle head proportions.
  const [fx, fy, gx, gy] = look.face;
  if (head) head.scaling = new Vector3(1 + fy * 0.04 + gx * 0.015, 1 + fx * 0.04, 1 + gy * 0.02);

  // Styles the kit doesn't model (afro, puffs, locs) are low-poly shapes riding on the head bone.
  if (hair.extra && head) {
    fit.computeWorldMatrix(true);
    gltfRoot.getDescendants(false).forEach((n) => (n as TransformNode).computeWorldMatrix?.(true));
    const headMesh = meshes.find((m) => strip(m.name).startsWith(`${headSet}_Head`));
    const box = headMesh?.getHierarchyBoundingVectors(true);
    // Skinned meshes report their bind-pose box; fall back to the head bone if that's off.
    const top = box ? box.max.y : head.getAbsolutePosition().y + 0.2;
    const centre = box ? box.min.add(box.max).scale(0.5) : head.getAbsolutePosition();
    const extra = makeHair(scene, `${prefix}hair`, hair.extra, hairColor);
    extra.position = new Vector3(centre.x, top - 0.07, centre.z - 0.015);
    extra.setParent(head);
    meshes.push(extra);
  }

  // Animations come with the rig: idle, walk and run, blended by weight.
  const group = (name: string) => entries.animationGroups.find((g) => strip(g.name) === name);
  entries.animationGroups.forEach((g) => g.stop());
  const idle = group('Idle');
  const walk = group('Walk');
  const run = group('Run');
  for (const g of [idle, walk, run]) g?.start(true);
  let w = 0;
  let r = 0;
  const weigh = (g: AnimationGroup | undefined, value: number) => g?.setWeightForAllAnimatables(value);
  weigh(idle, 1);
  weigh(walk, 0);
  weigh(run, 0);

  return {
    root: fit,
    meshes,
    head,
    animate: (moving, dt, running = false) => {
      const k = Math.min(1, dt * 8);
      w += ((moving ? 1 : 0) - w) * k;
      r += ((moving && running ? 1 : 0) - r) * k;
      weigh(idle, 1 - w);
      weigh(walk, w * (1 - r));
      weigh(run, w * r);
    },
    dispose: () => {
      entries.animationGroups.forEach((g) => g.dispose());
      entries.skeletons.forEach((s) => s.dispose());
      fit.dispose(false, true);
    },
  };
}

/** Low-poly hair volumes, flat-shaded to match the kit: an afro, two puffs, or a crown of locs. */
function makeHair(scene: Scene, name: string, kind: 'afro' | 'puffs' | 'locs', color: Color3): Mesh {
  const mat = new StandardMaterial(`${name}-mat`, scene);
  mat.diffuseColor = color.toGammaSpace().scale(0.9);
  mat.specularColor = new Color3(0.04, 0.04, 0.04);
  const parts: Mesh[] = [];
  const blob = (r: number, at: Vector3, seed: number) => {
    const s = MeshBuilder.CreateIcoSphere(`${name}-blob`, { radius: r, subdivisions: 2, flat: true }, scene);
    // Lumpy, not a ball: push each vertex out by a little deterministic noise.
    const pos = s.getVerticesData('position')!;
    for (let i = 0; i < pos.length; i += 3) {
      const n = 1 + Math.sin(pos[i] * 41 + seed) * Math.cos(pos[i + 1] * 37 + seed) * 0.08;
      pos[i] *= n; pos[i + 1] *= n; pos[i + 2] *= n;
    }
    s.updateVerticesData('position', pos);
    s.position = at;
    parts.push(s);
  };
  if (kind === 'afro') {
    blob(0.16, new Vector3(0, 0.02, -0.01), 1);
  } else if (kind === 'puffs') {
    blob(0.105, new Vector3(0, -0.03, 0), 2);
    blob(0.085, new Vector3(-0.1, 0.07, -0.02), 3);
    blob(0.085, new Vector3(0.1, 0.07, -0.02), 4);
  } else {
    blob(0.11, new Vector3(0, -0.02, -0.005), 5);
    for (let i = 0; i < 14; i++) {
      const a = Math.PI * (0.15 + (i / 13) * 1.7);
      const len = 0.24 + (i % 3) * 0.04;
      const loc = MeshBuilder.CreateCylinder(`${name}-loc`, { height: len, diameterTop: 0.03, diameterBottom: 0.022, tessellation: 5 }, scene);
      loc.position = new Vector3(Math.cos(a) * 0.1, -0.05 - len / 2, -Math.sin(a) * 0.1 - 0.02);
      loc.rotation.x = Math.sin(a) * 0.18;
      loc.rotation.z = -Math.cos(a) * 0.18;
      parts.push(loc);
    }
  }
  const merged = Mesh.MergeMeshes(parts, true, true)!;
  merged.name = name;
  merged.material = mat;
  merged.isPickable = false;
  return merged;
}

const ACCESSORY = /-(brim|crown|cap|peak|lens-.*|tint-.*)$/;
const PRIMITIVE_HEAD_Y = 1.82;

/**
 * Same contract as `makeHumanoid` (root, ring, meshes, animateWalk), so callers don't change. Starts as the
 * primitive humanoid and swaps in the modular character when it has loaded.
 */
export function makeAvatar(
  scene: Scene, name: string, look: Look, accent: Color3, label?: string, labelColor?: string,
  opts: { castShadow?: (m: AbstractMesh) => void; onReady?: (info: { headY: number }) => void; lite?: boolean } = {},
) {
  const h = makeHumanoid(scene, name, look, accent, label, labelColor);
  // The primitive body is only a fallback now: showing it first made people flash in the wrong outfit and shape.
  // The ring, name tag and contact shadow stay visible while the real model loads (usually a few frames).
  h.meshes.forEach((m) => m.setEnabled(false));
  let animate: (moving: boolean, dt: number, running?: boolean) => void = h.animateWalk;
  const avatar = { ...h, animateWalk: (moving: boolean, dt: number, running = false) => animate(moving, dt, running) };

  loadRig(scene, look).then((rig) => {
    if (h.root.isDisposed() || scene.isDisposed) { rig.dispose(); return; }
    const accessories = h.meshes.filter((m) => ACCESSORY.test(m.name));
    h.meshes.filter((m) => !accessories.includes(m)).forEach((m) => m.dispose());
    rig.root.parent = h.root;
    // Parents before children, or the head reads a stale world matrix (the cap used to float above the head).
    const refresh = (n: Node) => { (n as TransformNode).computeWorldMatrix?.(true); n.getChildren().forEach(refresh); };
    refresh(h.root);

    let headY = 1.65;
    if (rig.head) {
      const toLocal = Matrix.Invert(h.root.getWorldMatrix());
      const headLocal = Vector3.TransformCoordinates(rig.head.getAbsolutePosition(), toLocal);
      headY = headLocal.y + 0.12;
      // Move hats and glasses from the primitive head onto the real one, shrunk to a real head's size, then follow its bone.
      const centre = new Vector3(0, headY, 0.02);
      for (const m of accessories) {
        m.position = centre.add(m.position.subtract(new Vector3(0, PRIMITIVE_HEAD_Y, 0)).scale(0.62));
        m.scaling.scaleInPlace(0.62);
        m.setParent(rig.head);
        m.setEnabled(true);
      }
    }
    // Name tag and typing bubble were placed for the taller primitive; sit them just above the real head.
    for (const child of h.root.getChildren()) {
      if (child.name === `${name}-tag`) (child as TransformNode).position.y = headY + 0.42;
    }
    h.meshes.length = 0;
    h.meshes.push(...rig.meshes, ...accessories);
    rig.meshes.forEach((m) => opts.castShadow?.(m));
    animate = rig.animate;
    h.root.onDisposeObservable.addOnce(() => rig.dispose());
    opts.onReady?.({ headY });
  }).catch((err) => {
    if (err instanceof SceneGone || scene.isDisposed) return;
    console.warn('avatar model failed to load; showing the placeholder', err);
    h.meshes.forEach((m) => { if (!m.isDisposed()) m.setEnabled(true); });
  });

  return avatar;
}
