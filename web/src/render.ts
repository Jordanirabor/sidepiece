import {
  AbstractMesh,
  Camera,
  Color3,
  Color4,
  DefaultRenderingPipeline,
  DirectionalLight,
  DynamicTexture,
  Engine,
  FresnelParameters,
  ImageProcessingConfiguration,
  Mesh,
  MeshBuilder,
  MirrorTexture,
  Plane,
  Scene,
  ShadowGenerator,
  StandardMaterial,
  Texture,
  Vector3,
} from '@babylonjs/core';

/**
 * Rendering quality (ADR 0012). `high` adds shadow maps, wet-floor reflections, MSAA and film grain;
 * `low` keeps tone mapping, bloom and FXAA so phones still get the cinematic look at a steady frame rate.
 * Override with `?quality=low|high` (handy for testing and for slow laptops).
 */
export type Quality = 'low' | 'high';

let cachedQuality: Quality | undefined;
export function quality(): Quality {
  if (cachedQuality) return cachedQuality;
  const forced = new URLSearchParams(window.location.search).get('quality');
  if (forced === 'low' || forced === 'high') return (cachedQuality = forced);
  const coarse = window.matchMedia?.('(pointer: coarse)').matches;
  const small = Math.min(window.screen.width, window.screen.height) < 500;
  return (cachedQuality = coarse || small ? 'low' : 'high');
}

/** WebGL engine with a capped pixel ratio: sharp on retina, without rendering 9x the pixels on phones. */
export function createEngine(canvas: HTMLCanvasElement, opts: { preserveDrawingBuffer?: boolean } = {}) {
  const engine = new Engine(canvas, true, { preserveDrawingBuffer: opts.preserveDrawingBuffer ?? false, stencil: true, antialias: true });
  const cap = quality() === 'high' ? 2 : 1.5;
  engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio || 1, cap));
  return engine;
}

/**
 * Dispose a scene + engine and release the WebGL context immediately. Browsers cap live contexts (~16) and
 * evict the oldest, which breaks still-running canvases ("reading 'program'" errors).
 */
export function disposeEngine(engine: Engine, scene?: Scene) {
  const gl = engine._gl as WebGLRenderingContext | null;
  const canvas = engine.getRenderingCanvas();
  scene?.dispose();
  engine.dispose();
  // Only when the canvas has left the page (React runs unmount cleanups after removing it). A canvas that is
  // being rebuilt in place (venue change) gets a new engine on the same context, so losing it would black it out.
  if (canvas && !canvas.isConnected) gl?.getExtension('WEBGL_lose_context')?.loseContext();
}

export type LookOptions = {
  exposure?: number;
  contrast?: number;
  bloomWeight?: number;
  bloomThreshold?: number;
  vignette?: number;
  /** Small canvases (portraits, cards) skip grain and MSAA. */
  compact?: boolean;
};

/** Filmic post-processing: ACES tone mapping, bloom on neon, anti-aliasing and a soft vignette. */
export function applyCinematicLook(scene: Scene, cameras: Camera[], opts: LookOptions = {}) {
  const high = quality() === 'high' && !opts.compact;
  const ip = scene.imageProcessingConfiguration;
  ip.toneMappingEnabled = true;
  ip.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
  ip.exposure = opts.exposure ?? 1.2;
  ip.contrast = opts.contrast ?? 1.15;
  ip.vignetteEnabled = (opts.vignette ?? 1) > 0;
  ip.vignetteWeight = 1.6 * (opts.vignette ?? 1);
  ip.vignetteStretch = 0.4;
  ip.vignetteColor = new Color4(0.02, 0.0, 0.05, 0);
  ip.vignetteBlendMode = ImageProcessingConfiguration.VIGNETTEMODE_MULTIPLY;

  const pipeline = new DefaultRenderingPipeline('cinematic', true, scene, cameras);
  pipeline.samples = high ? 4 : 1;
  pipeline.fxaaEnabled = true;
  pipeline.bloomEnabled = true;
  pipeline.bloomThreshold = opts.bloomThreshold ?? 0.9;
  pipeline.bloomWeight = opts.bloomWeight ?? 0.3;
  pipeline.bloomKernel = high ? 64 : 32;
  pipeline.bloomScale = 0.5;
  pipeline.grainEnabled = high;
  if (high) {
    pipeline.grain.intensity = 5;
    pipeline.grain.animated = true;
  }
  return pipeline;
}

/**
 * Soft key light that casts character shadows (high quality only). Point lights would need six
 * shadow renders each, so one dim directional "moon/key" light does the grounding instead.
 */
export function addKeyShadows(scene: Scene, opts: { direction: Vector3; intensity: number; color: Color3; area: number }) {
  const key = new DirectionalLight('key', opts.direction.normalize(), scene);
  key.intensity = opts.intensity;
  key.diffuse = opts.color;
  key.specular = opts.color.scale(0.5);
  key.position = opts.direction.normalize().scale(-opts.area);
  if (quality() !== 'high') return { key, cast: (_m: AbstractMesh) => {} };
  key.shadowMinZ = 1;
  key.shadowMaxZ = opts.area * 2.5;
  const gen = new ShadowGenerator(1024, key);
  gen.usePercentageCloserFiltering = true;
  gen.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
  gen.bias = 0.0015;
  gen.normalBias = 0.02;
  gen.darkness = 0.35;
  scene.meshes.forEach((m) => { m.receiveShadows = true; });
  scene.onNewMeshAddedObservable.add((m) => { m.receiveShadows = true; });
  return { key, cast: (m: AbstractMesh) => { gen.addShadowCaster(m, true); } };
}

/**
 * Glossy, wet-look floor: a blurred planar reflection of the venue (high quality only). The neon
 * smeared across the floor is most of what makes night scenes read as real.
 */
export function addFloorReflection(scene: Scene, floor: Mesh, mat: StandardMaterial, level: number, y = 0) {
  if (quality() !== 'high') {
    // No mirror on phones: lift the base colour and sheen so dark floors don't go flat black.
    mat.diffuseColor = mat.diffuseColor.scale(1.7);
    mat.specularColor = mat.specularColor.scale(1.6);
    return;
  }
  const mirror = new MirrorTexture(`${floor.name}-mirror`, 1024, scene, true);
  mirror.mirrorPlane = new Plane(0, -1, 0, y);
  mirror.adaptiveBlurKernel = 6;
  mirror.level = level;
  // Fresnel: strong reflections at grazing angles, almost none looking straight down, like a real wet floor.
  const fresnel = new FresnelParameters();
  fresnel.bias = 0.08;
  fresnel.power = 2.5;
  fresnel.leftColor = Color3.Black();
  fresnel.rightColor = Color3.White();
  mat.reflectionFresnelParameters = fresnel;
  const refresh = () => {
    mirror.renderList = scene.meshes.filter((m) => m !== floor && m.isVisible && !m.name.includes('lagoon'));
  };
  refresh();
  scene.onNewMeshAddedObservable.add(() => refresh());
  mat.reflectionTexture = mirror;
}

// ---------- Procedural surface textures (no third-party assets) ----------

type Painter = (ctx: CanvasRenderingContext2D, size: number, rand: () => number) => void;

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Height map → tangent-space normal map (Sobel), so surfaces catch light like real materials. */
function normalFrom(src: HTMLCanvasElement, size: number, strength: number) {
  const h = (src.getContext('2d') as CanvasRenderingContext2D).getImageData(0, 0, size, size).data;
  const dst = canvasOf(size);
  const ctx = dst.getContext('2d') as CanvasRenderingContext2D;
  const out = ctx.createImageData(size, size);
  const at = (x: number, y: number) => h[(((y + size) % size) * size + ((x + size) % size)) * 4] / 255;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      out.data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      out.data[i + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      out.data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      out.data[i + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
  return dst;
}

function canvasOf(size: number) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

// Painted once per page as PNG data URLs. Babylon caches textures by URL, so every material that
// uses a surface shares one GPU texture while keeping its own tiling (uScale/vScale).
const surfaceUrls = new Map<string, { diffuse: string; normal: string }>();

function surfaceUrl(kind: SurfaceKind) {
  const hit = surfaceUrls.get(kind);
  if (hit) return hit;
  const p = painters[kind];
  const albedo = canvasOf(p.size);
  p.paint(albedo.getContext('2d') as CanvasRenderingContext2D, p.size, seeded(kind.length * 7919));
  const height = canvasOf(p.size);
  p.height(height.getContext('2d') as CanvasRenderingContext2D, p.size, seeded(kind.length * 104729));
  const urls = { diffuse: albedo.toDataURL('image/png'), normal: normalFrom(height, p.size, p.strength).toDataURL('image/png') };
  surfaceUrls.set(kind, urls);
  return urls;
}

function tiled(url: string, scene: Scene, name: string, tile: [number, number]) {
  const tex = new Texture(url, scene);
  tex.name = name;
  tex.wrapU = tex.wrapV = Texture.WRAP_ADDRESSMODE;
  tex.uScale = tile[0];
  tex.vScale = tile[1];
  return tex;
}

function speckle(ctx: CanvasRenderingContext2D, size: number, rand: () => number, count: number, alpha: number, light = true) {
  for (let i = 0; i < count; i++) {
    const v = light ? 255 : 0;
    ctx.fillStyle = `rgba(${v},${v},${v},${rand() * alpha})`;
    const r = rand() * 1.6 + 0.3;
    ctx.fillRect(rand() * size, rand() * size, r, r);
  }
}

export type SurfaceKind = 'asphalt' | 'concrete' | 'wood' | 'tile' | 'fabric' | 'plaster';

const painters: Record<SurfaceKind, { size: number; strength: number; paint: Painter; height: Painter }> = {
  asphalt: {
    size: 512, strength: 2.2,
    paint: (ctx, s, r) => { ctx.fillStyle = '#8a8794'; ctx.fillRect(0, 0, s, s); speckle(ctx, s, r, 9000, 0.35, false); speckle(ctx, s, r, 4000, 0.25); },
    height: (ctx, s, r) => { ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, s, s); speckle(ctx, s, r, 14000, 0.6, false); speckle(ctx, s, r, 8000, 0.5); },
  },
  concrete: {
    size: 512, strength: 1.4,
    paint: (ctx, s, r) => {
      ctx.fillStyle = '#9a96a4'; ctx.fillRect(0, 0, s, s); speckle(ctx, s, r, 5000, 0.18, false);
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 2;
      for (let i = 0; i <= 4; i++) { ctx.beginPath(); ctx.moveTo(0, (i * s) / 4); ctx.lineTo(s, (i * s) / 4); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(s / 2, 0); ctx.lineTo(s / 2, s); ctx.stroke();
    },
    height: (ctx, s, r) => {
      ctx.fillStyle = '#909090'; ctx.fillRect(0, 0, s, s); speckle(ctx, s, r, 8000, 0.4, false);
      ctx.fillStyle = '#202020';
      for (let i = 0; i <= 4; i++) ctx.fillRect(0, (i * s) / 4 - 2, s, 4);
      ctx.fillRect(s / 2 - 2, 0, 4, s);
    },
  },
  wood: {
    size: 512, strength: 2.5,
    paint: (ctx, s, r) => {
      const planks = 8;
      for (let p = 0; p < planks; p++) {
        const base = 120 + r() * 50;
        ctx.fillStyle = `rgb(${base},${base * 0.72},${base * 0.5})`;
        ctx.fillRect(0, (p * s) / planks, s, s / planks);
        for (let g = 0; g < 40; g++) {
          ctx.strokeStyle = `rgba(40,20,10,${0.08 + r() * 0.12})`;
          ctx.beginPath();
          const y = (p * s) / planks + r() * (s / planks);
          ctx.moveTo(0, y);
          ctx.bezierCurveTo(s * 0.3, y + r() * 4 - 2, s * 0.6, y + r() * 4 - 2, s, y);
          ctx.stroke();
        }
      }
    },
    height: (ctx, s) => {
      ctx.fillStyle = '#909090'; ctx.fillRect(0, 0, s, s);
      ctx.fillStyle = '#101010';
      for (let p = 0; p <= 8; p++) ctx.fillRect(0, (p * s) / 8 - 2, s, 4);
    },
  },
  tile: {
    size: 512, strength: 2.0,
    paint: (ctx, s, r) => {
      const n = 4;
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const v = 90 + r() * 25;
        ctx.fillStyle = `rgb(${v},${v * 0.95},${v * 1.1})`;
        ctx.fillRect((x * s) / n, (y * s) / n, s / n, s / n);
      }
      ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 4;
      for (let i = 0; i <= n; i++) {
        ctx.beginPath(); ctx.moveTo(0, (i * s) / n); ctx.lineTo(s, (i * s) / n); ctx.stroke();
        ctx.beginPath(); ctx.moveTo((i * s) / n, 0); ctx.lineTo((i * s) / n, s); ctx.stroke();
      }
    },
    height: (ctx, s) => {
      ctx.fillStyle = '#a0a0a0'; ctx.fillRect(0, 0, s, s);
      ctx.fillStyle = '#202020';
      for (let i = 0; i <= 4; i++) { ctx.fillRect(0, (i * s) / 4 - 3, s, 6); ctx.fillRect((i * s) / 4 - 3, 0, 6, s); }
    },
  },
  fabric: {
    size: 256, strength: 1.2,
    paint: (ctx, s, r) => {
      ctx.fillStyle = '#b0b0b0'; ctx.fillRect(0, 0, s, s);
      for (let i = 0; i < s; i += 2) {
        ctx.fillStyle = `rgba(0,0,0,${0.05 + r() * 0.05})`; ctx.fillRect(0, i, s, 1);
        ctx.fillStyle = `rgba(255,255,255,${0.03 + r() * 0.04})`; ctx.fillRect(i, 0, 1, s);
      }
    },
    height: (ctx, s) => {
      ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, s, s);
      for (let i = 0; i < s; i += 2) { ctx.fillStyle = '#606060'; ctx.fillRect(0, i, s, 1); ctx.fillStyle = '#a0a0a0'; ctx.fillRect(i, 0, 1, s); }
    },
  },
  plaster: {
    size: 512, strength: 1.0,
    paint: (ctx, s, r) => { ctx.fillStyle = '#a8a4b0'; ctx.fillRect(0, 0, s, s); speckle(ctx, s, r, 6000, 0.08, false); speckle(ctx, s, r, 3000, 0.06); },
    height: (ctx, s, r) => { ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, s, s); speckle(ctx, s, r, 12000, 0.3, false); speckle(ctx, s, r, 12000, 0.3); },
  },
};

/**
 * Give a material a real surface: tinted albedo + normal map + sensible gloss. `tile` is how many
 * times the pattern repeats per mesh. Low quality keeps the albedo but drops the normal map.
 */
export function applySurface(mat: StandardMaterial, kind: SurfaceKind, tile: [number, number], opts: { gloss?: number; specular?: number } = {}) {
  const scene = mat.getScene();
  const urls = surfaceUrl(kind);
  mat.diffuseTexture = tiled(urls.diffuse, scene, `surface-${kind}-albedo`, tile);
  if (quality() === 'high') mat.bumpTexture = tiled(urls.normal, scene, `surface-${kind}-normal`, tile);
  mat.specularPower = opts.gloss ?? 48;
  mat.specularColor = new Color3(1, 1, 1).scale(opts.specular ?? 0.25);
  return mat;
}

/** Cheap soft contact shadow under a character (every quality tier). */
export function contactShadow(scene: Scene, name: string, radius = 0.42) {
  let tex = scene.getTextureByName('contact-shadow-tex') as DynamicTexture | null;
  if (!tex) {
    tex = new DynamicTexture('contact-shadow-tex', { width: 128, height: 128 }, scene, true);
    const ctx = tex.getContext() as CanvasRenderingContext2D;
    const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
    g.addColorStop(0, 'rgba(0,0,0,0.75)');
    g.addColorStop(0.55, 'rgba(0,0,0,0.35)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    tex.hasAlpha = true;
    tex.update();
  }
  let mat = scene.getMaterialByName('contact-shadow-mat') as StandardMaterial | null;
  if (!mat) {
    mat = new StandardMaterial('contact-shadow-mat', scene);
    mat.diffuseTexture = tex;
    mat.useAlphaFromDiffuseTexture = true;
    mat.disableLighting = true;
    mat.emissiveColor = Color3.Black();
    mat.zOffset = -2;
  }
  const blob = MeshBuilder.CreateGround(name, { width: radius * 2, height: radius * 2 }, scene);
  blob.position.y = 0.012;
  blob.material = mat;
  blob.isPickable = false;
  return blob;
}
