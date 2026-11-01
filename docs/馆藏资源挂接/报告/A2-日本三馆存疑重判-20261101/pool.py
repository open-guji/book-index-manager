import csv,json,glob,collections,sys,re
csv.field_size_limit(10**9)
R='/home/user/book-index-manager/docs/馆藏资源挂接/报告/'
D='/mnt/project-files/a2-日本三馆/'
for src,old_dirs in (('naikaku',['A2-内閣NDL存疑升档-20261026']),('ndl',['A2-内閣NDL存疑升档-20261026']),('kokusho',['A2-国書存疑升档-20261026'])):
    new=[r for r in csv.DictReader(open(f'/tmp/w/{src}/matches.tsv'),delimiter='\t') if r['tier']=='存疑']
    old={r['source_record_id']:r for r in csv.DictReader(open(D+f'{src}_matches_main-f33bde05.tsv'),delimiter='\t')}
    judged=set()
    for d in old_dirs:
        for f in glob.glob(R+d+('/段*_结果.tsv' if src=='kokusho' else f'/{src}_段*_结果.tsv')):
            for row in csv.reader(open(f),delimiter='\t'):
                if len(row)>2: judged.add(row[1])
    c=collections.Counter()
    pool=[]
    for r in new:
        if r['has_image']!='1': c['无影像']+=1;continue
        if not r['lib_author'].strip(): c['无责任者']+=1;continue
        if r['already_linked']=='1' or r['excluded']: c['已挂排除']+=1;continue
        o=old.get(r['source_record_id'])
        same = o and o['tier']=='存疑' and o['candidates']==r['candidates'] and o['reason_codes']==r['reason_codes']
        wasj = r['source_record_id'] in judged
        if same and wasj: c['旧判且未变']+=1;continue
        c['入池'+('(旧判已变)' if wasj else '(旧未判)')]+=1
        pool.append(r)
    print(src,len(new),dict(c))
    json.dump([r['source_record_id'] for r in pool],open(f'pool_{src}.json','w'))
