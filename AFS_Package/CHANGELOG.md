# AFS Package Change Log

This log records changes specific to the AFS extractor and AFS package structure.

## 2026-05-29

### Added

- Added `AFS_Package/afs_extractor.py` using the AFS-specific opinion-start, timetable-stop, prefix-merge, and statistics logic.
- Added AFS output routing to `AFS_Package/outputs`.
- Added `analysis/afs_accuracy_analysis.py` for repeatable full-folder comparison against `Data Analysis/cleaned_database.csv`.
- Added `analysis/afs_visible_accuracy_analysis.py` for independent visible-PDF extraction and script-vs-visible comparison.
- Enabled AFS in `analysis/note_type_registry.json`.

### Tested

- Ran the extractor across all 123 PDFs in `AFS_Package/AFS_File_Folder`.
- Generated `afs_opinion_word_counts_raw.csv` and `afs_opinion_word_counts_statistics.csv`.
- Compared all 123 extracted rows against the cleaned database: 3,321 fields compared, 3,319 matched, 2 differed.
- Confirmed the two remaining differences are `Extraction` labels where the database marks two files as `Manual` and the extractor correctly labels the fresh run as `Automated`.
- Ran the independent visible-PDF audit across all 123 PDFs: 3,321 fields compared, 3,020 matched, 301 differed, for a 90.936% exact field match rate.
- Confirmed the visible-PDF differences are concentrated in strict word-count deltas: `Text Before Opinions` had 117 exact mismatches with an average absolute delta of 4.69 words, and 112 of 123 documents were within 10 words.

### Changed

- Added operation-number fallback from document text for AFS files whose filenames do not contain the operation number.
- Pointed `analysis/run_analysis.py AFS` at the independent visible-PDF audit instead of the database comparison.

## 2026-05-29 - Package Setup

### Added

- Added `AFS_Package` as the dedicated home for future AFS extraction work.
- Registered AFS as a disabled placeholder in `analysis/note_type_registry.json`.
- Added `AFS_Package/README.md`.
- Added this AFS-specific change log.

### Pending

- Add independent visible-PDF/manual audit reporting if we need the same manual-read style validation used for GNG.
