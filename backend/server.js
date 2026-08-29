const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const crypto = require('crypto');
require('dotenv').config();

// Initialize Firebase Admin (in a real scenario, use a service account key)
// For local dev, if process.env.FIREBASE_CONFIG is set or GOOGLE_APPLICATION_CREDENTIALS
admin.initializeApp({
  projectId: "smart-grid-dev2"
});
const db = admin.firestore();

const app = express();
app.use(cors());
app.use(express.json());

const Razorpay = require('razorpay');

// Dummy Razorpay secret
const RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || "dummy_secret";

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_dummy',
  key_secret: process.env.RAZORPAY_KEY_SECRET || 'dummy_secret',
});

// 1. Create Payment Order
app.post('/api/payment/create-order', async (req, res) => {
  try {
    const { requestId, offerId, receiverId } = req.body;
    
    // Verify offer and request exist
    const reqSnap = await db.collection("broadcast_requests").doc(requestId).get();
    const offerSnap = await db.collection("energy_offers").doc(offerId).get();
    
    if (!reqSnap.exists || !offerSnap.exists) {
      return res.status(404).json({ error: "Request or Offer not found" });
    }

    const offerData = offerSnap.data();
    const reqData = reqSnap.data();

    // Server calculates amount
    const totalAmount = offerData.energyOfferedKwh * offerData.pricePerKwh;

    // Create Razorpay Order
    const options = {
      amount: Math.round(totalAmount * 100), // amount in the smallest currency unit (paise)
      currency: "INR",
      receipt: `rcpt_${crypto.randomBytes(4).toString('hex')}`
    };
    const order = await razorpay.orders.create(options);
    const orderId = order.id;
    
    // Create payment intent document
    await db.collection("payments").doc(orderId).set({
      orderId,
      requestId,
      offerId,
      receiverId,
      donorId: offerData.donorId,
      amount: totalAmount,
      status: "PAYMENT_PENDING",
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    res.json({ orderId, amount: totalAmount, currency: "INR", keyId: process.env.RAZORPAY_KEY_ID });
  } catch (error) {
    console.error("Create order error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// 2. Webhook for Payment Verification (Idempotent)
app.post('/api/payment/webhook', async (req, res) => {
  try {
    const signature = req.headers['x-razorpay-signature'];
    
    // Verify signature
    const expectedSignature = crypto
      .createHmac('sha256', RAZORPAY_WEBHOOK_SECRET)
      .update(JSON.stringify(req.body))
      .digest('hex');

    if (expectedSignature !== signature) {
      return res.status(400).json({ error: "Invalid signature" });
    }
    
    const { event, payload } = req.body;
    
    if (event === 'payment.captured') {
      const orderId = payload.payment.entity.order_id;
      
      await db.runTransaction(async (t) => {
        const paymentRef = db.collection("payments").where("orderId", "==", orderId).limit(1);
        const paymentSnap = await t.get(paymentRef);
        
        if (paymentSnap.empty) return; // Order not found
        
        const paymentDoc = paymentSnap.docs[0];
        const paymentData = paymentDoc.data();
        
        // Idempotency check
        if (paymentData.status !== "PAYMENT_PENDING") return;
        
        // Verify payment
        t.update(paymentDoc.ref, { status: "PAYMENT_VERIFIED", verifiedAt: admin.firestore.FieldValue.serverTimestamp() });
        
        // Authorize transfer
        const offerRef = db.collection("energy_offers").doc(paymentData.offerId);
        const reqRef = db.collection("broadcast_requests").doc(paymentData.requestId);
        
        const offerSnap = await t.get(offerRef);
        const reqSnap = await t.get(reqRef);
        
        const sessionRef = db.collection("transfer_sessions").doc();
        t.set(sessionRef, {
          requestId: paymentData.requestId,
          offerId: paymentData.offerId,
          donorId: paymentData.donorId,
          donorDisplayName: offerSnap.data().donorDisplayName,
          receiverId: paymentData.receiverId,
          receiverDisplayName: reqSnap.data().receiverDisplayName,
          estimatedKwh: offerSnap.data().energyOfferedKwh,
          estimatedCost: paymentData.amount,
          status: "transferring", // waiting for hardware
          transferStartedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        t.update(reqRef, { status: "transferring" });
        t.update(offerRef, { status: "transferring" });
        
        // Hardware Command
        const cmdRef = db.collection("hardware_commands").doc();
        t.set(cmdRef, {
          commandId: cmdRef.id,
          transferSessionId: sessionRef.id,
          commandType: "START_TRANSFER",
          requestedBy: paymentData.receiverId,
          targetHouse: offerSnap.data().donorHouseId, // The house giving energy
          status: "PENDING",
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
      });
    }
    
    res.json({ status: "ok" });
  } catch (error) {
    console.error("Webhook error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// 3. Listener for hardware_events to handle SETTLEMENT
db.collection("hardware_events").onSnapshot(async (snap) => {
  for (const change of snap.docChanges()) {
    if (change.type === "added") {
      const event = change.doc.data();
      
      // Look for hardware transfer completed
      if (event.eventType === "TRANSFER_COMPLETED" && event.transferSessionId) {
        // Perform atomic settlement
        await db.runTransaction(async (t) => {
          const sessionRef = db.collection("transfer_sessions").doc(event.transferSessionId);
          const sessionSnap = await t.get(sessionRef);
          
          if (!sessionSnap.exists) return;
          const sessionData = sessionSnap.data();
          
          if (sessionData.status === "completed") return; // Idempotency
          
          const donorRef = db.collection("users").doc(sessionData.donorId);
          const receiverRef = db.collection("users").doc(sessionData.receiverId);
          
          const [donorSnap, receiverSnap] = await Promise.all([t.get(donorRef), t.get(receiverRef)]);
          
          // Settle wallets securely on backend
          t.update(donorRef, { walletBalance: (donorSnap.data().walletBalance || 0) + sessionData.estimatedCost });
          t.update(receiverRef, { walletBalance: (receiverSnap.data().walletBalance || 0) - sessionData.estimatedCost });
          
          t.update(sessionRef, { status: "completed", completedAt: admin.firestore.FieldValue.serverTimestamp() });
          
          const reqRef = db.collection("broadcast_requests").doc(sessionData.requestId);
          t.update(reqRef, { status: "completed" });
          
          // Log transaction
          const txRef = db.collection("transactions").doc();
          t.set(txRef, {
            transferSessionId: sessionRef.id,
            donorUserId: sessionData.donorId,
            receiverUserId: sessionData.receiverId,
            energyKwh: sessionData.estimatedKwh,
            totalCost: sessionData.estimatedCost,
            status: "completed",
            createdAt: admin.firestore.FieldValue.serverTimestamp()
          });
        });
        console.log(`Settlement completed for session ${event.transferSessionId}`);
      }
    }
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Secure Payment Backend running on port ${PORT}`));
