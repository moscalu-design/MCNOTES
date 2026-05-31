# MC Notes Interactive Dashboard

Run this from the `Data Analysis` folder:

```powershell
py -m http.server 8765 --bind 127.0.0.1
```

Then open:

```text
http://127.0.0.1:8765/index.html
```

The dashboard reads `dashboard_data.json`, which is generated from the `Database` tab analysis exports. If the workbook analysis is regenerated, run:

```powershell
py prepare_dashboard_data.py
```

Dashboard files:

- `index.html`
- `styles.css`
- `app.js`
- `dashboard_data.json`
- `dashboard_tests.json`
- `dashboard_tests_summary.csv`
- `dashboard_tests_detail.csv`
- `dashboard_screenshot.png`

The dashboard includes a `Tests` view. One important built-in check verifies that GNG records have no positive words in non-GNG department columns such as `SG`.

The `Services` view treats a service opinion as a positive word count in a service column. It shows template-by-service opinion trends by month, six-month momentum, service mix, and a drilldown table.

The `Authors` view profiles author/service-office groups by median words, pages, service sections, and missing-author coverage. Deep statistical notes are saved in `DEEP_INSIGHTS.md`.
