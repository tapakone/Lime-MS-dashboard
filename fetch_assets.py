import os, json
from scripts.fetch_utils import yahoo_chart, now_utc_iso, now_th_iso, in_th_window, write_json

# US market-ish window in TH: 21:30 -> 04:00 (skip outside)
if not in_th_window(21, 30, 4, 0):
    print("Outside TH window, skip.")
    raise SystemExit(0)

assets = json.load(open("assets.json", "r", encoding="utf-8"))
symbols = [k for k, v in assets.items() if v.get("kind") != "gold"]

os.makedirs("data", exist_ok=True)

failed = []
written = 0

for sym in symbols:
    yahoo_sym = assets[sym].get("yahoo", sym)
    safe = sym.lower().replace("^", "").replace("=", "").replace("/", "_").replace(".", "_")
    pts = yahoo_chart(yahoo_sym, interval="30m", range_="10d")
    if not pts:
        failed.append(sym)
        continue
    payload = {
        "symbol": sym,
        "interval": "30m",
        "source": "Yahoo chart (primary)",
        "updated": now_utc_iso(),
        "updated_th": now_th_iso(),
        "points": [{"t": t, "c": c} for t, c in pts],
    }
    path = os.path.join("data", f"{safe}_30m.json")
    write_json(path, payload)
    written += 1
    print(f"Wrote {path} ({len(pts)} pts)")

print(f"Written: {written} | Failed: {failed}")
# Do NOT fail the action if rate-limited. Keep old data.
raise SystemExit(0)
