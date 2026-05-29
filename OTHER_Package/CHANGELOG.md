# OTHER Package Change Log

This log records changes specific to the OTHER extractor and OTHER package structure.

## 2026-05-29 - Extractor and Visible Audit

### Added

- Added `OTHER_Package/other_extractor.py` using the OTHER opinion-section, validated-by, annex, and prefix-merge logic.
- Added support for local `OTHER_Package/PREFIX_MERGE.xlsx`; if the workbook is missing, the extractor can fall back to a built-in default mapping.
- Added `analysis/other_visible_accuracy_analysis.py` for independent visible-PDF extraction and script-vs-visible comparison.
- Enabled OTHER in `analysis/note_type_registry.json`.

### Tested

- Ran the OTHER extractor across all 253 PDFs in `OTHER_Package/OTHER_File_Folder`.
- Generated `MCNOTES_opinion_word_counts.csv` and `MCNOTES_group_statistics.csv`.
- Ran the independent visible-PDF audit across all 253 PDFs: 6,831 fields compared, 6,411 matched, 420 differed, for a 93.852% exact field match rate.
- Confirmed 150 of 253 documents matched perfectly.
- Confirmed most count differences are very small: `Text Before Opinions` averaged 1.99 words absolute delta, 249 of 253 documents were within 5 words, and service-column differences were generally 1 word.

## 2026-05-29 - Package Setup

### Added

- Added `OTHER_Package` as the dedicated home for future OTHER extraction work.
- Registered OTHER as a disabled placeholder in `analysis/note_type_registry.json`.
- Added `OTHER_Package/README.md`.
- Added this OTHER-specific change log.

### Pending

- Review the small number of higher-delta `Text Before Opinions` cases if exact matching needs to be improved further.
