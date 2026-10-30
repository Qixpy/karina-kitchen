// Circle against the actual cabinet orientation, so diagonal aisles stay walkable.
export function isWalkable(x,z,colliders,bounds,radius=.22){
 if(!Number.isFinite(x)||!Number.isFinite(z))return false;
 if(x<bounds.minX+radius||x>bounds.maxX-radius||z<bounds.minZ+radius||z>bounds.maxZ-radius)return false;
 return !colliders.some(c=>{
  const oriented=Number.isFinite(c.cx);
  const cx=oriented?c.cx:(c.minX+c.maxX)/2,cz=oriented?c.cz:(c.minZ+c.maxZ)/2;
  const hw=oriented?c.halfW:(c.maxX-c.minX)/2,hd=oriented?c.halfD:(c.maxZ-c.minZ)/2;
  const a=c.rotation||0,dx=x-cx,dz=z-cz;
  const lx=Math.cos(a)*dx-Math.sin(a)*dz,lz=Math.sin(a)*dx+Math.cos(a)*dz;
  const qx=Math.max(Math.abs(lx)-hw,0),qz=Math.max(Math.abs(lz)-hd,0);
  return qx*qx+qz*qz<radius*radius;
 });
}
