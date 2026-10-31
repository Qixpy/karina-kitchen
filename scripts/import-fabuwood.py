#!/usr/bin/env python3
"""Read-only Fabuwood Design Flex archive importer. Never executes vendor code.
Usage: python import-fabuwood.py ARCHIVE.zip --out-dir DIST_DIRECTORY
Requires pypdf. Retains unresolved native pricing/dimensions as null.
"""
import argparse, csv, hashlib, io, json, re, struct, zipfile
from collections import defaultdict
from pathlib import Path
from urllib.parse import quote
from xml.etree import ElementTree as ET
from pypdf import PdfReader

SCHEMA_VERSION = 1

def decode(b):
    try: return b.decode('utf-8-sig')
    except UnicodeDecodeError: return b.decode('cp1252')

def table(z,n):
    if n not in z.namelist(): return []
    return [{str(k or '_extra'):v for k,v in r.items()} for r in csv.DictReader(io.StringIO(decode(z.read(n))))]

def write_json(p,o):
    p.parent.mkdir(parents=True,exist_ok=True)
    p.write_text(json.dumps(o,ensure_ascii=False,separators=(',',':')),encoding='utf8')

def props(s):
    try: return {e.get('VarID'):e.get('Expr') for e in ET.fromstring(s).iter('VARProp') if e.get('PropID')=='Expression'}
    except ET.ParseError:return {}

def category(name):
    # Browsing classification only. This does not determine dimensions or geometry.
    s=name.lower()
    for needle,cat in [('vanit','Vanities'),('pantry','Tall cabinets'),('oven','Tall cabinets'),('drawer','Drawer cabinets'),('sink','Sink cabinets'),('wall','Wall cabinets'),('base','Base cabinets'),('mold','Moldings'),('filler','Fillers'),('panel','Panels')]:
        if needle in s:return cat
    return 'Catalog items'

def native_headers(z,prefix):
    """Read authoritative DBD field layout and active EXTHDR identities only.
    Variable EXTDATA properties are retained as unresolved; generic REC is not geometry.
    """
    n=prefix+'kitrec9.dbd'
    if n not in z.namelist():return {'headers':[],'schema':None}
    b=z.read(n);page,nf,nr,nd,ns,nm,nso,nk=struct.unpack_from('<8H',b,6)
    off=22;files=[];recs=[];fields=[]
    for _ in range(nf):
        r=b[off:off+60];_,_,typ,slots,size,pg,_=struct.unpack_from('<hcc4h',r,48)
        files.append({'name':r[:48].split(b'\0')[0].decode(),'slots':slots,'size':size,'page':pg});off+=60
    for _ in range(nr):
        file,length,data,first,count,flags=struct.unpack_from('<6h',b,off)
        recs.append({'file':file,'length':length,'first':first,'count':count});off+=12
    for _ in range(nd):
        key,typ,length,d1,d2,d3,kfile,kno,ptr,rec,flags=struct.unpack_from('<cc9h',b,off)
        fields.append({'type':typ.decode(),'length':length,'offset':ptr,'record':rec});off+=20
    off+=ns*12+nm*8+nso*4+nk*8;labels=b[off:].decode().splitlines()
    if len(labels)<nr+nd:raise ValueError('Incomplete Raima dictionary names: '+n)
    for r,label in zip(recs,labels[:nr]):r['name']=label
    for f,label in zip(fields,labels[nr:nr+nd]):f['name']=label
    rid=next(i for i,r in enumerate(recs) if r['name']=='EXTHDR');rec=recs[rid];file=files[rec['file']]
    payload=z.read(prefix+file['name']);headers=[]
    for pg in range(1,len(payload)//file['page']):
        for slot in range(file['slots']):
            pos=pg*file['page']+4+slot*file['size'];r=payload[pos:pos+file['size']]
            if len(r)!=file['size'] or struct.unpack_from('<h',r)[0]!=rid:continue
            row={'source':{'entry':prefix+file['name'],'offset':pos}}
            for f in fields[rec['first']:rec['first']+rec['count']]:
                value=r[f['offset']:f['offset']+f['length']]
                if f['type']=='c':row[f['name']]=decode(value.split(b'\0')[0]) if f['length']>1 else value[0]
                elif f['type']=='s':row[f['name']]=struct.unpack('<h',value)[0]
                elif f['type']=='l':row[f['name']]=struct.unpack('<i',value)[0]
            headers.append(row)
    return {'headers':headers,'schema':{'source':n,'files':files,'records':recs,'fields':fields}}

def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('archive');ap.add_argument('--out-dir',required=True)
    a=ap.parse_args();out=Path(a.out_dir);archive=Path(a.archive)
    entries=[];pdfcache={};summaries=[]
    with zipfile.ZipFile(archive) as z:
        names=set(z.namelist());lower={n.lower():n for n in names}
        root=ET.fromstring(z.read('CatInfo.Xml'))
        for c in root.iter('Catalog'):
            if c.findtext('ManufName')!='Fabuwood':continue
            code=c.findtext('Name');prefix=c.findtext('Directory').replace('\\','/')+'/'
            name=c.findtext('Description');dp=prefix+'DataPack/';cp=prefix+'ConversionData/Pricing/'
            assetdir=out/'assets/private-catalogs'/code
            def asset(n):
                if n not in names:return None
                # Explicit controlled destination, no archive paths extracted as directories.
                suffix=Path(n).suffix.lower();digest=hashlib.sha256(z.read(n)).hexdigest()[:16]
                target=assetdir/(digest+suffix);target.parent.mkdir(parents=True,exist_ok=True)
                if not target.exists():target.write_bytes(z.read(n))
                return '/assets/private-catalogs/'+quote(code)+'/'+target.name
            def find_image(ref):
                if not ref:return None
                return lower.get((prefix+re.sub(r'\\+','/',ref)).lower())
            raw={}
            for n in sorted(names):
                if n.startswith(dp) and n.endswith('.csv') or n.startswith(cp) and n.endswith('.csv'):
                    raw[n[len(prefix):]]={'source':{'entry':n},'rows':table(z,n)}
            opts=table(z,dp+'15_Options_Upcharges.csv')
            styles=[{'id':r['UniqueLabel'],'name':r['DisplayName_en-US'],'profile':'slab' if r['DisplayName_en-US']=='Catalina' else None,'source':{'entry':dp+'15_Options_Upcharges.csv','row':i+2}} for i,r in enumerate(opts) if r.get('Parent')=='8810000' and r['UniqueLabel']!='SALES-T']
            sm={s['id']:s for s in styles}
            rules=table(z,dp+'02_PriceRulesDetail.csv');stylefinish=defaultdict(list)
            finishparents={'FINISH','FINISHES','8280000'}
            finishopts=[r['UniqueLabel'] for r in opts if r.get('Parent') in finishparents]
            for r in rules:
                if 'Key_2' not in r and len(finishopts)==1:r['Key_2']=finishopts[0]
            for r in rules:
                if r.get('Key_1') in sm:stylefinish[r['Key_2']].append(r['Key_1'])
            textures=[n for n in sorted(names) if n.startswith(prefix+'Textures/') and n.lower().endswith(('.jpg','.png','.tif'))]
            # Texture association only for exact finish-name matches to the manufacturer filename.
            def norm(s):return re.sub('[^a-z0-9]','',s.lower())
            finishes=[]
            for i,r in enumerate(opts):
                if r.get('Parent') not in finishparents:continue
                label=r['DisplayName_en-US'];picture=find_image(r.get('ImageLargeURL')) or find_image(r.get('ImageMediumURL'))
                expected=[norm(x+' '+label+'-V') for x in ['Illume','Allure','Ovela','Quest','Value']]
                exact=[n for n in textures if norm(Path(n).stem) in expected]
                finishes.append({'id':r['UniqueLabel'],'name':label,'styleIds':stylefinish.get(r['UniqueLabel'],[]),'imageUrl':asset(picture) if picture else None,'textureUrl':asset(exact[0]) if len(exact)==1 else None,'materialProperties':props(r.get('CustomData','')),'source':{'entry':dp+'15_Options_Upcharges.csv','row':i+2,'imageEntry':picture,'textureEntry':exact[0] if len(exact)==1 else None}})
            fm={f['id']:f for f in finishes};variants=[]
            for i,r in enumerate(rules):
                sid=r.get('Key_1');fid=r.get('Key_2')
                if sid not in sm or fid not in fm:continue
                variants.append({'id':sid+'::'+fid,'label':sm[sid]['name']+' · '+fm[fid]['name'],'styleId':sid,'finishId':fid,'profile':sm[sid]['profile'],'textureUrl':fm[fid]['textureUrl'],'imageUrl':fm[fid]['imageUrl'],'price':None,'priceStatus':'unresolved','priceLevel':r.get('Value'),'source':{'entry':dp+'02_PriceRulesDetail.csv','row':i+2}})
            specs=[];pdfproducts={};pagerecords=[]
            for pn in sorted(n for n in names if n.startswith(prefix+'Multimedia/Specs/') and n.endswith('.pdf')):
                b=z.read(pn);sha=hashlib.sha256(b).hexdigest()
                if sha not in pdfcache:pdfcache[sha]=[p.extract_text() or '' for p in PdfReader(io.BytesIO(b)).pages]
                pages=pdfcache[sha];url=asset(pn)
                specs.append({'url':url,'sourceEntry':pn,'pageCount':len(pages),'name':Path(pn).name})
                for page,t in enumerate(pages,1):
                    pagerecords.append({'entry':pn,'page':page,'text':t})
                    # Exact standalone item strings; never interpret embedded digits as dimensions.
                    for line in t.splitlines():
                        line=line.strip().lstrip('*').strip()
                        if re.fullmatch(r'[A-Z][A-Z0-9]*(?:[-/][A-Z0-9]+)*',line) and re.search(r'\d',line) and not re.fullmatch(r'[A-Z]\d',line) and len(line)<35:
                            pdfproducts.setdefault(line,{'sku':line,'name':line,'source':{'entry':pn,'page':page,'url':url+'#page='+str(page)},'availabilityStatus':'pdf-item-needs-verification'})
            texturl='/private-catalogs/fabuwood/'+code+'.spec-text.json'
            write_json(out/('private-catalogs/fabuwood/'+code+'.spec-text.json'),pagerecords)
            mirrorpath=prefix+'AutoMirrorRelations.Txt';mirrors=[];products={}
            if mirrorpath in names:
                for line in decode(z.read(mirrorpath)).splitlines():
                    if '<->' not in line:continue
                    pair=[]
                    for side in line.split('<->'):
                        parts=side.strip().split('»',1)
                        if len(parts)!=2:continue
                        sku,title=map(str.strip,parts);pair.append(sku)
                        products[sku]={'sku':sku,'name':title,'source':{'entry':mirrorpath,'line':line},'availabilityStatus':'native-mirror-item'}
                    if len(pair)==2:mirrors.append(pair)
            prows=table(z,cp+'10_Products.csv')
            for i,r in enumerate(prows):
                sku=r['Name_en-US']
                products.setdefault(sku,{'sku':sku,'name':r.get('Description_en-US') or sku,'source':{'entry':cp+'10_Products.csv','row':i+2},'availabilityStatus':'legacy-conversion-unverified'})
                products[sku]['recordId']=r['Code']
            for sku,p in pdfproducts.items():
                if sku in products:products[sku]['specSource']=p['source'];products[sku].setdefault('availabilityStatus','pdf-item-needs-verification')
                else:products[sku]=p
            tags=table(z,cp+'72_PriceTags_Default.csv');evidence=defaultdict(list)
            for i,r in enumerate(tags):
                if r.get('KeyTxt1'):evidence[r['KeyTxt1']].append({'amountText':r.get('Value'),'rule':r.get('PriceRuleRef'),'optionId':r.get('Key2'),'optionLabel':r.get('KeyTxt2'),'source':{'entry':cp+'72_PriceTags_Default.csv','row':i+2}})
            prodfeatures=table(z,cp+'40_ProductsXFeatures.csv');pfeatures=defaultdict(list)
            for r in prodfeatures:
                if r.get('ProductTxt'):pfeatures[r['ProductTxt']].append(r)
            native=native_headers(z,prefix)
            native_by_sku=defaultdict(list)
            for h in native['headers']:
                if h.get('USERKODE'):native_by_sku[h['USERKODE']].append(h)
            normalized=[]
            for sku,p in sorted(products.items()):
                p.update({'id':code+':'+sku,'category':category(p['name']),'widthIn':None,'heightIn':None,'depthIn':None,'dimensionsSource':None,'price':None,'priceStatus':'unresolved','variants':[],'options':[],'variantAvailability':'catalog-level-only; SKU restrictions require native validation','pricingEvidence':{'rowCount':len(evidence.get(sku,[])),'rawUrl':'/private-catalogs/fabuwood/'+code+'.raw.json','productRef':p.get('recordId')},'featureEvidence':{'rowCount':len(pfeatures.get(sku,[])),'productRef':p.get('recordId')},'nativeRecordKeys':[h['RECKEY'] for h in native_by_sku.get(sku,[])],'notes':['Dimensions require an authoritative product export; SKU digits are not treated as measurements.']})
                normalized.append(p)
            # Visually verified diagram/table measurements from the bundled Illume PDF.
            # Binding to this exact document prevents applying its measurements to another revision.
            if code.startswith('FWI') and any(x['name']=='Illume Spec Book 08-19-26.pdf' for x in specs):
                verified={}
                for h,page in [(30,28),(36,30),(39,32),(42,34)]:
                    for width in [27,30,36]:
                        verified[f'WBC{width}{h}']=(width,h,13,page,'Wall cabinets',None)
                for suffix,width in [('36/39',30),('39/42',33),('42/45',36),('48/51',42)]:
                    for ending in ['', 'FD']:
                        verified['BLB'+suffix+ending]=(width,30,24,44,'Base cabinets',{'min':3.75,'max':5.375,'sourcePage':5})
                for sku,width in [('BMC24',24),('BMC30',30),('BOC30',30)]:
                    verified[sku]=(width,30,24,47,'Base cabinets',{'min':3.75,'max':5.375,'sourcePage':5})
                spec=next(x for x in specs if x['name']=='Illume Spec Book 08-19-26.pdf')
                for p in normalized:
                    base=p['sku']
                    if base not in verified and base[-1:] in ('R','L'):base=base[:-1]
                    if base not in verified:continue
                    w,h,d,page,cat,feet=verified[base]
                    p.update({'widthIn':w,'heightIn':h,'depthIn':d,'category':cat,'availabilityStatus':'visually-verified-spec-item','dimensionsStatus':'verified','dimensionsSource':{'entry':spec['sourceEntry'],'page':page,'url':spec['url']+'#page='+str(page),'method':'Visually verified manufacturer dimension diagram and actual-width table; width not inferred from SKU'},'heightBasis':'cabinet-body-before-feet' if feet else 'overall','adjustableFeetIn':feet,'notes':['Adjacent wall fillers and clearances must follow the source specifications.']})
            other_verified={}
            if code.startswith('FWA'):
                other_verified={sku:(w,34.5,24,58,'Base cabinets') for sku,w in [('BMC24',24),('BMC30',30),('BOC30',30)]}
                exact_pdf='Allue Lavari Spec Books 08-18-26.pdf'
            elif code.startswith('FWO'):
                other_verified={sku:(w,34.5,24,43,'Base cabinets') for sku,w in [('BMC24',24),('BMC30',30),('BOC30',30)]}
                exact_pdf='Ovela Spec Book 08-19-26.pdf'
            elif code.startswith('FWQ'):
                other_verified={f'WBC{w}30':(w,30,12,20,'Wall cabinets') for w in [24,30,36,42]}
                other_verified['W6030']=(60,30,12,20,'Wall cabinets')
                exact_pdf='Quest Spec Book 08-19-26.pdf'
            elif code.startswith('FWV'):
                other_verified={f'WBC{w}30':(w,30,12,14,'Wall cabinets') for w in [24,30,36,42]}
                exact_pdf='Value Spec Book 08-19-26.pdf'
            if other_verified and any(x['name']==exact_pdf for x in specs):
                spec=next(x for x in specs if x['name']==exact_pdf)
                for p in normalized:
                    base=p['sku']
                    if base not in other_verified and base[-1:] in ('R','L'):base=base[:-1]
                    if base not in other_verified:continue
                    w,h,d,page,cat=other_verified[base]
                    p.update({'widthIn':w,'heightIn':h,'depthIn':d,'category':cat,'availabilityStatus':'visually-verified-spec-item','dimensionsStatus':'verified','dimensionsSource':{'entry':spec['sourceEntry'],'page':page,'url':spec['url']+'#page='+str(page),'method':'Visually verified manufacturer diagram and actual-width table'},'heightBasis':'overall','notes':['Adjacent wall fillers and clearances must follow the source specifications.']})
            notes=['Native cabinet records use the Raima database format; complete cabinet dimensions and price evaluation are not decoded.','Style/finish combinations follow the source price-level matrix. Price levels are not dollar amounts.','Spec books state valid until October 2026 and warn some updated information is missing.','No unsupported zero prices or estimated dimensions are substituted.','Some PDF pages contain hidden legacy text layers. Automatically extracted PDF item codes need verification against the visible page; only explicitly marked measurements were visually verified.']
            if prows:notes.append('ConversionData pricing is identical across Allure, Quest and Value and includes legacy styles; retained as evidence, not certified current totals.')
            inventory=[{'entry':n,'bytes':z.getinfo(n).file_size,'crc32':format(z.getinfo(n).CRC,'08x')} for n in sorted(names) if n.startswith(prefix) and not n.endswith('/')]
            # Keep all static manufacturer texture paths and file metadata; export only textures explicitly mapped above.
            cat={'schemaVersion':SCHEMA_VERSION,'code':code,'manufacturer':'Fabuwood','name':name,'currency':'USD','priceBasis':'catalog-list','source':{'archive':archive.name,'entry':'CatInfo.Xml','version':c.findtext('Version')},'styles':styles,'finishes':finishes,'variants':variants,'products':normalized,'specs':specs,'specTextUrl':texturl,'mirrorRelations':mirrors,'rawUrl':'/private-catalogs/fabuwood/'+code+'.raw.json','coverage':{'productCount':len(normalized),'styleCount':len(styles),'finishCount':len(finishes),'variantCount':len(variants),'resolvedPrices':0,'completeDimensions':sum(all(isinstance(p[k],(float,int)) for k in ['widthIn','heightIn','depthIn']) for p in normalized),'structuredTableCount':len(raw),'nativeCabinetDatabaseDecoded':False},'notes':notes}
            write_json(out/('private-catalogs/fabuwood/'+code+'.json'),cat)
            write_json(out/('private-catalogs/fabuwood/'+code+'.raw.json'),{'schemaVersion':SCHEMA_VERSION,'code':code,'tables':raw,'native':native,'inventory':inventory,'nestedArchives':[{'entry':n,'entries':zipfile.ZipFile(io.BytesIO(z.read(n))).namelist()} for n in sorted(names) if n.startswith(prefix) and n.endswith('.zip')],'textureEntries':textures})
            entry={'code':code,'name':name,'manufacturer':'Fabuwood','url':'/private-catalogs/fabuwood/'+code+'.json','productCount':len(normalized),'notes':notes,'coverage':cat['coverage']};entries.append(entry);print(code,cat['coverage'],flush=True)
        write_json(out/'private-catalogs/fabuwood/index.json',{'schemaVersion':SCHEMA_VERSION,'manufacturer':'Fabuwood','catalogs':entries,'privacy':'Private catalog data. Do not publish in a public source repository.'})

if __name__=='__main__':main()
