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

// ── Cost builder: "$146 for 20, I need 175 → 9 packs, 5 left over" ───────────
function r2(n) { return Math.round((+n||0)*100)/100; }

// A "cost line" is {price, perPack, needMode, needQty, packs}.
//   needMode 'attendees' → need = total attendees (top of Finances)
//   needMode 'custom'    → need = needQty (you typed a different number)
//   needMode 'flat'      → you simply buy `packs` of them (e.g. 1 pack covers everyone)
// Older rows that only have price + qty still work (qty = how many).
function lineCalc(l) {
  l = l || {};
  const att     = +((S.attendance||{}).total) || 0;
  const perPack = Math.max(1, Math.floor(+l.perPack || 1));
  const price   = +l.price || 0;
  let mode = l.needMode;
  if (!mode) mode = (l.qty !== undefined && l.qty !== null && l.qty !== '') ? 'custom' : 'attendees';
  let need, packs;
  if (mode === 'flat') {
    packs = (l.packs === undefined || l.packs === null || l.packs === '') ? 1 : Math.max(0, Math.floor(+l.packs || 0));
    need  = packs * perPack;
  } else {
    need  = mode === 'attendees' ? att : Math.max(0, +(l.needQty !== undefined && l.needQty !== null && l.needQty !== '' ? l.needQty : (l.qty||0)) || 0);
    packs = Math.ceil(need / perPack);
  }
  return {mode, need, packs, perPack, price, total: r2(packs*price), leftover: packs*perPack - need};
}

function calcSummary(l) {
  const c = lineCalc(l);
  const priceTxt = fmt(c.price) + (c.perPack > 1 ? ' for ' + c.perPack : ' each');
  let needTxt;
  if (c.mode === 'flat') {
    needTxt = 'buying ' + c.packs + (c.perPack > 1 ? (c.packs===1?' pack':' packs') : '');
  } else {
    needTxt = 'need ' + c.need + (c.perPack > 1 ? ' → ' + c.packs + (c.packs===1?' pack':' packs') + ' (' + (c.packs*c.perPack) + ')' : '');
    if (c.leftover > 0) needTxt += ' · ' + c.leftover + ' left over';
  }
  return priceTxt + ' · ' + needTxt;
}

function rowEst(r) { return (r && r.useCalc && r.calc) ? lineCalc(r.calc).total : (+(r&&r.est)||0); }

function isMerchIncluded(key) {
  if (S.merchInclude && S.merchInclude[key] !== undefined) return !!S.merchInclude[key];
  return key === (S.merchType || 'hats');
}

function subtableTotal(name) {
  if (name === 'decorations' && typeof decorTotals === 'function') return decorTotals().est;
  const rows = S[name] || [];
  if (['tshirts','hats','totes'].includes(name) || (S.merchOptions||[]).includes(name)) {
    return rows.reduce((s,r) => s + lineCalc(r).total, 0);
  }
  return rows.reduce((s,r) => s + rowEst(r), 0);
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
    if (allMerch.includes(e.subtable) && !isMerchIncluded(e.subtable)) return 0;
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

  // Decorations spending comes from the Decorations tab.
  const decExp = S.expenses.find(x => x.id === 'decorations');
  if (decExp && typeof decorTotals === 'function') decExp.spent = decorTotals().spent;

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
  if (e.type === 'subtable' && allMerch.includes(e.subtable) && !isMerchIncluded(e.subtable)) return '';

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
    priceCell = e.subtable === 'decorations'
      ? `<button class="jump-btn" onclick="showTab('decor')">Open →</button>`
      : `<button class="jump-btn" onclick="scrollToId('st-${e.subtable}')">↓ Go</button>`;
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
    ${isSub?`<div style="font-size:12px;color:var(--text2);padding:8px 0">${e.subtable==='decorations'?'This line pulls from the <strong>Decorations</strong> tab (items marked “I need to buy it”).':'This line pulls from the <strong>'+escHtml(e.subtable)+'</strong> section below.'}</div>`:''}
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

// ── Cost builder UI (shared by Merch, Misc/Swag and Decorations) ──────────────

// Fields for price / how many come at that price / how many you need.
// p = unique id prefix. l = existing cost line (or undefined for a new one).
function costFieldsHtml(p, l) {
  l = l || {};
  const att = +((S.attendance||{}).total) || 0;
  const c   = lineCalc(l);
  const mode = (l.needMode || (l.qty!==undefined && l.qty!==null && l.qty!=='' ? 'custom' : 'attendees'));
  const customVal = (l.needQty!==undefined && l.needQty!==null && l.needQty!=='') ? l.needQty : (l.qty!==undefined && l.qty!==null && l.qty!=='' ? l.qty : att);
  const packsVal  = (l.packs!==undefined && l.packs!==null && l.packs!=='') ? l.packs : 1;
  const radio = (v, html) => `<label style="display:flex;align-items:center;gap:8px;padding:6px 0;font-size:13px;color:var(--text);margin:0">
      <input type="radio" name="${p}-mode" value="${v}" ${mode===v?'checked':''} style="width:auto;flex:none"> ${html}</label>`;
  return `
    <div style="display:flex;gap:8px">
      <div class="field" style="flex:1"><label>Price ($)</label>
        <input type="text" inputmode="decimal" id="${p}-price" value="${l.price?(+l.price).toFixed(2):''}" placeholder="0.00"></div>
      <div class="field" style="flex:1"><label>How many come at that price?</label>
        <input type="text" inputmode="numeric" id="${p}-per" value="${l.perPack||1}"></div>
    </div>
    <div class="field" style="margin-bottom:4px"><label>How many do you need?</label>
      ${radio('attendees', `For everyone (<strong>${att}</strong> attendees)`)}
      ${radio('custom', `A different number: <input type="text" inputmode="numeric" id="${p}-needq" value="${customVal}" style="width:80px" onfocus="document.querySelector('input[name=&quot;${p}-mode&quot;][value=custom]').checked=true">`)}
      ${radio('flat', `I just need to buy: <input type="text" inputmode="numeric" id="${p}-packs" value="${packsVal}" style="width:64px" onfocus="document.querySelector('input[name=&quot;${p}-mode&quot;][value=flat]').checked=true"> <span style="color:var(--text2);font-size:12px">(one covers everyone)</span>`)}
    </div>
    <button type="button" class="btn" onclick="costCalcPreview('${p}')" style="margin-bottom:6px"><i class="ti ti-calculator"></i> Calculate</button>
    <div id="${p}-result" style="font-size:12px;background:var(--bg2);border-radius:var(--radius-sm);padding:8px 10px;margin-bottom:10px">${l.price ? costResultHtml(c) : '<span style="color:var(--text3)">Tap Calculate to see how many to buy and what it costs.</span>'}</div>`;
}

function readCostFields(p) {
  const g = id => document.getElementById(p + '-' + id)?.value;
  const mode = document.querySelector('input[name="' + p + '-mode"]:checked')?.value || 'attendees';
  const out = {
    price:   parseMoney(g('price')),
    perPack: Math.max(1, parseInt(g('per')) || 1),
    needMode: mode
  };
  if (mode === 'custom') out.needQty = Math.max(0, parseInt(g('needq')) || 0);
  if (mode === 'flat')   out.packs   = Math.max(0, parseInt(g('packs')) || 0);
  return out;
}

function costResultHtml(c) {
  const {paying} = calcTotals();
  const perTix = paying > 0 ? r2(c.total / paying) : 0;
  const lines = [];
  if (c.mode === 'flat') {
    lines.push(`Buying <strong>${c.packs}</strong>${c.perPack>1?` pack${c.packs===1?'':'s'} (${c.packs*c.perPack} total)`:''}`);
  } else {
    lines.push(`You need <strong>${c.need}</strong>` + (c.perPack>1 ? ` → buy <strong>${c.packs}</strong> pack${c.packs===1?'':'s'} (${c.packs*c.perPack})` : ''));
    if (c.leftover > 0) lines.push(`${c.leftover} left over`);
  }
  lines.push(`Cost: <strong>${fmt(c.total)}</strong>`);
  lines.push(`<span style="color:var(--purple)">${fmt(perTix)} per ticket</span> <span style="color:var(--text3)">(${paying} paying tickets)</span>`);
  return lines.join(' · ');
}

function costCalcPreview(p) {
  const box = document.getElementById(p + '-result');
  if (box) box.innerHTML = costResultHtml(lineCalc(readCostFields(p)));
}

// ── Merch section ──────────────────────────────────────────────────────────

function renderMerchSection() {
  const allMerch = S.merchOptions || ['hats','tshirts'];
  const labels   = {hats:'Hats', tshirts:'T-shirts', ...(S.merchLabels||{})};
  const {paying} = calcTotals();
  let includedTotal = 0;

  const sections = allMerch.map(key => {
    const rows  = S[key] || [];
    const total = r2(rows.reduce((s,r) => s + lineCalc(r).total, 0));
    const inc   = isMerchIncluded(key);
    if (inc) includedTotal += total;
    const perTix = paying > 0 ? r2(total/paying) : 0;
    const rowsHtml = rows.map((r,i) => {
      const c = lineCalc(r);
      return `<div style="display:flex;align-items:center;gap:6px;padding:8px 10px;margin-bottom:4px;background:var(--bg);border:.5px solid var(--border);border-radius:var(--radius-sm)">
        <div style="flex:1;min-width:0;cursor:pointer" onclick="openMerchLine('${key}',${i})">
          <div style="font-size:13px;font-weight:500">${escHtml(r.label||'(unnamed)')}</div>
          <div style="font-size:10px;color:var(--text3);margin-top:1px">${escHtml(calcSummary(r))}</div>
          ${r.notes?`<div style="font-size:10px;color:var(--text3)">${escHtml(r.notes)}</div>`:''}
        </div>
        <div style="text-align:right;flex-shrink:0">
          <div style="font-size:13px;font-weight:600">${fmt(c.total)}</div>
          <div style="font-size:10px;color:var(--purple)">${fmt(paying>0?r2(c.total/paying):0)}/tix</div>
        </div>
        <button class="icon-btn" onclick="openMerchLine('${key}',${i})" title="Edit"><i class="ti ti-pencil" style="font-size:14px"></i></button>
        <button class="icon-btn del-btn" onclick="confirmDelete('Delete this item?',()=>deleteMerchLine('${key}',${i}))" title="Delete"><i class="ti ti-trash" style="font-size:14px"></i></button>
      </div>`;
    }).join('') || '<div style="color:var(--text3);font-size:12px;padding:6px 2px">Nothing here yet. Tap “Add item”.</div>';

    return `<div style="margin-bottom:12px;border:.5px solid ${inc?'var(--green)':'var(--border)'};border-radius:var(--radius-sm);padding:10px">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap">
        <label style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;color:${inc?'var(--green-text)':'var(--text2)'};margin:0;cursor:pointer">
          <input type="checkbox" ${inc?'checked':''} style="width:18px;height:18px;accent-color:var(--green);flex:none" onchange="toggleMerchInclude('${key}',this.checked)">
          ${escHtml(labels[key]||key)}
        </label>
        <div style="text-align:right">
          <span style="font-size:13px;font-weight:700">${fmt(total)}</span>
          <span style="font-size:11px;color:var(--purple);margin-left:6px">${fmt(perTix)}/ticket</span>
        </div>
      </div>
      <div style="font-size:10px;color:var(--text3);margin:-2px 0 8px 26px">${inc?'Counted in the budget':'Not counted in the budget (tick to include)'}</div>
      ${rowsHtml}
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px">
        <button class="btn" style="font-size:12px" onclick="openMerchLine('${key}',-1)"><i class="ti ti-plus"></i> Add item</button>
        ${!['hats','tshirts'].includes(key)?`<button class="icon-btn del-btn" onclick="deleteMerchCategory('${key}')" title="Delete this merch option"><i class="ti ti-trash" style="font-size:14px"></i></button>`:''}
      </div>
    </div>`;
  }).join('');

  return `<div class="card" id="st-merch">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <div class="card-title" style="margin-bottom:0;border:none;padding:0">Merch</div>
      <button class="btn" style="font-size:11px;padding:3px 8px" onclick="openAddMerchCategory()">
        <i class="ti ti-plus"></i> Add option
      </button>
    </div>
    <div style="font-size:11px;color:var(--text2);margin-bottom:10px">Tick every merch option you’re going to do. The ticked ones add up into the Merch budget (${fmt(includedTotal)} right now).</div>
    ${sections}
    <div style="text-align:center;padding:10px 0 4px">
      <button class="btn" style="font-size:11px" onclick="(document.scrollingElement||document.documentElement).scrollTop=0">
        <i class="ti ti-arrow-up"></i> Return to top
      </button>
    </div>
  </div>`;
}

function toggleMerchInclude(key, on) {
  if (!S.merchInclude) S.merchInclude = {};
  // First time: record the current state of every option so nothing else flips.
  (S.merchOptions||[]).forEach(k => { if (S.merchInclude[k] === undefined) S.merchInclude[k] = isMerchIncluded(k); });
  S.merchInclude[key] = !!on;
  saveState(); renderFinances();
}

function openMerchLine(key, i) {
  const rows = S[key] || [];
  const r = i >= 0 ? rows[i] : null;
  if (i >= 0 && !r) return;
  const labels = {hats:'Hats', tshirts:'T-shirts', ...(S.merchLabels||{})};
  showModal(`
    <h3>${r?'Edit':'Add'} item — ${escHtml(labels[key]||key)}</h3>
    <div class="field"><label>What is it? (e.g. Tumblers, Sublimation paper, Ink)</label>
      <input type="text" id="ml-name" value="${escHtml(r?r.label||'':'')}" placeholder="Item name"></div>
    ${costFieldsHtml('ml', r || {})}
    <div class="field"><label>Notes (optional)</label><input type="text" id="ml-notes" value="${escHtml(r?r.notes||'':'')}"></div>
    <div class="field"><label>Link (optional)</label><input type="text" id="ml-url" value="${escHtml(r?r.url||'':'')}"></div>
    <div class="m-actions">
      <button class="btn" onclick="closeModal()">Cancel</button>
      <button class="btn primary" onclick="saveMerchLine('${key}',${i})"><i class="ti ti-check"></i> Save</button>
    </div>`);
  if (!r) document.getElementById('ml-name')?.focus();
}

function saveMerchLine(key, i) {
  const name = document.getElementById('ml-name')?.value?.trim();
  if (!name) { alert('Please enter a name.'); return; }
  if (!S[key]) S[key] = [];
  const cf = readCostFields('ml');
  const base = i >= 0 ? S[key][i] : {};
  const line = Object.assign({}, base, cf, {
    label: name,
    notes: document.getElementById('ml-notes')?.value?.trim() || '',
    url:   document.getElementById('ml-url')?.value?.trim() || ''
  });
  if (cf.needMode !== 'custom') delete line.needQty;
  if (cf.needMode !== 'flat')   delete line.packs;
  line.qty = lineCalc(line).need;   // keeps older code that reads qty happy
  if (i >= 0) S[key][i] = line; else S[key].push(line);
  saveState(); closeModal(); renderFinances();
}

function deleteMerchLine(key, i) {
  if (S[key]) S[key].splice(i, 1);
  saveState(); renderFinances();
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
  if (!S.merchInclude) S.merchInclude = {};
  (S.merchOptions||[]).forEach(k => { if (S.merchInclude[k] === undefined) S.merchInclude[k] = isMerchIncluded(k); });
  S.merchInclude[key] = true;
  // Add expense line for it
  S.expenses.push({id:key, label:name, type:'subtable', subtable:key, spent:0, notes:'', expanded:false});
  saveState(); closeModal(); renderFinances();
  setTimeout(()=>scrollToId('st-merch'),100);
}

// ── Subtable: Est/Spent (decorations, misc, prizes, swag) ────────────────────

function stEstSpent(key, title) {
  const rows     = S[key] || [];
  const totEst   = rows.reduce((s,r) => s+rowEst(r), 0);
  const totSpent = rows.reduce((s,r) => s+(+r.spent||0), 0);
  const {paying} = calcTotals();
  const perTix   = paying > 0 ? Math.round(totEst/paying*100)/100 : 0;

  const rowsHtml = rows.map((r,i) => {
    const diff = r.spent > 0 ? Math.round((+r.spent-rowEst(r))*100)/100 : null;
    return `<div style="padding:7px 0;border-bottom:.5px solid var(--border)">
      <div style="display:flex;align-items:center;gap:6px">
        <div style="flex:1;min-width:0">
          <input class="st-name-input" type="text" value="${escHtml(r.label||'')}" placeholder="Item name"
            onblur="stSaveField('${key}',${i},'label',this.value)"
            onkeydown="if(event.key==='Enter')this.blur()">
          ${r.useCalc&&r.calc?`<div style="font-size:10px;color:var(--purple);margin-top:1px">${escHtml(calcSummary(r.calc))}</div>`:''}
          ${r.notes?`<div style="font-size:10px;color:var(--text3);margin-top:1px">${escHtml(r.notes)}</div>`:''}
        </div>
        <div style="display:flex;gap:6px;align-items:center;flex-shrink:0">
          <div style="text-align:right">
            <div style="font-size:10px;color:var(--text3)">Est</div>
            ${moneyIn('se'+key+i+'e', rowEst(r), `stSaveField('${key}',${i},'est',parseMoney(this.value))`, 'width:70px;font-size:12px')}
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

function stCalcBlock(r) {
  const on = !!(r && r.useCalc && r.calc);
  return `
    <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--text);margin:4px 0 8px;cursor:pointer">
      <input type="checkbox" id="sc-use" ${on?'checked':''} style="width:auto;flex:none"
        onchange="document.getElementById('sc-box').style.display=this.checked?'block':'none';document.getElementById('sc-est-field').style.display=this.checked?'none':'block'">
      Work out the cost for me (price per pack, how many I need…)
    </label>
    <div id="sc-box" style="display:${on?'block':'none'}">${costFieldsHtml('sc', on ? r.calc : {})}</div>`;
}

function openAddStRow(key) {
  showModal(`
    <h3>Add item</h3>
    <div class="field"><label>Item name</label><input type="text" id="asr-name" placeholder="What is it?"></div>
    <div class="field" id="sc-est-field"><label>Estimated cost ($)</label><input type="text" inputmode="decimal" id="asr-est" placeholder="0.00"></div>
    ${stCalcBlock(null)}
    <div class="field"><label>Notes (optional)</label><input type="text" id="asr-notes" placeholder="Any notes…"></div>
    <div class="m-actions">
      <button class="btn" onclick="closeModal()">Cancel</button>
      <button class="btn primary" onclick="doAddStRow('${key}')"><i class="ti ti-plus"></i> Add</button>
    </div>`);
  document.getElementById('asr-name')?.focus();
}

function doAddStRow(key) {
  const name = document.getElementById('asr-name')?.value?.trim();
  if (!name) { alert('Please enter a name.'); return; }
  if (!S[key]) S[key] = [];
  const row = {
    label: name,
    est:   parseMoney(document.getElementById('asr-est')?.value),
    spent: 0,
    notes: document.getElementById('asr-notes')?.value?.trim()||'',
    url:   ''
  };
  if (document.getElementById('sc-use')?.checked) {
    row.calc = readCostFields('sc'); row.useCalc = true; row.est = lineCalc(row.calc).total;
  }
  S[key].push(row);
  saveState(); closeModal(); renderFinances();
}

function openEditStRow(key, i) {
  const r = (S[key]||[])[i];
  if (!r) return;
  const on = !!(r.useCalc && r.calc);
  showModal(`
    <h3>Edit item</h3>
    <div class="field"><label>Name</label><input type="text" id="esr-name" value="${escHtml(r.label||'')}"></div>
    <div class="field" id="sc-est-field" style="display:${on?'none':'block'}"><label>Estimated ($)</label><input type="text" inputmode="decimal" id="esr-est" value="${rowEst(r).toFixed(2)}"></div>
    ${stCalcBlock(r)}
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
  r.spent = parseMoney(document.getElementById('esr-spent')?.value);
  r.notes = document.getElementById('esr-notes')?.value?.trim() || '';
  r.url   = document.getElementById('esr-url')?.value?.trim()   || '';
  if (document.getElementById('sc-use')?.checked) {
    r.calc = readCostFields('sc'); r.useCalc = true; r.est = lineCalc(r.calc).total;
  } else {
    r.useCalc = false;
    r.est = parseMoney(document.getElementById('esr-est')?.value);
  }
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
    if (field === 'est') S[key][i].useCalc = false;   // typing a number yourself turns the calculator off
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
