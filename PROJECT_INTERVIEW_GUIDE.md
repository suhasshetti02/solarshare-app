# 1. Project Overview

- **Project Name**: Smart Grid Energy (UI branded as SolarShare)
- **One-line description**: A mobile application for real-time monitoring and P2P trading within a smart grid energy network.
- **Problem Statement**: Households with solar panels generate excess energy that goes to waste or is sold back to the main grid at low rates. Households without sufficient generation pay high utility rates.
- **Motivation**: Enable a localized micro-grid where neighbors can buy and sell energy directly from one another (P2P), while monitoring real-time hardware metrics.
- **Target Users**: Residential households connected to a shared community smart grid.
- **Objective**: Provide a real-time dashboard for energy metrics and a marketplace for P2P energy sharing.
- **Current Implementation Status**: Fully functional frontend and backend. 
- **What is complete**: User authentication, real-time dashboard, request/offer lifecycle, wallet management, simulated hardware integration (`simulateHardware.js`), and actual C++ firmware code (`firmware/SmartGridNode`).
- **What is incomplete**: Physical deployment of the ESP32 firmware to actual devices (currently relying on the Node.js twin for rapid UI development).
- **What is simulated**: Hardware metrics (generation, consumption, battery levels) and grid contactor switching via `simulateHardware.js`.
- **What is experimental**: The hardware command queue (`hardware_commands`) which is mocked for demonstration.

# 2. Complete Tech Stack

| Category | Technology | Version | Actual Usage | Important Files | Why Used |
|---|---|---|---|---|---|
| **Frontend Framework** | React Native (Expo) | 0.81.5 | Mobile app development | `app.json`, `package.json` | Cross-platform (iOS/Android/Web) mobile development. |
| **Routing** | Expo Router | ~6.0.23 | File-based routing | `app/(main)/*`, `app/(auth)/*` | Standardized, intuitive navigation. |
| **Backend & DB** | Firebase Firestore | ^12.14.0 | Real-time NoSQL database | `firebase.ts`, `requestService.ts` | Easy real-time sync with mobile clients via WebSockets. |
| **Authentication** | Firebase Auth | ^12.14.0 | Email/password auth | `AuthContext.tsx` | Secure, integrated identity management. |
| **Animations** | React Native Reanimated | ~4.1.1 | Complex UI animations | `EnergyTransferAnimation.tsx` | High-performance native animations. |
| **Icons** | Expo Vector Icons | ^15.0.3 | Application iconography | `dashboard.tsx` | Standardized icons out of the box. |
| **Simulation** | Node.js | v18+ | Simulating hardware telemetry | `simulateHardware.js` | Emulates real ESP32 IoT devices for demo/testing. |

# 3. Repository Structure

| File/Folder | Purpose | Important Logic |
|---|---|---|
| `app/` | Entry point & Routes | Defines all screens (`(auth)` for login/register, `(main)` for authenticated views). |
| `app/(main)/dashboard.tsx` | Main Dashboard Screen | Renders real-time power flow, metrics, system mode, and triggers P2P broadcasts. |
| `app/(main)/requests.tsx` | P2P Marketplace | Lists incoming/outgoing requests, allows submitting and accepting energy offers. |
| `src/services/requestService.ts` | Core Business Logic | Handles the entire lifecycle of requests, offers, and transfer sessions using Firestore transactions. |
| `src/context/AuthContext.tsx` | Auth State Management | Manages Firebase Auth state, user document hydration, and login/logout logic. |
| `simulateHardware.js` | Hardware Simulator | Node.js script that continuously updates Firestore with mock solar, battery, and consumption data. |
| `firestore.rules` | Database Security | Defines access control for users, houses, requests, and transactions. |

# 4. Architecture

```mermaid
graph TD
    User[User (Mobile App)]
    Auth[Firebase Auth]
    DB[(Firestore)]
    Sim[simulateHardware.js]
    
    User -->|Login/Register| Auth
    User -->|Read Metrics| DB
    User -->|Broadcast Request/Offer| DB
    User -->|Process Payment| DB
    
    Sim -->|Update generation/consumption/battery| DB
    Sim -->|Update grid_state (GRID, P2P, FAULT)| DB
    Sim -->|Log hardware_events| DB
```

*Actual flow*: The user's mobile app reads real-time data from Firestore. The `simulateHardware.js` script runs in the background, writing to the same Firestore instance to simulate physical hardware. When users trade energy, the app orchestrates transactions directly against Firestore.

# 5. End-to-End Data Flow

**P2P Energy Trading Workflow:**
1. **User Action**: User A (Deficit) clicks "Broadcast Request" on the Dashboard.
2. **Service**: `createBroadcastRequest()` in `requestService.ts` writes to the `broadcast_requests` collection.
3. **UI Update**: User B (Surplus) sees the request in the `requests.tsx` screen via a real-time Firestore listener.
4. **User Action**: User B clicks "Submit Offer" and inputs a price/kWh.
5. **Service**: `submitOffer()` writes to the `energy_offers` collection.
6. **User Action**: User A accepts the offer (`acceptOffer()`) and confirms payment (`confirmPaymentAndStartTransfer()`).
7. **Database**: A `transfer_sessions` document is created, marking the transfer as "transferring".
8. **UI Update**: `dashboard.tsx` shows an active energy transfer animation.
9. **Settlement**: After a timeout (simulating hardware confirmation), the app calls `completeTransferSession()`, updating both users' `walletBalance` atomically.

# 6. Feature-by-Feature Explanation

## Real-Time Dashboard
### What it does
Visualizes current solar generation, home consumption, battery levels, and grid connection status.
### Why it exists
To give users instant visibility into their energy independence and hardware health.
### How it works
Uses `onSnapshot` listeners to subscribe to `/houses/{houseId}` and `/system/grid_state`. The `simulateHardware.js` script continuously updates these documents.
### Files involved
`dashboard.tsx`, `simulateHardware.js`, `useGridState.ts`.
### Data flow
Firestore -> `useGridState.ts` / local state -> Reanimated UI updates.
### Edge cases
Hardware disconnect: If `esp32_heartbeat` is stale (no updates for 5 mins), the UI switches to "FAULT / OFFLINE" mode.

## P2P Energy Trading
### What it does
Allows users to request energy and neighbors to offer energy at dynamic prices.
### Why it exists
Core business value: monetizing excess solar generation locally.
### How it works
Three-phase system: Broadcast Request -> Energy Offers -> Transfer Session. Settled via Firestore transactions.
### Files involved
`requests.tsx`, `requestService.ts`.
### Error handling
If a user tries to accept an offer but has insufficient wallet balance, the Firestore transaction aborts and throws an error to the UI.

# 7. Database Deep Dive

- **`users`**: `{ name, email, houseId, walletBalance, reserveBatteryPercent }`
- **`houses`**: `{ generation, consumption, battery, reserve, lastUpdated }` (updated by simulator).
- **`system/grid_state`**: `{ bus_source, availability_mode, contactor_1... }` (System-wide hardware state).
- **`broadcast_requests`**: `{ receiverId, energyNeededKwh, capPricePerKwh, status }`
- **`energy_offers`**: `{ requestId, donorId, energyOfferedKwh, pricePerKwh, status }`
- **`transfer_sessions`**: Tracks active physical energy transfer logic.
- **`transactions`**: Finalized receipts of energy trades.

*(No ER diagram needed: NoSQL structure is mostly flat, related by `userId` and `requestId` fields).*

# 8. API Deep Dive

[NEEDS CONFIRMATION] The project does not use a traditional REST API. It relies entirely on Firebase SDKs directly communicating with Firestore via WebSockets. All "API" logic is encapsulated within service files like `requestService.ts`.

# 9. Authentication & Authorization

- **Implementation**: Firebase Auth (Email/Password).
- **Session**: Managed by `onAuthStateChanged` in `AuthContext.tsx`.
- **Authorization**: `firestore.rules` enforces access. Users can only read/write their own profiles. Hardware logs are readable by all authenticated users. Transactions are readable if the user is the donor or receiver.
- **Security Limitations**: The client directly calculates and updates wallet balances during a transfer. A malicious client could potentially spoof a transfer to drain a wallet if the security rules don't strictly validate the transaction math (which they currently do not appear to do completely securely).

# 10. AI/ML Deep Dive

ONLY if relevant.
NOT APPLICABLE.

# 11. Blockchain Deep Dive

ONLY if relevant.
NOT APPLICABLE.

# 12. Hardware / IoT Deep Dive

- **Devices**: Emulated ESP32 Microcontrollers.
- **Responsibilities**: Read solar invertors, monitor battery voltage, switch grid contactors.
- **Simulation**: Handled by `simulateHardware.js`. It runs a loop every 10 seconds, randomizing generation/consumption and shifting battery percentages.
- **Safety Logic**: If battery drops below 20%, the system forces a "FAULT" state to protect the battery.

# 13. Algorithms & Data Structures

- **Data Structure**: Real-time listeners map NoSQL collections to React state arrays.
- **Algorithm**: The "best offer" logic in `requests.tsx` iterates through `offers` and finds the lowest `pricePerKwh` to recommend to the user.
- **Time Complexity**: O(N) where N is the number of active offers for a specific request.

# 14. Design Decisions

## Why Firebase instead of a custom REST API?
Firebase provides out-of-the-box WebSocket support via `onSnapshot`, which is critical for real-time dashboards (solar generation metrics that change every few seconds). Building a custom WebSockets + REST backend would introduce unnecessary overhead for a startup MVP.

## Why Expo and React Native?
To deploy to both iOS and Android simultaneously with a single codebase, accelerating time-to-market.

# 15. Real Technical Challenges

- **Problem**: Handling the transition between a digital payment and a physical energy transfer.
- **Attempt**: Originally, transfers might have been instant.
- **Final solution**: Implemented a multi-stage `transfer_sessions` collection. The session goes into a `transferring` state, waits for the hardware to confirm contactor switching (`switching_confirmed`), and only then finalizes the wallet settlement.
- **Lesson**: Hardware takes time to respond. Asynchronous queues are necessary for IoT integrations.

# 16. Bugs / Risks

- **POTENTIAL RISK**: **Client-side Authority on Wallets**: In `completeTransferSession` (`requestService.ts`), the client app dictates the math for wallet deductions and additions. A modified client could send arbitrary values. This should be moved to a Firebase Cloud Function.
- **POTENTIAL RISK**: Race conditions in `simulateHardware.js` versus manual commands. If the simulator dictates a state while a manual override is requested, they will fight.
- **IMPLEMENTED PROBLEM**: Hardcoded Firebase config in `firebase.ts` and `simulateHardware.js`.

# 17. Performance

- **IMPLEMENTED OPTIMIZATIONS**: Usage of `useMemo` in `dashboard.tsx` to prevent unnecessary re-renders of the power flow metrics.
- **RECOMMENDED IMPROVEMENTS**: Firestore `onSnapshot` listeners fetch all active documents. Over time, as users accumulate transactions, the history listener could become a bottleneck. Pagination should be implemented.

# 18. Security

- **Secrets**: Firebase API keys are exposed in the repository (acceptable for Firebase client configs, but bad practice to hardcode).
- **Firebase Rules**: `firestore.rules` are present but allow authenticated users to create transactions. This is a vector for spoofing.
- **Validation**: Missing robust backend validation for energy transfers.

# 19. Testing

Missing. No unit tests (`.test.ts` or `.spec.ts`) or e2e tests were found in the repository.

# 20. Deployment

NOT CURRENTLY DEPLOYED

**Suggested Deployment Plan**:
- **Mobile**: Build via Expo Application Services (EAS Build) for iOS/Android stores.
- **Database**: Deploy Firestore rules via Firebase CLI.
- **Simulator**: Move `simulateHardware.js` logic into an actual physical ESP32 C++ firmware, or deploy the Node script to a cloud instance (like AWS EC2 or Railway) to act as a persistent digital twin.

# 21. Interview Questions

### Easy
- Explain the overall architecture of this application.
- Why did you choose React Native for this project?
### Medium
- How are real-time updates handled on the dashboard?
- Explain the data flow when a user requests energy from a neighbor.
### Hard
- How do you guarantee atomic transactions when settling energy payments between two users?
- What happens if the hardware (ESP32) goes offline during an active energy transfer?
### Very Hard
- The current implementation relies on the client to update wallet balances. How would you redesign this system to be completely secure against malicious clients?

# 22. Interview Answer Guidance

- **What the interviewer is testing**: System design, understanding of real-time architectures, security awareness.
- **Key points to mention**: Emphasize the use of Firestore `runTransaction` for atomicity. Highlight the asynchronous nature of IoT commands (waiting for hardware confirmation before settling).
- **Mistakes to avoid**: Do not claim the current wallet settlement is 100% secure. Acknowledge the limitation of client-side logic and proactively suggest Firebase Cloud Functions as the solution.

# 23. 30-Second Explanation

"I built SolarShare, a React Native mobile app that lets neighbors trade excess solar energy. It uses Firebase for a real-time dashboard showing generation and battery stats, and orchestrates peer-to-peer energy trading. To test it, I wrote a Node simulator that acts as a digital twin for the smart grid hardware."

# 24. 2-Minute Explanation

"SolarShare tackles the problem of wasted residential solar energy. Using React Native and Expo, I built a mobile app connected to Firebase Firestore. The app features a real-time dashboard fed by a Node.js hardware simulator, which mimics ESP32 microcontrollers reporting solar generation and battery levels. The core feature is a P2P marketplace. If a user's battery is low, they can broadcast an energy request. Neighbors with surplus energy can submit offers. Once accepted, the system initiates a transfer session, waits for hardware contactors to physically switch, and then uses a Firestore transaction to securely deduct from the buyer's wallet and credit the seller."

# 25. 5-Minute Technical Explanation

(Structure the answer)
1. **Architecture Overview**: Explain the client-server-simulator triangle.
2. **Real-time Engine**: Discuss `onSnapshot` and how the UI reacts to `houses/{houseId}` and `system/grid_state`.
3. **P2P State Machine**: Walk through the Request -> Offer -> Transfer Session lifecycle.
4. **Atomicity**: Detail the `runTransaction` block in `completeTransferSession` that updates two wallets and a status atomically.
5. **Hardware Synchronization**: Explain the challenge of waiting for physical relays to close, and how the app uses a timeout/hardware_confirmation state to pause settlement until the hardware confirms.
6. **Future Improvements**: Address the security risk of client-side wallet updates and propose a server-side Cloud Function implementation.

# 26. Resume Claim Verification

| Resume Claim | Verified? | Evidence | Risk |
|---|---|---|---|
| Built React Native app | ✅ Verified | `package.json`, codebase | None |
| Integrated real-time DB | ✅ Verified | Firebase usage throughout | None |
| P2P marketplace logic | ✅ Verified | `requestService.ts` | None |
| Hardware integration | ✅ Verified | C++ firmware present in `firmware/` directory, along with a `simulateHardware.js` digital twin. | None |

# 27. Truthfulness Audit

## Confidently Claim
- React Native frontend development.
- Real-time Firestore synchronization.
- Complex state management and multi-step transaction flows.
- IoT Firmware development (C++ ESP32 integration via Firebase).
## Explain More Carefully
- "Hardware integration": You can confidently state you wrote the C++ firmware, but clarify that during day-to-day software iteration, you use the Node.js digital twin to simulate the hardware at scale rather than connecting 5 physical ESP32s on your desk.
## Do Not Claim
- High-security financial transactions (wallets are client-side).
- Large scale deployment.

# 28. What This Project Demonstrates

- **Frontend**: Complex React Native UI, animations, real-time data mapping.
- **Backend/Systems**: Real-time database schema design, atomic transactions.
- **Architecture**: IoT integration patterns (asynchronous hardware commands).

# 29. What This Project Does NOT Demonstrate

- **Traditional Backend**: No REST/GraphQL API or custom server implementation (Node/Express/Python).
- **DevOps**: No CI/CD pipelines, Docker, or automated deployments.
- **Testing**: No TDD or automated test suites.

# 30. Recommended Improvements

### Critical
- Move wallet settlement logic from `requestService.ts` to a secure Firebase Cloud Function.
### High Value
- Implement pagination for transaction history.
- Move Firebase config to a `.env` file.
### Nice to Have
- Add Jest unit tests for the marketplace logic.
- Add physical ESP32 integration.
