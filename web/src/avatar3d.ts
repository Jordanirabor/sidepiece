import '@babylonjs/loaders/glTF';
import {
  AbstractMesh,
  AnimationGroup,
  AssetContainer,
  Color3,
  LoadAssetContainerAsync,
  Matrix,
  Node,
  PBRMaterial,
  Scene,
  TransformNode,
  Vector3,
} from '@babylonjs/core';
import { findItem, hexRgb, Look, TOPS } from './look';
import { quality } from './render';
import { makeHumanoid } from './venue';

/**
 * Semi-realistic characters (ADR 0012 phase 2): Microsoft Rocketbox avatars (MIT, see
 * `public/avatars/LICENSE-rocketbox.md`), converted to compressed glTF. `AvatarLook` picks the closest base
 * model and then tints and scales it. The primitive humanoid shows while the model loads, and stays if it fails.
 */
type Base = { id: string; gender: 'female' | 'male'; skin: number; tops: string[] };

/** `skin` uses the same 0 (deep) to 1 (light) scale as `look.skin_tone`. `tops` are the `TOPS` kinds the outfit reads as. */
export const BASE_MODELS: Base[] = [
  { id: 'business_female_01', gender: 'female', skin: 0.12, tops: ['blazer', 'shirt', 'jacket'] },
  { id: 'female_party_02', gender: 'female', skin: 0.38, tops: ['dress', 'tee'] },
  { id: 'female_adult_03', gender: 'female', skin: 0.72, tops: ['cami', 'dress'] },
  { id: 'female_party_01', gender: 'female', skin: 0.95, tops: ['cami', 'tee'] },
  { id: 'male_adult_18', gender: 'male', skin: 0.05, tops: ['tee', 'jacket'] },
  { id: 'male_adult_12', gender: 'male', skin: 0.12, tops: ['jacket', 'shirt'] },
  { id: 'business_male_05', gender: 'male', skin: 0.36, tops: ['blazer', 'shirt'] },
  { id: 'male_adult_04', gender: 'male', skin: 0.48, tops: ['jacket', 'tee'] },
  { id: 'male_adult_06', gender: 'male', skin: 0.9, tops: ['tee', 'shirt', 'cami'] },
];

export function pickBase(look: Look): Base {
  const gender = look.gender === 'non_binary' ? (look.hair_length > 0.5 ? 'female' : 'male') : look.gender === 'female' ? 'female' : 'male';
  const kind = findItem(TOPS, look.top).kind;
  let best = BASE_MODELS[0];
  let bestScore = Infinity;
  for (const b of BASE_MODELS) {
    if (b.gender !== gender) continue;
    const score = Math.abs(b.skin - look.skin_tone) * 3 + (b.tops.includes(kind) ? 0 : 0.35);
    if (score < bestScore) { best = b; bestScore = score; }
  }
  return best;
}

const ASSET_ROOT = '/avatars/';
const containers = new WeakMap<Scene, Map<string, Promise<AssetContainer>>>();

function load(scene: Scene, file: string) {
  let perScene = containers.get(scene);
  if (!perScene) { perScene = new Map(); containers.set(scene, perScene); }
  let hit = perScene.get(file);
  if (!hit) {
    hit = LoadAssetContainerAsync(ASSET_ROOT + file, scene);
    perScene.set(file, hit);
  }
  return hit;
}

type Rig = {
  root: TransformNode;
  meshes: AbstractMesh[];
  head?: TransformNode;
  animate: (moving: boolean, dt: number) => void;
  dispose: () => void;
};

let rigCount = 0;
class SceneGone extends Error {}

/** `lite` uses 512px textures (a quarter of the GPU memory): phones and portrait canvases. */
async function loadRig(scene: Scene, look: Look, lite: boolean): Promise<Rig> {
  const base = pickBase(look);
  const g = base.gender === 'female' ? 'f' : 'm';
  const [model, idleC, walkC] = await Promise.all([load(scene, `${lite ? '512/' : ''}${base.id}.glb`), load(scene, `anims/${g}_idle.glb`), load(scene, `anims/${g}_walk.glb`)]);
  // Previews rebuild their scene on every creator change; don't instantiate into one that's already gone.
  if (scene.isDisposed) throw new SceneGone();
  const prefix = `rig${rigCount++}:`;
  const entries = model.instantiateModelsToScene((n) => prefix + n, true, { doNotInstantiate: true });
  const gltfRoot = entries.rootNodes[0] as TransformNode;

  // Body type: a wrapper node, because the glTF root carries the handedness flip in its scaling.
  const fit = new TransformNode(`${prefix}fit`, scene);
  const width = 0.94 + look.body_type * 0.14;
  fit.scaling = new Vector3(width, 1, width);
  gltfRoot.parent = fit;

  const byName = new Map<string, Node>();
  for (const n of gltfRoot.getDescendants(false)) byName.set(n.name.startsWith(prefix) ? n.name.slice(prefix.length) : n.name, n);
  const head = byName.get('Bip01 Head') as TransformNode | undefined;

  // Face pads: subtle head proportions. Biped bones run along local X, so X is face length.
  const [fx, fy, gx, gy] = look.face;
  if (head) head.scaling = new Vector3(1 + fy * 0.035, 1 + fx * 0.035 + gy * 0.015, 1 + fx * 0.035 + gx * 0.015);

  const meshes = gltfRoot.getChildMeshes(false);
  const hair = Color3.FromArray(hexRgb(look.hair_color));
  for (const m of meshes) {
    const mat = m.material;
    if (mat instanceof PBRMaterial) {
      // Match StandardMaterial lighting: our venue lights use `range`, not physical falloff (AGENTS.md gotcha).
      mat.usePhysicalLightFalloff = false;
      mat.maxSimultaneousLights = quality() === 'high' ? 12 : 6;
      if (mat.name.includes('opacity')) mat.albedoColor = Color3.Lerp(Color3.White(), hair.scale(1.5), 0.55);
    }
    m.isPickable = false;
  }

  // Rocketbox animations share the Biped skeleton, so retarget by bone name. Animation files also carry
  // helper bones (footsteps, nubs) that the avatars don't have; skip those tracks.
  const retarget = (c: AssetContainer, name: string) => {
    const src = c.animationGroups[0];
    if (!src) return undefined;
    const group = new AnimationGroup(`${prefix}${name}`, scene);
    for (const ta of src.targetedAnimations) {
      const target = byName.get((ta.target as Node).name);
      if (target) group.addTargetedAnimation(ta.animation, target);
    }
    return group;
  };
  const idle = retarget(idleC, 'idle');
  const walk = retarget(walkC, 'walk');
  idle?.start(true);
  walk?.start(true, 1.7);
  let w = 0;
  const weigh = (group: AnimationGroup | undefined, value: number) => group?.setWeightForAllAnimatables(value);
  weigh(idle, 1);
  weigh(walk, 0);

  return {
    root: fit,
    meshes,
    head,
    animate: (moving, dt) => {
      w += ((moving ? 1 : 0) - w) * Math.min(1, dt * 8);
      weigh(idle, 1 - w);
      weigh(walk, w);
    },
    dispose: () => {
      idle?.dispose();
      walk?.dispose();
      fit.dispose(false, true);
    },
  };
}

const ACCESSORY = /-(brim|crown|cap|peak|lens-.*|tint-.*)$/;
const PRIMITIVE_HEAD_Y = 1.82;

/**
 * Same contract as `makeHumanoid` (root, ring, meshes, animateWalk), so callers don't change. Starts as the
 * primitive humanoid and swaps in the glTF character when it has loaded.
 */
export function makeAvatar(
  scene: Scene, name: string, look: Look, accent: Color3, label?: string, labelColor?: string,
  opts: { castShadow?: (m: AbstractMesh) => void; onReady?: (info: { headY: number }) => void; lite?: boolean } = {},
) {
  const h = makeHumanoid(scene, name, look, accent, label, labelColor);
  let animate = h.animateWalk;
  const avatar = { ...h, animateWalk: (moving: boolean, dt: number) => animate(moving, dt) };

  loadRig(scene, look, opts.lite ?? quality() === 'low').then((rig) => {
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
      headY = headLocal.y + 0.06;
      // Move hats and glasses from the primitive head onto the real one, shrunk to a real head's size (~15cm wide), then follow its bone.
      const centre = new Vector3(0, headY, 0.015);
      for (const m of accessories) {
        m.position = centre.add(m.position.subtract(new Vector3(0, PRIMITIVE_HEAD_Y, 0)).scale(0.5));
        m.scaling.scaleInPlace(0.5);
        m.setParent(rig.head);
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
    console.warn('avatar model failed to load; keeping the placeholder', err);
  });

  return avatar;
}
