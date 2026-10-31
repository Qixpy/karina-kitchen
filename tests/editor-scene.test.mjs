import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import { createEditorScene, DEFAULT_ITEMS } from '../dist/editor-scene.js';
import { SERIES, TYPES } from '../dist/catalog.js';
import { SURFACES } from '../dist/surfaces.js';

function runtime({pending={}}={}) {
  const loaded=[];
  class Loader {
    async loadAsync(url) {
      if(pending[url]) await pending[url];
      const tx=new THREE.Texture();tx.userData.source=url;loaded.push(tx);return tx;
    }
  }
  return {T:{...THREE,TextureLoader:Loader},loaded};
}
async function setup(options={}) {
  const env=runtime(options),scene=new THREE.Scene();
  const api=await createEditorScene(env.T,scene,{catalog:{SERIES},TYPES});
  return {...env,scene,api};
}
const fronts=object=>{const found=[];object.traverse(o=>{if(o.userData.front)found.push(o.userData.front)});return found};
const meshes=object=>{const found=[];object.traverse(o=>{if(o.isMesh)found.push(o)});return found};
const itemFor=(type,extra={})=>({id:type.id,typeId:type.id,seriesId:'catalina',finishId:'nocce-3',x:0,z:0,y:type.defaultY||0,rotation:0,width:type.width,height:type.height,depth:type.depth,...extra});

 test('defaults keep the spacious angled plan, tall cabinets, island and four independent stools',async()=>{
  const {api}=await setup();await api.rebuild(DEFAULT_ITEMS,{surface:SURFACES[0]});
  assert.equal(api.objects.size,DEFAULT_ITEMS.length);
  assert.equal(DEFAULT_ITEMS.filter(i=>i.typeId==='stool').length,4);
  const island=api.objects.get('island-main');
  assert.equal(island.item.width,3.9);assert.equal(island.item.depth,1.15);
  assert.equal(island.object.position.x,.55);assert.equal(island.object.position.z,2.12);
  assert.ok(Math.abs(island.object.rotation.y-10*Math.PI/180)<1e-12);
  assert.equal(api.objects.get('oven-left').item.height,3.35);
  const angle=(seg)=>Math.atan2(seg.b[1]-seg.a[1],seg.b[0]-seg.a[0])*180/Math.PI;
  assert.ok(Math.abs(angle(api.wallSegments[0])+30.5)<1e-10);
  assert.ok(Math.abs(angle(api.wallSegments[2])-29.9)<1e-10);
  assert.deepEqual(api.lights.map(l=>l.intensity).sort((a,b)=>a-b),[.3,.3,.45,.45,.45,.45,3,3]);
  for(const mesh of api.pickables())assert.ok(api.objects.has(mesh.userData.itemId));
  api.dispose();
});

test('every catalog type builds finite, selectable geometry at its actual dimensions',async()=>{
  const {api}=await setup();const items=TYPES.map((t,i)=>itemFor(t,{x:i*2}));await api.rebuild(items);
  assert.equal(api.objects.size,TYPES.length);
  for(const type of TYPES){
    const entry=api.objects.get(type.id);assert.ok(entry,`${type.id} is built`);
    assert.equal(entry.item.width,type.width,`${type.id} width`);assert.equal(entry.item.height,type.height,`${type.id} height`);assert.equal(entry.item.depth,type.depth,`${type.id} depth`);
    const pieces=meshes(entry.object);assert.ok(pieces.length>0,`${type.id} has geometry`);
    for(const piece of pieces){for(const n of piece.geometry.attributes.position.array)assert.ok(Number.isFinite(n),`${type.id} has finite vertices`);assert.equal(piece.userData.itemId,type.id)}
  }
  api.dispose();
});

test('drawer conversion changes actual drawer-front count and door styles change frame geometry',async()=>{
  const {api}=await setup();
  for(const id of ['drawer-single','drawer-double','drawer-triple','drawer-four']){
    const type=TYPES.find(t=>t.id===id);await api.rebuild([itemFor(type)]);
    const f=fronts(api.objects.get(id).object);assert.equal(f.filter(x=>x.role==='drawer-front').length,type.drawers,id);assert.equal(f.filter(x=>x.role==='door-front').length,0,id);
  }
  const frameWidths={};
  for(const series of SERIES){
    const finish=series.finishes.find(f=>f.available!==false);const t=TYPES.find(t=>t.id==='base-single-door');await api.rebuild([itemFor(t,{id:'profile',seriesId:series.id,finishId:finish.id})]);
    const front=fronts(api.objects.get('profile').object).find(f=>f.role==='door-front');assert.equal(front.profile,series.profile);frameWidths[series.id]=front.frameWidth;
  }
  assert.equal(frameWidths.catalina,0);assert.ok(frameWidths.tuscany>frameWidths.luna);assert.ok(frameWidths.luna>0);
  api.dispose();
});

test('wall drawers, wine storage and oven variants are visibly distinct models',async()=>{
  const {api}=await setup();
  await api.rebuild([itemFor(TYPES.find(t=>t.id==='wall-drawer'))]);assert.equal(fronts(api.objects.get('wall-drawer').object).filter(f=>f.role==='drawer-front').length,1);
  for(const id of ['wine-cube','wine-column']){await api.rebuild([itemFor(TYPES.find(t=>t.id===id))]);assert.ok(meshes(api.objects.get(id).object).length>8);assert.equal(fronts(api.objects.get(id).object).length,0)}
  for(const [id,count] of [['single-oven-tower',1],['oven-tower',2],['oven-microwave-tower',2],['wall-microwave',1],['base-oven',1]]){
    await api.rebuild([itemFor(TYPES.find(t=>t.id===id))]);let actual=0;api.objects.get(id).object.traverse(o=>{if(o.userData.applianceFront)actual++});assert.equal(actual,count,id);
  }
  api.dispose();
});

test('official finish textures and supplied surface UVs are used without recoloring other items',async()=>{
  const {api}=await setup();const a={...DEFAULT_ITEMS.find(i=>i.id==='base-right-1'),id:'a'},b={...a,id:'b',x:a.x+2};await api.rebuild([a,b]);
  const original=meshes(api.objects.get('b').object).find(m=>m.material.map&&m.material!==api.materials.stone).material;
  assert.equal(original.map.userData.source,'assets/fabuwood/nocce-3.jpg');assert.deepEqual(original.map.offset.toArray(),[.06,.04]);assert.deepEqual(original.map.repeat.toArray(),[.88,.65]);
  await api.rebuild([{...a,finishId:'agua-marina'},b]);const unchanged=meshes(api.objects.get('b').object).find(m=>m.material.map&&m.material!==api.materials.stone).material;
  assert.equal(unchanged,original);
  const surfaces=api.pickables().filter(m=>m.material===api.materials.stone);assert.ok(surfaces.length>=4,'each top and backsplash shares the stone material');
  await api.setSurface(SURFACES[1]);assert.equal(api.materials.stone.map.userData.source,SURFACES[1].image);assert.deepEqual(api.materials.stone.map.repeat.toArray(),SURFACES[1].repeat);assert.deepEqual(api.materials.stone.map.offset.toArray(),SURFACES[1].offset);surfaces.forEach(m=>assert.equal(m.material,api.materials.stone));
  api.dispose();
});

test('island sink is a genuine opening and its basin and faucet move with the island',async()=>{
  const {api}=await setup();await api.rebuild([DEFAULT_ITEMS.find(i=>i.id==='island-main')]);
  const entry=api.objects.get('island-main'),local=entry.object.userData.sinkLocal;assert.ok(local);
  entry.object.position.set(1.4,0,3.1);entry.object.rotation.y=.65;entry.object.updateMatrixWorld(true);
  const sink=new THREE.Vector3(local.x,local.y,local.z);entry.object.localToWorld(sink);
  const ray=new THREE.Raycaster(new THREE.Vector3(sink.x,2,sink.z),new THREE.Vector3(0,-1,0));const hit=ray.intersectObjects(entry.object.children,true)[0];assert.ok(hit);assert.notEqual(hit.object.material,api.materials.stone);assert.ok(hit.point.y<.9,'ray enters the basin rather than a solid top');
  const c=api.getColliders().find(c=>c.itemId==='island-main');assert.ok(Math.abs(c.cx-(1.4+Math.sin(.65)*.09))<1e-10);assert.equal(c.rotation,.65);assert.equal(c.halfW,(3.9+.14)/2);
  api.dispose();
});

test('removing an item disposes only its geometry and leaves no ghost objects',async()=>{
  const {api,scene,loaded}=await setup();const selected=DEFAULT_ITEMS.filter(i=>['base-right-1','upper-right-1'].includes(i.id));await api.rebuild(selected);
  const oldMeshes=api.pickables().slice();let disposed=0;oldMeshes.forEach(m=>m.geometry.addEventListener('dispose',()=>disposed++));
  await api.rebuild([selected[1]]);assert.equal(api.objects.size,1);assert.equal(api.objects.has('base-right-1'),false);assert.equal(disposed,oldMeshes.filter(m=>m.userData.itemId==='base-right-1').length);assert.ok(api.pickables().every(m=>m.userData.itemId==='upper-right-1'));assert.ok(api.getColliders().every(c=>c.itemId!=='base-right-1'));
  let textureDisposals=0;loaded.forEach(t=>t.addEventListener('dispose',()=>textureDisposals++));api.dispose();await Promise.resolve();await Promise.resolve();assert.equal(scene.children.length,0);assert.equal(api.objects.size,0);assert.equal(textureDisposals,loaded.length);
});

test('later async rebuild and surface selection win over a slower earlier request',async()=>{
  let release;const slow=new Promise(r=>release=r);const env=runtime({pending:{slow}}),scene=new THREE.Scene();
  const catalog={SERIES:[{id:'test',profile:'slab',finishes:[{id:'slow',image:'slow'},{id:'fast',image:'fast'}]}]};
  const api=await createEditorScene(env.T,scene,{catalog,TYPES});const base=itemFor(TYPES[0],{seriesId:'test'});
  const old=api.rebuild([{...base,id:'old',finishId:'slow'}]);await api.rebuild([{...base,id:'new',finishId:'fast'}]);release();await old;assert.deepEqual([...api.objects.keys()],['new']);
  let releaseSurface;const pendingSurface=new Promise(r=>releaseSurface=r);const env2=runtime({pending:{'slow-stone':pendingSurface}});const api2=await createEditorScene(env2.T,new THREE.Scene(),{});
  const oldSurface=api2.setSurface({image:'slow-stone'});await api2.setSurface({image:'latest-stone',repeat:[.2,.3],offset:[.1,.2]});releaseSurface();await oldSurface;assert.equal(api2.materials.stone.map.userData.source,'latest-stone');
  api.dispose();api2.dispose();
});


function stoneMeshes(api){return api.pickables().filter(m=>m.material===api.materials.stone)}
function verifySlabUVs(api){
  const stone=api.materials.stone;
  assert.equal(stone.map.wrapS,THREE.ClampToEdgeWrapping);assert.equal(stone.map.wrapT,THREE.ClampToEdgeWrapping);
  const shader={uniforms:{},fragmentShader:'#include <map_fragment>'};stone.onBeforeCompile(shader);
  assert.equal(shader.fragmentShader,'#include <map_fragment>','stone uses ordinary affine texture sampling, no fract shader');
  assert.equal(shader.uniforms.sampleCropRepeat,undefined);
  for(const mesh of stoneMeshes(api)){
    const run=mesh.userData.stoneRun;assert.ok(run,'stone belongs to a connected slab run');
    const p=mesh.geometry.attributes.position,uv=mesh.geometry.attributes.uv,c=Math.cos(run.rotation),s=Math.sin(run.rotation),world=new THREE.Vector3();
    for(let i=0;i<p.count;i++){
      world.fromBufferAttribute(p,i).applyMatrix4(mesh.matrixWorld);
      const u=(c*world.x-s*world.z-run.minU)/(run.maxU-run.minU),v=((run.kind==='backsplash'?world.y:s*world.x+c*world.z)-run.minV)/(run.maxV-run.minV);
      assert.ok(uv.getX(i)>=0&&uv.getX(i)<=1);assert.ok(uv.getY(i)>=0&&uv.getY(i)<=1);
      assert.ok(Math.abs(uv.getX(i)-u)<2e-6,'U remains one affine coordinate over the whole run');assert.ok(Math.abs(uv.getY(i)-v)<2e-6,'V remains one affine coordinate over the whole run');
    }
  }
}
function sharedStoneCoordinates(api,kind,itemPrefix){
  const samples=new Map();let matches=0;
  for(const mesh of stoneMeshes(api).filter(m=>m.userData.stoneRun.kind===kind&&m.userData.itemId.startsWith(itemPrefix))){
    const pos=mesh.geometry.attributes.position,uv=mesh.geometry.attributes.uv,run=mesh.userData.stoneRun,c=Math.cos(run.rotation),s=Math.sin(run.rotation),world=new THREE.Vector3();
    for(let i=0;i<pos.count;i++){
      world.fromBufferAttribute(pos,i).applyMatrix4(mesh.matrixWorld);
      const u=c*world.x-s*world.z,v=kind==='backsplash'?world.y:s*world.x+c*world.z;
      const key=`${run.id}:${u.toFixed(5)}:${v.toFixed(5)}`,old=samples.get(key),next=[uv.getX(i),uv.getY(i),mesh.uuid];
      if(old&&old[2]!==mesh.uuid){assert.ok(Math.abs(old[0]-next[0])<2e-6);assert.ok(Math.abs(old[1]-next[1])<2e-6);matches++}else if(!old)samples.set(key,next);
    }
  }
  return matches;
}

test('default stone uses one slab per aligned run without internal wraps for all four surface choices',async()=>{
  const {api}=await setup();
  // Reloaded design angles are positive; alternate them with the original
  // negatives to catch accidental splitting of -29.9 and 330.1 degrees.
  const items=DEFAULT_ITEMS.map((i,n)=>i.rotation<0&&n%2?{...i,rotation:i.rotation+360}:i);
  for(const surface of SURFACES){
    await api.rebuild(items,{surface});verifySlabUVs(api);
    const runs=api.root.userData.stoneRuns;assert.equal(runs.length,7,'three wall facets each have top/back slabs, plus island');
    const rightRuns=runs.filter(r=>r.itemIds.includes('base-right-1'));assert.equal(rightRuns.length,2);rightRuns.forEach(r=>assert.equal(r.itemIds.length,7));
    assert.ok(sharedStoneCoordinates(api,'backsplash','base-right-')>20,'neighbouring panel edges sample the same slab coordinates');
    assert.ok(sharedStoneCoordinates(api,'countertop','base-right-')>20,'neighbouring top edges sample the same slab coordinates');
    const back=rightRuns.find(r=>r.kind==='backsplash');assert.ok(back.minV<1.45&&back.maxV>1.45,'the old hard-wrap height lies inside this slab');
    // The old regression fractured this location; it is now simply an interior UV.
    const interior=(1.45-back.minV)/(back.maxV-back.minV);assert.ok(interior>0&&interior<1);
  }
  const wood=api.pickables().find(m=>m.material!==api.materials.stone&&m.material.map).material;
  const woodShader={uniforms:{},fragmentShader:'#include <map_fragment>'};wood.onBeforeCompile(woodShader);assert.ok(woodShader.fragmentShader.includes('fract((vMapUv'),'wood mapping remains unchanged');
  api.dispose();
});

test('island sink spans and their edge faces form one uninterrupted slab after move, rotation and resize',async()=>{
  const {api}=await setup();
  const original=DEFAULT_ITEMS.find(i=>i.id==='island-main');
  for(const variant of [original,{...original,x:-2.1,z:3.7,rotation:127,width:2.8,depth:1.35,height:1.03}]){
    await api.rebuild([variant]);verifySlabUVs(api);
    const spans=stoneMeshes(api);assert.equal(spans.length,4);assert.equal(new Set(spans.map(m=>m.userData.stoneRun.id)).size,1);
    const run=spans[0].userData.stoneRun;assert.deepEqual(run.itemIds,['island-main']);
    assert.ok(sharedStoneCoordinates(api,'countertop','island-main')>=24,'the split spans and cutout edges have consistent UVs');
    for(const span of spans){const uv=span.geometry.attributes.uv,us=[],vs=[];for(let i=0;i<uv.count;i++){us.push(uv.getX(i));vs.push(uv.getY(i))}assert.ok(Math.max(...us)-Math.min(...us)<.999||Math.max(...vs)-Math.min(...vs)<.999,'no individual sink span restarts the entire image')}
  }
  api.dispose();
});

test('edited slab groups follow adjacency, rotation, height and depth instead of old world-grid boundaries',async()=>{
  const {api}=await setup();const base=itemFor(TYPES.find(t=>t.id==='base-cabinet'),{countertop:true,backsplash:true,height:.96,depth:.72,y:.20,rotation:37});
  const widths=[.45,1.05,.70],a=37*Math.PI/180;let along=0;
  const items=widths.map((width,i)=>{const mid=along+width/2;along+=width;return {...base,id:`edited-${i}`,width,x:-1.8+Math.cos(a)*mid,z:2.7-Math.sin(a)*mid}});
  await api.rebuild(items);verifySlabUVs(api);assert.equal(api.root.userData.stoneRuns.length,2);assert.ok(sharedStoneCoordinates(api,'backsplash','edited-')>10);
  const moved=items.map((item,i)=>i===1?{...item,x:8,z:-5,rotation:83,width:1.3}:item);
  await api.rebuild(moved);verifySlabUVs(api);assert.equal(api.root.userData.stoneRuns.length,6,'moving one module away splits the old run');
  const raised=items.map((item,i)=>i===1?{...item,y:item.y+.15}:item);
  await api.rebuild(raised);verifySlabUVs(api);assert.equal(api.root.userData.stoneRuns.length,6,'different elevations are independent slabs');
  const deeper=items.map((item,i)=>i===1?{...item,depth:1.20}:item);
  await api.rebuild(deeper);verifySlabUVs(api);assert.equal(api.root.userData.stoneRuns.filter(r=>r.kind==='backsplash').length,3,'backsplashes on different depth planes do not share a run');
  api.dispose();
});

test('room walls are selectable neutral paint, follow transforms, collide and can be removed completely',async()=>{
 const {api,loaded}=await setup();const wall={...DEFAULT_ITEMS.find(i=>i.typeId==='room-wall'),id:'edit-wall',width:5,height:4.1,depth:.23,x:7,z:1,rotation:47,finishId:'nocce-3'};
 await api.rebuild([wall]);const entry=api.objects.get(wall.id),pieces=meshes(entry.object);
 assert.equal(pieces.length,3,'wall plus base trim and top cap');assert.equal(fronts(entry.object).length,0);
 pieces.forEach(m=>{assert.equal(m.material.map,null);assert.equal(m.userData.itemId,wall.id)});
 assert.equal(loaded.some(tx=>tx.userData.source?.includes('nocce')),false,'paint never loads cabinet wood texture');
 assert.equal(api.wallSegments.length,1);assert.equal(api.wallSegments[0].itemId,wall.id);
 const c=api.getColliders()[0];assert.equal(c.itemId,wall.id);assert.equal(c.cx,7);assert.equal(c.halfW,2.5);assert.equal(c.halfD,.115);
 entry.object.position.set(-4,0,2);entry.object.rotation.y=1.2;
 const moved=api.getColliders()[0];assert.equal(moved.cx,-4);assert.equal(moved.cz,2);assert.equal(moved.rotation,1.2);
 await api.rebuild([{...wall,y:1.3}]);assert.equal(api.getColliders().length,1,'an elevated wall intersecting the walker still blocks passage');
 await api.rebuild([{...wall,y:2}]);assert.equal(api.getColliders().length,0,'the walker can pass below a suspended wall');
 await api.rebuild([]);assert.equal(api.getColliders().length,0);assert.equal(api.wallSegments.length,0);assert.equal(api.pickables().length,0);
 api.dispose();
});

test('floor and walking bounds expand around extensions while the original tile grid stays stable',async()=>{
 const {api}=await setup();await api.rebuild(DEFAULT_ITEMS);
 assert.deepEqual(api.bounds,{minX:-3.2,maxX:4.8,minZ:-2.5,maxZ:4.8});
 const original=api.root.getObjectByName('Floor tiles');assert.equal(original.count,132);
 const first=new THREE.Matrix4();original.getMatrixAt(0,first);assert.ok(Math.abs(first.elements[12]+3.05)<1e-6,'tile centers stay on the original grid');
 const changed={...DEFAULT_ITEMS.find(i=>i.typeId==='room-wall'),x:9,z:7,width:12,rotation:40};
 await api.rebuild([changed]);const a=40*Math.PI/180,hx=(Math.cos(a)*12+Math.sin(a)*changed.depth)/2,hz=(Math.sin(a)*12+Math.cos(a)*changed.depth)/2;
 assert.ok(api.bounds.maxX>changed.x+hx);assert.ok(api.bounds.maxZ>changed.z+hz);
 const tiles=api.root.getObjectByName('Floor tiles');assert.ok(tiles.count>132);assert.ok(tiles.boundingBox.max.x>=api.bounds.maxX);assert.ok(tiles.boundingBox.max.z>=api.bounds.maxZ);
 await api.rebuild(DEFAULT_ITEMS);assert.deepEqual(api.bounds,{minX:-3.2,maxX:4.8,minZ:-2.5,maxZ:4.8});assert.equal(api.root.getObjectByName('Floor tiles').count,132);
 api.dispose();
});


test('manufacturer visual overrides build actual profiles, front counts, dimensions and private finish samples',async()=>{
 const {api,loaded}=await setup();
 for(const [typeId,profile,doors,drawers] of [['base-cabinet','shaker',2,2],['wall-single','slim-shaker',2,1],['drawer-triple','slab',1,1],['sink-base','shaker',2,0],['tall-pantry','slab',3,2],['island','slab',3,2]]){
  const item=itemFor(TYPES.find(t=>t.id===typeId)||TYPES[0],{id:'imported',typeId,width:1.05,height:typeId==='tall-pantry'?2.3:.9,depth:.62,catalogVisual:{profile,doors,drawers,finishImage:'assets/private-catalogs/brand/ivory.png',roughness:.81}});
  await api.rebuild([item]);const entry=api.objects.get(item.id),f=fronts(entry.object);
  assert.equal(entry.item.width,1.05);assert.equal(entry.item.depth,.62);
  assert.equal(f.filter(x=>x.role==='door-front').length,doors,typeId);assert.equal(f.filter(x=>x.role==='drawer-front').length,drawers,typeId);f.forEach(front=>assert.equal(front.profile,profile));
  const material=meshes(entry.object).find(m=>m.material.map&&m.material!==api.materials.stone).material;
  assert.equal(material.map.userData.source,item.catalogVisual.finishImage);assert.equal(material.roughness,.81);assert.deepEqual(material.map.repeat.toArray(),[1,1]);
 }
 assert.equal(loaded.filter(t=>t.userData.source==='assets/private-catalogs/brand/ivory.png').length,1,'sample texture is cached across product variants');
 api.dispose();
});

test('untrusted catalog visual URLs cannot trigger external or traversal texture requests',async()=>{
 const {api,loaded}=await setup(),base=itemFor(TYPES.find(t=>t.id==='base-single-door'));
 for(const finishImage of ['https://example.com/a.png','//example.com/a.png','assets/private-catalogs/../../secret.png','assets/private-catalogs/%2e%2e/secret.png','assets/private-catalogs/a.png?url=https://example.com','assets/private-catalogs/../a.png']){
  await api.rebuild([{...base,catalogVisual:{finishImage,profile:'execute',doors:-1,drawers:Infinity}}]);
  assert.equal(fronts(api.objects.get(base.id).object)[0].profile,'slab');
  assert.ok(!loaded.some(t=>t.userData.source===finishImage));
 }
 api.dispose();
});

test('incremental rebuild retains meshes on unchanged and pose-only edits, replacing only changed joinery',async()=>{
 const {api}=await setup();const items=DEFAULT_ITEMS.filter(i=>['base-right-1','upper-right-1','pendant-1'].includes(i.id));await api.rebuild(items);
 const base=api.objects.get(items[0].id).object,upper=api.objects.get(items[1].id).object,pendant=api.objects.get(items[2].id).object,geometry=meshes(base)[0].geometry;
 let disposed=0;meshes(base).forEach(m=>m.geometry.addEventListener('dispose',()=>disposed++));
 await api.rebuild(items,{lightScale:.7,showWalls:false});
 assert.deepEqual(api.root.userData.rebuildStats,{created:0,reused:3,moved:0,removed:0});assert.equal(api.objects.get(items[0].id).object,base);assert.equal(disposed,0);assert.equal(api.lights.length,2);
 const moved=items.map((i,n)=>n?i:{...i,x:i.x+1,rotation:50});
 // Simulate TransformControls having already changed the live object.
 base.position.x=moved[0].x;base.rotation.y=50*Math.PI/180;
 await api.rebuild(moved);assert.equal(api.objects.get(items[0].id).object,base);assert.equal(meshes(base)[0].geometry,geometry);assert.equal(api.root.userData.rebuildStats.moved,1);verifySlabUVs(api);
 const collider=api.getColliders().find(c=>c.itemId===items[0].id);assert.equal(collider.cx,moved[0].x);assert.equal(collider.rotation,50*Math.PI/180);
 const resized=moved.map((i,n)=>n?i:{...i,width:i.width+.3});await api.rebuild(resized);
 assert.notEqual(api.objects.get(items[0].id).object,base);assert.equal(api.objects.get(items[1].id).object,upper);assert.equal(api.objects.get(items[2].id).object,pendant);assert.ok(disposed>0);assert.equal(api.root.userData.rebuildStats.created,1);verifySlabUVs(api);
 await api.rebuild(resized,{surface:SURFACES[2]});assert.equal(api.root.userData.rebuildStats.created,0);verifySlabUVs(api);
 api.dispose();
});

test('catalog visual changes remain async-safe while unchanged geometry stays alive',async()=>{
 let release;const slow=new Promise(r=>release=r),url='assets/private-catalogs/slow.png';
 const {api}=await setup({pending:{[url]:slow}}),base=itemFor(TYPES.find(t=>t.id==='base-cabinet'));
 await api.rebuild([base]);const original=api.objects.get(base.id).object;
 const earlier=api.rebuild([{...base,catalogVisual:{finishImage:url,profile:'shaker',drawers:4,doors:0}}],{showWalls:false});
 await api.rebuild([{...base,x:2}],{showWalls:true});release();assert.equal(await earlier,false);
 assert.equal(api.objects.get(base.id).object,original);assert.equal(original.position.x,2);assert.equal(fronts(original)[0].profile,'slab');
 await api.rebuild([{...base,x:2,catalogVisual:{finishImage:url,profile:'slim-shaker',drawers:3,doors:0}}]);
 assert.notEqual(api.objects.get(base.id).object,original);assert.equal(fronts(api.objects.get(base.id).object).length,3);
 api.dispose();
});

test('front bevels stay within specified joinery dimensions and daylight strength remains unchanged',async()=>{
 const {api}=await setup();await api.rebuild([itemFor(TYPES.find(t=>t.id==='base-single-door'))]);
 const edge=api.pickables().find(m=>m.userData.edgeRadius);assert.ok(edge);assert.ok(edge.userData.edgeRadius<=.0012);
 edge.geometry.computeBoundingBox();const size=edge.geometry.boundingBox.getSize(new THREE.Vector3()),front=edge.parent.userData.front;
 assert.ok(Math.abs(size.x-front.width)<1e-6);assert.ok(Math.abs(size.y-front.height)<1e-6);assert.ok(Math.abs(size.z-.026)<1e-6);
 assert.deepEqual([api.lighting.hemisphere.intensity,api.lighting.sun.intensity,api.lighting.fill.intensity],[1.15,1.6,.4]);
 api.dispose();
});


test('manufacturer solid finish factors remain linear and never borrow legacy finish textures',async()=>{
 const {api,loaded}=await setup(),base=itemFor(TYPES.find(t=>t.id==='base-single-door'),{finishId:'bianco-matte'});
 for(const factor of [[.12,.28,.43],[.8,.6,.2,1],[0,0,0,1]]){
  const item={...base,catalogVisual:{profile:'slab',baseColorFactor:factor,roughness:.77}};
  await api.rebuild([item]);const mat=api.pickables().find(m=>m.userData.edgeRadius).material;
  assert.deepEqual(mat.color.toArray(),factor.slice(0,3),'factors are linear RGB, not converted from sRGB');assert.equal(mat.map,null);assert.equal(mat.roughness,.77);assert.equal(mat.userData.approximateFinish,false);
 }
 assert.equal(loaded.some(t=>t.userData.source?.includes('fabuwood')),false);
 api.dispose();
});

test('missing or invalid imported colors get explicit neutral gray rather than Bianco or thumbnail textures',async()=>{
 const {api,loaded}=await setup(),base=itemFor(TYPES.find(t=>t.id==='base-single-door'),{finishId:'bianco-matte'});
 await api.rebuild([base]);const legacy=api.objects.get(base.id).object;
 for(const factor of [undefined,[1,2,3],[NaN,.2,.4],[.2,.3],[.1,.2,Infinity],['.2',.3,.4]]){
  await api.rebuild([{...base,catalogVisual:{baseColorFactor:factor,imageUrl:'assets/private-catalogs/door-thumbnail.jpg'}}]);
  const entry=api.objects.get(base.id);assert.notEqual(entry.object,legacy);
  const mat=meshes(entry.object).find(m=>m.userData.edgeRadius).material;
  assert.equal(mat.map,null);assert.equal(mat.color.getHexString(),'a6a6a6');assert.equal(mat.userData.approximateFinish,true);assert.match(mat.name,/Approximate/);
 }
 assert.equal(loaded.some(t=>t.userData.source?.includes('door-thumbnail')),false);
 await api.rebuild([base]);const restored=api.pickables().find(m=>m.userData.edgeRadius).material;assert.notEqual(restored.userData.approximateFinish,true);
 api.dispose();
});
