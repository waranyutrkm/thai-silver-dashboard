import type { Instrument } from './types';

// ── ค่าคงที่ทางฟิสิกส์/ภาษี ─────────────────────────────────────────
export const OZT = 31.1034768; // กรัมต่อทรอยออนซ์
export const BAHT_SILVER_G = 15.244; // น้ำหนักเงิน "1 บาท" ไทย (บางร้านใช้ 15.20)
export const VAT = 0.07; // VAT ฟิสิคัลเงินไทย (ทองแท่งไม่โดน แต่เงินโดน)

// รอบรีเฟรช (นาที)
export const REFRESH_MINUTES = 5;
export const PORT = Number(process.env.PORT) || 5178;

/**
 * Registry ของ instrument
 * แหล่ง:
 *   - spot: api.gold-api.com / goldprice.org (Node)         — real-time
 *   - FX:   frankfurter.app / open.er-api.com (Node)         — รายวัน
 *   - TFEX Silver Futures: headless Chrome (Incapsula บล็อก Node) — delayed 15 นาที
 *   - ETF ราคาตลาดจริง: headless Chrome → Yahoo (Node โดน 429) — NAV proxy เป็น fallback
 *   - Bowins ฟิสิคัล: Node fetch หน้า /th/silver-price (server-rendered)
 * ozPerShare ของ ETF: อ้างอิง factsheet ผู้ออก (ลดลง ~0.5%/ปี) — verify เป็นรอบ
 */
export const INSTRUMENTS: Instrument[] = [
  {
    id: 'spot_xag',
    name: 'Silver Spot (XAG/USD)',
    type: 'spot',
    source: 'derived',
    unit: 'usd_oz',
    purity: 0.9999,
    vatApplicable: false,
    url: 'https://www.gold-api.com/',
    note: 'ราคาอ้างอิงตลาดโลก — เส้น benchmark',
  },
  {
    id: 'tfex_svf',
    name: 'TFEX Silver Online Futures',
    type: 'futures',
    source: 'browser',
    unit: 'usd_oz',
    purity: 0.999,
    vatApplicable: false,
    contractOz: 300, // priceQuotationFactor 3000 / tick — สัญญาอิง USD/oz (ดูสเปก TFEX)
    feeBuyPct: 0.0015, // ค่าคอม/สัญญา + ค่าธรรมเนียมตลาด + VAT บนคอม (โดยประมาณ)
    feeAnnualPct: 0.07, // contango/ต้นทุน roll ~7%/ปี (จากส่วนต่างเดือนใกล้-ไกลจริง)
    url: 'https://www.tfex.co.th/en/products/precious-metal/silver-online-futures/market-data',
    note: 'ฟิวเจอร์สเงินในไทย (ในกำกับ ก.ล.ต.) · ดีเลย์ 15 นาที · เดือนใกล้สุด · มี contango เวลาถือยาว',
  },
  {
    id: 'comex_si',
    name: 'COMEX Silver Futures (SI=F)',
    type: 'futures',
    source: 'browser',
    unit: 'usd_oz',
    purity: 0.999,
    vatApplicable: false,
    contractOz: 5000,
    feeBuyPct: 0.001,
    feeFxPct: 0.005, // เทรดผ่านโบรก ตปท. มี FX
    feeAnnualPct: 0.06, // contango/ต้นทุน roll ~6%/ปี (โดยประมาณ)
    url: 'https://finance.yahoo.com/quote/SI=F',
    note: 'ฟิวเจอร์สเงินตลาดโลก (COMEX) · เดือนใกล้สุด · มี contango เวลาถือยาว',
  },
  {
    id: 'etf_slv',
    name: 'iShares Silver Trust (SLV)',
    type: 'etf',
    source: 'browser',
    unit: 'etf_usd_share',
    purity: 0.999,
    vatApplicable: false,
    ozPerShare: 0.906, // ⚠️ verify: iShares "silver per share"
    navProxy: true, // fallback ถ้าดึงราคาตลาดจริงไม่ได้
    feeBuyPct: 0.002, // ค่าคอมหุ้น ตปท. ~0.2% (โดยประมาณ)
    feeFxPct: 0.005, // FX markup แปลงบาท→USD ~0.5%
    feeAnnualPct: 0.005, // expense ratio 0.50%/ปี
    url: 'https://www.ishares.com/us/products/239855/',
    note: 'ETF อิงเงินจริง · ค่าธรรมเนียม 0.50%/ปี · ซื้อผ่านโบรกหุ้น US',
  },
  {
    id: 'etf_sivr',
    name: 'abrdn Physical Silver (SIVR)',
    type: 'etf',
    source: 'browser',
    unit: 'etf_usd_share',
    purity: 0.999,
    vatApplicable: false,
    ozPerShare: 0.951, // ⚠️ verify: abrdn "metal per share"
    navProxy: true,
    feeBuyPct: 0.002,
    feeFxPct: 0.005,
    feeAnnualPct: 0.003, // expense ratio 0.30%/ปี
    url: 'https://www.abrdn.com/en-us/investor/products/etfs/sivr',
    note: 'ETF อิงเงินจริง · ค่าธรรมเนียม 0.30%/ปี · ซื้อผ่านโบรกหุ้น US',
  },
  {
    id: 'bowins_1kg',
    name: 'Bowins แท่งเงิน 1 กก. (99.99%)',
    type: 'physical_bar',
    source: 'scraper',
    unit: 'thb_kg',
    purity: 0.9999,
    vatApplicable: true, // ฟิสิคัลไทยโดน VAT 7% (toggle)
    url: 'https://www.bowinsgroup.com/th/silver-price',
    note: 'ร้านจริง · รับซื้อ/ขายออก · ขายออกยังไม่รวม VAT 7% (กดปุ่ม VAT เพื่อรวม)',
  },
  {
    id: 'thongsuay_grain',
    name: 'ทองสวย เม็ดเงิน (99.99%)',
    type: 'physical_grain',
    source: 'scraper',
    unit: 'thb_baht', // API ให้ราคาต่อน้ำหนักบาท (15.244 ก.)
    purity: 0.9999,
    vatApplicable: true,
    url: 'https://www.thongsuay.co.th/silver-grains',
    note: 'เม็ดเงิน · รับซื้อ/ขาย · ราคาโดยประมาณ ยังไม่รวม VAT (กดปุ่ม VAT เพื่อรวม)',
  },
];
