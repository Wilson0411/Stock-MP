using StockMP.Api.Models;
using Microsoft.Extensions.Options;
using StockMP.Api.Configuration;

namespace StockMP.Api.Services;

public sealed class ChipAnalysisService : IChipAnalysisService
{
    private const string MarketScope = "TWSE_ONLY";
    private const string UniverseRule = "僅納入上市四位數股票代號";

    private sealed record ScoringProfile(
        string Name,
        decimal BrokerWeight,
        decimal InstitutionalWeight,
        decimal PriceWeight,
        decimal BehaviorWeight,
        decimal LeverageWeight,
        decimal EntryBufferMultiplier,
        decimal StopAtrMultiplier,
        decimal TargetAtrMultiplier);

    private static readonly IReadOnlyDictionary<string, ScoringProfile> SectorProfiles =
        new Dictionary<string, ScoringProfile>(StringComparer.Ordinal)
        {
            ["半導體"] = new("Institutional Momentum", 0.31m, 0.31m, 0.16m, 0.12m, 0.10m, 0.30m, 1.15m, 1.95m),
            ["IC 設計"] = new("Breakout Continuation", 0.28m, 0.28m, 0.20m, 0.14m, 0.10m, 0.26m, 1.10m, 2.05m),
            ["航運"] = new("Mean Reversion Short Bias", 0.34m, 0.24m, 0.18m, 0.10m, 0.14m, 0.38m, 1.25m, 1.85m),
            ["伺服器"] = new("Trend Following", 0.30m, 0.26m, 0.20m, 0.14m, 0.10m, 0.28m, 1.10m, 1.95m),
        };

    private static readonly ScoringProfile DefaultProfile =
        new("Balanced Core", 0.30m, 0.28m, 0.18m, 0.14m, 0.10m, 0.35m, 1.20m, 1.90m);

    private static readonly IReadOnlyList<DataSourceStatus> DataSources =
    [
        new("TWSE Daily Market", "價格與成交", "Unavailable", DateTimeOffset.UtcNow, "上市日線、成交量、漲跌幅", "此 ASP.NET 原型後端未接真實 TWSE 資料；正式部署請使用 Next.js 同站 API。"),
        new("Broker Branch Flow", "分點籌碼", "Unavailable", DateTimeOffset.UtcNow, "主力分點五日淨買賣與連續性", "此原型後端未接正式分點資料，也不再提供示範資料。"),
        new("Institutional Flow", "法人籌碼", "Unavailable", DateTimeOffset.UtcNow, "外資、投信、自營商買賣超", "此 ASP.NET 原型後端未接真實法人資料；請改用前端同站 API。"),
        new("Margin Short Interest", "資券", "Unavailable", DateTimeOffset.UtcNow, "融資、融券與券資比", "此 ASP.NET 原型後端未接真實資券資料；請改用前端同站 API。"),
    ];

    private readonly HashSet<string> _allowedSymbols;

    private static readonly IReadOnlyList<string> Methodology =
    [
        "此 ASP.NET Core 後端保留為原型參考，未串接真實 TWSE 資料。",
        "正式部署與最新資料請使用 Next.js 同站 API Routes。",
        "為避免誤導，此原型 API 不再提供任何示範候選股或示範回測。"
    ];

    public ChipAnalysisService(IOptions<ListedUniverseOptions> listedUniverseOptions)
    {
        _allowedSymbols = listedUniverseOptions.Value.Symbols
            .Where(IsTwseListedSymbol)
            .ToHashSet(StringComparer.Ordinal);
    }

    public AnalysisResponse GetLatestAnalysis()
    {
        var signals = Array.Empty<StockSignal>();

        return new AnalysisResponse(
            DateTimeOffset.UtcNow,
            MarketScope,
            UniverseRule,
            Methodology,
            signals,
            signals,
            signals);
    }

    public IReadOnlyList<DataSourceStatus> GetDataSources() => DataSources;

    public BacktestSummary GetBacktestSummary()
    {
        return new BacktestSummary(
            DateTimeOffset.UtcNow,
            Array.Empty<BacktestPeriodMetric>(),
            null,
            null,
            null,
            null,
            "此 ASP.NET 原型後端未接真實歷史資料；為避免假數據，回測摘要已停用，正式資料請使用 Next.js 同站 API。"
        );
    }

    private static bool IsTwseListedSymbol(string symbol)
    {
        return symbol.Length == 4 && symbol.All(char.IsDigit);
    }

    private bool IsWhitelistedSymbol(string symbol)
    {
        return IsTwseListedSymbol(symbol)
            && (_allowedSymbols.Count == 0 || _allowedSymbols.Contains(symbol));
    }

    private static StockSignal Analyze(StockChipSnapshot snapshot)
    {
        var profile = ResolveProfile(snapshot.Sector);
        var brokerBias = snapshot.BrokerFlows.Sum(flow => flow.FiveDayNetLots);
        var institutionalBias = snapshot.InstitutionalFlow.ForeignNetLots
            + snapshot.InstitutionalFlow.InvestmentTrustNetLots
            + snapshot.InstitutionalFlow.DealerNetLots;
        var followThrough = snapshot.BrokerFlows.Average(flow => flow.FollowThroughRate);
        var aggression = snapshot.BrokerFlows.Average(flow => flow.AggressionScore);

        var accumulationScore = WeightedAverage(
            NormalizeRange(brokerBias, -5000m, 5000m), profile.BrokerWeight,
            NormalizeRange(institutionalBias, -6000m, 6000m), profile.InstitutionalWeight,
            NormalizeRange(snapshot.PriceAction.FiveDayChangePercent + (snapshot.PriceAction.TwentyDayChangePercent * 0.45m), -12m, 12m), profile.PriceWeight,
            NormalizeRange((followThrough * 100m) + (aggression * 100m), 40m, 180m), profile.BehaviorWeight,
            NormalizeRange((-snapshot.InstitutionalFlow.MarginBalanceChangeRate * 2m) + (-snapshot.InstitutionalFlow.ShortInterestChangeRate), -20m, 20m), profile.LeverageWeight);

        var distributionScore = WeightedAverage(
            NormalizeRange(-brokerBias, -5000m, 5000m), profile.BrokerWeight,
            NormalizeRange(-institutionalBias, -6000m, 6000m), profile.InstitutionalWeight,
            NormalizeRange(-(snapshot.PriceAction.FiveDayChangePercent + (snapshot.PriceAction.TwentyDayChangePercent * 0.45m)), -12m, 12m), profile.PriceWeight,
            NormalizeRange((followThrough * 100m) + (aggression * 100m), 40m, 180m), profile.BehaviorWeight,
            NormalizeRange((snapshot.InstitutionalFlow.MarginBalanceChangeRate * 2m) + snapshot.InstitutionalFlow.ShortInterestChangeRate, -20m, 20m), profile.LeverageWeight);

        var scoreGap = accumulationScore - distributionScore;
        var dominantScore = Math.Max(accumulationScore, distributionScore);
        var direction = ResolveDirection(scoreGap, dominantScore);
        var convictionScore = Math.Round(dominantScore, 1);
        var confidence = Math.Round(Math.Clamp(55m + Math.Abs(scoreGap * 0.65m) + (followThrough * 12m), 52m, 95m), 1);
        var contextEdge = BuildContextEdge(snapshot, direction, profile, brokerBias, institutionalBias, followThrough, aggression, confidence, scoreGap);
        var rationale = BuildRationale(snapshot, profile, direction, accumulationScore, distributionScore, institutionalBias, brokerBias);
        var tradePlan = direction == TradeDirection.Neutral
            ? null
            : BuildTradePlan(snapshot.PriceAction, direction, convictionScore, profile);

        return new StockSignal(
            snapshot.Symbol,
            snapshot.Name,
            snapshot.Sector,
            profile.Name,
            direction,
            convictionScore,
            Math.Round(accumulationScore, 1),
            Math.Round(distributionScore, 1),
            confidence,
            snapshot.PriceAction.LastClose,
            snapshot.PriceAction.DayChangePercent,
            snapshot.PriceAction.FiveDayChangePercent,
            snapshot.PriceAction.TwentyDayChangePercent,
            snapshot.BrokerFlows.Select(flow => flow.Broker).ToList(),
            rationale,
                tradePlan,
                contextEdge);
    }

    private static TradeDirection ResolveDirection(decimal scoreGap, decimal dominantScore)
    {
        if (dominantScore < 60m)
        {
            return TradeDirection.Neutral;
        }

        if (scoreGap >= 7m)
        {
            return TradeDirection.Long;
        }

        if (scoreGap <= -7m)
        {
            return TradeDirection.Short;
        }

        return TradeDirection.Neutral;
    }

    private static IReadOnlyList<string> BuildRationale(
        StockChipSnapshot snapshot,
        ScoringProfile profile,
        TradeDirection direction,
        decimal accumulationScore,
        decimal distributionScore,
        decimal institutionalBias,
        decimal brokerBias)
    {
        var reasons = new List<string>
        {
            $"套用 {profile.Name} 權重設定，依 {snapshot.Sector} 的籌碼特性做評分。"
        };

        if (direction == TradeDirection.Long)
        {
            reasons.Add($"吸籌分數 {Math.Round(accumulationScore, 1)} 明顯高於派發分數 {Math.Round(distributionScore, 1)}。" );
            reasons.Add($"三大主力分點五日淨買超 {Math.Round(brokerBias, 0)} 張，顯示籌碼持續集中。");
            reasons.Add($"法人合計淨買超 {Math.Round(institutionalBias, 0)} 張，外資連續 {snapshot.InstitutionalFlow.ForeignStreakDays} 日偏多。");
            reasons.Add($"融資變化 {snapshot.InstitutionalFlow.MarginBalanceChangeRate:+0.0;-0.0;0.0}% 與融券變化 {snapshot.InstitutionalFlow.ShortInterestChangeRate:+0.0;-0.0;0.0}%，籌碼結構偏健康。");
        }
        else if (direction == TradeDirection.Short)
        {
            reasons.Add($"派發分數 {Math.Round(distributionScore, 1)} 明顯高於吸籌分數 {Math.Round(accumulationScore, 1)}。" );
            reasons.Add($"三大主力分點五日淨賣超 {Math.Round(Math.Abs(brokerBias), 0)} 張，籌碼鬆動。");
            reasons.Add($"法人合計淨賣超 {Math.Round(Math.Abs(institutionalBias), 0)} 張，外資連續 {Math.Abs(snapshot.InstitutionalFlow.ForeignStreakDays)} 日偏空。");
            reasons.Add($"融資增加 {snapshot.InstitutionalFlow.MarginBalanceChangeRate:+0.0;-0.0;0.0}% 並伴隨融券變化 {snapshot.InstitutionalFlow.ShortInterestChangeRate:+0.0;-0.0;0.0}%，屬於空方有利結構。");
        }
        else
        {
            reasons.Add("吸籌與派發差距不足，暫時列入觀察而非直接出手。");
            reasons.Add("建議等待法人共振或主力分點延續性明顯擴大後再重新評分。");
        }

        return reasons;
    }

    private static ContextSignalEdge BuildContextEdge(
        StockChipSnapshot snapshot,
        TradeDirection direction,
        ScoringProfile profile,
        decimal brokerBias,
        decimal institutionalBias,
        decimal followThrough,
        decimal aggression,
        decimal confidence,
        decimal scoreGap)
    {
        var regime = ResolveMarketRegime(snapshot, direction);
        var fingerprintProfile = BuildBrokerFingerprintProfile(snapshot, direction, brokerBias, institutionalBias, followThrough, aggression);
        var brokerFingerprint = $"{fingerprintProfile.DominantBroker} {fingerprintProfile.PatternLabel}";
        var similarSignalCount = CalculateSimilarSignalCount(snapshot, direction, followThrough, aggression);
        var historicalWinRate = CalculateHistoricalWinRate(snapshot, direction, followThrough, aggression, confidence, scoreGap, fingerprintProfile.EdgeScore);
        var historicalAverageReturn = CalculateHistoricalAverageReturn(snapshot, direction, confidence, scoreGap);
        var historicalProfitFactor = CalculateHistoricalProfitFactor(historicalWinRate, historicalAverageReturn, similarSignalCount, fingerprintProfile.EdgeScore);
        var confidenceLabel = ResolveContextConfidenceLabel(similarSignalCount, historicalWinRate);
        var matchingTraits = BuildMatchingTraits(snapshot, profile, regime, brokerFingerprint, fingerprintProfile, institutionalBias, followThrough, aggression);

        return new ContextSignalEdge(
            regime,
            brokerFingerprint,
            fingerprintProfile,
            similarSignalCount,
            historicalWinRate,
            historicalAverageReturn,
            historicalProfitFactor,
            confidenceLabel,
            matchingTraits);
    }

    private static string ResolveMarketRegime(StockChipSnapshot snapshot, TradeDirection direction)
    {
        var priceAction = snapshot.PriceAction;

        if (direction == TradeDirection.Long)
        {
            if (priceAction.TwentyDayChangePercent >= 8m && priceAction.DistanceFromTwentyDayHighPercent <= 4m)
            {
                return "趨勢突破";
            }

            if (priceAction.FiveDayChangePercent > 0m)
            {
                return "法人回補";
            }
        }

        if (direction == TradeDirection.Short)
        {
            if (priceAction.TwentyDayChangePercent <= -8m && priceAction.DistanceFromTwentyDayLowPercent <= 4m)
            {
                return "弱勢跌破";
            }

            if (priceAction.FiveDayChangePercent < 0m)
            {
                return "融資擠壓";
            }
        }

        return "籌碼觀察";
    }

    private static BrokerFingerprintProfile BuildBrokerFingerprintProfile(
        StockChipSnapshot snapshot,
        TradeDirection direction,
        decimal brokerBias,
        decimal institutionalBias,
        decimal followThrough,
        decimal aggression)
    {
        var dominantBroker = snapshot.BrokerFlows
            .OrderByDescending(flow => Math.Abs(flow.FiveDayNetLots))
            .First();

        var patternLabel = ResolveBrokerPatternLabel(direction, brokerBias, followThrough, aggression);
        var concentrationScore = CalculateBrokerConcentrationScore(snapshot.BrokerFlows, dominantBroker);
        var institutionalAlignmentScore = CalculateInstitutionalAlignmentScore(direction, brokerBias, institutionalBias);
        var edgeScore = Math.Round(WeightedAverage(
            followThrough * 100m, 0.30m,
            aggression * 100m, 0.25m,
            concentrationScore, 0.20m,
            institutionalAlignmentScore, 0.25m), 1, MidpointRounding.AwayFromZero);

        return new BrokerFingerprintProfile(
            dominantBroker.Broker,
            patternLabel,
            Math.Round(followThrough * 100m, 1, MidpointRounding.AwayFromZero),
            Math.Round(aggression * 100m, 1, MidpointRounding.AwayFromZero),
            concentrationScore,
            institutionalAlignmentScore,
            edgeScore,
            BuildBrokerFingerprintSummary(dominantBroker.Broker, patternLabel, followThrough, aggression, concentrationScore, institutionalAlignmentScore));
    }

    private static string ResolveBrokerPatternLabel(
        TradeDirection direction,
        decimal brokerBias,
        decimal followThrough,
        decimal aggression)
    {
        if (direction == TradeDirection.Long)
        {
            if (followThrough >= 0.72m && aggression >= 0.65m)
            {
                return "連買追價";
            }

            if (followThrough >= 0.66m)
            {
                return "回補鎖籌";
            }

            if (brokerBias > 0m)
            {
                return "低調吸籌";
            }
        }

        if (direction == TradeDirection.Short)
        {
            if (followThrough >= 0.68m && aggression >= 0.60m)
            {
                return "連賣壓低";
            }

            if (followThrough >= 0.62m)
            {
                return "反彈出貨";
            }

            if (brokerBias < 0m)
            {
                return "分批派發";
            }
        }

        return "雙向試單";
    }

    private static decimal CalculateBrokerConcentrationScore(IReadOnlyList<BrokerFlow> flows, BrokerFlow dominantBroker)
    {
        var totalActivity = flows.Sum(flow => Math.Abs(flow.FiveDayNetLots));
        if (totalActivity <= 0m)
        {
            return 35m;
        }

        var dominantShare = Math.Abs(dominantBroker.FiveDayNetLots) / totalActivity;
        return Math.Round(Math.Clamp(30m + (dominantShare * 70m), 30m, 95m), 1, MidpointRounding.AwayFromZero);
    }

    private static decimal CalculateInstitutionalAlignmentScore(TradeDirection direction, decimal brokerBias, decimal institutionalBias)
    {
        if (direction == TradeDirection.Neutral || brokerBias == 0m || institutionalBias == 0m)
        {
            return 48m;
        }

        var sameDirection = Math.Sign(brokerBias) == Math.Sign(institutionalBias);
        var balance = Math.Min(Math.Abs(institutionalBias) / Math.Max(1m, Math.Abs(brokerBias)), 1.2m);
        var baseScore = sameDirection ? 62m : 36m;
        return Math.Round(Math.Clamp(baseScore + (balance * 24m), 25m, 92m), 1, MidpointRounding.AwayFromZero);
    }

    private static string BuildBrokerFingerprintSummary(
        string dominantBroker,
        string patternLabel,
        decimal followThrough,
        decimal aggression,
        decimal concentrationScore,
        decimal institutionalAlignmentScore)
    {
        var continuity = Math.Round(followThrough * 100m, 0, MidpointRounding.AwayFromZero);
        var aggressionScore = Math.Round(aggression * 100m, 0, MidpointRounding.AwayFromZero);

        return $"{dominantBroker} 呈現 {patternLabel}，延續 {continuity}% 、追價 {aggressionScore}% 、籌碼集中 {Math.Round(concentrationScore, 0)} 分、法人同向 {Math.Round(institutionalAlignmentScore, 0)} 分。";
    }

    private static int CalculateSimilarSignalCount(
        StockChipSnapshot snapshot,
        TradeDirection direction,
        decimal followThrough,
        decimal aggression)
    {
        var sectorBase = snapshot.Sector switch
        {
            "半導體" => 58,
            "IC 設計" => 46,
            "航運" => 41,
            "伺服器" => 34,
            _ => 30,
        };

        var directionBoost = direction == TradeDirection.Neutral ? -10 : 6;
        var behaviorBoost = (int)Math.Round((followThrough * 18m) + (aggression * 16m), MidpointRounding.AwayFromZero);

        return Math.Max(12, sectorBase + directionBoost + behaviorBoost);
    }

    private static decimal CalculateHistoricalWinRate(
        StockChipSnapshot snapshot,
        TradeDirection direction,
        decimal followThrough,
        decimal aggression,
        decimal confidence,
        decimal scoreGap,
        decimal fingerprintEdgeScore)
    {
        var directionBase = direction switch
        {
            TradeDirection.Long => 0.56m,
            TradeDirection.Short => 0.54m,
            _ => 0.50m,
        };

        var regimeBoost = Math.Abs(snapshot.PriceAction.TwentyDayChangePercent) >= 8m ? 0.03m : 0m;
        var behaviorBoost = ((followThrough - 0.55m) * 0.14m) + ((aggression - 0.50m) * 0.10m);
        var confidenceBoost = ((confidence - 60m) / 100m) * 0.06m;
        var scoreGapBoost = (Math.Abs(scoreGap) / 100m) * 0.08m;
        var fingerprintBoost = Math.Max(0m, fingerprintEdgeScore - 55m) / 100m * 0.05m;

        return Math.Round(Math.Clamp(directionBase + regimeBoost + behaviorBoost + confidenceBoost + scoreGapBoost + fingerprintBoost, 0.48m, 0.82m), 3);
    }

    private static decimal CalculateHistoricalAverageReturn(
        StockChipSnapshot snapshot,
        TradeDirection direction,
        decimal confidence,
        decimal scoreGap)
    {
        var baseReturn = direction == TradeDirection.Short ? 2.4m : 2.8m;
        var trendBoost = Math.Abs(snapshot.PriceAction.TwentyDayChangePercent) * 0.12m;
        var confidenceBoost = Math.Max(0m, confidence - 60m) * 0.04m;
        var scoreGapBoost = Math.Abs(scoreGap) * 0.05m;

        return Math.Round(Math.Clamp(baseReturn + trendBoost + confidenceBoost + scoreGapBoost, 1.2m, 8.6m), 1);
    }

    private static decimal CalculateHistoricalProfitFactor(decimal historicalWinRate, decimal historicalAverageReturn, int similarSignalCount, decimal fingerprintEdgeScore)
    {
        var evidenceBoost = Math.Min(0.18m, similarSignalCount / 1000m);
        var fingerprintBoost = Math.Max(0m, fingerprintEdgeScore - 55m) * 0.006m;
        var rawValue = 1.02m + ((historicalWinRate - 0.50m) * 3.4m) + (historicalAverageReturn * 0.05m) + evidenceBoost + fingerprintBoost;
        return Math.Round(Math.Clamp(rawValue, 1.01m, 2.60m), 2);
    }

    private static string ResolveContextConfidenceLabel(int similarSignalCount, decimal historicalWinRate)
    {
        if (similarSignalCount >= 70 && historicalWinRate >= 0.63m)
        {
            return "高";
        }

        if (similarSignalCount >= 45 && historicalWinRate >= 0.58m)
        {
            return "中高";
        }

        if (similarSignalCount >= 25)
        {
            return "中";
        }

        return "偏低";
    }

    private static IReadOnlyList<string> BuildMatchingTraits(
        StockChipSnapshot snapshot,
        ScoringProfile profile,
        string regime,
        string brokerFingerprint,
        BrokerFingerprintProfile fingerprintProfile,
        decimal institutionalBias,
        decimal followThrough,
        decimal aggression)
    {
        var traits = new List<string>
        {
            $"市場情境: {regime}",
            $"主力指紋: {brokerFingerprint}",
            $"策略權重: {profile.Name}",
            $"指紋優勢分數: {fingerprintProfile.EdgeScore:0.#}",
        };

        if (institutionalBias != 0m)
        {
            traits.Add($"法人共振: {(institutionalBias > 0m ? "偏多" : "偏空")}");
        }

        traits.Add($"券商集中度 {fingerprintProfile.ConcentrationScore:0.#}");
        traits.Add($"法人同步度 {fingerprintProfile.InstitutionalAlignmentScore:0.#}");
        traits.Add($"分點延續率 {followThrough:P0}");
        traits.Add($"追價積極度 {aggression:P0}");

        return traits;
    }

    private static TradePlan BuildTradePlan(PriceAction priceAction, TradeDirection direction, decimal convictionScore, ScoringProfile profile)
    {
        var atrMove = priceAction.LastClose * (priceAction.EstimatedAtrPercent / 100m);
        var convictionBoost = convictionScore / 100m;

        if (direction == TradeDirection.Long)
        {
            var entry = RoundPrice(priceAction.LastClose - (atrMove * profile.EntryBufferMultiplier));
            var stop = RoundPrice(entry - (atrMove * profile.StopAtrMultiplier));
            var takeProfit = RoundPrice(entry + (atrMove * (profile.TargetAtrMultiplier + convictionBoost)));
            return new TradePlan(entry, stop, takeProfit, CalculateRiskReward(entry, stop, takeProfit));
        }

        var shortEntry = RoundPrice(priceAction.LastClose + (atrMove * profile.EntryBufferMultiplier));
        var shortStop = RoundPrice(shortEntry + (atrMove * profile.StopAtrMultiplier));
        var shortTakeProfit = RoundPrice(shortEntry - (atrMove * (profile.TargetAtrMultiplier + convictionBoost)));
        return new TradePlan(shortEntry, shortStop, shortTakeProfit, CalculateRiskReward(shortEntry, shortStop, shortTakeProfit));
    }

    private static ScoringProfile ResolveProfile(string sector)
    {
        return SectorProfiles.TryGetValue(sector, out var profile)
            ? profile
            : DefaultProfile;
    }

    private static decimal NormalizeRange(decimal value, decimal min, decimal max)
    {
        if (max <= min)
        {
            return 50m;
        }

        var normalized = ((value - min) / (max - min)) * 100m;
        return Math.Clamp(normalized, 0m, 100m);
    }

    private static decimal WeightedAverage(params decimal[] weightedPairs)
    {
        decimal total = 0m;
        decimal weight = 0m;

        for (var index = 0; index < weightedPairs.Length; index += 2)
        {
            total += weightedPairs[index] * weightedPairs[index + 1];
            weight += weightedPairs[index + 1];
        }

        return weight == 0m ? 0m : total / weight;
    }

    private static decimal RoundPrice(decimal price) => Math.Round(price, 2, MidpointRounding.AwayFromZero);

    private static decimal CalculateRiskReward(decimal entry, decimal stop, decimal target)
    {
        var risk = Math.Abs(entry - stop);
        var reward = Math.Abs(target - entry);
        return risk == 0m ? 0m : Math.Round(reward / risk, 2, MidpointRounding.AwayFromZero);
    }
}