import yfinance as yf
import json
import os
import time
from datetime import datetime

SYMBOL = "XAUUSD=X"
OUTNAME = "xauusd"
DATA_DIR = "data"
os.makedirs(DATA_DIR, exist_ok=True)

try:
    df = yf.download(
        SYMBOL,
        period="2y",
        interval="1d",
        progress=False,
        threads=False
    )

    if df.empty:
        print("Empty daily for XAUUSD")
        exit(1)

    rows = []
    for idx, row in df.iterrows():
        rows.append({
            "time": idx.strftime("%Y-%m-%d"),
            "close": float(row["Close"])
        })

    payload = {
        "symbol": SYMBOL,
        "rows": rows,
        "updated": datetime.utcnow().isoformat()
    }

    with open(f"{DATA_DIR}/{OUTNAME}_daily.json", "w") as f:
        json.dump(payload, f)

    print(f"[OK] XAUUSD saved ({len(rows)} rows)")

except Exception as e:
    print("Error:", e)
    exit(1)
