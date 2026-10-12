// Downloads the Poly Haven CC0 textures and models that `build_city.py` uses (city and venue interiors) into scripts/blender/.cache (not committed).
// Node built-ins only. Re-running skips files whose md5 already matches. Usage: node scripts/blender/fetch.mjs
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CACHE = path.join(path.dirname(fileURLToPath(import.meta.url)), '.cache');
const RES = '1k';

/** Surface textures: albedo, OpenGL normal and roughness. Keep in sync with `TEXTURES` in build_city.py. */
export const TEXTURES = [
  'asphalt_02', 'herringbone_pavement_03', 'brushed_concrete', 'white_stucco', 'painted_plaster_wall', 'beige_wall_001',
  'grey_roof_tiles', 'clay_roof_tiles_02', 'rectangular_facade_tiles', 'concrete_tile_facade', 'painted_metal_shutter',
  'box_profile_metal_sheet', 'leafy_grass', 'coast_sand_01', 'large_grey_tiles', 'wood_floor_deck', 'palm_tree_bark',
  'concrete_pavement', 'terrazzo_tiles', 'black_walnut_veneer_01', 'marble_01', 'leather_red_02', 'leather_white',
  'dark_wooden_planks',
];
/** Props placed around the city (glTF + textures). */
export const MODELS = [
  'street_lamp_01', 'exterior_aircon_unit', 'portable_generator', 'metal_trash_can', 'plastic_monobloc_chair_01',
  'potted_plant_02', 'concrete_road_barrier', 'sofa_02', 'bar_chair_round_01', 'mid_century_lounge_chair',
  'modern_ceiling_lamp_01', 'outdoor_table_chair_set_01',
];

const json = async (url) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json();
};
const md5 = (file) => crypto.createHash('md5').update(fs.readFileSync(file)).digest('hex');
async function download(url, file, sum) {
  if (fs.existsSync(file) && (!sum || md5(file) === sum)) return false;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
  if (sum && md5(file) !== sum) throw new Error(`${url}: md5 mismatch`);
  return true;
}

let fetched = 0;
for (const id of TEXTURES) {
  const files = await json(`https://api.polyhaven.com/files/${id}`);
  for (const [map, key] of [['diff', 'Diffuse'], ['nor_gl', 'nor_gl'], ['rough', 'Rough']]) {
    // Some textures ship colour variants (`coll1`, `coll2`) instead of one diffuse map: take the first.
    const f = (files[key] ?? (key === 'Diffuse' ? files.coll1 : undefined))?.[RES]?.jpg;
    if (!f) throw new Error(`${id} has no ${key} ${RES} jpg`);
    if (await download(f.url, path.join(CACHE, 'textures', id, `${map}.jpg`), f.md5)) fetched++;
  }
}
for (const id of MODELS) {
  const files = await json(`https://api.polyhaven.com/files/${id}`);
  const g = files.gltf?.[RES]?.gltf;
  if (!g) throw new Error(`${id} has no ${RES} glTF`);
  const dir = path.join(CACHE, 'models', id);
  if (await download(g.url, path.join(dir, `${id}.gltf`), g.md5)) fetched++;
  for (const [rel, inc] of Object.entries(g.include)) if (await download(inc.url, path.join(dir, rel), inc.md5)) fetched++;
}
console.log(`poly haven: ${TEXTURES.length} textures, ${MODELS.length} models in ${CACHE} (${fetched} downloaded)`);
