import json
import os
from datetime import datetime, timezone
import yfinance as yf
import pandas as pd

DATA_DIR = "data"

ASSETS = [
  {"key":"JEPQ","yahoo":"JEPQ"},
  {"key":"AGNC","yahoo":"AGNC"},
  {"key":"NVDA","yahoo":"NVDA"},
  {"key":"TSLA","yahoo":"TSLA"},
  {"key":"LMT","yahoo":"LMT"},
  {"key":"BTC-USD","yahoo":"BTC-USD"},
  {"key":"ETH-USD","yahoo":"ETH-USD"},
]

def slugify(sym: str) -> str:
    s = sym.strip().lower()
    out = []
    for ch in s:
        if ch.isalnum():
            out.append(ch)
        else:
            out.append("-")
    s = "".join(out)
    while "--" in s:
        s = s.replace("--", "-")
    return s.strip("-")

def to_rows(df: pd.DataFrame):
    rows = []
    for idx, row in df.iterrows():
        t = idx
        if hasattr(t, "to_pydatetime"):
            t = t.to_pydatetime()
        # Use ISO for intraday; date-only for daily
        rows.append({"time": t.isoformat().replace("+00:00","Z"), "close": float(row["Close"])})
    return rows

def fetch_one(asset_key: str, yahoo: str):
    os.makedirs(DATA_DIR, exist_ok=True)
    slug = slugify(asset_key)

    # Daily: 2y to ensure >= 40 and stable
    daily = yf.download(yahoo, period="2y", interval="1d", auto_adjust=False, progress=False)
    if daily is None or daily.empty:
        raise RuntimeError(f"Empty daily for {asset_key} ({yahoo})")
    daily = daily.dropna(subset=["Close"]).tail(220)
    daily_rows = [{"time": str(idx.date()), "close": float(v)} for idx, v in daily["Close"].items()]

    # 15m: last 5d (yfinance limit), enough points for monitor
    m15 = yf.download(yahoo, period="5d", interval="15m", auto_adjust=False, progress=False)
    if m15 is None or m15.empty:
        # fallback 60m
        m15 = yf.download(yahoo, period="30d", interval="60m", auto_adjust=False, progress=False)
    m15 = m15.dropna(subset=["Close"]).tail(400)
    m15_rows = to_rows(m15)

    ts = datetime.now(timezone.utc).isoformat().replace("+00:00","Z")

    with open(os.path.join(DATA_DIR, f"{slug}_daily.json"), "w", encoding="utf-8") as f:
        json.dump({"rows": daily_rows, "updated": ts}, f, ensure_ascii=False)

    with open(os.path.join(DATA_DIR, f"{slug}_15m.json"), "w", encoding="utf-8") as f:
        json.dump({"rows": m15_rows, "updated": ts}, f, ensure_ascii=False)

def main():
    ok = 0
    for a in ASSETS:
        try:
            fetch_one(a["key"], a["yahoo"])
            ok += 1
            print(f"[OK] {a['key']}")
        except Exception as e:
            print(f"[FAIL] {a['key']}: {e}")
    if ok == 0:
        raise SystemExit("All fetches failed")

if __name__ == "__main__":
    main()
