import argparse
import csv
import importlib.util
import math
import random
import re
from collections import defaultdict
from pathlib import Path
from statistics import mean


ROOT = Path(__file__).resolve().parents[1]
AFS_DIR = ROOT / "AFS_Package" / "AFS_File_Folder"
OUTPUT_DIR = ROOT / "AFS_Package" / "outputs" / "afs_accuracy"
DATABASE_PATH = ROOT / "Data Analysis" / "cleaned_database.csv"
DEFAULT_SEED = 20260529

OUTPUT_PREFIXES = [
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
    "OTHER"
]

BASE_COLUMNS = [
    "Template",
    "Extraction",
    "MC_Note_Type",
    "File Name",
    "Operation Number",
    "Validation Date",
    "Author",
    "Document Page Count",
    "Page count before opinion",
    "Annex Page Count",
    "Text Before Opinions"
]

FIELDS = BASE_COLUMNS + OUTPUT_PREFIXES
NUMERIC_FIELDS = {
    "Operation Number",
    "Document Page Count",
    "Page count before opinion",
    "Annex Page Count",
    "Text Before Opinions",
    *OUTPUT_PREFIXES,
}


def load_afs_module():
    spec = importlib.util.spec_from_file_location(
        "afs_extractor",
        ROOT / "AFS_Package" / "afs_extractor.py"
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def clean_key(value):
    return re.sub(r"[^A-Z0-9]+", "", str(value or "").upper())


def normalize_text(value):
    text = str(value or "").strip()
    if text.lower() in {"nan", "none"}:
        return ""
    return re.sub(r"\s+", " ", text)


def normalize_date(value):
    text = normalize_text(value)
    if not text:
        return ""

    match = re.search(r"(\d{4})-(\d{2})-(\d{2})", text)
    if match:
        return f"{match.group(3)}/{match.group(2)}/{match.group(1)}"

    match = re.search(r"(\d{2})[/.](\d{2})[/.](\d{4})", text)
    if match:
        return f"{match.group(1)}/{match.group(2)}/{match.group(3)}"

    return text


def normalize_number(value):
    text = normalize_text(value)
    if not text or text.lower() == "check":
        return text

    try:
        number = float(text)
    except ValueError:
        return text

    if math.isfinite(number) and number.is_integer():
        return str(int(number))

    return str(number)


def normalize_field(field, value):
    if field == "Validation Date":
        return normalize_date(value)

    if field in NUMERIC_FIELDS:
        return normalize_number(value)

    return normalize_text(value)


def numeric_delta(field, script_value, actual_value):
    if field not in NUMERIC_FIELDS:
        return ""

    try:
        delta = float(script_value) - float(actual_value)
    except (TypeError, ValueError):
        return ""

    if math.isfinite(delta) and delta.is_integer():
        return int(delta)

    return delta


def load_database_rows():
    if not DATABASE_PATH.exists():
        raise SystemExit(f"Database CSV not found: {DATABASE_PATH}")

    with DATABASE_PATH.open(newline="", encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))

    afs_rows = [
        row for row in rows
        if row.get("Template Type") == "AFS" or row.get("Template") == "AFS"
    ]

    by_key = defaultdict(list)
    for row in afs_rows:
        by_key[clean_key(row.get("File Name"))].append(row)

        if row.get("GED Matched Name"):
            by_key[clean_key(row.get("GED Matched Name"))].append(row)

    return afs_rows, by_key


def select_pdf_files(pdf_files, limit, sample_method, seed):
    pdf_files = sorted(pdf_files)

    if limit is None or limit <= 0:
        return pdf_files

    if limit > len(pdf_files):
        raise SystemExit(f"Requested {limit} PDFs, but only {len(pdf_files)} PDFs are available.")

    if sample_method == "random":
        rng = random.Random(seed)
        return sorted(rng.sample(pdf_files, limit))

    return pdf_files[:limit]


def write_csv(path, rows, fieldnames):
    with path.open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def calculate_field_stats(comparison_rows):
    rows_by_field = defaultdict(list)
    for row in comparison_rows:
        rows_by_field[row["Field"]].append(row)

    field_stats = []
    for field in FIELDS:
        rows = rows_by_field[field]
        matches = sum(1 for row in rows if row["Match"] == "YES")
        deltas = [
            abs(float(row["Numeric Delta"]))
            for row in rows
            if str(row["Numeric Delta"]).strip() not in {"", "None"}
        ]
        field_stats.append({
            "Field": field,
            "Compared": len(rows),
            "Matches": matches,
            "Mismatches": len(rows) - matches,
            "Match Rate": matches / len(rows) if rows else "",
            "Mean Abs Delta": mean(deltas) if deltas else "",
            "Max Abs Delta": max(deltas) if deltas else "",
        })

    return field_stats


def parse_args():
    parser = argparse.ArgumentParser(description="Compare AFS extractor output with cleaned database rows.")
    parser.add_argument("--limit", type=int, default=0, help="Number of PDFs to analyse. Default 0 means all PDFs.")
    parser.add_argument(
        "--sample",
        choices=["first", "random"],
        default="first",
        help="Sample method used when --limit is greater than zero."
    )
    parser.add_argument("--seed", type=int, default=DEFAULT_SEED, help="Random seed for --sample random.")
    parser.add_argument("--output-dir", type=Path, default=OUTPUT_DIR, help="Output directory for CSV reports.")
    return parser.parse_args()


def main():
    args = parse_args()
    output_dir = args.output_dir
    if not output_dir.is_absolute():
        output_dir = ROOT / output_dir
    output_dir.mkdir(parents=True, exist_ok=True)

    afs = load_afs_module()
    database_rows, database_by_key = load_database_rows()
    available_pdf_files = sorted(AFS_DIR.rglob("*.pdf"))
    pdf_files = select_pdf_files(available_pdf_files, args.limit, args.sample, args.seed)

    script_rows = []
    database_actual_rows = []
    comparison_rows = []
    document_rows = []
    unmatched_files = []

    for index, pdf_path in enumerate(pdf_files, 1):
        result = afs.process_pdf(pdf_path)
        script_row = {field: result["row_csv"].get(field, "") for field in FIELDS}
        candidates = database_by_key.get(clean_key(script_row["File Name"]), [])

        if not candidates:
            unmatched_files.append(pdf_path.name)
            continue

        actual_row = {field: candidates[0].get(field, "") for field in FIELDS}
        script_rows.append({"Sample #": index, **script_row})
        database_actual_rows.append({"Sample #": index, **actual_row})

        matched_fields = 0
        mismatch_fields = []

        for field in FIELDS:
            script_normalized = normalize_field(field, script_row.get(field, ""))
            actual_normalized = normalize_field(field, actual_row.get(field, ""))
            match = script_normalized == actual_normalized

            if match:
                matched_fields += 1
            else:
                mismatch_fields.append(field)

            comparison_rows.append({
                "Sample #": index,
                "File Name": pdf_path.name,
                "Field": field,
                "Script Value": script_row.get(field, ""),
                "Database Value": actual_row.get(field, ""),
                "Script Normalized": script_normalized,
                "Database Normalized": actual_normalized,
                "Match": "YES" if match else "NO",
                "Numeric Delta": numeric_delta(field, script_normalized, actual_normalized),
            })

        compared_fields = len(FIELDS)
        document_rows.append({
            "Sample #": index,
            "File Name": pdf_path.name,
            "Matched Fields": matched_fields,
            "Compared Fields": compared_fields,
            "Mismatched Fields": len(mismatch_fields),
            "Match Rate": matched_fields / compared_fields,
            "Mismatch Fields": ", ".join(mismatch_fields),
        })

    field_stats = calculate_field_stats(comparison_rows)
    overall_compared = len(comparison_rows)
    overall_matches = sum(1 for row in comparison_rows if row["Match"] == "YES")

    comparison_csv = output_dir / "afs_accuracy_field_comparison.csv"
    document_csv = output_dir / "afs_accuracy_document_summary.csv"
    field_stats_csv = output_dir / "afs_accuracy_field_stats.csv"
    script_csv = output_dir / f"afs_script_output_{len(script_rows)}.csv"
    database_csv = output_dir / f"afs_database_actuals_{len(database_actual_rows)}.csv"

    write_csv(comparison_csv, comparison_rows, list(comparison_rows[0].keys()))
    write_csv(document_csv, document_rows, list(document_rows[0].keys()))
    write_csv(field_stats_csv, field_stats, list(field_stats[0].keys()))
    write_csv(script_csv, script_rows, list(script_rows[0].keys()))
    write_csv(database_csv, database_actual_rows, list(database_actual_rows[0].keys()))

    print("AFS database comparison complete")
    print(f"PDFs available: {len(available_pdf_files)}")
    print(f"Database AFS rows: {len(database_rows)}")
    print(f"Documents analysed: {len(script_rows)}")
    print(f"Unmatched files: {len(unmatched_files)}")
    print(f"Overall match rate: {overall_matches / overall_compared:.3%}")
    print(f"Field mismatches: {overall_compared - overall_matches}")
    print(f"Comparison CSV: {comparison_csv}")
    print(f"Field stats CSV: {field_stats_csv}")


if __name__ == "__main__":
    main()
