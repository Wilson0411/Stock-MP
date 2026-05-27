namespace StockMP.Api.Models;

public enum TradeDirection
{
    Long,
    Short,
    Neutral
}

public sealed record BrokerFlow(
    string Broker,
    decimal NetLots,
    decimal FiveDayNetLots,
    decimal FollowThroughRate,
    decimal AggressionScore);

public sealed record InstitutionalFlow(
    decimal ForeignNetLots,
    decimal InvestmentTrustNetLots,
    decimal DealerNetLots,
    int ForeignStreakDays,
    decimal MarginBalanceChangeRate,
    decimal ShortInterestChangeRate);

public sealed record PriceAction(
    decimal LastClose,
    decimal DayChangePercent,
    decimal FiveDayChangePercent,
    decimal TwentyDayChangePercent,
    decimal DistanceFromTwentyDayHighPercent,
    decimal DistanceFromTwentyDayLowPercent,
    decimal EstimatedAtrPercent);

public sealed record StockChipSnapshot(
    string Symbol,
    string Name,
    string Sector,
    IReadOnlyList<BrokerFlow> BrokerFlows,
    InstitutionalFlow InstitutionalFlow,
    PriceAction PriceAction);

public sealed record TradePlan(
    decimal EntryPrice,
    decimal StopLossPrice,
    decimal TakeProfitPrice,
    decimal RiskRewardRatio);

public sealed record ContextSignalEdge(
    string MarketRegime,
    string BrokerFingerprint,
    BrokerFingerprintProfile FingerprintProfile,
    int SimilarSignalCount,
    decimal HistoricalWinRate,
    decimal HistoricalAverageReturnPercent,
    decimal HistoricalProfitFactor,
    string ConfidenceLabel,
    IReadOnlyList<string> MatchingTraits);

public sealed record BrokerFingerprintProfile(
    string DominantBroker,
    string PatternLabel,
    decimal ContinuityScore,
    decimal AggressionScore,
    decimal ConcentrationScore,
    decimal InstitutionalAlignmentScore,
    decimal EdgeScore,
    string Summary);

public sealed record DataSourceStatus(
    string Name,
    string Category,
    string Status,
    DateTimeOffset LastUpdatedAt,
    string Coverage,
    string Notes);

public sealed record BacktestPeriodMetric(
    string Period,
    int TotalSignals,
    decimal WinRate,
    decimal AverageReturnPercent,
    decimal MaxDrawdownPercent,
    decimal ProfitFactor);

public sealed record BacktestSummary(
    DateTimeOffset GeneratedAt,
    IReadOnlyList<BacktestPeriodMetric> Periods,
    decimal OverallWinRate,
    decimal AverageReturnPercent,
    decimal MaxDrawdownPercent,
    decimal ProfitFactor,
    string Notes);

public sealed record StockSignal(
    string Symbol,
    string Name,
    string Sector,
    string StrategyProfile,
    TradeDirection Direction,
    decimal ConvictionScore,
    decimal AccumulationScore,
    decimal DistributionScore,
    decimal Confidence,
    decimal LastClose,
    decimal DayChangePercent,
    decimal FiveDayChangePercent,
    decimal TwentyDayChangePercent,
    IReadOnlyList<string> PrimaryBrokers,
    IReadOnlyList<string> Rationale,
    TradePlan? TradePlan,
    ContextSignalEdge ContextEdge);

public sealed record AnalysisResponse(
    DateTimeOffset GeneratedAt,
    string MarketScope,
    string UniverseRule,
    IReadOnlyList<string> Methodology,
    IReadOnlyList<StockSignal> LongCandidates,
    IReadOnlyList<StockSignal> ShortCandidates,
    IReadOnlyList<StockSignal> AllSignals);