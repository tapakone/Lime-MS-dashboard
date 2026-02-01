import yfinance as yf
import json
import time
import os
from datetime import datetime

ASSETS = [
    ("JEPQ", "jepq"),
    ("AGNC", "agnc"),
    ("NVDA", "nvda"),
    ("TSLA", "tsla"),
    ("VOO", "voo"),
    ("QQQl", "qqql"), 
    ("LMT", "lmt"),
    ("BTC-USD", "btc-usd"),
    ("ETH-USD", "eth-usd"),
]

DATA_DIR = "data"
os.makedirs(DATA_DIR, exist_ok=True)

def fetch_daily(symbol, outname):
    try:
        print(f"Fetching {symbol} ...")
        df = yf.download(
            symbol,
            period="2y",
            interval="1d",
            progress=False,
            threads=False
        )

        if df.empty:
            print(f"[WARN] Empty daily for {symbol}")
            return False

        rows = []
        for idx, row in df.iterrows():
            rows.append({
                "time": idx.strftime("%Y-%m-%d"),
                "close": float(row["Close"])
            })

        payload = {
            "symbol": symbol,
            "rows": rows,
            "updated": datetime.utcnow().isoformat()
        }

        with open(f"{DATA_DIR}/{outname}_daily.json", "w") as f:
            json.dump(payload, f)

        print(f"[OK] {symbol} saved ({len(rows)} rows)")
        return True

    except Exception as e:
        print(f"[ERROR] {symbol}: {e}")
        return False


any_success = False

for sym, out in ASSETS:
    ok = fetch_daily(sym, out)
    any_success = any_success or ok
    time.sleep(20)  # <<< สำคัญมาก กัน rate limit

if not any_success:
    print("All fetches failed")
    exit(1)
