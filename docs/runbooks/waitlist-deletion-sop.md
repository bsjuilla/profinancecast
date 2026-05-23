# Waitlist GDPR Deletion SOP

**Scope:** every email address in `public.waitlist`. Also covers `public.newsletter_signups` since the user might have signed up for both with the same email.

**SLA:** 14 days end-to-end from request received to confirmation sent. EU GDPR allows 30; we commit to 14 to stay well under.

## When this runs

1. **On-demand:** user emails `privacy@profinancecast.com` (or any contact route) saying "delete my data".
2. **Routine sweep:** quarterly, delete waitlist entries where `unsubscribed_at >= 14 days ago`. Hard-delete vs soft-delete distinction below.

## Soft-delete vs hard-delete

When a user clicks the unsubscribe link in our welcome email (W24 follow-up — TODO), we set `unsubscribed_at = now()`. The row STAYS in the table. Reason: it's the only durable record we can use to refuse re-adding the same email to the list.

After 14 days, the row is eligible for **hard delete**. The unsubscribe intent has been honored; we no longer need the row.

Quarterly query:

```sql
delete from public.waitlist
where unsubscribed_at is not null
  and unsubscribed_at < (now() - interval '14 days');
```

Log the count deleted to `docs/runbooks/gdpr-deletions.md` (create if missing).

## On-demand deletion (user-initiated)

Run this when a user emails asking for full deletion. Replace `user@example.com`.

### Step 1 — Acknowledge

Reply within 72 hours:

> Subject: Your ProFinanceCast deletion request
>
> Hello,
>
> Your deletion request was received on YYYY-MM-DD. We will complete the deletion within 14 days and confirm by email.
>
> — The ProFinanceCast team

### Step 2 — Identify

Run in Supabase SQL Editor:

```sql
select 'waitlist' as t, count(*) from public.waitlist where lower(email) = lower('user@example.com')
union all
select 'newsletter_signups', count(*) from public.newsletter_signups where lower(email) = lower('user@example.com')
union all
select 'auth.users', count(*) from auth.users where lower(email) = lower('user@example.com');
```

Note each count. If `auth.users` count = 1, the user also has an account — proceed to Step 3a. Otherwise skip to Step 3b.

### Step 3a — User HAS an account (auth.users count = 1)

Account deletion is a bigger surface. Use the existing `/api/account/delete.js` endpoint by:

1. Have the user sign in (or impersonate via Supabase Admin → Authentication → Users → Magic Link).
2. Trigger account deletion through Settings → Delete Account in the app.
3. The endpoint cascades to all per-user tables.

Skip Step 3b after — account deletion handles everything.

### Step 3b — User has no account, just waitlist/newsletter entries

```sql
-- Delete from waitlist
delete from public.waitlist where lower(email) = lower('user@example.com');

-- Delete from newsletter
delete from public.newsletter_signups where lower(email) = lower('user@example.com');
```

### Step 4 — Verify

Re-run the count query from Step 2. All counts must be 0. If any are non-zero, investigate why the delete didn't apply (RLS denying? Wrong table?).

### Step 5 — Confirm to user

Reply within 14 days of the original request:

> Subject: Your ProFinanceCast data has been deleted
>
> Hello,
>
> Your data has been removed from ProFinanceCast as of YYYY-MM-DD. Specifically:
>
> - [List of tables you deleted from, with counts]
>
> We retain no copies. If you receive any further email from us after today, please reply so we can investigate.
>
> — The ProFinanceCast team

### Step 6 — Log

Append to `docs/runbooks/gdpr-deletions.md`:

```
- YYYY-MM-DD · request received · sha256(email)=<32-char-prefix> · deleted from: [waitlist, newsletter_signups, auth.users] · counts: [1, 0, 1]
```

We log the SHA256 of the email, not the email itself. This proves the request was honored without re-storing the PII.

## Anti-patterns (do not do)

- **Do not** "mark as deleted" by setting a flag — actually delete.
- **Do not** keep the email in any backup file. Vercel logs are auto-rotated; if the deletion request appears in a function log, ask Vercel support to expedite log purge.
- **Do not** add the email to a "deleted users" blocklist. We have no legal basis to retain the email after deletion.
- **Do not** delete from `auth.users` directly via SQL — use the Supabase Admin UI's "Delete user" or the `/api/account/delete.js` endpoint. Direct SQL bypasses cascade.

## Test the SOP quarterly

To verify the SOP still works as deployed code changes:

1. Insert a synthetic row: `insert into public.waitlist (email, consent_at) values ('sop-test+YYYY-MM-DD@profinancecast.com', now());`
2. Run the on-demand deletion against that email.
3. Verify counts = 0.
4. Document the test in `gdpr-deletions.md` as a test-run entry.

## Audit-trail file

Create `docs/runbooks/gdpr-deletions.md` on first real deletion. Format:

```
# GDPR deletion log

Each entry: date · sha256(email)-prefix · tables-deleted · counts

- 2026-MM-DD · sha256(...)... · [waitlist, newsletter_signups] · [1, 0]
- 2026-MM-DD · sha256(...)... · [waitlist] · [1] · SOP TEST
```

The log itself contains no PII (just hashed prefixes) and demonstrates the deletion workflow is operational. Useful if a regulator ever asks for proof.
