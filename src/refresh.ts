import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { INSTRUMENTS } from './config';
import { buildMarketContext, normalizeOne } from './normalize';
import { fetchBowins1kg } from './sources/bowins';
import { fetchViaBrowser, type BrowserQuotes } from './sources/browser';
import { fetchUsdThb } from './sources/fx';
import { fetchSilverSpot } from './sources/metals';
import type { MarketContext, RawQuote, Snapshot } from './types';

const __dirname = dirname(fileURLToPath(import.meta.url));
// เขียนไว้ใน public/ เพื่อให้โฮสต์ static (GitHub Pages) เสิร์ฟไฟล์นี้ได้ตรง ๆ
const DATA_FILE = join(__dirname, '..', 'public', 'data', 'latest.json');

interface CachedData {
  market: MarketContext;
  quotes: RawQuote[];
  ts: number;
}
let cached: CachedData | null = null;

/** ดึงข้อมูลสดทุกแหล่งพร้อมกัน → อัปเดต cache + เขียนไฟล์ snapshot
 *  @param opts.useBrowser เปิด headless Chrome ดึง TFEX/Yahoo (ปิดได้บน CI ที่ IP โดนบล็อก) */
export async function refresh(opts: { useBrowser?: boolean } = {}): Promise<CachedData> {
  const useBrowser = opts.useBrowser ?? true;
  const now = Date.now();

  const [spotR, fxR, bowinsR, browserR] = await Promise.allSettled([
    fetchSilverSpot(),
    fetchUsdThb(),
    fetchBowins1kg(),
    useBrowser
      ? fetchViaBrowser(['SLV', 'SIVR', 'SI=F'])
      : Promise.resolve({ yahoo: {}, ok: false, error: 'ปิด browser (CI)' } as BrowserQuotes),
  ]);

  const spot = spotR.status === 'fulfilled' ? spotR.value : null;
  const fx = fxR.status === 'fulfilled' ? fxR.value : null;
  const bowins: RawQuote =
    bowinsR.status === 'fulfilled'
      ? bowinsR.value
      : { id: 'bowins_1kg', ok: false, error: 'ดึงไม่สำเร็จ' };
  const browser: BrowserQuotes =
    browserR.status === 'fulfilled'
      ? browserR.value
      : { yahoo: {}, ok: false, error: 'headless browser ล้มเหลว' };

  const spotUsdOz = spot?.usdOz ?? 0;
  const fxRate = fx?.rate ?? 0;
  const market = buildMarketContext(spotUsdOz, fxRate, now, {
    spotChangePct: spot?.changePct,
    spotSource: spot?.source,
    fxSource: fx?.source,
    fxDate: fx?.date,
    ok: !!spot && !!fx,
  });

  const quotes: RawQuote[] = INSTRUMENTS.map((inst): RawQuote => {
    switch (inst.id) {
      case 'spot_xag':
        return {
          id: inst.id,
          last: spotUsdOz,
          currency: 'USD',
          ts: spot?.ts ?? now,
          ok: spotUsdOz > 0,
          error: spotUsdOz > 0 ? undefined : 'ไม่มีราคา spot',
        };

      case 'tfex_svf':
        if (browser.tfex) {
          return {
            id: inst.id,
            bid: browser.tfex.bid,
            ask: browser.tfex.ask,
            last: browser.tfex.last,
            currency: 'USD',
            ts: browser.tfex.ts,
            ok: true,
          };
        }
        return { id: inst.id, ok: false, error: 'ดึง TFEX ไม่ได้ (headless browser)' };

      case 'comex_si': {
        const y = browser.yahoo['SI=F'];
        return y
          ? { id: inst.id, last: y.last, currency: 'USD', ts: y.ts, ok: true }
          : { id: inst.id, ok: false, error: 'ดึง Yahoo SI=F ไม่ได้' };
      }

      case 'etf_slv':
      case 'etf_sivr': {
        const sym = inst.id === 'etf_slv' ? 'SLV' : 'SIVR';
        const y = browser.yahoo[sym];
        if (y) return { id: inst.id, last: y.last, currency: 'USD', ts: y.ts, ok: true };
        // fallback: NAV proxy = spot × ozPerShare
        if (inst.navProxy && inst.ozPerShare && spotUsdOz > 0) {
          return {
            id: inst.id,
            last: spotUsdOz * inst.ozPerShare,
            currency: 'USD',
            ts: spot?.ts ?? now,
            ok: true,
            stale: true, // ใช้ค่าประมาณ NAV
          };
        }
        return { id: inst.id, ok: false, error: 'ดึงราคา ETF ไม่ได้' };
      }

      case 'bowins_1kg':
        return bowins;

      default:
        return { id: inst.id, ok: false, error: 'ไม่มีข้อมูล' };
    }
  });

  cached = { market, quotes, ts: now };

  try {
    await mkdir(dirname(DATA_FILE), { recursive: true });
    await writeFile(DATA_FILE, JSON.stringify(getSnapshot(false), null, 2));
  } catch {
    /* เขียนไฟล์ไม่ได้ ไม่เป็นไร */
  }
  return cached;
}

/** สร้าง snapshot ที่ normalize แล้วจาก cache (ใส่/ไม่ใส่ VAT ตาม flag) */
export function getSnapshot(includeVat: boolean): Snapshot {
  if (!cached) {
    return {
      ts: Date.now(),
      market: buildMarketContext(0, 0, Date.now(), { ok: false }),
      rows: [],
    };
  }
  const byId = new Map(cached.quotes.map((q) => [q.id, q]));
  const rows = INSTRUMENTS.map((inst) => {
    const q = byId.get(inst.id) ?? { id: inst.id, ok: false, error: 'ไม่มีข้อมูล' };
    return normalizeOne(inst, q, cached!.market, includeVat);
  });
  return { ts: cached.ts, market: cached.market, rows };
}

export function hasData(): boolean {
  return cached != null;
}
