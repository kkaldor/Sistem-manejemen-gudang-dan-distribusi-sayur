// auth-guard.js - guard halaman yang memerlukan login

(function () {
  function initGuard() {
    if (!window.WarehouseAuth || !window.WarehouseAuth.requireLoginOrRedirect) return;

    // redirect ke login.html kalau belum login
    window.WarehouseAuth.requireLoginOrRedirect({
      loginPath: './login.html',
      preserve: true
    });
  }

  document.addEventListener('DOMContentLoaded', initGuard);
})();

