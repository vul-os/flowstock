# Screenshots

All PNGs in `docs/screenshots/` (and `docs/screenshots/dark/`) are generated —
never hand-cropped — by the screenshotter, which drives the app's built-in
**demo mode** (a seeded, deterministic dataset) in headless Chromium at
1440×900.

## Regenerating

```bash
npx playwright install chromium     # one-time
npm run screenshots                 # light theme → docs/screenshots/
FLOWSTOCK_THEME=dark npm run screenshots   # dark theme → docs/screenshots/dark/
```

The script starts a Vite dev server automatically (or reuses one already
running at `BASE_URL`, default `http://localhost:5173`). No Go backend and no
credentials are needed — served by Vite on port 5173, the UI boots against the
in-browser demo driver.

## Captured views

| File | View |
|---|---|
| `hero.png` | Dashboard |
| `products.png` | Product catalog |
| `stock.png` | Stock on hand per branch + movement ledger |
| `orders.png` | Customer orders |
| `purchase_orders.png` | Purchase orders / goods receiving |
| `partners.png` | Customers & suppliers |
| `creditors_debtors.png` | Balances & payments |
| `report_sales.png` | Sales report |
| `report_valuation.png` | Inventory valuation report |
| `settings.png` | Settings — decentralized branch sync |
