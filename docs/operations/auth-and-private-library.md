# Auth and private library runbook

## Production contract

- Auth Site URL: `https://mamingsuper.github.io/newresearch/`
- Allowed redirects: the public Pages URL and `http://localhost:3000`
- Private resources: profiles, saved papers, analysis sessions, and user-owned program submissions
- Ownership comes only from the verified Supabase JWT. Client-provided user IDs are rejected.
- Signing out or changing users clears the in-memory private workspace before the next account is rendered.

## Access model

All user-owned tables use RLS. Authenticated users can read or mutate only their rows. Privileged import and account-cleanup functions are revoked from `public`, `anon`, and `authenticated`, then granted only to `service_role`. Admin access is derived from `app_metadata.role = "admin"`; editable user metadata is never accepted as authorization.

## Account lifecycle

`export-account` returns the user's profile, saved papers with canonical paper metadata, saved analyses, and submissions. `delete-account` requires a token authenticated within the last 10 minutes plus the exact confirmation phrase. It removes private workspace rows, safely detaches reviewed submissions, removes pending uploaded objects, and finally deletes the Auth user.

If deletion fails after workspace cleanup, record only a bounded error code in `workspace_private.account_deletion_retries`; never store tokens or request bodies.

## Incident checks

1. Confirm the affected function returns `401` without a valid bearer token.
2. Check Auth and Edge Function logs without copying tokens into tickets.
3. Verify RLS policies with two separate test users before changing policy SQL.
4. Revoke a compromised user session in Supabase Auth; rotate only the affected server secret.

