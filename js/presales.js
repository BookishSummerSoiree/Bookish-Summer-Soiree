// presales.js — presale payout checklist for Soirée HQ
/* Presale payout ledger — ONE source used by both Soirée HQ ("Presales" tab)
   and the Author Info admin screen. Both read and write the same Orders
   sheet through the Apps Script backend, so checking something off in one
   place shows up in the other (press Refresh, or reopen the screen). */
const PayoutLedger = (function(){
  const KEY_STORE = "bss:payoutKey";
  function getKey(){ try{ return localStorage.getItem(KEY_STORE) || sessionStorage.getItem(KEY_STORE) || ""; }catch(e){ try{ return sessionStorage.getItem(KEY_STORE) || ""; }catch(e2){ return ""; } } }
  function setKey(k){ try{ localStorage.setItem(KEY_STORE, k); }catch(e){ try{ sessionStorage.setItem(KEY_STORE, k); }catch(e2){} } }
  function clearKey(){ try{ localStorage.removeItem(KEY_STORE); }catch(e){} try{ sessionStorage.removeItem(KEY_STORE); }catch(e){} }
  const esc = s => String(s == null ? "" : s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  const money = n => "$" + (Number(n) || 0).toFixed(2);
  const today = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0"); };
  const prettyDate = ms => ms ? new Date(ms).toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"}) : "";

  function mount(root, opts){
    const T = Object.assign({ text:"#1a1a18", muted:"#6b6b67", border:"rgba(0,0,0,.15)", accent:"#534AB7", soft:"rgba(0,0,0,.04)", ok:"#1D9E75", warn:"#BA7517" }, opts.theme || {});
    const st = { groups:null, filter:"send", error:"", needKey:!getKey(), loading:false };

    async function call(action, extra){
      const res = await fetch(opts.apiUrl, { method:"POST", headers:{ "Content-Type":"text/plain;charset=utf-8" },
        body: JSON.stringify(Object.assign({ action:action, key:getKey() }, extra || {})) });
      return res.json();
    }
    async function load(){
      if(!getKey()){ st.needKey = true; paint(); return; }
      st.loading = true; st.error = ""; paint();
      try{
        const json = await call("getPayoutLedger");
        if(json && json.badKey){ clearKey(); st.needKey = true; st.error = json.error || "Wrong payout password."; }
        else if(json && json.success){ st.groups = json.groups || []; st.needKey = false; }
        else st.error = (json && json.error) || "Couldn't load payouts.";
      }catch(e){ st.error = "Couldn't reach the server. Check your connection and try again."; }
      st.loading = false; paint();
    }
    async function mark(g, sent, date){
      const prev = { paid:g.paid, paidDate:g.paidDate };
      g.paid = sent; g.paidDate = sent ? (date || today()) : ""; paint();
      try{
        const json = await call("setPayoutSent", { sessionId:g.sessionId, author:g.author, sent:sent, date:g.paidDate });
        if(!json || !json.success) throw new Error((json && json.error) || "save failed");
        g.paidDate = json.paidDate || g.paidDate;
      }catch(e){ g.paid = prev.paid; g.paidDate = prev.paidDate; alert("Couldn't save that. Please try again."); }
      paint();
    }

    const btn = (label, primary, onclick) => {
      const b = document.createElement("button");
      b.textContent = label; b.onclick = onclick;
      b.style.cssText = "font:inherit;font-size:13px;font-weight:600;border-radius:999px;padding:8px 16px;cursor:pointer;border:1.5px solid " + (primary ? T.accent : T.border) + ";background:" + (primary ? T.accent : "transparent") + ";color:" + (primary ? "#fff" : T.text) + ";";
      return b;
    };

    function paint(){
      root.innerHTML = "";
      const wrap = document.createElement("div");
      wrap.style.cssText = "color:" + T.text + ";";
      root.appendChild(wrap);

      if(st.needKey){
        wrap.innerHTML = '<div style="font-size:14px;margin-bottom:10px;">Enter your payout password to see presale payouts.</div>'
          + (st.error ? '<div style="color:#b00020;font-size:13px;margin-bottom:8px;">' + esc(st.error) + '</div>' : "");
        const inp = document.createElement("input");
        inp.type = "password"; inp.placeholder = "Payout password";
        inp.style.cssText = "font:inherit;font-size:16px;padding:10px;border:1.5px solid " + T.border + ";border-radius:8px;width:100%;box-sizing:border-box;margin-bottom:10px;background:transparent;color:" + T.text + ";";
        wrap.appendChild(inp);
        const go = () => { const v = inp.value.trim(); if(!v) return; setKey(v); st.error = ""; load(); };
        inp.onkeydown = e => { if(e.key === "Enter") go(); };
        wrap.appendChild(btn("Unlock", true, go));
        return;
      }

      const top = document.createElement("div");
      top.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px;";
      top.appendChild(btn(st.loading ? "Refreshing…" : "Refresh", false, load));
      wrap.appendChild(top);

      if(st.error){ const e = document.createElement("div"); e.style.cssText = "color:#b00020;font-size:13px;margin-bottom:10px;"; e.textContent = st.error; wrap.appendChild(e); }
      if(st.groups === null){ if(!st.loading){ const d = document.createElement("div"); d.textContent = "Loading…"; wrap.appendChild(d); } return; }

      const send = st.groups.filter(g => g.method === "manual" && !g.paid);
      const sentList = st.groups.filter(g => (g.method === "manual" || g.method === "issue") && g.paid);
      const stripe = st.groups.filter(g => g.method === "stripe");
      const issues = st.groups.filter(g => g.method === "issue" && !g.paid);
      const tabs = [["send","To send (" + send.length + ")"],["sent","Sent (" + sentList.length + ")"],["stripe","Paid via Stripe (" + stripe.length + ")"]];
      if(issues.length) tabs.push(["issue","Needs attention (" + issues.length + ")"]);
      const tabRow = document.createElement("div");
      tabRow.style.cssText = "display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px;";
      tabs.forEach(([id,label]) => tabRow.appendChild(btn(label, st.filter === id, () => { st.filter = id; paint(); })));
      wrap.appendChild(tabRow);

      let list = st.filter === "sent" ? sentList : st.filter === "stripe" ? stripe : st.filter === "issue" ? issues : send;

      if(st.filter === "send" && send.length){
        const by = {};
        send.forEach(g => { const a = by[g.author] || (by[g.author] = { n:0, total:0, venmo:g.venmo, pref:g.authorPref }); a.n++; a.total += g.net; });
        const box = document.createElement("div");
        box.style.cssText = "background:" + T.soft + ";border-radius:10px;padding:10px 12px;margin-bottom:12px;font-size:13px;";
        box.innerHTML = '<div style="font-weight:700;margin-bottom:4px;">You owe, by author</div>'
          + Object.keys(by).sort().map(a => '<div>' + esc(a) + ' — <b>' + money(by[a].total) + '</b> (' + by[a].n + ' order' + (by[a].n===1?"":"s") + ')'
            + (by[a].venmo ? ' · Venmo ' + esc(by[a].venmo) : ' · <span style="color:' + T.warn + ';">no Venmo name on file</span>') + '</div>').join("");
        wrap.appendChild(box);
      }
      if(st.filter === "stripe"){
        const n = document.createElement("div");
        n.style.cssText = "font-size:12.5px;color:" + T.muted + ";margin-bottom:10px;";
        n.textContent = "These were sent to the author's Stripe account automatically. Nothing to do.";
        wrap.appendChild(n);
      }
      if(!list.length){
        const e = document.createElement("div");
        e.style.cssText = "color:" + T.muted + ";font-size:14px;padding:14px 0;";
        e.textContent = st.filter === "send" ? "Nothing waiting on you right now." : "Nothing here yet.";
        wrap.appendChild(e); return;
      }

      list.forEach(g => {
        const c = document.createElement("div");
        c.style.cssText = "border:1px solid " + T.border + ";border-radius:12px;padding:12px 14px;margin-bottom:10px;";
        // A series bought as a set shows as ONE line (with its books underneath).
        const sets = {}, parts = [];
        g.books.forEach(b => {
          const tag = (b.signed ? " · signed" : "") + (b.personalizedName ? " · personalized to " + esc(b.personalizedName) : "");
          if(b.seriesSetId){
            if(!sets[b.seriesSetId]){ sets[b.seriesSetId] = { name: b.seriesName || "Series", titles: [], price: 0, tag: tag }; parts.push({ set: sets[b.seriesSetId] }); }
            sets[b.seriesSetId].titles.push(b.title); sets[b.seriesSetId].price += b.price;
          } else {
            parts.push({ line: esc(b.title) + tag + " — " + money(b.price) });
          }
        });
        const books = parts.map(p => p.set
          ? "<b>" + esc(p.set.name) + " — Series</b>" + p.set.tag + " — " + money(p.set.price) + '<div style="font-size:12px;color:' + T.muted + ';">Includes: ' + p.set.titles.map(esc).join(", ") + "</div>"
          : p.line).join("<br>");
        c.innerHTML =
          '<div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;"><b>' + esc(g.author) + '</b><span style="color:' + T.muted + ';font-size:12.5px;">' + esc(prettyDate(g.createdAt)) + '</span></div>'
          + '<div style="font-size:12.5px;color:' + T.muted + ';margin:2px 0 8px;">Ordered by ' + esc(g.buyerName || "a reader") + '</div>'
          + '<div style="font-size:13.5px;line-height:1.5;margin-bottom:8px;">' + books + '</div>'
          + '<table style="font-size:13px;border-collapse:collapse;"><tbody>'
          + '<tr><td style="padding:1px 14px 1px 0;">Subtotal</td><td style="text-align:right;">' + money(g.subtotal) + '</td></tr>'
          + '<tr><td style="padding:1px 14px 1px 0;">Tax collected</td><td style="text-align:right;">' + money(g.tax) + '</td></tr>'
          + '<tr><td style="padding:1px 14px 1px 0;">Stripe fee (their share)</td><td style="text-align:right;">-' + money(g.feeShare) + '</td></tr>'
          + '<tr><td style="padding:1px 14px 1px 0;"><b>' + (g.method === "stripe" ? "Sent to Stripe" : "Send to author") + '</b></td><td style="text-align:right;"><b>' + money(g.net) + '</b></td></tr>'
          + '</tbody></table>';
        if(g.method === "manual" || g.method === "issue"){
          const info = document.createElement("div");
          info.style.cssText = "font-size:13px;margin-top:8px;";
          info.innerHTML = g.venmo ? 'Venmo: <b>' + esc(g.venmo) + '</b>' : '<span style="color:' + T.warn + ';">No Venmo name on file for this author yet.</span>';
          if(g.method === "issue") info.innerHTML += '<div style="color:#b00020;margin-top:4px;">Stripe transfer problem: ' + esc(g.transferStatus) + '. You can pay this one by Venmo and check it off.</div>';
          c.appendChild(info);
          const row = document.createElement("label");
          row.style.cssText = "display:flex;align-items:center;gap:10px;margin-top:10px;cursor:pointer;flex-wrap:wrap;";
          const cb = document.createElement("input");
          cb.type = "checkbox"; cb.checked = !!g.paid; cb.style.cssText = "width:22px;height:22px;accent-color:" + T.accent + ";";
          cb.onchange = () => mark(g, cb.checked, g.paidDate || today());
          row.appendChild(cb);
          row.appendChild(document.createTextNode("Payment sent"));
          if(g.paid){
            const d = document.createElement("input");
            d.type = "date"; d.value = g.paidDate || today();
            d.style.cssText = "font:inherit;font-size:14px;padding:4px 8px;border:1px solid " + T.border + ";border-radius:8px;background:transparent;color:" + T.text + ";";
            d.onclick = e => e.stopPropagation();
            d.onchange = () => mark(g, true, d.value);
            row.appendChild(d);
          }
          c.appendChild(row);
        }
        wrap.appendChild(c);
      });
    }

    paint();
    if(getKey()) load();
    return { reload: load };
  }
  return { mount: mount };
})();


/* ---------- HQ "Presales" TAB ---------- */
// Same Apps Script backend (and same Orders sheet) as the Author Info app,
// so what you check off here shows up in Author Info's admin screen too.
window.PRESALES_API_URL = window.PRESALES_API_URL ||
  "https://script.google.com/macros/s/AKfycbx243aXYN1O8ABOO729RyMlgKV68OzKqVtKUqPetqVPwSKQ_5wCjI71_vyEG6y_K66i/exec";

let _presalesMounted = null;
function renderPresales() {
  const el = document.getElementById('presales-content');
  if (!el) return;
  if (_presalesMounted) { _presalesMounted.reload(); return; }
  el.innerHTML = `
    <div class="card">
      <div class="card-title">Presale payouts</div>
      <div style="font-size:12px;color:var(--text2);margin-bottom:10px">
        Every presale order, who still needs to be paid, and what to send. This is the same list as the Presale Payouts screen in the Author Info admin tools.
      </div>
      <div id="presales-ledger"></div>
    </div>`;
  _presalesMounted = PayoutLedger.mount(document.getElementById('presales-ledger'), {
    apiUrl: window.PRESALES_API_URL,
    theme: { text:'var(--text)', muted:'var(--text2)', border:'var(--border2)', accent:'var(--purple)', soft:'var(--bg2)', ok:'var(--green)', warn:'var(--amber)' }
  });
}
