# F&G Auto Troubleshooter (GitHub Pages)

A static-first automobile troubleshooter + spare parts ordering site that runs on **GitHub Pages**.

## Features
- Guided troubleshooter + AI symptom input
- VIN decoder (NHTSA vPIC) and VIN→exact-fit parts matching (fitment map)
- Spare parts catalog + cart
- Order handoff: WhatsApp / Email
- Payments: Stripe Payment Link + Paystack Payment Page
- PDF invoice (Print to PDF) **Pro+**
- Mechanic directory
- Dealer/Mechanic onboarding (local storage + WhatsApp handoff) **Business**
- Monetization tiers (Free / Pro / Business) via access codes
- Dark/Light theme toggle, multi-currency, multi-language (EN/FR/AR)
- PWA installable + offline cache

## Quick start
1. Edit `data.js`:
   - `business.whatsappNumber` (digits only, e.g. 2348012345678)
   - `business.email`
   - `payments.stripePaymentLink` (Stripe Payment Link URL)
   - `payments.paystackPaymentPage` (Paystack payment page URL)
2. Push to GitHub.
3. GitHub repo → **Settings** → **Pages** → deploy from `main` branch.

## Fitment & OEM part numbers
- Fitment keys are: `MAKE|MODEL|YEAR|ENGINE` (uppercase)
- `fitment[key]` is a list of part IDs that fit.
- `oemPartNumbers[key][partId]` is an array of OEM numbers shown when that VIN/fitment is active.

Use **Admin → Fitment Builder** to edit fitment in your browser and export/import.

## Notes about SMS/WhatsApp auto-notifications
GitHub Pages cannot send SMS/WhatsApp automatically.
You can optionally add a webhook URL in `data.js` (`notifications.webhookUrl`) to forward order/onboarding payloads to Make/Zapier/Cloudflare Worker to send SMS/WhatsApp via providers like Twilio/Termii/WhatsApp Business API.

