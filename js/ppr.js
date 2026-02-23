// ============================================================
// PPR (Performance Report) - Form Logic
// ============================================================

import { db, firebaseReady } from './firebase-config.js';
import {
  doc, setDoc, getDoc, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// ---- URL Params ----
const params = new URLSearchParams(window.location.search);
const vesselKey  = params.get('key') || '';
const vesselName = params.get('vessel') || 'VESSEL';
const voyage     = params.get('voyage') || 'VOYAGE';
const portName   = params.get('port') || 'PORT';

// ---- State ----
const pprState = {
  key: vesselKey,
  header: {
    vesselName, voyage,
    pier: '', port: portName.toUpperCase(), nextPort: '', lashing: '',
    dischCommence: '', dischComplete: '', berthing: '',
    loadCommence: '', loadComplete: '', sailing: '',
    hatchCover: '', coneBox: '',
    bundle: '', breakBulk: '', remark: '',
  },
  discharge: {},   // { rowId: {cols} }
  load:      {},
  workRecord: [],  // Array of { crane, fromDt, toDt, moves }
  lostTime:  [],   // Array of { crane, from, to, remarks }
  mscSpecial: {},
  partnerSpecial: {},
  maerskSpecial: {},
  bundle: [],
  bbulk: [],
  specialCntr: {},
  remarks: '',
};

// ---- Operator Rows Definition ----
const DISCHARGE_ROWS = [
  { id: 'MSC',  label: 'MSC',  sub: 'LOCAL' },
  { id: 'MSC',  label: '',     sub: '→ T/S' },
  { id: 'MSC',  label: '',     sub: '← T/S' },
  { id: 'ZIM',  label: 'ZIM',  sub: 'LOCAL' },
  { id: 'ZIM',  label: '',     sub: '→ T/S' },
  { id: 'ZIM',  label: '',     sub: '← T/S' },
  { id: 'OP3',  label: 'OP3',  sub: 'LOCAL' },
  { id: 'OP3',  label: '',     sub: '→ T/S' },
  { id: 'OP3',  label: '',     sub: '← T/S' },
  { id: 'OP4',  label: 'OP4',  sub: 'LOCAL' },
  { id: 'OP4',  label: '',     sub: '→ T/S' },
  { id: 'OP4',  label: '',     sub: '← T/S' },
  { id: 'OP5',  label: 'OP5',  sub: 'LOCAL' },
  { id: 'OP5',  label: '',     sub: '→ T/S' },
  { id: 'OP5',  label: '',     sub: '← T/S' },
  { id: 'STOTAL', label: 'S / TOTAL', sub: '', special: 'subtotal' },
];

const LOAD_ROWS = [
  { id: 'MSC',  label: 'MSC',  sub: 'LOCAL' },
  { id: 'MSC',  label: '',     sub: '→ T/S' },
  { id: 'MSC',  label: '',     sub: '← T/S' },
  { id: 'ZIM',  label: 'ZIM',  sub: 'LOCAL' },
  { id: 'ZIM',  label: '',     sub: '→ T/S' },
  { id: 'ZIM',  label: '',     sub: '← T/S' },
  { id: 'OP3',  label: 'OP3',  sub: 'LOCAL' },
  { id: 'OP3',  label: '',     sub: '→ T/S' },
  { id: 'OP3',  label: '',     sub: '← T/S' },
  { id: 'OP4',  label: 'OP4',  sub: 'LOCAL' },
  { id: 'OP4',  label: '',     sub: '→ T/S' },
  { id: 'OP4',  label: '',     sub: '← T/S' },
  { id: 'OP5',  label: 'OP5',  sub: 'LOCAL' },
  { id: 'OP5',  label: '',     sub: '→ T/S' },
  { id: 'OP5',  label: '',     sub: '← T/S' },
  { id: 'STOTAL', label: 'S / TOTAL', sub: '', special: 'subtotal' },
  { id: 'SHIFT', label: 'MSC\nSHIFT', sub: '1TIME', special: 'shift' },
  { id: 'SHIFT', label: '', sub: '2TIME', special: 'shift2' },
  { id: 'GTOTAL', label: 'G / TOTAL', sub: '', special: 'gtotal' },
];

// Special container types
const SPECIAL_TYPES = ['OT', 'OT OOG', 'OT DG', 'FR', 'FR OOG', 'FR DG', 'RF', 'RF DG', 'TK', 'TK DG', 'DG'];
const SPECIAL_ACCOUNTS = [
  { id: 'LOCAL', label: 'LOCAL' },
  { id: 'IN_TS', label: '→ T/S' },
  { id: 'OUT_TS', label: '← T/S' },
  { id: 'TPF', label: 'TPF' },
];

const SPECIAL_CNTR_ROWS = [
  { id: 'LOCAL', label: 'LOCAL', sub: 'OT' },
  { id: 'LOCAL', label: '',      sub: 'FR/PF' },
  { id: 'LOCAL', label: '',      sub: 'RF' },
  { id: 'LOCAL', label: '',      sub: 'TK' },
  { id: 'LOCAL', label: '',      sub: 'D/G' },
  { id: 'LOCAL', label: '',      sub: "45'" },
  { id: 'IN_TS', label: '→ T/S', sub: 'OT' },
  { id: 'IN_TS', label: '',      sub: 'FR/PF' },
  { id: 'IN_TS', label: '',      sub: 'RF' },
  { id: 'IN_TS', label: '',      sub: 'TK' },
  { id: 'IN_TS', label: '',      sub: 'D/G' },
  { id: 'IN_TS', label: '',      sub: "45'" },
  { id: 'OUT_TS', label: '← T/S', sub: 'OT' },
  { id: 'OUT_TS', label: '',     sub: 'FR/PF' },
  { id: 'OUT_TS', label: '',     sub: 'RF' },
  { id: 'OUT_TS', label: '',     sub: 'TK' },
  { id: 'OUT_TS', label: '',     sub: 'D/G' },
  { id: 'OUT_TS', label: '',     sub: "45'" },
  { id: 'SHIFT', label: 'SHIFT', sub: 'OT' },
  { id: 'SHIFT', label: '',      sub: 'FR/PF' },
  { id: 'SHIFT', label: '',      sub: 'RF' },
  { id: 'SHIFT', label: '',      sub: 'TK' },
  { id: 'SHIFT', label: '',      sub: 'D/G' },
  { id: 'SHIFT', label: '',      sub: "45'" },
];

// ---- COLS Enum (for 24-col container table) ----
// BOX OPR: FULL 20,40,HC,45 | EMPTY 20,40,HC,45 = 8
// PARTNER: FULL 20,40,HC,45 | EMPTY 20,40,HC,45 = 8
// TOTAL:   FULL 20,40,HC,45 | EMPTY 20,40,HC,45 = 8

function colKey(boxIdx) {
  const sections = ['bf20','bf40','bfhc','bf45','be20','be40','behc','be45',
                    'pf20','pf40','pfhc','pf45','pe20','pe40','pehc','pe45'];
  return sections[boxIdx] || `col${boxIdx}`;
}

// ---- Init ----
function init() {
  document.getElementById('pprVesselBadge').textContent = `${vesselName} · ${voyage}`;
  document.title = `PPR - ${vesselName} ${voyage}`;

  loadPPRData();
  buildHeader();
  buildContainerTable('dischBody', DISCHARGE_ROWS, 'discharge');
  buildContainerTable('loadBody',  LOAD_ROWS,      'load');
  buildWorkRecord();
  buildSpecialTable('mscSpecialBody',     SPECIAL_ACCOUNTS.slice(0,3), 16);
  buildSpecialTable('partnerSpecialBody', SPECIAL_ACCOUNTS.slice(0,3), 16);
  buildSpecialTable('maerskSpecialBody',  [{id:'LOCAL',label:'LOCAL'},{id:'TS',label:'T/S'}], 16);
  buildSpecialCntrTable();
  addInitialLostTimeRow();
  setupTabs();
  setupButtons();
  populateHeader();
}

// ---- Load Saved Data ----
function loadPPRData() {
  try {
    // First load from localStorage (fast, offline)
    const key = `ppr_${vesselKey}`;
    const saved = localStorage.getItem(key);
    if (saved) {
      const parsed = JSON.parse(saved);
      Object.assign(pprState, parsed);
    }
    // Then try to refresh from Firestore (async, will re-render if newer data found)
    loadPPRFromFirestore();
  } catch (e) {}
}

function savePPRData() {
  try {
    // Local cache
    const key = `ppr_${vesselKey}`;
    localStorage.setItem(key, JSON.stringify(pprState));

    // Sync to main app local cache
    const mainData = JSON.parse(localStorage.getItem('msc_vessel_data') || '{}');
    if (!mainData[vesselKey]) mainData[vesselKey] = {};
    mainData[vesselKey].ppr = buildPPRObject();
    localStorage.setItem('msc_vessel_data', JSON.stringify(mainData));

    // Firestore
    savePPRToFirestore();
  } catch (e) {
    console.warn('Save error:', e);
  }
}

async function savePPRToFirestore() {
  if (!firebaseReady || !vesselKey) return;
  try {
    const ref = doc(db, 'vessels', vesselKey);
    await setDoc(ref, {
      ppr: buildPPRObject(),
      updatedAt: serverTimestamp(),
    }, { merge: true });
    console.log('[Firestore] PPR saved:', vesselKey);
  } catch (e) {
    console.warn('[Firestore] PPR save failed:', e.message);
  }
}

async function loadPPRFromFirestore() {
  if (!firebaseReady || !vesselKey) return;
  try {
    const ref  = doc(db, 'vessels', vesselKey);
    const snap = await getDoc(ref);
    if (snap.exists() && snap.data().ppr) {
      const cloud = snap.data().ppr;
      // Merge cloud data into pprState (cloud takes priority)
      if (cloud.header)     Object.assign(pprState.header, cloud.header);
      if (cloud.discharge)  pprState.discharge  = cloud.discharge;
      if (cloud.load)       pprState.load       = cloud.load;
      if (cloud.workRecord) pprState.workRecord = cloud.workRecord;
      if (cloud.lostTime)   pprState.lostTime   = cloud.lostTime;
      if (cloud.specialCntr) pprState.specialCntr = cloud.specialCntr;
      // Re-render
      populateHeader();
      buildWorkRecord();
      buildSpecialCntrTable();
      addInitialLostTimeRow();
      showPPRToast('Loaded from cloud.', 'info');
    }
  } catch (e) {
    console.warn('[Firestore] PPR load failed:', e.message);
  }
}

// ---- Header ----
function buildHeader() {
  const fields = ['vesselName','voyage','pier','port','nextPort','lashing',
    'hatchCover','coneBox','bundle','breakBulk','remark','remarks',
    'dischCommence','dischComplete','berthing','loadCommence','loadComplete','sailing'];

  fields.forEach(f => {
    const el = document.getElementById(`f_${f}`);
    if (el) {
      el.addEventListener('change', () => {
        pprState.header[f] = el.value;
      });
    }
  });
}

function populateHeader() {
  const h = pprState.header;
  const fields = ['vesselName','voyage','pier','port','nextPort','lashing',
    'hatchCover','coneBox','bundle','breakBulk','remark',
    'dischCommence','dischComplete','berthing','loadCommence','loadComplete','sailing'];

  fields.forEach(f => {
    const el = document.getElementById(`f_${f}`);
    if (el && h[f] !== undefined) el.value = h[f];
  });

  const remarkEl = document.getElementById('f_remarks');
  if (remarkEl && h.remarks) remarkEl.value = h.remarks;
}

// ---- Container Table ----
function buildContainerTable(tbodyId, rows, dataKey) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;

  const data = pprState[dataKey] || {};
  tbody.innerHTML = '';

  rows.forEach((row, ri) => {
    const tr = document.createElement('tr');
    const rowId = `${dataKey}_${row.id}_${row.sub}_${ri}`;

    if (row.special === 'subtotal') {
      tr.className = 'subtotal-row';
      tr.innerHTML = `<td class="subtotal-cell" colspan="2">S / TOTAL</td>${numCells(24, null, true)}`;
      tbody.appendChild(tr);
      updateSubtotals(dataKey, rows, tbody);
      return;
    }
    if (row.special === 'gtotal') {
      tr.className = 'gtotal-row';
      tr.innerHTML = `<td class="gtotal-cell" colspan="2">G / TOTAL</td>${numCells(24, null, 'gtotal')}`;
      tbody.appendChild(tr);
      return;
    }

    const statusCell = row.label
      ? `<td class="status-cell" ${countRows(rows, row.id) > 1 ? `rowspan="${countRows(rows, row.id)}"` : ''} style="vertical-align:middle">${row.label}</td>`
      : '';

    const isShift2 = row.special === 'shift2';
    const rowStyle = row.special === 'shift' || row.special === 'shift2' ? ' class="shift-cell"' : '';

    tr.innerHTML = `${statusCell}<td class="status-cell"${rowStyle}>${row.sub}</td>` +
      Array.from({length: 16}, (_, ci) => {
        const key = `${rowId}_${ci}`;
        const val = data[key] !== undefined ? data[key] : '';
        const cls = isShift2 ? 'ppr-num shift-cell' : 'ppr-num';
        return `<td><input type="number" class="${cls}" data-key="${key}" data-section="${dataKey}" value="${val}" min="0" placeholder=""></td>`;
      }).join('') +
      Array.from({length: 8}, (_, ci) => {
        const autoVal = ci < 4
          ? `<td class="ppr-num readonly" data-total-row="${rowId}" data-total-ci="${ci}"></td>`
          : `<td class="ppr-num readonly" data-total-row="${rowId}" data-total-ci="${ci}"></td>`;
        return `<td style="background:#f0f7ff;text-align:center;font-weight:600;font-size:0.7rem" id="total_${rowId}_${ci}">-</td>`;
      }).join('');

    tbody.appendChild(tr);
  });

  // Attach input listeners
  tbody.querySelectorAll('.ppr-num:not(.readonly)').forEach(input => {
    input.addEventListener('input', () => {
      const key = input.dataset.key;
      const val = parseInt(input.value) || 0;
      if (!pprState[dataKey]) pprState[dataKey] = {};
      pprState[dataKey][key] = val;
      updateRowTotals(tbody, rows, dataKey);
    });
    // Restore value
    const key = input.dataset.key;
    if (pprState[dataKey]?.[key] !== undefined) {
      input.value = pprState[dataKey][key] || '';
    }
  });

  updateRowTotals(tbody, rows, dataKey);
}

function countRows(rows, id) {
  return rows.filter(r => r.id === id && r.special !== 'subtotal' && r.special !== 'gtotal').length;
}

function numCells(n, val, style) {
  return Array.from({length: n}, () => {
    const cls = style === true ? 'subtotal-cell' : style === 'gtotal' ? 'gtotal-cell' : '';
    return `<td class="${cls}" style="text-align:center;font-weight:700">${val !== null ? (val || '') : ''}</td>`;
  }).join('');
}

function updateRowTotals(tbody, rows, dataKey) {
  const data = pprState[dataKey] || {};
  const inputs = tbody.querySelectorAll('.ppr-num:not(.readonly)');

  // Recalculate row totals (TOTAL = BOX OPR + PARTNER)
  inputs.forEach(input => {
    const key = input.dataset.key;
    const parts = key.split('_');
    const ri = parseInt(parts[parts.length - 2]);  // Not reliable - use DOM
  });

  // For each data row, compute totals
  const dataRows = tbody.querySelectorAll('tr:not(.subtotal-row):not(.gtotal-row)');
  dataRows.forEach(tr => {
    const cells = tr.querySelectorAll('input.ppr-num:not(.readonly)');
    if (cells.length !== 16) return;

    const vals = Array.from(cells).map(c => parseInt(c.value) || 0);
    // BOX OPR FULL: 0-3, BOX OPR EMPTY: 4-7
    // PARTNER FULL: 8-11, PARTNER EMPTY: 12-15
    // TOTAL FULL = BOX FULL + PARTNER FULL, TOTAL EMPTY = BOX EMPTY + PARTNER EMPTY

    const totalCells = tr.querySelectorAll('td[id^="total_"]');
    if (totalCells.length !== 8) return;

    for (let i = 0; i < 4; i++) {
      totalCells[i].textContent = (vals[i] + vals[i + 8]) || '';
    }
    for (let i = 0; i < 4; i++) {
      totalCells[i + 4].textContent = (vals[i + 4] + vals[i + 12]) || '';
    }
  });
}

// ---- Special Container Tables (16-col: inbound full/empty + outbound full/empty) ----
function buildSpecialTable(tbodyId, accounts, cols) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  tbody.innerHTML = '';

  accounts.forEach((acct, ai) => {
    SPECIAL_TYPES.forEach((type, ti) => {
      const tr = document.createElement('tr');
      const rowId = `${tbodyId}_${acct.id}_${ti}`;

      let statusCell = '';
      if (ti === 0) {
        statusCell = `<td class="status-cell" rowspan="${SPECIAL_TYPES.length}">${acct.label}</td>`;
      }

      tr.innerHTML = statusCell + `<td class="status-cell">${type}</td>` +
        Array.from({length: 16}, (_, ci) => {
          const key = `${rowId}_${ci}`;
          const stored = pprState[tbodyId]?.[key];
          return `<td><input type="number" class="ppr-num" data-stkey="${key}" data-stbody="${tbodyId}" value="${stored || ''}" min="0"></td>`;
        }).join('');

      tbody.appendChild(tr);
    });
  });

  tbody.querySelectorAll('.ppr-num').forEach(input => {
    input.addEventListener('input', () => {
      const key = input.dataset.stkey;
      const bodyId = input.dataset.stbody;
      if (!pprState[bodyId]) pprState[bodyId] = {};
      pprState[bodyId][key] = parseInt(input.value) || 0;
    });
  });
}

// ---- Special Container Summary Table ----
function buildSpecialCntrTable() {
  const tbody = document.getElementById('specialCntrBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  SPECIAL_CNTR_ROWS.forEach((row, ri) => {
    const tr = document.createElement('tr');

    let statusCell = '';
    if (row.label) {
      const count = SPECIAL_CNTR_ROWS.filter(r => r.id === row.id).length;
      statusCell = `<td class="status-cell" rowspan="${count}">${row.label}</td>`;
    }

    tr.innerHTML = statusCell + `<td class="status-cell">${row.sub}</td>` +
      Array.from({length: 18}, (_, ci) => {
        const key = `sp_${row.id}_${row.sub}_${ci}`;
        const stored = pprState.specialCntr?.[key];
        return `<td><input type="number" class="ppr-num" data-spkey="${key}" value="${stored || ''}" min="0"></td>`;
      }).join('');

    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('.ppr-num').forEach(input => {
    input.addEventListener('input', () => {
      if (!pprState.specialCntr) pprState.specialCntr = {};
      pprState.specialCntr[input.dataset.spkey] = parseInt(input.value) || 0;
    });
  });
}

// ---- Work Record ----
function buildWorkRecord() {
  const tbody = document.getElementById('workRecordBody');
  if (!tbody) return;

  const saved = pprState.workRecord || [];
  const count = Math.max(8, saved.length);

  tbody.innerHTML = '';
  for (let i = 0; i < count; i++) {
    addWorkRecordRow(saved[i]);
  }

  updateWorkRecordTotals();
}

function addWorkRecordRow(data = {}) {
  const tbody = document.getElementById('workRecordBody');
  const i = tbody.rows.length;
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input type="text" class="ppr-crane wr-crane" placeholder="C${i+1}" value="${data.crane || ''}"></td>
    <td><input type="datetime-local" class="ppr-dt wr-from" value="${data.from || ''}"></td>
    <td><input type="datetime-local" class="ppr-dt wr-to"   value="${data.to || ''}"></td>
    <td class="text-center" id="wr_ghrs_${i}">-</td>
    <td class="text-center" id="wr_gmin_${i}">-</td>
    <td><input type="number" class="ppr-text-sm wr-lhrs" value="${data.lostHrs || ''}" min="0" placeholder="hrs"></td>
    <td><input type="number" class="ppr-text-sm wr-lmin" value="${data.lostMin || ''}" min="0" max="59" placeholder="min"></td>
    <td class="text-center" id="wr_nhrs_${i}">-</td>
    <td class="text-center" id="wr_nmin_${i}">-</td>
    <td><input type="number" class="ppr-text-sm wr-moves" value="${data.moves || ''}" min="0" placeholder="moves"></td>
  `;
  tbody.appendChild(tr);

  // Listen for changes
  tr.querySelectorAll('input').forEach(inp => {
    inp.addEventListener('change', () => {
      updateWorkRecordTotals();
      saveWorkRecord();
    });
  });

  updateRowWR(tr, i);
}

function updateRowWR(tr, i) {
  const from = tr.querySelector('.wr-from')?.value;
  const to   = tr.querySelector('.wr-to')?.value;

  if (from && to) {
    const diff = (new Date(to) - new Date(from)) / 60000; // minutes
    if (diff > 0) {
      const grossHrs = Math.floor(diff / 60);
      const grossMin = Math.round(diff % 60);
      const lostHrs  = parseInt(tr.querySelector('.wr-lhrs')?.value) || 0;
      const lostMin  = parseInt(tr.querySelector('.wr-lmin')?.value) || 0;
      const lostTotal = lostHrs * 60 + lostMin;
      const netTotal  = diff - lostTotal;
      const netHrs    = Math.floor(netTotal / 60);
      const netMin    = Math.round(netTotal % 60);

      const ghrs = document.getElementById(`wr_ghrs_${i}`);
      const gmin = document.getElementById(`wr_gmin_${i}`);
      const nhrs = document.getElementById(`wr_nhrs_${i}`);
      const nmin = document.getElementById(`wr_nmin_${i}`);

      if (ghrs) ghrs.textContent = grossHrs;
      if (gmin) gmin.textContent = grossMin;
      if (nhrs) nhrs.textContent = netHrs >= 0 ? netHrs : 0;
      if (nmin) nmin.textContent = netMin >= 0 ? netMin : 0;
    }
  }
}

function updateWorkRecordTotals() {
  const tbody = document.getElementById('workRecordBody');
  const rows = tbody.rows;
  let totalMoves = 0, totalGross = 0, totalLost = 0, totalNet = 0;

  Array.from(rows).forEach((tr, i) => {
    const from = tr.querySelector('.wr-from')?.value;
    const to   = tr.querySelector('.wr-to')?.value;
    const lhrs = parseInt(tr.querySelector('.wr-lhrs')?.value) || 0;
    const lmin = parseInt(tr.querySelector('.wr-lmin')?.value) || 0;
    const moves = parseInt(tr.querySelector('.wr-moves')?.value) || 0;

    updateRowWR(tr, i);

    if (from && to) {
      const diff = (new Date(to) - new Date(from)) / 60000;
      if (diff > 0) {
        totalGross += diff;
        totalLost  += lhrs * 60 + lmin;
        totalNet   += Math.max(0, diff - (lhrs * 60 + lmin));
      }
    }
    totalMoves += moves;
  });

  const setCell = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val || '';
  };

  setCell('wr_grossHrs', Math.floor(totalGross / 60));
  setCell('wr_grossMin', Math.round(totalGross % 60));
  setCell('wr_lostHrs',  Math.floor(totalLost / 60));
  setCell('wr_lostMin',  Math.round(totalLost % 60));
  setCell('wr_netHrs',   Math.floor(totalNet / 60));
  setCell('wr_netMin',   Math.round(totalNet % 60));
  setCell('wr_moves',    totalMoves || '');

  // Productivity
  if (totalGross > 0 && totalMoves > 0) {
    const grossProd = (totalMoves / (totalGross / 60)).toFixed(1);
    const gross = document.getElementById('f_grossProductivity');
    if (gross) gross.value = grossProd;
  }
  if (totalNet > 0 && totalMoves > 0) {
    const netProd = (totalMoves / (totalNet / 60)).toFixed(1);
    const net = document.getElementById('f_netProductivity');
    if (net) net.value = netProd;
  }
}

function saveWorkRecord() {
  const tbody = document.getElementById('workRecordBody');
  pprState.workRecord = Array.from(tbody.rows).map(tr => ({
    crane: tr.querySelector('.wr-crane')?.value || '',
    from:  tr.querySelector('.wr-from')?.value || '',
    to:    tr.querySelector('.wr-to')?.value || '',
    lostHrs: tr.querySelector('.wr-lhrs')?.value || '',
    lostMin: tr.querySelector('.wr-lmin')?.value || '',
    moves:   tr.querySelector('.wr-moves')?.value || '',
  }));
}

// ---- Lost Time ----
function addInitialLostTimeRow() {
  const saved = pprState.lostTime || [];
  if (saved.length > 0) {
    saved.forEach(d => addLostTimeRow(d));
  } else {
    addLostTimeRow();
  }
}

document.getElementById('btnAddLostTime')?.addEventListener('click', () => addLostTimeRow());

window.addLostTimeRow = function(data = {}) {
  addLostTimeRow(data);
};

function addLostTimeRow(data = {}) {
  const tbody = document.getElementById('lostTimeBody');
  const tr = document.createElement('tr');
  const i = tbody.rows.length;
  tr.innerHTML = `
    <td><input type="text" class="ppr-crane lt-crane" placeholder="C1" value="${data.crane || ''}"></td>
    <td><input type="datetime-local" class="lt-time lt-from" value="${data.from || ''}"></td>
    <td><input type="datetime-local" class="lt-time lt-to"   value="${data.to   || ''}"></td>
    <td class="text-center" id="lt_dur_${i}">-</td>
    <td><input type="text" class="ppr-remark lt-remark" placeholder="Reason..." value="${data.remarks || ''}"></td>
    <td>
      <button class="btn btn-xs btn-outline-danger btn-sm py-0 px-1" onclick="this.closest('tr').remove(); updateLTTotals()">
        <i class="bi bi-x"></i>
      </button>
    </td>
  `;
  tbody.appendChild(tr);

  tr.querySelectorAll('.lt-from, .lt-to').forEach(inp => {
    inp.addEventListener('change', () => updateLTTotals());
  });

  updateLTTotals();
}

window.updateLTTotals = function() {
  const tbody = document.getElementById('lostTimeBody');
  let totalMin = 0;

  Array.from(tbody.rows).forEach((tr, i) => {
    const from = tr.querySelector('.lt-from')?.value;
    const to   = tr.querySelector('.lt-to')?.value;
    const durEl = document.getElementById(`lt_dur_${i}`);

    if (from && to) {
      const diff = Math.round((new Date(to) - new Date(from)) / 60000);
      if (diff > 0) {
        totalMin += diff;
        const hrs = Math.floor(diff / 60);
        const min = diff % 60;
        if (durEl) durEl.textContent = hrs > 0 ? `${hrs}h ${min}m` : `${min}m`;
      }
    } else {
      if (durEl) durEl.textContent = '-';
    }
  });

  const totEl = document.getElementById('lt_total');
  if (totEl) {
    const hrs = Math.floor(totalMin / 60);
    const min = totalMin % 60;
    totEl.textContent = totalMin > 0 ? (hrs > 0 ? `${hrs}h ${min}m` : `${min}m`) : '-';
  }

  // Save to state
  pprState.lostTime = Array.from(tbody.rows).map(tr => ({
    crane:   tr.querySelector('.lt-crane')?.value || '',
    from:    tr.querySelector('.lt-from')?.value || '',
    to:      tr.querySelector('.lt-to')?.value || '',
    remarks: tr.querySelector('.lt-remark')?.value || '',
  }));
};

// ---- Bundle / Break Bulk rows ----
window.addBundleRow = function() {
  const tbody = document.getElementById('bundleBody');
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><select class="ppr-input" style="width:80px"><option>INBOUND</option><option>OUTBOUND</option></select></td>
    <td><input type="text" class="ppr-input" placeholder="Type"></td>
    <td><input type="number" class="ppr-input" min="0"></td>
    <td><input type="number" class="ppr-input" min="0"></td>
    <td><input type="text" class="ppr-input" style="width:100px"></td>
  `;
  tbody.appendChild(tr);
};

window.addBBulkRow = function() {
  const tbody = document.getElementById('bbulkBody');
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><select class="ppr-input" style="width:80px"><option>INBOUND</option><option>OUTBOUND</option></select></td>
    <td><input type="text" class="ppr-input" placeholder="POL"></td>
    <td><input type="number" class="ppr-input" step="0.1" min="0"></td>
    <td><input type="text" class="ppr-input"></td>
    <td><input type="number" class="ppr-input" min="0"></td>
    <td><input type="text" class="ppr-input"></td>
  `;
  tbody.appendChild(tr);
};

// ---- Tabs ----
function setupTabs() {
  document.querySelectorAll('[data-ppr-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-ppr-tab]').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.ppr-tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`ppr-tab-${btn.dataset.pprTab}`)?.classList.add('active');
    });
  });
}

// ---- Buttons ----
function setupButtons() {
  document.getElementById('btnSavePPR')?.addEventListener('click', () => {
    collectAllData();
    savePPRData();
    showPPRToast('PPR saved!', 'success');
  });

  document.getElementById('btnExportPPRJSON')?.addEventListener('click', () => {
    collectAllData();
    downloadJSON(buildPPRObject(), `PPR_${vesselName}_${voyage}.json`);
  });

  document.getElementById('btnExportPPRXML')?.addEventListener('click', () => {
    collectAllData();
    downloadXML(objectToXML('PPRReport', buildPPRObject()), `PPR_${vesselName}_${voyage}.xml`);
  });

  document.getElementById('btnImportPPR')?.addEventListener('click', () => {
    const input = document.getElementById('pprImportInput');
    input.onchange = () => importPPR(input.files[0]);
    input.click();
  });
}

function collectAllData() {
  // Header
  const fields = ['vesselName','voyage','pier','port','nextPort','lashing',
    'hatchCover','coneBox','bundle','breakBulk','remark',
    'dischCommence','dischComplete','berthing','loadCommence','loadComplete','sailing'];
  fields.forEach(f => {
    const el = document.getElementById(`f_${f}`);
    if (el) pprState.header[f] = el.value;
  });
  const remarkEl = document.getElementById('f_remarks');
  if (remarkEl) pprState.header.remarks = remarkEl.value;

  saveWorkRecord();
  updateLTTotals();
}

function buildPPRObject() {
  return {
    generatedAt: new Date().toISOString(),
    header: pprState.header,
    discharge: pprState.discharge,
    load: pprState.load,
    workRecord: pprState.workRecord,
    lostTime: pprState.lostTime,
    mscSpecial: pprState.mscSpecialBody,
    partnerSpecial: pprState.partnerSpecialBody,
    maerskSpecial: pprState.maerskSpecialBody,
    bundle: pprState.bundle,
    bbulk: pprState.bbulk,
    specialCntr: pprState.specialCntr,
  };
}

function importPPR(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      let data;
      if (file.name.endsWith('.json')) {
        data = JSON.parse(e.target.result);
      } else if (file.name.endsWith('.xml')) {
        showPPRToast('XML import coming soon. Please use JSON format.', 'info');
        return;
      }

      if (data.header) Object.assign(pprState.header, data.header);
      if (data.discharge) pprState.discharge = data.discharge;
      if (data.load) pprState.load = data.load;
      if (data.workRecord) pprState.workRecord = data.workRecord;
      if (data.lostTime) pprState.lostTime = data.lostTime;
      if (data.specialCntr) pprState.specialCntr = data.specialCntr;

      savePPRData();
      location.reload();
    } catch (err) {
      showPPRToast('Import failed: ' + err.message, 'danger');
    }
  };
  reader.readAsText(file);
}

// ---- Utils ----
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

function objectToXML(rootTag, obj) {
  function toXML(obj, ind) {
    let s = '';
    if (Array.isArray(obj)) {
      obj.forEach(item => { s += `${ind}<item>\n${toXML(item, ind + '  ')}${ind}</item>\n`; });
    } else if (obj !== null && typeof obj === 'object') {
      Object.entries(obj).forEach(([k, v]) => {
        const tag = k.replace(/[^a-zA-Z0-9_]/g, '_');
        if (typeof v === 'object' && v !== null) {
          s += `${ind}<${tag}>\n${toXML(v, ind + '  ')}${ind}</${tag}>\n`;
        } else {
          s += `${ind}<${tag}>${escXML(v)}</${tag}>\n`;
        }
      });
    }
    return s;
  }
  function escXML(v) {
    return String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<${rootTag}>\n${toXML(obj, '  ')}</${rootTag}>`;
}

function showPPRToast(msg, type = 'info') {
  const toast = document.getElementById('pprToast');
  const msgEl = document.getElementById('pprToastMsg');
  toast.className = `toast align-items-center text-white border-0 bg-${type}`;
  msgEl.textContent = msg;
  bootstrap.Toast.getOrCreateInstance(toast, { delay: 3000 }).show();
}

// ---- Start ----
init();
