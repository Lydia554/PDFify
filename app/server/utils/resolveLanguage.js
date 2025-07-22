const { getTranslations } = require("./i18n");
const ShopConfig = require("../models/ShopConfig");

async function resolveLanguage({ req = {}, order = null, shopDomain = null }) {
  const shopConfig =
    shopDomain ? await ShopConfig.findOne({ shopDomain }) : null;

  let lang = req.body?.lang || req.query?.lang || shopConfig?.language;

  if (!lang && order?.shipping_address?.country_code) {
    const cc = order.shipping_address.country_code;
    if (cc === "DE") lang = "de";
    else if (cc === "SI") lang = "sl";
  }

  if (!lang) lang = "en";

  const t = getTranslations(lang);
  return { lang, t };
}

module.exports = { resolveLanguage };
