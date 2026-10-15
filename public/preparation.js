(() => {
  const form = document.getElementById('confirm-roster-form');
  if (!form) return;
  const reviewed = form.querySelector('input[name="reviewed"]');
  const button = form.querySelector('button[type="submit"]');
  if (!reviewed || !button) return;
  const sync = () => { button.disabled = !reviewed.checked; };
  reviewed.addEventListener('change', sync);
  window.addEventListener('pageshow', sync);
  sync();
})();
