# MC Note Database Analysis

## Scope

Input workbook and sheet: `Master Table.xlsx / Master_Table_Q`  
Output folders: `Exports`, `Reports`, `Workbooks`, and `charts`

I treated `Source` as the batch folder / batch source column and normalized the template labels to `AFS`, `GNG`, `OTHER`, and `PIN`. The requested analysis focuses on `AFS`, `GNG`, and `OTHER`; `PIN` is retained in the exported files so the future website can compare the full database when useful.

## Executive Overview

- Total records: 5,600
- Automated records: 5,346 (95.46%)
- Manual correction records: 254 (4.54%)
- Validation date coverage: 2022-10-27 to 2026-05-19, with 13 missing validation dates and 0 dates later than 2026-06-02
- Total `Text Before Opinions` words: 14,703,428
- Mean / median `Text Before Opinions` words: 2,625.61 / 1,776.00
- Mean / median document pages: 24.02 / 16.00
- Correlation between document pages and word count: 0.203
- BO validation dates present: 5,580 rows; missing: 20
- Median BO-minus-MC validation-date delta: 0.0 days

## Template Summary

| Template | Documents | Automated | Manual | Manual Rate | Total Words | Mean Words | Median Words | Mean Pages | Median Pages |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| OTHER | 2,594 | 2,520 | 74 | 2.85% | 3,546,915 | 1,367.35 | 1,071.00 | 26.99 | 16.00 |
| AFS | 1,563 | 1,452 | 111 | 7.10% | 8,640,933 | 5,528.43 | 5,442.00 | 33.67 | 29.00 |
| GNG | 931 | 908 | 23 | 2.47% | 1,454,286 | 1,562.07 | 1,488.00 | 7.05 | 7.00 |

## Batch Folder View

The largest batch folders are heavily concentrated in the `OTHER` and main year-specific AFS/GNG folders. Manual batches mostly appear through `M...` source labels, but the `Extraction` column is the authoritative manual-vs-automated indicator in this analysis.

| Batch Folder | Template | Documents | Manual Rate | Mean Words | Mean Pages |
|---|---|---:|---:|---:|---:|
| OTHER2023 | OTHER | 853 | 5.28% | 1,417.00 | 28.77 |
| OTHER2024 | OTHER | 747 | 2.01% | 1,311.72 | 26.75 |
| OTHER2025 | OTHER | 681 | 1.17% | 1,360.37 | 26.74 |
| AFS2025 | AFS | 485 | 5.77% | 6,145.33 | 35.73 |
| AFS2023 | AFS | 450 | 10.44% | 4,954.47 | 33.72 |
| AFS2024 | AFS | 445 | 6.97% | 5,523.57 | 34.18 |
| GNG2025 | GNG | 402 | 1.99% | 1,586.14 | 7.19 |
| PIN2023 | PIN | 393 | 7.38% | 2,078.22 | 10.29 |
| GNG2024 | GNG | 320 | 2.81% | 1,566.79 | 7.28 |
| OTHER2026 | OTHER | 253 | 0.00% | 1,312.27 | 23.15 |
| GNG2026 | GNG | 182 | 2.20% | 1,515.62 | 6.64 |
| AFS2026 | AFS | 125 | 1.60% | 6,691.26 | 34.37 |

## Department Word Counts

Department-coded word counts are sparse by design: many documents only have words in a subset of department columns. For template-level interpretation, the most useful measure is share of department-coded words rather than simple non-null counts.

| Template | Top Department | Department Words | Share of Department-Coded Words |
|---|---|---:|---:|
| AFS | RM | 1,494,472 | 30.60% |
| GNG | RM | 178,062 | 50.37% |
| OTHER | RM | 297,028 | 28.36% |

Full department-by-template detail is exported to `department_word_counts_by_template.csv`.

## BO Fields And Products

The `Master_Table_Q` sheet adds BO validation date, BO team columns, financing product name, and special-activity flags. These are now included in `cleaned_database.csv`, `dashboard_data.json`, and the dashboard record explorer.

Top financing products:

| Financing Product | Documents | Templates | Median Words | Mean Pages |
|---|---:|---|---:|---:|
| Missing product | 3,113 | AFS, GNG, OTHER, PIN | 1,257.00 | 24.25 |
| Ordinary Loan | 1,927 | AFS, GNG | 3,520.00 | 22.91 |
| Individual Quasi-Equity | 138 | AFS, GNG | 6,626.50 | 27.85 |
| Portfolio Guarantee | 119 | AFS, GNG | 4,307.00 | 22.53 |
| Portfolio Equity | 108 | AFS, GNG | 3,298.00 | 25.43 |
| Portfolio Counter-Guarantee | 80 | AFS, GNG | 6,647.00 | 32.92 |
| Debt Service Reserve Facility | 40 | AFS, GNG | 5,403.50 | 36.55 |
| Contingent Loan | 20 | AFS, GNG | 1,213.50 | 11.00 |
| Portfolio Quasi-Equity | 15 | AFS, GNG | 5,137.00 | 32.60 |
| Investment Grant | 10 | AFS, GNG | 2,255.00 | 18.90 |

## BO Team Opinion Extremes

For PJ, RM, JU, and ECON, I used the matching BO team column (`BO PJ`, `BO RM`, `BO JU`, `BO ECON`) and compared rows where that service had a positive opinion word count. The table below shows the highest and lowest median word-count teams for each service, requiring at least three opinions per team.

| Service | Highest-Median Team | Median Words | Opinions | Lowest-Median Team | Median Words | Opinions |
|---|---|---:|---:|---|---:|---:|
| ECON | SG/ECON/PS | 918.00 | 23 | SG/ECON/ES | 666.50 | 26 |
| JU | JU/POL/NPP | 500.50 | 124 | JU/POL/DMTA | 35.00 | 14 |
| PJ | PJ/MOB/AWID | 500.00 | 40 | PJ/MOB/ROADS | 44.00 | 56 |
| RM | Structured Finance & Equity | 982.00 | 448 | Mandates, Pricing & Support | 45.00 | 4 |

Full BO team detail is exported to `bo_team_opinion_summary.csv`.

## Time Series

The workbook supports monthly and yearly analysis using `Validation Date`. Monthly exports include volume, manual rate, average word counts, median word counts, and page-count summaries by template. These are ready for the interactive website as filterable trend lines.

Charts:

- `charts/monthly_document_volume_by_template.png`
- `charts/monthly_average_words_by_template.png`
- `charts/manual_rate_by_template.png`
- `charts/word_count_distribution_by_template.png`
- `charts/pages_vs_word_count.png`
- `charts/department_word_share_by_template.png`

## Outlier Snapshot

Top 10 records by `Text Before Opinions`:

| Template | Extraction | Words | Pages | File Name |
|---|---|---:|---:|---|
| AFS | Automated | 14,544 | 82 | 26 - AFS - 2023-0689 - BARBADOS GLOBAL GATEWAY NATURE GUARANTEE.pdf |
| AFS | Automated | 13,846 | 40 | MCAFS 20240894 SQIM MYCELIUM TECHNOLOGY DEMO PLANT (IEU GT2).pdf |
| AFS | Automated | 13,810 | 47 | 07 - MCAFS 20250615 TECHEU AIRBUS INNOVATION AND DEFENCE RDI.pdf |
| AFS | Automated | 13,657 | 58 | MCAFS 20240252 NATIXIS PAN-EU WIND POWER PACKAGE.pdf |
| AFS | Automated | 13,539 | 61 | NOTEMCDEC 2024-07-25 OPS AFS 20240046 SANTANDER PAN-EU WIND POWER PACKAGE RS EN.pdf |
| AFS | Automated | 12,320 | 62 | 8 - MCAFS 20190638 TECHEU NACRE ADVANCED BIOFUEL PLANT.pdf |
| AFS | Automated | 12,251 | 45 | 10 - MCAFS 20250451 NIGERIA CLIMATE SMART AGRI-FOOD VALUE CHAINS.pdf |
| AFS | Automated | 11,993 | 37 | MCAFS 20230807 GREENLIGHT BIO (IEU G).pdf |
| AFS | Manual | 11,963 | 36 | MCAFS 20240549 HEURA FOODS (IEU G).pdf |
| AFS | Automated | 11,897 | 35 | MCAFS 20240783 MAAT PHARMA (IEU-LS).pdf |

Full top-50 detail is exported to `top_50_word_count_outliers.csv`.

## Data Quality Notes

- Missing validation dates: 13
- Future validation dates after 2026-06-02: 0
- Missing annex page counts: 17
- Missing GED match status: 0

These rows are exported to `data_quality_flags.csv`. The missing GED match status count is high enough that GED matching should be shown as a website filter or data-quality badge, not hidden in the background.

## Statistical Analysis Options

1. Descriptive baseline dashboard: template volume, manual rate, word-count distributions, page-count distributions, department-coded word shares, and batch-folder drilldowns.
2. Manual vs automated comparison: compare word/page distributions within each template using medians, robust spread, bootstrap confidence intervals, and non-parametric tests. This answers whether manual correction work clusters around larger or more complex documents.
3. Batch-folder quality analysis: rank batch folders by manual rate, missing metadata, outlier frequency, and GED match quality. This is probably the best operational view for spotting extraction/process issues.
4. Time-series trend analysis: monthly volumes, moving averages, seasonality by template, and before/after comparisons for process changes. This can also reveal whether 2026 partial-year data should be normalized.
5. Outlier and anomaly review: flag unusually high word counts, unusually high pages-per-word ratios, high annex counts, or documents whose department word total diverges sharply from `Text Before Opinions`.
6. Mix-adjusted modelling: estimate expected word count using template, page count, extraction type, batch folder, and month/year. This separates "AFS documents are longer" from "this specific batch is unusual."
7. Website-ready exploration: interactive filters for template, extraction type, batch folder, date range, GED match status, and department. Recommended views are Overview, Word Counts, Pages, Manual Corrections, Time Series, Batch Folders, and Data Quality.

## Exported Files

- `cleaned_database.csv`
- `template_overview.csv`
- `template_extraction_overview.csv`
- `batch_folder_overview.csv`
- `department_word_counts_by_template.csv`
- `monthly_time_series.csv`
- `yearly_time_series.csv`
- `manual_vs_automated_effect.csv`
- `financing_product_overview.csv`
- `bo_team_opinion_summary.csv`
- `bo_validation_date_summary.csv`
- `top_50_word_count_outliers.csv`
- `data_quality_flags.csv`
- `correlation_matrix.csv`
- `mc_note_analysis_outputs.xlsx`
