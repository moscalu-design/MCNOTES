# Deep File And Data Audit

Generated: 2026-06-01 08:33

## Scope

- Database rows audited: 5,629
- PDFs available for direct file audit: 2,897
- Database rows matched to an available PDF: 2,637
- Matched PDFs with an extracted or prior-audited visible validation date: 2,619
- Prior visible-accuracy samples reused: AFS 123, GNG 25, OTHER 253

The PDF audit covers the files physically present in the AFS, GNG, and OTHER package folders. PIN rows are still included in database-level trend checks, but no PIN PDFs were available in the package folders.

## Biggest Finding: 2026 Date Parsing Is Funky

The future-date warning is mostly a day/month parsing problem, not evidence that the documents are actually future opinions.

- Database rows with future validation dates: 0
- Future-dated rows that also had a matching PDF: 0
- Matched future rows confirmed as visible day/month swaps: 0
- Example pattern: visible `08/05/2026` means 8 May 2026, but the database stores `2026-08-05`.

Matched date-status breakdown:

| status | matched_rows |
| --- | --- |
| db_matches_filename_not_visible | 3 |
| db_matches_visible | 304 |
| db_visible_mismatch | 548 |
| missing_db_date | 13 |
| no_visible_date | 5 |
| visible_matches_filename_db_differs | 1764 |

This matters for the monthly 2026 time series. The year-level OTHER total is less affected than the month-level charts, but the timeline position is materially wrong for many OTHER2026 rows.

- OTHER 2026 using database dates: 234 docs, median 1048 words, median 12.5 pages
- OTHER 2026 after visible-date correction where confirmed: 234 docs, median 1048 words, median 12.5 pages

OTHER 2026 monthly placement before and after visible-date correction:

| date_basis | month | documents | median_words | median_pages |
| --- | --- | --- | --- | --- |
| corrected_visible_dates | 2026-01 | 43 | 977.0 | 12.0 |
| corrected_visible_dates | 2026-02 | 53 | 1021.0 | 11.0 |
| corrected_visible_dates | 2026-03 | 75 | 1271.0 | 14.0 |
| corrected_visible_dates | 2026-04 | 38 | 847.5 | 12.0 |
| corrected_visible_dates | 2026-05 | 25 | 1076.0 | 15.0 |
| database_dates | 2026-01 | 43 | 977.0 | 12.0 |
| database_dates | 2026-02 | 53 | 1021.0 | 11.0 |
| database_dates | 2026-03 | 75 | 1271.0 | 14.0 |
| database_dates | 2026-04 | 38 | 847.5 | 12.0 |
| database_dates | 2026-05 | 25 | 1076.0 | 15.0 |

## Page Count Audit

- Matched PDF page-count mismatches: 0
- Interpretation: document page count is very reliable where the source PDF is available.

## Word Count And Extraction Audit

The visible-accuracy outputs support the main dashboard totals, but they also show where precision is weak:

- Template, extraction status, file name, operation number, author, page counts, and most zero/non-zero service fields are generally strong.
- Text Before Opinions is the weakest field in the visible samples, especially for AFS. The deltas are small in absolute terms in the validation sample, but exact string/numeric equality is low because boundary counting differs.
- RM/PJ/JU service-section counts are the fields most likely to mismatch in service-level analysis.
- The scary-looking SG/GNG issue is not present in the database: positive SG appears only under OTHER in the full dashboard test suite.

Focused visible-accuracy stats:

| Template | Field | Compared | Matches | Mismatches | Match Rate | Mean Abs Delta | Max Abs Delta |
| --- | --- | --- | --- | --- | --- | --- | --- |
| AFS | Validation Date | 123 | 118 | 5 | 0.959349593495935 |  |  |
| AFS | Document Page Count | 123 | 123 | 0 | 1.0 | 0.0 | 0.0 |
| AFS | Text Before Opinions | 123 | 6 | 117 | 0.048780487804878 | 4.691056910569106 | 18.0 |
| AFS | PJ | 123 | 99 | 24 | 0.8048780487804879 | 0.3658536585365853 | 7.0 |
| AFS | RM | 123 | 25 | 98 | 0.2032520325203252 | 5.710743801652892 | 15.0 |
| AFS | JU | 123 | 99 | 24 | 0.8048780487804879 | 0.3333333333333333 | 5.0 |
| AFS | SG | 123 | 123 | 0 | 1.0 |  |  |
| GNG | Validation Date | 25 | 25 | 0 | 1.0 |  |  |
| GNG | Document Page Count | 25 | 25 | 0 | 1.0 | 0.0 | 0.0 |
| GNG | Text Before Opinions | 25 | 10 | 15 | 0.4 | 2.2 | 17.0 |
| GNG | PJ | 25 | 23 | 2 | 0.92 | 0.125 | 2.0 |
| GNG | RM | 25 | 21 | 4 | 0.84 | 0.32 | 5.0 |
| GNG | JU | 25 | 25 | 0 | 1.0 | 0.0 | 0.0 |
| GNG | SG | 25 | 25 | 0 | 1.0 |  |  |
| OTHER | Validation Date | 253 | 253 | 0 | 1.0 |  |  |
| OTHER | Page_Count | 253 | 253 | 0 | 1.0 | 0.0 | 0.0 |
| OTHER | Text Before Opinions | 253 | 154 | 99 | 0.6086956521739131 | 1.992094861660079 | 15.0 |
| OTHER | PJ | 253 | 209 | 44 | 0.8260869565217391 | 1.0 | 1.0 |
| OTHER | RM | 253 | 192 | 61 | 0.758893280632411 | 1.0327868852459017 | 3.0 |
| OTHER | JU | 253 | 173 | 80 | 0.6837944664031621 | 1.0 | 1.0 |
| OTHER | SG | 253 | 243 | 10 | 0.9604743083003952 | 1.0 | 1.0 |

## Weird Trend Checks

- AFS is not showing streamlining by length. It gets longer in text-before-opinions and pre-opinion pages through 2026. That could be a real template change, an AFS sample mix shift, or more complete pre-opinion capture.
- GNG gets fewer service-opinion sections over time, but median words per document do not collapse. The streamlining signal is more about fewer opinion blocks than fewer total words.
- OTHER is the clearest streamlining candidate by pages and median words, but the 2026 month placement needs corrected visible dates before making a monthly claim.
- Author analysis is useful for AFS/OTHER/PIN, but weak for GNG because most GNG author/service-office values are missing in the database.
- Department totals can overlap. Rows where department totals exceed Text Before Opinions should be treated as section-overlap/extraction anomalies, not necessarily impossible documents.

## Author / Service-Office Signals

Longest author/service-office groups with at least 8 documents:

| Template | Author | documents | median_words | mean_words | median_pages |
| --- | --- | --- | --- | --- | --- |
| AFS | OPS/EGPF/1-CLEANTECH/-/- | 31 | 8564.0 | 8221.709677419354 | 33.0 |
| AFS | OPS/EGPF/2-DTLS/LSB/- | 21 | 8375.0 | 8155.619047619048 | 31.0 |
| AFS | OPS/EGPF/4-PF WEST/IBMA/- | 10 | 8003.0 | 7859.8 | 54.0 |
| AFS | OPS/CORP/3-WE/-/- | 25 | 7227.0 | 7424.36 | 48.0 |
| AFS | OPS/EGPF/2-DTLS/-/- | 10 | 7215.5 | 7554.6 | 29.0 |
| AFS | OPS/EGPF/4-PF WEST/-/- | 12 | 7181.0 | 7166.75 | 31.5 |
| AFS | GLO/IP/FIN INC/-/- | 14 | 7176.5 | 7022.928571428572 | 52.0 |
| AFS | GLO/CFGA/CORP/-/- | 19 | 7139.0 | 6975.210526315789 | 35.0 |
| AFS | OPS/EGPF/2-DTLS/TECH/- | 23 | 7033.0 | 6777.913043478261 | 28.0 |
| AFS | OPS/CORP/2-IBERIA/-/- | 16 | 6784.0 | 6848.5 | 35.0 |

Shortest author/service-office groups with at least 8 documents:

| Template | Author | documents | median_words | mean_words | median_pages |
| --- | --- | --- | --- | --- | --- |
| OTHER | FC/FRA/FRD/-/- | 22 | 170.5 | 407.59090909090907 | 13.0 |
| OTHER | SG/GB/GBS/-/- | 16 | 192.0 | 233.25 | 6.0 |
| OTHER | GR&C-RM/GFIN | 20 | 193.0 | 329.95 | 19.0 |
| OTHER | FC/FRA/FRD | 14 | 203.5 | 358.92857142857144 | 17.0 |
| OTHER | PJ/SQM/CARES/-/- | 29 | 225.0 | 224.41379310344828 | 3.0 |
| OTHER | CFC/FRA/-/-/- | 26 | 229.0 | 460.88461538461536 | 7.5 |
| OTHER | GR&C-RM/GFIN/-/-/- | 141 | 229.0 | 254.12765957446808 | 21.0 |
| OTHER | FI/CAP/NOCOST/-/- | 86 | 247.5 | 277.9186046511628 | 2.0 |
| OTHER | FI/SPBS/OSM/-/- | 11 | 278.0 | 253.27272727272728 | 4.0 |
| OTHER | CFC/FRA/BRD/-/- | 10 | 307.5 | 368.1 | 18.0 |

## Date Rows To Review First

| Template | Batch Folder | File Name | DB Validation Date | visible_header_raw | Visible Validation Date | Visible Validation Date Source | Filename Date | Date Delta Days DB minus Visible | date_status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| OTHER | OTHER2026 | NOTEMCDEC 2026-05-19 SG Final approval of No High-risk individual operation following InvestEU Investmen EN.pdf | 2026-05-17 | 18/05/2026 | 2026-05-18 | visible_accuracy | 2026-05-19 | -1.0 | db_visible_mismatch |
| OTHER | OTHER2026 | NOTEMCDEC 2026-05-12 GLO Approval of Two Memoranda of Understanding with Mexican Federal Authorities EN.pdf | 2026-05-10 | 11/05/2026 | 2026-05-11 | visible_accuracy | 2026-05-12 | -1.0 | db_visible_mismatch |
| OTHER | OTHER2026 | NOTEMCINFO 2026-05-18 OPS RRF Spain mandate - upcoming signature of finance contract EN.pdf | 2026-05-10 | 11/05/2026 | 2026-05-11 | visible_accuracy | 2026-05-18 | -1.0 | db_visible_mismatch |
| OTHER | OTHER2026 | NOTEMCDEC 2026-05-11 PMM 2014-0065 - ACCESSBANK AZERBAIJAN LOAN FOR SMES - Exit via Sale to Bank Respubli EN.pdf | 2026-05-07 | 08/05/2026 | 2026-05-08 | visible_accuracy | 2026-05-11 | -1.0 | db_visible_mismatch |
| OTHER | OTHER2026 | NOTEMCDEC 2026-05-05 SG PJ GR_C-RM Update to the Audit Committee - Sustainability reporting and implementation stat EN.pdf | 2026-05-03 | 04/05/2026 | 2026-05-04 | visible_accuracy | 2026-05-05 | -1.0 | db_visible_mismatch |
| OTHER | OTHER2026 | NOTEMCDEC 2026-05-04 OPS Change after approval - Extension of the Ultimate Signature Deadline (date butoi EN.pdf | 2026-04-29 | 30/04/2026 | 2026-04-30 | visible_accuracy | 2026-05-04 | -1.0 | db_visible_mismatch |
| OTHER | OTHER2026 | NOTEMCDEC 2026-04-24 OPS EAFRD CO-FINANCING ANDALUCIA 2023-27 (2022-0994) - Change After Approval - Incre EN.pdf | 2026-04-22 | 23/04/2026 | 2026-04-23 | visible_accuracy | 2026-04-24 | -1.0 | db_visible_mismatch |
| OTHER | OTHER2026 | NOTEMCDEC 2026-04-09 OPS SABADELL RISK SHARING SMES AND MIDCAPS II (2022-0057) - Inclusion of Underlying  EN.pdf | 2026-04-07 | 08/04/2026 | 2026-04-08 | visible_accuracy | 2026-04-09 | -1.0 | db_visible_mismatch |
| OTHER | OTHER2026 | NOTEMCINFO 2026-04-01 SG OPS PJ DIR SG GLO Closure of MC Action Point 56 - European foundations and pilot MoU  EN.pdf | 2026-03-29 | 30/03/2026 | 2026-03-30 | visible_accuracy | 2026-04-01 | -1.0 | db_visible_mismatch |
| OTHER | OTHER2026 | NOTEMCDEC 2026-03-31 PJ GLO European Investment Bank participation in new MDB joint coalition _Water Forward EN.pdf | 2026-03-29 | 30/03/2026 | 2026-03-30 | visible_accuracy | 2026-03-31 | -1.0 | db_visible_mismatch |
| OTHER | OTHER2026 | NOTEMCDEC 2026-03-30 GR_C Group BCBS239 Validation Function (BVF) - 2025 Validation Report and 2026 Valida EN.pdf | 2026-03-26 | 27/03/2026 | 2026-03-27 | visible_accuracy | 2026-03-30 | -1.0 | db_visible_mismatch |
| OTHER | OTHER2026 | NOTEMCDEC 2026-03-30 PJ OPS GLO Critical Raw Materials - Update to the Board of Directors EN.pdf | 2026-03-26 | 27/03/2026 | 2026-03-27 | visible_accuracy | 2026-03-30 | -1.0 | db_visible_mismatch |
| OTHER | OTHER2026 | NOTEMCDEC 2026-03-27 GR_C-RM OPS CE Treatment of STS Securitizations for Regulatory Capital Calculations EN.pdf | 2026-03-25 | 26/03/2026 | 2026-03-26 | visible_accuracy | 2026-03-27 | -1.0 | db_visible_mismatch |
| OTHER | OTHER2026 | NOTEMCDEC 2026-03-26 GLO Amendments to  ongoing agreements regarding blending operations outside EU  and  EN.pdf | 2026-03-24 | 25/03/2026 | 2026-03-25 | visible_accuracy | 2026-03-26 | -1.0 | db_visible_mismatch |
| OTHER | OTHER2026 | NOTEMCDEC 2026-03-26 SG EIB Group OP results - end February 2026 EN.pdf | 2026-03-24 | 25/03/2026 | 2026-03-25 | visible_accuracy | 2026-03-26 | -1.0 | db_visible_mismatch |
| OTHER | OTHER2026 | NOTEMCINFO 2026-03-25 PJ OPS GLO Climate Bank Roadmap Phase 2 Implementing Frameworks Planning   EN.pdf | 2026-03-23 | 24/03/2026 | 2026-03-24 | visible_accuracy | 2026-03-25 | -1.0 | db_visible_mismatch |
| OTHER | OTHER2026 | NOTEMCDEC 2026-03-23 SG Final approval of No High-risk individual operations following InvestEU Investme EN.pdf | 2026-03-19 | 20/03/2026 | 2026-03-20 | visible_accuracy | 2026-03-23 | -1.0 | db_visible_mismatch |
| OTHER | OTHER2026 | NOTEMCDEC 2026-03-18 PMM 2018-0816 MACHINE VISION (PROPHESEE) Complete Exit Via Restructuring Under Judic EN.pdf | 2026-03-16 | 17/03/2026 | 2026-03-17 | visible_accuracy | 2026-03-18 | -1.0 | db_visible_mismatch |
| OTHER | OTHER2026 | 17 - NOTEMCDEC 2026-03-18 OPS PMM FTTH non-recourse projects status and lessons learned - approval of selection cr EN.pdf | 2026-03-16 | 17/03/2026 | 2026-03-17 | visible_accuracy | 2026-03-18 | -1.0 | db_visible_mismatch |
| OTHER | OTHER2026 | NOTEMCDEC 2026-03-17 PJ Procedural Framework between the European Investment Bank- the Council of Europe EN.pdf | 2026-03-15 | 16/03/2026 | 2026-03-16 | visible_accuracy | 2026-03-17 | -1.0 | db_visible_mismatch |

## Recommended Next Dashboard Changes

1. Add a `Corrected date basis` toggle: database date vs visible-header-corrected date.
2. Add a month-level audit overlay that flags day/month swaps and missing visible dates.
3. Separate `opinion count` trend from `word count` trend, because the streamlining story is stronger for service-section count than for total words.
4. Keep page-count trend next to word-count trend; OTHER shows the clearest page compression, while AFS moves the other way.
5. Add an author/service-office reliability note on GNG because the missing-author rate makes author conclusions fragile.
