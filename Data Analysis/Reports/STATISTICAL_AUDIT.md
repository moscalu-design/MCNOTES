# Statistical Audit

Generated: 2026-06-01 08:31

## 2025 vs 2026YTD Tests

The table below uses bootstrap confidence intervals for the median difference and a permutation test for the two-sided median difference. Positive difference means 2026YTD is higher than 2025.

| Template | Metric | n_2025 | n_2026 | median_2025 | median_2026 | median_diff_2026_minus_2025 | bootstrap_ci_low | bootstrap_ci_high | permutation_p_two_sided |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| AFS | Page count before opinion | 518 | 107 | 14.0 | 17.0 | 3.0 | 2.0 | 3.0 | 0.0003332222592469177 |
| AFS | Text Before Opinions | 518 | 107 | 5808.0 | 6629.0 | 821.0 | 293.0 | 1428.0 | 0.0006664445184938354 |
| AFS | Words Per Pre Opinion Page | 518 | 107 | 410.97569444444446 | 387.6 | -23.375694444444434 | -34.31726973684211 | -10.492612522281702 | 0.0016661112962345886 |
| GNG | Text Before Opinions | 423 | 168 | 1489.0 | 1591.5 | 102.5 | 12.0 | 157.01250000000005 | 0.04298567144285238 |
| GNG | Words Per Page | 423 | 168 | 214.88888888888889 | 230.5 | 15.611111111111114 | 6.616071428571416 | 25.750089285714285 | 0.0023325558147284237 |
| GNG | Words Per Pre Opinion Page | 423 | 168 | 430.4 | 460.3333333333333 | 29.933333333333337 | 11.625 | 47.334166666666704 | 0.0026657780739753416 |
| OTHER | Document Page Count | 689 | 234 | 16.0 | 12.5 | -3.5 | -6.0 | -1.5 | 0.02165944685104965 |
| OTHER | Words Per Page | 689 | 234 | 75.0 | 96.8989898989899 | 21.898989898989896 | 3.2814607352107417 | 37.78652597402597 | 0.013328890369876709 |

## Biggest Month-To-Month Drops

These are not causal tests; they are flags for points in time worth checking against template/process changes.

| Template | Metric | Month | documents | value | month_delta |
| --- | --- | --- | --- | --- | --- |
| AFS | median_pages | 2025-06 | 64 | 27.0 | -12.5 |
| AFS | median_pages | 2024-11 | 57 | 27.0 | -8.0 |
| AFS | median_pages | 2023-06 | 62 | 28.5 | -7.5 |
| AFS | median_service_opinions | 2022-10 | 1 | 5.0 | -1.0 |
| AFS | median_service_opinions | 2024-08 | 10 | 5.0 | -1.0 |
| AFS | median_service_opinions | 2023-01 | 6 | 6.0 | 0.0 |
| AFS | median_words | 2022-12 | 11 | 3552.0 | -1130.5 |
| AFS | median_words | 2024-05 | 35 | 4780.0 | -1063.0 |
| AFS | median_words | 2023-05 | 23 | 4396.0 | -915.5 |
| GNG | median_pages | 2024-03 | 42 | 7.0 | -1.5 |
| GNG | median_pages | 2024-10 | 41 | 7.0 | -1.0 |
| GNG | median_pages | 2025-05 | 33 | 7.0 | -1.0 |
| GNG | median_service_opinions | 2025-07 | 43 | 4.0 | -1.0 |
| GNG | median_service_opinions | 2024-03 | 42 | 5.0 | 0.0 |
| GNG | median_service_opinions | 2024-05 | 38 | 5.0 | 0.0 |
| GNG | median_words | 2025-05 | 33 | 1621.0 | -272.0 |
| GNG | median_words | 2024-11 | 20 | 1390.5 | -238.5 |
| GNG | median_words | 2024-10 | 41 | 1629.0 | -204.0 |
| OTHER | median_pages | 2023-01 | 49 | 17.0 | -8.0 |
| OTHER | median_pages | 2023-02 | 64 | 11.0 | -6.0 |
| OTHER | median_pages | 2024-08 | 33 | 12.0 | -6.0 |
| OTHER | median_service_opinions | 2023-01 | 49 | 0.0 | -1.5 |
| OTHER | median_service_opinions | 2024-01 | 50 | 0.0 | -1.5 |
| OTHER | median_service_opinions | 2023-10 | 95 | 0.0 | -1.0 |
| OTHER | median_words | 2025-01 | 42 | 755.5 | -974.5 |
| OTHER | median_words | 2025-08 | 22 | 407.5 | -949.5 |
| OTHER | median_words | 2023-10 | 95 | 875.0 | -793.0 |
| PIN | median_pages | 2023-07 | 52 | 9.0 | -1.0 |
| PIN | median_pages | 2023-06 | 35 | 10.0 | -1.0 |
| PIN | median_pages | 2023-11 | 23 | 9.0 | -1.0 |

## Author / Service-Office Effects

Largest positive differences from the template median:

| Template | Author | documents | median_words | template_median_words | median_words_vs_template | median_pages |
| --- | --- | --- | --- | --- | --- | --- |
| AFS | OPS/EGPF/1-CLEANTECH/-/- | 31 | 8564.0 | 5449.0 | 3115.0 | 33.0 |
| OTHER | OPS/EGPF/5-PF EAST | 9 | 4183.0 | 1078.0 | 3105.0 | 17.0 |
| AFS | OPS/EGPF/2-DTLS/LSB/- | 21 | 8375.0 | 5449.0 | 2926.0 | 31.0 |
| AFS | OPS/EGPF/4-PF WEST/IBMA/- | 10 | 8003.0 | 5449.0 | 2554.0 | 54.0 |
| PIN | PIN/GLO/EQMF | 11 | 4028.0 | 1873.0 | 2155.0 | 15.0 |
| OTHER | GLO/CFGA/PF/-/- | 8 | 3172.0 | 1078.0 | 2094.0 | 68.5 |
| OTHER | PMM/TM/EGC/-/- | 17 | 3115.0 | 1078.0 | 2037.0 | 13.0 |
| OTHER | GLO/PFI/COPAR/-/- | 16 | 3010.0 | 1078.0 | 1932.0 | 47.0 |
| OTHER | OPS/BSNE/3-PUB | 8 | 2886.0 | 1078.0 | 1808.0 | 26.0 |
| OTHER | PMM/TM/RR/RRPF/- | 8 | 2869.0 | 1078.0 | 1791.0 | 29.0 |
| AFS | OPS/CORP/3-WE/-/- | 25 | 7227.0 | 5449.0 | 1778.0 | 48.0 |
| AFS | OPS/EGPF/2-DTLS/-/- | 10 | 7215.5 | 5449.0 | 1766.5 | 29.0 |

Largest negative differences from the template median:

| Template | Author | documents | median_words | template_median_words | median_words_vs_template | median_pages |
| --- | --- | --- | --- | --- | --- | --- |
| AFS | OPS/PS/2-IBERIA | 10 | 1045.0 | 5449.0 | -4404.0 | 5.0 |
| AFS | OPS/IBERIA-1 PUB | 13 | 1077.0 | 5449.0 | -4372.0 | 5.0 |
| AFS | OPS/CSEE-3 PUB | 16 | 2567.0 | 5449.0 | -2882.0 | 33.0 |
| AFS | GLO/ELAN/EAST- | 9 | 2866.0 | 5449.0 | -2583.0 | 52.0 |
| AFS | OPS/BSNE-3 PUB | 12 | 2928.5 | 5449.0 | -2520.5 | 34.0 |
| AFS | OPS/WE-3 PUB | 11 | 3297.0 | 5449.0 | -2152.0 | 42.0 |
| AFS | GLO/ELAN/FIN-INC | 19 | 3353.0 | 5449.0 | -2096.0 | 35.0 |
| AFS | OPS/IBERIA-2 | 14 | 3705.5 | 5449.0 | -1743.5 | 46.5 |
| AFS | GLO/IP/SSA | 9 | 3755.0 | 5449.0 | -1694.0 | 47.0 |
| AFS | OPS/BSNE-2 CORP | 22 | 3788.0 | 5449.0 | -1661.0 | 43.0 |
| AFS | GLO/CFGA/CORP | 8 | 3968.0 | 5449.0 | -1481.0 | 46.5 |
| AFS | OPS/WE/3-PUB | 22 | 4181.5 | 5449.0 | -1267.5 | 22.0 |

## Readout

- AFS 2026YTD is statistically longer than 2025 on Text Before Opinions and pre-opinion pages.
- GNG 2026YTD has a median service-section drop from 5 to 4; because the variable is integer/tie-heavy, the permutation test is weak even though the dashboard-level direction is clear.
- OTHER 2026YTD is significantly shorter by document pages; its total word median is lower but the bootstrap interval crosses zero, so the stronger statement is page compression rather than confirmed word-count compression.
- Author/service-office effects are large enough to explain some apparent trend movement; use author filters before attributing every shift to template redesign.
