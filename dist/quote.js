import {priceFor,materialFor} from './catalog-store.js?v=catalogs4';
const money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n);
const text=s=>String(s??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[–—]/g,'-').replace(/[″“”]/g,'"').replace(/[’]/g,"'").replace(/[^\x20-\x7e\n]/g,' ');
const excluded=new Set(['room-wall','stool','pendant','cooktop','fridge','range','dishwasher']);
export async function quoteRows(state,store){
 const rows=[],sources=new Map();
 for(const item of state.items){
  if(excluded.has(item.typeId)&&!item.catalogRef)continue;
  const quantity=Math.max(1,Math.min(1000,Math.floor(Number(item.quantity)||1)));
  if(!item.catalogRef){rows.push({catalog:'Concept items',sku:'UNSPECIFIED',name:item.name||item.typeId,finish:'',quantity,price:null,reason:'Planning model - select a manufacturer product'});continue}
  let r;try{r=await store.resolve(item.catalogRef)}catch{}
  const evaluated=priceFor(r,item),p=r?.product,v=r?.variant,c=r?.catalog;
  const row={catalog:item.catalogRef.code,sku:p?.sku||item.catalogRef.productId,name:p?.name||item.name,finish:r?materialFor(c,p,v).label:'',quantity,price:evaluated.price,reason:evaluated.reason,notes:evaluated.notes||'',dimensions:[item.width,item.height,item.depth].map(n=>(n/.0254).toFixed(2).replace(/\.00$/,'')).join(' x ')+' in',source:p?.source};
  rows.push(row);if(c)sources.set(c.code,{name:c.name,source:c.source,notes:c.coverage?.notes||c.notes||[],specs:c.specs||[]});
 }
 const incomplete=rows.filter(r=>r.price===null),totalCents=rows.reduce((s,r)=>s+(r.price===null?0:Math.round(r.price*100)*r.quantity),0);
 return {rows,sources:[...sources].map(([code,v])=>({code,...v})),incomplete,totalCents};
}
async function loadPDF(){if(globalThis.PDFLib)return globalThis.PDFLib;await import('./vendor/pdf-lib.min.js');return globalThis.PDFLib;}
export async function createQuotePDF(state,store,PDFLib,now=new Date()){
 const result=await quoteRows(state,store),lib=PDFLib||await loadPDF(),pdf=await lib.PDFDocument.create();
 const regular=await pdf.embedFont(lib.StandardFonts.Helvetica),bold=await pdf.embedFont(lib.StandardFonts.HelveticaBold);let page,y,pageNo=0;const ink=lib.rgb(.12,.14,.16),gray=lib.rgb(.4,.43,.46),rule=lib.rgb(.84,.86,.88),blue=lib.rgb(.13,.28,.43),margin=42,width=612,height=792;
 function line(s,x,yy,size=10,font=regular,color=ink){page.drawText(text(s),{x,y:yy,size,font,color});}
 function wrap(s,max,size=9,font=regular){const lines=[];for(const paragraph of text(s).split('\n')){let current='';for(const word of paragraph.split(/\s+/)){if(font.widthOfTextAtSize((current?current+' ':'')+word,size)>max&&current){lines.push(current);current=word}else current+=(current?' ':'')+word}if(current)lines.push(current)}return lines.length?lines:[''];}
 function next(){page=pdf.addPage([width,height]);pageNo++;y=height-46;line(state.project?.dealer||'Kitchen Atelier',margin,y,11,bold,blue);line('QUOTE',width-105,y,17,bold);y-=23;line(state.name||'Kitchen design',margin,y,11,bold);line(now.toLocaleDateString('en-US'),width-105,y,9,regular,gray);page.drawLine({start:{x:margin,y:y-12},end:{x:width-margin,y:y-12},color:rule,thickness:.7});y-=33;}
 function ensure(n){if(y-n<64)next();}
 function paragraph(s,size=9,color=gray){for(const t of wrap(s,width-2*margin,size)){ensure(size+6);line(t,margin,y,size,regular,color);y-=size+5}y-=5;}
 next();
 if(state.project?.customer)paragraph('Prepared for: '+state.project.customer,10,ink);
 if(state.project?.address)paragraph('Project: '+state.project.address,9,ink);
 if(state.project?.designer)paragraph('Designer: '+state.project.designer,9,ink);
 paragraph('Basis: supplied catalog list prices (USD). Tax, delivery, installation, appliances and stone fabrication are not included unless individually listed. This is a quote, not a payment receipt.');
 if(result.incomplete.length)paragraph('DRAFT - INCOMPLETE PRICING. '+result.incomplete.length+' item(s) need supplier pricing. The priced subtotal below is not a complete project total.',10,lib.rgb(.62,.25,.12));
 let currentCatalog='',number=0;
 function tableHead(code){line('CATALOG '+code,margin,y,11,bold,blue);y-=21;line('# / SKU',margin,y,8,bold);line('Description / selection',153,y,8,bold);line('Qty',407,y,8,bold);line('Unit',458,y,8,bold);line('Amount',516,y,8,bold);y-=18;}
 for(const row of result.rows){
  const details=[row.name,row.finish,row.dimensions,row.price===null?row.reason:row.notes].filter(Boolean).join('\n');const lines=wrap(details,243,8.5),skuLines=wrap((++number)+'. '+row.sku,102,8.5,bold);const rh=Math.max(lines.length,skuLines.length)*12+12;
  if(currentCatalog!==row.catalog){ensure(rh+55);currentCatalog=row.catalog;y-=8;tableHead(currentCatalog);}else if(y-rh<64){next();tableHead(currentCatalog);}
  skuLines.forEach((t,n)=>line(t,margin,y-n*12,8.5,bold));lines.forEach((t,n)=>line(t,153,y-n*12,8.5));line(row.quantity,411,y,8.5);line(row.price===null?'TBD':money(row.price),446,y,8);line(row.price===null?'TBD':money(Math.round(row.price*100)*row.quantity/100),510,y,8);
  y-=rh;page.drawLine({start:{x:margin,y:y+5},end:{x:width-margin,y:y+5},color:rule,thickness:.4});
 }
 ensure(80);y-=18;line(result.incomplete.length?'PRICED SUBTOTAL':'CATALOG TOTAL',margin,y,12,bold,blue);line(money(result.totalCents/100),455,y,15,bold,blue);y-=28;
 if(!result.rows.length)paragraph('No cabinet products have been added to this design.');
 if(result.incomplete.length)paragraph('Unpriced items are excluded from this subtotal, not treated as free.');
 paragraph('All selections, availability and site measurements require final supplier confirmation. Custom cuts, accessories and options not explicitly resolved from the catalog require separate pricing.');
 if(result.sources.length){ensure(75);y-=12;line('CATALOG SOURCES',margin,y,11,bold);y-=20;for(const source of result.sources){paragraph(source.code+' - '+source.name+'\n'+(source.source?.archive||'')+'\n'+(source.source?.version||''));const notes=Array.isArray(source.notes)?source.notes:[source.notes];for(const note of notes.slice(0,6))if(note)paragraph(typeof note==='string'?note:JSON.stringify(note),8);}}
 if(state.project?.notes){ensure(45);line('PROJECT NOTES',margin,y,10,bold);y-=18;paragraph(state.project.notes);}
 const pages=pdf.getPages();pages.forEach((p,i)=>{p.drawText('Kitchen Atelier | '+(result.incomplete.length?'Draft - incomplete pricing':'Catalog quote')+' | '+(i+1)+' / '+pages.length,{x:margin,y:29,size:8,font:regular,color:gray});});
 pdf.setTitle((state.name||'Kitchen')+' - Quote');pdf.setCreationDate(now);return {bytes:await pdf.save(),...result};
}
export async function downloadQuote(state,store){const q=await createQuotePDF(state,store),url=URL.createObjectURL(new Blob([q.bytes],{type:'application/pdf'})),a=document.createElement('a');a.href=url;a.download=(state.name||'Kitchen').replace(/[^a-z0-9 -]/gi,'').trim()+' - Quote.pdf';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return q;}
