import type { RawQuote } from '../types';

// เม็ดเงิน 99.99% จากห้างทองทองสวย — API สาธารณะ (Node fetch ได้)
// upper = ราคาขายออก, lower = ราคารับซื้อ — หน่วยเป็น "บาทต่อน้ำหนักบาท (15.244 ก.)"
const URL = 'https://www.thongsuay.co.th/api/silver_spots/latest';
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const plausible = (n: unknown) =>
  typeof n === 'number' && Number.isFinite(n) && n > 300 && n < 5000;

export async function fetchThongsuayGrain(): Promise<RawQuote> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12_000);
  try {
    const res = await fetch(URL, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j: any = await res.json();
    const bid = j?.lower; // รับซื้อ (บาท/น้ำหนักบาท)
    const ask = j?.upper; // ขายออก
    if (!plausible(bid) || !plausible(ask)) {
      throw new Error('ราคาไม่อยู่ในช่วงที่คาด (โครง API อาจเปลี่ยน)');
    }
    return {
      id: 'thongsuay_grain',
      bid,
      ask,
      currency: 'THB',
      ts: j?.updated_at ? Date.parse(j.updated_at) : Date.now(),
      ok: true,
    };
  } catch (e) {
    return { id: 'thongsuay_grain', ok: false, error: (e as Error).message };
  } finally {
    clearTimeout(t);
  }
}
