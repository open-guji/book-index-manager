"""一次建 Work 索引，跑欧美六馆（缓存 build_from_root／Resources.scan）。"""
import sys, os, functools
sys.path.insert(0, '/home/user/book-index-manager/tools/馆藏资源挂接/match_engine')
import workindex, engine, roots
_b, _s = workindex.build_from_root, workindex.Resources.scan
workindex.build_from_root = functools.lru_cache(None)(lambda root, jp=True, with_entities=False: _b(root, jp, with_entities))
_res = {}
workindex.Resources.scan = classmethod(lambda cls, root, live_ids=None: _res.setdefault(root, _s(root)))
out = sys.argv[1]
for s in sys.argv[2:]:
    c = engine.run(s, roots.book_index(), roots.library_data(), os.path.join(out, s), roots.overview(), emit_plan=True)
    print(s, dict(c), flush=True)
