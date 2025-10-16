// App.tsx
import Constants from 'expo-constants';
import React, { useMemo, useRef, useState, useEffect } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Animated,
  PanResponder,
  StyleSheet,
  Text,
  View,
  Dimensions,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import Svg, { Path } from 'react-native-svg';

type StockCard = {
  id: string;
  ticker: string;
  name: string;
};

type StockDescriptor = { ticker: string; name: string };

type Realtime = {
  price: number | null;
  changePct: number | null;
  spark: number[];           // recent close prices (1d, 1m interval)
  yahooDesc?: string;        // Yahoo longBusinessSummary
  lastUpdated: number;       // ms
};

type AIInsight = {
  companyDescription: string;
  buy: string;
  buyProbability: number;
  sell: string;
  sellProbability: number;
};

const BATCH_SIZE = 12;
const SWIPE_THRESHOLD = 110;
const API_BASE =
  (Constants?.expoConfig as any)?.extra?.EXPO_PUBLIC_API_BASE ??
  process.env.EXPO_PUBLIC_API_BASE ??
  '';
console.log('API_BASE =', API_BASE);

const STOCK_UNIVERSE: readonly StockDescriptor[] = [
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

const w = Dimensions.get('window').width;

const shuffle = <T,>(items: readonly T[]): T[] => {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

const generateStockBatch = (size = BATCH_SIZE): StockCard[] => {
  const pool = shuffle(STOCK_UNIVERSE);
  const batch: StockCard[] = [];
  for (let i = 0; i < size; i++) {
    const d = pool[i % pool.length];
    batch.push({
      id: `${d.ticker}-${Math.random().toString(16).slice(2, 8)}-${Date.now()}`,
      ticker: d.ticker,
      name: d.name,
    });
  }
  return batch;
};

/** -------- Yahoo helpers (client-side) --------
 * We hit 3 endpoints:
 *  1) quote    v7/finance/quote?symbols=SYM   -> price, change %
 *  2) chart    v8/finance/chart/SYM?range=1d&interval=1m -> sparkline
 *  3) summary  v10/finance/quoteSummary/SYM?modules=assetProfile,summaryProfile -> description
 *
 * RN isn't a browser, so CORS doesn't block these. Some tickers may lack fields—handle nulls.
 */

async function fetchYahooRealtime(ticker: string) {
  try {
    console.log('fetchYahooRealtime ->', ticker, `${API_BASE}/api/yahoo`);
    const r = await fetch(
      `${API_BASE.replace(/\/$/, '')}/api/yahoo?symbol=${encodeURIComponent(ticker)}`
    );
    if (!r.ok) throw new Error(`Yahoo fetch failed ${r.status}`);
    const j = await r.json();
    console.log('yahoo ok ->', ticker, {
      price: j?.price, changePct: j?.changePct,
      sparkLen: Array.isArray(j?.spark) ? j.spark.length : 0,
      hasDesc: !!j?.yahooDesc,
    });
    return {
      price: typeof j.price === 'number' ? j.price : null,
      changePct: typeof j.changePct === 'number' ? j.changePct : null,
      spark: Array.isArray(j.spark) ? j.spark : [],
      yahooDesc: j.yahooDesc || undefined,
      lastUpdated: Date.now(),
    };
  } catch (e) {
    console.warn('yahoo error ->', ticker, e);
    return {
      price: null,
      changePct: null,
      spark: [],
      yahooDesc: undefined,
      lastUpdated: Date.now(),
      _err: String(e), // Debug: capture error message
    };
  }
}

async function fetchAIInsight(
  symbol: string,
  name: string,
  snapshot: { price: number | null; changePct: number | null }
): Promise<AIInsight | null> {
  try {
    console.log('fetchAI ->', symbol, `${API_BASE}/api/rationale`);
    const res = await fetch(`${API_BASE.replace(/\/$/, '')}/api/rationale`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol, name, price: snapshot.price, changePct: snapshot.changePct }),
    });
    if (!res.ok) throw new Error(`AI ${res.status}`);
    const data = (await res.json()) as AIInsight;
    console.log('ai ok ->', symbol, {
      buyP: data.buyProbability, sellP: data.sellProbability
    });
    return data;
  } catch (e) {
    console.warn('AI insight failed', e);
    return null;
  }
}


/** Build a simple sparkline path from values. */
function buildSparkPath(values: number[], width: number, height: number): string {
  if (!values || values.length < 2) return '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const dx = width / (values.length - 1 || 1);
  const scaleY = (v: number) =>
    height - (max === min ? height / 2 : ((v - min) / (max - min)) * height);

  let d = `M 0 ${scaleY(values[0]).toFixed(2)}`;
  for (let i = 1; i < values.length; i++) {
    d += ` L ${Number(i * dx).toFixed(2)} ${scaleY(values[i]).toFixed(2)}`;
  }
  return d;
}

const App = (): React.JSX.Element => {
  const [cards, setCards] = useState<StockCard[]>(() => generateStockBatch());
  const [index, setIndex] = useState(0);
  const [buys, setBuys] = useState(0);

  // caches
  const [rt, setRt] = useState<Record<string, Realtime>>({});
  const [ai, setAi] = useState<Record<string, AIInsight>>({});

  // Animated state for the top card
  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const enter = useRef(new Animated.Value(0)).current;

  const topCard = cards[index] ?? null;
  const next1 = cards[index + 1];
  const next2 = cards[index + 2];

  // Entrance animation
  useEffect(() => {
    enter.setValue(0);
    Animated.spring(enter, { toValue: 1, friction: 8, useNativeDriver: true }).start();
  }, [index]);

  // Prefetch realtime + AI for the visible stack (top / next1 / next2)
  useEffect(() => {
    const want = [topCard, next1, next2].filter(Boolean) as StockCard[];
    want.forEach(async (c) => {
      // realtime (refresh if stale > 30s or missing)
      const stale =
        !rt[c.ticker] || Date.now() - (rt[c.ticker]?.lastUpdated || 0) > 30_000;
      if (stale) {
        const data = await fetchYahooRealtime(c.ticker);
        setRt((m) => ({ ...m, [c.ticker]: data }));
      }
      // AI insight (once)
      if (!ai[c.ticker]) {
        const snap = rt[c.ticker] || { price: null, changePct: null, spark: [], lastUpdated: 0 };
        const insight = await fetchAIInsight(c.ticker, c.name, snap);
        if (insight) setAi((m) => ({ ...m, [c.ticker]: insight }));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, topCard?.ticker]);

  const goNext = React.useCallback(() => {
    pan.setValue({ x: 0, y: 0 });
    if (index >= cards.length - 1) {
      setCards(generateStockBatch());
      setIndex(0);
    } else {
      setIndex((i) => i + 1);
    }
  }, [index, cards.length, pan]);

  const buy = React.useCallback(() => {
    setBuys((c) => c + 1);
  }, []);

  const responder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_e, g) =>
          Math.abs(g.dx) > 3 || Math.abs(g.dy) > 3,
        onPanResponderGrant: () => {
          pan.setOffset({ x: (pan as any).x._value, y: (pan as any).y._value });
          pan.setValue({ x: 0, y: 0 });
        },
        onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], {
          useNativeDriver: false,
        }),
        onPanResponderRelease: (_e, { dx, vx, vy }) => {
          pan.flattenOffset();
          const shouldSwipe = Math.abs(dx) > SWIPE_THRESHOLD;
          if (!shouldSwipe) {
            Animated.spring(pan, {
              toValue: { x: 0, y: 0 },
              friction: 5,
              useNativeDriver: true,
            }).start();
            return;
          }

          const dir = dx > 0 ? 1 : -1;
          if (dir > 0) buy(); // right = buy

          Animated.timing(pan, {
            toValue: { x: dir * 500, y: vy * 100 },
            duration: 180,
            useNativeDriver: true,
          }).start(() => {
            goNext();
          });
        },
      }),
    [pan, buy, goNext]
  );

  const rotate = pan.x.interpolate({
    inputRange: [-200, 0, 200],
    outputRange: ['-16deg', '0deg', '16deg'],
  });

  const animatedTopStyle = {
    transform: [
      { translateX: pan.x },
      { translateY: pan.y },
      { rotate },
      {
        scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }),
      },
    ],
  };

  const renderCardBody = (card: StockCard) => {
    const live = rt[card.ticker];
    const insight = ai[card.ticker];

    const price =
      typeof live?.price === 'number' ? live.price.toFixed(2) : '--';
    const changePct =
      typeof live?.changePct === 'number'
        ? `${live.changePct >= 0 ? '+' : ''}${live.changePct.toFixed(2)}%`
        : '--';
    const changeColor =
      typeof live?.changePct === 'number'
        ? live.changePct >= 0
          ? '#34c759'
          : '#ff453a'
        : '#9aa6bf';
      
      {(live as any)?._err ? (
        <Text style={{ color: '#ff8b84', marginTop: 6, fontSize: 12 }}>
          数据加载失败：{(live as any)._err}
        </Text>
      ) : null}
      
    const path = live?.spark?.length ? buildSparkPath(live.spark, w - 48 - 24, 48) : '';

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View>
            <Text style={styles.ticker}>{card.ticker}</Text>
            <Text style={styles.name}>{card.name}</Text>
          </View>
          <View style={styles.tag}>
            <Text style={styles.tagText}>实时 · Yahoo Finance</Text>
          </View>
        </View>

        <View style={styles.priceBlock}>
          <Text style={styles.price}>${price}</Text>
          <View
            style={[
              styles.changeBadge,
              {
                backgroundColor:
                  typeof live?.changePct === 'number'
                    ? live.changePct >= 0
                      ? 'rgba(52,199,89,0.15)'
                      : 'rgba(255,69,58,0.15)'
                    : '#1a2333',
              },
            ]}
          >
            <Text style={[styles.changeText, { color: changeColor }]}>{changePct}</Text>
          </View>
        </View>

        {/* Sparkline */}
        <View style={{ height: 56, marginTop: 12 }}>
          {path ? (
            <Svg width="100%" height="100%" viewBox={`0 0 ${w - 48 - 24} 48`}>
              <Path d={path} stroke="#6ee7b7" strokeWidth={2} fill="none" />
            </Svg>
          ) : (
            <View style={{ height: 48, justifyContent: 'center' }}>
              <Text style={{ color: '#6c80a1' }}>加载走势…</Text>
            </View>
          )}
        </View>

        <View style={styles.divider} />

        {/* Yahoo Description (attribution) */}
        <View>
          <Text style={styles.metaLabel}>公司简介（Yahoo）</Text>
          {live?.yahooDesc ? (
            <Text style={[styles.metaValue, { marginTop: 6, color: '#c9d3ea' }]}>
              {live.yahooDesc}
            </Text>
          ) : (
            <Text style={[styles.metaValue, { marginTop: 6, color: '#6c80a1' }]}>
              正在获取简介…
            </Text>
          )}
          <Text style={{ color: '#6c80a1', marginTop: 6, fontSize: 11 }}>
            来源：Yahoo Finance
          </Text>
        </View>

        <View style={styles.divider} />

        {/* AI Insight */}
        <Text style={styles.metaLabel}>AI 观点（实验性）</Text>
        {!insight ? (
          <View style={{ marginTop: 10 }}>
            <ActivityIndicator />
            <Text style={{ color: '#6c80a1', marginTop: 8, fontSize: 12 }}>
              生成中…
            </Text>
          </View>
        ) : (
          <ScrollView
            style={{
              maxHeight: 160,
              marginTop: 8,
              paddingRight: 8,
            }}
          >
            <Text style={[styles.metaValue, { color: '#c9d3ea' }]}>
              {insight.companyDescription}
            </Text>
            <View style={{ height: 10 }} />
            <Text style={[styles.metaLabel, { color: '#7bdca6' }]}>
              买入理由（A={insight.buyProbability}%）
            </Text>
            <Text style={[styles.metaValue, { color: '#c9f2dd' }]}>{insight.buy}</Text>
            <View style={{ height: 8 }} />
            <Text style={[styles.metaLabel, { color: '#ff8b84' }]}>
              卖出理由（B={insight.sellProbability}%）
            </Text>
            <Text style={[styles.metaValue, { color: '#ffd1cf' }]}>{insight.sell}</Text>
            <View style={{ height: 6 }} />
            <Text style={{ color: '#6c80a1', fontSize: 11 }}>
              概率约束：A + B = 100%
            </Text>
          </ScrollView>
        )}

        <Text style={styles.footerNote}>虚拟练习，不构成投资建议。</Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <View style={styles.container}>
        <Text style={styles.title}>Stock Fantasy</Text>
        <Text style={styles.subtitle}>右滑=买 / 左滑=跳过</Text>

        <View style={styles.badge}>
          <Text style={styles.badgeLabel}>累计买入</Text>
          <Text style={styles.badgeValue}>{buys}</Text>
        </View>

        <View style={styles.deckContainer}>
          {/* Stack background cards */}
          {next2 && (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.stackCard,
                { transform: [{ translateY: 20 }, { translateX: 16 }, { scale: 0.94 }], opacity: 0.6 },
              ]}
            >
              {renderCardBody(next2)}
            </Animated.View>
          )}

          {next1 && (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.stackCard,
                { transform: [{ translateY: 10 }, { translateX: 8 }, { scale: 0.97 }], opacity: 0.8 },
              ]}
            >
              {renderCardBody(next1)}
            </Animated.View>
          )}

          {/* Top interactive card */}
          {topCard ? (
            <Animated.View 
              style={[styles.topCard, animatedTopStyle as any]} 
              {...responder.panHandlers}
            >
              {renderCardBody(topCard)}
            </Animated.View>
          ) : (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>加载新卡组...</Text>
            </View>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#05070d' },
  container: {
    flex: 1,
    backgroundColor: '#05070d',
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 32,
  },
  title: { fontSize: 28, fontWeight: '700', color: '#f2f4f8', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#8a909d', marginBottom: 20 },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: '#111927',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#1a2333',
  },
  badgeLabel: { color: '#7b8597', fontSize: 12, letterSpacing: 1, textTransform: 'uppercase' },
  badgeValue: { color: '#f2f4f8', fontSize: 20, fontWeight: '700', marginTop: 6 },
  deckContainer: { flex: 1, justifyContent: 'center' },

  card: {
    backgroundColor: '#111927',
    borderRadius: 24,
    padding: 24,
    width: '100%',
    minHeight: 420,
    borderWidth: 1,
    borderColor: '#1a2333',
  },
  topCard: { position: 'absolute', width: '100%' },
  stackCard: { position: 'absolute', width: '100%' },

  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  ticker: { fontSize: 42, fontWeight: '800', color: '#f2f4f8', letterSpacing: 1 },
  tag: { backgroundColor: '#1c2840', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  tagText: { color: '#6c80a1', fontSize: 12, fontWeight: '600', letterSpacing: 0.8 },
  name: { fontSize: 16, color: '#98a4bd', marginTop: 12 },
  priceBlock: { marginTop: 20 },
  price: { fontSize: 36, fontWeight: '700', color: '#f2f4f8' },
  changeBadge: { marginTop: 8, alignSelf: 'flex-start', borderRadius: 14, paddingVertical: 6, paddingHorizontal: 12 },
  changeText: { fontSize: 16, fontWeight: '600' },

  divider: { height: 1, backgroundColor: '#1f2d3f', marginVertical: 16 },
  metaLabel: { color: '#5c6a83', fontSize: 12, letterSpacing: 1, textTransform: 'uppercase' },
  metaValue: { color: '#f2f4f8', fontSize: 16, fontWeight: '500', marginTop: 4, lineHeight: 22 },

  footerNote: { marginTop: 12, fontSize: 12, color: '#4f5d74', letterSpacing: 0.4 },

  emptyCard: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#1a2333',
    backgroundColor: '#111927',
  },
  emptyText: { color: '#9aa6bf', fontSize: 16, fontWeight: '600' },
});

export default App;
