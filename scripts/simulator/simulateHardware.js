/**
 * simulateHardware.js
 *
 * Writes to the EXACT same Firestore collections, document IDs, and field names
 * that the app's services and screens read.
 *
 * ─── COMPATIBILITY VERIFIED AGAINST ──────────────────────────────────────────
 *
 *  Collection          Field               UI Source                  Status
 *  ──────────────────────────────────────────────────────────────────────────
 *  houses/{houseId}    generation          dashboard.tsx HouseDoc     ✅ MATCH
 *  houses/{houseId}    consumption         dashboard.tsx HouseDoc     ✅ MATCH
 *  houses/{houseId}    battery             dashboard.tsx HouseDoc     ✅ MATCH
 *  houses/{houseId}    reserve             dashboard.tsx HouseDoc     ✅ MATCH
 *  houses/{houseId}    lastUpdated         dashboard.tsx isLive check ✅ MATCH
 *
 *  system/grid_state   bus_source          hardwareService.ts         ✅ MATCH
 *  system/grid_state   availability_mode   hardwareService.ts GridState ✅ FIXED (was missing)
 *  system/grid_state   esp32_heartbeat     hardwareService.ts / useGridState.ts ✅ MATCH
 *  system/grid_state   switching_confirmed dashboard.tsx useEffect   ✅ MATCH
 *  system/grid_state   contactor_1         hardwareService.ts GridState ✅ MATCH
 *  system/grid_state   contactor_2         hardwareService.ts GridState ✅ MATCH
 *  system/grid_state   contactor_3         hardwareService.ts GridState ✅ MATCH
 *  system/grid_state   surplus_house_id    (future use)               ✅ MATCH
 *  system/grid_state   last_updated        (internal)                 ✅ MATCH
 *
 *  hardware_events     eventType           hardwareService.ts         ✅ MATCH
 *  hardware_events     details             hardwareService.ts         ✅ MATCH
 *  hardware_events     metadata            hardwareService.ts         ✅ FIXED (was missing)
 *  hardware_events     createdAt           hardwareService.ts         ✅ MATCH
 *
 *  REMOVED (simulator-only, not read by UI):
 *    contactor_1_state  → replaced by contactor_1
 *    contactor_2_state  → replaced by contactor_2
 *
 *  SEEDED demo houses:   house_h1, house_h2, house_h3
 *  (matching the display-name map in dashboard.tsx and wallet.tsx)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { initializeApp } from "firebase/app";
import {
  getFirestore,
  doc,
  setDoc,
  serverTimestamp,
  collection,
  addDoc,
} from "firebase/firestore";

// ── Firebase config ────────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyA8DTDJyU5Rf45eCoI3FcsFxmkpZQzm4eY",
  authDomain: "smart-grid-dev2.firebaseapp.com",
  projectId: "smart-grid-dev2",
  storageBucket: "smart-grid-dev2.firebasestorage.app",
  messagingSenderId: "851224488887",
  appId: "1:851224488887:web:c9245511394dbcc1de9632",
  measurementId: "G-938EMYZ5PY"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ── Demo house IDs — must match initService.ts pattern & dashboard.tsx display map ──
// dashboard.tsx: { house_h1: 'House A', house_h2: 'House B', house_h3: 'House C' }
const DEMO_HOUSES = ["house_h1", "house_h2", "house_h3"];

// ── Log a hardware event ───────────────────────────────────────────────────────
// Field names match hardwareService.ts: logHardwareEvent(eventType, details, metadata)
async function logHardwareEvent(eventType, details, metadata = {}) {
  try {
    await addDoc(collection(db, "hardware_events"), {
      eventType,   // string  — read by subscribeHardwareEvents
      details,     // string  — read by subscribeHardwareEvents
      metadata,    // object  — read by subscribeHardwareEvents (was missing before)
      createdAt: serverTimestamp(), // Timestamp — sorted on in subscribeHardwareEvents
    });
  } catch (err) {
    console.error("Failed to log hardware event:", err.message);
  }
}

// ── Clamp helper ───────────────────────────────────────────────────────────────
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const rand = (lo, hi, dp = 1) => +((Math.random() * (hi - lo) + lo).toFixed(dp));

// ── Per-house state ───────────────────────────────────────────────────────────
const houseState = {
  house_h1: { battery: 70, direction: 1 },
  house_h2: { battery: 45, direction: -1 },
  house_h3: { battery: 85, direction: 1 },
};

// ── Update a single house document ────────────────────────────────────────────
// Fields: generation, consumption, battery, reserve, lastUpdated
// (all consumed by dashboard.tsx HouseDoc and requestService.ts completeRequest)
async function updateHouse(houseId) {
  const state = houseState[houseId];

  // Realistic residential solar: 0.5–5 kW generation, 0.5–4 kW consumption
  const generation  = rand(0.5, 5.0);
  const consumption = rand(0.5, 4.0);

  // Battery drifts up (charging) or down (discharging) slowly
  state.battery += state.direction * rand(0.5, 2.0);
  if (state.battery >= 95) state.direction = -1;
  if (state.battery <= 15) state.direction = 1;
  state.battery = clamp(state.battery, 10, 98);

  await setDoc(
    doc(db, "houses", houseId),
    {
      generation:  +generation.toFixed(1),   // number  — dashboard.tsx metrics.generation
      consumption: +consumption.toFixed(1),  // number  — dashboard.tsx metrics.consumption
      battery:     +state.battery.toFixed(1),// number  — dashboard.tsx metrics.battery / completeRequest
      reserve:     30,                       // number  — dashboard.tsx metrics.reserve fallback
      lastUpdated: serverTimestamp(),        // Timestamp — dashboard.tsx isLive check (STALE_MS=6h)
    },
    { merge: true }
  );

  return { generation, consumption, battery: state.battery };
}

// ── Update the system/grid_state document ─────────────────────────────────────
// ALL fields match hardwareService.ts GridState interface exactly.
async function updateGridState(mode, primaryHouseId, batteryAvg) {
  await setDoc(
    doc(db, "system", "grid_state"),
    {
      // ── Fields read by hardwareService.ts GridState ──
      bus_source:          mode,       // 'GRID' | 'BATTERY' | 'P2P' | 'DUMP_LOAD'
      availability_mode:   mode,       // FIXED: was missing — dashboard.tsx line 232 reads this
      esp32_heartbeat:     serverTimestamp(), // Timestamp — useGridState.ts hbStale check
      switching_confirmed: mode === "P2P" || mode === "BATTERY", // boolean — dashboard.tsx useEffect
      contactor_1:         mode === "GRID",                      // boolean — dashboard.tsx line 780
      contactor_2:         mode === "BATTERY" || mode === "P2P", // boolean — dashboard.tsx line 784
      contactor_3:         mode === "FAULT",                     // boolean — dashboard.tsx line 788
      // ── Additional fields ──
      surplus_house_id:    batteryAvg > 60 ? primaryHouseId : null, // future use
      last_updated:        serverTimestamp(),
    },
    { merge: true }
  );
}

// ── Main simulation loop ───────────────────────────────────────────────────────
async function runSimulation() {
  let prevMode = "GRID";
  let tick = 0;

  console.log("╔══════════════════════════════════════════╗");
  console.log("║  SmartGrid Hardware Simulator  v2.0      ║");
  console.log("║  Writing to Firestore (field-verified)   ║");
  console.log("╚══════════════════════════════════════════╝\n");

  await logHardwareEvent(
    "Simulator Started",
    "Mock hardware connected and verified.",
    { version: "2.0", houses: DEMO_HOUSES }
  );

  setInterval(async () => {
    try {
      tick++;

      // ── Update all demo houses ──
      const results = {};
      for (const houseId of DEMO_HOUSES) {
        results[houseId] = await updateHouse(houseId);
      }

      // ── Determine system mode from house_h1 (primary) ──
      const primary = results["house_h1"];
      const batteryAvg = DEMO_HOUSES.reduce(
        (sum, id) => sum + houseState[id].battery, 0
      ) / DEMO_HOUSES.length;

      let mode;
      if (primary.battery > 60 && primary.generation > primary.consumption) {
        mode = "P2P";      // Surplus → share with neighbours
      } else if (primary.battery < 20) {
        mode = "FAULT";    // Critical battery
      } else if (primary.generation >= primary.consumption) {
        mode = "BATTERY";  // Self-sufficient on solar+battery
      } else {
        mode = "GRID";     // Draw from utility
      }

      // ── Update system/grid_state ──
      await updateGridState(mode, "house_h1", batteryAvg);

      // ── Mode change event ──
      if (mode !== prevMode) {
        await logHardwareEvent(
          "Mode Changed",
          `System switched from ${prevMode} to ${mode}`,
          { prevMode, newMode: mode, tick }
        );
        prevMode = mode;
      }

      // ── Periodic heartbeat (every 10 ticks) ──
      if (tick % 10 === 0) {
        await logHardwareEvent(
          "Heartbeat Update",
          `Signal nominal. Mode: ${mode}. Avg battery: ${batteryAvg.toFixed(1)}%`,
          { mode, batteryAvg: +batteryAvg.toFixed(1), tick }
        );
      }

      // ── Transfer started (every 15 ticks in P2P) ──
      if (tick % 15 === 0 && mode === "P2P") {
        await logHardwareEvent(
          "Transfer Started",
          "Energy export to bus initiated.",
          { donorHouseId: "house_h1", mode }
        );
      }

      // ── Transfer ended (every 20 ticks in P2P) ──
      if (tick % 20 === 0 && mode === "P2P") {
        await logHardwareEvent(
          "Transfer Ended",
          "Energy export completed safely.",
          { donorHouseId: "house_h1", mode }
        );
        await logHardwareEvent(
          "Switching Confirmation",
          "Hardware contactors successfully latched.",
          { contactor_1: false, contactor_2: true, contactor_3: false }
        );
      }

      // ── Fault event (every 5 ticks in FAULT) ──
      if (mode === "FAULT" && tick % 5 === 0) {
        await logHardwareEvent(
          "Fault Event",
          "Battery voltage critically low. Safety cutoff engaged.",
          { battery: primary.battery, threshold: 20 }
        );
      }

      // ── Console summary ──
      console.log(
        `[${new Date().toLocaleTimeString()}] tick=${tick} mode=${mode}` +
        ` | house_h1: gen=${primary.generation} con=${primary.consumption}` +
        ` bat=${primary.battery.toFixed(1)}%` +
        ` | avgBat=${batteryAvg.toFixed(1)}%`
      );

    } catch (err) {
      console.error(`[tick ${tick}] Simulation tick failed:`, err.message);
    }
  }, 10000); // 10-second interval to save Firebase quota
}

runSimulation().catch(console.error);
