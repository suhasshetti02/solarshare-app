import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
  runTransaction,
} from "firebase/firestore";
import { db } from "./firebase";

export type RequestStatus = "pending" | "accepted" | "transferring" | "completed" | "rejected";

export interface BroadcastRequest {
  id: string;
  receiverId: string;
  receiverHouseId: string;
  receiverDisplayName: string;
  energyNeededKwh: number;
  capPricePerKwh: number;
  status: "open" | "matched" | "payment_pending" | "transferring" | "hardware_confirmed" | "completed" | "expired" | "cancelled";
  createdAt?: Timestamp;
  expiresAt?: Timestamp;
  selectedOfferId?: string;
}

export interface TransferSession {
  id: string;
  requestId: string;
  offerId: string;
  donorId: string;
  donorDisplayName: string;
  receiverId: string;
  receiverDisplayName: string;
  estimatedKwh: number;
  estimatedCost: number;
  status: "transferring" | "hardware_confirmed" | "completed" | "failed";
  switchingConfirmed?: boolean;
  transferStartedAt?: Timestamp;
  completedAt?: Timestamp;
}

export interface EnergyOffer {
  id: string;
  requestId: string;
  donorId: string;
  donorHouseId: string;
  donorDisplayName: string;
  energyOfferedKwh: number;
  pricePerKwh: number;
  availabilityTier: string;
  status: "pending" | "accepted" | "rejected" | "expired";
  createdAt?: Timestamp;
}

export interface EnergyRequest {
  id: string;
  fromUserId: string; // Receiver
  fromHouseId: string;
  toUserId: string;   // Donor
  toHouseId: string;
  energyKwh: number;
  status: RequestStatus;
  createdAt?: Timestamp;
}

const COL = "energy_requests";
const TX_COL = "transactions";

export type Unsubscribe = () => void;

export async function createEnergyRequest(params: {
  fromUserId: string;
  fromHouseId: string;
  toUserId: string;
  toHouseId: string;
  energyKwh: number;
}): Promise<string> {
  const energyKwh = Number(params.energyKwh);
  const ref = await addDoc(collection(db, COL), {
    fromUserId: params.fromUserId,
    toUserId: params.toUserId,
    fromHouseId: params.fromHouseId,
    toHouseId: params.toHouseId,
    energyKwh,
    status: "pending" as const,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

/** Move request to accepted state */
export async function acceptRequest(requestId: string): Promise<void> {
  await updateDoc(doc(db, COL, requestId), { status: "accepted" });
}

/** Move request to transferring state */
export async function startTransfer(requestId: string): Promise<void> {
  await updateDoc(doc(db, COL, requestId), { status: "transferring" });
}

/** Atomically complete the transfer - DEPRECATED for client side */
export async function completeRequest(
  requestId: string,
  donorId: string,
  receiverId: string,
  donorHouseId: string,
  receiverHouseId: string,
  energyKwh: number
): Promise<void> {
  throw new Error("Client cannot directly complete requests. This must be done via secure backend settlement based on hardware confirmation.");
}

export async function rejectRequest(requestId: string): Promise<void> {
  await updateDoc(doc(db, COL, requestId), { status: "rejected" });
}

export function subscribeIncomingRequests(
  userId: string,
  onData: (requests: EnergyRequest[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const q = query(collection(db, COL), where("toUserId", "==", userId));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as EnergyRequest);
      list.sort((a, b) => {
        const ta = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
        const tb = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
        return tb - ta;
      });
      onData(list);
    },
    (e) => onError?.(e as Error),
  );
}

export function subscribeOutgoingRequests(
  userId: string,
  onData: (requests: EnergyRequest[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const q = query(collection(db, COL), where("fromUserId", "==", userId));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as EnergyRequest);
      list.sort((a, b) => {
        const ta = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
        const tb = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
        return tb - ta;
      });
      onData(list);
    },
    (e) => onError?.(e as Error),
  );
}

// ----------------------------------------------------
// PHASE 2: BROADCAST & OFFER WORKFLOW
// ----------------------------------------------------

export async function createBroadcastRequest(params: {
  receiverId: string;
  receiverHouseId: string;
  receiverDisplayName: string;
  energyNeededKwh: number;
  capPricePerKwh: number;
}): Promise<string> {
  const ref = await addDoc(collection(db, "broadcast_requests"), {
    ...params,
    status: "open",
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function submitOffer(params: {
  requestId: string;
  donorId: string;
  donorHouseId: string;
  donorDisplayName: string;
  energyOfferedKwh: number;
  pricePerKwh: number;
  availabilityTier: string;
}): Promise<string> {
  const ref = await addDoc(collection(db, "energy_offers"), {
    ...params,
    status: "pending",
    createdAt: serverTimestamp(),
  });
  
  // Notification to receiver
  const { getDoc } = await import('firebase/firestore');
  const reqSnap = await getDoc(doc(db, "broadcast_requests", params.requestId));
  if (reqSnap.exists()) {
    const receiverId = reqSnap.data().receiverId;
    await addDoc(collection(db, "notifications"), {
      userId: receiverId,
      title: 'New Offer Received',
      body: `${params.donorDisplayName} offered ${params.energyOfferedKwh} kWh at Rs.${params.pricePerKwh}/kWh.`,
      read: false,
      createdAt: serverTimestamp(),
    });
  }

  return ref.id;
}

export async function acceptOffer(requestId: string, offerId: string): Promise<void> {
  await runTransaction(db, async (transaction) => {
    const requestRef = doc(db, "broadcast_requests", requestId);
    const reqSnap = await transaction.get(requestRef);
    if (!reqSnap.exists() || reqSnap.data().status !== "open") {
      throw new Error("Request is no longer open.");
    }

    const offerRef = doc(db, "energy_offers", offerId);
    const offerSnap = await transaction.get(offerRef);
    if (!offerSnap.exists() || offerSnap.data().status !== "pending") {
      throw new Error("Offer is no longer available.");
    }

    const reqData = reqSnap.data();
    const offerData = offerSnap.data();

    // Mark request as payment_pending
    transaction.update(requestRef, {
      status: "payment_pending",
      selectedOfferId: offerId,
    });

    // Mark this offer as accepted
    transaction.update(offerRef, {
      status: "accepted",
    });
  });
  
  // Reject other offers
  const { getDocs, writeBatch } = await import('firebase/firestore');
  const offersQuery = query(collection(db, "energy_offers"), where("requestId", "==", requestId), where("status", "==", "pending"));
  const offersSnap = await getDocs(offersQuery);
  const batch = writeBatch(db);
  offersSnap.forEach(d => {
    if (d.id !== offerId) {
      batch.update(d.ref, { status: "rejected" });
    }
  });
  await batch.commit();

  // Notify donor
  const { getDoc } = await import('firebase/firestore');
  const offerDoc = await getDoc(doc(db, "energy_offers", offerId));
  if (offerDoc.exists()) {
    await addDoc(collection(db, "notifications"), {
      userId: offerDoc.data().donorId,
      title: 'Offer Accepted!',
      body: `Your offer of ${offerDoc.data().energyOfferedKwh} kWh was accepted.`,
      read: false,
      createdAt: serverTimestamp(),
    });
  }
}

export function subscribeActiveBroadcast(
  userId: string,
  onData: (request: BroadcastRequest | null) => void,
): Unsubscribe {
  const q = query(collection(db, "broadcast_requests"), where("receiverId", "==", userId), where("status", "==", "open"));
  return onSnapshot(q, (snap) => {
    if (snap.empty) {
      onData(null);
    } else {
      const d = snap.docs[0];
      onData({ id: d.id, ...d.data() } as BroadcastRequest);
    }
  });
}

export function subscribeOpenBroadcastsNearMe(
  userId: string,
  onData: (requests: BroadcastRequest[]) => void,
): Unsubscribe {
  const q = query(collection(db, "broadcast_requests"), where("status", "==", "open"));
  return onSnapshot(q, (snap) => {
    const list = snap.docs
      .map((d) => ({ id: d.id, ...d.data() } as BroadcastRequest))
      .filter((r) => r.receiverId !== userId); // don't show own requests
    list.sort((a, b) => {
      const ta = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
      const tb = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
      return tb - ta;
    });
    onData(list);
  });
}

export function subscribeOffersForRequest(
  requestId: string,
  onData: (offers: EnergyOffer[]) => void,
): Unsubscribe {
  const q = query(collection(db, "energy_offers"), where("requestId", "==", requestId));
  return onSnapshot(q, (snap) => {
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as EnergyOffer));
    list.sort((a, b) => {
      if (a.pricePerKwh !== b.pricePerKwh) {
        return a.pricePerKwh - b.pricePerKwh;
      }
      const ta = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
      const tb = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
      return ta - tb; // earliest first
    });
    onData(list);
  });
}

export async function rejectOffer(offerId: string): Promise<void> {
  const { updateDoc } = await import('firebase/firestore');
  await updateDoc(doc(db, "energy_offers", offerId), { status: "rejected" });
}

// ----------------------------------------------------
// PHASE 3: TRANSFER SESSION & SETTLEMENT
// ----------------------------------------------------

export async function confirmPaymentAndStartTransfer(requestId: string, offerId: string, receiverId: string): Promise<string> {
  // Step 1: Request order creation from backend
  const backendUrl = "http://localhost:3000"; // Ensure this matches your ngrok or deployed backend URL in production
  
  const res = await fetch(`${backendUrl}/api/payment/create-order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestId, offerId, receiverId })
  });
  
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || "Failed to create payment order on backend.");
  }
  
  const data = await res.json();
  
  // Step 2: Open Razorpay Checkout (PENDING SDK INTEGRATION)
  // To complete the deployable project, the 'react-native-razorpay' package MUST be installed,
  // which requires a custom Expo Dev Client build.
  // 
  // Example native code to be added:
  // const options = {
  //   description: 'Energy Transfer',
  //   currency: data.currency,
  //   key: data.keyId,
  //   amount: data.amount * 100,
  //   name: 'SolarShare',
  //   order_id: data.orderId,
  //   prefill: { contact: '', email: '' }
  // };
  // await RazorpayCheckout.open(options);

  throw new Error(`Order ${data.orderId} created on backend! Native Razorpay SDK integration (react-native-razorpay) is required to proceed with actual checkout UI.`);
}

export async function completeTransferSession(sessionId: string): Promise<void> {
  throw new Error("Client cannot settle transactions directly. Settlement occurs safely on the backend once hardware emits TRANSFER_COMPLETED.");
}

export function subscribeActiveTransferSession(
  userId: string,
  onData: (session: TransferSession | null) => void
): Unsubscribe {
  // Finds active transfer session for the user (as donor or receiver)
  // Firestore OR queries require composite indexes or multiple queries, so we do two and merge, or just subscribe where receiverId
  // Wait, user can be receiver OR donor.
  // Actually, we can just use two onSnapshots.
  let currentSession: TransferSession | null = null;
  const qR = query(collection(db, "transfer_sessions"), where("receiverId", "==", userId), where("status", "in", ["transferring", "hardware_confirmed"]));
  const unsubR = onSnapshot(qR, (snap) => {
    if (!snap.empty) {
      const d = snap.docs[0];
      currentSession = { id: d.id, ...d.data() } as TransferSession;
      onData(currentSession);
    } else {
      if (currentSession?.receiverId === userId) onData(null);
    }
  });

  const qD = query(collection(db, "transfer_sessions"), where("donorId", "==", userId), where("status", "in", ["transferring", "hardware_confirmed"]));
  const unsubD = onSnapshot(qD, (snap) => {
    if (!snap.empty) {
      const d = snap.docs[0];
      currentSession = { id: d.id, ...d.data() } as TransferSession;
      onData(currentSession);
    } else {
      if (currentSession?.donorId === userId) onData(null);
    }
  });

  return () => { unsubR(); unsubD(); };
}
