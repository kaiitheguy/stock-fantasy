// server.js  (Node >=18, "type": "module")
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import OpenAI from 'openai';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cors());

// (optional) tiny request logger
app.use((req, _res, next) => {
  console.log('[REQ]', req.method, req.url);
  next();
});

// health check
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, env: !!process.env.OPENAI_API_KEY });
});

/* ------------------------------------------------------------------
   Yahoo aggregator (quote + chart + description)
   ------------------------------------------------------------------ */
app.get('/api/yahoo', async (req, res) => {
  const symbol = (req.query.symbol || '').toString().trim();
  if (!symbol) return res.status(400).json({ error: 'Missing symbol' });

  const ua = { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' };

  const safeFetch = async (url) => {
    try {
      const r = await fetch(url, { headers: ua });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      console.error('[yahoo] fetch failed:', url, e);
      return null;
    }
  };

  const [quote, chart, summary] = await Promise.all([
    safeFetch(
      `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(
        symbol
      )}`
    ),
    safeFetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
        symbol
      )}?range=1d&interval=1m`
    ),
    safeFetch(
      `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(
        symbol
      )}?modules=assetProfile,summaryProfile`
    ),
  ]);

  let price = null,
    changePct = null,
    spark = [],
    yahooDesc;

  try {
    const r = quote?.quoteResponse?.result?.[0];
    price = r?.regularMarketPrice ?? null;
    changePct = r?.regularMarketChangePercent ?? null;
  } catch {}

  try {
    const R = chart?.chart?.result?.[0];
    const closes = R?.indicators?.quote?.[0]?.close ?? [];
    spark = (closes || []).filter((v) => typeof v === 'number');

    // fallbacks if quote failed
    if ((!price || !Number.isFinite(price)) && R?.meta?.regularMarketPrice) {
      price = R.meta.regularMarketPrice;
    }
    if (
      (changePct == null || !Number.isFinite(changePct)) &&
      typeof price === 'number' &&
      typeof R?.meta?.previousClose === 'number' &&
      R.meta.previousClose > 0
    ) {
      changePct = ((price - R.meta.previousClose) / R.meta.previousClose) * 100;
    }
  } catch {}

  try {
    const rr = summary?.quoteSummary?.result?.[0];
    yahooDesc =
      rr?.assetProfile?.longBusinessSummary ||
      rr?.summaryProfile?.longBusinessSummary ||
      undefined;
  } catch {}

  res.setHeader('Cache-Control', 'no-store');
  res.json({ price, changePct, spark, yahooDesc });
});

/* ------------------------------------------------------------------
   OpenAI rationale (A+B = 100)  — uses Chat Completions JSON mode
   ------------------------------------------------------------------ */
app.post('/api/rationale', async (req, res) => {
  try {
    const { symbol, name, price, changePct } = req.body || {};
    if (!process.env.OPENAI_API_KEY) {
      return res
        .status(500)
        .json({ error: 'OPENAI_API_KEY missing on server' });
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const system =
      'You are an equity analyst. Be neutral, concise, and factual.';
    const user = [
      `Ticker: ${symbol}`,
      `Company: ${name}`,
      typeof price === 'number' ? `Spot price: ${price}` : null,
      typeof changePct === 'number' ? `Change %: ${changePct}` : null,
      'Return STRICT JSON with keys: companyDescription, buy, buyProbability, sell, sellProbability.',
      'buyProbability + sellProbability MUST equal 100.',
      'Each text ≤ 80 words. No markdown. No extra text around the JSON.',
    ]
      .filter(Boolean)
      .join('\n');

    // Chat Completions with JSON mode (stable across SDK versions)
    const chat = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      response_format: { type: 'json_object' },
    });

    const raw = chat.choices?.[0]?.message?.content || '{}';
    let data = {};
    try {
      data = JSON.parse(raw);
    } catch {
      data = {};
    }

    // Normalize A+B=100
    let a = Number(data?.buyProbability ?? 0);
    let b = Number(data?.sellProbability ?? 0);
    if (!Number.isFinite(a) || a < 0) a = 0;
    if (!Number.isFinite(b) || b < 0) b = 0;
    const sum = a + b;
    if (sum === 0) {
      a = 50;
      b = 50;
    } else if (sum !== 100) {
      a = (a / sum) * 100;
      b = 100 - a;
    }
    a = Math.round(a * 10) / 10;
    b = Math.round(b * 10) / 10;

    res.json({
      companyDescription: data?.companyDescription ?? '',
      buy: data?.buy ?? '',
      buyProbability: a,
      sell: data?.sell ?? '',
      sellProbability: b,
    });
  } catch (e) {
    console.error('AI error:', e);
    res.status(500).json({ error: 'AI error', detail: String(e) });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Backend listening at http://0.0.0.0:${PORT}`);
});
