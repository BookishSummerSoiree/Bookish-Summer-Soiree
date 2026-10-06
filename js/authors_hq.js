// authors_hq.js — clean rewrite

// Stored yes/no flags on each author. The author card shows five things:
// To-Do list (from the Author Info app), Ticket purchased, Multi-author story,
// Books sent and SWAG sent.
const AUTHOR_CHECKS = [
  {key:'ticket',       label:'Ticket purchased'},
  {key:'multiAuthor',  label:'Multi-author story'},
  {key:'booksDonated', label:'Books sent'},
  {key:'swagSent',     label:'SWAG sent'},
];

// Progress reported by the Author Info app, keyed by the author's name slug.
let _progress = {};
function authorSlug(name) { return String(name||'').toLowerCase().replace(/[^a-z0-9]+/g,'-'); }
function authorProgress(a) { return _progress[authorSlug(a.name)] || null; }

// What counts toward the "3/5" on the collapsed card.
function authorTally(a) {
  const p = authorProgress(a);
  const items = [
    !!(p && p.total > 0 && p.done >= p.total),   // to-do list finished
    !!a.ticket,
    !!a.multiAuthor,
  ];
  if (!(p && p.prizes === 'no')) items.push(!!a.booksDonated);
  if (!(p && p.swag   === 'no')) items.push(!!a.swagSent);
  return {done: items.filter(Boolean).length, total: items.length};
}

const QNA_GOAL    = 6;
const TOTAL_GOAL  = 18;
const SIGNING_GOAL = TOTAL_GOAL - QNA_GOAL;

// Sort by last name
function byLastName(arr) {
  return [...arr].sort((a,b) => {
    const la = (a.name||'').split(' ').pop();
    const lb = (b.name||'').split(' ').pop();
    return la.localeCompare(lb);
  });
}

function renderAuthors() {
  const el = document.getElementById('authors-content');
  if (!el) return;

  const all  = S.authors  || [];
  const wish = S.wishlist || [];

  const qnaConfirmed = byLastName(all.filter(a => (a.role==='Q&A'||a.role==='Both') && a.status==='Confirmed'));
  const qnaAsked     = byLastName(all.filter(a => (a.role==='Q&A'||a.role==='Both') && a.status==='Asked'));
  const sigConf      = byLastName(all.filter(a => a.role==='Book Signing' && a.status==='Confirmed'));
  const sigAsked     = byLastName(all.filter(a => a.role==='Book Signing' && a.status==='Asked'));
  const wishSorted   = byLastName(wish);

  const qnaNeeded = Math.max(0, QNA_GOAL - qnaConfirmed.length);
  const sigNeeded = Math.max(0, SIGNING_GOAL - sigConf.length);

  // If completely empty, show restore option
  if (all.length === 0 && wish.length === 0) {
    el.innerHTML = `<div style="text-align:center;padding:2rem;color:var(--text2)">
      <div style="font-size:13px;margin-bottom:12px">No authors yet.</div>
      <button class="btn primary" onclick="resetAuthors()"><i class="ti ti-refresh"></i> Restore defaults</button>
      <div style="margin-top:8px"><button class="btn" onclick="openAddAuthorModal()"><i class="ti ti-user-plus"></i> Add author</button></div>
    </div>`;
    if (window.FIREBASE_DB_URL) restoreAuthorsFromFirebase();
    return;
  }

  let html = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:8px">
      <div>
        <div style="font-size:13px;font-weight:600">
          ${all.filter(a=>a.status==='Confirmed').length} confirmed &nbsp;·&nbsp;
          ${Math.max(0,TOTAL_GOAL-all.filter(a=>a.status==='Confirmed').length)} still needed &nbsp;·&nbsp;
          ${all.filter(a=>a.status==='Asked').length} asked
        </div>
        <div style="font-size:11px;color:var(--text2);margin-top:2px">
          <strong>Q&amp;A:</strong> ${qnaConfirmed.length} confirmed, ${qnaNeeded} needed, ${qnaAsked.length} asked &nbsp;·&nbsp;
          <strong>Book Signing:</strong> ${sigConf.length} confirmed, ${sigNeeded} needed, ${sigAsked.length} asked
        </div>
      </div>
      <button class="btn primary" onclick="openAddAuthorModal()"><i class="ti ti-user-plus"></i> Add author</button>
    </div>`;

  html += storyCard();

  // Q&A section
  if (qnaConfirmed.length || qnaAsked.length) {
    html += `<div style="font-size:11px;font-weight:600;color:var(--purple);margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em">Q&amp;A Panel</div>`;
    html += qnaConfirmed.map(a => authorCard(a)).join('');
    if (qnaAsked.length) {
      html += `<div style="font-size:11px;color:var(--amber);margin:6px 0 4px;font-weight:500">Asked / Pending</div>`;
      html += qnaAsked.map(a => authorCard(a)).join('');
    }
  }

  // Book Signing section
  if (sigConf.length || sigAsked.length) {
    html += `<div style="font-size:11px;font-weight:600;color:var(--text2);margin:10px 0 6px;text-transform:uppercase;letter-spacing:.05em">Book Signing</div>`;
    html += sigConf.map(a => authorCard(a)).join('');
    if (sigAsked.length) {
      html += `<div style="font-size:11px;color:var(--amber);margin:6px 0 4px;font-weight:500">Asked / Pending</div>`;
      html += sigAsked.map(a => authorCard(a)).join('');
    }
  }

  // Wishlist
  if (wishSorted.length) {
    html += `<div class="card" style="margin-top:10px">
      <div class="card-title">Wishlist (${wishSorted.length})</div>
      ${wishSorted.map((w) => {
        const realIdx = wish.findIndex(x => x.name === w.name);
        return wishCard(w, realIdx);
      }).join('')}
    </div>`;
  }

  el.innerHTML = html;
  syncStoryFromFirebase();
}

function authorCard(a) {
  const idx = (S.authors||[]).findIndex(x => x.id===a.id);
  const tally = authorTally(a);
  const ini  = (a.name||'?').split(' ').map(x=>x[0]).join('').slice(0,2).toUpperCase();
  const isQA = a.role==='Q&A' || a.role==='Both';

  return `<div style="border:.5px solid var(--border);border-radius:var(--radius-sm);margin-bottom:6px;overflow:hidden">
    <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;cursor:pointer;background:var(--bg)"
      onclick="toggleAuthorExpand('${a.id}')">
      <div class="avatar">${escHtml(ini)}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:600">${escHtml(a.name)}</div>
        <div style="font-size:11px;color:var(--text2)">${escHtml(a.role)} · ${escHtml(a.status)}</div>
      </div>
      <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
        <span style="font-size:11px;color:${tally.done===tally.total?'var(--green)':'var(--text2)'}">${tally.done}/${tally.total}</span>
        <i class="ti ti-chevron-${a._expanded?'up':'down'}" style="font-size:12px;color:var(--text3)"></i>
      </div>
    </div>
    ${a._expanded ? authorDetail(a, idx) : ''}
  </div>`;
}

function authorDetail(a, idx) {
  const isQA = a.role==='Q&A'||a.role==='Both';
  const p = authorProgress(a);
  const noPrizes = !!(p && p.prizes === 'no');
  const noSwag   = !!(p && p.swag   === 'no');
  const todoDone = !!(p && p.total > 0 && p.done >= p.total);
  const row = 'display:flex;align-items:center;gap:6px;font-size:12px;min-height:22px';
  const box = (key, label, opts={}) => `<label style="${row};cursor:${opts.off?'default':'pointer'};${opts.off?'color:var(--text3)':''}">
      <input type="checkbox" ${a[key]&&!opts.off?'checked':''} ${opts.off?'disabled':''} style="accent-color:var(--purple)"
        onchange="toggleAuthorCheck('${a.id}','${key}',this.checked)">
      <span>${escHtml(label)}${opts.note?` <span style="font-size:10px;color:var(--text3)">${escHtml(opts.note)}</span>`:''}</span>
    </label>`;
  return `<div style="padding:10px 12px;border-top:.5px solid var(--border);background:var(--bg2)">
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 12px;margin-bottom:10px">
      <div>
        <div style="${row}">
          <i class="ti ti-${todoDone?'circle-check':'list-check'}" style="font-size:14px;color:${todoDone?'var(--green)':'var(--text3)'}"></i>
          <span>To-Do list: <strong style="color:${todoDone?'var(--green)':'var(--text)'}">${p ? p.done+'/'+p.total : '—'}</strong>${p ? '' : ' <span style="font-size:10px;color:var(--text3)">not started</span>'}</span>
        </div>
        ${box('ticket','Ticket purchased')}
        ${box('multiAuthor','Multi-author story',{note:'auto'})}
      </div>
      <div>
        <div style="${row};font-weight:600;color:var(--text2)">Donations</div>
        ${box('booksDonated','Books sent', noPrizes ? {off:true,note:'not donating'} : {})}
        ${box('swagSent','SWAG sent', noSwag ? {off:true,note:'not sending'} : {})}
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">
      <div>
        <div style="font-size:10px;color:var(--text3);margin-bottom:2px">Status</div>
        <select style="width:100%;font-size:12px;padding:4px 6px" onchange="setAuthorField('${a.id}','status',this.value)">
          ${['Confirmed','Asked','Maybe','Declined'].map(s=>`<option${a.status===s?' selected':''}>${s}</option>`).join('')}
        </select>
      </div>
      <div>
        <div style="font-size:10px;color:var(--text3);margin-bottom:2px">Role</div>
        <select style="width:100%;font-size:12px;padding:4px 6px" onchange="setAuthorField('${a.id}','role',this.value)">
          ${['Book Signing','Q&A'].map(r=>`<option${(isQA?'Q&A':'Book Signing')===r?' selected':''}>${r}</option>`).join('')}
        </select>
      </div>
    </div>
    <textarea style="width:100%;font-size:12px;padding:4px 7px;border:.5px solid var(--border2);border-radius:var(--radius-sm);min-height:40px;background:var(--bg);color:var(--text);font-family:inherit"
      placeholder="Notes…" onblur="setAuthorField('${a.id}','notes',this.value)">${escHtml(a.notes||'')}</textarea>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;flex-wrap:wrap;gap:6px">
      <div style="display:flex;gap:5px;flex-wrap:wrap">
        <button class="btn" style="font-size:11px" onclick="moveAuthorRole('${a.id}','${isQA?'Book Signing':'Q&A'}')">
          → ${isQA?'Book Signing':'Q&A'}
        </button>
        <button class="btn" style="font-size:11px" onclick="moveAuthorToWishlist('${a.id}')">
          → Wishlist
        </button>
      </div>
      <button class="btn danger" style="font-size:11px" onclick="confirmDelete('Remove ${escHtml(a.name)} from authors?',()=>deleteAuthor('${a.id}'))">
        <i class="ti ti-trash"></i> Remove
      </button>
    </div>
  </div>`;
}

function wishCard(w, realIdx) {
  return `<div style="border:.5px solid var(--border);border-radius:var(--radius-sm);margin-bottom:4px;overflow:hidden">
    <div style="display:flex;align-items:center;gap:10px;padding:9px 12px;cursor:pointer;background:var(--bg)"
      onclick="toggleWishExpand(${realIdx})">
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:500">${escHtml(w.name)}</div>
        ${w.note?`<div style="font-size:11px;color:var(--text2)">${escHtml(w.note)}</div>`:''}
      </div>
      <i class="ti ti-chevron-${w._expanded?'up':'down'}" style="font-size:12px;color:var(--text3);flex-shrink:0"></i>
    </div>
    ${w._expanded ? wishDetail(w, realIdx) : ''}
  </div>`;
}

function wishDetail(w, idx) {
  return `<div style="padding:10px 12px;border-top:.5px solid var(--border);background:var(--bg2)">
    <div style="font-size:12px;font-weight:500;margin-bottom:8px">Add to 2027 as:</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:10px">
      <button class="btn primary" onclick="addWishlistToYear(${idx},'Q&A','Confirmed')">Q&A (Confirmed)</button>
      <button class="btn primary" onclick="addWishlistToYear(${idx},'Q&A','Asked')">Q&A (Asked)</button>
      <button class="btn primary" onclick="addWishlistToYear(${idx},'Book Signing','Confirmed')">Book Signing (Confirmed)</button>
      <button class="btn primary" onclick="addWishlistToYear(${idx},'Book Signing','Asked')">Book Signing (Asked)</button>
    </div>
    <div style="margin-bottom:6px">
      <div style="font-size:10px;color:var(--text3);margin-bottom:2px">Note</div>
      <input type="text" value="${escHtml(w.note||'')}" style="width:100%;font-size:12px;padding:4px 6px"
        onblur="setWishNote(${idx},this.value)" placeholder="Notes…">
    </div>
    <button class="btn danger" style="font-size:11px;width:100%" onclick="confirmDelete('Remove ${escHtml(w.name)} from wishlist?',()=>deleteWishlist(${idx}))">
      <i class="ti ti-trash"></i> Remove from wishlist
    </button>
  </div>`;
}

// ── Author mutations ──────────────────────────────────────────────────────────

function toggleAuthorExpand(id) {
  const a = (S.authors||[]).find(x => x.id===id);
  if (a) { a._expanded = !a._expanded; saveState(); renderAuthors(); }
}

function toggleWishExpand(idx) {
  const w = (S.wishlist||[])[idx];
  if (w) { w._expanded = !w._expanded; saveState(); renderAuthors(); }
}

function setAuthorField(id, field, val) {
  const a = (S.authors||[]).find(x => x.id===id);
  if (a) { a[field] = val; saveState(); renderAuthors(); saveAuthorToFirebase(id); }
}

function setWishNote(idx, val) {
  if (S.wishlist && S.wishlist[idx]) { S.wishlist[idx].note = val; saveState(); }
}

async function toggleAuthorCheck(id, key, val) {
  const a = (S.authors||[]).find(x => x.id===id);
  if (!a) return;
  a[key] = val;
  saveState();
  saveAuthorToFirebase(id);
  if (val && key==='booksDonated') await createPrizeForAuthor(a, 'books');
  if (val && key==='swagSent')     await createPrizeForAuthor(a, 'swag');
  renderAuthors();
}

function saveAuthorToFirebase(id) {
  const a = (S.authors||[]).find(x => x.id===id);
  if (!a || !window.FIREBASE_DB_URL) return;
  fetch(window.FIREBASE_DB_URL + '/authors/' + a.id + '.json', {
    method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(a)
  }).catch(()=>{});
}

function moveAuthorRole(id, newRole) {
  const a = (S.authors||[]).find(x => x.id===id);
  if (!a) return;
  a.role = newRole;
  a._expanded = false;
  saveState(); saveAuthorToFirebase(id); renderAuthors();
}

function moveAuthorToWishlist(id) {
  const idx = (S.authors||[]).findIndex(x => x.id===id);
  if (idx<0) return;
  const a = S.authors[idx];
  S.wishlist = S.wishlist || [];
  S.wishlist.push({name:a.name, note:a.notes||'', _expanded:false});
  S.authors.splice(idx,1);
  saveState(); renderAuthors();
}

function deleteAuthor(id) {
  S.authors = (S.authors||[]).filter(a => a.id!==id);
  saveState(); renderAuthors();
}

function deleteWishlist(idx) {
  (S.wishlist||[]).splice(idx,1);
  saveState(); renderAuthors();
}

function addWishlistToYear(wishIdx, role, status) {
  const w = (S.wishlist||[])[wishIdx];
  if (!w) return;
  const a = {
    id: 'a'+S.nextId++, name:w.name, status, role,
    notes:w.note||'', website:'', _expanded:false,
  };
  AUTHOR_CHECKS.forEach(c => { a[c.key] = false; });
  if (!S.authors) S.authors = [];
  S.authors.push(a);
  S.wishlist.splice(wishIdx,1);
  saveState();
  saveAuthorToFirebase(a.id);
  renderAuthors();
}

function openAddAuthorModal() {
  showModal(`
    <h3>Add author</h3>
    <div class="field"><label>Name</label><input type="text" id="aa-name" placeholder="Full name"></div>
    <div class="field"><label>Role</label>
      <select id="aa-role">
        <option>Book Signing</option><option>Q&A</option>
      </select>
    </div>
    <div class="field"><label>Status</label>
      <select id="aa-status">
        <option>Confirmed</option><option>Asked</option><option>Maybe</option>
      </select>
    </div>
    <div class="field"><label>Notes (optional)</label><input type="text" id="aa-notes"></div>
    <div class="m-actions">
      <button class="btn" onclick="closeModal()">Cancel</button>
      <button class="btn primary" onclick="doAddAuthor()"><i class="ti ti-plus"></i> Add</button>
    </div>`);
  setTimeout(()=>document.getElementById('aa-name')?.focus(),50);
}

function doAddAuthor() {
  const name = document.getElementById('aa-name')?.value?.trim();
  if (!name) { alert('Please enter a name.'); return; }
  const a = {
    id: 'a'+S.nextId++, name,
    role:    document.getElementById('aa-role')?.value   || 'Book Signing',
    status:  document.getElementById('aa-status')?.value || 'Confirmed',
    website: document.getElementById('aa-web')?.value?.trim()   || '',
    notes:   document.getElementById('aa-notes')?.value?.trim() || '',
    _expanded: false,
  };
  AUTHOR_CHECKS.forEach(c => { a[c.key] = false; });
  if (!S.authors) S.authors = [];
  S.authors.push(a);
  saveState(); saveAuthorToFirebase(a.id); closeModal(); renderAuthors();
}

function restoreAuthorsFromFirebase() {
  if (!window.FIREBASE_DB_URL) return;
  fetch(window.FIREBASE_DB_URL + '/authors.json')
    .then(r => r.json())
    .then(data => {
      if (data && typeof data==='object') {
        const authors = Object.values(data).filter(a => a && a.name);
        if (authors.length > 0) {
          S.authors = authors;
          saveState();
          showToast('Restored ' + authors.length + ' authors');
          renderAuthors();
        }
      }
    }).catch(()=>{});
}

async function createPrizeForAuthor(author, type) {
  if (!window.FIREBASE_DB_URL) { showToast('Set Firebase URL in Settings first','error'); return; }
  const cat = type==='books' ? 'BINGO' : 'SWAG Bag';
  try {
    const res    = await fetch(window.FIREBASE_DB_URL + '/meta/nextId.json');
    const nextId = (await res.json()) || 1;
    const prize  = {
      id:nextId, cat, qty:1, paid:0, value:0,
      name:`${author.name} — ${type==='books'?'Book donation':'SWAG donation'}`,
      donor:author.name, donorType:'author',
      needTag:true, tagMade:false, tagPrinted:false, tagAttached:false,
      onTote:false, tagGenerated:false, notes:'Auto-created from HQ', _mod:Date.now()
    };
    await fetch(window.FIREBASE_DB_URL + '/prizes/' + nextId + '.json', {
      method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(prize)
    });
    await fetch(window.FIREBASE_DB_URL + '/meta/nextId.json', {
      method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(nextId+1)
    });
    showToast('Prize created for ' + author.name);
  } catch(e) { showToast('Could not create prize','error'); }
}

// ── Multi-author story ────────────────────────────────────────────────────────
// The author-facing story page lives in its own repo and saves to /story in the
// same Firebase database. HQ reads it here: anyone who has written a part gets
// "Multi-author story" checked off automatically.

window.STORY_APP_URL = localStorage.getItem('soiree_story_url') || 'https://bookishsummersoiree.github.io/Soiree-Story';

let _story = null;        // last /story snapshot from Firebase
let _storyFetchedAt = 0;
let _storyLoading = false;

function storyParts() {
  const p = _story && _story.parts;
  if (!p) return [];
  return (Array.isArray(p) ? p : Object.values(p)).filter(Boolean).sort((a,b) => a.seq - b.seq);
}

function storyIsClosed() { return !!(_story && _story.latest && _story.latest.closed); }

function joinStoryPart(p) {
  const body = p.body || '', tail = p.tail || '';
  return tail ? body + ' ' + tail : body;
}

function syncStoryFromFirebase(force) {
  if (!window.FIREBASE_DB_URL || _storyLoading) return;
  if (!force && Date.now() - _storyFetchedAt < 15000) return;
  _storyLoading = true;
  let dirty = false;
  const grab = path => fetch(window.FIREBASE_DB_URL + path, {cache:'no-store'}).then(r => r.json());
  Promise.all([grab('/story.json'), grab('/authorProgress.json').catch(() => null)])
    .then(([data, progress]) => {
      const before = JSON.stringify([_story, _progress]);
      _story = data || {};
      if (progress && typeof progress === 'object') _progress = progress;
      dirty = JSON.stringify([_story, _progress]) !== before;
      const doneIds = new Set(storyParts().map(p => p.authorId));
      let changed = false;
      (S.authors||[]).forEach(a => {
        if (doneIds.has(a.id) && !a.multiAuthor) { a.multiAuthor = true; changed = true; }
      });
      if (changed) saveState();
    })
    .catch(() => {})
    .finally(() => {
      _storyLoading = false;
      _storyFetchedAt = Date.now();
      // Only redraw when something changed, and never while you're typing a note.
      const el = document.activeElement;
      const typing = el && /^(TEXTAREA|INPUT|SELECT)$/.test(el.tagName) && el.closest('#authors-content');
      if (dirty && !typing) renderAuthors();
    });
}

function storyCard() {
  const parts   = storyParts();
  const closed  = storyIsClosed();
  const doneIds = new Set(parts.map(p => p.authorId));
  const pool    = byLastName((S.authors||[]).filter(a => a.status==='Confirmed'));
  const todo    = pool.filter(a => !doneIds.has(a.id));
  const total   = pool.filter(a => doneIds.has(a.id)).length + todo.length;
  const waiting = _story && _story.waiting && !doneIds.has(_story.waiting.id) ? _story.waiting : null;
  const lastPart = parts[parts.length-1];

  let status;
  if (_story === null)      status = 'Loading…';
  else if (closed)          status = 'Finished — ' + parts.length + ' parts';
  else if (!parts.length)   status = 'Not started';
  else                      status = parts.length + ' of ' + total + ' written';

  let body = '';
  if (_story !== null && !closed) {
    if (waiting) {
      const when = new Date(waiting.ts).toLocaleDateString('en-US',{month:'short',day:'numeric'});
      body += `<div style="font-size:12px;background:var(--amber-bg);color:var(--amber-text);border-radius:var(--radius-sm);padding:6px 9px;margin-bottom:8px">
        <i class="ti ti-hourglass"></i> Waiting on <strong>${escHtml(waiting.name)}</strong>${waiting.finale?' (final author)':''} — link copied ${escHtml(when)}</div>`;
    } else if (lastPart) {
      body += `<div style="font-size:12px;color:var(--text2);margin-bottom:8px"><i class="ti ti-check" style="color:var(--green)"></i> ${escHtml(lastPart.name)} finished. Ready for the next author.</div>`;
    }
    if (todo.length) {
      body += `<div style="font-size:10px;color:var(--text3);margin-bottom:2px">${parts.length ? 'Next author' : 'First author'}</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
          <select id="story-next" style="flex:1;min-width:150px;font-size:12px;padding:5px 6px">
            ${todo.map(a => `<option value="${a.id}"${waiting && waiting.id===a.id?' selected':''}>${escHtml(a.name)}</option>`).join('')}
          </select>
          <button class="btn primary" style="font-size:12px" onclick="copyStoryLink()"><i class="ti ti-link"></i> Copy their link</button>
        </div>
        ${parts.length ? `<label style="display:flex;align-items:center;gap:5px;font-size:12px;cursor:pointer;margin-top:7px">
          <input type="checkbox" id="story-finale" style="accent-color:var(--purple)"${todo.length===1?' checked':''}>
          This is the final author (they write the ending)
        </label>` : `<div style="font-size:11px;color:var(--text2);margin-top:6px">Whoever goes first automatically gets the “start the story” version.</div>`}`;
    } else {
      body += `<div style="font-size:12px;color:var(--text2)">Every confirmed author has written a part.</div>`;
    }
  }

  return `<div class="card" style="margin-bottom:10px">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap">
      <div style="font-size:13px;font-weight:600"><i class="ti ti-book-2"></i> Multi-author story
        <span style="font-weight:400;color:${closed?'var(--green)':'var(--text2)'}">· ${escHtml(status)}</span></div>
      <div style="display:flex;gap:5px">
        <button class="btn" style="font-size:11px" onclick="syncStoryFromFirebase(true)" title="Refresh"><i class="ti ti-refresh"></i></button>
        ${parts.length ? `<button class="btn" style="font-size:11px" onclick="openStoryModal()"><i class="ti ti-eye"></i> Read story</button>` : ''}
      </div>
    </div>
    ${body}
  </div>`;
}

function copyText(text, okMsg) {
  const done = () => showToast(okMsg);
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(() => prompt('Copy this:', text));
  } else {
    prompt('Copy this:', text);
  }
}

function copyStoryLink() {
  const id = document.getElementById('story-next')?.value;
  const a  = (S.authors||[]).find(x => x.id===id);
  if (!a) return;
  const finale = !!document.getElementById('story-finale')?.checked;
  const url = window.STORY_APP_URL.replace(/\/+$/,'') + '/?a=' + encodeURIComponent(a.id) + (finale ? '&finale=1' : '');
  copyText(url, 'Link for ' + a.name + ' copied');
  // Remember who it went to, so HQ can show who the story is waiting on.
  const waiting = {id:a.id, name:a.name, finale, ts:Date.now()};
  if (_story) _story.waiting = waiting;
  if (window.FIREBASE_DB_URL) fetch(window.FIREBASE_DB_URL + '/story/waiting.json', {
    method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(waiting)
  }).catch(()=>{});
  renderAuthors();
}

function openStoryModal() {
  const parts = storyParts();
  showModal(`
    <h3>Multi-author story ${storyIsClosed() ? '(finished)' : '(so far)'}</h3>
    <div style="font-size:11px;color:var(--text2);margin-bottom:10px">Names show here for you only. “Copy story” copies the text with no names.</div>
    <div style="max-height:55vh;overflow-y:auto;margin-bottom:12px">
      ${parts.map(p => `<div style="margin-bottom:12px">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:var(--text3);margin-bottom:2px">${p.seq}. ${escHtml(p.name)}</div>
        <div style="font-family:Georgia,serif;font-size:14px;line-height:1.55;white-space:pre-wrap">${escHtml(p.body)}${p.tail ? ` <span style="background:var(--amber-bg);color:var(--amber-text)">${escHtml(p.tail)}</span>` : ''}</div>
      </div>`).join('')}
    </div>
    <div style="font-size:11px;color:var(--text2);margin-bottom:10px">Highlighted = the 150 characters passed to the next author.</div>
    <div class="m-actions">
      <button class="btn danger" style="font-size:11px" onclick="clearStory()"><i class="ti ti-trash"></i> Start over</button>
      <button class="btn primary" onclick="copyText(storyParts().map(joinStoryPart).join('\\n\\n'),'Story copied')"><i class="ti ti-copy"></i> Copy story</button>
    </div>`);
}

function clearStory() {
  if (!confirm('Delete EVERY part of the multi-author story and uncheck it for all authors? This cannot be undone.')) return;
  fetch(window.FIREBASE_DB_URL + '/story.json', {method:'DELETE'})
    .then(r => { if (!r.ok) throw new Error(); })
    .then(() => {
      _story = {};
      (S.authors||[]).forEach(a => { a.multiAuthor = false; });
      saveState(); closeModal(); renderAuthors(); showToast('Story cleared');
    })
    .catch(() => showToast('Could not clear the story', 'error'));
}

// Keep the Authors tab fresh while it's open: story progress and each author's
// To-Do count are re-read every 20 seconds.
setInterval(() => {
  if (typeof _activeTab !== 'undefined' && _activeTab === 'authors-hq' && !document.hidden) syncStoryFromFirebase(true);
}, 20000);
