// finances.js — clean rewrite

var _swipedExpIdx = null;
var _expSwipeX    = 0;
var _stSwipedKey  = null;
var _stSwipedIdx  = null;

// ── Calculations ──────────────────────────────────────────────────────────────

function tipAmt(tip, base) {
  if (!tip || !tip.enabled) return 0;
  return tip.type === 'pct' ? Math.round((tip.pct||0)/100*base*100)/100 : +(tip.fixedAmt||0);
}

function subtableTotal(name) {
  const rows = S[name] || [];
  if (['tshirts','hats','totes'].includes(name) || (S.merchOptions||[]).includes(name)) {
    return rows.reduce((s,r) => s + Math.round((+r.price||0)*(+r.qty||0)*100)/100, 0);
  }
  return rows.reduce((s,r) => s + (+r.est||0), 0);
}

function lineEst(e) {
  if (e.type === 'cc_fee') {
    // CC fee = percentage of ticket price × number of paying tickets
    const pct    = +(e.ccPct || S.ccFeePercent || 3.2);
    const paying = Math.max(0, S.attendance.total - S.attendance.authors - S.attendance.admin);
    const perTicket = Math.round(pct/100 * (+(S.ticketPrice||0)) * 100) / 100;
    return Math.round(perTicket * paying * 100) / 100;
  }
  if (e.type === 'fixed')   { const b = +(e.fixedAmt||0); return Math.round((b + tipAmt(e.tip,b))*100)/100; }
  if (e.type === 'perunit') { const b = Math.round((+(e.unitPrice||0))*(+(e.qty||0))*100)/100; return Math.round((b + tipAmt(e.tip,b))*100)/100; }
  if (e.type === 'subtable') {
    // Skip inactive merch
    const allMerch = S.merchOptions || ['hats','tshirts'];
    if (allMerch.includes(e.subtable) && e.subtable !== (S.merchType||'hats')) return 0;
    return subtableTotal(e.subtable);
  }
  return 0;
}

function calcTotals() {
  const {total, authors, admin} = S.attendance;
  const paying = Math.max(0, total - authors - admin);
  const totalEst   = Math.round(S.expenses.reduce((s,e) => s + lineEst(e), 0)*100)/100;
  const totalSpent = Math.round(S.expenses.reduce((s,e) => s + (+e.spent||0), 0)*100)/100;
  const autoTicket = paying > 0 ? Math.round(totalEst/paying*100)/100 : 0;
  const revenue    = Math.round((+(S.ticketPrice||0)) * paying * 100) / 100;
  const surplus    = Math.round((revenue - totalEst)*100)/100;
  return {paying, totalEst, totalSpent, autoTicket, revenue, surplus};
}

// ── Input helpers ─────────────────────────────────────────────────────────────

function numIn(id, val, onblurFn, style) {
  return `<input type="text" inputmode="numeric" id="${id}" value="${val??''}"
    class="ni num-in" style="${style||''}"
    onblur="${onblurFn}" onkeydown="if(event.key==='Enter')this.blur()">`;
}
function parseMoney(val) {
  // Only interpret as cents-included if user typed a decimal
  const s = String(val||'').trim().replace(/[^0-9.]/g,'');
  if (!s) return 0;
  if (s.includes('.')) return Math.round(parseFloat(s)*100)/100;
  return parseInt(s, 10); // no decimal = whole dollars
}
function moneyIn(id, val, onblurFn, style) {
  const v = val!=null && val!=='' ? (+val).toFixed(2) : '';
  return `<input type="text" inputmode="decimal" id="${id}" value="${v}"
    class="ni money-in" placeholder="0.00" style="${style||''}"
    onblur="${onblurFn}" onkeydown="if(event.key==='Enter')this.blur()">`;
}

// ── Main render ───────────────────────────────────────────────────────────────

function renderFinances() {
  const el = document.getElementById('tab-finances');
  if (!el) return;

  if (!S.attendance) S.attendance = {total:175,authors:18,admin:4};
  S.attendance.admin = getAdminCount();
  if (!S.expenses) S.expenses = [];
  if (S.ticketPrice === undefined) S.ticketPrice = 0;
  if (S.ccFeePercent === undefined) S.ccFeePercent = 3.2;

  const {paying, totalEst, totalSpent, autoTicket, revenue, surplus} = calcTotals();
  const {total, authors, admin} = S.attendance;
  const spentDiff = totalSpent > 0 ? Math.round((totalSpent - totalEst)*100)/100 : null;

  el.innerHTML = `
  <!-- ATTENDANCE -->
  <div class="card">
    <div class="card-title">Attendance &amp; ticket price</div>
    <div class="att-row">
      <div class="att-cell">
        <div class="att-lbl">Total attendees</div>
        ${numIn('att-total', total, 'blurAtt(\'total\',this.value)', 'width:100%;font-size:18px;font-weight:700;text-align:center')}
      </div>
      <div class="att-cell">
        <div class="att-lbl">Authors (free)</div>
        ${numIn('att-authors', authors, 'blurAtt(\'authors\',this.value)', 'width:100%;font-size:18px;font-weight:700;text-align:center')}
      </div>
      <div class="att-cell">
        <div class="att-lbl">Admin (free) <span style="font-size:9px;color:var(--text3)">(from Settings)</span></div>
        <div style="font-size:18px;font-weight:700;text-align:center;padding:5px 0">${admin}</div>
      </div>
    </div>
    <div class="att-row" style="margin-top:6px">
      <div class="att-cell" style="background:var(--purple-bg);border:.5px solid var(--purple)">
        <div class="att-lbl" style="color:var(--purple)">Paying tickets</div>
        <div style="font-size:20px;font-weight:700;color:var(--purple-text);text-align:center">${paying}</div>
      </div>
      <div class="att-cell" style="background:var(--purple-bg);border:.5px solid var(--purple)">
        <div class="att-lbl" style="color:var(--purple)">Ticket price</div>
        ${moneyIn('ticket-price', S.ticketPrice||'', 'blurTicket(this.value)', 'width:100%;font-size:18px;font-weight:700;text-align:center;color:var(--purple-text)')}
      </div>
      <div class="att-cell">
        <div class="att-lbl">Auto-calculated</div>
        <div style="font-size:16px;font-weight:700">${fmt(autoTicket)}</div>
        <div style="font-size:10px;color:var(--text3)">costs ÷ ${paying} tickets</div>
      </div>
    </div>
    <div class="att-row" style="margin-top:6px">
      <div class="att-cell" style="background:${surplus>=0?'var(--green-bg)':'var(--red-bg)'}">
        <div class="att-lbl" style="color:${surplus>=0?'var(--green-text)':'var(--red-dark)'}">${surplus>=0?'Surplus':'Shortfall'}</div>
        <div style="font-size:16px;font-weight:700;color:${surplus>=0?'var(--green)':'var(--red)'}">${surplus>=0?'+':''}${fmt(surplus)}</div>
        <div style="font-size:10px;color:var(--text3)">revenue ${fmt(revenue)} − costs ${fmt(totalEst)}</div>
      </div>
      <div class="att-cell">
        <div class="att-lbl">Spent so far</div>
        <div style="font-size:16px;font-weight:700">${fmt(totalSpent)}</div>
        <div style="font-size:10px;color:${spentDiff===null?'var(--text3)':spentDiff>0?'var(--red)':'var(--green)'}">
          ${spentDiff===null?'No actuals yet':spentDiff>0?'+'+fmt(spentDiff)+' over':fmt(Math.abs(spentDiff))+' under'}
        </div>
      </div>
    </div>
  </div>

  <!-- EXPENSES -->
  <div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
      <div class="card-title" style="margin-bottom:0">Expenses</div>
      <button class="btn primary" style="font-size:11px;padding:4px 10px" onclick="openAddExpense()">
        <i class="ti ti-plus"></i> Add line
      </button>
    </div>
    <div id="expense-list">
      ${S.expenses.map((e,i) => expRow(e,i,paying)).join('')}
    </div>
    <div class="exp-totals-row">
      <span style="font-weight:600">Total</span>
      <span style="font-weight:700">${fmt(totalEst)}</span>
      <span style="color:var(--purple);font-weight:600">${fmt(autoTicket)}/ticket</span>
      <span style="color:var(--text2)">Spent: ${fmt(totalSpent)}</span>
      ${spentDiff!==null?`<span style="color:${spentDiff>0?'var(--red)':'var(--green)'}">${spentDiff>0?'+':''}${fmt(spentDiff)}</span>`:''}
    </div>
  </div>

  <!-- SUBTABLES -->
  ${renderMerchSection()}
  ${stPriceQty('totes','Tote bags')}
  ${stEstSpent('decorations','Decorations')}
  ${stEstSpent('misc','Misc expenses')}
  ${stEstSpent('swag','Swag bag')}
  `;
}

// ── Attendance blur handlers ──────────────────────────────────────────────────

function blurAtt(field, val) {
  const n = parseInt(val)||0;
  S.attendance[field] = n;
  // Update per-unit quantities immediately
  (S.expenses||[]).forEach(e => {
    if (e.type === 'perunit') {
      if (e.unitLabelType === 'total')   e.qty = S.attendance.total;
      if (e.unitLabelType === 'authors') e.qty = S.attendance.authors;
    }
  });
  saveState(); renderFinances();
}

function blurTicket(val) {
  S.ticketPrice = Math.round(parseMoney(val)*100)/100;
  saveState(); renderFinances();
}

// ── Expense row ───────────────────────────────────────────────────────────────

function expRow(e, i, paying) {
  // Skip inactive merch subtable lines
  const allMerch = S.merchOptions || ['hats','tshirts'];
  if (e.type === 'subtable' && allMerch.includes(e.subtable) && e.subtable !== (S.merchType||'hats')) return '';

  const est    = lineEst(e);
  const spent  = +(e.spent||0);
  const perTix = paying > 0 ? Math.round(est/paying*100)/100 : 0;
  const diff   = spent > 0 ? Math.round((spent-est)*100)/100 : null;
  const isSub  = e.type === 'subtable';
  const isCC   = e.type === 'cc_fee';

  // Price cell
  let priceCell = '';
  if (e.type === 'fixed') {
    priceCell = moneyIn('ef'+i, e.fixedAmt, `blurExpField(${i},'fixedAmt',this.value,'money')`, 'width:80px;font-size:12px');
  } else if (e.type === 'perunit') {
    priceCell = moneyIn('eu'+i, e.unitPrice, `blurExpField(${i},'unitPrice',this.value,'money')`, 'width:80px;font-size:12px')
      + `<div style="font-size:9px;color:var(--text3);margin-top:1px">${escHtml(e.unitLabel||'')}</div>`;
  } else if (e.type === 'cc_fee') {
    priceCell = `<div style="display:flex;align-items:center;gap:2px">
      <input type="text" inputmode="decimal" value="${(+(e.ccPct||S.ccFeePercent||3.2)).toFixed(1)}"
        class="ni money-in" style="width:46px;font-size:12px"
        onblur="S.expenses[${i}].ccPct=parseMoney(this.value);saveState();renderFinances()"
        onkeydown="if(event.key==='Enter')this.blur()">
      <span style="font-size:11px;color:var(--text3)">%</span>
    </div>`;
  } else if (isSub) {
    priceCell = `<button class="jump-btn" onclick="scrollToId('st-${e.subtable}')">↓ Go</button>`;
  }

  // Tip badge
  let tipBadge = '';
  if (e.tip && e.tip.enabled) {
    const base = e.type==='fixed' ? +(e.fixedAmt||0) : Math.round((+(e.unitPrice||0))*(+(e.qty||0))*100)/100;
    tipBadge = `<span class="tip-badge">+${fmt(tipAmt(e.tip,base))} tip</span>`;
  }

  return `<div class="exp-row" id="exp-${i}">
    <div class="exp-label">
      <div style="font-size:13px;font-weight:500">${escHtml(e.label)}${tipBadge}</div>
      ${e.notes?`<div style="font-size:10px;color:var(--text3)">${escHtml(e.notes)}</div>`:''}
    </div>
    <div class="exp-price">${priceCell}</div>
    <div class="exp-est">
      <div style="font-size:13px;font-weight:600">${fmt(est)}</div>
      <div style="font-size:10px;color:var(--purple)">${fmt(perTix)}/tix</div>
    </div>
    <div class="exp-spent">
      ${isSub
        ? `<div style="font-size:12px;color:var(--text2)">${spent>0?fmt(spent):'—'}</div>`
        : moneyIn('es'+i, spent||'', `blurExpField(${i},'spent',this.value,'money')`, 'width:78px;font-size:12px')}
      ${diff!==null?`<div style="font-size:10px;color:${diff>0?'var(--red)':'var(--green)'}">${diff>0?'+':''}${fmt(diff)}</div>`:''}
    </div>
    <div class="exp-actions">
      <button class="icon-btn" onclick="openEditExpense(${i})" title="Edit"><i class="ti ti-pencil" style="font-size:14px"></i></button>
      <button class="icon-btn del-btn" onclick="confirmDelete('Delete \\'${escHtml(e.label)}\\'?', ()=>deleteExp(${i}))" title="Delete"><i class="ti ti-trash" style="font-size:14px"></i></button>
    </div>
  </div>`;
}

// ── Expense field blur ────────────────────────────────────────────────────────

function blurExpField(i, field, val, type) {
  if (!S.expenses[i]) return;
  S.expenses[i][field] = type==='money' ? (Math.round(parseMoney(val)*100)/100) : val;
  saveState(); renderFinances();
}

function deleteExp(i) {
  S.expenses.splice(i,1);
  saveState(); renderFinances();
}

function moveExp(i, dir) {
  const j = i+dir;
  if (j<0||j>=S.expenses.length) return;
  [S.expenses[i],S.expenses[j]] = [S.expenses[j],S.expenses[i]];
  saveState(); renderFinances();
}

// ── Add / Edit expense modal ──────────────────────────────────────────────────

function openAddExpense() {
  const att = S.attendance;
  showModal(`
    <h3>Add expense line</h3>
    <div class="field"><label>Name</label><input type="text" id="ae-name" placeholder="e.g. Photo booth"></div>
    <div class="field"><label>Type</label>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:4px">
        <label class="radio-card" id="ae-lbl-fixed">
          <input type="radio" name="ae-type" value="fixed" checked onchange="aeTypeChange()"> Fixed total
        </label>
        <label class="radio-card" id="ae-lbl-per">
          <input type="radio" name="ae-type" value="perunit" onchange="aeTypeChange()"> Per person
        </label>
      </div>
    </div>
    <div id="ae-fixed-fields">
      <div class="field"><label>Amount ($)</label><input type="text" inputmode="decimal" id="ae-fixed" placeholder="0.00"></div>
    </div>
    <div id="ae-per-fields" style="display:none">
      <div class="field"><label>Price per item ($)</label><input type="text" inputmode="decimal" id="ae-unit" placeholder="0.00"></div>
      <div class="field"><label>Based on</label>
        <select id="ae-based">
          <option value="total">Total attendees (${att.total})</option>
          <option value="authors">Authors only (${att.authors})</option>
        </select>
      </div>
    </div>
    <div class="field"><label>Notes (optional)</label><input type="text" id="ae-notes" placeholder="Any notes…"></div>
    <div class="m-actions">
      <button class="btn" onclick="closeModal()">Cancel</button>
      <button class="btn primary" onclick="doAddExpense()"><i class="ti ti-plus"></i> Add</button>
    </div>`);
  setTimeout(()=>document.getElementById('ae-name')?.focus(),50);
}

function aeTypeChange() {
  const t = document.querySelector('input[name="ae-type"]:checked')?.value;
  document.getElementById('ae-fixed-fields').style.display = t==='fixed'?'block':'none';
  document.getElementById('ae-per-fields').style.display   = t==='perunit'?'block':'none';
}

function doAddExpense() {
  const name = document.getElementById('ae-name')?.value?.trim();
  if (!name) { alert('Please enter a name.'); return; }
  const t = document.querySelector('input[name="ae-type"]:checked')?.value || 'fixed';
  const line = {id:'custom_'+S.nextId++, label:name, type:t, spent:0, notes:document.getElementById('ae-notes')?.value?.trim()||'', expanded:false};
  if (t==='fixed') {
    line.fixedAmt = parseFloat(document.getElementById('ae-fixed')?.value)||0;
  } else {
    line.unitPrice = parseFloat(document.getElementById('ae-unit')?.value)||0;
    const based = document.getElementById('ae-based')?.value || 'total';
    line.unitLabelType = based;
    line.unitLabel = based==='authors' ? 'per author' : 'per person';
    line.qty = based==='authors' ? S.attendance.authors : S.attendance.total;
  }
  S.expenses.push(line);
  saveState(); closeModal(); renderFinances();
}

function openEditExpense(i) {
  const e = S.expenses[i];
  if (!e) return;
  const isFixed  = e.type === 'fixed' || e.type === 'cc_fee';
  const isPer    = e.type === 'perunit';
  const isSub    = e.type === 'subtable';
  const isCC     = e.type === 'cc_fee';
  showModal(`
    <h3>Edit: ${escHtml(e.label)}</h3>
    <div class="field"><label>Name</label><input type="text" id="ee-name" value="${escHtml(e.label)}"></div>
    ${isCC?`<div class="field"><label>CC fee %</label><input type="text" inputmode="decimal" id="ee-cc" value="${e.ccPct||S.ccFeePercent||3.2}"></div>`:''}
    ${e.type==='fixed'?`
      <div class="field"><label>Amount ($)</label><input type="text" inputmode="decimal" id="ee-fixed" value="${(+(e.fixedAmt||0)).toFixed(2)}"></div>`:''}
    ${isPer?`
      <div class="field"><label>Price per item ($)</label><input type="text" inputmode="decimal" id="ee-unit" value="${(+(e.unitPrice||0)).toFixed(2)}"></div>
      <div class="field"><label>Based on</label>
        <select id="ee-based">
          <option value="total"${(e.unitLabelType||'total')==='total'?' selected':''}>Total attendees (${S.attendance.total})</option>
          <option value="authors"${e.unitLabelType==='authors'?' selected':''}>Authors only (${S.attendance.authors})</option>
          <option value="set"${e.unitLabelType==='set'?' selected':''}>Set amount</option>
        </select>
      </div>
      ${(e.unitLabelType||'total')==='set'?`<div class="field"><label>Quantity</label><input type="number" id="ee-qty" value="${e.qty||0}"></div>`:''}`:''}
    ${isSub?`<div style="font-size:12px;color:var(--text2);padding:8px 0">This line pulls from the <strong>${escHtml(e.subtable)}</strong> section below.</div>`:''}
    ${e.tip&&e.tip.enabled?`
      <div class="field"><label>Tip type</label>
        <select id="ee-tiptype"><option value="fixed"${e.tip.type==='fixed'?' selected':''}>Fixed $</option><option value="pct"${e.tip.type==='pct'?' selected':''}>%</option></select>
      </div>
      <div class="field"><label>Tip amount</label>
        <input type="text" inputmode="decimal" id="ee-tipamt" value="${e.tip.type==='pct'?e.tip.pct:(+(e.tip.fixedAmt||0)).toFixed(2)}">
      </div>`:''}
    <div class="field"><label>Notes</label><input type="text" id="ee-notes" value="${escHtml(e.notes||'')}"></div>
    <div class="m-actions">
      <button class="btn" onclick="closeModal()">Cancel</button>
      <button class="btn primary" onclick="doEditExpense(${i})"><i class="ti ti-check"></i> Save</button>
    </div>`);
}

function doEditExpense(i) {
  const e = S.expenses[i];
  if (!e) return;
  e.label = document.getElementById('ee-name')?.value?.trim() || e.label;
  e.notes = document.getElementById('ee-notes')?.value?.trim() || '';
  if (e.type==='fixed')   e.fixedAmt  = parseFloat(document.getElementById('ee-fixed')?.value)||0;
  if (e.type==='cc_fee')  e.ccPct     = parseFloat(document.getElementById('ee-cc')?.value)||3.2;
  if (e.type==='fixed') {
    const basedFixed = document.getElementById('ee-based-fixed')?.value||'none';
    if (basedFixed !== 'none') {
      e.unitLabelType = basedFixed;
      e.qty = basedFixed==='authors' ? S.attendance.authors : S.attendance.total;
    } else {
      e.unitLabelType = 'none';
    }
  }
  if (e.type==='perunit') {
    e.unitPrice = parseMoney(document.getElementById('ee-unit')?.value);
    const based = document.getElementById('ee-based')?.value||'total';
    e.unitLabelType = based;
    if (based==='set') {
      e.qty = parseInt(document.getElementById('ee-qty')?.value)||0;
      e.unitLabel = 'items';
    } else {
      e.unitLabel = based==='authors'?'per author':'per person';
      e.qty = based==='authors' ? S.attendance.authors : S.attendance.total;
    }
  }
  if (e.tip && e.tip.enabled) {
    e.tip.type = document.getElementById('ee-tiptype')?.value || e.tip.type;
    const tv = parseFloat(document.getElementById('ee-tipamt')?.value)||0;
    if (e.tip.type==='pct') e.tip.pct=tv; else e.tip.fixedAmt=tv;
  }
  saveState(); closeModal(); renderFinances();
}

// ── Merch section ─────────────────────────────────────────────────────────────

function renderMerchSection() {
  const allMerch = S.merchOptions || ['hats','tshirts'];
  const labels   = {hats:'Hats', tshirts:'T-shirts', ...(S.merchLabels||{})};
  const active   = S.merchType || 'hats';

  const toggleBtns = allMerch.map(key =>
    `<button class="merch-toggle-btn${key===active?' active':''}" onclick="setActiveMerch('${key}')">
      ${escHtml(labels[key]||key)}
    </button>`
  ).join('');

  const sections = allMerch.map(key => {
    const rows  = S[key] || [];
    const total = rows.reduce((s,r) => s+Math.round((+r.price||0)*(+r.qty||0)*100)/100, 0);
    const isAct = key === active;
    const rowsHtml = rows.map((r,i) => {
      const isOpen = _stSwipedKey===key && _stSwipedIdx===i;
      return `<div class="st-row${isOpen?' swiped':''}" id="str-${key}-${i}">
        <div class="st-row-content" ontouchstart="_authorSwipeX=event.touches[0].clientX" ontouchend="stSwipeEnd(event,'${key}',${i})">
          <div style="display:flex;align-items:center;gap:6px;padding:7px 10px;background:var(--bg);border:.5px solid var(--border);border-radius:var(--radius-sm)">
            <input class="st-name-input" type="text" value="${escHtml(r.label||'')}" placeholder="Size/style"
              onblur="stSaveField('${key}',${i},'label',this.value)"
              onkeydown="if(event.key==='Enter')this.blur()">
            ${moneyIn('stp'+key+i, r.price, `stSaveField('${key}',${i},'price',parseMoney(this.value))`, 'width:70px;font-size:12px')}
            ${numIn('stq'+key+i, r.qty, `stSaveField('${key}',${i},'qty',parseInt(this.value)||0)`, 'width:52px;font-size:12px;text-align:right')}
            <span style="font-size:12px;font-weight:600;min-width:60px;text-align:right">${fmt((+r.price||0)*(+r.qty||0))}</span>
            <button class="icon-btn del-btn" onclick="confirmDelete('Delete this item?',()=>{S.${key}.splice(${i},1);saveState();renderFinances()})" title="Delete">
              <i class="ti ti-trash" style="font-size:13px"></i>
            </button>
          </div>
        </div>
      </div>`;
    }).join('');

    return `<div style="margin-bottom:10px;border:.5px solid ${isAct?'var(--green)':'var(--border)'};border-radius:var(--radius-sm);padding:8px;opacity:${isAct?1:0.55}">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <div style="font-size:12px;font-weight:600;color:${isAct?'var(--green)':'var(--text2)'}">
          ${escHtml(labels[key]||key)} ${isAct?'✓ Active':''} · ${fmt(total)}
        </div>
        <div style="display:flex;gap:4px">
          <button class="icon-btn" onclick="S.${key}.push({label:'',price:0,qty:0});saveState();renderFinances()" title="Add row">
            <i class="ti ti-plus" style="font-size:13px"></i>
          </button>
          ${!['hats','tshirts'].includes(key)?`
          <button class="icon-btn del-btn" onclick="deleteMerchCategory('${key}')" title="Delete category">
            <i class="ti ti-trash" style="font-size:13px"></i>
          </button>`:''}
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 70px 52px 60px 30px;gap:4px;padding:0 4px;margin-bottom:3px">
        <span style="font-size:10px;color:var(--text3)">Size/style</span>
        <span style="font-size:10px;color:var(--text3);text-align:right">Price</span>
        <span style="font-size:10px;color:var(--text3);text-align:right">Qty</span>
        <span style="font-size:10px;color:var(--text3);text-align:right">Total</span>
        <span></span>
      </div>
      ${rowsHtml}
    </div>`;
  }).join('');

  return `<div class="card" id="st-merch">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <div class="card-title" style="margin-bottom:0">Merch</div>
      <button class="btn" style="font-size:11px;padding:3px 8px" onclick="openAddMerchCategory()">
        <i class="ti ti-plus"></i> Add option
      </button>
    </div>
    <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:10px">
      <span style="font-size:12px;color:var(--text2)">Active this year:</span>
      ${toggleBtns}
    </div>
    <div style="font-size:11px;color:var(--text2);margin-bottom:10px">Only the active option feeds into the budget.</div>
    ${sections}
    <div style="text-align:center;padding:10px 0 4px">
      <button class="btn" style="font-size:11px" onclick="(document.scrollingElement||document.documentElement).scrollTop=0">
        <i class="ti ti-arrow-up"></i> Return to top
      </button>
    </div>
  </div>`;
}

function setActiveMerch(key) {
  S.merchType = key;
  saveState(); renderFinances();
}

function deleteMerchCategory(key) {
  const label = (S.merchLabels||{})[key] || key;
  confirmDelete(`Delete merch category "${label}"? This cannot be undone.`, () => {
    S.merchOptions = (S.merchOptions||[]).filter(k => k!==key);
    if (S.merchLabels) delete S.merchLabels[key];
    if (S[key]) delete S[key];
    // Remove from expenses
    S.expenses = S.expenses.filter(e => !(e.type==='subtable' && e.subtable===key));
    if (S.merchType === key) S.merchType = (S.merchOptions||['hats'])[0];
    saveState(); renderFinances();
  });
}

function openAddMerchCategory() {
  showModal(`
    <h3>Add merch option</h3>
    <div class="field"><label>Name (e.g. Water bottles)</label>
      <input type="text" id="nm-name" placeholder="Merch name">
    </div>
    <div class="m-actions">
      <button class="btn" onclick="closeModal()">Cancel</button>
      <button class="btn primary" onclick="doAddMerchCategory()">Add</button>
    </div>`);
  setTimeout(()=>document.getElementById('nm-name')?.focus(),50);
}

function doAddMerchCategory() {
  const name = document.getElementById('nm-name')?.value?.trim();
  if (!name) { alert('Please enter a name.'); return; }
  const key = name.toLowerCase().replace(/[^a-z0-9]/g,'_');
  if (!S.merchOptions) S.merchOptions = ['hats','tshirts'];
  if (S.merchOptions.includes(key)) { alert('That option already exists.'); return; }
  S.merchOptions.push(key);
  if (!S.merchLabels) S.merchLabels = {};
  S.merchLabels[key] = name;
  S[key] = [];
  // Add expense line for it
  S.expenses.push({id:key, label:name, type:'subtable', subtable:key, spent:0, notes:'', expanded:false});
  saveState(); closeModal(); renderFinances();
  setTimeout(()=>scrollToId('st-merch'),100);
}

// ── Subtable: Est/Spent (decorations, misc, prizes, swag) ────────────────────

function stEstSpent(key, title) {
  const rows     = S[key] || [];
  const totEst   = rows.reduce((s,r) => s+(+r.est||0), 0);
  const totSpent = rows.reduce((s,r) => s+(+r.spent||0), 0);
  const {paying} = calcTotals();
  const perTix   = paying > 0 ? Math.round(totEst/paying*100)/100 : 0;

  const rowsHtml = rows.map((r,i) => {
    const diff = r.spent > 0 ? Math.round((+r.spent-(+r.est||0))*100)/100 : null;
    return `<div style="padding:7px 0;border-bottom:.5px solid var(--border)">
      <div style="display:flex;align-items:center;gap:6px">
        <div style="flex:1;min-width:0">
          <input class="st-name-input" type="text" value="${escHtml(r.label||'')}" placeholder="Item name"
            onblur="stSaveField('${key}',${i},'label',this.value)"
            onkeydown="if(event.key==='Enter')this.blur()">
          ${r.notes?`<div style="font-size:10px;color:var(--text3);margin-top:1px">${escHtml(r.notes)}</div>`:''}
        </div>
        <div style="display:flex;gap:6px;align-items:center;flex-shrink:0">
          <div style="text-align:right">
            <div style="font-size:10px;color:var(--text3)">Est</div>
            ${moneyIn('se'+key+i+'e', r.est, `stSaveField('${key}',${i},'est',parseMoney(this.value))`, 'width:70px;font-size:12px')}
          </div>
          <div style="text-align:right">
            <div style="font-size:10px;color:var(--text3)">Spent</div>
            ${moneyIn('se'+key+i+'s', r.spent, `stSaveField('${key}',${i},'spent',parseMoney(this.value))`, 'width:70px;font-size:12px')}
          </div>
          ${diff!==null?`<div style="font-size:10px;color:${diff>0?'var(--red)':'var(--green)'};min-width:40px;text-align:right">${diff>0?'+':''}${fmt(diff)}</div>`:'<div style="min-width:40px"></div>'}
          <button class="icon-btn" onclick="openEditStRow('${key}',${i})" title="Edit"><i class="ti ti-pencil" style="font-size:13px"></i></button>
          <button class="icon-btn del-btn" onclick="confirmDelete('Delete \\'${escHtml(r.label||'this item')}\\'?',()=>deleteStRow('${key}',${i}))" title="Delete">
            <i class="ti ti-trash" style="font-size:13px"></i>
          </button>
        </div>
      </div>
    </div>`;
  }).join('');

  return `<div class="card" id="st-${key}">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
      <div style="font-size:13px;font-weight:600">${title}</div>
      <div style="display:flex;align-items:center;gap:6px">
        <span style="font-size:11px;color:var(--text2)">Est ${fmt(totEst)} · Spent ${fmt(totSpent)} · ${fmt(perTix)}/tix</span>
        <button class="icon-btn" onclick="openAddStRow('${key}')" title="Add item"><i class="ti ti-plus" style="font-size:14px"></i></button>
      </div>
    </div>
    ${rowsHtml}
    ${rows.length===0?`<div style="color:var(--text3);font-size:12px;padding:8px 0">No items yet. Tap + to add one.</div>`:''}
    <div style="text-align:center;padding:14px 0 6px">
      <button class="btn" style="font-size:11px" onclick="(document.scrollingElement||document.documentElement).scrollTop=0">
        <i class="ti ti-arrow-up"></i> Return to top
      </button>
    </div>
  </div>`;
}

function openAddStRow(key) {
  showModal(`
    <h3>Add item</h3>
    <div class="field"><label>Item name</label><input type="text" id="asr-name" placeholder="What is it?"></div>
    <div class="field"><label>Estimated cost ($)</label><input type="text" inputmode="decimal" id="asr-est" placeholder="0.00"></div>
    <div class="field"><label>Notes (optional)</label><input type="text" id="asr-notes" placeholder="Any notes…"></div>
    <div class="m-actions">
      <button class="btn" onclick="closeModal()">Cancel</button>
      <button class="btn primary" onclick="doAddStRow('${key}')"><i class="ti ti-plus"></i> Add</button>
    </div>`);
  setTimeout(()=>document.getElementById('asr-name')?.focus(),50);
}

function doAddStRow(key) {
  const name = document.getElementById('asr-name')?.value?.trim();
  if (!name) { alert('Please enter a name.'); return; }
  if (!S[key]) S[key] = [];
  S[key].push({
    label: name,
    est:   parseFloat(document.getElementById('asr-est')?.value)||0,
    spent: 0,
    notes: document.getElementById('asr-notes')?.value?.trim()||'',
    url:   ''
  });
  saveState(); closeModal(); renderFinances();
}

function openEditStRow(key, i) {
  const r = (S[key]||[])[i];
  if (!r) return;
  showModal(`
    <h3>Edit item</h3>
    <div class="field"><label>Name</label><input type="text" id="esr-name" value="${escHtml(r.label||'')}"></div>
    <div class="field"><label>Estimated ($)</label><input type="text" inputmode="decimal" id="esr-est" value="${(+(r.est||0)).toFixed(2)}"></div>
    <div class="field"><label>Spent ($)</label><input type="text" inputmode="decimal" id="esr-spent" value="${(+(r.spent||0)).toFixed(2)}"></div>
    <div class="field"><label>Notes</label><input type="text" id="esr-notes" value="${escHtml(r.notes||'')}"></div>
    <div class="field"><label>URL (optional)</label><input type="text" id="esr-url" value="${escHtml(r.url||'')}"></div>
    <div class="m-actions">
      <button class="btn" onclick="closeModal()">Cancel</button>
      <button class="btn primary" onclick="doEditStRow('${key}',${i})"><i class="ti ti-check"></i> Save</button>
    </div>`);
}

function doEditStRow(key, i) {
  const r = (S[key]||[])[i];
  if (!r) return;
  r.label = document.getElementById('esr-name')?.value?.trim()  || r.label;
  r.est   = parseFloat(document.getElementById('esr-est')?.value)  || 0;
  r.spent = parseFloat(document.getElementById('esr-spent')?.value) || 0;
  r.notes = document.getElementById('esr-notes')?.value?.trim() || '';
  r.url   = document.getElementById('esr-url')?.value?.trim()   || '';
  saveState(); closeModal(); renderFinances();
}

function deleteStRow(key, i) {
  if (S[key]) S[key].splice(i,1);
  saveState(); renderFinances();
}

// ── Subtable: Price/Qty (totes) ───────────────────────────────────────────────

function stPriceQty(key, title) {
  const rows  = S[key] || [];
  const total = rows.reduce((s,r) => s + Math.round((+r.price||0)*(+r.qty||0)*100)/100, 0);
  const {paying} = calcTotals();
  const perTix = paying > 0 ? Math.round(total/paying*100)/100 : 0;

  const rowsHtml = rows.map((r,i) => `
    <div style="display:grid;grid-template-columns:1fr 72px 56px 64px 30px;gap:6px;align-items:center;padding:6px 0;border-bottom:.5px solid var(--border)">
      <input class="st-name-input" type="text" value="${escHtml(r.label||'')}" placeholder="Style"
        onblur="stSaveField('${key}',${i},'label',this.value)"
        onkeydown="if(event.key==='Enter')this.blur()">
      ${moneyIn('stp'+key+i, r.price, `stSaveField('${key}',${i},'price',parseMoney(this.value))`, 'width:100%;font-size:12px')}
      ${numIn('stq'+key+i, r.qty, `stSaveField('${key}',${i},'qty',parseInt(this.value)||0)`, 'width:100%;font-size:12px;text-align:right')}
      <span style="font-size:12px;font-weight:600;text-align:right">${fmt((+r.price||0)*(+r.qty||0))}</span>
      <button class="icon-btn del-btn" onclick="confirmDelete('Delete this row?',()=>deleteStRow('${key}',${i}))" title="Delete">
        <i class="ti ti-trash" style="font-size:13px"></i>
      </button>
    </div>`).join('');

  return `<div class="card" id="st-${key}">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
      <div style="font-size:13px;font-weight:600">${title}</div>
      <div style="display:flex;align-items:center;gap:6px">
        <span style="font-size:11px;color:var(--text2)">${fmt(total)} · ${fmt(perTix)}/tix</span>
        <button class="icon-btn" onclick="openAddPQRow('${key}')" title="Add row"><i class="ti ti-plus" style="font-size:14px"></i></button>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 72px 56px 64px 30px;gap:4px;padding:0 2px;margin-bottom:3px">
      <span style="font-size:10px;color:var(--text3)">Style</span>
      <span style="font-size:10px;color:var(--text3);text-align:right">Price</span>
      <span style="font-size:10px;color:var(--text3);text-align:right">Qty <span style="color:var(--purple)">(${S.attendance.total} att)</span></span>
      <span style="font-size:10px;color:var(--text3);text-align:right">Total</span>
      <span></span>
    </div>
    ${rowsHtml}
    ${rows.length===0?`<div style="color:var(--text3);font-size:12px;padding:8px 0">No rows yet. Tap + to add.</div>`:''}
    <div style="display:flex;justify-content:space-between;padding:6px 0;font-weight:600;font-size:12px">
      <span>Total</span><span>${fmt(total)}</span>
    </div>
    <div style="text-align:center;padding:14px 0 4px">
      <button class="btn" style="font-size:11px" onclick="(document.scrollingElement||document.documentElement).scrollTop=0">
        <i class="ti ti-arrow-up"></i> Return to top
      </button>
    </div>
  </div>`;
}

function openAddPQRow(key) {
  showModal(`
    <h3>Add row</h3>
    <div class="field"><label>Size / style</label><input type="text" id="apq-label" placeholder="e.g. Standard"></div>
    <div class="field"><label>Price ($)</label><input type="text" inputmode="decimal" id="apq-price" placeholder="0.00"></div>
    <div class="field"><label>Quantity</label><input type="text" inputmode="numeric" id="apq-qty" value="${S.attendance.total}"></div>
    <div class="m-actions">
      <button class="btn" onclick="closeModal()">Cancel</button>
      <button class="btn primary" onclick="doAddPQRow('${key}')"><i class="ti ti-plus"></i> Add</button>
    </div>`);
  setTimeout(()=>document.getElementById('apq-label')?.focus(),50);
}

function doAddPQRow(key) {
  if (!S[key]) S[key] = [];
  S[key].push({
    label: document.getElementById('apq-label')?.value?.trim()||'',
    price: parseFloat(document.getElementById('apq-price')?.value)||0,
    qty:   parseInt(document.getElementById('apq-qty')?.value)||0,
    notes:''
  });
  saveState(); closeModal(); renderFinances();
}

// ── Shared subtable helpers ───────────────────────────────────────────────────

function stSaveField(key, i, field, val) {
  if (S[key] && S[key][i] !== undefined) {
    S[key][i][field] = val;
    saveState();
    renderFinances();
  }
}

function stSwipeEnd(e, key, i) {
  const dx = e.changedTouches[0].clientX - _authorSwipeX;
  _stSwipedKey = dx < -50 ? key : null;
  _stSwipedIdx = dx < -50 ? i   : null;
  renderFinances();
}

function scrollToId(id) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({behavior:'smooth', block:'start'});
}
