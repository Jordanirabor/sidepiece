// Quaternius Ultimate Modular Men/Women (CC0) → one GLB per body in web/public/characters/ (ADR 0017).
// Keeps the modular parts we offer in the creator plus the social animations, then dedups, quantizes and
// resamples. Every part is skinned to the same 62-bone armature, so the client shows one head/body/legs/feet set
// per character and hides the rest. See README.md for the inputs and how to run it.
import { createRequire } from 'node:module';
import path from 'node:path';

const TOOLS = process.env.TOOLS;
if (!TOOLS) throw new Error('set TOOLS to a dir with @gltf-transform/{core,extensions,functions} installed (see README)');
const req = createRequire(path.join(TOOLS, 'package.json'));
const { NodeIO } = await import(req.resolve('@gltf-transform/core'));
const { ALL_EXTENSIONS } = await import(req.resolve('@gltf-transform/extensions'));
const { dedup, prune, quantize, resample, weld } = await import(req.resolve('@gltf-transform/functions'));

const [input, output, body] = process.argv.slice(2);
if (!input || !output || !['male', 'female'].includes(body)) throw new Error('usage: build.mjs <in.glb> <out.glb> male|female');

/** Outfit sets kept per body. Costume, uniform and fantasy sets (soldier, sci-fi, medieval, king…) are dropped. */
const KEEP = {
  male: ['Casual', 'Casual2', 'Beach', 'Suit', 'Punk', 'Worker', 'Farmer', 'Adventurer'],
  female: ['Casual', 'Formal', 'Suit', 'Punk', 'Worker', 'Adventurer'],
}[body];
const PARTS = ['Head', 'Body', 'Legs', 'Pants', 'Feet'];
const ANIMS = ['Idle', 'Idle_Neutral', 'Walk', 'Run', 'Wave', 'Interact'];

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(input);
const root = doc.getRoot();

// The women's file misspells one head; normalise so the client can rely on `<Set>_<Part>`.
const rename = { Formad_Head: 'Formal_Head', Farmer_Pants: 'Farmer_Legs' };
let kept = 0;
for (const node of root.listNodes()) {
  if (!node.getMesh()) continue;
  const name = rename[node.getName()] ?? node.getName();
  node.setName(name);
  const [set, part] = name.split('_');
  if (KEEP.includes(set) && PARTS.includes(part)) { kept++; continue; }
  node.dispose();
}

for (const anim of root.listAnimations()) {
  const short = anim.getName().split('|').pop();
  if (ANIMS.includes(short)) anim.setName(short);
  else anim.dispose();
}

await doc.transform(
  prune(),
  dedup(), // shared materials are fine: the client clones them per character before recolouring
  weld(),
  resample({ tolerance: 0.0005 }),
  quantize({ quantizePosition: 14, quantizeNormal: 10 }),
  prune(),
);

await io.write(output, doc);
console.log(`${body}: ${kept} parts, ${root.listAnimations().map((a) => a.getName()).join(' ')}`);
