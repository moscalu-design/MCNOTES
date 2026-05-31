from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd


ROOT = Path(__file__).resolve().parent
ANALYSIS_DATE = pd.Timestamp("2026-05-29")
DEPARTMENTS = [
    "OPS",
    "GLO",
    "PJ",
    "RM",
    "OCCO",
    "JU",
    "ECON",
    "CFC",
    "EIF",
    "FI",
    "IG",
    "PMM",
    "SG",
    "GIS",
    "HR",
    "OTHER",
]


def pct_change(new: float, old: float) -> float:
    if pd.isna(old) or old == 0:
        return np.nan
    return ((new - old) / old) * 100


def fmt(value: float) -> str:
    if pd.isna(value):
        return ""
    return f"{value:,.1f}"


def md_table(df: pd.DataFrame) -> str:
    if df.empty:
        return "_No rows._"
    table = df.copy()
    for col in table.columns:
        if pd.api.types.is_numeric_dtype(table[col]):
            table[col] = table[col].map(lambda x: "" if pd.isna(x) else f"{x:,.1f}")
        else:
            table[col] = table[col].astype(str)
    headers = list(table.columns)
    lines = [
        "| " + " | ".join(headers) + " |",
        "| " + " | ".join(["---"] * len(headers)) + " |",
    ]
    for _, row in table.iterrows():
        lines.append("| " + " | ".join(str(row[col]).replace("|", " ") for col in headers) + " |")
    return "\n".join(lines)


def main() -> None:
    df = pd.read_csv(ROOT / "cleaned_database.csv")
    df["Validation Date"] = pd.to_datetime(df["Validation Date"], errors="coerce")
    for col in [
        "Text Before Opinions",
        "Document Page Count",
        "Page count before opinion",
        "Annex Page Count",
        "Department Sections With Words",
        "Words Per Document Page",
        "Words Per Pre Opinion Page",
        *DEPARTMENTS,
    ]:
        df[col] = pd.to_numeric(df[col], errors="coerce")

    hist = df[(df["Validation Date"].notna()) & (df["Validation Date"] <= ANALYSIS_DATE)].copy()
    hist["month"] = hist["Validation Date"].dt.to_period("M").astype(str)
    hist["year"] = hist["Validation Date"].dt.year
    hist["period"] = pd.cut(
        hist["Validation Date"],
        bins=[
            pd.Timestamp("2018-01-01"),
            pd.Timestamp("2023-12-31"),
            pd.Timestamp("2024-12-31"),
            pd.Timestamp("2025-12-31"),
            ANALYSIS_DATE,
        ],
        labels=["<=2023", "2024", "2025", "2026YTD"],
    )

    period = (
        hist.groupby(["Template Type", "period"], observed=True)
        .agg(
            docs=("File Name", "count"),
            median_words=("Text Before Opinions", "median"),
            mean_words=("Text Before Opinions", "mean"),
            median_pages=("Document Page Count", "median"),
            mean_pages=("Document Page Count", "mean"),
            median_pre_opinion_pages=("Page count before opinion", "median"),
            mean_pre_opinion_pages=("Page count before opinion", "mean"),
            median_service_opinions=("Department Sections With Words", "median"),
            mean_service_opinions=("Department Sections With Words", "mean"),
        )
        .reset_index()
    )
    period.to_csv(ROOT / "deep_period_trends.csv", index=False, encoding="utf-8-sig")

    monthly = (
        hist.groupby(["Template Type", "month"])
        .agg(
            docs=("File Name", "count"),
            median_words=("Text Before Opinions", "median"),
            mean_words=("Text Before Opinions", "mean"),
            median_pages=("Document Page Count", "median"),
            mean_pages=("Document Page Count", "mean"),
            median_pre_opinion_pages=("Page count before opinion", "median"),
            mean_service_opinions=("Department Sections With Words", "mean"),
            total_service_opinions=("Department Sections With Words", "sum"),
        )
        .reset_index()
    )
    monthly["rolling_3m_median_words"] = monthly.groupby("Template Type")["median_words"].transform(
        lambda s: s.rolling(3, min_periods=2).mean()
    )
    monthly["rolling_3m_delta_words"] = monthly.groupby("Template Type")[
        "rolling_3m_median_words"
    ].diff()
    monthly["rolling_3m_median_pages"] = monthly.groupby("Template Type")["median_pages"].transform(
        lambda s: s.rolling(3, min_periods=2).mean()
    )
    monthly["rolling_3m_delta_pages"] = monthly.groupby("Template Type")[
        "rolling_3m_median_pages"
    ].diff()
    monthly.to_csv(ROOT / "deep_monthly_trends.csv", index=False, encoding="utf-8-sig")

    drops = (
        monthly[monthly["docs"] >= 5]
        .sort_values("rolling_3m_delta_words")
        .groupby("Template Type")
        .head(6)
        .reset_index(drop=True)
    )
    drops.to_csv(ROOT / "deep_shortening_points.csv", index=False, encoding="utf-8-sig")

    service_rows = []
    for template, group in hist.groupby("Template Type"):
        for year, yg in group.groupby("year"):
            for dept in DEPARTMENTS:
                service_rows.append(
                    {
                        "Template Type": template,
                        "year": year,
                        "service": dept,
                        "opinion_count": int((yg[dept].fillna(0) > 0).sum()),
                        "service_words": int(yg[dept].fillna(0).sum()),
                        "documents": int(len(yg)),
                        "coverage_pct": ((yg[dept].fillna(0) > 0).mean() * 100),
                    }
                )
    service = pd.DataFrame(service_rows)
    service.to_csv(ROOT / "deep_service_opinion_trends.csv", index=False, encoding="utf-8-sig")

    authors = hist.dropna(subset=["Author"]).copy()
    author_stats = (
        authors.groupby("Author")
        .agg(
            docs=("File Name", "count"),
            templates=("Template Type", lambda s: ", ".join(sorted(set(s)))),
            median_words=("Text Before Opinions", "median"),
            mean_words=("Text Before Opinions", "mean"),
            median_pages=("Document Page Count", "median"),
            mean_pages=("Document Page Count", "mean"),
            median_service_opinions=("Department Sections With Words", "median"),
            manual_rate_pct=("Extraction", lambda s: s.eq("Manual").mean() * 100),
            first_date=("Validation Date", "min"),
            last_date=("Validation Date", "max"),
        )
        .reset_index()
    )
    author_stats["first_date"] = author_stats["first_date"].dt.strftime("%Y-%m-%d")
    author_stats["last_date"] = author_stats["last_date"].dt.strftime("%Y-%m-%d")
    author_stats.to_csv(ROOT / "deep_author_trends.csv", index=False, encoding="utf-8-sig")

    author_template = (
        authors.groupby(["Template Type", "Author"])
        .agg(
            docs=("File Name", "count"),
            median_words=("Text Before Opinions", "median"),
            mean_words=("Text Before Opinions", "mean"),
            median_pages=("Document Page Count", "median"),
            mean_pages=("Document Page Count", "mean"),
            median_service_opinions=("Department Sections With Words", "median"),
        )
        .reset_index()
    )
    author_template.to_csv(ROOT / "deep_author_template_trends.csv", index=False, encoding="utf-8-sig")

    def period_line(template: str, col: str) -> str:
        sub = period[period["Template Type"] == template].set_index("period")
        pieces = []
        for label in ["<=2023", "2024", "2025", "2026YTD"]:
            if label in sub.index:
                pieces.append(f"{label}: {fmt(sub.loc[label, col])}")
        return "; ".join(pieces)

    report = f"""# Deep Trend Notes

Analysis date: {ANALYSIS_DATE.date().isoformat()}  
Historical trend rows: {len(hist):,}  
Excluded from trend break analysis: {(df['Validation Date'] > ANALYSIS_DATE).sum():,} future-dated rows and {df['Validation Date'].isna().sum():,} undated rows.

## Main Length Findings

- AFS is getting longer, not shorter, in the historical data. Median text-before-opinions words move from {period_line('AFS', 'median_words')}. Median pre-opinion pages rise from {period_line('AFS', 'median_pre_opinion_pages')}.
- GNG stays structurally short in page count, but its median words rise mildly: {period_line('GNG', 'median_words')}. Median document pages remain around 7, while mean pages decline from 7.2 in 2024 to 6.7 in 2026YTD.
- OTHER is the clearest place where documents shorten in 2026YTD: median words are {period_line('OTHER', 'median_words')}, and median document pages fall from 16 in 2023-2025 to 12 in 2026YTD.
- PIN is stable across the available 2023-2024 window: median words are {period_line('PIN', 'median_words')}.

## Shortening Points

Largest three-month rolling median word-count drops with at least five documents in the month:

{md_table(drops[['Template Type','month','docs','median_words','rolling_3m_median_words','rolling_3m_delta_words','median_pages']].round(1))}

Interpretation:

- OTHER has a sharp low point in August 2025, but that looks like a mix effect rather than a stable template redesign signal because it rebounds in September-November 2025.
- OTHER 2026YTD is more meaningful: lower median pages and lower median words suggest a real move toward shorter OTHER notes.
- GNG shows drops in July 2025 and around December 2024-January 2025, but the absolute length remains in a tight 1.3k-1.6k median-word band.
- AFS has no sustained shortening signal. The strongest pattern is lengthening through 2025 and 2026YTD.

## Service Opinion Findings

- Service-opinion count per document declines over time for AFS and GNG. AFS mean service sections fall from about 5.9 in 2023 to 5.0 in 2025-2026YTD. GNG falls from 5.0 in 2024 to 4.1 in 2026YTD.
- This is the best evidence of template streamlining in the database: even where total words do not fall, the number of service opinion sections per document falls.
- GNG has no SG service-opinion leakage in the current data. GNG positive service columns are PJ, RM, OCCO, JU, and ECON.

## Page Count Findings

- AFS total pages do not fall: median pages move from 28 <=2023 to 29 in 2024, 31 in 2025, and 30 in 2026YTD.
- GNG total pages are stable/slightly lower: median pages stay at 7, with mean pages falling from 7.2 to 6.7 by 2026YTD.
- OTHER total pages fall in 2026YTD: median pages drop from 16 in 2023-2025 to 12 in 2026YTD.
- AFS pre-opinion pages rise strongly despite fewer service sections, which suggests the surviving sections are longer or front matter grew.

## Author Findings

Author coverage is uneven:

- AFS missing author: {hist[hist['Template Type'].eq('AFS')]['Author'].isna().sum():,} / {hist['Template Type'].eq('AFS').sum():,}
- GNG missing author: {hist[hist['Template Type'].eq('GNG')]['Author'].isna().sum():,} / {hist['Template Type'].eq('GNG').sum():,}
- OTHER missing author: {hist[hist['Template Type'].eq('OTHER')]['Author'].isna().sum():,} / {hist['Template Type'].eq('OTHER').sum():,}
- PIN missing author: {hist[hist['Template Type'].eq('PIN')]['Author'].isna().sum():,} / {hist['Template Type'].eq('PIN').sum():,}

Top author/service-office groups with at least 10 records by median word count:

{md_table(author_stats[author_stats['docs'] >= 10].sort_values('median_words', ascending=False).head(12)[['Author','docs','templates','median_words','mean_words','median_pages','manual_rate_pct']].round(1))}

Shortest author/service-office groups with at least 10 records:

{md_table(author_stats[author_stats['docs'] >= 10].sort_values('median_words').head(12)[['Author','docs','templates','median_words','mean_words','median_pages','manual_rate_pct']].round(1))}

Interpretation:

- Author is really a service-office code in this workbook, so it is partly measuring business area and product mix rather than individual writing style.
- The longest groups are mainly OPS/EGPF and OPS/CORP AFS-heavy groups.
- The shortest groups are mainly OTHER-note groups such as FI/CAP, GR&C-RM/GFIN, FC/FRA, SG/GB, PJ/SQM.
- Because 80% of GNG rows have missing author, author analysis is reliable for AFS/OTHER/PIN but weak for GNG.

## Exported Deep-Dive Files

- `deep_period_trends.csv`
- `deep_monthly_trends.csv`
- `deep_shortening_points.csv`
- `deep_service_opinion_trends.csv`
- `deep_author_trends.csv`
- `deep_author_template_trends.csv`
"""

    (ROOT / "DEEP_INSIGHTS.md").write_text(report.strip() + "\n", encoding="utf-8")
    print("Wrote deep insights")


if __name__ == "__main__":
    main()
