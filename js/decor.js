// decor.js — Decorations tab: things you already have vs. things you need to buy

var _decCat = '';

function getDecorCategories() {
  return S.decorCategories || ['Tables','Walls','Floor displays'];
}

// What the Decorations tab adds into the Finances "Decorations" budget line.
function decorTotals() {
  const items = (S.decorItems || []).filter(it => it.status === 'buy');
  const est   = r2(items.reduce((s,it) => s + lineCalc(it.calc).total, 0));
  const spent = r2(items.reduce((s,it) => s + (+it.spent||0), 0));
  return {est, spent, count: items.length};
}

// Items you already have show up in Inventory too (with where they are).
function syncDecorInventory(it) {
  S.inventory = (S.inventory||[]).filter(x => x.decorId !== it.id);
  if (it.status === 'have' && it.loc) {
    S.inventory.push({
      id: S.nextId++, cat: 'Decor', loc: it.loc, item: it.name,
      note: it.where || '', packed: false, decorId: it.id
    });
  }
}

function renderDecor() {
  const el = document.getElementById('tab-decor');
  if (!el) return;
  const cats  = getDecorCategories();
  const items = S.decorItems || [];
  const t     = decorTotals();
  const {paying} = calcTotals();
  const haveCount = items.filter(i => i.status === 'have').length;
  const shown = _decCat ? items.filter(i => i.cat === _decCat) : items;

  const byCat = {};
  shown.forEach(it => { (byCat[it.cat || 'Other'] = byCat[it.cat || 'Other'] || []).push(it); });
  const catOrder = [...cats, ...Object.keys(byCat).filter(c => !cats.includes(c))];

  const card = it => {
    const have = it.status === 'have';
    let detail = '';
    if (have) {
      detail = it.loc
        ? `<div style="font-size:11px;color:var(--text2);margin-top:2px"><i class="ti ti-map-pin" style="font-size:11px"></i> ${escHtml(it.loc)}${it.where?' — '+escHtml(it.where):''}</div>`
        : `<div style="font-size:11px;color:var(--amber-text);margin-top:2px">Where is it? Tap edit to add a spot.</div>`;
    } else {
      const c = lineCalc(it.calc);
      detail = `<div style="font-size:11px;color:var(--text2);margin-top:2px">${escHtml(calcSummary(it.calc))}</div>
        <div style="font-size:11px;margin-top:1px"><strong>${fmt(c.total)}</strong> <span style="color:var(--purple)">· ${fmt(paying>0?r2(c.total/paying):0)}/ticket</span>${+it.spent>0?` <span style="color:var(--text3)">· spent ${fmt(it.spent)}</span>`:''}</div>`;
    }
    return `<div style="display:flex;align-items:flex-start;gap:8px;padding:9px 12px;background:var(--bg);border:.5px solid var(--border);border-radius:var(--radius-sm);margin-bottom:4px">
      <div style="flex:1;min-width:0;cursor:pointer" onclick="openDecorItem('${it.id}')">
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
          <span style="font-size:13px;font-weight:500">${escHtml(it.name)}</span>
          <span style="font-size:10px;padding:1px 7px;border-radius:8px;${have?'background:var(--green-bg);color:var(--green-text)':'background:var(--amber-bg);color:var(--amber-text)'}">${have?'Have it':'Need to buy'}</span>
        </div>
        ${detail}
        ${it.notes?`<div style="font-size:11px;color:var(--text3);margin-top:2px">${escHtml(it.notes)}</div>`:''}
      </div>
      <button class="icon-btn" onclick="openDecorItem('${it.id}')" title="Edit"><i class="ti ti-pencil" style="font-size:14px"></i></button>
      <button class="icon-btn del-btn" onclick="askDeleteDecor('${it.id}')" title="Delete"><i class="ti ti-trash" style="font-size:14px"></i></button>
    </div>`;
  };

  const groups = catOrder.filter(c => byCat[c] || (!_decCat && cats.includes(c))).map(c => `
    <div style="margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px">
        <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--text2)">${escHtml(c)} <span style="color:var(--text3);font-weight:400">(${(byCat[c]||[]).length})</span></div>
        <button class="icon-btn" data-c="${escHtml(c)}" onclick="openDecorItem(null,this.dataset.c)" title="Add to ${escHtml(c)}"><i class="ti ti-plus" style="font-size:14px"></i></button>
      </div>
      ${(byCat[c]||[]).map(card).join('') || '<div style="color:var(--text3);font-size:12px;padding:2px 2px 6px">Nothing here yet.</div>'}
    </div>`).join('');

  el.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px">
      <div>
        <div style="font-size:15px;font-weight:600">Decorations</div>
        <div style="font-size:12px;color:var(--text2)">${haveCount} already have · ${t.count} to buy · <strong>${fmt(t.est)}</strong> budget${t.est>0&&paying>0?` (${fmt(r2(t.est/paying))}/ticket)`:''}</div>
      </div>
      <div style="display:flex;gap:6px">
        <button class="btn" onclick="openManageDecorCats()" style="font-size:11px;padding:3px 8px"><i class="ti ti-plus"></i> Category</button>
        <button class="btn primary" onclick="openDecorItem(null,_decCat)"><i class="ti ti-plus"></i> Add item</button>
      </div>
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:12px">
      <button class="cat-btn${!_decCat?' active':''}" onclick="_decCat='';renderDecor()">All</button>
      ${cats.map(c => `<button class="cat-btn${_decCat===c?' active':''}" onclick="_decCat=this.dataset.c;renderDecor()" data-c="${escHtml(c)}">${escHtml(c)}</button>`).join('')}
    </div>
    ${groups}`;
}

function openDecorItem(id, presetCat) {
  const it = id ? (S.decorItems||[]).find(x => x.id === id) : null;
  if (id && !it) return;
  const cats = getDecorCategories();
  const cat  = it ? it.cat : (presetCat || cats[0] || 'Other');
  const catList = cats.includes(cat) ? cats : [...cats, cat];
  const status = it ? it.status : 'have';
  const locs = getLocations();
  const locKnown = it && it.loc && locs.includes(it.loc);
  showModal(`
    <h3>${it?'Edit':'Add'} decoration</h3>
    <div class="field"><label>What is it?</label><input type="text" id="di-name" value="${escHtml(it?it.name:'')}" placeholder="e.g. Table runners"></div>
    <div class="field"><label>Category</label>
      <select id="di-cat">${catList.map(c=>`<option${c===cat?' selected':''}>${escHtml(c)}</option>`).join('')}</select></div>
    <div class="field"><label>Do you have it?</label>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:4px">
        <label class="radio-card"><input type="radio" name="di-status" value="have" ${status==='have'?'checked':''} onchange="decorStatusChange()"> I have it</label>
        <label class="radio-card"><input type="radio" name="di-status" value="buy" ${status==='buy'?'checked':''} onchange="decorStatusChange()"> I need to buy it</label>
      </div>
    </div>
    <div id="di-have" style="display:${status==='have'?'block':'none'}">
      <div class="field"><label>Where is it?</label>
        <select id="di-loc" onchange="document.getElementById('di-custom-wrap').style.display=this.value==='Other'?'block':'none'">
          ${locs.map(l=>`<option${(it&&(it.loc===l))?' selected':''}>${escHtml(l)}</option>`).join('')}
          ${it && it.loc && !locKnown ? `<option selected>${escHtml(it.loc)}</option>` : ''}
        </select></div>
      <div id="di-custom-wrap" style="display:none">
        <div class="field"><label>Custom location</label><input type="text" id="di-custom" placeholder="e.g. Jordan's garage"></div>
        <label style="display:flex;align-items:center;gap:6px;font-size:12px;margin-bottom:8px"><input type="checkbox" id="di-save-loc" checked style="width:auto"> Save for future use</label>
      </div>
      <div class="field"><label>Where exactly? (which bin, shelf, room…)</label>
        <input type="text" id="di-where" value="${escHtml(it?it.where||'':'')}" placeholder="e.g. Garage — silver tote"></div>
      <div style="font-size:11px;color:var(--text3);margin-bottom:8px">Items you have also show up in the Inventory tab.</div>
    </div>
    <div id="di-buy" style="display:${status==='buy'?'block':'none'}">
      ${costFieldsHtml('di', it && it.calc ? it.calc : {})}
      <div class="field"><label>Spent so far ($)</label><input type="text" inputmode="decimal" id="di-spent" value="${it&&+it.spent?(+it.spent).toFixed(2):''}" placeholder="0.00"></div>
    </div>
    <div class="field"><label>Notes (optional)</label><input type="text" id="di-notes" value="${escHtml(it?it.notes||'':'')}"></div>
    <div class="m-actions">
      <button class="btn" onclick="closeModal()">Cancel</button>
      <button class="btn primary" onclick="saveDecorItem(${it?`'${it.id}'`:'null'})"><i class="ti ti-check"></i> Save</button>
    </div>`);
  if (!it) document.getElementById('di-name')?.focus();
}

function decorStatusChange() {
  const v = document.querySelector('input[name="di-status"]:checked')?.value;
  document.getElementById('di-have').style.display = v === 'have' ? 'block' : 'none';
  document.getElementById('di-buy').style.display  = v === 'buy'  ? 'block' : 'none';
}

function saveDecorItem(id) {
  const name = document.getElementById('di-name')?.value?.trim();
  if (!name) { alert('Please enter a name.'); return; }
  if (!S.decorItems) S.decorItems = [];
  const status = document.querySelector('input[name="di-status"]:checked')?.value || 'have';
  let it = id ? S.decorItems.find(x => x.id === id) : null;
  const isNew = !it;
  if (!it) it = {id: 'd' + (S.nextId++)};
  it.name   = name;
  it.cat    = document.getElementById('di-cat')?.value || 'Other';
  it.status = status;
  it.notes  = document.getElementById('di-notes')?.value?.trim() || '';
  if (status === 'have') {
    let loc = document.getElementById('di-loc')?.value || "Nicole's";
    if (loc === 'Other') {
      const custom = document.getElementById('di-custom')?.value?.trim();
      if (custom) {
        loc = custom;
        if (document.getElementById('di-save-loc')?.checked) {
          S.customLocations = S.customLocations || [];
          if (!S.customLocations.includes(custom)) S.customLocations.push(custom);
        }
      }
    }
    it.loc   = loc;
    it.where = document.getElementById('di-where')?.value?.trim() || '';
  } else {
    it.calc  = readCostFields('di');
    it.spent = parseMoney(document.getElementById('di-spent')?.value);
  }
  if (isNew) S.decorItems.push(it);
  syncDecorInventory(it);
  saveState(); closeModal(); renderDecor();
}

function askDeleteDecor(id) {
  const it = (S.decorItems||[]).find(x => x.id === id);
  if (!it) return;
  confirmDelete('Delete "' + it.name + '"?', () => deleteDecorItem(id));
}

function deleteDecorItem(id) {
  S.decorItems = (S.decorItems||[]).filter(x => x.id !== id);
  S.inventory  = (S.inventory||[]).filter(x => x.decorId !== id);
  const y = window.scrollY;
  saveState(); renderDecor(); window.scrollTo(0, y);
}

function openManageDecorCats() {
  const cats = getDecorCategories();
  showModal(`
    <h3>Decoration categories</h3>
    ${cats.map((c,i) => {
      const n = (S.decorItems||[]).filter(x => x.cat === c).length;
      return `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:.5px solid var(--border)">
        <div style="flex:1;font-size:13px">${escHtml(c)} <span style="color:var(--text3);font-size:11px">(${n})</span></div>
        <button class="icon-btn del-btn" onclick="deleteDecorCategory(${i})" title="Delete"><i class="ti ti-trash" style="font-size:14px"></i></button>
      </div>`;
    }).join('')}
    <div class="field" style="margin-top:12px"><label>New category</label>
      <input type="text" id="dc-name" placeholder="e.g. Ceiling, Photo area"></div>
    <div class="m-actions">
      <button class="btn" onclick="closeModal()">Done</button>
      <button class="btn primary" onclick="addDecorCategory()"><i class="ti ti-plus"></i> Add</button>
    </div>`);
  document.getElementById('dc-name')?.focus();
}

function addDecorCategory() {
  const name = document.getElementById('dc-name')?.value?.trim();
  if (!name) { alert('Please enter a name.'); return; }
  const cats = getDecorCategories();
  if (cats.some(c => c.toLowerCase() === name.toLowerCase())) { alert('That category already exists.'); return; }
  S.decorCategories = [...cats, name];
  saveState(); renderDecor(); openManageDecorCats();
}

function deleteDecorCategory(i) {
  const cats = getDecorCategories();
  const c = cats[i];
  const n = (S.decorItems||[]).filter(x => x.cat === c).length;
  if (n) { alert('“' + c + '” still has ' + n + ' item' + (n===1?'':'s') + '. Move or delete those first.'); return; }
  S.decorCategories = cats.filter((_,j) => j !== i);
  if (_decCat === c) _decCat = '';
  saveState(); renderDecor(); openManageDecorCats();
}
