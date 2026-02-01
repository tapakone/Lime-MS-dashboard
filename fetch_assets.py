#!/usr/bin/env python3
from __future__ import annotations
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any, List
import pandas as pd
import yfinance as yf

ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
TICKERS_PATH = ROOT / "tickers.json"

def slugify(sym: str) -> str:
    import re
    s = sym.strip().lower()
    s = re.sub(r"\s+", "-", s)
    s = re.sub(r"[^a-z0-9\-_=\.]", "", s)
    return s

def to_rows(df: pd.DataFrame) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    if df is None or df.empty:
        return out
    idx = pd.to_datetime(df.index, errors="coerce")
    closes = df["Close"] if "Close" in df.columns else df.iloc[:, 0]
    for t, c in zip(idx, closes):
        if pd.isna(t) or pd.isna(c):
            continue
        if t.hour == 0 and t.minute == 0:
            ts = t.date().isoformat()
        else:
            ts = t.to_pydatetime().replace(tzinfo=None).isoformat(timespec="minutes")
        out.append({"time": ts, "close": float(c)})
    return out

def fetch(symbol: str, yahoo: str):
    daily = yf.download(yahoo, period="6mo", interval="1d", auto_adjust=False, progress=False)
    m15 = yf.download(yahoo, period="7d", interval="15m", auto_adjust=False, progress=False)
    return daily, m15

def main() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    tickers = json.loads(TICKERS_PATH.read_text(encoding="utf-8"))
    mapping: Dict[str, str] = tickers["tickers"]

    gen = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    ref = datetime.now().astimezone().strftime("%d %b %Y %H:%M (UTC%z)")

    failures = []
    for sym, ysym in mapping.items():
        try:
            d1, m15 = fetch(sym, ysym)
            slug = slugify(sym)

            (DATA_DIR / f"{slug}_daily.json").write_text(
                json.dumps(
                    {"symbol": sym, "yahoo": ysym, "source": "Yahoo Finance via yfinance", "generated_utc": gen, "ref_th": ref, "rows": to_rows(d1)},
                    ensure_ascii=False,
                ),
                encoding="utf-8",
            )
            (DATA_DIR / f"{slug}_15m.json").write_text(
                json.dumps(
                    {"symbol": sym, "yahoo": ysym, "source": "Yahoo Finance via yfinance", "generated_utc": gen, "ref_th": ref, "rows": to_rows(m15)},
                    ensure_ascii=False,
                ),
                encoding="utf-8",
            )
        except Exception as e:
            failures.append({"symbol": sym, "yahoo": ysym, "error": str(e)})

    if failures:
        (ROOT / "fetch_failures.json").write_text(json.dumps({"generated_utc": gen, "failures": failures}, ensure_ascii=False, indent=2), encoding="utf-8")
        print("Some failed:", failures)
    else:
        print("OK")

if __name__ == "__main__":
    main()
