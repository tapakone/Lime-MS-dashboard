import json, os
from datetime import datetime, timezone
import pandas as pd
import numpy as np
import pytz
import yfinance as yf
from yfinance.exceptions import YFRateLimitError
from scripts.fetch_utils import polite_sleep

OUT_DIR="data"
TZ_TH=pytz.timezone("Asia/Bangkok")

ASSETS = {
  "NVDA":"NVDA",
  "JEPQ":"JEPQ",
  "AGNC":"AGNC",
  "JNJ":"JNJ",
  "QQQI":"QQQI",
  "VOO":"VOO",
}

def to_points(df: pd.DataFrame):
    df = df.dropna(subset=["Close"]).copy()
    ts = (df.index.astype("int64") // 1_000_000).astype("int64")
    return [{"ts": int(t), "close": float(c)} for t,c in zip(ts, df["Close"].astype(float).tolist())]

def resample_close(df: pd.DataFrame, rule: str) -> pd.DataFrame:
    if df.empty:
        return df
    return df["Close"].resample(rule).last().dropna().to_frame()

def write_payload(path: str, meta: dict, points: list):
    payload={"meta": meta, "points": points}
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path,"w",encoding="utf-8") as f:
        json.dump(payload,f,ensure_ascii=False)

def in_stock_window_th() -> bool:
    # Run only between 21:30 and 04:00 TH
    now = datetime.now(TZ_TH).time()
    start = datetime.strptime("21:30","%H:%M").time()
    end   = datetime.strptime("04:00","%H:%M").time()
    return (now >= start) or (now <= end)

def main():
    os.makedirs(OUT_DIR, exist_ok=True)

    if not in_stock_window_th():
        print("Outside stock window (21:30-04:00 TH). Exit clean.")
        return 0

    updated_utc = datetime.now(timezone.utc).isoformat()
    for sym, ticker in ASSETS.items():
        try:
            polite_sleep(1, 3)
            # 15m last 5d
            df = yf.download(ticker, period="5d", interval="15m", progress=False, auto_adjust=False, threads=False)
            if df is None or df.empty:
                raise ValueError("Empty 15m data")
            if df.index.tz is None:
                df.index = df.index.tz_localize("UTC")
            df = df.tz_convert("UTC")
            df1h = resample_close(df, "1H")
            df2h = resample_close(df, "2H")

            polite_sleep(1, 2)
            dfd = yf.download(ticker, period="1y", interval="1d", progress=False, auto_adjust=False, threads=False)
            if dfd is None or dfd.empty:
                # fallback: build daily from 15m
                dfd = resample_close(df, "1D")
            if dfd.index.tz is None:
                dfd.index = dfd.index.tz_localize("UTC")
            dfd = dfd.tz_convert("UTC")

            latest = float(df["Close"].dropna().iloc[-1])
            if len(dfd) >= 2:
                y = dfd["Close"].tail(20).values.astype(float)
                x = np.arange(len(y))
                slope = np.polyfit(x, y, 1)[0]
                slope_txt = f"{slope:+.2f}/day"
            else:
                slope_txt = "—"

            meta = {
              "asset": sym,
              "source":"Yahoo Finance (yfinance)",
              "updated_utc": updated_utc,
              "day0_ref_th":"(market close)",
              "latest_close": f"{latest:.2f}",
              "forecast_1d":"—",
              "slope": slope_txt,
            }

            base = sym.lower()
            write_payload(os.path.join(OUT_DIR,f"{base}_daily.json"), meta, to_points(dfd))
            write_payload(os.path.join(OUT_DIR,f"{base}_1h.json"), meta, to_points(df1h))
            write_payload(os.path.join(OUT_DIR,f"{base}_2h.json"), meta, to_points(df2h))
            # optional
            write_payload(os.path.join(OUT_DIR,f"{base}_15m.json"), meta, to_points(df))
            print("OK:", sym)
        except YFRateLimitError as e:
            print("Rate limited for", sym, "keep old data.", str(e))
            continue
        except Exception as e:
            print("FAIL:", sym, str(e))
            continue

    return 0

if __name__=="__main__":
    raise SystemExit(main())
