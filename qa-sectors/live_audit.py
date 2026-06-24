"""Audit the LIVE deployed backend: run every NAICS supersector through
/run-pipeline and capture resolution + the actual company set returned.
No save/export — just inspect."""
import json, sys, time, urllib.request, concurrent.futures as cf

BACKEND = "https://map-backend-iota.vercel.app/run-pipeline"
SECTORS = [
 "Real Estate and Rental and Leasing","State and Local Government","Finance and Insurance",
 "Health Care and Social Assistance","Professional and Technical Services","Durable Goods Manufacturing",
 "Nondurable Goods Manufacturing","Wholesale Trade","Retail Trade","Information","Construction",
 "Transportation and Warehousing","Administrative and Waste Management Services","Accommodation and Food Services",
 "Federal Government","Mining and Oil Extraction","Agriculture and Forestry","Utilities","Educational Services",
 "Management of Companies","Arts and Entertainment","Commercial Banking","Hospitals","Broadcasting and Telecommunications",
]

def parse_money(s):
    if not s: return 0.0
    s = str(s).strip().replace("$","").replace(",","")
    mult = 1.0
    for suf,m in (("B",1e9),("M",1e6),("T",1e12),("K",1e3)):
        if s.upper().endswith(suf):
            s = s[:-1]; mult = m; break
    try: return float(s)*mult
    except: return 0.0

def run(sector):
    body = json.dumps({"sector": sector}).encode()
    req = urllib.request.Request(BACKEND, data=body, headers={"Content-Type":"application/json"})
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=290) as r:
            d = json.loads(r.read())
    except Exception as e:
        return {"sector":sector,"error":f"{type(e).__name__}: {e}","secs":round(time.time()-t0)}
    data = d.get("data",{})
    meta = data.get("_meta",{})
    profiles = data.get("section4_profiles",[]) or []
    names = [p.get("company_name") for p in profiles]
    rev = sum(parse_money((p.get("facts",{}).get("revenue") or {}).get("value")) for p in profiles)
    return {"sector":sector,"resolution":meta.get("resolution"),
            "seed_companies":meta.get("seed_companies"),
            "profiled":names,"n":len(names),
            "combined_rev_B":round(rev/1e9,1),"secs":round(time.time()-t0)}

if __name__ == "__main__":
    out = {}
    with cf.ThreadPoolExecutor(max_workers=6) as ex:
        futs = {ex.submit(run,s):s for s in SECTORS}
        for f in cf.as_completed(futs):
            r = f.result(); out[r["sector"]] = r
            print(f"[{len(out):2}/24] {r['sector']:46} {r.get('resolution') or r.get('error')}  ({r.get('secs')}s)", flush=True)
    with open("qa-sectors/live_results.json","w") as fh:
        json.dump(out, fh, indent=2)
    print("WROTE qa-sectors/live_results.json")
