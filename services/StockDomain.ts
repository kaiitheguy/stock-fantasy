import Constants from 'expo-constants';

export type StockCard = {
  id: string;
  ticker: string;
  name: string;
};

export type BuyTransaction = {
  id: string;
  ticker: string;
  name: string;
  price: number;
  timestamp: number;
};

export type StockDescriptor = { ticker: string; name: string };

export type Realtime = {
  price: number | null;
  changePct: number | null;
  spark: number[];
  yahooDesc?: string;
  lastUpdated: number;
  debugError?: string;
};

export type AIInsight = {
  companyDescription: string;
  buy: string;
  buyProbability: number;
  sell: string;
  sellProbability: number;
};

const DEFAULT_BATCH_SIZE = 12;

const DEFAULT_STOCK_UNIVERSE: readonly StockDescriptor[] = [
  { ticker: 'AAPL', name: 'Apple Inc.' },
  { ticker: 'MSFT', name: 'Microsoft Corp.' },
  { ticker: 'GOOGL', name: 'Alphabet Inc.' },
  { ticker: 'NVDA', name: 'NVIDIA Corp.' },
  { ticker: 'TSLA', name: 'Tesla, Inc.' },
  { ticker: 'AMZN', name: 'Amazon.com Inc.' },
  { ticker: 'META', name: 'Meta Platforms Inc.' },
  { ticker: 'NFLX', name: 'Netflix, Inc.' },
  { ticker: 'BABA', name: 'Alibaba Group' },
  { ticker: 'ORCL', name: 'Oracle Corp.' },
  { ticker: 'AMD', name: 'Advanced Micro Devices' },
  { ticker: 'INTC', name: 'Intel Corp.' },
  { ticker: 'SHOP', name: 'Shopify Inc.' },
  { ticker: 'CRM', name: 'Salesforce, Inc.' },
  { ticker: 'UBER', name: 'Uber Technologies' },
  { ticker: 'COIN', name: 'Coinbase Global' },
] as const;

const resolveApiBase = (): string => {
  const configBase =
    (Constants?.expoConfig as any)?.extra?.EXPO_PUBLIC_API_BASE ??
    process.env.EXPO_PUBLIC_API_BASE;
  const fallback = 'https://stock-fantasy-api.onrender.com';
  const base = configBase || fallback;
  return base.replace(/\/$/, '');
};

export const API_BASE = resolveApiBase();
export const STOCK_UNIVERSE = DEFAULT_STOCK_UNIVERSE;

export class StockDeckService {
  constructor(
    private readonly universe: readonly StockDescriptor[] = DEFAULT_STOCK_UNIVERSE,
    private readonly defaultBatchSize = DEFAULT_BATCH_SIZE
  ) {}

  generateBatch(size = this.defaultBatchSize): StockCard[] {
    const pool = this.shuffle(this.universe);
    const batch: StockCard[] = [];
    for (let i = 0; i < size; i++) {
      const descriptor = pool[i % pool.length];
      batch.push({
        id: `${descriptor.ticker}-${Math.random().toString(16).slice(2, 8)}-${Date.now()}`,
        ticker: descriptor.ticker,
        name: descriptor.name,
      });
    }
    return batch;
  }

  private shuffle<T>(items: readonly T[]): T[] {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }
}

export class YahooFinanceService {
  constructor(private readonly baseUrl: string = API_BASE) {}

  async fetchRealtime(ticker: string): Promise<Realtime> {
    try {
      console.log('YahooFinanceService.fetchRealtime ->', ticker, `${this.baseUrl}/api/yahoo`);
      const response = await fetch(
        `${this.baseUrl}/api/yahoo?symbol=${encodeURIComponent(ticker)}`
      );
      if (!response.ok) {
        throw new Error(`Yahoo fetch failed ${response.status}`);
      }

      const data = await response.json();
      console.log('YahooFinanceService.fetchRealtime ok ->', ticker, {
        price: data?.price,
        changePct: data?.changePct,
        sparkLen: Array.isArray(data?.spark) ? data.spark.length : 0,
        hasDesc: !!data?.yahooDesc,
      });

      return {
        price: typeof data.price === 'number' ? data.price : null,
        changePct: typeof data.changePct === 'number' ? data.changePct : null,
        spark: Array.isArray(data.spark) ? data.spark : [],
        yahooDesc: data.yahooDesc || undefined,
        lastUpdated: Date.now(),
      };
    } catch (error) {
      console.warn('YahooFinanceService.fetchRealtime error ->', ticker, error);
      return {
        price: null,
        changePct: null,
        spark: [],
        yahooDesc: undefined,
        lastUpdated: Date.now(),
        debugError: String(error),
      };
    }
  }
}

export class AIInsightService {
  constructor(private readonly baseUrl: string = API_BASE) {}

  async fetchInsight(
    symbol: string,
    name: string,
    snapshot: { price: number | null; changePct: number | null }
  ): Promise<AIInsight | null> {
    try {
      console.log('AIInsightService.fetchInsight ->', symbol, `${this.baseUrl}/api/rationale`);
      const response = await fetch(`${this.baseUrl}/api/rationale`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol,
          name,
          price: snapshot.price,
          changePct: snapshot.changePct,
        }),
      });

      if (!response.ok) {
        throw new Error(`AI rationale fetch failed ${response.status}`);
      }

      const data = (await response.json()) as AIInsight;
      console.log('AIInsightService.fetchInsight ok ->', symbol, {
        buyP: data.buyProbability,
        sellP: data.sellProbability,
      });
      return data;
    } catch (error) {
      console.warn('AIInsightService.fetchInsight error', error);
      return null;
    }
  }
}

export class SparklineBuilder {
  buildPath(values: number[], width: number, height: number): string {
    if (!values || values.length < 2) return '';

    const min = Math.min(...values);
    const max = Math.max(...values);
    const steps = values.length - 1 || 1;
    const dx = width / steps;

    const scaleY = (value: number) => {
      if (max === min) {
        return height / 2;
      }
      return ((value - min) / (max - min)) * height;
    };

    let path = `M 0 ${(height - scaleY(values[0])).toFixed(2)}`;
    for (let i = 1; i < values.length; i += 1) {
      const x = Number(i * dx).toFixed(2);
      const y = (height - scaleY(values[i])).toFixed(2);
      path += ` L ${x} ${y}`;
    }

    return path;
  }
}
