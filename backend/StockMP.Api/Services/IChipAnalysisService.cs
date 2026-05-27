using StockMP.Api.Models;

namespace StockMP.Api.Services;

public interface IChipAnalysisService
{
    AnalysisResponse GetLatestAnalysis();
    IReadOnlyList<DataSourceStatus> GetDataSources();
    BacktestSummary GetBacktestSummary();
}