# LIMES MS Dashboard (GitHub Pages)

## What must exist
- `.github/workflows/*.yml` (GitHub Actions)
- `data/` folder **with** `data/.gitkeep` so the folder exists before first run
- After Actions run, JSON files will be created:
  - `data/xauusd_daily.json`, `data/xauusd_1h.json`, `data/xauusd_2h.json`
  - similar for NVDA/JEPQ/AGNC/JNJ/QQQI/VOO

## First run
Go to **Actions** tab:
- `fetch-gold` → Run workflow
- `fetch-stocks` → Run workflow

Then refresh GitHub Pages URL.
