# AFS Package

Dedicated workspace for the AFS extractor.

## Contents

- `AFS_File_Folder/` - local source PDFs. Ignored by git.
- `afs_extractor.py` - AFS PDF extractor.
- `outputs/` - AFS extraction and accuracy outputs. Ignored by git.
- `CHANGELOG.md` - AFS-specific change log.

## Run

Extract all AFS PDFs:

```powershell
python .\AFS_Package\afs_extractor.py
```

Compare all AFS PDFs against the cleaned database:

```powershell
python .\analysis\run_analysis.py AFS
```
