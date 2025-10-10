import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { SafeAreaView, StyleSheet, Text, View, ActivityIndicator } from 'react-native';
import SwipeCards from 'react-native-swipe-cards-deck';
import { StatusBar } from 'expo-status-bar';

// IMPORTANT: Replace with your computer's local IP address
const API_URL = 'http://192.168.1.10:8000/daily-stock-data';

// Updated type to match the backend response
type StockCard = {
  id: string;
  ticker: string;
  name: string;
  price: number;
  changePct: number;
  buy_sell_score: number;
  reason: string;
};

const App = (): React.JSX.Element => {
  const [cards, setCards] = useState<StockCard[]>([]);
  const [buys, setBuys] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStockData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(API_URL);
      if (!response.ok) {
        throw new Error('Failed to fetch data from the server.');
      }
      const data: StockCard[] = await response.json();
      setCards(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStockData();
  }, [fetchStockData]);

  const handleBuy = useCallback(() => {
    setBuys((current) => current + 1);
    return true;
  }, []);

  const handleSkip = useCallback(() => true, []);

  // When the deck is empty, refetch a new batch
  const handleCardRemoved = useCallback(
    (index: number) => {
      if (index >= cards.length - 1) {
        fetchStockData();
      }
    },
    [cards.length, fetchStockData]
  );

  const renderCard = useCallback((card: StockCard) => <StockCardView card={card} />, []);

  const renderNoMoreCards = useCallback(() => {
    if (loading) {
      return (
        <View style={styles.emptyCard}>
          <ActivityIndicator size="large" color="#9aa6bf" />
          <Text style={styles.emptyText}>Loading New Stocks...</Text>
        </View>
      );
    }
    if (error) {
      return (
        <View style={styles.emptyCard}>
          <Text style={styles.errorText}>Error: {error}</Text>
        </View>
      );
    }
    return <NoMoreCards />;
  }, [loading, error]);
  
  const actions = useMemo(
    () => ({
      yup: { show: true, text: '买入', color: '#34c759', onAction: handleBuy },
      nope: { show: true, text: '跳过', color: '#ff453a', onAction: handleSkip },
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
          {loading && cards.length === 0 ? (
             <ActivityIndicator size="large" color="#f2f4f8" />
          ) : (
            <SwipeCards
              cards={cards}
              renderCard={renderCard}
              renderNoMoreCards={renderNoMoreCards}
              keyExtractor={(card: StockCard) => card.id}
              actions={actions}
              stack
              stackDepth={3}
              stackOffsetX={16}
              stackOffsetY={10}
              cardRemoved={handleCardRemoved}
              smoothTransition
            />
          )}
        </View>
      </View>
    </SafeAreaView>
  );
};

// StockCardView and NoMoreCards components remain the same as your original file...
// ...
// Make sure to include the unchanged StockCardView, NoMoreCards, and styles from your file.

interface StockCardViewProps {
  card: StockCard;
}

const StockCardView = ({ card }: StockCardViewProps): React.JSX.Element => {
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
          <Text style={styles.tagText}>LLM Score: {card.buy_sell_score}</Text>
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

      <View>
          <Text style={styles.metaLabel}>LLM Analysis</Text>
          <Text style={styles.reasonText}>{card.reason}</Text>
      </View>

      <Text style={styles.footerNote}>Data from LLM and Yahoo Finance.</Text>
    </View>
  );
};

const NoMoreCards = (): React.JSX.Element => (
  <View style={styles.emptyCard}>
    <Text style={styles.emptyText}>Loading New Stocks...</Text>
  </View>
);

const styles = StyleSheet.create({
  // ... (Your existing styles, with these additions/modifications)
  safeArea: { flex: 1, backgroundColor: '#05070d' },
  container: { flex: 1, backgroundColor: '#05070d', paddingHorizontal: 24, paddingTop: 20, paddingBottom: 32, },
  title: { fontSize: 28, fontWeight: '700', color: '#f2f4f8', marginBottom: 4, },
  subtitle: { fontSize: 14, color: '#8a909d', marginBottom: 20, },
  badge: { alignSelf: 'flex-start', backgroundColor: '#111927', borderRadius: 16, paddingVertical: 12, paddingHorizontal: 16, marginBottom: 24, borderWidth: 1, borderColor: '#1a2333', },
  badgeLabel: { color: '#7b8597', fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', },
  badgeValue: { color: '#f2f4f8', fontSize: 20, fontWeight: '700', marginTop: 6, },
  deckContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  card: { backgroundColor: '#111927', borderRadius: 24, padding: 24, width: '100%', borderWidth: 1, borderColor: '#1a2333', },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', },
  ticker: { fontSize: 42, fontWeight: '800', color: '#f2f4f8', letterSpacing: 1, },
  tag: { backgroundColor: '#1c2840', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, },
  tagText: { color: '#6c80a1', fontSize: 12, fontWeight: '600', letterSpacing: 0.8, },
  name: { fontSize: 16, color: '#98a4bd', marginTop: 12, },
  priceBlock: { marginTop: 32, },
  price: { fontSize: 36, fontWeight: '700', color: '#f2f4f8', },
  changeBadge: { marginTop: 12, alignSelf: 'flex-start', borderRadius: 14, paddingVertical: 6, paddingHorizontal: 12, },
  changeText: { fontSize: 16, fontWeight: '600', },
  divider: { height: 1, backgroundColor: '#1f2d3f', marginVertical: 24, },
  metaLabel: { color: '#5c6a83', fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 },
  reasonText: { color: '#f2f4f8', fontSize: 15, lineHeight: 22 },
  footerNote: { marginTop: 28, fontSize: 12, color: '#4f5d74', letterSpacing: 0.4, },
  emptyCard: { alignItems: 'center', justifyContent: 'center', padding: 24, borderRadius: 24, borderWidth: 1, borderColor: '#1a2333', backgroundColor: '#111927', },
  emptyText: { color: '#9aa6bf', fontSize: 16, fontWeight: '600', marginTop: 12 },
  errorText: { color: '#ff453a', fontSize: 16, fontWeight: '600' }
});


export default App;