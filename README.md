# MCNOTES

Utilities for extracting and validating MC note data from GNG, AFS, and OTHER PDFs.

## What Is Included

- `GNG_Package/gng_extractor.py` extracts GNG metadata and full service-block word counts from PDFs.
- `AFS_Package/afs_extractor.py` extracts AFS metadata, opinion word counts, and AFS summary statistics from PDFs.
- `OTHER_Package/other_extractor.py` extracts OTHER metadata, opinion word counts, and group statistics from PDFs.
- `analysis/gng_accuracy_analysis.py` compares script output against an independent visible-PDF extraction for a 25-document sample.
- `analysis/afs_visible_accuracy_analysis.py` compares AFS script output against an independent visible-PDF extraction.
- `analysis/other_visible_accuracy_analysis.py` compares OTHER script output against an independent visible-PDF extraction.
- `analysis/run_analysis.py` runs registered note-type analyses.
- `analysis/note_type_registry.json` defines the enabled GNG, AFS, and OTHER workflows.
- `GNG_Package`, `AFS_Package`, and `OTHER_Package` are dedicated spaces for each extractor family.
- `Data Analysis` is the dedicated database/dashboard analysis section.
- `CHANGELOG.md` records project changes.

Source PDFs and generated reports are intentionally excluded from git because they may contain company/confidential content.

## Folder Layout

```text
GNG_Package/       GNG extractor, GNG PDFs, GNG-specific outputs and changelog
AFS_Package/       AFS extractor, AFS PDFs, AFS-specific outputs and changelog
OTHER_Package/     OTHER extractor, source files, outputs and changelog
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

## Run AFS Extraction

```powershell
python .\AFS_Package\afs_extractor.py
```

Compare AFS output against an independent visible-PDF extraction:

```powershell
python .\analysis\run_analysis.py AFS
```

The AFS reports write local outputs under:

```text
AFS_Package/outputs/
```

## Run OTHER Extraction

```powershell
python .\OTHER_Package\other_extractor.py
```

Compare OTHER output against an independent visible-PDF extraction:

```powershell
python .\analysis\run_analysis.py OTHER
```

The OTHER reports write local outputs under:

```text
OTHER_Package/outputs/
```

## Counting Basis

GNG service-word counts use the full service block, including prefix headings, status words such as `Go`, standard intro lines, and service body text.
