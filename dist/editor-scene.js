/**
 * Modular kitchen scene, independent of the editor's state/UI.
 * Item pose: x/z are world metres, y is bottom elevation, rotation is degrees.
 * createEditorScene(THREE, scene, {catalog, TYPES}) -> async API:
 *   root; objects: Map<id,{object:THREE.Group,item}>; bounds; wallSegments;
 *   await rebuild(items, settings); await setSurface(surface);
 *   pickables(): THREE.Mesh[]; getColliders(): oriented rectangles; dispose().
 * Rebuild retains unchanged groups and updates poses in place. Changed groups
 * are replaced; rebind controls to objects.get(selectedId).object afterward.
 * rebuild stats are available at root.userData.rebuildStats. Removed geometry is disposed;
 * shared finish materials/textures remain cached until dispose().
 * All selectable descendants have userData.itemId. Sink/faucet belong to island.
 * followsId on default stools/pendants/appliances is a state-controller hint:
 * poses remain WORLD coordinates, never implicit parent-relative coordinates.
 */
import {DEFAULT_WALLS,isRoomWall,wallEndpoints} from './walls.js';
const DEG = Math.PI / 180;
function planPoint(originX, originZ, yaw, x, z) {
  const a = yaw * DEG;
  return { x: originX + Math.cos(a) * x + Math.sin(a) * z, z: originZ - Math.sin(a) * x + Math.cos(a) * z };
}
function makeDefaultItems() {
  const items = [];
  const add = (id, typeId, name, pose, dimensions, extras = {}) => items.push({ id, typeId, name, seriesId: 'catalina', finishId: 'nocce-3', x: pose.x, z: pose.z, y: 0, rotation: pose.rotation || 0, ...dimensions, ...extras });
  const right = (x,z) => ({...planPoint(.7,-1.8,-29.9,x,z),rotation:-29.9});
  const left = (x,z) => ({...planPoint(-.7,-1.8,30.5,x,z),rotation:30.5});
  const insetL = .65*Math.tan(30.5*DEG/2), insetR = .65*Math.tan(29.9*DEG/2);
  add('oven-left','oven-tower','Double oven tower',left(-1.19,.32),{width:.82,height:3.35,depth:.64},{finishId:'bianco-matte'});
  add('base-left','base-cabinet','Left base cabinet',left(-.39,.325),{width:.78,height:.90,depth:.65},{frontInsetRight:insetL,countertop:true,backsplash:true});
  add('upper-left','wall-single','Left upper cabinet',left(-.48,.19),{width:.588,height:1.35,depth:.36},{finishId:'bianco-matte',y:1.69,underLight:false});
  add('display-left','display-cabinet','Left display cabinet',left(-.48,.19),{width:.588,height:.30,depth:.36},{finishId:'bianco-matte',y:3.04});
  add('base-cooking','base-cabinet','Cooking base cabinet',{x:0,z:-1.475},{width:1.4,height:.90,depth:.65},{frontInsetLeft:insetL,frontInsetRight:insetR,countertop:true,backsplash:true});
  add('cooktop-main','cooktop','Gas cooktop',{x:0,z:-1.45},{width:.76,height:.06,depth:.49},{y:.945,followsId:'base-cooking'});
  add('hood-main','hood','White canopy hood',{x:0,z:-1.55},{width:1.08,height:1.59,depth:.45},{y:1.74,finishId:'bianco-matte'});
  const start=.18,cw=(4.4-start)/7;
  for(let i=0;i<7;i++){
    const frontX=start+(i+.5)*cw;
    const bodyW=i===0?cw+start:cw, bodyX=i===0?bodyW/2:frontX;
    add(`base-right-${i+1}`,'base-cabinet',`Right base ${i+1}`,right(bodyX,.325),{width:bodyW,height:.90,depth:.65},{frontInsetLeft:i===0?insetR:0,countertop:true,backsplash:true,decor:i===6?'plant':undefined});
    add(`upper-right-${i+1}`,'wall-single',`Right upper ${i+1}`,right(frontX,.19),{width:cw-.004,height:1.35,depth:.36},{finishId:'bianco-matte',y:1.69,underLight:[0,2,4,6].includes(i)});
    add(`display-right-${i+1}`,'display-cabinet',`Right display ${i+1}`,right(frontX,.19),{width:cw-.004,height:.30,depth:.36},{finishId:'bianco-matte',y:3.04});
  }
  const island={x:.55,z:2.12,rotation:10};
  add('island-main','island','Island with sink',island,{width:3.9,height:.90,depth:1.15},{sink:true,sinkOffsetX:.35,sinkOffsetZ:-.18,countertop:true,decor:'plant'});
  for(let i=0;i<4;i++){
    const q=planPoint(island.x,island.z,10,-3.9/2+3.9*(i+.5)/4,1.04);
    add(`stool-${i+1}`,'stool',`Counter stool ${i+1}`,{...q,rotation:10},{width:.57,height:1.06,depth:.57},{followsId:'island-main'});
  }
  for(let i=0;i<2;i++){
    const q=planPoint(island.x,island.z,10,(i?1:-1)*3.9*.25,.02);
    add(`pendant-${i+1}`,'pendant',`Island pendant ${i+1}`,{...q,rotation:10},{width:.64,height:1.39,depth:.64},{y:2.01,finishId:'bianco-matte',followsId:'island-main'});
  }
  return [...items,...DEFAULT_WALLS.map(w=>({...w}))];
}
export const DEFAULT_ITEMS = makeDefaultItems();
export const DEFAULT_ROOM_SETTINGS = { ceilingHeight:3.4, surfaceId:'hermitage', showWalls:true, lightScale:1 };

export async function createEditorScene(T, scene, { catalog = {}, TYPES = [] } = {}) {
  const root = new T.Group();root.name='Editable kitchen';scene.add(root);
  const fixed = new T.Group(), dynamic = new T.Group();root.add(fixed,dynamic);
  const objects = new Map(), materialCache = new Map(), textureCache = new Map(), materialSet = new Set();
  const lights = [], warnings = [];
  let itemMeshes = [], serial=0, surfaceSerial=0, disposed=false, currentSettings={...DEFAULT_ROOM_SETTINGS};
  const bounds={minX:-3.2,maxX:4.8,minZ:-2.5,maxZ:4.8};
  const loader=new T.TextureLoader();
  const material=(color,roughness=.6,metalness=0)=>{const m=new T.MeshStandardMaterial({color,roughness,metalness});materialSet.add(m);return m};
  const white=material('#e5e1d9',.76),wall=material('#d8d3c9',.96),grout=material('#c6bbaa',.9),brass=material('#ae8650',.28,.78),black=material('#141818',.24,.28),glass=material('#161f21',.12,.52),cream=material('#e8dfcf',.95),stoolWood=material('#947455',.65),darkWood=material('#534435',.9),ceramic=material('#ddd5c5',.3),green=material('#486143',.85),stems=material('#576541',.85),stainless=material('#a3a7a5',.3,.83),darkMetal=material('#262b2a',.45,.75),niche=material('#d4c5aa',.7);
  const emissive=new T.MeshStandardMaterial({color:'#fff0cd',emissive:'#ffe7c4',emissiveIntensity:.35});materialSet.add(emissive);
  const displayGlass=new T.MeshPhysicalMaterial({color:'#fff9ed',transparent:true,opacity:.10,roughness:.09,metalness:.05,depthWrite:false});materialSet.add(displayGlass);
  const stone=material('#ffffff',.29);
  const array=value=>Array.isArray(value)?value:value&&typeof value==='object'?Object.values(value):[];
  const seriesList=()=>array(catalog.SERIES||catalog.series||catalog);
  const typesList=()=>array(TYPES?.length||Object.keys(TYPES||{}).length?TYPES:(catalog.TYPES||catalog.types));
  // Imported visuals are data, never executable URLs or arbitrary requests.
  function visualOf(item){
    const v=item.catalogVisual||{},out={};
    if(v.approximateFinish===true)out.approximateFinish=true;
    if(['slab','shaker','slim-shaker'].includes(v.profile))out.profile=v.profile;
    for(const key of ['doors','drawers'])if(Number.isInteger(v[key])&&v[key]>=0&&v[key]<=16)out[key]=v[key];
    if(Array.isArray(v.baseColorFactor)&&[3,4].includes(v.baseColorFactor.length)&&v.baseColorFactor.slice(0,3).every(n=>Number.isFinite(n)&&n>=0&&n<=1))out.baseColorFactor=v.baseColorFactor.slice(0,3);
    if(Number.isFinite(v.roughness))out.roughness=Math.max(.15,Math.min(1,v.roughness));
    if(typeof v.finishImage==='string'&&/^assets\/private-catalogs\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_.-]+\.(?:png|jpe?g|webp|avif)$/i.test(v.finishImage)&&!v.finishImage.includes('..'))out.finishImage=v.finishImage;
    return out;
  }
  const typeOf=item=>{const t=typesList().find(t=>t.id===item.typeId)||{},v=visualOf(item);return {...t,...(v.doors!=null?{doors:v.doors}:{}),...(v.drawers!=null?{drawers:v.drawers}:{})}};
  const seriesOf=item=>seriesList().find(s=>s.id===item.seriesId)||{};
  const finishOf=item=>array(seriesOf(item).finishes).find(f=>f.id===item.finishId)||array(catalog.finishes||catalog.FINISHES).find(f=>f.id===item.finishId);
  const urlOf=value=>typeof value==='string'?value:value?.image||value?.textureUrl||value?.texture||value?.url||value?.swatch;
  async function texture(url,transform={}) {
    if(!url)return null;
    const key=JSON.stringify([url,transform]);
    if(!textureCache.has(key))textureCache.set(key,loader.loadAsync(url).then(tx=>{
      tx.colorSpace=T.SRGBColorSpace;tx.wrapS=tx.wrapT=T.RepeatWrapping;tx.anisotropy=8;
      const repeat=transform.repeat||[1,1],offset=transform.offset||[0,0];tx.repeat.set(...repeat);tx.offset.set(...offset);
      if(transform.rotation)tx.rotation=transform.rotation;return tx;
    }).catch(()=>{warnings.push(`Could not load material sample: ${url}`);return null}));
    return textureCache.get(key);
  }
  // Repetition occurs inside the approved sample crop, not across branding or
  // drawer seams outside that crop. Fragment wrapping preserves interpolation.
  function configureSampleWrap(mat){
    if(!mat.userData.cropUniforms){
      mat.userData.cropUniforms={sampleCropRepeat:{value:new T.Vector2(1,1)},sampleCropOffset:{value:new T.Vector2()}};
      mat.onBeforeCompile=shader=>{
        Object.assign(shader.uniforms,mat.userData.cropUniforms);
        shader.fragmentShader='uniform vec2 sampleCropRepeat;\nuniform vec2 sampleCropOffset;\n'+shader.fragmentShader;
        const sample='texture2D( map, sampleCropOffset + fract((vMapUv - sampleCropOffset) / max(sampleCropRepeat, vec2(0.0001))) * sampleCropRepeat )';
        shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',T.ShaderChunk.map_fragment.replace('texture2D( map, vMapUv )',sample));
      };
      mat.customProgramCacheKey=()=> 'cropped-physical-sample-v1';
    }
    mat.userData.cropUniforms.sampleCropRepeat.value.copy(mat.map?.repeat||new T.Vector2(1,1));
    mat.userData.cropUniforms.sampleCropOffset.value.copy(mat.map?.offset||new T.Vector2());
  }
  function physicalUVs(object,item){
    const yaw=(item.rotation||0)*DEG,c=Math.cos(yaw),s=Math.sin(yaw),point=new T.Vector3(),normal=new T.Vector3(),normalMatrix=new T.Matrix3();
    object.updateWorldMatrix(true,true);
    object.traverse(mesh=>{
      if(!mesh.isMesh||!mesh.material.userData.physicalScale)return;
      const scale=mesh.material.userData.physicalScale,pos=mesh.geometry.attributes.position,norm=mesh.geometry.attributes.normal,uv=new Float32Array(pos.count*2);
      normalMatrix.getNormalMatrix(mesh.matrixWorld);
      for(let i=0;i<pos.count;i++){
        point.fromBufferAttribute(pos,i).applyMatrix4(mesh.matrixWorld);normal.fromBufferAttribute(norm,i).applyMatrix3(normalMatrix).normalize();
        const along=c*point.x-s*point.z,across=s*point.x+c*point.z,nAlong=c*normal.x-s*normal.z,nAcross=s*normal.x+c*normal.z;
        if(Math.abs(normal.y)>.6){uv[i*2]=along/scale[0];uv[i*2+1]=across/scale[1]}
        else{uv[i*2]=(Math.abs(nAcross)>=Math.abs(nAlong)?along:across)/scale[0];uv[i*2+1]=point.y/scale[1]}
      }
      mesh.geometry.setAttribute('uv',new T.BufferAttribute(uv,2));
    });
  }
  // Stone is a slab, not a repeating finish. A run is a connected component of
  // coplanar, similarly oriented surfaces. Tops and backsplashes are separate
  // planes; all four island sink spans belong to a single independent top.
  function mapStoneSlabs(){
    root.updateMatrixWorld(true);
    const records=[],point=new T.Vector3();
    objects.forEach(({object,item})=>{
      const degrees=((item.rotation||0)%360+360)%360;
      const angle=(Math.round(degrees*1000)/1000%360)*DEG,c=Math.cos(angle),s=Math.sin(angle);
      const owner=item.typeId==='island'?item.id:'';
      object.traverse(mesh=>{
        if(!mesh.isMesh||mesh.material!==stone)return;
        const position=mesh.geometry.attributes.position,points=[];
        let minAlong=Infinity,maxAlong=-Infinity,minAcross=Infinity,maxAcross=-Infinity,minY=Infinity,maxY=-Infinity;
        for(let i=0;i<position.count;i++){
          point.fromBufferAttribute(position,i).applyMatrix4(mesh.matrixWorld);
          const along=c*point.x-s*point.z,across=s*point.x+c*point.z;
          points.push([along,across,point.y]);
          minAlong=Math.min(minAlong,along);maxAlong=Math.max(maxAlong,along);
          minAcross=Math.min(minAcross,across);maxAcross=Math.max(maxAcross,across);
          minY=Math.min(minY,point.y);maxY=Math.max(maxY,point.y);
        }
        const kind=maxY-minY>Math.max(.15,(maxAcross-minAcross)*3)?'backsplash':'countertop';
        records.push({mesh,points,angle,owner,itemId:item.id,kind,
          minU:minAlong,maxU:maxAlong,minV:kind==='backsplash'?minY:minAcross,maxV:kind==='backsplash'?maxY:maxAcross,
          plane:kind==='backsplash'?(minAcross+maxAcross)/2:maxY});
      });
    });
    const parents=records.map((_,i)=>i);
    function find(i){while(parents[i]!==i){parents[i]=parents[parents[i]];i=parents[i]}return i}
    function adjacent(a,b){
      if(a.kind!==b.kind||a.owner!==b.owner||Math.abs(a.angle-b.angle)>1e-7||Math.abs(a.plane-b.plane)>.006)return false;
      if(a.kind==='backsplash'&&(Math.abs(a.minV-b.minV)>.006||Math.abs(a.maxV-b.maxV)>.006))return false;
      const overlapU=Math.min(a.maxU,b.maxU)-Math.max(a.minU,b.minU);
      const overlapV=Math.min(a.maxV,b.maxV)-Math.max(a.minV,b.minV);
      // Small construction reveals may connect a run; a point-touch or a true
      // aisle does not. Actual depth/elevation is part of the geometric check.
      return overlapU>=-.012&&overlapV>=-.012&&(overlapU>1e-5||overlapV>1e-5);
    }
    for(let i=0;i<records.length;i++)for(let j=i+1;j<records.length;j++)if(adjacent(records[i],records[j]))parents[find(j)]=find(i);
    const groups=new Map();records.forEach((record,i)=>{const id=find(i);if(!groups.has(id))groups.set(id,[]);groups.get(id).push(record)});
    const summaries=[];
    for(const recordsInRun of groups.values()){
      const minU=Math.min(...recordsInRun.map(r=>r.minU)),maxU=Math.max(...recordsInRun.map(r=>r.maxU));
      const minV=Math.min(...recordsInRun.map(r=>r.minV)),maxV=Math.max(...recordsInRun.map(r=>r.maxV));
      const spanU=Math.max(maxU-minU,.001),spanV=Math.max(maxV-minV,.001);
      const run={id:`slab-${summaries.length+1}`,kind:recordsInRun[0].kind,rotation:recordsInRun[0].angle,
        minU,maxU,minV,maxV,itemIds:[...new Set(recordsInRun.map(r=>r.itemId))]};
      summaries.push(run);
      for(const record of recordsInRun){
        const uv=new Float32Array(record.points.length*2);
        record.points.forEach(([along,across,y],i)=>{
          // One affine map over the entire run, including edge faces and sink
          // cutout walls. No fract(), repeated tiles, or per-mesh restarts.
          uv[i*2]=Math.max(0,Math.min(1,(along-minU)/spanU));
          uv[i*2+1]=Math.max(0,Math.min(1,((record.kind==='backsplash'?y:across)-minV)/spanV));
        });
        record.mesh.geometry.setAttribute('uv',new T.BufferAttribute(uv,2));
        record.mesh.userData.stoneRun=run;
      }
    }
    root.userData.stoneRuns=summaries;
  }
  async function finishMaterial(item){
    if(isRoomWall(item))return wall;
    const visual=visualOf(item),imported=item.catalogVisual!=null&&typeof item.catalogVisual==='object',key=JSON.stringify([item.seriesId,item.finishId,imported,visual.finishImage,visual.baseColorFactor,visual.roughness,visual.approximateFinish]);
    if(materialCache.has(key))return materialCache.get(key);
    const pending=(async()=>{
      if(imported){
        // catalogVisual is authoritative. imageUrl is a door thumbnail and is
        // intentionally never considered a surface texture or finish color.
        const tx=await texture(visual.finishImage);
        if(disposed)return white;
        const m=material(tx||visual.baseColorFactor?'#ffffff':'#a6a6a6',visual.roughness??.8);
        if(visual.baseColorFactor)m.color.setRGB(...visual.baseColorFactor,T.LinearSRGBColorSpace);
        if(tx){m.map=tx;m.userData.physicalScale=[.65,1.45];configureSampleWrap(m)}
        m.userData.approximateFinish=!!visual.approximateFinish||(!tx&&!visual.baseColorFactor);
        if(!tx&&visual.finishImage)m.userData.sampleUnavailable=true;
        m.name=visual.approximateFinish?'Approximate manufacturer photo color':m.userData.approximateFinish?'Approximate neutral finish':'Imported manufacturer finish';
        return m;
      }
      const f=finishOf(item);let source=urlOf(f),transform=f?.uv||f?.textureTransform||f?.transform||{},rough=f?.roughness??(/gloss/i.test(f?.name||'')?.22:.85);
      if(visual.finishImage){source=visual.finishImage;transform={};rough=visual.roughness??.8}
      else if(visual.roughness!=null)rough=visual.roughness;
      if(!source&&item.finishId==='nocce-3'){source='./assets/wood-reference.png';transform={repeat:[.37,.9],offset:[.60,.05]};rough=.91}
      if(!source&&item.finishId==='bianco-matte'&&visual.roughness==null)return white;
      const tx=await texture(source,transform);
      if(disposed)return white;
      rough=visual.roughness??rough;
      const m=material(tx?'#ffffff':(f?.color||'#d5d0c7'),rough);
      if(tx){m.map=tx;m.userData.physicalScale=f?.kind==='solid'?[1.2,1.8]:[.65,1.45];configureSampleWrap(m)}
      if(!tx&&source)m.userData.sampleUnavailable=true;
      m.name=visual.finishImage?'Imported manufacturer finish':f?.name||item.finishId||'Cabinet finish';return m;
    })();materialCache.set(key,pending);return pending;
  }
  async function setSurface(surface){
    const surfaceTicket=++surfaceSerial;
    const s=surface||{id:'hermitage',image:'./assets/stone-reference.png',textureTransform:{repeat:[.84,.56],offset:[.15,.36]}};
    const transform=s.textureTransform||s.transform||s.crop||{repeat:s.repeat||[1,1],offset:s.offset||[0,0]};
    const tx=await texture(urlOf(s),transform);
    if(disposed||surfaceTicket!==surfaceSerial)return;
    if(tx){tx.wrapS=tx.wrapT=T.ClampToEdgeWrapping;tx.needsUpdate=true}
    stone.map=tx;stone.color.set(s.color||'#ffffff');stone.roughness=s.roughness??.29;stone.needsUpdate=true;
    return {loaded:!!tx,name:s.name||s.id||'Surface'};
  }
  function mesh(geometry,mat,parent){const o=new T.Mesh(geometry,mat);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o}
  function box(w,h,d,x,y,z,m=white,p=dynamic){const o=mesh(new T.BoxGeometry(Math.max(w,.001),Math.max(h,.001),Math.max(d,.001)),m,p);o.position.set(x,y,z);return o}
  // A small real edge radius catches grazing light without inflating the
  // cabinet dimensions. This is front joinery, not a rounded furniture style.
  function beveledBox(w,h,d,x,y,z,m,p){
    const r=Math.min(.0012,w/12,h/12,d/8),shape=new T.Shape();
    const hw=w/2-r,hh=h/2-r;
    shape.moveTo(-hw,-hh);shape.lineTo(hw,-hh);shape.lineTo(hw,hh);shape.lineTo(-hw,hh);shape.closePath();
    const geometry=new T.ExtrudeGeometry(shape,{depth:d-2*r,bevelEnabled:true,bevelSize:r,bevelThickness:r,bevelSegments:2,curveSegments:1,steps:1});
    geometry.translate(0,0,-d/2+r);
    const o=mesh(geometry,m,p);o.position.set(x,y,z);o.userData.edgeRadius=r;return o;
  }
  function cylinder(rt,rb,h,x,y,z,m,p,n=24){const o=mesh(new T.CylinderGeometry(rt,rb,h,n),m,p);o.position.set(x,y,z);return o}
  function sphere(r,x,y,z,m,p,sx=1,sy=1,sz=1){const o=mesh(new T.SphereGeometry(r,14,10),m,p);o.position.set(x,y,z);o.scale.set(sx,sy,sz);return o}
  function rod(a,b,r,m,p){const av=new T.Vector3(...a),bv=new T.Vector3(...b),delta=bv.clone().sub(av);const o=cylinder(r,r,delta.length(),...(av.clone().add(bv).multiplyScalar(.5).toArray()),m,p,10);o.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),delta.normalize());return o}
  function pipe(points,r,m,p){const curve=new T.CatmullRomCurve3(points.map(q=>new T.Vector3(...q)));return mesh(new T.TubeGeometry(curve,30,r,8,false),m,p)}
  function rounded(w,h,d,r,m,p){r=Math.min(r,w/3,h/3);const s=new T.Shape();s.moveTo(-w/2+r,-h/2);s.lineTo(w/2-r,-h/2);s.quadraticCurveTo(w/2,-h/2,w/2,-h/2+r);s.lineTo(w/2,h/2-r);s.quadraticCurveTo(w/2,h/2,w/2-r,h/2);s.lineTo(-w/2+r,h/2);s.quadraticCurveTo(-w/2,h/2,-w/2,h/2-r);s.lineTo(-w/2,-h/2+r);s.quadraticCurveTo(-w/2,-h/2,-w/2+r,-h/2);const g=new T.ExtrudeGeometry(s,{depth:d,bevelEnabled:true,bevelSize:.009,bevelThickness:.009,bevelSegments:2,curveSegments:8});g.translate(0,0,-d/2);return mesh(g,m,p)}
  function handle(x,y,z,vertical,p,length=.16){const a=vertical?[x,y-length/2,z]:[x-length/2,y,z],b=vertical?[x,y+length/2,z]:[x+length/2,y,z];rod(a,b,.008,brass,p);[a,b].forEach(q=>rod([q[0],q[1],z-.025],q,.006,brass,p))}
  function vase(x,y,z,s,p){const pts=[[0,0],[.58,0],[.7,.14],[.85,.5],[.72,.84],[.36,1.04],[.32,1.32],[.39,1.35]].map(([a,b])=>new T.Vector2(a*s,b*s));const o=mesh(new T.LatheGeometry(pts,20),ceramic,p);o.position.set(x,y,z);cylinder(s*.32,s*.32,.005,x,y+s*1.345,z,darkWood,p)}
  function plant(x,y,z,s,p){vase(x,y,z,s*.52,p);const sy=y+s*.55;for(let i=0;i<6;i++){const a=i*2.399,e=[x+Math.cos(a)*s*.54,sy+s*(.65+(.5+.5*Math.sin(i*5))*.45),z+Math.sin(a)*s*.54];pipe([[x,sy,z],[(x+e[0])/2,sy+s*.5,(z+e[2])/2],e],.003,stems,p);for(let j=0;j<4;j++){const t=.4+j*.18,o=sphere(s*.14,x+(e[0]-x)*t+Math.cos(a+.8)*s*.1,sy+(e[1]-sy)*t,z+(e[2]-z)*t+Math.sin(a+.8)*s*.1,green,p,1,.23,.48);o.rotation.set(.4,a,.5)}}}
  function pointLight(x,y,z,intensity,distance,p){const l=new T.PointLight('#ffe7c4',intensity,distance,2);l.position.set(x,y,z);l.userData.baseIntensity=intensity;p.add(l);lights.push(l);return l}
  function surfacePolygon(points,y,thickness,m,p){const s=new T.Shape();points.forEach(([x,z],i)=>i?s.lineTo(x,-z):s.moveTo(x,-z));s.closePath();const g=new T.ExtrudeGeometry(s,{depth:thickness,bevelEnabled:false});g.rotateX(-Math.PI/2);g.translate(0,y,0);return mesh(g,m,p)}
  function footprint(item,w,d){const left=Math.min(Math.max(+item.frontInsetLeft||0,0),w*.35),right=Math.min(Math.max(+item.frontInsetRight||0,0),w*.35);return {left,right,faceW:w-left-right,faceX:(left-right)/2,points:[[-w/2,-d/2],[w/2,-d/2],[w/2-right,d/2],[-w/2+left,d/2]]}}
  function profile(item){const s=seriesOf(item);const value=visualOf(item).profile||item.doorProfile||s.profile||s.doorProfile||s.style||item.seriesId||'slab';return /slim|luna/i.test(value)?'slim-shaker':/shaker|tuscany/i.test(value)?'shaker':'slab'}
  function door(w,h,x,y,z,mat,item,p,{glassDoor=false,horizontalHandle=false,handleSide=1,noHandle=false,role=null}={}){
    const front=new T.Group();front.name=role||(glassDoor?'display-front':horizontalHandle?'drawer-front':'door-front');front.userData.front={role:front.name,profile:profile(item),width:w,height:h};p.add(front);p=front;
    const kind=profile(item),border=kind==='shaker'?.063:kind==='slim-shaker'?.024:.018;
    front.userData.front.frameWidth=kind==='slab'&&!glassDoor?0:Math.min(border,w*.20,h*.22);
    if(kind==='slab'&&!glassDoor)beveledBox(w,h,.026,x,y,z,mat,p);
    else{
      const b=Math.min(border,w*.20,h*.22);box(w-2*b,h-2*b,.012,x,y,z-.012,glassDoor?displayGlass:mat,p);
      beveledBox(b,h,.032,x-w/2+b/2,y,z+.002,mat,p);beveledBox(b,h,.032,x+w/2-b/2,y,z+.002,mat,p);
      beveledBox(w-2*b,b,.032,x,y-h/2+b/2,z+.002,mat,p);beveledBox(w-2*b,b,.032,x,y+h/2-b/2,z+.002,mat,p);
    }
    if(!noHandle){const hx=horizontalHandle?x:x+handleSide*(w/2-.055),hy=horizontalHandle?y:y+Math.min(.12,h*.2);handle(hx,hy,z+.045,!horizontalHandle,p,Math.min(.17,h*.55,w*.65))}
  }
  function cabinetShell(w,h,d,mat,p,base=false){const toe=base?Math.min(.14,h*.16):0,thick=.018;box(w,h-toe,thick,0,toe+(h-toe)/2,-d/2+thick/2,mat,p);box(thick,h-toe,d,-w/2+thick/2,toe+(h-toe)/2,0,mat,p);box(thick,h-toe,d,w/2-thick/2,toe+(h-toe)/2,0,mat,p);box(w,thick,d,0,toe+thick/2,0,mat,p);box(w,thick,d,0,h-thick/2,0,mat,p);if(base)box(w-.04,toe,d-.10,0,toe/2,-.035,darkWood,p);return toe}
  function cabinetFronts(item,p,mat,{w,h,d,doors,drawers,base=true,open=false}={}){
    const toe=base?Math.min(.14,h*.16):0,available=h-toe-.014,z=d/2+.012;
    if(open){for(let i=1;i<=3;i++)box(w-.035,.018,d-.035,0,toe+(h-toe)*i/4,0,mat,p);return}
    const drawerCount=Math.max(0,drawers??0),doorCount=Math.max(0,doors??(w>.72?2:1));
    let drawerTotal=drawerCount?(doorCount?Math.min(.19*drawerCount,available*.45):available):0;
    const dh=drawerCount?(drawerTotal/drawerCount):0;
    for(let i=0;i<drawerCount;i++)door(w-.012,dh-.009,0,h-.007-(i+.5)*dh,z,mat,item,p,{horizontalHandle:true});
    const remaining=available-drawerTotal;
    for(let i=0;i<doorCount;i++){const dw=w/doorCount,xx=-w/2+(i+.5)*dw;door(dw-.009,remaining-.008,xx,toe+.007+remaining/2,z,mat,item,p,{handleSide:doorCount===2?(i===0?1:-1):1})}
  }
  function makeCounter(item,p,w,h,d){
    if(item.countertop===false)return;
    const fp=footprint(item,w,d);surfacePolygon(fp.points,h,.045,stone,p);
    if(item.backsplash){box(w,.745,.023,0,h+.045+.745/2,-d/2+.012,stone,p)}
  }
  function makeBase(item,p,m,type){
    const {width:w,height:h,depth:d}=item,fp=footprint(item,w,d),kind=(type.kind||type.geometry?.kind||item.typeId).toLowerCase();
    if(fp.left||fp.right){surfacePolygon(fp.points,.14,Math.max(.1,h-.14),m,p);box(fp.faceW-.04,.14,d-.12,fp.faceX,.07,-.03,darkWood,p)}else cabinetShell(w,h,d,m,p,true);
    const front=new T.Group();front.position.x=fp.faceX;p.add(front);
    let drawers=type.drawers??type.geometry?.drawers??1,doors=type.doors??type.geometry?.doors??(fp.faceW>.72?2:1);
    if(/drawer/.test(kind)){drawers=item.drawerCount??type.drawers??type.geometry?.drawers??3;doors=0}
    if(item.drawerCount!=null){drawers=item.drawerCount;if(drawers>=2)doors=0}
    const visual=visualOf(item);drawers=visual.drawers??drawers;doors=visual.doors??doors;
    cabinetFronts(item,front,m,{w:fp.faceW,h,d,drawers,doors,base:true,open:/open|shelf/.test(kind)});
    makeCounter(item,p,w,h,d);
    if(item.decor==='plant')plant(w*.18,h+.045,-d*.10,Math.min(.23,w*.32),p);
  }
  function makeWall(item,p,m,type,display=false){
    const {width:w,height:h,depth:d}=item;cabinetShell(w,h,d,m,p,false);
    if(display){
      box(w-.045,h-.03,.012,0,h/2,-d/2+.025,niche,p);const count=Math.max(0,type.doors??type.geometry?.doors??1);
      for(let i=0;i<count;i++){const dw=w/count,x=-w/2+(i+.5)*dw;door(dw-.009,h-.009,x,h/2,d/2+.012,m,item,p,{glassDoor:true,noHandle:true});handle(x,Math.min(.035,h*.15),d/2+.055,false,p,Math.min(.055,dw*.35))}
      box(w-.06,.010,.035,0,h-.02,d/2-.045,emissive,p);if(h>.22){vase(-w*.18,.025,0,Math.min(.10,h*.28),p);vase(w*.19,.025,0,Math.min(.075,h*.23),p)}
    }else{
      cabinetFronts(item,p,m,{w,h,d,base:false,doors:type.doors??type.geometry?.doors??(w>.8?2:1),drawers:type.drawers??type.geometry?.drawers??0,open:/open|shelf/.test(item.typeId)});
      box(w-.04,.01,.018,0,.005,d/2-.02,emissive,p);if(item.underLight)pointLight(0,-.06,d/2-.09,.45,1.7,p)
    }
  }
  function makeOvenFace(w,h,x,y,z,p){const face=new T.Group();face.name='appliance-front';face.userData.applianceFront=true;p.add(face);p=face;box(w,h,.035,x,y,z,black,p);box(w-.09,h*.66,.012,x,y-.06,z+.025,glass,p);box(w-.05,.075,.014,x,y+h*.35,z+.028,darkMetal,p);rod([x-w*.39,y+h*.20,z+.07],[x+w*.39,y+h*.20,z+.07],.013,stainless,p);box(.13,.023,.007,x,y+h*.36,z+.04,darkMetal,p)}
  function makeOvenTower(item,p,m){
    const {width:w,height:h,depth:d}=item;cabinetShell(w,h,d,m,p,true);const z=d/2+.018,scale=Math.min(1,h/2.75),single=/single-oven/.test(item.typeId),microwave=/microwave/.test(item.typeId),drawerCount=visualOf(item).drawers??(single?1:2),lower=(visualOf(item).drawers==null?(drawerCount===1?.34:.50):Math.max(.16,.16+drawerCount*.17))*scale;
    for(let i=0;i<drawerCount;i++)door(w-.04,.17*scale,0,(.23+i*.185)*scale,z,m,item,p,{horizontalHandle:true});
    const oh=.70*scale;makeOvenFace(w-.12,oh,0,lower+oh/2+.10*scale,z+.01,p);
    let ovenTop=lower+oh+.10*scale;
    if(!single){const secondH=microwave?.42*scale:oh;makeOvenFace(w-.12,secondH,0,ovenTop+secondH/2+.025,z+.01,p);ovenTop+=secondH+.025}
    const displayH=h>2.7?.30:0,upperH=Math.max(.16,h-displayH-.06-ovenTop),upperDoors=visualOf(item).doors??1;for(let i=0;i<upperDoors;i++)door(w/upperDoors-.04,upperH,-w/2+(i+.5)*w/upperDoors,ovenTop+upperH/2,z,m,item,p);
    if(displayH){box(w-.10,displayH-.06,.018,0,h-displayH/2-.02,z+.005,niche,p);door(w-.04,displayH,0,h-displayH/2,z+.02,m,item,p,{glassDoor:true,noHandle:true});vase(-w*.16,h-displayH+.03,d/2-.08,.08,p);vase(w*.16,h-displayH+.03,d/2-.08,.065,p);box(w-.09,.01,.035,0,h-.025,d/2-.025,emissive,p)}
  }
  function makeApplianceCabinet(item,p,m,type){
    const {width:w,height:h,depth:d}=item,wallMount=/^wall-/.test(item.typeId);cabinetShell(w,h,d,m,p,!wallMount);
    const microwave=/microwave/.test(item.typeId),faceH=Math.min(microwave?.40:.61,h*.62),faceY=wallMount?faceH/2+.015:h-faceH/2-.04;
    makeOvenFace(w-.06,faceH,0,faceY,d/2+.02,p);
    if(wallMount){const upperH=h-faceH-.04;if(upperH>.08)door(w-.012,upperH,0,h-upperH/2,d/2+.012,m,item,p)}
    else{const drawerH=Math.max(.12,faceY-faceH/2-.16);door(w-.012,drawerH,0,.14+drawerH/2,d/2+.012,m,item,p,{horizontalHandle:true});makeCounter(item,p,w,h,d)}
  }
  function makeCooktop(item,p){const {width:w,height:h,depth:d}=item;box(w,Math.min(.025,h),d,0,.0125,0,black,p);[-1,1].forEach(a=>[-1,1].forEach(b=>{const x=a*w*.265,z=b*d*.265,r=Math.min(w*.095,d*.15);cylinder(r,r,.014,x,.035,z,darkMetal,p);const ring=mesh(new T.TorusGeometry(r*.78,.007,8,20),black,p);ring.rotation.x=Math.PI/2;ring.position.set(x,.048,z);[-1,1].forEach(s=>{box(r*2.7,.014,.01,x,.054,z+s*r*.75,darkMetal,p);box(.01,.014,r*2.7,x+s*r*.75,.054,z,darkMetal,p)})}));for(let i=0;i<4;i++)cylinder(.014,.014,.018,-w*.15+i*w*.1,.035,d*.43,stainless,p)}
  function makeHood(item,p,m){const {width:w,height:h,depth:d}=item;box(w,h-.16,d,0,(h+.16)/2,-.015,m,p);box(w+.055,.16,d+.07,0,.08,.015,m,p);box(w*.68,.022,d*.72,0,-.005,.045,darkMetal,p);[-.22,.22].forEach(x=>{const xx=x*w;cylinder(.023,.023,.007,xx,-.02,d*.30,emissive,p);pointLight(xx,-.04,d*.25,.30,1.1,p)})}
  function sinkCounter(p,{w,h,d,centerZ=0,sinkX=0,sinkZ=0,overhang=.04,faucet=true}){
    const tw=w+overhang*2,td=d+overhang*2,left=-tw/2,right=tw/2,back=centerZ-td/2,front=centerZ+td/2;
    const sw=Math.min(.66,w*.64),sd=Math.min(.40,d*.44),sx=Math.max(left+sw/2+.08,Math.min(right-sw/2-.08,sinkX)),sz=Math.max(back+sd/2+.08,Math.min(front-sd/2-.14,sinkZ));
    const hl=sx-sw/2,hr=sx+sw/2,hb=sz-sd/2,hf=sz+sd/2;
    box(hl-left,.045,td,(left+hl)/2,h+.0225,centerZ,stone,p);box(right-hr,.045,td,(right+hr)/2,h+.0225,centerZ,stone,p);box(sw,.045,hb-back,sx,h+.0225,(back+hb)/2,stone,p);box(sw,.045,front-hf,sx,h+.0225,(front+hf)/2,stone,p);
    const bottom=h-.17,wallH=.18;box(sw,.022,sd,sx,bottom,sz,stainless,p);box(.016,wallH,sd,sx-sw/2,bottom+wallH/2,sz,stainless,p);box(.016,wallH,sd,sx+sw/2,bottom+wallH/2,sz,stainless,p);box(sw,wallH,.016,sx,bottom+wallH/2,hb,stainless,p);box(sw,wallH,.016,sx,bottom+wallH/2,hf,stainless,p);cylinder(.031,.031,.005,sx,bottom+.013,sz,darkMetal,p);
    if(faucet){const fz=hf+.10;pipe([[sx,h+.055,fz],[sx,h+.33,fz],[sx,h+.43,fz-.08],[sx,h+.41,fz-.21],[sx,h+.29,fz-.25]],.017,brass,p);cylinder(.034,.034,.025,sx,h+.056,fz,brass,p);rod([sx+.065,h+.05,fz],[sx+.065,h+.19,fz],.011,brass,p);rod([sx+.065,h+.17,fz],[sx+.12,h+.20,fz],.008,brass,p)}
    p.userData.sinkLocal={x:sx,y:h+.045,z:sz};
  }
  function makeIsland(item,p,m){
    const {width:w,height:h,depth:d}=item;
    box(w-.06,.035,d-.06,0,.145,0,m,p);box(w,.75*h,.032,0,h*.55,d/2,m,p);box(.035,h,d+.15,-w/2-.005,h/2,.035,m,p);box(.035,h,d+.15,w/2+.005,h/2,.035,m,p);box(w-.12,.12,d-.12,0,.06,0,darkWood,p);
    const visual=visualOf(item),hasCounts=visual.doors!=null||visual.drawers!=null,panels=hasCounts?1:Math.max(2,Math.round(w/.78));
    const fronts=new T.Group();fronts.rotation.y=Math.PI;p.add(fronts);
    for(let i=0;i<panels;i++){const x=-w/2+(i+.5)*w/panels;const module=new T.Group();module.position.x=x;fronts.add(module);cabinetFronts(item,module,m,{w:w/panels-.008,h,d,drawers:visual.drawers??(item.drawerCount||1),doors:visual.doors??(item.drawerCount>1?0:1),base:true})}
    if(item.countertop!==false){if(item.sink!==false)sinkCounter(p,{w:w+.06,h,d:d+.30,centerZ:.09,sinkX:item.sinkOffsetX??.35,sinkZ:item.sinkOffsetZ??-.18});else box(w+.14,.045,d+.38,0,h+.0225,.09,stone,p)}
    if(item.decor){const dx=-Math.min(.70,w*.29);cylinder(.19,.19,.02,dx,h+.056,.13,stoolWood,p);plant(dx-.02,h+.07,.13,Math.min(.35,w*.12),p);vase(dx+.24,h+.07,.18,.075,p)}
  }
  function makeSinkBase(item,p,m,type){const {width:w,height:h,depth:d}=item;const shellH=h-.20;cabinetShell(w,shellH,d,m,p,true);box(.018,.20,d,-w/2+.009,h-.10,0,m,p);box(.018,.20,d,w/2-.009,h-.10,0,m,p);box(w,.20,.018,0,h-.10,-d/2+.009,m,p);cabinetFronts(item,p,m,{w,h,d,doors:visualOf(item).doors??(w>.7?2:1),drawers:visualOf(item).drawers??1});sinkCounter(p,{w,h,d,centerZ:0,sinkX:0,sinkZ:-.04});if(item.backsplash)box(w,.745,.023,0,h+.045+.745/2,-d/2+.012,stone,p)}
  function makeStool(item,p){const s=new T.Group();s.scale.set(item.width/.57,item.height/1.06,item.depth/.57);p.add(s);const seat=rounded(.55,.49,.09,.12,cream,s);seat.rotation.x=-Math.PI/2;seat.position.set(0,.66,0);const back=rounded(.57,.36,.075,.12,cream,s);back.position.set(0,.87,.23);back.rotation.x=-.10;for(const a of [-1,1])for(const b of [-1,1])rod([a*.25,.025,b*.25],[a*.19,.64,b*.17],.023,stoolWood,s);[-1,1].forEach(a=>{rod([a*.226,.24,-.22],[a*.226,.24,.22],.014,stoolWood,s);rod([-.226,.24,a*.22],[.226,.24,a*.22],.014,stoolWood,s)});box(.45,.045,.39,0,.59,0,stoolWood,s)}
  function makePendant(item,p,m){const {width:w,height:h}=item,r=w/2;const shadeH=Math.min(.33,h*.45);cylinder(r*.28,r,shadeH,0,shadeH/2,0,m,p);cylinder(r*.945,r*.945,.008,0,.002,0,emissive,p);cylinder(.038,.038,.15,0,shadeH+.075,0,brass,p);const stemH=Math.max(.1,h-shadeH-.15);cylinder(.018,.018,stemH,0,shadeH+.15+stemH/2,0,brass,p);const l=new T.SpotLight('#ffe7c4',3,5,Math.PI/3,.85,2);l.position.set(0,.01,0);l.target.position.set(0,-2,0);l.userData.baseIntensity=3;p.add(l,l.target);lights.push(l)}
  function makeFridge(item,p){const {width:w,height:h,depth:d}=item;box(w,h,d,0,h/2,0,stainless,p);const upperH=h*.66;[-1,1].forEach(s=>{box(w/2-.012,upperH-.018,.025,s*w/4,h-upperH/2,d/2+.02,stainless,p);rod([s*.04,h*.46,d/2+.075],[s*.04,h*.78,d/2+.075],.012,darkMetal,p)});box(w-.025,h*.27,.028,0,h*.18,d/2+.02,stainless,p);rod([-w*.34,h*.29,d/2+.075],[w*.34,h*.29,d/2+.075],.012,darkMetal,p);box(w-.03,.08,.02,0,.04,d/2+.025,black,p)}
  function makeDishwasher(item,p){const {width:w,height:h,depth:d}=item;box(w,h,d,0,h/2,0,stainless,p);box(w-.02,h-.10,.025,0,h/2,d/2+.018,stainless,p);box(w-.02,.055,.03,0,h-.04,d/2+.035,black,p);rod([-w*.35,h-.12,d/2+.07],[w*.35,h-.12,d/2+.07],.011,darkMetal,p);box(w-.03,.08,.03,0,.04,d/2+.02,black,p);if(item.countertop)box(w,.045,d,0,h+.0225,0,stone,p)}
  function makeRange(item,p){const {width:w,height:h,depth:d}=item;box(w,h-.06,d,0,(h-.06)/2,0,stainless,p);makeOvenFace(w-.07,h*.68,0,h*.44,d/2+.02,p);const top=new T.Group();top.position.y=h-.055;p.add(top);makeCooktop({...item,height:.06},top)}
  function makeTall(item,p,m,type){const {width:w,height:h,depth:d}=item;cabinetShell(w,h,d,m,p,true);if(/wine/.test(item.typeId)||/wine/.test(type.kind||'')){const rows=Math.max(3,Math.floor(h/.26)),cols=Math.max(2,Math.floor(w/.22));for(let r=1;r<rows;r++)box(w-.03,.015,d-.02,0,.14+(h-.14)*r/rows,0,m,p);for(let c=1;c<cols;c++)box(.015,h-.14,d-.02,-w/2+w*c/cols,.14+(h-.14)/2,0,m,p);return}const visual=visualOf(item);if(visual.doors!=null||visual.drawers!=null){cabinetFronts(item,p,m,{w,h,d,doors:visual.doors??(w>.7?2:1),drawers:visual.drawers??0});return}const upperH=Math.min(.65,h*.28),lowerH=h-.14-upperH-.02;const count=w>.7?2:1;for(let i=0;i<count;i++){const dw=w/count,x=-w/2+(i+.5)*dw;door(dw-.01,lowerH-.01,x,.14+lowerH/2,d/2+.014,m,item,p,{handleSide:i===0?1:-1});door(dw-.01,upperH-.01,x,h-upperH/2,d/2+.014,m,item,p,{handleSide:i===0?1:-1})}}
  function makeCorner(item,p,m,type){const {width:w,height:h,depth:d}=item;makeBase({...item,countertop:false},p,m,type);if(item.countertop!==false)box(w,.045,d,0,h+.0225,0,stone,p);if(/diagonal/.test(item.typeId)){const front=new T.Group();front.position.set(w*.15,0,d*.15);front.rotation.y=Math.PI/4;p.add(front);door(Math.min(w,d)*.68,h-.16,0,.14+(h-.16)/2,Math.min(w,d)*.33,m,item,front)}}
  function makeRoomWall(item,p){
    const {width:w,height:h,depth:d}=item;
    box(w,h,d,0,h/2,0,wall,p);
    const baseH=Math.min(.12,h*.25),capH=Math.min(.085,h*.2);
    box(w,baseH,.025,0,baseH/2,d/2+.015,white,p);
    box(w,capH,d+.02,0,h-capH/2-.0025,.03,white,p);
    p.visible=currentSettings.showWalls!==false;
  }
  function kindFor(item,type){return String(type.geometry?.kind||type.kind||type.category||item.typeId).toLowerCase()}
  function buildItem(item,m){
    const p=new T.Group();p.name=item.name||item.typeId;p.position.set(item.x,item.y||0,item.z);p.rotation.y=(item.rotation||0)*DEG;p.userData.itemId=item.id;
    const t=typeOf(item),kind=kindFor(item,t),id=item.typeId.toLowerCase();
    if(isRoomWall(item))makeRoomWall(item,p);
    else if(kind==='panel'||kind==='filler')box(item.width,item.height,item.depth,0,item.height/2,0,m,p);
    else if(['wall-microwave','base-microwave','base-oven'].includes(id))makeApplianceCabinet(item,p,m,t);
    else if(/oven-tower|double-oven|oven.*cabinet/.test(id)||kind==='oven-tower')makeOvenTower(item,p,m);
    else if(/island/.test(id)||kind==='island')makeIsland(item,p,m);
    else if(/stool/.test(id)||kind==='stool')makeStool(item,p);
    else if(/pendant/.test(id)||kind==='pendant')makePendant(item,p,m);
    else if(/hood/.test(id)||kind==='hood')makeHood(item,p,m);
    else if(/cooktop/.test(id)||kind==='cooktop')makeCooktop(item,p);
    else if(/dishwasher/.test(id)||kind==='dishwasher')makeDishwasher(item,p);
    else if(/refrigerator|fridge/.test(id)||kind==='fridge')makeFridge(item,p);
    else if(id==='range'||kind==='range')makeRange(item,p);
    else if(/sink/.test(id)||kind==='sink-base')makeSinkBase(item,p,m,t);
    else if(/display|glass/.test(id)||kind==='display')makeWall(item,p,m,t,true);
    else if(/wall-cabinet|wall-|upper/.test(id)||kind==='wall')makeWall(item,p,m,t,false);
    else if(/tall|pantry|utility|wine-rack/.test(id)||kind==='tall'||kind==='wine-rack')makeTall(item,p,m,t);
    else if(/corner/.test(id)||kind==='corner-base')makeCorner(item,p,m,t);
    else if(/filler|panel/.test(id)||kind==='filler'||kind==='panel')box(item.width,item.height,item.depth,0,item.height/2,0,m,p);
    else if(/shelf/.test(id)||kind==='shelf')box(item.width,Math.min(item.height,.06),item.depth,0,Math.min(item.height,.06)/2,0,m,p);
    else{makeBase(item,p,m,t);if(/^range-top-/.test(id)){const c=new T.Group();c.position.y=item.height+.045;p.add(c);makeCooktop({...item,width:item.width*.90,depth:item.depth*.85,height:.06},c)}}
    p.traverse(o=>{o.userData.itemId=item.id;if(o.isMesh)itemMeshes.push(o)});
    dynamic.add(p);if(!isRoomWall(item))physicalUVs(p,item);objects.set(item.id,{object:p,item});return p;
  }
  function disposeGeometry(node){const seen=new Set();node.traverse(o=>{if(o.geometry&&!seen.has(o.geometry)){seen.add(o.geometry);o.geometry.dispose()}if(o.isInstancedMesh)o.dispose()})}
  function normalized(item){const t=typeOf(item),g=t.geometry||{};return {...item,width:Math.max(.01,Number(item.width)||t.width||g.width||.60),height:Math.max(.01,Number(item.height)||t.height||g.height||.90),depth:Math.max(.01,Number(item.depth)||t.depth||g.depth||.60),x:Number(item.x)||0,z:Number(item.z)||0,y:Number(item.y)||0,rotation:Number(item.rotation)||0}}
  function geometryKey(item){
    // Pose/name/linked placement do not change joinery. Unknown manufacturer
    // metadata is retained in state but cannot force needless geometry work.
    const keys=['typeId','seriesId','finishId','width','height','depth','doorProfile','drawerCount','frontInsetLeft','frontInsetRight','countertop','backsplash','underLight','decor','sink','sinkOffsetX','sinkOffsetZ'];
    return JSON.stringify([keys.map(key=>item[key]),item.catalogVisual!=null,visualOf(item)]);
  }
  async function rebuild(items,settings={}){
    const ticket=++serial,nextSettings={...currentSettings,...settings};
    const normalizedItems=items.map(item=>normalized({...item,catalogVisual:item.catalogVisual?{...item.catalogVisual}:undefined}));
    if(settings.surface)await setSurface(settings.surface);
    if(ticket!==serial||disposed)return false;
    const mats=await Promise.all(normalizedItems.map(finishMaterial));
    if(ticket!==serial||disposed)return false;
    currentSettings=nextSettings;
    const stats={created:0,reused:0,moved:0,removed:0},nextIds=new Set(normalizedItems.map(i=>i.id));
    let stoneChanged=false;
    const hasStone=object=>{let found=false;object.traverse(o=>{if(o.isMesh&&o.material===stone)found=true});return found};
    for(const [id,entry] of objects){
      if(!nextIds.has(id)){stoneChanged=hasStone(entry.object)||stoneChanged;disposeGeometry(entry.object);entry.object.removeFromParent();objects.delete(id);stats.removed++}
    }
    normalizedItems.forEach((item,i)=>{
      const old=objects.get(item.id),key=geometryKey(item);
      if(old&&old.geometryKey===key){
        const object=old.object,poseChanged=old.item.x!==item.x||old.item.y!==item.y||old.item.z!==item.z||old.item.rotation!==item.rotation||object.position.x!==item.x||object.position.y!==item.y||object.position.z!==item.z||object.rotation.y!==item.rotation*DEG;
        object.position.set(item.x,item.y,item.z);object.rotation.y=item.rotation*DEG;object.name=item.name||item.typeId;
        if(isRoomWall(item))object.visible=currentSettings.showWalls!==false;
        if(poseChanged){stats.moved++;if(!isRoomWall(item))physicalUVs(object,item);stoneChanged=hasStone(object)||stoneChanged}
        old.item=item;stats.reused++;
      }else{
        if(old){stoneChanged=hasStone(old.object)||stoneChanged;disposeGeometry(old.object);old.object.removeFromParent();objects.delete(item.id)}
        const object=buildItem(item,mats[i]);objects.get(item.id).geometryKey=key;stoneChanged=hasStone(object)||stoneChanged;stats.created++;
      }
    });
    itemMeshes=[];lights.length=0;
    dynamic.traverse(o=>{if(o.isMesh)itemMeshes.push(o);if(o.isLight)lights.push(o)});
    wallSegments.splice(0,wallSegments.length,...normalizedItems.filter(isRoomWall).map(item=>{const ends=wallEndpoints(item),a=item.rotation*DEG;return {itemId:item.id,a:[ends.start.x,ends.start.z],b:[ends.end.x,ends.end.z],inward:[Math.sin(a),Math.cos(a)]}}));
    updateFloor(normalizedItems);
    const scale=currentSettings.lightScale??1;lights.forEach(l=>l.intensity=l.userData.baseIntensity*scale);
    root.updateMatrixWorld(true);if(stoneChanged||!root.userData.stoneRuns)mapStoneSlabs();
    root.userData.rebuildStats=stats;return true;
  }
  function pickables(){return itemMeshes}
  function getColliders(){const result=[];objects.forEach(({object,item})=>{
    const t=typeOf(item),kind=kindFor(item,t);
    // High wall cabinets and ceiling lights never block the walking floor.
    if(isRoomWall(item)){if((item.y||0)>=1.8||(item.y||0)+item.height<=.1)return;}
    else if((item.y||0)>1.15||/wall|display|hood|pendant|shelf/.test(kind)||/hood|pendant|cooktop/.test(item.typeId))return;
    object.updateWorldMatrix(true,false);const pos=new T.Vector3();object.getWorldPosition(pos);let w=item.width,d=item.depth,offsetZ=0;
    if(/island/.test(item.typeId)){w+=.14;d+=.38;offsetZ=.09}
    const yaw=object.rotation.y;
    result.push({cx:pos.x+Math.sin(yaw)*offsetZ,cz:pos.z+Math.cos(yaw)*offsetZ,halfW:w/2,halfD:d/2,rotation:yaw,kind:item.typeId,itemId:item.id});
  });return result}
  // Floor expands with edited architecture; tiles remain on the original grid.
  const wallSegments=[],floorGroup=new T.Group();floorGroup.name='Room floor';fixed.add(floorGroup);
  const floorMaterial=material('#ffffff',.4),tileColors=['#d8ccba','#dfd4c3','#dcd0bd','#e2d8c8'].map(c=>new T.Color(c));
  let floorKey='';
  function updateFloor(items){
    Object.assign(bounds,{minX:-3.2,maxX:4.8,minZ:-2.5,maxZ:4.8});
    for(const item of items){
      const a=item.rotation*DEG,c=Math.abs(Math.cos(a)),s=Math.abs(Math.sin(a)),hx=(c*item.width+s*item.depth)/2,hz=(s*item.width+c*item.depth)/2;
      const extra=item.typeId==='island'?.25:.08,minX=item.x-hx-extra,maxX=item.x+hx+extra,minZ=item.z-hz-extra,maxZ=item.z+hz+extra;
      if(minX< -3.2)bounds.minX=Math.min(bounds.minX,minX-.7);
      if(maxX>4.8)bounds.maxX=Math.max(bounds.maxX,maxX+.7);
      if(minZ< -2.5)bounds.minZ=Math.min(bounds.minZ,minZ-.7);
      if(maxZ>4.8)bounds.maxZ=Math.max(bounds.maxZ,maxZ+.7);
    }
    const iMin=Math.min(0,Math.floor((bounds.minX-.2+3.4)/.7+1e-8)),iMax=11+Math.max(0,Math.ceil((bounds.maxX+.2-5)/.7-1e-8));
    const jMin=Math.min(0,Math.floor((bounds.minZ-.2+2.7)/.7+1e-8)),jMax=10+Math.max(0,Math.ceil((bounds.maxZ+.2-5)/.7-1e-8));
    const key=[iMin,iMax,jMin,jMax].join(':');if(key===floorKey)return;floorKey=key;
    disposeGeometry(floorGroup);floorGroup.clear();
    const cols=iMax-iMin+1,rows=jMax-jMin+1;
    box(cols*.7,.13,rows*.7,-3.4+(iMin+iMax+1)*.35,-.085,-2.7+(jMin+jMax+1)*.35,grout,floorGroup);
    const tiles=new T.InstancedMesh(new T.BoxGeometry(.697,.022,.697),floorMaterial,cols*rows),matrix=new T.Matrix4();
    tiles.name='Floor tiles';tiles.receiveShadow=true;tiles.castShadow=true;let index=0;
    for(let i=iMin;i<=iMax;i++)for(let j=jMin;j<=jMax;j++){
      matrix.makeTranslation(-3.05+i*.7,-.009,-2.35+j*.7);tiles.setMatrixAt(index,matrix);tiles.setColorAt(index,tileColors[((i*7+j*3)%4+4)%4]);index++;
    }
    tiles.instanceMatrix.needsUpdate=true;tiles.instanceColor.needsUpdate=true;tiles.computeBoundingBox();tiles.computeBoundingSphere();floorGroup.add(tiles);
  }
  updateFloor([]);
  const hemi=new T.HemisphereLight('#f5f5f0','#aaa59c',1.15);fixed.add(hemi);const sun=new T.DirectionalLight('#fff9ee',1.6);sun.position.set(2.8,6,4);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-6;sun.shadow.camera.right=6;sun.shadow.camera.top=6;sun.shadow.camera.bottom=-6;sun.shadow.normalBias=.012;sun.shadow.radius=2;sun.shadow.bias=-.0002;fixed.add(sun);const fill=new T.DirectionalLight('#edf2f6',.4);fill.position.set(-1,3,4);fixed.add(fill);
  await setSurface();
  function dispose(){if(disposed)return;disposed=true;serial++;surfaceSerial++;disposeGeometry(root);root.removeFromParent();objects.clear();itemMeshes=[];materialSet.forEach(m=>m.dispose());textureCache.forEach(p=>p.then(t=>t?.dispose()));materialCache.clear();textureCache.clear();lights.length=0}
  return {root,objects,bounds,wallSegments,lights,warnings,rebuild,pickables,getColliders,setSurface,dispose,materials:{stone},lighting:{hemisphere:hemi,sun,fill},defaultSettings:DEFAULT_ROOM_SETTINGS};
}
