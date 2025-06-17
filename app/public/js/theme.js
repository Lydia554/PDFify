function isDarkModePreferred() {
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function applyInitialTheme() {
  const theme = localStorage.getItem("theme");

  if (theme === "dark" || (!theme && isDarkModePreferred())) {
    document.documentElement.classList.add("dark"); 
  } else {
    document.documentElement.classList.remove("dark");
  }
}

function getTheme() {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}
