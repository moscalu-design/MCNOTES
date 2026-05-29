# OTHER Package

Dedicated workspace for the OTHER extractor.

## Contents

- `OTHER_File_Folder/` - local source PDFs. Ignored by git.
- `PREFIX_MERGE.xlsx` - local prefix-to-output-column mapping workbook. Ignored by git.
- `other_extractor.py` - OTHER PDF extractor.
- `outputs/` - OTHER extraction and accuracy outputs. Ignored by git.
- `CHANGELOG.md` - OTHER-specific change log.

## Run

Extract all OTHER PDFs:

```powershell
python .\OTHER_Package\other_extractor.py
```

Compare OTHER output against independent visible-PDF extraction:

```powershell
python .\analysis\run_analysis.py OTHER
```
