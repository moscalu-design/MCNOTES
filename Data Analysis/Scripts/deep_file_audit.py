from __future__ import annotations

import json
import re
import unicodedata
from collections import defaultdict
from datetime import date, datetime
from pathlib import Path

import fitz
import pandas as pd

from analysis_config import ANALYSIS_DATE, EXPORTS, PROJECT_ROOT, REPORTS, load_source_table


ROOT = PROJECT_ROOT
OUT = EXPORTS
TODAY = ANALYSIS_DATE.date()

PDF_ROOTS = {
    "AFS": ROOT / "AFS_Package" / "AFS_File_Folder",
    "GNG": ROOT / "GNG_Package" / "GNG File Folder",
    "OTHER": ROOT / "OTHER_Package" / "OTHER_File_Folder",
}

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
    headers = list(text_df.columns)
    lines = [
        "| " + " | ".join(headers) + " |",
        "| " + " | ".join(["---"] * len(headers)) + " |",
    ]
    for _, row in text_df.iterrows():
        values = [str(row[col]).replace("|", "\\|").replace("\n", " ") for col in headers]
        lines.append("| " + " | ".join(values) + " |")
    return "\n".join(lines)


def normalize_template(value: object) -> str:
    text = str(value or "").strip().upper()
    if text == "OTHER":
        return "OTHER"
    if text == "OTHER ":
        return "OTHER"
    return text


def clean_name(value: object) -> str:
    text = unicodedata.normalize("NFKD", str(value or ""))
    text = text.encode("ascii", "ignore").decode("ascii")
    text = text.upper().replace(".PDF", "")
    text = re.sub(r"^\s*\d+(?:\.\d+)?\s*-\s*", "", text)
    text = re.sub(r"[^A-Z0-9]+", "", text)
    return text


def parse_excel_date(value: object) -> date | None:
    if pd.isna(value):
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    parsed = pd.to_datetime(value, errors="coerce")
    if pd.isna(parsed):
        return None
    return parsed.date()


def parse_visible_date_value(value: object) -> date | None:
    if pd.isna(value):
        return None
    text = str(value).strip()
    match = re.search(r"\b([0-3]?\d)[./-]([01]?\d)[./-](20\d{2})\b", text)
    if match:
        d, m, y = map(int, match.groups())
        try:
            return date(y, m, d)
        except ValueError:
            return None
    return parse_excel_date(value)


def parse_pdf_meta_date(value: str | None) -> date | None:
    if not value:
        return None
    match = re.search(r"D:(\d{4})(\d{2})(\d{2})", value)
    if not match:
        return None
    y, m, d = map(int, match.groups())
    try:
        return date(y, m, d)
    except ValueError:
        return None


def parse_filename_date(name: str) -> date | None:
    match = re.search(r"(20\d{2})[-_](\d{2})[-_](\d{2})", name)
    if not match:
        return None
    y, m, d = map(int, match.groups())
    try:
        return date(y, m, d)
    except ValueError:
        return None


def parse_visible_date(text: str) -> tuple[date | None, str | None]:
    # Prefer the first date immediately after a Luxembourg header; this avoids
    # tacit-procedure deadlines and reference document dates lower in the page.
    lux = re.search(
        r"Luxembourg,?\s+([0-3]?\d[./-][01]?\d[./-]20\d{2})",
        text,
        flags=re.IGNORECASE,
    )
    raw = lux.group(1) if lux else None
    if raw is None:
        generic = re.search(r"\b([0-3]?\d[./][01]?\d[./]20\d{2})\b", text)
        raw = generic.group(1) if generic else None
    if raw is None:
        return None, None

    parts = [int(part) for part in re.split(r"[./-]", raw)]
    if len(parts) != 3:
        return None, raw
    d, m, y = parts
    try:
        return date(y, m, d), raw
    except ValueError:
        return None, raw


def swapped_day_month(dt: date | None) -> date | None:
    if not isinstance(dt, date):
        return None
    if dt.day > 12 or dt.month > 12:
        return None
    try:
        return date(dt.year, dt.day, dt.month)
    except ValueError:
        return None


def classify_date(db_date: date | None, visible_date: date | None, filename_date: date | None) -> str:
    if not isinstance(db_date, date):
        return "missing_db_date"
    if not isinstance(visible_date, date):
        return "no_visible_date"
    if db_date == visible_date:
        return "db_matches_visible"
    if db_date == swapped_day_month(visible_date):
        return "db_is_visible_day_month_swap"
    if filename_date and db_date == filename_date and visible_date != filename_date:
        return "db_matches_filename_not_visible"
    if filename_date and visible_date == filename_date:
        return "visible_matches_filename_db_differs"
    return "db_visible_mismatch"


def extract_pdf_facts(path: Path) -> dict[str, object]:
    result: dict[str, object] = {
        "pdf_path": str(path),
        "pdf_file_name": path.name,
        "pdf_pages": None,
        "pdf_meta_created": None,
        "pdf_meta_modified": None,
        "visible_header_date": None,
        "visible_header_raw": None,
        "filename_date": parse_filename_date(path.name),
        "pdf_error": None,
    }
    try:
        doc = fitz.open(path)
        result["pdf_pages"] = doc.page_count
        result["pdf_meta_created"] = parse_pdf_meta_date(doc.metadata.get("creationDate"))
        result["pdf_meta_modified"] = parse_pdf_meta_date(doc.metadata.get("modDate"))
        text = "\n".join(doc[i].get_text("text") for i in range(min(doc.page_count, 2)))
        visible_date, visible_raw = parse_visible_date(text)
        result["visible_header_date"] = visible_date
        result["visible_header_raw"] = visible_raw
        doc.close()
    except Exception as exc:  # pragma: no cover - audit should keep going.
        result["pdf_error"] = f"{type(exc).__name__}: {exc}"
    return result


def build_pdf_index() -> pd.DataFrame:
    rows: list[dict[str, object]] = []
    for template, root in PDF_ROOTS.items():
        for path in sorted(root.rglob("*.pdf")) if root.exists() else []:
            facts = extract_pdf_facts(path)
            facts["pdf_template_folder"] = template
            facts["pdf_clean_name"] = clean_name(path.name)
            rows.append(facts)
    return pd.DataFrame(rows)


def load_database() -> pd.DataFrame:
    df = load_source_table()
    df["Template Normalized"] = df["Template"].map(normalize_template)
    df["db_row_number"] = df.index + 2
    df["db_validation_date"] = df["Validation Date"].map(parse_excel_date)
    df["db_clean_file_name"] = df["File Name"].map(clean_name)
    return df


def match_database_to_pdfs(
    db: pd.DataFrame, pdfs: pd.DataFrame, visible_lookup: dict[str, date]
) -> pd.DataFrame:
    exact_by_name: dict[str, dict[str, object]] = {}
    by_template_clean: dict[tuple[str, str], list[dict[str, object]]] = defaultdict(list)
    by_clean: dict[str, list[dict[str, object]]] = defaultdict(list)

    for record in pdfs.to_dict("records"):
        exact_by_name[str(record["pdf_file_name"])] = record
        by_template_clean[(str(record["pdf_template_folder"]), str(record["pdf_clean_name"]))].append(record)
        by_clean[str(record["pdf_clean_name"])].append(record)

    rows: list[dict[str, object]] = []
    for _, rec in db.iterrows():
        template = rec["Template Normalized"]
        file_name = str(rec.get("File Name") or "")
        clean = str(rec.get("db_clean_file_name") or "")
        match = None
        match_method = "unmatched"

        if file_name in exact_by_name:
            match = exact_by_name[file_name]
            match_method = "exact_file_name"
        else:
            candidates = by_template_clean.get((template, clean), [])
            if len(candidates) == 1:
                match = candidates[0]
                match_method = "template_clean_name"
            elif len(by_clean.get(clean, [])) == 1:
                match = by_clean[clean][0]
                match_method = "global_clean_name"
            else:
                # Last pass: allow one side to include an ordinal prefix while
                # the other does not, but only when it is unique in template.
                contains = [
                    pdf_rec
                    for (tpl, key), vals in by_template_clean.items()
                    if tpl == template and (clean and (clean in key or key in clean))
                    for pdf_rec in vals
                ]
                if len(contains) == 1:
                    match = contains[0]
                    match_method = "template_clean_contains"

        row = {
            "db_row_number": rec["db_row_number"],
            "Batch Folder": rec.get("Source"),
            "Template": template,
            "Extraction": rec.get("Extraction"),
            "File Name": rec.get("File Name"),
            "Operation Number": rec.get("Operation Number"),
            "DB Validation Date": rec.get("db_validation_date"),
            "Author": rec.get("Author"),
            "DB Document Pages": rec.get("Document Page Count"),
            "DB Pre Opinion Pages": rec.get("Page count before opinion"),
            "DB Text Before Opinions": rec.get("Text Before Opinions"),
            "GED Match Status": rec.get("GED Match Status"),
            "match_method": match_method,
        }
        for dept in DEPT_COLS:
            row[dept] = rec.get(dept)
        if match:
            row.update(match)
        rows.append(row)

    audit = pd.DataFrame(rows)
    audit["Visible Header Date"] = audit["visible_header_date"]
    audit["Visible Accuracy Date"] = audit.apply(
        lambda row: visible_lookup.get(str(row.get("pdf_file_name")))
        or visible_lookup.get(str(row.get("File Name")))
        or visible_lookup.get(clean_name(row.get("pdf_file_name")))
        or visible_lookup.get(clean_name(row.get("File Name"))),
        axis=1,
    )
    audit["Visible Validation Date"] = audit.apply(
        lambda row: row["Visible Accuracy Date"]
        if isinstance(row.get("Visible Accuracy Date"), date)
        else row.get("Visible Header Date"),
        axis=1,
    )
    audit["Visible Validation Date Source"] = audit.apply(
        lambda row: "visible_accuracy"
        if isinstance(row.get("Visible Accuracy Date"), date)
        else ("pdf_header" if isinstance(row.get("Visible Header Date"), date) else None),
        axis=1,
    )
    audit["Filename Date"] = audit["filename_date"]
    audit["PDF Meta Created Date"] = audit["pdf_meta_created"]
    audit["PDF Meta Modified Date"] = audit["pdf_meta_modified"]
    audit["date_status"] = audit.apply(
        lambda row: classify_date(row["DB Validation Date"], row["Visible Validation Date"], row["Filename Date"]),
        axis=1,
    )
    audit["DB Date Is Future"] = audit["DB Validation Date"].map(lambda x: bool(pd.notna(x) and x > TODAY))
    audit["Visible Date Is Future"] = audit["Visible Validation Date"].map(
        lambda x: bool(pd.notna(x) and x > TODAY)
    )
    audit["Date Delta Days DB minus Visible"] = audit.apply(
        lambda row: (row["DB Validation Date"] - row["Visible Validation Date"]).days
        if pd.notna(row["DB Validation Date"]) and pd.notna(row["Visible Validation Date"])
        else None,
        axis=1,
    )
    audit["Page Delta DB minus PDF"] = audit.apply(
        lambda row: row["DB Document Pages"] - row["pdf_pages"]
        if pd.notna(row.get("DB Document Pages")) and pd.notna(row.get("pdf_pages"))
        else None,
        axis=1,
    )
    audit["single_dept_exceeds_text"] = audit.apply(
        lambda row: any(
            pd.notna(row.get(dept))
            and pd.notna(row.get("DB Text Before Opinions"))
            and float(row.get(dept) or 0) > float(row.get("DB Text Before Opinions") or 0)
            for dept in DEPT_COLS
        ),
        axis=1,
    )
    audit["dept_total"] = audit[DEPT_COLS].fillna(0).sum(axis=1)
    audit["dept_total_ratio"] = audit.apply(
        lambda row: row["dept_total"] / row["DB Text Before Opinions"]
        if pd.notna(row["DB Text Before Opinions"]) and row["DB Text Before Opinions"]
        else None,
        axis=1,
    )
    return audit


def visible_accuracy_summary() -> pd.DataFrame:
    files = [
        ("AFS", ROOT / "AFS_Package" / "outputs" / "afs_visible_accuracy" / "afs_visible_field_stats.csv"),
        ("GNG", ROOT / "GNG_Package" / "outputs" / "gng_accuracy" / "gng_accuracy_field_stats.csv"),
        ("OTHER", ROOT / "OTHER_Package" / "outputs" / "other_visible_accuracy" / "other_visible_field_stats.csv"),
    ]
    rows: list[pd.DataFrame] = []
    for template, path in files:
        if path.exists():
            df = pd.read_csv(path)
            df.insert(0, "Template", template)
            rows.append(df)
    return pd.concat(rows, ignore_index=True) if rows else pd.DataFrame()


def visible_validation_lookup() -> dict[str, date]:
    files = [
        (
            "AFS",
            ROOT
            / "AFS_Package"
            / "outputs"
            / "afs_visible_accuracy"
            / "afs_visible_field_comparison.csv",
            "File Name",
            "Visible Value",
        ),
        (
            "GNG",
            ROOT / "GNG_Package" / "outputs" / "gng_accuracy" / "gng_accuracy_field_comparison.csv",
            "File Name",
            "Actual Value",
        ),
        (
            "OTHER",
            ROOT
            / "OTHER_Package"
            / "outputs"
            / "other_visible_accuracy"
            / "other_visible_field_comparison.csv",
            "File",
            "Visible Value",
        ),
    ]
    lookup: dict[str, date] = {}
    for _template, path, file_col, value_col in files:
        if not path.exists():
            continue
        df = pd.read_csv(path)
        df = df[df["Field"].eq("Validation Date")]
        for _, row in df.iterrows():
            parsed = parse_visible_date_value(row.get(value_col))
            if parsed is None:
                continue
            lookup[str(row.get(file_col))] = parsed
            lookup[clean_name(row.get(file_col))] = parsed
    return lookup


def corrected_trends(db: pd.DataFrame, audit: pd.DataFrame) -> pd.DataFrame:
    correction = audit.loc[
        audit["date_status"].eq("db_is_visible_day_month_swap"),
        ["db_row_number", "Visible Validation Date"],
    ].copy()
    correction = dict(zip(correction["db_row_number"], correction["Visible Validation Date"]))

    df = db.copy()
    df["Corrected Validation Date"] = df.apply(
        lambda row: correction.get(row["db_row_number"], row["db_validation_date"]), axis=1
    )
    df["DB Year"] = pd.to_datetime(df["db_validation_date"], errors="coerce").dt.year
    df["Corrected Year"] = pd.to_datetime(df["Corrected Validation Date"], errors="coerce").dt.year

    rows = []
    for label, year_col in [("database_dates", "DB Year"), ("corrected_visible_dates", "Corrected Year")]:
        grouped = (
            df.dropna(subset=[year_col])
            .groupby([year_col, "Template Normalized"], dropna=False)
            .agg(
                documents=("File Name", "size"),
                median_words=("Text Before Opinions", "median"),
                mean_words=("Text Before Opinions", "mean"),
                median_pages=("Document Page Count", "median"),
                mean_pages=("Document Page Count", "mean"),
                median_pre_opinion_pages=("Page count before opinion", "median"),
                mean_pre_opinion_pages=("Page count before opinion", "mean"),
            )
            .reset_index()
            .rename(columns={year_col: "year", "Template Normalized": "Template"})
        )
        grouped.insert(0, "date_basis", label)
        rows.append(grouped)
    return pd.concat(rows, ignore_index=True)


def corrected_monthly_trends(db: pd.DataFrame, audit: pd.DataFrame) -> pd.DataFrame:
    correction = audit.loc[
        audit["date_status"].eq("db_is_visible_day_month_swap"),
        ["db_row_number", "Visible Validation Date"],
    ].copy()
    correction = dict(zip(correction["db_row_number"], correction["Visible Validation Date"]))

    df = db.copy()
    df["Corrected Validation Date"] = df.apply(
        lambda row: correction.get(row["db_row_number"], row["db_validation_date"]), axis=1
    )
    df["DB Month"] = pd.to_datetime(df["db_validation_date"], errors="coerce").dt.to_period("M").astype(str)
    df["Corrected Month"] = (
        pd.to_datetime(df["Corrected Validation Date"], errors="coerce").dt.to_period("M").astype(str)
    )
    df.loc[df["DB Month"].eq("NaT"), "DB Month"] = None
    df.loc[df["Corrected Month"].eq("NaT"), "Corrected Month"] = None

    rows = []
    for label, month_col in [("database_dates", "DB Month"), ("corrected_visible_dates", "Corrected Month")]:
        grouped = (
            df.dropna(subset=[month_col])
            .groupby([month_col, "Template Normalized"], dropna=False)
            .agg(
                documents=("File Name", "size"),
                median_words=("Text Before Opinions", "median"),
                mean_words=("Text Before Opinions", "mean"),
                median_pages=("Document Page Count", "median"),
                mean_pages=("Document Page Count", "mean"),
                median_pre_opinion_pages=("Page count before opinion", "median"),
                mean_pre_opinion_pages=("Page count before opinion", "mean"),
            )
            .reset_index()
            .rename(columns={month_col: "month", "Template Normalized": "Template"})
        )
        grouped.insert(0, "date_basis", label)
        rows.append(grouped)
    return pd.concat(rows, ignore_index=True)


def author_trend_flags(db: pd.DataFrame) -> pd.DataFrame:
    df = db.copy()
    df["year"] = pd.to_datetime(df["db_validation_date"], errors="coerce").dt.year
    grouped = (
        df.dropna(subset=["Author", "year"])
        .groupby(["Template Normalized", "Author"], dropna=False)
        .agg(
            documents=("File Name", "size"),
            median_words=("Text Before Opinions", "median"),
            mean_words=("Text Before Opinions", "mean"),
            median_pages=("Document Page Count", "median"),
            first_year=("year", "min"),
            last_year=("year", "max"),
        )
        .reset_index()
        .rename(columns={"Template Normalized": "Template"})
    )
    grouped = grouped[grouped["documents"] >= 8].copy()
    grouped["within_template_median_rank"] = grouped.groupby("Template")["median_words"].rank(
        method="dense", ascending=False
    )
    return grouped.sort_values(["Template", "median_words"], ascending=[True, False])


def write_report(
    db: pd.DataFrame,
    pdfs: pd.DataFrame,
    audit: pd.DataFrame,
    accuracy: pd.DataFrame,
    trends: pd.DataFrame,
    monthly_trends: pd.DataFrame,
    authors: pd.DataFrame,
) -> None:
    matched = audit[audit["match_method"].ne("unmatched")].copy()
    with_visible = matched[pd.notna(matched["Visible Validation Date"])].copy()

    date_counts = matched["date_status"].value_counts().to_dict()
    future_db = int(audit["DB Date Is Future"].sum())
    future_matched = matched[matched["DB Date Is Future"]]
    future_swaps = int(future_matched["date_status"].eq("db_is_visible_day_month_swap").sum())
    page_mismatches = matched[matched["Page Delta DB minus PDF"].fillna(0).ne(0)]

    db_2026_other = trends[
        (trends["date_basis"] == "database_dates")
        & (trends["year"] == 2026)
        & (trends["Template"] == "OTHER")
    ]
    corrected_2026_other = trends[
        (trends["date_basis"] == "corrected_visible_dates")
        & (trends["year"] == 2026)
        & (trends["Template"] == "OTHER")
    ]
    other_months = monthly_trends[
        (monthly_trends["Template"] == "OTHER")
        & (monthly_trends["month"].astype(str).str.startswith("2026-"))
    ][["date_basis", "month", "documents", "median_words", "median_pages"]].copy()
    other_months = other_months.sort_values(["date_basis", "month"])

    def trend_sentence(frame: pd.DataFrame) -> str:
        if frame.empty:
            return "not available"
        row = frame.iloc[0]
        return (
            f"{int(row['documents'])} docs, median {row['median_words']:.0f} words, "
            f"median {row['median_pages']:.1f} pages"
        )

    date_table = pd.DataFrame(
        [{"status": key, "matched_rows": value} for key, value in sorted(date_counts.items())]
    )
    date_table_md = markdown_table(date_table)

    bad_dates = matched[
        matched["date_status"].isin(
            ["db_is_visible_day_month_swap", "db_visible_mismatch", "db_matches_filename_not_visible"]
        )
    ][
        [
            "Template",
            "Batch Folder",
            "File Name",
            "DB Validation Date",
            "visible_header_raw",
            "Visible Validation Date",
            "Visible Validation Date Source",
            "Filename Date",
            "Date Delta Days DB minus Visible",
            "date_status",
        ]
    ].head(20)

    accuracy_focus = accuracy[
        accuracy["Field"].isin(
            [
                "Validation Date",
                "Document Page Count",
                "Page_Count",
                "Text Before Opinions",
                "PJ",
                "RM",
                "JU",
                "SG",
            ]
        )
    ].copy()

    longest_authors = authors.sort_values("median_words", ascending=False).head(10)
    shortest_authors = authors.sort_values("median_words", ascending=True).head(10)

    report = f"""# Deep File And Data Audit

Generated: {datetime.now().strftime("%Y-%m-%d %H:%M")}

## Scope

- Database rows audited: {len(db):,}
- PDFs available for direct file audit: {len(pdfs):,}
- Database rows matched to an available PDF: {len(matched):,}
- Matched PDFs with an extracted or prior-audited visible validation date: {len(with_visible):,}
- Prior visible-accuracy samples reused: AFS 123, GNG 25, OTHER 253

The PDF audit covers the files physically present in the AFS, GNG, and OTHER package folders. PIN rows are still included in database-level trend checks, but no PIN PDFs were available in the package folders.

## Biggest Finding: 2026 Date Parsing Is Funky

The future-date warning is mostly a day/month parsing problem, not evidence that the documents are actually future opinions.

- Database rows with future validation dates: {future_db:,}
- Future-dated rows that also had a matching PDF: {len(future_matched):,}
- Matched future rows confirmed as visible day/month swaps: {future_swaps:,}
- Example pattern: visible `08/05/2026` means 8 May 2026, but the database stores `2026-08-05`.

Matched date-status breakdown:

{date_table_md}

This matters for the monthly 2026 time series. The year-level OTHER total is less affected than the month-level charts, but the timeline position is materially wrong for many OTHER2026 rows.

- OTHER 2026 using database dates: {trend_sentence(db_2026_other)}
- OTHER 2026 after visible-date correction where confirmed: {trend_sentence(corrected_2026_other)}

OTHER 2026 monthly placement before and after visible-date correction:

{markdown_table(other_months)}

## Page Count Audit

- Matched PDF page-count mismatches: {len(page_mismatches):,}
- Interpretation: document page count is very reliable where the source PDF is available.

## Word Count And Extraction Audit

The visible-accuracy outputs support the main dashboard totals, but they also show where precision is weak:

- Template, extraction status, file name, operation number, author, page counts, and most zero/non-zero service fields are generally strong.
- Text Before Opinions is the weakest field in the visible samples, especially for AFS. The deltas are small in absolute terms in the validation sample, but exact string/numeric equality is low because boundary counting differs.
- RM/PJ/JU service-section counts are the fields most likely to mismatch in service-level analysis.
- The scary-looking SG/GNG issue is not present in the database: positive SG appears only under OTHER in the full dashboard test suite.

Focused visible-accuracy stats:

{markdown_table(accuracy_focus)}

## Weird Trend Checks

- AFS is not showing streamlining by length. It gets longer in text-before-opinions and pre-opinion pages through 2026. That could be a real template change, an AFS sample mix shift, or more complete pre-opinion capture.
- GNG gets fewer service-opinion sections over time, but median words per document do not collapse. The streamlining signal is more about fewer opinion blocks than fewer total words.
- OTHER is the clearest streamlining candidate by pages and median words, but the 2026 month placement needs corrected visible dates before making a monthly claim.
- Author analysis is useful for AFS/OTHER/PIN, but weak for GNG because most GNG author/service-office values are missing in the database.
- Department totals can overlap. Rows where department totals exceed Text Before Opinions should be treated as section-overlap/extraction anomalies, not necessarily impossible documents.

## Author / Service-Office Signals

Longest author/service-office groups with at least 8 documents:

{markdown_table(longest_authors[["Template", "Author", "documents", "median_words", "mean_words", "median_pages"]])}

Shortest author/service-office groups with at least 8 documents:

{markdown_table(shortest_authors[["Template", "Author", "documents", "median_words", "mean_words", "median_pages"]])}

## Date Rows To Review First

{markdown_table(bad_dates)}

## Recommended Next Dashboard Changes

1. Add a `Corrected date basis` toggle: database date vs visible-header-corrected date.
2. Add a month-level audit overlay that flags day/month swaps and missing visible dates.
3. Separate `opinion count` trend from `word count` trend, because the streamlining story is stronger for service-section count than for total words.
4. Keep page-count trend next to word-count trend; OTHER shows the clearest page compression, while AFS moves the other way.
5. Add an author/service-office reliability note on GNG because the missing-author rate makes author conclusions fragile.
"""

    (REPORTS / "FILE_DATE_AUDIT.md").write_text(report, encoding="utf-8")

    machine_summary = {
        "database_rows": len(db),
        "pdfs_available": len(pdfs),
        "matched_rows": len(matched),
        "visible_dates_extracted": len(with_visible),
        "date_status_counts": date_counts,
        "future_database_rows": future_db,
        "future_matched_rows": len(future_matched),
        "future_swaps_confirmed": future_swaps,
        "page_count_mismatches": len(page_mismatches),
    }
    (OUT / "deep_file_audit_summary.json").write_text(
        json.dumps(machine_summary, indent=2, default=str), encoding="utf-8"
    )


def main() -> None:
    db = load_database()
    pdfs = build_pdf_index()
    visible_lookup = visible_validation_lookup()
    audit = match_database_to_pdfs(db, pdfs, visible_lookup)
    accuracy = visible_accuracy_summary()
    trends = corrected_trends(db, audit)
    monthly_trends = corrected_monthly_trends(db, audit)
    authors = author_trend_flags(db)

    pdfs.to_csv(OUT / "pdf_inventory_audit.csv", index=False)
    audit.to_csv(OUT / "file_date_page_audit.csv", index=False)
    trends.to_csv(OUT / "corrected_date_trends.csv", index=False)
    monthly_trends.to_csv(OUT / "corrected_monthly_date_trends.csv", index=False)
    authors.to_csv(OUT / "author_length_audit.csv", index=False)
    accuracy.to_csv(OUT / "visible_accuracy_field_stats_combined.csv", index=False)
    write_report(db, pdfs, audit, accuracy, trends, monthly_trends, authors)

    summary = json.loads((OUT / "deep_file_audit_summary.json").read_text(encoding="utf-8"))
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
