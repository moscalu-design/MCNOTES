# Deep Trend Notes

Analysis date: 2026-05-29  
Historical trend rows: 5,562  
Excluded from trend break analysis: 52 future-dated rows and 15 undated rows.

## Main Length Findings

- AFS is getting longer, not shorter, in the historical data. Median text-before-opinions words move from <=2023: 4,942.0; 2024: 5,241.0; 2025: 5,808.0; 2026YTD: 6,629.0. Median pre-opinion pages rise from <=2023: 11.0; 2024: 12.0; 2025: 14.0; 2026YTD: 17.0.
- GNG stays structurally short in page count, but its median words rise mildly: 2024: 1,424.0; 2025: 1,489.0; 2026YTD: 1,591.5. Median document pages remain around 7, while mean pages decline from 7.2 in 2024 to 6.7 in 2026YTD.
- OTHER is the clearest place where documents shorten in 2026YTD: median words are <=2023: 1,018.0; 2024: 1,143.0; 2025: 1,170.0; 2026YTD: 1,048.5, and median document pages fall from 16 in 2023-2025 to 12 in 2026YTD.
- PIN is stable across the available 2023-2024 window: median words are <=2023: 1,880.0; 2024: 1,898.0.

## Shortening Points

Largest three-month rolling median word-count drops with at least five documents in the month:

| Template Type | month | docs | median_words | rolling_3m_median_words | rolling_3m_delta_words | median_pages |
| --- | --- | --- | --- | --- | --- | --- |
| OTHER | 2025-08 | 25.0 | 409.0 | 952.5 | -307.0 | 15.0 |
| AFS | 2026-02 | 24.0 | 6,164.0 | 6,382.7 | -268.5 | 30.0 |
| AFS | 2025-01 | 28.0 | 5,206.5 | 5,262.2 | -237.8 | 26.0 |
| OTHER | 2025-03 | 51.0 | 971.0 | 1,006.3 | -234.7 | 15.0 |
| AFS | 2024-03 | 25.0 | 4,864.0 | 4,752.2 | -193.3 | 32.0 |
| PIN | 2023-08 | 15.0 | 1,781.0 | 1,850.8 | -192.7 | 10.0 |
| GNG | 2025-07 | 43.0 | 1,326.0 | 1,488.3 | -189.0 | 7.0 |
| AFS | 2024-11 | 57.0 | 5,227.0 | 5,460.0 | -186.0 | 27.0 |
| AFS | 2024-07 | 77.0 | 5,299.0 | 5,057.3 | -181.3 | 28.0 |
| OTHER | 2025-01 | 42.0 | 755.5 | 1,198.5 | -174.8 | 17.0 |
| AFS | 2023-10 | 70.0 | 4,916.0 | 4,975.2 | -153.7 | 31.0 |
| GNG | 2024-12 | 16.0 | 1,397.5 | 1,472.3 | -145.2 | 6.0 |
| OTHER | 2023-12 | 86.0 | 1,237.5 | 1,068.2 | -143.5 | 13.0 |
| PIN | 2023-09 | 42.0 | 1,693.5 | 1,729.7 | -121.2 | 10.0 |
| OTHER | 2026-01 | 35.0 | 817.0 | 1,140.0 | -117.8 | 11.0 |
| GNG | 2025-01 | 23.0 | 1,283.0 | 1,357.0 | -115.3 | 7.0 |
| OTHER | 2024-03 | 58.0 | 892.5 | 855.8 | -115.0 | 13.5 |
| PIN | 2023-07 | 52.0 | 1,714.5 | 2,043.5 | -103.2 | 9.0 |
| GNG | 2025-11 | 23.0 | 1,485.0 | 1,515.3 | -42.8 | 6.0 |
| GNG | 2025-09 | 21.0 | 1,424.0 | 1,454.5 | -31.3 | 7.0 |
| GNG | 2026-01 | 19.0 | 1,605.0 | 1,508.0 | -10.7 | 6.0 |
| PIN | 2023-11 | 23.0 | 1,758.0 | 1,807.2 | -7.7 | 9.0 |
| PIN | 2024-01 | 33.0 | 1,970.0 | 1,822.0 | 0.0 | 11.0 |
| PIN | 2023-12 | 28.0 | 1,738.0 | 1,822.0 | 14.8 | 10.0 |

Interpretation:

- OTHER has a sharp low point in August 2025, but that looks like a mix effect rather than a stable template redesign signal because it rebounds in September-November 2025.
- OTHER 2026YTD is more meaningful: lower median pages and lower median words suggest a real move toward shorter OTHER notes.
- GNG shows drops in July 2025 and around December 2024-January 2025, but the absolute length remains in a tight 1.3k-1.6k median-word band.
- AFS has no sustained shortening signal. The strongest pattern is lengthening through 2025 and 2026YTD.

## Service Opinion Findings

- Service-opinion count per document declines over time for AFS and GNG. AFS mean service sections fall from about 5.9 in 2023 to 5.0 in 2025-2026YTD. GNG falls from 5.0 in 2024 to 4.1 in 2026YTD.
- This is the best evidence of template streamlining in the database: even where total words do not fall, the number of service opinion sections per document falls.
- GNG has no SG service-opinion leakage in the current data. GNG positive service columns are PJ, RM, OCCO, JU, and ECON.

## Page Count Findings

- AFS total pages do not fall: median pages move from 28 <=2023 to 29 in 2024, 31 in 2025, and 30 in 2026YTD.
- GNG total pages are stable/slightly lower: median pages stay at 7, with mean pages falling from 7.2 to 6.7 by 2026YTD.
- OTHER total pages fall in 2026YTD: median pages drop from 16 in 2023-2025 to 12 in 2026YTD.
- AFS pre-opinion pages rise strongly despite fewer service sections, which suggests the surviving sections are longer or front matter grew.

## Author Findings

Author coverage is uneven:

- AFS missing author: 29 / 1,581
- GNG missing author: 745 / 931
- OTHER missing author: 33 / 2,526
- PIN missing author: 39 / 524

Top author/service-office groups with at least 10 records by median word count:

| Author | docs | templates | median_words | mean_words | median_pages | manual_rate_pct |
| --- | --- | --- | --- | --- | --- | --- |
| OPS/EGPF/2-DTLS/LSB/- | 21.0 | AFS | 8,375.0 | 8,155.6 | 31.0 | 0.0 |
| OPS/EGPF/1-CLEANTECH/-/- | 36.0 | AFS, OTHER, PIN | 8,248.0 | 7,384.0 | 32.0 | 2.8 |
| OPS/EGPF/2-DTLS/TECH/- | 23.0 | AFS | 7,033.0 | 6,777.9 | 28.0 | 0.0 |
| OPS/EGPF/2-DTLS/-/- | 14.0 | AFS, OTHER | 6,771.0 | 5,667.3 | 28.5 | 0.0 |
| OPS/CORP/3-WE/-/- | 28.0 | AFS, OTHER | 6,737.0 | 6,756.7 | 46.5 | 7.1 |
| OPS/CORP/2-IBERIA/-/- | 18.0 | AFS, OTHER | 6,555.0 | 6,370.6 | 35.0 | 5.6 |
| OPS/EGPF/2-EGILS/SI/- | 10.0 | AFS, PIN | 6,489.5 | 6,296.2 | 25.5 | 0.0 |
| GLO/ELAN/WB&T/-/- | 24.0 | AFS, OTHER, PIN | 6,312.5 | 5,777.1 | 39.5 | 0.0 |
| OPS/EGPF/1-EGCI/-/- | 11.0 | AFS, OTHER, PIN | 6,303.0 | 6,089.9 | 28.0 | 9.1 |
| OPS/CORP/6-CSEE/-/- | 10.0 | AFS, OTHER | 5,992.0 | 5,113.8 | 32.5 | 20.0 |
| OPS/PS/4-MA&M/-/- | 29.0 | AFS, OTHER | 5,924.0 | 5,870.2 | 31.0 | 10.3 |
| OPS/CORP/5-BSNE/-/- | 31.0 | AFS, OTHER | 5,843.0 | 5,483.8 | 28.0 | 9.7 |

Shortest author/service-office groups with at least 10 records:

| Author | docs | templates | median_words | mean_words | median_pages | manual_rate_pct |
| --- | --- | --- | --- | --- | --- | --- |
| FC/FRA/FRD/-/- | 22.0 | OTHER | 170.5 | 407.6 | 13.0 | 4.5 |
| SG/GB/GBS/-/- | 16.0 | OTHER | 192.0 | 233.2 | 6.0 | 0.0 |
| GR&C-RM/GFIN | 20.0 | OTHER | 193.0 | 330.0 | 19.0 | 0.0 |
| FC/FRA/FRD | 14.0 | OTHER | 203.5 | 358.9 | 17.0 | 14.3 |
| PJ/SQM/CARES/-/- | 29.0 | OTHER | 225.0 | 224.4 | 3.0 | 0.0 |
| CFC/FRA/-/-/- | 26.0 | OTHER | 229.0 | 460.9 | 7.5 | 0.0 |
| GR&C-RM/GFIN/-/-/- | 138.0 | OTHER | 229.0 | 254.1 | 21.0 | 1.4 |
| FI/CAP/NOCOST/-/- | 83.0 | OTHER | 246.0 | 276.0 | 2.0 | 0.0 |
| FI/SPBS/OSM/-/- | 11.0 | OTHER | 278.0 | 253.3 | 4.0 | 0.0 |
| CFC/FRA/BRD/-/- | 10.0 | OTHER | 307.5 | 368.1 | 18.0 | 0.0 |
| FI/CAP | 23.0 | OTHER | 317.0 | 377.9 | 2.0 | 0.0 |
| FI/CAP/FIMA/-/- | 10.0 | OTHER | 349.5 | 382.5 | 2.0 | 0.0 |

Interpretation:

- Author is really a service-office code in this workbook, so it is partly measuring business area and product mix rather than individual writing style.
- The longest groups are mainly OPS/EGPF and OPS/CORP AFS-heavy groups.
- The shortest groups are mainly OTHER-note groups such as FI/CAP, GR&C-RM/GFIN, FC/FRA, SG/GB, PJ/SQM.
- Because 80% of GNG rows have missing author, author analysis is reliable for AFS/OTHER/PIN but weak for GNG.

## Exported Deep-Dive Files

- `deep_period_trends.csv`
- `deep_monthly_trends.csv`
- `deep_shortening_points.csv`
- `deep_service_opinion_trends.csv`
- `deep_author_trends.csv`
- `deep_author_template_trends.csv`
