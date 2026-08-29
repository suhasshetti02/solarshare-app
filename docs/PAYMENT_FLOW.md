# Payment Flow

## 1. Offer Selected
A receiver chooses an energy offer from the list of available donors.

## 2. Create Payment Order
The app requests a Razorpay order from the backend via `/api/payment/create-order`.
The backend validates the request, offer, and calculates the amount: `energyOfferedKwh * pricePerKwh`.
The backend creates a `payments` document with status `PAYMENT_PENDING` and returns the `orderId`.

## 3. Payment Pending
The React Native app presents the Razorpay checkout UI to the user.

## 4. User Completes Payment
The user enters their details and completes the payment. 

## 5. Gateway Verification & Webhook
Razorpay hits the backend webhook `/api/payment/webhook`.
The backend verifies the signature.

## 6. Payment Verified & Transfer Authorized
The backend updates the payment status to `PAYMENT_VERIFIED`.
The backend creates a `transfer_sessions` document to authorize the hardware.
The backend writes a `START_TRANSFER` command to `hardware_commands`.

## 7. Hardware Transfer
The ESP32 executes the command via the PLC.
Upon completion, the ESP32 emits a `TRANSFER_COMPLETED` event.

## 8. Settlement
The backend listens to `TRANSFER_COMPLETED` and atomically transfers funds between the donor and receiver's `walletBalance` in Firestore.
