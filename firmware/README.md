# Smart Grid Node (ESP32 Firmware)

This directory contains the C++ firmware for the ESP32 microcontrollers that act as the physical hardware nodes in the Smart Grid Energy (SolarShare) network.

While `simulateHardware.js` in the root directory simulates multiple houses simultaneously for software testing, this firmware is designed to run on individual, physical ESP32 boards (one per house).

## Features
- **WiFi Connectivity**: Connects to the local network to communicate with the cloud.
- **Firebase Firestore Integration**: Uses `mobizt/Firebase-ESP-Client` to push telemetry directly to Firestore in real-time.
- **Sensor Polling**: Designed to read analog voltages from battery BMS, solar inverters, and CT sensors for consumption (mocked with `random()` in the demo sketch, ready for real ADC pins).
- **Contactor Actuation**: Uses GPIO pins to physically open/close the high-voltage relays based on the current grid mode (GRID, P2P, BATTERY, FAULT).

## Dependencies
To compile this sketch in the Arduino IDE, you need to install the following libraries via the Library Manager:
- **Firebase ESP Client** by mobizt (v4.3.0 or later)
- **ArduinoJson** by Benoit Blanchon (v6.0 or later)

## Hardware Setup
- **Pin 34**: Analog input for Battery Voltage (requires voltage divider).
- **Pin 35**: Analog input for Solar Generation (CT sensor).
- **Pin 18**: Output to Grid Contactor Relay (Active HIGH).
- **Pin 19**: Output to Battery/P2P Bus Contactor Relay (Active HIGH).
- **Pin 21**: Output to Isolation/Fault Contactor Relay (Active HIGH).

## Installation & Flashing
1. Open `SmartGridNode.ino` in the Arduino IDE.
2. Select your ESP32 board (`Tools > Board > ESP32 Dev Module`).
3. Update the `WIFI_SSID` and `WIFI_PASSWORD` macros.
4. Replace `USER_EMAIL` and `USER_PASSWORD` with the specific Firebase user credentials for the house this ESP32 is deployed to (e.g., House A).
5. Compile and upload.

## How it mirrors `simulateHardware.js`
The `loop()` runs every 10 seconds. It calculates the energy metrics, determines the current operating mode based on battery levels and generation thresholds, fires the physical GPIO relays to route power, and then pushes a JSON payload directly to the `/houses/{houseId}` and `/system/grid_state` collections in Firestore, instantly updating the React Native mobile app.
