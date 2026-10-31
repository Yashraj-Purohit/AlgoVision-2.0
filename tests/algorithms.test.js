import test from 'node:test';
import assert from 'node:assert/strict';
import {Queue,Heap,PriceBST,Catalog,validateProduct,knapsack,greedyAllocation,Graph} from '../src/algorithms.js';
import {products,nodes,edges} from '../src/sample-data.js';
const product=(id,price=10)=>({id,name:id,category:'Test',price,stock:1,priority:5});
test('FIFO queue: ordering, empty state, capacity and reuse',()=>{
 const q=new Queue(2);q.enqueue('a');q.enqueue('b');assert.throws(()=>q.enqueue('c'));assert.equal(q.dequeue(),'a');q.enqueue('c');assert.equal(q.dequeue(),'b');assert.equal(q.dequeue(),'c');assert.equal(q.dequeue(),undefined);assert.equal(q.size,0);q.enqueue('d');assert.equal(q.dequeue(),'d');assert.throws(()=>new Queue(0));
});
test('heap agrees with sorted reference across mixed push/pop operations',()=>{
 const heap=new Heap(),reference=[];let state=42;
 for(let i=0;i<1000;i++){state=(state*1664525+1013904223)>>>0;if(state%3||!reference.length){const n=state%997;heap.push(n);reference.push(n);reference.sort((a,b)=>a-b);}else assert.equal(heap.pop(),reference.shift());assert.equal(heap.peek(),reference[0]);}
 while(reference.length)assert.equal(heap.pop(),reference.shift());assert.equal(heap.pop(),undefined);
});
test('BST includes equal-price records and agrees with scan for every range',()=>{
 const records=Array.from({length:200},(_,i)=>product(`P${i}`,i%31));const tree=new PriceBST(records);
 for(let min=0;min<=31;min++)for(let max=min;max<=31;max++) assert.deepEqual(tree.range(min,max).records.map(p=>p.id).sort(),records.filter(p=>p.price>=min&&p.price<=max).map(p=>p.id).sort());
 assert.throws(()=>tree.range(10,1));assert.deepEqual(new PriceBST().range(0,10).records,[]);
});
test('catalog import rejects invalid rows, deduplicates within batch, maintains indexes after delete',()=>{
 const c=new Catalog();const r=c.ingest([product('A'),product('A'),product('B',20),{...product('C'),stock:-1},null]);
 assert.deepEqual([r.accepted,r.duplicates,r.errors.length,r.processed],[2,1,2,5]);assert.equal(c.find('A').price,10);assert.equal(c.tree.range(10,20).records.length,2);assert.equal(c.remove('A'),true);assert.equal(c.find('A'),undefined);assert.equal(c.remove('A'),false);assert.equal(c.tree.range(0,100).records.length,1);assert.throws(()=>c.ingest({}));assert.throws(()=>validateProduct({...product('x'),price:Infinity}));assert.throws(()=>validateProduct({...product('x'),priority:11}));
});
test('top K matches independent sort, deterministic ties, k boundaries',()=>{
 const c=new Catalog(products);for(const k of [0,1,5,12,20])assert.deepEqual(c.top(k),[...products].sort((a,b)=>b.priority-a.priority||a.id.localeCompare(b.id)).slice(0,k));assert.throws(()=>c.top(-1));
});
test('DP beats greedy on known counterexample and respects fractional upper bound',()=>{
 const items=[{id:'A',cost:10,value:60},{id:'B',cost:20,value:100},{id:'C',cost:30,value:120}];const exact=knapsack(items,50);assert.equal(exact.value,220);assert.equal(exact.cost,50);assert.deepEqual(exact.selected.map(i=>i.id),['B','C']);assert.equal(greedyAllocation(items,50).value,160);assert.equal(greedyAllocation(items,50,true).value,240);assert.equal(knapsack(items,0).value,0);assert.equal(knapsack([],50).value,0);
});
test('DP equals exhaustive subset optimum on 60 deterministic cases',()=>{
 for(let seed=1;seed<=60;seed++){
 const items=Array.from({length:8},(_,i)=>({id:String(i),cost:(seed*7+i*11)%20+1,value:(seed*13+i*17)%100})),budget=seed%45;let best=0;
 for(let mask=0;mask<1<<items.length;mask++){let cost=0,value=0;items.forEach((item,i)=>{if(mask&(1<<i)){cost+=item.cost;value+=item.value;}});if(cost<=budget)best=Math.max(best,value);}
 const exact=knapsack(items,budget),greedy=greedyAllocation(items,budget);assert.equal(exact.value,best);assert.ok(exact.cost<=budget);assert.equal(exact.selected.reduce((s,i)=>s+i.value,0),best);assert.ok(greedy.value<=best);assert.ok(greedyAllocation(items,budget,true).value+1e-8>=best);
 }
});
test('allocation validation prevents ambiguous or unbounded inputs',()=>{
 for(const items of [[{id:'a',cost:0,value:2}],[{id:'a',cost:1.5,value:2}],[{id:'a',cost:1,value:-1}],[{id:'a',cost:1,value:2},{id:'a',cost:2,value:3}]])assert.throws(()=>knapsack(items,10));assert.throws(()=>knapsack([],10001));assert.throws(()=>knapsack([],1.5));
});
test('Dijkstra covers weighted improvement, same endpoint, disconnected, zero weights',()=>{
 const g=new Graph(['a','b','c','d','z'],[['a','b',10],['a','c',1],['c','b',2],['b','d',0]]);assert.deepEqual(g.shortestPath('a','d').path,['a','c','b','d']);assert.equal(g.shortestPath('a','d').distance,3);assert.equal(g.shortestPath('a','a').distance,0);assert.deepEqual(g.shortestPath('a','a').path,['a']);assert.equal(g.shortestPath('a','z').distance,Infinity);assert.deepEqual(g.shortestPath('a','z').path,[]);assert.throws(()=>g.shortestPath('x','a'));assert.throws(()=>new Graph(['a','b'],[['a','b',-1]]));
});
test('Dijkstra all-pairs distances equal independent Floyd-Warshall reference',()=>{
 const g=new Graph(nodes,edges),dist=nodes.map((a,i)=>nodes.map((b,j)=>i===j?0:Infinity));for(const[a,b,w]of edges){const i=nodes.indexOf(a),j=nodes.indexOf(b);dist[i][j]=dist[j][i]=w;}
 for(let k=0;k<nodes.length;k++)for(let i=0;i<nodes.length;i++)for(let j=0;j<nodes.length;j++)dist[i][j]=Math.min(dist[i][j],dist[i][k]+dist[k][j]);
 for(let i=0;i<nodes.length;i++)for(let j=0;j<nodes.length;j++)assert.equal(g.shortestPath(nodes[i],nodes[j]).distance,dist[i][j]);
});
