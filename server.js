
require("dotenv").config();

const express = require("express");
const path = require("path");
const Stripe = require("stripe");
const fs = require("fs");
const crypto = require("crypto");

const app = express();
const PORT = Number(process.env.PORT) || 4242;
const APP_URL = (
  process.env.APP_URL || `http://localhost:${PORT}`
).replace(/\/+$/, "");

const SUBSCRIPTIONS_FILE = path.join(
  __dirname,
  "subscriptions.json"
);

const BILLING_MODE = process.env.BILLING_MODE || "mock";
const stripeSecretKey = process.env.STRIPE_SECRET_KEY || "";

// Safety: this development setup accepts test keys only.
if (!["mock", "stripe"].includes(BILLING_MODE)) {
  throw new Error("BILLING_MODE must be mock or stripe.");
}

if (
  BILLING_MODE === "stripe" &&
  !stripeSecretKey.startsWith("sk_test_")
) {
  throw new Error(
    "Stripe mode requires an sk_test_ secret key. " +
    "Use BILLING_MODE=mock until test credentials are available."
  );
}

const stripe = stripeSecretKey
  ? Stripe(stripeSecretKey)
  : null;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const PLANS = {
  basic: {
    name: "Basic",
    priceId: process.env.STRIPE_PRICE_BASIC || "",
    amount: 1000,
    currency: "eur"
  },
  premium: {
    name: "Premium",
    priceId: process.env.STRIPE_PRICE_PREMIUM || "",
    amount: 2500,
    currency: "eur"
  }
};

// Read subscription records.
function readSubscriptions() {
  try {
    const content = fs.readFileSync(
      SUBSCRIPTIONS_FILE,
      "utf8"
    );
    const data = JSON.parse(content);

    if (!data || !Array.isArray(data.subscriptions)) {
      throw new Error("Invalid subscriptions.json structure.");
    }

    return data.subscriptions;
  } catch (error) {
    if (error.code === "ENOENT") {
      fs.writeFileSync(
        SUBSCRIPTIONS_FILE,
        JSON.stringify({ subscriptions: [] }, null, 2)
      );
      return [];
    }

    throw error;
  }
}

// Save subscription records.
function writeSubscriptions(subscriptions) {
  fs.writeFileSync(
    SUBSCRIPTIONS_FILE,
    JSON.stringify({ subscriptions }, null, 2)
  );
}

// Health check.
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    message: "CloudDesk backend is running",
    billingMode: BILLING_MODE
  });
});

// Available plans.
app.get("/api/plans", (req, res) => {
  res.json({
    plans: Object.entries(PLANS).map(([id, plan]) => ({
      id,
      name: plan.name,
      amount: plan.amount,
      currency: plan.currency
    })),
    billingMode: BILLING_MODE,
    billingConfigured: Boolean(
      stripe &&
      PLANS.basic.priceId &&
      PLANS.premium.priceId
    )
  });
});

// Demo records endpoint.
app.get("/api/subscriptions", (req, res) => {
  if (BILLING_MODE !== "mock") {
    return res.status(403).json({
      error: "This records endpoint is only available in mock mode."
    });
  }

  try {
    return res.json({
      subscriptions: readSubscriptions()
    });
  } catch (error) {
    console.error("Could not read subscriptions:", error.message);

    return res.status(500).json({
      error: "Could not read subscription records."
    });
  }
});

// Create a mock subscription or a Stripe Checkout Session.
app.post("/api/subscribe", async (req, res) => {
  const { plan } = req.body || {};

  if (
    typeof plan !== "string" ||
    !Object.prototype.hasOwnProperty.call(PLANS, plan)
  ) {
    return res.status(400).json({
      error: "Choose a valid plan: basic or premium."
    });
  }

  const selectedPlan = PLANS[plan];

  // Mock mode: no real payment is processed.
  if (BILLING_MODE === "mock") {
    try {
      const subscriptions = readSubscriptions();

      const subscription = {
        id: crypto.randomUUID(),
        plan,
        planName: selectedPlan.name,
        amount: selectedPlan.amount,
        currency: selectedPlan.currency,
        status: "demo",
        billingMode: "mock",
        createdAt: new Date().toISOString()
      };

      subscriptions.push(subscription);
      writeSubscriptions(subscriptions);

      console.log("Demo subscription saved:", subscription.id);

      return res.status(201).json({
        message: "Demo subscription record saved successfully.",
        subscription,
        url: `/success?plan=${plan}&mode=mock`
      });
    } catch (error) {
      console.error("Could not save subscription:", error.message);

      return res.status(500).json({
        error: "Could not save the demo subscription record."
      });
    }
  }

  // Real Stripe Checkout: test credentials and Price IDs required.
  if (!stripe) {
    return res.status(503).json({
      error: "Stripe test secret key is not configured."
    });
  }

  if (!selectedPlan.priceId) {
    return res.status(503).json({
      error: `${selectedPlan.name} Stripe Price ID is missing.`
    });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [
        {
          price: selectedPlan.priceId,
          quantity: 1
        }
      ],
      success_url:
        `${APP_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${APP_URL}/cancel`,
      metadata: {
        selected_plan: plan
      },
      subscription_data: {
        metadata: {
          selected_plan: plan
        }
      }
    });

    if (!session.url) {
      throw new Error("Stripe did not return a Checkout URL.");
    }

    return res.json({
      mode: "stripe",
      url: session.url
    });
  } catch (error) {
    console.error("Stripe Checkout error:", error.message);

    return res.status(502).json({
      error: "Could not create Stripe Checkout Session. " +
        "Check your test key, Price ID and Stripe configuration."
    });
  }
});

// Return page. A redirect alone does not prove payment succeeded.
app.get("/success", (req, res) => {
  if (req.query.mode === "mock") {
    const planName =
      req.query.plan === "premium" ? "Premium" :
      req.query.plan === "basic" ? "Basic" : "Unknown";

    return res.send(`
      <!doctype html>
      <html lang="en">
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>Demo Subscription</title>
        </head>
        <body>
          <h1>Demo subscription flow completed!</h1>
          <p>This is a mock test. No payment was processed.</p>
          <p>Selected plan: ${planName}</p>
          <a href="/">Return to CloudDesk</a>
        </body>
      </html>
    `);
  }

  return res.send(`
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Checkout Return</title>
      </head>
      <body>
        <h1>Returned from Checkout</h1>
        <p>This return page does not confirm payment or an active subscription.</p>
        <p>Payment status must be verified with Stripe on the server.</p>
        <a href="/">Return to CloudDesk</a>
      </body>
    </html>
  `);
});

// Checkout cancellation page.
app.get("/cancel", (req, res) => {
  res.send(`
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Checkout Cancelled</title>
      </head>
      <body>
        <h1>Checkout cancelled</h1>
        <p>You returned without completing Checkout.</p>
        <a href="/">Return to CloudDesk</a>
      </body>
    </html>
  `);
});

// Start server.
app.listen(PORT, () => {
  console.log(`CloudDesk running at ${APP_URL}`);
  console.log(`Billing mode: ${BILLING_MODE}`);
  console.log(`Stripe configured: ${Boolean(stripe)}`);
});
