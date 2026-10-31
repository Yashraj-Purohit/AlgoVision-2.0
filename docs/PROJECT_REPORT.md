# AlgoVision 2.0 — Project report

A standalone data structures and algorithms analytics application.

## 1. Problem statement

A small commerce operation must organize product records, find important stock quickly, allocate limited improvement capital, and plan delivery paths. Unstructured lists and ad hoc decisions can cause duplicate records, repeated full scans, inefficient budget allocation, and unnecessarily long routes.

AlgoVision 2.0 is a unified educational analytics platform demonstrating how core data structures and algorithms address those problems. The e-commerce module ingests and searches products. The fintech planning module chooses indivisible opportunities under a fixed budget. The logistics module computes shortest paths in a weighted network. These modules share one interface, while keeping their data models explicit.

## 2. Objectives and scope

- Integrate queues, hashing, arrays, BSTs, heaps, greedy algorithms, dynamic programming, and graphs in a functional prototype.
- Make algorithm outputs inspectable through import receipts, node counts, selected items, route highlights, and complexity descriptions.
- Provide modular code, documentation, and meaningful correctness evidence.
- Add practical efficiency improvements without hiding the required DSA implementations.

This is a local Node application with a live Supabase Auth/Postgres backend. It is not a publicly deployed enterprise service. Sample data is synthetic, benefit scores are modeled rather than predicted returns, and route weights are fixed distances rather than live traffic estimates.

## 3. Tools and technologies

| Component | Choice | Reason |
|---|---|---|
| Algorithm implementation | JavaScript ES modules | Same implementation executes in browser and Node tests |
| User interface | Semantic HTML, CSS, browser DOM | No installation or runtime dependencies |
| Visualization | Inline SVG + CSS bars | Offline, readable, responsive graph and chart |
| Persistence | Supabase Postgres + RLS | Durable, isolated per-user catalogs and planning history; localStorage only in explicitly unconfigured demo mode |
| Application backend | Node.js standard HTTP/fetch + Supabase REST | Session authentication, server validation/calculation, transactional persistence |
| Testing | node:test and node:assert | Reproducible checks using Node standard library |

Hashing uses the built-in JavaScript Map, with expected constant-time operations assumed in analysis. The queue, heap, BST, greedy selection, knapsack DP and Dijkstra traversal are explicitly implemented in src/algorithms.js.

## 4. Architecture and workflow

```text
Manual form / JSON array
        |
        v
FIFO queue -> schema validation -> duplicate ID check (Map)
        |                                |
        v                                v
Array catalog <---------------------- accepted rows
        |
        +--> ID Map --> exact identity lookup
        +--> sorted bulk-built BST --> inclusive price-range lookup
        +--> bounded min-heap --> top-K priority records
        +--> array aggregation --> metrics / category distribution

Editable capital opportunities + integer budget
        +--> ratio greedy --> feasible heuristic allocation
        +--> 0/1 DP --> exact allocation + traceback
        +--> fractional greedy --> explicitly separate upper bound

Delivery nodes + nonnegative undirected weighted edges
        +--> adjacency list + min-heap Dijkstra
        +--> shortest route + distance --> SVG edge highlighting
```

The browser app owns views and local search indexes. The Node API verifies Supabase sessions, validates imports and computes/saves allocation and route runs. Supabase stores per-user products, import receipts and planning runs with RLS. See SUPABASE_SETUP.md for the full request/data flow. The algorithm layer has no DOM dependencies and is directly testable. The sample-data module is separate from both. Catalog writes rebuild the balanced price index once after a successful batch. UI refreshes recompute visible metrics from current data.

## 5. Functional modules

### 5.1 Data ingestion — queues and hashing

Imports may be a single manually entered product or a JSON array of up to 5,000 records. A Map-backed FIFO queue tracks monotonic head/tail positions without repeatedly shifting an array. Dequeue deletes processed entries so consumed items are released. Every record is validated before insertion. A hash index rejects repeated IDs both against existing products and earlier rows in the same import. The receipt reports processed, accepted, duplicate and invalid counts, row errors, and measured processing time including index rebuilding.

Required product fields: id, name, category, price, stock, priority. IDs allow letters, digits, underscores and hyphens (1–32 characters). Prices must be finite between 0 and 10,000,000; stock must be an integer between 0 and 1,000,000; priorities must be integers from 1 through 10. Names/categories are nonempty and length-bounded. IDs are case-sensitive.

Valid rows in a partially invalid batch remain accepted. Duplicate records do not overwrite earlier data. No background queue is claimed; processing is synchronous. Input controls cap JSON size at 2 MB and catalog size at 10,000 rows.

### 5.2 Cataloging — arrays

An array stores all accepted products. The catalog view supports substring name/ID filtering, category filtering, ascending sorting, and deletion. Inventory value is the sum of price multiplied by stock; total stock and low-stock counts are recomputed from the array. For rendering responsiveness the table displays at most 100 matches, clearly stating the full match count. In cloud mode the catalog is retrieved from Postgres in 500-row pages; browser secondary indexes are rebuilt on reload. In unconfigured demo mode only, localStorage serializes the array.

### 5.3 Search engine — BST and heaps

- Exact ID lookup uses the hash index.
- The price index sorts records and bulk-builds a balanced BST over distinct prices. Equal-price products share a node. Inclusive range traversal prunes unrelated subtrees and returns ascending prices, with visited-node counts.
- Priority search maintains a min-heap capped at K records, discarding the lowest priority record as the scan proceeds. Output is highest-first; equal priority is resolved by ascending product ID.

The priority score is user-provided; the application does not pretend to infer a business score from unmodeled demand data.

### 5.4 Optimizer — greedy and dynamic programming

Each opportunity has a unique ID, a positive integer cost, and a nonnegative benefit score. The budget is an integer from 0 to 10,000 units; one demo unit represents ₹1,000. At most 100 opportunities are allowed. Each can be selected once in full.

The exact 0/1 knapsack recurrence is:

```text
DP[i,b] = DP[i-1,b]                                      if cost[i] > b
DP[i,b] = max(DP[i-1,b], DP[i-1,b-cost[i]] + value[i])    otherwise
```

All cells begin at zero. Traceback identifies selected opportunities. Ties preserve the prior solution, so equally optimal results are deterministic for an input order.

The ratio greedy heuristic sorts by benefit/cost and accepts any full opportunity that fits. It is fast but has no general optimality guarantee for 0/1 knapsack. A separate fractional variant allows partial funding and supplies an upper bound; it is not presented as a feasible whole-opportunity allocation.

Default budget 50 produces exact benefit 220 from delivery consolidation and checkout resilience. Ratio greedy gives 215, and the fractional upper bound is 240. The three-item dataset in sample-opportunities.json isolates a larger counterexample: exact 220 versus greedy 160 at budget 50, fractional upper bound 240. The report export includes inputs, selections, bounds, and measured runtimes.

### 5.5 Visualization — graphs

The delivery graph contains seven labeled nodes and eleven undirected nonnegative weighted edges. The Graph class builds adjacency lists. Dijkstra starts at the source, repeatedly removes the nearest tentative node from a min-heap, relaxes outgoing edges, skips stale entries, and exits when the destination is settled. Parent pointers reconstruct the path. The SVG highlights its edges and lists distance in kilometers. The sample Hub-to-Port route is Hub → North → East → Port, 23 km.

Equal source and destination returns zero distance. The core returns Infinity and an empty path for an unreachable destination. Negative edges and unknown endpoints are rejected. The UI deliberately exposes the connected sample graph; disconnected cases are verified in automated tests.

## 6. Added efficiency and usability features

- Batch-level price-index rebuilding, rather than rebuild per imported row.
- Balanced price BST so sorted imports do not produce a linear-height tree.
- Bounded top-K heap for O(k) memory rather than sorting all records.
- Stale-entry skipping and destination early exit in Dijkstra.
- Validated and bounded inputs to limit accidental excessive work.
- Supabase persistence, per-user authentication, saved planning history and portable JSON catalog/report exports.
- A lookup experiment that measures hash-index construction separately from repeated lookup cost and checks equal results.
- Responsive layout, semantic labels, keyboard controls, escaped record text, and visible error receipts.

These are implemented features. They are not claims of compliance with enterprise accessibility, performance, or security certifications.

## 7. Challenges and technical solutions

The implementation addresses the following technical challenges.

| Challenge | Solution | Tradeoff |
|---|---|---|
| Duplicate and malformed imported records | Per-row validation plus hash ID index | Valid rows accepted even when other rows fail |
| Skewed BST after ordered data | Rebuild a balanced tree from a sorted copy | O(n log n) mutation-time rebuild |
| Greedy can miss a better allocation | Compare against exact 0/1 DP | Pseudo-polynomial time and O(pB) storage |
| Reconstruct the selected optimum | Retain full DP table and traceback | More memory than value-only 1D DP |
| Multiple tentative distances in route heap | Lazy stale-entry check | Heap may grow to O(E) entries |
| Durable per-user data with client-side DSA exploration | Supabase Auth/Postgres RLS plus rebuilt browser indexes | Network/Auth overhead; refresh needed for other-device changes |

## 8. Results and verification

The supplied dataset produces 12 catalog products, 590 stock units, inventory value ₹600,310 and two products below 15 units. The strongest priority is Mechanical Keyboard (10/10). Both products priced at ₹1,799 appear in an exact price-range lookup. Default allocation yields 220 points within 50 units. Sample shortest route is 23 km.

The automated tests check all required algorithms, including comparisons to independent references: BST range results versus array scans, top-K versus full sorting, DP versus exhaustive subset enumeration, and all-pairs Dijkstra distances versus Floyd–Warshall. See TEST_REPORT.md for execution evidence. Timings displayed in the app measure the relevant browser/server environment and may round to zero; no universal speedup is claimed.

## 9. Industry relevance and scaling limits

Catalog ingestion/search corresponds to e-commerce inventory analytics. Integer budget selection models a fintech-style capital planning problem. Weighted shortest paths model logistics network optimization. Those are educational connections, not claims that a named company uses this exact implementation or endorses the work.

Supabase already supplies persistent per-user data, transactional import/reset operations, composite ID uniqueness and access rules. For larger deployments, add a shared session store, asynchronous batch workers, incremental balanced indexing, production observability and operational demand/traffic validation. Million-record analytics and public multi-instance deployment are outside the current scope. See COMPLEXITY.md for detailed limitations.

## 10. Design considerations

The hash index trades memory for faster exact lookups. The balanced price BST supports ordered range queries, while a bounded heap limits the memory needed for top-K retrieval. Greedy allocation provides a fast heuristic; dynamic programming produces the exact 0/1 optimum. Dijkstra uses nonnegative edge weights and parent pointers to reconstruct the route. These decisions are directly inspectable in the source and test suite.

## 11. Feature coverage

| Capability | Implementation / evidence |
|---|---|
| Unified analytics across logistics, e-commerce, fintech | One dashboard with catalog, routing and capital planning |
| Data ingestion: queues, hashing | Queue and Catalog.ingest; ingestion view; validation tests |
| Cataloging: arrays | Catalog.records; filtering, sorting, aggregation, deletion |
| Search engine: BST, heaps | PriceBST.range; Catalog.top; search view; reference tests |
| Optimizer: greedy, dynamic programming | greedyAllocation and knapsack; side-by-side comparison |
| Visualization: graphs | Graph.shortestPath and SVG delivery network |
| Modular source and documentation | src modules, README, docs folder |
| Algorithmic complexity and optimization report | COMPLEXITY.md; algorithm lab |
| Functional prototype or visualization dashboard | Runnable app with eight views, Node API and Supabase backend |

## 12. Implementation choices

JavaScript ES modules allow the browser, Node API and tests to share one algorithm layer. Supabase provides authentication and database persistence. The product catalog, budget allocation and delivery network demonstrate applications across commerce and logistics using synthetic inputs.

## 13. Backend delivery and verification

A new AlgoVision 2.0 Supabase project was provisioned in the user-confirmed Yashraj-Purohit organization in ap-south-1 (Mumbai), at a quoted cost of $0/month. The migration is applied and the local Node app is configured. All 19 Node tests pass, all 21 pgTAP access checks pass, and 22 live HTTP checks verify login, atomic import/reset, deletion, server-side calculation, history and persistence across independent sessions. A disposable synthetic account was used for live verification and is removed afterward. See TEST_REPORT.md and SUPABASE_SETUP.md.
