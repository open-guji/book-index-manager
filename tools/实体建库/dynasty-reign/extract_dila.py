#!/usr/bin/env python3
"""DILA 朝代紀年資料庫 → 源表 TSV。用法：python3 -I extract_dila.py out.tsv "<取数时刻>" [dyn.html缓存]
列：来源｜源内键｜年号｜朝代(源写法)｜帝王(源写法)｜起｜止｜备注。年份取 DILA 页面写的公历年（公元前为负，无 0 年）。
先 GET 首页取 cookie，再带 Referer 抓 dynasty.php → 朝代 → 帝王 → 年号；限速 ≈1 次/秒。"""
import re, sys, time, urllib.parse, urllib.request, http.cookiejar, html
B = "https://authority.dila.edu.tw/time/"
cj = http.cookiejar.CookieJar()
op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
op.addheaders = [("User-Agent", "Mozilla/5.0"), ("Referer", B)]
def get(u):
    time.sleep(1.0)
    for i in range(3):
        try:
            return op.open(u, timeout=40).read().decode("utf8", "replace")
        except Exception:
            time.sleep(3)
    return ""
def yr(s):
    m = re.search(r"(B\.C\.E|C\.E\.)\s*([+-]?\d+)-(\d\d)-(\d\d)", s)
    if not m: return ""
    n = abs(int(m.group(2)))
    return str(-n if m.group(1) == "B.C.E" else n)
def rows(page):
    out = []
    for tr in re.findall(r"<tr>(.*?)</tr>", page, flags=re.S):
        tds = [html.unescape(re.sub(r"<[^>]+>", "", t)).strip() for t in re.findall(r"<td>(.*?)</td>", tr, flags=re.S)]
        if tds and tds[-1].startswith("["): out.append(tds)
    return out
def main():
    out, stamp = sys.argv[1], sys.argv[2]
    get(B)
    dyn = get(B + "dynasty.php")
    dpks = list(dict.fromkeys(urllib.parse.unquote(x) for x in re.findall(r"dpk=([^'\"&>]+)", dyn)))
    with open(out, "w", encoding="utf8") as f:
        f.write("# DILA 朝代紀年 %s 取数\n" % stamp)
        n = 0
        for d in dpks:
            f.flush(); print(d, n, flush=True)
            q = urllib.parse.quote(d)
            for r in rows(get(B + "search.php?chk=nextLevel&julianSwitch=&dpk=" + q)):
                # r: 箭头, 朝代, 帝王, 年数, 区间
                e = r[2]
                for r2 in rows(get(B + "search.php?chk=nextLevel&julianSwitch=&dpk=%s&epk=%s" % (q, urllib.parse.quote(e)))):
                    if len(r2) < 6: continue  # 箭头, 朝代, 帝王, 年号, 年数, 区间
                    n += 1
                    f.write("\t".join(["dila-time", "r%d" % n, r2[3], r2[1], r2[2], yr(r2[5].split("~")[0]), yr(r2[5].split("~")[1]), r2[5]]) + "\n")
        print("rows", n, "dynasties", len(dpks))
main()
