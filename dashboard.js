// dashboard.js - main dashboard rendering & charts

(function () {
  const {
    loadState,
    computeStockByProduk,
    computeStockTimeline,
    countDistribusiByStatus,
    getProdukById,
    formatIDR,
    STATUS_LABEL,
    exportStateToFile,
    importStateFromFile,
    distStepNext,
    formatTanggalTargetVsHariIni,
    safeNumber
  } = window.WarehouseApp;

  const $ = (id) => document.getElementById(id);

  let charts = {};

  function ensureChartDestroy(chart) {
    if (chart && typeof chart.destroy === 'function') chart.destroy();
  }

  function renderKPIs(state, stockMap) {
    const totalProduk = state.produk.length;
    let totalItem = 0;
    let nilaiStok = 0;

    for (const p of state.produk) {
      const stok = stockMap.get(p.id) ?? 0;
      totalItem += stok;
      const harga = safeNumber(p.hargaEstimasi, 0);
      nilaiStok += stok * harga;
    }

    $('kpiTotalProduk').textContent = String(totalProduk);
    $('kpiTotalItemStok').textContent = new Intl.NumberFormat('id-ID').format(totalItem);
    $('kpiNilaiStok').textContent = formatIDR(nilaiStok);
  }

  function renderTopProduk(state, stockMap) {
    const list = $('topProdukList');
    list.innerHTML = '';

    const rows = state.produk
      .map((p) => ({
        nama: p.nama,
        satuan: p.satuan,
        stok: stockMap.get(p.id) ?? 0,
        nilai: (stockMap.get(p.id) ?? 0) * safeNumber(p.hargaEstimasi, 0)
      }))
      .sort((a, b) => b.stok - a.stok)
      .slice(0, 8);

    if (!rows.length) {
      list.innerHTML = `<div class="list-item"><div>Belum ada data</div><div class="muted">Tambahkan data di Management Gudang</div></div>`;
      return;
    }

    for (const r of rows) {
      const el = document.createElement('div');
      el.className = 'list-item';
      el.innerHTML = `
        <div>
          <div style="font-weight:900">${r.nama}</div>
          <div class="muted" style="font-size:12px">${new Intl.NumberFormat('id-ID').format(r.stok)} ${r.satuan} • Nilai ${formatIDR(r.nilai)}</div>
        </div>
        <div class="muted" style="font-weight:900">#${rows.indexOf(r) + 1}</div>
      `;
      list.appendChild(el);
    }
  }

  function renderOpSummary(state) {
    const tbody = $('opSummaryTbody');
    tbody.innerHTML = '';

    if (!state.distribusi.length || !state.pemasok.length) {
      tbody.innerHTML = `<tr><td colspan="3" class="muted">Belum ada distribusi. Tambahkan di Management Operasional.</td></tr>`;
      return;
    }

    const map = new Map();
    for (const s of state.pemasok) {
      map.set(s.id, { pemasok: s.nama, jumlah: 0, terlambat: 0 });
    }

    for (const d of state.distribusi) {
      const bucket = map.get(d.pemasokId);
      if (!bucket) continue;
      bucket.jumlah += 1;

      const { daysDiff } = formatTanggalTargetVsHariIni(d.tanggalTarget);
      if (daysDiff !== null && daysDiff < 0) bucket.terlambat += 1;
    }

    const rows = [...map.values()].sort((a, b) => b.jumlah - a.jumlah);
    for (const r of rows) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${r.pemasok}</td>
        <td>${new Intl.NumberFormat('id-ID').format(r.jumlah)}</td>
        <td>${new Intl.NumberFormat('id-ID').format(r.terlambat)}</td>
      `;
      tbody.appendChild(tr);
    }
  }

  function renderQueueList(state) {
    const wrap = $('queueList');
    wrap.innerHTML = '';

    const active = state.distribusi.filter((d) => d.status !== 'selesai');
    if (!active.length) {
      wrap.innerHTML = `<div class="list-item"><div>Tidak ada antrian</div><div class="muted">Semua distribusi selesai</div></div>`;
      return;
    }

    const rows = active
      .slice()
      .sort((a, b) => String(a.tanggalTarget).localeCompare(String(b.tanggalTarget)))
      .slice(0, 5);

    for (const d of rows) {
      const pemasok = window.WarehouseApp.getPemasokById(state, d.pemasokId);
      const produk = window.WarehouseApp.getProdukById(state, d.produkId);
      const st = STATUS_LABEL[d.status] || d.status;
      const tf = formatTanggalTargetVsHariIni(d.tanggalTarget);

      const el = document.createElement('div');
      el.className = 'list-item';
      el.innerHTML = `
        <div>
          <div style="font-weight:900">${produk ? produk.nama : 'Produk'} • ${d.jumlah} </div>
          <div class="muted" style="font-size:12px">Target: ${d.tanggalTarget || '-'} • ${st} • ${tf.label}</div>
        </div>
        <div class="muted" style="font-weight:900">${pemasok ? pemasok.nama : ''}</div>
      `;
      wrap.appendChild(el);
    }
  }

  function renderCharts(state) {
    const stockMap = computeStockByProduk(state);

    // Chart: Stok per Produk (bar)
    const stokRows = state.produk
      .map((p) => ({ name: p.nama, stok: stockMap.get(p.id) ?? 0 }))
      .sort((a, b) => b.stok - a.stok);

    const labels = stokRows.map((r) => r.name);
    const dataStok = stokRows.map((r) => r.stok);

    const ctx1 = $('chartStokPerProduk');
    ensureChartDestroy(charts.stokPerProduk);
    charts.stokPerProduk = new Chart(ctx1, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Stok Saat Ini',
          data: dataStok,
          backgroundColor: 'rgba(79,140,255,.45)',
          borderColor: 'rgba(79,140,255,1)',
          borderWidth: 1,
          borderRadius: 10
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (ctx) => ` ${new Intl.NumberFormat('id-ID').format(ctx.parsed.y)}` } }
        },
        scales: {
          y: { beginAtZero: true, ticks: { color: 'rgba(233,238,252,.9)' }, grid: { color: 'rgba(255,255,255,.06)' } },
          x: { ticks: { color: 'rgba(233,238,252,.9)' }, grid: { display: false } }
        }
      }
    });

    // Chart: Tren Masuk/Keluar (line)
    const timeline = computeStockTimeline(state, 30);
    const ctx2 = $('chartMasukKeluar');
    ensureChartDestroy(charts.masukKeluar);
    charts.masukKeluar = new Chart(ctx2, {
      type: 'line',
      data: {
        labels: timeline.labels,
        datasets: [
          {
            label: 'Masuk',
            data: timeline.masuk,
            borderColor: 'rgba(57,217,138,1)',
            backgroundColor: 'rgba(57,217,138,.2)',
            tension: 0.35,
            fill: true
          },
          {
            label: 'Keluar',
            data: timeline.keluar,
            borderColor: 'rgba(255,79,109,1)',
            backgroundColor: 'rgba(255,79,109,.18)',
            tension: 0.35,
            fill: true
          }
        ]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { labels: { color: 'rgba(233,238,252,.9)' } },
          tooltip: { callbacks: { label: (ctx) => ` ${new Intl.NumberFormat('id-ID').format(ctx.parsed.y)}` } }
        },
        scales: {
          y: { beginAtZero: true, ticks: { color: 'rgba(233,238,252,.9)' }, grid: { color: 'rgba(255,255,255,.06)' } },
          x: { ticks: { color: 'rgba(233,238,252,.9)' }, grid: { display: false } }
        }
      }
    });

    // Chart: Distribusi Status (doughnut)
    const counts = countDistribusiByStatus(state);
    const order = window.WarehouseApp.STATUS_ORDER;
    const ctx3 = $('chartStatusDistribusi');
    ensureChartDestroy(charts.statusDistribusi);
    charts.statusDistribusi = new Chart(ctx3, {
      type: 'doughnut',
      data: {
        labels: order.map((s) => STATUS_LABEL[s] || s),
        datasets: [{
          data: order.map((s) => counts[s] || 0),
          backgroundColor: [
            'rgba(79,140,255,.6)',
            'rgba(57,217,138,.6)',
            'rgba(255,196,61,.65)',
            'rgba(255,79,109,.6)',
            'rgba(170,181,214,.55)'
          ],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: 'bottom', labels: { color: 'rgba(233,238,252,.9)' } }
        },
        cutout: '62%'
      }
    });
  }

  function importSampleData() {
    const state = loadState();

    if (!state.produk.length && !state.pemasok.length && !state.distribusi.length && !state.transaksiStok.length) {
      const { uid } = window.WarehouseApp;
      const produk = [
        { id: uid('prd'), nama: 'Bayam', satuan: 'kg', hargaEstimasi: 15000, stokAwal: 20 },
        { id: uid('prd'), nama: 'Kangkung', satuan: 'kg', hargaEstimasi: 12000, stokAwal: 35 },
        { id: uid('prd'), nama: 'Wortel', satuan: 'kg', hargaEstimasi: 18000, stokAwal: 15 },
        { id: uid('prd'), nama: 'Tomat', satuan: 'kg', hargaEstimasi: 22000, stokAwal: 25 }
      ];

      const pemasok = [
        { id: uid('sup'), nama: 'Koperasi Tani Sejahtera', kontak: '0812-0000-123', alamat: 'Bandung' },
        { id: uid('sup'), nama: 'PT Hijau Segar', kontak: '0813-0000-456', alamat: 'Cimahi' }
      ];

      const now = new Date();
      const dISO = (offset) => {
        const d = new Date(now);
        d.setDate(d.getDate() - offset);
        return d.toISOString().slice(0, 10);
      };

      const transaksiStok = [
        { id: uid('stk'), produkId: produk[0].id, jenis: 'masuk', jumlah: 10, tanggal: dISO(10), catatan: 'Panen' },
        { id: uid('stk'), produkId: produk[0].id, jenis: 'keluar', jumlah: 7, tanggal: dISO(8), catatan: 'Pendistribusian' },
        { id: uid('stk'), produkId: produk[1].id, jenis: 'masuk', jumlah: 18, tanggal: dISO(12), catatan: 'Panen' },
        { id: uid('stk'), produkId: produk[1].id, jenis: 'keluar', jumlah: 12, tanggal: dISO(6), catatan: 'Pendistribusian' },
        { id: uid('stk'), produkId: produk[2].id, jenis: 'masuk', jumlah: 8, tanggal: dISO(5), catatan: 'Panen' },
        { id: uid('stk'), produkId: produk[3].id, jenis: 'masuk', jumlah: 14, tanggal: dISO(9), catatan: 'Panen' },
        { id: uid('stk'), produkId: produk[3].id, jenis: 'keluar', jumlah: 9, tanggal: dISO(4), catatan: 'Pendistribusian' }
      ];

      const distribusi = [
        { id: uid('d'), pemasokId: pemasok[0].id, produkId: produk[0].id, jumlah: 10, status: 'dipesan', tanggalDipesan: dISO(3), tanggalTarget: dISO(1), catatan: '' },
        { id: uid('d'), pemasokId: pemasok[0].id, produkId: produk[1].id, jumlah: 15, status: 'diterima', tanggalDipesan: dISO(5), tanggalTarget: dISO(2), catatan: '' },
        { id: uid('d'), pemasokId: pemasok[1].id, produkId: produk[2].id, jumlah: 12, status: 'diproses', tanggalDipesan: dISO(7), tanggalTarget: dISO(0), catatan: 'persiapan' },
        { id: uid('d'), pemasokId: pemasok[1].id, produkId: produk[3].id, jumlah: 20, status: 'dikirim', tanggalDipesan: dISO(8), tanggalTarget: dISO(-1), catatan: '' },
        { id: uid('d'), pemasokId: pemasok[0].id, produkId: produk[1].id, jumlah: 8, status: 'selesai', tanggalDipesan: dISO(12), tanggalTarget: dISO(9), catatan: '' }
      ];

      const next = { produk, transaksiStok, pemasok, distribusi };
      window.WarehouseApp.saveState(next);
      return next;
    }

    return state;
  }

  function init() {
    // buttons
    const btnSample = $('btnSample');
    btnSample?.addEventListener('click', () => {
      importSampleData();
      window.location.reload();
    });

    // export/import
    const btnExport = $('btnExport');
    btnExport?.addEventListener('click', () => exportStateToFile());

    const btnExportCSV = $('btnExportCSV');
    btnExportCSV?.addEventListener('click', () => {
      window.WarehouseApp.exportAllDataToCSV();
    });

    const fileImport = $('fileImport');

    const btnImport = $('btnImport');
    btnImport?.addEventListener('click', () => fileImport?.click());
    fileImport?.addEventListener('change', async (e) => {
      const f = e.target.files?.[0];
      if (!f) return;
      await importStateFromFile(f);
      window.location.reload();
    });

    // initial render
    const state = loadState();
    const stockMap = computeStockByProduk(state);
    renderKPIs(state, stockMap);
    renderTopProduk(state, stockMap);
    renderOpSummary(state);
    renderQueueList(state);
    renderCharts(state);
  }

  document.addEventListener('DOMContentLoaded', init);

})();

