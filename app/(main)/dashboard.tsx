import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import {
  collection,
  doc,
  onSnapshot,
  query
} from "firebase/firestore";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Modal,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import AnimatedTouchable from "../../src/components/AnimatedTouchable";
import DashboardSkeleton from "../../src/components/DashboardSkeleton";
import EnergyTransferAnimation from "../../src/components/EnergyTransferAnimation";
import PowerFlowWidget from "../../src/components/PowerFlowWidget";
import SkeletonLoader from "../../src/components/SkeletonLoader";
import SmartToast from "../../src/components/SmartToast";
import StatusChip from "../../src/components/StatusChip";
import SystemHealthCard from "../../src/components/SystemHealthCard";
import EmptyState from "../../src/components/EmptyState";
import { useAuth } from "../../src/context/AuthContext";
import { useGridState } from "../../src/hooks/useGridState";
import { auth, db } from "../../src/services/firebase";

import { C } from "../../src/constants/Colors";

// Stale timeout: 6 hours — change this value to adjust how long data stays "live"
const STALE_MS = 6 * 60 * 60 * 1000; // 6 hours in ms

export const getDisplayName = (houseId: string): string => {
  const map: Record<string, string> = {
    house_h1: 'House A',
    house_h2: 'House B',
    house_h3: 'House C',
  };
  return map[houseId] ?? houseId;
};
type UserDoc = {
  name?: string;
  houseId?: string;
  house_id?: string;
  walletBalance?: number;
  donorEnabled?: boolean;
  reserveBatteryPercent?: number;
};

type HouseDoc = {
  generation?: number;
  consumption?: number;
  battery?: number;
  reserve?: number;
  lastUpdated?: any;
};

type DashboardStatus =
  | "OFFLINE"
  | "LOW_BATTERY"
  | "SURPLUS"
  | "DEFICIT"
  | "BALANCED";

type NeighborCard = {
  uid: string;
  name: string;
  houseId: string;
  net: number;
  battery: number;
  reserve: number;
};

const formatMoney = (amount: number) => `₹${Number(amount ?? 0).toFixed(2)}`;

const STATUS_META = {
  OFFLINE:     { label: 'Offline',              sub: 'No live data available.',              color: C.gray,   icon: 'cloud-offline-outline'   as const },
  LOW_BATTERY: { label: 'Low Battery',           sub: 'Battery below reserve threshold.',      color: C.yellow, icon: 'battery-dead-outline'     as const },
  SURPLUS:     { label: 'Surplus Energy',         sub: 'You can share energy with neighbors.',  color: C.green,  icon: 'trending-up-outline'      as const },
  DEFICIT:     { label: 'Energy Deficit',         sub: 'You may need energy from neighbors.',   color: C.red,    icon: 'trending-down-outline'    as const },
  BALANCED:    { label: 'Balanced',               sub: 'Generation and usage are balanced.',    color: C.blue,   icon: 'checkmark-circle-outline' as const },
};

const statusColor: Record<string, string> = {
  OFFLINE: C.gray, LOW_BATTERY: C.yellow, SURPLUS: C.green, DEFICIT: C.red, BALANCED: C.blue,
};

const statusCopy: Record<string, string> = {
  OFFLINE: 'System Offline', LOW_BATTERY: 'Low Battery', SURPLUS: 'Energy Surplus', DEFICIT: 'Energy Deficit', BALANCED: 'Balanced',
};

const SYSTEM_MODE_META: Record<string, { icon: string; title: string; desc: string; color: string; gradient: [string, string] }> = {
  GRID:        { icon: '🔌', title: 'Grid Mode',           desc: 'Running on utility power',              color: '#FFB800', gradient: ['rgba(255,184,0,0.18)',  'rgba(255,184,0,0.04)']  },
  BATTERY:     { icon: '🔋', title: 'Battery / P2P Mode',  desc: 'Neighborhood solar sharing active',      color: '#00FF94', gradient: ['rgba(0,255,148,0.18)', 'rgba(0,255,148,0.04)']  },
  P2P:         { icon: '🔋', title: 'Battery / P2P Mode',  desc: 'Neighborhood solar sharing active',      color: '#00FF94', gradient: ['rgba(0,255,148,0.18)', 'rgba(0,255,148,0.04)']  },
  DUMP_LOAD:   { icon: '⚡', title: 'Dump Load Mode',      desc: 'Excess energy being safely diverted',    color: '#00D4FF', gradient: ['rgba(0,212,255,0.18)', 'rgba(0,212,255,0.04)']  },
  FAULT:       { icon: '❌', title: 'Fault / Offline',     desc: 'Hardware communication unavailable',     color: '#FF4D6D', gradient: ['rgba(255,77,109,0.18)','rgba(255,77,109,0.04)']  },
  OFFLINE:     { icon: '❌', title: 'Fault / Offline',     desc: 'Hardware communication unavailable',     color: '#FF4D6D', gradient: ['rgba(255,77,109,0.18)','rgba(255,77,109,0.04)']  },
};

export default function DashboardScreen() {
  const router = useRouter();
  const { logout } = useAuth();

  const batteryAnim = useRef(new Animated.Value(0)).current;

  const [userDoc, setUserDoc] = useState<UserDoc | null>(null);
  const [houseDoc, setHouseDoc] = useState<HouseDoc | null>(null);
  const { gridState, isHardwareOffline } = useGridState();
  const [loadingUser, setLoadingUser] = useState(true);
  const [loadingHouse, setLoadingHouse] = useState(true);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const [toastVisible, setToastVisible] = useState(false);
  const [toastMsg, setToastMsg] = useState("");
  const [toastType, setToastType] = useState<'success' | 'info' | 'error'>('info');

  const showToast = (msg: string, type: 'success' | 'info' | 'error' = 'info') => {
    setToastMsg(msg);
    setToastType(type);
    setToastVisible(true);
  };

  const [activeBroadcast, setActiveBroadcast] = useState<any>(null);
  const [openBroadcasts, setOpenBroadcasts] = useState<any[]>([]);

  const [broadcastModalVisible, setBroadcastModalVisible] = useState(false);
  const [broadcastEnergy, setBroadcastEnergy] = useState("5");
  const [broadcastPrice, setBroadcastPrice] = useState("10");

  const [offerModalVisible, setOfferModalVisible] = useState(false);
  const [selectedBroadcast, setSelectedBroadcast] = useState<any>(null);
  const [offerEnergy, setOfferEnergy] = useState("5");
  const [offerPrice, setOfferPrice] = useState("10");

  const [requesting, setRequesting] = useState(false);

  const handleBroadcastSubmit = async () => {
    if (!houseId) return;
    setRequesting(true);
    try {
      const { createBroadcastRequest } = await import("../../src/services/requestService");
      await createBroadcastRequest({
        receiverId: uid,
        receiverHouseId: houseId,
        receiverDisplayName: userDoc?.name || "Neighbor",
        energyNeededKwh: Number(broadcastEnergy) || 5,
        capPricePerKwh: Number(broadcastPrice) || 10,
      });
      showToast("Broadcast request sent!", "success");
      setBroadcastModalVisible(false);
    } catch (err: any) {
      showToast(err?.message || "Failed to broadcast request.", "error");
    } finally {
      setRequesting(false);
    }
  };

  const handleOfferSubmit = async () => {
    if (!selectedBroadcast || !houseId) return;
    setRequesting(true);
    try {
      const { submitOffer } = await import("../../src/services/requestService");
      // Use metrics.battery for tier
      const tier = metrics.battery >= 80 ? "High" : metrics.battery >= 50 ? "Medium" : "Low";
      await submitOffer({
        requestId: selectedBroadcast.id,
        donorId: uid,
        donorHouseId: houseId,
        donorDisplayName: userDoc?.name || "Neighbor",
        energyOfferedKwh: Number(offerEnergy) || 5,
        pricePerKwh: Number(offerPrice) || 10,
        availabilityTier: tier,
      });
      showToast("Offer submitted!", "success");
      setOfferModalVisible(false);
      setSelectedBroadcast(null);
    } catch (err: any) {
      showToast(err?.message || "Failed to submit offer.", "error");
    } finally {
      setRequesting(false);
    }
  };





  const uid = auth.currentUser?.uid ?? "";
  const houseId = useMemo(
    () =>
      String(userDoc?.houseId || "").trim() ||
      String(userDoc?.house_id || "").trim(),
    [userDoc?.houseId, userDoc?.house_id],
  );



  const hardwareState = useMemo(() => {
    if (!gridState) return { label: 'OFFLINE / FAULT', color: C.gray };
    
    const hbStale = gridState.esp32_heartbeat && typeof gridState.esp32_heartbeat.toMillis === 'function' && 
                    Date.now() - gridState.esp32_heartbeat.toMillis() > 5 * 60 * 1000;
                    
    if (hbStale) return { label: 'FAULT / OFFLINE', color: C.red };
    
    if (gridState.availability_mode === 'P2P' || gridState.availability_mode === 'BATTERY') {
      return { label: 'BATTERY / P2P MODE', color: C.green };
    }
    if (gridState.bus_source === 'GRID') {
      return { label: 'GRID MODE', color: '#FFB800' };
    }
    if (gridState.bus_source === 'DUMP_LOAD') {
      return { label: 'DUMP LOAD MODE', color: C.cyan };
    }
    
    return { label: 'GRID MODE', color: '#FFB800' };
  }, [gridState]);

  useEffect(() => {
    if (!uid) {
      setLoadingUser(false);
      setLoadingHouse(false);
      setError("Not signed in");
      return;
    }

    setLoadingUser(true);
    const unsubUser = onSnapshot(
      doc(db, "users", uid),
      (snap) => {
        if (!snap.exists()) {
          setUserDoc(null);
          setLoadingUser(false);
          return;
        }
        setUserDoc(snap.data() as UserDoc);
        setError("");
        setLoadingUser(false);
      },
      (e) => {
        setError((e as Error)?.message || "Failed to fetch user");
        setLoadingUser(false);
      },
    );

    return () => unsubUser();
  }, [uid]);

  useEffect(() => {
    if (!houseId) {
      setHouseDoc(null);
      setLoadingHouse(false);
      return;
    }
    setLoadingHouse(true);

    const unsubHouse = onSnapshot(
      doc(db, "houses", houseId),
      (snap) => {
        setHouseDoc(snap.exists() ? (snap.data() as HouseDoc) : null);
        setLoadingHouse(false);
      },
      (e) => {
        setError((e as Error)?.message || "Failed to fetch house");
        setLoadingHouse(false);
      },
    );

    return () => unsubHouse();
  }, [houseId]);

  const [outgoingRequests, setOutgoingRequests] = useState<any[]>([]);
  const [activeTransferSession, setActiveTransferSession] = useState<any | null>(null);

  useEffect(() => {
    if (!uid) return;
    let unsubOut = () => { };
    let unsubActive = () => { };
    let unsubOpen = () => { };
    let unsubTransfer = () => { };
    import("../../src/services/requestService").then(({ subscribeOutgoingRequests, subscribeActiveBroadcast, subscribeOpenBroadcastsNearMe, subscribeActiveTransferSession }) => {
      unsubOut = subscribeOutgoingRequests(uid, (list) => {
        setOutgoingRequests(list.filter(r => ['pending', 'accepted', 'transferring'].includes(r.status)));
      });
      unsubActive = subscribeActiveBroadcast(uid, setActiveBroadcast);
      unsubOpen = subscribeOpenBroadcastsNearMe(uid, setOpenBroadcasts);
      unsubTransfer = subscribeActiveTransferSession(uid, setActiveTransferSession);
    });
    return () => { unsubOut(); unsubActive(); unsubOpen(); unsubTransfer(); };
  }, [uid]);

  // Hardware confirmation and settlement are now handled securely by the backend and actual ESP32 telemetry.
  // The client merely listens to changes in `activeTransferSession.status` and `gridState`.


  const metrics = useMemo(() => {
    const generation = Number(houseDoc?.generation);
    const consumption = Number(houseDoc?.consumption);
    const battery = Number(houseDoc?.battery);
    // Reserve: prefer user-level setting (reserveBatteryPercent), fall back to
    // house-level reserve field, then default to 20% if neither is set.
    const reserve = Number(
      userDoc?.reserveBatteryPercent ??
      houseDoc?.reserve ??
      20
    );
    const lastUpdated = houseDoc?.lastUpdated;
    const isLive =
      !!lastUpdated &&
      typeof lastUpdated.toMillis === "function" &&
      Date.now() - lastUpdated.toMillis() <= STALE_MS;
    // reserve is always available from userDoc, so only check generation/consumption/battery
    const complete = [generation, consumption, battery].every(Number.isFinite);
    const net = complete ? generation - consumption : null;
    return { generation, consumption, battery, reserve, lastUpdated, isLive, complete, net };
  }, [houseDoc, userDoc?.reserveBatteryPercent]);

  const status = useMemo((): DashboardStatus | null => {
    if (!houseDoc) return null;
    if (!metrics.lastUpdated || !metrics.isLive) return "OFFLINE";
    if (!metrics.complete) return "OFFLINE";
    // PRIMARY SIGNAL: Battery level determines share/request capability
    // Battery below reserve → cannot share, may need energy
    if (metrics.battery < metrics.reserve) return "LOW_BATTERY";
    // High battery (≥50%) → have surplus stored energy to share
    if (metrics.battery >= 50) return "SURPLUS";
    // Low battery (<40%) → need to request energy from neighbors
    if (metrics.battery < 40) return "DEFICIT";
    // 40-50% range: check real-time net generation as tiebreaker
    if (metrics.net != null && metrics.net > 0) return "SURPLUS";
    if (metrics.net != null && metrics.net < 0) return "DEFICIT";
    return "BALANCED";
  }, [houseDoc, metrics]);

  const batteryPct = useMemo(() => {
    if (!metrics.complete) return 0;
    return Math.max(0, Math.min(100, Math.round(metrics.battery)));
  }, [metrics]);

  useEffect(() => {
    Animated.timing(batteryAnim, {
      toValue: batteryPct,
      duration: 450,
      useNativeDriver: false,
    }).start();
  }, [batteryPct, batteryAnim]);

  const batteryWidth = batteryAnim.interpolate({
    inputRange: [0, 100],
    outputRange: ["0%", "100%"],
  });

  const signOut = async () => {
    await logout();
    router.replace("/(auth)/login");
  };

  const onRefresh = async () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 400);
  };

  if (loadingUser || loadingHouse) {
    return (
      <View style={styles.screen}>
        <StatusBar barStyle="light-content" backgroundColor={C.bg} />
        <ScrollView showsVerticalScrollIndicator={false}>
          <DashboardSkeleton />
        </ScrollView>
      </View>
    );
  }

  if (!userDoc) {
    return (
      <View style={styles.screen}>
        <StatusBar barStyle="light-content" backgroundColor={C.bg} />
        <View style={styles.center}>
          <Text style={styles.errorTitle}>User not initialized</Text>
          <Text style={styles.errorBody}>Create users/{uid} with required fields.</Text>
        </View>
      </View>
    );
  }

  if (!houseId || !houseDoc) {
    return (
      <View style={styles.screen}>
        <StatusBar barStyle="light-content" backgroundColor={C.bg} />
        <View style={styles.center}>
          <Text style={styles.errorTitle}>House not found</Text>
          <Text style={styles.errorBody}>users/{uid}.houseId must map to houses/{houseId}.</Text>
        </View>
      </View>
    );
  }

  const statusKey = status ?? "OFFLINE";
  const netColor = (metrics.net ?? 0) >= 0 ? C.green : C.red;

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={C.cyan}
            colors={[C.cyan]}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>SolarShare</Text>
            <Text style={styles.userName}>{String(userDoc.name || "User")}</Text>
            <Text style={styles.houseId}>{houseId ? getDisplayName(houseId) : '---'}</Text>
          </View>
          <TouchableOpacity style={styles.signOutBtn} onPress={signOut}>
            <Text style={styles.signOutText}>Sign Out</Text>
          </TouchableOpacity>
        </View>

        {/* System Mode Banner */}
        {(()=>{
          const modeKey = gridState?.availability_mode === 'P2P' || gridState?.availability_mode === 'BATTERY'
            ? 'BATTERY'
            : gridState?.bus_source === 'DUMP_LOAD'
            ? 'DUMP_LOAD'
            : (!gridState || (gridState.esp32_heartbeat && typeof gridState.esp32_heartbeat.toMillis === 'function' && Date.now() - gridState.esp32_heartbeat.toMillis() > 5 * 60 * 1000))
            ? 'FAULT'
            : 'GRID';
          const meta = SYSTEM_MODE_META[modeKey] ?? SYSTEM_MODE_META.GRID;
          return (
            <LinearGradient
              colors={meta.gradient as [string, string]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ borderRadius: 16, borderWidth: 1, borderColor: `${meta.color}40`, padding: 16, marginBottom: 14, flexDirection: 'row', alignItems: 'center', gap: 14 }}
            >
              <Text style={{ fontSize: 26 }}>{meta.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ color: meta.color, fontSize: 15, fontWeight: '900', letterSpacing: 0.2, marginBottom: 2 }}>{meta.title}</Text>
                <Text style={{ color: C.textSecondary, fontSize: 12 }}>{meta.desc}</Text>
              </View>
              <View style={{ backgroundColor: `${meta.color}18`, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: `${meta.color}35` }}>
                <Text style={{ color: meta.color, fontSize: 9, fontWeight: '800', letterSpacing: 0.8 }}>LIVE</Text>
              </View>
            </LinearGradient>
          );
        })()}
        {/* Transfer Animation (Inline) */}
        {activeTransferSession && (activeTransferSession.status === 'transferring' || activeTransferSession.status === 'hardware_confirmed') && (
          <EnergyTransferAnimation
            donorName={activeTransferSession.donorDisplayName ?? 'Source'}
            receiverName={activeTransferSession.receiverDisplayName ?? 'Home'}
            energyKwh={activeTransferSession.estimatedKwh}
            estimatedCost={activeTransferSession.estimatedCost}
            status={activeTransferSession.status}
          />
        )}

        {/* HERO: Current Energy Source */}
        <LinearGradient
          colors={[`${hardwareState.color}25`, `${hardwareState.color}05`]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.heroCard, { borderColor: `${hardwareState.color}40`, shadowColor: hardwareState.color }]}
        >
          <View style={styles.heroTop}>
            <Text style={[styles.heroLabel, { color: hardwareState.color }]}>CURRENT ENERGY SOURCE</Text>
            <View style={[styles.badge, { borderColor: hardwareState.color, backgroundColor: `${hardwareState.color}22` }]}>
              <Text style={[styles.badgeText, { color: hardwareState.color }]}>
                {gridState?.bus_source === 'P2P' ? 'LIVE P2P' : 'ACTIVE'}
              </Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 16 }}>
            <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: `${hardwareState.color}15`, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: `${hardwareState.color}30` }}>
              <Ionicons name={
                gridState?.bus_source === 'GRID' ? 'business' :
                gridState?.bus_source === 'BATTERY' ? 'battery-charging' :
                gridState?.bus_source === 'P2P' ? 'people' : 'warning'
              } size={28} color={hardwareState.color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.heroTitle, { marginTop: 0 }]}>
                {gridState?.bus_source?.replace('_', ' ') || 'GRID'}
              </Text>
              <Text style={styles.heroSub}>
                {gridState?.bus_source === 'GRID' ? 'Utility Power' :
                 gridState?.bus_source === 'BATTERY' ? 'Solar Battery' :
                 gridState?.bus_source === 'P2P' ? 'Neighborhood Sharing' :
                 gridState?.bus_source === 'DUMP_LOAD' ? 'Excess Energy Diversion' : 'System Offline'}
              </Text>
            </View>
          </View>
        </LinearGradient>

        {/* System Health */}
        <SystemHealthCard />

        {/* Metrics Grid (2x2) */}
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
          <View style={styles.metricCard}>
            <Ionicons name="sunny" size={16} color={C.green} />
            <Text style={[styles.metricValue, { color: C.green }]}>
              {Number(metrics.generation).toFixed(1)} kW
            </Text>
            <Text style={styles.metricLabel}>Solar</Text>
          </View>
          <View style={styles.metricCard}>
            <Ionicons name="flash" size={16} color={C.red} />
            <Text style={[styles.metricValue, { color: C.red }]}>
              {Number(metrics.consumption).toFixed(1)} kW
            </Text>
            <Text style={styles.metricLabel}>Usage</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
          <View style={styles.metricCard}>
            <Ionicons name="swap-vertical" size={16} color={netColor} />
            <Text style={[styles.metricValue, { color: (metrics.net ?? 0) >= 0 ? '#00E676' : '#FF4D6D' }]}>
              {(metrics.net ?? 0) >= 0 ? "+" : ""}
              {Number(metrics.net ?? 0).toFixed(1)} kW
            </Text>
            <Text style={styles.metricLabel}>Net Flow</Text>
          </View>
          <View style={styles.metricCard}>
            <Ionicons name="battery-full" size={16} color={batteryPct >= 30 ? C.green : C.red} />
            <Text style={[styles.metricValue, { color: batteryPct >= 30 ? C.green : C.red }]}>
              {batteryPct}%
            </Text>
            <Text style={styles.metricLabel}>Battery</Text>
          </View>
        </View>

        <PowerFlowWidget busSource={gridState?.bus_source} switchingConfirmed={gridState?.switching_confirmed} />

        {activeTransferSession && (
          <View style={[styles.sectionCard, { borderColor: 'rgba(0,212,255,0.4)', borderWidth: 1.5 }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <Text style={styles.sectionTitle}>⚡ Active Transfer</Text>
              <StatusChip
                variant={activeTransferSession.status === 'hardware_confirmed' ? 'COMPLETED' : 'ACTIVE'}
                label={activeTransferSession.status === 'hardware_confirmed' ? 'FINALIZING' : 'LIVE'}
                pulse
                size="sm"
              />
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.textSecondary, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 3 }}>From</Text>
                <Text style={{ color: C.textPrimary, fontWeight: '800', fontSize: 14 }}>{activeTransferSession.donorDisplayName ?? '—'}</Text>
              </View>
              <Text style={{ color: C.cyan, fontSize: 20, marginHorizontal: 8 }}>→</Text>
              <View style={{ flex: 1, alignItems: 'flex-end' }}>
                <Text style={{ color: C.textSecondary, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 3 }}>To</Text>
                <Text style={{ color: C.textPrimary, fontWeight: '800', fontSize: 14 }}>{activeTransferSession.receiverDisplayName ?? '—'}</Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1, backgroundColor: 'rgba(0,255,148,0.08)', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: 'rgba(0,255,148,0.2)' }}>
                <Text style={{ color: C.textSecondary, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 }}>Energy</Text>
                <Text style={{ color: C.green, fontSize: 18, fontWeight: '900' }}>{activeTransferSession.estimatedKwh} kWh</Text>
              </View>
              <View style={{ flex: 1, backgroundColor: 'rgba(0,212,255,0.08)', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: 'rgba(0,212,255,0.2)' }}>
                <Text style={{ color: C.textSecondary, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 }}>Est. Cost</Text>
                <Text style={{ color: C.cyan, fontSize: 18, fontWeight: '900' }}>₹{activeTransferSession.estimatedCost}</Text>
              </View>
            </View>
            {activeTransferSession.status === 'hardware_confirmed' && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, backgroundColor: 'rgba(0,255,148,0.07)', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: 'rgba(0,255,148,0.25)' }}>
                <Ionicons name="checkmark-circle" size={14} color={C.green} />
                <Text style={{ color: C.green, fontSize: 12, fontWeight: '700' }}>Hardware Confirmed · Finalizing Settlement</Text>
              </View>
            )}
          </View>
        )}

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Action</Text>
          {status === 'SURPLUS' ? (
            <TouchableOpacity
              style={{ backgroundColor: '#00E676', borderRadius: 12, paddingVertical: 16, alignItems: 'center' }}
              onPress={() => router.push("/(main)/requests")}
            >
              <Text style={{ color: '#0A0F1E', fontWeight: '700', fontSize: 16 }}>⚡ Share Energy</Text>
            </TouchableOpacity>
          ) : status === 'DEFICIT' || status === 'LOW_BATTERY' ? (
            <>
              {status === 'LOW_BATTERY' && (
                <View style={{ borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14, backgroundColor: 'rgba(255,183,0,0.1)', borderWidth: 1, borderColor: 'rgba(255,183,0,0.35)', marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ fontSize: 16 }}>🔋</Text>
                  <Text style={{ color: '#FFB700', fontWeight: '600', fontSize: 13 }}>Battery at {batteryPct}% — charge above {metrics.reserve}% to share</Text>
                </View>
              )}
              {activeBroadcast ? (
                <View style={{ backgroundColor: 'rgba(0,212,255,0.1)', borderWidth: 1, borderColor: 'rgba(0,212,255,0.3)', borderRadius: 12, paddingVertical: 16, alignItems: 'center' }}>
                  <Text style={{ color: C.cyan, fontWeight: '700', fontSize: 16 }}>Request Active - Waiting For Offers</Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={{ backgroundColor: '#FF4D6D', borderRadius: 12, paddingVertical: 16, alignItems: 'center' }}
                  onPress={() => setBroadcastModalVisible(true)}
                >
                  <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 16 }}>Broadcast Request</Text>
                </TouchableOpacity>
              )}
            </>
          ) : (
            <Text style={styles.offlineText}>{status === 'OFFLINE' ? 'No live data available.' : 'Generation and usage are balanced.'}</Text>
          )}
        </View>

        {status === 'SURPLUS' && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Energy Requests Near You</Text>
            {openBroadcasts.length === 0 ? (
              <EmptyState icon="planet-outline" title="No Requests Nearby" message="Your neighbors are currently fully powered." />
            ) : (
              openBroadcasts.map((req) => (
                <View key={req.id} style={{ backgroundColor: '#111827', borderRadius: 12, padding: 14, marginBottom: 10 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text style={{ color: '#F0F6FF', fontWeight: '700', fontSize: 16 }}>{req.receiverDisplayName}</Text>
                    <Text style={{ color: C.red, fontWeight: '700' }}>{req.energyNeededKwh} kWh needed</Text>
                  </View>
                  <Text style={{ color: '#8BA0BC', fontSize: 13, marginBottom: 12 }}>Max Price: ₹{req.capPricePerKwh} / kWh</Text>
                  <AnimatedTouchable
                    style={styles.requestBtn}
                    onPress={() => {
                      setSelectedBroadcast(req);
                      setOfferModalVisible(true);
                    }}
                  >
                    <Text style={styles.requestBtnText}>Submit Offer</Text>
                  </AnimatedTouchable>
                </View>
              ))
            )}
          </View>
        )}

        {error ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>Something went wrong</Text>
            <Text style={styles.errorBody}>{error}</Text>
          </View>
        ) : null}

        <View style={{ height: 24 }} />
      </ScrollView>

      <Modal visible={broadcastModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Broadcast Request</Text>
            <Text style={styles.modalSub}>Ask neighbors for energy</Text>

            <Text style={styles.inputLabel}>Amount needed (kWh)</Text>
            <TextInput
              style={styles.input}
              value={broadcastEnergy}
              onChangeText={setBroadcastEnergy}
              keyboardType="decimal-pad"
              placeholderTextColor={C.textMuted}
            />

            <Text style={styles.inputLabel}>Max price willing to pay (₹/kWh)</Text>
            <TextInput
              style={styles.input}
              value={broadcastPrice}
              onChangeText={setBroadcastPrice}
              keyboardType="decimal-pad"
              placeholderTextColor={C.textMuted}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, { borderColor: C.border }]}
                onPress={() => setBroadcastModalVisible(false)}
                disabled={requesting}
              >
                <Text style={styles.modalBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: C.cyan, borderColor: C.cyan }]}
                onPress={handleBroadcastSubmit}
                disabled={requesting}
              >
                {requesting ? (
                  <ActivityIndicator size="small" color={C.bg} />
                ) : (
                  <Text style={[styles.modalBtnText, { color: C.bg }]}>Broadcast</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={offerModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Submit Offer</Text>
            <Text style={styles.modalSub}>To {selectedBroadcast?.receiverDisplayName}</Text>

            <Text style={styles.inputLabel}>Amount offered (kWh)</Text>
            <TextInput
              style={styles.input}
              value={offerEnergy}
              onChangeText={setOfferEnergy}
              keyboardType="decimal-pad"
              placeholderTextColor={C.textMuted}
            />

            <Text style={styles.inputLabel}>Price per kWh (₹)</Text>
            <TextInput
              style={styles.input}
              value={offerPrice}
              onChangeText={setOfferPrice}
              keyboardType="decimal-pad"
              placeholderTextColor={C.textMuted}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, { borderColor: C.border }]}
                onPress={() => setOfferModalVisible(false)}
                disabled={requesting}
              >
                <Text style={styles.modalBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: C.green, borderColor: C.green }]}
                onPress={handleOfferSubmit}
                disabled={requesting}
              >
                {requesting ? (
                  <ActivityIndicator size="small" color={C.bg} />
                ) : (
                  <Text style={[styles.modalBtnText, { color: C.bg }]}>Submit</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {activeTransferSession && (activeTransferSession.status === 'transferring' || activeTransferSession.status === 'hardware_confirmed') && (
        <EnergyTransferAnimation
          donorName={activeTransferSession.donorDisplayName ?? 'Source'}
          receiverName={activeTransferSession.receiverDisplayName ?? 'Home'}
          energyKwh={activeTransferSession.estimatedKwh}
          estimatedCost={activeTransferSession.estimatedCost}
          status={activeTransferSession.status}
        />
      )}

      <SmartToast
        visible={toastVisible}
        message={toastMsg}
        type={toastType}
        onHide={() => setToastVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  scroll: { padding: 16, paddingTop: 52, paddingBottom: 28 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  loaderText: { marginTop: 12, color: C.textSecondary, fontSize: 13 },

  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  brand: {
    color: C.textSecondary,
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  userName: { color: C.textPrimary, fontSize: 30, fontWeight: "900", marginTop: 2 },
  houseId: { color: C.textMuted, fontSize: 11, marginTop: 2 },
  signOutBtn: {
    backgroundColor: C.surface2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  signOutText: {
    color: C.textSecondary,
    fontSize: 10,
    textTransform: "uppercase",
    fontWeight: "700",
  },

  heroCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(0,212,255,0.28)",
    padding: 16,
    marginBottom: 14,
  },
  heroTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  heroLabel: {
    color: C.cyan,
    fontSize: 10,
    letterSpacing: 1,
    textTransform: "uppercase",
    fontWeight: "700",
  },
  badge: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },
  heroTitle: {
    marginTop: 10,
    color: C.textPrimary,
    fontSize: 28,
    fontWeight: "900",
  },
  heroSub: {
    marginTop: 4,
    color: C.textSecondary,
    fontSize: 12,
    lineHeight: 17,
  },
  batteryRow: {
    marginTop: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  batteryLabel: { color: C.textSecondary, fontSize: 12 },
  batteryValue: { color: C.textPrimary, fontSize: 24, fontWeight: "900" },
  batteryTrack: {
    marginTop: 8,
    height: 10,
    borderRadius: 100,
    backgroundColor: "#263141",
    overflow: "hidden",
  },
  batteryFill: { height: "100%", borderRadius: 100 },
  walletRow: {
    marginTop: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  walletLabel: { color: C.textMuted, fontSize: 12 },
  walletValue: { color: C.cyan, fontSize: 14, fontWeight: "800" },

  metricsRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 14,
  },
  metricCard: {
    flex: 1,
    backgroundColor: C.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    padding: 12,
  },
  metricValue: { marginTop: 8, fontSize: 17, fontWeight: "900" },
  metricLabel: {
    marginTop: 6,
    color: C.textSecondary,
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },

  sectionCard: {
    backgroundColor: C.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    padding: 14,
    marginBottom: 12,
  },
  sectionTitle: {
    color: C.textPrimary,
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 10,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  actionBtn: {
    borderWidth: 1,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
  },
  actionText: { fontSize: 13, fontWeight: "800" },
  disabledBtn: {
    backgroundColor: "rgba(139,160,188,0.15)",
    borderColor: "rgba(139,160,188,0.35)",
  },
  disabledText: { color: C.gray, fontWeight: "800", fontSize: 13 },
  offlineText: { color: C.textSecondary, fontSize: 12 },

  inlineLoader: { flexDirection: "row", alignItems: "center", gap: 8 },
  inlineLoaderText: { color: C.textSecondary, fontSize: 12 },

  neighborCard: {
    backgroundColor: C.surface2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    padding: 12,
    marginBottom: 8,
  },
  neighborName: { color: C.textPrimary, fontSize: 14, fontWeight: "800" },
  neighborMeta: { color: C.textSecondary, fontSize: 11, marginTop: 2, marginBottom: 10 },
  requestBtn: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(0,212,255,0.35)",
    backgroundColor: "rgba(0,212,255,0.15)",
    paddingVertical: 10,
    alignItems: "center",
  },
  requestBtnText: { color: C.cyan, fontSize: 12, fontWeight: "800" },

  errorCard: {
    backgroundColor: "rgba(255,77,109,0.1)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,77,109,0.35)",
    padding: 12,
  },
  errorTitle: { color: C.red, fontSize: 14, fontWeight: "800", textAlign: "center" },
  errorBody: { color: C.textSecondary, fontSize: 12, textAlign: "center", marginTop: 6 },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(10, 15, 30, 0.8)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContent: {
    backgroundColor: C.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    padding: 20,
    width: "100%",
    maxWidth: 400,
  },
  modalTitle: { color: C.textPrimary, fontSize: 18, fontWeight: "800" },
  modalSub: { color: C.textSecondary, fontSize: 13, marginTop: 4, marginBottom: 20 },
  inputLabel: { color: C.textMuted, fontSize: 12, marginBottom: 8, textTransform: "uppercase", fontWeight: "700" },
  input: {
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    color: C.textPrimary,
    padding: 14,
    fontSize: 16,
    marginBottom: 24,
  },
  modalActions: { flexDirection: "row", gap: 12 },
  modalBtn: {
    flex: 1,
    borderWidth: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  modalBtnText: { color: C.textPrimary, fontSize: 14, fontWeight: "800" },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  k: { color: C.textSecondary, fontSize: 14 },
  v: { color: C.textPrimary, fontSize: 14, fontWeight: '700' },
  statusChip: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
});

