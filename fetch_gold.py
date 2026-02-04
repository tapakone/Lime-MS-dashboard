import os
from scripts.fetch_utils import yahoo_chart, now_utc_iso, now_th_iso, write_json

SYMBOL = "XAUUSD=X"
OUT_SYM = "xauusd"

# Run 24/7 (gold trades continuously)

points = yahoo_chart(SYMBOL, interval="5m", range_="5d")
if not points:
    print("Yahoo chart failed (rate limited or empty). Keeping last cached file if exists.")
    raise SystemExit(0)

payload = {
    "symbol": "XAUUSD",
    "interval": "15m",
    "source": "Yahoo chart (primary)",
    "updated": now_utc_iso(),
    "updated_th": now_th_iso(),
    "points": [{"t": t, "c": c} for t, c in points],
}

os.makedirs("data", exist_ok=True)
path = os.path.join("data", f"{OUT_SYM}_15m.json")
write_json(path, payload)
print(f"Wrote {path} with {len(points)} points")
