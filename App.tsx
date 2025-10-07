import React, { useCallback, useMemo, useState } from 'react';
import { SafeAreaView, StyleSheet, Text, View } from 'react-native';
import SwipeCards from 'react-native-swipe-cards-deck';
import { StatusBar } from 'expo-status-bar';

type StockCard = {
  id: string;
  ticker: string;
  name: string;
  price: number;
  changePct: number;
};

type StockDescriptor = {
  ticker: string;
  name: string;
};

const BATCH_SIZE = 12;

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

const randomInRange = (min: number, max: number): number =>
  Math.random() * (max - min) + min;

const createStockCard = (descriptor: StockDescriptor): StockCard => ({
  id: `${descriptor.ticker}-${Math.random().toString(16).slice(2, 8)}-${Date.now()}`,
  ticker: descriptor.ticker,
  name: descriptor.name,
  price: Number(randomInRange(25, 500).toFixed(2)),
  changePct: Number(randomInRange(-6, 6).toFixed(2)),
});

const shuffle = <T,>(items: readonly T[]): T[] => {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

// Create a fresh set of random stock cards to feed the deck.
const generateStockBatch = (size = BATCH_SIZE): StockCard[] => {
  const pool = shuffle(STOCK_UNIVERSE);
  const batch: StockCard[] = [];
  for (let i = 0; i < size; i += 1) {
    const descriptor = pool[i % pool.length];
    batch.push(createStockCard(descriptor));
  }
  return batch;
};

const App = (): JSX.Element => {
  const [cards, setCards] = useState<StockCard[]>(() => generateStockBatch());
  const [buys, setBuys] = useState(0);

  const handleBuy = useCallback((card: StockCard) => {
    if (card) {
      setBuys((current) => current + 1);
    }
    return true;
  }, []);

  const handleSkip = useCallback(() => true, []);

  const handleCardRemoved = useCallback(
    (index: number) => {
      if (index >= cards.length - 1) {
        setCards(generateStockBatch());
      }
    },
    [cards.length]
  );

  const renderCard = useCallback(
    (card: StockCard) => <StockCardView card={card} />,
    []
  );

  const renderNoMoreCards = useCallback(() => <NoMoreCards />, []);

  const actions = useMemo(
    () => ({
      yup: { show: true, text: '买入', color: '#34c759', onAction: handleBuy },
      nope: { show: true, text: '跳过', color: '#ff453a', onAction: handleSkip },
      maybe: { show: false },
    }),
    [handleBuy, handleSkip]
  );

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
          <SwipeCards
            cards={cards}
            renderCard={renderCard}
            renderNoMoreCards={renderNoMoreCards}
            keyExtractor={(card: StockCard) => card.id}
            actions={actions}
            hasMaybeAction={false}
            stack
            stackDepth={3}
            stackOffsetX={16}
            stackOffsetY={10}
            cardRemoved={handleCardRemoved}
            smoothTransition
            swipeThreshold={110}
          />
        </View>
      </View>
    </SafeAreaView>
  );
};

interface StockCardViewProps {
  card: StockCard;
}

const StockCardView = ({ card }: StockCardViewProps): JSX.Element => {
  const changePositive = card.changePct >= 0;
  const changeColor = changePositive ? '#34c759' : '#ff453a';
  const changeLabel = `${changePositive ? '+' : ''}${card.changePct.toFixed(2)}%`;

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View>
          <Text style={styles.ticker}>{card.ticker}</Text>
          <Text style={styles.name}>{card.name}</Text>
        </View>
        <View style={styles.tag}>
          <Text style={styles.tagText}>模拟行情</Text>
        </View>
      </View>

      <View style={styles.priceBlock}>
        <Text style={styles.price}>${card.price.toFixed(2)}</Text>
        <View
          style={[
            styles.changeBadge,
            { backgroundColor: changePositive ? 'rgba(52,199,89,0.15)' : 'rgba(255,69,58,0.15)' },
          ]}
        >
          <Text style={[styles.changeText, { color: changeColor }]}>{changeLabel}</Text>
        </View>
      </View>

      <View style={styles.divider} />

      <View style={styles.metaRow}>
        <View style={styles.metaColumn}>
          <Text style={styles.metaLabel}>现价</Text>
          <Text style={styles.metaValue}>${card.price.toFixed(2)}</Text>
        </View>
        <View style={[styles.metaColumn, styles.metaColumnRight]}>
          <Text style={styles.metaLabel}>涨跌幅</Text>
          <Text style={[styles.metaValue, { color: changeColor }]}>{changeLabel}</Text>
        </View>
      </View>

      <Text style={styles.footerNote}>虚拟数据，仅供练习和娱乐使用。</Text>
    </View>
  );
};

const NoMoreCards = (): JSX.Element => (
  <View style={styles.emptyCard}>
    <Text style={styles.emptyText}>加载新卡组...</Text>
  </View>
);

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#05070d',
  },
  container: {
    flex: 1,
    backgroundColor: '#05070d',
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#f2f4f8',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#8a909d',
    marginBottom: 20,
  },
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
  badgeLabel: {
    color: '#7b8597',
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  badgeValue: {
    color: '#f2f4f8',
    fontSize: 20,
    fontWeight: '700',
    marginTop: 6,
  },
  deckContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  card: {
    backgroundColor: '#111927',
    borderRadius: 24,
    padding: 24,
    width: '100%',
    minHeight: 360,
    borderWidth: 1,
    borderColor: '#1a2333',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  ticker: {
    fontSize: 42,
    fontWeight: '800',
    color: '#f2f4f8',
    letterSpacing: 1,
  },
  tag: {
    backgroundColor: '#1c2840',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  tagText: {
    color: '#6c80a1',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.8,
  },
  name: {
    fontSize: 16,
    color: '#98a4bd',
    marginTop: 12,
  },
  priceBlock: {
    marginTop: 32,
  },
  price: {
    fontSize: 36,
    fontWeight: '700',
    color: '#f2f4f8',
  },
  changeBadge: {
    marginTop: 12,
    alignSelf: 'flex-start',
    borderRadius: 14,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  changeText: {
    fontSize: 16,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: '#1f2d3f',
    marginVertical: 24,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metaColumn: {
    flex: 1,
  },
  metaColumnRight: {
    marginLeft: 16,
  },
  metaLabel: {
    color: '#5c6a83',
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  metaValue: {
    color: '#f2f4f8',
    fontSize: 18,
    fontWeight: '600',
    marginTop: 6,
  },
  footerNote: {
    marginTop: 28,
    fontSize: 12,
    color: '#4f5d74',
    letterSpacing: 0.4,
  },
  emptyCard: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#1a2333',
    backgroundColor: '#111927',
  },
  emptyText: {
    color: '#9aa6bf',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default App;
