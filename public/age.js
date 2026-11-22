(function () {
  var yes = document.getElementById('age-yes');
  if (!yes) return;
  yes.addEventListener('click', function () {
    try { localStorage.setItem('age_ok', '1'); } catch (e) {}
    document.documentElement.classList.remove('age-pending');
  });
})();
