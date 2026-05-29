# MC Notes / GNG Project Change Log

This log records material changes made to the local GNG extraction project.

## 2026-05-29

### Added

- Created empty GitHub repository `moscalu-design/MCNOTES`.
- Added `README.md` with setup and run instructions.
- Added `requirements.txt` for Python dependencies.
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

- Changed default GNG input folder from `GNG_Package/Missing` to `GNG Folder` to match the local project structure.
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

### Notes

- Service-word analysis uses full service block counts only, including prefix headings, status words such as `Go`, boilerplate intro lines, and service body text.
- Company PDFs and generated outputs may contain confidential source material. Treat them carefully before pushing to a remote repository.
