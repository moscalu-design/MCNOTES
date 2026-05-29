from __future__ import annotations

import json
from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parent
ANALYSIS_DATE = pd.Timestamp("2026-05-29")

RECORD_COLUMNS = [
    "Batch Folder",
    "Template Type",
    "Extraction",
    "MC_Note_Type",
    "File Name",
    "Operation Number",
    "Validation Date",
    "Validation Month",
    "Validation Year",
    "Document Page Count",
    "Page count before opinion",
    "Annex Page Count",
    "Text Before Opinions",
    "Department Word Total",
    "Department Sections With Words",
    "Words Per Document Page",
    "Words Per Pre Opinion Page",
    "GED Match Status",
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


def clean_value(value):
    if pd.isna(value):
        return None
    if isinstance(value, pd.Timestamp):
        return value.strftime("%Y-%m-%d")
    if hasattr(value, "item"):
        return value.item()
    return value


def records_from_csv(path: Path, columns: list[str] | None = None) -> list[dict]:
    df = pd.read_csv(path)
    if columns:
        df = df[columns]
    for col in ["Validation Date", "Validation Month"]:
        if col in df.columns:
            df[col] = df[col].astype(str).replace({"nan": None, "NaT": None})
    rows = []
    for row in df.to_dict(orient="records"):
        rows.append({key: clean_value(value) for key, value in row.items()})
    return rows


def load_tests() -> dict:
    path = ROOT / "dashboard_tests.json"
    if not path.exists():
        return {"tests": []}
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> None:
    cleaned = pd.read_csv(ROOT / "cleaned_database.csv")
    cleaned = cleaned[RECORD_COLUMNS].copy()
    cleaned["Validation Date Parsed"] = pd.to_datetime(cleaned["Validation Date"], errors="coerce")
    cleaned["Is Future Date"] = cleaned["Validation Date Parsed"] > ANALYSIS_DATE
    cleaned["Has Missing Date"] = cleaned["Validation Date Parsed"].isna()
    cleaned["Has Missing GED"] = cleaned["GED Match Status"].isna()
    cleaned["Operation Number"] = cleaned["Operation Number"].where(
        cleaned["Operation Number"].notna(), None
    )
    cleaned = cleaned.drop(columns=["Validation Date Parsed"])

    numeric_cols = [
        "Validation Year",
        "Document Page Count",
        "Page count before opinion",
        "Annex Page Count",
        "Text Before Opinions",
        "Department Word Total",
        "Department Sections With Words",
        "Words Per Document Page",
        "Words Per Pre Opinion Page",
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
    for col in numeric_cols:
        cleaned[col] = pd.to_numeric(cleaned[col], errors="coerce")

    rows = []
    for row in cleaned.to_dict(orient="records"):
        rows.append({key: clean_value(value) for key, value in row.items()})

    payload = {
        "meta": {
            "sourceWorkbook": "MC_Note_Datebase.xlsx",
            "sourceSheet": "Database",
            "generatedFrom": "Data Analysis exports",
            "analysisDate": ANALYSIS_DATE.strftime("%Y-%m-%d"),
            "recordCount": len(rows),
            "templates": sorted(cleaned["Template Type"].dropna().unique().tolist()),
            "extractions": sorted(cleaned["Extraction"].dropna().unique().tolist()),
            "batchFolders": sorted(cleaned["Batch Folder"].dropna().unique().tolist()),
            "departments": [
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
            ],
        },
        "records": rows,
        "templateOverview": records_from_csv(ROOT / "template_overview.csv"),
        "monthlyTimeSeries": records_from_csv(ROOT / "monthly_time_series.csv"),
        "departmentByTemplate": records_from_csv(ROOT / "department_word_counts_by_template.csv"),
        "batchOverview": records_from_csv(ROOT / "batch_folder_overview.csv"),
        "dataQuality": records_from_csv(ROOT / "data_quality_flags.csv"),
        "tests": load_tests()["tests"],
    }

    (ROOT / "dashboard_data.json").write_text(
        json.dumps(payload, ensure_ascii=True, separators=(",", ":")),
        encoding="utf-8",
    )
    print(f"Wrote {ROOT / 'dashboard_data.json'} with {len(rows):,} records")


if __name__ == "__main__":
    main()
