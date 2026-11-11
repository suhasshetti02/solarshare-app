# SolarShare — Smart Grid Energy Sharing

SolarShare is an Expo / React Native application prototype for monitoring household energy and coordinating peer-to-peer energy requests and offers. Firebase is used for real-time application data, while an Express backend handles payment and hardware-event settlement workflows.

> **Project status:** IoT / smart-grid prototype. The repository includes mobile UI, Firebase services, an Express payment backend, ESP32 firmware, and a hardware simulator. Physical switching still depends on the configured ESP32 / PLC integration; the local simulator is not proof of a deployed utility-grid connection.

## Main workflows

- Household dashboard for generation, consumption, battery, and system state.
- User and household context, authentication, and connectivity state.
- Direct energy requests and broadcast requests.
- Donor energy offers and receiver offer acceptance.
- Live request / offer updates through Firestore listeners.
- Razorpay order creation and webhook processing in the backend.
- Hardware command and event records used to coordinate transfer state.
- Backend wallet settlement only after a hardware-completion event is received.
- A JavaScript simulator for exercising the hardware workflow without physical equipment.

## Architecture and technology

| Layer | Technologies |
|---|---|
| Mobile app | React Native, Expo SDK 54, Expo Router, TypeScript |
| Client state / navigation | React Context, React Navigation, AsyncStorage |
| Backend | Node.js, Express, Firebase Admin SDK |
| Data | Firebase Firestore |
| Payments | Razorpay order and webhook integration |
| Hardware | ESP32 firmware (C++), Crouzet Millenium 3 PLC integration documented in hardware notes |
| Local testing | `scripts/simulator/simulateHardware.js` |

## Repository map

- `app/` — Expo Router screens and routes.
- `src/components/` — reusable UI components and energy-flow widgets.
- `src/context/` — authentication, connectivity, and energy context.
- `src/services/` — Firebase, energy, request, hardware, and initialization services.
- `backend/server.js` — Express API for payment and settlement events.
- `firmware/` — ESP32 firmware and firmware notes.
- `scripts/simulator/` — local hardware-event simulator.
- `docs/` — architecture, hardware integration, payment flow, failure handling, and integration checklist.
- `firestore.rules` — Firestore access rules.

## Run locally

Requirements: Node.js compatible with the Expo SDK in `package.json`, npm, an Expo-supported device/emulator, and Firebase project configuration.

Mobile application:

```bash
npm install
npx expo start
```

Run on Android / iOS / web using the Expo CLI options shown in the terminal.

Payment backend:

```bash
cd backend
npm install
npm start
```

Configure the Firebase Admin credentials and Razorpay environment variables required by `backend/server.js` before using payment routes. See `docs/PAYMENT_FLOW.md`.

For a local workflow without physical hardware, inspect the root scripts and use the dedicated simulator commands:

```bash
npm run demo:seed
npm run demo:verify
```

The `demo:bootstrap` script also deploys Firestore rules; use it only when you intend to change the configured Firebase project.

## Important security and correctness notes

- The backend currently contains development fallback values for Razorpay keys/webhook secret. Replace them with real secrets in environment variables; never use the fallback values for payments.
- The Express backend initializes Firebase Admin with a project ID; a service-account credential / workload identity must be configured for the target environment.
- Firestore security rules are part of the security boundary. Review them against every client write before deploying.
- The payment webhook must be tested against Razorpay's exact raw request body/signature requirements. Do not assume ordinary parsed JSON serialization is always equivalent to the provider's signed bytes.
- Client-side request status updates and backend settlement are distinct; do not describe a client state change as proof of physical energy transfer.
- The simulator is for isolated local testing, not a substitute for a safety-certified hardware interlock.
- Physical sensors are documented as hardware integration work; do not claim every current reading originates from installed sensors unless that deployment is verified.

## Further reading

- `docs/ARCHITECTURE.md`
- `docs/HARDWARE_INTEGRATION.md`
- `docs/PAYMENT_FLOW.md`
- `docs/FAILURE_HANDLING.md`
- `docs/INTEGRATION_CHECKLIST.md`
- `firmware/README.md`

## License

See repository licensing and component terms.
