# HANDOFF — เทียบราคาเนื้อเงินในไทย (Silver Dashboard)

บรีฟส่งต่อให้ผู้พัฒนา/ดีไซเนอร์คนถัดไป เพื่อ **ออกแบบใหม่ + พัฒนาต่อ**
อ่านจบไฟล์นี้ควรเข้าใจ: มันคืออะไร, ข้อมูลมาจากไหน, โครงโค้ด, และงานที่ต้องทำต่อ

- **Repo:** https://github.com/waranyutrkm/thai-silver-dashboard
- **Live (auto-update):** https://waranyutrkm.github.io/thai-silver-dashboard/
- **Stack:** Node 22 + TypeScript (tsx) · Express (dev) · playwright-core (headless Chrome) · Vanilla HTML/JS frontend · GitHub Actions + Pages

---

## 1) จุดประสงค์ของโปรเจกต์
รวมราคา "เนื้อเงิน (silver)" ที่ซื้อขายได้ในไทย **ทุกช่องทาง** มาเทียบในหน้าเดียว โดย:
1. แปลงทุกอย่างเป็น **ฐานเดียว = บาท/กรัมเนื้อเงินบริสุทธิ์ (THB per gram fine silver)** เพื่อเทียบข้ามชนิดสินทรัพย์ได้
2. เทียบทั้ง **ฝั่งซื้อ (ถูกสุด)** และ **ฝั่งขาย (ได้เงินมากสุด)**
3. คิด **ต้นทุนจริง (all-in)** = ราคา + VAT + ค่าธรรมเนียม + ค่าถือครอง
4. **อัปเดตราคาอัตโนมัติ** (นี่คือหัวใจ — ระบบต้องดึงสเปค/ราคาจริงจากตลาดเองเรื่อย ๆ)

ชนิดสินทรัพย์ที่ครอบคลุม: spot อ้างอิง, ETF (SLV/SIVR), ฟิวเจอร์ส (TFEX/COMEX), ฟิสิคัล (แท่ง 99.99%, เม็ดเงิน), และควรขยายไป 92.5%

---

## 2) เริ่มต้น (Setup)
```bash
git clone https://github.com/waranyutrkm/thai-silver-dashboard.git
cd thai-silver-dashboard
npm install
npm run dev        # dev server + auto-reload → http://localhost:5178
```
คำสั่งอื่น:
| คำสั่ง | ทำอะไร |
|---|---|
| `npm start` | รัน server (ไม่ auto-reload) |
| `npm run snapshot` | ดึงราคาทุกแหล่ง (มี headless Chrome) → เขียน `public/data/latest.json` |
| `npm run snapshot -- --no-browser` | ดึงเฉพาะแหล่งที่ Node ยิงตรงได้ (สำหรับ CI ที่ IP โดนบล็อก) |
| `npm test` | unit test ของสมการ normalize (`src/normalize.test.ts`) |
| `npm run typecheck` | `tsc --noEmit` |

**ต้องมี:** Google Chrome ติดตั้งในเครื่อง (playwright-core ใช้ `channel:'chrome'` ดึง TFEX/Yahoo; ถ้าไม่มีจะ fallback เป็น chromium ที่ playwright ติดตั้ง)

---

## 3) แผนที่ไฟล์ (File map) — path ละเอียด
```
src/
  config.ts            # ⭐ Registry ของ instrument ทุกตัว + ค่าคงที่ + ค่าธรรมเนียม (แก้ที่นี่)
  types.ts             # ชนิดข้อมูลกลาง (Instrument, RawQuote, NormalizedRow, Snapshot ...)
  normalize.ts         # ⭐ เครื่องยนต์สมการ: ราคาดิบ → ฐานเดียว (THB/g fine) + VAT + premium + spread
  simulate.ts          # simulator: งบ/น้ำหนัก × ซื้อ/ขาย → จัดอันดับ (ฝั่ง server; frontend มีของตัวเองด้วย)
  refresh.ts           # ⭐ รวมทุกแหล่งข้อมูลพร้อมกัน → cache ในหน่วยความจำ (ไม่เขียนไฟล์)
  snapshot.ts          # เรียก refresh() แล้วเขียน public/data/latest.json (ตัวเดียวที่เขียนไฟล์)
  server.ts            # Express: /api/prices, /api/simulate, /api/refresh + เสิร์ฟ public/ + cron
  sources/
    metals.ts          # spot XAG (USD/oz): goldprice.org → gold-api.com (Node fetch)
    fx.ts              # USD/THB: frankfurter.app → open.er-api.com (Node fetch)
    browser.ts         # ⭐ headless Chrome ดึง TFEX (Incapsula) + Yahoo SLV/SIVR/SI=F (429)
    bowins.ts          # ฟิสิคัล Bowins แท่ง 1 กก. (Node fetch + parse HTML)
    thongsuay.ts       # ฟิสิคัล ทองสวย เม็ดเงิน (Node fetch API /api/silver_spots/latest)
  normalize.test.ts    # unit tests
public/
  index.html           # ⭐ Frontend ทั้งหมด (UI + client-side VAT/all-in/sort/simulate) — ไฟล์เดียว
  data/latest.json     # snapshot ที่ frontend อ่าน (CI + Mac cron เป็นคนอัปเดต)
.github/workflows/
  deploy.yml           # ⭐ CI: cron 30 นาที → snapshot → deploy Pages (push = deploy ไฟล์ที่ commit)
scripts/
  update-and-push.sh   # Mac cron: snapshot เต็ม + git push (residential IP ได้ TFEX ชัวร์)
tsconfig.json · package.json · README.md · HANDOFF.md (ไฟล์นี้)
```

---

## 4) การไหลของข้อมูล (Data flow)
```
[แหล่งข้อมูล] → refresh() ดึงพร้อมกัน (Promise.allSettled)
   → normalizeOne() แปลงแต่ละตัวเป็นฐานเดียว (THB/g fine) + คิด fee fields
   → Snapshot { market, rows[] }
   → snapshot.ts เขียน public/data/latest.json
[frontend index.html] → fetch /api/prices (dev) หรือ data/latest.json (Pages)
   → derive() คิด VAT + all-in ฝั่ง client → render ตาราง/ranking/simulator
```
**การอัปเดตราคา (auto):**
- **GitHub Actions** (`deploy.yml`) cron `*/30` → `npm run snapshot` (ลอง headless Chromium) → deploy Pages
- **Mac cron** (`scripts/update-and-push.sh`) → snapshot เต็ม + push (เสริมตอน IP คลาวด์โดนบล็อก)
- ⚠️ GitHub scheduled cron เป็น best-effort (ดีเลย์/ข้ามได้; หยุดถ้า repo เงียบ 60 วัน)

---

## 5) โมเดลราคาฐานเดียว + สมการ (อยู่ใน `normalize.ts`)
ค่าคงที่ (`config.ts`): `OZT=31.1034768` g/oz · `BAHT_SILVER_G=15.244` (น้ำหนักเงิน "1 บาท") · `VAT=0.07`
```
spot_base = spot_usd_oz × usdthb / OZT              # THB/g fine (เส้น benchmark)
thb_kg   (purity f):  B = ราคา / (1000 × f)
thb_baht (purity f):  B = ราคา / (15.244 × f)
thb_gram (purity f):  B = ราคา / f
usd_oz            :   B = ราคา × usdthb / OZT
etf_usd_share     :   B = ราคาหุ้น × usdthb / (ozPerShare × OZT)
VAT (ฟิสิคัล, toggle): B_ask_eff = B_ask × 1.07
premium = B_eff / spot_base − 1
```
`mid=true` = แหล่งให้ราคาค่าเดียว (spot/ETF/COMEX) → ไม่มี bid/ask สองฝั่ง (สเปรด null)
`mid=false` = มีราคาสองฝั่งจริง (ร้าน + TFEX)

---

## 6) แหล่งข้อมูลจริง + endpoint (สำคัญมากสำหรับ "อัปเดตราคา")
| แหล่ง | ใช้ทำ | Endpoint / วิธี | ดึงจาก Node ตรงได้ไหม |
|---|---|---|---|
| goldprice.org | spot XAG | `GET https://data-asg.goldprice.org/dbXRates/USD` (ต้องมี header `Referer: https://goldprice.org/`) → `items[0].xagPrice` | ✅ |
| gold-api.com | spot XAG (สำรอง) | `GET https://api.gold-api.com/price/XAG` → `.price` | ✅ |
| frankfurter.app | USD/THB | `GET https://api.frankfurter.app/latest?from=USD&to=THB` | ✅ |
| open.er-api.com | USD/THB (สำรอง) | `GET https://open.er-api.com/v6/latest/USD` → `.rates.THB` | ✅ |
| **TFEX** | ฟิวเจอร์สเงินไทย | โหลดหน้า `.../silver-online-futures/market-data` (ผ่าน Incapsula) แล้ว fetch `GET /api/set/tfex/marketlist/TXM_F/instrument-trading?instruments=SVF_FC` → `seriesList[].bidPrice/offerPrice/last` (USD/oz) | ❌ **ต้อง headless Chrome** (Node โดน 403 Incapsula) |
| **Yahoo** | ETF SLV/SIVR + COMEX SI=F | `GET https://query1.finance.yahoo.com/v8/finance/chart/{SYM}?interval=1d&range=1d` → `meta.regularMarketPrice` | ❌ **ต้อง headless Chrome** (Node โดน 429) |
| **Bowins** | ฟิสิคัลแท่ง 1 กก. | `GET https://www.bowinsgroup.com/th/silver-price` แล้ว parse: `text-primary`=รับซื้อ, `text-green`=ขายออก (บาท/กก.) | ✅ (แต่เปราะ ถ้าเปลี่ยนดีไซน์หน้า) |
| **ทองสวย** | ฟิสิคัลเม็ดเงิน | `GET https://www.thongsuay.co.th/api/silver_spots/latest` → `lower`=รับซื้อ, `upper`=ขายออก (บาท/น้ำหนักบาท) | ✅ |

> เคล็ด: หา endpoint ซ่อนได้จาก DevTools > Network ตอนโหลดหน้าเว็บร้าน (หลายเจ้าเป็น SPA เรียก JSON API เบื้องหลัง)

---

## 7) โมเดลค่าธรรมเนียม ปัจจุบัน (ยัง "โดยประมาณ" — ต้องหาสเปคจริง)
กำหนดต่อ instrument ใน `config.ts`:
```ts
feeBuyPct   // ค่าคอมตอนซื้อ (ครั้งเดียว)
feeFxPct    // FX markup แปลงบาท→USD (ครั้งเดียว, สินทรัพย์ตปท.)
feeAnnualPct// รายปี: ETF=expense ratio, futures=contango/carry
// VAT จัดการแยกด้วย vatApplicable + toggle
```
ค่าปัจจุบัน (โดยประมาณ): ETF คอม0.2%+FX0.5%+รายปี0.3-0.5% · ฟิวเจอร์ส คอม0.1-0.15%+FX0.5%(COMEX)+contango6-7%/ปี · ฟิสิคัล 0 (VAT แยก)
frontend คิด all-in = `ask×(1+feeBuyOncePct) + ask×feeAnnualPct×ปีที่ถือ`

---

## 8) ⭐ โจทย์ออกแบบใหม่ + พัฒนาต่อ (สิ่งที่อยากให้ทำ)
1. **แสดงค่าธรรมเนียมซื้อ-ขาย "รายครั้ง" ให้ชัด** (โจทย์หลัก)
   - ตอนนี้ค่าธรรมเนียมถูกยุบรวมใน all-in — ต้องการให้เห็นแยก: **ค่าธรรมเนียมตอนซื้อ (ต่อครั้ง)** และ **ตอนขาย (ต่อครั้ง)** ของแต่ละช่องทาง
   - ควรมี: ค่าคอมต่อขา (%+ขั้นต่ำ), FX ต่อขา, ค่าส่ง/ค่าบล็อก (ฟิสิคัล), **ต้นทุน round-trip** (ซื้อ+ถือ+ขาย), และ **จุดคุ้มทุน (break-even %)** ว่าราคาเงินต้องขึ้นกี่ % ถึงเท่าทุน
   - แยก "ค่าครั้งเดียว" ออกจาก "ค่ารายปี" ให้ชัดในหน้า UI
2. **คิดค่าธรรมเนียมฝั่งขายด้วย** (ตอนนี้ all-in เน้นฝั่งซื้อ+ถือครอง)
3. **ออกแบบ UI ใหม่ได้ตามเหมาะสม** (ดู `public/index.html` เป็น baseline — เป็น vanilla ไฟล์เดียว, จะเปลี่ยนเป็น framework ก็ได้ แต่ต้องคงความเป็น static เพื่อโฮสต์ Pages ฟรี)
4. เพิ่มร้าน/ช่องทาง: SNP/แสงนภา, YLG, Ausiris, MTS, KPT + เงิน 92.5% (ดูข้อจำกัดในข้อ 10)
5. (ถ้าทำได้) คำนวณ contango จริงจากราคา 2 เดือนของ TFEX แทนค่าคงที่ (API มี seriesList หลายเดือนอยู่แล้ว)

---

## 9) ⭐ สเปคจริงในตลาดที่ต้องไปหา/ยืนยัน (Research checklist)
ค่าพวกนี้ตอนนี้เป็น "ค่าประมาณ" — ต้องไปหาของจริงต่อโบรก/ร้าน แล้วอัปเดตใน `config.ts`:

**ETF (ผ่านโบรกไทย เช่น Dime, InnovestX, Liberator, Bualuang):**
- ค่าคอมหุ้นต่างประเทศ ต่อขา (%) + **ขั้นต่ำต่อ order** (บางเจ้ามี min เป็น USD/บาท)
- FX markup จริง (สเปรดเรตแปลงบาท↔USD ของแต่ละโบรก) — มักไม่ประกาศตรง ๆ ต้องถาม/ทดลอง
- Expense ratio ล่าสุด + **oz per share** ล่าสุดจาก factsheet (SLV/SIVR ลดลง ~0.5%/ปี — `config.ts` ตั้ง 0.906/0.951 ต้อง verify)
- ภาษี: เกณฑ์ภาษีเงินได้จากการนำเงินลงทุนต่างประเทศกลับเข้าไทย (กฎใหม่)

**TFEX Silver Online Futures:**
- ค่าคอมต่อสัญญาจริงของแต่ละโบรก + ค่าธรรมเนียมตลาด/ก.ล.ต. + VAT บนคอม
- สเปคสัญญา: ตัวคูณราคา (priceQuotationFactor=3000), tick, ขนาดสัญญา, เดือนหมดอายุ, **หลักประกัน (IM/MM)**
- contango จริง (ส่วนต่างเดือนใกล้-ไกล) — ดึงได้จาก API `seriesList` (มีหลายเดือน)

**ฟิสิคัล (Bowins, ทองสวย, YLG, Ausiris, MTS, ฯลฯ):**
- **VAT รวมในราคาที่ประกาศแล้วหรือยัง** (สำคัญ! ทองสวยตอนนี้ "สมมติว่ายังไม่รวม" — ยังไม่ยืนยันกับร้าน)
- ค่าบล็อก/ค่ากดแท่ง (Bowins บอกว่ารวมในราคาขายแล้ว), ค่าจัดส่ง/นัดรับ
- **สเปรดรับซื้อคืน** (bid-ask จริง) + เงื่อนไขรับซื้อคืน (เฉพาะแบรนด์ตัวเอง? ต้องมีใบเสร็จ?)
- ความบริสุทธิ์จริง (99.99% vs 96.5% ฯลฯ) และน้ำหนัก "บาท" ที่ร้านใช้ (15.244 vs 15.20)

**ทั่วไป:** ราคาที่ประกาศเป็นราคา "โดยประมาณ" หรือ firm quote, ความถี่อัปเดต, เวลาตลาดเปิด-ปิด

---

## 10) ข้อควรระวัง / บั๊กที่เคยเจอ (Gotchas)
- **Yahoo บล็อก Node (429), TFEX บล็อก Node (Incapsula 403)** → ต้องดึงผ่าน headless Chrome (`browser.ts`). IP ดาต้าเซ็นเตอร์ (GitHub) อาจโดนบล็อกด้วย → Mac cron (residential) เป็นตัวสำรอง
- **dev server เคยเขียนทับ `latest.json`**: แก้แล้วโดยให้เฉพาะ `snapshot.ts` เขียนไฟล์ — **อย่าให้ refresh() กลับไปเขียนไฟล์อีก** ไม่งั้น `npm start` ที่ค้างอยู่จะทับ snapshot ด้วยโค้ดเก่า
- **GitHub Pages แคช HTML ~10 นาที** → ทดสอบด้วย `?v=xxxx` หรือ Cmd+Shift+R
- **ตลาดปิด/วันหยุด**: บางร้าน (SNP ใช้ WebSocket) ราคาจะว่าง `--:--`; ETF/COMEX = ราคาปิด; ต้องจับจังหวะเวลาเปิด
- **SNP/แสงนภา** = WebSocket feed + Cloudflare (ยาก), **YLG** = ต้อง login, **MTS** = 403/สมาชิก → ต้องใช้ headless + เทคนิคเพิ่ม
- ราคาทั้งหมด **เพื่อการเปรียบเทียบ ไม่ใช่คำแนะนำการลงทุน** (มี disclaimer ในหน้าเว็บแล้ว)

---

## 11) Deploy
- Pages source = **GitHub Actions** (ตั้งไว้แล้ว) · workflow: `.github/workflows/deploy.yml`
- แก้โค้ด → push → CI deploy อัตโนมัติ · หรือ `gh workflow run "Build & Deploy silver dashboard"`
- Mac cron (ถ้าจะใช้): `crontab -e` เพิ่ม `*/20 * * * * /path/scripts/update-and-push.sh >> /tmp/silver-dashboard.log 2>&1`

---

## 12) TODO สรุป
- [ ] แสดงค่าธรรมเนียมซื้อ-ขายรายครั้ง + round-trip + break-even (โจทย์หลัก)
- [ ] คิด fee ฝั่งขาย
- [ ] หาสเปค/ค่าธรรมเนียมจริงต่อโบรก/ร้าน (ข้อ 9) แล้วอัปเดต `config.ts`
- [ ] เพิ่มร้าน: SNP, YLG, Ausiris, MTS, KPT + เงิน 92.5%
- [ ] contango จริงจาก TFEX seriesList
- [ ] verify VAT ต่อร้าน (โดยเฉพาะทองสวย) + oz/share ของ ETF
- [ ] (ออกแบบ) ปรับ UI/UX ใหม่ตามเหมาะสม (คงความเป็น static)
