#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
fetch_xauusd.py
- Fetch gold proxy for "XAUUSD" from Yahoo via yfinance
- Save to data/xauusd_daily.json and data/xauusd_15m.json (always create files)
- If Yahoo has no data, keep rows empty but still output JSON so frontend won't break.
"""
import json
import os
from datetime import datetime, timezone, timedelta

import pandas as pd
import yfinance as yf

OUT_DIR = "data"
KEY = "xauusd"

# Preferred Yahoo tickers for gold:
# - GC=F (COMEX Gold Futures) is usually reliable
# - XAUUSD=X sometimes fails or is delisted on Yahoo endpoints
CANDIDATES = ["GC=F", "XAUUSD=X"]

TH_TZ = timezone(timedelta(hours=7))

def _now_th_iso():
    return datetime.now(TH_TZ).strftime("%Y-%m-%d %H:%M (UTC+7)")

def ensure_outdir():
    os.makedirs(OUT_DIR, exist_ok=True)

def to_rows(df: pd.DataFrame):
    if df is None or df.empty:
        return []
    # normalize columns
    if "Close" not in df.columns:
        return []
    out=[]
    for ts, row in df.iterrows():
        try:
            t = pd.to_datetime(ts).to_pydatetime()
            if t.tzinfo is None:
                t = t.replace(tzinfo=timezone.utc)
            t = t.astimezone(timezone.utc)
            out.append({
                "time": t.isoformat().replace("+00:00","Z"),
                "close": float(row["Close"])
            })
        except Exception:
            continue
    return out

def fetch_any(ticker: str, period: str, interval: str):
    try:
        df = yf.download(ticker, period=period, interval=interval, progress=False, auto_adjust=True)
        if isinstance(df, pd.DataFrame) and not df.empty:
            return df
    except Exception:
        pass
    return pd.DataFrame()

def pick_and_fetch(period: str, interval: str):
    last_err=None
    for t in CANDIDATES:
        df = fetch_any(t, period=period, interval=interval)
        if not df.empty:
            return t, df
        last_err = f"no data for {t}"
    return None, pd.DataFrame()

def write_json(path: str, meta: dict, rows: list):
    payload={"meta": meta, "rows": rows}
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

def main():
    ensure_outdir()

    # daily (approx 6 months) + 15m (7 days) like the dashboard expects
    used_d, df_d = pick_and_fetch(period="6mo", interval="1d")
    used_15, df_15 = pick_and_fetch(period="7d", interval="15m")

    rows_d = to_rows(df_d)
    rows_15 = to_rows(df_15)

    meta_common = {
        "key": KEY,
        "label": "XAUUSD",
        "generated_th": _now_th_iso(),
        "source": "Yahoo Finance via yfinance",
    }

    write_json(os.path.join(OUT_DIR, f"{KEY}_daily.json"), {**meta_common, "used_ticker": used_d}, rows_d)
    write_json(os.path.join(OUT_DIR, f"{KEY}_15m.json"), {**meta_common, "used_ticker": used_15}, rows_15)

    print(f"Wrote {KEY}_daily.json rows={len(rows_d)} (used={used_d})")
    print(f"Wrote {KEY}_15m.json rows={len(rows_15)} (used={used_15})")

if __name__ == "__main__":
    main()
