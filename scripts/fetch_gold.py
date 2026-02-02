#!/usr/bin/env python3
import os, json
from datetime import datetime, timezone
import requests

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
LATEST_FILE = os.path.join(DATA_DIR, "xauusd_latest.json")

GOLDAPI_KEY = os.getenv("GOLDAPI_KEY", "")
METALPRICE_KEY = os.getenv("METALPRICE_KEY", "")
METALSDEV_KEY = os.getenv("METALSDEV_KEY", "")

def _save(payload):
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(LATEST_FILE, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

def _load_cache():
    try:
        with open(LATEST_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None

def fetch_goldapi():
    if not GOLDAPI_KEY:
        raise RuntimeError("GOLDAPI_KEY not set")
    url = "https://www.goldapi.io/api/XAU/USD"
    headers = {"x-access-token": GOLDAPI_KEY, "Content-Type": "application/json"}
    r = requests.get(url, headers=headers, timeout=10)
    r.raise_for_status()
    j = r.json()
    return float(j.get("price")), ("goldapi", j.get("timestamp"))

def fetch_metalprice():
    if not METALPRICE_KEY:
        raise RuntimeError("METALPRICE_KEY not set")
    url = f"https://api.metalpriceapi.com/v1/latest?api_key={METALPRICE_KEY}&base=XAU&currencies=USD"
    r = requests.get(url, timeout=10)
    r.raise_for_status()
    j = r.json()
    return float(j["rates"]["USD"]), ("metalpriceapi", None)

def fetch_metalsdev():
    if not METALSDEV_KEY:
        raise RuntimeError("METALSDEV_KEY not set")
    url = f"https://api.metals.dev/v1/latest?api_key={METALSDEV_KEY}&symbol=XAUUSD"
    r = requests.get(url, timeout=10)
    r.raise_for_status()
    j = r.json()
    price = j.get("price") or j.get("data", {}).get("price")
    return float(price), ("metalsdev", None)

def fetch_with_fallback():
    chain = [("goldapi", fetch_goldapi), ("metalpriceapi", fetch_metalprice), ("metalsdev", fetch_metalsdev)]
    last_err = None
    for name, fn in chain:
        try:
            price, meta = fn()
            return {"ok": True, "price": price, "source": name, "provider_ts": meta[1], "stale": False}
        except Exception as e:
            last_err = f"{name}: {e}"
    cache = _load_cache()
    if cache and cache.get("price") is not None:
        return {"ok": True, "price": float(cache["price"]), "source": "cache", "provider_ts": cache.get("provider_ts"), "stale": True, "note":"all sources failed"}
    return {"ok": False, "error": last_err or "unknown"}

def main():
    now = datetime.now(timezone.utc).isoformat()
    res = fetch_with_fallback()
    payload = {"symbol":"XAUUSD","price":res.get("price"),"source":res.get("source"),"stale":res.get("stale",False),
               "provider_ts":res.get("provider_ts"),"fetched_utc":now}
    if not res.get("ok"):
        payload["error"] = res.get("error")
    _save(payload)
    print(json.dumps(payload, indent=2))

if __name__ == "__main__":
    main()
