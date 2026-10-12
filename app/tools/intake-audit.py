"""Read-only archive audit: exact inputs, bounded names/sizes, rejection fixtures.
Usage: python tools/intake-audit.py workflow.zip glyphoku.zip vexa.zip
Nested archives are hashed/inventoried, never extracted or executed.
"""
from pathlib import Path,PurePosixPath
import sys,zipfile,hashlib,json,stat,io,re,datetime
ROOT=Path(__file__).resolve().parents[1]
def check(entries):
    seen=set();size=0
    for i in entries:
        name=i.filename
        if not name or '\\' in name or name.startswith('/') or re.match(r'^[A-Za-z]:',name) or '..' in PurePosixPath(name).parts: raise ValueError('unsafe path')
        key=name.rstrip('/').casefold()
        if key in seen: raise ValueError('case or duplicate path collision')
        seen.add(key)
        if stat.S_ISLNK(i.external_attr>>16):raise ValueError('symbolic link')
        if i.file_size<0 or i.file_size>128*1024*1024:raise ValueError('member bound')
        size+=i.file_size
        if size>512*1024*1024 or len(seen)>10000:raise ValueError('expansion bound')
    return size

def fixture(names,symlink=False,size=None):
    entries=[]
    for n in names:
        i=zipfile.ZipInfo(n);i.file_size=1;entries.append(i)
    if symlink:entries[0].external_attr=(stat.S_IFLNK|0o777)<<16
    if size:entries[0].file_size=size
    try:check(entries);return False
    except ValueError:return True

def main(paths):
    if len(paths)!=3:raise SystemExit(__doc__)
    report={'kind':'READ_ONLY_ARCHIVE_AUDIT','status':'PASS','created_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'input_archives':[],'rejection_fixtures':[],'scope':'Archive structure/digest verification, not execution or approval of nested documents.'}
    binding=json.loads((ROOT/'evidence/INPUT_BINDING.json').read_text())
    for arg,expected in zip(paths,binding['inputs']):
        p=Path(arg);before=hashlib.sha256(p.read_bytes()).hexdigest()
        if before!=expected['sha256']:raise ValueError('Input hash rebind required: '+p.name)
        with zipfile.ZipFile(p) as z:
            size=check(z.infolist());bad=z.testzip()
            if bad:raise ValueError('CRC failure: '+bad)
            nested=[{'member':i.filename,'bytes':i.file_size,'sha256':hashlib.sha256(z.read(i)).hexdigest(),'execution':'EXCLUDED'} for i in z.infolist() if i.filename.lower().endswith('.zip')]
            item={'file':p.name,'sha256_before':before,'sha256_after':hashlib.sha256(p.read_bytes()).hexdigest(),'members':len(z.infolist()),'expanded_bytes':size,'nested':nested,'status':'PASS'}
            assert item['sha256_after']==before;report['input_archives'].append(item)
    for name,kwargs in [('traversal',{'names':['../outside']}),('absolute',{'names':['/outside']}),('drive',{'names':['C:/outside']}),('backslash',{'names':['a\\b']}),('case collision',{'names':['A.txt','a.txt']}),('symlink',{'names':['link'],'symlink':True}),('expansion',{'names':['large'],'size':129*1024*1024})]:
        passed=fixture(**kwargs);report['rejection_fixtures'].append({'case':name,'expected':'REJECT','observed':'REJECT' if passed else 'ACCEPT','status':'PASS' if passed else 'FAIL'});assert passed
    out=ROOT/'evidence/delivery/INTAKE_AUDIT.json';out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(report,indent=2));print(json.dumps({'status':'PASS','archives':len(paths),'rejection_fixtures':7,'evidence':str(out)},indent=2))
if __name__=='__main__':main(sys.argv[1:])
