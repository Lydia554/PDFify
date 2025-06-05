const express = require("express");
const router = express.Router();

router.post("/shopify-invoice", (req, res) => {
  console.log("Shopify invoice route hit");
  res.json({ success: true, message: "Route works" });
});

module.exports = router;
