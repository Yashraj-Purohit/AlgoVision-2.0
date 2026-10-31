/** Explicit, dependency-free DSA implementations. Costs documented in docs/COMPLEXITY.md. */
export class Queue {
  constructor(capacity = 5000) {
    if (!Number.isInteger(capacity) || capacity < 1) throw new Error('Invalid queue capacity');
    this.capacity = capacity; this.items = new Map(); this.head = 0; this.tail = 0;
  }
  get size() { return this.tail - this.head; }
  enqueue(value) {
    if (this.size >= this.capacity) throw new Error('Queue capacity exceeded');
    this.items.set(this.tail++, value);
  }
  dequeue() {
    if (!this.size) return undefined;
    const value = this.items.get(this.head); this.items.delete(this.head++);
    if (!this.size) this.head = this.tail = 0;
    return value;
  }
}

/** Binary heap; comparator(a,b) < 0 means a has higher priority. */
export class Heap {
  constructor(compare = (a, b) => a - b) { this.values = []; this.compare = compare; }
  get size() { return this.values.length; }
  peek() { return this.values[0]; }
  push(value) {
    const a = this.values; a.push(value); let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.compare(a[p], a[i]) <= 0) break;
      [a[p], a[i]] = [a[i], a[p]]; i = p;
    }
  }
  pop() {
    const a = this.values;
    if (!a.length) return undefined;
    const result = a[0], last = a.pop();
    if (a.length) {
      a[0] = last; let i = 0;
      while (true) {
        let best = i, l = i * 2 + 1, r = l + 1;
        if (l < a.length && this.compare(a[l], a[best]) < 0) best = l;
        if (r < a.length && this.compare(a[r], a[best]) < 0) best = r;
        if (best === i) break;
        [a[i], a[best]] = [a[best], a[i]]; i = best;
      }
    }
    return result;
  }
}

/** Balanced BST rebuilt from sorted records after a catalog mutation. Duplicate keys share a node. */
export class PriceBST {
  constructor(records = []) {
    const sorted = [...records].sort((a, b) => a.price - b.price || a.id.localeCompare(b.id));
    const groups = [];
    for (const record of sorted) {
      const last = groups.at(-1);
      if (last?.key === record.price) last.records.push(record);
      else groups.push({ key: record.price, records: [record] });
    }
    const build = (lo, hi) => {
      if (lo > hi) return null;
      const mid = (lo + hi) >> 1;
      return { ...groups[mid], left: build(lo, mid - 1), right: build(mid + 1, hi) };
    };
    this.root = build(0, groups.length - 1);
  }
  range(min, max) {
    if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) throw new Error('Invalid price range');
    const records = []; let visited = 0;
    const visit = node => {
      if (!node) return;
      visited++;
      if (min < node.key) visit(node.left);
      if (node.key >= min && node.key <= max) records.push(...node.records);
      if (max > node.key) visit(node.right);
    };
    visit(this.root); return { records, visited };
  }
}

export function validateProduct(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) throw new Error('Record must be an object');
  const { id, name, category, price, stock, priority } = record;
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,32}$/.test(id)) throw new Error('ID must be 1–32 letters, numbers, hyphens or underscores');
  if (typeof name !== 'string' || !name.trim() || name.length > 100) throw new Error('Name is required (maximum 100 characters)');
  if (typeof category !== 'string' || !category.trim() || category.length > 40) throw new Error('Category is required (maximum 40 characters)');
  if (!Number.isFinite(price) || price < 0 || price > 10000000) throw new Error('Price must be between 0 and 10,000,000');
  if (!Number.isSafeInteger(stock) || stock < 0 || stock > 1000000) throw new Error('Stock must be an integer between 0 and 1,000,000');
  if (!Number.isInteger(priority) || priority < 1 || priority > 10) throw new Error('Priority must be an integer from 1 to 10');
  return { id, name: name.trim(), category: category.trim(), price, stock, priority };
}

export class Catalog {
  constructor(records = []) { this.records = []; this.byId = new Map(); this.ingest(records); }
  ingest(records) {
    if (!Array.isArray(records) || records.length > 5000) throw new Error('Import must be an array of at most 5,000 records');
    if (this.records.length + records.length > 10000) throw new Error('Catalog capacity is 10,000 records; remove records or reset first');
    const queue = new Queue(), errors = []; let accepted = 0, duplicates = 0;
    records.forEach((record, index) => queue.enqueue({ record, index }));
    while (queue.size) {
      const { record, index } = queue.dequeue();
      try {
        const clean = validateProduct(record);
        if (this.byId.has(clean.id)) { duplicates++; continue; }
        this.records.push(clean); this.byId.set(clean.id, clean); accepted++;
      } catch (error) { errors.push({ row: index + 1, message: error.message }); }
    }
    if (accepted || !this.tree) this.tree = new PriceBST(this.records);
    return { accepted, duplicates, errors, processed: records.length };
  }
  find(id) { return this.byId.get(id); }
  remove(id) {
    if (!this.byId.delete(id)) return false;
    this.records = this.records.filter(record => record.id !== id);
    this.tree = new PriceBST(this.records); return true;
  }
  top(k = 5) {
    if (!Number.isInteger(k) || k < 0) throw new Error('k must be a nonnegative integer');
    if (!k) return [];
    const compare = (a, b) => a.priority - b.priority || b.id.localeCompare(a.id);
    const heap = new Heap(compare);
    for (const record of this.records) {
      heap.push(record); if (heap.size > k) heap.pop();
    }
    const result = []; while (heap.size) result.push(heap.pop()); return result.reverse();
  }
}

function validateAllocation(items, budget) {
  if (!Number.isInteger(budget) || budget < 0 || budget > 10000) throw new Error('Budget must be an integer from 0 to 10,000 units');
  if (!Array.isArray(items) || items.length > 100) throw new Error('Use at most 100 investment opportunities');
  const ids = new Set();
  for (const item of items) {
    if (!item || typeof item.id !== 'string' || !item.id || ids.has(item.id)) throw new Error('Opportunity IDs must be unique nonempty strings');
    ids.add(item.id);
    if (!Number.isInteger(item.cost) || item.cost <= 0 || item.cost > 10000 || !Number.isFinite(item.value) || item.value < 0 || item.value > 1000000) throw new Error('Costs must be positive integers ≤10,000; values must be between 0 and 1,000,000');
  }
}

/** 0/1 knapsack. Each opportunity may be selected once, in full. */
export function knapsack(items, budget) {
  validateAllocation(items, budget);
  const dp = Array.from({ length: items.length + 1 }, () => new Float64Array(budget + 1));
  for (let i = 1; i <= items.length; i++) {
    const item = items[i - 1];
    for (let b = 0; b <= budget; b++) {
      dp[i][b] = dp[i - 1][b];
      if (item.cost <= b) dp[i][b] = Math.max(dp[i][b], dp[i - 1][b - item.cost] + item.value);
    }
  }
  const selected = []; let b = budget;
  for (let i = items.length; i > 0; i--) {
    if (dp[i][b] > dp[i - 1][b]) { selected.push(items[i - 1]); b -= items[i - 1].cost; }
  }
  selected.reverse();
  return { selected, value: dp[items.length][budget], cost: budget - b, cells: (items.length + 1) * (budget + 1) };
}

/** Ratio greedy for indivisible opportunities: feasible heuristic, not always optimal. */
export function greedyAllocation(items, budget, fractional = false) {
  validateAllocation(items, budget);
  const sorted = [...items].sort((a, b) => b.value / b.cost - a.value / a.cost || a.id.localeCompare(b.id));
  const selected = []; let remaining = budget, value = 0;
  for (const item of sorted) {
    const fraction = fractional ? Math.min(1, remaining / item.cost) : (item.cost <= remaining ? 1 : 0);
    if (fraction > 0) { selected.push({ ...item, fraction }); remaining -= item.cost * fraction; value += item.value * fraction; }
  }
  return { selected, cost: budget - remaining, value };
}

export class Graph {
  constructor(nodes, edges) {
    if (!Array.isArray(nodes) || !Array.isArray(edges)) throw new Error('Graph requires nodes and edges');
    this.adj = new Map(); this.edges = [];
    for (const node of nodes) {
      if (typeof node !== 'string' || !node || this.adj.has(node)) throw new Error('Nodes must be unique strings');
      this.adj.set(node, []);
    }
    for (const edge of edges) {
      if (!Array.isArray(edge) || edge.length !== 3) throw new Error('Invalid edge');
      const [from, to, weight] = edge;
      if (!this.adj.has(from) || !this.adj.has(to) || !Number.isFinite(weight) || weight < 0) throw new Error('Edges require known nodes and nonnegative weights');
      this.adj.get(from).push({ to, weight }); this.adj.get(to).push({ to: from, weight }); this.edges.push([...edge]);
    }
  }
  shortestPath(source, target) {
    if (!this.adj.has(source) || !this.adj.has(target)) throw new Error('Unknown route endpoint');
    const distances = new Map([...this.adj.keys()].map(node => [node, Infinity]));
    const previous = new Map(), queue = new Heap((a, b) => a.distance - b.distance); let settled = 0;
    distances.set(source, 0); queue.push({ node: source, distance: 0 });
    while (queue.size) {
      const { node, distance } = queue.pop();
      if (distance !== distances.get(node)) continue;
      settled++;
      if (node === target) break;
      for (const edge of this.adj.get(node)) {
        const candidate = distance + edge.weight;
        if (candidate < distances.get(edge.to)) {
          distances.set(edge.to, candidate); previous.set(edge.to, node); queue.push({ node: edge.to, distance: candidate });
        }
      }
    }
    if (!Number.isFinite(distances.get(target))) return { path: [], distance: Infinity, settled };
    const path = []; let current = target;
    while (current !== undefined) { path.push(current); current = previous.get(current); }
    return { path: path.reverse(), distance: distances.get(target), settled };
  }
}
