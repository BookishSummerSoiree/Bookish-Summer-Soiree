// app.js — Event HQ shell

let _activeTab = 'finances';

function renderShell() {
  document.getElementById('root').innerHTML = `
    <div class="shell">
      <div class="top-bar">
        <div>
          <div class="app-title">Bookish Summer Soirée 2027</div>
          <div class="app-sub">Event HQ — Nicole only</div>
        </div>
      </div>
      <div id="tab-finances"></div>
      <div id="tab-todo"        style="display:none"></div>
      <div id="tab-inventory"   style="display:none"></div>
      <div id="tab-authors-hq"  style="display:none"><div id="authors-content"></div></div>
      <div id="tab-prizes"      style="display:none"><div id="prizes-content"></div></div>
      <div id="tab-settings"    style="display:none"><div id="settings-content"></div></div>
      <div style="height:300px;flex-shrink:0" aria-hidden="true"></div>
    </div>
    <nav class="tab-bar">
      <button class="tab-btn active" onclick="showTab('finances')"><i class="ti ti-calculator"></i>Finances</button>
      <button class="tab-btn" onclick="showTab('todo')"><i class="ti ti-check"></i>To-do</button>
      <button class="tab-btn" onclick="showTab('inventory')"><i class="ti ti-package"></i>Inventory</button>
      <button class="tab-btn" onclick="showTab('authors-hq')"><i class="ti ti-users"></i>Authors</button>
      <button class="tab-btn" onclick="showTab('prizes')"><i class="ti ti-gift"></i>Prizes</button>
      <button class="tab-btn" onclick="showTab('settings')"><i class="ti ti-settings"></i>Settings</button>
    </nav>
    <div id="modal-container"></div>
    <div id="toast" class="toast"></div>`;
}

function showTab(t) {
  _activeTab = t;
  const tabs = ['finances','todo','inventory','authors-hq','prizes','settings'];
  tabs.forEach(x => {
    const el = document.getElementById('tab-'+x);
    if (el) el.style.display = x===t?'block':'none';
  });
  document.querySelectorAll('.tab-btn').forEach((b,i) => b.classList.toggle('active', tabs[i]===t));
  if (t==='finances')   renderFinances();
  if (t==='todo')       renderTodo();
  if (t==='inventory')  renderInventory();
  if (t==='authors-hq') {
    renderAuthors();
    if (window.FIREBASE_DB_URL && (!S.authors || S.authors.length===0)) restoreAuthorsFromFirebase();
  }
  if (t==='prizes')   renderPrizesTab();
  if (t==='settings') renderSettings();
}

function renderPrizesTab() {
  const el = document.getElementById('prizes-content');
  if (!el) return;
  const url = window.PRIZE_APP_URL || '';
  if (!url) {
    el.innerHTML = `<div class="card"><div class="card-title">Prize Manager</div>
      <div class="empty"><i class="ti ti-gift"></i>Prize Manager URL not set.<br>
      <button class="btn primary" onclick="showTab('settings')">Open Settings</button></div></div>`;
    return;
  }
  el.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:6px">
      <span style="font-size:12px;color:var(--text2)">Prize Manager</span>
      <div style="display:flex;gap:6px">
        <button class="btn" onclick="document.getElementById('prize-frame').src+=''"><i class="ti ti-refresh"></i> Refresh</button>
        <a href="${escHtml(url)}" target="_blank" class="btn"><i class="ti ti-external-link"></i> New tab</a>
      </div>
    </div>
    <iframe id="prize-frame" src="${escHtml(url)}"
      style="width:100%;height:calc(100vh - 180px);min-height:500px;border:.5px solid var(--border);border-radius:var(--radius-md);background:var(--bg)"
      title="Prize Manager"></iframe>`;
}

function renderSettings() {
  const el = document.getElementById('settings-content');
  if (!el) return;

  const groups = S.peopleGroups || {};
  const groupNames = Object.keys(groups);
  const contacts = S.peopleContacts || {};

  el.innerHTML = `
    <!-- PEOPLE -->
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <div class="card-title" style="margin-bottom:0">People</div>
        <button class="btn" style="font-size:11px;padding:3px 8px" onclick="openAddPeopleGroup()">
          <i class="ti ti-plus"></i> Add group
        </button>
      </div>
      ${groupNames.map(grp => {
        const members = groups[grp] || [];
        return `<div style="margin-bottom:14px">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--text2);font-weight:600">${escHtml(grp)}</div>
            <button class="icon-btn del-btn" onclick="confirmDelete('Delete group \\'${escHtml(grp)}\\'? Members will be removed.',()=>deletePeopleGroup('${escHtml(grp)}'))" title="Delete group">
              <i class="ti ti-trash" style="font-size:12px"></i>
            </button>
          </div>
          <div style="display:flex;flex-direction:column;gap:4px;margin-bottom:6px">
            ${members.map((p,i) => `<div style="display:flex;align-items:center;gap:6px;background:var(--bg);border:.5px solid var(--border);border-radius:var(--radius-sm);padding:6px 10px">
              <div style="flex:1;min-width:0">
                <div style="font-size:13px;font-weight:500">${escHtml(p)}</div>
                ${contacts[p]?.email||contacts[p]?.phone||contacts[p]?.instagram?
                  `<div style="font-size:10px;color:var(--text3)">${[contacts[p]?.email,contacts[p]?.phone,contacts[p]?.instagram].filter(Boolean).join(' · ')}</div>`:''}
              </div>
              <button class="icon-btn" onclick="openEditPerson('${escHtml(grp)}',${i})" title="Edit"><i class="ti ti-pencil" style="font-size:12px"></i></button>
              <button class="icon-btn del-btn" onclick="confirmDelete('Remove ${escHtml(p)} from ${escHtml(grp)}?',()=>removePersonFromGroup('${escHtml(grp)}',${i}))" title="Remove">
                <i class="ti ti-trash" style="font-size:12px"></i>
              </button>
            </div>`).join('')}
          </div>
          <button class="btn" style="font-size:11px;padding:3px 9px" onclick="openAddPersonToGroup('${escHtml(grp)}')">
            <i class="ti ti-plus"></i> Add to ${escHtml(grp)}
          </button>
        </div>`;
      }).join('')}
    </div>

    <!-- AUTHOR DATA -->
    <div class="card">
      <div class="card-title">Author data</div>
      <div style="display:flex;flex-direction:column;gap:10px">
        <div style="background:var(--bg2);border-radius:var(--radius-sm);padding:10px">
          <div style="font-size:12px;font-weight:600;margin-bottom:3px">Back up authors to Firebase</div>
          <div style="font-size:11px;color:var(--text2);margin-bottom:7px">Saves your current authors and wishlist to Firebase right now. Do this after making changes so they're safely backed up.</div>
          <button class="btn primary" onclick="backupAuthorsToFirebase()">
            <i class="ti ti-cloud-upload"></i> Back up now
          </button>
        </div>
        <div style="background:var(--bg2);border-radius:var(--radius-sm);padding:10px">
          <div style="font-size:12px;font-weight:600;margin-bottom:3px">Restore from Firebase</div>
          <div style="font-size:11px;color:var(--text2);margin-bottom:7px">Pulls your backed-up authors from Firebase. Safe to use — only restores if Firebase has data.</div>
          <button class="btn" onclick="restoreAuthorsFromFirebase()">
            <i class="ti ti-cloud-download"></i> Restore from backup
          </button>
        </div>
      </div>
    </div>

    <!-- BACKUP FILE -->
    <div class="card">
      <div class="card-title">Backup file</div>
      <div style="font-size:11px;color:var(--text2);margin-bottom:8px">A backup file holds everything in HQ: authors, wishlist, budget, to-dos, inventory and people.</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn primary" onclick="exportBackupFile()"><i class="ti ti-download"></i> Download backup file</button>
        <button class="btn" onclick="document.getElementById('s-import').click()"><i class="ti ti-upload"></i> Load a backup file</button>
        <input type="file" id="s-import" accept=".json,application/json" style="display:none" onchange="importBackupFile(this.files[0]);this.value=''">
      </div>
    </div>

    <!-- APP CONNECTIONS (at bottom) -->
    <div class="card">
      <div class="card-title">App connections</div>
      <div style="display:flex;flex-direction:column;gap:8px">
        <div>
          <label style="font-size:11px;color:var(--text2);display:block;margin-bottom:3px">Firebase Database URL</label>
          <input type="text" id="s-firebase" value="${escHtml(window.FIREBASE_DB_URL||'')}"
            placeholder="https://soiree-prizes-default-rtdb.firebaseio.com"
            style="width:100%;font-family:monospace;font-size:11px">
        </div>
        <div>
          <label style="font-size:11px;color:var(--text2);display:block;margin-bottom:3px">Prize Manager URL</label>
          <input type="text" id="s-prize-url" value="${escHtml(window.PRIZE_APP_URL||'')}"
            placeholder="https://authornjk.github.io/BSS-Prizes"
            style="width:100%;font-family:monospace;font-size:11px">
        </div>
      </div>
      <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
        <button class="btn primary" onclick="saveSettings()"><i class="ti ti-check"></i> Save</button>
        <button class="btn" onclick="syncHQToFirebase();showToast('Synced!')"><i class="ti ti-refresh"></i> Sync now</button>
      </div>
    </div>`;
}

function saveSettings() {
  window.FIREBASE_DB_URL = document.getElementById('s-firebase')?.value?.trim() || '';
  window.PRIZE_APP_URL   = document.getElementById('s-prize-url')?.value?.trim() || '';
  localStorage.setItem('soiree_firebase_url', window.FIREBASE_DB_URL);
  localStorage.setItem('soiree_prize_url',    window.PRIZE_APP_URL);
  showToast('Settings saved');
  syncHQToFirebase();
}

// ── People group management ───────────────────────────────────────────────────

function openAddPeopleGroup() {
  showModal(`
    <h3>Add group</h3>
    <div class="field"><label>Group name</label><input type="text" id="apg-name" placeholder="e.g. Social Media"></div>
    <div class="m-actions">
      <button class="btn" onclick="closeModal()">Cancel</button>
      <button class="btn primary" onclick="doAddPeopleGroup()"><i class="ti ti-plus"></i> Add</button>
    </div>`);
  setTimeout(()=>document.getElementById('apg-name')?.focus(),50);
}

function doAddPeopleGroup() {
  const name = document.getElementById('apg-name')?.value?.trim();
  if (!name) { alert('Please enter a name.'); return; }
  if (!S.peopleGroups) S.peopleGroups = {};
  if (S.peopleGroups[name]) { alert('Group already exists.'); return; }
  S.peopleGroups[name] = [];
  saveState(); closeModal(); renderSettings();
}

function deletePeopleGroup(grp) {
  if (S.peopleGroups) delete S.peopleGroups[grp];
  saveState(); renderSettings();
}

function openAddPersonToGroup(grp) {
  showModal(`
    <h3>Add to ${escHtml(grp)}</h3>
    <div class="field"><label>Name</label><input type="text" id="aptr-name" placeholder="Full name"></div>
    <div class="field"><label>Email (optional)</label><input type="text" id="aptr-email" placeholder="email@…"></div>
    <div class="field"><label>Phone (optional)</label><input type="text" id="aptr-phone" placeholder="555-…"></div>
    <div class="field"><label>Instagram (optional)</label><input type="text" id="aptr-ig" placeholder="@handle"></div>
    <div class="m-actions">
      <button class="btn" onclick="closeModal()">Cancel</button>
      <button class="btn primary" onclick="doAddPersonToGroup('${escHtml(grp)}')"><i class="ti ti-plus"></i> Add</button>
    </div>`);
  setTimeout(()=>document.getElementById('aptr-name')?.focus(),50);
}

function doAddPersonToGroup(grp) {
  const name = document.getElementById('aptr-name')?.value?.trim();
  if (!name) { alert('Please enter a name.'); return; }
  if (!S.peopleGroups[grp]) S.peopleGroups[grp] = [];
  S.peopleGroups[grp].push(name);
  // Save contact info
  const email = document.getElementById('aptr-email')?.value?.trim();
  const phone = document.getElementById('aptr-phone')?.value?.trim();
  const ig    = document.getElementById('aptr-ig')?.value?.trim();
  if (email||phone||ig) {
    if (!S.peopleContacts) S.peopleContacts = {};
    S.peopleContacts[name] = {email, phone, instagram:ig};
  }
  // Sync admin count
  S.attendance.admin = getAdminCount();
  saveState(); closeModal(); renderSettings();
}

function removePersonFromGroup(grp, idx) {
  if (S.peopleGroups?.[grp]) {
    S.peopleGroups[grp].splice(idx,1);
    S.attendance.admin = getAdminCount();
    saveState(); renderSettings();
  }
}

function openEditPerson(grp, idx) {
  const name = (S.peopleGroups?.[grp]||[])[idx];
  if (!name) return;
  const c = (S.peopleContacts||{})[name] || {};
  showModal(`
    <h3>Edit ${escHtml(name)}</h3>
    <div class="field"><label>Name</label><input type="text" id="ep-name" value="${escHtml(name)}"></div>
    <div class="field"><label>Email</label><input type="text" id="ep-email" value="${escHtml(c.email||'')}"></div>
    <div class="field"><label>Phone</label><input type="text" id="ep-phone" value="${escHtml(c.phone||'')}"></div>
    <div class="field"><label>Instagram</label><input type="text" id="ep-ig" value="${escHtml(c.instagram||'')}"></div>
    <div style="font-size:11px;color:var(--text2);margin-bottom:10px">
      Move to group:
      ${Object.keys(S.peopleGroups||{}).filter(g=>g!==grp).map(g=>
        `<button class="btn" style="font-size:11px;margin:2px" onclick="movePerson('${escHtml(grp)}',${idx},'${escHtml(g)}')">→ ${escHtml(g)}</button>`
      ).join('')}
      ${Object.keys(S.peopleGroups||{}).filter(g=>g!==grp).map(g=>
        `<button class="btn" style="font-size:11px;margin:2px" onclick="copyPerson('${escHtml(name)}','${escHtml(g)}')">+ Copy to ${escHtml(g)}</button>`
      ).join('')}
    </div>
    <div class="m-actions">
      <button class="btn" onclick="closeModal()">Cancel</button>
      <button class="btn primary" onclick="doEditPerson('${escHtml(grp)}',${idx})"><i class="ti ti-check"></i> Save</button>
    </div>`);
}

function doEditPerson(grp, idx) {
  const oldName = (S.peopleGroups?.[grp]||[])[idx];
  const newName = document.getElementById('ep-name')?.value?.trim() || oldName;
  if (S.peopleGroups?.[grp]) S.peopleGroups[grp][idx] = newName;
  if (!S.peopleContacts) S.peopleContacts = {};
  if (oldName !== newName && S.peopleContacts[oldName]) {
    S.peopleContacts[newName] = S.peopleContacts[oldName];
    delete S.peopleContacts[oldName];
  }
  S.peopleContacts[newName] = {
    email:     document.getElementById('ep-email')?.value?.trim()||'',
    phone:     document.getElementById('ep-phone')?.value?.trim()||'',
    instagram: document.getElementById('ep-ig')?.value?.trim()||'',
  };
  saveState(); closeModal(); renderSettings();
}

function movePerson(fromGrp, idx, toGrp) {
  const name = (S.peopleGroups?.[fromGrp]||[])[idx];
  if (!name) return;
  S.peopleGroups[fromGrp].splice(idx,1);
  if (!S.peopleGroups[toGrp]) S.peopleGroups[toGrp] = [];
  if (!S.peopleGroups[toGrp].includes(name)) S.peopleGroups[toGrp].push(name);
  S.attendance.admin = getAdminCount();
  saveState(); closeModal(); renderSettings();
}

function copyPerson(name, toGrp) {
  if (!S.peopleGroups[toGrp]) S.peopleGroups[toGrp] = [];
  if (!S.peopleGroups[toGrp].includes(name)) {
    S.peopleGroups[toGrp].push(name);
    saveState();
    showToast(`${name} copied to ${toGrp}`);
    closeModal(); renderSettings();
  } else {
    showToast(`${name} is already in ${toGrp}`,'error');
  }
}

// ── Author helpers ────────────────────────────────────────────────────────────

function resetAuthors() {
  S.authors  = JSON.parse(JSON.stringify(DEFAULT_DATA.authors));
  S.wishlist = JSON.parse(JSON.stringify(DEFAULT_DATA.wishlist));
  saveState();
  showToast('Authors and wishlist restored!');
  renderSettings();
  if (_activeTab === 'authors-hq') renderAuthors();
}

function backupAuthorsToFirebase() {
  if (!window.FIREBASE_DB_URL) { showToast('Set Firebase URL first', 'error'); return; }
  const authObj = {};
  (S.authors||[]).forEach(a => { authObj[a.id] = a; });
  Promise.all([
    fetch(window.FIREBASE_DB_URL + '/authors.json', {
      method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(authObj)
    }),
    fetch(window.FIREBASE_DB_URL + '/wishlist.json', {
      method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(S.wishlist||[])
    })
  ]).then(() => showToast('Backed up ' + (S.authors||[]).length + ' authors ✓'))
    .catch(() => showToast('Backup failed — check Firebase URL', 'error'));
}

// ── Boot ──────────────────────────────────────────────────────────────────────

function boot() {
  window.FIREBASE_DB_URL = localStorage.getItem('soiree_firebase_url') || 'https://soiree-prizes-default-rtdb.firebaseio.com';
  window.PRIZE_APP_URL   = localStorage.getItem('soiree_prize_url')    || 'https://authornjk.github.io/BSS-Prizes';
  loadState();
  renderShell();
  showTab('finances');
  // Compare with the cloud copy BEFORE anything is pushed (see storage.js).
  loadFromCloud();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) loadFromCloud(); });
}

boot();
