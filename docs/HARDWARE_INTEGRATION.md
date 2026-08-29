# Hardware Integration Contract

## 1. ESP32 → Firebase Telemetry
The ESP32 is responsible for publishing telemetry to the `houses/{houseId}` and `system/grid_state` collections. The app does not write to these collections.

Telemetry Fields expected in `houses/{houseId}`:
- `generation` (Number): Solar generation in kW
- `consumption` (Number): House consumption in kW
- `battery` (Number): Battery SOC %
- `voltage` (Number): Current line voltage (TO BE CONFIRMED BY HARDWARE TEAM)
- `current` (Number): Current flow (TO BE CONFIRMED BY HARDWARE TEAM)
- `lastUpdated` (Timestamp): Timestamp of last reading

Telemetry Fields expected in `system/grid_state`:
- `bus_source` (String): 'GRID' | 'BATTERY' | 'P2P' | 'DUMP_LOAD'
- `esp32_heartbeat` (Timestamp): Continuously updated to prove online status
- `contactor_1` (Boolean): State of main grid contactor (TO BE CONFIRMED BY HARDWARE TEAM)
- `contactor_2` (Boolean): State of battery contactor
- `contactor_3` (Boolean): State of dump load contactor

## 2. Firebase → ESP32 Commands
The backend queues commands in `hardware_commands`. The ESP32 listens to this collection for new documents where `status == 'PENDING'`.
Command structure:
```json
{
    "commandId": "...",
    "type": "START_TRANSFER",
    "transferSessionId": "...",
    "targetHouse": "house_h1",
    "energyKwh": 5.0,
    "status": "PENDING"
}
```

## 3. ESP32 Heartbeat
The ESP32 must update `system/grid_state.esp32_heartbeat` at least once every 5 minutes. If this timestamp is older than 5 minutes, the app will show "Hardware Offline".

## 4. Command Acknowledgement
When the ESP32 receives a command, it updates the document:
```json
{
    "status": "RECEIVED",
    "deviceId": "ESP32_MAIN",
    "receivedAt": "<timestamp>"
}
```

## 5. PLC Interface
The ESP32 communicates with the Crouzet Millenium 3 PLC. The PLC has the final say on all switching operations for safety.

## 6. Switching Confirmation
Once the PLC confirms the switch, the ESP32 writes an event to `hardware_events`:
```json
{
    "eventType": "TRANSFER_COMPLETED",
    "transferSessionId": "...",
    "deviceId": "ESP32_MAIN",
    "timestamp": "<timestamp>"
}
```
The backend listens to this event to settle the transaction securely.

## 7. Failure States
If the PLC rejects the switch or a fault occurs, the ESP32 writes:
```json
{
    "eventType": "FAULT_DETECTED",
    "transferSessionId": "...",
    "details": "PLC rejected switch due to low voltage"
}
```

## 8. Device Identification
Devices must use a unique identifier (e.g., `ESP32_MAIN`) when acknowledging commands.

## 9. Firmware Version
The heartbeat or connection event should include the firmware version.

## 10. Retry Behavior
Commands expire after a set time. If the ESP32 drops offline, the backend will mark pending commands as EXPIRED.
