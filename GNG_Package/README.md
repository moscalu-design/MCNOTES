# GNG Package

Dedicated workspace for the GNG extractor.

## Contents

- `gng_extractor.py` - extracts GNG metadata and full service-block word counts.
- `GNG File Folder/` - local source PDFs. Ignored by git.
- `outputs/` - local extraction and accuracy outputs. Ignored by git.
- `CHANGELOG.md` - GNG-specific change log.

## Run

From the project root:

```powershell
python .\GNG_Package\gng_extractor.py
```

With diagnostics:

```powershell
python .\GNG_Package\gng_extractor.py --debug
```

## Accuracy Analysis

```powershell
python .\analysis\run_analysis.py GNG --limit 150 --sample random --seed 20260529 --output-dir GNG_Package/outputs/gng_accuracy_random_150
```

