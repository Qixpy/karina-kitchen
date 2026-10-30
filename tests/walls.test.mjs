import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_WALLS,isRoomWall,wallEndpoints,resizeWall} from '../dist/walls.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-10,`${a} ≈ ${b}`);
const samePoint=(a,b)=>{near(a.x,b.x);near(a.z,b.z)};

test('default editable walls retain the original angled shell body centers',()=>{
 assert.equal(DEFAULT_WALLS.length,3);
 const expected=[[-.7,-1.8,30.5,-.8,1.6],[0,-1.8,0,0,1.4],[.7,-1.8,-29.9,2.2,4.4]];
 DEFAULT_WALLS.forEach((wall,i)=>{const [x,z,degrees,along,width]=expected[i],a=degrees*Math.PI/180;
  near(wall.x,x+Math.cos(a)*along-Math.sin(a)*.07);near(wall.z,z-Math.sin(a)*along-Math.cos(a)*.07);
  assert.equal(wall.width,width);assert.equal(wall.height,3.4);assert.equal(wall.depth,.12);
 });
 assert.equal(isRoomWall(undefined),false);
});

test('extension and shortening preserve the chosen endpoint at any angle',()=>{
 for(const rotation of [0,30.5,-29.9,90,180,270,397])for(const length of [.1,1.1,7,20]){
  const wall={...DEFAULT_WALLS[0],x:2,z:-3,rotation},before=wallEndpoints(wall);
  for(const anchor of ['start','end']){
   const resized=resizeWall(wall,length,anchor),after=wallEndpoints(resized);
   samePoint(after[anchor],before[anchor]);near(Math.hypot(after.end.x-after.start.x,after.end.z-after.start.z),length);
   assert.equal(wall.width,1.6,'original is immutable');
  }
  const centered=resizeWall(wall,length);samePoint(centered,wall);
 }
});

test('invalid wall lengths and anchor choices are rejected',()=>{
 for(const length of [NaN,Infinity,-1,0,21])assert.throws(()=>resizeWall(DEFAULT_WALLS[0],length),RangeError);
 assert.throws(()=>resizeWall(DEFAULT_WALLS[0],3,'bogus'),RangeError);
 assert.throws(()=>resizeWall({typeId:'base-cabinet'},3),RangeError);
});
