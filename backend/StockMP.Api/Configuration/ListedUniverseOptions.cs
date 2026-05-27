namespace StockMP.Api.Configuration;

public sealed class ListedUniverseOptions
{
    public const string SectionName = "ListedUniverse";

    public IReadOnlyList<string> Symbols { get; init; } = [];
}