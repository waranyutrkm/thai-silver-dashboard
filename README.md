# เทียบราคาเนื้อเงินในไทย (Silver Dashboard)

Dashboard เปรียบเทียบราคา "เนื้อเงิน" แบบ **cross-asset** (spot / ETF / futures / ฟิสิคัลร้านค้า)
โดยแปลงทุกอย่างมาที่ **ฐานเดียว = บาทต่อกรัมเนื้อเงินบริสุทธิ์ (THB/g fine)**
แล้วเรียง "ถูกที่สุด" ได้ทั้งฝั่งซื้อและฝั่งขาย พร้อม simulator จำลองมูลค่า

## รันยังไง
```bash
npm install
npm start          # เปิด http://localhost:5178
# dev (auto-reload): npm run dev
# ทดสอบสมการ:        npm test
```

## หัวใจ: สมการแปลงเป็นฐานเดียว
ฐาน `B` = บาทต่อกรัมเนื้อเงินบริสุทธิ์ · ค่าคงที่: `OZT=31.1034768` g/oz, `น้ำหนักเงิน 1 บาท=15.244 g`, `VAT=7%`

```
spot_base = spot_usd_oz × usdthb / OZT           # เส้น benchmark

ฟิสิคัล บาท/กก. (purity f):   B = Q / (1000 × f)
ฟิสิคัล บาท/แท่ง "1 บาท":     B = Q / (15.244 × f)
ฟิสิคัล บาท/กรัม:             B = Q / f
USD/oz (spot/futures):        B = Q_usd × usdthb / OZT
ETF (ราคาหุ้น S, เงิน s_oz/หุ้น): B = S × usdthb / (s_oz × OZT)

ฟิสิคัลฝั่งซื้อเมื่อเปิด VAT:  B_ask_eff = B_ask × 1.07
premium = B_eff / spot_base − 1        spread% = (ask − bid) / bid
```
ดูโค้ด: [`src/normalize.ts`](src/normalize.ts) · [`src/simulate.ts`](src/simulate.ts)

## แหล่งข้อมูล
| อะไร | แหล่งหลัก | สำรอง | วิธีดึง |
|---|---|---|---|
| Silver spot USD/oz | goldprice.org | api.gold-api.com | Node fetch (keyless) |
| USD/THB | frankfurter.app | open.er-api.com | Node fetch (รายวัน) |
| **TFEX Silver Futures** | tfex.co.th (API) | — | **headless Chrome** (Incapsula บล็อก Node) |
| **COMEX SI + ETF (SLV/SIVR)** | Yahoo Finance | NAV proxy | **headless Chrome** (Node โดน 429) |
| **Bowins แท่ง 1 กก.** | bowinsgroup.com/th/silver-price | — | Node fetch + parse HTML |

> ⚠️ **TFEX (Incapsula) และ Yahoo (429) บล็อก Node fetch** → ใช้ `playwright-core` ขับ **Chrome ที่ติดตั้งในเครื่อง**
> (channel `chrome`, ไม่ต้องดาวน์โหลด Chromium) เปิด headless หนึ่งครั้งต่อรอบรีเฟรช · ถ้า Chrome ไม่มี/ล้มเหลว
> ETF จะ fallback เป็น NAV proxy และแถวอื่นขึ้นสถานะ "ไม่พร้อม" โดยไม่พังทั้งหน้า

## สถานะ
- ✅ **Phase 1:** เครื่องยนต์ spot + FX + ฐานเดียว + simulator + UI (ซื้อ/ขาย, VAT toggle, filter, sort)
- ✅ **Phase 2 (แกนหลัก):** ราคาจริง **TFEX futures + COMEX + ETF (SLV/SIVR) + Bowins ฟิสิคัล** — ตารางเทียบ cross-asset ครบ
- ⏳ **ถัดไป (เสริมร้าน):** SNP/sangnapa, KPT, Ausiris, MTS, YLG, Thongsuay + เม็ดเงิน/granule + เงิน 92.5%
  - ความท้าทาย: WebSocket/JS feed, Cloudflare (SNP), 403 (MTS) → ใช้กลไก headless เดิมขยายต่อ

## ต้องมี
- **Google Chrome** ติดตั้งในเครื่อง (สำหรับดึง TFEX/Yahoo ผ่าน `playwright-core`)

## Deploy อัตโนมัติ (GitHub Pages + Actions)
หน้าเว็บเป็น **static** อ่านจาก `public/data/latest.json` → โฮสต์บน GitHub Pages ได้ฟรี ไม่ต้องมี server
- **GitHub Actions** (`.github/workflows/deploy.yml`): cron ทุก 30 นาที → `npm run snapshot` (ลองดึงผ่าน headless Chromium) → deploy Pages
  - `push` = deploy ไฟล์ที่ commit มา (ไม่ดึงใหม่) จึงไม่ทับข้อมูลที่ Mac ส่งมา
  - ⚠️ TFEX/Yahoo อาจโดนบล็อก IP ดาต้าเซ็นเตอร์ของ GitHub → แถวนั้น fallback (ETF→NAV, TFEX→ไม่พร้อม)
- **Mac cron** (`scripts/update-and-push.sh`): ดึงเต็ม (residential IP ได้ TFEX ชัวร์) แล้ว push → Pages redeploy
  ```bash
  crontab -e
  # เพิ่มบรรทัด (ทุก 20 นาที):
  */20 * * * * /Users/nok/Claude/silver-dashboard/scripts/update-and-push.sh >> /tmp/silver-dashboard.log 2>&1
  ```
สร้าง snapshot เอง: `npm run snapshot` (เต็ม) · `npm run snapshot -- --no-browser` (เฉพาะ spot/FX/Bowins/ETF-NAV)

## ข้อควรระวัง (gotchas)
- **VAT 7%** — เงินฟิสิคัลไทยโดน VAT (ทองแท่งไม่โดน) → มี toggle; ถ้าไม่คิดจะเทียบกับ ETF/futures ผิด
- **น้ำหนักเงิน "1 บาท" = 15.244 g** (บางร้านเขียน 15.20) — ตั้งค่าใน [`src/config.ts`](src/config.ts)
- **ETF oz/share ลดลง ~0.5%/ปี** ตามค่าธรรมเนียม → verify/อัปเดตจาก factsheet เป็นรอบ
- **FX อัปเดตรายวัน** — พอสำหรับ dashboard เนื้อเงิน (เงินผันผวนมากกว่า FX มาก)

## โครงสร้าง
```
src/config.ts        ค่าคงที่ + registry ของ instrument
src/normalize.ts     เครื่องยนต์สมการ → B, premium, spread  (หัวใจ)
src/simulate.ts      simulator budget/weight, buy/sell
src/sources/         metals.ts (spot), fx.ts (FX), browser.ts (TFEX+Yahoo ผ่าน Chrome), bowins.ts (ฟิสิคัล)
src/refresh.ts       รวมแหล่งข้อมูล → snapshot + cache + เขียน data/latest.json
src/server.ts        Express: /api/prices, /api/simulate, /api/refresh + cron
public/index.html    dashboard UI
```
