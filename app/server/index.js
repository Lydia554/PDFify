const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const path = require("path");
const cron = require("node-cron");
const session = require("express-session");
const MongoStore = require("connect-mongo");

dotenv.config();

const User = require("./models/User");
const authenticate = require("./middleware/authenticate");

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
const shopifyRoutes = require('./routes/shopifyRoutes');

const app = express();


app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));


app.use(cors({
  origin: "https://food-trek.com",
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log("MongoDB connected"))
.catch((error) => console.error("MongoDB connection error:", error));


app.use(session({
  secret: process.env.SESSION_SECRET || "fallbackSecretKey",
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI,
    ttl: 2 * 60 * 60 
  }),
  cookie: {
    maxAge: 2 * 60 * 60 * 1000, 
    httpOnly: true,
    secure: false 
  }
}));


app.use("/api/auth", authRoutes);
app.use("/api/user", userRoutes);
app.use("/api", invoiceRoutes);
app.use("/api", recipeRoutes);
app.use("/api", shopOrderRoutes);
app.use("/api", therapyReportRoutes);
app.use("/api", htmlRoutes);
app.use("/api", packingSlipRoutes);
app.use("/api/friendly", friendlyMode);
app.use("/api", foodTrekRoutes);
app.use("/api", shopifyRoutes);
app.use("/api/stripe/webhook", stripeRoutes); 
app.use("/api/stripe", paymentRoutes);


app.use('/debug', express.static(path.join(__dirname, 'server/routes')));
app.use(express.static(path.join(__dirname, "../public")));

app.get("/", (req, res) => res.sendFile(path.join(__dirname, "../public/landing.html")));
app.get("/user-dashboard", authenticate, (req, res) => res.sendFile(path.join(__dirname, "../public/user-dashboard.html")));
app.get("/user-creation", (req, res) => res.sendFile(path.join(__dirname, "../public/user-creation.html")));
app.get("/pdf-generator-demo", (req, res) => res.sendFile(path.join(__dirname, "../public/pdf-generator-demo.html")));
app.get("/api-guide", (req, res) => res.sendFile(path.join(__dirname, "../public/api-guide.html")));
app.get("/success.html", (req, res) => res.sendFile(path.join(__dirname, "public", "success.html")));
app.get("/cancel.html", (req, res) => res.sendFile(path.join(__dirname, "public", "cancel.html")));



app.get("/get-stripe-key", (req, res) => {
  if (!process.env.STRIPE_PUBLISHABLE_KEY) {
    return res.status(500).json({ error: "Stripe publishable key not set" });
  }
  res.json({ stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY });
});


cron.schedule("0 0 1 * *", async () => {
  try {
    await User.updateMany({}, { usageCount: 0 });
    console.log("Monthly usage counts reset.");
  } catch (error) {
    console.error("Error resetting usage counts:", error);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 PDF API server running on port ${PORT}`));
