# WealthEffect

An investment growth calculator built around a line chart, with a personal tracker that overlays your real balances on the projection.

No build step: open `index.html` in a browser, or serve the folder (`python3 -m http.server`) / host it on GitHub Pages.

## Features

- **Line chart front and center**: projected balance, total deposits, and a 10th–90th percentile risk band from 500 simulated markets (lognormal monthly returns, seeded so it doesn't flicker).
- **Tracker overlay**: log dated account balances; they plot as points on the chart, with "ahead/behind plan" per entry and a re-projection from your latest balance. Stored in your browser (localStorage). CSV import/export.
- **Asset-class presets**: high-yield savings, CDs, T-bills, 10-yr Treasuries, total bond fund, corporate bonds, U.S. stocks, international stocks, growth stocks, or custom. Each sets an expected return, volatility and compounding.
- **Portfolio mix**: stocks / bonds / cash sliders that blend return and volatility (assumes 0.1 stock–bond correlation).
- **Compare assets**: draws the same plan under every other preset.
- **Fees, taxes and inflation**: expense ratio, tax on growth (for taxable accounts), and a "today's dollars" view.
- Contribution timing (start/end), monthly or yearly deposits, annual contribution raises, compounding annually → continuously.
- Annual/monthly accumulation schedule with CSV export.

## Math

Each compounding choice is converted to an equivalent monthly rate, `(1 + r/n)^(n/12) − 1` (continuous: `e^(r/12) − 1`), and the balance is stepped monthly. With $20,000 start, $1,500/month at end of month, 30% compounded annually for 25 years, it gives $61,929,502.82, the same as calculator.net's investment calculator.

Net return = gross return × (1 − tax on growth) − annual fee.

## Default assumptions (editable)

| Preset | Return | Volatility | Basis |
|---|---|---|---|
| High-yield savings | 4.0% | 0% | Top online banks ~4.2–4.4% APY in 2026; FDIC national average ~0.38% |
| CD | 4.0% | 0% | Snapshot; locked for term |
| Treasury bills | 3.3% | 1% | ~1928–present average (NYU Stern, Damodaran dataset) |
| 10-yr Treasuries | 4.5% | 7.5% | ~1928–present average (Damodaran) |
| Total bond fund | 4.5% | 5.5% | Approximate assumption |
| Corporate bonds | 5.5% | 8% | Approximate assumption |
| U.S. stock index | 10% | 16% | S&P 500 ~10% compound since 1928 (Damodaran) |
| International stocks | 7% | 17% | Approximate assumption |
| Growth / tech stocks | 11% | 24% | Approximate assumption |

Sources: Aswath Damodaran, "Historical Returns on Stocks, Bonds and Bills", NYU Stern (pages.stern.nyu.edu/~adamodar); FDIC National Rates and Rate Caps (fdic.gov). Savings rates change often, so check your bank's current APY.

Projections are estimates, not financial advice.
