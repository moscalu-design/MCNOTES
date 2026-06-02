# Data Analysis Change Log

This log records changes specific to the database/dashboard analysis section.

## 2026-06-01

### Master Table Repoint

- Repointed the analysis pipeline from `MC_Note_Datebase.xlsx` / `Database` to `Master Table.xlsx` / `Master_Table_Q`.
- Added BO validation date, financing product, and BO team opinion summaries to the regenerated exports and dashboard payload.
- Added a dashboard `BO / Products` view with product mix, BO validation-date status, and highest/lowest BO team opinion word-count tables.

## 2026-05-29

### Existing Section

- `Data Analysis` is kept as the dedicated home for workbook/database analysis and dashboard files.
- Generated CSV, JSON, PNG, chart, and workbook artifacts are ignored by git.
- Source scripts and dashboard source files may be versioned separately from generated outputs.
