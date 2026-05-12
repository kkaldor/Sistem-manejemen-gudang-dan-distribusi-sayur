// operasional.js - manajemen operasional distribusi pemasok

(function () {
  const {
    loadState,
    saveState,
    clearAllData,
    uid,
    safeNumber,
    STATUS_ORDER,
    STATUS_LABEL,
    distStepNext,
    formatTanggalTargetVsHariIni
  } = window.WarehouseApp;

  const $ = (id) => document.getElementById(id);

  let charts = {};

  function refreshSupplierTable() {
    const state = loadState();
    const tbody = $('supplierTbody');
    tbody.innerHTML = '';

    if (!state.pemasok.length) {
      tbody.innerHTML = `<tr><td colspan="3" class="muted">Belum ada pemasok. Tambahkan di form.</td></tr>`;
      return;
    }

    for (const s of state.pemasok) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${s.nama}</td>
        <td>${s.kontak || '-'}</td>
        <td>
          <button class="btn btn--danger" style="padding:8px 10px" data-del-supplier="${s.id}">Hapus</button>
        </td>
      `;
      tbody.appendChild(tr);
    }

    tbody.querySelectorAll('[data-del-supplier]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-del-supplier');
        if (!confirm('Hapus pemasok ini? Data distribusi terkait akan terhapus.')) return;
        const next = loadState();
        next.pemasok = next.pemasok.filter((x) => x.id !== id);
        next.distribusi = next.distribusi.filter((d) => d.pemasokId !== id);
        saveState(next);
        window.location.reload();
      });
    });

    refreshSelects();
    renderDistribusiTable();
    renderDelayTabel();
    renderCharts();
  }

  function refreshSelects() {
    const state = loadState();

    const selSup = $('distSupplier');
    selSup.innerHTML = '';
    if (!state.pemasok.length) {
      selSup.innerHTML = `<option value="">(Belum ada pemasok)</option>`;
    } else {
      for (const s of state.pemasok) {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = s.nama;
        selSup.appendChild(opt);
      }
    }

    const selPrd = $('distProduk');
    selPrd.innerHTML = '';
    if (!state.produk.length) {
      selPrd.innerHTML = `<option value="">(Belum ada produk)</option>`;
    } else {
      for (const p of state.produk) {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.nama;
        selPrd.appendChild(opt);
      }
    }
  }

  function renderDistribusiTable() {
    const state = loadState();
    const tbody = $('distTbody');
    tbody.innerHTML = '';

    const rows = [...state.distribusi].sort((a, b) => String(a.tanggalTarget).localeCompare(String(b.tanggalTarget)));
    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="muted">Belum ada distribusi.</td></tr>`;
      return;
    }

    for (const d of rows) {
      const sup = state.pemasok.find((s) => s.id === d.pemasokId);
      const prd = state.produk.find((p) => p.id === d.produkId);

      const tf = formatTanggalTargetVsHariIni(d.tanggalTarget);
      const statusLabel = STATUS_LABEL[d.status] || d.status;

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${d.tanggalTarget || '-'}</td>
        <td>${sup ? sup.nama : 'Pemasok'}</td>
        <td>${prd ? prd.nama : 'Produk'}</td>
        <td><b>${new Intl.NumberFormat('id-ID').format(d.jumlah)}</b></td>
        <td>
          <span style="display:inline-flex;align-items:center;gap:8px">
            <span style="width:10px;height:10px;border-radius:999px;background:${colorStatus(d.status)};display:inline-block"></span>
            ${statusLabel}
          </span>
          <div class="muted" style="font-size:12px">${tf.label}</div>
        </td>
        <td>
          <button class="btn btn--primary" style="padding:8px 10px" data-next-status="${d.id}">Majukan Status</button>
        </td>
      `;

      tbody.appendChild(tr);
    }

    tbody.querySelectorAll('[data-next-status]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-next-status');
        const next = loadState();
        const item = next.distribusi.find((x) => x.id === id);
        if (!item) return;
        const current = item.status;
        const nxt = distStepNext(current);
        if (current === 'selesai' || nxt === current) return alert('Distribusi sudah selesai.');
        item.status = nxt;
        saveState(next);
        window.location.reload();
      });
    });
  }

  function renderDelayTabel() {
    const state = loadState();
    const tbody = $('delayTbody');
    tbody.innerHTML = '';

    if (!state.distribusi.length) {
      tbody.innerHTML = `<tr><td colspan="3" class="muted">Belum ada distribusi.</td></tr>`;
      return;
    }

    const map = new Map();
    for (const s of state.pemasok) {
      map.set(s.id, { pemasok: s.nama, aktif: 0, terlambat: 0 });
    }

    for (const d of state.distribusi) {
      if (d.status === 'selesai') continue;
      const bucket = map.get(d.pemasokId);
      if (!bucket) continue;
      bucket.aktif += 1;
      const { daysDiff } = formatTanggalTargetVsHariIni(d.tanggalTarget);
      if (daysDiff !== null && daysDiff < 0) bucket.terlambat += 1;
    }

    const rows = [...map.values()].sort((a, b) => b.terlambat - a.terlambat);
    for (const r of rows) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${r.pemasok}</td>
        <td>${new Intl.NumberFormat('id-ID').format(r.aktif)}</td>
        <td>${new Intl.NumberFormat('id-ID').format(r.terlambat)}</td>
      `;
      tbody.appendChild(tr);
    }
  }

  function renderCharts() {
    const state = loadState();
    const counts = window.WarehouseApp.countDistribusiByStatus(state);

    const labels = STATUS_ORDER.map((s) => STATUS_LABEL[s] || s);
    const data = STATUS_ORDER.map((s) => counts[s] || 0);

    const ctx = $('opChartStatus');
    if (!ctx) return;
    if (charts.status) charts.status.destroy();

    charts.status = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Jumlah Distribusi',
            data,
            backgroundColor: STATUS_ORDER.map((s) => colorStatus(s, true)),
            borderWidth: 0
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

  function colorStatus(status, soft = false) {
    const map = {
      dipesan: soft ? 'rgba(79,140,255,.35)' : 'rgba(79,140,255,1)',
      diterima: soft ? 'rgba(57,217,138,.35)' : 'rgba(57,217,138,1)',
      diproses: soft ? 'rgba(255,196,61,.4)' : 'rgba(255,196,61,1)',
      dikirim: soft ? 'rgba(255,79,109,.35)' : 'rgba(255,79,109,1)',
      selesai: soft ? 'rgba(170,181,214,.35)' : 'rgba(170,181,214,1)'
    };
    return map[status] || (soft ? 'rgba(255,255,255,.18)' : 'rgba(255,255,255,1)');
  }

  function init() {
    refreshSelects();
    refreshSupplierTable();
    renderDistribusiTable();
    renderDelayTabel();
    renderCharts();

    $('btnTambahSupplier').addEventListener('click', () => {
      const nama = $('supplierNama').value.trim();
      const kontak = $('supplierKontak').value.trim();
      const alamat = $('supplierAlamat').value.trim();
      if (!nama) return alert('Nama pemasok wajib diisi.');
      const next = loadState();
      next.pemasok.push({ id: uid('sup'), nama, kontak: kontak || '', alamat: alamat || '' });
      saveState(next);
      window.location.reload();
    });

    $('btnClearSupplier').addEventListener('click', () => {
      if (!confirm('Hapus semua data (produk, transaksi stok, pemasok, distribusi)?')) return;
      clearAllData();
      window.location.reload();
    });

    $('btnTambahDistribusi').addEventListener('click', () => {
      const pemasokId = $('distSupplier').value;
      const produkId = $('distProduk').value;
      const jumlah = safeNumber($('distJumlah').value, NaN);
      const status = $('distStatus').value;
      const tanggalDipesan = $('distTanggalDipesan').value || window.WarehouseApp.todayISO();
      const tanggalTarget = $('distTanggalTarget').value || window.WarehouseApp.todayISO();
      const catatan = $('distCatatan').value.trim();

      if (!pemasokId) return alert('Pilih pemasok.');
      if (!produkId) return alert('Pilih produk.');
      if (!Number.isFinite(jumlah) || jumlah <= 0) return alert('Jumlah harus > 0');

      const next = loadState();
      next.distribusi.push({
        id: uid('d'),
        pemasokId,
        produkId,
        jumlah,
        status,
        tanggalDipesan,
        tanggalTarget,
        catatan
      });
      saveState(next);

      $('distJumlah').value = '';
      $('distCatatan').value = '';
      window.location.reload();
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();

