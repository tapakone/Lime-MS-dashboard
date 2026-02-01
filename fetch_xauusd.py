import json
import os
from datetime import datetime, timezone
import yfinance as yf
import pandas as pd

DATA_DIR = "data"
KEY = "XAUUSD"
YAHOO = "XAUUSD=X"  # Yahoo Finance symbol for spot gold

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
        rows.append({"time": t.isoformat().replace("+00:00","Z"), "close": float(row["Close"])})
    return rows

def main():
    os.makedirs(DATA_DIR, exist_ok=True)
    slug = slugify(KEY)

    daily = yf.download(YAHOO, period="2y", interval="1d", auto_adjust=False, progress=False)
    if daily is None or daily.empty:
        raise SystemExit("Empty daily for XAUUSD")
    daily = daily.dropna(subset=["Close"]).tail(260)
    daily_rows = [{"time": str(idx.date()), "close": float(v)} for idx, v in daily["Close"].items()]

    m15 = yf.download(YAHOO, period="5d", interval="15m", auto_adjust=False, progress=False)
    if m15 is None or m15.empty:
        m15 = yf.download(YAHOO, period="30d", interval="60m", auto_adjust=False, progress=False)
    m15 = m15.dropna(subset=["Close"]).tail(450)
    m15_rows = to_rows(m15)

    ts = datetime.now(timezone.utc).isoformat().replace("+00:00","Z")
    with open(os.path.join(DATA_DIR, f"{slug}_daily.json"), "w", encoding="utf-8") as f:
        json.dump({"rows": daily_rows, "updated": ts}, f, ensure_ascii=False)
    with open(os.path.join(DATA_DIR, f"{slug}_15m.json"), "w", encoding="utf-8") as f:
        json.dump({"rows": m15_rows, "updated": ts}, f, ensure_ascii=False)

    print("[OK] XAUUSD")

if __name__ == "__main__":
    main()
