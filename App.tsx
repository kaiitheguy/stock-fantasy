// App.tsx
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
  Modal,
  TouchableOpacity,
  Easing,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import Svg, { Path } from 'react-native-svg';

import {
  API_BASE,
  AIInsightService,
  SparklineBuilder,
  StockDeckService,
  STOCK_UNIVERSE,
  YahooFinanceService,
  type AIInsight,
  type BuyTransaction,
  type Realtime,
  type StockCard,
} from './services/StockDomain';

const SWIPE_THRESHOLD = 110;
console.log('API_BASE =', API_BASE);

const deckService = new StockDeckService(STOCK_UNIVERSE);
const yahooFinanceService = new YahooFinanceService(API_BASE);
const aiInsightService = new AIInsightService(API_BASE);
const sparklineBuilder = new SparklineBuilder();

const w = Dimensions.get('window').width;

const App = (): React.JSX.Element => {
  const [cards, setCards] = useState<StockCard[]>(() => deckService.generateBatch());
  const [index, setIndex] = useState(0);
  const [buys, setBuys] = useState(0);
  const [buyHistory, setBuyHistory] = useState<BuyTransaction[]>([]);
  const [isPreloading, setIsPreloading] = useState(false);

  // caches
  const [rt, setRt] = useState<Record<string, Realtime>>({});
  const [ai, setAi] = useState<Record<string, AIInsight>>({});
  const [aiLoading, setAiLoading] = useState<Record<string, boolean>>({});
  const [aiError, setAiError] = useState<Record<string, boolean>>({});
  
  // Company description modal state
  const [modalVisible, setModalVisible] = useState(false);
  const [modalContent, setModalContent] = useState<{ticker: string, name: string, description: string} | null>(null);
  
  // AI analysis modal state
  const [aiModalVisible, setAiModalVisible] = useState(false);
  const [aiModalContent, setAiModalContent] = useState<{ticker: string, name: string, insight: AIInsight} | null>(null);
  
  // Buy history modal state
  const [buyModalVisible, setBuyModalVisible] = useState(false);

  // Animated state for the top card
  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const enter = useRef(new Animated.Value(0)).current;

  const topCard = cards[index] ?? null;
  const next1 = cards[index + 1];
  const next2 = cards[index + 2];

  // Entrance animation
  useEffect(() => {
    enter.setValue(0);
    Animated.spring(enter, { 
      toValue: 1, 
      friction: 10, 
      tension: 100,
      useNativeDriver: true 
    }).start();
  }, [index]);

  // Prefetch realtime for the visible stack + next 2 cards for smooth scrolling
  useEffect(() => {
    const visibleCards = [topCard, next1, next2].filter(Boolean) as StockCard[];
    const nextCards = cards.slice(index + 3, index + 5).filter(Boolean) as StockCard[];
    // Priority loading: visible cards first, then next cards
    const loadCardData = async (card: StockCard, priority: 'high' | 'low') => {
      const stale =
        !rt[card.ticker] || Date.now() - (rt[card.ticker]?.lastUpdated || 0) > 30_000;
      
      if (stale) {
        // Add small delay for low priority cards to not block UI
        if (priority === 'low') {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        const data = await yahooFinanceService.fetchRealtime(card.ticker);
        setRt((m) => ({ ...m, [card.ticker]: data }));
      }
    };
    
    // Load visible cards immediately (high priority)
    visibleCards.forEach(card => loadCardData(card, 'high'));
    
    // Load next cards with delay (low priority)
    nextCards.forEach(card => loadCardData(card, 'low'));
    
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, topCard?.ticker]);

  const goNext = React.useCallback(() => {
    // Reset pan values immediately for smoother transition
    pan.setValue({ x: 0, y: 0 });
    pan.setOffset({ x: 0, y: 0 });
    
    if (index >= cards.length - 1) {
      setIsPreloading(true);
      // Generate new batch in background
      setTimeout(() => {
        setCards(deckService.generateBatch());
        setIndex(0);
        setIsPreloading(false);
      }, 50); // Small delay to ensure smooth transition
    } else {
      setIndex((i) => i + 1);
      
      // Preload next batch when approaching end
      if (index >= cards.length - 3 && !isPreloading) {
        setIsPreloading(true);
        setTimeout(() => {
          const newBatch = deckService.generateBatch();
          setCards(prev => [...prev, ...newBatch]);
          setIsPreloading(false);
        }, 100);
      }
    }
  }, [index, cards.length, pan, isPreloading]);

  const buy = React.useCallback(() => {
    setBuys((c) => c + 1);
    
    // Record buy transaction
    if (topCard) {
      const live = rt[topCard.ticker];
      const price = live?.price || 0;
      
      const transaction: BuyTransaction = {
        id: `${topCard.ticker}-${Date.now()}`,
        ticker: topCard.ticker,
        name: topCard.name,
        price: price,
        timestamp: Date.now(),
      };
      
      setBuyHistory(prev => [...prev, transaction]);
    }
  }, [topCard, rt]);

  const showDescriptionModal = React.useCallback((ticker: string, name: string, description: string) => {
    setModalContent({ ticker, name, description });
    setModalVisible(true);
  }, []);

  const hideDescriptionModal = React.useCallback(() => {
    setModalVisible(false);
    setModalContent(null);
  }, []);

  const showAIModal = React.useCallback((ticker: string, name: string) => {
    const insight = ai[ticker];
    if (insight) {
      setAiModalContent({ ticker, name, insight });
      setAiModalVisible(true);
    }
  }, [ai]);

  const hideAIModal = React.useCallback(() => {
    setAiModalVisible(false);
    setAiModalContent(null);
  }, []);

  const showBuyModal = React.useCallback(() => {
    setBuyModalVisible(true);
  }, []);

  const hideBuyModal = React.useCallback(() => {
    setBuyModalVisible(false);
  }, []);

  const fetchAIInsightForTicker = React.useCallback(async (ticker: string, name: string) => {
    if (aiLoading[ticker] || ai[ticker]) return; // Already loading or loaded
    
    setAiLoading(prev => ({ ...prev, [ticker]: true }));
    setAiError(prev => ({ ...prev, [ticker]: false })); // Clear previous error
    
    const live = rt[ticker];
    const snapshot = { 
      price: live?.price || null, 
      changePct: live?.changePct || null 
    };
    
    try {
      const insight = await aiInsightService.fetchInsight(ticker, name, snapshot);
      if (insight) {
        setAi(prev => ({ ...prev, [ticker]: insight }));
        setAiError(prev => ({ ...prev, [ticker]: false }));
        // Auto-show modal after successful fetch
        setAiModalContent({ ticker, name, insight });
        setAiModalVisible(true);
      } else {
        setAiError(prev => ({ ...prev, [ticker]: true }));
      }
    } catch (error) {
      console.error('AI insight fetch error:', error);
      setAiError(prev => ({ ...prev, [ticker]: true }));
    }
    
    setAiLoading(prev => ({ ...prev, [ticker]: false }));
  }, [aiLoading, ai, rt]);

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_e, g) =>
          Math.abs(g.dx) > 2 || Math.abs(g.dy) > 2,
        onPanResponderGrant: () => {
          pan.setOffset({ x: (pan as any).x._value, y: (pan as any).y._value });
          pan.setValue({ x: 0, y: 0 });
        },
        onPanResponderMove: (evt, gestureState) => {
          pan.x.setValue(gestureState.dx);
          pan.y.setValue(gestureState.dy);
        },
        onPanResponderRelease: (_e, { dx, vx, vy }) => {
          pan.flattenOffset();
          
          // Enhanced swipe detection with velocity
          const velocityThreshold = 0.5;
          const distanceThreshold = SWIPE_THRESHOLD;
          const shouldSwipe = Math.abs(dx) > distanceThreshold || Math.abs(vx) > velocityThreshold;
          
          if (!shouldSwipe) {
            Animated.spring(pan, {
              toValue: { x: 0, y: 0 },
              friction: 8,
              tension: 100,
              useNativeDriver: true,
            }).start();
            return;
          }

          const dir = dx > 0 ? 1 : -1;
          if (dir > 0) buy(); // right = buy

          Animated.timing(pan, {
            toValue: { x: dir * 500, y: vy * 100 },
            duration: 200,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }).start(() => {
            goNext();
          });
        },
      }),
    [pan, buy, goNext]
  );

  const rotate = pan.x.interpolate({
    inputRange: [-300, -100, 0, 100, 300],
    outputRange: ['-20deg', '-8deg', '0deg', '8deg', '20deg'],
    extrapolate: 'clamp',
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
    const isLoading = aiLoading[card.ticker];
    const hasError = aiError[card.ticker];

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
    const debugError = live?.debugError;

    const path = live?.spark?.length ? sparklineBuilder.buildPath(live.spark, w - 48 - 24, 48) : '';

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
          {debugError ? (
            <Text style={{ color: '#ff8b84', marginTop: 6, fontSize: 12 }}>
              数据加载失败：{debugError}
            </Text>
          ) : null}
          <Text style={styles.metaLabel}>公司简介（Yahoo）</Text>
          {live?.yahooDesc ? (
            <View>
              <Text style={[styles.metaValue, { marginTop: 6, color: '#c9d3ea' }]}>
                {live.yahooDesc.length > 150 
                  ? live.yahooDesc.substring(0, 150) + '...'
                  : live.yahooDesc
                }
              </Text>
              {live.yahooDesc.length > 150 && (
                <TouchableOpacity 
                  onPress={() => showDescriptionModal(card.ticker, card.name, live.yahooDesc!)}
                  style={{ marginTop: 8 }}
                >
                  <Text 
                    style={{ 
                      color: '#7bdca6', 
                      fontSize: 14, 
                      fontWeight: '600',
                      textDecorationLine: 'underline'
                    }}
                  >
                    查看完整简介
                  </Text>
                </TouchableOpacity>
              )}
            </View>
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
        {!insight && !isLoading && !hasError ? (
          <TouchableOpacity 
            onPress={() => fetchAIInsightForTicker(card.ticker, card.name)}
            style={styles.aiButton}
          >
            <Text style={styles.aiButtonText}>获取 AI 分析</Text>
          </TouchableOpacity>
        ) : isLoading ? (
          <View style={{ marginTop: 10 }}>
            <ActivityIndicator />
            <Text style={{ color: '#6c80a1', marginTop: 8, fontSize: 12 }}>
              AI 分析生成中…
            </Text>
          </View>
        ) : hasError ? (
          <TouchableOpacity 
            onPress={() => fetchAIInsightForTicker(card.ticker, card.name)}
            style={[styles.aiButton, styles.aiButtonError]}
          >
            <Text style={[styles.aiButtonText, styles.aiButtonTextError]}>获取失败，点击重试</Text>
          </TouchableOpacity>
        ) : insight ? (
          <TouchableOpacity 
            onPress={() => showAIModal(card.ticker, card.name)}
            style={[styles.aiButton, styles.aiButtonSuccess]}
          >
            <Text style={[styles.aiButtonText, styles.aiButtonTextSuccess]}>查看 AI 分析</Text>
          </TouchableOpacity>
        ) : null}

        <Text style={styles.footerNote}>虚拟练习，不构成投资建议。</Text>
        
        {/* Preloading indicator */}
        {isPreloading && (
          <View style={styles.preloadIndicator}>
            <ActivityIndicator size="small" color="#7bdca6" />
            <Text style={styles.preloadText}>预加载中...</Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Stock Fantasy</Text>
          <TouchableOpacity onPress={showBuyModal} style={styles.buyIconButton}>
            <Text style={styles.buyIcon}>📈</Text>
            {buys > 0 && <Text style={styles.buyCount}>{buys}</Text>}
          </TouchableOpacity>
        </View>
        <Text style={styles.subtitle}>右滑=买 / 左滑=跳过</Text>

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

      {/* Company Description Modal */}
      <Modal
        visible={modalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={hideDescriptionModal}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity 
            style={styles.modalOverlayTouchable}
            activeOpacity={1}
            onPress={hideDescriptionModal}
          />
          <View style={styles.modalContainer}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>
                  {modalContent?.ticker} - {modalContent?.name}
                </Text>
                <TouchableOpacity onPress={hideDescriptionModal} style={styles.closeButton}>
                  <Text style={styles.closeButtonText}>✕</Text>
                </TouchableOpacity>
              </View>
              <ScrollView 
                style={styles.modalBody}
                showsVerticalScrollIndicator={true}
                bounces={true}
                scrollEventThrottle={16}
                nestedScrollEnabled={true}
              >
                <Text style={styles.modalDescription}>
                  {modalContent?.description}
                </Text>
              </ScrollView>
              <View style={styles.modalFooter}>
                <Text style={styles.modalSource}>来源：Yahoo Finance</Text>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* AI Analysis Modal */}
      <Modal
        visible={aiModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={hideAIModal}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity 
            style={styles.modalOverlayTouchable}
            activeOpacity={1}
            onPress={hideAIModal}
          />
          <View style={styles.modalContainer}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>
                  {aiModalContent?.ticker} - {aiModalContent?.name}
                </Text>
                <TouchableOpacity onPress={hideAIModal} style={styles.closeButton}>
                  <Text style={styles.closeButtonText}>✕</Text>
                </TouchableOpacity>
              </View>
              <ScrollView 
                style={styles.modalBody}
                showsVerticalScrollIndicator={true}
                bounces={true}
                scrollEventThrottle={16}
                nestedScrollEnabled={true}
              >
                <Text style={styles.aiModalSectionTitle}>AI 分析报告</Text>
                <Text style={styles.modalDescription}>
                  {aiModalContent?.insight.companyDescription}
                </Text>
                
                <View style={styles.aiModalSection}>
                  <Text style={[styles.aiModalLabel, { color: '#7bdca6' }]}>
                    买入理由（概率: {aiModalContent?.insight.buyProbability}%）
                  </Text>
                  <Text style={[styles.aiModalValue, { color: '#c9f2dd' }]}>
                    {aiModalContent?.insight.buy}
                  </Text>
                </View>
                
                <View style={styles.aiModalSection}>
                  <Text style={[styles.aiModalLabel, { color: '#ff8b84' }]}>
                    卖出理由（概率: {aiModalContent?.insight.sellProbability}%）
                  </Text>
                  <Text style={[styles.aiModalValue, { color: '#ffd1cf' }]}>
                    {aiModalContent?.insight.sell}
                  </Text>
                </View>
                
                <View style={styles.aiModalFooter}>
                  <Text style={styles.aiModalNote}>
                    概率约束：买入 + 卖出 = 100%
                  </Text>
                  <Text style={styles.aiModalNote}>
                    本分析仅供参考，不构成投资建议
                  </Text>
                </View>
              </ScrollView>
            </View>
          </View>
        </View>
      </Modal>

      {/* Buy History Modal */}
      <Modal
        visible={buyModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={hideBuyModal}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity 
            style={styles.modalOverlayTouchable}
            activeOpacity={1}
            onPress={hideBuyModal}
          />
          <View style={styles.modalContainer}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>买入历史</Text>
                <TouchableOpacity onPress={hideBuyModal} style={styles.closeButton}>
                  <Text style={styles.closeButtonText}>✕</Text>
                </TouchableOpacity>
              </View>
              <ScrollView 
                style={styles.modalBody}
                showsVerticalScrollIndicator={true}
                bounces={true}
                scrollEventThrottle={16}
                nestedScrollEnabled={true}
              >
                <View style={styles.buySummary}>
                  <View style={styles.buySummaryItem}>
                    <Text style={styles.buySummaryLabel}>累计买入</Text>
                    <Text style={styles.buySummaryValue}>{buys} 笔</Text>
                  </View>
                  <View style={styles.buySummaryItem}>
                    <Text style={styles.buySummaryLabel}>总价值</Text>
                    <Text style={styles.buySummaryValue}>
                      ${buyHistory.reduce((sum, t) => sum + t.price, 0).toFixed(2)}
                    </Text>
                  </View>
                </View>
                
                {buyHistory.length > 0 ? (
                  <View style={styles.buyHistoryList}>
                    <Text style={styles.buyHistoryTitle}>买入记录</Text>
                    {buyHistory.map((transaction, index) => (
                      <View key={transaction.id} style={styles.buyHistoryItem}>
                        <View style={styles.buyHistoryLeft}>
                          <Text style={styles.buyHistoryTicker}>{transaction.ticker}</Text>
                          <Text style={styles.buyHistoryName}>{transaction.name}</Text>
                        </View>
                        <View style={styles.buyHistoryRight}>
                          <Text style={styles.buyHistoryPrice}>${transaction.price.toFixed(2)}</Text>
                          <Text style={styles.buyHistoryTime}>
                            {new Date(transaction.timestamp).toLocaleString('zh-CN', {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>
                ) : (
                  <View style={styles.emptyBuyHistory}>
                    <Text style={styles.emptyBuyHistoryText}>暂无买入记录</Text>
                    <Text style={styles.emptyBuyHistorySubtext}>右滑股票卡片开始买入</Text>
                  </View>
                )}
              </ScrollView>
            </View>
          </View>
        </View>
      </Modal>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  title: { fontSize: 28, fontWeight: '700', color: '#f2f4f8' },
  subtitle: { fontSize: 14, color: '#8a909d', marginBottom: 20 },
  badge: {
    backgroundColor: '#111927',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
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

  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalOverlayTouchable: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  modalContainer: {
    width: '100%',
    maxWidth: w - 48, // Same width as card (w - 48)
    maxHeight: '80%',
  },
  modalContent: {
    backgroundColor: '#111927',
    borderRadius: 24, // Same border radius as card
    borderWidth: 1,
    borderColor: '#1a2333',
    overflow: 'hidden',
    minHeight: 420, // Same min height as card
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24, // Same padding as card
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#1f2d3f',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#f2f4f8',
    flex: 1,
    marginRight: 10,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1a2333',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    color: '#9aa6bf',
    fontSize: 16,
    fontWeight: '600',
  },
  modalBody: {
    flex: 1,
    paddingHorizontal: 24, // Same padding as card
    paddingVertical: 16,
    maxHeight: 250, // Set a specific max height for scrolling
  },
  modalDescription: {
    fontSize: 16,
    lineHeight: 24,
    color: '#c9d3ea',
    paddingBottom: 20,
  },
  modalFooter: {
    paddingHorizontal: 24, // Same padding as card
    paddingVertical: 20,
    borderTopWidth: 1,
    borderTopColor: '#1f2d3f',
  },
  modalSource: {
    color: '#6c80a1',
    fontSize: 10,
    textAlign: 'center',
  },

  // AI Button styles
  aiButton: {
    backgroundColor: '#1a2333',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#2a3441',
    alignItems: 'center',
  },
  aiButtonText: {
    color: '#7bdca6',
    fontSize: 14,
    fontWeight: '600',
  },
  aiButtonError: {
    backgroundColor: '#2a1a1a',
    borderColor: '#4a2a2a',
  },
  aiButtonTextError: {
    color: '#ff8b84',
  },
  aiButtonSuccess: {
    backgroundColor: '#1a2a1a',
    borderColor: '#2a4a2a',
  },
  aiButtonTextSuccess: {
    color: '#7bdca6',
  },

  // Preload indicator styles
  preloadIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(123, 220, 166, 0.1)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(123, 220, 166, 0.3)',
  },
  preloadText: {
    color: '#7bdca6',
    fontSize: 12,
    marginLeft: 8,
    fontWeight: '500',
  },

  // AI Modal styles
  aiModalSectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#f2f4f8',
    marginBottom: 16,
    textAlign: 'center',
  },
  aiModalSection: {
    marginBottom: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1f2d3f',
  },
  aiModalLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  aiModalValue: {
    fontSize: 16,
    lineHeight: 24,
  },
  aiModalFooter: {
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#1f2d3f',
  },
  aiModalNote: {
    color: '#6c80a1',
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 4,
  },

  // Buy icon styles
  buyIconButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111927',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#1a2333',
  },
  buyIcon: {
    fontSize: 20,
  },
  buyCount: {
    color: '#7bdca6',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 6,
    backgroundColor: '#1a2a1a',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    minWidth: 20,
    textAlign: 'center',
  },

  // Buy history modal styles
  buySummary: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1f2d3f',
  },
  buySummaryItem: {
    alignItems: 'center',
  },
  buySummaryLabel: {
    color: '#6c80a1',
    fontSize: 12,
    marginBottom: 4,
  },
  buySummaryValue: {
    color: '#f2f4f8',
    fontSize: 18,
    fontWeight: '700',
  },
  buyHistoryList: {
    marginTop: 8,
  },
  buyHistoryTitle: {
    color: '#5c6a83',
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  buyHistoryItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#0f1419',
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#1a2333',
  },
  buyHistoryLeft: {
    flex: 1,
  },
  buyHistoryTicker: {
    color: '#f2f4f8',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  buyHistoryName: {
    color: '#8a909d',
    fontSize: 12,
  },
  buyHistoryRight: {
    alignItems: 'flex-end',
  },
  buyHistoryPrice: {
    color: '#7bdca6',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  buyHistoryTime: {
    color: '#6c80a1',
    fontSize: 11,
  },
  emptyBuyHistory: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyBuyHistoryText: {
    color: '#8a909d',
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 8,
  },
  emptyBuyHistorySubtext: {
    color: '#6c80a1',
    fontSize: 14,
  },
});

export default App;
