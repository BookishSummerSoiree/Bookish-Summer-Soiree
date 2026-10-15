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
  const total   = r2(packs*price);
  const bought  = Math.max(0, Math.floor(+l.bought || 0));
  const paidSet = l.paid !== undefined && l.paid !== null && l.paid !== '';
  const spent   = paidSet ? r2(+l.paid) : r2(bought * price);
  return {mode, need, packs, perPack, price, total, leftover: packs*perPack - need,
          bought, spent, packsLeft: Math.max(0, packs - bought), costLeft: r2(Math.max(0, total - spent)), paidSet};
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
  let out = priceTxt + ' · ' + needTxt;
  if (c.bought > 0) out += ' · bought ' + c.bought + ' of ' + c.packs;
  else if (c.paidSet && c.spent > 0) out += ' · paid ' + fmt(c.spent);
  return out;
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

// Tickets the credit card fee applies to: tickets actually sold (attendees minus
// free authors/admin), unless a "tickets sold" number was typed on the fee line.
function ccTickets(e) {
  const a = S.attendance || {total:0, authors:0, admin:0};
  const basis = (e && e.ccBasis) || ((e && e.ticketsSold !== undefined && e.ticketsSold !== null && e.ticketsSold !== '') ? 'set' : 'paying');
  if (basis === 'total') return Math.max(0, +a.total || 0);
  if (basis === 'set')   return Math.max(0, Math.floor(+(e && e.ticketsSold)) || 0);
  return Math.max(0, a.total - a.authors - a.admin);
}
// Make sure the credit card fee line is really a credit card fee line.
function fixCCLine() {
  (S.expenses||[]).forEach(e => {
    if ((e.id === 'cc_fee' || /processing/i.test(e.label||'')) && e.type !== 'cc_fee') {
      e.type = 'cc_fee';
      if (!e.ccPct) e.ccPct = S.ccFeePercent || 3.2;
      e.ccBasis = 'paying';
      delete e.unitLabelType; delete e.qty; delete e.unitPrice; delete e.fixedAmt; delete e.unitLabel;
    }
    if (e.type === 'cc_fee' && !e.ccBasis) e.ccBasis = (e.ticketsSold !== undefined && e.ticketsSold !== null && e.ticketsSold !== '') ? 'set' : 'paying';
  });
}

function ccBasisOf(e) { return e.ccBasis || ((e.ticketsSold!==undefined&&e.ticketsSold!==null&&e.ticketsSold!=='')?'set':'paying'); }

function lineEst(e) {
  if (e.type === 'cc_fee') {
    // CC fee = percentage of ticket price × number of paying tickets
    const pct    = +(e.ccPct || S.ccFeePercent || 3.2);
    const paying = ccTickets(e);
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
  fixCCLine();
  if (S.ticketPrice === undefined) S.ticketPrice = 0;
  if (S.ccFeePercent === undefined) S.ccFeePercent = 3.2;

  // Decorations spending comes from the Decorations tab.
  const decExp = S.expenses.find(x => x.id === 'decorations');
  if (decExp && typeof decorTotals === 'function') decExp.spent = decorTotals().spent;
  // Merch spending comes from the "bought so far" amounts on each merch item.
  (S.expenses||[]).forEach(x => {
    if (x.type === 'subtable' && (S.merchOptions||[]).includes(x.subtable)) {
      x.spent = r2((S[x.subtable]||[]).reduce((s,r) => s + lineCalc(r).spent, 0));
    }
  });

  ['misc','swag'].forEach(k => {
    const x = S.expenses.find(y => y.type === 'subtable' && y.subtable === k);
    if (x) x.spent = r2((S[k]||[]).reduce((t,r) => t + (+r.spent||0), 0) + (k === 'swag' ? prizeSwagTotal() : 0));
  });
  const totesExp = S.expenses.find(y => y.type === 'subtable' && y.subtable === 'totes');
  if (totesExp) totesExp.spent = r2(+S.totesSpent || 0);

  applyPrizeSpend();
  refreshPrizeSpend();
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
      <div class="att-cell" style="cursor:pointer" onclick="openSpentList()" title="Tap to see what's been spent">
        <div class="att-lbl">Spent so far <i class="ti ti-list-details" style="font-size:11px"></i></div>
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
      <div style="display:flex;align-items:center;gap:4px">${chev('sec:exp')}<div class="card-title" style="margin-bottom:0">Expenses</div></div>
      <button class="btn primary" style="font-size:11px;padding:4px 10px" onclick="openAddExpense()">
        <i class="ti ti-plus"></i> Add line
      </button>
    </div>
    ${isCol('sec:exp')?'':`<div style="margin-bottom:8px">${sortSelect('exp')}</div>
    <div id="expense-list">
      ${sortedIdx(S.expenses,'exp',e=>lineEst(e)).map(i => expRow(S.expenses[i],i,paying)).join('')}
    </div>`}
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
  const isAuto = e.id === 'prizes_budget' || e.id === 'raffle';

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
      ${isCC?`<div style="font-size:10px;color:var(--text3)">${e.ccPct||S.ccFeePercent||3.2}% × ${fmt(S.ticketPrice||0)} × ${ccTickets(e)} ${ccBasisOf(e)==='total'?'attendees':ccBasisOf(e)==='set'?'tickets':'paying tickets'}</div>`:''}
    </div>
    <div class="exp-price">${priceCell}</div>
    <div class="exp-est">
      <div style="font-size:13px;font-weight:600">${fmt(est)}</div>
      <div style="font-size:10px;color:var(--purple)">${fmt(perTix)}/tix</div>
    </div>
    <div class="exp-spent">
      ${isAuto
        ? `<div style="font-size:12px;color:var(--text2)">${spent>0?fmt(spent):'—'}</div><div style="font-size:9px;color:var(--text3)">from Prizes</div>`
        : isSub
        ? `<div style="font-size:12px;color:var(--text2)">${spent>0?fmt(spent):'—'}</div>`
        : moneyIn('es'+i, spent||'', `blurExpField(${i},'spent',this.value,'money')`, 'width:78px;font-size:12px')}
      ${diff!==null?`<div style="font-size:10px;color:${diff>0?'var(--red)':'var(--green)'}">${diff>0?'+':''}${fmt(diff)}</div>`:''}
    </div>
    <div class="exp-actions">
      <button class="icon-btn" onclick="openEditExpense(${i})" title="Edit"><i class="ti ti-pencil" style="font-size:14px"></i></button>
      <button class="icon-btn del-btn" onclick="confirmDelete('Delete \\'${jsq(e.label)}\\'?', ()=>deleteExp(${i}))" title="Delete"><i class="ti ti-trash" style="font-size:14px"></i></button>
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
    ${isCC?`<div class="field"><label>CC processing fee (%)</label><input type="text" inputmode="decimal" id="ee-cc" value="${e.ccPct||S.ccFeePercent||3.2}"></div>
    <div class="field"><label>Work out the total fee from</label>
      <select id="ee-ccbasis" onchange="document.getElementById('ee-sold-wrap').style.display=this.value==='set'?'block':'none'">
        <option value="paying"${ccBasisOf(e)==='paying'?' selected':''}>Paying tickets (${Math.max(0, S.attendance.total - S.attendance.authors - S.attendance.admin)})</option>
        <option value="total"${ccBasisOf(e)==='total'?' selected':''}>Total attendees (${S.attendance.total})</option>
        <option value="set"${ccBasisOf(e)==='set'?' selected':''}>A number I type</option>
      </select></div>
    <div class="field" id="ee-sold-wrap" style="display:${ccBasisOf(e)==='set'?'block':'none'}"><label>Number of tickets</label><input type="text" inputmode="numeric" id="ee-sold" value="${(e.ticketsSold!==undefined&&e.ticketsSold!==null&&e.ticketsSold!=='')?e.ticketsSold:''}"></div>
    <div style="font-size:11px;color:var(--text3);margin-bottom:8px">Fee = ${e.ccPct||S.ccFeePercent||3.2}% of the ticket price (${fmt(S.ticketPrice||0)}) × the number of tickets chosen above.</div>`:''}
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
  if (e.type==='cc_fee')  {
    e.ccPct = parseFloat(document.getElementById('ee-cc')?.value)||3.2;
    e.ccBasis = document.getElementById('ee-ccbasis')?.value || 'paying';
    const sold = String(document.getElementById('ee-sold')?.value||'').trim();
    if (e.ccBasis === 'set' && sold !== '') e.ticketsSold = Math.max(0, parseInt(sold)||0); else delete e.ticketsSold;
    if (e.ccBasis === 'set' && sold === '') e.ccBasis = 'paying';
  }
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
    <div style="display:flex;gap:8px">
      <div class="field" style="flex:1"><label>Bought so far <span style="color:var(--text3)">(packs, or items)</span></label>
        <input type="text" inputmode="numeric" id="${p}-bought" value="${l.bought||''}" placeholder="0"></div>
      <div class="field" style="flex:1"><label>Actually paid ($) <span style="color:var(--text3)">(only if not packs × price)</span></label>
        <input type="text" inputmode="decimal" id="${p}-paid" value="${(l.paid!==undefined&&l.paid!==null&&l.paid!=='')?(+l.paid).toFixed(2):''}" placeholder="auto"></div>
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
  const bought = parseInt(g('bought')) || 0;
  if (bought > 0) out.bought = bought;
  const paidTxt = String(g('paid') || '').trim();
  if (paidTxt !== '') out.paid = parseMoney(paidTxt);
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
  let html = lines.join(' · ');
  if (c.bought > 0 || (c.paidSet && c.spent > 0)) {
    const got = c.bought > 0 ? `Bought <strong>${c.bought}</strong> of ${c.packs}${c.perPack>1?` pack${c.packs===1?'':'s'} (${c.bought*c.perPack} of ${c.packs*c.perPack})`:''} · ` : '';
    html += `<div style="margin-top:6px;padding-top:6px;border-top:.5px solid var(--border)">${got}Spent <strong>${fmt(c.spent)}</strong>`
      + (c.packsLeft > 0 || c.costLeft > 0 ? ` · Still to buy: <strong>${c.packsLeft}</strong>${c.perPack>1?` pack${c.packsLeft===1?'':'s'}`:''} (${fmt(c.costLeft)})` : ` · <span style="color:var(--green)">All bought</span>`)
      + `</div>`;
  }
  return html;
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
    const spentTot = r2(rows.reduce((s,r) => s + lineCalc(r).spent, 0));
    const inc   = isMerchIncluded(key);
    if (inc) includedTotal += total;
    const perTix = paying > 0 ? r2(total/paying) : 0;
    const rowsHtml = sortedIdx(rows,'merch',r=>lineCalc(r).total).map(i => {
      const r = rows[i];
      const c = lineCalc(r);
      const cid = 'mi:' + itemCid(r);
      const col = isCol(cid);
      return `<div style="padding:8px 10px;margin-bottom:4px;background:var(--bg);border:.5px solid var(--border);border-radius:var(--radius-sm)">
        <div style="display:flex;align-items:center;gap:4px">
          ${chev(cid)}
          <div style="flex:1;min-width:0;cursor:pointer" onclick="toggleCol('${cid}')">
            <div style="font-size:13px;font-weight:500">${escHtml(r.label||'(unnamed)')}</div>
          </div>
          <div style="text-align:right;flex-shrink:0">
            <div style="font-size:13px;font-weight:600">${fmt(c.total)}</div>
            ${col&&c.spent>0?`<div style="font-size:10px;color:var(--green)">paid ${fmt(c.spent)}</div>`:''}
          </div>
          <button class="icon-btn" onclick="openMerchLine('${key}',${i})" title="Edit"><i class="ti ti-pencil" style="font-size:14px"></i></button>
          <button class="icon-btn del-btn" onclick="confirmDelete('Delete this item?',()=>deleteMerchLine('${key}',${i}))" title="Delete"><i class="ti ti-trash" style="font-size:14px"></i></button>
        </div>
        ${col?'':`<div style="margin:4px 0 0 30px">
          <div style="font-size:10px;color:var(--text3)">${escHtml(calcSummary(r))}</div>
          ${r.notes?`<div style="font-size:10px;color:var(--text3)">${linkify(r.notes)}</div>`:''}
          ${linkChip(r.url)}
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:4px">
            <span style="font-size:10px;color:var(--purple)">${fmt(paying>0?r2(c.total/paying):0)}/tix</span>
            <span style="font-size:11px;color:${c.spent>0?'var(--green)':'var(--text3)'}">paid ${fmt(c.spent)}${c.total>0?' of '+fmt(c.total):''}</span>
            <button class="btn" style="font-size:11px;padding:2px 8px" onclick="openPayment('${key}',${i})"><i class="ti ti-cash"></i> I paid something</button>
          </div>
        </div>`}
      </div>`;
    }).join('') || '<div style="color:var(--text3);font-size:12px;padding:6px 2px">Nothing here yet. Tap “Add item”.</div>';

    return `<div style="margin-bottom:12px;border:.5px solid ${inc?'var(--green)':'var(--border)'};border-radius:var(--radius-sm);padding:10px">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap">
        <div style="display:flex;align-items:center;gap:2px">${chev('mo:'+key)}<label style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;color:${inc?'var(--green-text)':'var(--text2)'};margin:0;cursor:pointer">
          <input type="checkbox" ${inc?'checked':''} style="width:18px;height:18px;accent-color:var(--green);flex:none" onchange="toggleMerchInclude('${key}',this.checked)">
          ${escHtml(labels[key]||key)}
        </label></div>
        <div style="text-align:right">
          <span style="font-size:13px;font-weight:700">${fmt(total)}</span>
          <span style="font-size:11px;color:var(--purple);margin-left:6px">${fmt(perTix)}/ticket</span>
          ${spentTot>0?`<div style="font-size:11px;color:var(--green)">paid so far ${fmt(spentTot)}</div>`:''}
        </div>
      </div>
      <div style="font-size:10px;color:var(--text3);margin:-2px 0 4px 26px">${inc?'Counted in the budget':'Not counted in the budget (tick to include)'}</div>
      ${isCol('mo:'+key)?'':`
      <div style="display:flex;gap:6px;margin:6px 0">
        <button class="btn" style="font-size:11px;padding:2px 8px" onclick="setAllCol(${JSON.stringify(rows.map(r=>'mi:'+itemCid(r))).replace(/"/g,'&quot;')},true)">Collapse items</button>
        <button class="btn" style="font-size:11px;padding:2px 8px" onclick="setAllCol(${JSON.stringify(rows.map(r=>'mi:'+itemCid(r))).replace(/"/g,'&quot;')},false)">Expand items</button>
      </div>
      ${rowsHtml}
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px">
        <button class="btn" style="font-size:12px" onclick="openMerchLine('${key}',-1)"><i class="ti ti-plus"></i> Add item</button>
        ${!['hats','tshirts'].includes(key)?`<button class="icon-btn del-btn" onclick="deleteMerchCategory('${key}')" title="Delete this merch option"><i class="ti ti-trash" style="font-size:14px"></i></button>`:''}
      </div>`}
    </div>`;
  }).join('');

  return `<div class="card" id="st-merch">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <div style="display:flex;align-items:center;gap:4px">${chev('sec:merch')}<div class="card-title" style="margin-bottom:0;border:none;padding:0">Merch</div></div>
      <button class="btn" style="font-size:11px;padding:3px 8px" onclick="openAddMerchCategory()">
        <i class="ti ti-plus"></i> Add option
      </button>
    </div>
    ${isCol('sec:merch')?`<div style="font-size:11px;color:var(--text2)">Merch budget ${fmt(includedTotal)}</div>`:`
    <div style="font-size:11px;color:var(--text2);margin-bottom:8px">Tick every merch option you’re going to do. The ticked ones add up into the Merch budget (${fmt(includedTotal)} right now).</div>
    <div style="margin-bottom:8px">${sortSelect('merch')}</div>
    ${sections}
    <div style="text-align:center;padding:10px 0 4px">
      <button class="btn" style="font-size:11px" onclick="(document.scrollingElement||document.documentElement).scrollTop=0">
        <i class="ti ti-arrow-up"></i> Return to top
      </button>
    </div>`}
  </div>`;
}

// Quick "I paid something": adds to what's already recorded as spent.
function openPayment(key, i) {
  const r = (S[key]||[])[i];
  if (!r) return;
  const c = lineCalc(r);
  showModal(`
    <h3>I paid something — ${escHtml(r.label||'')}</h3>
    <div style="font-size:12px;color:var(--text2);margin-bottom:8px">So far: ${fmt(c.spent)} of ${fmt(c.total)}${c.bought>0?' · bought '+c.bought+' of '+c.packs:''}</div>
    <div class="field"><label>Amount just paid ($)</label><input type="text" inputmode="decimal" id="pay-amt" placeholder="${c.price?'blank = packs × '+fmt(c.price):'0.00'}"></div>
    <div class="field"><label>How many packs (or items) did that buy? <span style="color:var(--text3)">(optional)</span></label><input type="text" inputmode="numeric" id="pay-packs" placeholder="0"></div>
    <div class="m-actions">
      <button class="btn" onclick="closeModal()">Cancel</button>
      <button class="btn primary" onclick="savePayment('${key}',${i})"><i class="ti ti-check"></i> Add</button>
    </div>`);
  setTimeout(()=>document.getElementById('pay-amt')?.focus(),50);
}
function savePayment(key, i) {
  const r = (S[key]||[])[i];
  if (!r) return;
  const c = lineCalc(r);
  const packs = parseInt(document.getElementById('pay-packs')?.value) || 0;
  const txt = String(document.getElementById('pay-amt')?.value||'').trim();
  const amt = txt !== '' ? parseMoney(txt) : r2(packs * c.price);
  if (!(amt > 0) && !packs) { closeModal(); return; }
  r.paid = r2(c.spent + amt);
  if (packs > 0) r.bought = c.bought + packs;
  saveState(); closeModal(); renderFinances();
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

  const rowsHtml = sortedIdx(rows,key,r=>rowEst(r)).map(i => {
    const r = rows[i];
    const diff = r.spent > 0 ? Math.round((+r.spent-rowEst(r))*100)/100 : null;
    return `<div style="padding:7px 0;border-bottom:.5px solid var(--border)">
      <div style="display:flex;align-items:center;gap:6px">
        <div style="flex:1;min-width:0">
          <input class="st-name-input" type="text" value="${escHtml(r.label||'')}" placeholder="Item name"
            onblur="stSaveField('${key}',${i},'label',this.value)"
            onkeydown="if(event.key==='Enter')this.blur()">
          ${r.useCalc&&r.calc?`<div style="font-size:10px;color:var(--purple);margin-top:1px">${escHtml(calcSummary(r.calc))}</div>`:''}
          ${r.notes?`<div style="font-size:10px;color:var(--text3);margin-top:1px">${linkify(r.notes)}</div>`:''}
          ${linkChip(r.url)}
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
          <button class="icon-btn del-btn" onclick="confirmDelete('Delete \\'${jsq(r.label||'this item')}\\'?',()=>deleteStRow('${key}',${i}))" title="Delete">
            <i class="ti ti-trash" style="font-size:13px"></i>
          </button>
        </div>
      </div>
    </div>`;
  }).join('');

  return `<div class="card" id="st-${key}">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;gap:6px">
      <div style="display:flex;align-items:center;gap:2px;font-size:13px;font-weight:600">${chev('sec:'+key)}${title}</div>
      <div style="display:flex;align-items:center;gap:6px">
        <span style="font-size:11px;color:var(--text2)">Est ${fmt(totEst)} · Spent ${fmt(totSpent)} · ${fmt(perTix)}/tix</span>
        <button class="icon-btn" onclick="openAddStRow('${key}')" title="Add item"><i class="ti ti-plus" style="font-size:14px"></i></button>
      </div>
    </div>
    ${isCol('sec:'+key)?'':`<div style="margin-bottom:6px">${sortSelect(key)}</div>
    ${key==='swag'&&prizeSwagTotal()>0?`<div style="font-size:11px;color:var(--text2);margin-bottom:6px">+ ${fmt(prizeSwagTotal())} paid for SWAG Bag prizes in the Prize Manager (counted in Spent so far)</div>`:''}
    ${rowsHtml}
    ${rows.length===0?`<div style="color:var(--text3);font-size:12px;padding:8px 0">No items yet. Tap + to add one.</div>`:''}
    <div style="text-align:center;padding:14px 0 6px">
      <button class="btn" style="font-size:11px" onclick="(document.scrollingElement||document.documentElement).scrollTop=0">
        <i class="ti ti-arrow-up"></i> Return to top
      </button>
    </div>`}
  </div>`;
}

function stCalcBlock(r) {
  const on = !!(r && r.useCalc && r.calc);
  return `
    <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--text);margin:4px 0 8px;cursor:pointer">
      <input type="checkbox" id="sc-use" ${on?'checked':''} style="width:auto;flex:none"
        onchange="document.getElementById('sc-box').style.display=this.checked?'block':'none';document.getElementById('sc-est-field').style.display=this.checked?'none':'block';var sf=document.getElementById('sc-spent-field');if(sf)sf.style.display=this.checked?'none':'block'">
      Work out the cost for me (price per pack, how many I need…)
    </label>
    <div id="sc-box" style="display:${on?'block':'none'}">${costFieldsHtml('sc', on ? r.calc : ((r && +r.spent > 0) ? {paid: r.spent} : {}))}</div>`;
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
    row.calc = readCostFields('sc'); row.useCalc = true; row.est = lineCalc(row.calc).total; row.spent = lineCalc(row.calc).spent;
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
    <div class="field" id="sc-spent-field" style="display:${on?'none':'block'}"><label>Spent ($)</label><input type="text" inputmode="decimal" id="esr-spent" value="${(+(r.spent||0)).toFixed(2)}"></div>
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
  const manualSpent = parseMoney(document.getElementById('esr-spent')?.value);
  r.notes = document.getElementById('esr-notes')?.value?.trim() || '';
  r.url   = document.getElementById('esr-url')?.value?.trim()   || '';
  if (document.getElementById('sc-use')?.checked) {
    r.calc = readCostFields('sc'); r.useCalc = true;
    const cc = lineCalc(r.calc); r.est = cc.total; r.spent = cc.spent;
  } else {
    r.useCalc = false;
    r.est = parseMoney(document.getElementById('esr-est')?.value);
    r.spent = manualSpent;
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

  const rowsHtml = sortedIdx(rows,key,r=>(+r.price||0)*(+r.qty||0)).map(i => { const r = rows[i]; return `
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
    </div>`; }).join('');

  return `<div class="card" id="st-${key}">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
      <div style="display:flex;align-items:center;gap:2px;font-size:13px;font-weight:600">${chev('sec:'+key)}${title}</div>
      <div style="display:flex;align-items:center;gap:6px">
        <span style="font-size:11px;color:var(--text2)">${fmt(total)} · ${fmt(perTix)}/tix</span>
        <button class="icon-btn" onclick="openAddPQRow('${key}')" title="Add row"><i class="ti ti-plus" style="font-size:14px"></i></button>
      </div>
    </div>
    ${isCol('sec:'+key)?'':`<div style="margin-bottom:6px">${sortSelect(key)}</div>
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
    ${key==='totes'?`<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;font-size:12px"><span>Spent so far</span>${moneyIn('totes-spent', S.totesSpent||'', "S.totesSpent=parseMoney(this.value);saveState();renderFinances()", 'width:90px;font-size:12px')}</div>`:''}
    <div style="text-align:center;padding:14px 0 4px">
      <button class="btn" style="font-size:11px" onclick="(document.scrollingElement||document.documentElement).scrollTop=0">
        <i class="ti ti-arrow-up"></i> Return to top
      </button>
    </div>`}
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
    if (field === 'spent' && S[key][i].calc) { S[key][i].calc.paid = val; delete S[key][i].calc.bought; }
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

// ── Prize Manager spending → Finances ───────────────────────────────────────
// Every prize's "Amount paid" is added up: Raffle prizes go to the Raffle line,
// everything else (BINGO, Medium, Small, SWAG Bag, uncategorized…) goes to Prizes.
var _prizeData = null, _prizeSig = null, _prizeFetchAt = 0, _prizeBusy = false;

function isRafflePrize(p) { return String(p.cat||'').trim().toLowerCase() === 'raffle'; }
function isSwagPrize(p)   { return /swag/i.test(String(p.cat||'')); }
function prizeSwagTotal() { return _prizeData ? r2(_prizeData.filter(isSwagPrize).reduce((t,x) => t + x.paid, 0)) : 0; }

function applyPrizeSpend() {
  if (!_prizeData) return;
  const raffle = r2(_prizeData.filter(isRafflePrize).reduce((t,x) => t + x.paid, 0));
  const other  = r2(_prizeData.filter(x => !isRafflePrize(x) && !isSwagPrize(x)).reduce((t,x) => t + x.paid, 0));
  (S.expenses||[]).forEach(e => {
    if (e.id === 'raffle') e.spent = raffle;
    if (e.id === 'prizes_budget') e.spent = other;
  });
}

function refreshPrizeSpend(force) {
  if (!window.FIREBASE_DB_URL || _prizeBusy) return;
  if (!force && Date.now() - _prizeFetchAt < 60000) return;
  _prizeBusy = true; _prizeFetchAt = Date.now();
  fetch(window.FIREBASE_DB_URL + '/prizes.json', {cache:'no-store'})
    .then(r => r.ok ? r.json() : Promise.reject(new Error('read failed')))
    .then(raw => {
      const arr = Array.isArray(raw) ? raw : Object.values(raw || {});
      const list = arr.filter(p => p && typeof p === 'object' && p.id !== undefined && !p.bundledInto)   // bundled originals are already counted inside their bundle
        .map(p => ({name: p.name || '(unnamed prize)', cat: p.cat || 'Uncategorized', paid: +p.paid || 0}));
      const sig = JSON.stringify(list.map(x => [x.name, x.cat, x.paid]));
      const changed = sig !== _prizeSig;
      _prizeSig = sig; _prizeData = list;
      if (changed) {
        applyPrizeSpend(); saveState();
        if (document.getElementById('tab-finances')?.style.display !== 'none') renderFinances();
      }
    })
    .catch(() => {})
    .finally(() => { _prizeBusy = false; });
}

// ── Collapse + sort helpers ─────────────────────────────────────────────────
function isCol(id) { return !!(S.collapsed && S.collapsed[id]); }
function toggleCol(id) {
  if (!S.collapsed) S.collapsed = {};
  S.collapsed[id] = !S.collapsed[id];
  saveState(); renderFinances();
}
function setAllCol(ids, val) {
  if (!S.collapsed) S.collapsed = {};
  ids.forEach(id => { S.collapsed[id] = !!val; });
  saveState(); renderFinances();
}
function chev(id) {
  return `<button class="icon-btn" onclick="toggleCol('${id}')" title="${isCol(id)?'Expand':'Collapse'}" style="flex:none"><i class="ti ti-chevron-${isCol(id)?'right':'down'}" style="font-size:15px"></i></button>`;
}
function sortMode(k) { return (S.sortModes && S.sortModes[k]) || 'entered'; }
function setSort(k, v) {
  if (!S.sortModes) S.sortModes = {};
  S.sortModes[k] = v;
  saveState(); renderFinances();
}
// Returns the real row indexes in display order (rows keep their real index for editing).
function sortedIdx(rows, k, valFn) {
  const idx = rows.map((r,i) => i);
  const m = sortMode(k);
  const nm = i => String(rows[i].label||'').toLowerCase();
  if (m === 'alpha') idx.sort((a,b) => nm(a).localeCompare(nm(b)) || a-b);
  else if (m === 'cost') idx.sort((a,b) => (valFn(rows[b]) - valFn(rows[a])) || a-b);
  return idx;
}
function sortSelect(k) {
  const m = sortMode(k);
  return `<select class="sort-sel" onchange="setSort('${k}',this.value)" title="Sort" style="font-size:16px;padding:2px 4px;max-width:128px">
    <option value="entered"${m==='entered'?' selected':''}>Order entered</option>
    <option value="alpha"${m==='alpha'?' selected':''}>A to Z</option>
    <option value="cost"${m==='cost'?' selected':''}>Highest cost</option>
  </select>`;
}
function itemCid(r) { if (!r.cid) r.cid = 'c' + (S.nextId++); return r.cid; }

// ── "Spent so far" list ──────────────────────────────────────────────────────
var _spentSort = 'high';

function spentEntries() {
  const out = [];
  const add = (label, cat, amt) => { amt = r2(amt); if (amt > 0) out.push({label: label||'(unnamed)', cat, amt}); };
  const labels = {hats:'Hats', tshirts:'T-shirts', ...(S.merchLabels||{})};
  (S.expenses||[]).forEach(e => {
    if ((e.id === 'prizes_budget' || e.id === 'raffle') && _prizeData) {
      _prizeData.filter(x => e.id === 'raffle' ? isRafflePrize(x) : (!isRafflePrize(x) && !isSwagPrize(x)))
        .forEach(x => add(x.name, e.id === 'raffle' ? 'Raffle prizes' : 'Prizes: ' + x.cat, x.paid));
      return;
    }
    if (e.type !== 'subtable') { add(e.label, 'Expenses', e.spent); return; }
    const k = e.subtable;
    if ((S.merchOptions||[]).includes(k)) {
      (S[k]||[]).forEach(r => add(r.label, 'Merch: ' + (labels[k]||k), lineCalc(r).spent));
    } else if (k === 'decorations') {
      (S.decorItems||[]).filter(it => it.status === 'buy').forEach(it =>
        add(it.name, 'Decor: ' + (it.cat||'Other'), lineCalc(it.calc).spent || +it.spent || 0));
    } else if (k === 'misc' || k === 'swag') {
      (S[k]||[]).forEach(r => add(r.label, k === 'misc' ? 'Misc' : 'Swag bag', r.spent));
      if (k === 'swag' && _prizeData) _prizeData.filter(isSwagPrize).forEach(x => add(x.name, 'Swag bag', x.paid));
    } else if (k === 'totes') {
      add('Tote bags', 'Tote bags', S.totesSpent);
    } else {
      add(e.label, 'Expenses', e.spent);
    }
  });
  // Safety net so the list always adds up to the number on the Finances screen.
  const diff = r2(calcTotals().totalSpent - out.reduce((t,x) => t + x.amt, 0));
  if (Math.abs(diff) >= 0.01) out.push({label:'Other', cat:'Other', amt: diff});
  return out;
}

function spentListHtml() {
  const list = spentEntries();
  const total = r2(list.reduce((t,x) => t + x.amt, 0));
  const nm = x => x.label.toLowerCase();
  let body = '';
  const row = x => `<div style="display:flex;justify-content:space-between;gap:8px;padding:6px 0;border-bottom:.5px solid var(--border)">
      <div style="min-width:0"><div style="font-size:13px">${escHtml(x.label)}</div>${_spentSort==='cat'?'':`<div style="font-size:10px;color:var(--text3)">${escHtml(x.cat)}</div>`}</div>
      <div style="font-size:13px;font-weight:600;flex:none">${fmt(x.amt)}</div></div>`;
  if (_spentSort === 'cat') {
    const groups = {};
    list.forEach(x => { (groups[x.cat] = groups[x.cat] || []).push(x); });
    body = Object.keys(groups).sort((a,b) => a.localeCompare(b)).map(c => {
      const g = groups[c].sort((a,b) => b.amt - a.amt);
      return `<div style="display:flex;justify-content:space-between;margin-top:10px;font-size:12px;font-weight:700;color:var(--purple-text)"><span>${escHtml(c)}</span><span>${fmt(r2(g.reduce((t,x)=>t+x.amt,0)))}</span></div>` + g.map(row).join('');
    }).join('');
  } else {
    if (_spentSort === 'high') list.sort((a,b) => b.amt - a.amt || nm(a).localeCompare(nm(b)));
    else if (_spentSort === 'low') list.sort((a,b) => a.amt - b.amt || nm(a).localeCompare(nm(b)));
    else list.sort((a,b) => nm(a).localeCompare(nm(b)));
    body = list.map(row).join('');
  }
  const sel = v => _spentSort === v ? ' selected' : '';
  return `<h3>Spent so far: ${fmt(total)}</h3>
    <div style="margin-bottom:6px"><select style="font-size:16px;padding:2px 4px" onchange="_spentSort=this.value;document.getElementById('spent-list').innerHTML=spentListHtml()">
      <option value="high"${sel('high')}>Highest first</option>
      <option value="low"${sel('low')}>Lowest first</option>
      <option value="alpha"${sel('alpha')}>A to Z</option>
      <option value="cat"${sel('cat')}>By category</option>
    </select></div>
    ${list.length ? body : '<div style="color:var(--text3);font-size:12px;padding:8px 0">Nothing spent yet.</div>'}`;
}

function openSpentList() {
  showModal(`<div id="spent-list">${spentListHtml()}</div>
    <div class="m-actions"><button class="btn" onclick="closeModal()">Close</button></div>`);
}

function scrollToId(id) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({behavior:'smooth', block:'start'});
}
