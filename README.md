# MCNOTES

Utilities for extracting and validating MC note data from GNG PDFs.

## What Is Included

- `gng_extractor.py` extracts GNG metadata and full service-block word counts from PDFs.
- `analysis/gng_accuracy_analysis.py` compares script output against an independent visible-PDF extraction for a 25-document sample.
- `analysis/run_analysis.py` runs registered note-type analyses.
- `analysis/note_type_registry.json` defines the enabled GNG workflow and a placeholder for future AFS work.
- `CHANGELOG.md` records project changes.

Source PDFs and generated reports are intentionally excluded from git because they may contain company/confidential content.

## Setup

Install dependencies:

```powershell
python -m pip install -r requirements.txt
```

## Run GNG Extraction

```powershell
python .\gng_extractor.py "GNG Folder"
```

With diagnostics:

```powershell
python .\gng_extractor.py "GNG Folder" --debug
```

## Run Accuracy Analysis

```powershell
python .\analysis\run_analysis.py GNG
```

Random reproducible sample:

```powershell
python .\analysis\run_analysis.py GNG --limit 150 --sample random --seed 20260529 --output-dir outputs/gng_accuracy_random_150
```

The analysis writes local outputs under:

```text
outputs/gng_accuracy/
```

## Counting Basis

GNG service-word counts use the full service block, including prefix headings, status words such as `Go`, standard intro lines, and service body text.
