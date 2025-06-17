
function isDarkModePreferred() {
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function applyInitialTheme() {
  if (localStorage.getItem("theme") === "dark") {
    document.body.classList.add("dark-mode", "dark");
  } else {
    document.body.classList.remove("dark-mode", "dark");
  }
}

function getTheme() {
  return isDarkModePreferred() ? 'dark' : 'light';
}
