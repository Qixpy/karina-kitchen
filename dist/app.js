import * as THREE from 'three';
import {OrbitControls} from './vendor/OrbitControls.js';
import {TransformControls} from './vendor/TransformControls.js';
import {SERIES,TYPES} from './catalog.js?v=finishfix1';
import {SURFACES} from './surfaces.js?v=editor2';
import {DEFAULT_ITEMS,createEditorScene} from './editor-scene.js?v=finishfix1';
import {INCH,clone,angle,validFinish,normalizeDesign,transformFollowers,History} from './editor-state.js?v=finishfix1';
import {isWalkable} from './collision.js?v=editor2';
import {isRoomWall,resizeWall,wallEndpoints,WALL_LIMITS} from './walls.js?v=finishfix1';
import {CatalogStore,dimensions,hasDimensions,geometryFor,variantId,catalogVisualFor,refreshCatalogVisuals} from './catalog-store.js?v=finishfix1';
import {mountCatalogUI} from './catalog-ui.js?v=finishfix1';
import {downloadQuote} from './quote.js?v=finishfix1';
import {createRoom} from './projects.js?v=finishfix1';
const catalogStore=new CatalogStore();let catalogReady,catalogUI;
let dirty=true;
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const AUTO='kitchen-atelier-autosave-v1', SAVES='kitchen-atelier-designs-v1';
const initial={version:3,project:{},name:'Kitchen concept',items:clone(DEFAULT_ITEMS),surfaceId:SURFACES[0].id};
let state=clone(initial),selectedId=null,mode='orbit',room,renderer,controls,gizmo,selectionBox,busy=false,renderSerial=0;
let storageWarning=false;
try{const saved=localStorage.getItem(AUTO);if(saved)state=normalizeDesign(JSON.parse(saved),SERIES,TYPES,SURFACES)}catch{storageWarning=true}
const history=new History(state),scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(47,1,.04,90),viewport=$('#viewport');
const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();
const typeOf=i=>TYPES.find(t=>t.id===i?.typeId),seriesOf=i=>SERIES.find(s=>s.id===i?.seriesId)||SERIES[0];
const selected=()=>state.items.find(i=>i.id===selectedId);
const title=i=>i.name||typeOf(i)?.label||'Item';
const available=f=>f.available!==false&&f.verified!==false;
const finishOf=i=>validFinish(seriesOf(i),i.finishId);
function announce(message){$('#status').textContent=message}
function option(value,label,disabled=false){const o=document.createElement('option');o.value=value;o.textContent=label;o.disabled=disabled;return o}
function populate(select,options,value){select.replaceChildren(...options);if([...select.options].some(o=>o.value===value&&!o.disabled))select.value=value}
function saveAuto(){try{localStorage.setItem(AUTO,JSON.stringify(state))}catch{announce('Changes remain open. Browser storage is full; export your design to keep a copy.')}}
function historyUI(){$('#undo').disabled=!history.past.length;$('#redo').disabled=!history.future.length}
function commit(message){history.push(state);saveAuto();historyUI();if(message)announce(message)}
function panel(name,open=false){$('#panel-content').scrollTop=0;$$('[data-panel]').forEach(b=>{const active=b.dataset.panel===name;b.classList.toggle('active',active);b.setAttribute('aria-selected',active)});for(const key of ['library','inspector','finishes'])$('#panel-'+key).hidden=key!==name;if(open){$('#editor-panel').classList.add('is-open');$('#panel-toggle').setAttribute('aria-expanded','true')}}
function selectedUI(){
 dirty=true;
 const i=selected();$('#selection-empty').hidden=!!i;$('#selection-controls').hidden=!i;
 $('#selected-title').textContent=i?title(i):'Select an item';
 if($('#selection-label'))$('#selection-label').textContent=i?title(i):'No item selected';
 populate($('#object-list'),[option('','Select an item…'),...state.items.map(i=>option(i.id,title(i)))],selectedId||'');
 $('#item-count').textContent=state.items.length+' items';
 wallMarkerUI();
 if(!i){gizmo?.detach();if(selectionBox)selectionBox.visible=false;return}
 const wall=isRoomWall(i),locked=!!i.catalogRef;$('#catalog-selection').hidden=!locked;$('#catalog-selection-summary').textContent=locked?`${i.catalogRef.code} · ${i.name}. Catalog dimensions and finish are preserved.`:'';$('#cabinet-fields').hidden=wall||locked;for(const k of ['width','height','depth','type'])$('#item-'+k).disabled=locked;for(const id of ['wall-note','wall-controls','wall-extend'])$('#'+id).hidden=!wall;
 $('#width-label').textContent=wall?'Length':'Width';$('#depth-label').textContent=wall?'Thickness':'Depth';
 for(const [prop,limits] of Object.entries(wall?WALL_LIMITS:{width:[.01016,5.9944],height:[.01016,3.9878],depth:[.01016,2.9972]})){const input=$('#item-'+prop);if(input){input.min=String(limits[0]/INCH);input.max=String(limits[1]/INCH)}}
 populate($('#item-type'),TYPES.filter(t=>(t.id==='room-wall')===wall).map(t=>option(t.id,t.label)),i.typeId);
 populate($('#item-series'),SERIES.map(s=>option(s.id,s.label)),i.seriesId);
 populateItemFinishes();
 for(const [field,prop] of Object.entries({width:'width',height:'height',depth:'depth',x:'x',z:'z',elevation:'y'}))$('#item-'+field).value=(i[prop]/INCH).toFixed(1);
 $('#item-rotation').value=Number(angle(i.rotation).toFixed(1));
 const noFinish=wall||['stool','cooktop','fridge','range','dishwasher','pendant'].includes(i.typeId);
 $('#item-series').disabled=noFinish;$('#item-finish').disabled=noFinish;
 attachGizmo();
}
function populateItemFinishes(){const s=SERIES.find(s=>s.id===$('#item-series').value)||SERIES[0];const current=selected()?.finishId;populate($('#item-finish'),s.finishes.map(f=>option(f.id,f.name+(available(f)?'':' · unavailable'),!available(f))),validFinish(s,current)?.id)}
function attachGizmo(){gizmo?.detach();const o=room?.objects.get(selectedId)?.object;if(!o)return;if(selectionBox){selectionBox.setFromObject(o);selectionBox.visible=true}if(mode==='move'||mode==='rotate'){gizmo.attach(o);gizmo.setMode(mode==='move'?'translate':'rotate');gizmo.showX=mode==='move';gizmo.showY=mode==='rotate';gizmo.showZ=mode==='move'}}
async function rebuild(){
 if(!room)return;const run=++renderSerial;busy=true;gizmo.detach();await catalogReady;const renderItems=await refreshCatalogVisuals(state.items,catalogStore);if(run!==renderSerial)return;await room.rebuild(renderItems,{surface:SURFACES.find(s=>s.id===state.surfaceId),surfaceId:state.surfaceId});if(run!==renderSerial)return;busy=false;selectedUI();surfaceUI();
}
async function mutate(action,message){action();commit(message);await rebuild()}
function select(id,open=false){selectedId=id;selectedUI();if(id)panel('inspector',open)}
function setMode(next){mode=next;controls.enabled=next!=='walk';$$('[id^="mode-"]').forEach(b=>{const on=b.id==='mode-'+next;b.setAttribute('aria-pressed',on);b.classList.toggle('active',on)});$('#walk-controls').hidden=next!=='walk';$('#scene-hint').textContent=next==='walk'?'Drag to look · Use arrows to walk':next==='move'?'Select an item, then drag its arrows':next==='rotate'?'Select an item, then drag the rotation ring':'Drag to look around · Tap an item to edit';keys.clear();moves.clear();attachGizmo();if(next==='walk'){camera.position.set(2.4,1.65,3.85);yaw=.3;pitch=-.04;look()}}
function home(){setMode('orbit');camera.position.set(-3,2.35,8.2);controls.target.set(.75,1.5,.35);controls.update()}
function top(){setMode('orbit');const b=room.bounds,x=(b.minX+b.maxX)/2,z=(b.minZ+b.maxZ)/2;const vfov=camera.fov*Math.PI/180,distance=Math.max(10.5,(b.maxX-b.minX)/camera.aspect/(2*Math.tan(vfov/2)),(b.maxZ-b.minZ)/(2*Math.tan(vfov/2)))+1;controls.maxDistance=Math.max(24,distance+5);camera.position.set(x,distance,z+.01);controls.target.set(x,0,z);controls.update()}
function snapping(){const on=$('#snap-toggle').checked;gizmo.setTranslationSnap(on?.0254:null);gizmo.setRotationSnap(on?Number($('#snap-angle').value)*Math.PI/180:null)}
function updatePose(before,after){state.items=transformFollowers(state.items,before,after).map(i=>i.id===after.id?after:i)}
function rotateItem(delta){const i=selected();if(!i)return;mutate(()=>updatePose(i,{...i,rotation:angle(i.rotation+delta)}),'Rotation updated.')}
function newId(){return 'item-'+crypto.randomUUID()}
function addItem(t){
 if(t.id==='room-wall'){addWall();return}
 if(state.items.length>=250){announce('This design has reached 250 items. Remove an item before adding another.');return}
 const finishSeries=SERIES.find(s=>s.id===$('#finish-series').value)||SERIES[0];const f=validFinish(finishSeries,$('#finish-color').value);
 let x=2.8,z=3.7;for(let n=0;n<30;n++){const cx=-2.7+(n%6)*1.2,cz=3.2+Math.floor(n/6)*.9;if(!state.items.some(i=>Math.hypot(i.x-cx,i.z-cz)<.85)){x=cx;z=cz;break}}
 const cat=String(t.category).toLowerCase(),wall=['wall','display'].includes(t.kind),tall=cat.includes('tall');
 const i={id:newId(),typeId:t.id,name:t.label,seriesId:finishSeries.id,finishId:f.id,x,z,y:t.y??(wall?1.69:0),rotation:0,width:t.width||.6,height:t.height||.87,depth:t.depth||.6,...(/base/.test(t.kind)?{countertop:true,backsplash:true}:{}),...(t.id==='island'?{sink:true,countertop:true}:{})};
 selectedId=i.id;mutate(()=>state.items.push(i),'Added '+t.label+'.');panel('inspector',true);
}

async function addProduct(c,p,v,editId=null){
 if(!editId&&state.items.length>=250){announce('Remove an item before adding another.');return}
 if(c.placementBlocked||p.placementBlocked||!hasDimensions(p,v)){announce('This record needs verified dimensions before placement.');return}
 const d=dimensions(p,v),typeId=geometryFor(p),t=TYPES.find(t=>t.id===typeId)||TYPES.find(t=>t.id==='base-cabinet'),prior=selected();
 const item={id:newId(),name:p.sku+' · '+(p.name||''),typeId:t.id,seriesId:SERIES[0].id,finishId:SERIES[0].finishes[0].id,width:d.width*INCH,height:d.height*INCH,depth:d.depth*INCH,x:0,z:2,y:t.kind==='wall'?54*INCH:0,rotation:0,countertop:/base/.test(t.kind),backsplash:/base/.test(t.kind),catalogRef:{code:c.code,productId:String(p.id),variantId:variantId(v),options:{}},catalogVisual:catalogVisualFor(c,p,v)};
 if(Number.isInteger(p.doors))item.catalogVisual.doors=p.doors;if(Number.isInteger(p.drawers))item.catalogVisual.drawers=p.drawers;
 if(prior){const a=prior.rotation*Math.PI/180;item.rotation=prior.rotation;if(isRoomWall(prior)){item.x=prior.x+Math.sin(a)*(prior.depth+item.depth)/2;item.z=prior.z+Math.cos(a)*(prior.depth+item.depth)/2;item.wallId=prior.id}else{item.x=prior.x+Math.cos(a)*(prior.width+item.width)/2;item.z=prior.z-Math.sin(a)*(prior.width+item.width)/2;}}
 if(editId){const current=state.items.find(i=>i.id===editId);if(!current)return;await mutate(()=>Object.assign(current,{catalogRef:item.catalogRef,catalogVisual:item.catalogVisual,width:item.width,height:item.height,depth:item.depth}),'Catalog finish updated.');select(current.id,true);return}
 selectedId=item.id;await mutate(()=>state.items.push(item),'Added '+p.sku+' using catalog dimensions.');panel('inspector',true);
}
function bindProjects(){
 $('#download-quote').onclick=async()=>{const b=$('#download-quote');b.disabled=true;b.textContent='Preparing…';try{await catalogReady;const q=await downloadQuote(clone(state),catalogStore);announce(q.incomplete.length?'PDF downloaded. Items needing supplier pricing are marked in the PDF.':'Quote PDF downloaded.')}catch(e){console.error(e);announce('The PDF could not be created. Please try again.')}finally{b.disabled=false;b.textContent='Quote PDF'}};
 $('#edit-catalog-selection').onclick=async()=>{const i=selected();if(!i?.catalogRef)return;await catalogReady;panel('library',true);$('#manufacturer-library').hidden=false;$('#planning-library').hidden=true;await catalogUI.openSelection(i.catalogRef,i.id)};
 $('#detach-catalog').onclick=async()=>{const i=selected();if(!i?.catalogRef)return;if(await confirmAction('Convert to a custom item?','You can edit its size and finish freely. Its catalog price will no longer apply.'))await mutate(()=>{delete i.catalogRef;delete i.catalogVisual;},'Converted to a custom planning item.');};
 $('#project-details').onclick=()=>{for(const k of ['dealer','customer','address','designer','notes'])$('#project-'+k).value=state.project?.[k]||'';$('.project-menu').open=false;$('#project-dialog').showModal()};$('#close-project').onclick=()=>$('#project-dialog').close();
 $('#save-project-details').onclick=()=>{state.project={};for(const k of ['dealer','customer','address','designer','notes'])state.project[k]=$('#project-'+k).value.trim().slice(0,k==='notes'?2000:250);commit('Project details saved for the PDF.');$('#project-dialog').close()};
 $('#new-project').onclick=()=>{$('.project-menu').open=false;$('#new-project-dialog').showModal()};$('#cancel-new-project').onclick=()=>$('#new-project-dialog').close();
 $('#create-project').onclick=async()=>{const inputs=['new-room-width','new-room-depth','new-room-height'].map(id=>$('#'+id));for(const input of inputs)if(!input.value||!input.checkValidity()){input.reportValidity();return}
  try{const saves=getSaves();saves.unshift({id:crypto.randomUUID(),date:new Date().toISOString(),design:clone(state)});localStorage.setItem(SAVES,JSON.stringify(saves.slice(0,30)))}catch{announce('Please export your current design first. Browser storage could not save it.');return}
  state=createRoom({name:$('#new-project-name').value,widthIn:+inputs[0].value,depthIn:+inputs[1].value,heightIn:+inputs[2].value,layout:$('#new-project-layout').value,surfaceId:state.surfaceId,seriesId:SERIES[0].id,finishId:SERIES[0].finishes[0].id});selectedId=null;$('#project-name').value=state.name;commit('New room created. Your previous design is in Saved designs.');$('#new-project-dialog').close();await rebuild();top();panel('library',true);
 };
}

function addWall(){
 if(state.items.length>=250){announce('Remove an item before adding another wall.');return}
 const previous=isRoomWall(selected())?selected():state.items.filter(isRoomWall).at(-1);
 const t=TYPES.find(t=>t.id==='room-wall'),end=previous?wallEndpoints(previous).end:{x:-t.width/2,z:-1.8},rotation=previous?.rotation||0,a=rotation*Math.PI/180;
 const wall={id:newId(),typeId:t.id,name:'Room wall '+(state.items.filter(isRoomWall).length+1),seriesId:SERIES[0].id,finishId:SERIES[0].finishes[0].id,width:t.width,height:previous?.height||t.height,depth:previous?.depth||t.depth,x:end.x+Math.cos(a)*t.width/2,z:end.z-Math.sin(a)*t.width/2,y:previous?.y||0,rotation};
 selectedId=wall.id;mutate(()=>state.items.push(wall),'Wall added. Move, rotate or resize it to fit your room.').then(top);panel('inspector',true);
}
function extendWall(end){
 const i=selected(),input=$('#wall-extension');if(!isRoomWall(i))return;
 if(input.value.trim()===''||!input.checkValidity()){input.reportValidity();return}
 try{const after=resizeWall(i,i.width+Number(input.value)*INCH,end==='start'?'end':'start');mutate(()=>updatePose(i,after),`Wall extended at end ${end==='start'?'A':'B'}. Cabinets stay in place.`)}catch{announce('That would exceed the maximum wall length of 787 inches. Choose a smaller extension.')}
}
let wallMarkers;
function wallMarkerUI(){
 const item=selected();if(!wallMarkers){wallMarkers=new THREE.Group();for(const label of ['A','B']){const canvas=document.createElement('canvas');canvas.width=canvas.height=96;const ctx=canvas.getContext('2d');ctx.fillStyle='#007aff';ctx.beginPath();ctx.arc(48,48,44,0,Math.PI*2);ctx.fill();ctx.fillStyle='#ffffff';ctx.font='bold 52px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(label,48,50);const texture=new THREE.CanvasTexture(canvas),marker=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,depthTest:false}));marker.scale.set(.28,.28,1);marker.renderOrder=1100;wallMarkers.add(marker)}scene.add(wallMarkers)}
 wallMarkers.visible=isRoomWall(item);if(!wallMarkers.visible)return;
 const object=room?.objects.get(item.id)?.object,pose=object?{...item,x:object.position.x,z:object.position.z,rotation:object.rotation.y*180/Math.PI}:item,ends=wallEndpoints(pose);
 [ends.start,ends.end].forEach((end,n)=>wallMarkers.children[n].position.set(end.x,item.y+item.height+.17,end.z));
}
const icon=(t)=>{if(t.id==='room-wall')return '<svg viewBox="0 0 80 80" aria-hidden="true"><path d="M12 64V20l48-8v49L12 70V64l48-9M60 12l9 5v48l-9-4M12 20l9 5 48-8" fill="none" stroke="currentColor" stroke-width="2"/></svg>';const drawers=t.drawers||(/triple|3-drawer/.test(t.id)?3:/double-drawer|2-drawer/.test(t.id)?2:/drawer/.test(t.id)?1:0);return `<svg viewBox="0 0 80 80" aria-hidden="true"><rect x="16" y="10" width="48" height="58" rx="3" fill="none" stroke="currentColor" stroke-width="2"/>${drawers?Array.from({length:drawers},(_,n)=>`<path d="M16 ${10+(n+1)*58/(drawers+1)}h48 M35 ${18+n*58/(drawers+1)}h10" stroke="currentColor" stroke-width="2"/>`).join(''):'<path d="M40 10v58 M35 35v10 M45 35v10" stroke="currentColor" stroke-width="2"/>'}<path d="M20 69v4 M60 69v4" stroke="currentColor" stroke-width="2"/></svg>`};
function library(){const q=$('#catalog-search').value.toLowerCase().trim(),category=$('#category-filter').value;const shown=TYPES.filter(t=>(category==='all'||t.category===category)&&((t.label+' '+t.category+' '+(t.description||'')).toLowerCase().includes(q)));$('#catalog-grid').replaceChildren(...shown.map(t=>{const b=document.createElement('button');b.type='button';b.innerHTML=icon(t);const strong=document.createElement('strong');strong.textContent=t.label;const small=document.createElement('small');small.textContent=`${Math.round(t.width/INCH)}″ × ${Math.round(t.height/INCH)}″`;b.append(strong,small);b.onclick=()=>addItem(t);return b}));if(!shown.length){const p=document.createElement('p');p.textContent='No matching items. Try another search.';$('#catalog-grid').append(p)}}
function finishUI(){const s=SERIES.find(s=>s.id===$('#finish-series').value)||SERIES[0],prev=$('#finish-color').value;populate($('#finish-color'),s.finishes.map(f=>option(f.id,f.name+(available(f)?'':' · unavailable'),!available(f))),validFinish(s,prev).id);$('#finish-swatches').replaceChildren(...s.finishes.map(f=>{const b=document.createElement('button');b.type='button';b.disabled=!available(f);b.title=f.name+(available(f)?'':' — not in the current verified catalog');b.setAttribute('aria-pressed',f.id===$('#finish-color').value);if(f.image){const img=document.createElement('img');img.src=f.image;img.alt='';img.loading='lazy';b.append(img)}else {const blank=document.createElement('span');blank.textContent='—';b.append(blank)}const span=document.createElement('span');span.textContent=f.name;b.append(span);b.onclick=()=>{$('#finish-color').value=f.id;finishUI()};return b}));$('#catalog-note').textContent=`${s.label}: ${s.construction} construction. ${s.profile==='slab'?'Flat slab doors.':s.id==='tuscany'?'Wide shaker door profile.':'Slim shaker door profile.'} Finishes use Fabuwood reference images; confirm with physical samples. Ocean Blue is unavailable in the current Luna catalog.`}
function scopeOf(i){if(isRoomWall(i))return 'other';const t=typeOf(i),cat=String(t?.category||'').toLowerCase()+' '+(t?.kind||'');if(i.typeId==='island')return 'island';if(/wall|display|upper/.test(cat+' '+i.typeId)||i.typeId==='hood')return 'upper';if(/tall|pantry|oven-tower/.test(cat+' '+i.typeId))return 'tall';if(/base|corner/.test(cat+' '+i.typeId))return 'base';return 'other'}
function surfaceUI(){$$('#surface-grid button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.surface===state.surfaceId))}
function bindUI(){
 bindProjects();catalogUI=mountCatalogUI(catalogStore,{addProduct,announce});catalogReady=catalogUI.init();
 $('#add-wall').onclick=addWall;$('#edit-walls').onclick=()=>{const walls=state.items.filter(isRoomWall);if(!walls.length){announce('No walls yet. Choose Add wall to create one.');return}select(isRoomWall(selected())?selectedId:walls[0].id,true);top()};
 $('#extend-start').onclick=()=>extendWall('start');$('#extend-end').onclick=()=>extendWall('end');
 $$('[data-panel]').forEach(b=>b.onclick=()=>panel(b.dataset.panel,true));$('#panel-toggle').onclick=()=>{const on=$('#editor-panel').classList.toggle('is-open');$('#panel-toggle').setAttribute('aria-expanded',on)};
 populate($('#category-filter'),[option('all','All items'),...[...new Set(TYPES.map(t=>t.category))].map(c=>option(c,c))],'all');$('#catalog-search').oninput=library;$('#category-filter').onchange=library;library();
 populate($('#finish-series'),SERIES.map(s=>option(s.id,s.label)),SERIES[0].id);$('#finish-series').onchange=finishUI;$('#finish-color').onchange=finishUI;finishUI();
 $('#item-series').onchange=populateItemFinishes;$('#object-list').onchange=()=>select($('#object-list').value||null,true);
 $('#item-type').onchange=()=>{const t=TYPES.find(t=>t.id===$('#item-type').value);for(const k of ['width','height','depth'])$('#item-'+k).value=(t[k]/INCH).toFixed(1)};
 $('#apply-item').onclick=()=>{
  const i=selected();if(!i)return;const wall=isRoomWall(i),t=wall?typeOf(i):TYPES.find(t=>t.id===$('#item-type').value),s=SERIES.find(s=>s.id===$('#item-series').value),values={};
  for(const [field,prop] of Object.entries({width:'width',height:'height',depth:'depth',x:'x',z:'z',elevation:'y'})){const input=$('#item-'+field);if(i.catalogRef&&['width','height','depth'].includes(prop)){values[prop]=i[prop];continue}if(!input.checkValidity()||input.value.trim()===''){input.reportValidity();return}values[prop]=Number(input.value)*INCH}
  const rotation=$('#item-rotation');if(!rotation.checkValidity()||rotation.value.trim()===''){rotation.reportValidity();return}
  let after={...i,...values,typeId:t.id,seriesId:s.id,finishId:validFinish(s,$('#item-finish').value).id,rotation:angle(Number(rotation.value))};
  if(i.catalogRef)after={...i,...values,rotation:angle(Number(rotation.value))};
  if(wall){try{after=resizeWall({...after,width:i.width},values.width,$('#wall-anchor').value)}catch{announce('Please enter a valid wall length.');return}}
  else if(t.id!==i.typeId){after.name=t.label;delete after.frontInsetLeft;delete after.frontInsetRight;after.countertop=/base/.test(t.kind)||t.id==='island';after.backsplash=/base/.test(t.kind);}
  mutate(()=>updatePose(i,after),wall?'Wall updated. Cabinets stay in place.':'Item updated.');
 };
 $('#rotate-left').onclick=()=>rotateItem(-Number($('#snap-angle').value));$('#rotate-right').onclick=()=>rotateItem(Number($('#snap-angle').value));
 $('#delete-item').onclick=()=>{const i=selected();if(!i)return;mutate(()=>{state.items=state.items.filter(a=>a.id!==i.id).map(a=>a.followsId===i.id?{...a,followsId:undefined}:a);selectedId=null},'Removed '+title(i)+'. Undo restores it.')};
 $('#duplicate-item').onclick=()=>{const i=selected();if(!i)return;if(state.items.length>=250){announce('This design has reached 250 items.');return}const copy={...clone(i),id:newId(),name:title(i)+' copy',x:i.x+.3,z:i.z+.3};delete copy.followsId;selectedId=copy.id;mutate(()=>state.items.push(copy),'Duplicated item. Move it into place.')};
 $('#apply-finish').onclick=()=>{const scope=$('#finish-scope').value,s=SERIES.find(s=>s.id===$('#finish-series').value),finish=validFinish(s,$('#finish-color').value);let count=0;mutate(()=>{state.items=state.items.map(i=>{if(isRoomWall(i)||i.catalogRef)return i;const matches=scope==='selected'?i.id===selectedId:scope==='all'?scopeOf(i)!=='other':scopeOf(i)===scope;if(!matches)return i;count++;return {...i,seriesId:s.id,finishId:finish.id}})},null).then(()=>announce(count?`${s.label} · ${finish.name} applied to ${count} item${count===1?'':'s'}.`:'Select an item or choose another group first.'))};
 $('#surface-grid').replaceChildren(...SURFACES.map(s=>{const b=document.createElement('button');b.type='button';b.dataset.surface=s.id;const img=document.createElement('div');img.className='surface-sample';img.style.cssText=`height:64px;width:100%;border-radius:8px;background-image:url("${s.image}");background-size:${100/s.repeat[0]}% ${100/s.repeat[1]}%;background-position:${s.offset[0]/(1-s.repeat[0]||1)*100}% ${(1-s.offset[1]-s.repeat[1])/(1-s.repeat[1]||1)*100}%;`;const strong=document.createElement('strong');strong.textContent=s.name;const sub=document.createElement('small');sub.textContent=s.brand;b.append(img,strong,sub);b.onclick=()=>mutate(()=>state.surfaceId=s.id,'Countertops and backsplash updated together.');return b}));surfaceUI();
 $('#project-name').value=state.name;$('#project-name').onchange=()=>{state.name=$('#project-name').value.trim().slice(0,70)||'Kitchen concept';commit('Design renamed.')};
 $('#undo').onclick=async()=>{const prev=history.undo();if(prev){state=prev;$('#project-name').value=state.name;saveAuto();historyUI();await rebuild();announce('Change undone.')}};$('#redo').onclick=async()=>{const next=history.redo();if(next){state=next;$('#project-name').value=state.name;saveAuto();historyUI();await rebuild();announce('Change restored.')}};
 for(const m of ['orbit','move','rotate','walk'])$('#mode-'+m).onclick=()=>setMode(m);
 $('#view-home').onclick=home;$('#view-top').onclick=top;$('#snap-toggle').onchange=snapping;$('#snap-angle').onchange=snapping;
 $('#help').onclick=()=>$('#help-dialog').showModal();$('#close-help').onclick=()=>$('#help-dialog').close();
 $('#fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen()}catch{announce('Full screen is not available in this browser.')}};
 $('#reset-layout').onclick=async()=>{if(await confirmAction('Reset this kitchen?','Restore the approved layout and original finishes. You can undo this change.')){state=clone(initial);selectedId=null;$('#project-name').value=state.name;commit('Original layout restored.');await rebuild();home()}};
 $$('.menu-popover button').forEach(b=>b.addEventListener('click',()=>$('.project-menu').removeAttribute('open')));bindStorage();historyUI();
}
let confirmResolve;
function confirmAction(title,copy){$('#confirm-title').textContent=title;$('#confirm-copy').textContent=copy;$('#confirm-dialog').showModal();return new Promise(resolve=>confirmResolve=resolve)}
function endConfirm(value){$('#confirm-dialog').close();confirmResolve?.(value);confirmResolve=null}
$('#confirm-yes').onclick=()=>endConfirm(true);$('#confirm-no').onclick=()=>endConfirm(false);$('#confirm-dialog').addEventListener('cancel',()=>endConfirm(false));
function getSaves(){try{const v=JSON.parse(localStorage.getItem(SAVES)||'[]');return Array.isArray(v)?v:[]}catch{return []}}
function bindStorage(){
 $('#save-design').onclick=()=>{$('#save-name').value=state.name;$('#save-dialog').showModal()};$('#cancel-save').onclick=()=>$('#save-dialog').close();
 $('#confirm-save').onclick=()=>{const name=$('#save-name').value.trim();if(!name){$('#save-name').focus();return}state.name=name.slice(0,70);$('#project-name').value=state.name;try{const saves=getSaves();saves.unshift({id:crypto.randomUUID(),date:new Date().toISOString(),design:clone(state)});localStorage.setItem(SAVES,JSON.stringify(saves.slice(0,30)));commit();$('#save-dialog').close();announce('Saved in this browser. Export to share or keep a backup.')}catch{announce('Unable to save in this browser. Export your design instead.')}};
 $('#open-designs').onclick=()=>{renderSaves();$('#saved-dialog').showModal()};$('#close-saved').onclick=()=>$('#saved-dialog').close();
 $('#export-design').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(state,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=(state.name.replace(/[^a-z0-9 -]/gi,'').trim()||'kitchen')+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);announce('Design exported. Import this file on another device to continue.')};
 $('#import-design').onclick=()=>$('#import-file').click();$('#import-file').onchange=async()=>{const f=$('#import-file').files[0];if(!f)return;try{if(f.size>2e6)throw Error('Please use a design file smaller than 2 MB.');const next=normalizeDesign(JSON.parse(await f.text()),SERIES,TYPES,SURFACES);if(await confirmAction('Open imported design?','Your current work is autosaved. Import will replace the room; Undo restores it.')){state=next;selectedId=null;$('#project-name').value=state.name;commit('Design imported.');await rebuild();home()}}catch(e){announce(e.message||'Could not open that design file.')}finally{$('#import-file').value=''}};
}
function renderSaves(){const saves=getSaves();$('#saved-list').replaceChildren();if(!saves.length){const p=document.createElement('p');p.textContent='No saved designs yet. Save a version to keep it in this browser.';$('#saved-list').append(p)}for(const saved of saves){const row=document.createElement('div');row.className='saved-row';const b=document.createElement('button');b.textContent=saved.design?.name||'Kitchen design';b.onclick=async()=>{try{const next=normalizeDesign(saved.design,SERIES,TYPES,SURFACES);state=next;selectedId=null;$('#project-name').value=state.name;commit('Saved design opened.');$('#saved-dialog').close();await rebuild();home()}catch(e){announce(e.message)}};const small=document.createElement('small');small.textContent=new Date(saved.date).toLocaleString();row.append(b,small);$('#saved-list').append(row)}}
let yaw=0,pitch=0,last=performance.now(),pointerStart=null,dragStart=null,wasGizmoDrag=false;const keys=new Set(),moves=new Set();
function look(){dirty=true;camera.rotation.order='YXZ';camera.rotation.set(pitch,yaw,0)}
function walkMove(dt){let side=(keys.has('d')||keys.has('arrowright')||moves.has('right')?1:0)-(keys.has('a')||keys.has('arrowleft')||moves.has('left')?1:0),fwd=(keys.has('w')||keys.has('arrowup')||moves.has('forward')?1:0)-(keys.has('s')||keys.has('arrowdown')||moves.has('backward')?1:0);const len=Math.hypot(side,fwd);if(!len)return;const speed=1.5*dt/len,dx=(side*Math.cos(yaw)-fwd*Math.sin(yaw))*speed,dz=(-side*Math.sin(yaw)-fwd*Math.cos(yaw))*speed;const {x,z}=camera.position,colliders=room.getColliders();if(isWalkable(x+dx,z,colliders,room.bounds))camera.position.x+=dx;if(isWalkable(camera.position.x,z+dz,colliders,room.bounds))camera.position.z+=dz}
function bindScene(){
 renderer.domElement.addEventListener('pointerdown',e=>{pointerStart={id:e.pointerId,x:e.clientX,y:e.clientY,lastX:e.clientX,lastY:e.clientY};wasGizmoDrag=false;if(mode==='walk')renderer.domElement.setPointerCapture(e.pointerId)});
 renderer.domElement.addEventListener('pointermove',e=>{if(mode==='walk'&&pointerStart?.id===e.pointerId){yaw-=(e.clientX-pointerStart.lastX)*.004;pitch=Math.max(-1.25,Math.min(1.15,pitch-(e.clientY-pointerStart.lastY)*.003));pointerStart.lastX=e.clientX;pointerStart.lastY=e.clientY;look()}});
 renderer.domElement.addEventListener('pointerup',e=>{if(pointerStart&&mode!=='walk'&&!wasGizmoDrag&&!busy&&Math.hypot(e.clientX-pointerStart.x,e.clientY-pointerStart.y)<6){const rect=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(pointer,camera);const hit=raycaster.intersectObjects(room.pickables(),false).find(h=>h.object.userData.itemId);if(hit)select(hit.object.userData.itemId,false)}pointerStart=null});renderer.domElement.addEventListener('pointercancel',()=>pointerStart=null);
 gizmo.addEventListener('dragging-changed',e=>{controls.enabled=!e.value&&mode!=='walk';if(e.value){dragStart=clone(selected());wasGizmoDrag=true}else if(dragStart){const o=gizmo.object,before=dragStart;dragStart=null;if(o){const after={...before,x:o.position.x,z:o.position.z,rotation:angle(THREE.MathUtils.radToDeg(o.rotation.y))};updatePose(before,after);commit('Position updated.');rebuild()}}});gizmo.addEventListener('change',()=>dirty=true);gizmo.addEventListener('objectChange',()=>{if(selectionBox&&gizmo.object)selectionBox.setFromObject(gizmo.object);wallMarkerUI()});
 window.addEventListener('keydown',e=>{if(e.target.matches('input,select,textarea')||document.querySelector('dialog[open]'))return;if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();(e.shiftKey?$('#redo'):$('#undo')).click();return}if(e.key==='Escape'){select(null);setMode('orbit')}if(mode==='walk'&&['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].includes(e.key.toLowerCase())){e.preventDefault();keys.add(e.key.toLowerCase())}});window.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));window.addEventListener('blur',()=>{keys.clear();moves.clear()});document.addEventListener('visibilitychange',()=>{keys.clear();moves.clear();last=performance.now()});
 for(const b of $$('[data-move]')){b.onpointerdown=e=>{e.preventDefault();b.setPointerCapture(e.pointerId);moves.add(b.dataset.move)};for(const ev of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(ev,()=>moves.delete(b.dataset.move))}
}
try{
 renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;renderer.domElement.setAttribute('aria-label','Interactive kitchen design');viewport.append(renderer.domElement);scene.background=new THREE.Color('#e7e3da');scene.fog=new THREE.Fog('#e7e3da',20,42);
 controls=new OrbitControls(camera,renderer.domElement);controls.addEventListener('change',()=>dirty=true);controls.enableDamping=true;controls.dampingFactor=.075;controls.minDistance=1.2;controls.maxDistance=24;controls.maxPolarAngle=Math.PI/2-.02;controls.minPolarAngle=.015;
 gizmo=new TransformControls(camera,renderer.domElement);gizmo.setSize(.85);scene.add(gizmo.getHelper());selectionBox=new THREE.BoxHelper(new THREE.Object3D(),0x007aff);selectionBox.visible=false;selectionBox.material.depthTest=false;selectionBox.renderOrder=1000;scene.add(selectionBox);
 room=await createEditorScene(THREE,scene,{catalog:SERIES,TYPES});
 bindUI();bindScene();snapping();await rebuild();home();
 const resize=()=>{const w=viewport.clientWidth,h=viewport.clientHeight;if(!w||!h)return;camera.aspect=w/h;camera.fov=Math.min(78,Math.max(47,2*Math.atan(Math.tan(47*Math.PI/360)*1.05/camera.aspect)*180/Math.PI));camera.updateProjectionMatrix();renderer.setSize(w,h,false);dirty=true};new ResizeObserver(resize).observe(viewport);resize();$('#loading').hidden=true;
 announce(storageWarning?'Opened the original kitchen. The saved browser draft could not be read.':'Ready. Select an item in the room or add one from the library.');
 function animate(now){requestAnimationFrame(animate);const dt=Math.min((now-last)/1000,.04);last=now;if(document.hidden)return;if(mode==='walk'){if(keys.size||moves.size){walkMove(dt);dirty=true}}else if(controls.update())dirty=true;if(dirty){renderer.render(scene,camera);dirty=false}}requestAnimationFrame(animate);
 // Read-only integration inspection; interaction always goes through the UI.
 window.kitchenDebug={scene,camera,room,get state(){return clone(state)},get mode(){return mode},get selectedId(){return selectedId}};
}catch(error){console.error(error);$('#loading').hidden=true;$('#webgl-error').hidden=false;announce('The 3D editor could not load. Please reload or try a WebGL-capable browser.');}
