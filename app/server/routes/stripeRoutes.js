const express = require("express");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const bodyParser = require("body-parser");
const sendEmail = require("../sendEmail");
const User = require("../models/User");
const router = express.Router();

const log = (message, data = null) => {
  if (process.env.NODE_ENV !== "production") {
    console.log(message, data);
  }
};

router.post(
  "/webhook",
  bodyParser.raw({ type: "application/json" }),
  async (req, res) => {
    const sig = req.headers["stripe-signature"];
    let event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error("Webhook signature verification failed:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      log("Checkout session completed:", session);

      try {
        const customerEmail = session.customer_details.email;
        let user = await User.findOne({ email: customerEmail });


        const subscription = await stripe.subscriptions.retrieve(session.subscription);
        const priceId = subscription.items.data[0].price.id;
        const price = await stripe.prices.retrieve(priceId);
        const planType = price.metadata.plan_type || "premium"; 

        if (!user) {
          console.warn("User not found for email:", customerEmail);

          const apiKey = require("crypto").randomBytes(24).toString("hex");
          user = new User({
            email: customerEmail,
            apiKey,
            password: "temporaryPassword123",
            stripeSubscriptionId: session.subscription,
            isPremium: true,
            maxUsage: planType === "pro" ? 10000 : 1000,
            planType,
          });

          await user.save();

          await sendEmail({
            to: "admin@example.com",
            subject: "User Not Found for Stripe Subscription",
            text: `A Stripe subscription was completed for email: ${customerEmail}, and a new user was created.`,
          });

          log("New user created:", user);
        } else {
        
          user.stripeSubscriptionId = session.subscription;
          user.isPremium = true;
          user.planType = planType;

          if (planType === "pro") {
            user.maxUsage += 10000;
          } else {
            user.maxUsage += 1000;
          }

          await user.save();
          log("User updated:", user);
        }

        await sendEmail({
          to: customerEmail,
          subject: "Payment Successful - Thank You!",
          text: `Hi ${user.email},\n\nThank you for your payment! Your ${planType} subscription is now active.\n\nBest regards,\nThe PDFify Team`,
        });
      } catch (error) {
        console.error("Error handling checkout completion:", error);
      }
    }

    if (event.type === "customer.subscription.deleted") {
      const subscription = event.data.object;
      const customerId = subscription.customer;

      try {
        const customer = await stripe.customers.retrieve(customerId);
        const customerEmail = customer.email;

        const user = await User.findOne({ email: customerEmail });
        if (!user) {
          console.warn("User not found for cancelled subscription:", customerEmail);
          return res.json({ received: true });
        }

        user.isPremium = false;
        user.planType = "free";
        user.maxUsage = 30;
        user.stripeSubscriptionId = null;

        await user.save();
        log("User downgraded to free plan:", user);

        await sendEmail({
          to: customerEmail,
          subject: "Subscription Cancelled",
          text: `Hi ${user.email},\n\nYour subscription has been cancelled. You're now on the free plan.\n\nBest regards,\nThe PDFify Team`,
        });
      } catch (error) {
        console.error("Error handling subscription cancellation:", error);
      }
    }

    res.json({ received: true });
  }
);

module.exports = router;
