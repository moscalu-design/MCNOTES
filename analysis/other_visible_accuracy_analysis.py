import argparse
import csv
import html
import importlib.util
import math
import random
import re
from collections import defaultdict
from pathlib import Path
from statistics import mean

import fitz


ROOT = Path(__file__).resolve().parents[1]
OTHER_DIR = ROOT / "OTHER_Package" / "OTHER_File_Folder"
OUTPUT_DIR = ROOT / "OTHER_Package" / "outputs" / "other_visible_accuracy"
DEFAULT_SEED = 20260529

NA_VALUE = "N/A"
TEMPLATE_VALUE = "Other"
EXTRACTION_VALUE = "Automated"

OUTPUT_PREFIXES = [
    "OPS", "GLO", "PJ", "RM", "OCCO", "JU", "ECON", "CFC",
    "EIF", "FI", "IG", "PMM", "SG", "GIS", "HR", "OTHER",
]

BASE_COLUMNS = [
    "Template",
    "Extraction",
    "MC_Note_Type",
    "File",
    "Operation Number",
    "Validation Date",
    "Author",
    "Page_Count",
    "Page count before opinion",
    "Page Count Annex",
    "Text Before Opinions",
]

FIELDS = BASE_COLUMNS + OUTPUT_PREFIXES
NUMERIC_FIELDS = {
    "Operation Number",
    "Page_Count",
    "Page count before opinion",
    "Page Count Annex",
    "Text Before Opinions",
    *OUTPUT_PREFIXES,
}

START_SECTION_RE = re.compile(
    r"(6\s+OPINIONS\s+FROM\s+THE\s+SERVICES|OPINIONS\s+FROM\s+THE\s+SERVICES)",
    re.IGNORECASE,
)
OPINION_HEADER_RE = re.compile(r"\b\d+\.\d+\b.{0,80}\bOpinion\b", re.IGNORECASE)
END_BLOCK_RE = re.compile(
    r"\b[Vv]alidated\s+by\s+"
    r"[A-ZÀ-ÖØ-Þ][A-ZÀ-ÖØ-Þ'’\-.]{1,}"
    r"(?:\s+[A-ZÀ-ÖØ-Þ][A-Za-zÀ-ÖØ-öø-ÿ'’\-.]+)?"
)
STRICT_VALIDATION_BLOCK_RE = re.compile(
    r"\bValidated\s+by\s+.{2,220}?\bAt\s+"
    r"\d{2}(?:/|\.)\d{2}(?:/|\.)\d{4}\s+\d{1,2}:\d{2}\b",
    re.IGNORECASE | re.DOTALL,
)
LOOSE_VALIDATED_BY_SURNAME_RE = re.compile(r"\b[Vv]alidated\s+by\s+[A-ZÀ-ÖØ-Þ]{2,}\b")
WORD_RE = re.compile(r"\b[0-9A-Za-z']+\b")
MC_TYPE_RE = re.compile(r"(NOTEMCDEC|NOTEMCDISC|NOTEMCINFO)", re.IGNORECASE)
DATE_RE = re.compile(r"\b(20\d{2}-\d{2}-\d{2})\b")
DOC_DATE_RE = re.compile(r"\b(\d{2}/\d{2}/\d{4})\b")
ISO_DATE_RE = re.compile(r"\b(20\d{2}-\d{2}-\d{2})\b")
AUTHOR_LINE_RE = re.compile(r"^[A-ZÀ-ÖØ-Þ]{2,}[A-Za-z0-9À-ÖØ-öø-ÿ&/.,()'\- ]{3,}$")
AUTHOR_RE = re.compile(r"\b[A-Z]{1,5}(?:[/-][A-Z0-9&]{1,10})+\b")
OPERATION_NUMBER_RE = re.compile(r"(?<![A-Za-z0-9])(?:20\d{6}|20\d{2}-\d{4,6})(?![A-Za-z0-9])")
OPERATION_NUMBER_LINE_RE = re.compile(r"^\s*(?:\d{8}|\d{4}-\d{4,6})\s*$")
EMBEDDED_OPERATION_NUMBER_RE = re.compile(r"(?<![A-Za-z0-9])20\d{2}-(?:\d{0,6})(?![A-Za-z0-9])")


def load_other_module():
    spec = importlib.util.spec_from_file_location(
        "other_extractor",
        ROOT / "OTHER_Package" / "other_extractor.py",
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def normalize_for_match(value):
    return re.sub(r"[^A-Z0-9]", "", str(value or "").upper())


def clean_text(value):
    text = str(value or "").replace("\u200b", "")
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def count_words(value):
    return len(WORD_RE.findall(str(value or "")))


def clean_author_line(line):
    line = clean_text(line)
    line = EMBEDDED_OPERATION_NUMBER_RE.sub("", line)
    line = re.sub(r"/{2,}", "/", line)
    line = re.sub(r"(?<!-)/$", "", line).strip()
    return line


def is_valid_author_line(line):
    line = clean_author_line(line)
    if not line:
        return False
    if line.lower().startswith("corporate use"):
        return False
    if OPERATION_NUMBER_LINE_RE.match(line):
        return False
    if "/" not in line and "-" not in line:
        return False
    return bool(AUTHOR_LINE_RE.match(line))


def load_prefix_mapping(other):
    _, prefix_to_group, normalized_prefixes, warnings = other.load_prefix_merge_mapping(
        ROOT / "OTHER_Package"
    )
    return prefix_to_group, normalized_prefixes, warnings


def read_visible_lines(doc):
    lines = []
    order = 0
    for page_index in range(doc.page_count):
        page = doc.load_page(page_index)
        grouped = defaultdict(list)
        for item in page.get_text("words"):
            x0, y0, x1, y1, word, block, line, word_no = item
            grouped[(block, line)].append((x0, y0, x1, y1, word))

        page_lines = []
        for parts in grouped.values():
            parts = sorted(parts, key=lambda part: (part[0], part[1]))
            page_lines.append({
                "page": page_index + 1,
                "page_index": page_index,
                "x0": min(part[0] for part in parts),
                "y0": min(part[1] for part in parts),
                "x1": max(part[2] for part in parts),
                "y1": max(part[3] for part in parts),
                "page_width": page.rect.width,
                "page_height": page.rect.height,
                "text": clean_text(" ".join(part[4] for part in parts)),
            })

        page_lines.sort(key=lambda row: (row["y0"], row["x0"]))
        for line in page_lines:
            line["order"] = order
            order += 1
            lines.append(line)

    return lines


def make_visible_text(lines):
    chunks = []
    position = 0
    for line in lines:
        text = line["text"]
        line["abs_start"] = position
        line["abs_end"] = position + len(text)
        chunks.append(text)
        position += len(text) + 1
    return "\n".join(chunks)


def page_for_abs(lines, abs_position):
    for line in lines:
        if line["abs_start"] <= abs_position <= line["abs_end"]:
            return line["page"]
    for line in reversed(lines):
        if abs_position >= line["abs_start"]:
            return line["page"]
    return ""


def extract_mc_metadata(filename):
    match_type = MC_TYPE_RE.search(filename)
    match_date = DATE_RE.search(filename)
    return (
        match_type.group(1).upper() if match_type else None,
        match_date.group(1) if match_date else None,
    )


def extract_operation_number(filename, visible_text):
    for source in [filename, visible_text[:4000]]:
        match = OPERATION_NUMBER_RE.search(source or "")
        if match:
            return match.group(0).replace("-", "")
    return ""


def extract_top_right_metadata(lines):
    first_page = [
        line for line in lines
        if line["page"] == 1
        and line["x1"] >= line["page_width"] * 0.55
        and line["y0"] <= line["page_height"] * 0.40
    ]
    first_page.sort(key=lambda line: (line["y0"], line["x0"]))
    texts = [line["text"] for line in first_page if line["text"]]

    doc_date = None
    date_idx = None
    for idx, text in enumerate(texts):
        match = DOC_DATE_RE.search(text)
        if match:
            doc_date = match.group(1)
            date_idx = idx
            break
        match = ISO_DATE_RE.search(text)
        if match:
            yyyy, mm, dd = match.group(1).split("-")
            doc_date = f"{dd}/{mm}/{yyyy}"
            date_idx = idx
            break

    author = None
    search = texts[date_idx + 1:] if date_idx is not None else texts
    for text in search:
        cleaned = clean_author_line(text)
        if is_valid_author_line(cleaned):
            author = cleaned
            break

    if author is None:
        for line in lines:
            if line["page"] != 1:
                continue
            match = AUTHOR_RE.search(line["text"])
            if match:
                cleaned = clean_author_line(match.group(0))
                if is_valid_author_line(cleaned):
                    author = cleaned
                    break

    return doc_date, author, {
        "top_right_chunk": " | ".join(texts),
        "date_found": "YES" if doc_date else "NO",
        "author_found": "YES" if author else "NO",
    }


def detect_prefix_from_header(header_text, normalized_prefixes):
    norm_header = normalize_for_match(header_text)
    for norm_prefix, original_prefix in normalized_prefixes:
        if norm_prefix in norm_header:
            return original_prefix
    return None


def prefix_is_near_start(header_text, prefix, max_norm_index=18):
    norm_header = normalize_for_match(header_text)
    norm_prefix = normalize_for_match(prefix)
    index = norm_header.find(norm_prefix)
    return index != -1 and index <= max_norm_index


def get_no_opinion_annex(lines, total_pages):
    visible_text = "\n".join(line["text"] for line in lines)
    strict_match = STRICT_VALIDATION_BLOCK_RE.search(visible_text)
    if strict_match:
        marker_page = page_for_abs(lines, strict_match.start())
        return max(total_pages - marker_page, 0), {
            "marker_found": "YES",
            "marker_page": marker_page,
            "marker_type": "strict",
        }

    loose_match = LOOSE_VALIDATED_BY_SURNAME_RE.search(visible_text)
    if loose_match:
        marker_page = page_for_abs(lines, loose_match.start())
        return max(total_pages - marker_page, 0), {
            "marker_found": "YES",
            "marker_page": marker_page,
            "marker_type": "loose",
        }

    return NA_VALUE, {"marker_found": "NO", "marker_page": "", "marker_type": ""}


def get_normal_annex_from_last_validated(lines, total_pages):
    for line in reversed(lines):
        if END_BLOCK_RE.search(line["text"]):
            return max(total_pages - line["page"], 0)
    return NA_VALUE


def parse_visible_opinions(visible_text, lines, prefix_to_group, normalized_prefixes):
    start_match = START_SECTION_RE.search(visible_text)
    debug = {
        "section_found": "YES" if start_match else "NO",
        "section_page": "",
        "headers_found": 0,
        "headers_accepted": 0,
        "headers_rejected": 0,
        "last_opinion_end_page": "",
    }
    if not start_match:
        return None, {}, debug

    debug["section_page"] = page_for_abs(lines, start_match.start())
    parse_text = visible_text[start_match.end():]
    base_offset = start_match.end()
    prefix_counts = defaultdict(int)
    pos = 0
    last_opinion_end_page = None

    while True:
        header_match = OPINION_HEADER_RE.search(parse_text, pos)
        if not header_match:
            break

        debug["headers_found"] += 1
        header_text = parse_text[header_match.start():header_match.end()]
        prefix = detect_prefix_from_header(header_text, normalized_prefixes)
        if prefix is None or not prefix_is_near_start(header_text, prefix):
            debug["headers_rejected"] += 1
            pos = header_match.end()
            continue

        end_match = END_BLOCK_RE.search(parse_text, header_match.end())
        if not end_match:
            debug["headers_rejected"] += 1
            break

        block_text = clean_text(parse_text[header_match.end():end_match.start()])
        word_count = count_words(block_text)
        if word_count < 2:
            debug["headers_rejected"] += 1
            pos = end_match.end()
            continue

        debug["headers_accepted"] += 1
        prefix_counts[prefix] += word_count
        last_opinion_end_page = page_for_abs(lines, base_offset + end_match.end())
        pos = end_match.end()

    debug["last_opinion_end_page"] = last_opinion_end_page or ""
    group_totals = defaultdict(int)
    for prefix, count in prefix_counts.items():
        merge_to = prefix_to_group.get(prefix)
        if merge_to:
            group_totals[merge_to] += count

    return prefix_counts, dict(group_totals), debug


def build_visible_row(pdf_path, prefix_to_group, normalized_prefixes):
    with fitz.open(pdf_path) as doc:
        total_pages = doc.page_count
        lines = read_visible_lines(doc)

    visible_text = make_visible_text(lines)
    mc_type, filename_date = extract_mc_metadata(pdf_path.name)
    doc_date, author, metadata_debug = extract_top_right_metadata(lines)
    no_opinion_annex, no_opinion_debug = get_no_opinion_annex(lines, total_pages)
    prefix_counts, group_totals, opinion_debug = parse_visible_opinions(
        visible_text,
        lines,
        prefix_to_group,
        normalized_prefixes,
    )

    if opinion_debug["section_found"] == "YES":
        page_count_annex = (
            max(total_pages - int(opinion_debug["last_opinion_end_page"]), 0)
            if opinion_debug["last_opinion_end_page"]
            else get_normal_annex_from_last_validated(lines, total_pages)
        )
        page_count_before = int(opinion_debug["section_page"])
        text_before = count_words(clean_text(visible_text[:START_SECTION_RE.search(visible_text).start()]))
    else:
        page_count_annex = no_opinion_annex
        page_count_before = total_pages - no_opinion_annex if isinstance(no_opinion_annex, int) else total_pages
        text_before = count_words(clean_text("\n".join(line["text"] for line in lines if line["page"] <= page_count_before)))

    row = {
        "Template": TEMPLATE_VALUE,
        "Extraction": EXTRACTION_VALUE,
        "MC_Note_Type": mc_type if mc_type else NA_VALUE,
        "File": pdf_path.name,
        "Operation Number": extract_operation_number(pdf_path.name, visible_text),
        "Validation Date": doc_date if doc_date else filename_date if filename_date else NA_VALUE,
        "Author": author if author else NA_VALUE,
        "Page_Count": total_pages,
        "Page count before opinion": page_count_before,
        "Page Count Annex": page_count_annex,
        "Text Before Opinions": text_before,
    }

    for prefix in OUTPUT_PREFIXES:
        if prefix_counts is None:
            row[prefix] = NA_VALUE
        else:
            row[prefix] = group_totals.get(prefix, "")

    debug = {
        "visible_lines": len(lines),
        "metadata_debug": metadata_debug,
        "no_opinion_marker_found": no_opinion_debug["marker_found"],
        "no_opinion_marker_page": no_opinion_debug["marker_page"],
        **opinion_debug,
    }
    return row, debug


def normalize_compare(field, value):
    text = clean_text(value)
    if text.lower() in {"none", "nan"}:
        return ""
    if field == "Validation Date" and re.fullmatch(r"20\d{2}-\d{2}-\d{2}", text):
        yyyy, mm, dd = text.split("-")
        return f"{dd}/{mm}/{yyyy}"
    if field in NUMERIC_FIELDS:
        if text == "":
            return ""
        if text == NA_VALUE:
            return NA_VALUE
        try:
            number = float(text)
        except ValueError:
            return text
        return str(int(number)) if math.isfinite(number) and number.is_integer() else str(number)
    return text


def compare_values(field, script_value, visible_value):
    script_norm = normalize_compare(field, script_value)
    visible_norm = normalize_compare(field, visible_value)
    delta = ""
    pct_delta = ""
    if field in NUMERIC_FIELDS:
        try:
            delta_value = float(script_norm) - float(visible_norm)
            delta = int(delta_value) if delta_value.is_integer() else delta_value
            if float(visible_norm) != 0:
                pct_delta = delta_value / float(visible_norm)
        except (TypeError, ValueError):
            pass
    return {
        "script_normalized": script_norm,
        "visible_normalized": visible_norm,
        "match": script_norm == visible_norm,
        "delta": delta,
        "pct_delta": pct_delta,
    }


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


def calculate_stats(comparison_rows, document_rows):
    by_field = defaultdict(list)
    for row in comparison_rows:
        by_field[row["Field"]].append(row)
    field_stats = []
    for field in FIELDS:
        rows = by_field[field]
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
    total = len(comparison_rows)
    matches = sum(1 for row in comparison_rows if row["Match"] == "YES")
    return {
        "Documents": len(document_rows),
        "Fields Compared": total,
        "Field Matches": matches,
        "Field Mismatches": total - matches,
        "Overall Match Rate": matches / total if total else 0,
        "Perfect Documents": sum(1 for row in document_rows if row["Mismatched Fields"] == 0),
    }, field_stats


def percent(value):
    return f"{float(value) * 100:.1f}%"


def write_html(path, overall, field_stats, document_rows, comparison_rows):
    worst_fields = sorted(field_stats, key=lambda row: row["Match Rate"] if row["Match Rate"] != "" else 0)[:12]
    worst_docs = sorted(document_rows, key=lambda row: row["Match Rate"])[:12]
    mismatches = [row for row in comparison_rows if row["Match"] == "NO"]

    def table(rows, columns):
        parts = ["<table><thead><tr>"]
        for column in columns:
            parts.append(f"<th>{html.escape(column)}</th>")
        parts.append("</tr></thead><tbody>")
        for row in rows:
            parts.append("<tr>")
            for column in columns:
                value = row.get(column, "")
                if isinstance(value, float) and "Rate" in column:
                    value = percent(value)
                parts.append(f"<td>{html.escape(str(value))}</td>")
            parts.append("</tr>")
        parts.append("</tbody></table>")
        return "".join(parts)

    text = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>OTHER Visible PDF Accuracy Analysis</title>
  <style>
    body {{ margin: 0; font-family: Aptos, Segoe UI, Arial, sans-serif; background: #f4f7fb; color: #172033; }}
    header {{ background: #0f172a; color: white; padding: 28px 34px; }}
    main {{ padding: 24px 34px 42px; max-width: 1320px; margin: 0 auto; }}
    .grid {{ display: grid; grid-template-columns: repeat(4, minmax(180px, 1fr)); gap: 14px; margin-bottom: 18px; }}
    .metric, section {{ background: white; border: 1px solid #dbe3ef; border-radius: 8px; padding: 16px; }}
    section {{ margin-top: 16px; overflow-x: auto; }}
    .metric span {{ display: block; color: #64748b; font-size: 13px; margin-bottom: 8px; }}
    .metric strong {{ font-size: 28px; }}
    table {{ border-collapse: collapse; width: 100%; font-size: 13px; }}
    th, td {{ border-bottom: 1px solid #dbe3ef; padding: 8px 10px; text-align: left; vertical-align: top; }}
    th {{ background: #eef2f7; }}
    p {{ color: #64748b; line-height: 1.45; }}
  </style>
</head>
<body>
  <header>
    <h1>OTHER Visible PDF Accuracy Analysis</h1>
    <p>Compares OTHER script output against an independent visible-word extraction from the PDFs.</p>
  </header>
  <main>
    <div class="grid">
      <div class="metric"><span>Documents Analysed</span><strong>{overall["Documents"]}</strong></div>
      <div class="metric"><span>Overall Field Match Rate</span><strong>{percent(overall["Overall Match Rate"])}</strong></div>
      <div class="metric"><span>Field Mismatches</span><strong>{overall["Field Mismatches"]}</strong></div>
      <div class="metric"><span>Perfect Documents</span><strong>{overall["Perfect Documents"]}</strong></div>
    </div>
    <section><h2>What This Checks</h2><p>The independent pass rebuilds visible PDF lines from positioned words, then separately detects opinions, validated-by endings, annex pages, and service group counts.</p></section>
    <section><h2>Lowest Field Match Rates</h2>{table(worst_fields, ["Field", "Compared", "Matches", "Mismatches", "Match Rate", "Mean Abs Delta", "Max Abs Delta"])}</section>
    <section><h2>Documents With Most Differences</h2>{table(worst_docs, ["File", "Matched Fields", "Compared Fields", "Mismatched Fields", "Match Rate", "Mismatch Fields"])}</section>
    <section><h2>Mismatch Detail</h2>{table(mismatches[:160], ["File", "Field", "Script Value", "Visible Value", "Numeric Delta"])}</section>
  </main>
</body>
</html>
"""
    path.write_text(text, encoding="utf-8")


def parse_args():
    parser = argparse.ArgumentParser(description="Compare OTHER extractor output with independent visible-PDF extraction.")
    parser.add_argument("--limit", type=int, default=0, help="Number of PDFs to analyse. Default 0 means all PDFs.")
    parser.add_argument("--sample", choices=["first", "random"], default="first")
    parser.add_argument("--seed", type=int, default=DEFAULT_SEED)
    parser.add_argument("--output-dir", type=Path, default=OUTPUT_DIR)
    return parser.parse_args()


def main():
    args = parse_args()
    output_dir = args.output_dir if args.output_dir.is_absolute() else ROOT / args.output_dir
    output_dir.mkdir(parents=True, exist_ok=True)

    other = load_other_module()
    prefix_to_group, normalized_prefixes, mapping_warnings = load_prefix_mapping(other)
    for warning in mapping_warnings:
        print(f"WARNING: {warning}")

    available_pdf_files = sorted(OTHER_DIR.rglob("*.pdf"))
    pdf_files = select_pdf_files(available_pdf_files, args.limit, args.sample, args.seed)

    script_rows = []
    visible_rows = []
    debug_rows = []
    comparison_rows = []
    document_rows = []

    for index, pdf_path in enumerate(pdf_files, 1):
        script_result = other.process_pdf(pdf_path, prefix_to_group, normalized_prefixes)
        script_row = dict(script_result["base_row"])
        for prefix in OUTPUT_PREFIXES:
            script_row[prefix] = NA_VALUE if script_result["section_missing"] else script_result["group_totals"].get(prefix, "")

        visible_row, debug = build_visible_row(pdf_path, prefix_to_group, normalized_prefixes)

        script_rows.append({"Sample #": index, **script_row})
        visible_rows.append({"Sample #": index, **visible_row})
        debug_rows.append({"Sample #": index, "File": pdf_path.name, **debug})

        matched_fields = 0
        mismatch_fields = []
        for field in FIELDS:
            comparison = compare_values(field, script_row.get(field, ""), visible_row.get(field, ""))
            if comparison["match"]:
                matched_fields += 1
            else:
                mismatch_fields.append(field)
            comparison_rows.append({
                "Sample #": index,
                "File": pdf_path.name,
                "Field": field,
                "Script Value": script_row.get(field, ""),
                "Visible Value": visible_row.get(field, ""),
                "Script Normalized": comparison["script_normalized"],
                "Visible Normalized": comparison["visible_normalized"],
                "Match": "YES" if comparison["match"] else "NO",
                "Numeric Delta": comparison["delta"],
                "Percent Delta": comparison["pct_delta"],
            })

        document_rows.append({
            "Sample #": index,
            "File": pdf_path.name,
            "Matched Fields": matched_fields,
            "Compared Fields": len(FIELDS),
            "Mismatched Fields": len(mismatch_fields),
            "Match Rate": matched_fields / len(FIELDS),
            "Mismatch Fields": ", ".join(mismatch_fields),
        })

    overall, field_stats = calculate_stats(comparison_rows, document_rows)

    comparison_csv = output_dir / "other_visible_field_comparison.csv"
    document_csv = output_dir / "other_visible_document_summary.csv"
    field_stats_csv = output_dir / "other_visible_field_stats.csv"
    script_csv = output_dir / f"other_script_output_{len(script_rows)}.csv"
    visible_csv = output_dir / f"other_visible_actuals_{len(visible_rows)}.csv"
    debug_csv = output_dir / "other_visible_extraction_debug.csv"
    html_path = output_dir / "index.html"

    write_csv(comparison_csv, comparison_rows, list(comparison_rows[0].keys()))
    write_csv(document_csv, document_rows, list(document_rows[0].keys()))
    write_csv(field_stats_csv, field_stats, list(field_stats[0].keys()))
    write_csv(script_csv, script_rows, list(script_rows[0].keys()))
    write_csv(visible_csv, visible_rows, list(visible_rows[0].keys()))
    write_csv(debug_csv, debug_rows, list(debug_rows[0].keys()))
    write_html(html_path, overall, field_stats, document_rows, comparison_rows)

    print("OTHER visible PDF accuracy analysis complete")
    print(f"PDFs available: {len(available_pdf_files)}")
    print(f"Documents analysed: {overall['Documents']}")
    print(f"Overall match rate: {overall['Overall Match Rate']:.3%}")
    print(f"Field mismatches: {overall['Field Mismatches']}")
    print(f"Perfect documents: {overall['Perfect Documents']}")
    print(f"Comparison CSV: {comparison_csv}")
    print(f"HTML summary: {html_path}")


if __name__ == "__main__":
    main()
