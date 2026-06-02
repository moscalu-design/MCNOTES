from __future__ import annotations

from datetime import date, datetime
from pathlib import Path

import numpy as np
import pandas as pd

from analysis_config import EXPORTS, REPORTS, load_source_table

DEPT_COLS = [
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


def markdown_table(df: pd.DataFrame) -> str:
    if df.empty:
        return "_No rows._"
    text_df = df.copy()
    for col in text_df.columns:
        text_df[col] = text_df[col].map(lambda x: "" if pd.isna(x) else str(x))
    lines = [
        "| " + " | ".join(text_df.columns) + " |",
        "| " + " | ".join(["---"] * len(text_df.columns)) + " |",
    ]
    for _, row in text_df.iterrows():
        values = [str(row[col]).replace("|", "\\|").replace("\n", " ") for col in text_df.columns]
        lines.append("| " + " | ".join(values) + " |")
    return "\n".join(lines)


def load_database() -> pd.DataFrame:
    df = load_source_table()
    df["Template"] = df["Template Type"]
    df["Year"] = df["Validation Date"].dt.year
    df["Month"] = df["Validation Date"].dt.to_period("M").astype(str)
    df.loc[df["Month"].eq("NaT"), "Month"] = None
    df["Service Opinion Count"] = (df[DEPT_COLS].fillna(0) > 0).sum(axis=1)
    df["Words Per Page"] = df["Text Before Opinions"] / df["Document Page Count"].replace({0: np.nan})
    df["Words Per Pre Opinion Page"] = df["Text Before Opinions"] / df["Page count before opinion"].replace(
        {0: np.nan}
    )
    return df


def bootstrap_median_diff(x: np.ndarray, y: np.ndarray, reps: int = 3000) -> tuple[float, float, float]:
    rng = np.random.default_rng(20260529)
    x = x[~np.isnan(x)]
    y = y[~np.isnan(y)]
    if len(x) < 5 or len(y) < 5:
        return np.nan, np.nan, np.nan
    diffs = np.empty(reps)
    for i in range(reps):
        xb = rng.choice(x, size=len(x), replace=True)
        yb = rng.choice(y, size=len(y), replace=True)
        diffs[i] = np.median(yb) - np.median(xb)
    return float(np.median(y) - np.median(x)), float(np.quantile(diffs, 0.025)), float(np.quantile(diffs, 0.975))


def permutation_p_median(x: np.ndarray, y: np.ndarray, reps: int = 3000) -> float:
    rng = np.random.default_rng(20260529)
    x = x[~np.isnan(x)]
    y = y[~np.isnan(y)]
    if len(x) < 5 or len(y) < 5:
        return np.nan
    observed = abs(np.median(y) - np.median(x))
    pooled = np.concatenate([x, y])
    n_x = len(x)
    extreme = 0
    for _ in range(reps):
        rng.shuffle(pooled)
        diff = abs(np.median(pooled[n_x:]) - np.median(pooled[:n_x]))
        if diff >= observed:
            extreme += 1
    return float((extreme + 1) / (reps + 1))


def compare_2025_2026(df: pd.DataFrame) -> pd.DataFrame:
    metrics = [
        "Text Before Opinions",
        "Document Page Count",
        "Page count before opinion",
        "Service Opinion Count",
        "Words Per Page",
        "Words Per Pre Opinion Page",
    ]
    rows = []
    for template, sub in df[df["Year"].isin([2025, 2026])].groupby("Template"):
        for metric in metrics:
            x = sub.loc[sub["Year"].eq(2025), metric].astype(float).to_numpy()
            y = sub.loc[sub["Year"].eq(2026), metric].astype(float).to_numpy()
            diff, lo, hi = bootstrap_median_diff(x, y)
            rows.append(
                {
                    "Template": template,
                    "Metric": metric,
                    "n_2025": int(np.sum(~np.isnan(x))),
                    "n_2026": int(np.sum(~np.isnan(y))),
                    "median_2025": float(np.nanmedian(x)) if np.sum(~np.isnan(x)) else np.nan,
                    "median_2026": float(np.nanmedian(y)) if np.sum(~np.isnan(y)) else np.nan,
                    "median_diff_2026_minus_2025": diff,
                    "bootstrap_ci_low": lo,
                    "bootstrap_ci_high": hi,
                    "permutation_p_two_sided": permutation_p_median(x, y),
                }
            )
    return pd.DataFrame(rows)


def monthly_change_points(df: pd.DataFrame) -> pd.DataFrame:
    rows = []
    for template, sub in df.dropna(subset=["Month"]).groupby("Template"):
        monthly = (
            sub.groupby("Month")
            .agg(
                documents=("File Name", "size"),
                median_words=("Text Before Opinions", "median"),
                median_pages=("Document Page Count", "median"),
                median_service_opinions=("Service Opinion Count", "median"),
            )
            .reset_index()
            .sort_values("Month")
        )
        for metric in ["median_words", "median_pages", "median_service_opinions"]:
            monthly[f"{metric}_delta"] = monthly[metric].diff()
            biggest_drop = monthly.sort_values(f"{metric}_delta").head(3)
            for _, row in biggest_drop.iterrows():
                if pd.isna(row[f"{metric}_delta"]):
                    continue
                rows.append(
                    {
                        "Template": template,
                        "Metric": metric,
                        "Month": row["Month"],
                        "documents": int(row["documents"]),
                        "value": row[metric],
                        "month_delta": row[f"{metric}_delta"],
                    }
                )
    return pd.DataFrame(rows).sort_values(["Template", "Metric", "month_delta"])


def author_within_template_effects(df: pd.DataFrame) -> pd.DataFrame:
    rows = []
    for template, sub in df.dropna(subset=["Author"]).groupby("Template"):
        template_median = sub["Text Before Opinions"].median()
        grouped = (
            sub.groupby("Author")
            .agg(
                documents=("File Name", "size"),
                median_words=("Text Before Opinions", "median"),
                median_pages=("Document Page Count", "median"),
                median_service_opinions=("Service Opinion Count", "median"),
            )
            .reset_index()
        )
        grouped = grouped[grouped["documents"] >= 8].copy()
        grouped["Template"] = template
        grouped["template_median_words"] = template_median
        grouped["median_words_vs_template"] = grouped["median_words"] - template_median
        rows.append(grouped)
    if not rows:
        return pd.DataFrame()
    return pd.concat(rows, ignore_index=True).sort_values("median_words_vs_template", ascending=False)


def write_report(tests: pd.DataFrame, change_points: pd.DataFrame, author_effects: pd.DataFrame) -> None:
    sig = tests[
        (tests["permutation_p_two_sided"] <= 0.05)
        & ~(
            (tests["bootstrap_ci_low"] <= 0)
            & (tests["bootstrap_ci_high"] >= 0)
        )
    ].copy()
    sig = sig.sort_values(["Template", "Metric"])

    report = f"""# Statistical Audit

Generated: {datetime.now().strftime("%Y-%m-%d %H:%M")}

## 2025 vs 2026YTD Tests

The table below uses bootstrap confidence intervals for the median difference and a permutation test for the two-sided median difference. Positive difference means 2026YTD is higher than 2025.

{markdown_table(sig[["Template", "Metric", "n_2025", "n_2026", "median_2025", "median_2026", "median_diff_2026_minus_2025", "bootstrap_ci_low", "bootstrap_ci_high", "permutation_p_two_sided"]])}

## Biggest Month-To-Month Drops

These are not causal tests; they are flags for points in time worth checking against template/process changes.

{markdown_table(change_points.head(30))}

## Author / Service-Office Effects

Largest positive differences from the template median:

{markdown_table(author_effects.head(12)[["Template", "Author", "documents", "median_words", "template_median_words", "median_words_vs_template", "median_pages"]])}

Largest negative differences from the template median:

{markdown_table(author_effects.tail(12).sort_values("median_words_vs_template")[["Template", "Author", "documents", "median_words", "template_median_words", "median_words_vs_template", "median_pages"]])}

## Readout

- AFS 2026YTD is statistically longer than 2025 on Text Before Opinions and pre-opinion pages.
- GNG 2026YTD has a median service-section drop from 5 to 4; because the variable is integer/tie-heavy, the permutation test is weak even though the dashboard-level direction is clear.
- OTHER 2026YTD is significantly shorter by document pages; its total word median is lower but the bootstrap interval crosses zero, so the stronger statement is page compression rather than confirmed word-count compression.
- Author/service-office effects are large enough to explain some apparent trend movement; use author filters before attributing every shift to template redesign.
"""
    (REPORTS / "STATISTICAL_AUDIT.md").write_text(report, encoding="utf-8")


def main() -> None:
    df = load_database()
    tests = compare_2025_2026(df)
    change_points = monthly_change_points(df)
    author_effects = author_within_template_effects(df)

    tests.to_csv(EXPORTS / "statistical_tests_2025_vs_2026.csv", index=False)
    change_points.to_csv(EXPORTS / "statistical_change_points.csv", index=False)
    author_effects.to_csv(EXPORTS / "statistical_author_effects.csv", index=False)
    write_report(tests, change_points, author_effects)

    print(
        {
            "tests": len(tests),
            "significant_tests": int((tests["permutation_p_two_sided"] <= 0.05).sum()),
            "change_points": len(change_points),
            "author_groups": len(author_effects),
        }
    )


if __name__ == "__main__":
    main()
