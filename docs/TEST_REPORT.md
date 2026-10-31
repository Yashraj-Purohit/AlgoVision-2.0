# Verification report

Verified on 31 October 2026 using Node.js v24.22.1 and the local in-app browser. The initial 10 algorithm groups passed; v1.1 adds 9 backend groups for 19 total, plus live database/HTTP checks documented below. This report describes observed verification, not a guarantee for every browser/device or input.

## Automated execution

Run `npm test` (or `node --test tests/algorithms.test.js`) from the project directory. The built-in Node test runner is the only test dependency.

| Test group | Evidence | Result |
|---|---|---|
| FIFO queue | Order, overflow, empty dequeue, counter reset and reuse | Pass |
| Binary heap | 1,000 mixed deterministic operations against a sorted reference | Pass |
| Balanced price BST | Every inclusive integer range from 0 through 31 over 200 records, versus array filtering; duplicate prices and empty tree | Pass |
| Catalog ingestion | Accepted/duplicate/invalid counts, within-batch duplicates, invalid schema, deletion, hash/tree consistency | Pass |
| Bounded priority heap | K=0,1,5,12,20 against independent priority/ID sorting | Pass |
| Knapsack counterexample | Exact=220, greedy=160, fractional bound=240; zero budget and empty items | Pass |
| Knapsack exhaustive reference | 60 deterministic eight-item cases compared to all 256 subsets each; reconstructed costs/values and bounds | Pass |
| Allocation validation | Zero/fractional costs, negative benefit, duplicate IDs, excessive/fractional budget | Pass |
| Route edge cases | Weighted improvement, zero edge, same source/target, unreachable vertex, unknown endpoint, negative edge rejection | Pass |
| Route independent reference | All 49 ordered sample-network pairs compared with Floyd–Warshall | Pass |

JavaScript syntax checks passed for the algorithm module, application module and local server. Sample data/reports are generated using the same shipped algorithms; the tests use independent reference methods for the critical correctness checks.

## Browser verification

- Overview displayed 12 products, 590 stock units, ₹600,310 inventory value and two low-stock products.
- Mixed three-row JSON import accepted one new product, skipped one duplicate and reported the invalid negative-price row by number.
- Reloaded the application and successfully found the imported QA-1 record using the ID lookup, confirming browser persistence.
- Exact price range ₹1,799–₹1,799 returned both Smart Fitness Band and USB-C Power Bank.
- Default optimizer showed exact benefit 220, ratio greedy 215, and fractional upper bound 240 for budget 50.
- Route planner showed Hub → North → East → Port at 23 km; changing destination to South produced Hub → West → South at 20 km with updated graph highlights.
- Algorithm lab completed the 10,000-record / 500-query experiment and displayed matching results. One observed run measured 16.200 ms array scans, 0.200 ms hash lookups and 1.600 ms index build. These are a single local observation, not benchmark guarantees.
- Catalog name/ID filtering isolated the QA record; removal returned the catalog to the original 12 products and rebuilt indexes. Test data was cleaned up.
- Overview was inspected visually and a screenshot saved. Responsive CSS is included; a full multi-device accessibility/browser audit was not performed.

## Limits of verification

Supabase backend provisioning is documented below. JSON download controls are implemented; deterministic example exports are included in the package. Cross-browser file download and file-picker behavior has not been comprehensively tested. Large supported DP limits are analytically bounded; the automated correctness tests focus on independently verifiable instances rather than every maximum-size input.

## Local environment note

The system Homebrew Node binary on the development machine failed to launch due to a missing simdjson library. Verification used the installed Codex bundled Node v24.22.1 instead. This is an environment issue, not a project dependency. `Run-AlgoVision.command` now requires Node 20+ and can fall back to the installed Codex bundled Node binary. Python static serving cannot run the backend. No npm packages are required.

## Supabase backend verification — v1.1

The backend is now live, superseding the original browser-only storage model described in the initial verification above.

- New project AlgoVision 2.0 created in the explicitly user-confirmed Yashraj-Purohit organization, ap-south-1 (Mumbai). Quoted creation cost: $0/month.
- Database tables, indexes, RLS, capacity trigger and atomic RPC migration applied successfully.
- Supabase security advisor returned an empty notices list after schema creation.
- **19 Node tests passed:** original 10 algorithm groups plus 9 backend/adapter groups. Backend groups cover unconfigured mode, origin/CSRF checks, protected reads, session rotation, server-side row validation, server-computed results, input bounds, refresh/logout, cloud pagination and redacted upstream errors.
- **21 live pgTAP access checks passed:** RLS enabled on all three tables, anonymous denial, per-user reads/inserts/deletes, spoofed ownership denial, update privilege denial, atomic import RPC and owner-scoped receipts. Fixtures rolled back; final pgTAP output was `1..21` with no failure summary.
- **22 live HTTP checks passed:** real Supabase password login, empty initial catalog, atomic reset to 12 products, mixed import (one accepted/one duplicate/one invalid), retrieval, server knapsack (220 points), server shortest path (23 km), persisted history, deletion, logout and unauthorized rejection. A second independent login observed the same 12 products and two planning runs. Static-file protection rejected .env, backend source and SQL paths.
- Browser sign-in with the disposable synthetic test account loaded its persisted products and saved activity. Default optimizer calculation ran against the live server/Supabase path.
- The live test account and its dependent records are removed after verification. No test password is packaged or retained in the final deliverable.

A second physical device, public hosting and production load were not tested. Tests cover independent sessions on the same host rather than claiming a multi-device hardware test. The 22 live checks used a disposable synthetic account created solely for this analytics project; they do not access personal project data.

## Interface revision — v1.2

All 19 Node tests passed again after the UI revision. Browser checks on a separate local sample-data preview verified global product search (keyboard → one Mechanical Keyboard match), the new editable allocation table (budget 10 and benefit 75 → exact result 75), adding/removing an opportunity, and alternate route selection (Hub → West → South = 20 km). The configured application at port 4173 displayed the redesigned Supabase account form. No cloud user records were modified for this UI verification. Full details and reference review are in UI_REFERENCE_REVIEW.md. Screenshots were updated to the new interface.
