from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd


DATA_DIR = Path(__file__).resolve().parents[1]
PROJECT_ROOT = DATA_DIR.parent
EXPORTS = DATA_DIR / "Exports"
REPORTS = DATA_DIR / "Reports"
CHARTS = DATA_DIR / "charts"
WORKBOOKS = DATA_DIR / "Workbooks"

SOURCE_WORKBOOK = DATA_DIR / "Master Table.xlsx"
SOURCE_SHEET = "Master_Table_Q"
SOURCE_LABEL = f"{SOURCE_WORKBOOK.name} / {SOURCE_SHEET}"
ANALYSIS_DATE = pd.Timestamp("2026-06-02")
GED_NOT_AVAILABLE = "Not included in Master_Table_Q"

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

BO_TEAM_SERVICE_COLS = {
    "PJ": "BO PJ",
    "RM": "BO RM",
    "JU": "BO JU",
    "ECON": "BO ECON",
}

OPTIONAL_COLUMNS = [
    "New AFS Process",
    "Financing Product Name",
    "Operation Special Activities Flag",
    "BO Validation Date",
    "BO Author (OPS/GLO)",
    "BO PJ",
    "BO RM",
    "BO JU",
    "BO ECON",
    "BO Operation Team OPS/GLO Main Division Short Name",
    "GED Match Status",
]

NUMERIC_COLS = [
    "Document Page Count",
    "Page count before opinion",
    "Annex Page Count",
    "Text Before Opinions",
    *WORD_COLS,
]


def ensure_dirs() -> None:
    for folder in [EXPORTS, REPORTS, CHARTS, WORKBOOKS]:
        folder.mkdir(exist_ok=True)


def clean_text(value: object) -> str:
    if pd.isna(value):
        return ""
    return str(value).strip()


def load_source_table() -> pd.DataFrame:
    df = pd.read_excel(SOURCE_WORKBOOK, sheet_name=SOURCE_SHEET, header=0)
    df = df.loc[:, ~df.columns.astype(str).str.startswith("Unnamed")]
    df = df.dropna(how="all").copy()

    for col in OPTIONAL_COLUMNS:
        if col not in df.columns:
            df[col] = np.nan
    if "GED Match Status" in df.columns:
        df["GED Match Status"] = df["GED Match Status"].fillna(GED_NOT_AVAILABLE)

    for col in NUMERIC_COLS:
        df[col] = pd.to_numeric(df[col], errors="coerce")

    df["Validation Date"] = pd.to_datetime(df["Validation Date"], errors="coerce")
    df["BO Validation Date"] = pd.to_datetime(df["BO Validation Date"], errors="coerce")
    df["Template Type"] = df["Template"].replace({"Other": "OTHER"}).astype(str).str.upper().str.strip()
    df["Batch Folder"] = df["Source"]
    df["Extraction"] = df["Extraction"].astype(str).str.strip()
    df["Department Word Total"] = df[WORD_COLS].fillna(0).sum(axis=1)
    df["Department Sections With Words"] = (df[WORD_COLS].fillna(0) > 0).sum(axis=1)
    df["Words Per Document Page"] = df["Text Before Opinions"] / df["Document Page Count"].replace(0, np.nan)
    df["Words Per Pre Opinion Page"] = df["Text Before Opinions"] / df[
        "Page count before opinion"
    ].replace(0, np.nan)
    df["Validation Month"] = df["Validation Date"].dt.to_period("M").dt.to_timestamp()
    df["Validation Year"] = df["Validation Date"].dt.year
    df["BO Validation Month"] = df["BO Validation Date"].dt.to_period("M").dt.to_timestamp()
    df["BO Validation Year"] = df["BO Validation Date"].dt.year
    df["BO Validation Delta Days"] = (df["BO Validation Date"] - df["Validation Date"]).dt.days
    df["Has Validation Date"] = df["Validation Date"].notna()
    df["Has BO Validation Date"] = df["BO Validation Date"].notna()
    df["Has Missing GED"] = df["GED Match Status"].eq(GED_NOT_AVAILABLE)
    df["Financing Product Name"] = df["Financing Product Name"].map(clean_text).replace("", "Missing product")

    return df


def format_dates_for_export(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    date_formats = {
        "Validation Date": "%Y-%m-%d",
        "Validation Month": "%Y-%m",
        "BO Validation Date": "%Y-%m-%d",
        "BO Validation Month": "%Y-%m",
    }
    for col, fmt in date_formats.items():
        if col in out.columns:
            out[col] = pd.to_datetime(out[col], errors="coerce").dt.strftime(fmt)
    return out
