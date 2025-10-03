// middleware/authProtect.js
const dualAuth = require("./dualAuth");

module.exports = async (req, res, next) => {
  try {
    // If session exists, allow
    if (req.session && req.session.userId) {
      return next();
    }

    // Otherwise, try dualAuth (API key)
    await dualAuth(req, res, () => {
      next();
    });

  } catch (err) {
    // If both fail, redirect to login
    return res.redirect("/login.html");
  }
};
