// Kenney city kits (CC0) → web/public/world/kit.glb (ADR 0017). Every chosen model becomes one top-level node named
// after its file (`building-a`, `road-straight`, `sedan`…), already scaled to metres, in a single scene that shares
// the kits' palette textures. The client loads the file once and places instances of those nodes. See README.md.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const TOOLS = process.env.TOOLS;
if (!TOOLS) throw new Error('set TOOLS to a dir with @gltf-transform/{core,extensions,functions} installed (see README)');
const req = createRequire(path.join(TOOLS, 'package.json'));
const { NodeIO } = await import(req.resolve('@gltf-transform/core'));
const { ALL_EXTENSIONS } = await import(req.resolve('@gltf-transform/extensions'));
const { dedup, mergeDocuments, prune, quantize, weld, unpartition } = await import(req.resolve('@gltf-transform/functions'));

const [kenney, output] = process.argv.slice(2);
if (!kenney || !output) throw new Error('usage: build.mjs <dir with unzipped kenney kits> <out.glb>');

// Kenney's city kits are built on a 1-unit tile: two lanes plus sidewalks. ×11 makes that a real 11 m street, with
// 6.6 m street lights, 2-storey houses and ~32 m towers (city.ts uses the same 11 m grid).
// The car kit is closer to real scale; ×1.8 makes a sedan ~4.6 m long.
const range = (prefix, from, to) => Array.from({ length: to.charCodeAt(0) - from.charCodeAt(0) + 1 }, (_, i) => prefix + String.fromCharCode(from.charCodeAt(0) + i));
const KITS = [
  {
    dir: 'kenney_city-kit-commercial_2.1', scale: 11,
    models: [...range('building-', 'a', 'n'), ...range('building-skyscraper-', 'a', 'e'), 'detail-awning', 'detail-awning-wide', 'detail-parasol-a', 'detail-parasol-b', 'detail-overhang', 'detail-overhang-wide'],
  },
  {
    dir: 'kenney_city-kit-suburban_20', scale: 11,
    models: [...range('building-type-', 'a', 'u'), 'fence', 'fence-low', 'fence-1x3', 'planter', 'tree-large', 'tree-small', 'path-long', 'path-short', 'driveway-long', 'driveway-short'],
  },
  {
    dir: 'kenney_city-kit-roads', scale: 11,
    models: ['road-straight', 'road-crossroad', 'road-intersection', 'road-bend', 'road-crossing', 'road-end-round', 'road-roundabout', 'road-side', 'road-bridge', 'bridge-pillar-wide',
      'tile-low', 'tile-high', 'light-square', 'light-square-double', 'light-curved', 'traffic-light', 'road-sign-street', 'construction-cone'],
  },
  {
    dir: 'kenney_car-kit', scale: 1.8,
    models: ['sedan', 'taxi', 'suv', 'suv-luxury', 'van', 'hatchback-sports', 'sedan-sports', 'delivery', 'police'],
  },
];

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(path.join(kenney, KITS[0].dir, 'Models/GLB format', `${KITS[0].models[0]}.glb`));
const root = doc.getRoot();
root.listScenes().forEach((s) => s.dispose());
root.listNodes().forEach((n) => n.dispose());
const scene = doc.createScene('kit');
root.setDefaultScene(scene);

let count = 0;
for (const kit of KITS) {
  for (const model of kit.models) {
    const file = path.join(kenney, kit.dir, 'Models/GLB format', `${model}.glb`);
    if (!fs.existsSync(file)) throw new Error(`missing ${file}`);
    const src = await io.read(file);
    const map = mergeDocuments(doc, src);
    const holder = doc.createNode(model).setScale([kit.scale, kit.scale, kit.scale]);
    for (const s of src.getRoot().listScenes()) {
      const merged = map.get(s);
      for (const child of merged.listChildren()) holder.addChild(child);
      merged.dispose();
    }
    scene.addChild(holder);
    count++;
  }
}

await doc.transform(dedup(), weld(), quantize({ quantizePosition: 14, quantizeNormal: 8, quantizeTexcoord: 12 }), unpartition(), prune());
await io.write(output, doc);
console.log(`kit: ${count} models, ${root.listTextures().length} textures, ${root.listMaterials().length} materials`);
