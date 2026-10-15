// todo.js — clean rewrite with search, sort, edit, notes, no disappearing names

var _todoSort   = 'default';
var _todoSearch = '';
var _todoPerson = '';
var _todoCat    = '';
var _editTodoId = null;
var _todoDebounce = null;

function debounceRenderTodo(val) {
  _todoSearch = val;
  clearTimeout(_todoDebounce);
  _todoDebounce = setTimeout(() => {
    renderTodoList();  // only re-render the list, not the whole tab
  }, 150);
}

function renderTodoList() {
  const listEl = document.getElementById('todo-list');
  if (!listEl) { renderTodo(); return; }
  const people = getAllPeople();
  let list = S.todos || [];
  if (_todoSearch.trim()) {
    const q = _todoSearch.toLowerCase();
    const primary   = list.filter(t => (t.task||'').toLowerCase().includes(q));
    const secondary = list.filter(t => !(t.task||'').toLowerCase().includes(q) && (t.notes||'').toLowerCase().includes(q));
    list = [...primary, ...secondary];
  }
  if (_todoPerson) list = list.filter(t => t.who === _todoPerson);
  if (_todoCat)    list = list.filter(t => t.cat === _todoCat);
  if (_todoSort === 'alpha')  list = [...list].sort((a,b) => (a.task||'').localeCompare(b.task||''));
  if (_todoSort === 'person') list = [...list].sort((a,b) => (a.who||'').localeCompare(b.who||''));
  listEl.innerHTML = list.map(t => todoRow(t)).join('') ||
    `<div style="color:var(--text3);font-size:13px;text-align:center;padding:2rem">No tasks found.</div>`;
}

function getTodoCategories() {
  return S.todoCategories || ['Authors','Decor','Donations','Hats','Inventory','Merch','Name Tags','Prizes','Print','Raffle','SWAG','Totes','Venue','Water Bottles'];
}

// Re-draw the list but stay exactly where you were scrolled to.
function renderTodoKeep() {
  const y = window.scrollY;
  renderTodo();
  [0, 30, 100, 250].forEach(ms => setTimeout(() => window.scrollTo(0, y), ms));
}

function renderTodo() {
  const el = document.getElementById('tab-todo');
  if (!el) return;

  const people = getAllPeople();
  let list = S.todos || [];

  // Apply filters for counting purposes
  const done  = (S.todos||[]).filter(t => t.done).length;
  const total = (S.todos||[]).length;

  el.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px">
      <div style="font-size:13px;color:var(--text2)">${done}/${total} done</div>
      <button class="btn primary" onclick="openAddTodo()"><i class="ti ti-plus"></i> Add task</button>
    </div>

    <!-- Search -->
    <div style="margin-bottom:8px">
      <input type="text" id="todo-search" value="${escHtml(_todoSearch)}" placeholder="Search tasks and notes…"
        style="width:100%;font-size:13px;padding:8px 12px"
        oninput="debounceRenderTodo(this.value)">
    </div>

    <!-- Filters row -->
    <div style="display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap;align-items:center">
      <span style="font-size:11px;color:var(--text2)">Person:</span>
      <select id="todo-person-sel" onchange="_todoPerson=this.value;renderTodo()" style="font-size:12px;padding:4px 8px">
        <option value="">Everyone</option>
        ${people.map(p=>`<option value="${escHtml(p)}"${_todoPerson===p?' selected':''}>${escHtml(p)}</option>`).join('')}
      </select>
      <span style="font-size:11px;color:var(--text2)">Category:</span>
      <select id="todo-cat-sel" onchange="_todoCat=this.value;renderTodo()" style="font-size:12px;padding:4px 8px">
        <option value="">All categories</option>
        ${getTodoCategories().map(c=>`<option value="${escHtml(c)}"${_todoCat===c?' selected':''}>${escHtml(c)}</option>`).join('')}
      </select>
      <button class="sort-btn" onclick="openManageTodoCategories()" style="font-size:10px;padding:2px 7px"><i class="ti ti-settings" style="font-size:11px"></i></button>
    </div>
    <!-- Sort -->
    <div style="display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap;align-items:center">
      <span style="font-size:11px;color:var(--text2)">Sort:</span>
      <button class="sort-btn${_todoSort==='default'?' active':''}" onclick="_todoSort='default';renderTodo()">Default</button>
      <button class="sort-btn${_todoSort==='alpha'?' active':''}"   onclick="_todoSort='alpha';renderTodo()">A–Z</button>
      <button class="sort-btn${_todoSort==='person'?' active':''}"  onclick="_todoSort='person';renderTodo()">By person</button>
    </div>

    <!-- Task list -->
    <div id="todo-list" style="display:flex;flex-direction:column;gap:4px">
    </div>`;
  // Render list separately to preserve search focus
  setTimeout(renderTodoList, 0);
}

function filterByPerson(who) {
  // Scroll to that person's section
  const els = document.querySelectorAll('[data-who]');
  for (const el of els) {
    if (el.dataset.who === who) { el.scrollIntoView({behavior:'smooth'}); break; }
  }
}

function todoRow(t) {
  return `<div class="todo-card" id="todo-${t.id}" data-who="${escHtml(t.who||'')}">
    <div style="display:flex;align-items:flex-start;gap:8px;padding:9px 12px">
      <input type="checkbox" ${t.done?'checked':''} style="width:16px;height:16px;accent-color:var(--purple);flex-shrink:0;margin-top:2px"
        onchange="toggleTodoDone(${t.id},this.checked)">
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;${t.done?'text-decoration:line-through;color:var(--text3)':''}">${escHtml(t.task||'')}</div>
        ${t.cat?`<span style="font-size:10px;background:var(--purple-bg);color:var(--purple-text);padding:1px 7px;border-radius:8px;margin-top:2px;display:inline-block">${escHtml(t.cat)}</span>`:''}
        ${t.notes?`<div style="font-size:11px;color:var(--text3);margin-top:2px">${escHtml(t.notes)}</div>`:''}
        <div style="margin-top:4px">
          <select class="who-select" onchange="setTodoWho(${t.id},this.value)" style="font-size:11px;padding:2px 6px;border-radius:10px;border:.5px solid var(--border2);background:var(--bg2);color:${t.who?'var(--purple-text)':'var(--text3)'}">
            <option value="">Unassigned</option>
            ${getAllPeople().map(p => `<option value="${escHtml(p)}"${t.who===p?' selected':''}>${escHtml(p)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div style="display:flex;gap:2px;flex-shrink:0">
        <button class="icon-btn" onclick="openEditTodo(${t.id})" title="Edit"><i class="ti ti-pencil" style="font-size:13px"></i></button>
        <button class="icon-btn del-btn" onclick="confirmDelete('Delete \\'${escHtml(t.task||'this task')}\\'?',()=>deleteTodo(${t.id}))" title="Delete">
          <i class="ti ti-trash" style="font-size:13px"></i>
        </button>
      </div>
    </div>
  </div>`;
}

function toggleTodoDone(id, val) {
  const t = (S.todos||[]).find(t => t.id===id);
  if (t) { t.done = val; saveState(); renderTodoKeep(); }
}

function setTodoWho(id, val) {
  const t = (S.todos||[]).find(t => t.id===id);
  if (t) { t.who = val; saveState(); }
  // Don't re-render — just save. Avoids focus loss.
}

function deleteTodo(id) {
  S.todos = (S.todos||[]).filter(t => t.id!==id);
  saveState(); renderTodoKeep();
}

function openAddTodo() {
  showModal(`
    <h3>Add task</h3>
    <div class="field"><label>Task</label><textarea id="at-task" rows="2" placeholder="What needs to be done?"></textarea></div>
    <div class="field"><label>Assigned to</label>
      <select id="at-who">
        <option value="">Unassigned</option>
        ${getAllPeople().map(p=>`<option>${escHtml(p)}</option>`).join('')}
      </select>
    </div>
    <div class="field"><label>Notes (optional)</label><input type="text" id="at-notes" placeholder="Any notes…"></div>
    <div class="m-actions">
      <button class="btn" onclick="closeModal()">Cancel</button>
      <button class="btn primary" onclick="doAddTodo()"><i class="ti ti-plus"></i> Add</button>
    </div>`);
  setTimeout(()=>document.getElementById('at-task')?.focus(),50);
}

function doAddTodo() {
  const task = document.getElementById('at-task')?.value?.trim();
  if (!task) { alert('Please enter a task.'); return; }
  S.todos.push({
    id:    S.nextId++,
    task,
    cat:   document.getElementById('at-cat')?.value  || '',
    who:   document.getElementById('at-who')?.value  || '',
    notes: document.getElementById('at-notes')?.value?.trim() || '',
    done:  false
  });
  saveState(); closeModal(); renderTodoKeep();
}

function openEditTodo(id) {
  const t = (S.todos||[]).find(t => t.id===id);
  if (!t) return;
  showModal(`
    <h3>Edit task</h3>
    <div class="field"><label>Task</label><textarea id="et-task" rows="2">${escHtml(t.task||'')}</textarea></div>
    <div class="field"><label>Category</label>
      <select id="et-cat">
        <option value="">No category</option>
        ${getTodoCategories().map(c=>`<option value="${escHtml(c)}"${t.cat===c?' selected':''}>${escHtml(c)}</option>`).join('')}
      </select>
    </div>
    <div class="field"><label>Assigned to</label>
      <select id="et-who">
        <option value="">Unassigned</option>
        ${getAllPeople().map(p=>`<option value="${escHtml(p)}"${t.who===p?' selected':''}>${escHtml(p)}</option>`).join('')}
      </select>
    </div>
    <div class="field"><label>Notes</label><input type="text" id="et-notes" value="${escHtml(t.notes||'')}" placeholder="Any notes…"></div>
    <div class="m-actions">
      <button class="btn danger" onclick="confirmDelete('Delete this task?',()=>{deleteTodo(${id});closeModal()})">
        <i class="ti ti-trash"></i> Delete
      </button>
      <button class="btn" onclick="closeModal()">Cancel</button>
      <button class="btn primary" onclick="doEditTodo(${id})"><i class="ti ti-check"></i> Save</button>
    </div>`);
}

function doEditTodo(id) {
  const t = (S.todos||[]).find(t => t.id===id);
  if (!t) return;
  t.task  = document.getElementById('et-task')?.value?.trim()  || t.task;
  t.cat   = document.getElementById('et-cat')?.value   || '';
  t.who   = document.getElementById('et-who')?.value   || '';
  t.notes = document.getElementById('et-notes')?.value?.trim() || '';
  saveState(); closeModal(); renderTodoKeep();
}

function openManageTodoCategories() {
  const cats = getTodoCategories();
  showModal(`
    <h3>Manage categories</h3>
    <div style="display:flex;flex-direction:column;gap:4px;margin-bottom:10px;max-height:300px;overflow-y:auto">
      ${cats.map((c,i)=>`<div style="display:flex;align-items:center;gap:6px;padding:5px 8px;background:var(--bg2);border-radius:var(--radius-sm)">
        <span style="flex:1;font-size:13px">${escHtml(c)}</span>
        <button class="icon-btn del-btn" onclick="deleteTodoCat(${i})"><i class="ti ti-trash" style="font-size:13px"></i></button>
      </div>`).join('')}
    </div>
    <div style="display:flex;gap:6px">
      <input type="text" id="new-cat-name" placeholder="New category name…" style="flex:1;font-size:13px">
      <button class="btn primary" onclick="addTodoCat()"><i class="ti ti-plus"></i> Add</button>
    </div>
    <div class="m-actions"><button class="btn" onclick="closeModal()">Done</button></div>`);
}

function addTodoCat() {
  const name = document.getElementById('new-cat-name')?.value?.trim();
  if (!name) return;
  if (!S.todoCategories) S.todoCategories = getTodoCategories();
  if (!S.todoCategories.includes(name)) S.todoCategories.push(name);
  saveState(); closeModal(); openManageTodoCategories();
}

function deleteTodoCat(i) {
  if (!S.todoCategories) S.todoCategories = getTodoCategories();
  S.todoCategories.splice(i,1);
  saveState(); closeModal(); openManageTodoCategories();
}
