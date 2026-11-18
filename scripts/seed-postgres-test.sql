BEGIN;

CREATE TABLE IF NOT EXISTS public.orders (
  order_id BIGSERIAL PRIMARY KEY,
  order_date DATE NOT NULL,
  month TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  category TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  region TEXT NOT NULL,
  channel TEXT NOT NULL
);

TRUNCATE TABLE public.orders RESTART IDENTITY;

INSERT INTO public.orders (
  order_date,
  month,
  customer_name,
  category,
  amount,
  region,
  channel
)
SELECT
  d::date AS order_date,
  to_char(d, 'Mon') AS month,
  'Customer ' || lpad((((n - 1) % 30) + 1)::text, 2, '0') AS customer_name,
  (ARRAY['Electronics', 'Furniture', 'Fashion', 'Food'])[((n - 1) % 4) + 1] AS category,
  round(
    (
      120
      + (((n - 1) % 4) * 45)
      + (extract(day FROM d) * 2.8)
      + (extract(month FROM d) * 6.1)
      + (((n - 1) % 7) * 11.5)
    )::numeric,
    2
  ) AS amount,
  (ARRAY['North', 'South', 'East', 'West'])[((n - 1) % 4) + 1] AS region,
  (ARRAY['Online', 'Retail', 'Partner'])[((n - 1) % 3) + 1] AS channel
FROM (
  SELECT
    d,
    row_number() OVER (ORDER BY d, rep) AS n
  FROM generate_series('2026-01-01'::date, '2026-06-30'::date, '1 day') AS d
  CROSS JOIN generate_series(1, 8) AS rep
) AS src;

COMMIT;
