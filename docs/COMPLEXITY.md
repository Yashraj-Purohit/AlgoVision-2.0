# Algorithmic complexity and optimization report

## Notation and assumptions

n = catalog records; b = input rows in a batch; d = distinct prices; m = matching products; k = priority shortlist size; p = capital opportunities; B = integer budget; V = vertices; E = undirected edges. Auxiliary space excludes pre-existing input unless otherwise stated; output space is identified. JavaScript Map lookups/inserts/deletes are treated as expected O(1), not a strict worst-case language guarantee. Comparisons treat bounded string length as constant. Standard JavaScript sorting is modeled as O(n log n).

## Implementation-specific costs

| Operation | Time | Additional space | Detail |
|---|---|---|---|
| Queue enqueue/dequeue | Expected O(1) | O(b) peak queue | Map plus head/tail counters; deletes consumed entries; no Array.shift |
| Validate and deduplicate a batch | Expected O(b) before rebuild | O(b) queue/errors; O(n) retained index/catalog | At most one hash check per valid row |
| Rebuild price index | O(n log n) | O(n) | Sort copy; group duplicate prices; recursive balanced build over d keys |
| Entire accepted batch | Expected O(b + n log n) | O(b + n) peak | n denotes final catalog size; rebuild only once, only if accepted rows exist |
| Exact ID lookup | Expected O(1) | O(1) | Retained Map costs O(n) |
| Catalog append | Amortized O(1) before index work | O(1) amortized growth | Full mutation cost includes rebuild |
| Delete product | O(n log n) total | O(n) | Array filter O(n), then price tree rebuild |
| Filter catalog | O(n) | O(m) | Substring tests on length-bounded fields |
| Sort filtered records | O(m log m) | O(m), engine-dependent internals | Display is limited to 100; filtering still covers full input |
| BST inclusive range | O(log d + m) | O(log d) recursion + O(m) output | Price grouping ensures duplicate-price matches are preserved |
| Heap push/pop | O(log h) | O(1) extra per operation | h is current heap size, backing array retained |
| Top-K priorities | O(n log k + k log k) for 2 ≤ k ≤ n | O(k) | Heap reaches k+1 transiently; final pops supply ranked output; k=0 O(1), k=1 O(n), k>n O(n log n) |
| 0/1 knapsack DP | O(pB) | O(pB) | Full Float64Array rows allow O(p) traceback; zero-sized dimensions use O((p+1)(B+1)) actual cells |
| Ratio greedy / fractional bound | O(p log p) | O(p) | Sorted copy and selections |
| Build graph adjacency list | O(V + E) | O(V + E) | Each undirected edge is stored twice |
| Dijkstra with lazy heap | O((V + E) log(V + E)) | O(V + E) | Entries can be repeated until stale ones are popped; simple graphs often expressed as O((V+E) log V) |
| Inventory and category summaries | Expected O(n) | O(c) for c categories | Aggregates array with category Map |
| Serialize catalog | O(n) bounded-size records | O(n) string | Browser storage limits are external to algorithm correctness |

## Why these structures

**Queue:** FIFO shows ingestion order explicitly. A JavaScript array with shift repeatedly reindexes elements; Map-backed positions avoid that pattern. The queue is synchronous and in memory, not a durable message broker.

**Hash index:** Spend O(n) retained memory to avoid scanning the full array for each exact ID query and duplicate check. Index initialization/rebuilding is a separate cost from the steady-state query cost.

**Arrays:** Offer simple sequential iteration for catalog display and aggregation. Substring filtering remains a scan; a price BST does not accelerate arbitrary substring searches.

**Balanced BST:** The bulk construction guarantees logarithmic height over distinct price keys. This is attractive for a read-heavy demo with occasional batch writes. It does not offer logarithmic individual inserts; an AVL/red-black implementation would be preferable for frequent mutations.

**Bounded heap:** Retaining only K priorities reduces memory compared with constructing a full heap or sorting every record. When K approaches n, sorting may be simpler with similar asymptotic time. Equal-priority ordering is deterministic by ID.

**Greedy plus DP:** Greedy is fast and explains a useful heuristic; exact knapsack demonstrates why locally appealing choices may miss a better global allocation. DP is pseudo-polynomial in numeric budget B, not polynomial in the number of bits encoding B. Discrete costs are required; decimal currency must be explicitly quantized before applying this model.

**Adjacency list plus Dijkstra:** Sparse networks fit adjacency lists. A custom min-heap avoids scanning all unvisited nodes repeatedly. Lazy insertion is simpler than decrease-key but permits O(E) heap entries. Nonnegative weights are mandatory; use a different algorithm for negative edges.

## Memory and input safeguards

At the supported maximum, p=100 and B=10,000, the DP table has 1,010,101 numeric cells: 8,080,808 bytes, about 7.71 MiB, plus row/object overhead. The bound is explicit in both UI and core validation. Keeping full rows enables reliable traceback; a value-only 1D DP would use O(B) numeric storage but cannot use this same simple traceback logic.

Batch inputs are capped at 5,000 records, the catalog at 10,000, uploaded/pasted product JSON at 2 MB, and opportunity JSON at 100,000 characters. The catalog preflight uses existing count plus submitted rows before deduplication; it may conservatively reject a mostly-duplicate batch near capacity. Browser persistence can fail due to quota/privacy policy; the UI warns and export remains available. Work happens on the main thread and large allowed inputs may briefly block rendering.

## Reproducible evidence

1. Start the app, open Algorithm lab, choose 1,000 / 10,000 / 50,000 records, and run the lookup experiment.
2. It constructs deterministic IDs and 500 deterministic successful query IDs. It measures index construction separately, compares array.find with Map.get, and verifies matching value checksums.
3. Repeat runs and record device, browser, sizes, warm-up strategy and variance if presenting quantitative claims. The built-in single-run result is illustrative, not statistically rigorous.
4. Use Search & priority to inspect actual BST node visits. These are independent of imprecise wall-clock resolution.
5. Run the automated suite: DP is compared against all subsets on 60 eight-item instances; routes are compared to an independent all-pairs Floyd–Warshall computation for all 49 node pairs in the sample network.

No invented runtime table or guaranteed speedup is supplied. Millisecond readings can round to 0.000 on fast inputs due to browser timer precision.

## Future improvements

- For frequent single-row writes, incremental AVL/red-black indexing or a database index avoids O(n log n) rebuilds.
- For large batches, streaming validation and Web Workers reduce peak memory and keep interaction responsive.
- For larger budgets, branch-and-bound, sparse DP states or an approximation scheme may be appropriate after studying input distributions.
- For route-heavy services, add validated live edge costs, route caching with explicit invalidation, and a decrease-key heap where justified.
- For concurrent use, replace localStorage with transactional persistence, server-side validation, access control and auditable changes.

These are future proposals, not implemented features.

## Supabase backend costs (v1.1)

Cloud mode adds HTTPS/Auth/Postgres work beyond the pure algorithms above. Node validates incoming rows with Queue/Catalog and sends the accepted subset in one transaction to av_ingest. Postgres uses the per-owner primary key to reject duplicates, an advisory transaction lock to serialize writes, and a statement-level capacity check that counts the owner's rows. Unique-index conflict checks are generally O(log n) per row; capacity validation adds a per-owner O(n) scan/count in the current design. The in-memory O(b) validation figure is not a total database import cost.

Cloud retrieval uses 500-record pages up to 10,000 rows. The browser then rebuilds indexes in O(n log n). Full cloud hydration has O(n) transfer/storage plus O(ceil(n/500)) HTTP calls; network latency is environment-dependent. History reads are capped at 20 imports plus 20 runs, indexed by owner/timestamp.

Allocation and Dijkstra execute with the same core implementation in Node, then persist a bounded JSON result. Their DSA costs remain the same; serialization, Auth verification and database writes add overhead. API sessions consume O(s) server memory for s active sessions (bounded at 1,000), are not persistent across restart, and are unsuitable for independent production instances without a shared session store.
