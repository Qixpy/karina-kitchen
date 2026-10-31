import {access} from 'node:fs/promises';
import {SERIES,TYPES} from '../dist/catalog.js';
import {SURFACES} from '../dist/surfaces.js';
for(const path of ['index.html','catalog-store.js','catalog-finish-samples.js','catalog-ui.js','quote.js','projects.js','vendor/pdf-lib.min.js','style.css','app.js','editor-scene.js','editor-state.js','walls.js','collision.js','vendor/three.module.js','vendor/OrbitControls.js','vendor/TransformControls.js',...SERIES.flatMap(s=>s.finishes.filter(f=>f.available!==false).map(f=>f.image)),...SURFACES.map(s=>s.image)])await access(new URL('../dist/'+path,import.meta.url));
if(!TYPES.length)throw Error('Cabinet library is empty');
console.log(`Static app ready: ${TYPES.length} item types, ${SERIES.reduce((n,s)=>n+s.finishes.length,0)} finish entries, ${SURFACES.length} linked surfaces.`);
