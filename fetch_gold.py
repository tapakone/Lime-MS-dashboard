import json, os
from datetime import datetime, timezone
import pandas as pd
import numpy as np
import pytz
import yfinance as yf
from yfinance.exceptions import YFRateLimitError
from scripts.fetch_utils import polite_sleep

OUT_DIR = "data"
SYMBOL = "xauusd"
YAHOO_TICKER = "XAUUSD=X"
TZ_TH = pytz.timezone("Asia/Bangkok")

def to_points(df: pd.DataFrame):
    df = df.dropna(subset=["Close"]).copy()
    # timestamp in ms
    ts = (df.index.astype("int64") // 1_000_000).astype("int64")
    return [{"ts": int(t), "close": float(c)} for t, c in zip(ts, df["Close"].astype(float).tolist())]

def daily_from_intraday_4am_th(df_5m: pd.DataFrame) -> pd.DataFrame:
    # Build "daily close" where day boundary is 04:00 TH
    if df_5m.empty:
        return df_5m
    idx = df_5m.index.tz_convert(TZ_TH)
    shifted = idx - pd.Timedelta(hours=4)
    day = shifted.date
    tmp = df_5m.copy()
    tmp["__day__"] = day
    # take last close in each day bucket
    g = tmp.groupby("__day__", sort=True)["Close"].last()
    out = pd.DataFrame({"Close": g.values}, index=pd.to_datetime(g.index).tz_localize(TZ_TH) + pd.Timedelta(hours=4))
    out.index = out.index.tz_convert("UTC")
    return out

def resample_close(df: pd.DataFrame, rule: str) -> pd.DataFrame:
    if df.empty:
        return df
    # close = last in bucket
    return df["Close"].resample(rule).last().dropna().to_frame()

def write_payload(path: str, meta: dict, points: list):
    payload = {"meta": meta, "points": points}
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False)

def main():
    os.makedirs(OUT_DIR, exist_ok=True)

    updated_utc = datetime.now(timezone.utc).isoformat()
    source = "Yahoo Finance (yfinance)"
    try:
        polite_sleep(1, 2)
        # 5m for last ~5 days
        df5 = yf.download(YAHOO_TICKER, period="5d", interval="5m", progress=False, auto_adjust=False, threads=False)
        if df5 is None or df5.empty:
            raise ValueError("Empty 5m data")
        if df5.index.tz is None:
            df5.index = df5.index.tz_localize("UTC")
        df5 = df5.tz_convert("UTC")

        # derive 1h / 2h
        df1h = resample_close(df5, "1H")
        df2h = resample_close(df5, "2H")

        # daily close with 04:00 TH boundary (use df5)
        dfd = daily_from_intraday_4am_th(df5)

        # meta helpers
        latest = float(df5["Close"].dropna().iloc[-1])
        # naive slope on daily last 20 points
        if len(dfd) >= 2:
            y = dfd["Close"].tail(20).values.astype(float)
            x = np.arange(len(y))
            slope = np.polyfit(x, y, 1)[0]
            slope_txt = f"{slope:+.2f}/day"
        else:
            slope_txt = "—"

        meta = {
            "asset": "XAUUSD",
            "source": source,
            "updated_utc": updated_utc,
            "day0_ref_th": "04:00 TH",
            "latest_close": f"{latest:.2f}",
            "forecast_1d": "—",
            "slope": slope_txt,
        }

        write_payload(os.path.join(OUT_DIR, f"{SYMBOL}_daily.json"), meta, to_points(dfd))
        write_payload(os.path.join(OUT_DIR, f"{SYMBOL}_1h.json"), meta, to_points(df1h))
        write_payload(os.path.join(OUT_DIR, f"{SYMBOL}_2h.json"), meta, to_points(df2h))
        # optional raw 5m
        write_payload(os.path.join(OUT_DIR, f"{SYMBOL}_5m.json"), meta, to_points(df5))

        print("OK: wrote", "daily/1h/2h/5m")
        return 0

    except YFRateLimitError as e:
        # don't fail the workflow; keep last data
        print("Rate limited by Yahoo/yfinance. Keeping existing data.", str(e))
        return 0
    except Exception as e:
        print("Gold fetch failed:", str(e))
        # don't fail if we already have files
        have_any = any(os.path.exists(os.path.join(OUT_DIR, f"{SYMBOL}_{s}.json")) for s in ["daily","1h","2h"])
        return 0 if have_any else 1

if __name__ == "__main__":
    raise SystemExit(main())
