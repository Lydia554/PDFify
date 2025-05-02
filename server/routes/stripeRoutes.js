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

        if (!user) {
          console.warn("User not found for email:", customerEmail);

         
          await sendEmail({
            to: "admin@example.com", 
            subject: "User Not Found for Stripe Subscription",
            text: `A Stripe subscription was completed for email: ${customerEmail}, but no matching user was found in the database.`,
          });

          
          const apiKey = require("crypto").randomBytes(24).toString("hex");
          user = new User({
            email: customerEmail,
            apiKey,
            password: "temporaryPassword123",
            isPremium: true,
            maxUsage: 1000,
            stripeSubscriptionId: session.subscription,
          });

          await user.save();
          log("New user created for Stripe subscription:", user);
        }

    
        user.stripeSubscriptionId = session.subscription;
        user.isPremium = true;
        user.maxUsage = 1000; 
        await user.save();

        log("User subscription updated successfully:", user);

       
        const decryptedApiKey = user.getDecryptedApiKey();
        log("Decrypted API Key for user:", decryptedApiKey);

     
        const subject = "Payment Successful - Thank You!";
        const text = `Hi ${user.email},\n\nThank you for your payment! Your subscription is now active.\n\nBest regards,\nThe PDF Generator Team`;

        await sendEmail({
          to: customerEmail,
          subject,
          text,
        });

        log("Payment success email sent to:", customerEmail);
      } catch (error) {
        console.error("Error updating user subscription:", error);
      }
    }

    res.json({ received: true });
  }
);

module.exports = router;