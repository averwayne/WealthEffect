create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

-- Warm the shared market-data cache (T-bill, CPI, SPY) every day at 22:17 UTC, after US market close.
select cron.schedule(
  'refresh-market-data',
  '17 22 * * *',
  $$select net.http_post(
      url := 'https://iukhgbbcujfbodnqwbzi.supabase.co/functions/v1/api',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := '{"action": "macro"}'::jsonb
    )$$
);
