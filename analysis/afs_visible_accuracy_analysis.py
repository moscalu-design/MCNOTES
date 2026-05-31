import argparse
import csv
import html
import importlib.util
import math
import random
import re
from collections import Counter, defaultdict
from pathlib import Path
from statistics import mean

import fitz


ROOT = Path(__file__).resolve().parents[1]
AFS_DIR = ROOT / "AFS_Package" / "AFS_File_Folder"
OUTPUT_DIR = ROOT / "AFS_Package" / "outputs" / "afs_visible_accuracy"
DEFAULT_SEED = 20260529

OUTPUT_PREFIXES = [
    "OPS", "GLO", "PJ", "RM", "OCCO", "JU", "ECON",
    "CFC", "EIF", "FI", "IG", "PMM", "SG", "GIS", "HR", "OTHER"
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

DETECT_PREFIXES = [
    "GLO",
    "GR&C-RM", "OCCO", "JU", "PJ", "PMM", "ECON", "OPS",
    "GR&C-RM/CCRD", "RM/OPE", "GR&C/CCRD",
    "GR&C-OCCO"
]

MERGE_GROUPS = {
    "RM": {"GR&C-RM", "GR&C-RM/CCRD", "RM/OPE", "GR&C/CCRD"},
    "OCCO": {"OCCO", "GR&C-OCCO"},
    "FI": {"FI"},
    "GLO": {"GLO"},
    "OPS": {"OPS", "OPS Dir", "OPS/GLO", "OPS and GLO"},
    "PJ": {"PJ", "PJ DIR"},
    "IG": {"IG", "IG/EV"},
    "ECON": {"SG ECON", "ECON"},
}

WORD_RE = re.compile(r"[^\W_]+(?:'[^\W_]+)?", re.UNICODE)
ZERO_WIDTH_RE = re.compile(r"[\u200B-\u200D\uFEFF]")
ALL_WS_RE = re.compile(r"\s+")
HYPHEN_LINEBREAK_RE = re.compile(
    r"(\w)[-\u2010\u2011\u2012\u2013\u2014\u2212\u00AD]\s*\n\s*(\w)",
    re.UNICODE
)
DATE_RE = re.compile(r"\b(\d{2})(?:/|\.)(\d{2})(?:/|\.)(\d{4})\b")
LUX_DATE_RE = re.compile(r"\bLuxembourg\b\s*,?\s*(\d{2}(?:/|\.)\d{2}(?:/|\.)\d{4})", re.IGNORECASE)
FILE_CODE_RE = re.compile(r"(?<![A-Za-z0-9])(?:\d{8}|\d{4}-\d{4})(?![A-Za-z0-9])")
AUTHOR_FORMAT_RE = re.compile(r"^[A-Z]{2}[A-Za-z0-9&.\- ]*(?:/[A-Za-z0-9&().,'\- ]+)+$")

OPINIONS_RE = re.compile(r"^\s*(\d+\s*[\)\.]?\s*)?(?:Services\s+)?Opinions?\s*$", re.IGNORECASE)
TIMETABLE_RE = re.compile(r"^\s*(\d+\s*[\)\.]?\s*)?Timetable\b", re.IGNORECASE)
FACT_SHEET_VALIDATION_RE = re.compile(r"\bFact\s+Sheet\s+validation\b", re.IGNORECASE)
F_ONLY_RE = re.compile(r"^\s*F\.\s*$")
PROJECT_COMMITTEE_LINE_RE = re.compile(r"\bProject\s+Committee\b", re.IGNORECASE)
F_PROJECT_COMMITTEE_SAME_LINE_RE = re.compile(r"^\s*F\.\s*Project\s+Committee\b", re.IGNORECASE)
PAGE_NUMBER_RE = re.compile(r"^\s*-\s*\d+\s*-\s*$")
OF_PAGE_RE = re.compile(r"\b\d+\s+of\s+\d+\b", re.IGNORECASE)
MC_AFS_RE = re.compile(r"\bMC\s+AFS\b", re.IGNORECASE)
CONFIDENTIAL_RE = re.compile(r"\bConfidential\b", re.IGNORECASE)
OCCO_OUTCOME_RE = re.compile(r"^\s*Outcome\s+of\s+OCCO\s+assessment\b", re.IGNORECASE)

prefix_alt = "|".join(map(re.escape, sorted(DETECT_PREFIXES, key=len, reverse=True)))
OPINION_BLOCK_RE = re.compile(
    rf"^\s*(?:[A-Z]\.\s+|\d+\.\s+)?({prefix_alt})\s+(?:Opinion|position|input)\b",
    re.IGNORECASE
)


def load_afs_module():
    spec = importlib.util.spec_from_file_location(
        "afs_extractor",
        ROOT / "AFS_Package" / "afs_extractor.py"
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def normalize_text(value):
    text = str(value or "")
    text = text.replace("’", "'").replace("‘", "'")
    text = text.replace("\u00AD", "")
    text = text.replace("\u00A0", " ")
    text = re.sub(r"[\u2010\u2011\u2012\u2013\u2014\u2212]", "-", text)
    text = ZERO_WIDTH_RE.sub("", text)
    return re.sub(r"\s+", " ", text).strip()


def flatten_for_count(value):
    text = normalize_text(value)
    text = HYPHEN_LINEBREAK_RE.sub(r"\1\2", text)
    text = re.sub(r"(?m)^\s*[oO•]\s+", "", text)
    text = text.replace("ï‚·", "")
    text = text.replace("&", "").replace("-", "").replace("/", "")
    return ALL_WS_RE.sub(" ", text).strip()


def count_words(value):
    return len(WORD_RE.findall(flatten_for_count(value)))


def clean_for_csv_title(value):
    return str(value).replace(",", "")


def to_slash_date(value):
    match = DATE_RE.search(str(value or ""))
    if not match:
        return ""
    return f"{match.group(1)}/{match.group(2)}/{match.group(3)}"


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
            text = " ".join(part[4] for part in parts)
            page_lines.append({
                "page_index": page_index,
                "page": page_index + 1,
                "page_width": page.rect.width,
                "page_height": page.rect.height,
                "x0": min(part[0] for part in parts),
                "y0": min(part[1] for part in parts),
                "x1": max(part[2] for part in parts),
                "y1": max(part[3] for part in parts),
                "text": normalize_text(text),
            })

        page_lines.sort(key=lambda row: (row["y0"], row["x0"]))
        for line in page_lines:
            line["order"] = order
            order += 1
            lines.append(line)

    return lines


def is_contents_page_lines(page_lines):
    first_lines = [
        normalize_text(line["text"]).lower()
        for line in page_lines[:10]
        if normalize_text(line["text"])
    ]
    return any(line.startswith("contents") or "table of contents" in line for line in first_lines)


def mark_contents_pages(lines):
    by_page = defaultdict(list)
    for line in lines:
        by_page[line["page"]].append(line)

    contents_pages = {
        page for page, page_lines in by_page.items()
        if is_contents_page_lines(page_lines)
    }

    for line in lines:
        line["is_contents_page"] = line["page"] in contents_pages

    return contents_pages


def line_is_noise(line):
    text = normalize_text(line["text"])
    return (
        not text
        or bool(PAGE_NUMBER_RE.match(text))
        or bool(OF_PAGE_RE.search(text))
        or bool(MC_AFS_RE.search(text))
        or bool(CONFIDENTIAL_RE.search(text))
        or "corporate use" in text.lower()
    )


def is_standalone_prefix(text):
    normalized = normalize_text(text)
    for prefix in DETECT_PREFIXES:
        if normalized.upper() == prefix.upper():
            return prefix
    return None


def is_countable_opinion_start(text):
    text = normalize_text(text)
    if OPINION_BLOCK_RE.match(text):
        return True
    if OCCO_OUTCOME_RE.match(text):
        return True
    if is_standalone_prefix(text):
        return True
    return False


def find_primary_opinions_header(lines):
    contents_pages_skipped = len({line["page"] for line in lines if line.get("is_contents_page")})
    for line in lines:
        if line.get("is_contents_page"):
            continue
        if OPINIONS_RE.match(line["text"]):
            return {**line, "found": True, "contents_pages_skipped": contents_pages_skipped}
    return {"found": False, "contents_pages_skipped": contents_pages_skipped}


def find_first_countable_opinion_start(lines, start_order=0):
    pending_f = False

    for line in lines:
        if line["order"] < start_order or line.get("is_contents_page"):
            continue

        text = normalize_text(line["text"])
        if not text:
            continue

        if TIMETABLE_RE.search(text):
            return {
                "found": False,
                "stopped_before_countable_opinion": True,
                "stop_reason": "Timetable",
                "stop_page": line["page"],
            }

        if F_PROJECT_COMMITTEE_SAME_LINE_RE.match(text):
            return {
                "found": False,
                "stopped_before_countable_opinion": True,
                "stop_reason": "F. Project Committee same line",
                "stop_page": line["page"],
            }

        if pending_f and PROJECT_COMMITTEE_LINE_RE.search(text):
            return {
                "found": False,
                "stopped_before_countable_opinion": True,
                "stop_reason": "F. followed by Project Committee",
                "stop_page": line["page"],
            }

        pending_f = bool(F_ONLY_RE.match(text))

        if is_countable_opinion_start(text):
            return {**line, "found": True}

    return {"found": False, "stopped_before_countable_opinion": False}


def find_start_marker(lines):
    primary = find_primary_opinions_header(lines)
    first_count_anywhere = find_first_countable_opinion_start(lines, start_order=0)

    if primary.get("found"):
        first_after_primary = find_first_countable_opinion_start(
            lines,
            start_order=primary["order"] + 1
        )
        fallback_before_primary = (
            first_count_anywhere.get("found")
            and first_count_anywhere["order"] < primary["order"]
        )

        if first_after_primary.get("found"):
            return {
                "start_found": True,
                "start_mode": "fallback_then_primary_to_first_counted" if fallback_before_primary else "primary_to_first_counted",
                "start_kind": "countable_opinion_after_primary",
                "start_order": first_after_primary["order"],
                "start_page": first_after_primary["page"],
                "opinion_start_order": first_after_primary["order"],
                "trigger_text": first_after_primary["text"],
                "primary_found": True,
                "primary_page": primary["page"],
                "primary_trigger_text": primary["text"],
                "fallback_before_primary": fallback_before_primary,
                "no_countable_prefix_after_primary": False,
                "contents_pages_skipped": primary.get("contents_pages_skipped", 0),
            }

        return {
            "start_found": True,
            "start_mode": "primary_no_counted_prefix",
            "start_kind": "primary_header_only",
            "start_order": primary["order"],
            "start_page": primary["page"],
            "opinion_start_order": primary["order"] + 1,
            "trigger_text": primary["text"],
            "primary_found": True,
            "primary_page": primary["page"],
            "primary_trigger_text": primary["text"],
            "fallback_before_primary": fallback_before_primary,
            "no_countable_prefix_after_primary": True,
            "contents_pages_skipped": primary.get("contents_pages_skipped", 0),
        }

    if first_count_anywhere.get("found"):
        return {
            "start_found": True,
            "start_mode": "fallback_counted_prefix",
            "start_kind": "countable_opinion_fallback",
            "start_order": first_count_anywhere["order"],
            "start_page": first_count_anywhere["page"],
            "opinion_start_order": first_count_anywhere["order"],
            "trigger_text": first_count_anywhere["text"],
            "primary_found": False,
            "primary_page": "",
            "primary_trigger_text": "",
            "fallback_before_primary": False,
            "no_countable_prefix_after_primary": False,
            "contents_pages_skipped": primary.get("contents_pages_skipped", 0),
        }

    return {
        "start_found": False,
        "start_mode": "",
        "start_kind": "",
        "start_order": "",
        "start_page": "",
        "opinion_start_order": "",
        "trigger_text": "",
        "primary_found": False,
        "primary_page": "",
        "primary_trigger_text": "",
        "fallback_before_primary": False,
        "no_countable_prefix_after_primary": False,
        "contents_pages_skipped": primary.get("contents_pages_skipped", 0),
    }


def collect_pre_opinion_lines(lines, start_marker):
    if not start_marker.get("start_found"):
        return [
            line for line in lines
            if not line.get("is_contents_page") and not line_is_noise(line)
        ]

    return [
        line for line in lines
        if line["order"] < start_marker["start_order"]
        and not line.get("is_contents_page")
        and not line_is_noise(line)
    ]


def collect_opinion_lines(lines, start_marker):
    if not start_marker.get("start_found"):
        return [], {"stop_found": False, "stop_reason": "", "stop_page": ""}

    opinion_lines = []
    pending_f = False
    started_real_opinion = start_marker.get("start_kind") in {
        "countable_opinion_after_primary",
        "countable_opinion_fallback",
    }
    stop_info = {"stop_found": False, "stop_reason": "", "stop_page": ""}

    for line in lines:
        if line["order"] < start_marker["opinion_start_order"]:
            continue
        if line.get("is_contents_page"):
            continue

        text = normalize_text(line["text"])
        if not text:
            continue

        if TIMETABLE_RE.search(text):
            stop_info.update({
                "stop_found": True,
                "stop_reason": "Timetable",
                "stop_page": line["page"],
            })
            return opinion_lines, stop_info

        if is_countable_opinion_start(text):
            started_real_opinion = True

        if started_real_opinion:
            if F_PROJECT_COMMITTEE_SAME_LINE_RE.match(text):
                stop_info.update({
                    "stop_found": True,
                    "stop_reason": "F. Project Committee same line",
                    "stop_page": line["page"],
                })
                return opinion_lines, stop_info

            if pending_f and PROJECT_COMMITTEE_LINE_RE.search(text):
                stop_info.update({
                    "stop_found": True,
                    "stop_reason": "F. followed by Project Committee",
                    "stop_page": line["page"],
                })
                return opinion_lines, stop_info

            pending_f = bool(F_ONLY_RE.match(text))
        else:
            pending_f = False

        if not line_is_noise(line):
            opinion_lines.append(line)

    return opinion_lines, stop_info


def split_visible_opinion_blocks(opinion_lines):
    segments = []
    current_prefix = None
    current_lines = []

    def flush():
        nonlocal current_prefix, current_lines
        if not current_prefix:
            return

        raw_text = "\n".join(line["text"] for line in current_lines).strip()
        segments.append({
            "prefix": current_prefix,
            "words": count_words(raw_text),
            "raw_text": raw_text,
        })
        current_lines = []

    for line in opinion_lines:
        text = normalize_text(line["text"])
        match = OPINION_BLOCK_RE.match(text)

        if match:
            flush()
            current_prefix = match.group(1)
            current_lines = []
            continue

        if OCCO_OUTCOME_RE.match(text):
            flush()
            current_prefix = "OCCO"
            current_lines = []
            continue

        fallback = is_standalone_prefix(text)
        if fallback:
            flush()
            current_prefix = fallback
            current_lines = []
            continue

        if current_prefix:
            current_lines.append(line)

    flush()
    return segments


def merged_total(prefix_data, output_prefix):
    if output_prefix in MERGE_GROUPS:
        return sum(prefix_data.get(prefix, 0) for prefix in MERGE_GROUPS[output_prefix])
    return prefix_data.get(output_prefix, 0)


def extract_visible_operation_number(file_name, lines):
    match = FILE_CODE_RE.search(file_name)
    if match:
        return match.group(0).replace("-", "")

    searchable = "\n".join(line["text"] for line in lines[:250])
    match = FILE_CODE_RE.search(searchable)
    return match.group(0).replace("-", "") if match else ""


def extract_visible_validation_date(lines, author):
    page_order = [2, 1] if author else [1, 2]
    available_pages = {line["page"] for line in lines}
    page_order = [page for page in page_order if page in available_pages]

    for page in page_order:
        candidates = []
        for line in lines:
            if line["page"] != page:
                continue

            is_date_area = (
                line["x0"] >= line["page_width"] * 0.40
                and line["y0"] <= line["page_height"] * 0.55
            )
            lux_match = LUX_DATE_RE.search(line["text"])
            if is_date_area and lux_match:
                candidates.append((line["y0"], -line["x1"], lux_match.group(1)))

        if candidates:
            candidates.sort()
            return to_slash_date(candidates[0][2])

    for page in page_order:
        for line in lines:
            if line["page"] != page:
                continue
            lux_match = LUX_DATE_RE.search(line["text"])
            if lux_match:
                return to_slash_date(lux_match.group(1))

    for line in lines[:160]:
        if line["page"] > 2:
            continue
        date = to_slash_date(line["text"])
        if date:
            return date

    return ""


def extract_visible_author(lines):
    first_page_lines = [line for line in lines if line["page"] == 1]
    date_index = None

    for idx, line in enumerate(first_page_lines):
        if to_slash_date(line["text"]):
            date_index = idx
            break

    if date_index is None:
        return ""

    for candidate in first_page_lines[date_index + 1:date_index + 11]:
        text = normalize_text(candidate["text"])
        if AUTHOR_FORMAT_RE.fullmatch(text):
            return text

    return ""


def extract_visible_annex_page_count(doc, lines):
    timetable_line = None
    for line in lines:
        if TIMETABLE_RE.search(line["text"]):
            timetable_line = line
            break

    start_order = timetable_line["order"] if timetable_line else -1
    for line in lines:
        if line["order"] <= start_order:
            continue
        if FACT_SHEET_VALIDATION_RE.search(line["text"]):
            return max(doc.page_count - line["page"], 0)

    return "check"


def build_visible_actual_row(pdf_path):
    with fitz.open(pdf_path) as doc:
        lines = read_visible_lines(doc)
        contents_pages = mark_contents_pages(lines)
        start_marker = find_start_marker(lines)
        pre_lines = collect_pre_opinion_lines(lines, start_marker)
        opinion_lines, stop_info = collect_opinion_lines(lines, start_marker)
        segments = split_visible_opinion_blocks(opinion_lines)

        prefix_data = Counter()
        for segment in segments:
            prefix_data[segment["prefix"]] += segment["words"]

        row = {
            "Template": "AFS",
            "Extraction": "Automated",
            "MC_Note_Type": "NOTEMCDEC",
            "File Name": clean_for_csv_title(pdf_path.name),
            "Operation Number": extract_visible_operation_number(pdf_path.name, lines),
            "Validation Date": "",
            "Author": extract_visible_author(lines),
            "Document Page Count": doc.page_count,
            "Page count before opinion": start_marker["start_page"] if start_marker.get("start_found") else "check",
            "Annex Page Count": extract_visible_annex_page_count(doc, lines),
            "Text Before Opinions": count_words("\n".join(line["text"] for line in pre_lines)),
        }
        row["Validation Date"] = extract_visible_validation_date(lines, row["Author"])

        for output_prefix in OUTPUT_PREFIXES:
            value = merged_total(prefix_data, output_prefix)
            row[output_prefix] = value if value else ""

        debug = {
            "visible_line_count": len(lines),
            "contents_pages": ",".join(str(page) for page in sorted(contents_pages)),
            "start_found": "YES" if start_marker.get("start_found") else "NO",
            "start_mode": start_marker.get("start_mode", ""),
            "start_page": start_marker.get("start_page", ""),
            "start_trigger_text": start_marker.get("trigger_text", ""),
            "primary_found": "YES" if start_marker.get("primary_found") else "NO",
            "primary_page": start_marker.get("primary_page", ""),
            "primary_trigger_text": start_marker.get("primary_trigger_text", ""),
            "stop_found": "YES" if stop_info.get("stop_found") else "NO",
            "stop_reason": stop_info.get("stop_reason", ""),
            "stop_page": stop_info.get("stop_page", ""),
            "pre_opinion_visible_lines": len(pre_lines),
            "opinion_visible_lines": len(opinion_lines),
            "segments": len(segments),
            "segment_preview": " || ".join(
                f"{segment['prefix']}={segment['words']}"
                for segment in segments[:12]
            ),
        }

        return row, debug


def normalize_compare(field, value):
    if field == "Validation Date":
        return to_slash_date(value)

    text = normalize_text(value)
    if text.lower() in {"none", "nan"}:
        return ""

    if field in NUMERIC_FIELDS:
        if text == "":
            return ""
        if text.lower() == "check":
            return "check"
        try:
            number = float(text)
        except ValueError:
            return text
        return str(int(number)) if math.isfinite(number) and number.is_integer() else str(number)

    return text


def compare_values(field, script_value, actual_value):
    script_norm = normalize_compare(field, script_value)
    actual_norm = normalize_compare(field, actual_value)
    delta = ""
    pct_delta = ""

    if field in NUMERIC_FIELDS:
        try:
            delta_value = float(script_norm) - float(actual_norm)
            delta = int(delta_value) if delta_value.is_integer() else delta_value
            if float(actual_norm) != 0:
                pct_delta = delta_value / float(actual_norm)
        except (TypeError, ValueError):
            pass

    return {
        "script_normalized": script_norm,
        "actual_normalized": actual_norm,
        "match": script_norm == actual_norm,
        "delta": delta,
        "pct_delta": pct_delta,
    }


def build_script_row(afs, pdf_path):
    result = afs.process_pdf(pdf_path)
    return {field: result["row_csv"].get(field, "") for field in FIELDS}


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
    worst_fields = sorted(field_stats, key=lambda row: row["Match Rate"] if row["Match Rate"] != "" else 0)[:10]
    worst_docs = sorted(document_rows, key=lambda row: row["Match Rate"])[:10]
    mismatches = [row for row in comparison_rows if row["Match"] == "NO"]

    def table(rows, columns):
        html_parts = ['<table class="sortable-table"><thead><tr>']
        for index, column in enumerate(columns):
            html_parts.append(
                f'<th><button type="button" data-sort-column="{index}">'
                f'{html.escape(column)}<span class="sort-indicator"></span></button></th>'
            )
        html_parts.append("</tr></thead><tbody>")
        for row in rows:
            html_parts.append("<tr>")
            for column in columns:
                value = row.get(column, "")
                sort_value = value
                if isinstance(value, float) and "Rate" in column:
                    value = percent(value)
                html_parts.append(
                    f'<td data-sort-value="{html.escape(str(sort_value), quote=True)}">'
                    f'{html.escape(str(value))}</td>'
                )
            html_parts.append("</tr>")
        html_parts.append("</tbody></table>")
        return "".join(html_parts)

    html_text = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>AFS Visible PDF Accuracy Analysis</title>
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
    th button {{ all: unset; box-sizing: border-box; cursor: pointer; display: flex; align-items: center; justify-content: space-between; gap: 8px; width: 100%; }}
    th button:focus-visible {{ outline: 2px solid #1d4ed8; outline-offset: 2px; }}
    .sort-indicator {{ color: #64748b; font-size: 11px; font-weight: 600; min-width: 24px; text-align: right; }}
    p {{ color: #64748b; line-height: 1.45; }}
  </style>
</head>
<body>
  <header>
    <h1>AFS Visible PDF Accuracy Analysis</h1>
    <p>Compares AFS script output against an independent visible-word extraction from the PDFs.</p>
  </header>
  <main>
    <div class="grid">
      <div class="metric"><span>Documents Analysed</span><strong>{overall["Documents"]}</strong></div>
      <div class="metric"><span>Overall Field Match Rate</span><strong>{percent(overall["Overall Match Rate"])}</strong></div>
      <div class="metric"><span>Field Mismatches</span><strong>{overall["Field Mismatches"]}</strong></div>
      <div class="metric"><span>Perfect Documents</span><strong>{overall["Perfect Documents"]}</strong></div>
    </div>
    <section>
      <h2>What This Checks</h2>
      <p>The independent pass rebuilds visible PDF lines from positioned words, identifies the AFS Opinions section and Timetable stop from those lines, then recounts text-before-opinions and service opinion blocks.</p>
    </section>
    <section><h2>Lowest Field Match Rates</h2>{table(worst_fields, ["Field", "Compared", "Matches", "Mismatches", "Match Rate", "Mean Abs Delta", "Max Abs Delta"])}</section>
    <section><h2>Documents With Most Differences</h2>{table(worst_docs, ["File Name", "Matched Fields", "Compared Fields", "Mismatched Fields", "Match Rate", "Mismatch Fields"])}</section>
    <section><h2>Mismatch Detail</h2>{table(mismatches[:120], ["File Name", "Field", "Script Value", "Visible Value", "Numeric Delta"])}</section>
  </main>
  <script>
    (() => {{
      function sortableValue(cell) {{
        const raw = (cell.dataset.sortValue || cell.textContent || "").trim();
        const numeric = raw.replace(/,/g, "").replace(/%$/, "");
        if (numeric !== "" && !Number.isNaN(Number(numeric))) {{
          return {{ type: "number", value: Number(numeric) }};
        }}
        return {{ type: "text", value: raw.toLowerCase() }};
      }}

      document.querySelectorAll(".sortable-table").forEach((table) => {{
        const tbody = table.tBodies[0];
        table.querySelectorAll("th button").forEach((button) => {{
          button.addEventListener("click", () => {{
            const columnIndex = Number(button.dataset.sortColumn);
            const current = button.getAttribute("aria-sort");
            const direction = current === "ascending" ? "descending" : "ascending";

            table.querySelectorAll("th button").forEach((header) => {{
              header.removeAttribute("aria-sort");
              const indicator = header.querySelector(".sort-indicator");
              if (indicator) indicator.textContent = "";
            }});

            button.setAttribute("aria-sort", direction);
            const indicator = button.querySelector(".sort-indicator");
            if (indicator) indicator.textContent = direction === "ascending" ? "asc" : "desc";

            const rows = Array.from(tbody.rows);
            rows.sort((left, right) => {{
              const a = sortableValue(left.cells[columnIndex]);
              const b = sortableValue(right.cells[columnIndex]);
              const result = a.type === "number" && b.type === "number"
                ? a.value - b.value
                : String(a.value).localeCompare(String(b.value), undefined, {{ numeric: true, sensitivity: "base" }});
              return direction === "ascending" ? result : -result;
            }});
            rows.forEach((row) => tbody.appendChild(row));
          }});
        }});
      }});
    }})();
  </script>
</body>
</html>
"""
    path.write_text(html_text, encoding="utf-8")


def parse_args():
    parser = argparse.ArgumentParser(description="Compare AFS extractor output with independent visible-PDF extraction.")
    parser.add_argument("--limit", type=int, default=0, help="Number of PDFs to analyse. Default 0 means all PDFs.")
    parser.add_argument("--sample", choices=["first", "random"], default="first")
    parser.add_argument("--seed", type=int, default=DEFAULT_SEED)
    parser.add_argument("--output-dir", type=Path, default=OUTPUT_DIR)
    return parser.parse_args()


def main():
    args = parse_args()
    output_dir = args.output_dir
    if not output_dir.is_absolute():
        output_dir = ROOT / output_dir
    output_dir.mkdir(parents=True, exist_ok=True)

    afs = load_afs_module()
    available_pdf_files = sorted(AFS_DIR.rglob("*.pdf"))
    pdf_files = select_pdf_files(available_pdf_files, args.limit, args.sample, args.seed)

    script_rows = []
    visible_rows = []
    debug_rows = []
    comparison_rows = []
    document_rows = []

    for index, pdf_path in enumerate(pdf_files, 1):
        script_row = build_script_row(afs, pdf_path)
        visible_row, debug = build_visible_actual_row(pdf_path)
        visible_row = {field: visible_row.get(field, "") for field in FIELDS}

        script_rows.append({"Sample #": index, **script_row})
        visible_rows.append({"Sample #": index, **visible_row})
        debug_rows.append({"Sample #": index, "File Name": pdf_path.name, **debug})

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
                "File Name": pdf_path.name,
                "Field": field,
                "Script Value": script_row.get(field, ""),
                "Visible Value": visible_row.get(field, ""),
                "Script Normalized": comparison["script_normalized"],
                "Visible Normalized": comparison["actual_normalized"],
                "Match": "YES" if comparison["match"] else "NO",
                "Numeric Delta": comparison["delta"],
                "Percent Delta": comparison["pct_delta"],
            })

        document_rows.append({
            "Sample #": index,
            "File Name": pdf_path.name,
            "Matched Fields": matched_fields,
            "Compared Fields": len(FIELDS),
            "Mismatched Fields": len(mismatch_fields),
            "Match Rate": matched_fields / len(FIELDS),
            "Mismatch Fields": ", ".join(mismatch_fields),
        })

    overall, field_stats = calculate_stats(comparison_rows, document_rows)

    comparison_csv = output_dir / "afs_visible_field_comparison.csv"
    document_csv = output_dir / "afs_visible_document_summary.csv"
    field_stats_csv = output_dir / "afs_visible_field_stats.csv"
    script_csv = output_dir / f"afs_script_output_{len(script_rows)}.csv"
    visible_csv = output_dir / f"afs_visible_actuals_{len(visible_rows)}.csv"
    debug_csv = output_dir / "afs_visible_extraction_debug.csv"
    html_path = output_dir / "index.html"

    write_csv(comparison_csv, comparison_rows, list(comparison_rows[0].keys()))
    write_csv(document_csv, document_rows, list(document_rows[0].keys()))
    write_csv(field_stats_csv, field_stats, list(field_stats[0].keys()))
    write_csv(script_csv, script_rows, list(script_rows[0].keys()))
    write_csv(visible_csv, visible_rows, list(visible_rows[0].keys()))
    write_csv(debug_csv, debug_rows, list(debug_rows[0].keys()))
    write_html(html_path, overall, field_stats, document_rows, comparison_rows)

    print("AFS visible PDF accuracy analysis complete")
    print(f"PDFs available: {len(available_pdf_files)}")
    print(f"Documents analysed: {overall['Documents']}")
    print(f"Overall match rate: {overall['Overall Match Rate']:.3%}")
    print(f"Field mismatches: {overall['Field Mismatches']}")
    print(f"Perfect documents: {overall['Perfect Documents']}")
    print(f"Comparison CSV: {comparison_csv}")
    print(f"HTML summary: {html_path}")


if __name__ == "__main__":
    main()
