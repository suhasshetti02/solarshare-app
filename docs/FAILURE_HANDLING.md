# Failure Handling Matrix

| Scenario | Handled By | Result |
| --- | --- | --- |
| **ESP32 Offline** | App (`useGridState`) | Checks `esp32_heartbeat` timestamp. If > 5 minutes, UI disables hardware-dependent actions and shows "Hardware Offline". |
| **Firebase Unavailable** | App / SDK | Firebase SDK automatically retries. UI preserves local state. Unsafe commands cannot be sent. |
| **PLC Timeout / Rejection** | ESP32 / Backend | ESP32 emits `FAULT_DETECTED` hardware event. Backend marks transaction as failed. Payment is queued for reversal/refund. |
| **Hardware Switching Failed** | ESP32 | ESP32 emits `SWITCHING_FAILED`. Backend aborts transfer. UI shows failure. |
| **Payment Succeeds, Transfer Fails** | Backend | Backend tracks failure in `transfer_sessions`. Triggers refund logic (to be implemented via Razorpay API). Does NOT credit seller. |
| **Payment Fails** | Gateway / App | No hardware command is ever generated. UI shows payment failed. |
| **User Closes App** | Backend | Transaction continues server-side. App fetches updated state (`activeTransferSession`) upon reopening. |
| **Battery Drops Below Reserve** | ESP32 / PLC | Hardware serves as final safety layer. If battery < reserve, transfer is physically rejected. Backend also verifies reserve before authorizing transfer. |
