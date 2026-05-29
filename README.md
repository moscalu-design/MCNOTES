# MCNOTES

Utilities for extracting and validating MC note data from GNG PDFs.

## What Is Included

- `GNG_Package/gng_extractor.py` extracts GNG metadata and full service-block word counts from PDFs.
- `analysis/gng_accuracy_analysis.py` compares script output against an independent visible-PDF extraction for a 25-document sample.
- `analysis/run_analysis.py` runs registered note-type analyses.
- `analysis/note_type_registry.json` defines the enabled GNG workflow and placeholders for future AFS and OTHER work.
- `GNG_Package`, `AFS_Package`, and `OTHER_Package` are dedicated spaces for each extractor family.
- `Data Analysis` is the dedicated database/dashboard analysis section.
- `CHANGELOG.md` records project changes.

Source PDFs and generated reports are intentionally excluded from git because they may contain company/confidential content.

## Folder Layout

```text
GNG_Package/       GNG extractor, GNG PDFs, GNG-specific outputs and changelog
AFS_Package/       Future AFS extractor, AFS PDFs, AFS-specific outputs and changelog
OTHER_Package/     Future OTHER extractor, source files, outputs and changelog
analysis/          Shared runner and accuracy-analysis tooling
Data Analysis/     Database/dashboard analysis scripts and source files
Full Database/     Local database inputs, ignored by git
```

## Setup

Install dependencies:

```powershell
python -m pip install -r requirements.txt
```

## Run GNG Extraction

```powershell
python .\GNG_Package\gng_extractor.py
```

With diagnostics:

```powershell
python .\GNG_Package\gng_extractor.py --debug
```

## Run Accuracy Analysis

```powershell
python .\analysis\run_analysis.py GNG
```

Random reproducible sample:

```powershell
python .\analysis\run_analysis.py GNG --limit 150 --sample random --seed 20260529 --output-dir GNG_Package/outputs/gng_accuracy_random_150
```

The analysis writes local outputs under:

```text
GNG_Package/outputs/gng_accuracy/
```

## Counting Basis

GNG service-word counts use the full service block, including prefix headings, status words such as `Go`, standard intro lines, and service body text.
