// gudang.js - manajemen stok: master produk + transaksi masuk/keluar

(function () {
  const {
    loadState,
    saveState,
    clearAllData,
    computeStockByProduk,
    safeNumber,
    uid,
    formatIDR
  } = window.WarehouseApp;

  const $ = (id) => document.getElementById(id);

  let cachedCharts = {};

  function getStockMap() {
    const state = loadState();
    return computeStockByProduk(state);
  }

  function refreshProdukTable() {
    const state = loadState();
    const stockMap = computeStockByProduk(state);
    const tbody = $('produkTbody');
    tbody.innerHTML = '';

    if (!state.produk.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="muted">Belum ada produk. Tambahkan di form.</td></tr>`;
      return;
    }

    for (const p of state.produk) {
      const stok = stockMap.get(p.id) ?? 0;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${p.nama}</td>
        <td>${p.satuan || '-'}</td>
        <td>${formatIDR(p.hargaEstimasi)}</td>
        <td><b>${new Intl.NumberFormat('id-ID').format(stok)}</b> ${p.satuan || ''}</td>
        <td>
          <button class="btn btn--danger" style="padding:8px 10px" data-del-produk="${p.id}">Hapus</button>
        </td>
      `;
      tbody.appendChild(tr);
    }

    tbody.querySelectorAll('[data-del-produk]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-del-produk');
        if (!confirm('Hapus produk ini? Data transaksi stok terkait akan ikut terhapus.')) return;
        const next = loadState();
        next.produk = next.produk.filter((p) => p.id !== id);
        next.transaksiStok = next.transaksiStok.filter((t) => t.produkId !== id);
        saveState(next);
        window.location.reload();
      });
    });

    refreshRingkasanStok();
    refreshTransaksiProdukSelect();
  }

  function refreshTransaksiProdukSelect() {
    const state = loadState();
    const sel = $('transProduk');
    sel.innerHTML = '';

    if (!state.produk.length) {
      sel.innerHTML = `<option value="">(Belum ada produk)</option>`;
      return;
    }

    for (const p of state.produk) {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.nama;
      sel.appendChild(opt);
    }
  }

  function renderRingkasanStokChart() {
    const state = loadState();
    const stockMap = computeStockByProduk(state);

    const labels = state.produk.map((p) => p.nama);
    const dataStok = state.produk.map((p) => stockMap.get(p.id) ?? 0);

    const ctx = $('gChartStokPerProduk');
    if (!ctx) return;

    if (cachedCharts.stokPerProduk) cachedCharts.stokPerProduk.destroy();

    cachedCharts.stokPerProduk = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Stok Saat Ini',
            data: dataStok,
            backgroundColor: 'rgba(79,140,255,.45)',
            borderColor: 'rgba(79,140,255,1)',
            borderWidth: 1
          }
        ]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => ` ${new Intl.NumberFormat('id-ID').format(ctx.parsed.y)}`
            }
          }
        },
        scales: {
          y: { beginAtZero: true, ticks: { color: 'rgba(233,238,252,.9)' }, grid: { color: 'rgba(255,255,255,.06)' } },
          x: { ticks: { color: 'rgba(233,238,252,.9)' }, grid: { display: false } }
        }
      }
    });
  }

  function refreshRingkasanStok() {
    const state = loadState();
    const stockMap = computeStockByProduk(state);

    let totalItem = 0;
    let nilai = 0;
    for (const p of state.produk) {
      const stok = stockMap.get(p.id) ?? 0;
      totalItem += stok;
      nilai += stok * safeNumber(p.hargaEstimasi, 0);
    }

    $('gkpiTotalProduk').textContent = String(state.produk.length);
    $('gkpiTotalItemStok').textContent = new Intl.NumberFormat('id-ID').format(totalItem);
    $('gkpiNilaiStok').textContent = formatIDR(nilai);

    renderRingkasanStokChart();
  }

  function refreshTransaksiTable() {
    const state = loadState();
    const tbody = $('transTbody');
    tbody.innerHTML = '';

    const rows = [...state.transaksiStok].sort((a, b) => String(b.tanggal).localeCompare(String(a.tanggal)));
    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="muted">Belum ada transaksi stok.</td></tr>`;
      return;
    }

    for (const t of rows) {
      const p = state.produk.find((x) => x.id === t.produkId);
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${t.tanggal || '-'}</td>
        <td>${p ? p.nama : 'Produk'}</td>
        <td>${t.jenis === 'masuk' ? 'Masuk' : 'Keluar'}</td>
        <td><b>${new Intl.NumberFormat('id-ID').format(t.jumlah)}</b></td>
        <td>${t.catatan || '-'}</td>
      `;
      tbody.appendChild(tr);
    }
  }

  function init() {
    // init selects
    refreshTransaksiProdukSelect();
    refreshProdukTable();
    refreshTransaksiTable();

    // add produk
    $('btnTambahProduk').addEventListener('click', () => {
      const nama = $('produkNama').value.trim();
      const satuan = $('produkSatuan').value;
      const hargaEstimasi = safeNumber($('produkHarga').value, 0);
      const stokAwal = safeNumber($('produkStokAwal').value, 0);

      if (!nama) return alert('Nama produk wajib diisi.');

      const next = loadState();
      next.produk.push({ id: uid('prd'), nama, satuan, hargaEstimasi, stokAwal });
      saveState(next);
      window.location.reload();
    });

    // clear produk
    $('btnClearProduk').addEventListener('click', () => {
      if (!confirm('Hapus semua master produk dan transaksi stok?')) return;
      clearAllData();
      window.location.reload();
    });

    // add transaksi
    $('btnTambahTransaksi').addEventListener('click', () => {
      const produkId = $('transProduk').value;
      const jenis = $('transJenis').value;
      const jumlah = safeNumber($('transJumlah').value, NaN);
      const tanggal = $('transTanggal').value || todayISO();
      const catatan = $('transCatatan').value.trim();

      if (!produkId) return alert('Pilih produk.');
      if (!Number.isFinite(jumlah) || jumlah <= 0) return alert('Jumlah transaksi harus > 0');

      const next = loadState();
      next.transaksiStok.push({ id: uid('stk'), produkId, jenis, jumlah, tanggal, catatan });
      saveState(next);

      // reset minimal
      $('transJumlah').value = '';
      $('transCatatan').value = '';
      window.location.reload();
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();

