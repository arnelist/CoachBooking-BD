# CoachBooking

A booking and management system for personal training sessions, built as a thesis project.

- **Clients** book a free time slot with a trainer, pay by card, cancel up to 24 h before the start and check in by scanning a QR code.
- **Trainers** register with a CV, manage their weekly schedule, reschedule or cancel reservations and mark attendance.
- **Administrators** approve trainer registrations, manage locations and trainers, and can delete a trainer together with refunds.

A booked time slot is held for 10 minutes until the payment succeeds. A reservation is confirmed only by a signed Stripe webhook event, so every confirmed reservation has a successful payment. All times use the Europe/Vilnius time zone.

## Tech stack

| Part                      | Technologies                                                                                                        |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Mobile app (`mobile`)     | React Native 0.88, Expo SDK 58, React Navigation, Stripe React Native, expo-camera                                  |
| Admin panel (`admin-web`) | React 19, Vite, react-router-dom                                                                                    |
| Server (`functions`)      | Cloud Functions for Firebase (2nd gen, Node.js 24), Stripe                                                          |
| Backend services          | Firebase Authentication, Cloud Firestore, Cloud Storage, Cloud Scheduler, Secret Manager (region `europe-central2`) |

## Repository structure

```
├── mobile/              Mobile app for clients and trainers (Expo)
│   └── src/
│       ├── components/  Reusable UI components
│       ├── context/     Authentication and profile state
│       ├── navigation/  Screen sets by user role
│       ├── screens/     Login, client and trainer screens
│       ├── services/    Firebase, timeslot, reservation and file services
│       └── utils/       Date, price, error message and network helpers
├── admin-web/           Admin panel (React, Vite)
│   └── src/
│       ├── components/  Layout and trainer details panel
│       ├── context/     Admin authentication
│       ├── pages/       Login, trainers, locations
│       └── utils/       Price and trainer status helpers
├── functions/           Cloud Functions (index.js)
├── tests/               Firestore security rules tests
├── firestore.rules      Database security rules
├── storage.rules        Storage security rules
└── firebase.json        Firebase project configuration
```

## Requirements

- Node.js 24 and npm
- Firebase CLI: `npm install -g firebase-tools`
- A Firebase project on the Blaze plan (needed for Cloud Functions and scheduled functions)
- A Stripe account (test mode is enough)
- Expo Go on a phone, or an Android emulator from Android Studio
- Java 21 or newer, only to run the security rules tests

## Setup

1. Clone the repository and install dependencies:

   ```bash
   git clone https://github.com/arnelist/CoachBooking-BD.git
   cd CoachBooking-BD
   (cd mobile && npm install) && (cd admin-web && npm install) && (cd functions && npm install)
   ```

2. In the Firebase console, create a project on the Blaze plan. Enable the Email/Password sign-in method, and create a Cloud Firestore database and a Cloud Storage bucket in `europe-central2`.

3. Log in and select the project:

   ```bash
   firebase login
   firebase use --add
   ```

4. Save the secrets. `CHECKIN_SECRET` is any long random string used to sign check-in QR codes:

   ```bash
   firebase functions:secrets:set STRIPE_SECRET_KEY
   firebase functions:secrets:set CHECKIN_SECRET
   ```

5. Deploy the security rules and functions. If `STRIPE_WEBHOOK_SECRET` does not exist yet, enter a temporary value when asked:

   ```bash
   firebase deploy --only firestore,storage,functions
   ```

6. In the Stripe dashboard, create a webhook endpoint with the `stripeWebhook` function URL printed by the deploy. Select the events `payment_intent.succeeded` and `payment_intent.payment_failed`. Save its signing secret and deploy the functions again:

   ```bash
   firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
   firebase deploy --only functions
   ```

7. Create a TTL policy that removes expired unpaid reservations:

   ```bash
   gcloud firestore fields ttls update deleteAt --collection-group=reservations --enable-ttl
   ```

8. Create the administrator account. In Firebase Authentication, add a user. Then in the `users` collection, add a document with the same ID and the fields `firstName`, `lastName`, `email` and `role: "admin"`.

9. In `mobile` and `admin-web`, copy `.env.example` to `.env`. Fill in the web app configuration from the Firebase project settings, and add the Stripe publishable key in `mobile/.env`.

## Running

Admin panel:

```bash
cd admin-web
npm run dev
```

Log in with the administrator account and create at least one active location. Trainers can't register without one. `npm run build` creates a production build in `admin-web/dist`.

Mobile app:

```bash
cd mobile
npx expo start
```

Scan the QR code with Expo Go (the phone and computer must be on the same network), or press `a` to open the app in an Android emulator.

For payments, use Stripe test cards, for example `4242 4242 4242 4242` with any future expiry date and any CVC.

## Tests

The Firestore security rules are tested on the local Firestore emulator with a demo project, so real data is never used. The tests try 48 allowed and forbidden actions as a client, a trainer, an administrator and a signed-out user.

```bash
cd tests
npm install
npm run test:rules
```

## Configuration

| Setting                                             | Location             | Purpose                                                                                             |
| --------------------------------------------------- | -------------------- | --------------------------------------------------------------------------------------------------- |
| `EXPO_PUBLIC_FIREBASE_*` (6 variables)              | `mobile/.env`        | Firebase configuration for the app                                                                  |
| `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY`                | `mobile/.env`        | Stripe publishable key                                                                              |
| `VITE_FIREBASE_*` (6 variables)                     | `admin-web/.env`     | Firebase configuration for the admin panel                                                          |
| `STRIPE_SECRET_KEY`                                 | Secret Manager       | Stripe secret key                                                                                   |
| `STRIPE_WEBHOOK_SECRET`                             | Secret Manager       | Webhook signature verification                                                                      |
| `CHECKIN_SECRET`                                    | Secret Manager       | Check-in QR code signing                                                                            |
| `HOLD_MINUTES`, `CANCEL_HOURS`, `KEEP_EXPIRED_DAYS` | `functions/index.js` | Slot hold time (10 min), cancellation limit (24 h), how long expired reservations are kept (7 days) |

Scheduled functions:

| Function              | Schedule         | Purpose                                                            |
| --------------------- | ---------------- | ------------------------------------------------------------------ |
| `releaseExpiredHolds` | Every 5 minutes  | Cancels unpaid reservations whose hold expired and frees the slots |
| `retryRefunds`        | Every 30 minutes | Retries failed refunds of cancelled reservations                   |
| `deletePastFreeSlots` | Daily at 03:00   | Deletes free slots from past days                                  |

For real payments, replace the Stripe test keys (`pk_test_`, `sk_test_`) with live keys and create a new webhook endpoint.
