// Runs before first paint (classic script: the admin page forbids inline scripts) to avoid a theme flash.
try {
  var t = localStorage.getItem('rookery-admin:theme');
  if (t !== 'light' && t !== 'dark') t = matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', t);
} catch (e) { /* ignore */ }
