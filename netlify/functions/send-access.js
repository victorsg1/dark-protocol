/**
 * Netlify Serverless Function — send-access
 *
 * Actions (POST JSON body):
 *  - { action: "send",   orderId }  (default) → verifies the PayPal order and emails
 *                                    the access link + code to the PayPal payer's email
 *  - { action: "verify", orderId }  → verifies the PayPal order and returns { verified, plan, value }
 *                                    (used by thank-you.html to gate content + the Purchase pixel)
 *
 * Security rules:
 *  - The plan is derived from the amount PayPal actually captured, never from the browser.
 *  - The email always goes to the PayPal payer's address, never to an address sent by the browser.
 *  - The access code NEVER appears in the browser or in this repo — only in env vars / the email.
 *  - If GUMROAD_ACCESS_TOKEN is set, each order gets its own single-use Gumroad offer code.
 *
 * Environment variables (Netlify → Project configuration → Environment variables):
 *   PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_ENV ("sandbox" | "live")
 *   BREVO_API_KEY, SENDER_EMAIL
 *   GUMROAD_LINK_PHASE1, GUMROAD_LINK_COMPLETE
 *   GUMROAD_ACCESS_TOKEN                 — optional, enables unique single-use codes
 *   GUMROAD_PRODUCT_ID_PHASE1            — required with GUMROAD_ACCESS_TOKEN
 *   GUMROAD_PRODUCT_ID_COMPLETE          — required with GUMROAD_ACCESS_TOKEN
 *   GUMROAD_CODE_PHASE1                  — fallback code valid ONLY for the Phase I product
 *   GUMROAD_CODE_COMPLETE                — fallback code valid ONLY for the Complete product
 *   GUMROAD_CODE                         — legacy shared fallback (avoid: works on both products)
 */

const ALLOWED_ORIGINS = [
  'https://victorsg1.github.io',
  'https://earnest-cheesecake-d8a287.netlify.app'
];

// Amount captured by PayPal → plan. Anything else is rejected.
const PLANS_BY_AMOUNT = {
  '9.00':  { plan: 'phase1',   product: 'PHASE1',   label: 'Phase I — The Iron Mindset' },
  '97.00': { plan: 'complete', product: 'COMPLETE', label: 'Complete System — All 6 Phases' },
  '67.00': { plan: 'upgrade',  product: 'COMPLETE', label: 'Complete System (Upgrade)' }
};

// Access emails can only be (re)sent for orders captured in the last 30 days
const SEND_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

exports.handler = async (event) => {
  const origin = event.headers && (event.headers.origin || event.headers.Origin);
  const headers = {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
    'Content-Type': 'application/json'
  };
  const reply = (statusCode, data) => ({ statusCode, headers, body: JSON.stringify(data) });

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return reply(405, { error: 'Method not allowed' });
  }

  // ── Parse body ──────────────────────────────────────────────────
  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return reply(400, { error: 'Invalid JSON' });
  }

  const orderId = typeof body.orderId === 'string' ? body.orderId.trim() : '';
  const action = body.action === 'verify' ? 'verify' : 'send';

  // PayPal order IDs are alphanumeric, 10+ characters
  if (!/^[A-Z0-9]{10,30}$/i.test(orderId)) {
    return reply(400, { error: 'Invalid order ID format' });
  }

  try {
    // ── PayPal server-side verification ──────────────────────────
    const order = await fetchPayPalOrder(orderId);
    if (!order) {
      return reply(404, { verified: false, error: 'Order not found' });
    }

    const unit = (order.purchase_units || [])[0] || {};
    const capture = ((unit.payments || {}).captures || [])[0];

    if (order.status !== 'COMPLETED' || !capture || capture.status !== 'COMPLETED') {
      console.error('[send-access] Order not completed:', orderId, order.status, capture && capture.status);
      return reply(400, { verified: false, error: 'Payment not completed' });
    }

    const amount = capture.amount || {};
    const planInfo = amount.currency_code === 'USD' ? PLANS_BY_AMOUNT[amount.value] : null;
    if (!planInfo) {
      console.error('[send-access] Unexpected amount:', orderId, amount.value, amount.currency_code);
      return reply(400, { verified: false, error: 'Unexpected payment amount' });
    }

    if (action === 'verify') {
      return reply(200, {
        verified: true,
        plan: planInfo.plan,
        value: Number(amount.value),
        currency: amount.currency_code
      });
    }

    // ── Send access email ────────────────────────────────────────
    const capturedAt = Date.parse(capture.create_time || order.create_time);
    if (!capturedAt || Date.now() - capturedAt > SEND_WINDOW_MS) {
      return reply(400, { error: 'Order too old — please contact support' });
    }

    const payer = order.payer || {};
    const buyerEmail = payer.email_address;
    const buyerName = (payer.name && payer.name.given_name) || '';
    if (!buyerEmail) {
      console.error('[send-access] No payer email on order:', orderId);
      return reply(500, { error: 'No payer email on order' });
    }

    const gumroadLink = process.env['GUMROAD_LINK_' + planInfo.product];
    const code = await getAccessCode(planInfo.product, orderId);
    if (!gumroadLink || !code) {
      console.error('[send-access] Missing Gumroad link or code for', planInfo.product);
      return reply(500, { error: 'Access configuration missing' });
    }

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
        htmlContent: buildEmailHTML(buyerName, planInfo.label, gumroadLink, code, orderId)
      })
    });

    // Brevo returns 201 on success, body contains messageId
    if (emailRes.status === 201) {
      console.log('[send-access] Email sent for order:', orderId, 'plan:', planInfo.plan);
      return reply(200, { success: true, plan: planInfo.plan });
    } else {
      const emailErr = await emailRes.json().catch(() => ({}));
      console.error('[send-access] Brevo error:', JSON.stringify(emailErr));
      return reply(500, { error: 'Email delivery failed' });
    }

  } catch (err) {
    console.error('[send-access] Unhandled error:', err.message);
    return reply(500, { error: 'Internal server error' });
  }
};

// ── PayPal ──────────────────────────────────────────────────────
async function fetchPayPalOrder(orderId) {
  const paypalBase = process.env.PAYPAL_ENV === 'sandbox'
    ? 'https://api-m.sandbox.paypal.com'
    : 'https://api-m.paypal.com';

  // Get access token using Client ID + Secret (never exposed to browser)
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
    throw new Error('PayPal auth failed: ' + (authData.error || authRes.status));
  }

  const orderRes = await fetch(`${paypalBase}/v2/checkout/orders/${encodeURIComponent(orderId)}`, {
    headers: {
      'Authorization': `Bearer ${authData.access_token}`,
      'Content-Type': 'application/json'
    }
  });
  if (orderRes.status === 404) return null;
  if (!orderRes.ok) throw new Error('PayPal order lookup failed: ' + orderRes.status);
  return orderRes.json();
}

// ── Gumroad access code ─────────────────────────────────────────
// With GUMROAD_ACCESS_TOKEN: one 100%-off code per order, usable once.
// The name is derived from the order ID, so a resend reuses the same code.
async function getAccessCode(product, orderId) {
  const token = process.env.GUMROAD_ACCESS_TOKEN;
  const productId = process.env['GUMROAD_PRODUCT_ID_' + product];

  if (token && productId) {
    try {
      const name = 'DP' + orderId.toUpperCase().slice(-12);
      const base = `https://api.gumroad.com/v2/products/${encodeURIComponent(productId)}/offer_codes`;

      const listRes = await fetch(`${base}?access_token=${encodeURIComponent(token)}`);
      const list = await listRes.json();
      if (list.success && (list.offer_codes || []).some((c) => c.name === name)) {
        return name;
      }

      const createRes = await fetch(base, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          access_token: token,
          name,
          amount_off: '100',
          offer_type: 'percent',
          max_purchase_count: '1'
        }).toString()
      });
      const created = await createRes.json();
      if (created.success) return name;
      console.error('[send-access] Gumroad offer code error:', JSON.stringify(created));
    } catch (err) {
      console.error('[send-access] Gumroad API failed:', err.message);
    }
  }

  // Per-product code, so a Phase I buyer can't use it on the Complete product
  return process.env['GUMROAD_CODE_' + product] || process.env.GUMROAD_CODE || null;
}

function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// ── Email template ──────────────────────────────────────────────
function buildEmailHTML(name, planLabel, gumroadLink, code, orderId) {
  const greeting = name ? `Hey ${escapeHTML(name)},` : 'Hey,';
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
      <span style="font-family:'Courier New',Courier,monospace;font-size:28px;font-weight:700;color:#C9A96E;letter-spacing:5px;">${escapeHTML(code)}</span>
    </div>
    <p style="font-size:12px;color:#555555;margin:12px 0 0;">Personal code — do not share it. Enter your email on Gumroad to receive your files.</p>
  </div>

  <!-- Footer -->
  <div style="border-top:1px solid rgba(255,255,255,0.06);padding-top:20px;text-align:center;">
    <p style="color:#444444;font-size:11px;line-height:1.9;margin:0;">
      Order ID: <span style="color:#666666;font-family:'Courier New',monospace;font-size:10px;">${escapeHTML(orderId)}</span><br>
      Having trouble? Reply to this email or contact
      <a href="mailto:support@thedarkprotocol.com" style="color:#C9A96E;text-decoration:none;">support@thedarkprotocol.com</a><br><br>
      <strong style="color:#C9A96E;letter-spacing:2px;font-size:12px;">THE DARK PROTOCOL</strong>
    </p>
  </div>

</div>
</body>
</html>`;
}
