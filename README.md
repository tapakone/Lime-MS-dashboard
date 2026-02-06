# LIMES MS — Free GitHub Pages Dashboard (Gold 15m + Assets 30m)

## What you get
- **Gold (XAUUSD)** refresh JSON every **15 minutes** (only during **21:30–04:00 TH**).
- **Stocks/ETFs/Crypto** refresh JSON every **30 minutes** (only during **21:30–04:00 TH**).
- Frontend (index.html + script.js) reads `data/*.json` and draws the chart + STATE panel + floating summary card.

## Folder map (สำคัญ)
- `index.html` / `style.css` / `script.js` : หน้าเว็บ (GitHub Pages)
- `assets.json` : รายการสินทรัพย์ + ชื่อ + โลโก้ + Yahoo symbol
- `data/` : ไฟล์ JSON ที่ workflow เขียนให้ (มี `.gitkeep` กันโฟลเดอร์หาย)
- `.github/workflows/fetch_gold.yml` : รันทุก 15 นาที (ทอง)
- `.github/workflows/fetch_assets.yml` : รันทุก 30 นาที (หุ้น/ETF/crypto)
- `fetch_gold.py`, `fetch_assets.py`, `scripts/fetch_utils.py` : โค้ดดึงข้อมูล

## Setup (อัปขึ้น GitHub ทีเดียว)
1. ลบไฟล์เดิมใน repo หรือ replace ทั้งหมดด้วยไฟล์จาก zip นี้
2. เปิด **Settings → Pages** เลือก Deploy from branch (เช่น `main` / `/root`)
3. เปิด **Actions** ให้รันได้ (คุณติ๊ก permission แล้ว)
4. รอ workflow รันครั้งแรก หรือกด **Run workflow** แบบ manual
5. เปิดเว็บ GitHub Pages แล้วกด Reload

## Secrets ต้องใส่ไหม?
ไม่ต้องใส่ secret เพิ่ม ถ้า repo ใช้ `GITHUB_TOKEN` ปกติ
เพราะ workflow ตั้ง `permissions: contents: write` และใช้ `actions/checkout` แบบ `persist-credentials: true`

> ถ้า repo ถูกตั้ง policy แปลก ๆ จน push ไม่ได้ ค่อยทำ secret ชื่อ `GH_PAT`
> (Personal Access Token ที่มีสิทธิ repo) แล้วแก้ workflow ให้ใช้ token นั้น

## Notes
- ถ้า Yahoo rate limit: workflow **ไม่ fail** และจะ “คงไฟล์เดิมไว้” (เว็บยังใช้ข้อมูลล่าสุดที่มี)
- Risk score เป็น indicator เพื่อการติดตาม ไม่ใช่คำแนะนำการลงทุน
