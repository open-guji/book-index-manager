import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import plancheck       # noqa: E402
import writeplan       # noqa: E402


def rec(sid, ed='明刊', img=True, juan=None, source='nlc', holder='H'):
    return dict(source_record_id=sid, version_raw=ed, has_image=img, juan=juan, url='http://x/%s' % sid,
                image_url='https://kokusho.nijl.ac.jp/biblio/%s/manifest' % sid if img else '', extra=dict(holder=holder))


def row(r, wid='W', tier='确定', linked=0, excluded=''):
    return dict(rec=r, tier=tier, work_id=wid, codes=[], already_linked=linked, excluded=excluded)


def test_item_shape_nlc():
    it, grp, label = writeplan.make_item('nlc', rec('411999011854', '明崇禎[1628-1644]'))
    assert it['id'] == 'nlc' and it['group'] == 'nlc-411999011854' and it['group_role'] == 'origin'
    assert it['types'] == ['image'] and it['metadata'] == {'nlc_fid': '411999011854', 'edition': '明崇禎[1628-1644]'}
    assert label == '國圖藏本：明崇禎[1628-1644]'
    assert plancheck.check_item(it, {grp: {'label': label}}) == []


def test_item_shape_kokusho_ndl():
    it, grp, label = writeplan.make_item('kokusho', rec('100237697', '刊', holder='東北大和算'))
    assert it['group'] == 'kokusho-100237697' and label == '國書·東北大和算藏刊'
    assert set(it['metadata']) == {'kokusho_bid', 'holder', 'edition', 'iiif_manifest'}
    r = rec('x', '清寫')
    r['image_url'] = 'https://dl.ndl.go.jp/pid/14902910'
    it, grp, label = writeplan.make_item('ndl', r)
    assert it['group'] == 'ndl-14902910' and it['metadata'] == {'ndl_record': 'pid14902910', 'edition': '清寫'}
    assert it['url'] == 'https://dl.ndl.go.jp/pid/14902910'


def test_no_image_not_written():
    assert writeplan.make_item('nlc', rec('1', img=False)) is None


def test_cap_three_with_priority():
    rows = [row(rec('a', '刊', juan=1)), row(rec('b', '明刊', juan=2)), row(rec('c', '刊', img=False)), row(rec('d', '明刊', juan=9)),
            row(rec('e', '明刊', juan=5))]
    plan, dropped, linked = writeplan.build('nlc', rows)
    got = [p['record_id'] for p in plan]
    assert got == ['d', 'e', 'b'] and set(dropped) == {'a'} and not linked
    assert 'CAP_DROPPED' in rows[0]['codes']


def test_linked_hold_slots_and_not_replanned():
    rows = [row(rec('old1', '刊'), linked=1), row(rec('old2', '刊'), linked=1), row(rec('n1', '明刊', juan=9)), row(rec('n2', '明刊', juan=8))]
    plan, dropped, linked = writeplan.build('nlc', rows)
    assert [p['record_id'] for p in plan] == ['n1'] and dropped == ['n2'] and len(linked) == 2


def test_existing_outside_batch_take_slots():
    rows = [row(rec('n1')), row(rec('n2'))]
    plan, dropped, _ = writeplan.build('nlc', rows, {'W': {'nlc-old1', 'nlc-old2'}})
    assert len(plan) == 1 and len(dropped) == 1


def test_only_confirmed_and_not_excluded():
    rows = [row(rec('a'), tier='存疑'), row(rec('b'), excluded='R2'), row(rec('c'), wid='')]
    plan, dropped, linked = writeplan.build('nlc', rows)
    assert not plan and not dropped


def test_check_item_rejects_physical_and_missing_label():
    it, grp, label = writeplan.make_item('nlc', rec('1'))
    assert plancheck.check_item(dict(it, types=['physical']), {grp: {'label': label}})
    assert plancheck.check_item(it, {})


def test_waseda_item_k12():
    """口径 K12：url＝所选册自身页（顶层页多卷 404，2026-10-15 改）；不要求 image_url；group＝waseda-<顶层册id>；edition 去罗马字。"""
    import writeplan as W
    rec = dict(source_record_id='he13_02378_0033', group_key='he13_02378', version_raw='寿陽 : 祁寯藻, 咸豊8[1858]序 juyō : kishunsō',
               url='https://www.wul.waseda.ac.jp/kotenseki/html/he13/he13_02378_0033/index.html', image_url='', has_image=False, juan=3)
    item, grp, label = W.make_item('waseda', rec)
    assert grp == 'waseda-he13_02378' and item['id'] == 'waseda' and item['types'] == ['image'] and item['group_role'] == 'origin'
    assert item['url'] == 'https://www.wul.waseda.ac.jp/kotenseki/html/he13/he13_02378_0033/index.html'
    assert item['metadata'] == dict(waseda_id='he13_02378', edition='寿陽 : 祁寯藻, 咸豊8[1858]序')
    assert label == '早稲田藏本：寿陽 : 祁寯藻, 咸豊8[1858]序'


def test_waseda_edition_placeholder_and_collapse():
    import writeplan as W
    assert W._waseda_edition('[出版地不明] : [出版者不明], [出版年不明]') == ''
    rows = [dict(tier='确定', work_id='w1', codes=[], excluded='', already_linked=0,
                 rec=dict(source_record_id=f'a_1_000{i}', group_key='a_1', version_raw='', juan=i, has_image=False,
                          url=f'https://www.wul.waseda.ac.jp/kotenseki/html/a/a_1_000{i}/index.html', image_url='')) for i in (1, 2)]
    plan, dropped, linked = W.build('waseda', rows)
    assert len(plan) == 1 and plan[0]['resource']['group'] == 'waseda-a_1' and not dropped
    assert plan[0]['resource_group']['waseda-a_1']['label'] == '早稲田藏本'
