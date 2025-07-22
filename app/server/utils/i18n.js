const fs = require("fs");
const path = require("path");

function getTranslations(lang = "en") {
  try {
    const filePath = path.join(__dirname, `../../locales-shopify/${lang}.json`);
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    const fallbackPath = path.join(__dirname, "../../locales-shopify/en.json");
    return JSON.parse(fs.readFileSync(fallbackPath, "utf8"));
  }
}

module.exports = { getTranslations };
