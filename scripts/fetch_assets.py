#!/usr/bin/env python3
import os, json
from datetime import datetime, timezone
import requests

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
OUT_FILE = os.path.join(DATA_DIR, "assets_latest.json")
TICKERS_FILE = os.path.join(os.path.dirname(__file__), "..", "tickers.json")

def load_symbols():
    with open(TICKERS_FILE, "r", encoding="utf-8") as f:
        t = json.load(f)
    return [x["symbol"] for x in t.get("us", [])]

def fetch_quotes(symbols):
    url = "https://query1.finance.yahoo.com/v7/finance/quote"
    r = requests.get(url, params={"symbols": ",".join(symbols)}, timeout=10, headers={"User-Agent":"Mozilla/5.0"})
    r.raise_for_status()
    return r.json().get("quoteResponse", {}).get("result", [])

def main():
    os.makedirs(DATA_DIR, exist_ok=True)
    symbols = load_symbols()
    quotes = fetch_quotes(symbols)
    now = datetime.now(timezone.utc).isoformat()
    payload = {"fetched_utc": now, "items": []}
    for q in quotes:
        payload["items"].append({
            "symbol": q.get("symbol"),
            "name": q.get("shortName") or q.get("longName"),
            "price": q.get("regularMarketPrice"),
            "changePercent": q.get("regularMarketChangePercent"),
            "marketTime": q.get("regularMarketTime")
        })
    with open(OUT_FILE, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    print(f"Wrote {OUT_FILE} ({len(payload['items'])} items)")

if __name__ == "__main__":
    main()
