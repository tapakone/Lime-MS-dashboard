#!/usr/bin/env python3
from __future__ import annotations
import json
from datetime import datetime, timezone
from pathlib import Path
import pandas as pd
import yfinance as yf

ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)

def to_rows(df: pd.DataFrame):
    out=[]
    if df is None or df.empty: return out
    idx=pd.to_datetime(df.index, errors="coerce")
    closes=df["Close"] if "Close" in df.columns else df.iloc[:,0]
    for t,c in zip(idx, closes):
        if pd.isna(t) or pd.isna(c): continue
        if t.hour==0 and t.minute==0:
            ts=t.date().isoformat()
        else:
            ts=t.to_pydatetime().replace(tzinfo=None).isoformat(timespec="minutes")
        out.append({"time":ts,"close":float(c)})
    return out

def main():
    gen=datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    ref=datetime.now().astimezone().strftime("%d %b %Y %H:%M (UTC%z)")
    ysym="GC=F"
    d1=yf.download(ysym, period="6mo", interval="1d", auto_adjust=False, progress=False)
    m15=yf.download(ysym, period="7d", interval="15m", auto_adjust=False, progress=False)
    (DATA_DIR/"xauusd_daily.json").write_text(json.dumps({"symbol":"XAUUSD","yahoo":ysym,"source":"Yahoo Finance via yfinance","generated_utc":gen,"ref_th":ref,"rows":to_rows(d1)}, ensure_ascii=False), encoding="utf-8")
    (DATA_DIR/"xauusd_15m.json").write_text(json.dumps({"symbol":"XAUUSD","yahoo":ysym,"source":"Yahoo Finance via yfinance","generated_utc":gen,"ref_th":ref,"rows":to_rows(m15)}, ensure_ascii=False), encoding="utf-8")
    print("OK")

if __name__=="__main__":
    main()
