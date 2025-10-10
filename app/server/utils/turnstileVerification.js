/**
 * Cloudflare Turnstile verification utility
 * Verifies Turnstile tokens with Cloudflare API
 */

const axios = require("axios");

/**
 * Verify Turnstile token with Cloudflare
 * @param {string} token - The Turnstile token from the client
 * @param {string} userIP - Optional user IP address for additional validation
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function verifyTurnstile(token, userIP = null) {
  try {
    // Check if secret key is configured
    if (!process.env.TURNSTILE_SECRET_KEY) {
      console.error("TURNSTILE_SECRET_KEY not configured in environment");
      return {
        success: false,
        error: "Server configuration error",
      };
    }

    // Verify token with Cloudflare
    const response = await axios.post(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        secret: process.env.TURNSTILE_SECRET_KEY,
        response: token,
        remoteip: userIP,
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
        timeout: 5000, // 5 second timeout
      }
    );

    const data = response.data;

    if (data.success) {
      return { success: true };
    } else {
      console.warn("Turnstile verification failed:", data["error-codes"]);
      return {
        success: false,
        error: "Verification failed",
        errorCodes: data["error-codes"],
      };
    }
  } catch (error) {
    console.error("Turnstile verification error:", error.message);
    return {
      success: false,
      error: "Verification service unavailable",
    };
  }
}

module.exports = {
  verifyTurnstile,
};
