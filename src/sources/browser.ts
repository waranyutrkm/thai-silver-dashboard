import { chromium, type Browser } from 'playwright-core';

// ดึงแหล่งที่บล็อก Node (TFEX = Incapsula, Yahoo = 429) ผ่าน headless Chrome ที่ติดตั้งในเครื่อง
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const TFEX_PAGE =
  'https://www.tfex.co.th/en/products/precious-metal/silver-online-futures/market-data';
const TFEX_API =
  '/api/set/tfex/marketlist/TXM_F/instrument-trading?instruments=SVF_FC';

export interface TfexQuote {
  bid: number;
  ask: number;
  last: number;
  series: string;
  ts: number;
}
export interface BrowserQuotes {
  tfex?: TfexQuote;
  yahoo: Record<string, { last: number; ts: number }>;
  ok: boolean;
  error?: string;
}

const num = (v: unknown) => {
  const n = Number(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : NaN;
};

/** เปิด Chrome หนึ่งครั้ง ดึง TFEX + Yahoo แล้วปิด (ทนต่อความล้มเหลวรายแหล่ง) */
export async function fetchViaBrowser(
  yahooSymbols: string[] = ['SLV', 'SIVR', 'SI=F'],
): Promise<BrowserQuotes> {
  const out: BrowserQuotes = { yahoo: {}, ok: false };
  let browser: Browser | null = null;
  try {
    // Mac: ใช้ Chrome ที่ติดตั้งในเครื่อง (channel) — CI: ใช้ chromium ที่ playwright ติดตั้ง
    try {
      browser = await chromium.launch({ channel: 'chrome', headless: true });
    } catch {
      browser = await chromium.launch({ headless: true });
    }
    const ctx = await browser.newContext({ userAgent: UA });
    const page = await ctx.newPage();

    // 1) TFEX (โหลดหน้าเพื่อผ่าน Incapsula แล้วเรียก API same-origin)
    try {
      await page.goto(TFEX_PAGE, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await page.waitForTimeout(2500);
      const body = await page.evaluate(async (api) => {
        const r = await fetch(api, { headers: { Accept: 'application/json' } });
        return r.ok ? await r.text() : null;
      }, TFEX_API);
      if (body) {
        const j = JSON.parse(body);
        const list: any[] = j?.instruments?.[0]?.seriesList ?? [];
        const front = list.find((s) => s.mostActiveVolume) ?? list[0];
        if (front) {
          const last = num(front.last);
          out.tfex = {
            bid: num(front.bidPrice) || last,
            ask: num(front.offerPrice) || last,
            last,
            series: front.symbol,
            ts: Date.parse(front.marketTime) || Date.now(),
          };
        }
      }
    } catch {
      /* TFEX ล้มเหลว — ข้าม */
    }

    // 2) Yahoo (นำทางไปที่ JSON โดยตรง แล้วอ่าน body — เลี่ยง CORS)
    for (const sym of yahooSymbols) {
      try {
        await page.goto(
          `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
            sym,
          )}?interval=1d&range=1d`,
          { waitUntil: 'domcontentloaded', timeout: 20_000 },
        );
        const txt = await page.evaluate(() => document.body.innerText);
        const j = JSON.parse(txt);
        const meta = j?.chart?.result?.[0]?.meta;
        const price = num(meta?.regularMarketPrice);
        if (price) {
          out.yahoo[sym] = {
            last: price,
            ts: (meta?.regularMarketTime ?? 0) * 1000 || Date.now(),
          };
        }
      } catch {
        /* symbol ล้มเหลว — ข้าม */
      }
    }

    out.ok = !!out.tfex || Object.keys(out.yahoo).length > 0;
    return out;
  } catch (e) {
    out.error = (e as Error).message;
    return out;
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}
