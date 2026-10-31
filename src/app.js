import { Catalog, Graph, knapsack, greedyAllocation } from './algorithms.js';
import { products, opportunities, nodes, edges, positions } from './sample-data.js';
import { cloud, api, session, requireCloudUser } from './cloud.js';
const $ = selector => document.querySelector(selector);
const esc = value => String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const money = value => new Intl.NumberFormat('en-IN', {style:'currency',currency:'INR',maximumFractionDigits:2,minimumFractionDigits:0}).format(value);
const num = value => new Intl.NumberFormat('en-IN', {maximumFractionDigits:2}).format(value);
const key = 'algovision.catalog.v1';
let pendingCatalogQuery='';
const icon = name => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
let catalog, startupMessage = '', storageAvailable = true;
try {
  const saved = localStorage.getItem(key);
  if (saved) {
    const parsed = JSON.parse(saved);
    if (parsed.version !== 1 || !Array.isArray(parsed.records) || parsed.records.length > 10000) throw new Error('Invalid saved data');
    parsed.records.forEach(record => { if (!record || typeof record.id !== 'string') throw new Error('Invalid record'); });
    catalog = new Catalog();
    for (let i = 0; i < parsed.records.length; i += 5000) {
      const report = catalog.ingest(parsed.records.slice(i, i + 5000));
      if (report.errors.length || report.duplicates) throw new Error('Saved catalog failed validation');
    }
  } else catalog = new Catalog(products);
} catch { catalog = new Catalog(products); startupMessage = 'Saved data could not be loaded. Sample data restored; export your catalog to keep a backup.'; }
const graph = new Graph(nodes, edges);
let importReport = null, lastRoute = graph.shortestPath('Hub','Port'), lastAllocation = null;
let toastTimer;
function toast(message) { $('#toast').textContent = message; $('#toast').style.display = 'block'; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').style.display = 'none', 5500); }
function persist() {
  if (cloud.configured !== false) return;
  try { localStorage.setItem(key, JSON.stringify({version:1,records:catalog.records})); storageAvailable = true; }
  catch { storageAvailable = false; toast('Browser storage is unavailable or full. Export your catalog before closing this tab.'); }
}
let mutationBusy = false;
async function cloudCatalog() {
  const {records}=await api('/api/products');
  const next=new Catalog();
  for(let i=0;i<records.length;i+=5000)next.ingest(records.slice(i,i+5000));
  catalog=next;
}
function cloudStatus() {
  $('#backend-status').textContent=cloud.configured===null?'Backend unavailable':cloud.configured?(cloud.user?'Supabase connected':'Sign in to Supabase'):'Demo workspace';
  $('#backend-detail').textContent=cloud.configured===false?'Cloud setup pending':cloud.user?'Private cloud catalog':cloud.configured?'Cloud workspace locked':'Refresh to retry';
  $('#cloud-banner').textContent=cloud.error || (cloud.configured===false?'Demo mode — Supabase is not configured. Account & history shows the backend setup status.':cloud.configured&&!cloud.user?'Sign in to load your workspace. Open Account & history to continue.':'');
  $('#cloud-banner').hidden=!$('#cloud-banner').textContent;
}
async function removeProduct(id) {
  if(mutationBusy)return;mutationBusy=true;
  try {requireCloudUser();if(cloud.configured){await api('/api/products/'+encodeURIComponent(id),{method:'DELETE'});await cloudCatalog();}else{catalog.remove(id);persist();}render();toast('Product removed. Price index rebuilt.');}
  catch(e){toast(e.message);cloudStatus();}finally{mutationBusy=false;}
}
function download(name, data) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data,null,2)], {type:'application/json'}));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function header(eyebrow, title, subtitle, action = '') {
  return `<div class="page-head"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p class="sub">${subtitle}</p></div>${action}</div>`;
}
function metric(label,value,detail,symbol='chart') {
  return `<div class="metric"><div class="metric-label">${label}${icon(symbol)}</div><strong>${value}</strong><small>${detail}</small></div>`;
}
function card(title,tag,body,cls='') { return `<section class="card ${cls}"><div class="card-head"><h2>${title}</h2>${tag}</div>${body}</section>`; }
function table(records, removable = false) {
  return `<div class="table-scroll"><table><thead><tr><th>Product</th><th>Category</th><th>Unit price</th><th>Stock</th><th>Priority</th>${removable?'<th></th>':''}</tr></thead><tbody>${records.map(p=>`<tr><td><div class="product-cell"><span class="product-thumbnail">${icon('box')}</span><span><strong>${esc(p.name)}</strong><small>${esc(p.id)}</small></span></div></td><td>${esc(p.category)}</td><td>${money(p.price)}</td><td><span class="stock ${p.stock<15?'low':''}">${num(p.stock)}${p.stock<15?' · Low':''}</span></td><td><span class="priority-label ${p.priority>=8?'high':''}">${p.priority} / 10</span></td>${removable?`<td><button class="inline-button delete" data-id="${esc(p.id)}" aria-label="Remove ${esc(p.name)}">Remove</button></td>`:''}</tr>`).join('')||`<tr><td colspan="${removable?6:5}" class="empty">${cloud.configured&&!cloud.user?'Sign in to load your catalog.':'No matching products. Import data to get started.'}</td></tr>`}</tbody></table></div>`;
}
function bars() {
  const counts=new Map();catalog.records.forEach(p=>counts.set(p.category,(counts.get(p.category)||0)+1));
  const pairs=[...counts].sort((a,b)=>b[1]-a[1]).slice(0,6),total=catalog.records.length;
  if(!pairs.length)return '<p class="empty">Category breakdown will appear after products are loaded.</p>';
  return `<div class="category-list">${pairs.map(([name,count])=>`<div class="category-item"><div class="category-heading"><span>${esc(name)}</span><span>${count} products · ${Math.round(count/total*100)}%</span></div><div class="category-track" role="img" aria-label="${esc(name)}: ${count} of ${total} products"><span style="width:${count/total*100}%"></span></div></div>`).join('')}</div>`;
}
function routeSVG(route = lastRoute) {
  const selected = new Set(route.path.slice(1).map((n,i) => [route.path[i],n].sort().join('|')));
  return `<svg viewBox="0 0 680 395" class="route-svg" role="img" aria-label="Delivery network. Selected route: ${esc(route.path.join(' to '))}, distance ${route.distance} kilometers.">${edges.map(([a,b,w]) => {
    const [x1,y1]=positions[a],[x2,y2]=positions[b],active=selected.has([a,b].sort().join('|'));
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${active?'#2563eb':'#d0d8e5'}" stroke-width="${active?4:2}"/><rect x="${(x1+x2)/2-11}" y="${(y1+y2)/2-9}" width="22" height="18" rx="4" fill="#fff"/><text x="${(x1+x2)/2}" y="${(y1+y2)/2+4}" text-anchor="middle" fill="#7c8798">${w}</text>`;
  }).join('')}${nodes.map(n=>{ const [x,y]=positions[n],active=route.path.includes(n);return `<circle cx="${x}" cy="${y}" r="19" fill="${active?'#2563eb':'#ffffff'}" stroke="${active?'#2563eb':'#c5cfdd'}" stroke-width="2"/><text x="${x}" y="${y+4}" text-anchor="middle" fill="${active?'#ffffff':'#667085'}">${n[0]}</text><text x="${x}" y="${y+36}" text-anchor="middle" fill="#667085">${n}</text>`;}).join('')}</svg>`;
}
function overview() {
  const stock=catalog.records.reduce((s,p)=>s+p.stock,0),value=catalog.records.reduce((s,p)=>s+p.stock*p.price,0),low=catalog.records.filter(p=>p.stock<15).length;
  const locked=cloud.configured&&!cloud.user;
  $('#main').innerHTML=header('Workspace overview','Overview','Inventory, product priorities, and planning tools.',`<div class="page-actions"><button class="button secondary" id="overview-export">${icon('box')} Export catalog</button><a class="button" href="#ingestion">${icon('import')} Import products</a></div>`)+
  `<div class="workspace-summary"><span><span class="status-dot"></span>${cloud.configured?(cloud.user?'Cloud workspace':'Sign-in required'):'Local demo workspace'}</span><i></i><span>Synthetic dataset</span><i></i><span>Values reflect the current catalog</span></div>`+
  `<div class="metrics">${metric('Total products',locked?'—':num(catalog.records.length),'Unique product records','box')}${metric('Inventory value',locked?'—':money(value),'Unit price × available stock','chart')}${metric('Units in stock',locked?'—':num(stock),'Across all catalog categories','grid')}${metric('Low-stock products',locked?'—':num(low),'Products with fewer than 15 units','box')}</div>`+
  `<div class="grid">${card('Product priorities',`<a href="#search">View ranking</a>`,table(catalog.top(5))+`<div class="table-footer"><span>Top ${Math.min(5,catalog.records.length)} products by priority</span><a href="#catalog" style="text-decoration:none;color:#2563eb">View catalog</a></div>`)}${card('Products by category',`<span class="tag">${new Set(catalog.records.map(p=>p.category)).size} categories</span>`,`<div class="card-body">${bars()}</div><div class="panel-footer">Distribution by product count</div>`)}</div>`+
  card('Planning tools','<span class="tag">Available modules</span>',`<div class="module-list"><a class="module-link" href="#optimizer">${icon('chart')}<div><strong>Capital allocation</strong><p>Compare greedy and exact allocations against a fixed budget.</p><span>Open optimizer →</span></div></a><a class="module-link" href="#routes">${icon('route')}<div><strong>Delivery routes</strong><p>Find the shortest path through the delivery network.</p><span>Plan route →</span></div></a><a class="module-link" href="#search">${icon('search')}<div><strong>Search & ranking</strong><p>Look up products by ID, price range, or priority.</p><span>Search products →</span></div></a></div>`)+
  card('Recent activity','<a href="#account">Account & history</a>',`<div id="history">${cloud.user?'<p class="empty">Loading saved activity…</p>':`<div class="empty">${cloud.configured?'Sign in to view your saved imports and planning runs.':'Saved activity is available in the cloud workspace.'} <a href="#account">${cloud.configured?'Sign in':'View connection status'}</a></div>`}</div>`);
  $('#overview-export').onclick=()=>download('algovision-products.json',catalog.records);
  if(cloud.user)loadHistory();
}
function catalogPage() {
  $('#main').innerHTML = header('Workspace / Products','Product catalog','Manage products, stock levels, and priorities.', '<a class="button" href="#ingestion">Add products</a>')+
  card('Catalog controls',`<span class="tag">${catalog.records.length} RECORDS</span>`,`<div class="card-body"><div class="form-row"><label>Filter by name or ID<input id="filter" placeholder="Try headphones or AV-101" maxlength="100"></label><label>Category<select id="category"><option value="">All categories</option>${[...new Set(catalog.records.map(p=>p.category))].sort().map(c=>`<option>${esc(c)}</option>`).join('')}</select></label><label>Sort by<select id="sort"><option value="name">Name</option><option value="price">Price: low to high</option><option value="stock">Stock: low to high</option></select></label></div><p class="helper" id="catalog-count"></p></div><div id="catalog-table"></div>`);
  function update() {
    const term = $('#filter').value.toLowerCase(), cat = $('#category').value, sort = $('#sort').value;
    const records = catalog.records.filter(p => (!cat||p.category===cat) && (p.name.toLowerCase().includes(term)||p.id.toLowerCase().includes(term))).sort((a,b)=>sort==='name'?a.name.localeCompare(b.name):a[sort]-b[sort]);
    $('#catalog-count').textContent = `${records.length} product${records.length===1?'':'s'} match${records.length===1?'es':''} · showing ${Math.min(100,records.length)} of ${records.length}`;
    $('#catalog-table').innerHTML = table(records.slice(0,100),true);
    document.querySelectorAll('.delete').forEach(button => button.onclick = () => removeProduct(button.dataset.id));
  }
  ['#filter','#category','#sort'].forEach(s => $(s).addEventListener('input',update));
  if(pendingCatalogQuery){$('#filter').value=pendingCatalogQuery;pendingCatalogQuery='';}
  update();
}
function ingestion() {
  $('#main').innerHTML = header('Workspace / Imports','Data imports','Add individual products or import a batch. Duplicate IDs are skipped.')+
  `<div class="grid equal">${card('Add a product','<span class="tag">Single record</span>',`<div class="card-body"><form id="add-form"><div class="form-row"><label>Product ID<input name="id" placeholder="AV-113" pattern="[A-Za-z0-9_-]{1,32}" maxlength="32" required></label><label>Product name<input name="name" placeholder="Portable Speaker" maxlength="100" required></label></div><div class="form-row"><label>Category<input name="category" placeholder="Electronics" maxlength="40" required></label><label>Price (₹)<input name="price" type="number" min="0" max="10000000" step="0.01" value="1499" required></label></div><div class="form-row"><label>Stock<input name="stock" type="number" min="0" max="1000000" step="1" value="20" required></label><label>Priority (1–10)<input name="priority" type="number" min="1" max="10" step="1" value="7" required></label></div><button class="button" type="submit">Add product</button></form><p class="helper">IDs are case-sensitive. Existing IDs are skipped; imports never overwrite products.</p></div>`)}${card('Batch import','<span class="tag">JSON · up to 5,000 rows</span>',`<div class="card-body"><label>Upload a JSON array<input id="file" type="file" accept=".json,application/json"></label><p class="helper">Maximum file size: 2 MB. Catalog limit: 10,000 rows. Required fields: id, name, category, price, stock, priority.</p><label>Or paste JSON<textarea id="json" rows="7" spellcheck="false" aria-label="JSON records">${esc(JSON.stringify([{id:'AV-113',name:'Portable Speaker',category:'Electronics',price:1499,stock:20,priority:7}],null,2))}</textarea></label><div class="row"><button class="button secondary" id="import">Import products</button><button class="button secondary" id="sample-download">Download sample</button></div></div>`)}</div>`+
  card('Processing receipt','<span class="tag">Import results</span>',`<div class="card-body" id="receipt">${reportHTML()}</div>`);
  $('#add-form').onsubmit = event => { event.preventDefault(); const record=Object.fromEntries(new FormData(event.target)); ['price','stock','priority'].forEach(k=>record[k]=Number(record[k])); process([record]); };
  $('#import').onclick = () => { try { if ($('#json').value.length>2000000) throw new Error('JSON exceeds 2 MB input limit'); process(JSON.parse($('#json').value)); } catch(error){showImportError(error);} };
  $('#file').onchange = async event => {
    const file=event.target.files[0]; if (!file) return;
    try { if(file.size>2000000) throw new Error('File exceeds 2 MB limit'); process(JSON.parse(await file.text())); } catch(error) {showImportError(error);}
    event.target.value='';
  };
  $('#sample-download').onclick = () => download('algovision-sample-products.json',products);
}
function showImportError(error) { $('#receipt').innerHTML = `<div class="result error">${esc(error.message)}</div>`; }
async function process(records) {
  if(mutationBusy)return;mutationBusy=true;
  const receipt=$('#receipt');
  try {
    requireCloudUser();
    if(cloud.configured){
      importReport=await api('/api/imports',{method:'POST',body:{records}});
      try {await cloudCatalog();}catch(e){toast('Import committed, but refresh failed. Refresh the page before continuing.');}
    } else {const start=performance.now();const report=catalog.ingest(records);importReport={...report,ms:performance.now()-start};persist();}
    if(receipt?.isConnected)receipt.innerHTML=reportHTML();
    toast(`${importReport.accepted} accepted · ${importReport.duplicates} duplicates · ${importReport.errors.length} invalid`);
  } catch(error) {if(receipt?.isConnected)receipt.innerHTML=`<div class="result error">${esc(error.message)}</div>`;cloudStatus();}
  finally {mutationBusy=false;}
}
function reportHTML() {
  if(!importReport) return '<p class="helper">Submit a product or a batch to see real processing results here. The queue is drained synchronously; no background job remains pending.</p>';
  const r=importReport;
  return `<div class="kpi-row"><div><small>Processed</small><b>${r.processed}</b></div><div><small>Accepted</small><b>${r.accepted}</b></div><div><small>Duplicates skipped</small><b>${r.duplicates}</b></div><div><small>Invalid rows</small><b>${r.errors.length}</b></div></div><p class="helper">Measured processing: ${r.ms.toFixed(3)} ms. ${cloud.configured?'Committed to Supabase.':storageAvailable?'Saved in this demo browser.':'Storage unavailable; export to keep changes.'}</p>${r.errors.length?`<div class="result error">${r.errors.slice(0,20).map(e=>`Row ${e.row}: ${esc(e.message)}`).join('<br>')}${r.errors.length>20?'<br>Showing first 20 errors.':''}</div>`:''}`;
}
function searchPage() {
  $('#main').innerHTML = header('Workspace / Search','Search & ranking','Find products by ID or price range and review priority rankings.')+
  `<div class="grid equal">${card('Exact ID lookup','<span class="tag">Hash index</span>',`<div class="card-body"><form id="id-form" class="form-row"><label>Product ID<input id="lookup" value="AV-101" maxlength="32" required></label><button class="button">Find product</button></form><div id="id-result"></div></div>`)}${card('Priority shortlist','<span class="tag">Min-heap</span>',`<div class="card-body"><form id="top-form" class="form-row"><label>Top K products<input id="k" type="number" min="1" max="20" value="5" required></label><button class="button">Rank products</button></form><div id="top-result"></div></div>`)}</div>`+
  card('Price-range explorer','<span class="tag">Balanced BST</span>',`<div class="card-body"><form id="range-form" class="form-row"><label>Minimum price (₹)<input id="min" type="number" min="0" max="10000000" step="0.01" value="500" required></label><label>Maximum price (₹)<input id="max" type="number" min="0" max="10000000" step="0.01" value="2000" required></label><button class="button">Search price range</button></form><p class="helper" id="range-info"></p><div id="range-error"></div></div><div id="range-result"></div>`);
  const lookup = event => { event?.preventDefault(); const p=catalog.find($('#lookup').value.trim()); $('#id-result').innerHTML=p?`<div class="result"><strong>${esc(p.name)}</strong><br>${money(p.price)} · ${p.stock} units · Priority ${p.priority}</div>`:'<div class="result">No product matches this ID.</div>'; };
  const top = event => { event?.preventDefault(); try { const k=Number($('#k').value); if(k<1||k>20) throw new Error('K must be from 1 to 20'); const records=catalog.top(k); $('#top-result').innerHTML=`<ul class="mini-list">${records.map((p,i)=>`<li><span>${i+1}. ${esc(p.name)}</span><span class="tag">${p.priority}/10</span></li>`).join('')||'<li>No products yet.</li>'}</ul><p class="helper">O(n log k) time · O(k) heap storage. Ties use ascending product ID.</p>`; } catch(e) {toast(e.message);} };
  const range = event => { event?.preventDefault(); try { const start=performance.now(),result=catalog.tree.range(Number($('#min').value),Number($('#max').value)); const ms=performance.now()-start; $('#range-error').innerHTML=''; $('#range-info').textContent=`${result.records.length} matches · ${result.visited} distinct price nodes visited · ${ms.toFixed(3)} ms · first 100 shown`; $('#range-result').innerHTML=table(result.records.slice(0,100)); } catch(e) {$('#range-result').innerHTML='';$('#range-info').textContent='';$('#range-error').innerHTML=`<div class="result error">${esc(e.message)}</div>`;} };
  $('#id-form').onsubmit=lookup; $('#top-form').onsubmit=top; $('#range-form').onsubmit=range; lookup();top();range();
}
function setupOpportunityEditor(initial) {
  let items=initial.map(item=>({...item})),sequence=1;
  const serialize=()=>{$('#opportunities').value=JSON.stringify(items,null,2);};
  function draw() {
    $('#opportunity-editor').innerHTML=`<table class="opportunity-table"><thead><tr><th>Opportunity</th><th>Cost units</th><th>Benefit</th><th></th></tr></thead><tbody>${items.map((item,i)=>`<tr><td><input data-row="${i}" data-field="name" aria-label="Opportunity ${i+1} name" value="${esc(item.name||item.id)}" required maxlength="100"></td><td><input data-row="${i}" data-field="cost" aria-label="Opportunity ${i+1} cost" type="number" min="1" max="10000" step="1" required value="${item.cost}"></td><td><input data-row="${i}" data-field="value" aria-label="Opportunity ${i+1} benefit" type="number" min="0" max="1000000" step="any" required value="${item.value}"></td><td><button type="button" class="inline-button remove-opportunity" data-row="${i}" aria-label="Remove opportunity ${i+1}">Remove</button></td></tr>`).join('')||'<tr><td colspan="4" class="empty">No opportunities. Add one to begin.</td></tr>'}</tbody></table>`;
    $('#opportunity-editor').querySelectorAll('input').forEach(input=>input.oninput=()=>{items[Number(input.dataset.row)][input.dataset.field]=input.dataset.field==='name'?input.value:Number(input.value);serialize();});
    $('#opportunity-editor').querySelectorAll('.remove-opportunity').forEach(button=>button.onclick=()=>{items.splice(Number(button.dataset.row),1);serialize();draw();});
    $('#add-opportunity').disabled=items.length>=100;
  }
  $('#add-opportunity').onclick=()=>{
    if(items.length>=100)return;
    let id;do{id='NEW-'+sequence++;}while(items.some(item=>item.id===id));
    items.push({id,name:'New opportunity',cost:10,value:25});serialize();draw();
  };
  $('#apply-opportunities').onclick=()=>{
    try {const parsed=JSON.parse($('#opportunities').value);knapsack(parsed,0);items=parsed.map(item=>({...item}));serialize();draw();toast('Opportunity table updated.');}catch(e){toast(e.message);}
  };
  serialize();draw();
}
function optimizer() {
  $('#main').innerHTML=header('Planning / Capital','Capital allocation','Compare available investments against a fixed budget.')+
  `<div class="grid equal">${card('Planning inputs','<span class="tag">0/1 knapsack</span>',`<div class="card-body"><form id="allocation-form"><label>Budget units · 1 unit = ₹1,000<input id="budget" type="number" min="0" max="10000" step="1" value="50" required></label><p class="helper">Each opportunity is selected once, in full. The benefit score is synthetic and has no financial return guarantee.</p><div class="row"><h3 style="margin:0">Investment opportunities</h3><button type="button" class="inline-button" id="add-opportunity">+ Add opportunity</button></div><div class="table-scroll" id="opportunity-editor"></div><p class="helper">Enter a whole-number cost and a benefit score for each opportunity. Maximum 100 opportunities.</p><details class="input-details"><summary>Advanced: edit or paste JSON</summary><label class="helper" for="opportunities">Opportunity data</label><textarea id="opportunities" rows="8" spellcheck="false">${esc(JSON.stringify(opportunities,null,2))}</textarea><div class="row"><button type="button" id="apply-opportunities" class="button secondary">Apply JSON to table</button></div></details><button class="button" type="submit">Run comparison</button></form></div>`)}${card('Decision comparison','<span class="tag">Comparison results</span>',`<div class="card-body" id="allocation-results"></div>`)}</div>`+
  `<div class="note">The fractional greedy solution is an upper bound that permits partial opportunities. It is displayed separately because partial funding is not allowed in the actual 0/1 decision.</div>`;
  $('#allocation-form').onsubmit=async event=>{
    event.preventDefault();
    const resultBox=$('#allocation-results'),form=event.target,button=form.querySelector('button');
    if(button.disabled)return;button.disabled=true;
    try {
      requireCloudUser();
      if($('#opportunities').value.length>100000) throw new Error('Opportunity input is too large');
      const items=JSON.parse($('#opportunities').value),budget=Number($('#budget').value);
      if(cloud.configured){lastAllocation=await api('/api/allocations',{method:'POST',body:{items,budget}});}
      else {const start=performance.now(),exact=knapsack(items,budget),dpMs=performance.now()-start;const gs=performance.now(),greedy=greedyAllocation(items,budget),greedyMs=performance.now()-gs;lastAllocation={budget,items,exact,greedy,upper:greedyAllocation(items,budget,true),dpMs,greedyMs};}
      if(!resultBox.isConnected)return;
      const {exact,greedy,upper,dpMs,greedyMs}=lastAllocation;
      const gap=exact.value-greedy.value;
      resultBox.innerHTML=`<div class="result"><span class="eyebrow">Optimal allocation · Dynamic programming</span><span class="big-number">${num(exact.value)} <small>benefit points</small></span><span>${exact.cost} / ${budget} budget units used · ${dpMs.toFixed(3)} ms</span></div><h3>Selected opportunities</h3><ul class="mini-list">${exact.selected.map(i=>`<li><span>${esc(i.name||i.id)}</span><span>${i.cost} units · ${i.value} pts</span></li>`).join('')||'<li>No opportunities selected.</li>'}</ul><div class="result" style="background:#f9fafb"><strong>Ratio greedy: ${num(greedy.value)} points</strong><br>${greedy.cost} units used · ${greedyMs.toFixed(3)} ms<br><small>${greedy.selected.map(i=>esc(i.name||i.id)).join(', ')||'No selection'}</small></div><div class="kpi-row"><div><small>DP improvement over greedy</small><b>${num(gap)} pts</b></div><div><small>Fractional upper bound</small><b>${num(upper.value)} pts</b></div></div><p class="helper">DP table: ${num(exact.cells)} cells (~${num(exact.cells*8/1024)} KiB numeric storage, plus object overhead). ${cloud.configured?'Computed on the server and saved to Supabase.':'Computed locally in demo mode.'} Timings are environment-specific.</p><button id="allocation-export" class="button secondary">Export report</button>`;
      $('#allocation-export').onclick=()=>download('algovision-allocation.json',lastAllocation);
    } catch(error) { if(resultBox.isConnected)resultBox.innerHTML=`<div class="result error">${esc(error.message)}</div>`;cloudStatus(); } finally {button.disabled=false;}
  };
  setupOpportunityEditor(opportunities);
  $('#allocation-form').requestSubmit();
}
function routes() {
  $('#main').innerHTML=header('Planning / Logistics','Delivery routes','Select an origin and destination to calculate the shortest route.')+
  `<div class="grid">${card('Delivery network','<span class="tag">Dijkstra</span>',`<div class="card-body">${routeSVG()}<div class="route-legend"><span><i></i>Selected route</span><span><i></i>Available connection</span></div><p class="helper">Edge labels are synthetic distances in kilometers. Blue edges mark the selected route. Distances are static; this is not live traffic routing.</p></div>`)}${card('Route controls','<span class="tag">7 NODES / 11 EDGES</span>',`<div class="card-body"><form id="route-form"><div class="form-row"><label>Origin<select id="origin">${nodes.map(n=>`<option>${n}</option>`).join('')}</select></label><label>Destination<select id="destination">${nodes.map(n=>`<option ${n==='Port'?'selected':''}>${n}</option>`).join('')}</select></label></div><button class="button full">Calculate route</button></form><div id="route-result"></div><div class="note">Dijkstra requires nonnegative weights. Stale heap entries are skipped; the search stops when the destination is settled.</div></div>`)}</div>`+
  card('Network edge list','<span class="tag">ADJACENCY LIST</span>',`<div class="table-scroll"><table><thead><tr><th>From</th><th>To</th><th>Distance</th></tr></thead><tbody>${edges.map(([a,b,w])=>`<tr><td>${a}</td><td>${b}</td><td>${w} km</td></tr>`).join('')}</tbody></table></div>`);
  $('#route-form').onsubmit=async event=>{
    event.preventDefault();const box=$('#route-result'),svg=$('.route-svg'),button=event.target.querySelector('button');
    if(button.disabled)return;button.disabled=true;
    try {
    requireCloudUser();const source=$('#origin').value,target=$('#destination').value;
    let ms;
    if(cloud.configured){lastRoute=await api('/api/routes',{method:'POST',body:{source,target}});ms=lastRoute.ms;}
    else {const start=performance.now();lastRoute=graph.shortestPath(source,target);ms=performance.now()-start;}
    if(!box.isConnected)return;
    svg.outerHTML=routeSVG();
    box.innerHTML=`<div class="result"><span class="eyebrow">SHORTEST DISTANCE</span><span class="big-number">${num(lastRoute.distance)} km</span><strong>${lastRoute.path.join(' → ')}</strong></div><p class="helper">${lastRoute.settled} nodes settled · ${ms.toFixed(3)} ms · ${cloud.configured?'Saved to Supabase':'Demo calculation'}</p>`;
    }catch(error){if(box.isConnected)box.innerHTML=`<div class="result error">${esc(error.message)}</div>`;cloudStatus();}finally{button.disabled=false;}
  };$('#route-form').requestSubmit();
}
function insights() {
  const rows=[['Ingestion','FIFO queue + hash index','O(b) expected, before rebuild','O(b) queue'],['Catalog','Array + hash index','Expected O(1) lookup; O(n log n) delete + rebuild','O(n)'],['Price index build','Sort + balanced BST','O(n log n) rebuild','O(n)'],['Price range','Balanced BST traversal','O(log n + m)','O(log n + m) incl. output'],['Priority top-K','Bounded min-heap','O(n log k), for k ≥ 2','O(k)'],['Capital allocation','0/1 knapsack DP','O(pB)','O(pB) incl. traceback'],['Ratio heuristic','Greedy sort + scan','O(p log p)','O(p)'],['Delivery routing','Dijkstra + lazy binary heap','O((V + E) log(V + E))','O(V + E)']];
  $('#main').innerHTML=header('Tools / Documentation','Algorithm reference','Complexity, implementation notes, and a repeatable lookup experiment.')+
  card('Complexity reference','<span class="tag">Time & space complexity</span>',`<div class="table-scroll"><table><thead><tr><th>Operation</th><th>Structure / method</th><th>Time</th><th>Auxiliary space</th></tr></thead><tbody>${rows.map(r=>`<tr>${r.map(v=>`<td>${v}</td>`).join('')}</tr>`).join('')}</tbody></table></div><div class="card-body"><p class="helper">n = catalog size; b = imported rows; m = returned records; p = opportunities; B = integer budget; V/E = graph nodes/edges. Hash operations use JavaScript Map and assume expected constant time. Rebuilds deliberately favor read-heavy workloads.</p></div>`)+
  `<div class="grid equal">${card('Indexed lookup experiment','<span class="tag">Lookup benchmark</span>',`<div class="card-body"><p class="helper">Generate deterministic synthetic IDs and compare array scans with a hash index. Index construction is measured separately. Both execute identical successful lookups.</p><form id="benchmark-form"><div class="form-row"><label>Records<select id="bench-size"><option>1000</option><option selected>10000</option><option>50000</option></select></label><button class="button">Run experiment</button></div></form><div id="bench-result" role="status"></div></div>`)}${card('Efficiency features','<span class="tag">Included optimizations</span>',`<div class="card-body"><ul class="mini-list"><li><span>Bounded top-K heap</span><span class="tag">O(k) MEMORY</span></li><li><span>Balanced bulk-built price index</span><span class="tag">NO SKEW</span></li><li><span>Lazy stale-entry skipping in routes</span><span class="tag">LESS WORK</span></li><li><span>Batch validation + duplicate rejection</span><span class="tag">DATA QUALITY</span></li><li><span>Supabase persistence + JSON exports</span><span class="tag">RECOVERABLE</span></li><li><span>Budget and import size limits</span><span class="tag">BOUNDED INPUT</span></li></ul><p class="helper">See docs/COMPLEXITY.md for limitations, design choices, and scaling improvements.</p></div>`)}</div>`;
  $('#benchmark-form').onsubmit=event=>{
    event.preventDefault();const n=Number($('#bench-size').value),q=500,records=Array.from({length:n},(_,i)=>({id:`BENCH-${i}`,value:i})),start=performance.now(),index=new Map(records.map(r=>[r.id,r])),build=performance.now()-start;
    const queries=Array.from({length:q},(_,i)=>`BENCH-${(i*7919+17)%n}`);let sumA=0,sumB=0;
    let time=performance.now();for(const id of queries)sumA+=records.find(r=>r.id===id).value;const scan=performance.now()-time;
    time=performance.now();for(const id of queries)sumB+=index.get(id).value;const hash=performance.now()-time;
    $('#bench-result').innerHTML=`<div class="result"><strong>${num(n)} records · ${q} identical lookups</strong><br>Array scans: ${scan.toFixed(3)} ms<br>Hash lookups: ${hash.toFixed(3)} ms<br>Hash build (one-time): ${build.toFixed(3)} ms<br>Results agree: ${sumA===sumB?'yes':'NO'}</div><p class="helper">One run; JIT, warm-up, browser load and clock precision affect results. This illustrates scaling; it is not a rigorous benchmark or a guaranteed speedup.</p>`;
  };
}
function account() {
  $('#main').innerHTML=header('Workspace / Account','Account & history','Manage your cloud workspace and review saved activity.')+
  card(cloud.user?'Workspace settings':'Sign in to your workspace',`<span class="tag ${cloud.configured?'success':''}">${cloud.configured===true?'Supabase configured':cloud.configured===false?'Local demo':'Connection unavailable'}</span>`,
  `<div class="card-body"><div class="auth-layout"><div>
  ${cloud.configured===false?'<p class="helper">This preview uses local sample data. Open the configured application to sign in and save data to Supabase.</p>':cloud.error?`<div class="result error">${esc(cloud.error)}</div>`:''}
  ${cloud.configured===true&&!cloud.user?`<form id="auth-form" class="auth-form"><div class="form-row"><label>Email address<input id="email" type="email" autocomplete="email" placeholder="you@example.com" required maxlength="254"></label><label>Password<input id="password" type="password" autocomplete="current-password" placeholder="Enter your password" required minlength="8" maxlength="128"></label></div><div class="auth-actions"><button class="button" name="action" value="login">Sign in</button><button class="button secondary" name="action" value="signup">Create account</button></div><p class="helper">New accounts may require email confirmation. Return here to sign in after confirming.</p></form>`:''}
  ${cloud.user?`<div class="account-state"><span class="workspace-avatar">${icon('user')}</span><div><strong>${esc(cloud.user.email||'Your account')}</strong><small>Private cloud workspace</small></div></div><div class="account-tools"><button class="button secondary" id="cloud-seed">Load sample catalog</button><button class="button secondary" id="cloud-refresh">Refresh data</button><button class="button secondary" id="migrate-local">Import local catalog</button><button class="button danger" id="logout">Sign out</button></div><p class="helper">Loading samples replaces your current catalog after confirmation. Importing local records skips existing IDs.</p>`:''}
  <div id="account-message" role="status"></div></div><div class="auth-copy"><h3>Cloud workspace</h3><p>Keep your catalog and planning results available across sign-in sessions.</p><ul class="mini-list"><li><span>Product catalog</span><span>Per-account storage</span></li><li><span>Import receipts</span><span>Saved with row errors</span></li><li><span>Allocation & route runs</span><span>Exportable results</span></li></ul><p class="helper" style="margin-top:18px">Your data is isolated by account. Demo records are never uploaded automatically.</p></div></div></div>`)+
  card('Activity history','<span class="tag">Latest 20 imports + 20 planning runs</span>','<div id="history"><p class="empty">Sign in to view saved imports and planning runs.</p></div>');
  const message=$('#account-message');
  const form=$('#auth-form');
  if(form)form.onsubmit=async event=>{
    event.preventDefault();const action=event.submitter?.value||'login';
    const buttons=[...form.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);
    try {
      const result=await api('/api/auth/'+action,{method:'POST',body:{email:$('#email').value,password:$('#password').value}});
      if(result.confirmationRequired){message.textContent=result.message;form.reset();return;}
      await session();catalog=new Catalog();await cloudCatalog();importReport=null;cloudStatus();account();toast('Cloud workspace loaded.');
    }catch(e){if(message.isConnected)message.textContent=e.message;cloudStatus();}finally{buttons.forEach(b=>b.disabled=false);}
  };
  if(cloud.user){
    $('#cloud-seed').onclick=()=>$('#reset').click();
    $('#logout').onclick=async()=>{try{await api('/api/auth/logout',{method:'POST',body:{}});cloud.user=null;catalog=new Catalog();importReport=null;await session();cloudStatus();account();}catch(e){toast(e.message);}};
    $('#cloud-refresh').onclick=async()=>{try{await cloudCatalog();toast('Cloud data refreshed.');loadHistory();}catch(e){toast(e.message);cloudStatus();}};
    $('#migrate-local').onclick=async()=>{
      if(mutationBusy)return;mutationBusy=true;
      try {const saved=JSON.parse(localStorage.getItem(key)||'{"records":[]}');if(!Array.isArray(saved.records)||!saved.records.length)throw new Error('No saved demo catalog in this browser.');
        let accepted=0;for(let i=0;i<saved.records.length;i+=5000){const result=await api('/api/imports',{method:'POST',body:{records:saved.records.slice(i,i+5000)}});accepted+=result.accepted;}
        await cloudCatalog();toast(`${accepted} demo products imported to Supabase.`);loadHistory();
      }catch(e){toast(e.message);}finally{mutationBusy=false;}
    };
    loadHistory();
  }
}
async function loadHistory() {
  const box=$('#history');if(!box)return;
  try {
    const data=await api('/api/history');if(!box.isConnected)return;
    const events=[...data.imports.map(r=>({...r,label:r.kind==='reset'?'Catalog reset':`${r.accepted} accepted / ${r.duplicates} duplicates`,type:'Import'})),...data.runs.map(r=>({...r,label:r.kind==='allocation'?`${r.payload.exact.value} benefit points / ${r.payload.budget} units`:`${r.payload.source} → ${r.payload.target}: ${r.payload.distance} km`,type:r.kind==='allocation'?'Allocation':'Route'}))].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
    box.innerHTML=events.length?`<div class="table-scroll"><table class="activity-table"><thead><tr><th>Type</th><th>Details</th><th>Recorded</th><th></th></tr></thead><tbody>${events.map(r=>`<tr><td><span class="tag">${r.type}</span></td><td>${esc(r.label)}</td><td><span class="muted">${esc(new Date(r.created_at).toLocaleString())}</span></td><td>${r.payload?`<button class="inline-button history-export" data-run="${esc(r.id)}">Export</button>`:''}</td></tr>`).join('')}</tbody></table></div>`:'<p class="empty">No activity yet. Import products or run a planning calculation to create a saved record.</p>';
    box.querySelectorAll('.history-export').forEach(button=>button.onclick=()=>{const run=data.runs.find(r=>r.id===button.dataset.run);download('algovision-'+run.kind+'-'+run.id+'.json',run);});
  }catch(e){if(box.isConnected)box.textContent=e.message;cloudStatus();}
}
const pages={overview,catalog:catalogPage,ingestion,search:searchPage,optimizer,routes,insights,account};
const titles={overview:'Overview',catalog:'Product catalog',ingestion:'Data imports',search:'Search & ranking',optimizer:'Capital allocation',routes:'Delivery routes',insights:'Algorithm reference',account:'Account & history'};
function render() {
  const name=location.hash.slice(1)||'overview',page=Object.hasOwn(pages,name)?name:'overview';
  document.querySelectorAll('nav a').forEach(a=>{const active=a.dataset.page===page;a.classList.toggle('active',active);if(active)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
  window.scrollTo(0,0);
  $('#breadcrumb').textContent=titles[page];document.title=`${titles[page]} · AlgoVision 2.0`;pages[page]();
}
$('#quick-search').onsubmit=event=>{
  event.preventDefault();pendingCatalogQuery=$('#quick-query').value.trim();
  if(location.hash==='#catalog')render();else location.hash='catalog';
};
$('#export').onclick=()=>download('algovision-products.json',catalog.records);
$('#reset').onclick=async()=>{
  if(mutationBusy)return;
  try {
    requireCloudUser();
    if(!confirm('Replace your current catalog with sample data? Export first to keep changes.'))return;
    mutationBusy=true;
    if(cloud.configured){await api('/api/products/reset',{method:'POST',body:{}});await cloudCatalog();}else{catalog=new Catalog(products);persist();}
    importReport=null;render();toast('Sample catalog restored.');
  }catch(e){toast(e.message);cloudStatus();}finally{mutationBusy=false;}
};
window.addEventListener('hashchange',render);
try {
  await session();
  if(cloud.configured){catalog=new Catalog();if(cloud.user)await cloudCatalog();}
} catch(e) {catalog=new Catalog();cloud.error=e.message;}
cloudStatus();render();if(startupMessage&&!cloud.configured)toast(startupMessage);
