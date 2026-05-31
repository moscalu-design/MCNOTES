from __future__ import annotations

import json
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

EXPECTED_TEMPLATE_DEPARTMENTS = {
    "GNG": {"PJ", "RM", "OCCO", "JU", "ECON"},
    "PIN": {"PJ", "RM", "OCCO", "JU", "ECON"},
    "AFS": {"OPS", "GLO", "PJ", "RM", "OCCO", "JU", "ECON"},
}


def clean_value(value):
    if pd.isna(value):
        return None
    if isinstance(value, pd.Timestamp):
        return value.strftime("%Y-%m-%d")
    if hasattr(value, "item"):
        return value.item()
    return value


def status_from_count(count: int, warn_at: int = 1) -> str:
    return "pass" if count < warn_at else "warn"


def row_payload(row: pd.Series, extra: dict | None = None) -> dict:
    base = {
        "Batch Folder": row.get("Batch Folder"),
        "Template Type": row.get("Template Type"),
        "Extraction": row.get("Extraction"),
        "MC_Note_Type": row.get("MC_Note_Type"),
        "File Name": row.get("File Name"),
        "Operation Number": row.get("Operation Number"),
        "Validation Date": row.get("Validation Date"),
        "Document Page Count": row.get("Document Page Count"),
        "Text Before Opinions": row.get("Text Before Opinions"),
        "GED Match Status": row.get("GED Match Status"),
    }
    if extra:
        base.update(extra)
    return {key: clean_value(value) for key, value in base.items()}


def top_rows(df: pd.DataFrame, sort_col: str, limit: int = 25) -> list[dict]:
    if df.empty:
        return []
    rows = df.sort_values(sort_col, ascending=False).head(limit)
    return [row_payload(row) for _, row in rows.iterrows()]


def main() -> None:
    df = pd.read_csv(ROOT / "cleaned_database.csv")
    df["Validation Date Parsed"] = pd.to_datetime(df["Validation Date"], errors="coerce")
    for col in [
        "Document Page Count",
        "Page count before opinion",
        "Annex Page Count",
        "Text Before Opinions",
        "Department Word Total",
        "Words Per Document Page",
        *DEPARTMENTS,
    ]:
        df[col] = pd.to_numeric(df[col], errors="coerce")

    tests = []
    detail_rows = []

    gng = df[df["Template Type"] == "GNG"].copy()
    unexpected_gng = sorted(set(DEPARTMENTS) - EXPECTED_TEMPLATE_DEPARTMENTS["GNG"])
    gng_leak_rows = []
    for dept in unexpected_gng:
        hit = gng[gng[dept].fillna(0) > 0].copy()
        for _, row in hit.iterrows():
            gng_leak_rows.append(row_payload(row, {"Department": dept, "Department Words": row[dept]}))

    tests.append(
        {
            "id": "gng-unexpected-departments",
            "category": "Department schema",
            "title": "GNG has no words in non-GNG department columns",
            "status": status_from_count(len(gng_leak_rows)),
            "metric": len(gng_leak_rows),
            "unit": "rows",
            "finding": (
                "No GNG rows have positive words in SG, OPS, GLO, CFC, EIF, FI, IG, PMM, GIS, HR, or OTHER."
                if not gng_leak_rows
                else "Some GNG rows have positive words outside the expected GNG department set."
            ),
            "recommendation": "Keep the dashboard department chart template-aware so OTHER/AFS department words cannot be mistaken for GNG words.",
            "rows": gng_leak_rows[:25],
        }
    )

    for dept in sorted(EXPECTED_TEMPLATE_DEPARTMENTS["GNG"]):
        missing = int((gng[dept].fillna(0) <= 0).sum())
        positive = int((gng[dept].fillna(0) > 0).sum())
        tests.append(
            {
                "id": f"gng-{dept.lower()}-coverage",
                "category": "Department coverage",
                "title": f"GNG {dept} coverage",
                "status": "pass" if positive / max(len(gng), 1) >= 0.65 else "warn",
                "metric": round((positive / max(len(gng), 1)) * 100, 2),
                "unit": "% rows positive",
                "finding": f"{positive:,} of {len(gng):,} GNG rows have positive {dept} words; {missing:,} are zero or missing.",
                "recommendation": "Low coverage may be normal for optional sections; investigate only if this department is expected in every GNG.",
                "rows": [],
            }
        )

    single_dept_exceeds_total = []
    for dept in DEPARTMENTS:
        hit = df[df[dept].fillna(0) > df["Text Before Opinions"].fillna(0)].copy()
        hit["Offending Department"] = dept
        hit["Department Words"] = hit[dept]
        single_dept_exceeds_total.extend(
            row_payload(row, {"Department": dept, "Department Words": row["Department Words"]})
            for _, row in hit.iterrows()
        )
    tests.append(
        {
            "id": "single-department-exceeds-total",
            "category": "Word-count consistency",
            "title": "No single department should exceed total text-before-opinion words",
            "status": status_from_count(len(single_dept_exceeds_total)),
            "metric": len(single_dept_exceeds_total),
            "unit": "rows",
            "finding": f"{len(single_dept_exceeds_total):,} rows have a department word count greater than the document's total text-before-opinions words.",
            "recommendation": "Review these as likely extraction, section-boundary, or source-field anomalies before modelling department shares.",
            "rows": single_dept_exceeds_total[:25],
        }
    )

    df["Department To Total Ratio"] = df["Department Word Total"] / df["Text Before Opinions"].replace(0, np.nan)
    high_ratio = df[df["Department To Total Ratio"] > 1.25].copy()
    tests.append(
        {
            "id": "department-total-ratio",
            "category": "Word-count consistency",
            "title": "Department total is not much larger than document text",
            "status": status_from_count(len(high_ratio)),
            "metric": len(high_ratio),
            "unit": "rows",
            "finding": f"{len(high_ratio):,} rows have department-coded totals above 125% of text-before-opinions words.",
            "recommendation": "Use this as an anomaly layer, not as a hard failure: department columns may overlap in some files.",
            "rows": [
                row_payload(row, {"Department/Total Ratio": round(row["Department To Total Ratio"], 2)})
                for _, row in high_ratio.sort_values("Department To Total Ratio", ascending=False).head(25).iterrows()
            ],
        }
    )

    future = df[df["Validation Date Parsed"] > ANALYSIS_DATE].copy()
    tests.append(
        {
            "id": "future-validation-dates",
            "category": "Date quality",
            "title": "Validation dates are not later than analysis date",
            "status": status_from_count(len(future)),
            "metric": len(future),
            "unit": "rows",
            "finding": f"{len(future):,} rows have validation dates later than {ANALYSIS_DATE.date().isoformat()}.",
            "recommendation": "Treat future-dated rows as scheduled/future records or date-field parsing candidates in time-series charts.",
            "rows": [row_payload(row) for _, row in future.sort_values("Validation Date Parsed").head(25).iterrows()],
        }
    )

    missing_dates = df[df["Validation Date Parsed"].isna()].copy()
    tests.append(
        {
            "id": "missing-validation-dates",
            "category": "Date quality",
            "title": "Validation date is populated",
            "status": status_from_count(len(missing_dates)),
            "metric": len(missing_dates),
            "unit": "rows",
            "finding": f"{len(missing_dates):,} rows have no validation date.",
            "recommendation": "Keep these rows in default volume totals, but exclude them from date-filtered trend calculations.",
            "rows": [row_payload(row) for _, row in missing_dates.head(25).iterrows()],
        }
    )

    missing_ged = df[df["GED Match Status"].isna()].copy()
    tests.append(
        {
            "id": "missing-ged-status",
            "category": "Match quality",
            "title": "GED match status is populated",
            "status": "warn" if len(missing_ged) else "pass",
            "metric": len(missing_ged),
            "unit": "rows",
            "finding": f"{len(missing_ged):,} rows have missing GED match status.",
            "recommendation": "Use GED status as a dashboard filter and avoid treating unmatched records as missing from the corpus.",
            "rows": [row_payload(row) for _, row in missing_ged.head(25).iterrows()],
        }
    )

    outlier_rows = []
    for template, group in df.groupby("Template Type"):
        q1 = group["Text Before Opinions"].quantile(0.25)
        q3 = group["Text Before Opinions"].quantile(0.75)
        iqr = q3 - q1
        high = q3 + 1.5 * iqr
        low = max(0, q1 - 1.5 * iqr)
        hit = group[(group["Text Before Opinions"] > high) | (group["Text Before Opinions"] < low)].copy()
        hit["Outlier Boundary Low"] = low
        hit["Outlier Boundary High"] = high
        outlier_rows.extend(
            row_payload(
                row,
                {
                    "Outlier Low": round(row["Outlier Boundary Low"], 2),
                    "Outlier High": round(row["Outlier Boundary High"], 2),
                },
            )
            for _, row in hit.iterrows()
        )
    tests.append(
        {
            "id": "word-count-iqr-outliers",
            "category": "Statistical outliers",
            "title": "Template-adjusted word-count outliers",
            "status": "info",
            "metric": len(outlier_rows),
            "unit": "rows",
            "finding": f"{len(outlier_rows):,} rows sit outside the 1.5x IQR template-specific word-count range.",
            "recommendation": "Use these for review queues and robust statistics; do not remove them automatically.",
            "rows": outlier_rows[:25],
        }
    )

    manual_rows = []
    for template, group in df.groupby("Template Type"):
        manual = group[group["Extraction"] == "Manual"]["Text Before Opinions"].dropna()
        auto = group[group["Extraction"] == "Automated"]["Text Before Opinions"].dropna()
        if manual.empty or auto.empty:
            continue
        manual_rows.append(
            {
                "Template Type": template,
                "Manual Documents": int(manual.shape[0]),
                "Automated Documents": int(auto.shape[0]),
                "Manual Median Words": round(float(manual.median()), 2),
                "Automated Median Words": round(float(auto.median()), 2),
                "Median Difference": round(float(manual.median() - auto.median()), 2),
            }
        )
    tests.append(
        {
            "id": "manual-automated-median-difference",
            "category": "Manual correction",
            "title": "Manual vs automated median word-count difference",
            "status": "info",
            "metric": len(manual_rows),
            "unit": "templates",
            "finding": "Manual and automated medians differ by template; use the table to decide whether manual work is size-biased.",
            "recommendation": "For formal inference, add a Mann-Whitney or bootstrap confidence interval by template.",
            "rows": manual_rows,
        }
    )

    sg_positive = df[df["SG"].fillna(0) > 0].copy()
    sg_by_template = (
        sg_positive.groupby("Template Type")
        .agg(rows=("File Name", "count"), total_sg_words=("SG", "sum"), mean_sg_words=("SG", "mean"))
        .reset_index()
        .sort_values("total_sg_words", ascending=False)
    )
    tests.append(
        {
            "id": "sg-template-distribution",
            "category": "Department schema",
            "title": "SG word counts appear only where expected",
            "status": "pass" if set(sg_by_template["Template Type"]) <= {"OTHER"} else "warn",
            "metric": int(sg_positive.shape[0]),
            "unit": "rows",
            "finding": "Positive SG word counts are confined to OTHER records in the current data." if not sg_by_template.empty else "No positive SG word counts found.",
            "recommendation": "Show SG with template context; never show an all-template department chart as if it describes GNG.",
            "rows": [
                {key: clean_value(value) for key, value in row.items()}
                for row in sg_by_template.to_dict(orient="records")
            ],
        }
    )

    flat_rows = []
    for test in tests:
        flat_rows.append(
            {
                "id": test["id"],
                "category": test["category"],
                "title": test["title"],
                "status": test["status"],
                "metric": test["metric"],
                "unit": test["unit"],
                "finding": test["finding"],
                "recommendation": test["recommendation"],
            }
        )
        for row in test["rows"]:
            detail = {"test_id": test["id"], "test_title": test["title"]}
            detail.update(row)
            detail_rows.append(detail)

    (ROOT / "dashboard_tests.json").write_text(
        json.dumps({"tests": tests}, ensure_ascii=True, indent=2),
        encoding="utf-8",
    )
    pd.DataFrame(flat_rows).to_csv(ROOT / "dashboard_tests_summary.csv", index=False, encoding="utf-8-sig")
    pd.DataFrame(detail_rows).to_csv(ROOT / "dashboard_tests_detail.csv", index=False, encoding="utf-8-sig")
    print(f"Wrote {len(tests)} tests")


if __name__ == "__main__":
    main()
