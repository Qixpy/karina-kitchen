import {DEFAULT_WALLS,WALL_LIMITS,isRoomWall} from './walls.js';
export const INCH=.0254;
export const clone=x=>JSON.parse(JSON.stringify(x));
export const angle=n=>((n%360)+360)%360;
const finite=(n,f,min,max)=>Number.isFinite(Number(n))?Math.max(min,Math.min(max,Number(n))):f;
export function validFinish(series,id){return series.finishes.find(f=>f.id===id&&f.available!==false&&f.verified!==false)||series.finishes.find(f=>f.available!==false&&f.verified!==false);}
export function normalizeDesign(raw,series,types,surfaces){
 if(!raw||typeof raw!=='object'||!Array.isArray(raw.items)||raw.items.length>250)throw Error('Choose a Kitchen Atelier design file with up to 250 items.');
 const ids=new Set();
 const items=raw.items.map((v,i)=>{
  if(!v||typeof v!=='object')throw Error('This design contains an unreadable item.');
  const t=types.find(t=>t.id===v.typeId);if(!t)throw Error('This design uses an unknown cabinet type.');
  const s=series.find(s=>s.id===v.seriesId)||series[0];const f=validFinish(s,v.finishId);
  const limits=isRoomWall(v)?WALL_LIMITS:{width:[.01,6],height:[.01,4],depth:[.01,3]};
  let id=typeof v.id==='string'&&/^[\w-]{1,80}$/.test(v.id)?v.id:'import-'+i;
  if(ids.has(id))id='import-'+i+'-'+ids.size;ids.add(id);
  const extras={};for(const key of ['countertop','backsplash','sink','underLight'])if(typeof v[key]==='boolean')extras[key]=v[key];for(const key of ['frontInsetLeft','frontInsetRight','sinkOffsetX','sinkOffsetZ'])if(Number.isFinite(v[key]))extras[key]=Math.max(-3,Math.min(3,v[key]));if(typeof v.name==='string')extras.name=v.name.slice(0,80);if(v.decor==='plant')extras.decor='plant';
  return {...extras,id,typeId:t.id,seriesId:s.id,finishId:f.id,x:finite(v.x,0,-20,20),z:finite(v.z,0,-20,20),y:finite(v.y,0,0,4),rotation:angle(finite(v.rotation,0,-36000,36000)),width:finite(v.width,t.width||.6,...limits.width),height:finite(v.height,t.height||.87,...limits.height),depth:finite(v.depth,t.depth||.6,...limits.depth),...(typeof v.followsId==='string'?{followsId:v.followsId}:{}),...(v.scope?{scope:String(v.scope).slice(0,20)}:{})};
 });
 // Old designs stored only cabinets; their implicit shell becomes editable once.
 if((Number(raw.version)||1)<2&&!items.some(isRoomWall)){
  if(items.length+DEFAULT_WALLS.length>250)throw Error('Remove at least three items from this older design to make room for editable walls.');
  for(const wall of DEFAULT_WALLS){let id=wall.id;while(ids.has(id))id+='-restored';ids.add(id);items.push({...wall,id});}
 }
 return {version:2,name:typeof raw.name==='string'?raw.name.slice(0,70):'Kitchen concept',items,surfaceId:surfaces.some(s=>s.id===raw.surfaceId)?raw.surfaceId:surfaces[0].id};
}
export function transformFollowers(items,before,after){
 const radians=(after.rotation-before.rotation)*Math.PI/180,c=Math.cos(radians),s=Math.sin(radians);
 return items.map(i=>{if(i.followsId!==before.id)return i;const dx=i.x-before.x,dz=i.z-before.z;return {...i,x:after.x+c*dx+s*dz,z:after.z-s*dx+c*dz,rotation:angle(i.rotation+after.rotation-before.rotation)};});
}
export class History{
 constructor(initial){this.past=[];this.future=[];this.current=clone(initial);}
 push(state){if(JSON.stringify(state)===JSON.stringify(this.current))return false;this.past.push(this.current);if(this.past.length>60)this.past.shift();this.current=clone(state);this.future=[];return true;}
 undo(){if(!this.past.length)return null;this.future.push(this.current);this.current=this.past.pop();return clone(this.current);}
 redo(){if(!this.future.length)return null;this.past.push(this.current);this.current=this.future.pop();return clone(this.current);}
}
