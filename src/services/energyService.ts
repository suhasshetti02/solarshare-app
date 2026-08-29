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
  writeBatch,
  setDoc,
  runTransaction,
  orderBy,
} from 'firebase/firestore';
import { db } from './firebase';

export type Unsubscribe = () => void;

export interface UserDoc {
  userId?: string;
  name: string;
  email: string;
  houseId: string;
  walletBalance: number;
  donorEnabled: boolean;
  donorExtraRatePerKwh: number;
  reserveBatteryPercent: number;
  maxShareableEnergyKwh: number;
  createdAt?: Timestamp;
}

export interface Transaction {
  id: string;
  fromUser: string;
  toUser: string;
  units: number;
  totalCost: number;
  status: 'completed' | 'pending' | 'rejected';
  createdAt?: Timestamp;
}

export interface AvailabilityDoc {
  userId: string;
  houseId: string;
  name: string;
  isAvailable: boolean;
  availableEnergy: number;
  pricePerKwh: number;
  updatedAt?: Timestamp;
}

export interface RequestDoc {
  id: string;
  fromUser: string;
  fromHouseId: string;
  receiverName: string;
  toUser: string;
  toHouseId: string;
  donorName: string;
  units: number;
  pricePerKwh: number;
  totalAmount: number;
  status: 'pending' | 'accepted' | 'rejected' | 'completed' | 'transferring';
  createdAt?: Timestamp;
}

export interface NotificationDoc {
  id: string;
  userId: string;
  title: string;
  body: string;
  read: boolean;
  createdAt?: Timestamp;
}

/** Subscribe to users/{userId} */
export const subscribeUserDoc = (
  userId: string,
  onData: (data: UserDoc | null) => void,
  onError?: (err: Error) => void,
): Unsubscribe => {
  const ref = doc(db, 'users', userId);
  return onSnapshot(
    ref,
    (snap) => onData(snap.exists() ? ({ id: snap.id, ...snap.data() } as unknown as UserDoc) : null),
    (err) => onError?.(err)
  );
};

export const subscribeUserTransactions = (
  userId: string,
  onData: (transactions: any[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe => {
  const col = collection(db, 'transactions');
  // Query using the canonical field names written by approveEnergyRequest
  const asDonor = query(col, where('donorUserId', '==', userId));
  const asReceiver = query(col, where('receiverUserId', '==', userId));

  let donorDocs: any[] = [];
  let receiverDocs: any[] = [];

  const merge = () => {
    const seen = new Set<string>();
    const combined: any[] = [];
    for (const tx of [...donorDocs, ...receiverDocs]) {
      if (!seen.has(tx.id)) { seen.add(tx.id); combined.push(tx); }
    }
    combined.sort((a, b) => ((b.createdAt as any)?.seconds ?? 0) - ((a.createdAt as any)?.seconds ?? 0));
    onData(combined);
  };

  const unsubDonor = onSnapshot(asDonor,
    (snap) => { donorDocs = snap.docs.map((d) => ({ id: d.id, ...d.data() })); merge(); },
    (err) => onError?.(err)
  );
  const unsubReceiver = onSnapshot(asReceiver,
    (snap) => { receiverDocs = snap.docs.map((d) => ({ id: d.id, ...d.data() })); merge(); },
    (err) => onError?.(err)
  );

  return () => { unsubDonor(); unsubReceiver(); };
};

/** Publish availability/{userId} */
export const publishAvailability = async (
  userId: string,
  payload: Record<string, any>,
): Promise<void> => {
  if (!userId) return;
  const ref = doc(db, 'availability', userId);
  
  // Strictly enforce schema
  const data: Record<string, any> = {
    userId,
    houseId: payload.houseId ?? '',
    name: payload.name ?? '',
    isAvailable: payload.isAvailable ?? false,
    availableEnergy: parseFloat((payload.availableEnergy ?? 0).toFixed(2)),
    pricePerKwh: parseFloat((payload.pricePerKwh ?? 10).toFixed(2)),
    updatedAt: serverTimestamp(),
  };
  
  try {
    await updateDoc(ref, data);
  } catch {
    await setDoc(ref, data);
  }
};

/** Subscribe to available donors */
export const subscribeAvailableDonors = (
  currentUserId: string,
  onData: (donors: AvailabilityDoc[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe => {
  const q = query(collection(db, 'availability'), where('isAvailable', '==', true));
  return onSnapshot(
    q,
    (snap) => {
      const donors = snap.docs
        .map((d) => ({ ...d.data() } as AvailabilityDoc))
        .filter((d) => d.userId !== currentUserId);
      onData(donors);
    },
    (err) => onError?.(err)
  );
};

/** Subscribe to user requests */
export const subscribeUserRequests = (
  userId: string,
  onData: (requests: RequestDoc[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe => {
  const col = collection(db, 'requests');
  let asRequester: RequestDoc[] = [];
  let asDonor: RequestDoc[] = [];

  const merge = () => {
    const seen = new Set<string>();
    const combined: RequestDoc[] = [];
    for (const r of [...asRequester, ...asDonor]) {
      if (!seen.has(r.id)) { seen.add(r.id); combined.push(r); }
    }
    combined.sort((a, b) => ((b.createdAt as any)?.seconds ?? 0) - ((a.createdAt as any)?.seconds ?? 0));
    onData(combined);
  };

  const unsubRequester = onSnapshot(
    query(col, where('fromUserId', '==', userId)),
    (snap) => { asRequester = snap.docs.map((d) => ({ id: d.id, ...d.data() } as RequestDoc)); merge(); },
    (err) => onError?.(err)
  );
  const unsubDonor = onSnapshot(
    query(col, where('toUserId', '==', userId)),
    (snap) => { asDonor = snap.docs.map((d) => ({ id: d.id, ...d.data() } as RequestDoc)); merge(); },
    (err) => onError?.(err)
  );

  return () => { unsubRequester(); unsubDonor(); };
};

/** Create an energy request */
export const createEnergyRequest = async (payload: {
  fromUserId: string;
  fromUserName: string;
  toUserId: string;
  toUserName: string;
  houseId: string;
  requestedEnergy: number;
  pricePerKwh: number;
  totalCost: number;
}): Promise<string> => {
  const ref = await addDoc(collection(db, 'requests'), {
    fromUserId: payload.fromUserId,
    fromUserName: payload.fromUserName,
    toUserId: payload.toUserId,
    toUserName: payload.toUserName,
    houseId: payload.houseId,
    requestedEnergy: payload.requestedEnergy,
    pricePerKwh: payload.pricePerKwh,
    totalCost: payload.totalCost,
    status: 'PENDING',
    createdAt: serverTimestamp(),
  });

  return ref.id;
};

export const approveEnergyRequest = async (
  requestId: string,
): Promise<void> => {
  throw new Error("Client cannot approve energy requests and update wallets directly. Must use backend.");
};

/** Complete a request */
export const completeEnergyRequest = async (
  requestId: string,
): Promise<void> => {
  const ref = doc(db, 'requests', requestId);
  await updateDoc(ref, {
    status: 'COMPLETED',
    completedAt: serverTimestamp(),
  });
};

/** Reject a request */
export const rejectEnergyRequest = async (
  requestId: string,
): Promise<void> => {
  const ref = doc(db, 'requests', requestId);
  await updateDoc(ref, {
    status: 'REJECTED',
    rejectedAt: serverTimestamp(),
  });
};

export const completeMockPayment = async (_request?: RequestDoc): Promise<void> => {
  // no-op, done in approve
};

/** Subscribe to notifications */
export const subscribeUserNotifications = (
  userId: string,
  onData: (notifications: NotificationDoc[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe => {
  const q = query(
    collection(db, 'notifications'),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc'),
  );
  return onSnapshot(
    q,
    (snap) => onData(snap.docs.map((d) => ({ id: d.id, ...d.data() } as NotificationDoc))),
    (err) => onError?.(err)
  );
};
