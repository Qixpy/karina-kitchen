// Independent projects use real room dimensions; no furniture is copied implicitly.
export function createRoom({name,widthIn,depthIn,heightIn,layout,surfaceId,seriesId,finishId}){
 const w=widthIn*.0254,d=depthIn*.0254,h=heightIn*.0254,t=.12;
 if(![w,d,h].every(n=>Number.isFinite(n)&&n>0))throw Error('Enter valid room dimensions.');
 const base={typeId:'room-wall',seriesId,finishId,height:h,depth:t,y:0};
 const wall=(name,width,x,z,rotation)=>({...base,id:'wall-'+crypto.randomUUID(),name,width,x,z,rotation});
 const items=layout==='blank'?[]:[wall('Back wall',w,0,-d/2,0),wall('Left wall',d,-w/2,0,90)];
 if(layout==='open')items.push(wall('Right wall',d,w/2,0,90));
 return {version:3,name:name.trim().slice(0,70)||'New kitchen',project:{},surfaceId,items};
}
