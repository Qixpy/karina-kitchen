#!/usr/bin/env python3
"""Read-only import of supplied Design catalogs. No archive code is executed.

Generated catalog JSON/prices and source assets are private local data. Do not
publish these output directories without an authenticated delivery layer.
Only literal dimensions and explicit source price rows are normalized. Generic
Cyncly templates are blocked; unevaluated expressions remain in raw source.
"""
from __future__ import annotations
import argparse, csv, hashlib, io, json, re, zipfile
from collections import defaultdict
from pathlib import Path
from urllib.parse import quote
from xml.etree import ElementTree as ET

ROOT = Path('/Volumes/D-usa.cabinet.store')
SOURCES = {
 'NAC_FL': ROOT/'2026-04-27_NAC Ver 2026 Frameless Cabinetry Catalog_[NAC_FL].zip',
 'NAC_SS': ROOT/'2026-06-30_NAC Ver 2026 Cabinetry Catalog Slim Shaker_[NAC_SS].zip',
 'NAC1': ROOT/'2026-06-30_NAC Ver 2026 Cabinetry Catalog_[NAC1]&[NAC2].zip',
 'NAC2': ROOT/'2026-06-30_NAC Ver 2026 Cabinetry Catalog_[NAC1]&[NAC2].zip',
 'TRIBECAA': ROOT/'tedarıkcı/tribeca/TRIBECA_A_ 2025-07-12 (1).zip',
}
NAMES = {'NAC_FL':'Milestone · NAC_FL · Frameless','NAC_SS':'Milestone · NAC_SS · Slim Shaker','NAC1':'Milestone · NAC1','NAC2':'Milestone · NAC2','TRIBECAA':'Tribeca · TRIBECAA'}
def text(v):
 if isinstance(v,dict): return text(v.get('en-US',v.get('main','')))
 return str(v or '')
def literal(v):
 try:
  if isinstance(v,bool) or not re.fullmatch(r'-?\d+(?:\.\d+)?', str(v)): return None
  n=float(v);return n if n>0 else None
 except (ValueError,TypeError):return None

def readjson(z,n,default=None):
 try:return json.loads(z.read(n).decode('utf-8-sig'))
 except KeyError:return default if default is not None else []
def csvrows(z,n): return list(csv.DictReader(io.StringIO(z.read(n).decode('utf-8-sig'))))
def writejson(p,data):
 p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':'))+'\n')
def norm(s):return re.sub(r'[^a-z0-9]','',s.lower())

class Assets:
 def __init__(self,z,code,dist):
  self.z,self.code,self.dist=z,code,dist;self.saved={}
  self.entries=[n for n in z.namelist() if n.startswith(code+'/') and not n.endswith('/')]
 def find(self,uri):
  if not uri:return None
  uri=uri.replace('\\','/').lower().lstrip('/')
  exact=[n for n in self.entries if n.lower().endswith('/'+uri)]
  if len(exact)==1:return exact[0]
  same=[n for n in self.entries if n.rsplit('/',1)[-1].lower()==uri.rsplit('/',1)[-1]]
  if len(same)==1:return same[0]
  if same and len({hashlib.sha256(self.z.read(n)).digest() for n in same})==1:return same[0]
  return None
 def save(self,entry):
  if not entry:return None
  if entry in self.saved:return self.saved[entry]
  data=self.z.read(entry);suffix=Path(entry).suffix.lower()
  # Hash names eliminate archive traversal, filename ambiguity and URL quoting issues.
  name=hashlib.sha256(data).hexdigest()[:20]+suffix
  rel=Path('assets/private-catalogs')/self.code/name
  target=self.dist/rel;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
  self.saved[entry]='/'+str(rel);return self.saved[entry]
 def uri(self,u):return self.save(self.find(u))

def category(i):
 c=i.get('classification',{});return c.get('fullItemType') or c.get('baseItemType') or 'Other'
def options_allowed(item,feature,option,restrictions):
 for ref in item.get('restrictionRefs',[]):
  for rule in restrictions.get(ref,{}).get('excludedCombinations',[]):
   combo=rule.get('combination',[])
   # Only evaluate explicit single-feature restrictions. Others stay raw.
   if len(combo)==1 and combo[0].get('featureRef')==feature:
    r=combo[0];match=option in r.get('optionRefs',[])
    if (not match if r.get('allExceptTheseOptions') else match):return False
 return True

def native_records(z,code):
 """Decode declared Raima dictionary fields, not heuristic byte scanning.
 Layout cross-checked against CDE's original Raima FILE_ENTRY/RECORD_ENTRY/
 FIELD_ENTRY definitions: https://github.com/cdesktopenv/cde/blob/master/cde/include/Dt/dbtype.h
 Only active EXTHDR rows with self addresses and validated linked EXTDATA
 ownership are returned. Property expressions are retained, never evaluated.
 """
 import struct
 b=z.read(code+'/kitrec9.dbd')
 if b[:6]!=b'V3.00\x1a':raise ValueError('Unsupported Raima dictionary')
 page,nf,nr,nd,ns,nm,nso,nk=struct.unpack_from('<8H',b,6);off=22;files=[];recs=[];fields=[]
 for _ in range(nf):
  raw=b[off:off+60];name=raw[:48].split(b'\0')[0].decode();desc,status,typ,slots,size,pg,flags=struct.unpack_from('<hcc4h',raw,48)
  files.append({'name':name,'slots':slots,'size':size,'page':pg});off+=60
 for _ in range(nr):
  file,length,data,first,count,flags=struct.unpack_from('<6h',b,off);recs.append({'file':file,'length':length,'first':first,'count':count});off+=12
 for _ in range(nd):
  key,typ,length,d1,d2,d3,keyfile,keyno,ptr,rec,flags=struct.unpack_from('<cc9h',b,off);fields.append({'type':typ.decode(),'length':length,'offset':ptr});off+=20
 off+=ns*12+nm*8+nso*4+nk*8;names=b[off:].decode().splitlines()
 for r,n in zip(recs,names[:nr]):r['name']=n;r['fields']=fields[r['first']:r['first']+r['count']]
 for f,n in zip(fields,names[nr:nr+nd]):f['name']=n
 typ=next(k for k,r in enumerate(recs) if r['name']=='EXTHDR');r=recs[typ];f=files[r['file']];data=z.read(code+'/'+f['name']);cache={};out=[]
 def at(addr):
  fi=addr>>24;row=(addr&0xffffff)-1
  if not(0<=fi<len(files)) or row<0:raise ValueError('Invalid Raima address')
  ff=files[fi]
  if fi not in cache:cache[fi]=z.read(code+'/'+ff['name'])
  pos=(row//ff['slots']+1)*ff['page']+4+(row%ff['slots'])*ff['size']
  return cache[fi][pos:pos+ff['size']]
 for pg in range(1,len(data)//f['page']):
  for slot in range(f['slots']):
   offset=pg*f['page']+4+slot*f['size'];raw=data[offset:offset+f['size']]
   if struct.unpack_from('<h',raw)[0]!=typ:continue
   addr=struct.unpack_from('<I',raw,2)[0];expected=(r['file']<<24)|((pg-1)*f['slots']+slot+1)
   if addr!=expected:raise ValueError('Record self-address mismatch')
   row={'offset':offset,'address':addr}
   for field in r['fields']:
    value=raw[field['offset']:field['offset']+field['length']]
    if field['type']=='c':value=value.split(b'\0')[0].decode('latin1')
    elif field['type'] in ['s','l']:
     size=2 if field['type']=='s' else 4;values=struct.unpack('<'+('h' if size==2 else 'i')*(len(value)//size),value);value=values[0] if len(values)==1 else values
    else:continue
    row[field['name']]=value
   count,ptr,last=struct.unpack_from('<3I',raw,6);seen=set();payload=b''
   while ptr and ptr not in seen and len(seen)<10000:
    seen.add(ptr);part=at(ptr)
    if struct.unpack_from('<h',part)[0]!=13 or struct.unpack_from('<I',part,6)[0]!=addr:raise ValueError('Extended record ownership mismatch')
    payload+=part[30:];ptr=struct.unpack_from('<I',part,14)[0]
   if ptr or len(seen)!=count:raise ValueError('Extended record chain mismatch')
   row['payloadHex']=payload.hex()
   # Recognized literal text-property encoding, with a length and NUL bound.
   for vid,name in [(1235,'description'),(3815,'classification'),(1730,'image')]:
    pat=re.escape(struct.pack('<H',vid))+rb'\x10.\x14(.)'
    matches=list(re.finditer(pat,payload,re.S))
    if len(matches)==1:
     m=matches[0];length=m.group(1)[0];val=payload[m.end():m.end()+length]
     if val.endswith(b'\0') and all(c>=32 for c in val[:-1]):row[name]=val[:-1].decode('latin1')
   out.append(row)
 return {'dictionary':{'files':files,'records':recs},'records':out}

def native_products(native,code,finishes,assets):
 prefix='010201' if code=='TRIBECAA' else '010101';products=[]
 for r in native['records']:
  # Low 5 bits identify product row; high flags differ in newer catalogs.
  if not r['RECKEY'].startswith(prefix) or not r.get('USERKODE') or r['USERKODE']==code or (ord(r['RECTYPE'])&31)!=31:continue
  sku=r['USERKODE'];category=r.get('classification','Unresolved native catalog item')
  variants=[{'id':f['id'],'finishId':f['id'],'styleId':f['styleIds'][0],'label':f['name'],'price':None,'priceStatus':'unresolved','textureUrl':f.get('textureUrl'),'source':f['source']} for f in finishes]
  products.append({'id':'native:'+r['RECKEY'],'sku':sku,'name':r.get('description') or sku,'category':category,'widthIn':None,'heightIn':None,'depthIn':None,'dimensionsSource':{'entry':code+'/kit13rec.dat','offset':r['offset'],'status':'Native variable-property inheritance unresolved; generic REC dimensions deliberately not substituted.'},'price':None,'priceStatus':'unresolved','variants':[],'options':[],'imageUrl':assets.uri(r.get('image')),'source':{'entry':code+'/kit13rec.dat','offset':r['offset'],'recordKey':r['RECKEY']},'placementBlocked':True,'blockedReason':'Genuine native SKU; manufacturer dimensions and inherited specifications require a structured export.','raw':{'url':f'/private-catalogs/{"tribeca" if code=="TRIBECAA" else "milestone"}/{code}.raw.json','nativeRecordKey':r['RECKEY']}})
 return products

def import_nac(code,path,dist):
 z=zipfile.ZipFile(path);pre=code+'/ConversionData/CiC3/';assets=Assets(z,code,dist)
 source={'archive':path.name,'entry':pre,'archiveSha256':hashlib.sha256(path.read_bytes()).hexdigest()}
 rawjson={n[len(pre):]:readjson(z,n) for n in z.namelist() if n.startswith(pre) and n.endswith('.json') and '/assets/' not in n.lower()}
 rawcsv={n[len(code)+1:]:csvrows(z,n) for n in z.namelist() if n.startswith(code+'/') and n.endswith('.csv')}
 features=rawjson.get('Features.json',[]);attrs=rawjson.get('Attributes.json',[])
 materials={x['code']:x for x in rawjson.get('Materials.json',[])}
 restrictions={x['code']:x for x in rawjson.get('Restrictions.json',[])}
 pricevalues=rawjson.get('Pricing/price-values.json',[]);pricelists=rawjson.get('Pricing/price-lists.json',[])
 priceby=defaultdict(list)
 for p in pricevalues:priceby[p.get('itemRefCode')].append(p)
 pricegroups={}
 for a in attrs:
  if a['code'].startswith('PriceGroupMap_'):
   try:pricegroups.update(json.loads(a['defaultValue']))
   except (ValueError,KeyError):pass
 attrdefaults={a['code']:a.get('defaultValue') for a in attrs}
 feat=next((f for f in features if f['code'] in ['Door_Upcharge','Base_Door_Upcharge','Door_Finishes']),{})
 oldoptions=feat.get('options',[]);oldbyname={norm(text(o['names'])):o for o in oldoptions}
 dp=rawcsv.get('DataPack/10_Products_Upcharges.csv',[])
 finishrows=[x for x in dp if x.get('UniqueLabel','').startswith('881')]
 notes=[]
 blocked=code=='NAC_FL'
 if blocked:notes.append('Placement blocked: embedded CiC3 catalog identifies itself as CYNCLY_E / Cyncly Generic Frameless Cabinetry, not NAC_FL. Its 415 generic items and zero-price rows are retained only as source evidence. Manufacturer product export is required.')
 else:notes.append('Milestone is the user-supplied brand name; embedded catalog metadata names Skyline Cabinetry. Source price-list dates are older than the ZIP filename. Amounts are source-dated catalog list prices, not a current dealer quote.')
 notes.append('Manufacturer DataPack and CiC3 finish lists differ. Only exact-name finish matches inherit embedded price groups; other finishes remain unresolved. Expressions, accessory rules and raw specifications are preserved without executing them.')
 styles=[];finishes=[];finishoptions={}
 for r in finishrows:
  fid=r['UniqueLabel'].split('.')[-1];name=r['DisplayName_en-US'];old=oldbyname.get(norm(name))
  sid='slim-shaker' if code=='NAC_SS' else ('frameless' if blocked else fid)
  if sid not in {x['id'] for x in styles}:styles.append({'id':sid,'name':'Slim Shaker' if code=='NAC_SS' else ('Frameless' if blocked else name)})
  f={'id':fid,'name':name,'styleIds':[sid],'source':{'entry':code+'/DataPack/10_Products_Upcharges.csv','key':r['UniqueLabel']},'mappingStatus':'matched' if old and not blocked else 'unresolved'}
  modification=old.get('itemModification',{}) if old and not blocked else {}
  layer=next((x for x in modification.get('layers',[]) if x.get('layerName')=='VDoor'),{})
  material=materials.get(layer.get('materialRef'),{})
  tex=material.get('textures',{}).get('maps',{}).get('baseColor',{}).get('uri')
  url=assets.uri(tex)
  if url:f['textureUrl']=url
  rgba=material.get('baseColorFactor')
  if rgba:f['baseColorFactor']=rgba
  try:
   root=ET.fromstring(r.get('CustomData','<xml/>'))
   img=next((e.attrib.get('Expr') for e in root.findall('VARProp') if e.attrib.get('VarID')=='1730'),None)
   if img:
    f['imageUrl']=assets.uri(img)
  except ET.ParseError:pass
  if old:f['sourceOptionId']=old['code'];finishoptions[fid]=old
  finishes.append(f)
 products=[]
 for entry,items in rawjson.items():
  if not entry.startswith('Items_') or not isinstance(items,list):continue
  for row,i in enumerate(items,1):
   refs=i.get('refCodes',{});others=refs.get('others',{});sku=others.get('userCode') or others.get('USERcode') or refs.get('manufCode') or i['code'];dims=i.get('dimensions',{})
   values={k:literal(dims.get(k,{}).get('defaultValue')) for k in ['width','height','depth']}
   p={'id':i['code'],'sku':sku,'name':text(i.get('descriptions',{})) or text(i.get('names',{})) or sku,'category':category(i),
      'widthIn':values['width'],'heightIn':values['height'],'depthIn':values['depth'],'dimensionsSource':{'entry':pre+entry,'row':row,'unit':'inches','basis':'literal default values; ranges are not manufacturing approval'},
      'price':None,'priceStatus':'unresolved','variants':[],'options':i.get('featureRefs',[]),'source':{'entry':pre+entry,'row':row},'placementBlocked':blocked,'raw':{'url':f'/private-catalogs/milestone/{code}.raw.json','entry':entry,'row':row},'dimensionRanges':dims,'attributes':[a for a in i.get('attributes',[]) if a.get('attributeRef') in ['CCPC','BT','DBKT','DBT','DFT','TKH','TKD','CCSBOX','CCSGC','CCSCT'] and not any(c in str(a.get('value','')) for c in ['#','$','?','@'])]}
   if blocked:p['blockedReason']='Generic Cyncly template; not verified NAC_FL product.'
   if 'Charge' in p['category'] or not i.get('visible',True):p['placementBlocked']=True;p['blockedReason']='Source charge or internal helper, not a placeable cabinet.'
   attachment = p['category'].startswith(('Common.Cabinet.Accessory','Kitchen.Door.ForCabinet','Kitchen.DrawerFront.ForCabinet','Kitchen.Front.','Kitchen.Filler.','Kitchen.Molding.'))
   if attachment:
    p['placementBlocked']=True
    p['blockedReason']='Accessory or fitted component: exported defaults describe a configurable installation envelope, not verified standalone product dimensions. Select its host cabinet or obtain a dimensional specification first.'
   if attachment or 'Charge' in p['category']:
    p['widthIn']=p['heightIn']=p['depthIn']=None
    p['dimensionsSource']['status']='Unverified component envelope; source defaults preserved in dimensionRanges and raw data.'
   imageuri=i.get('images',{}).get('main',{}).get('uri')
   if imageuri:p['imageUrl']=assets.uri(imageuri)
   # Match both internal item code and explicit manufacturer SKU; never infer SKU dimensions.
   pricekeys=[i['code'],sku,others.get('cic'),text(i.get('names',{}).get('main')),refs.get('manufCode')];priced=next((priceby[k] for k in pricekeys if k in priceby),[]);p['priceEvidence']=priced
   allowedfeats={f.get('featureRef') for f in i.get('featureRefs',[])}
   hasfinish=feat.get('code') in allowedfeats
   selectedfinishes=finishes if hasfinish else []
   for f in selectedfinishes:
    o=finishoptions.get(f['id']);oid=o['code'] if o else None
    if o and not options_allowed(i,feat.get('code'),oid,restrictions):continue
    candidates=[]
    if o and not blocked:
     if code=='NAC_SS':candidates=[x for x in priced if x['priceRuleCode']=='PR00010']
     else:
      group=pricegroups.get(oid)
      candidates=[x for x in priced if x['priceRuleCode'] in ['PR00011','PR00311'] and x.get('itemAttributeValues')==[str(group)]]
      if not candidates:candidates=[x for x in priced if x['priceRuleCode']=='PR00310']
    # Distinct duplicate/conflicting rates are unresolved instead of arbitrarily selected.
    amounts={x['baseValue'] for x in candidates if x.get('baseValue',0)>0}
    price=next(iter(amounts)) if len(amounts)==1 else None
    variant={'id':f['id'],'optionId':oid,'styleId':f['styleIds'][0],'finishId':f['id'],'label':f['name'],'price':price,'priceStatus':'source-dated' if price is not None else 'unresolved','source':{'entry':pre+'Pricing/price-values.json','rows':candidates},'profile':'slim-shaker' if code=='NAC_SS' else 'framed','pricingConditions':['Default cabinet only; optional assembly, accessories and modifications are not included.','Embedded source price-list dates apply.'],'textureUrl':f.get('textureUrl')}
    p['variants'].append(variant)
   if not hasfinish and not blocked:
    candidates=[x for x in priced if x['priceRuleCode'] in ['PR00010','PR00310'] and x.get('baseValue',0)>0]
    amounts={x['baseValue'] for x in candidates}
    if len(amounts)==1:p['price']=next(iter(amounts));p['priceStatus']='source-dated'
   if p['variants']:
    prices={v['price'] for v in p['variants']}
    if len(prices)==1 and None not in prices:p['price']=next(iter(prices));p['priceStatus']='source-dated'
   products.append(p)
 native = native_records(z,code) if code=='NAC_FL' else None
 if native:
  products=native_products(native,code,finishes,assets)
  notes[0]='Genuine NAC_FL native SKU records recovered from the Raima product tree. Placement remains blocked: inherited dimensions and specifications are not decoded. Embedded CiC3 generic CYNCLY_E template records and zero-price placeholders are excluded from offered products and preserved in raw source.'
 # Preserve all supplied art independently of resolved material/option mappings.
 assetmanifest=[]
 for n in assets.entries:
  if Path(n).suffix.lower() in ['.jpg','.jpeg','.png','.webp','.pdf']:
   assetmanifest.append({'sourceEntry':n,'url':assets.save(n),'bytes':z.getinfo(n).file_size})
 rawurl=f'/private-catalogs/milestone/{code}.raw.json'
 writejson(dist/('private-catalogs/milestone/'+code+'.raw.json'),{'json':rawjson,'csv':rawcsv,'assets':assetmanifest,'native':native})
 normalized={'schemaVersion':1,'code':code,'manufacturer':'Milestone','name':NAMES[code],'source':source,'currency':'USD','priceBasis':'catalog-list','styles':styles,'finishes':finishes,'products':products,'placementBlocked':blocked,'notes':notes,'specs':[],
   'raw':{'url':rawurl,'features':features,'materials':list(materials.values()),'restrictions':list(restrictions.values()),'priceLists':pricelists,'priceRules':rawjson.get('Pricing/price-rules.json',[]),'priceTags':pricevalues},
   'coverage':{'products':len(products),'placeableProducts':sum(all(p[k] is not None for k in ['widthIn','heightIn','depthIn']) and not p['placementBlocked'] for p in products),'pricedProducts':sum(p['price'] is not None or any(v['price'] is not None for v in p['variants']) for p in products),'finishes':len(finishes),'assets':len(assetmanifest),'notes':notes}}
 writejson(dist/('private-catalogs/milestone/'+code+'.json'),normalized)
 return {'code':code,'manufacturer':'Milestone','name':NAMES[code],'url':f'/private-catalogs/milestone/{code}.json','productCount':len(products),'notes':notes,'placementBlocked':blocked,'coverage':normalized['coverage']}

def import_tribeca(path,dist):
 code='TRIBECAA';z=zipfile.ZipFile(path);assets=Assets(z,code,dist);native=native_records(z,code);products=native_products(native,code,[],assets)
 notes=['The catalog database uses Raima Data Manager 3.30 binary DAT/DBD records. SKU-like strings are not sufficient to establish active products, dimensions or price relationships. A validated manufacturer/Cyncly structured export is required before placement and quoting.',
 'The two bundled specification PDFs identify St. Martin Cabinetry, not Tribeca. They are preserved as source evidence but are not asserted to describe current Tribeca construction or available styles.']
 specs=[];manifest=[]
 for n in assets.entries:
  if Path(n).suffix.lower() in ['.jpg','.jpeg','.png','.pdf']:
   url=assets.save(n);manifest.append({'sourceEntry':n,'url':url})
   if n.endswith('.pdf'):specs.append({'url':url,'sourceEntry':n,'pageCount':3 if 'Door_Styles' in n else 1,'verificationStatus':'manufacturer-conflict','notes':notes[1]})
 # Keep original archive inventory and textual evidence separately, never parse
 # floating-point byte patterns as money or infer dimensions from SKU spelling.
 inventory=[{'entry':i.filename,'bytes':i.file_size,'crc32':f'{i.CRC:08x}'} for i in z.infolist()]
 raw={'inventory':inventory,'assets':manifest,'binaryFormat':'Raima Data Manager Version 3.30','embeddedSpecManufacturer':'St. Martin Cabinetry','unverifiedDocumentStyles':[
  {'name':'Clayton','finishes':['Cherry Chestnut','Gunsmoke'],'sourcePage':22},
  {'name':'Bellrose','finishes':['Cherry Chestnut'],'sourcePage':22},
  {'name':'Lakeland','finishes':['Simply White','Cherry Golden Honey','Cherry Cognac','Gunsmoke'],'sourcePage':22},
  {'name':'Greenfield','finishes':['Simply White','Simply White Glaze'],'sourcePage':23},
  {'name':'Ridgewood','finishes':['Simply White','Simply White Glaze','Cherry Golden Honey','Cherry Black Walnut'],'sourcePage':23},
  {'name':'Newhaven','finishes':['Simply White','Simply White Glaze','Cherry Golden Honey','Cherry Cognac'],'sourcePage':23},
  {'name':'Wellington','finishes':['Simply White','Simply White Glaze','Alder Cognac'],'sourcePage':24}],
  'unverifiedDocumentConstruction':{'sourcePage':16,'back':'1/4 inch plywood, recessed 3/4 inch','floorAndCeiling':'3/4 inch plywood, wood-grain washable melamine interior','sides':'3/4 inch plywood','shelves':'3/4 inch plywood, melamine veneer','doors':'7/8 inch solid wood; separate style pages specify exceptions','hinges':'Six-way adjustable clip hinges; soft close except diagonal wall cabinets','drawerSlides':'St. Martin concealed undermount full extension, 70 lb capacity, self-closing','drawerBox':'3/4 inch solid maple, dovetail corners, clear UV finish','toeSpace':'4-1/2 inch high','levelingFeet':'Adjustable metal legs'},'notes':notes,'native':native}
 notes[0]='Genuine Tribeca native SKU records recovered from active Raima product-tree records. Their variable-property inheritance, dimensions, finish compatibility and price relationships remain unresolved. A structured manufacturer/Cyncly export is required before placement and quoting.'
 writejson(dist/'private-catalogs/tribeca/TRIBECAA.raw.json',raw)
 result={'schemaVersion':1,'code':code,'manufacturer':'Tribeca','name':NAMES[code],'source':{'archive':path.name,'entry':'TRIBECAA/','archiveSha256':hashlib.sha256(path.read_bytes()).hexdigest()},'currency':'USD','priceBasis':'catalog-list','styles':[],'finishes':[],'products':products,'placementBlocked':True,'notes':notes,'raw':{'url':'/private-catalogs/tribeca/TRIBECAA.raw.json'},'specs':specs,'coverage':{'products':len(products),'pricedProducts':0,'placeableProducts':0,'archiveEntries':len(inventory),'specPages':4,'notes':notes}}
 writejson(dist/'private-catalogs/tribeca/TRIBECAA.json',result)
 return {'code':code,'name':NAMES[code],'manufacturer':'Tribeca','url':'/private-catalogs/tribeca/TRIBECAA.json','productCount':len(products),'placementBlocked':True,'notes':notes,'coverage':result['coverage']}

def main():
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--dist',type=Path,default=Path(__file__).resolve().parents[1]/'dist');args=parser.parse_args()
 index=[]
 for code in ['NAC_FL','NAC_SS','NAC1','NAC2']:
  entry=import_nac(code,SOURCES[code],args.dist);index.append(entry);print(code,entry['coverage'])
 writejson(args.dist/'private-catalogs/milestone/index.json',{'schemaVersion':1,'manufacturer':'Milestone','catalogs':index})
 tribeca=import_tribeca(SOURCES['TRIBECAA'],args.dist)
 writejson(args.dist/'private-catalogs/tribeca/index.json',{'schemaVersion':1,'manufacturer':'Tribeca','catalogs':[tribeca]});print('TRIBECAA',tribeca['coverage'])
if __name__=='__main__':main()
