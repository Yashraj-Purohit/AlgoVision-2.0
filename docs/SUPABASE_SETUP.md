# Supabase backend setup and architecture

## Current delivery state

The backend is live and configured locally. Project: AlgoVision 2.0; organization: Yashraj-Purohit (explicitly confirmed by the user); region: ap-south-1 (Mumbai); project ref: vgoorydbwlpaanklfdwx. Supabase quoted $0/month at creation. The schema migration and pgTAP extension are applied. The local .env contains the actual project URL and publishable key and is intentionally excluded from the ZIP.

All 19 Node tests, 21 live database-policy checks and 22 live HTTP checks passed. The security advisor returned no notices. The test account is disposable and removed after verification. Create your personal app account through Account & history, confirm its email, sign in and choose Load sample catalog. The app is local at http://127.0.0.1:4173; Supabase itself is hosted.

## Reproducing this setup in another project

1. Create a Supabase project named AlgoVision 2.0 in your own organization. Choose a suitable available region, such as Mumbai, and use the free tier if available. Project creation/account terms or billing selections must be completed in your own account.
2. Apply `supabase/migrations/202610310001_backend.sql` once through the SQL Editor, or through a linked Supabase CLI migration workflow. It creates `av_products`, `av_imports`, `av_runs`, indexes, RLS policies and two transaction functions.
3. Copy `.env.example` to `.env` in the project folder. Fill `SUPABASE_URL` with the HTTPS project URL and `SUPABASE_PUBLISHABLE_KEY` with its publishable key. A legacy anon key also works under `SUPABASE_ANON_KEY`.
4. Do not use a service_role/secret key. The server deliberately rejects those key types. Every database request carries the authenticated user's JWT so row policies apply.
5. Keep email/password authentication enabled. Configure a working confirmation-email flow in the Supabase Auth dashboard. For confirmation redirects set the site URL to `http://127.0.0.1:4173` and allow your actual localhost development URL. After confirming the email, return to the app and sign in. This app does not consume an implicit token from a URL fragment or implement password-reset callbacks.
6. Restart with `npm start` or `sh Run-AlgoVision.command`. Node 20+ is required; a Python-only static server no longer supports the API.
7. Open Account & history. Create an account or sign in. A new account starts with an empty catalog. Use Reset sample data to seed the synthetic products, or explicitly import the browser's demo catalog. No local records are uploaded automatically.
8. On a disposable test project/database, run the included `supabase/tests/access.sql` through a configured pgTAP/Supabase CLI test workflow. After linking a remote CLI project, `supabase test db --linked` can target it if supported by the installed CLI; otherwise use the CLI's documented local test database workflow. Test account fixtures roll back. Do not treat mocked HTTP tests as evidence that live database policies have passed.

## Data model

| Table | Contents | Access |
|---|---|---|
| av_products | owner_id + product ID composite key, fields, created timestamp | Signed-in owner can select, insert and delete |
| av_imports | Counts, row errors, event kind and timestamp | Signed-in owner can select/insert history |
| av_runs | Allocation/route inputs and computed outputs in bounded JSON payloads | Signed-in owner can select/insert history |

Anonymous table access is revoked. All tables have row-level security matching auth.uid() to owner_id. Constraints mirror product limits. Indexes support per-owner prices and recent history. Database-side capacity enforcement caps each owner at 10,000 products.

The av_ingest RPC uses an advisory transaction lock per user, INSERT ON CONFLICT DO NOTHING, and a receipt insert in one transaction. Concurrent imports of the same ID cannot overwrite records or create duplicate IDs. Invalid input rows are rejected by Node before the valid subset is sent to Postgres; database constraints provide an additional check. The av_reset RPC replaces only the caller's catalog atomically and records a reset event. It preserves historical runs/imports.

## Application request flow

```text
Browser UI --same-origin JSON + CSRF token--> Node API
             HttpOnly session cookie          |
                                               +--> Supabase Auth: password login, refresh, get user
                                               +--> PostgREST: user JWT + publishable key
                                                        |
                                                        v
                                                Postgres grants + RLS
                                                private products / history

Node imports core DSA module --> validates FIFO batch
                             --> computes exact/greedy allocation
                             --> computes Dijkstra route
Browser rebuilds array / BST / hash indexes for catalog exploration.
```

There are no third-party runtime packages. The adapter uses standard Node fetch to call documented Supabase Auth and PostgREST interfaces. The browser never receives the publishable key or Supabase access/refresh tokens. Those tokens stay in server memory; the browser receives an opaque HttpOnly, SameSite=Strict cookie and a session-bound CSRF token. Mutations require exact allowed loopback Origin plus that CSRF header. Successful sign-in rotates the session ID. Expiring access tokens are refreshed server-side; refresh is single-flight per session. Supabase Auth verifies the user before every authenticated API operation.

## API

| Method | Path | Purpose |
|---|---|---|
| GET | /api/session | Configuration status, safe user summary, CSRF token |
| POST | /api/auth/signup | Email/password signup; confirmation status |
| POST | /api/auth/login | Authenticate, rotate local session |
| POST | /api/auth/logout | Revoke local app session, attempt Supabase local logout |
| GET | /api/products | Paginated cloud catalog retrieval, max 10,000 |
| POST | /api/imports | Server validation + queue + atomic cloud insertion |
| DELETE | /api/products/:id | Delete caller's product through RLS |
| POST | /api/products/reset | Replace caller's catalog with sample data |
| POST | /api/allocations | Compute exact, greedy and fractional results; persist run |
| POST | /api/routes | Compute shortest path; persist run |
| GET | /api/history | Latest 20 imports and latest 20 planning runs |

Imports and calculations do not trust client-computed outputs. A cloud write is shown as saved only after Supabase confirms it. If the subsequent catalog refresh fails after a committed import, the app reports that the import committed but the display needs refreshing. Writes are not silently redirected to localStorage when the configured backend is offline. In demo mode only, the original local algorithms and localStorage remain available for offline teaching.

Cloud calculation pages run their default example on opening and save it as a run. User-submitted calculations also save. Account & history shows saved activity and can export full run JSON. Recent-history reads are bounded; historical rows remain in Postgres.

## Operational boundaries

- The Node listener is loopback-only and designed for local demonstrations. It is not deployed to the internet.
- Sessions are held in memory for at most 12 hours. Restarting Node signs users out, but database records remain. A production multi-instance service needs a shared session store.
- Cookies are HttpOnly/SameSite=Strict; Secure can be enabled for HTTPS. The current strict origin allowlist intentionally permits only the specified localhost port. A public deployment requires deliberate origin/host/proxy and HTTPS configuration.
- Local auth requests have a bounded per-IP attempt window. Supabase's own rate limits and email policies also apply. Production abuse controls and password recovery are not implemented here.
- Product retrieval is paginated in 500-row pages. It is not a transactionally consistent snapshot across simultaneous writes from other devices. Refresh to see other-device updates; no realtime subscription is claimed.
- Price BST and heap queries run over the loaded catalog in the browser. Import validation, allocation and routing execute in Node in cloud mode. This preserves the DSA demonstrations while adding durable persistence.
- Network latency, Auth verification and DB operations add cost beyond the core algorithm complexities. Database capacity checks and indexes are separate from the in-memory complexity report.
- `.env` and backend source are blocked by the HTTP static-file allowlist. `.env` must be excluded from version control and shared source archives. The packaging procedure excludes it explicitly.
- Email/password sign-in accepts existing 8–128 character passwords. OAuth, MFA, password recovery UI, team workspaces, live traffic and real money operations are outside scope.

## Official references consulted

- [Supabase Auth REST interface](https://supabase.github.io/auth/)
- [Data REST API](https://supabase.com/docs/guides/api)
- [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [API keys](https://supabase.com/docs/guides/getting-started/api-keys)
- [Password authentication](https://supabase.com/docs/guides/auth/passwords)
