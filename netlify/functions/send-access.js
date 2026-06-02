/**
 * Netlify Serverless Function — send-access
 *
 * Flow:
 *  1. Receives orderId + plan + buyerEmail from the browser (after PayPal capture)
 *  2. Verifies the PayPal order is truly COMPLETED via PayPal's API (server-to-server)
 *  3. Sends the Gumroad access code to the buyer's email via Brevo
 *  4. The code NEVER appears in the browser — only in the email
 *
 * Environment variables (set in Netlify dashboard → Site Settings → Environment):
 *   PAYPAL_CLIENT_ID      — from developer.paypal.com (same as in checkout.html)
 *   PAYPAL_CLIENT_SECRET  — from developer.paypal.com (reveal the secret in your app)
 *   PAYPAL_ENV            — "sandbox" for testing, "live" for production
 *   BREVO_API_KEY         — from brevo.com (free account → API Keys)
 *   SENDER_EMAIL          — your verified sender email in Brevo (e.g. you@gmail.com)
 *   GUMROAD_CODE          — DARKACCESS100
 *   GUMROAD_LINK_PHASE1   — https://thedarkprotocol.gumroad.com/l/iqsfl
 *   GUMROAD_LINK_COMPLETE — https://thedarkprotocol.gumroad.com/l/sabryi
 */

// Allow requests only from your GitHub Pages domain
const ALLOWED_ORIGIN = 'https://victorsg1.github.io';

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  // ── Parse body ──────────────────────────────────────────────────
  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { orderId, plan, buyerEmail, buyerName } = body;

  // ── Input validation ────────────────────────────────────────────
  if (!orderId || !plan || !buyerEmail) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing required fields' }) };
  }

  // PayPal order IDs are alphanumeric, 10+ characters
  if (!/^[A-Z0-9]{10,}$/i.test(orderId.trim())) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid order ID format' }) };
  }

  const validPlans = ['phase1', 'complete', 'upgrade'];
  if (!validPlans.includes(plan)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid plan' }) };
  }

  // Basic email format check
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(buyerEmail)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid email' }) };
  }

  // ── PayPal server-side verification ────────────────────────────
  const isSandbox = process.env.PAYPAL_ENV === 'sandbox';
  const paypalBase = isSandbox
    ? 'https://api-m.sandbox.paypal.com'
    : 'https://api-m.paypal.com';

  try {
    // Step 1: Get access token using Client ID + Secret (never exposed to browser)
    const authRes = await fetch(`${paypalBase}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(
          process.env.PAYPAL_CLIENT_ID + ':' + process.env.PAYPAL_CLIENT_SECRET
        ).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: 'grant_type=client_credentials'
    });

    const authData = await authRes.json();

    if (!authData.access_token) {
      console.error('[send-access] PayPal auth failed:', JSON.stringify(authData));
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'PayPal auth failed' }) };
    }

    // Step 2: Fetch order details — verify it's truly COMPLETED
    const orderRes = await fetch(`${paypalBase}/v2/checkout/orders/${orderId}`, {
      headers: {
        'Authorization': `Bearer ${authData.access_token}`,
        'Content-Type': 'application/json'
      }
    });

    const orderData = await orderRes.json();

    if (orderData.status !== 'COMPLETED') {
      console.error('[send-access] Order not completed:', orderId, orderData.status);
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Payment not verified — order status: ' + orderData.status })
      };
    }

    // ── Send access email via Brevo ─────────────────────────────
    const code = process.env.GUMROAD_CODE;
    const gumroadLink = plan === 'phase1'
      ? process.env.GUMROAD_LINK_PHASE1
      : process.env.GUMROAD_LINK_COMPLETE;

    const planLabel = plan === 'phase1'
      ? 'Phase I — The Iron Mindset'
      : plan === 'upgrade'
        ? 'Complete System (Upgrade)'
        : 'Complete System — All 6 Phases';

    const emailRes = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': process.env.BREVO_API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        sender: {
          name: 'The Dark Protocol',
          email: process.env.SENDER_EMAIL
        },
        to: [{ email: buyerEmail, name: buyerName || 'Customer' }],
        subject: 'Your Access Code — The Dark Protocol',
        htmlContent: buildEmailHTML(buyerName, planLabel, gumroadLink, code, orderId)
      })
    });

    // Brevo returns 201 on success, body contains messageId
    if (emailRes.status === 201) {
      console.log('[send-access] Email sent to:', buyerEmail, 'plan:', plan, 'order:', orderId);
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    } else {
      const emailErr = await emailRes.json();
      console.error('[send-access] Brevo error:', JSON.stringify(emailErr));
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Email delivery failed' }) };
    }

  } catch (err) {
    console.error('[send-access] Unhandled error:', err.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Internal server error' }) };
  }
};

// ── Email template ──────────────────────────────────────────────
function buildEmailHTML(name, planLabel, gumroadLink, code, orderId) {
  const greeting = name ? `Hey ${name},` : 'Hey,';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Your Access — The Dark Protocol</title>
</head>
<body style="background:#0A0A0A;margin:0;padding:0;font-family:Georgia,serif;">
<div style="max-width:580px;margin:0 auto;padding:40px 24px;">

  <!-- Header -->
  <div style="text-align:center;padding-bottom:24px;border-bottom:1px solid rgba(201,169,110,0.2);margin-bottom:32px;">
    <p style="font-size:10px;letter-spacing:3px;color:#C9A96E;margin:0 0 8px;text-transform:uppercase;">The Dark Protocol</p>
    <h1 style="font-size:28px;color:#FFFFFF;margin:0;font-weight:700;">Access Confirmed ✓</h1>
  </div>

  <!-- Body -->
  <p style="color:#AAAAAA;font-size:15px;line-height:1.8;margin-bottom:28px;">
    ${greeting}<br><br>
    Your payment for <strong style="color:#F5F3EF;">${planLabel}</strong> has been verified and confirmed.
    Follow the two steps below to access your content.
  </p>

  <!-- Step 1 -->
  <div style="background:#111111;border:1px solid rgba(201,169,110,0.2);border-radius:6px;padding:24px;margin-bottom:14px;">
    <p style="font-size:10px;letter-spacing:2px;color:#888888;text-transform:uppercase;margin:0 0 14px;">
      Step 1 — Open your content page
    </p>
    <a href="${gumroadLink}"
       style="display:block;background:linear-gradient(135deg,#C9A96E,#E8C98A);color:#0A0A0A;font-family:Arial,sans-serif;font-weight:800;font-size:14px;letter-spacing:1.5px;padding:16px 24px;border-radius:4px;text-decoration:none;text-align:center;text-transform:uppercase;">
      Access Your Content →
    </a>
  </div>

  <!-- Step 2 -->
  <div style="background:#111111;border:1px dashed rgba(201,169,110,0.35);border-radius:6px;padding:24px;margin-bottom:28px;text-align:center;">
    <p style="font-size:10px;letter-spacing:2px;color:#888888;text-transform:uppercase;margin:0 0 6px;">
      Step 2 — Enter your access code
    </p>
    <p style="font-size:13px;color:#666666;margin:0 0 18px;line-height:1.6;">
      Click <strong style="color:#AAAAAA;">"I want this"</strong> on the Gumroad page,<br>
      then paste this code at checkout for 100% off:
    </p>
    <div style="background:rgba(201,169,110,0.08);border:1px solid rgba(201,169,110,0.3);border-radius:4px;padding:16px 28px;display:inline-block;">
      <span style="font-family:'Courier New',Courier,monospace;font-size:28px;font-weight:700;color:#C9A96E;letter-spacing:5px;">${code}</span>
    </div>
    <p style="font-size:12px;color:#555555;margin:12px 0 0;">Free download — enter your email on Gumroad to receive your files</p>
  </div>

  <!-- Footer -->
  <div style="border-top:1px solid rgba(255,255,255,0.06);padding-top:20px;text-align:center;">
    <p style="color:#444444;font-size:11px;line-height:1.9;margin:0;">
      Order ID: <span style="color:#666666;font-family:'Courier New',monospace;font-size:10px;">${orderId}</span><br>
      Having trouble? Reply to this email or contact
      <a href="mailto:support@thedarkprotocol.com" style="color:#C9A96E;text-decoration:none;">support@thedarkprotocol.com</a><br><br>
      <strong style="color:#C9A96E;letter-spacing:2px;font-size:12px;">THE DARK PROTOCOL</strong>
    </p>
  </div>

</div>
</body>
</html>`;
}
