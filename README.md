# Wealth Effect

A one-page dashboard for planning, investing and tracking net worth over decades. It's multi-user: each person signs in and their plan is stored privately in the cloud.

## Modules

| # | Panel | What it does |
|---|---|---|
| 00 | Summary strip | Net worth, day change, target-path variance, on-track probability, 3M T-bill, CPI, percentile |
| 01 | Cash flow | Take-home pay, expenses, monthly investment, savings rate, annual increase |
| 02 | Allocation | Target vs actual by asset class, drift flags, blended expected return and volatility |
| 03 | Holdings | Live-priced positions derived from the transaction log |
| 04 | Projection | Investment calculator (solve for end amount, contribution, rate, start, length) plus a 5,000-path Monte Carlo range and goal probability |
| 05 | Performance | Actual vs fixed target path, contributions vs market gains, money-weighted return vs S&P 500 on the same cash flows |
| 06 | Income | Monthly income at the risk-free rate and under the 4% rule: today, at goal, at a chosen age |
| 07 | Standing | Net worth percentile by age (Fed SCF 2025), tier thresholds, year to next tier, freedom number |

## Stack

- Vite, React and TypeScript, with Recharts and Zustand
- Supabase: auth (magic link and Google), Postgres with row-level security on every table, and the Edge Function `api`
- Market data is fetched server-side and cached in shared tables:
  - Finnhub for quotes (15-minute cache during market hours)
  - FRED for DTB3 and CPI
  - Alpha Vantage for SPY monthly adjusted closes

## Data sources

- **Returns and volatility defaults:** Damodaran, *Historical Returns on Stocks, Bonds and Bills 1928–2025* (NYU Stern); see `src/data/assumptions.ts`.
- **Net worth percentiles:** computed from the Federal Reserve **SCF 2025** public summary extract (weighted, by age). Medians match the Fed's published Table 4 to within 0.3%. See `src/data/scf2025.ts`.

## Develop

```bash
npm install
npm run dev
npm test
```

Append `?demo` to the URL, or click **Explore with sample data**, to use the app without an account.

## Production setup checklist

1. **Edge Function secrets** (Supabase → Project Settings → Edge Functions → Secrets): `FINNHUB_API_KEY`, `ALPHAVANTAGE_API_KEY`, `FRED_API_KEY`. The app runs without them; prices then fall back to manual or last-trade values, and the risk-free rate falls back to its long-run average.
2. **Auth URLs** (Supabase → Authentication → URL Configuration): set the Site URL to the deployed domain and add it to the Redirect URLs.
3. **Google sign-in** (optional): enable the Google provider in Supabase Auth with an OAuth client ID and secret.
4. **Email**: the default Supabase mailer is heavily rate-limited, so configure custom SMTP before launch.
5. **Deploy**: import the repo into Vercel (`vercel.json` is included).
6. **Data licensing**: free API tiers are generally limited to personal, non-commercial use. Move to paid plans before a commercial launch; quotes sit behind one function (`supabase/functions/api`), so the provider can be swapped there.

Database schema: `supabase/migrations/20261109000000_init.sql`.

*For education and planning only. Not investment advice.*
