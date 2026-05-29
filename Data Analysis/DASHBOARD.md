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
- `dashboard_screenshot.png`
