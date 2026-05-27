using Microsoft.AspNetCore.Mvc;
using StockMP.Api.Models;
using StockMP.Api.Services;

namespace StockMP.Api.Controllers;

[ApiController]
[Route("api/chip-analysis")]
public sealed class ChipAnalysisController : ControllerBase
{
    private readonly IChipAnalysisService _chipAnalysisService;

    public ChipAnalysisController(IChipAnalysisService chipAnalysisService)
    {
        _chipAnalysisService = chipAnalysisService;
    }

    [HttpGet("opportunities")]
    [ProducesResponseType(typeof(AnalysisResponse), StatusCodes.Status200OK)]
    public ActionResult<AnalysisResponse> GetOpportunities()
    {
        return Ok(_chipAnalysisService.GetLatestAnalysis());
    }

    [HttpGet("data-sources")]
    [ProducesResponseType(typeof(IReadOnlyList<DataSourceStatus>), StatusCodes.Status200OK)]
    public ActionResult<IReadOnlyList<DataSourceStatus>> GetDataSources()
    {
        return Ok(_chipAnalysisService.GetDataSources());
    }

    [HttpGet("backtest-summary")]
    [ProducesResponseType(typeof(BacktestSummary), StatusCodes.Status200OK)]
    public ActionResult<BacktestSummary> GetBacktestSummary()
    {
        return Ok(_chipAnalysisService.GetBacktestSummary());
    }
}