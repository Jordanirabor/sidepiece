// Attach Rocketbox textures to an FBX2glTF output by material name, fix material settings, write GLB.
// Usage: node attach.mjs <in.glb> <texturesDir> <out.glb>
import { NodeIO } from '@gltf-transform/core';
import fs from 'node:fs';
import path from 'node:path';

const [input, texDir, output] = process.argv.slice(2);
const io = new NodeIO();
const doc = await io.read(input);
const root = doc.getRoot();

const load = (file) => {
  const p = path.join(texDir, file);
  if (!fs.existsSync(p)) return null;
  const tex = doc.createTexture(file).setImage(fs.readFileSync(p)).setMimeType('image/png').setURI(file);
  return tex;
};

for (const mat of root.listMaterials()) {
  const name = mat.getName(); // e.g. f022_body, f022_head, f022_opacity
  const part = name.split('_').slice(1).join('_');
  mat.setMetallicFactor(0);
  if (part === 'opacity') {
    // Hair, lashes and brows are alpha cards.
    mat.setBaseColorTexture(load(`${name}_color.png`));
    mat.setNormalTexture(null);
    mat.setAlphaMode('MASK').setAlphaCutoff(0.4).setDoubleSided(true);
    mat.setRoughnessFactor(0.55);
  } else {
    mat.setBaseColorTexture(load(`${name}_color.png`));
    mat.setNormalTexture(load(`${name}_normal.png`));
    mat.setAlphaMode('OPAQUE');
    mat.setRoughnessFactor(part === 'head' ? 0.5 : 0.7);
  }
  mat.setBaseColorFactor([1, 1, 1, 1]);
}

// FBX2glTF placeholder textures (1x1, unnamed images) are now unused.
for (const tex of root.listTextures()) {
  if (tex.listParents().length <= 1) tex.dispose();
}
// Vertex colours from 3ds Max exports tint the model; drop them.
for (const mesh of root.listMeshes()) {
  for (const prim of mesh.listPrimitives()) {
    const c = prim.getAttribute('COLOR_0');
    if (c) { prim.setAttribute('COLOR_0', null); if (c.listParents().length <= 1) c.dispose(); }
  }
}
// Empty animations from the export.
for (const anim of root.listAnimations()) if (anim.listChannels().length === 0) anim.dispose();

await io.write(output, doc);
console.log('wrote', output, fs.statSync(output).size);
