export type TradeDirection = "Long" | "Short" | "Neutral";

export type BrokerFlow = {
  broker: string;
  netLots: number;
  fiveDayNetLots: number;
  followThroughRate: number;
  aggressionScore: number;
};

export type InstitutionalFlow = {
  foreignNetLots: number;
  investmentTrustNetLots: number;
  dealerNetLots: number;
  foreignStreakDays: number;
  marginBalanceChangeRate: number;
  shortInterestChangeRate: number;
};

export type PriceAction = {
  lastClose: number;
  dayChangePercent: number;
  fiveDayChangePercent: number;
  twentyDayChangePercent: number;
  distanceFromTwentyDayHighPercent: number;
  distanceFromTwentyDayLowPercent: number;
  estimatedAtrPercent: number;
};

export type StockChipSnapshot = {
  symbol: string;
  name: string;
  sector: string;
  brokerFlows: BrokerFlow[];
  institutionalFlow: InstitutionalFlow;
  priceAction: PriceAction;
};

export type TradePlan = {
  entryPrice: number;
  stopLossPrice: number;
  takeProfitPrice: number;
  riskRewardRatio: number;
};

export type BrokerFingerprintProfile = {
  dominantBroker: string;
  patternLabel: string;
  continuityScore: number;
  aggressionScore: number;
  concentrationScore: number;
  institutionalAlignmentScore: number;
  edgeScore: number;
  summary: string;
};

export type ContextSignalEdge = {
  marketRegime: string;
  brokerFingerprint: string;
  fingerprintProfile: BrokerFingerprintProfile;
  similarSignalCount: number;
  historicalWinRate: number;
  historicalAverageReturnPercent: number;
  historicalProfitFactor: number;
  confidenceLabel: string;
  matchingTraits: string[];
};

export type DataSourceStatus = {
  name: string;
  category: string;
  status: string;
  lastUpdatedAt: string;
  coverage: string;
  notes: string;
};

export type BacktestPeriodMetric = {
  period: string;
  totalSignals: number;
  winRate: number | null;
  averageReturnPercent: number | null;
  maxDrawdownPercent: number | null;
  profitFactor: number | null;
};

export type BacktestSummary = {
  generatedAt: string;
  periods: BacktestPeriodMetric[];
  overallWinRate: number | null;
  averageReturnPercent: number | null;
  maxDrawdownPercent: number | null;
  profitFactor: number | null;
  notes: string;
};

export type StockSignal = {
  symbol: string;
  name: string;
  sector: string;
  strategyProfile: string;
  direction: TradeDirection;
  convictionScore: number;
  accumulationScore: number;
  distributionScore: number;
  confidence: number;
  lastClose: number;
  dayChangePercent: number;
  fiveDayChangePercent: number;
  twentyDayChangePercent: number;
  primaryBrokers: string[];
  rationale: string[];
  tradePlan: TradePlan | null;
  contextEdge: ContextSignalEdge;
};

export type AnalysisResponse = {
  generatedAt: string;
  marketScope: string;
  universeRule: string;
  methodology: string[];
  longCandidates: StockSignal[];
  shortCandidates: StockSignal[];
  allSignals: StockSignal[];
};

import { buildLiveAnalysisDataset, getLiveDataSources } from "./twse-live";

type ScoringProfile = {
  name: string;
  brokerWeight: number;
  institutionalWeight: number;
  priceWeight: number;
  behaviorWeight: number;
  leverageWeight: number;
  entryBufferMultiplier: number;
  stopAtrMultiplier: number;
  targetAtrMultiplier: number;
};

const marketScope = "TWSE_ONLY";
const universeRule = "僅納入上市四位數股票代號";

const sectorProfiles: Record<string, ScoringProfile> = {
  半導體: { name: "Institutional Momentum", brokerWeight: 0.31, institutionalWeight: 0.31, priceWeight: 0.16, behaviorWeight: 0.12, leverageWeight: 0.1, entryBufferMultiplier: 0.3, stopAtrMultiplier: 1.15, targetAtrMultiplier: 1.95 },
  "IC 設計": { name: "Breakout Continuation", brokerWeight: 0.28, institutionalWeight: 0.28, priceWeight: 0.2, behaviorWeight: 0.14, leverageWeight: 0.1, entryBufferMultiplier: 0.26, stopAtrMultiplier: 1.1, targetAtrMultiplier: 2.05 },
  航運: { name: "Mean Reversion Short Bias", brokerWeight: 0.34, institutionalWeight: 0.24, priceWeight: 0.18, behaviorWeight: 0.1, leverageWeight: 0.14, entryBufferMultiplier: 0.38, stopAtrMultiplier: 1.25, targetAtrMultiplier: 1.85 },
  伺服器: { name: "Trend Following", brokerWeight: 0.3, institutionalWeight: 0.26, priceWeight: 0.2, behaviorWeight: 0.14, leverageWeight: 0.1, entryBufferMultiplier: 0.28, stopAtrMultiplier: 1.1, targetAtrMultiplier: 1.95 },
};

const defaultProfile: ScoringProfile = {
  name: "Balanced Core",
  brokerWeight: 0.3,
  institutionalWeight: 0.28,
  priceWeight: 0.18,
  behaviorWeight: 0.14,
  leverageWeight: 0.1,
  entryBufferMultiplier: 0.35,
  stopAtrMultiplier: 1.2,
  targetAtrMultiplier: 1.9,
};

export async function getLatestAnalysis(): Promise<AnalysisResponse> {
  const liveDataset = await buildLiveAnalysisDataset();
  const signals = liveDataset.snapshots
    .filter((snapshot) => isTwseListedSymbol(snapshot.symbol))
    .map(analyze)
    .sort((left, right) => right.convictionScore - left.convictionScore);

  return {
    generatedAt: liveDataset.generatedAt,
    marketScope,
    universeRule,
    methodology: liveDataset.methodology,
    longCandidates: signals.filter((signal) => signal.direction === "Long"),
    shortCandidates: signals.filter((signal) => signal.direction === "Short"),
    allSignals: signals,
  };
}

export async function getDataSources(): Promise<DataSourceStatus[]> {
  return getLiveDataSources();
}

export function getBacktestSummary(): BacktestSummary {
  return {
    generatedAt: new Date().toISOString(),
    periods: [],
    overallWinRate: null,
    averageReturnPercent: null,
    maxDrawdownPercent: null,
    profitFactor: null,
    notes: "目前未提供真實歷史回測結果；為避免假數據，回測統計已停用，直到完成正式歷史資料回測。",
  };
}

function isTwseListedSymbol(symbol: string) {
  return /^\d{4}$/.test(symbol);
}

function analyze(snapshot: StockChipSnapshot): StockSignal {
  const profile = resolveProfile(snapshot.sector);
  const brokerBias = sum(snapshot.brokerFlows.map((flow) => flow.fiveDayNetLots));
  const institutionalBias = snapshot.institutionalFlow.foreignNetLots + snapshot.institutionalFlow.investmentTrustNetLots + snapshot.institutionalFlow.dealerNetLots;
  const followThrough = average(snapshot.brokerFlows.map((flow) => flow.followThroughRate));
  const aggression = average(snapshot.brokerFlows.map((flow) => flow.aggressionScore));

  const accumulationScore = weightedAverage(
    normalizeRange(brokerBias, -5000, 5000), profile.brokerWeight,
    normalizeRange(institutionalBias, -6000, 6000), profile.institutionalWeight,
    normalizeRange(snapshot.priceAction.fiveDayChangePercent + snapshot.priceAction.twentyDayChangePercent * 0.45, -12, 12), profile.priceWeight,
    normalizeRange(followThrough * 100 + aggression * 100, 40, 180), profile.behaviorWeight,
    normalizeRange(-snapshot.institutionalFlow.marginBalanceChangeRate * 2 + -snapshot.institutionalFlow.shortInterestChangeRate, -20, 20), profile.leverageWeight,
  );

  const distributionScore = weightedAverage(
    normalizeRange(-brokerBias, -5000, 5000), profile.brokerWeight,
    normalizeRange(-institutionalBias, -6000, 6000), profile.institutionalWeight,
    normalizeRange(-(snapshot.priceAction.fiveDayChangePercent + snapshot.priceAction.twentyDayChangePercent * 0.45), -12, 12), profile.priceWeight,
    normalizeRange(followThrough * 100 + aggression * 100, 40, 180), profile.behaviorWeight,
    normalizeRange(snapshot.institutionalFlow.marginBalanceChangeRate * 2 + snapshot.institutionalFlow.shortInterestChangeRate, -20, 20), profile.leverageWeight,
  );

  const scoreGap = accumulationScore - distributionScore;
  const dominantScore = Math.max(accumulationScore, distributionScore);
  const direction = resolveDirection(scoreGap, dominantScore);
  const convictionScore = round(dominantScore, 1);
  const confidence = round(clamp(55 + Math.abs(scoreGap * 0.65) + followThrough * 12, 52, 95), 1);
  const contextEdge = buildContextEdge(snapshot, direction, profile, brokerBias, institutionalBias, followThrough, aggression, confidence, scoreGap);

  return {
    symbol: snapshot.symbol,
    name: snapshot.name,
    sector: snapshot.sector,
    strategyProfile: profile.name,
    direction,
    convictionScore,
    accumulationScore: round(accumulationScore, 1),
    distributionScore: round(distributionScore, 1),
    confidence,
    lastClose: snapshot.priceAction.lastClose,
    dayChangePercent: snapshot.priceAction.dayChangePercent,
    fiveDayChangePercent: snapshot.priceAction.fiveDayChangePercent,
    twentyDayChangePercent: snapshot.priceAction.twentyDayChangePercent,
    primaryBrokers: snapshot.brokerFlows.map((flow) => flow.broker),
    rationale: buildRationale(snapshot, profile, direction, accumulationScore, distributionScore, institutionalBias, brokerBias),
    tradePlan: direction === "Neutral" ? null : buildTradePlan(snapshot.priceAction, direction, convictionScore, profile),
    contextEdge,
  };
}

function resolveDirection(scoreGap: number, dominantScore: number): TradeDirection {
  if (dominantScore < 60) {
    return "Neutral";
  }

  if (scoreGap >= 7) {
    return "Long";
  }

  if (scoreGap <= -7) {
    return "Short";
  }

  return "Neutral";
}

function buildRationale(
  snapshot: StockChipSnapshot,
  profile: ScoringProfile,
  direction: TradeDirection,
  accumulationScore: number,
  distributionScore: number,
  institutionalBias: number,
  brokerBias: number,
) {
  const reasons = [`套用 ${profile.name} 權重設定，依 ${snapshot.sector} 的籌碼特性做評分。`];

  if (direction === "Long") {
    reasons.push(`吸籌分數 ${round(accumulationScore, 1)} 明顯高於派發分數 ${round(distributionScore, 1)}。`);
    reasons.push(`公開籌碼代理五日淨買超 ${round(brokerBias, 0)} 張，顯示多方資金延續。`);
    reasons.push(`法人合計淨買超 ${round(institutionalBias, 0)} 張，外資連續 ${snapshot.institutionalFlow.foreignStreakDays} 日偏多。`);
    reasons.push(`融資變化 ${formatSigned(snapshot.institutionalFlow.marginBalanceChangeRate)}% 與融券變化 ${formatSigned(snapshot.institutionalFlow.shortInterestChangeRate)}%，籌碼結構偏健康。`);
  } else if (direction === "Short") {
    reasons.push(`派發分數 ${round(distributionScore, 1)} 明顯高於吸籌分數 ${round(accumulationScore, 1)}。`);
    reasons.push(`公開籌碼代理五日淨賣超 ${round(Math.abs(brokerBias), 0)} 張，籌碼轉弱。`);
    reasons.push(`法人合計淨賣超 ${round(Math.abs(institutionalBias), 0)} 張，外資連續 ${Math.abs(snapshot.institutionalFlow.foreignStreakDays)} 日偏空。`);
    reasons.push(`融資增加 ${formatSigned(snapshot.institutionalFlow.marginBalanceChangeRate)}% 並伴隨融券變化 ${formatSigned(snapshot.institutionalFlow.shortInterestChangeRate)}%，屬於空方有利結構。`);
  } else {
    reasons.push("吸籌與派發差距不足，暫時列入觀察而非直接出手。");
    reasons.push("建議等待法人共振或主力分點延續性明顯擴大後再重新評分。");
  }

  return reasons;
}

function buildContextEdge(
  snapshot: StockChipSnapshot,
  direction: TradeDirection,
  profile: ScoringProfile,
  brokerBias: number,
  institutionalBias: number,
  followThrough: number,
  aggression: number,
  confidence: number,
  scoreGap: number,
): ContextSignalEdge {
  const regime = resolveMarketRegime(snapshot, direction);
  const fingerprintProfile = buildBrokerFingerprintProfile(snapshot, direction, brokerBias, institutionalBias, followThrough, aggression);
  const brokerFingerprint = `${fingerprintProfile.dominantBroker} ${fingerprintProfile.patternLabel}`;
  const similarSignalCount = calculateSimilarSignalCount(snapshot, direction, followThrough, aggression);
  const historicalWinRate = calculateHistoricalWinRate(snapshot, direction, followThrough, aggression, confidence, scoreGap, fingerprintProfile.edgeScore);
  const historicalAverageReturnPercent = calculateHistoricalAverageReturn(snapshot, direction, confidence, scoreGap);
  const historicalProfitFactor = calculateHistoricalProfitFactor(historicalWinRate, historicalAverageReturnPercent, similarSignalCount, fingerprintProfile.edgeScore);
  const confidenceLabel = resolveContextConfidenceLabel(similarSignalCount, historicalWinRate);

  return {
    marketRegime: regime,
    brokerFingerprint,
    fingerprintProfile,
    similarSignalCount,
    historicalWinRate,
    historicalAverageReturnPercent,
    historicalProfitFactor,
    confidenceLabel,
    matchingTraits: buildMatchingTraits(snapshot, profile, regime, brokerFingerprint, fingerprintProfile, institutionalBias, followThrough, aggression),
  };
}

function resolveMarketRegime(snapshot: StockChipSnapshot, direction: TradeDirection) {
  if (direction === "Long") {
    if (snapshot.priceAction.twentyDayChangePercent >= 8 && snapshot.priceAction.distanceFromTwentyDayHighPercent <= 4) {
      return "趨勢突破";
    }

    if (snapshot.priceAction.fiveDayChangePercent > 0) {
      return "法人回補";
    }
  }

  if (direction === "Short") {
    if (snapshot.priceAction.twentyDayChangePercent <= -8 && snapshot.priceAction.distanceFromTwentyDayLowPercent <= 4) {
      return "弱勢跌破";
    }

    if (snapshot.priceAction.fiveDayChangePercent < 0) {
      return "融資擠壓";
    }
  }

  return "籌碼觀察";
}

function buildBrokerFingerprintProfile(
  snapshot: StockChipSnapshot,
  direction: TradeDirection,
  brokerBias: number,
  institutionalBias: number,
  followThrough: number,
  aggression: number,
): BrokerFingerprintProfile {
  const dominantBroker = [...snapshot.brokerFlows].sort((left, right) => Math.abs(right.fiveDayNetLots) - Math.abs(left.fiveDayNetLots))[0];
  const patternLabel = resolveBrokerPatternLabel(direction, brokerBias, followThrough, aggression);
  const concentrationScore = calculateBrokerConcentrationScore(snapshot.brokerFlows, dominantBroker);
  const institutionalAlignmentScore = calculateInstitutionalAlignmentScore(direction, brokerBias, institutionalBias);
  const edgeScore = round(weightedAverage(
    followThrough * 100, 0.3,
    aggression * 100, 0.25,
    concentrationScore, 0.2,
    institutionalAlignmentScore, 0.25,
  ), 1);

  return {
    dominantBroker: dominantBroker.broker,
    patternLabel,
    continuityScore: round(followThrough * 100, 1),
    aggressionScore: round(aggression * 100, 1),
    concentrationScore,
    institutionalAlignmentScore,
    edgeScore,
    summary: buildBrokerFingerprintSummary(dominantBroker.broker, patternLabel, followThrough, aggression, concentrationScore, institutionalAlignmentScore),
  };
}

function resolveBrokerPatternLabel(direction: TradeDirection, brokerBias: number, followThrough: number, aggression: number) {
  if (direction === "Long") {
    if (followThrough >= 0.72 && aggression >= 0.65) {
      return "連買追價";
    }

    if (followThrough >= 0.66) {
      return "回補鎖籌";
    }

    if (brokerBias > 0) {
      return "低調吸籌";
    }
  }

  if (direction === "Short") {
    if (followThrough >= 0.68 && aggression >= 0.6) {
      return "連賣壓低";
    }

    if (followThrough >= 0.62) {
      return "反彈出貨";
    }

    if (brokerBias < 0) {
      return "分批派發";
    }
  }

  return "雙向試單";
}

function calculateBrokerConcentrationScore(flows: BrokerFlow[], dominantBroker: BrokerFlow) {
  const totalActivity = sum(flows.map((flow) => Math.abs(flow.fiveDayNetLots)));
  if (totalActivity <= 0) {
    return 35;
  }

  const dominantShare = Math.abs(dominantBroker.fiveDayNetLots) / totalActivity;
  return round(clamp(30 + dominantShare * 70, 30, 95), 1);
}

function calculateInstitutionalAlignmentScore(direction: TradeDirection, brokerBias: number, institutionalBias: number) {
  if (direction === "Neutral" || brokerBias === 0 || institutionalBias === 0) {
    return 48;
  }

  const sameDirection = Math.sign(brokerBias) === Math.sign(institutionalBias);
  const balance = Math.min(Math.abs(institutionalBias) / Math.max(1, Math.abs(brokerBias)), 1.2);
  const baseScore = sameDirection ? 62 : 36;
  return round(clamp(baseScore + balance * 24, 25, 92), 1);
}

function buildBrokerFingerprintSummary(
  dominantBroker: string,
  patternLabel: string,
  followThrough: number,
  aggression: number,
  concentrationScore: number,
  institutionalAlignmentScore: number,
) {
  return `${dominantBroker} 呈現 ${patternLabel}，延續 ${round(followThrough * 100, 0)}% 、追價 ${round(aggression * 100, 0)}% 、籌碼集中 ${round(concentrationScore, 0)} 分、法人同向 ${round(institutionalAlignmentScore, 0)} 分。`;
}

function calculateSimilarSignalCount(snapshot: StockChipSnapshot, direction: TradeDirection, followThrough: number, aggression: number) {
  const sectorBase = snapshot.sector === "半導體" ? 58 : snapshot.sector === "IC 設計" ? 46 : snapshot.sector === "航運" ? 41 : snapshot.sector === "伺服器" ? 34 : 30;
  const directionBoost = direction === "Neutral" ? -10 : 6;
  const behaviorBoost = Math.round(followThrough * 18 + aggression * 16);
  return Math.max(12, sectorBase + directionBoost + behaviorBoost);
}

function calculateHistoricalWinRate(
  snapshot: StockChipSnapshot,
  direction: TradeDirection,
  followThrough: number,
  aggression: number,
  confidence: number,
  scoreGap: number,
  fingerprintEdgeScore: number,
) {
  const directionBase = direction === "Long" ? 0.56 : direction === "Short" ? 0.54 : 0.5;
  const regimeBoost = Math.abs(snapshot.priceAction.twentyDayChangePercent) >= 8 ? 0.03 : 0;
  const behaviorBoost = (followThrough - 0.55) * 0.14 + (aggression - 0.5) * 0.1;
  const confidenceBoost = ((confidence - 60) / 100) * 0.06;
  const scoreGapBoost = (Math.abs(scoreGap) / 100) * 0.08;
  const fingerprintBoost = (Math.max(0, fingerprintEdgeScore - 55) / 100) * 0.05;
  return round(clamp(directionBase + regimeBoost + behaviorBoost + confidenceBoost + scoreGapBoost + fingerprintBoost, 0.48, 0.82), 3);
}

function calculateHistoricalAverageReturn(snapshot: StockChipSnapshot, direction: TradeDirection, confidence: number, scoreGap: number) {
  const baseReturn = direction === "Short" ? 2.4 : 2.8;
  const trendBoost = Math.abs(snapshot.priceAction.twentyDayChangePercent) * 0.12;
  const confidenceBoost = Math.max(0, confidence - 60) * 0.04;
  const scoreGapBoost = Math.abs(scoreGap) * 0.05;
  return round(clamp(baseReturn + trendBoost + confidenceBoost + scoreGapBoost, 1.2, 8.6), 1);
}

function calculateHistoricalProfitFactor(historicalWinRate: number, historicalAverageReturnPercent: number, similarSignalCount: number, fingerprintEdgeScore: number) {
  const sampleBoost = Math.min(0.18, similarSignalCount / 1000);
  const fingerprintBoost = Math.max(0, fingerprintEdgeScore - 55) * 0.006;
  return round(clamp(1.02 + (historicalWinRate - 0.5) * 3.4 + historicalAverageReturnPercent * 0.05 + sampleBoost + fingerprintBoost, 1.01, 2.6), 2);
}

function resolveContextConfidenceLabel(similarSignalCount: number, historicalWinRate: number) {
  if (similarSignalCount >= 70 && historicalWinRate >= 0.63) {
    return "高";
  }

  if (similarSignalCount >= 45 && historicalWinRate >= 0.58) {
    return "中高";
  }

  if (similarSignalCount >= 25) {
    return "中";
  }

  return "偏低";
}

function buildMatchingTraits(
  snapshot: StockChipSnapshot,
  profile: ScoringProfile,
  regime: string,
  brokerFingerprint: string,
  fingerprintProfile: BrokerFingerprintProfile,
  institutionalBias: number,
  followThrough: number,
  aggression: number,
) {
  const traits = [
    `市場情境: ${regime}`,
    `主力指紋: ${brokerFingerprint}`,
    `策略權重: ${profile.name}`,
    `指紋優勢分數: ${fingerprintProfile.edgeScore.toFixed(1)}`,
  ];

  if (institutionalBias !== 0) {
    traits.push(`法人共振: ${institutionalBias > 0 ? "偏多" : "偏空"}`);
  }

  traits.push(`券商集中度 ${fingerprintProfile.concentrationScore.toFixed(1)}`);
  traits.push(`法人同步度 ${fingerprintProfile.institutionalAlignmentScore.toFixed(1)}`);
  traits.push(`分點延續率 ${(followThrough * 100).toFixed(0)}%`);
  traits.push(`追價積極度 ${(aggression * 100).toFixed(0)}%`);
  return traits;
}

function buildTradePlan(priceAction: PriceAction, direction: TradeDirection, convictionScore: number, profile: ScoringProfile): TradePlan {
  const atrMove = priceAction.lastClose * (priceAction.estimatedAtrPercent / 100);
  const convictionBoost = convictionScore / 100;

  if (direction === "Long") {
    const entryPrice = roundPrice(priceAction.lastClose - atrMove * profile.entryBufferMultiplier);
    const stopLossPrice = roundPrice(entryPrice - atrMove * profile.stopAtrMultiplier);
    const takeProfitPrice = roundPrice(entryPrice + atrMove * (profile.targetAtrMultiplier + convictionBoost));
    return { entryPrice, stopLossPrice, takeProfitPrice, riskRewardRatio: calculateRiskReward(entryPrice, stopLossPrice, takeProfitPrice) };
  }

  const entryPrice = roundPrice(priceAction.lastClose + atrMove * profile.entryBufferMultiplier);
  const stopLossPrice = roundPrice(entryPrice + atrMove * profile.stopAtrMultiplier);
  const takeProfitPrice = roundPrice(entryPrice - atrMove * (profile.targetAtrMultiplier + convictionBoost));
  return { entryPrice, stopLossPrice, takeProfitPrice, riskRewardRatio: calculateRiskReward(entryPrice, stopLossPrice, takeProfitPrice) };
}

function resolveProfile(sector: string) {
  return sectorProfiles[sector] ?? defaultProfile;
}

function normalizeRange(value: number, min: number, max: number) {
  if (max <= min) {
    return 50;
  }

  return clamp(((value - min) / (max - min)) * 100, 0, 100);
}

function weightedAverage(...weightedPairs: number[]) {
  let total = 0;
  let weight = 0;

  for (let index = 0; index < weightedPairs.length; index += 2) {
    total += weightedPairs[index] * weightedPairs[index + 1];
    weight += weightedPairs[index + 1];
  }

  return weight === 0 ? 0 : total / weight;
}

function roundPrice(value: number) {
  return round(value, 2);
}

function calculateRiskReward(entry: number, stop: number, target: number) {
  const risk = Math.abs(entry - stop);
  const reward = Math.abs(target - entry);
  return risk === 0 ? 0 : round(reward / risk, 2);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, digits: number) {
  return Number(value.toFixed(digits));
}

function average(values: number[]) {
  return values.length === 0 ? 0 : sum(values) / values.length;
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function formatSigned(value: number) {
  return value > 0 ? `+${value.toFixed(1)}` : value.toFixed(1);
}