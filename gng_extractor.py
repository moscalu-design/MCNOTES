#1.0 27/05/2026
import argparse
import fitz
from pathlib import Path
import re
import csv
from collections import Counter
from contextlib import closing
from typing import Any


DEBUG = False
STATUS_OUTPUT = DEBUG
DEBUG_TEXT_CHAR_LIMIT = None

GNG_DIR = Path("GNG Folder")


CSV_PREFIXES = [
    "OPS", "GLO", "PJ", "RM", "OCCO", "JU", "ECON",
    "CFC", "EIF", "FI", "IG", "PMM", "SG", "GIS", "HR", "OTHER"
]

COUNT_PREFIXES = {
    "PJ", "JU", "GR&C-RM", "GR&C-OCCO", "OCCO", "ECON"
}

PREFIX_EXPORT_MAP = {
    "GR&C-RM": "RM",
    "GR&C-OCCO": "OCCO",
    "OCCO": "OCCO"
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

CSV_FIELDNAMES = BASE_COLUMNS + CSV_PREFIXES


PREFIX_PATTERNS = {
    "GR&C-OCCO": r"GR\s*&\s*C\s*[-/\u2010\u2011\u2012\u2013\u2014\u2212]?\s*OCCO",
    "GR&C-RM": r"GR\s*&\s*C\s*[-/\u2010\u2011\u2012\u2013\u2014\u2212]?\s*RM",
    "OCCO": r"OCCO",
    "ECON": r"ECON",
    "PJ": r"PJ",
    "JU": r"JU",
}

prefix_alt = "|".join(
    PREFIX_PATTERNS[prefix]
    for prefix in sorted(PREFIX_PATTERNS, key=len, reverse=True)
)


WORD_RE = re.compile(
    r"[^\W_]+(?:'[^\W_]+)?",
    re.UNICODE
)

ZERO_WIDTH_RE = re.compile(
    r"[\u200B-\u200D\uFEFF]"
)

ALL_WS_RE = re.compile(
    r"\s+"
)

HYPHEN_LINEBREAK_RE = re.compile(
    r"(\w)[-\u2010\u2011\u2012\u2013\u2014\u2212\u00AD]\s*\n\s*(\w)",
    re.UNICODE
)

VALIDATION_DATE_RE = re.compile(
    r"\b\d{2}(?:/|\.)\d{2}(?:/|\.)\d{4}\b"
)

LUX_DATE_RE = re.compile(
    r"\bLuxembourg\b\s*,?\s*(\d{2}(?:/|\.)\d{2}(?:/|\.)\d{4})",
    re.IGNORECASE
)

AUTHOR_FORMAT_RE = re.compile(
    r"^[A-Z]{2}[A-Za-z0-9&.\- ]*(?:/[A-Za-z0-9&().,'\- ]+)+$"
)

SECTION6_RE = re.compile(
    r"(?im)^\s*6\.\s+Services['’]?\s+acknowledgement"
)

STOP_RE = re.compile(
    r"\bExpected\s+timetable\b",
    re.IGNORECASE
)

ANNEX_TRIGGER_RE = re.compile(
    r"\bGNG\s+validation\b",
    re.IGNORECASE
)

PAGE_NUMBER_RE = re.compile(
    r"^\s*-\s*\d+\s*-\s*$"
)

OF_PAGE_RE = re.compile(
    r"\b\d+\s+of\s+\d+\b",
    re.IGNORECASE
)

MC_GNG_RE = re.compile(
    r"\bMC[_\s-]?GNG\b",
    re.IGNORECASE
)

OP_NUMBER_RE = re.compile(
    r"MCGNG\s+(\d+)",
    re.IGNORECASE
)

OPERATION_NUMBER_FALLBACK_RE = re.compile(
    r"\b(?:\d{8}|\d{4}-\d{4})\b"
)

PREFIX_LINE_RE = re.compile(
    rf"(?im)^\s*({prefix_alt})\s*(?:contribution)?\s*$"
)

PREFIX_START_CANDIDATE_RE = re.compile(
    rf"(?m)^\s*({prefix_alt})\b[^\n]*$"
)


def clean_line(line: str) -> str:
    return re.sub(r"\s+", " ", line).strip()


def normalize_text(s: str) -> str:
    s = s.replace("’", "'").replace("‘", "'")
    s = s.replace("\u00AD", "")
    s = s.replace("\u00A0", " ")
    s = re.sub(r"[\u2010\u2011\u2012\u2013\u2014\u2212]", "-", s)
    s = ZERO_WIDTH_RE.sub("", s)
    return s.strip()


def normalize_multiline_for_detection(text: str) -> str:
    return "\n".join(
        normalize_text(line)
        for line in text.splitlines()
    )


def canonicalize_prefix(raw_prefix: str) -> str:
    s = normalize_text(raw_prefix)
    s = s.upper()
    s = re.sub(r"\s+", "", s)
    s = re.sub(r"[-/]+", "-", s)

    if re.fullmatch(r"GR&C-?RM", s):
        return "GR&C-RM"

    if re.fullmatch(r"GR&C-?OCCO", s):
        return "GR&C-OCCO"

    return s


def flatten_for_count(s: str) -> str:
    s = normalize_text(s)
    s = HYPHEN_LINEBREAK_RE.sub(r"\1\2", s)
    s = re.sub(r"(?m)^\s*[oO]\s+", "", s)
    s = s.replace("ï‚·", "")
    s = s.replace("&", "").replace("-", "").replace("/", "")
    s = ALL_WS_RE.sub(" ", s)
    return s.strip()


def count_words(s: str) -> int:
    return len(WORD_RE.findall(flatten_for_count(s)))


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


def debug_text_block(text: str) -> str:
    if DEBUG_TEXT_CHAR_LIMIT is None:
        return text

    if len(text) <= DEBUG_TEXT_CHAR_LIMIT:
        return text

    return text[:DEBUG_TEXT_CHAR_LIMIT] + "\n...[TRUNCATED]..."


def shorten_for_table(text: str, max_len: int = 90) -> str:
    text = clean_line(str(text))

    if len(text) <= max_len:
        return text

    return text[:max_len - 3] + "..."


def clean_for_csv_title(value: str) -> str:
    return str(value).replace(",", "")


def get_export_prefix(detected_prefix: str) -> str:
    return PREFIX_EXPORT_MAP.get(detected_prefix, detected_prefix)


def build_export_prefix_totals(prefix_data: dict[str, int]) -> dict[str, int]:
    export_totals = Counter()

    for detected_prefix, value in prefix_data.items():
        if value <= 0:
            continue

        export_prefix = get_export_prefix(detected_prefix)

        if export_prefix in CSV_PREFIXES:
            export_totals[export_prefix] += value

    return dict(export_totals)


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

    separator_line = "-+-".join(
        "-" * width
        for width in widths
    )

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


def extract_operation_number(file_name: str, document_text: str = "") -> str:
    match = OP_NUMBER_RE.search(file_name)

    if match:
        return match.group(1).replace("-", "")

    fallback_match = OPERATION_NUMBER_FALLBACK_RE.search(file_name)

    if fallback_match:
        return fallback_match.group(0).replace("-", "")

    fallback_match = OPERATION_NUMBER_FALLBACK_RE.search(document_text)

    if fallback_match:
        return fallback_match.group(0).replace("-", "")

    return ""


def normalize_validation_debug_for_gng(
    validation_debug: dict[str, Any],
    author: str,
    validation_attempts: list[dict[str, Any]]
) -> dict[str, Any]:
    return {
        "method": validation_debug.get("validation_date_method", ""),
        "date_trigger_text": validation_debug.get("validation_date_trigger_text", ""),
        "date_block_text": validation_debug.get("validation_date_block_text", ""),
        "date_block_position": validation_debug.get("validation_date_block_position", ""),
        "candidate_count": validation_debug.get("validation_date_candidate_count", 0),
        "validation_date_page_index": validation_debug.get("validation_date_page_index", ""),
        "validation_date_area_rule": validation_debug.get("validation_date_area_rule", ""),
        "full_page_fallback_enabled": validation_debug.get("full_page_fallback_enabled", ""),
        "author": author,
        "used_cover_page_logic": "YES" if author else "NO",
        "validation_date_attempts": validation_attempts
    }


def extract_validation_date_from_page(
    doc: fitz.Document,
    page_index: int,
    use_full_page_fallback: bool = True
) -> tuple[str, dict[str, Any]]:
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


def extract_gng_metadata(doc: fitz.Document) -> tuple[str, str, dict[str, Any]]:
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
        "validation_date_area_rule": (
            "x0 >= 40% page width and y0 <= 55% page height; "
            "date line must contain Luxembourg before the date"
        ),
        "full_page_fallback_enabled": "NO"
    }

    # First pass: targeted date area only.
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
            header_debug = normalize_validation_debug_for_gng(
                validation_debug,
                author,
                validation_attempts
            )

            return validation_date, author, header_debug

    # Second pass: full-page fallback, after targeted page checks fail.
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
            header_debug = normalize_validation_debug_for_gng(
                validation_debug,
                author,
                validation_attempts
            )

            return validation_date, author, header_debug

    header_debug = normalize_validation_debug_for_gng(
        empty_debug,
        author,
        validation_attempts
    )

    return "", author, header_debug


def is_table_line(line: str) -> bool:
    tokens = line.strip().split()

    if len(tokens) < 4:
        return False

    numeric_tokens = 0

    for token in tokens:
        clean = token.replace(",", "").replace(".", "").replace("%", "")

        if clean.isdigit():
            numeric_tokens += 1

    return numeric_tokens / len(tokens) > 0.5


def remove_footer_noise(text: str, debug_removed_lines=None) -> str:
    clean_lines = []

    for line in text.splitlines():
        line_norm = normalize_text(line.strip())
        reason = ""

        if not line_norm:
            reason = "blank line"
        elif PAGE_NUMBER_RE.match(line_norm):
            reason = "page number"
        elif OF_PAGE_RE.search(line_norm):
            reason = "x of y page marker"
        elif MC_GNG_RE.search(line_norm):
            reason = "MC_GNG footer"
        elif line_norm.lower() == "corporate use":
            reason = "Corporate Use footer"

        if reason:
            if debug_removed_lines is not None:
                debug_removed_lines.append({
                    "line": line,
                    "reason": reason
                })
            continue

        clean_lines.append(line)

    return "\n".join(clean_lines)


def find_section6_start(doc: fitz.Document):
    for page_index in range(doc.page_count):
        text = doc.load_page(page_index).get_text("text") or ""
        match = SECTION6_RE.search(text)

        if match:
            return page_index, match.start(), match.group(0)

    return None, None, ""


def get_text_before_section6_count(
    doc: fitz.Document,
    section6_page,
    section6_offset,
    return_debug: bool = False
):
    debug_info = {
        "section6_found": section6_page is not None,
        "section6_page": "" if section6_page is None else section6_page + 1,
        "section6_offset": "" if section6_offset is None else section6_offset,
        "raw_text_length": 0,
        "cleaned_text_length": 0,
        "word_count": "",
        "removed_footer_lines": []
    }

    if section6_page is None or section6_offset is None:
        debug_info["word_count"] = "check"

        if return_debug:
            return "check", debug_info

        return "check"

    text_chunks = []

    for page_index in range(0, section6_page + 1):
        text = doc.load_page(page_index).get_text("text") or ""

        if page_index == section6_page:
            text = text[:section6_offset]

        text_chunks.append(text)

    full_text = "\n".join(text_chunks)
    debug_info["raw_text_length"] = len(full_text)

    full_text = remove_footer_noise(
        full_text,
        debug_removed_lines=debug_info["removed_footer_lines"]
    )

    full_text = normalize_multiline_for_detection(full_text)

    word_count = count_words(full_text)

    debug_info["cleaned_text_length"] = len(full_text)
    debug_info["word_count"] = word_count

    if return_debug:
        return word_count, debug_info

    return word_count


def get_page_count_before_opinion(
    section6_page,
    section6_trigger_text: str,
    return_debug: bool = False
):
    debug_info = {
        "status": "",
        "section6_found": section6_page is not None,
        "section6_page": "" if section6_page is None else section6_page + 1,
        "section6_trigger_text": section6_trigger_text,
        "page_count_before_opinion": ""
    }

    if section6_page is None:
        debug_info.update({
            "status": "Section 6 not found",
            "page_count_before_opinion": "check"
        })

        if return_debug:
            return "check", debug_info

        return "check"

    page_count = section6_page + 1

    debug_info.update({
        "status": "Page count through page where Section 6 starts",
        "page_count_before_opinion": page_count
    })

    if return_debug:
        return page_count, debug_info

    return page_count


def extract_annex_page_count_from_doc(
    doc: fitz.Document,
    return_debug: bool = False
):
    page_texts = get_page_texts(doc)
    full_text = join_page_texts(page_texts)

    debug_info = {
        "status": "",
        "document_page_count": doc.page_count,
        "expected_timetable_found": "NO",
        "expected_timetable_trigger_text": "",
        "expected_timetable_position": "",
        "gng_validation_found": "NO",
        "gng_validation_trigger_text": "",
        "gng_validation_position": "",
        "gng_validation_page": "",
        "annex_page_count": ""
    }

    timetable_match = STOP_RE.search(full_text)

    if not timetable_match:
        debug_info.update({
            "status": "Expected timetable not found",
            "annex_page_count": "check"
        })

        if return_debug:
            return "check", debug_info

        return "check"

    search_start_abs = timetable_match.end()

    debug_info.update({
        "expected_timetable_found": "YES",
        "expected_timetable_trigger_text": timetable_match.group(0),
        "expected_timetable_position": timetable_match.start()
    })

    text_after_timetable = full_text[search_start_abs:]
    gng_validation_match = ANNEX_TRIGGER_RE.search(text_after_timetable)

    if not gng_validation_match:
        debug_info.update({
            "status": "GNG validation not found after Expected timetable",
            "annex_page_count": "check"
        })

        if return_debug:
            return "check", debug_info

        return "check"

    gng_validation_abs = search_start_abs + gng_validation_match.start()

    gng_validation_page = get_page_number_for_abs_position(
        page_texts,
        gng_validation_abs
    )

    annex_page_count = max(doc.page_count - gng_validation_page, 0)

    debug_info.update({
        "status": "Counted pages after page containing GNG validation",
        "gng_validation_found": "YES",
        "gng_validation_trigger_text": gng_validation_match.group(0),
        "gng_validation_position": gng_validation_abs,
        "gng_validation_page": gng_validation_page,
        "annex_page_count": annex_page_count
    })

    if return_debug:
        return annex_page_count, debug_info

    return annex_page_count


def find_prefix_candidates(cleaned_text: str, matches) -> list[dict[str, Any]]:
    accepted_starts = {match.start() for match in matches}
    prefix_candidate_lines = []

    for candidate in PREFIX_START_CANDIDATE_RE.finditer(cleaned_text):
        prefix_candidate_lines.append({
            "line": candidate.group(0).strip(),
            "start": candidate.start(),
            "accepted": candidate.start() in accepted_starts
        })

    return prefix_candidate_lines


def merge_consecutive_same_prefix_matches(matches):
    merged_matches = []
    last_prefix = None

    for match in matches:
        prefix = canonicalize_prefix(match.group(1))

        if prefix == last_prefix:
            continue

        merged_matches.append(match)
        last_prefix = prefix

    return merged_matches


def make_empty_extraction_debug(
    raw_text_length: int = 0
) -> dict[str, Any]:
    return {
        "section6_missing": True,
        "section6_trigger_text": "",
        "section6_page": "",
        "stop_found": False,
        "stop_trigger_text": "",
        "stop_position": "",
        "removed_footer_lines": [],
        "prefix_matches_found": 0,
        "prefix_candidate_lines": [],
        "raw_text_length": raw_text_length,
        "cleaned_text_length": 0,
        "cleaned_text_for_detection": ""
    }


def extract_all_segments(
    doc: fitz.Document,
    start_page: int,
    start_offset: int,
    start_trigger_text: str,
    return_debug: bool = False
):
    section6_text = []
    removed_footer_lines = []

    for page_number in range(start_page, doc.page_count):
        text = doc.load_page(page_number).get_text("text") or ""

        if page_number == start_page:
            text = text[start_offset:]

        section6_text.append(text)

    full_text = "\n".join(section6_text)
    raw_text_length = len(full_text)

    stop_found = False
    stop_trigger_text = ""
    stop_position = ""

    stop_match = STOP_RE.search(full_text)

    if stop_match:
        stop_found = True
        stop_trigger_text = stop_match.group(0)
        stop_position = stop_match.start()
        full_text = full_text[:stop_match.start()]

    full_text = remove_footer_noise(
        full_text,
        debug_removed_lines=removed_footer_lines
    )

    full_text = normalize_multiline_for_detection(full_text)

    raw_matches = list(PREFIX_LINE_RE.finditer(full_text))
    matches = merge_consecutive_same_prefix_matches(raw_matches)
    prefix_candidate_lines = find_prefix_candidates(full_text, matches)

    segments_out = []

    for idx, match in enumerate(matches):
        prefix = canonicalize_prefix(match.group(1))
        start = match.start()
        end = matches[idx + 1].start() if idx + 1 < len(matches) else len(full_text)

        segment_text = full_text[start:end].strip()

        if idx == 0:
            lines = []

            for line in segment_text.splitlines():
                if not is_table_line(line.strip()):
                    lines.append(line)

            segment_text = "\n".join(lines).strip()

        if segment_text:
            word_count = count_words(segment_text)

            segments_out.append({
                "prefix": prefix,
                "trigger_text": match.group(0).strip(),
                "trigger_start": match.start(),
                "trigger_end": match.end(),
                "segment_start": start,
                "segment_end": end,
                "text": segment_text,
                "flattened_text": flatten_for_count(segment_text),
                "words": word_count
            })

    extraction_debug = {
        "section6_missing": False,
        "section6_trigger_text": start_trigger_text,
        "section6_page": start_page + 1,
        "section6_offset": start_offset,
        "stop_found": stop_found,
        "stop_trigger_text": stop_trigger_text,
        "stop_position": stop_position,
        "removed_footer_lines": removed_footer_lines,
        "prefix_matches_found": len(matches),
        "raw_prefix_matches_found": len(raw_matches),
        "prefix_candidate_lines": prefix_candidate_lines,
        "raw_text_length": raw_text_length,
        "cleaned_text_length": len(full_text),
        "cleaned_text_for_detection": full_text
    }

    if return_debug:
        return segments_out, extraction_debug

    return segments_out


def process_pdf(pdf_path: Path):
    with closing(fitz.open(pdf_path)) as doc:
        document_text_for_operation_number = "\n".join(get_page_texts(doc)) if doc.page_count else ""
        validation_date, author, header_debug = extract_gng_metadata(doc)
        document_page_count = doc.page_count

        section6_page, section6_offset, section6_trigger_text = find_section6_start(doc)

        if DEBUG:
            text_before_opinions_count, text_before_opinions_debug = (
                get_text_before_section6_count(
                    doc,
                    section6_page,
                    section6_offset,
                    return_debug=True
                )
            )

            page_count_before_opinion, page_count_before_opinion_debug = (
                get_page_count_before_opinion(
                    section6_page,
                    section6_trigger_text,
                    return_debug=True
                )
            )

            annex_page_count, annex_page_count_debug = (
                extract_annex_page_count_from_doc(
                    doc,
                    return_debug=True
                )
            )
        else:
            text_before_opinions_count = get_text_before_section6_count(
                doc,
                section6_page,
                section6_offset
            )
            text_before_opinions_debug = {}

            page_count_before_opinion = get_page_count_before_opinion(
                section6_page,
                section6_trigger_text
            )
            page_count_before_opinion_debug = {}

            annex_page_count = extract_annex_page_count_from_doc(doc)
            annex_page_count_debug = {}

        if section6_page is None:
            segments = []
            extraction_debug = make_empty_extraction_debug()
        else:
            if DEBUG:
                segments, extraction_debug = extract_all_segments(
                    doc,
                    section6_page,
                    section6_offset,
                    section6_trigger_text,
                    return_debug=True
                )
            else:
                segments = extract_all_segments(
                    doc,
                    section6_page,
                    section6_offset,
                    section6_trigger_text
                )
                extraction_debug = {}

    prefix_data = Counter()

    for segment in segments:
        prefix_data[segment["prefix"]] += segment["words"]

    operation_number = extract_operation_number(
        pdf_path.name,
        document_text_for_operation_number
    )

    return {
        "file": pdf_path.name,
        "operation_number": operation_number,
        "validation_date": validation_date,
        "author": author,
        "document_page_count": document_page_count,
        "page_count_before_opinion": page_count_before_opinion,
        "annex_page_count": annex_page_count,
        "text_before_opinions_count": text_before_opinions_count,
        "prefix_data": dict(prefix_data),
        "segments": segments,
        "header_debug": header_debug,
        "text_before_opinions_debug": text_before_opinions_debug,
        "page_count_before_opinion_debug": page_count_before_opinion_debug,
        "annex_page_count_debug": annex_page_count_debug,
        "extraction_debug": extraction_debug
    }


def build_csv_row(result):
    row = {
        "Template": "GNG",
        "Extraction": "Automated",
        "MC_Note_Type": "NOTEMCDEC",
        "File Name": clean_for_csv_title(result["file"]),
        "Operation Number": result["operation_number"],
        "Validation Date": result["validation_date"],
        "Author": result["author"],
        "Document Page Count": result["document_page_count"],
        "Page count before opinion": result["page_count_before_opinion"],
        "Annex Page Count": result["annex_page_count"],
        "Text Before Opinions": result["text_before_opinions_count"]
    }

    for prefix in CSV_PREFIXES:
        row[prefix] = ""

    export_totals = build_export_prefix_totals(result["prefix_data"])

    for prefix, value in export_totals.items():
        if prefix in row and value > 0:
            row[prefix] = value

    return row


def write_csv(rows, output_csv: Path):
    with open(output_csv, "w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(
            file,
            fieldnames=CSV_FIELDNAMES
        )

        writer.writeheader()
        writer.writerows(rows)


def write_csv_with_fallback(rows, output_csv: Path) -> Path:
    try:
        write_csv(rows, output_csv)
        return output_csv
    except PermissionError:
        fallback_csv = output_csv.with_name(f"{output_csv.stem}_new{output_csv.suffix}")
        write_csv(rows, fallback_csv)
        print(f"WARNING: Could not overwrite {output_csv.resolve()} because it is open or locked.")
        print(f"WARNING: Wrote fallback CSV instead: {fallback_csv.resolve()}")
        return fallback_csv


def print_counting_configuration():
    detectable_prefixes = set(PREFIX_PATTERNS.keys())
    count_prefixes = set(COUNT_PREFIXES)
    csv_prefixes = set(CSV_PREFIXES)

    detectable_export_prefixes = {
        get_export_prefix(prefix)
        for prefix in detectable_prefixes
    }

    rows = []

    all_prefixes = sorted(
        csv_prefixes
        | count_prefixes
        | detectable_prefixes
    )

    for prefix in all_prefixes:
        export_prefix = get_export_prefix(prefix)

        rows.append([
            prefix,
            export_prefix,
            "YES" if export_prefix in csv_prefixes else "NO",
            "YES" if prefix in count_prefixes else "NO",
            "YES" if prefix in detectable_prefixes else "NO",
            "YES" if prefix != export_prefix else "NO"
        ])

    print("\n================ COUNTING CONFIGURATION ================")

    print_simple_table(
        [
            "Internal Prefix",
            "Exports As",
            "CSV Column",
            "In COUNT_PREFIXES",
            "Actually Detectable",
            "Mapped/Renamed"
        ],
        rows
    )

    print("\n--- CONFIGURATION WARNINGS ---")

    count_but_not_detectable = sorted(count_prefixes - detectable_prefixes)
    csv_but_not_detectable = sorted(csv_prefixes - detectable_export_prefixes)
    detectable_but_not_counted = sorted(detectable_prefixes - count_prefixes)

    if count_but_not_detectable:
        print(
            "WARNING: These prefixes are in COUNT_PREFIXES but cannot be detected "
            "because they are missing from PREFIX_PATTERNS:"
        )
        print(f"  {count_but_not_detectable}")
    else:
        print("No COUNT_PREFIXES detection gaps.")

    if csv_but_not_detectable:
        print("INFO: These CSV columns exist, but the parser does not currently detect them:")
        print(f"  {csv_but_not_detectable}")
    else:
        print("No CSV/detection gaps.")

    if detectable_but_not_counted:
        print("INFO: These prefixes are detectable but not listed in COUNT_PREFIXES:")
        print(f"  {detectable_but_not_counted}")
    else:
        print("No detectable-but-not-counted gaps.")

    print("========================================================\n")


def print_file_status(result):
    print(f"\n----- FILE STATUS: {result['file']} -----")
    print(f"Operation Number             : {result['operation_number']}")
    print(f"Validation Date              : {result['validation_date'] if result['validation_date'] else '[NOT FOUND]'}")
    print(f"Validation Date Method       : {result.get('header_debug', {}).get('method', '')}")
    print(f"Author                       : {result['author'] if result['author'] else '[NOT FOUND]'}")
    print(f"Used Cover Page Logic        : {result.get('header_debug', {}).get('used_cover_page_logic', '')}")
    print(f"Document Page Count          : {result['document_page_count']}")
    print(f"Page count before opinion    : {result['page_count_before_opinion']}")
    print(f"Annex Page Count             : {result['annex_page_count']}")
    print(f"Text Before Opinions         : {result['text_before_opinions_count']}")

    print("\nFound prefixes:")

    if result["prefix_data"]:
        for prefix, value in sorted(result["prefix_data"].items()):
            print(
                f"  {prefix}: {value} words "
                f"(exports as {get_export_prefix(prefix)})"
            )
    else:
        print("  None")

    print("---------------------------------------------")


def print_debug_output(result):
    print("\n====================================================")
    print(f"DEBUG FILE: {result['file']}")
    print("====================================================")

    header_debug = result.get("header_debug", {})
    text_before_debug = result.get("text_before_opinions_debug", {})
    page_before_debug = result.get("page_count_before_opinion_debug", {})
    annex_debug = result.get("annex_page_count_debug", {})
    extraction_debug = result.get("extraction_debug", {})

    print("\n--- SUMMARY ---")

    summary_rows = [
        ["Operation Number", result["operation_number"]],
        ["Validation Date", result["validation_date"]],
        ["Author", result["author"] if result["author"] else "[NOT FOUND]"],
        ["Used Cover Page Logic", header_debug.get("used_cover_page_logic", "")],
        ["Document Page Count", result["document_page_count"]],
        ["Section 6 found", "NO" if extraction_debug.get("section6_missing") else "YES"],
        ["Page count before opinion", result["page_count_before_opinion"]],
        ["Annex Page Count", result["annex_page_count"]],
        ["Text Before Opinions", result["text_before_opinions_count"]],
        ["Accepted prefix matches", extraction_debug.get("prefix_matches_found", 0)],
        ["Opinion segments", len(result["segments"])]
    ]

    print_simple_table(["Item", "Value"], summary_rows)

    print("\n--- VALIDATION DATE ---")
    page_index = header_debug.get("validation_date_page_index", "")
    display_page = page_index + 1 if isinstance(page_index, int) else ""
    print(f"Page searched : {display_page}")
    print(f"Method : {header_debug.get('method', '')}")
    print(f"Area rule : {header_debug.get('validation_date_area_rule', '')}")
    print(f"Candidate count : {header_debug.get('candidate_count', '')}")
    print(f"Trigger text : {header_debug.get('date_trigger_text', '')}")
    print(f"Block position : {header_debug.get('date_block_position', '')}")

    validation_attempts = header_debug.get("validation_date_attempts", [])

    if validation_attempts:
        print("\nValidation date attempts:")
        for attempt in validation_attempts:
            print(
                f"  {attempt.get('phase', '')} | "
                f"page {attempt.get('page', '')} | "
                f"found {attempt.get('found', '')} | "
                f"{attempt.get('method', '')}"
            )

    print("\n--- SECTION 6 / PRE-OPINION COUNTS ---")
    print(f"Section 6 page : {text_before_debug.get('section6_page', '')}")
    print(f"Section 6 offset : {text_before_debug.get('section6_offset', '')}")
    print(f"Text before raw length : {text_before_debug.get('raw_text_length', '')}")
    print(f"Text before cleaned length : {text_before_debug.get('cleaned_text_length', '')}")
    print(f"Text before word count : {text_before_debug.get('word_count', '')}")
    print(f"Page count rule : {page_before_debug.get('status', '')}")

    print("\n--- ANNEX PAGE COUNT DEBUG ---")

    if not annex_debug:
        print("No annex-page-count debug available.")
    else:
        print(f"Status : {annex_debug.get('status', '')}")
        print(f"Document page count : {annex_debug.get('document_page_count', '')}")
        print(f"Expected timetable found : {annex_debug.get('expected_timetable_found', '')}")
        print(f"Expected timetable trigger text : {annex_debug.get('expected_timetable_trigger_text', '')}")
        print(f"Expected timetable position : {annex_debug.get('expected_timetable_position', '')}")
        print(f"GNG validation found : {annex_debug.get('gng_validation_found', '')}")
        print(f"GNG validation trigger text : {annex_debug.get('gng_validation_trigger_text', '')}")
        print(f"GNG validation position : {annex_debug.get('gng_validation_position', '')}")
        print(f"GNG validation page : {annex_debug.get('gng_validation_page', '')}")
        print(f"Annex Page Count : {annex_debug.get('annex_page_count', '')}")

    print("\n--- OPINION EXTRACTION ---")
    print(f"Section 6 trigger : {extraction_debug.get('section6_trigger_text', '')}")
    print(f"Section 6 page : {extraction_debug.get('section6_page', '')}")
    print(f"Stop found : {'YES' if extraction_debug.get('stop_found') else 'NO'}")
    print(f"Stop trigger : {extraction_debug.get('stop_trigger_text', '')}")
    print(f"Raw section text length : {extraction_debug.get('raw_text_length', '')}")
    print(f"Cleaned section text length : {extraction_debug.get('cleaned_text_length', '')}")
    print(f"Footer/page noise removed : {len(extraction_debug.get('removed_footer_lines', []))}")

    print("\n--- PREFIX CANDIDATE LINES ---")
    candidates = extraction_debug.get("prefix_candidate_lines", [])

    if not candidates:
        print("No prefix-like lines found.")
    else:
        for idx, candidate in enumerate(candidates, 1):
            status = "ACCEPTED" if candidate["accepted"] else "REJECTED"
            print(
                f"{idx}. {status} | "
                f"Start: {candidate['start']} | "
                f"Line: {candidate['line']}"
            )

    print("\n--- OPINION SEGMENTS ---")

    if not result["segments"]:
        print("No opinion segments found.")
    else:
        segment_rows = []

        for idx, segment in enumerate(result["segments"], 1):
            segment_rows.append([
                idx,
                segment["prefix"],
                get_export_prefix(segment["prefix"]),
                segment["words"],
                shorten_for_table(segment["trigger_text"]),
                f"{segment['segment_start']} - {segment['segment_end']}"
            ])

        print_simple_table(
            ["#", "Internal Prefix", "Exports As", "Words", "Trigger", "Range"],
            segment_rows
        )

        print("\n--- SEGMENT TEXT PREVIEWS ---")

        for idx, segment in enumerate(result["segments"], 1):
            print("\n----------------------------------------------------")
            print(f"Segment {idx} | {segment['prefix']} -> {get_export_prefix(segment['prefix'])}")
            print("----------------------------------------------------")
            print(debug_text_block(segment["text"]))

    print("\n--- CSV PREFIX TOTALS ---")

    export_totals = build_export_prefix_totals(result["prefix_data"])

    if not export_totals:
        print("No exported prefix totals.")
    else:
        for prefix in CSV_PREFIXES:
            value = export_totals.get(prefix, 0)
            if value > 0:
                print(f"{prefix}: {value}")

    print("\n--- CLEANED TEXT USED FOR PREFIX DETECTION ---")
    print(debug_text_block(extraction_debug.get("cleaned_text_for_detection", "")))


def parse_args():
    parser = argparse.ArgumentParser(description="Extract GNG word counts from PDF notes.")
    parser.add_argument(
        "gng_dir",
        nargs="?",
        type=Path,
        default=GNG_DIR,
        help="Folder containing GNG PDF files. Defaults to 'GNG Folder'."
    )
    parser.add_argument(
        "--debug",
        action="store_true",
        help="Print detailed extraction diagnostics."
    )
    parser.add_argument(
        "--status",
        action="store_true",
        help="Print per-file status without full debug text."
    )
    return parser.parse_args()


def main():
    global DEBUG, STATUS_OUTPUT

    args = parse_args()
    DEBUG = args.debug
    STATUS_OUTPUT = args.debug or args.status
    target_dir = args.gng_dir

    deleted_checkpoint_count = delete_checkpoint_files(target_dir)

    pdf_files = sorted(target_dir.rglob("*.pdf"))

    if not pdf_files:
        raise SystemExit(f"No PDFs found under: {target_dir.resolve()}")

    rows = []

    if STATUS_OUTPUT:
        print_counting_configuration()

    for pdf_path in pdf_files:
        result = process_pdf(pdf_path)

        if STATUS_OUTPUT:
            print_file_status(result)

        if DEBUG:
            print_debug_output(result)

        rows.append(build_csv_row(result))

    output_csv = target_dir.parent / "gng_word_counts.csv"
    written_csv = write_csv_with_fallback(rows, output_csv)

    print("\n================ RUN SUMMARY ================")
    print(f"Checkpoint files deleted : {deleted_checkpoint_count}")
    print(f"PDF files processed      : {len(pdf_files)}")
    print(f"CSV rows exported        : {len(rows)}")
    print(f"CSV export completed     : {written_csv.resolve()}")
    print("=============================================")


if __name__ == "__main__":
    main()
