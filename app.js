const STORAGE_KEY = "northstar-project-manager-v2";
const STATUS = ["To do", "In progress", "Review", "Done"];
const state = { projects: [], activeProjectId: null, view: "gantt", zoom: 1, color: "#dbe88f", pendingDelete: null, collapsedProjects: new Set(), homeCollapsedProjects: new Set() };
const $ = id => document.getElementById(id);
const esc = value => { const el = document.createElement("span"); el.textContent = value ?? ""; return el.innerHTML; };
const parseDate = value => new Date(`${value}T12:00:00`);
const toIso = value => value.toISOString().slice(0, 10);
const addDays = (value, amount) => { const d = parseDate(value); d.setDate(d.getDate() + amount); return toIso(d); };
const dayDiff = (a, b) => Math.round((parseDate(b) - parseDate(a)) / 86400000);
const formatDate = value => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(parseDate(value));
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
const taskTooltip = task => { const distance = dayDiff(todayIso(), task.start); const timing = distance === 0 ? "Starts today" : distance > 0 ? `Starts in ${distance} day${distance === 1 ? "" : "s"}` : `Started ${Math.abs(distance)} day${Math.abs(distance) === 1 ? "" : "s"} ago`; return `${task.name}\n${timing}`; };
const project = () => state.projects.find(item => item.id === state.activeProjectId);

function load() {
  try { const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)); if (saved?.projects) { state.projects = saved.projects; state.activeProjectId = saved.activeProjectId; } } catch {}
  state.activeProjectId = null;
  state.collapsedProjects = new Set(state.projects.map(p => p.id));
  state.homeCollapsedProjects.clear();
}
function persist() { localStorage.setItem(STORAGE_KEY, JSON.stringify({ projects: state.projects, activeProjectId: state.activeProjectId })); }
function uid() { return `${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function initials(name) { return (name || "?").split(/\s+/).slice(0, 2).map(word => word[0]).join("").toUpperCase(); }
function statusClass(value) { return value.toLowerCase().replaceAll(" ", "-"); }
function taskItems() {
  const p = project(); if (!p) return [];
  const query = $("searchInput").value.trim().toLowerCase(); const status = $("statusFilter").value;
  return p.tasks.filter(task => (!query || `${task.name} ${task.owner} ${task.notes}`.toLowerCase().includes(query)) && (status === "all" || task.status === status));
}

function render() {
  const p = project();
  $("welcome").hidden = !!p; $("projectWorkspace").hidden = !p; $("searchInput").disabled = state.projects.length === 0;
  renderSidebar();
  if (!p) { renderHomeGantt(); return; }
  $("projectName").textContent = p.name;
  renderGantt();
  $("filterDot").hidden = $("statusFilter").value === "all" && !$("searchInput").value;
}
function renderSidebar() {
  $("sideEmpty").hidden = state.projects.length > 0;
  const sortedProjects = [...state.projects].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  $("projectList").innerHTML = sortedProjects.map(p => { const collapsed = state.collapsedProjects.has(p.id); const sortedTasks = [...p.tasks].sort((a, b) => a.start.localeCompare(b.start) || a.name.localeCompare(b.name)), nextTask = sortedTasks.find(task => dayDiff(todayIso(), task.start) > 0), daysUntilFirst = nextTask ? dayDiff(todayIso(), nextTask.start) : ""; return `<div class="project-tree"><div class="project-tree-head"><button class="tree-toggle ${collapsed ? "collapsed" : ""}" data-toggle-project="${p.id}" aria-label="${collapsed ? "Expand" : "Collapse"} ${esc(p.name)}" aria-expanded="${!collapsed}">⌄</button><button class="project-item ${p.id === state.activeProjectId ? "active" : ""}" data-project="${p.id}"><i style="background:${p.color}"></i><span>${esc(p.name)}</span></button><span class="project-days" title="Days until first task">${daysUntilFirst}</span><button class="side-add-task" data-add-task="${p.id}" aria-label="Add task to ${esc(p.name)}" title="Add task">＋</button></div><div class="side-tasks" ${collapsed ? "hidden" : ""}>${sortedTasks.map(task => `<button class="side-task" data-side-task="${task.id}" data-parent-project="${p.id}"><span class="task-status-dot ${statusClass(task.status)}"></span><span>${esc(task.name)}</span></button>`).join("")}</div></div>`; }).join("");
  document.querySelectorAll("[data-project]").forEach(button => button.onclick = () => { $("searchInput").value = ""; $("statusFilter").value = "all"; openProjectView(button.dataset.project); });
  document.querySelectorAll("[data-side-task]").forEach(button => button.onclick = event => { event.stopPropagation(); state.activeProjectId = button.dataset.parentProject; persist(); render(); openTask(button.dataset.sideTask); });
  document.querySelectorAll("[data-add-task]").forEach(button => button.onclick = event => { event.stopPropagation(); state.activeProjectId = button.dataset.addTask; persist(); render(); openTask(); });
  document.querySelectorAll("[data-toggle-project]").forEach(button => button.onclick = event => { event.stopPropagation(); const id = button.dataset.toggleProject; state.collapsedProjects.has(id) ? state.collapsedProjects.delete(id) : state.collapsedProjects.add(id); renderSidebar(); });
}
function allTasks() { return state.projects.flatMap(p => p.tasks.map(task => ({ ...task, projectId: p.id, projectName: p.name, projectColor: p.color }))); }
function openProjectView(id) { state.activeProjectId = id; persist(); render(); $("sidebar").classList.remove("open"); }
function openTaskFromHome(projectId, taskId) { state.activeProjectId = projectId; persist(); render(); openTask(taskId); }
function clearHomeFilters() { $("homeStatusFilter").value = "all"; $("homeDateFilter").value = "all"; $("searchInput").value = ""; renderHomeGantt(); }
function renderHomeGantt() {
  const all = allTasks(), statusFilter = $("homeStatusFilter").value, dateFilter = $("homeDateFilter").value, query = $("searchInput").value.trim().toLowerCase(), today = todayIso(), tomorrow = addDays(today, 1);
  const tasks = all.filter(task => { const statusMatch = statusFilter === "all" || task.status === statusFilter; const dateMatch = dateFilter === "all" || (dateFilter === "today" ? task.start <= today && task.end >= today : task.start <= tomorrow && task.end >= today); const searchMatch = !query || `${task.name} ${task.owner} ${task.notes} ${task.projectName}`.toLowerCase().includes(query); return statusMatch && dateMatch && searchMatch; });
  const filtered = statusFilter !== "all" || dateFilter !== "all" || !!query; $("homeFilterDot").hidden = statusFilter === "all" && dateFilter === "all";
  const matchingProjects = new Set(tasks.map(task => task.projectId)).size;
  $("homeSummary").textContent = state.projects.length ? `${matchingProjects} project${matchingProjects === 1 ? "" : "s"} · ${tasks.length} ${filtered ? "matching " : ""}task${tasks.length === 1 ? "" : "s"}` : "No projects yet";
  if (!tasks.length && (!state.projects.length || filtered)) {
    $("homeGantt").innerHTML = filtered ? `<div class="empty-panel"><div>≡</div><h3>No matching tasks</h3><p>No tasks and projects match the selected filters.</p><button class="secondary home-clear-action">Clear filters</button></div>` : `<div class="empty-panel"><div>⌁</div><h3>${state.projects.length ? "No tasks on the timeline" : "Your Gantt chart is ready"}</h3><p>${state.projects.length ? "Open a project and add its first task." : "Create a project to begin building your master timeline."}</p><button class="primary home-empty-action">${state.projects.length ? "Open a project" : "＋ Create project"}</button></div>`;
    const clear = document.querySelector(".home-clear-action"); if (clear) clear.onclick = clearHomeFilters; else document.querySelector(".home-empty-action").onclick = () => state.projects.length ? openProjectView(state.projects[0].id) : openProject(); return;
  }
  const projectDates=state.projects.flatMap(p=>[p.start,p.end]).filter(Boolean),first=[...tasks.map(t=>t.start),...projectDates,today].sort()[0],last=[...tasks.map(t=>t.end),...projectDates,today].sort().at(-1),start=parseDate(addDays(first,-3)),end=parseDate(addDays(last,10)),days=dayDiff(toIso(start),toIso(end))+1,width=Math.round(25*state.zoom);
  let html=`<div class="gantt-grid home-grid" data-chart-start="${toIso(start)}" style="--days:${days};--day-width:${width}px"><div class="gantt-corner" style="grid-column:1;grid-row:1 / span 2">PROJECT / TASK</div>`;
  let cursor=new Date(start);while(cursor<=end){const month=cursor.getMonth(),year=cursor.getFullYear(),offset=dayDiff(toIso(start),toIso(cursor));let span=0;while(cursor<=end&&cursor.getMonth()===month){span++;cursor.setDate(cursor.getDate()+1)}html+=`<div class="month" style="grid-column:${offset+2} / span ${span};grid-row:1">${new Intl.DateTimeFormat("en-US",{month:"long",year:"numeric"}).format(new Date(year,month,1))}</div>`}
  for(let i=0;i<days;i++){const d=new Date(start);d.setDate(d.getDate()+i);html+=`<div class="day ${[0,6].includes(d.getDay())?"weekend":""} ${toIso(d)===today?"today":""}" style="grid-column:${i+2};grid-row:2">${d.getDate()}<small>${toIso(d)===today?"TODAY":["S","M","T","W","T","F","S"][d.getDay()]}</small></div>`}
  let row=3;[...state.projects].sort((a,b)=>a.name.localeCompare(b.name,undefined,{sensitivity:"base"})).forEach(p=>{const projectTasks=tasks.filter(t=>t.projectId===p.id).sort((a,b)=>a.start.localeCompare(b.start)||a.name.localeCompare(b.name));if(filtered&&!projectTasks.length)return;const collapsed=state.homeCollapsedProjects.has(p.id);html+=`<button class="task-label home-project-row" data-home-project="${p.id}" style="grid-column:1;grid-row:${row}"><span class="home-chart-toggle ${collapsed?"collapsed":""}" data-home-toggle="${p.id}">⌄</span><i style="background:${p.color}"></i><span><b>${esc(p.name)}</b></span></button>`;for(let i=0;i<days;i++){const d=new Date(start);d.setDate(d.getDate()+i);html+=`<div class="gantt-cell project-band ${[0,6].includes(d.getDay())?"weekend":""}" data-project-cell="${p.id}" style="grid-column:${i+2};grid-row:${row}"></div>`}if(p.start&&p.end){const projectOffset=dayDiff(toIso(start),p.start),projectDuration=dayDiff(p.start,p.end)+1;html+=`<button class="bar project-bar" data-project-bar="${p.id}" style="--project-color:${p.color};grid-column:${projectOffset+2} / span ${projectDuration};grid-row:${row}">${esc(p.name)}</button>`}row++;if(!collapsed)projectTasks.forEach(task=>{const offset=dayDiff(toIso(start),task.start),duration=dayDiff(task.start,task.end)+1;html+=`<button class="task-label home-task-row" data-home-task="${task.id}" data-home-parent="${p.id}" style="grid-column:1;grid-row:${row}"><span><b>${esc(task.name)}</b></span></button>`;for(let i=0;i<days;i++){const d=new Date(start);d.setDate(d.getDate()+i);html+=`<div class="gantt-cell task-band ${[0,6].includes(d.getDay())?"weekend":""}" style="grid-column:${i+2};grid-row:${row}"></div>`}html+=`<button class="bar ${statusClass(task.status)}" data-home-bar="${task.id}" data-home-parent="${p.id}" style="grid-column:${offset+2} / span ${duration};grid-row:${row}">${esc(task.name)}</button>`;row++})});
  $("homeGantt").innerHTML=html+`</div>`;
  markTruncatedBars();
  document.querySelectorAll("[data-home-project]").forEach(b=>b.onclick=e=>{const toggle=e.target.closest("[data-home-toggle]");if(toggle){const id=toggle.dataset.homeToggle;state.homeCollapsedProjects.has(id)?state.homeCollapsedProjects.delete(id):state.homeCollapsedProjects.add(id);renderHomeGantt();}else openProjectView(b.dataset.homeProject)});document.querySelectorAll("[data-home-task]").forEach(b=>b.onclick=()=>openTaskFromHome(b.dataset.homeParent,b.dataset.homeTask));wireHomeDrag(width);
}
function emptyPanel(title, copy) { return `<div class="empty-panel"><div>⌁</div><h3>${title}</h3><p>${copy}</p><button class="primary empty-add">＋ Add first task</button></div>`; }
function renderGantt() {
  const tasks = taskItems().sort((a, b) => a.start.localeCompare(b.start) || a.name.localeCompare(b.name));
  if (!project().tasks.length) { $("gantt").innerHTML = emptyPanel("Your timeline is ready", "Add a task with start and end dates to build your Gantt chart."); wireEmptyButtons(); return; }
  if (!tasks.length) { $("gantt").innerHTML = `<div class="empty-panel"><h3>No matching tasks</h3><p>Try changing your search or filter.</p></div>`; return; }
  const allTasks = project().tasks, minTask = allTasks.map(t => t.start).sort()[0], maxTask = allTasks.map(t => t.end).sort().at(-1);
  const today = todayIso(), firstDate = [minTask, today].sort()[0], lastDate = [maxTask, today].sort().at(-1), start = parseDate(addDays(firstDate, -3)), end = parseDate(addDays(lastDate, 10)), days = dayDiff(toIso(start), toIso(end)) + 1, width = Math.round(25 * state.zoom);
  let html = `<div class="gantt-grid" data-chart-start="${toIso(start)}" style="--days:${days};--day-width:${width}px"><div class="gantt-corner" style="grid-column:1;grid-row:1 / span 2">TASK / OWNER</div>`;
  let cursor = new Date(start);
  while (cursor <= end) { const month = cursor.getMonth(), year = cursor.getFullYear(), offset = dayDiff(toIso(start), toIso(cursor)); let span = 0; while (cursor <= end && cursor.getMonth() === month) { span++; cursor.setDate(cursor.getDate() + 1); } html += `<div class="month" style="grid-column:${offset + 2} / span ${span};grid-row:1">${new Intl.DateTimeFormat("en-US", {month:"long", year:"numeric"}).format(new Date(year, month, 1))}</div>`; }
  for (let i = 0; i < days; i++) { const d = new Date(start); d.setDate(d.getDate() + i); html += `<div class="day ${[0,6].includes(d.getDay()) ? "weekend" : ""} ${toIso(d) === today ? "today" : ""}" style="grid-column:${i + 2};grid-row:2">${d.getDate()}<small>${toIso(d) === today ? "TODAY" : ["S","M","T","W","T","F","S"][d.getDay()]}</small></div>`; }
  tasks.forEach((task, index) => { const row = index + 3, offset = dayDiff(toIso(start), task.start), duration = dayDiff(task.start, task.end) + 1;
    html += `<button class="task-label" data-task="${task.id}" style="grid-column:1;grid-row:${row}"><span><b>${esc(task.name)}</b></span></button>`;
    for (let i=0;i<days;i++) { const d=new Date(start); d.setDate(d.getDate()+i); html += `<div class="gantt-cell ${[0,6].includes(d.getDay()) ? "weekend" : ""}" style="grid-column:${i+2};grid-row:${row}"></div>`; }
    html += `<button class="bar ${statusClass(task.status)}" data-bar="${task.id}" style="grid-column:${offset+2} / span ${duration};grid-row:${row}">${esc(task.name)}</button>`;
  });
  $("gantt").innerHTML = html + `</div>`; wireTaskButtons(); wireDrag(width); markTruncatedBars();
}
function wireEmptyButtons() { document.querySelectorAll(".empty-add").forEach(button => button.onclick = () => openTask()); }
function wireTaskButtons() { document.querySelectorAll("[data-task]").forEach(button => button.onclick = () => openTask(button.dataset.task)); }
function wireDrag(dayWidth) {
  document.querySelectorAll("[data-bar]").forEach(bar => { let startX, moved = false, task;
    bar.onpointerdown = event => { event.preventDefault(); startX = event.clientX; moved = false; task = project().tasks.find(t => t.id === bar.dataset.bar); bar.setPointerCapture(event.pointerId); };
    bar.onpointermove = event => { if (startX == null) return; const dx = event.clientX - startX; moved ||= Math.abs(dx) > 4; bar.style.transform = `translateX(${Math.round(dx/dayWidth)*dayWidth}px)`; };
    bar.onpointerup = event => { const shift = Math.round((event.clientX-startX)/dayWidth); bar.style.transform=""; startX=null; if (moved) { if (shift) { task.start=addDays(task.start,shift); task.end=addDays(task.end,shift); persist(); render(); toast("Task rescheduled"); } } else openTask(task.id); };
  });
}
function wireHomeDrag(dayWidth) {
  document.querySelectorAll("[data-home-bar],[data-project-bar]").forEach(bar => { let startX, moved = false, item;
    bar.onpointerdown = event => { event.preventDefault(); startX = event.clientX; moved = false; item = bar.dataset.homeBar ? taskForBar(bar) : state.projects.find(p => p.id === bar.dataset.projectBar); bar.setPointerCapture(event.pointerId); };
    bar.onpointermove = event => { if (startX == null) return; const dx = event.clientX - startX; moved ||= Math.abs(dx) > 4; bar.style.transform = `translateX(${Math.round(dx/dayWidth)*dayWidth}px)`; };
    bar.onpointerup = event => { if (startX == null) return; const shift = Math.round((event.clientX-startX)/dayWidth); bar.style.transform = ""; startX = null; if (moved) { if (shift && item) { item.start = addDays(item.start, shift); item.end = addDays(item.end, shift); persist(); renderHomeGantt(); toast(`${bar.dataset.homeBar ? "Task" : "Project"} rescheduled`); } } else if (bar.dataset.homeBar) openTaskFromHome(bar.dataset.homeParent, bar.dataset.homeBar); else openProject(bar.dataset.projectBar); };
    bar.onpointercancel = () => { bar.style.transform = ""; startX = null; };
  });
}

function openProject(id = null, selectedDate = null) {
  const p = state.projects.find(item => item.id === id); state.color = p?.color || "#dbe88f";
  $("projectId").value = p?.id || ""; $("projectNameInput").value = p?.name || ""; $("projectDescriptionInput").value = p?.description || ""; $("projectStart").value = p?.start || selectedDate || ""; $("projectEnd").value = p?.end || selectedDate || "";
  $("projectModalLabel").textContent = p ? "PROJECT SETTINGS" : "NEW PROJECT"; $("projectModalTitle").textContent = p ? "Edit project" : "Create a project";
  document.querySelectorAll("[data-color]").forEach(b => b.classList.toggle("selected", b.dataset.color === state.color)); $("projectModal").hidden = false; setTimeout(() => $("projectNameInput").focus(), 30);
}
function openTask(id = null, selectedDate = null) {
  const task = project()?.tasks.find(item => item.id === id); $("taskForm").reset(); $("taskId").value = task?.id || ""; $("taskNameInput").value = task?.name || ""; $("taskStatus").value = task?.status || "To do"; $("taskOwner").value = task?.owner || ""; $("taskStart").value = task?.start || selectedDate || ""; $("taskEnd").value = task?.end || selectedDate || ""; $("taskNotes").value = task?.notes || "";
  $("taskModalLabel").textContent = task ? "TASK DETAILS" : "NEW TASK"; $("taskModalTitle").textContent = task ? "Edit task" : "Add a task"; $("deleteTask").hidden = !task; $("taskModal").hidden = false; setTimeout(() => $("taskNameInput").focus(), 30);
}
function closeModals() { document.querySelectorAll(".backdrop").forEach(modal => modal.hidden = true); }
function toast(message) { $("toast").textContent = message; $("toast").classList.add("show"); clearTimeout(toast.timer); toast.timer = setTimeout(() => $("toast").classList.remove("show"), 1800); }
function taskForBar(bar) { const id = bar.dataset.bar || bar.dataset.homeBar; const projectId = bar.dataset.homeParent || state.activeProjectId; return state.projects.find(p => p.id === projectId)?.tasks.find(t => t.id === id); }
function markTruncatedBars() { requestAnimationFrame(() => document.querySelectorAll(".bar").forEach(bar => { const task = taskForBar(bar); if (!task) return; const distance = dayDiff(todayIso(), task.start), timing = distance === 0 ? "today" : distance > 0 ? `in ${distance} day${distance === 1 ? "" : "s"}` : `${Math.abs(distance)} day${Math.abs(distance) === 1 ? "" : "s"} ago`, label = `${task.name} · ${timing}`; bar.classList.remove("show-balloon"); bar.textContent = label; bar.dataset.balloon = label; if (bar.scrollWidth > bar.clientWidth + 1) bar.classList.add("show-balloon"); })); }
function createTaskFromCell(cell) {
  const grid = cell.closest(".gantt-grid"), column = parseInt(cell.style.gridColumn, 10), row = parseInt(cell.style.gridRow, 10); if (!grid?.dataset.chartStart || !column) return;
  const selectedDate = addDays(grid.dataset.chartStart, column - 2); if(cell.dataset.projectCell){openProject(cell.dataset.projectCell,selectedDate);return;} let projectId = state.activeProjectId;
  if (grid.classList.contains("home-grid")) { const parents = [...grid.querySelectorAll("[data-home-project]")].filter(label => parseInt(label.style.gridRow, 10) <= row).sort((a,b) => parseInt(b.style.gridRow,10) - parseInt(a.style.gridRow,10)); projectId = parents[0]?.dataset.homeProject; }
  if (!projectId) return; state.activeProjectId = projectId; persist(); render(); openTask(null, selectedDate);
}
function showCellTooltip(cell) {
  const grid = cell.closest(".gantt-grid"), column = parseInt(cell.style.gridColumn, 10); if (!grid?.dataset.chartStart || !column) return;
  const value = addDays(grid.dataset.chartStart, column - 2), row = parseInt(cell.style.gridRow, 10), rowBars = [...grid.querySelectorAll(".bar")].filter(bar => parseInt(bar.style.gridRow, 10) === row);
  const currentDateInfo = () => { const distance = dayDiff(todayIso(), value); return distance === 0 ? "Today" : distance > 0 ? `In ${distance} day${distance === 1 ? "" : "s"} from today` : `${Math.abs(distance)} day${Math.abs(distance) === 1 ? "" : "s"} before today`; };
  const candidates = rowBars.map(bar => taskForBar(bar)).filter(task => task && task.end >= value).sort((a,b) => a.start.localeCompare(b.start)), task = candidates[0];
  let relative;
  if (!task) relative = currentDateInfo();
  else if (value < task.start) { const days = dayDiff(value, task.start); relative = `${days} day${days === 1 ? "" : "s"} until ${task.name}`; }
  else relative = `${task.name} is active`;
  const tip = $("cellTooltip"); tip.innerHTML = `<strong>${formatDate(value)}</strong><span>${relative}</span>`; tip.hidden = false; const rect = cell.getBoundingClientRect(), box = tip.getBoundingClientRect(); let left = rect.left + rect.width/2 - box.width/2, top = rect.top - box.height - 8; left = Math.max(8, Math.min(left, window.innerWidth-box.width-8)); if(top<8) top=rect.bottom+8; tip.style.left=`${left}px`;tip.style.top=`${top}px`;
}
function hideCellTooltip() { $("cellTooltip").hidden = true; }
function askDelete(type, item) { state.pendingDelete = { type, item }; $("confirmTitle").textContent = `Delete ${type}?`; $("confirmText").textContent = type === "project" ? `“${item.name}” and all of its tasks will be permanently deleted.` : `“${item.name}” will be permanently deleted.`; $("confirm").hidden = false; }

function setup() {
  load();
  $("sideAddProject").onclick = () => openProject();
  $("ganttHomeButton").onclick = () => { state.activeProjectId = null; if (state.homeCollapsedProjects.size) state.homeCollapsedProjects.clear(); else state.homeCollapsedProjects = new Set(state.projects.map(p => p.id)); $("searchInput").value = ""; persist(); render(); $("sidebar").classList.remove("open"); };
  $("projectAddTask").onclick = () => openTask();
  $("editProject").onclick = () => openProject(project().id); $("projectMenu").onclick = () => $("projectMenuPopup").hidden = !$("projectMenuPopup").hidden;
  $("deleteProject").onclick = () => { $("projectMenuPopup").hidden = true; askDelete("project", project()); };
  document.querySelectorAll("[data-close]").forEach(button => button.onclick = closeModals);
  document.querySelectorAll(".backdrop").forEach(modal => modal.onclick = e => { if (e.target === modal) closeModals(); });
  document.querySelectorAll("[data-color]").forEach(button => button.onclick = () => { state.color = button.dataset.color; document.querySelectorAll("[data-color]").forEach(b => b.classList.toggle("selected", b === button)); });
  $("projectForm").onsubmit = event => { event.preventDefault(); const start=$("projectStart").value,end=$("projectEnd").value;if((start&&!end)||(!start&&end)){toast("Add both project dates or leave both blank");return;}if(start&&parseDate(end)<parseDate(start)){toast("End date must be after start date");return;}const id=$("projectId").value, existing=state.projects.find(p=>p.id===id), data={id:id||uid(),name:$("projectNameInput").value.trim(),description:$("projectDescriptionInput").value.trim(),color:state.color,start,end,tasks:existing?.tasks||[]}; if(existing) state.projects[state.projects.indexOf(existing)]=data; else {state.projects.push(data);state.activeProjectId=data.id;} persist();closeModals();render();toast(existing?"Project updated":"Project created"); };
  $("taskForm").onsubmit = event => { event.preventDefault(); if (parseDate($("taskEnd").value)<parseDate($("taskStart").value)){toast("End date must be after start date");return;} const id=$("taskId").value, existing=project().tasks.find(t=>t.id===id), data={id:id||uid(),name:$("taskNameInput").value.trim(),status:$("taskStatus").value,owner:$("taskOwner").value.trim(),start:$("taskStart").value,end:$("taskEnd").value,notes:$("taskNotes").value.trim()}; if(existing)project().tasks[project().tasks.indexOf(existing)]=data;else project().tasks.push(data);persist();closeModals();render();toast(existing?"Task updated":"Task added"); };
  $("deleteTask").onclick = () => { const task=project().tasks.find(t=>t.id===$("taskId").value); closeModals(); askDelete("task",task); };
  $("confirmCancel").onclick = () => { $("confirm").hidden=true;state.pendingDelete=null; };
  $("confirmDelete").onclick = () => { const {type,item}=state.pendingDelete;if(type==="project"){state.projects=state.projects.filter(p=>p.id!==item.id);state.activeProjectId=state.projects[0]?.id??null;}else project().tasks=project().tasks.filter(t=>t.id!==item.id);persist();$("confirm").hidden=true;state.pendingDelete=null;render();toast(`${type[0].toUpperCase()+type.slice(1)} deleted`); };
  $("filterButton").onclick=()=>$("filters").hidden=!$("filters").hidden; $("statusFilter").onchange=render; $("searchInput").oninput=render; $("clearFilter").onclick=()=>{$("statusFilter").value="all";$("searchInput").value="";render();};
  $("zoomIn").onclick=()=>{state.zoom=Math.min(1.8,state.zoom+.2);$("zoomLabel").textContent=state.zoom>1.3?"Day":"Week";renderGantt();};$("zoomOut").onclick=()=>{state.zoom=Math.max(.6,state.zoom-.2);$("zoomLabel").textContent=state.zoom<.8?"Month":"Week";renderGantt();};
  $("homeZoomIn").onclick=()=>{state.zoom=Math.min(1.8,state.zoom+.2);$("homeZoomLabel").textContent=state.zoom>1.3?"Day":"Week";renderHomeGantt();};$("homeZoomOut").onclick=()=>{state.zoom=Math.max(.6,state.zoom-.2);$("homeZoomLabel").textContent=state.zoom<.8?"Month":"Week";renderHomeGantt();};
  $("homeFilterButton").onclick=()=>$("homeFilters").hidden=!$("homeFilters").hidden;$("homeStatusFilter").onchange=renderHomeGantt;$("homeDateFilter").onchange=renderHomeGantt;$("clearHomeFilter").onclick=clearHomeFilters;
  $("menuButton").onclick=()=>$("sidebar").classList.toggle("open");
  document.addEventListener("click", event => { const cell = event.target.closest(".gantt-cell"); if (cell) createTaskFromCell(cell); });
  document.addEventListener("mouseover", event => { const cell=event.target.closest(".gantt-cell");if(cell&&!cell.contains(event.relatedTarget))showCellTooltip(cell); });
  document.addEventListener("mouseout", event => { const cell=event.target.closest(".gantt-cell");if(cell&&!cell.contains(event.relatedTarget))hideCellTooltip(); });
  document.onkeydown=event=>{if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==="k"){event.preventDefault();$("searchInput").focus();}if(event.key==="Escape"){closeModals();$("confirm").hidden=true;}};
  render();
}
setup();
