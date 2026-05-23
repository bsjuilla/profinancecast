# CISO RLS Audit — pre-launch security review

**Trigger:** W24 GDPR waitlist needs a new Supabase table holding email PII. Before that table goes live, document the RLS posture across the existing Supabase schema so we don't ship a new table on top of an unaudited foundation.

**Scope:** every `public.*` table reachable by the `anon` and `authenticated` roles.

**This doc is the audit CHECKLIST.** The founder runs the SQL against the live Supabase to fill in the findings column. I (Claude) can't query the live database from here.

---

## Threat model in one paragraph

The Supabase project hosts user PII (email, hashed identifiers, possibly forecast data) and the new waitlist (email + use-case + consent timestamp). The threat we're guarding against is **a non-authenticated request reading another user's data** — either directly via Supabase's REST API (which auto-exposes every table to the `anon` role unless RLS denies it) or via a misconfigured RLS policy that lets `authenticated` users SELECT rows they don't own. The defence is two-layered: (1) explicit RLS policies on every table, default-deny; (2) all writes from our API endpoints go through the **service-role key** which bypasses RLS by design.

## The audit checklist (run in Supabase SQL Editor)

### Step 1 — Enumerate all public tables

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
order by table_name;
```

Expected output: a list of every table. Compare against the table below. **Flag any table not in the list — undocumented tables are the highest risk.**

| Expected table | Purpose | RLS status |
|---|---|---|
| `newsletter_signups` | Blog newsletter (existing, see `api/newsletter/subscribe.js`) | **AUDIT** |
| `forecasts` (if used) | Saved forecast snapshots (see `api/forecast/save.js`) | **AUDIT** |
| `paypal_orders` (if used) | PayPal transaction records (see `api/paypal/capture-order.js`) | **AUDIT** |
| `subscriptions` (if used) | Pro/Premium plan state (see `api/subscription/*.js`) | **AUDIT** |
| `waitlist` (NEW) | W24 launch waitlist | **WILL BE ADDED** (this PR) |

### Step 2 — RLS status per table

For each table found in Step 1, run:

```sql
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
order by tablename;
```

`rowsecurity = false` on ANY table holding user data is a **P0 finding**. RLS must be enabled. The fix:

```sql
alter table public.<table_name> enable row level security;
```

### Step 3 — List policies per table

```sql
select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
```

For each table, document:
- Which roles can SELECT
- Which roles can INSERT
- Which roles can UPDATE / DELETE
- The `qual` (USING clause) controlling row visibility
- The `with_check` clause controlling row writes

### Step 4 — Test the anon role explicitly

For every table that should NOT be readable by anon (i.e. all PII tables), test:

```sql
-- Switch to anon role
set role anon;
-- Try to read
select * from public.<table_name> limit 5;
-- Reset
reset role;
```

Expected for PII tables: **0 rows returned** (RLS denies). If rows return, the table is leaking.

### Step 5 — Test the authenticated role with cross-user fetch

For tables that store per-user data (forecasts, subscriptions), test:

```sql
-- Simulate user A trying to read user B's row
set local role authenticated;
set local request.jwt.claims to '{"sub":"<user-A-uuid>"}';
select * from public.<table> where owner_id = '<user-B-uuid>';
reset role;
```

Expected: **0 rows**. If user A can see user B's row, the policy is wrong.

---

## Recommended policies (template — adapt per table)

### Pattern A: per-user-owned data (forecasts, subscriptions)

```sql
alter table public.<table> enable row level security;

-- Users can SELECT only their own rows
create policy "own_select" on public.<table>
  for select to authenticated
  using (owner_id = auth.uid());

-- Users can INSERT only with their own uid as owner
create policy "own_insert" on public.<table>
  for insert to authenticated
  with check (owner_id = auth.uid());

-- Users can UPDATE only their own rows
create policy "own_update" on public.<table>
  for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- Users can DELETE only their own rows
create policy "own_delete" on public.<table>
  for delete to authenticated
  using (owner_id = auth.uid());
```

### Pattern B: write-only public form (newsletter, waitlist)

```sql
alter table public.<table> enable row level security;

-- No anon SELECT (already default-deny)
-- No anon INSERT — all writes go through service-role key in API endpoint
-- (See api/newsletter/subscribe.js, api/waitlist/subscribe.js)

-- Explicitly revoke any inherited grants
revoke all on public.<table> from anon;
revoke all on public.<table> from authenticated;
```

This is the pattern the new `waitlist` table uses (see `docs/supabase/migrations/2026-05-22-waitlist.sql`).

### Pattern C: read-only public counter (founders-claimed count)

```sql
alter table public.<table> enable row level security;

-- Anon can read the AGGREGATE only via a view, not the raw table
create policy "anon_count_only" on public.<table>
  for select to anon
  using (false); -- deny direct reads

-- Expose a view that only returns count
create or replace view public.founders_claimed_count_v as
  select count(*) as claimed from public.<table>;
grant select on public.founders_claimed_count_v to anon;
```

---

## Day-14 deletion drill SOP

**Trigger:** GDPR Right to Erasure. User emails `privacy@profinancecast.com` requesting deletion of their data.

**Steps (founder):**

1. **Acknowledge within 72 hours.** Reply with: *"Your deletion request was received on YYYY-MM-DD. We will complete it within 14 days and confirm by email."*

2. **Identify all data tied to the user's email.** Run in Supabase SQL Editor (substitute the email):

   ```sql
   select 'waitlist' as t, count(*) from public.waitlist where lower(email) = lower('user@example.com')
   union all
   select 'newsletter_signups', count(*) from public.newsletter_signups where lower(email) = lower('user@example.com')
   union all
   select 'auth.users', count(*) from auth.users where lower(email) = lower('user@example.com');
   ```

3. **Delete from each table where count > 0.** For each:

   ```sql
   delete from public.waitlist where lower(email) = lower('user@example.com');
   delete from public.newsletter_signups where lower(email) = lower('user@example.com');
   -- For auth.users, use Supabase Admin → Authentication → Users → ... → Delete
   ```

4. **Verify deletion.** Re-run the count query from step 2. All counts should be 0.

5. **Email confirmation to the user.** *"Your data has been deleted from ProFinanceCast as of YYYY-MM-DD. The email service receipt is attached. We retain no copies."*

6. **Log the request.** Add to `docs/runbooks/gdpr-deletions.md` (create the file if it doesn't exist) with: date, hashed email (sha256), tables deleted from. We keep the LOG to demonstrate compliance, NOT the user's email.

**SLA:** 14 days end-to-end. EU GDPR allows 30 days. We commit to 14 to stay well under.

---

## Audit findings (founder fills in)

Run the queries above. Fill this section in:

```
Step 1 — tables found in public schema:
[ ] newsletter_signups
[ ] forecasts
[ ] paypal_orders
[ ] subscriptions
[ ] waitlist  (after running the new migration)
[ ] OTHER (list any undocumented tables here)

Step 2 — RLS enabled?
[ ] newsletter_signups: YES / NO
[ ] forecasts: YES / NO
[ ] paypal_orders: YES / NO
[ ] subscriptions: YES / NO
[ ] waitlist: YES (set by migration)

Step 3 — policies per table:
[Paste pg_policies output here]

Step 4 — anon-can-read test result:
[List any tables where anon SELECT returned > 0 rows — these are P0]

Step 5 — cross-user-fetch test result:
[List any tables where authenticated user A could SELECT user B's rows — these are P0]
```

---

## Sign-off

Once the audit is complete and any P0 findings are fixed:

- [ ] Founder confirms all `public.*` tables have RLS enabled
- [ ] Founder confirms no anon-readable PII
- [ ] Founder confirms no cross-user reads possible
- [ ] Day-14 deletion SOP tested with a synthetic email (insert → delete → verify)
- [ ] `docs/runbooks/gdpr-deletions.md` exists and is ready to log requests

**After all 5 boxes are ticked, run `docs/supabase/migrations/2026-05-22-waitlist.sql` to create the waitlist table.** Then deploy the W24 commit that adds `api/waitlist/subscribe.js` + `waitlist.html`.

**If any P0 finding emerges, DO NOT deploy W24 until it's fixed.** The new waitlist table is RLS-protected by design but a leaking adjacent table would be the bigger problem.
