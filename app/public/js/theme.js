// public/js/theme.js
function isDarkModePreferred() {
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function applyInitialTheme() {
  const prefersDark = isDarkModePreferred();
  document.body.classList.toggle('dark-mode', prefersDark);
}

function getTheme() {
  return isDarkModePreferred() ? 'dark' : 'light';
}
