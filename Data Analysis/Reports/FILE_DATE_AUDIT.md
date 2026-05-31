# Deep File And Data Audit

Generated: 2026-05-29 19:14

## Scope

- Database rows audited: 5,629
- PDFs available for direct file audit: 554
- Database rows matched to an available PDF: 530
- Matched PDFs with an extracted or prior-audited visible validation date: 526
- Prior visible-accuracy samples reused: AFS 123, GNG 25, OTHER 253

The PDF audit covers the files physically present in the AFS, GNG, and OTHER package folders. PIN rows are still included in database-level trend checks, but no PIN PDFs were available in the package folders.

## Biggest Finding: 2026 Date Parsing Is Funky

The future-date warning is mostly a day/month parsing problem, not evidence that the documents are actually future opinions.

- Database rows with future validation dates: 52
- Future-dated rows that also had a matching PDF: 49
- Matched future rows confirmed as visible day/month swaps: 49
- Example pattern: visible `08/05/2026` means 8 May 2026, but the database stores `2026-08-05`.

Matched date-status breakdown:

| status | matched_rows |
| --- | --- |
| db_is_visible_day_month_swap | 72 |
| db_matches_visible | 449 |
| db_visible_mismatch | 5 |
| missing_db_date | 4 |

This matters for the monthly 2026 time series. The year-level OTHER total is less affected than the month-level charts, but the timeline position is materially wrong for many OTHER2026 rows.

- OTHER 2026 using database dates: 234 docs, median 1048 words, median 12.5 pages
- OTHER 2026 after visible-date correction where confirmed: 234 docs, median 1048 words, median 12.5 pages

OTHER 2026 monthly placement before and after visible-date correction:

| date_basis | month | documents | median_words | median_pages |
| --- | --- | --- | --- | --- |
| corrected_visible_dates | 2026-01 | 44 | 1004.5 | 12.0 |
| corrected_visible_dates | 2026-02 | 52 | 1020.5 | 10.5 |
| corrected_visible_dates | 2026-03 | 70 | 1293.5 | 14.0 |
| corrected_visible_dates | 2026-04 | 41 | 866.0 | 13.0 |
| corrected_visible_dates | 2026-05 | 24 | 1132.0 | 16.5 |
| corrected_visible_dates | 2026-06 | 1 | 607.0 | 27.0 |
| corrected_visible_dates | 2026-10 | 1 | 614.0 | 8.0 |
| corrected_visible_dates | 2026-12 | 1 | 772.0 | 13.0 |
| database_dates | 2026-01 | 35 | 817.0 | 11.0 |
| database_dates | 2026-02 | 36 | 970.5 | 11.0 |
| database_dates | 2026-03 | 55 | 1502.0 | 13.0 |
| database_dates | 2026-04 | 41 | 885.0 | 13.0 |
| database_dates | 2026-05 | 15 | 1032.0 | 19.0 |
| database_dates | 2026-06 | 10 | 1090.5 | 20.0 |
| database_dates | 2026-07 | 5 | 1076.0 | 12.0 |
| database_dates | 2026-08 | 7 | 1238.0 | 10.0 |
| database_dates | 2026-09 | 5 | 1223.0 | 19.0 |
| database_dates | 2026-10 | 9 | 829.0 | 11.0 |
| database_dates | 2026-11 | 8 | 830.5 | 13.0 |
| database_dates | 2026-12 | 8 | 741.5 | 13.0 |

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
| OTHER | OTHER2026 | 05.2 NOTEMCDEC 2026-02-03 PJ OPS Simplification of multi-beneficiary intermediated finance products EN.pdf | 2026-03-02 | 03/02/2026 | 2026-02-03 | visible_accuracy | 2026-02-03 | 27.0 | db_is_visible_day_month_swap |
| OTHER | OTHER2026 | NOTEMCDEC 2026-01-06 GLO Future Allocation of ACP IF Reflows and IRS Envelope EN.pdf | 2026-05-01 | 05/01/2026 | 2026-01-05 | visible_accuracy | 2026-01-06 | 116.0 | db_is_visible_day_month_swap |
| OTHER | OTHER2026 | NOTEMCDEC 2026-05-11 PMM 2014-0065 - ACCESSBANK AZERBAIJAN LOAN FOR SMES - Exit via Sale to Bank Respubli EN.pdf | 2026-08-05 | 08/05/2026 | 2026-05-08 | visible_accuracy | 2026-05-11 | 89.0 | db_is_visible_day_month_swap |
| OTHER | OTHER2026 | NOTEMCDEC 2026-01-07 OPS VILNIUS CITY SCHOOLS (2024-0612) - Final Loan Proposal FIPRO.pdf | 2026-07-01 | 07/01/2026 | 2026-01-07 | visible_accuracy | 2026-01-07 | 175.0 | db_is_visible_day_month_swap |
| OTHER | OTHER2026 | 16 - NOTEMCDEC 2026-05-06 GLO Next Steps in Supporting Ukraine_s Resilience- Recovery and EU Integration EN.pdf | 2026-06-05 | 06/05/2026 | 2026-05-06 | visible_accuracy | 2026-05-06 | 30.0 | db_is_visible_day_month_swap |
| OTHER | OTHER2026 | NOTEMCDEC 2026-02-06 GLO GLO PJ Just Transition and Just Resilience for Ukraine Programme Implementation EN.pdf | 2026-06-02 | 06/02/2026 | 2026-02-06 | visible_accuracy | 2026-02-06 | 116.0 | db_is_visible_day_month_swap |
| OTHER | OTHER2026 | 9.3 - NOTEMCDEC 2026-01-05 OPS DOBRUN AND SADOVA SOLAR (2025-0095) - Final Loan Proposal EN - Interrupted Tacit Note.pdf | 2026-05-01 | 05/01/2026 | 2026-01-05 | visible_accuracy | 2026-01-05 | 116.0 | db_is_visible_day_month_swap |
| OTHER | OTHER2026 | NOTEMCDEC 2026-01-05 OPS DOBRUN AND SADOVA SOLAR (2025-0095) - Final Loan Proposal EN.pdf | 2026-05-01 | 05/01/2026 | 2026-01-05 | visible_accuracy | 2026-01-05 | 116.0 | db_is_visible_day_month_swap |
| OTHER | OTHER2026 | 05 -  DECLASSIFIED NOTEMCDEC 2026-03-04 HR Internal Mobility and Recruitment EN.pdf | 2026-04-03 | 04/03/2026 | 2026-03-04 | visible_accuracy | 2026-03-04 | 30.0 | db_is_visible_day_month_swap |
| OTHER | OTHER2026 | NOTEMCDEC 2026-02-11 GLO Ukraine - UNDP Technical Assistance to the Substations Reliability Enhancement P EN.pdf | 2026-10-02 | 10/02/2026 | 2026-02-10 | visible_accuracy | 2026-02-11 | 234.0 | db_is_visible_day_month_swap |
| OTHER | OTHER2026 | NOTEMCDEC 2026-02-09 OPS IBERDROLA DISTRIBUTION NETWORKS GREEN LOAN (2023-0448) - Change to operation aft EN.pdf | 2026-06-02 | 06/02/2026 | 2026-02-06 | visible_accuracy | 2026-02-09 | 116.0 | db_is_visible_day_month_swap |
| OTHER | OTHER2026 | NOTEMCDEC 2026-03-12 OPS Inclusions under CaixaBank_s delinked risk sharing operations EN.pdf | 2026-12-03 | 12/03/2026 | 2026-03-12 | visible_accuracy | 2026-03-12 | 266.0 | db_is_visible_day_month_swap |
| OTHER | OTHER2026 | NOTEMCDEC 2026-03-11 OPS GREEN HYBRID BOND RED ELECTRICA GREEN FINANCE  FRAMEWORK- 2022-0197 EN.pdf | 2026-11-03 | 11/03/2026 | 2026-03-11 | visible_accuracy | 2026-03-11 | 237.0 | db_is_visible_day_month_swap |
| OTHER | OTHER2026 | 15 - NOTEMCDEC 2026-04-10 OPS OPS OPS Sixth amendment of the InvestEU guarantee agreement - final terms EN.pdf | 2026-10-04 | 10/04/2026 | 2026-04-10 | visible_accuracy | 2026-04-10 | 177.0 | db_is_visible_day_month_swap |
| OTHER | OTHER2026 | 04 - NOTEMCDEC 2026-05-04 GR_C-RM 2026 EIB Group RAF EN.pdf | 2026-04-05 | 04/05/2026 | 2026-05-04 | visible_accuracy | 2026-05-04 | -29.0 | db_is_visible_day_month_swap |
| OTHER | OTHER2026 | NOTEMCDEC 2026-04-10 SG GR_C-RM __EIB Group Sustainability Disclosures - financial year 2025  EN.pdf | 2026-10-04 | 10/04/2026 | 2026-04-10 | visible_accuracy | 2026-04-10 | 177.0 | db_is_visible_day_month_swap |
| OTHER | OTHER2026 | NOTEMCDEC 2026-02-13 OPS Change after Board approval 2023 0564 InvestEU Green Securitisation Lending Enve EN.pdf | 2026-12-02 | 12/02/2026 | 2026-02-12 | visible_accuracy | 2026-02-13 | 293.0 | db_is_visible_day_month_swap |
| OTHER | OTHER2026 | NOTEMCINFO 2026-03-05 FI H2 2025 Semi-annual report on Indemnities and Fees Waived or Not Charged by EIB EN.pdf | 2026-05-03 | 05/03/2026 | 2026-03-05 | visible_accuracy | 2026-03-05 | 59.0 | db_is_visible_day_month_swap |
| OTHER | OTHER2026 | 04.1 - NOTEMCDISC 2026-02-09 OPS Battery Booster Loan Facility - revised EC proposal EN.pdf | 2026-09-02 | 09/02/2026 | 2026-02-09 | visible_accuracy | 2026-02-09 | 205.0 | db_is_visible_day_month_swap |
| OTHER | OTHER2026 | NOTEMCDEC 2026-05-08 GLO Signature of a new Contribution Agreement and amendments under the EC Blending F EN.pdf | 2026-08-05 | 08/05/2026 | 2026-05-08 | visible_accuracy | 2026-05-08 | 89.0 | db_is_visible_day_month_swap |

## Recommended Next Dashboard Changes

1. Add a `Corrected date basis` toggle: database date vs visible-header-corrected date.
2. Add a month-level audit overlay that flags day/month swaps and missing visible dates.
3. Separate `opinion count` trend from `word count` trend, because the streamlining story is stronger for service-section count than for total words.
4. Keep page-count trend next to word-count trend; OTHER shows the clearest page compression, while AFS moves the other way.
5. Add an author/service-office reliability note on GNG because the missing-author rate makes author conclusions fragile.
