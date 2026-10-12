// Post-processes the Blender export (build_city.py) for the web: welds and quantizes geometry (KHR_mesh_quantization,
// which Babylon reads natively), dedups textures and makes palm fronds alpha-tested instead of blended.
// Usage: TOOLS=<dir with @gltf-transform/{core,extensions,functions}> node scripts/blender/pack.mjs <in.glb> [out.glb]
import { createRequire } from 'node:module';
import path from 'node:path';

const TOOLS = process.env.TOOLS;
if (!TOOLS) throw new Error('set TOOLS to a dir with @gltf-transform/{core,extensions,functions} installed (see README)');
const req = createRequire(path.join(TOOLS, 'package.json'));
const { NodeIO } = await import(req.resolve('@gltf-transform/core'));
const { ALL_EXTENSIONS } = await import(req.resolve('@gltf-transform/extensions'));
const { dedup, prune, quantize, weld } = await import(req.resolve('@gltf-transform/functions'));

const [input, output = input] = process.argv.slice(2);
if (!input) throw new Error('usage: pack.mjs <in.glb> [out.glb]');
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(input);
for (const m of doc.getRoot().listMaterials()) {
  // Palm fronds and bush leaves: cut-outs, not sorted transparency (cheaper, and no sorting pops between instances).
  if (m.getAlphaMode() === 'BLEND' && /frond|leaves/.test(m.getName())) m.setAlphaMode('MASK').setAlphaCutoff(0.5);
}
await doc.transform(dedup(), weld(), quantize({ quantizePosition: 16, quantizeNormal: 10, quantizeTexcoord: 14 }), prune());
await io.write(output, doc);
console.log('packed', output);
