// server.js  (Node >=18, "type": "module")
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import YahooFinance from 'yahoo-finance2';

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
   Yahoo aggregator (quote + chart + description) using yahoo-finance2
   ------------------------------------------------------------------ */
app.get('/api/yahoo', async (req, res) => {
  const symbol = (req.query.symbol || '').toString().trim();
  if (!symbol) return res.status(400).json({ error: 'Missing symbol' });

  try {
    const yahooFinance = new YahooFinance();
    
    // Fetch quote data
    const quote = await yahooFinance.quote(symbol);
    
    // Fetch summary data for company description
    const summary = await yahooFinance.quoteSummary(symbol, {
      modules: ['assetProfile', 'summaryProfile']
    });

    // Extract price and change percentage
    const price = quote?.regularMarketPrice || quote?.price || null;
    const changePct = quote?.regularMarketChangePercent || quote?.regularMarketChange || null;
    
    // Try to fetch historical data for sparkline (optional)
    let spark = [];
    try {
      const historical = await yahooFinance.historical(symbol, {
        period1: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
        period2: new Date(),
        interval: '1d'
      });
      spark = historical
        ?.map(item => item.close)
        .filter(price => typeof price === 'number' && !isNaN(price)) || [];
    } catch (histError) {
      console.log('[yahoo-finance2] Historical data failed, using empty sparkline:', histError.message);
      spark = [];
    }

    // Extract company description
    const yahooDesc = summary?.assetProfile?.longBusinessSummary || 
                     summary?.summaryProfile?.longBusinessSummary || 
                     null;

    res.setHeader('Cache-Control', 'no-store');
    res.json({ 
      price, 
      changePct, 
      spark, 
      yahooDesc 
    });

  } catch (error) {
    console.error('[yahoo-finance2] Error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch stock data', 
      detail: error.message 
    });
  }
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