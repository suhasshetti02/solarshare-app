# Smart Grid Energy (SolarShare)

A production-ready mobile application for real-time monitoring and peer-to-peer (P2P) trading within a smart grid energy network. Built with **React Native (Expo)**, **Firebase**, and **Node.js**, it features real-time power flow visualization, a decentralized marketplace for local energy sharing, and secure Razorpay payment integration with hardware interlocks.

## Problem
Households with solar panels often generate excess energy that goes to waste or is sold back to the main utility grid at very low rates. Conversely, neighbors without sufficient generation are forced to pay high utility rates for their power.

## Solution
SolarShare creates a localized micro-grid marketplace. It allows neighbors to buy and sell energy directly from one another. By matching surplus generation with local demand, it maximizes renewable energy usage and provides financial benefits to both buyers and sellers.

## Features
- **Real-Time Dashboard**: Live monitoring of solar generation, home consumption, and battery storage.
- **Hardware Telemetry**: Visualizes actual hardware status (contactor states, system modes like P2P or GRID).
- **P2P Energy Trading**: A marketplace to broadcast energy requests and submit dynamic pricing offers.
- **Secure Payments**: Razorpay integration with idempotent webhooks and secure backend wallet settlement.
- **Hardware Interlocks**: The app does not assume success. It waits for actual ESP32/PLC physical switching confirmation before settling funds.

## Architecture

### Mobile Application
- **Framework**: React Native + Expo
- **Routing**: Expo Router
- **State Management**: React Context, Firebase Realtime Sync

### Backend / Server
- **Platform**: Node.js + Express
- **Role**: Validates Razorpay payments securely. Idempotent webhook handling. Settles ledger balances securely via Firebase Admin SDK upon hardware confirmation.

### Database
- **Platform**: Firebase Firestore
- **Security Rules**: Locked down to prevent client-side wallet edits. All state mutations for transfers occur securely via the backend.

### Hardware (Physical Gateway & Safety)
- **IoT Gateway**: ESP32 for Firebase telemetry, heartbeat, and command ingestion.
- **Safety**: Crouzet Millenium 3 PLC for physical safety checks and relay switching.
- **Sensors**: ACS712 (Current), ZMPT101B (Voltage) [Hardware Team Pending]

## Project Structure
- `app/`: Expo Router application screens (UI).
- `src/components/`: Reusable React components and Animated UI elements.
- `src/services/`: Core business logic, Firebase abstractions, and P2P request workflows.
- `backend/`: Node.js Express server for secure payments and hardware event settlement.
- `firmware/`: C++ firmware for ESP32 microcontrollers.
- `scripts/simulator/`: Contains `simulateHardware.js` strictly for isolated local UI testing without physical hardware.
- `firestore.rules`: Database access and security rules.
- `docs/`: Architecture, Hardware Integration, Payment Flow, and Failure Handling documentation.

## Installation

### Prerequisites
- Node.js (v18+)
- Expo CLI (`npm install -g expo-cli`)

### Setup
1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd smartgrid-app
   ```
2. Install dependencies for mobile and backend:
   ```bash
   npm install
   cd backend && npm install
   ```

## Running Locally

### 1. Start the Backend Server
This handles payments and hardware event processing.
```bash
cd backend
npm start
```

### 2. Start the Hardware Simulator (For UI testing only)
If real hardware is not connected, use the simulator to mock ESP32 telemetry.
```bash
node scripts/simulator/simulateHardware.js
```

### 3. Start the Mobile App
In a separate terminal, start the Expo development server:
```bash
npm start
```
Use the Expo Go app on your physical device, or press `a` (Android) / `i` (iOS) to run in a simulator.

## Testing & Demo

You can bootstrap demo data (deploying Firestore rules and creating demo user accounts) by running:
```bash
npm run demo:bootstrap
```

**Demo Accounts:**
- House A: `h1.demo@solarshare.com` (Password: `password123`)
- House B: `h2.demo@solarshare.com` (Password: `password123`)
- House C: `h3.demo@solarshare.com` (Password: `password123`)
