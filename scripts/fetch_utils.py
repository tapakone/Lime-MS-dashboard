import time, json
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
import requests

TZ_TH = ZoneInfo("Asia/Bangkok")

def now_utc_iso():
    return datetime.now(timezone.utc).isoformat()

def now_th_iso():
    return datetime.now(TZ_TH).isoformat()

def th_hhmm():
    d = datetime.now(TZ_TH)
    return d.hour, d.minute

def in_th_window(start_h, start_m, end_h, end_m):
    """
    Window in TH time, possibly crossing midnight (e.g., 21:30 -> 04:00).
    """
    h, m = th_hhmm()
    cur = h*60+m
    start = start_h*60+start_m
    end = end_h*60+end_m
    if start <= end:
        return start <= cur <= end
    return (cur >= start) or (cur <= end)

def yahoo_chart(symbol: str, interval: str, range_: str, timeout=20, max_retries=4):
    """
    Yahoo Finance chart endpoint (no yfinance dependency).
    Returns list of (iso_ts, close) or None.
    """
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
    params = {"interval": interval, "range": range_}
    headers = {
        "User-Agent": "Mozilla/5.0 (LIMES-MS; GitHubActions) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
        "Accept": "application/json",
    }

    backoff = 2.0
    for attempt in range(1, max_retries+1):
        try:
            r = requests.get(url, params=params, headers=headers, timeout=timeout)
            if r.status_code in (429, 418, 503):
                time.sleep(backoff)
                backoff *= 1.8
                continue
            r.raise_for_status()
            data = r.json()
            chart = data.get("chart", {})
            if chart.get("error"):
                raise RuntimeError(str(chart["error"]))
            result = (chart.get("result") or [None])[0]
            if not result:
                return None
            ts = result.get("timestamp") or []
            quotes = (result.get("indicators", {}).get("quote") or [{}])[0]
            closes = quotes.get("close") or []
            out = []
            for t, c in zip(ts, closes):
                if c is None:
                    continue
                iso = datetime.fromtimestamp(t, tz=timezone.utc).isoformat()
                out.append((iso, float(c)))
            return out if len(out) > 0 else None
        except Exception:
            if attempt == max_retries:
                return None
            time.sleep(backoff)
            backoff *= 1.8
    return None

def write_json(path, payload):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

def read_json(path):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None
