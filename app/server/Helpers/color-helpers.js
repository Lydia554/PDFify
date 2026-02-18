/**
 * Color utilities for dynamic PDF generation
 * Converts hex colors to CSS and generates shades
 */

/**
 * Convert hex color to RGB object
 * @param {string} hex - Hex color string (e.g., "#00a6cc")
 * @returns {object} RGB object with r, g, b values (0-255)
 */
function hexToRgb(hex) {
  hex = hex.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  return { r, g, b };
}

/**
 * Convert RGB to hex string
 * @param {number} r - Red value (0-255)
 * @param {number} g - Green value (0-255)
 * @param {number} b - Blue value (0-255)
 * @returns {string} Hex color string
 */
function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(x => {
    const hex = Math.round(Math.max(0, Math.min(255, x))).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('');
}

/**
 * Lighten a hex color by a percentage
 * @param {string} hex - Hex color string
 * @param {number} percent - Percentage to lighten (0-100)
 * @returns {string} Lightened hex color
 */
function lightenColor(hex, percent) {
  const { r, g, b } = hexToRgb(hex);
  const factor = 1 + (percent / 100);
  return rgbToHex(
    r * factor,
    g * factor,
    b * factor
  );
}

/**
 * Darken a hex color by a percentage
 * @param {string} hex - Hex color string
 * @param {number} percent - Percentage to darken (0-100)
 * @returns {string} Darkened hex color
 */
function darkenColor(hex, percent) {
  const { r, g, b } = hexToRgb(hex);
  const factor = 1 - (percent / 100);
  return rgbToHex(
    r * factor,
    g * factor,
    b * factor
  );
}

/**
 * Generate CSS color variables from a primary color
 * @param {string} primaryColor - Primary hex color
 * @returns {object} Object with various color shades
 */
function generateColorPalette(primaryColor) {
  return {
    primary: primaryColor,
    light: lightenColor(primaryColor, 20),
    lighter: lightenColor(primaryColor, 40),
    lightest: lightenColor(primaryColor, 85),
    dark: darkenColor(primaryColor, 10),
    darker: darkenColor(primaryColor, 20),
    rgb: hexToRgb(primaryColor)
  };
}

/**
 * Generate CSS variables string from color palette
 * @param {string} primaryColor - Primary hex color
 * @returns {string} CSS variable declarations
 */
function generateColorVariables(primaryColor) {
  const palette = generateColorPalette(primaryColor);
  return `
    --primary-color: ${palette.primary};
    --primary-light: ${palette.light};
    --primary-lighter: ${palette.lighter};
    --primary-lightest: ${palette.lightest};
    --primary-dark: ${palette.dark};
    --primary-darker: ${palette.darker};
  `.trim();
}

module.exports = {
  hexToRgb,
  rgbToHex,
  lightenColor,
  darkenColor,
  generateColorPalette,
  generateColorVariables
};
