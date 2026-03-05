const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const path = require("path");
const cron = require("node-cron");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const dotenv = require("dotenv");
const fs = require("fs");

// Load .env from root directory
dotenv.config({ path: path.join(__dirname, '../../.env') });

if (!fs.existsSync(process.env.PDFA_ICC_PROFILE)) {
  console.warn("[WARN] ICC profile not found at path:", process.env.PDFA_ICC_PROFILE);
} else {
  console.log("[OK] ICC profile loaded from:", process.env.PDFA_ICC_PROFILE);
}

const User = require("./models/User");
const authenticate = require("./middleware/authenticate");

// Routes
const recipeRoutes = require("./routes/recipeRoutes");
const shopOrderRoutes = require("./routes/shopOrderRoutes");
const therapyReportRoutes = require("./routes/therapyReportRoutes");
const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes"); 
const stripeRoutes = require("./routes/stripeRoutes");
const invoiceRoutes = require("./routes/invoiceRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const htmlRoutes = require("./routes/htmlRoutes");
const packingSlipRoutes = require("./routes/packing-slipRoutes");
const friendlyMode = require("./routes/friendlyMode");
const foodTrekRoutes = require("./routes/foodTrekRoutes");
const shopifyWebhookRoutes = require('./routes/shopify/shopifyWebhookRoutes');
const shopifyApiRoutes = require('./routes/shopify/shopifyApiRoutes');
const shopifyBillingRoutes = require('./routes/shopify/billingRoutes');
const shopifyCleanupRoutes = require('./routes/shopify/cleanupWebhooks');
const woocommerceApiRoutes = require("./routes/woocommerce/woocommerceApiRoutes");
const woocommerceWebhookRoutes = require("./routes/woocommerce/woocommerceWebhookRoutes");
const betaRegistrationRoutes = require("./routes/betaRegistrationRoutes");


const app = express();

// -------------------- Session --------------------
app.use(session({
  secret: process.env.SESSION_SECRET || "fallbackSecretKey",
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI,
    ttl: 24 * 60 * 60, // 24 hours
    connectTimeoutMS: 10000,
    socketTimeoutMS: 45000,
    autoRemove: 'native',
    touchAfter: 24 * 3600, // Only update session once per day
  }),
  cookie: {
    maxAge: 24 * 60 * 60 * 1000, // 24 hours in milliseconds
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: 'lax',
  },
}));

// MongoDB session store connection monitoring
MongoStore.create({
  mongoUrl: process.env.MONGODB_URI,
}).on('error', function (err) {
  console.error('❌ Session store error:', err);
});

// Session debugging middleware (only in non-production)
if (process.env.NODE_ENV !== "production") {
  app.use((req, res, next) => {
    if (req.sessionID) {
      console.log(`🔍 [SESSION] ${req.method} ${req.path}`, {
        sessionID: req.sessionID,
        hasUserId: !!(req.session && req.session.userId),
        userId: req.session?.userId,
        hasCookie: !!req.headers.cookie,
        origin: req.get('origin'),
      });
    }
    next();
  });
}

// -------------------- Webhooks --------------------
app.use("/api/stripe/webhook", express.raw({ type: "*/*" }), stripeRoutes);
app.use("/webhook", shopifyWebhookRoutes);

// -------------------- CORS --------------------
app.use(cors({
  origin: [
    "https://food-trek.com",
    "https://woocommerce.portfolio.lidija-jokic.com",
    /.+\.myshopify\.com$/,     // Allow all Shopify stores
    /admin\.shopify\.com/,      // Allow Shopify Admin
    "https://cdn.shopify.com", // Shopify embedded app CDN
    null,                       // Allow local development
  ],
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
}));

// -------------------- Security Headers for Shopify Embedded App --------------------
app.use((req, res, next) => {
  // CRITICAL: Allow Shopify to embed this app in an iframe
  // Must be set BEFORE any other headers
  res.removeHeader('X-Frame-Options');
  res.setHeader('X-Frame-Options', 'ALLOWFROM https://*.myshopify.com');

  // Content Security Policy
  res.setHeader('Content-Security-Policy', "frame-ancestors 'self' *.myshopify.com admin.shopify.com cdn.shopify.com;");

  next();
});

// -------------------- Body parser --------------------
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// -------------------- MongoDB --------------------
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(async () => {
  console.log("MongoDB connected");

  // Health check after 5 seconds to verify connection is stable
  setTimeout(async () => {
    try {
      await mongoose.connection.db.admin().ping();
      console.log("✅ MongoDB connection verified - health check passed");
    } catch (err) {
      console.error("❌ MongoDB connection health check failed:", err);
    }
  }, 5000);
})
.catch((error) => console.error("MongoDB connection error:", error));

// Monitor MongoDB connection events
mongoose.connection.on('error', (err) => {
  console.error('❌ MongoDB connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.warn('⚠️ MongoDB disconnected - attempting to reconnect...');
});

mongoose.connection.on('reconnected', () => {
  console.log('✅ MongoDB reconnected');
});

// -------------------- API Routes --------------------

// Request logging middleware (for debugging)
app.use("/api", (req, res, next) => {
  console.log(`[API] ${req.method} ${req.path}`, {
    origin: req.get('origin'),
    shop: req.get('X-Shopify-Shop-Domain') || req.query?.shop,
    hasAuth: !!req.get('Authorization')
  });
  next();
});

// Auth routes
app.use("/api/auth", authRoutes);

// -------------------- USER ROUTES --------------------
// 1️⃣ Unprotected user creation
app.post("/api/user/user-creation", userRoutes.stack.find(r => r.route.path === '/user-creation').route.stack[0].handle);

// 2️⃣ Protected user routes
app.use("/api/user", authenticate, userRoutes);

// Other API routes
app.use("/api", recipeRoutes);
app.use("/api", shopOrderRoutes);
app.use("/api", therapyReportRoutes);
app.use("/api", htmlRoutes);
app.use("/api", packingSlipRoutes);
app.use("/api", foodTrekRoutes);
app.use("/api", betaRegistrationRoutes);
app.use("/api/stripe", paymentRoutes);
app.use("/woocommerce-webhook", woocommerceWebhookRoutes);

app.use("/api/shopify", (req, res, next) => { req.invoiceSource = "shopify"; next(); }, shopifyApiRoutes);
app.use("/api/shopify/billing", shopifyBillingRoutes);
app.use("/api/shopify/util", shopifyCleanupRoutes);
app.use("/api/woocommerce", (req, res, next) => { req.invoiceSource = "woocommerce"; next(); }, woocommerceApiRoutes);
app.use("/api/friendly", (req, res, next) => { req.invoiceSource = "friendly"; next(); }, friendlyMode);
app.use("/api", (req, res, next) => { req.invoiceSource = "dev"; next(); }, invoiceRoutes);

// -------------------- Static & Landing --------------------
app.use('/debug', express.static(path.join(__dirname, 'server/routes')));
app.use(express.static(path.join(__dirname, "../public")));

app.get("/", (req, res) => {
  // If this is Shopify loading the embedded app (check for shop parameter)
  if (req.query.shop) {
    return res.sendFile(path.join(__dirname, "../public/shopify-embedded.html"));
  }
  // Otherwise show landing page
  return res.sendFile(path.join(__dirname, "../public/landing.html"));
});
app.get("/api-guide", (req, res) => res.sendFile(path.join(__dirname, "../public/api-guide.html")));
app.get("/beta-registration", (req, res) => res.sendFile(path.join(__dirname, "../public/beta-registration.html")));
app.get("/success.html", (req, res) => res.sendFile(path.join(__dirname, "public", "success.html")));
app.get("/cancel.html", (req, res) => res.sendFile(path.join(__dirname, "public", "cancel.html")));

// -------------------- Protected Pages --------------------
const authProtect = require("./middleware/authProtect");
app.get("/user-dashboard", authProtect, (req, res) =>
  res.sendFile(path.join(__dirname, "../public/user-dashboard.html"))
);
app.get("/shopify", authProtect, (req, res) =>
  res.sendFile(path.join(__dirname, "../public/shopify.html"))
);
// Embedded Shopify app (loaded inside Shopify Admin iframe)
app.get("/shopify/app", (req, res) =>
  res.sendFile(path.join(__dirname, "../public/shopify-embedded.html"))
);
app.get("/woocommerce", authProtect, (req, res) =>
  res.sendFile(path.join(__dirname, "../public/woocommerce.html"))
);
app.get("/pdf-generator-demo", authProtect, (req, res) => {
  console.log("📄 [SERVER] Serving pdf-generator-demo.html");
  console.log("👤 [SERVER] Authenticated user ID:", req.session?.userId);
  res.sendFile(path.join(__dirname, "../public/pdf-generator-demo.html"));
});

// Optional unprotected pages
app.get("/user-creation", (req, res) =>
  res.sendFile(path.join(__dirname, "../public/user-creation.html"))
);

// -------------------- Stripe key --------------------
app.get("/api/get-stripe-key", (req, res) => {
  if (!process.env.STRIPE_PUBLISHABLE_KEY) {
    return res.status(500).json({ error: "Stripe publishable key not set" });
  }
  res.json({ stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY });
});

// -------------------- Debug session endpoint --------------------
app.get("/api/debug-session", (req, res) => {
  console.log("🔍 [DEBUG] Session check requested");
  res.json({
    sessionExists: !!req.session,
    sessionId: req.sessionID,
    userId: req.session?.userId,
    hasCookie: !!req.headers.cookie,
    cookieHeader: req.headers.cookie,
  });
});

// -------------------- Cron Job --------------------
cron.schedule("0 0 1 * *", async () => {
  try {
    await User.updateMany({}, { usageCount: 0 });
    console.log("Monthly usage counts reset.");
  } catch (error) {
    console.error("Error resetting usage counts:", error);
  }
});

// -------------------- Start Server --------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 PDF API server running on port ${PORT}`));
