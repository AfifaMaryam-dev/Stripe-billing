# CloudDesk — Stripe Billing Starter

A small beginner-friendly Node.js + Express web application with a pricing page.
It intentionally does **not** process payments yet; it is a starter for implementing Stripe Billing yourself.

## Requirements

- Node.js (LTS recommended)
- Visual Studio Code

## Run the application

1. Extract this ZIP file.
2. Open the extracted `stripe-billing-starter` folder in VS Code.
3. Open **Terminal → New Terminal**.
4. Run:

   ```bash
   npm install
   ```

5. Start the app:

   ```bash
   npm start
   ```

6. Open http://localhost:4242 in your browser.
7. Click **Choose Basic** or **Choose Premium**. The page should show a message from the backend.

Check the backend health endpoint at http://localhost:4242/api/health.

Stop the server with `Ctrl+C`.

## Project structure

```text
stripe-billing-starter/
├── public/
│   └── index.html
├── .gitignore
├── package.json
├── README.md
└── server.js
```

## Where to implement Stripe

The demo endpoint is in `server.js`:

`POST /api/subscribe`

Replace the demo response with Stripe Checkout Session creation. Keep Stripe secret keys on the server in environment variables; do not put them in browser code or commit them to Git.

For a real SaaS app, also implement:
- authenticated user identity and server-side plan/price mapping
- signed Stripe webhook verification using the raw request body
- persistent customers, subscriptions, invoices, and processed webhook event IDs
- subscription status checks before granting paid access
- customer portal and handling for failed payments/cancellations

This demo is not production-ready and does not charge money.
