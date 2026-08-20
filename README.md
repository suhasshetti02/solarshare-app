# Smart Grid Energy (SolarShare)

A mobile application for real-time monitoring and peer-to-peer (P2P) trading within a smart grid energy network. Built with **React Native (Expo)** and **Firebase**, it features real-time power flow visualization and a decentralized marketplace for local energy sharing.

## Problem
Households with solar panels often generate excess energy that goes to waste or is sold back to the main utility grid at very low rates. Conversely, neighbors without sufficient generation are forced to pay high utility rates for their power.

## Solution
SolarShare creates a localized micro-grid marketplace. It allows neighbors to buy and sell energy directly from one another. By matching surplus generation with local demand, it maximizes renewable energy usage and provides financial benefits to both buyers and sellers.

## Features
- **Real-Time Dashboard**: Live monitoring of solar generation, home consumption, and battery storage.
- **Hardware Telemetry**: Visualizes live hardware status (contactor states, system modes like P2P or GRID).
- **P2P Energy Trading**: A marketplace to broadcast energy requests and submit dynamic pricing offers.
- **Energy Wallet**: Real-time tracking of energy credits earned and spent during P2P transfers.
- **Asynchronous Hardware Simulation**: Includes a Node.js simulator (`simulateHardware.js`) that acts as a digital twin for ESP32 microcontrollers, mocking live hardware telemetry.

## Tech Stack
- **Frontend**: React Native, Expo, Expo Router
- **Backend & Database**: Firebase Firestore, Firebase Auth
- **Animations**: React Native Reanimated
- **Hardware Simulation / IoT**: Node.js (Digital Twin), C++ (ESP32 Firmware)

## Architecture
The application relies on real-time data synchronization via Firebase WebSockets (`onSnapshot`). 
1. **IoT Nodes**: The `firmware/` directory contains C++ ESP32 code that reads physical sensors, actuates relays, and patches Firestore.
2. **Simulator**: For local UI testing without physical hardware, `simulateHardware.js` mimics the ESP32s, pushing mock telemetry to Firestore.
3. **Mobile App**: Subscribes to Firestore documents to visualize live power flow.
4. **P2P Engine**: When a trade is initiated, the mobile app orchestrates a multi-step Firestore transaction. It waits for hardware contactor switching confirmation before atomically settling the users' wallets.

## Project Structure
- `app/`: Expo Router application screens (UI).
- `src/components/`: Reusable React components and Animated UI elements.
- `src/services/`: Core business logic, Firebase abstractions, and P2P request workflows.
- `firmware/`: C++ firmware for ESP32 microcontrollers.
- `simulateHardware.js`: Standalone IoT simulator script for software testing.
- `firestore.rules`: Database access and security rules.

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
2. Install dependencies:
   ```bash
   npm install
   ```

## Running Locally

To run the full simulation locally, you must run both the mobile app and the hardware simulator simultaneously.

### 1. Start the Hardware Simulator
This script mimics live ESP32 microcontrollers reporting house metrics and main grid contactor states.
```bash
node simulateHardware.js
```

### 2. Start the Mobile App
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

## Limitations
- **Hardware Integration**: The current implementation simulates hardware telemetry. Physical ESP32 integration would require replacing the Node.js script with C++ firmware.
- **Client-Side Settlements**: Currently, energy trading wallets are settled via client-side Firestore transactions. In a production environment, this logic must be moved to secure server-side infrastructure (e.g., Firebase Cloud Functions) to prevent malicious client manipulation.

## Future Improvements
- Migration of wallet transactions to Firebase Cloud Functions.
- Implementation of pagination for the transaction history feed.
- Persistent environment variables for Firebase configuration.
