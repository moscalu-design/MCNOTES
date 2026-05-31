from __future__ import annotations

from pathlib import Path
from textwrap import dedent

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
INPUT = ROOT / "MC_Note_Datebase.xlsx"
OUT = ROOT / "Data Analysis"
CHARTS = OUT / "charts"
ANALYSIS_DATE = pd.Timestamp("2026-05-29")

WORD_COLS = [
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

NUMERIC_COLS = [
    "Document Page Count",
    "Page count before opinion",
    "Annex Page Count",
    "Text Before Opinions",
    *WORD_COLS,
]


def pct(numerator: float, denominator: float) -> float:
    if denominator == 0 or pd.isna(denominator):
        return np.nan
    return round((numerator / denominator) * 100, 2)


def compact_stats(group: pd.DataFrame) -> pd.Series:
    words = group["Text Before Opinions"]
    pages = group["Document Page Count"]
    before_pages = group["Page count before opinion"]
    if "Extraction" in group.columns:
        manual_count = int((group["Extraction"] == "Manual").sum())
        automated_count = int((group["Extraction"] == "Automated").sum())
    else:
        group_keys = group.name if isinstance(group.name, tuple) else (group.name,)
        manual_count = len(group) if "Manual" in group_keys else 0
        automated_count = len(group) if "Automated" in group_keys else 0
    date_min = group["Validation Date"].min()
    date_max = group["Validation Date"].max()
    return pd.Series(
        {
            "documents": len(group),
            "automated_documents": automated_count,
            "manual_documents": manual_count,
            "manual_rate_pct": pct(manual_count, len(group)),
            "total_text_before_opinions_words": int(words.sum()),
            "mean_words": round(words.mean(), 2),
            "median_words": round(words.median(), 2),
            "p25_words": round(words.quantile(0.25), 2),
            "p75_words": round(words.quantile(0.75), 2),
            "p90_words": round(words.quantile(0.90), 2),
            "std_words": round(words.std(ddof=1), 2),
            "min_words": int(words.min()),
            "max_words": int(words.max()),
            "mean_document_pages": round(pages.mean(), 2),
            "median_document_pages": round(pages.median(), 2),
            "p90_document_pages": round(pages.quantile(0.90), 2),
            "mean_pages_before_opinion": round(before_pages.mean(), 2),
            "median_pages_before_opinion": round(before_pages.median(), 2),
            "mean_words_per_document_page": round(group["Words Per Document Page"].mean(), 2),
            "mean_words_per_pre_opinion_page": round(group["Words Per Pre Opinion Page"].mean(), 2),
            "first_validation_date": date_min.date().isoformat() if pd.notna(date_min) else "",
            "last_validation_date": date_max.date().isoformat() if pd.notna(date_max) else "",
        }
    )


def read_database() -> pd.DataFrame:
    df = pd.read_excel(INPUT, sheet_name="Database", header=1)
    df = df.loc[:, ~df.columns.astype(str).str.startswith("Unnamed")]
    df = df.dropna(how="all")

    for col in NUMERIC_COLS:
        df[col] = pd.to_numeric(df[col], errors="coerce")

    df["Validation Date"] = pd.to_datetime(df["Validation Date"], errors="coerce")
    df["Template Type"] = df["Template"].replace({"Other": "OTHER"}).str.upper()
    df["Batch Folder"] = df["Source"]
    df["Extraction"] = df["Extraction"].astype(str).str.strip()
    df["Department Word Total"] = df[WORD_COLS].fillna(0).sum(axis=1)
    df["Department Sections With Words"] = df[WORD_COLS].notna().sum(axis=1)
    df["Words Per Document Page"] = df["Text Before Opinions"] / df["Document Page Count"].replace(0, np.nan)
    df["Words Per Pre Opinion Page"] = df["Text Before Opinions"] / df[
        "Page count before opinion"
    ].replace(0, np.nan)
    df["Validation Month"] = df["Validation Date"].dt.to_period("M").dt.to_timestamp()
    df["Validation Year"] = df["Validation Date"].dt.year
    df["Has Validation Date"] = df["Validation Date"].notna()
    return df


def write_csv(df: pd.DataFrame, name: str) -> None:
    df.to_csv(OUT / name, index=False, encoding="utf-8-sig")


def make_summaries(df: pd.DataFrame) -> dict[str, pd.DataFrame]:
    summaries: dict[str, pd.DataFrame] = {}

    summaries["template_overview"] = df.groupby("Template Type", dropna=False).apply(compact_stats).reset_index()

    summaries["template_extraction_overview"] = (
        df.groupby(["Template Type", "Extraction"], dropna=False)
        .apply(compact_stats)
        .reset_index()
        .sort_values(["Template Type", "Extraction"])
    )

    summaries["batch_folder_overview"] = (
        df.groupby(["Batch Folder", "Template Type"], dropna=False)
        .apply(compact_stats)
        .reset_index()
        .sort_values(["Template Type", "Batch Folder"])
    )

    monthly = df.dropna(subset=["Validation Month"]).copy()
    summaries["monthly_time_series"] = (
        monthly.groupby(["Validation Month", "Template Type"], dropna=False)
        .apply(compact_stats)
        .reset_index()
        .sort_values(["Validation Month", "Template Type"])
    )
    summaries["monthly_time_series"]["Validation Month"] = summaries["monthly_time_series"][
        "Validation Month"
    ].dt.strftime("%Y-%m")

    yearly = df.dropna(subset=["Validation Year"]).copy()
    summaries["yearly_time_series"] = (
        yearly.groupby(["Validation Year", "Template Type"], dropna=False)
        .apply(compact_stats)
        .reset_index()
        .sort_values(["Validation Year", "Template Type"])
    )
    summaries["yearly_time_series"]["Validation Year"] = summaries["yearly_time_series"][
        "Validation Year"
    ].astype(int)

    dept_rows = []
    for template, group in df.groupby("Template Type", dropna=False):
        template_dept_total = group[WORD_COLS].fillna(0).sum().sum()
        for dept in WORD_COLS:
            values = group[dept].dropna()
            positive = values[values > 0]
            dept_rows.append(
                {
                    "Template Type": template,
                    "Department": dept,
                    "documents_with_section": int(values.shape[0]),
                    "documents_with_positive_words": int(positive.shape[0]),
                    "total_words": int(values.sum()),
                    "mean_when_present": round(values.mean(), 2) if not values.empty else np.nan,
                    "median_when_present": round(values.median(), 2) if not values.empty else np.nan,
                    "p90_when_present": round(values.quantile(0.90), 2) if not values.empty else np.nan,
                    "share_of_template_department_words_pct": pct(values.sum(), template_dept_total),
                }
            )
    summaries["department_word_counts_by_template"] = pd.DataFrame(dept_rows).sort_values(
        ["Template Type", "total_words"], ascending=[True, False]
    )

    manual_effect = (
        df.groupby(["Template Type", "Extraction"], dropna=False)
        .agg(
            documents=("File Name", "count"),
            mean_words=("Text Before Opinions", "mean"),
            median_words=("Text Before Opinions", "median"),
            mean_pages=("Document Page Count", "mean"),
            median_pages=("Document Page Count", "median"),
            mean_words_per_document_page=("Words Per Document Page", "mean"),
        )
        .reset_index()
    )
    for col in manual_effect.select_dtypes(include=[np.number]).columns:
        if col != "documents":
            manual_effect[col] = manual_effect[col].round(2)
    summaries["manual_vs_automated_effect"] = manual_effect.sort_values(["Template Type", "Extraction"])

    summaries["top_50_word_count_outliers"] = df.nlargest(50, "Text Before Opinions")[
        [
            "Batch Folder",
            "Template Type",
            "Extraction",
            "MC_Note_Type",
            "File Name",
            "Operation Number",
            "Validation Date",
            "Document Page Count",
            "Page count before opinion",
            "Annex Page Count",
            "Text Before Opinions",
            "Department Word Total",
            "GED Match Status",
        ]
    ].copy()
    summaries["top_50_word_count_outliers"]["Validation Date"] = summaries[
        "top_50_word_count_outliers"
    ]["Validation Date"].dt.strftime("%Y-%m-%d")

    summaries["data_quality_flags"] = pd.concat(
        [
            df.loc[df["Validation Date"].isna()].assign(Quality_Flag="Missing validation date"),
            df.loc[df["Validation Date"] > ANALYSIS_DATE].assign(Quality_Flag="Future validation date"),
            df.loc[df["Annex Page Count"].isna()].assign(Quality_Flag="Missing annex page count"),
            df.loc[df["GED Match Status"].isna()].assign(Quality_Flag="Missing GED match status"),
        ],
        ignore_index=True,
    )[
        [
            "Quality_Flag",
            "Batch Folder",
            "Template Type",
            "Extraction",
            "File Name",
            "Operation Number",
            "Validation Date",
            "Document Page Count",
            "Text Before Opinions",
            "GED Match Status",
        ]
    ]
    summaries["data_quality_flags"]["Validation Date"] = pd.to_datetime(
        summaries["data_quality_flags"]["Validation Date"], errors="coerce"
    ).dt.strftime("%Y-%m-%d")

    numeric_for_corr = df[
        [
            "Text Before Opinions",
            "Document Page Count",
            "Page count before opinion",
            "Annex Page Count",
            "Department Word Total",
            "Department Sections With Words",
            "Words Per Document Page",
        ]
    ]
    summaries["correlation_matrix"] = numeric_for_corr.corr(numeric_only=True).round(4).reset_index()

    return summaries


def make_charts(df: pd.DataFrame, summaries: dict[str, pd.DataFrame]) -> None:
    CHARTS.mkdir(exist_ok=True)
    plt.style.use("seaborn-v0_8-whitegrid")

    palette = {
        "AFS": "#376996",
        "GNG": "#2A9D8F",
        "OTHER": "#C1666B",
        "PIN": "#B88A2C",
    }

    overview = summaries["template_overview"].set_index("Template Type")
    fig, ax = plt.subplots(figsize=(8, 4.8))
    overview["documents"].sort_values(ascending=False).plot(
        kind="bar", ax=ax, color=[palette.get(x, "#666666") for x in overview.sort_values("documents", ascending=False).index]
    )
    ax.set_title("Document Volume by Template")
    ax.set_xlabel("Template")
    ax.set_ylabel("Documents")
    fig.tight_layout()
    fig.savefig(CHARTS / "document_volume_by_template.png", dpi=180)
    plt.close(fig)

    fig, ax = plt.subplots(figsize=(8, 4.8))
    order = ["AFS", "GNG", "OTHER", "PIN"]
    data = [df.loc[df["Template Type"] == t, "Text Before Opinions"].dropna() for t in order if t in set(df["Template Type"])]
    labels = [t for t in order if t in set(df["Template Type"])]
    ax.boxplot(data, tick_labels=labels, showfliers=False, patch_artist=True)
    ax.set_title("Word Count Distribution by Template (Outliers Hidden)")
    ax.set_xlabel("Template")
    ax.set_ylabel("Text Before Opinions")
    fig.tight_layout()
    fig.savefig(CHARTS / "word_count_distribution_by_template.png", dpi=180)
    plt.close(fig)

    monthly = summaries["monthly_time_series"].copy()
    monthly["Validation Month"] = pd.to_datetime(monthly["Validation Month"])
    pivot = monthly.pivot(index="Validation Month", columns="Template Type", values="documents").fillna(0)
    fig, ax = plt.subplots(figsize=(11, 5))
    for template in pivot.columns:
        ax.plot(pivot.index, pivot[template], label=template, color=palette.get(template))
    ax.set_title("Monthly Document Volume by Template")
    ax.set_xlabel("Validation Month")
    ax.set_ylabel("Documents")
    ax.legend(ncols=4, frameon=False)
    fig.tight_layout()
    fig.savefig(CHARTS / "monthly_document_volume_by_template.png", dpi=180)
    plt.close(fig)

    pivot_words = monthly.pivot(index="Validation Month", columns="Template Type", values="mean_words")
    fig, ax = plt.subplots(figsize=(11, 5))
    for template in pivot_words.columns:
        ax.plot(pivot_words.index, pivot_words[template], label=template, color=palette.get(template))
    ax.set_title("Monthly Average Word Count by Template")
    ax.set_xlabel("Validation Month")
    ax.set_ylabel("Mean Text Before Opinions")
    ax.legend(ncols=4, frameon=False)
    fig.tight_layout()
    fig.savefig(CHARTS / "monthly_average_words_by_template.png", dpi=180)
    plt.close(fig)

    fig, ax = plt.subplots(figsize=(8, 4.8))
    manual_rate = overview["manual_rate_pct"].sort_values(ascending=False)
    manual_rate.plot(kind="bar", ax=ax, color=[palette.get(x, "#666666") for x in manual_rate.index])
    ax.set_title("Manual Correction Rate by Template")
    ax.set_xlabel("Template")
    ax.set_ylabel("Manual Rate (%)")
    fig.tight_layout()
    fig.savefig(CHARTS / "manual_rate_by_template.png", dpi=180)
    plt.close(fig)

    dept = summaries["department_word_counts_by_template"]
    top_dept = dept.groupby("Department")["total_words"].sum().nlargest(8).index
    dept_pivot = (
        dept[dept["Department"].isin(top_dept)]
        .pivot(index="Template Type", columns="Department", values="share_of_template_department_words_pct")
        .fillna(0)
    )
    fig, ax = plt.subplots(figsize=(10, 5))
    dept_pivot.plot(kind="bar", stacked=True, ax=ax, colormap="tab20")
    ax.set_title("Top Department Word Share by Template")
    ax.set_xlabel("Template")
    ax.set_ylabel("Share of Department-Coded Words (%)")
    ax.legend(title="Department", bbox_to_anchor=(1.02, 1), loc="upper left", frameon=False)
    fig.tight_layout()
    fig.savefig(CHARTS / "department_word_share_by_template.png", dpi=180)
    plt.close(fig)

    sample = df.sample(min(3000, len(df)), random_state=7)
    fig, ax = plt.subplots(figsize=(8, 5))
    for template, group in sample.groupby("Template Type"):
        ax.scatter(
            group["Document Page Count"],
            group["Text Before Opinions"],
            label=template,
            alpha=0.45,
            s=16,
            color=palette.get(template),
        )
    ax.set_title("Pages vs Word Count")
    ax.set_xlabel("Document Page Count")
    ax.set_ylabel("Text Before Opinions")
    ax.legend(frameon=False)
    fig.tight_layout()
    fig.savefig(CHARTS / "pages_vs_word_count.png", dpi=180)
    plt.close(fig)


def fmt_int(value: float) -> str:
    if pd.isna(value):
        return ""
    return f"{int(round(value)):,}"


def fmt_float(value: float) -> str:
    if pd.isna(value):
        return ""
    return f"{value:,.2f}"


def make_report(df: pd.DataFrame, summaries: dict[str, pd.DataFrame]) -> None:
    overview = summaries["template_overview"].copy()
    overview = overview.sort_values("documents", ascending=False)
    focus = overview[overview["Template Type"].isin(["AFS", "GNG", "OTHER"])].copy()
    all_docs = len(df)
    manual_total = int((df["Extraction"] == "Manual").sum())
    automated_total = int((df["Extraction"] == "Automated").sum())
    valid_dates = df["Validation Date"].dropna()
    corr = summaries["correlation_matrix"].set_index("index")
    page_word_corr = corr.loc["Text Before Opinions", "Document Page Count"]

    table_lines = [
        "| Template | Documents | Automated | Manual | Manual Rate | Total Words | Mean Words | Median Words | Mean Pages | Median Pages |",
        "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for _, row in focus.iterrows():
        table_lines.append(
            "| {Template Type} | {documents:,} | {automated_documents:,} | {manual_documents:,} | "
            "{manual_rate_pct:.2f}% | {total_text_before_opinions_words:,} | {mean_words:,.2f} | "
            "{median_words:,.2f} | {mean_document_pages:,.2f} | {median_document_pages:,.2f} |".format(**row)
        )

    batch = summaries["batch_folder_overview"].copy()
    top_batch = batch.sort_values("documents", ascending=False).head(12)
    batch_lines = [
        "| Batch Folder | Template | Documents | Manual Rate | Mean Words | Mean Pages |",
        "|---|---|---:|---:|---:|---:|",
    ]
    for _, row in top_batch.iterrows():
        batch_lines.append(
            f"| {row['Batch Folder']} | {row['Template Type']} | {int(row['documents']):,} | "
            f"{row['manual_rate_pct']:.2f}% | {row['mean_words']:,.2f} | {row['mean_document_pages']:,.2f} |"
        )

    dept = summaries["department_word_counts_by_template"]
    dept_focus = dept[dept["Template Type"].isin(["AFS", "GNG", "OTHER"])]
    top_dept_lines = [
        "| Template | Top Department | Department Words | Share of Department-Coded Words |",
        "|---|---|---:|---:|",
    ]
    for template, group in dept_focus.groupby("Template Type"):
        row = group.sort_values("total_words", ascending=False).iloc[0]
        top_dept_lines.append(
            f"| {template} | {row['Department']} | {int(row['total_words']):,} | "
            f"{row['share_of_template_department_words_pct']:.2f}% |"
        )

    outliers = summaries["top_50_word_count_outliers"].head(10)
    outlier_lines = [
        "| Template | Extraction | Words | Pages | File Name |",
        "|---|---|---:|---:|---|",
    ]
    for _, row in outliers.iterrows():
        name = str(row["File Name"]).replace("|", " ")
        outlier_lines.append(
            f"| {row['Template Type']} | {row['Extraction']} | {int(row['Text Before Opinions']):,} | "
            f"{int(row['Document Page Count'])} | {name} |"
        )

    missing_dates = int(df["Validation Date"].isna().sum())
    future_dates = int((df["Validation Date"] > ANALYSIS_DATE).sum())
    missing_ged = int(df["GED Match Status"].isna().sum())
    missing_annex = int(df["Annex Page Count"].isna().sum())

    report = f"""# MC Note Database Analysis

## Scope

Input workbook: `{INPUT.name}`  
Main sheet analysed: `Database`  
Output folder: `Data Analysis`

I treated `Source` as the batch folder / batch source column and normalized the template labels to `AFS`, `GNG`, `OTHER`, and `PIN`. The requested analysis focuses on `AFS`, `GNG`, and `OTHER`; `PIN` is retained in the exported files so the future website can compare the full database when useful.

## Executive Overview

- Total records: {all_docs:,}
- Automated records: {automated_total:,} ({pct(automated_total, all_docs):.2f}%)
- Manual correction records: {manual_total:,} ({pct(manual_total, all_docs):.2f}%)
- Validation date coverage: {valid_dates.min().date().isoformat()} to {valid_dates.max().date().isoformat()}, with {missing_dates:,} missing validation dates and {future_dates:,} dates later than {ANALYSIS_DATE.date().isoformat()}
- Total `Text Before Opinions` words: {fmt_int(df["Text Before Opinions"].sum())}
- Mean / median `Text Before Opinions` words: {fmt_float(df["Text Before Opinions"].mean())} / {fmt_float(df["Text Before Opinions"].median())}
- Mean / median document pages: {fmt_float(df["Document Page Count"].mean())} / {fmt_float(df["Document Page Count"].median())}
- Correlation between document pages and word count: {page_word_corr:.3f}

## Template Summary

{chr(10).join(table_lines)}

## Batch Folder View

The largest batch folders are heavily concentrated in the `OTHER` and main year-specific AFS/GNG folders. Manual batches mostly appear through `M...` source labels, but the `Extraction` column is the authoritative manual-vs-automated indicator in this analysis.

{chr(10).join(batch_lines)}

## Department Word Counts

Department-coded word counts are sparse by design: many documents only have words in a subset of department columns. For template-level interpretation, the most useful measure is share of department-coded words rather than simple non-null counts.

{chr(10).join(top_dept_lines)}

Full department-by-template detail is exported to `department_word_counts_by_template.csv`.

## Time Series

The workbook supports monthly and yearly analysis using `Validation Date`. Monthly exports include volume, manual rate, average word counts, median word counts, and page-count summaries by template. These are ready for the interactive website as filterable trend lines.

Charts:

- `charts/monthly_document_volume_by_template.png`
- `charts/monthly_average_words_by_template.png`
- `charts/manual_rate_by_template.png`
- `charts/word_count_distribution_by_template.png`
- `charts/pages_vs_word_count.png`
- `charts/department_word_share_by_template.png`

## Outlier Snapshot

Top 10 records by `Text Before Opinions`:

{chr(10).join(outlier_lines)}

Full top-50 detail is exported to `top_50_word_count_outliers.csv`.

## Data Quality Notes

- Missing validation dates: {missing_dates:,}
- Future validation dates after {ANALYSIS_DATE.date().isoformat()}: {future_dates:,}
- Missing annex page counts: {missing_annex:,}
- Missing GED match status: {missing_ged:,}

These rows are exported to `data_quality_flags.csv`. The missing GED match status count is high enough that GED matching should be shown as a website filter or data-quality badge, not hidden in the background.

## Statistical Analysis Options

1. Descriptive baseline dashboard: template volume, manual rate, word-count distributions, page-count distributions, department-coded word shares, and batch-folder drilldowns.
2. Manual vs automated comparison: compare word/page distributions within each template using medians, robust spread, bootstrap confidence intervals, and non-parametric tests. This answers whether manual correction work clusters around larger or more complex documents.
3. Batch-folder quality analysis: rank batch folders by manual rate, missing metadata, outlier frequency, and GED match quality. This is probably the best operational view for spotting extraction/process issues.
4. Time-series trend analysis: monthly volumes, moving averages, seasonality by template, and before/after comparisons for process changes. This can also reveal whether 2026 partial-year data should be normalized.
5. Outlier and anomaly review: flag unusually high word counts, unusually high pages-per-word ratios, high annex counts, or documents whose department word total diverges sharply from `Text Before Opinions`.
6. Mix-adjusted modelling: estimate expected word count using template, page count, extraction type, batch folder, and month/year. This separates "AFS documents are longer" from "this specific batch is unusual."
7. Website-ready exploration: interactive filters for template, extraction type, batch folder, date range, GED match status, and department. Recommended views are Overview, Word Counts, Pages, Manual Corrections, Time Series, Batch Folders, and Data Quality.

## Exported Files

- `cleaned_database.csv`
- `template_overview.csv`
- `template_extraction_overview.csv`
- `batch_folder_overview.csv`
- `department_word_counts_by_template.csv`
- `monthly_time_series.csv`
- `yearly_time_series.csv`
- `manual_vs_automated_effect.csv`
- `top_50_word_count_outliers.csv`
- `data_quality_flags.csv`
- `correlation_matrix.csv`
- `mc_note_analysis_outputs.xlsx`
"""

    (OUT / "README.md").write_text(dedent(report).strip() + "\n", encoding="utf-8")


def main() -> None:
    OUT.mkdir(exist_ok=True)
    CHARTS.mkdir(exist_ok=True)
    df = read_database()

    cleaned = df.copy()
    for col in ["Validation Date", "Validation Month"]:
        cleaned[col] = pd.to_datetime(cleaned[col], errors="coerce").dt.strftime(
            "%Y-%m-%d" if col == "Validation Date" else "%Y-%m"
        )
    write_csv(cleaned, "cleaned_database.csv")

    summaries = make_summaries(df)
    for name, table in summaries.items():
        write_csv(table, f"{name}.csv")

    with pd.ExcelWriter(OUT / "mc_note_analysis_outputs.xlsx", engine="openpyxl") as writer:
        cleaned.to_excel(writer, sheet_name="cleaned_database", index=False)
        for name, table in summaries.items():
            sheet = name[:31]
            table.to_excel(writer, sheet_name=sheet, index=False)

    make_charts(df, summaries)
    make_report(df, summaries)
    print(f"Analysis complete: {OUT}")


if __name__ == "__main__":
    main()
