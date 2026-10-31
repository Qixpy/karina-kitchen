import {FINISH_SAMPLES} from './catalog-finish-samples.js?v=finishfix1';
/** Private manufacturer data loads only when a catalog is opened. */
export const CATALOG_INDEXES=['private-catalogs/fabuwood/index.json','private-catalogs/milestone/index.json','private-catalogs/tribeca/index.json'];
export class CatalogStore {
 constructor(fetcher=globalThis.fetch?.bind(globalThis)){this.fetcher=fetcher;this.catalogs=[];this.pending=new Map();this.errors=[];}
 async init(){const results=await Promise.allSettled(CATALOG_INDEXES.map(async url=>{const r=await this.fetcher(url);if(!r.ok)throw Error('Catalog index unavailable');const data=await r.json();return (data.catalogs||[]).map(c=>({...c,url:c.url||url.replace('index.json',c.code+'.json')}));}));this.catalogs=results.flatMap((r,i)=>{if(r.status==='fulfilled')return r.value;this.errors.push(CATALOG_INDEXES[i]);return []});return this.catalogs;}
 load(code){if(!this.pending.has(code)){const index=this.catalogs.find(c=>c.code===code);if(!index)return Promise.reject(Error('Catalog '+code+' is not available.'));const request=this.fetcher(index.url).then(r=>{if(!r.ok)throw Error('Could not open '+code);return r.json()}).then(data=>{if(!Array.isArray(data.products)||data.code!==code)throw Error('Invalid catalog data');return data}).catch(e=>{this.pending.delete(code);throw e});this.pending.set(code,request);}return this.pending.get(code);}
 async resolve(ref){if(!ref?.code||!ref.productId)return null;const catalog=await this.load(ref.code),product=catalog.products.find(p=>String(p.id)===String(ref.productId));if(!product)return null;const variant=variantsFor(catalog,product).find(v=>String(v.id??v.optionId)===String(ref.variantId));return {catalog,product,variant};}
}
export const variantId=v=>String(v?.id??v?.optionId??'');
export function variantsFor(c,p){const list=p.variants?.length?p.variants:(c.variants||[]);return p.variantIds?.length?list.filter(v=>p.variantIds.includes(variantId(v))):list;}
export function dimensions(p,v){return {width:Number(v?.widthIn??p.widthIn),height:Number(v?.heightIn??p.heightIn),depth:Number(v?.depthIn??p.depthIn)};}
export function hasDimensions(p,v){return Object.values(dimensions(p,v)).every(n=>Number.isFinite(n)&&n>0);}
export function materialFor(c,p,v){
 const style=(c.styles||[]).find(s=>s.id===v?.styleId),finish=(c.finishes||[]).find(f=>f.id===v?.finishId);
 const label=[style?.name,finish?.name].filter(Boolean).join(' · ');
 const finishImage=(v?.textureUrl||finish?.textureUrl||p.textureUrl||'').replace(/^\//,'')||null;
 const previewImage=(v?.imageUrl||finish?.imageUrl||'').replace(/^\//,'')||null;
 const nativeColor=v?.baseColorFactor||finish?.baseColorFactor||null;
 const sample=!finishImage&&!nativeColor&&c.manufacturer==='Fabuwood'?FINISH_SAMPLES[previewImage]:null;
 return {label:v?.label||label||v?.name||'Catalog default',profile:v?.profile||style?.profile||p.profile||({catalina:'slab',tuscany:'shaker',luna:'slim-shaker'}[style?.name?.toLowerCase()]||'slab'),finishImage,previewImage,baseColorFactor:nativeColor||sample?.baseColorFactor||null,approximateFinish:!!sample};
}
export function catalogVisualFor(c,p,v){const m=materialFor(c,p,v);return {profile:m.profile,finishImage:m.finishImage,baseColorFactor:m.baseColorFactor,approximateFinish:m.approximateFinish,roughness:.8,...frontCounts(p)};}
// Resolve saved catalog choices into render-only visuals. Never rewrite order
// configuration, dimensions, poses or prices, and preserve visuals offline.
export async function refreshCatalogVisuals(items,store){
 return Promise.all(items.map(async item=>{
  if(!item.catalogRef)return item;
  try{const r=await store.resolve(item.catalogRef);if(!r||(variantsFor(r.catalog,r.product).length&&!r.variant))return item;
   return {...item,catalogVisual:catalogVisualFor(r.catalog,r.product,r.variant)};
  }catch{return item;}
 }));
}
export function geometryFor(p){const t=[p.category,p.name,p.sku].join(' ').toLowerCase();
 if(/filler/.test(t))return 'filler';if(/toe.?kick|molding/.test(t))return 'toe-kick';if(/panel|skin|drawerfront|\.door\./.test(t))return 'end-panel';if(/shelf/.test(t))return 'open-shelf';if(/hood/.test(t))return 'hood';
 if(/wall|upper/.test(t)){if(/blind/.test(t))return 'wall-blind';if(/diagonal|corner/.test(t))return 'wall-diagonal';if(/glass|display/.test(t))return 'display-cabinet';return /hboth|double door/.test(t)?'wall-cabinet':'wall-single';}
 if(/oven/.test(t))return /base/.test(t)?'base-oven':'oven-tower';if(/microwave/.test(t))return 'base-microwave';if(/sink/.test(t))return 'sink-base';
 if(/pantry|utility|tall|foodstorage/.test(t))return 'pantry';if(/easy reach|lazy|corner\.90/.test(t))return 'corner-easy-reach';if(/blind/.test(t))return 'corner-blind';
 if(/drawerdoor|door.*drawer|drawer.*door/.test(t))return 'base-cabinet';
 if(/drawer/.test(t)){const n=Number(p.drawers)||Number(t.match(/([1-4])\s*drawers?/)?.[1])||Number(String(p.sku).match(/^([1-4])D/)?.[1])||3;return ['','drawer-single','drawer-double','drawer-triple','drawer-four'][n]||'drawer-triple';}
 if(/fulldoor|full door/.test(t))return /hboth|double/.test(t)?'base-double-door':'base-single-door';return 'base-cabinet';
}
export function frontCounts(p){const t=[p.category,p.name,...(p.attributes||[]).map(a=>a.value)].join(' ').toLowerCase(),type=geometryFor(p),out={};if(Number.isInteger(p.doors))out.doors=p.doors;else if(/drawerdoor|door.*drawer|drawer.*door/.test(t)||/wall|pantry|base-single|base-double/.test(type))out.doors=/double|hboth/.test(t)?2:1;
 if(Number.isInteger(p.drawers))out.drawers=p.drawers;else if(type==='base-cabinet'&&/drawer/.test(t))out.drawers=/double drawers|2 drawers/.test(t)?2:1;return out;}
// Source prices are evaluated only for unchanged catalog configurations.
export function priceFor(resolved,item){
 if(!resolved)return {price:null,reason:'Catalog record unavailable'};
 const {catalog,product:p,variant:v}=resolved;
 if(catalog.placementBlocked||p.placementBlocked)return {price:null,reason:'Catalog identity requires verification'};
 if(catalog.currency&&catalog.currency!=='USD')return {price:null,reason:'Currency needs supplier confirmation'};
 if(variantsFor(catalog,p).length&&!v)return {price:null,reason:'Select a catalog style / finish'};
 if(!hasDimensions(p,v))return {price:null,reason:'Dimensions need verification'};
 const d=dimensions(p,v);if(['width','height','depth'].some(k=>Math.abs(d[k]*.0254-item[k])>.00015))return {price:null,reason:'Custom dimensions require supplier pricing'};
 const entry=v||p,price=entry.price,status=entry.priceStatus||p.priceStatus;
 if(typeof price!=='number'||!Number.isFinite(price)||price<0||!['catalog','source-dated'].includes(status))return {price:null,reason:entry.priceNote||p.priceNote||'Price requires supplier verification'};
 if(Object.keys(item.catalogRef?.options||{}).length)return {price:null,reason:'Modified options require supplier pricing'};
 return {price,currency:catalog.currency||'USD',status,source:entry.source||p.source,notes:[entry.priceNote||p.priceNote,...(entry.pricingConditions||[]),status==='source-dated'?'Source-dated price; '+(entry.source?.rows||[]).map(r=>r.priceListCode).filter(Boolean).join(', '):''].filter(Boolean).join(' ')};
}

export function categoryLabel(p){const t=String(p.category||'').toLowerCase();if(/charge|accessory/.test(t))return 'Accessories & modifications';if(/filler/.test(t))return 'Fillers';if(/panel|doorfor|drawerfront/.test(t)||/\.door\./.test(t))return 'Panels & fronts';if(/molding/.test(t))return 'Moldings';if(/shelf/.test(t))return 'Shelves';if(/bathroom|vanity/.test(t))return 'Vanities';if(/tall/.test(t))return 'Tall cabinets';if(/wall|upper/.test(t))return 'Wall cabinets';if(/sink/.test(t))return 'Sink cabinets';if(/drawer/.test(t))return 'Drawer cabinets';if(/base/.test(t))return 'Base cabinets';return p.category||'Other';}
