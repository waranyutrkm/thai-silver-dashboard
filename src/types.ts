// ชนิดข้อมูลกลางของทั้งระบบ

/** ประเภทสินทรัพย์เนื้อเงิน */
export type AssetType =
  | 'spot' // ราค่าอ้างอิงตลาดโลก (benchmark)
  | 'futures' // สัญญาล่วงหน้า COMEX / โบรกไทย
  | 'etf' // กองทุน ETF อิงเงินจริง
  | 'physical_bar' // แท่งเงิน 99.99%
  | 'physical_grain' // เม็ดเงิน / granule (LBMA)
  | 'physical_925'; // เงิน 92.5% (sterling / เครื่องประดับ)

/** หน่วยราคาดิบตามที่แหล่งข้อมูลให้มา */
export type NativeUnit =
  | 'usd_oz' // ดอลลาร์ต่อทรอยออนซ์ (spot / futures)
  | 'etf_usd_share' // ดอลลาร์ต่อหุ้น ETF
  | 'thb_kg' // บาทต่อกิโลกรัม
  | 'thb_baht' // บาทต่อ "1 บาท" (น้ำหนักไทย)
  | 'thb_gram'; // บาทต่อกรัม (ตามน้ำหนักจริง ยังไม่หารความบริสุทธิ์)

/** นิยาม instrument หนึ่งตัวใน registry */
export interface Instrument {
  id: string;
  name: string; // ชื่อแสดงผล
  type: AssetType;
  source: 'yahoo' | 'scraper' | 'derived' | 'browser';
  unit: NativeUnit;
  purity: number; // สัดส่วนเนื้อเงินบริสุทธิ์ เช่น 0.9999, 0.925
  vatApplicable: boolean; // ฟิสิคัลไทยโดน VAT 7% (paper ไม่โดน)
  symbol?: string; // สัญลักษณ์ Yahoo (ถ้า source=yahoo)
  ozPerShare?: number; // ทรอยออนซ์เงินต่อหุ้น (ETF)
  contractOz?: number; // ขนาดสัญญา (futures) ใช้ตอนคิด notional
  navProxy?: boolean; // ETF: ประมาณราคา = NAV (spot×ozPerShare) เพราะยังไม่มี feed ตลาดจริง
  // ── ค่าธรรมเนียม (โดยประมาณ ปรับได้) ─────────────────────────────
  feeBuyPct?: number; // ค่าคอมตอนซื้อ (ต่อครั้ง) เช่น 0.002 = 0.2%
  feeSellPct?: number; // ค่าคอมตอนขาย (ต่อครั้ง)
  feeFxPct?: number; // ค่าแปลงเงิน FX markup (คิดทั้งขาซื้อและขาย, สินทรัพย์ตปท.)
  feeAnnualPct?: number; // ค่าธรรมเนียมรายปี: ETF=expense ratio, futures=contango/carry
  url?: string; // ลิงก์อ้างอิง
  note?: string;
}

/** ราคาดิบที่ดึงมาได้ (ก่อน normalize) */
export interface RawQuote {
  id: string;
  last?: number; // ราคาล่าสุด (mid)
  bid?: number; // ราคารับซื้อ (ฝั่งร้านรับซื้อจากเรา = เราขายได้ราคานี้)
  ask?: number; // ราคาขายออก (ร้านขายให้เรา = เราซื้อราคานี้)
  currency?: string;
  ts?: number; // epoch ms ที่ราคานี้อัปเดต
  ok: boolean; // ดึงสำเร็จหรือไม่
  stale?: boolean; // ข้อมูลเก่า/ตลาดปิด
  error?: string;
}

/** context ตลาดปัจจุบัน (อินพุตสด) */
export interface MarketContext {
  spotUsdOz: number; // XAG spot USD/oz
  fx: number; // USDTHB
  spotBase: number; // THB ต่อกรัมเนื้อเงินบริสุทธิ์ (เส้น benchmark)
  ts: number;
  fxStale?: boolean;
  spotStale?: boolean;
  spotChangePct?: number; // %เปลี่ยนแปลงราคา spot วันนี้
  spotSource?: string;
  fxSource?: string;
  fxDate?: string;
  ok?: boolean; // ดึง spot+fx สำเร็จหรือไม่
}

/** แถวผลลัพธ์หลัง normalize — ทุกค่าเป็น "บาท/กรัมเนื้อเงินบริสุทธิ์ (B)" */
export interface NormalizedRow {
  id: string;
  name: string;
  type: AssetType;
  url?: string;
  note?: string;
  // ค่าในฐานเดียว (ไม่รวม VAT)
  bidBase: number | null; // เราขายได้ (B_bid)
  askBase: number | null; // เราซื้อจ่าย (B_ask)
  // ค่าฟิสิคัลที่รวม VAT แล้ว (paper = เท่ากับ askBase)
  askBaseEff: number | null; // ใช้จัดอันดับฝั่งซื้อ
  bidBaseEff: number | null; // ใช้จัดอันดับฝั่งขาย
  vatApplicable: boolean;
  premiumBuy: number | null; // askBaseEff / spotBase - 1
  premiumSell: number | null; // bidBaseEff / spotBase - 1
  spreadPct: number | null; // (ask-bid)/bid — null ถ้าเป็นราคาตลาดค่าเดียว
  mid: boolean; // true = ราคาตลาดจริงค่าเดียว (ไม่มี bid/ask สองฝั่ง เช่น spot/ETF/COMEX)
  feeBuyOncePct: number; // ค่าธรรมเนียมต่อครั้งตอนซื้อ (คอม + FX)
  feeSellOncePct: number; // ค่าธรรมเนียมต่อครั้งตอนขาย (คอม + FX)
  feeAnnualPct: number; // ค่าธรรมเนียมรายปี (expense ratio / contango)
  native: RawQuote; // ราคาดิบ + สถานะ
}

export interface Snapshot {
  ts: number;
  market: MarketContext;
  rows: NormalizedRow[];
}
