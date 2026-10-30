/** Room wall geometry shared by the editor, persistence and 3D scene. */
const DEG=Math.PI/180;
export const WALL_LIMITS={width:[.1,20],height:[.1,6],depth:[.05,1]};
export const isRoomWall=item=>item?.typeId==='room-wall';
const point=(x,z,rotation,along,across=0)=>{const a=rotation*DEG;return {x:x+Math.cos(a)*along+Math.sin(a)*across,z:z-Math.sin(a)*along+Math.cos(a)*across}};
function defaultWall(id,name,originX,originZ,rotation,along,width){
 return {id,typeId:'room-wall',name,seriesId:'catalina',finishId:'bianco-matte',...point(originX,originZ,rotation,along,-.07),rotation,y:0,width,height:3.4,depth:.12};
}
export const DEFAULT_WALLS=[
 defaultWall('wall-left','Left angled wall',-.7,-1.8,30.5,-.8,1.6),
 defaultWall('wall-center','Cooking wall',0,-1.8,0,0,1.4),
 defaultWall('wall-right','Right angled wall',.7,-1.8,-29.9,2.2,4.4)
];
export function wallEndpoints(item){return {start:point(item.x,item.z,item.rotation,-item.width/2),end:point(item.x,item.z,item.rotation,item.width/2)}}
/** Keep one endpoint fixed when extending or shortening a rotated wall. */
export function resizeWall(item,length,anchor='center'){
 const width=Number(length);
 if(!isRoomWall(item)||!Number.isFinite(width)||width<WALL_LIMITS.width[0]||width>WALL_LIMITS.width[1])throw new RangeError('Wall length must be between 0.1 and 20 metres.');
 if(!['center','start','end'].includes(anchor))throw new RangeError('Choose a wall start, center or end to keep fixed.');
 const shift=anchor==='center'?0:(width-item.width)/2*(anchor==='start'?1:-1);
 return {...item,width,...point(item.x,item.z,item.rotation,shift)};
}
