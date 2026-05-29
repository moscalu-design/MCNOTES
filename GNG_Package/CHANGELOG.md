# GNG Package Change Log

This log records changes specific to the GNG extractor and GNG package structure.

## 2026-05-29

### Added

- Added `GNG_Package` as the dedicated home for GNG extraction work.
- Added `GNG_Package/README.md`.
- Added this GNG-specific change log.

### Changed

- Moved the GNG extractor into `GNG_Package/gng_extractor.py`.
- Changed the default GNG PDF folder to `GNG_Package/GNG File Folder`.
- Updated shared analysis tooling to load the GNG extractor from `GNG_Package`.
- Updated shared analysis output examples to write under `GNG_Package/outputs`.

### Existing Extractor History

- Added command-line arguments for input folder, `--debug`, and `--status`.
- Added operation-number fallback from PDF text.
- Added CSV fallback when an output CSV is open in Excel.
- Improved GNG service-block segmentation.
- Tightened service-prefix detection so lines like `PJ's assessment...` do not start a false PJ section.

### Validation

- GNG accuracy testing used the full service-block count basis.
- A 150-file random sample with seed `20260529` previously produced a `96.840%` exact field match rate.

