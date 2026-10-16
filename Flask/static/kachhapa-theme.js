/* Shared theme preference; never read authentication data here. */
(function () {
  function setTheme(theme) {
    document.documentElement.dataset.theme = theme === 'light' ? 'light' : 'dark';
    document.documentElement.dataset.kachhapaUi = 'core';
    document.documentElement.dataset.bsTheme = document.documentElement.dataset.theme;
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = getComputedStyle(document.documentElement).getPropertyValue('--bg-app').trim();
    var button = document.getElementById('wiki-theme-toggle');
    if (button) button.textContent = document.documentElement.dataset.theme === 'light' ? 'Dark Mode' : 'Light Mode';
  }
  function readTheme() { try { return window.KachhapaAppearance ? window.KachhapaAppearance.mode() : localStorage.getItem('theme'); } catch (_) { return 'dark'; } }
  setTheme(readTheme());
  window.addEventListener('appearance-changed', function(){setTheme(window.KachhapaAppearance.mode());});
  window.addEventListener('storage', function (event) { if (!window.KachhapaAppearance && event.key === 'theme') setTheme(event.newValue); });
  document.addEventListener('DOMContentLoaded', function () {
    setTheme(readTheme());
    var button = document.getElementById('wiki-theme-toggle');
    if (button) button.addEventListener('click', function () {
      var theme = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
      if(window.KachhapaAppearance){window.KachhapaAppearance.setMode(theme).catch(function(){});return;}
      try { localStorage.setItem('theme', theme); } catch (_) { /* Keep the current tab usable without storage. */ }
      setTheme(theme);
    });
  });
}());
