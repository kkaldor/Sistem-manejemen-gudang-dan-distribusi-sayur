// app.js - storage utilities & shared logic

const STORAGE_KEY = 'warehouse_dashboard_v1';

const STATUS_ORDER = ['dipesan', 'diterima', 'diproses', 'dikirim', 'selesai'];
const STATUS_LABEL = {
  dipesan: 'Dipesan',
  diterima: 'Diterima',
  diproses: 'Diproses',
  dikirim: 'Dikirim',
  selesai: 'Selesai'
};

function uid(prefix = 'id') {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

function todayISO() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatIDR(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return '-';
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(num);
}

function safeNumber(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return {
      produk: [],
      transaksiStok: [],
      pemasok: [],
      distribusi: []
    };
  }
  try {
    const parsed = JSON.parse(raw);
    return {
      produk: parsed.produk || [],
      transaksiStok: parsed.transaksiStok || [],
      pemasok: parsed.pemasok || [],
      distribusi: parsed.distribusi || []
    };
  } catch {
    return { produk: [], transaksiStok: [], pemasok: [], distribusi: [] };
  }
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function clearAllData() {
  localStorage.removeItem(STORAGE_KEY);
}

function computeStockByProduk(state) {
  // stok saat ini = stokAwal + sum(masuk) - sum(keluar)
  const map = new Map();
  for (const p of state.produk) {
    map.set(p.id, safeNumber(p.stokAwal, 0));
  }
  for (const t of state.transaksiStok) {
    const curr = map.get(t.produkId) ?? 0;
    const delta = t.jenis === 'masuk' ? t.jumlah : -t.jumlah;
    map.set(t.produkId, curr + delta);
  }
  return map;
}

function computeStockTimeline(state, daysBack = 30) {
  // agregasi per hari (masuk/keluar) untuk chart tren
  const byDate = new Map();
  const start = new Date();
  start.setDate(start.getDate() - (daysBack - 1));
  for (let i = 0; i < daysBack; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const iso = d.toISOString().slice(0, 10);
    byDate.set(iso, { masuk: 0, keluar: 0 });
  }
  for (const tr of state.transaksiStok) {
    if (!tr.tanggal) continue;
    const iso = String(tr.tanggal).slice(0, 10);
    if (!byDate.has(iso)) continue;
    if (tr.jenis === 'masuk') byDate.get(iso).masuk += tr.jumlah;
    else byDate.get(iso).keluar += tr.jumlah;
  }
  const labels = [...byDate.keys()];
  const masuk = labels.map((k) => byDate.get(k).masuk);
  const keluar = labels.map((k) => byDate.get(k).keluar);
  return { labels, masuk, keluar };
}

function countDistribusiByStatus(state) {
  const counts = Object.fromEntries(STATUS_ORDER.map((s) => [s, 0]));
  for (const d of state.distribusi) {
    if (!counts[d.status]) counts[d.status] = 0;
    counts[d.status] += 1;
  }
  return counts;
}

function distStepNext(status) {
  const idx = STATUS_ORDER.indexOf(status);
  if (idx < 0) return status;
  return STATUS_ORDER[Math.min(STATUS_ORDER.length - 1, idx + 1)];
}

function getProdukById(state, id) {
  return state.produk.find((p) => p.id === id);
}

function getPemasokById(state, id) {
  return state.pemasok.find((p) => p.id === id);
}

function exportStateToFile(filename = 'warehouse-dashboard-data.json') {
  const state = loadState();
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function importStateFromFile(file) {
  const text = await file.text();
  const parsed = JSON.parse(text);
  const next = {
    produk: parsed.produk || [],
    transaksiStok: parsed.transaksiStok || [],
    pemasok: parsed.pemasok || [],
    distribusi: parsed.distribusi || []
  };
  saveState(next);
  return next;
}

function formatTanggalTargetVsHariIni(targetISO) {
  if (!targetISO) return { daysDiff: null, label: '-' };
  const target = new Date(targetISO);
  const now = new Date();
  const diffMs = target.getTime() - new Date(now.toISOString().slice(0, 10)).getTime();
  const days = Math.round(diffMs / (1000 * 60 * 60 * 24));
  // days < 0 => terlambat
  const label = days < 0 ? `${Math.abs(days)} hari terlambat` : days === 0 ? 'H-0 (hari ini)' : `${days} hari lagi`;
  return { daysDiff: days, label };
}

  function csvEscape(value) {
    if (value === null || value === undefined) return '';
    const s = String(value);
    // escape " and wrap if contains special chars
    if (/[",\r\n]/.test(s)) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  function buildCSVSection(title, headers, rows) {
    const lines = [];
    lines.push(csvEscape(title));
    lines.push(headers.map(csvEscape).join(','));
    for (const row of rows) {
      lines.push(headers.map((h) => csvEscape(row[h])).join(','));
    }
    return lines.join('\r\n');
  }

  function exportAllDataToCSV(filename = 'warehouse-dashboard-operasional-data.csv') {
    const state = loadState();

    const produkHeaders = ['id', 'nama', 'satuan', 'hargaEstimasi', 'stokAwal'];
    const produkRows = (state.produk || []).map((p) => ({
      id: p.id,
      nama: p.nama,
      satuan: p.satuan || '',
      hargaEstimasi: p.hargaEstimasi,
      stokAwal: p.stokAwal
    }));

    const transaksiHeaders = ['id', 'produkId', 'jenis', 'jumlah', 'tanggal', 'catatan'];
    const transaksiRows = (state.transaksiStok || []).map((t) => ({
      id: t.id,
      produkId: t.produkId,
      jenis: t.jenis,
      jumlah: t.jumlah,
      tanggal: t.tanggal,
      catatan: t.catatan || ''
    }));

    const pemasokHeaders = ['id', 'nama', 'kontak', 'alamat'];
    const pemasokRows = (state.pemasok || []).map((s) => ({
      id: s.id,
      nama: s.nama,
      kontak: s.kontak || '',
      alamat: s.alamat || ''
    }));

    const distribusiHeaders = ['id', 'pemasokId', 'produkId', 'jumlah', 'status', 'tanggalDipesan', 'tanggalTarget', 'catatan'];
    const distribusiRows = (state.distribusi || []).map((d) => ({
      id: d.id,
      pemasokId: d.pemasokId,
      produkId: d.produkId,
      jumlah: d.jumlah,
      status: d.status,
      tanggalDipesan: d.tanggalDipesan,
      tanggalTarget: d.tanggalTarget,
      catatan: d.catatan || ''
    }));

    // 1 file, 4 section (dipisah blank line)
    const sections = [
      buildCSVSection('SECTION: PRODUK', produkHeaders, produkRows),
      buildCSVSection('SECTION: TRANSAKSI_STOK', transaksiHeaders, transaksiRows),
      buildCSVSection('SECTION: PEMASOK', pemasokHeaders, pemasokRows),
      buildCSVSection('SECTION: DISTRIBUSI', distribusiHeaders, distribusiRows)
    ];

    const csvText = sections.join('\r\n\r\n');

    const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // Expose for other scripts
  window.WarehouseApp = {
    STORAGE_KEY,
    STATUS_ORDER,
    STATUS_LABEL,
    uid,
    todayISO,
    formatIDR,
    safeNumber,
    loadState,
    saveState,
    clearAllData,
    computeStockByProduk,
    computeStockTimeline,
    countDistribusiByStatus,
    distStepNext,
    getProdukById,
    getPemasokById,
    exportStateToFile,
    importStateFromFile,
    formatTanggalTargetVsHariIni,
    exportAllDataToCSV
  };


