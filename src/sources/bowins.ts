import type { RawQuote } from '../types';

// ราคาแท่งเงิน 1 กก. (99.99%) จาก Bowins — หน้า server-rendered ดึงจาก Node ได้
const URL = 'https://www.bowinsgroup.com/th/silver-price';
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const toNum = (s: string) => Number(s.replace(/,/g, ''));
const plausible = (n: number) => Number.isFinite(n) && n > 10_000 && n < 500_000;

/**
 * ดึงราคา รับซื้อ/ขายออก ของแท่งเงิน 1 กก.
 * โครงหน้า: ราคารับซื้ออยู่ใน span คลาส text-primary, ราคาขายออกอยู่ใน text-green
 * (ขายออกเป็นราคาก่อน VAT — VAT 7% จัดการที่ normalize ตาม toggle)
 */
export async function fetchBowins1kg(): Promise<RawQuote> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12_000);
  try {
    const res = await fetch(URL, {
      headers: { 'User-Agent': UA, Accept: 'text/html' },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();

    const buyM = html.match(/text-primary[^>]*>\s*([0-9][0-9,]*(?:\.[0-9]+)?)/);
    const sellM = html.match(/text-green[^>]*>\s*([0-9][0-9,]*(?:\.[0-9]+)?)/);
    const bid = buyM ? toNum(buyM[1]) : NaN;
    const ask = sellM ? toNum(sellM[1]) : NaN;

    if (!plausible(bid) || !plausible(ask)) {
      throw new Error('parse ราคาไม่สำเร็จ (โครงหน้าอาจเปลี่ยน)');
    }
    // marker เวลาอัปเดต (ถ้ามี)
    const round = html.match(/ครั้งที่\s*\d+/)?.[0];
    return {
      id: 'bowins_1kg',
      bid,
      ask,
      currency: 'THB',
      ts: Date.now(),
      ok: true,
      error: round ? undefined : undefined,
    };
  } catch (e) {
    return { id: 'bowins_1kg', ok: false, error: (e as Error).message };
  } finally {
    clearTimeout(t);
  }
}
