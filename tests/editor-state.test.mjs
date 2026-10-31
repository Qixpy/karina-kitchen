import test from 'node:test';
import assert from 'node:assert/strict';
import {History,normalizeDesign,transformFollowers,validFinish} from '../dist/editor-state.js';
import {SERIES,TYPES} from '../dist/catalog.js';
import {SURFACES} from '../dist/surfaces.js';
import {DEFAULT_ITEMS} from '../dist/editor-scene.js';
const initial={version:1,name:'Test',items:DEFAULT_ITEMS,surfaceId:SURFACES[0].id};
test('default design roundtrips without losing layout and surface metadata',()=>{const loaded=normalizeDesign(JSON.parse(JSON.stringify(initial)),SERIES,TYPES,SURFACES);for(let n=0;n<loaded.items.length;n++){const a=loaded.items[n],b=DEFAULT_ITEMS[n];assert.equal(a.id,b.id);assert.equal(a.x,b.x);assert.equal(a.frontInsetLeft,b.frontInsetLeft);assert.equal(a.countertop,b.countertop);assert.equal(a.followsId,b.followsId)}assert.equal(loaded.items.length,DEFAULT_ITEMS.length)});
test('finishes cannot cross series boundaries and unavailable choices are rejected',()=>{for(const s of SERIES){for(const other of SERIES){const f=validFinish(s,other.finishes.at(-1).id);assert(s.finishes.includes(f));assert.notEqual(f.available,false)}}const luna=SERIES.find(s=>s.id==='luna');assert.notEqual(validFinish(luna,'ocean-blue').id,'ocean-blue')});
test('imports reject unknown types and non-design objects',()=>{assert.throws(()=>normalizeDesign({},SERIES,TYPES,SURFACES));assert.throws(()=>normalizeDesign({...initial,items:[{typeId:'bogus'}]},SERIES,TYPES,SURFACES));assert.throws(()=>normalizeDesign({...initial,items:Array(251).fill(DEFAULT_ITEMS[0])},SERIES,TYPES,SURFACES))});
test('imports sanitize dimensions, poses, names and unexpected fields',()=>{const loaded=normalizeDesign({...initial,items:[{...DEFAULT_ITEMS[0],width:-20,height:Infinity,x:999,evil:'value'}]},SERIES,TYPES,SURFACES);assert.equal(loaded.items[0].width,.01);assert.equal(loaded.items[0].x,20);assert(Number.isFinite(loaded.items[0].height));assert.equal(loaded.items[0].evil,undefined)});
test('rotation moves island attachments about the island centre',()=>{const before={id:'island',x:1,z:2,rotation:0},after={...before,x:2,z:3,rotation:90};const moved=transformFollowers([{id:'stool',x:2,z:2,rotation:0,followsId:'island'}],before,after)[0];assert(Math.abs(moved.x-2)<1e-8);assert(Math.abs(moved.z-2)<1e-8);assert.equal(moved.rotation,90)});
test('undo redo keep independent snapshots and discard future after a new change',()=>{const h=new History({n:0});const v={n:1};h.push(v);v.n=99;assert.deepEqual(h.undo(),{n:0});assert.deepEqual(h.redo(),{n:1});h.undo();h.push({n:2});assert.equal(h.redo(),null);assert.equal(h.current.n,2)});

test('legacy designs acquire the original editable shell once without changing cabinet choices',()=>{
 const cabinet={...DEFAULT_ITEMS[0],id:'wall-left',finishId:'nocce-3',rotation:71};
 const migrated=normalizeDesign({version:1,items:[cabinet],surfaceId:SURFACES[2].id},SERIES,TYPES,SURFACES);
 assert.equal(migrated.version,3);assert.equal(migrated.items.length,4);assert.equal(new Set(migrated.items.map(i=>i.id)).size,4);
 assert.equal(migrated.items[0].rotation,71);assert.equal(migrated.items[0].finishId,'nocce-3');assert.equal(migrated.surfaceId,SURFACES[2].id);
 assert.equal(migrated.items.filter(i=>i.typeId==='room-wall').length,3);
 assert.equal(normalizeDesign(migrated,SERIES,TYPES,SURFACES).items.length,4);
});

test('deleted walls stay deleted through autosave, export and import normalization',()=>{
 const next={version:2,items:DEFAULT_ITEMS.filter(i=>i.typeId!=='room-wall'),surfaceId:SURFACES[0].id};
 const loaded=normalizeDesign(JSON.parse(JSON.stringify(next)),SERIES,TYPES,SURFACES);
 assert.equal(loaded.items.filter(i=>i.typeId==='room-wall').length,0);
 const h=new History({...next,items:DEFAULT_ITEMS});h.push(loaded);
 assert.equal(h.undo().items.filter(i=>i.typeId==='room-wall').length,3);
 assert.equal(h.redo().items.filter(i=>i.typeId==='room-wall').length,0);
});

test('wall dimensions have independent bounds while cabinet limits remain unchanged',()=>{
 const wall=DEFAULT_ITEMS.find(i=>i.typeId==='room-wall'),base=DEFAULT_ITEMS[0];
 const loaded=normalizeDesign({version:2,items:[{...wall,width:50,height:10,depth:3},{...base,width:50,height:10,depth:3}]},SERIES,TYPES,SURFACES);
 assert.deepEqual(loaded.items.map(({width,height,depth})=>[width,height,depth]),[[20,6,1],[6,4,3]]);
 const minimum=normalizeDesign({version:2,items:[{...wall,width:-3,height:-1,depth:-2}]},SERIES,TYPES,SURFACES).items[0];
 assert.deepEqual([minimum.width,minimum.height,minimum.depth],[.1,.1,.05]);
});
