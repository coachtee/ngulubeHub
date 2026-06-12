// NgulubeHub — small UX polish
document.addEventListener('DOMContentLoaded', () => {
  // auto-dismiss alerts after 4s
  document.querySelectorAll('.alert-dismissible').forEach(el => {
    setTimeout(() => el.classList.remove('show'), 4000);
  });

  // keyboard shortcut: "/" focuses search
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
      const s = document.querySelector('input[name="q"]');
      if (s) { e.preventDefault(); s.focus(); }
    }
  });
});
