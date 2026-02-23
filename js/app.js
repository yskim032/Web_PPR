// ============================================================
// MSC Port Schedule - Main Application
// ============================================================

import { db, auth, storage, firebaseReady } from './firebase-config.js';

// Firebase SDK imports (CDN - same version as firebase-config.js)
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

import {
  doc, getDoc, setDoc, updateDoc, collection, getDocs, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// ---- State ----
const state = {
  currentPort: 'busan',
  schedules: {},
  filtered: [],
  currentPage: 1,
  pageSize: 20,
  searchQuery: '',
  serviceFilter: '',
  currentVessel: null,
  vesselData: {},   // { vesselKey: { memo, operations, files, ppr } }
  currentUser: null,
  isSuperuser: false,
};

// ---- Init ----
async function init() {
  updateDateTime();
  setInterval(updateDateTime, 1000);

  await loadSchedules();
  setupPortTabs();
  setupSearch();
  setupDetailTabs();
  setupFileUpload();
  setupImportExport();
  setupModal();
  setupLogin();

  renderTable();
}

// ---- DateTime ----
function updateDateTime() {
  const now = new Date();
  const el = document.getElementById('currentDateTime');
  if (el) el.textContent = now.toLocaleString('ko-KR', { hour12: false });
}

// ---- Load Schedule Data ----
async function loadSchedules() {
  try {
    // Try local JSON first (no Firebase needed)
    const res = await fetch('data/schedules.json');
    if (res.ok) {
      const raw = await res.json();
      // Merge with any Firebase overrides / memos
      state.schedules = raw;
      loadLocalVesselData();
      return;
    }
  } catch (e) {
    console.warn('Could not load local schedules.json');
  }

  // Fallback: embedded data (minimal)
  state.schedules = { busan: [], gwangyang: [], incheon: [] };
}

// ---- Vessel Data (localStorage + Firestore) ----
function loadLocalVesselData() {
  try {
    const saved = localStorage.getItem('msc_vessel_data');
    if (saved) state.vesselData = JSON.parse(saved);
  } catch (e) {}
}

function saveLocalVesselData() {
  localStorage.setItem('msc_vessel_data', JSON.stringify(state.vesselData));
}

// Save a single vessel document to Firestore
async function saveVesselToFirestore(vesselKey) {
  if (!firebaseReady) return;
  try {
    const data = state.vesselData[vesselKey];
    if (!data) return;
    const ref = doc(db, 'vessels', vesselKey);
    await setDoc(ref, {
      ...data,
      updatedAt: serverTimestamp(),
    }, { merge: true });
  } catch (e) {
    console.warn('[Firestore] Save failed:', e.message);
  }
}

// Load all vessel data from Firestore (on app start, when logged in)
async function loadAllFromFirestore() {
  if (!firebaseReady) return;
  try {
    const snap = await getDocs(collection(db, 'vessels'));
    snap.forEach(d => {
      state.vesselData[d.id] = { ...state.vesselData[d.id], ...d.data() };
    });
    saveLocalVesselData();   // sync to local cache
    renderTable();
  } catch (e) {
    console.warn('[Firestore] Load failed:', e.message);
  }
}

function getVesselKey(vessel) {
  return `${vessel.port}_${vessel.vessel}_${vessel.voyage}`;
}

function getVesselState(vessel) {
  const key = getVesselKey(vessel);
  if (!state.vesselData[key]) {
    state.vesselData[key] = {
      memo: '',
      operations: { discharge: 0, load: 0, shifting: 0 },
      timings: {},
      files: { discharge: [], load: [], shifting: [], other: [] },
      ppr: null,
    };
  }
  return state.vesselData[key];
}

// ---- Terminal / Tally Options per Port ----
const TERMINAL_OPTIONS = {
  busan:     ['PNC', 'PNIT', 'BCT', 'HJNC', 'BNMT'],
  gwangyang: ['GWCT'],
  incheon:   ['ICT'],
};
const TALLY_OPTIONS = {
  busan:     ['SPM', 'SHINYANG', 'BUMA', 'HAEYANG', 'KOOKBO'],
  gwangyang: ['CONTAINER'],
  incheon:   ['SHINHAN'],
};

// ---- Port Tabs ----
function setupPortTabs() {
  document.querySelectorAll('#portTabs button').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#portTabs button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.currentPort = btn.dataset.port;
      state.currentPage = 1;
      state.searchQuery = '';
      state.serviceFilter = '';
      document.getElementById('searchInput').value = '';
      populateServiceFilter();
      renderTable();
    });
  });

  for (const port of ['busan', 'gwangyang', 'incheon']) {
    const cnt   = (state.schedules[port] || []).length;
    const badge = document.getElementById(`badge-${port}`);
    if (badge) badge.textContent = cnt;
  }

  populateServiceFilter();
}

// ---- Custom Dropdown for TERMINAL / TALLY ----
function makeSelect(field, vesselKey, port, savedVal) {
  const opts     = field === 'terminal' ? TERMINAL_OPTIONS[port] : TALLY_OPTIONS[port];
  const safeKey  = CSS.escape ? vesselKey : vesselKey.replace(/[^a-z0-9_-]/gi, '_');
  const id       = `tt_${field}_${vesselKey.replace(/[^a-z0-9]/gi,'_')}`;
  const display  = savedVal ? escHtml(savedVal) : '';

  const optionItems = [
    `<div class="tt-option" onclick="selectTT(event,'${id}','')">　-</div>`,
    ...opts.map(o =>
      `<div class="tt-option" onclick="selectTT(event,'${id}','${o}')">${o}</div>`
    ),
    `<div class="tt-option tt-option-custom" onclick="startTTInput(event,'${id}','${field}','${vesselKey}')">직접입력...</div>`,
  ].join('');

  return `<div class="tt-cell" id="${id}"
               data-key="${vesselKey}" data-field="${field}"
               onclick="event.stopPropagation(); toggleTTMenu('${id}')">
    <span class="tt-val">${display}</span>
    <div class="tt-menu" style="display:none">${optionItems}</div>
  </div>`;
}

// 드롭다운 열기/닫기
window.toggleTTMenu = function(id) {
  closeAllTTMenus(id);
  const cell = document.getElementById(id);
  if (!cell) return;
  const menu = cell.querySelector('.tt-menu');
  if (!menu) return;
  const isOpen = menu.style.display !== 'none';
  menu.style.display = isOpen ? 'none' : 'block';
};

function closeAllTTMenus(exceptId) {
  document.querySelectorAll('.tt-menu').forEach(m => {
    if (m.closest('.tt-cell')?.id !== exceptId) {
      m.style.display = 'none';
    }
  });
}

// 옵션 선택
window.selectTT = function(e, id, val) {
  e.stopPropagation();
  const cell  = document.getElementById(id);
  if (!cell) return;
  const key   = cell.dataset.key;
  const field = cell.dataset.field;
  const span  = cell.querySelector('.tt-val');
  if (span) span.textContent = val;
  cell.querySelector('.tt-menu').style.display = 'none';
  if (!state.vesselData[key]) state.vesselData[key] = {};
  state.vesselData[key][field] = val;
  saveLocalVesselData();
};

// 직접입력
window.startTTInput = function(e, id, field, vesselKey) {
  e.stopPropagation();
  const cell = document.getElementById(id);
  if (!cell) return;
  cell.querySelector('.tt-menu').style.display = 'none';

  const span = cell.querySelector('.tt-val');
  const prev = span.textContent;
  span.style.display = 'none';

  const wrap  = document.createElement('div');
  wrap.className = 'tt-input-wrap';
  wrap.onclick = e => e.stopPropagation();

  const inp = document.createElement('input');
  inp.className   = 'tt-inline-input';
  inp.placeholder = '입력...';
  inp.value       = prev;

  const confirm = () => {
    const val = inp.value.trim();
    span.textContent  = val;
    span.style.display = '';
    wrap.remove();
    if (!state.vesselData[vesselKey]) state.vesselData[vesselKey] = {};
    state.vesselData[vesselKey][field] = val;
    saveLocalVesselData();
  };

  inp.addEventListener('blur',    confirm);
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') inp.blur(); });

  wrap.appendChild(inp);
  cell.appendChild(wrap);
  inp.focus();
  inp.select();
};

// 바깥 클릭 시 드롭다운 닫기
document.addEventListener('click', () => closeAllTTMenus(null));

// ---- Status Circle Toggle ----
window.toggleStatus = function(key, el) {
  if (!state.vesselData[key]) state.vesselData[key] = {};
  const current = !!state.vesselData[key].statusGreen;
  state.vesselData[key].statusGreen = !current;
  el.classList.toggle('green', !current);
  el.classList.toggle('red',    current);
  saveLocalVesselData();
};

function populateServiceFilter() {
  const vessels = state.schedules[state.currentPort] || [];
  const services = [...new Set(vessels.map(v => v.service).filter(Boolean))].sort();
  const sel = document.getElementById('serviceFilter');
  sel.innerHTML = '<option value="">All Services</option>';
  services.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s;
    opt.textContent = s;
    if (s === state.serviceFilter) opt.selected = true;
    sel.appendChild(opt);
  });
}

// ---- Search & Filter ----
function setupSearch() {
  const searchInput = document.getElementById('searchInput');
  const serviceFilter = document.getElementById('serviceFilter');

  searchInput.addEventListener('input', () => {
    state.searchQuery = searchInput.value.trim().toLowerCase();
    state.currentPage = 1;
    renderTable();
  });

  serviceFilter.addEventListener('change', () => {
    state.serviceFilter = serviceFilter.value;
    state.currentPage = 1;
    renderTable();
  });
}

// ---- Render Table ----
function renderTable() {
  const vessels = state.schedules[state.currentPort] || [];

  // Apply filters
  state.filtered = vessels.filter(v => {
    const q = state.searchQuery;
    const matchSearch = !q ||
      v.vessel.toLowerCase().includes(q) ||
      v.voyage.toLowerCase().includes(q) ||
      v.service.toLowerCase().includes(q) ||
      v.contact.toLowerCase().includes(q);
    const matchService = !state.serviceFilter || v.service === state.serviceFilter;
    return matchSearch && matchService;
  });

  // Pagination
  const total = state.filtered.length;
  const pages = Math.ceil(total / state.pageSize);
  if (state.currentPage > pages) state.currentPage = 1;
  const start = (state.currentPage - 1) * state.pageSize;
  const pageData = state.filtered.slice(start, start + state.pageSize);

  // Render rows
  const tbody = document.getElementById('vesselTableBody');
  if (pageData.length === 0) {
    tbody.innerHTML = `
      <tr class="loading-row">
        <td colspan="9">
          <i class="bi bi-search fs-3 d-block mb-2 text-muted"></i>
          No vessels found.
        </td>
      </tr>`;
  } else {
    tbody.innerHTML = pageData.map((v, i) => {
      const vs       = getVesselState(v);
      const key      = getVesselKey(v);
      const memoText = vs.memo || '';
      const rowNum   = start + i + 1;
      const termVal  = state.vesselData[key]?.terminal || '';
      const tallyVal = state.vesselData[key]?.tally    || '';
      const isGreen     = !!(state.vesselData[key]?.statusGreen);
      const circleClass = isGreen ? 'status-circle green' : 'status-circle red';
      return `
        <tr data-idx="${start + i}" onclick="openVesselModal(${start + i})">
          <td class="text-center">
            <div class="${circleClass}" onclick="event.stopPropagation(); toggleStatus('${key}', this)"></div>
          </td>
          <td onclick="event.stopPropagation()">${makeSelect('terminal', key, v.port.toLowerCase(), termVal)}</td>
          <td onclick="event.stopPropagation()">${makeSelect('tally',    key, v.port.toLowerCase(), tallyVal)}</td>
          <td>
            <div class="vessel-name-cell">
              <i class="bi bi-ship me-1 opacity-50"></i>${escHtml(v.vessel)} ${escHtml(v.voyage)}
            </div>
          </td>
          <td><span class="arrival-text"><i class="bi bi-arrow-down-circle me-1"></i>${escHtml(v.arrival)}</span></td>
          <td><span class="departure-text"><i class="bi bi-arrow-up-circle me-1"></i>${escHtml(v.departure)}</span></td>
          <td><span class="service-badge">${escHtml(v.service)}</span></td>
          <td class="memo-cell">
            ${memoText
              ? `<span class="memo-highlight" title="${escHtml(memoText)}">${escHtml(memoText)}</span>`
              : '<span class="text-muted">-</span>'}
          </td>
          <td>
            <button class="action-btn"
              onclick="event.stopPropagation(); openVesselModal(${start + i})"
              title="Open">
              <i class="bi bi-folder2-open"></i>
            </button>
          </td>
        </tr>`;
    }).join('');
  }

  // Update info
  document.getElementById('tableInfo').textContent =
    `Showing ${pageData.length > 0 ? start + 1 : 0}–${Math.min(start + pageData.length, total)} of ${total} vessels`;

  renderPagination(pages);
}

function renderPagination(pages) {
  const nav = document.getElementById('pagination');
  if (pages <= 1) { nav.innerHTML = ''; return; }

  let html = '';
  const cur = state.currentPage;

  html += `<li class="page-item ${cur === 1 ? 'disabled' : ''}">
    <a class="page-link" href="#" data-page="${cur - 1}"><i class="bi bi-chevron-left"></i></a></li>`;

  const range = getPageRange(cur, pages);
  range.forEach(p => {
    if (p === '...') {
      html += `<li class="page-item disabled"><span class="page-link">…</span></li>`;
    } else {
      html += `<li class="page-item ${p === cur ? 'active' : ''}">
        <a class="page-link" href="#" data-page="${p}">${p}</a></li>`;
    }
  });

  html += `<li class="page-item ${cur === pages ? 'disabled' : ''}">
    <a class="page-link" href="#" data-page="${cur + 1}"><i class="bi bi-chevron-right"></i></a></li>`;

  nav.innerHTML = html;
  nav.querySelectorAll('a[data-page]').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      const p = parseInt(a.dataset.page);
      if (p >= 1 && p <= pages) {
        state.currentPage = p;
        renderTable();
      }
    });
  });
}

function getPageRange(cur, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = [];
  pages.push(1);
  if (cur > 3) pages.push('...');
  for (let i = Math.max(2, cur - 1); i <= Math.min(total - 1, cur + 1); i++) pages.push(i);
  if (cur < total - 2) pages.push('...');
  pages.push(total);
  return pages;
}

// ---- Vessel Modal ----
function setupModal() {
  // Memo save
  document.getElementById('btnSaveMemo').addEventListener('click', async () => {
    if (!state.currentVessel) return;
    const vs  = getVesselState(state.currentVessel);
    const key = getVesselKey(state.currentVessel);
    vs.memo   = document.getElementById('memoArea').value;
    saveLocalVesselData();
    renderTable();
    await saveVesselToFirestore(key);
    showToast('Memo saved!', 'success');
  });

  // Export vessel JSON
  document.getElementById('btnExportVesselJSON').addEventListener('click', () => {
    if (!state.currentVessel) return;
    const vs = getVesselState(state.currentVessel);
    const data = { vessel: state.currentVessel, data: vs };
    downloadJSON(data, `${state.currentVessel.vessel}_${state.currentVessel.voyage}.json`);
  });

  // Export vessel XML
  document.getElementById('btnExportVesselXML').addEventListener('click', () => {
    if (!state.currentVessel) return;
    const vs = getVesselState(state.currentVessel);
    const data = { vessel: state.currentVessel, data: vs };
    downloadXML(objectToXML('VesselRecord', data), `${state.currentVessel.vessel}_${state.currentVessel.voyage}.xml`);
  });

  // Open PPR
  document.getElementById('btnOpenPPR').addEventListener('click', () => {
    if (!state.currentVessel) return;
    const key = getVesselKey(state.currentVessel);
    const url = `ppr.html?key=${encodeURIComponent(key)}&vessel=${encodeURIComponent(state.currentVessel.vessel)}&voyage=${encodeURIComponent(state.currentVessel.voyage)}&port=${encodeURIComponent(state.currentVessel.port)}`;
    window.open(url, '_blank');
  });

  // Export PPR JSON/XML
  document.getElementById('btnExportPPRJSON').addEventListener('click', () => {
    if (!state.currentVessel) return;
    const vs = getVesselState(state.currentVessel);
    if (!vs.ppr) { showToast('No PPR data yet.', 'danger'); return; }
    downloadJSON(vs.ppr, `PPR_${state.currentVessel.vessel}_${state.currentVessel.voyage}.json`);
  });

  document.getElementById('btnExportPPRXML').addEventListener('click', () => {
    if (!state.currentVessel) return;
    const vs = getVesselState(state.currentVessel);
    if (!vs.ppr) { showToast('No PPR data yet.', 'danger'); return; }
    downloadXML(objectToXML('PPRReport', vs.ppr), `PPR_${state.currentVessel.vessel}_${state.currentVessel.voyage}.xml`);
  });
}

window.openVesselModal = function(idx) {
  const vessel = state.filtered[idx];
  if (!vessel) return;
  state.currentVessel = vessel;
  const vs = getVesselState(vessel);

  // Header
  document.getElementById('modalVesselName').textContent = vessel.vessel;
  document.getElementById('modalVesselSub').textContent = `${vessel.voyage} · ${vessel.port.toUpperCase()}`;
  document.getElementById('infoPort').textContent = vessel.port.toUpperCase();
  document.getElementById('infoArrival').textContent = vessel.arrival || '-';
  document.getElementById('infoDeparture').textContent = vessel.departure || '-';
  document.getElementById('infoService').textContent = vessel.service || '-';
  document.getElementById('infoContact').textContent = vessel.contact || '-';

  // Memo
  document.getElementById('memoArea').value = vs.memo || '';

  // Operations
  document.getElementById('statDischarge').textContent = vs.operations.discharge || '-';
  document.getElementById('statLoad').textContent = vs.operations.load || '-';
  document.getElementById('statShifting').textContent = vs.operations.shifting || '-';
  document.getElementById('statTotal').textContent =
    (vs.operations.discharge + vs.operations.load + vs.operations.shifting) || '-';

  // Timings
  ['Berthing', 'DischargeStart', 'LoadStart', 'Sailing'].forEach(t => {
    const el = document.getElementById(`time${t}`);
    if (el) el.value = vs.timings[t] || '';
  });

  // File lists
  renderFileLists(vs.files);

  // PPR preview
  renderPPRPreview(vs.ppr);

  // Switch to overview tab
  switchDetailTab('overview');

  // Show modal
  new bootstrap.Modal(document.getElementById('vesselModal')).show();

  // Auto-save timings on change
  ['Berthing', 'DischargeStart', 'LoadStart', 'Sailing'].forEach(t => {
    const el = document.getElementById(`time${t}`);
    if (el) {
      el.onchange = () => {
        vs.timings[t] = el.value;
        saveLocalVesselData();
      };
    }
  });
};

// ---- Detail Tabs ----
function setupDetailTabs() {
  document.querySelectorAll('#detailTabs button').forEach(btn => {
    btn.addEventListener('click', () => switchDetailTab(btn.dataset.tab));
  });
}

function switchDetailTab(tabId) {
  document.querySelectorAll('#detailTabs button').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tabId);
  });
  document.querySelectorAll('.tab-content-panel').forEach(p => {
    p.classList.toggle('active', p.id === `tab-${tabId}`);
  });
}

// ---- File Upload (Local/Placeholder) ----
function setupFileUpload() {
  const fileConfigs = [
    { type: 'discharge', inputId: 'fileDischarge', dropId: 'dropDischarge' },
    { type: 'load',      inputId: 'fileLoad',      dropId: 'dropLoad' },
    { type: 'shifting',  inputId: 'fileShifting',  dropId: 'dropShifting' },
    { type: 'other',     inputId: 'fileOther',      dropId: 'dropOther' },
  ];

  fileConfigs.forEach(({ type, inputId, dropId }) => {
    const input = document.getElementById(inputId);
    const drop  = document.getElementById(dropId);

    input.addEventListener('change', () => handleFiles(type, input.files));

    drop.addEventListener('dragover', e => {
      e.preventDefault();
      drop.classList.add('drag-over');
    });
    drop.addEventListener('dragleave', () => drop.classList.remove('drag-over'));
    drop.addEventListener('drop', e => {
      e.preventDefault();
      drop.classList.remove('drag-over');
      handleFiles(type, e.dataTransfer.files);
    });
  });
}

function handleFiles(type, fileList) {
  if (!state.currentVessel || !fileList.length) return;
  const vs = getVesselState(state.currentVessel);

  Array.from(fileList).forEach(file => {
    // Check duplicate
    if (vs.files[type].find(f => f.name === file.name)) {
      showToast(`File "${file.name}" already exists.`, 'danger');
      return;
    }

    // Placeholder: store metadata only (actual upload needs Firebase Storage)
    vs.files[type].push({
      name: file.name,
      size: file.size,
      type: file.type,
      uploadedAt: new Date().toISOString(),
      status: 'local', // 'local' | 'uploaded'
      // url: '' // Firebase Storage URL will go here
    });

    showToast(`"${file.name}" added (Firebase Storage upload required for cloud storage).`, 'info');
  });

  saveLocalVesselData();
  renderFileLists(vs.files);
}

function renderFileLists(files) {
  const types = ['discharge', 'load', 'shifting', 'other'];
  types.forEach(type => {
    const el = document.getElementById(`${type}FileList`);
    if (!el) return;
    const list = files[type] || [];

    if (list.length === 0) {
      el.innerHTML = '';
      return;
    }

    el.innerHTML = list.map((f, i) => `
      <div class="file-item">
        <i class="bi ${fileIcon(f.name)} file-icon"></i>
        <div>
          <div class="file-name">${escHtml(f.name)}</div>
          <div class="file-size">${formatBytes(f.size)} · ${f.status === 'uploaded' ? '<span class="text-success">Cloud</span>' : '<span class="text-warning">Local</span>'}</div>
        </div>
        <div class="ms-auto d-flex gap-2">
          ${f.url ? `<a href="${f.url}" target="_blank" class="btn btn-xs btn-outline-primary btn-sm py-0">
            <i class="bi bi-download"></i>
          </a>` : ''}
          <button class="btn btn-sm btn-outline-danger py-0 px-2" onclick="removeFile('${type}', ${i})">
            <i class="bi bi-trash"></i>
          </button>
        </div>
      </div>`).join('');
  });
}

window.removeFile = function(type, idx) {
  if (!state.currentVessel) return;
  const vs = getVesselState(state.currentVessel);
  vs.files[type].splice(idx, 1);
  saveLocalVesselData();
  renderFileLists(vs.files);
  showToast('File removed.', 'info');
};

function fileIcon(name) {
  const ext = name.split('.').pop().toLowerCase();
  if (['xls', 'xlsx'].includes(ext)) return 'bi-file-earmark-excel text-success';
  if (ext === 'pdf') return 'bi-file-earmark-pdf text-danger';
  if (['doc', 'docx'].includes(ext)) return 'bi-file-earmark-word text-primary';
  if (ext === 'csv') return 'bi-file-earmark-spreadsheet';
  return 'bi-file-earmark';
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

// ---- PPR Preview ----
function renderPPRPreview(ppr) {
  const el = document.getElementById('pprPreview');
  if (!ppr) {
    el.innerHTML = `
      <div class="text-center text-muted py-5">
        <i class="bi bi-file-earmark-bar-graph fs-1 d-block mb-2"></i>
        No PPR data yet. Click "Edit Full PPR" to create one.
      </div>`;
    return;
  }

  el.innerHTML = `
    <div class="p-3">
      <div class="row g-2 mb-3">
        <div class="col-4"><span class="info-label">VESSEL</span><span class="info-value">${escHtml(ppr.header?.vesselName || '')}</span></div>
        <div class="col-4"><span class="info-label">VOYAGE</span><span class="info-value">${escHtml(ppr.header?.voyage || '')}</span></div>
        <div class="col-4"><span class="info-label">PIER</span><span class="info-value">${escHtml(ppr.header?.pier || '')}</span></div>
      </div>
      <div class="text-muted small">Full PPR data available. Click "Edit Full PPR" to view/edit details.</div>
    </div>`;
}

// ---- Import / Export ----
function setupImportExport() {
  // Export all JSON
  document.getElementById('btnExportJSON').addEventListener('click', () => {
    const data = {
      port: state.currentPort,
      exportedAt: new Date().toISOString(),
      vessels: state.schedules[state.currentPort] || [],
      vesselData: state.vesselData,
    };
    downloadJSON(data, `schedule_${state.currentPort}_${dateStr()}.json`);
  });

  // Export all XML
  document.getElementById('btnExportXML').addEventListener('click', () => {
    const data = {
      port: state.currentPort,
      exportedAt: new Date().toISOString(),
      vessels: state.schedules[state.currentPort] || [],
    };
    downloadXML(objectToXML('PortSchedule', data), `schedule_${state.currentPort}_${dateStr()}.xml`);
  });

  // Import
  document.getElementById('btnImportJSON').addEventListener('click', () => {
    const input = document.getElementById('importFileInput');
    input.accept = '.json';
    input.onchange = () => importJSON(input.files[0]);
    input.click();
  });

  document.getElementById('btnImportXML').addEventListener('click', () => {
    const input = document.getElementById('importFileInput');
    input.accept = '.xml';
    input.onchange = () => importXML(input.files[0]);
    input.click();
  });
}

function importJSON(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      if (data.vesselData) {
        Object.assign(state.vesselData, data.vesselData);
        saveLocalVesselData();
      }
      if (data.vessels && Array.isArray(data.vessels)) {
        const port = data.port || state.currentPort;
        // Merge - add only new vessels
        const existing = new Set(state.schedules[port].map(v => v.vessel + v.voyage));
        const newVessels = data.vessels.filter(v => !existing.has(v.vessel + v.voyage));
        state.schedules[port] = [...state.schedules[port], ...newVessels];
        const badge = document.getElementById(`badge-${port}`);
        if (badge) badge.textContent = state.schedules[port].length;
      }
      renderTable();
      showToast('JSON imported successfully.', 'success');
    } catch (err) {
      showToast('Failed to parse JSON: ' + err.message, 'danger');
    }
  };
  reader.readAsText(file);
}

function importXML(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const parser = new DOMParser();
      const xml = parser.parseFromString(e.target.result, 'application/xml');
      const parseErr = xml.querySelector('parsererror');
      if (parseErr) throw new Error('XML parse error');

      // Basic XML import - extract vessel elements
      const vessels = [];
      xml.querySelectorAll('vessel').forEach(v => {
        vessels.push({
          vessel:    v.querySelector('name')?.textContent || '',
          voyage:    v.querySelector('voyage')?.textContent || '',
          arrival:   v.querySelector('arrival')?.textContent || '',
          departure: v.querySelector('departure')?.textContent || '',
          service:   v.querySelector('service')?.textContent || '',
          contact:   v.querySelector('contact')?.textContent || '',
          port:      v.querySelector('port')?.textContent || state.currentPort,
          memo:      v.querySelector('memo')?.textContent || '',
        });
      });

      if (vessels.length > 0) {
        const port = xml.querySelector('port')?.textContent || state.currentPort;
        const existing = new Set(state.schedules[port].map(v => v.vessel + v.voyage));
        const newVessels = vessels.filter(v => !existing.has(v.vessel + v.voyage));
        state.schedules[port] = [...(state.schedules[port] || []), ...newVessels];
        renderTable();
        showToast(`XML imported: ${newVessels.length} new vessels added.`, 'success');
      } else {
        showToast('No vessel data found in XML.', 'info');
      }
    } catch (err) {
      showToast('Failed to parse XML: ' + err.message, 'danger');
    }
  };
  reader.readAsText(file);
}

// ---- Login (Firebase Auth) ----
function setupLogin() {
  // Watch auth state
  if (firebaseReady) {
    onAuthStateChanged(auth, user => {
      if (user) {
        applyLoggedIn(user);
      } else {
        applyLoggedOut();
      }
    });
  }

  document.getElementById('btnLogin').addEventListener('click', () => {
    if (state.currentUser) {
      // Logout
      if (firebaseReady) {
        signOut(auth).catch(e => console.warn('Signout error:', e));
      } else {
        applyLoggedOut();
      }
    } else {
      new bootstrap.Modal(document.getElementById('loginModal')).show();
    }
  });

  document.getElementById('btnDoLogin').addEventListener('click', async () => {
    const email = document.getElementById('loginEmail').value.trim();
    const pw    = document.getElementById('loginPassword').value;
    const errEl = document.getElementById('loginError');
    errEl.classList.add('d-none');

    if (!email || !pw) {
      errEl.textContent = 'Please enter email and password.';
      errEl.classList.remove('d-none');
      return;
    }

    const btn = document.getElementById('btnDoLogin');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Logging in...';

    try {
      if (firebaseReady) {
        await signInWithEmailAndPassword(auth, email, pw);
        // onAuthStateChanged will call applyLoggedIn
      } else {
        // Fallback local mode
        applyLoggedIn({ email, uid: 'local' });
      }
      bootstrap.Modal.getInstance(document.getElementById('loginModal')).hide();
    } catch (e) {
      errEl.textContent = firebaseErrorMsg(e.code);
      errEl.classList.remove('d-none');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="bi bi-box-arrow-in-right me-1"></i>Login';
    }
  });

  document.getElementById('loginPassword').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('btnDoLogin').click();
  });
}

function applyLoggedIn(user) {
  state.currentUser = user;
  state.isSuperuser = true;
  document.body.classList.add('is-superuser');
  const displayName = user.displayName || user.email?.split('@')[0] || 'User';
  document.getElementById('btnLogin').innerHTML =
    `<i class="bi bi-person-check-fill me-1"></i>${displayName}`;
  showToast(`Welcome, ${displayName}!`, 'success');
  // Load cloud data after login
  loadAllFromFirestore();
}

function applyLoggedOut() {
  state.currentUser = null;
  state.isSuperuser = false;
  document.body.classList.remove('is-superuser');
  document.getElementById('btnLogin').innerHTML = '<i class="bi bi-person-circle me-1"></i>Login';
  showToast('Logged out.', 'info');
}

function firebaseErrorMsg(code) {
  const map = {
    'auth/invalid-credential':    'Invalid email or password.',
    'auth/user-not-found':        'No account found with this email.',
    'auth/wrong-password':        'Incorrect password.',
    'auth/too-many-requests':     'Too many attempts. Try again later.',
    'auth/invalid-email':         'Invalid email format.',
    'auth/network-request-failed':'Network error. Check your connection.',
  };
  return map[code] || `Login failed (${code})`;
}

// ---- Utilities ----
function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function dateStr() {
  return new Date().toISOString().slice(0, 10);
}

function downloadJSON(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  downloadBlob(blob, filename);
}

function downloadXML(xmlStr, filename) {
  const blob = new Blob([xmlStr], { type: 'application/xml' });
  downloadBlob(blob, filename);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function objectToXML(rootTag, obj, indent = '') {
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<${rootTag}>\n`;

  function toXML(obj, ind) {
    let s = '';
    if (Array.isArray(obj)) {
      obj.forEach(item => {
        s += `${ind}<item>\n${toXML(item, ind + '  ')}${ind}</item>\n`;
      });
    } else if (obj !== null && typeof obj === 'object') {
      Object.entries(obj).forEach(([k, v]) => {
        const tag = k.replace(/[^a-zA-Z0-9_]/g, '_');
        if (Array.isArray(v)) {
          s += `${ind}<${tag}>\n${toXML(v, ind + '  ')}${ind}</${tag}>\n`;
        } else if (v !== null && typeof v === 'object') {
          s += `${ind}<${tag}>\n${toXML(v, ind + '  ')}${ind}</${tag}>\n`;
        } else {
          s += `${ind}<${tag}>${escXML(v)}</${tag}>\n`;
        }
      });
    } else {
      s += `${ind}${escXML(obj)}\n`;
    }
    return s;
  }

  xml += toXML(obj, '  ');
  xml += `</${rootTag}>`;
  return xml;
}

function escXML(val) {
  if (val == null) return '';
  return String(val)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function showToast(message, type = 'info') {
  const toast = document.getElementById('appToast');
  const msg = document.getElementById('toastMessage');
  toast.className = `toast align-items-center text-white border-0 bg-${type}`;
  msg.textContent = message;
  bootstrap.Toast.getOrCreateInstance(toast, { delay: 3000 }).show();
}

// ---- Start ----
init();
