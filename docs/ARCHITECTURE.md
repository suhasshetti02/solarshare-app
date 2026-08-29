# Current Architecture Audit

## Mobile App Layer
- **Framework**: React Native + Expo (Expo Router)
- **UI Components**: Located in `src/components/`, largely styled with raw React Native styles and some `expo-linear-gradient`.
- **State/Hooks**: `src/context/AuthContext.tsx`, `src/context/EnergyContext.tsx`, `src/hooks/useGridState.ts`.

## Backend / Database Layer
- **Firebase Firestore**: Main database.
- **Client-Side Writes**: Currently, the mobile app modifies sensitive documents (wallet balance, hardware states, transaction completions) directly from the client via `src/services/requestService.ts` and `src/services/energyService.ts`.
- **Missing Backend**: There is no secure server-side environment (Cloud Functions or otherwise) for payment verification, hardware authorization, and settlement.

## Hardware / Telemetry Layer
- **Simulation**: Telemetry is currently faked using `simulateHardware.js`, which loops and populates Firestore with `Math.random()` values and fakes PLC switching states.
- **Client Fakes**: `dashboard.tsx` has `setTimeout` handlers that simulate hardware switching after 4 seconds and automatically settle the transaction.
- **Intended Flow**: ESP32 communicates with Firebase to read commands and publish telemetry. PLC handles deterministic switching.

## Major Issues to Address
1. Client directly alters `walletBalance`.
2. Client fakes hardware confirmations (`switchingConfirmed = true` after timeout).
3. Client auto-settles transactions.
4. No real payment gateway integration (Razorpay needed).
5. No backend to secure the Razorpay webhook and transaction state.
6. `simulateHardware.js` sits in the root directory.
