// inventory.js — clean rewrite with categories as buttons, search, edit, strip prefix

var _invCat      = '';
var _invLoc      = '';
var _invSearch   = '';
var _invSort     = 'item';
var _invDebounce = null;

function debounceRenderInv(val) {
  _invSearch = val;
  clearTimeout(_invDebounce);
  _invDebounce = setTimeout(() => {
    renderInvList();
  }, 150);
}

function renderInvList() {
  const listEl = document.getElementById('inv-list');
  if (!listEl) { renderInventory(); return; }
  const cats = getInvCategories();
  let items = (S.inventory||[]).map(i => ({...i, displayItem: stripPrefix(i.item)}));
  if (_invSearch.trim()) {
    const q = _invSearch.toLowerCase();
    const primary   = items.filter(i => i.displayItem.toLowerCase().includes(q));
    const secondary = items.filter(i => !i.displayItem.toLowerCase().includes(q) && (i.note||'').toLowerCase().includes(q));
    items = [...primary, ...secondary];
  }
  if (_invCat) items = items.filter(i => (i.cat||'Misc') === _invCat);
  if (_invLoc) items = items.filter(i => i.loc === _invLoc);
  if (_invSort === 'item') items = [...items].sort((a,b) => a.displayItem.localeCompare(b.displayItem));
  if (_invSort === 'cat')  items = [...items].sort((a,b) => ((a.cat||'Misc').localeCompare(b.cat||'Misc')) || a.displayItem.localeCompare(b.displayItem));
  listEl.innerHTML = items.map(item => invRow(item)).join('') ||
    '<div style="color:var(--text3);font-size:13px;text-align:center;padding:2rem">No items found.</div>';
}

function getInvCategories() {
  return S.inventoryCategories || ['Backdrops','Check-in','Decor','Misc','Prize table'];
}

function getLocations() {
  return ["Nicole's","Alyssa's",...(S.customLocations||[]),'Other'];
}

// Strip category prefix from item name e.g. "Backdrops: Curtain" → "Curtain"
function stripPrefix(item) {
  return (item||'').replace(/^[^:]+:\s*/,'');
}

function renderInventoryKeep() {
  const y = window.scrollY;
  renderInventory();
  [0, 30, 100, 250].forEach(ms => setTimeout(() => window.scrollTo(0, y), ms));
}

function renderInventory() {
  const el = document.getElementById('tab-inventory');
  if (!el) return;

  const cats = getInvCategories();
  let items = (S.inventory||[]).map(i => ({...i, displayItem: stripPrefix(i.item)}));

  // Search — item first, notes second
  if (_invSearch.trim()) {
    const q = _invSearch.toLowerCase();
    const primary   = items.filter(i => i.displayItem.toLowerCase().includes(q));
    const secondary = items.filter(i => !i.displayItem.toLowerCase().includes(q) && (i.note||'').toLowerCase().includes(q));
    items = [...primary, ...secondary];
  }

  // Filter
  if (_invCat) items = items.filter(i => (i.cat||'Misc') === _invCat);
  if (_invLoc) items = items.filter(i => i.loc === _invLoc);

  // Sort
  if (_invSort === 'item') items = [...items].sort((a,b) => a.displayItem.localeCompare(b.displayItem));
  if (_invSort === 'cat')  items = [...items].sort((a,b) => ((a.cat||'Misc').localeCompare(b.cat||'Misc')) || a.displayItem.localeCompare(b.displayItem));

  const packed = (S.inventory||[]).filter(i => i.packed).length;
  const total  = (S.inventory||[]).length;

  el.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px">
      <div style="font-size:13px;color:var(--text2)">${packed}/${total} packed</div>
      <div style="display:flex;gap:6px">
        <button class="btn" onclick="openAddInvCategory()" style="font-size:11px;padding:3px 8px"><i class="ti ti-plus"></i> Category</button>
        <button class="btn primary" onclick="openAddInvItem()"><i class="ti ti-plus"></i> Add item</button>
      </div>
    </div>

    <!-- Search -->
    <div style="margin-bottom:8px">
      <input type="text" id="inv-search" value="${escHtml(_invSearch)}" placeholder="Search items and notes…"
        style="width:100%;font-size:13px;padding:8px 12px"
        oninput="debounceRenderInv(this.value)">
    </div>

    <!-- Category filter buttons -->
    <div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:8px">
      <button class="cat-btn${!_invCat?' active':''}" onclick="_invCat='';renderInventory()">All</button>
      ${cats.map(c => `<button class="cat-btn${_invCat===c?' active':''}" onclick="_invCat='${escHtml(c)}';renderInventory()">${escHtml(c)}</button>`).join('')}
    </div>

    <!-- Location filter + sort -->
    <div style="display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap;align-items:center">
      <select onchange="_invLoc=this.value;renderInventory()" style="font-size:12px;padding:4px 8px">
        <option value="">All locations</option>
        ${getLocations().map(l => `<option value="${escHtml(l)}"${_invLoc===l?' selected':''}>${escHtml(l)}</option>`).join('')}
      </select>
      <div style="display:flex;gap:4px;margin-left:auto">
        <button class="sort-btn${_invSort==='item'?' active':''}" onclick="_invSort='item';renderInventory()">A–Z</button>
        <button class="sort-btn${_invSort==='cat'?' active':''}"  onclick="_invSort='cat';renderInventory()">By category</button>
      </div>
    </div>

    <!-- Items -->
    <div id="inv-list" style="display:flex;flex-direction:column;gap:4px"></div>`;
  setTimeout(renderInvList, 0);
}

function invRow(item) {
  return `<div class="inv-card" id="inv-${item.id}">
    <div style="display:flex;align-items:center;gap:8px;padding:8px 12px">
      <input type="checkbox" ${item.packed?'checked':''} style="width:16px;height:16px;accent-color:var(--green);flex-shrink:0"
        onchange="togglePacked(${item.id},this.checked)">
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;${item.packed?'text-decoration:line-through;color:var(--text3)':''}">${escHtml(item.displayItem)}</div>
        <div style="display:flex;gap:6px;align-items:center;margin-top:2px;flex-wrap:wrap">
          <span style="font-size:10px;background:var(--bg2);color:var(--text2);padding:1px 6px;border-radius:8px">${escHtml(item.cat||'Misc')}</span>
          ${item.loc?`<span style="font-size:10px;color:var(--text3)">${escHtml(item.loc)}</span>`:''}
          ${item.decorId?`<span style="font-size:10px;color:var(--purple)">from Decorations</span>`:''}
        </div>
        ${item.note?`<div style="font-size:11px;color:var(--text3);margin-top:2px">${escHtml(item.note)}</div>`:''}
      </div>
      <div style="display:flex;gap:2px;flex-shrink:0">
        <button class="icon-btn" onclick="openEditInvItem(${item.id})" title="Edit"><i class="ti ti-pencil" style="font-size:13px"></i></button>
        <button class="icon-btn del-btn" onclick="confirmDelete('Delete \\'${escHtml(item.displayItem)}\\'?',()=>deleteInvItem(${item.id}))" title="Delete">
          <i class="ti ti-trash" style="font-size:13px"></i>
        </button>
      </div>
    </div>
  </div>`;
}

function togglePacked(id, val) {
  const item = (S.inventory||[]).find(i => i.id===id);
  if (item) { item.packed = val; saveState(); renderInventoryKeep(); }
}

function deleteInvItem(id) {
  S.inventory = (S.inventory||[]).filter(i => i.id!==id);
  saveState(); renderInventoryKeep();
}

function openAddInvItem() {
  const cats = getInvCategories();
  const locs = getLocations();
  showModal(`
    <h3>Add inventory item</h3>
    <div class="field"><label>Item name</label><input type="text" id="ai-item" placeholder="What is it?"></div>
    <div class="field"><label>Category</label>
      <select id="ai-cat">${cats.map(c=>`<option>${escHtml(c)}</option>`).join('')}</select>
    </div>
    <div class="field"><label>Location</label>
      <select id="ai-loc" onchange="toggleCustomLoc(this.value)">
        ${locs.map(l=>`<option>${escHtml(l)}</option>`).join('')}
      </select>
    </div>
    <div id="ai-custom-wrap" style="display:none">
      <div class="field"><label>Custom location</label><input type="text" id="ai-custom" placeholder="e.g. Jordan's garage"></div>
      <label style="display:flex;align-items:center;gap:6px;font-size:12px;margin-bottom:8px">
        <input type="checkbox" id="ai-save-loc" checked> Save for future use
      </label>
    </div>
    <div class="field"><label>Note (optional)</label><input type="text" id="ai-note" placeholder="e.g. In the black tote"></div>
    <div class="m-actions">
      <button class="btn" onclick="closeModal()">Cancel</button>
      <button class="btn primary" onclick="doAddInvItem()"><i class="ti ti-plus"></i> Add</button>
    </div>`);
  setTimeout(()=>document.getElementById('ai-item')?.focus(),50);
}

function toggleCustomLoc(val) {
  document.getElementById('ai-custom-wrap').style.display = val==='Other'?'block':'none';
}

function doAddInvItem() {
  const item = document.getElementById('ai-item')?.value?.trim();
  if (!item) { alert('Please enter an item name.'); return; }
  let loc = document.getElementById('ai-loc')?.value || "Nicole's";
  if (loc === 'Other') {
    const custom = document.getElementById('ai-custom')?.value?.trim();
    if (custom) {
      loc = custom;
      if (document.getElementById('ai-save-loc')?.checked) {
        S.customLocations = S.customLocations || [];
        if (!S.customLocations.includes(custom)) S.customLocations.push(custom);
      }
    }
  }
  S.inventory.push({
    id:     S.nextId++,
    cat:    document.getElementById('ai-cat')?.value || 'Misc',
    loc,
    item,
    note:   document.getElementById('ai-note')?.value?.trim() || '',
    packed: false
  });
  saveState(); closeModal(); renderInventoryKeep();
}

function openEditInvItem(id) {
  const item = (S.inventory||[]).find(i => i.id===id);
  if (!item) return;
  const cats = getInvCategories();
  const locs = getLocations();
  showModal(`
    <h3>Edit item</h3>
    <div class="field"><label>Name</label><input type="text" id="ei-item" value="${escHtml(item.item||'')}"></div>
    <div class="field"><label>Category</label>
      <select id="ei-cat">${cats.map(c=>`<option${item.cat===c?' selected':''}>${escHtml(c)}</option>`).join('')}</select>
    </div>
    <div class="field"><label>Location</label>
      <select id="ei-loc">${locs.map(l=>`<option${item.loc===l?' selected':''}>${escHtml(l)}</option>`).join('')}</select>
    </div>
    <div class="field"><label>Note</label><input type="text" id="ei-note" value="${escHtml(item.note||'')}"></div>
    <div class="m-actions">
      <button class="btn danger" onclick="confirmDelete('Delete this item?',()=>{deleteInvItem(${id});closeModal()})">
        <i class="ti ti-trash"></i> Delete
      </button>
      <button class="btn" onclick="closeModal()">Cancel</button>
      <button class="btn primary" onclick="doEditInvItem(${id})"><i class="ti ti-check"></i> Save</button>
    </div>`);
}

function doEditInvItem(id) {
  const item = (S.inventory||[]).find(i => i.id===id);
  if (!item) return;
  item.item = document.getElementById('ei-item')?.value?.trim() || item.item;
  item.cat  = document.getElementById('ei-cat')?.value  || 'Misc';
  item.loc  = document.getElementById('ei-loc')?.value  || "Nicole's";
  item.note = document.getElementById('ei-note')?.value?.trim() || '';
  saveState(); closeModal(); renderInventoryKeep();
}

function openAddInvCategory() {
  showModal(`
    <h3>Add category</h3>
    <div class="field"><label>Category name</label><input type="text" id="aic-name" placeholder="e.g. Tables"></div>
    <div class="m-actions">
      <button class="btn" onclick="closeModal()">Cancel</button>
      <button class="btn primary" onclick="doAddInvCategory()"><i class="ti ti-plus"></i> Add</button>
    </div>`);
  setTimeout(()=>document.getElementById('aic-name')?.focus(),50);
}

function doAddInvCategory() {
  const name = document.getElementById('aic-name')?.value?.trim();
  if (!name) { alert('Please enter a name.'); return; }
  if (!S.inventoryCategories) S.inventoryCategories = ['Backdrops','Check-in','Decor','Misc','Prize table'];
  if (S.inventoryCategories.includes(name)) { alert('Category already exists.'); return; }
  S.inventoryCategories.push(name);
  saveState(); closeModal(); renderInventoryKeep();
}
