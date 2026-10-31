# Project demonstration script — target 8 minutes

An optional eight-minute walkthrough of the application. Adapt the language, duration and presentation format to your audience.

## Before recording

- Review the project report and choose the features you want to demonstrate.
- Start the app with npm start and open http://127.0.0.1:4173.
- Sign in from Account & history, load the sample catalog, then keep sample-import-errors.json and sample-opportunities.json handy.
- Run npm test and keep the passing test output available.
- Use a quiet place, clear microphone, professional tone, readable screen zoom and clean visuals. If using a webcam, check framing and lighting. Use stable internet if screen sharing.
- Rehearse once. Aim for 8 minutes; cut repetition rather than rushing.

## 0:00–0:50 — Introduction

“AlgoVision 2.0 is a standalone analytics application that applies data structures and algorithms to product catalogs, capital allocation and delivery routing. This demonstration covers the working application, its algorithms and their tradeoffs.”

## 0:50–1:30 — Problem, tools, architecture

Show Overview.

“A commerce operation needs to organize incoming product records, find priority stock, use a limited budget effectively, and select delivery routes. I used modular JavaScript, HTML, CSS, SVG and browser storage. Node.js runs the application API and automated tests, while Supabase provides authentication and a persistent Postgres database. The core algorithms have no framework dependencies.

The data pipeline is queue-based validation, array cataloging, and indexed search. Capital allocation and graph routing are separate planning modules inside the same interface. All demonstration data is synthetic.”

Point out the 12 products, 590 stock units, inventory value ₹600,310, and two low-stock products.

## 1:30–2:30 — Ingestion and arrays

Open Data imports. Paste or upload sample-import-errors.json.

“Records enter an explicit FIFO queue. Each record is validated and checked against a hash index. This example contains one existing ID, one new valid product, and one invalid negative price.”

Show receipt: 3 processed, 1 accepted, 1 duplicate, 1 invalid. Run it again to show duplicate protection: 0 accepted, 2 duplicates, 1 invalid.

Open Product catalog; filter for Portable Speaker and demonstrate the category selector or price sort.

“The accepted records are stored in an array. Filtering and aggregation scan the array. The backend validates this import and commits the valid products and receipt to Supabase. Each signed-in user has a private catalog. The browser rebuilds search indexes; export supplies a portable backup.”

## 2:30–3:30 — BST, hashing and heaps

Open Search & ranking. Search ID AV-101. Set minimum and maximum price both to 1799; click Search price index.

“Exact IDs use the hash index, with expected constant-time lookup. Inclusive price searches traverse a balanced binary search tree. Two products share this price, and both are preserved. The display reports how many price nodes were visited.

For top-K priorities I use a bounded min-heap. It keeps only K candidates instead of sorting the full catalog. That takes O(n log k) time for the normal small-K case and O(k) heap memory. Ties use product IDs.”

## 3:30–5:00 — Greedy versus exact dynamic programming

Open Capital allocation. Show default 50-unit budget and its 220-point DP result versus 215 greedy and 240 fractional upper bound. Then open Advanced: edit or paste JSON, paste sample-opportunities.json, choose Apply JSON to table, and run the comparison again.

“Each opportunity has an indivisible cost and benefit. One budget unit represents ₹1,000 in this synthetic model. Ratio greedy prioritizes benefit per unit. On the three-item example it selects the 10-unit and 20-unit items for 160 points.

Exact 0/1 knapsack instead selects the 20-unit and 30-unit items, obtaining 220 points. The recurrence considers excluding the current item or including it using the previous row's remaining-budget optimum. Keeping the full table lets me reconstruct the selected items. Time and space are O(pB), which is pseudo-polynomial in the numeric budget.

The fractional result is 240, but it permits partial opportunities and is only an upper bound for this whole-item problem. It is not an available 0/1 allocation. Benefit points are demonstration scores, not real returns.”

Optionally export the allocation report.

## 5:00–6:00 — Graph visualization and routing

Open Delivery routes. Choose Hub → Port. Then try Hub → South.

“Vertices represent delivery locations and edge labels are distances in kilometers. Dijkstra uses adjacency lists and my binary min-heap. It relaxes outgoing edges, skips stale heap entries, and stops once the destination is settled. Blue edges show the reconstructed path.

Hub to Port is 23 km through North and East. Hub to South is 20 km through West. Dijkstra requires nonnegative edge weights. This demo does not include live traffic or vehicle capacity constraints.”

## 6:00–6:50 — Complexity, optimization and validation

Open Algorithm reference. Run the 10,000-record experiment.

“This compares 500 matching lookups with an array scan and a hash index. Index build cost is measured separately. Browser lookup timings and server calculation timings vary by environment, so these are observations rather than guaranteed speedups.

Efficiency additions include a balanced price index, a bounded priority heap, once-per-batch rebuilding, stale-entry skipping in routes, and explicit input limits. For a write-heavy production system I would use an incremental balanced index and server-side persistence.”

Briefly show Account & history saved activity to demonstrate persisted imports and planning runs. Mention that the 19 Node tests, 21 live database access checks and 22 live HTTP checks passed. Show the passing tests briefly. Explain DP against brute force and Dijkstra against Floyd–Warshall rather than reading every test name.

## 6:50–8:00 — Challenges, results and reflection

“An implementation challenge is preserving duplicate-price products while pruning BST searches; grouping products at one price node solves that. Another is reconstructing the exact allocation, so I kept DP rows rather than only a single value row. This uses more memory, and the app explicitly caps the budget.

[ADD A REAL CHALLENGE YOU PERSONALLY FACED AND HOW YOU RESOLVED IT.]

The result is a working prototype with all five core modules, modular source code, a complexity report, a visible graph dashboard, and tests. Current limits include in-memory Node sessions, a fixed sample route network, synchronous calculations and synthetic planning inputs. Supabase provides persistent per-user data; refresh loads other-device changes.

[OPTIONAL: EXPLAIN YOUR TECHNICAL LEARNINGS AND NEXT IMPROVEMENTS.]

Thank you for watching my AlgoVision 2.0 demonstration.”

## After recording

Check the recording's readability and audio. If sharing the project, include the repository link and setup instructions. Keep actual environment configuration and account credentials private.
