/** Approximate architectural concept; dimensions are illustrative metres. */
export async function createRoom(T,scene){
 const group=new T.Group();group.name='Kitchen concept';scene.add(group);const lights=[],colliders=[];
 const mat=(color,roughness=.6,metalness=0)=>new T.MeshStandardMaterial({color,roughness,metalness});
 const white=mat('#e5e1d9',.76),wall=mat('#d8d3c9',.96),grout=mat('#c6bbaa',.9),brass=mat('#ae8650',.28,.78),black=mat('#141818',.24,.28),glass=mat('#161f21',.12,.52),cream=mat('#e8dfcf',.95),stoolWood=mat('#947455',.65),darkWood=mat('#534435',.9),ceramic=mat('#ddd5c5',.3),green=mat('#486143',.85),stems=mat('#576541',.85),stainless=mat('#a3a7a5',.3,.83),darkMetal=mat('#262b2a',.45,.75);
 const emissive=new T.MeshStandardMaterial({color:'#fff0cd',emissive:'#ffe7c4',emissiveIntensity:.35});const loader=new T.TextureLoader();
 async function texture(path,repeat,offset){try{const t=await loader.loadAsync(path);t.colorSpace=T.SRGBColorSpace;t.wrapS=t.wrapT=T.RepeatWrapping;t.repeat.set(...repeat);t.offset.set(...offset);t.anisotropy=8;return t;}catch(e){console.warn('Material unavailable',path);return null}}
 const [woodTex,stoneTex]=await Promise.all([texture('./assets/wood-reference.png',[.37,.9],[.60,.05]),texture('./assets/stone-reference.png',[.84,.56],[.15,.36])]);
 const wood=new T.MeshStandardMaterial({color:woodTex?'#eee9e3':'#8d7965',map:woodTex,roughness:.91}),stone=new T.MeshStandardMaterial({color:'#ffffff',map:stoneTex,roughness:.29});
 const cache=new Map();function box(w,h,d,x,y,z,m=white,p=group){const k=`${w}:${h}:${d}`;let g=cache.get(k);if(!g){g=new T.BoxGeometry(w,h,d);cache.set(k,g)}const o=new T.Mesh(g,m);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;p.add(o);return o}
 function cylinder(rt,rb,h,x,y,z,m,p=group,n=28){const o=new T.Mesh(new T.CylinderGeometry(rt,rb,h,n),m);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;p.add(o);return o}
 function sphere(r,x,y,z,m,p=group,sx=1,sy=1,sz=1){const o=new T.Mesh(new T.SphereGeometry(r,16,12),m);o.position.set(x,y,z);o.scale.set(sx,sy,sz);o.castShadow=true;p.add(o);return o}
 function rod(a,b,r,m,p=group){const av=new T.Vector3(...a),bv=new T.Vector3(...b),diff=bv.clone().sub(av);const o=cylinder(r,r,diff.length(),...(av.clone().add(bv).multiplyScalar(.5).toArray()),m,p,12);o.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),diff.normalize());return o}
 function pipe(points,r,m,p=group){const c=new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p)));const o=new T.Mesh(new T.TubeGeometry(c,30,r,8,false),m);o.castShadow=true;p.add(o);return o}
 function roundPanel(w,h,d,r,m,p=group){const s=new T.Shape();s.moveTo(-w/2+r,-h/2);s.lineTo(w/2-r,-h/2);s.quadraticCurveTo(w/2,-h/2,w/2,-h/2+r);s.lineTo(w/2,h/2-r);s.quadraticCurveTo(w/2,h/2,w/2-r,h/2);s.lineTo(-w/2+r,h/2);s.quadraticCurveTo(-w/2,h/2,-w/2,h/2-r);s.lineTo(-w/2,-h/2+r);s.quadraticCurveTo(-w/2,-h/2,-w/2+r,-h/2);const g=new T.ExtrudeGeometry(s,{depth:d,bevelEnabled:true,bevelSize:.012,bevelThickness:.012,bevelSegments:2,steps:1,curveSegments:10});g.translate(0,0,-d/2);const o=new T.Mesh(g,m);o.castShadow=true;o.receiveShadow=true;p.add(o);return o}
 function handle(x,y,z,v=false,p=group,len=.16){const a=v?[x,y-len/2,z]:[x-len/2,y,z],b=v?[x,y+len/2,z]:[x+len/2,y,z];rod(a,b,.009,brass,p);[a,b].forEach(q=>rod([q[0],q[1],z-.027],q,.007,brass,p))}
 function collider(x,z,w,d){colliders.push({minX:x-w/2,maxX:x+w/2,minZ:z-d/2,maxZ:z+d/2})}
 function light(x,y,z,power=12,distance=2.5){const l=new T.PointLight('#ffe7c4',power,distance,2);l.position.set(x,y,z);group.add(l);lights.push(l);return l}
 function vase(x,y,z,s=.15,p=group){const pts=[[0,0],[.58,0],[.7,.14],[.85,.5],[.72,.84],[.36,1.04],[.32,1.32],[.39,1.35]].map(([a,b])=>new T.Vector2(a*s,b*s));const o=new T.Mesh(new T.LatheGeometry(pts,24),ceramic);o.position.set(x,y,z);o.castShadow=true;p.add(o);cylinder(s*.32,s*.32,.005,x,y+s*1.345,z,darkWood,p);return o}
 function plant(x,y,z,s=.32,p=group){vase(x,y,z,s*.52,p);const sy=y+s*.55;for(let i=0;i<7;i++){const a=i*2.399,e=[x+Math.cos(a)*s*.54,sy+s*(.65+(.5+.5*Math.sin(i*5))*.45),z+Math.sin(a)*s*.54];pipe([[x,sy,z],[(x+e[0])/2,sy+s*.5,(z+e[2])/2],e],.0035,stems,p);for(let j=0;j<4;j++){const t=.4+j*.18,leaf=sphere(s*.14,x+(e[0]-x)*t+Math.cos(a+.8)*s*.1,sy+(e[1]-sy)*t,z+(e[2]-z)*t+Math.sin(a+.8)*s*.1,green,p,1,.23,.48);leaf.rotation.set(.4,a,.5)}}}
 // The customer's plan: three connected rear facets, never a ninety-degree L.
 const deg=Math.PI/180,leftL=1.60,rightL=4.40,centerW=1.40,ceilingHeight=3.40;
 const leftYaw=30.5*deg,rightYaw=-29.9*deg,wallZ=-1.8;
 // All sizes are spacious design assumptions; the drawing supplies angles only.
 const stoveFaceW=centerW-.65*(Math.tan(leftYaw/2)+Math.tan(-rightYaw/2));
 function placed(x,z,yaw){const p=new T.Group();p.position.set(x,0,z);p.rotation.y=yaw;group.add(p);return p}
 function point(p,x,z){return {x:p.position.x+Math.cos(p.rotation.y)*x+Math.sin(p.rotation.y)*z,z:p.position.z-Math.sin(p.rotation.y)*x+Math.cos(p.rotation.y)*z}}
 function obb(p,x,z,w,d,kind='cabinet'){const q=point(p,x,z);colliders.push({cx:q.x,cz:q.z,halfW:w/2,halfD:d/2,rotation:p.rotation.y,kind})}
 function localLight(p,x,y,z,power,distance){const q=point(p,x,z);return light(q.x,y,q.z,power,distance)}
 const center=placed(0,wallZ,0),left=placed(-centerW/2,wallZ,leftYaw),right=placed(centerW/2,wallZ,rightYaw);
 const leftEnd=point(left,-leftL,0),rightEnd=point(right,rightL,0);
 const wallSegments=[{a:[leftEnd.x,leftEnd.z],b:[-centerW/2,wallZ],inward:[Math.sin(leftYaw),Math.cos(leftYaw)]},{a:[-centerW/2,wallZ],b:[centerW/2,wallZ],inward:[0,1]},{a:[centerW/2,wallZ],b:[rightEnd.x,rightEnd.z],inward:[Math.sin(rightYaw),Math.cos(rightYaw)]}];
 // A restrained floor and the actual faceted wall silhouette form the cutaway.
 box(8.4,.13,7.7,.8,-.085,1.15,grout);const tileMats=['#d8ccba','#dfd4c3','#dcd0bd','#e2d8c8'].map(c=>mat(c,.4));for(let i=0;i<12;i++)for(let j=0;j<11;j++)box(.697,.022,.697,-3.05+i*.70,-.009,-2.35+j*.70,tileMats[(i*7+j*3)%4]);
 function wallFacet(p,x,w){box(w,ceilingHeight,.12,x,ceilingHeight/2,-.07,wall,p);box(w,.12,.025,x,.06,.005,white,p);box(w,.085,.14,x,3.355,-.04,white,p);obb(p,x,-.07,w,.14,'wall')}
 wallFacet(left,-leftL/2,leftL);wallFacet(center,0,centerW);wallFacet(right,rightL/2,rightL);
 const nicheMat=mat('#d4c5aa',.7),displayGlass=new T.MeshPhysicalMaterial({color:'#fff9ed',transparent:true,opacity:.08,roughness:.09,metalness:.05,depthWrite:false});
 function upper(x,w,p){
  box(w,1.36,.36,x,2.370,.19,white,p);box(w-.008,1.35,.025,x,2.370,.386,white,p);handle(x+w/2-.06,1.83,.427,true,p,.16);
  const y=3.17;box(w,.36,.025,x,y,.023,white,p);box(w-.075,.29,.022,x,y,.042,nicheMat,p);box(w-.055,.018,.29,x,3.035,.205,white,p);box(w-.055,.018,.29,x,3.305,.205,white,p);box(.022,.29,.29,x-w/2+.026,y,.205,white,p);box(.022,.29,.29,x+w/2-.026,y,.205,white,p);box(w-.05,.285,.006,x,y,.367,displayGlass,p);box(w-.07,.012,.045,x,3.295,.335,emissive,p);handle(x,3.025,.39,false,p,.055);
  if(Math.round(x*10)%3===0)plant(x,3.045,.22,.15,p);else{vase(x-.10,3.045,.22,.105,p);vase(x+.10,3.045,.22,.075,p)}
 }
 // The whole oven tower follows the left facet and faces diagonally inward.
 const towerX=-leftL+.41,tower=placed(...[point(left,towerX,.32).x,point(left,towerX,.32).z,leftYaw]);
 box(.82,3.35,.64,0,1.675,0,white,tower);box(.77,.17,.028,0,.23,.337,white,tower);box(.77,.17,.028,0,.415,.337,white,tower);box(.77,.12,.028,0,.07,.337,white,tower);handle(0,.23,.38,false,tower,.22);handle(0,.415,.38,false,tower,.22);
 [1.01,1.73].forEach(y=>{box(.70,.70,.035,0,y,.35,black,tower);box(.61,.46,.012,0,y-.07,.375,glass,tower);box(.65,.075,.014,0,y+.24,.379,darkMetal,tower);rod([-.275,y+.14,.42],[.275,y+.14,.42],.013,stainless,tower);cylinder(.015,.015,.008,-.24,y+.245,.397,stainless,tower).rotation.x=Math.PI/2;box(.13,.023,.007,0,y+.25,.393,mat('#515c54',.3),tower)});
 box(.78,.88,.028,0,2.53,.337,white,tower);handle(.25,2.15,.38,true,tower,.17);box(.78,.32,.025,0,3.18,.337,white,tower);box(.65,.22,.015,0,3.18,.356,nicheMat,tower);vase(-.13,3.07,.39,.10,tower);vase(.12,3.07,.39,.08,tower);box(.66,.012,.07,0,3.30,.36,emissive,tower);obb(tower,0,.035,.82,.71,'oven');
 // A narrow angled white filler finishes the gap between oven housing and hood.
 // The narrow left filler is included in the continuous polygon below.
 // Rear worktop is one polygon with a genuine miter at the 150.1-degree joint.
 const depth=.65,normalX=Math.sin(rightYaw),normalZ=Math.cos(rightYaw),tangentX=Math.cos(rightYaw),tangentZ=-Math.sin(rightYaw);
 const miterT=depth*(1-normalZ)/tangentZ,miterX=centerW/2+normalX*depth+tangentX*miterT;
 const endFront=point(right,rightL,depth),leftGap=leftL-.82,leftStubBack=point(left,-leftGap,0),leftStubFront=point(left,-leftGap,depth),leftMiterX=-centerW/2+depth*Math.tan(leftYaw/2);
 const rearPoints=[[leftStubBack.x,leftStubBack.z],[-centerW/2,wallZ],[centerW/2,wallZ],[rightEnd.x,rightEnd.z],[endFront.x,endFront.z],[miterX,wallZ+depth],[leftMiterX,wallZ+depth],[leftStubFront.x,leftStubFront.z]];
 function slabPolygon(points,y,height,material){const shape=new T.Shape();points.forEach(([x,z],i)=>i?shape.lineTo(x,-z):shape.moveTo(x,-z));shape.closePath();const geo=new T.ExtrudeGeometry(shape,{depth:height,bevelEnabled:false,steps:1});geo.rotateX(-Math.PI/2);geo.translate(0,y,0);const mesh=new T.Mesh(geo,material);mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);return mesh}
 slabPolygon(rearPoints,.90,.045,stone);slabPolygon(rearPoints,.15,.735,wood);
 box(1.02,.15,.48,0,.075,.31,darkWood,center);box(1.02,.18,.024,0,.785,.663,wood,center);box(1.02,.48,.024,0,.44,.663,wood,center);handle(0,.785,.704,false,center,.18);handle(0,.60,.704,false,center,.20);obb(center,0,.325,centerW,.65);obb(left,-leftGap/2,.325,leftGap,.65,'corner-filler');
 const rightStart=.18,rightUsable=rightL-rightStart,rightCount=7,rightW=rightUsable/rightCount;
 for(let i=0;i<rightCount;i++){const x=rightStart+(i+.5)*rightW;box(rightW-.012,.18,.026,x,.785,.662,wood,right);box(rightW-.012,.48,.026,x,.44,.662,wood,right);handle(x,.785,.704,false,right,.17);handle(x+rightW/2-.07,.59,.704,true,right,.15);upper(x,rightW-.004,right)}
 box(rightL-.08,.15,.48,rightL/2,.075,.30,darkWood,right);obb(right,rightL/2,.34,rightL,.70);
 // A complete cabinet module fills the enlarged left wing beside the oven.
 box(.588,.18,.026,-.48,.785,.662,wood,left);box(.588,.48,.026,-.48,.44,.662,wood,left);handle(-.48,.785,.704,false,left,.17);handle(-.25,.59,.704,true,left,.15);upper(-.48,.588,left);box(leftGap,.73,.024,-leftGap/2,1.31,.017,stone,left);box(.588,.012,.018,-.48,1.665,.41,emissive,left);
 // Full-height slab backsplash follows the wall facets with no rear sink.
 box(centerW,.73,.024,0,1.31,.017,stone,center);box(rightL,.73,.024,rightL/2,1.31,.017,stone,right);box(rightUsable,.012,.018,rightStart+rightUsable/2,1.665,.41,emissive,right);
 [.55,1.65,2.75,3.85].forEach(x=>localLight(right,x,1.63,.32,.45,1.7));
 // Compact cooktop and straight-facing hood on the short central wall.
 box(1.08,1.59,.42,0,2.540,.23,white,center);box(1.14,.18,.51,0,1.83,.275,white,center);box(.72,.022,.36,0,1.733,.31,darkMetal,center);
 [-.22,.22].forEach(x=>{cylinder(.024,.024,.008,x,1.715,.43,emissive,center);localLight(center,x,1.70,.40,.30,1.1)});
 box(.76,.025,.49,0,.959,.35,black,center);[-.205,.205].forEach(dx=>[-.135,.135].forEach(dz=>{const z=.35+dz;cylinder(.070,.070,.015,dx,.981,z,darkMetal,center);const ring=new T.Mesh(new T.TorusGeometry(.054,.007,8,24),black);ring.rotation.x=Math.PI/2;ring.position.set(dx,.996,z);center.add(ring);[-1,1].forEach(s=>{box(.19,.018,.010,dx,1.002,z+s*.055,darkMetal,center);box(.010,.018,.19,dx+s*.055,1.002,z,darkMetal,center)})}));for(let i=0;i<4;i++)cylinder(.015,.015,.018,-.105+i*.07,.985,.60,stainless,center);
 // Island poses follow the drawing: long axis rises toward the right in plan.
 const ix=.55,iz=2.12,iw=3.90,id=1.15,islandYaw=10*deg,islandGroup=placed(ix,iz,islandYaw);
 // Hollow cabinet shell keeps the undermount sink clear inside the body.
 box(iw-.08,.06,id-.08,0,.15,0,wood,islandGroup);box(iw,.80,.035,0,.50,id/2,wood,islandGroup);box(iw-.12,.12,id-.12,0,.06,0,darkWood,islandGroup);
 box(.035,.89,id+.19,-iw/2-.012,.445,.045,wood,islandGroup);box(.035,.89,id+.19,iw/2+.012,.445,.045,wood,islandGroup);
 for(let i=0;i<5;i++){const x=-iw/2+(i+.5)*iw/5;box(iw/5-.011,.18,.026,x,.78,-id/2-.018,wood,islandGroup);box(iw/5-.011,.49,.026,x,.43,-id/2-.018,wood,islandGroup);handle(x,.78,-id/2-.052,false,islandGroup,.18)}
 // Four separate stone spans surround a real rectangular opening.
 const sinkX=.35,sinkZ=-.18,sw=.66,sd=.40,topW=iw+.14,topD=id+.38,topZ=.09,leftEdge=-topW/2,rightEdge=topW/2,backEdge=topZ-topD/2,frontEdge=topZ+topD/2;
 const holeL=sinkX-sw/2,holeR=sinkX+sw/2,holeB=sinkZ-sd/2,holeF=sinkZ+sd/2;
 box(holeL-leftEdge,.055,topD,(leftEdge+holeL)/2,.928,topZ,stone,islandGroup);box(rightEdge-holeR,.055,topD,(rightEdge+holeR)/2,.928,topZ,stone,islandGroup);
 box(sw,.055,holeB-backEdge,sinkX,.928,(backEdge+holeB)/2,stone,islandGroup);box(sw,.055,frontEdge-holeF,sinkX,.928,(frontEdge+holeF)/2,stone,islandGroup);
 box(sw,.025,sd,sinkX,.735,sinkZ,stainless,islandGroup);box(.018,.18,sd,sinkX-sw/2,.825,sinkZ,stainless,islandGroup);box(.018,.18,sd,sinkX+sw/2,.825,sinkZ,stainless,islandGroup);box(sw,.18,.018,sinkX,.825,holeB,stainless,islandGroup);box(sw,.18,.018,sinkX,.825,holeF,stainless,islandGroup);cylinder(.034,.034,.006,sinkX,.751,sinkZ,darkMetal,islandGroup);
 // Faucet is across the basin from the cook, curving back toward the working edge.
 const faucetZ=holeF+.10;pipe([[sinkX,.955,faucetZ],[sinkX,1.23,faucetZ],[sinkX,1.33,faucetZ-.08],[sinkX,1.31,faucetZ-.21],[sinkX,1.19,faucetZ-.25]],.017,brass,islandGroup);cylinder(.035,.035,.025,sinkX,.961,faucetZ,brass,islandGroup);rod([sinkX+.065,.96,faucetZ],[sinkX+.065,1.09,faucetZ],.012,brass,islandGroup);rod([sinkX+.065,1.07,faucetZ],[sinkX+.12,1.10,faucetZ],.009,brass,islandGroup);
 obb(islandGroup,0,topZ,topW,topD,'island');
 // Four cream stools, all transformed with the island.
 for(let i=0;i<4;i++){const sx=-iw/2+iw*(i+.5)/4,sz=1.04,stool=new T.Group();stool.position.set(sx,0,sz);islandGroup.add(stool);const seat=roundPanel(.55,.49,.09,.12,cream,stool);seat.rotation.x=-Math.PI/2;seat.position.set(0,.66,0);const back=roundPanel(.57,.36,.075,.12,cream,stool);back.position.set(0,.87,.23);back.rotation.x=-.10;for(const a of [-1,1])for(const b of [-1,1])rod([a*.25,.025,b*.25],[a*.19,.64,b*.17],.023,stoolWood,stool);[-1,1].forEach(s=>{rod([s*.226,.24,-.22],[s*.226,.24,.22],.014,stoolWood,stool);rod([-.226,.24,s*.22],[.226,.24,s*.22],.014,stoolWood,stool)});box(.45,.045,.39,0,.59,0,stoolWood,stool);obb(islandGroup,sx,sz,.57,.57,'stool')}
 [-iw*.25,iw*.25].forEach(x=>{cylinder(.022,.022,.95,x,2.925,.02,brass,islandGroup);cylinder(.044,.044,.15,x,2.39,.02,brass,islandGroup);cylinder(.09,.32,.33,x,2.18,.02,white,islandGroup);cylinder(.302,.302,.008,x,2.009,.02,emissive,islandGroup);const down=new T.SpotLight('#ffe7c4',3.0,5,Math.PI/3,.85,2);down.position.set(x,2.02,.02);down.target.position.set(x,0,.02);islandGroup.add(down,down.target);lights.push(down)});
 cylinder(.20,.20,.025,-.70,.972,.13,stoolWood,islandGroup);plant(-.72,.99,.13,.35,islandGroup);vase(-.47,.99,.18,.075,islandGroup);plant(rightL-.25,.95,.24,.23,right);vase(.60,.95,.19,.105,right);vase(.80,.95,.18,.085,right);
 const board=roundPanel(.25,.36,.025,.07,stoolWood,right);board.position.set(1.05,1.12,.04);board.rotation.x=-.08;
 // Preserve the restrained daylight and warm accents from the approved lighting pass.
 const hemi=new T.HemisphereLight('#f5f5f0','#aaa59c',1.15);group.add(hemi);const sun=new T.DirectionalLight('#fff9ee',1.60);sun.position.set(2.8,6,4);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-6;sun.shadow.camera.right=6;sun.shadow.camera.top=6;sun.shadow.camera.bottom=-6;sun.shadow.normalBias=.025;sun.shadow.bias=-.0002;group.add(sun);const fill=new T.DirectionalLight('#edf2f6',.40);fill.position.set(-1,3,4);group.add(fill);
 const sinkWorld=point(islandGroup,sinkX,sinkZ),faucetWorld=point(islandGroup,sinkX,faucetZ);
 return {group,colliders,lights,wallSegments,bounds:{minX:-3.20,maxX:4.80,minZ:-2.50,maxZ:4.80},island:{x:ix,z:iz,width:iw,depth:id,rotation:islandYaw,sink:{...sinkWorld,y:.93},faucet:{...faucetWorld,y:.96}},cabinetFacing:{oven:{x:Math.sin(leftYaw),z:Math.cos(leftYaw),rotation:leftYaw},stove:{x:0,z:1,rotation:0},right:{x:Math.sin(rightYaw),z:Math.cos(rightYaw),rotation:rightYaw}},plan:{interiorAngles:[149.5,150.1],assumedWallLengthsMeters:[leftL,centerW,rightL],assumedCeilingHeightMeters:ceilingHeight,stoveFrontSpanMeters:stoveFaceW,dimensionBasis:'Spacious design assumptions; drawing used for angles and arrangement only',approximate:true},materials:{wood,white,stone}};
}
