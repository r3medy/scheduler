# Next.js template

This is a Next.js template with shadcn/ui.

## Adding components

To add components to your app, run the following command:

```bash
npx shadcn@latest add button
```

This will place the ui components in the `components` directory.

## Using components

To use the components in your app, import them as follows:

```tsx
import { Button } from "@/components/ui/button";
```

## Authentication setup

The `/login` and `/register` routes use Supabase Auth with a synthetic email
mapping for the approved Company ID and six-digit PIN experience. Configure the
required server variables and apply the rate-limit migration before testing
authentication. See [`docs/auth-configuration.md`](docs/auth-configuration.md)
for the complete setup and safety requirements.

## Calendar database setup

Apply [`supabase/migrations/20260905000000_callbacks.sql`](supabase/migrations/20260905000000_callbacks.sql)
in the configured Supabase project's SQL Editor before loading the calendar.
It creates the callback table, schedule constraints, indexes, and owner-only
row-level security policies. It does not insert sample data.

If the main page shows `Calendar unavailable` and Supabase returns `PGRST205`
for `public.callbacks`, this migration has not been applied. Run the migration
and reload the page; a new account should see an empty calendar. The public
API key and service-role key cannot apply SQL migrations through the Data API.
