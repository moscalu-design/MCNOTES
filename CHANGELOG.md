# MC Notes / GNG Project Change Log

This log records material changes made to the local GNG extraction project.

## 2026-05-29 - AFS Extractor

### Added

- Added the AFS extractor in `AFS_Package/afs_extractor.py`.
- Added repeatable AFS database-comparison analysis in `analysis/afs_accuracy_analysis.py`.

### Changed

- Enabled AFS in `analysis/note_type_registry.json`.
- Added operation-number fallback from PDF text for AFS files without operation numbers in the filename.

### Tested

- Ran the AFS extractor across all 123 PDFs in `AFS_Package/AFS_File_Folder`.
- Compared the AFS output against `Data Analysis/cleaned_database.csv`; 3,319 of 3,321 fields matched.

## 2026-05-29

### Added

- Created empty GitHub repository `moscalu-design/MCNOTES`.
- Added `README.md` with setup and run instructions.
- Added `requirements.txt` for Python dependencies.
- Added dedicated package folders:
  - `GNG_Package`
  - `AFS_Package`
  - `OTHER_Package`
- Added package-level changelogs:
  - `GNG_Package/CHANGELOG.md`
  - `AFS_Package/CHANGELOG.md`
  - `OTHER_Package/CHANGELOG.md`
- Added `Data Analysis/CHANGELOG.md` and kept `Data Analysis` as a dedicated database/dashboard analysis section.
- Added random/reproducible sampling options to `analysis/gng_accuracy_analysis.py`:
  - `--limit`
  - `--sample first|random`
  - `--seed`
  - `--output-dir`
- Updated `analysis/run_analysis.py` to pass through analysis arguments to registered note-type scripts.
- Added `gng_extractor.py` as the local runnable GNG extraction script.
- Added command-line arguments to `gng_extractor.py`:
  - optional input folder path
  - `--debug`
  - `--status`
- Added project output structure:
  - `outputs/gng_accuracy/`
  - `analysis/`
- Added `analysis/gng_accuracy_analysis.py` to compare script output against an independent visible-PDF extraction for a 25-document sample.
- Added generated GNG accuracy outputs:
  - `outputs/gng_accuracy/gng_accuracy_analysis.xlsx`
  - `outputs/gng_accuracy/index.html`
  - `outputs/gng_accuracy/gng_accuracy_field_comparison.csv`
  - `outputs/gng_accuracy/gng_accuracy_field_stats.csv`
  - `outputs/gng_accuracy/gng_accuracy_document_summary.csv`
  - `outputs/gng_accuracy/gng_script_output_25.csv`
  - `outputs/gng_accuracy/gng_visible_actuals_25.csv`
  - `outputs/gng_accuracy/gng_visible_extraction_debug.csv`
- Added `analysis/note_type_registry.json` with registered note types:
  - `GNG` enabled
  - `AFS` placeholder disabled for future extractor/analysis work
- Added `analysis/run_analysis.py` as a small registry-based analysis runner.

### Changed

- Moved the GNG extractor into `GNG_Package/gng_extractor.py`.
- Moved local GNG analysis outputs under `GNG_Package/outputs`.
- Updated registry paths for GNG, AFS, and OTHER package homes.
- Updated ignore rules so source PDFs, generated outputs, database exports, and workbook files stay local.
- Changed default GNG input folder from the earlier placeholder paths to `GNG_Package/GNG File Folder`.
- Updated operation-number extraction to fall back to PDF text when the number is not present in the filename.
- Added CSV write fallback logic so if `gng_word_counts.csv` is open in Excel, the script writes `gng_word_counts_new.csv` instead of failing.
- Improved debug segmentation by merging consecutive matches for the same prefix into a single service block.
- Tightened GNG prefix detection so only actual prefix heading lines start a new service block.
  - This fixed a real issue where text like `PJ's assessment...` inside an RM block could be incorrectly treated as a new PJ section.

### Validation

- Installed local project Python runtime at `C:\Users\moscalu\AppData\Local\MCNotesPython312`.
- Installed required Python packages:
  - `PyMuPDF`
  - `openpyxl`
- Ran `gng_extractor.py` successfully on the uploaded GNG PDFs.
- Ran `analysis/run_analysis.py GNG` successfully.
- Ran `analysis/run_analysis.py GNG --limit 150 --sample random --seed 20260529 --output-dir outputs/gng_accuracy_random_150` successfully.
- Ran syntax checks with `py_compile` on:
  - `gng_extractor.py`
  - `analysis/gng_accuracy_analysis.py`
  - `analysis/run_analysis.py`

### Accuracy Summary

- Analysed 25 GNG PDFs.
- Compared 675 fields.
- Overall exact field match rate: `96.741%`.
- Total mismatches: `22`.
- Perfect documents: `10`.
- Fields with 25/25 exact matches included:
  - `Operation Number`
  - `Validation Date`
  - `Author`
  - `Document Page Count`
  - `Page count before opinion`
  - `Annex Page Count`
  - `JU`
  - `OCCO`
- Main remaining difference area:
  - `Text Before Opinions`, usually off by a small number of words because text-stream extraction and visible-PDF line extraction tokenize some pre-opinion content slightly differently.
- Random 150-PDF sample accuracy summary:
  - Available PDFs: `178`.
  - Sample method: random.
  - Random seed: `20260529`.
  - Analysed PDFs: `150`.
  - Compared fields: `4050`.
  - Overall exact field match rate: `96.840%`.
  - Total mismatches: `128`.
  - Perfect documents: `47`.
  - Fields with 150/150 exact matches included:
    - `Operation Number`
    - `Validation Date`
    - `Author`
    - `Document Page Count`
    - `Page count before opinion`
    - `Annex Page Count`
    - `OCCO`
  - Main remaining difference area:
    - `Text Before Opinions`, with 53/150 exact matches, mean absolute delta `1.83` words, and max delta `40` words.

### Notes

- Service-word analysis uses full service block counts only, including prefix headings, status words such as `Go`, boilerplate intro lines, and service body text.
- Company PDFs and generated outputs may contain confidential source material. Treat them carefully before pushing to a remote repository.
