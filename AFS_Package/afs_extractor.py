#1.0 27/05/2026
import argparse
import csv
import math
import re
import statistics
import unicodedata
from collections import Counter
from contextlib import closing
from pathlib import Path

import fitz


DEBUG = False
STATUS_OUTPUT = DEBUG
DEBUG_TEXT_CHAR_LIMIT = None

AFS_DIR = Path(__file__).resolve().parent / "AFS_File_Folder"
OUTPUT_DIR = Path(__file__).resolve().parent / "outputs"


# CFC, FC, and SG deliberately removed from detection/counting.
# They remain in OUTPUT_PREFIXES, so the CSV schema does not change.
DETECT_PREFIXES = [
    "GLO",
    "GR&C-RM", "OCCO", "JU", "PJ", "PMM", "ECON", "OPS",
    "GR&C-RM/CCRD", "RM/OPE", "GR&C/CCRD",
    "GR&C-OCCO"
]

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

RAW_FIELDNAMES = BASE_COLUMNS + OUTPUT_PREFIXES

STAT_FIELDNAMES = [
    "Metric",
    "Average",
    "Median",
    "Min",
    "Max",
    "CI Lower (95%)",
    "CI Upper (95%)",
    "p-value (vs 0)"
]


WORD_RE = re.compile(r"[^\W_]+(?:'[^\W_]+)?", re.UNICODE)
ZERO_WIDTH_RE = re.compile(r"[\u200B-\u200D\uFEFF]")
ALL_WS_RE = re.compile(r"\s+")
HYPHEN_LINEBREAK_RE = re.compile(
    r"(\w)[-\u2010\u2011\u2012\u2013\u2014\u2212\u00AD]\s*\n\s*(\w)",
    re.UNICODE
)

OPINIONS_RE = re.compile(
    r"(?im)^\s*(\d+\s*[\)\.]?\s*)?(?:Services\s+)?Opinions?\s*$"
)
TIMETABLE_RE = re.compile(r"(?im)^\s*(\d+\s*[\)\.]?\s*)?Timetable\b")
FACT_SHEET_VALIDATION_RE = re.compile(r"\bFact\s+Sheet\s+validation\b", re.IGNORECASE)
F_ONLY_RE = re.compile(r"(?m)^\s*F\.\s*$")
PROJECT_COMMITTEE_LINE_RE = re.compile(r"(?i)\bProject\s+Committee\b")
F_PROJECT_COMMITTEE_SAME_LINE_RE = re.compile(
    r"(?im)^\s*F\.\s*Project\s+Committee\b"
)
FILE_CODE_RE = re.compile(
    r"(?<![A-Za-z0-9])(?:\d{8}|\d{4}-\d{4})(?![A-Za-z0-9])"
)
AUTHOR_FORMAT_RE = re.compile(
    r"^[A-Z]{2}[A-Za-z0-9&.\- ]*(?:/[A-Za-z0-9&().,'\- ]+)+$"
)

prefix_alt = "|".join(map(re.escape, sorted(DETECT_PREFIXES, key=len, reverse=True)))

OPINION_BLOCK_RE = re.compile(
    rf"(?im)^\s*(?:[A-Z]\.\s+|\d+\.\s+)?({prefix_alt})\s+(Opinion|position|input)\b"
)

PAGE_NUMBER_RE = re.compile(r"^\s*-\s*\d+\s*-\s*$")
OF_PAGE_RE = re.compile(r"\b\d+\s+of\s+\d+\b", re.IGNORECASE)
MC_AFS_RE = re.compile(r"\bMC\s+AFS\b", re.IGNORECASE)
CONFIDENTIAL_RE = re.compile(r"\bConfidential\b", re.IGNORECASE)
VALIDATION_DATE_RE = re.compile(r"\b\d{2}(?:/|\.)\d{2}(?:/|\.)\d{4}\b")
LUX_DATE_RE = re.compile(
    r"Luxembourg,\s*(\d{2}(?:/|\.)\d{2}(?:/|\.)\d{4})",
    re.IGNORECASE
)
OCCO_OUTCOME_RE = re.compile(r"(?im)^\s*Outcome\s+of\s+OCCO\s+assessment\b")


def normalize_text(s: str) -> str:
    s = str(s or "")
    s = s.replace("’", "'").replace("‘", "'")
    s = s.replace("\u00AD", "")
    s = s.replace("\u00A0", " ")
    s = re.sub(r"[\u2010\u2011\u2012\u2013\u2014\u2212]", "-", s)
    s = ZERO_WIDTH_RE.sub("", s)
    return s.strip()


def flatten_for_count(s: str) -> str:
    s = normalize_text(s)
    s = HYPHEN_LINEBREAK_RE.sub(r"\1\2", s)
    s = re.sub(r"(?m)^\s*[oO•]\s+", "", s)
    s = s.replace("ï‚·", "")
    s = s.replace("&", "").replace("-", "").replace("/", "")
    s = ALL_WS_RE.sub(" ", s)
    return s.strip()


def count_words_and_text(s: str):
    if not s:
        return 0, ""

    count_text = flatten_for_count(s)
    return len(WORD_RE.findall(count_text)), count_text


def repair_mojibake_text(value: str) -> str:
    text = str(value or "")
    replacements = {
        "\u00e2\u20ac\u201c": "\u2013",
        "\u00e2\u20ac\u0093": "\u2013",
        "\u00e2\u20ac\u201d": "\u2014",
        "\u00e2\u20ac\u0094": "\u2014",
        "\u00e2\u20ac\u02dc": "\u2018",
        "\u00e2\u20ac\u2122": "\u2019",
        "\u00e2\u20ac\u0153": "\u201c",
        "\u00e2\u20ac\u009d": "\u201d",
        "\u00e2\u20ac\u00a6": "\u2026",
        "\u00c2\u00a0": " ",
    }
    for bad, good in replacements.items():
        text = text.replace(bad, good)

    for _ in range(2):
        if not any(marker in text for marker in ("\u00c3", "\u00c2", "\u00e2", "\u20ac", "\ufffd")):
            break
        try:
            fixed = text.encode("cp1252").decode("utf-8")
        except UnicodeError:
            break
        if fixed == text:
            break
        text = fixed

    return unicodedata.normalize("NFC", text)


def clean_export_value(value):
    if isinstance(value, str):
        return repair_mojibake_text(value)
    return value


def clean_for_csv_title(value: str) -> str:
    return repair_mojibake_text(value).replace(",", "")


def debug_text_block(text: str) -> str:
    if DEBUG_TEXT_CHAR_LIMIT is None:
        return text

    if len(text) <= DEBUG_TEXT_CHAR_LIMIT:
        return text

    return text[:DEBUG_TEXT_CHAR_LIMIT] + "\n...[TRUNCATED]..."


def clean_author_value(author: str) -> str:
    author = normalize_text(str(author or ""))

    if not author:
        return ""

    if AUTHOR_FORMAT_RE.fullmatch(author):
        return author

    return ""


def to_slash_date(date_str: str) -> str:
    if not date_str:
        return ""

    date_str = str(date_str).strip()

    if "." in date_str:
        parts = date_str.split(".")

        if len(parts) == 3:
            return f"{parts[0]}/{parts[1]}/{parts[2]}"

    return date_str


def find_first_date_in_line(line: str) -> str:
    lux_match = LUX_DATE_RE.search(line)

    if lux_match:
        return lux_match.group(1)

    normal_match = VALIDATION_DATE_RE.search(line)

    if normal_match:
        return normal_match.group(0)

    return ""


def find_luxembourg_date_in_line(line: str) -> str:
    lux_match = LUX_DATE_RE.search(line)

    if lux_match:
        return lux_match.group(1)

    return ""


def extract_author_from_first_page(doc: fitz.Document) -> str:
    if doc.page_count == 0:
        return ""

    text = doc.load_page(0).get_text("text") or ""
    lines = [normalize_text(line) for line in text.splitlines()]
    lines = [line for line in lines if line]

    date_line_idx = None

    for idx, line in enumerate(lines):
        if find_first_date_in_line(line):
            date_line_idx = idx
            break

    if date_line_idx is None:
        return ""

    max_author_search_lines = 10
    search_end = min(len(lines), date_line_idx + 1 + max_author_search_lines)

    for index in range(date_line_idx + 1, search_end):
        candidate = clean_author_value(lines[index])

        if candidate:
            return candidate

    return ""


def extract_validation_date_from_page(
    doc: fitz.Document,
    page_index: int,
    use_full_page_fallback: bool = True
):
    debug_info = {
        "validation_date_method": "",
        "validation_date_page_index": page_index,
        "validation_date_trigger_text": "",
        "validation_date_block_text": "",
        "validation_date_block_position": "",
        "validation_date_candidate_count": 0,
        "validation_date_area_rule": (
            "x0 >= 40% page width and y0 <= 55% page height; "
            "date line must contain Luxembourg before the date"
        ),
        "full_page_fallback_enabled": "YES" if use_full_page_fallback else "NO"
    }

    if doc.page_count == 0:
        return "", debug_info

    if page_index >= doc.page_count:
        page_index = doc.page_count - 1
        debug_info["validation_date_page_index"] = page_index

    if page_index < 0:
        page_index = 0
        debug_info["validation_date_page_index"] = page_index

    page = doc.load_page(page_index)
    page_width = page.rect.width
    page_height = page.rect.height

    date_area_lines = []
    date_candidates = []

    for block in page.get_text("blocks"):
        x0, y0, x1, y1, text = block[0], block[1], block[2], block[3], block[4]

        if not text:
            continue

        is_date_area = (
            x0 >= page_width * 0.40
            and y0 <= page_height * 0.55
        )

        if not is_date_area:
            continue

        normalized_block_text = normalize_text(text)
        lines = [normalize_text(line) for line in normalized_block_text.splitlines()]
        lines = [line for line in lines if line]

        for line in lines:
            position = (
                f"x0={x0:.2f}, y0={y0:.2f}, "
                f"x1={x1:.2f}, y1={y1:.2f}"
            )

            date_area_lines.append({
                "line": line,
                "block_text": normalized_block_text,
                "position": position
            })

            date_text = find_luxembourg_date_in_line(line)

            if date_text:
                date_candidates.append({
                    "date": date_text,
                    "line": line,
                    "block_text": normalized_block_text,
                    "position": position,
                    "sort_key": (y0, -x1)
                })

    debug_info["validation_date_candidate_count"] = len(date_candidates)

    for idx, item in enumerate(date_area_lines):
        if "CORPORATE USE" not in item["line"].upper():
            continue

        nearby_lines = date_area_lines[idx:idx + 5]

        for nearby in nearby_lines:
            date_text = find_luxembourg_date_in_line(nearby["line"])

            if date_text:
                debug_info.update({
                    "validation_date_method": "targeted date area CORPORATE USE block with Luxembourg date",
                    "validation_date_trigger_text": nearby["line"],
                    "validation_date_block_text": nearby["block_text"],
                    "validation_date_block_position": nearby["position"]
                })

                return to_slash_date(date_text), debug_info

    if date_candidates:
        date_candidates.sort(key=lambda x: x["sort_key"])
        best = date_candidates[0]

        debug_info.update({
            "validation_date_method": "targeted date area Luxembourg date fallback",
            "validation_date_trigger_text": best["line"],
            "validation_date_block_text": best["block_text"],
            "validation_date_block_position": best["position"]
        })

        return to_slash_date(best["date"]), debug_info

    if not use_full_page_fallback:
        debug_info.update({
            "validation_date_method": "targeted date area only - no Luxembourg date found",
            "validation_date_trigger_text": "",
            "validation_date_block_text": "Targeted date area search only",
            "validation_date_block_position": "Targeted date area"
        })

        return "", debug_info

    full_text = page.get_text("text") or ""
    full_text = normalize_text(full_text)

    for line in full_text.splitlines():
        date_text = find_luxembourg_date_in_line(line)

        if date_text:
            debug_info.update({
                "validation_date_method": "fallback full-page Luxembourg date search",
                "validation_date_trigger_text": line,
                "validation_date_block_text": "Fallback full-page Luxembourg date search",
                "validation_date_block_position": "Fallback"
            })

            return to_slash_date(date_text), debug_info

    debug_info.update({
        "validation_date_method": "no Luxembourg validation date found",
        "validation_date_trigger_text": "",
        "validation_date_block_text": "",
        "validation_date_block_position": ""
    })

    return "", debug_info


def build_validation_page_order(doc: fitz.Document, author: str) -> list[int]:
    if doc.page_count == 0:
        return []

    preferred_page_index = 1 if author else 0
    fallback_page_index = 0 if author else 1

    page_order = []

    for page_index in [preferred_page_index, fallback_page_index]:
        if 0 <= page_index < doc.page_count and page_index not in page_order:
            page_order.append(page_index)

    if not page_order:
        page_order.append(0)

    return page_order


def build_afs_metadata_debug(
    author: str,
    validation_debug: dict,
    validation_attempts: list[dict]
) -> dict:
    return {
        "author": author,
        "used_cover_page_logic": "YES" if author else "NO",
        "validation_date_page_index": validation_debug.get("validation_date_page_index", ""),
        "validation_date_method": validation_debug.get("validation_date_method", ""),
        "validation_date_trigger_text": validation_debug.get("validation_date_trigger_text", ""),
        "validation_date_block_text": validation_debug.get("validation_date_block_text", ""),
        "validation_date_block_position": validation_debug.get("validation_date_block_position", ""),
        "validation_date_candidate_count": validation_debug.get("validation_date_candidate_count", 0),
        "validation_date_area_rule": validation_debug.get("validation_date_area_rule", ""),
        "validation_date_attempts": validation_attempts
    }


def extract_afs_metadata(doc: fitz.Document):
    author = extract_author_from_first_page(doc)
    page_order = build_validation_page_order(doc, author)
    validation_attempts = []

    empty_debug = {
        "validation_date_method": "no pages available",
        "validation_date_page_index": "",
        "validation_date_trigger_text": "",
        "validation_date_block_text": "",
        "validation_date_block_position": "",
        "validation_date_candidate_count": 0,
        "validation_date_area_rule": "x0 >= 40% page width and y0 <= 55% page height"
    }

    for page_index in page_order:
        validation_date, validation_debug = extract_validation_date_from_page(
            doc,
            page_index,
            use_full_page_fallback=False
        )

        validation_attempts.append({
            "phase": "targeted date area",
            "page": page_index + 1,
            "found": "YES" if validation_date else "NO",
            "method": validation_debug.get("validation_date_method", "")
        })

        if validation_date:
            metadata_debug = build_afs_metadata_debug(
                author,
                validation_debug,
                validation_attempts
            )

            return validation_date, author, metadata_debug

    for page_index in page_order:
        validation_date, validation_debug = extract_validation_date_from_page(
            doc,
            page_index,
            use_full_page_fallback=True
        )

        validation_attempts.append({
            "phase": "full-page fallback",
            "page": page_index + 1,
            "found": "YES" if validation_date else "NO",
            "method": validation_debug.get("validation_date_method", "")
        })

        if validation_date:
            metadata_debug = build_afs_metadata_debug(
                author,
                validation_debug,
                validation_attempts
            )

            return validation_date, author, metadata_debug

    metadata_debug = build_afs_metadata_debug(author, empty_debug, validation_attempts)
    return "", author, metadata_debug


def get_page_texts(doc: fitz.Document) -> list[str]:
    return [
        doc.load_page(page_index).get_text("text") or ""
        for page_index in range(doc.page_count)
    ]


def join_page_texts(page_texts: list[str]) -> str:
    return "\n".join(page_texts)


def get_page_start_positions(page_texts: list[str]) -> list[int]:
    starts = []
    pos = 0

    for idx, page_text in enumerate(page_texts):
        starts.append(pos)
        pos += len(page_text)

        if idx < len(page_texts) - 1:
            pos += 1

    return starts


def get_page_number_for_abs_position(page_texts: list[str], abs_position: int) -> int:
    page_starts = get_page_start_positions(page_texts)

    if not page_starts:
        return 0

    for idx, start in enumerate(page_starts):
        next_start = page_starts[idx + 1] if idx + 1 < len(page_starts) else None

        if next_start is None:
            return idx + 1

        if start <= abs_position < next_start:
            return idx + 1

    return len(page_starts)


def extract_annex_page_count(doc: fitz.Document, return_debug: bool = False):
    page_texts = get_page_texts(doc)
    full_text = join_page_texts(page_texts)

    debug_info = {
        "status": "",
        "document_page_count": doc.page_count,
        "timetable_found": "NO",
        "timetable_trigger_text": "",
        "timetable_position": "",
        "fact_sheet_validation_found": "NO",
        "fact_sheet_validation_trigger_text": "",
        "fact_sheet_validation_position": "",
        "fact_sheet_validation_page": "",
        "annex_page_count": ""
    }

    timetable_match = TIMETABLE_RE.search(full_text)

    if timetable_match:
        search_start_abs = timetable_match.end()
        debug_info.update({
            "timetable_found": "YES",
            "timetable_trigger_text": timetable_match.group(0),
            "timetable_position": timetable_match.start()
        })
    else:
        search_start_abs = 0
        debug_info.update({
            "timetable_found": "NO",
            "status": "Timetable not found; searched whole document"
        })

    text_to_search = full_text[search_start_abs:]
    fact_sheet_match = FACT_SHEET_VALIDATION_RE.search(text_to_search)

    if not fact_sheet_match:
        debug_info.update({
            "status": "Fact Sheet validation not found",
            "annex_page_count": "check"
        })

        if return_debug:
            return "check", debug_info

        return "check"

    fact_sheet_abs = search_start_abs + fact_sheet_match.start()
    fact_sheet_page = get_page_number_for_abs_position(page_texts, fact_sheet_abs)
    annex_page_count = max(doc.page_count - fact_sheet_page, 0)

    debug_info.update({
        "status": "Counted pages after page containing Fact Sheet validation",
        "fact_sheet_validation_found": "YES",
        "fact_sheet_validation_trigger_text": fact_sheet_match.group(0),
        "fact_sheet_validation_position": fact_sheet_abs,
        "fact_sheet_validation_page": fact_sheet_page,
        "annex_page_count": annex_page_count
    })

    if return_debug:
        return annex_page_count, debug_info

    return annex_page_count


def clean_lines(lines, debug_removed_lines=None):
    cleaned = []

    for line in lines:
        line_norm = normalize_text(line.strip())
        reason = ""

        if not line_norm:
            reason = "blank line"
        elif PAGE_NUMBER_RE.match(line_norm):
            reason = "page number"
        elif OF_PAGE_RE.search(line_norm):
            reason = "x of y page marker"
        elif MC_AFS_RE.search(line_norm):
            reason = "MC AFS footer"
        elif CONFIDENTIAL_RE.search(line_norm):
            reason = "Confidential footer/header"
        elif "corporate use" in line_norm.lower():
            reason = "Corporate Use footer"

        if reason:
            if debug_removed_lines is not None:
                debug_removed_lines.append({
                    "line": line,
                    "reason": reason
                })
            continue

        cleaned.append(line)

    return cleaned


def is_contents_page(page_text: str) -> bool:
    lines = [
        normalize_text(line).lower()
        for line in page_text.splitlines()
        if normalize_text(line)
    ]

    for index in range(min(10, len(lines))):
        line = lines[index]

        if line.startswith("contents") or "table of contents" in line:
            return True

    return False


def is_standalone_prefix(line: str):
    stripped = normalize_text(line)

    for prefix in DETECT_PREFIXES:
        if stripped.upper() == prefix.upper():
            return prefix

    return None


def extract_operation_number(file_name: str, document_text: str = "") -> str:
    code_match = FILE_CODE_RE.search(file_name)
    if code_match:
        return code_match.group(0).replace("-", "")

    code_match = FILE_CODE_RE.search(document_text)
    return code_match.group(0).replace("-", "") if code_match else ""


def iter_lines_with_offsets(text: str):
    position = 0

    for raw_line in text.splitlines(keepends=True):
        line_without_end = raw_line.rstrip("\r\n")
        line_start = position
        line_content_end = position + len(line_without_end)
        line_full_end = position + len(raw_line)

        yield line_without_end, line_start, line_content_end, line_full_end

        position = line_full_end


def is_countable_opinion_start(line_clean: str) -> bool:
    if OPINION_BLOCK_RE.match(line_clean):
        return True

    if OCCO_OUTCOME_RE.match(line_clean):
        return True

    if is_standalone_prefix(line_clean):
        return True

    return False


def find_primary_opinions_header(doc: fitz.Document):
    contents_pages_skipped = 0

    for page_index in range(doc.page_count):
        page_text = doc.load_page(page_index).get_text("text") or ""

        if is_contents_page(page_text):
            contents_pages_skipped += 1
            continue

        for line, line_start, line_content_end, line_full_end in iter_lines_with_offsets(page_text):
            line_clean = normalize_text(line)

            if not line_clean:
                continue

            if OPINIONS_RE.match(line_clean):
                return {
                    "found": True,
                    "page_index": page_index,
                    "trigger_start": line_start,
                    "trigger_end": line_content_end,
                    "after_trigger_offset": line_full_end,
                    "trigger_text": line_clean,
                    "contents_pages_skipped": contents_pages_skipped
                }

    return {
        "found": False,
        "page_index": "",
        "trigger_start": "",
        "trigger_end": "",
        "after_trigger_offset": "",
        "trigger_text": "",
        "contents_pages_skipped": contents_pages_skipped
    }


def find_first_countable_opinion_start(
    doc: fitz.Document,
    start_page_index: int = 0,
    start_offset: int = 0
):
    for page_index in range(start_page_index, doc.page_count):
        page_text = doc.load_page(page_index).get_text("text") or ""

        if is_contents_page(page_text):
            continue

        offset_base = 0

        if page_index == start_page_index:
            page_text = page_text[start_offset:]
            offset_base = start_offset

        pending_F = False

        for line, line_start, line_content_end, line_full_end in iter_lines_with_offsets(page_text):
            line_clean = normalize_text(line)

            if not line_clean:
                continue

            if TIMETABLE_RE.search(line_clean):
                return {
                    "found": False,
                    "page_index": "",
                    "trigger_start": "",
                    "trigger_end": "",
                    "after_trigger_offset": "",
                    "trigger_text": "",
                    "stopped_before_countable_opinion": True,
                    "stop_reason": "Timetable",
                    "stop_page": page_index + 1
                }

            if F_PROJECT_COMMITTEE_SAME_LINE_RE.match(line_clean):
                return {
                    "found": False,
                    "page_index": "",
                    "trigger_start": "",
                    "trigger_end": "",
                    "after_trigger_offset": "",
                    "trigger_text": "",
                    "stopped_before_countable_opinion": True,
                    "stop_reason": "F. Project Committee same line",
                    "stop_page": page_index + 1
                }

            if pending_F and PROJECT_COMMITTEE_LINE_RE.search(line_clean):
                return {
                    "found": False,
                    "page_index": "",
                    "trigger_start": "",
                    "trigger_end": "",
                    "after_trigger_offset": "",
                    "trigger_text": "",
                    "stopped_before_countable_opinion": True,
                    "stop_reason": "F. followed by Project Committee",
                    "stop_page": page_index + 1
                }

            pending_F = bool(F_ONLY_RE.match(line_clean))

            if is_countable_opinion_start(line_clean):
                return {
                    "found": True,
                    "page_index": page_index,
                    "trigger_start": offset_base + line_start,
                    "trigger_end": offset_base + line_content_end,
                    "after_trigger_offset": offset_base + line_full_end,
                    "trigger_text": line_clean,
                    "stopped_before_countable_opinion": False,
                    "stop_reason": "",
                    "stop_page": ""
                }

    return {
        "found": False,
        "page_index": "",
        "trigger_start": "",
        "trigger_end": "",
        "after_trigger_offset": "",
        "trigger_text": "",
        "stopped_before_countable_opinion": False,
        "stop_reason": "",
        "stop_page": ""
    }


def marker_is_before(marker_a: dict, marker_b: dict) -> bool:
    if not marker_a.get("found") or not marker_b.get("found"):
        return False

    if marker_a["page_index"] < marker_b["page_index"]:
        return True

    if marker_a["page_index"] > marker_b["page_index"]:
        return False

    return marker_a["trigger_start"] < marker_b["trigger_start"]


def find_afs_start_marker(doc: fitz.Document):
    primary = find_primary_opinions_header(doc)
    first_count_anywhere = find_first_countable_opinion_start(
        doc,
        start_page_index=0,
        start_offset=0
    )

    if primary.get("found"):
        first_count_after_primary = find_first_countable_opinion_start(
            doc,
            start_page_index=primary["page_index"],
            start_offset=primary["after_trigger_offset"]
        )

        fallback_before_primary = marker_is_before(first_count_anywhere, primary)

        if first_count_after_primary.get("found"):
            start_mode = (
                "fallback_then_primary_to_first_counted"
                if fallback_before_primary
                else "primary_to_first_counted"
            )

            return {
                "start_found": True,
                "start_mode": start_mode,
                "start_kind": "countable_opinion_after_primary",
                "start_page_index": first_count_after_primary["page_index"],
                "start_offset": first_count_after_primary["trigger_start"],
                "opinion_start_offset": first_count_after_primary["trigger_start"],
                "trigger_text": first_count_after_primary["trigger_text"],
                "primary_found": True,
                "primary_page": primary["page_index"] + 1,
                "primary_trigger_text": primary["trigger_text"],
                "primary_offset": primary["trigger_start"],
                "contents_pages_skipped": primary.get("contents_pages_skipped", 0),
                "fallback_before_primary": fallback_before_primary,
                "no_countable_prefix_after_primary": False
            }

        return {
            "start_found": True,
            "start_mode": "primary_no_counted_prefix",
            "start_kind": "primary_header_only",
            "start_page_index": primary["page_index"],
            "start_offset": primary["trigger_start"],
            "opinion_start_offset": primary["after_trigger_offset"],
            "trigger_text": primary["trigger_text"],
            "primary_found": True,
            "primary_page": primary["page_index"] + 1,
            "primary_trigger_text": primary["trigger_text"],
            "primary_offset": primary["trigger_start"],
            "contents_pages_skipped": primary.get("contents_pages_skipped", 0),
            "fallback_before_primary": fallback_before_primary,
            "no_countable_prefix_after_primary": True
        }

    if first_count_anywhere.get("found"):
        return {
            "start_found": True,
            "start_mode": "fallback_counted_prefix",
            "start_kind": "countable_opinion_fallback",
            "start_page_index": first_count_anywhere["page_index"],
            "start_offset": first_count_anywhere["trigger_start"],
            "opinion_start_offset": first_count_anywhere["trigger_start"],
            "trigger_text": first_count_anywhere["trigger_text"],
            "primary_found": False,
            "primary_page": "",
            "primary_trigger_text": "",
            "primary_offset": "",
            "contents_pages_skipped": primary.get("contents_pages_skipped", 0),
            "fallback_before_primary": False,
            "no_countable_prefix_after_primary": False
        }

    return {
        "start_found": False,
        "start_mode": "",
        "start_kind": "",
        "start_page_index": "",
        "start_offset": "",
        "opinion_start_offset": "",
        "trigger_text": "",
        "primary_found": False,
        "primary_page": "",
        "primary_trigger_text": "",
        "primary_offset": "",
        "contents_pages_skipped": primary.get("contents_pages_skipped", 0),
        "fallback_before_primary": False,
        "no_countable_prefix_after_primary": False
    }


def collect_text_before_start(doc: fitz.Document, start_marker: dict) -> str:
    chunks = []

    if not start_marker.get("start_found"):
        for page_index in range(doc.page_count):
            page_text = doc.load_page(page_index).get_text("text") or ""

            if is_contents_page(page_text):
                continue

            chunks.append(page_text)

        return "\n".join(chunks)

    start_page_index = start_marker["start_page_index"]
    start_offset = start_marker["start_offset"]

    for page_index in range(0, start_page_index + 1):
        page_text = doc.load_page(page_index).get_text("text") or ""

        if is_contents_page(page_text):
            continue

        if page_index == start_page_index:
            page_text = page_text[:start_offset]

        chunks.append(page_text)

    return "\n".join(chunks)


def collect_opinion_lines_from_start(doc: fitz.Document, start_marker: dict):
    if not start_marker.get("start_found"):
        return [], {
            "stop_found": False,
            "stop_reason": "",
            "stop_page": ""
        }

    opinion_lines = []
    start_page_index = start_marker["start_page_index"]
    opinion_start_offset = start_marker["opinion_start_offset"]

    pending_F = False
    started_real_opinion = start_marker.get("start_kind") in {
        "countable_opinion_after_primary",
        "countable_opinion_fallback"
    }

    stop_info = {
        "stop_found": False,
        "stop_reason": "",
        "stop_page": ""
    }

    for page_index in range(start_page_index, doc.page_count):
        page_text = doc.load_page(page_index).get_text("text") or ""

        if page_index != start_page_index and is_contents_page(page_text):
            continue

        if page_index == start_page_index:
            page_text = page_text[opinion_start_offset:]

        for line in page_text.splitlines():
            line_clean = normalize_text(line)

            if not line_clean:
                continue

            if TIMETABLE_RE.search(line_clean):
                stop_info.update({
                    "stop_found": True,
                    "stop_reason": "Timetable",
                    "stop_page": page_index + 1
                })
                return opinion_lines, stop_info

            if is_countable_opinion_start(line_clean):
                started_real_opinion = True

            if started_real_opinion:
                if F_PROJECT_COMMITTEE_SAME_LINE_RE.match(line_clean):
                    stop_info.update({
                        "stop_found": True,
                        "stop_reason": "F. Project Committee same line",
                        "stop_page": page_index + 1
                    })
                    return opinion_lines, stop_info

                if pending_F and PROJECT_COMMITTEE_LINE_RE.search(line_clean):
                    stop_info.update({
                        "stop_found": True,
                        "stop_reason": "F. followed by Project Committee",
                        "stop_page": page_index + 1
                    })
                    return opinion_lines, stop_info

                pending_F = bool(F_ONLY_RE.match(line_clean))
            else:
                pending_F = False

            opinion_lines.append(line)

    return opinion_lines, stop_info


def print_simple_table(headers, rows):
    if not rows:
        print("(no rows)")
        return

    widths = []

    for col_idx, header in enumerate(headers):
        max_width = len(str(header))

        for row in rows:
            max_width = max(max_width, len(str(row[col_idx])))

        widths.append(max_width)

    header_line = " | ".join(
        str(header).ljust(widths[idx])
        for idx, header in enumerate(headers)
    )

    separator_line = "-+-".join("-" * width for width in widths)

    print(header_line)
    print(separator_line)

    for row in rows:
        print(
            " | ".join(
                str(value).ljust(widths[idx])
                for idx, value in enumerate(row)
            )
        )


def delete_checkpoint_files(target_dir: Path) -> int:
    if not target_dir.exists():
        return 0

    deleted_count = 0

    for file_path in target_dir.rglob("*"):
        if not file_path.is_file():
            continue

        if "checkpoint" not in file_path.name.lower():
            continue

        try:
            file_path.unlink()
            deleted_count += 1
            print(f"Deleted checkpoint file: {file_path}")
        except Exception as e:
            print(f"WARNING: Could not delete checkpoint file: {file_path}")
            print(f"Reason: {e}")

    return deleted_count


def process_document(doc: fitz.Document, return_debug: bool = False):
    start_marker = find_afs_start_marker(doc)

    page_count_before_opinion = (
        start_marker["start_page_index"] + 1
        if start_marker.get("start_found")
        else "check"
    )

    pre_opinion_text = collect_text_before_start(doc, start_marker)
    opinion_lines, stop_info = collect_opinion_lines_from_start(doc, start_marker)

    debug_info = {
        "mode": start_marker.get("start_mode", ""),
        "start_found": start_marker.get("start_found", False),
        "start_mode": start_marker.get("start_mode", ""),
        "start_kind": start_marker.get("start_kind", ""),
        "start_page": (
            start_marker["start_page_index"] + 1
            if start_marker.get("start_found")
            else ""
        ),
        "start_offset": start_marker.get("start_offset", ""),
        "opinion_start_offset": start_marker.get("opinion_start_offset", ""),
        "start_trigger_text": start_marker.get("trigger_text", ""),
        "primary_found": start_marker.get("primary_found", False),
        "primary_page": start_marker.get("primary_page", ""),
        "primary_trigger_text": start_marker.get("primary_trigger_text", ""),
        "primary_offset": start_marker.get("primary_offset", ""),
        "fallback_before_primary": start_marker.get("fallback_before_primary", False),
        "no_countable_prefix_after_primary": start_marker.get("no_countable_prefix_after_primary", False),
        "page_count_before_opinion": page_count_before_opinion,
        "stop_found": stop_info.get("stop_found", False),
        "stop_reason": stop_info.get("stop_reason", ""),
        "stop_page": stop_info.get("stop_page", ""),
        "contents_pages_skipped": start_marker.get("contents_pages_skipped", 0),
        "pre_opinion_lines_before_cleaning": 0,
        "opinion_lines_before_cleaning": 0,
        "pre_opinion_lines_after_cleaning": 0,
        "opinion_lines_after_cleaning": 0,
        "removed_pre_opinion_lines": [],
        "removed_opinion_lines": []
    }

    pre_opinion_lines = pre_opinion_text.splitlines()
    debug_info["pre_opinion_lines_before_cleaning"] = len(pre_opinion_lines)
    debug_info["opinion_lines_before_cleaning"] = len(opinion_lines)

    pre_clean_lines = clean_lines(
        pre_opinion_lines,
        debug_removed_lines=debug_info["removed_pre_opinion_lines"]
    )

    opinion_clean_lines = clean_lines(
        opinion_lines,
        debug_removed_lines=debug_info["removed_opinion_lines"]
    )

    debug_info["pre_opinion_lines_after_cleaning"] = len(pre_clean_lines)
    debug_info["opinion_lines_after_cleaning"] = len(opinion_clean_lines)

    pre_clean = "\n".join(pre_clean_lines)
    opinions_clean = "\n".join(opinion_clean_lines)
    before_count, before_count_text = count_words_and_text(pre_clean)

    result = {
        "page_count_before_opinion": page_count_before_opinion,
        "text_before_count": before_count,
        "text_before_count_text": before_count_text,
        "opinions_text": opinions_clean
    }

    if return_debug:
        result["debug"] = debug_info

    return result


def split_opinion_blocks(text: str):
    lines = text.splitlines()
    segments = []
    current_prefix = None
    current_lines = []

    def flush_segment():
        nonlocal current_prefix, current_lines, segments

        if not current_prefix:
            return

        raw_text = "\n".join(current_lines).strip()
        words, count_text = count_words_and_text(raw_text)

        segments.append({
            "prefix": current_prefix,
            "words": words,
            "raw_text": raw_text,
            "count_text": count_text
        })

    for line in lines:
        line_strip = normalize_text(line)
        match = OPINION_BLOCK_RE.match(line_strip)

        if match:
            flush_segment()
            current_prefix = match.group(1)
            current_lines = []
            continue

        if OCCO_OUTCOME_RE.match(line_strip):
            flush_segment()
            current_prefix = "OCCO"
            current_lines = []
            continue

        fallback = is_standalone_prefix(line_strip)

        if fallback:
            flush_segment()
            current_prefix = fallback
            current_lines = []
            continue

        if current_prefix:
            current_lines.append(line)

    flush_segment()
    return segments


def merged_total(prefix_data: dict, out_prefix: str):
    if out_prefix in MERGE_GROUPS:
        return sum(prefix_data.get(prefix, 0) for prefix in MERGE_GROUPS[out_prefix])

    return prefix_data.get(out_prefix, 0)


def get_numeric_values(rows_numeric, metric):
    values = []

    for row in rows_numeric:
        value = row.get(metric)

        if isinstance(value, bool):
            continue

        if isinstance(value, (int, float)):
            values.append(value)

    return values


def compute_stats(values):
    if not values:
        return (0, 0, 0, 0, 0, 0, 1)

    n = len(values)
    mean = statistics.mean(values)
    median = statistics.median(values)
    minimum = min(values)
    maximum = max(values)

    if n > 1:
        std = statistics.stdev(values)
        se = std / math.sqrt(n)
        ci = 1.96 * se
        lower = mean - ci
        upper = mean + ci

        if se > 0:
            t_stat = mean / se
            p_value = 2 * (1 - 0.5 * (1 + math.erf(abs(t_stat) / math.sqrt(2))))
        else:
            p_value = 0.0
    else:
        lower = upper = mean
        p_value = 1.0

    return (mean, median, minimum, maximum, lower, upper, p_value)


def process_pdf(pdf_path: Path):
    with closing(fitz.open(pdf_path)) as doc:
        page_count = doc.page_count
        document_text = join_page_texts(get_page_texts(doc)) if doc.page_count else ""
        validation_date, author, metadata_debug = extract_afs_metadata(doc)

        if DEBUG:
            annex_page_count, annex_debug = extract_annex_page_count(
                doc,
                return_debug=True
            )
        else:
            annex_page_count = extract_annex_page_count(doc)
            annex_debug = {}

        data = process_document(doc, return_debug=DEBUG)
        segments = split_opinion_blocks(data["opinions_text"])

    file_name = pdf_path.name
    operation_number = extract_operation_number(file_name, document_text)
    prefix_data = Counter()

    for segment in segments:
        prefix_data[segment["prefix"]] += segment["words"]

    row_numeric = {
        "Template": "AFS",
        "Extraction": "Automated",
        "MC_Note_Type": "NOTEMCDEC",
        "File Name": clean_for_csv_title(file_name),
        "Operation Number": operation_number,
        "Validation Date": validation_date,
        "Author": author,
        "Document Page Count": page_count,
        "Page count before opinion": data["page_count_before_opinion"],
        "Annex Page Count": annex_page_count,
        "Text Before Opinions": data["text_before_count"],
    }

    for out_prefix in OUTPUT_PREFIXES:
        row_numeric[out_prefix] = merged_total(prefix_data, out_prefix)

    row_csv = dict(row_numeric)

    for out_prefix in OUTPUT_PREFIXES:
        if row_csv[out_prefix] == 0:
            row_csv[out_prefix] = ""

    return {
        "file": file_name,
        "operation_number": operation_number,
        "validation_date": validation_date,
        "author": author,
        "metadata_debug": metadata_debug,
        "document_page_count": page_count,
        "page_count_before_opinion": data["page_count_before_opinion"],
        "annex_page_count": annex_page_count,
        "annex_debug": annex_debug,
        "text_before_count": data["text_before_count"],
        "text_before_count_text": data.get("text_before_count_text", ""),
        "opinions_text": data["opinions_text"],
        "segments": segments,
        "prefix_data": dict(prefix_data),
        "row_numeric": row_numeric,
        "row_csv": row_csv,
        "debug": data.get("debug", {})
    }


def write_raw_csv(rows, output_path: Path):
    cleaned_rows = [
        {key: clean_export_value(value) for key, value in row.items()}
        for row in rows
    ]
    with open(output_path, "w", newline="", encoding="utf-8-sig") as file:
        writer = csv.DictWriter(file, fieldnames=RAW_FIELDNAMES, delimiter=";")
        writer.writeheader()
        writer.writerows(cleaned_rows)


def write_statistics_csv(rows_numeric, output_path: Path):
    with open(output_path, "w", newline="", encoding="utf-8-sig") as file:
        writer = csv.writer(file, delimiter=",")
        writer.writerow(STAT_FIELDNAMES)

        metrics = [
            "Document Page Count",
            "Page count before opinion",
            "Annex Page Count",
            "Text Before Opinions"
        ] + OUTPUT_PREFIXES

        for metric in metrics:
            values = get_numeric_values(rows_numeric, metric)
            mean, median, minimum, maximum, lower, upper, p_value = compute_stats(values)

            writer.writerow([
                metric,
                f"{mean:.2f}",
                f"{median:.0f}",
                f"{minimum}",
                f"{maximum}",
                f"{lower:.2f}",
                f"{upper:.2f}",
                f"{p_value:.3e}"
            ])


def write_csv_with_fallback(write_fn, rows, output_path: Path) -> Path:
    try:
        write_fn(rows, output_path)
        return output_path
    except PermissionError:
        fallback_path = output_path.with_name(f"{output_path.stem}_new{output_path.suffix}")
        write_fn(rows, fallback_path)
        print(f"WARNING: Could not overwrite {output_path.resolve()} because it is open or locked.")
        print(f"WARNING: Wrote fallback CSV instead: {fallback_path.resolve()}")
        return fallback_path


def print_file_status(result):
    metadata_debug = result.get("metadata_debug", {})
    page_index = metadata_debug.get("validation_date_page_index", "")
    display_page = page_index + 1 if isinstance(page_index, int) else ""

    print(f"\n----- FILE STATUS: {result['file']} -----")
    print(f"Operation Number             : {result['operation_number']}")
    print(f"Document Page Count          : {result['document_page_count']}")
    print(f"Page count before opinion    : {result['page_count_before_opinion']}")
    print(f"Annex Page Count             : {result['annex_page_count']}")
    print(f"Validation Date              : {result['validation_date'] if result['validation_date'] else '[NOT FOUND]'}")
    print(f"Validation Date Page Searched: {display_page}")
    print(f"Validation Date Method       : {metadata_debug.get('validation_date_method', '')}")
    print(f"Author                       : {result['author'] if result['author'] else '[NOT FOUND]'}")
    print(f"Used Cover Page Logic        : {metadata_debug.get('used_cover_page_logic', '')}")
    print(f"Text Before Opinions         : {result['text_before_count']}")

    validation_attempts = metadata_debug.get("validation_date_attempts", [])

    if validation_attempts:
        print("\nValidation date attempts:")
        for attempt in validation_attempts:
            print(
                f"  {attempt.get('phase', '')} | "
                f"page {attempt.get('page', '')} | "
                f"found {attempt.get('found', '')} | "
                f"{attempt.get('method', '')}"
            )

    debug_info = result.get("debug", {})

    if debug_info:
        print(f"Start Mode                   : {debug_info.get('start_mode', '')}")
        print(f"Start Kind                   : {debug_info.get('start_kind', '')}")
        print(f"Start Trigger                : {debug_info.get('start_trigger_text', '')}")
        print(f"Start Offset                 : {debug_info.get('start_offset', '')}")
        print(f"Opinion Start Offset         : {debug_info.get('opinion_start_offset', '')}")
        print(f"Primary Header Found         : {'YES' if debug_info.get('primary_found') else 'NO'}")
        print(f"Primary Header Trigger       : {debug_info.get('primary_trigger_text', '')}")

    print("\nFound prefixes:")

    if result["prefix_data"]:
        for prefix, value in sorted(result["prefix_data"].items()):
            print(f"  {prefix}: {value} words")
    else:
        print("  None")

    print("---------------------------------------------")


def print_debug_output(result):
    print("\n" + "=" * 100)
    print(f"DEBUG FILE: {result['file']}")
    print("=" * 100)
    print(f"Operation Number: {result['operation_number']}")
    print(f"Document Page Count: {result['document_page_count']}")
    print(f"Page count before opinion: {result['page_count_before_opinion']}")
    print(f"Annex Page Count: {result['annex_page_count']}")
    print(f"Validation Date: {result['validation_date'] if result['validation_date'] else '[NOT FOUND]'}")
    print(f"Author: {result['author'] if result['author'] else '[NOT FOUND]'}")
    print(f"Text Before Opinions (words): {result['text_before_count']}")

    metadata_debug = result.get("metadata_debug", {})
    annex_debug = result.get("annex_debug", {})

    print("\n--- VALIDATION DATE / COVER PAGE DEBUG ---")
    print(f"Used cover page logic: {metadata_debug.get('used_cover_page_logic', '')}")
    print(f"Validation date method: {metadata_debug.get('validation_date_method', '')}")
    print(f"Validation date candidate count: {metadata_debug.get('validation_date_candidate_count', '')}")
    print(f"Validation date trigger text: {metadata_debug.get('validation_date_trigger_text', '')}")
    print("\nValidation date block text:")
    print(debug_text_block(metadata_debug.get("validation_date_block_text", "")))

    print("\n--- ANNEX PAGE COUNT DEBUG ---")
    if annex_debug:
        print(f"Status: {annex_debug.get('status', '')}")
        print(f"Timetable found: {annex_debug.get('timetable_found', '')}")
        print(f"Fact Sheet validation found: {annex_debug.get('fact_sheet_validation_found', '')}")
        print(f"Fact Sheet validation page: {annex_debug.get('fact_sheet_validation_page', '')}")
        print(f"Annex Page Count: {annex_debug.get('annex_page_count', '')}")
    else:
        print("No annex debug available because DEBUG is False.")

    debug_info = result.get("debug", {})

    print("\n--- DOCUMENT PROCESSING DEBUG ---")
    if debug_info:
        print(f"Start found : {'YES' if debug_info.get('start_found') else 'NO'}")
        print(f"Start mode : {debug_info.get('start_mode', '')}")
        print(f"Start kind : {debug_info.get('start_kind', '')}")
        print(f"Start page : {debug_info.get('start_page', '')}")
        print(f"Start trigger text : {debug_info.get('start_trigger_text', '')}")
        print(f"Stop found : {'YES' if debug_info.get('stop_found') else 'NO'}")
        print(f"Stop reason : {debug_info.get('stop_reason', '')}")
        print(f"Stop page : {debug_info.get('stop_page', '')}")
        print(f"Contents pages skipped : {debug_info.get('contents_pages_skipped', '')}")
    else:
        print("No document processing debug available.")

    print("\n--- TEXT BEFORE OPINIONS USED FOR COUNTING ---")
    print(debug_text_block(result.get("text_before_count_text", "")))

    print("\n--- OPINION SEGMENTS ---")
    if not result["segments"]:
        print("No opinion segments detected inside the Opinions section.")
        if not result["opinions_text"].strip():
            print("DEBUG: opinions_text is empty.")
        print("=" * 100)
        return

    for index, segment in enumerate(result["segments"], 1):
        export_label = segment["prefix"]
        if export_label == "GR&C-RM":
            export_label = "RM"
        elif export_label == "GR&C-OCCO":
            export_label = "OCCO"

        print(f"\nSEGMENT {index}")
        print(f"Prefix: {segment['prefix']}")
        print(f"Exports As: {export_label}")
        print(f"Word count: {segment['words']}")
        print("\n--- RAW TEXT ---")
        print(debug_text_block(segment["raw_text"]) if segment["raw_text"] else "[EMPTY]")
        print("\n--- TEXT USED FOR COUNTING ---")
        print(debug_text_block(segment["count_text"]) if segment["count_text"] else "[EMPTY]")
        print("\n" + "-" * 100)

    print("=" * 100)


def parse_args():
    parser = argparse.ArgumentParser(description="Extract AFS opinion word counts from PDF notes.")
    parser.add_argument(
        "afs_dir",
        nargs="?",
        type=Path,
        default=AFS_DIR,
        help="Folder containing AFS PDF files. Defaults to AFS_Package/AFS_File_Folder."
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=OUTPUT_DIR,
        help="Folder for generated CSV outputs. Defaults to AFS_Package/outputs."
    )
    parser.add_argument("--debug", action="store_true", help="Print detailed extraction diagnostics.")
    parser.add_argument("--status", action="store_true", help="Print per-file status without full debug text.")
    return parser.parse_args()


def main():
    global DEBUG, STATUS_OUTPUT

    args = parse_args()
    DEBUG = args.debug
    STATUS_OUTPUT = args.debug or args.status

    target_dir = args.afs_dir
    output_dir = args.output_dir
    if not output_dir.is_absolute():
        output_dir = Path.cwd() / output_dir

    output_dir.mkdir(parents=True, exist_ok=True)
    deleted_checkpoint_count = delete_checkpoint_files(target_dir)
    pdf_files = sorted(target_dir.rglob("*.pdf"))

    if not pdf_files:
        raise SystemExit(f"No PDFs found under: {target_dir.resolve()}")

    results_numeric = []
    results_for_csv = []

    for pdf_path in pdf_files:
        result = process_pdf(pdf_path)

        if STATUS_OUTPUT:
            print_file_status(result)

        if DEBUG:
            print_debug_output(result)

        results_numeric.append(result["row_numeric"])
        results_for_csv.append(result["row_csv"])

    raw_output_path = output_dir / "afs_opinion_word_counts_raw.csv"
    stats_output_path = output_dir / "afs_opinion_word_counts_statistics.csv"

    written_raw = write_csv_with_fallback(write_raw_csv, results_for_csv, raw_output_path)
    written_stats = write_csv_with_fallback(write_statistics_csv, results_numeric, stats_output_path)

    print("\n================ RUN SUMMARY ================")
    print(f"Checkpoint files deleted : {deleted_checkpoint_count}")
    print(f"PDF files processed      : {len(pdf_files)}")
    print(f"CSV rows exported        : {len(results_for_csv)}")
    print(f"Raw CSV completed        : {written_raw.resolve()}")
    print(f"Stats CSV completed      : {written_stats.resolve()}")
    print("=============================================")


if __name__ == "__main__":
    main()
