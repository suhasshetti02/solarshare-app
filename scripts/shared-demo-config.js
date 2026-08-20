const BASE_RATE_PER_KWH = 10;
const PREMIUM_THRESHOLD_KWH = 2;
const DEFAULT_DONOR_EXTRA_RATE_PER_KWH = 0;
const DEFAULT_RESERVE_BATTERY_PERCENT = 30;
const DEFAULT_MAX_SHAREABLE_ENERGY_KWH = 4;

const firebaseConfig = {
  apiKey: "AIzaSyA8DTDJyU5Rf45eCoI3FcsFxmkpZQzm4eY",
  authDomain: "smart-grid-dev2.firebaseapp.com",
  projectId: "smart-grid-dev2",
  storageBucket: "smart-grid-dev2.firebasestorage.app",
  messagingSenderId: "851224488887",
  appId: "1:851224488887:web:c9245511394dbcc1de9632",
  measurementId: "G-938EMYZ5PY"
};

const demoAccounts = [
  {
    name: "House One",
    email: "h1.demo@solarshare.com",
    password: "demo123",
    houseId: "house_h1",
    walletBalance: 900,
    battery: 25,
    donorEnabled: true,
    donorExtraRatePerKwh: 0,
    reserveBatteryPercent: DEFAULT_RESERVE_BATTERY_PERCENT,
    maxShareableEnergyKwh: DEFAULT_MAX_SHAREABLE_ENERGY_KWH,
    status: "active",
  },
  {
    name: "House Two",
    email: "h2.demo@solarshare.com",
    password: "demo123",
    houseId: "house_h2",
    walletBalance: 1200,
    battery: 82,
    donorEnabled: true,
    donorExtraRatePerKwh: 2,
    reserveBatteryPercent: 35,
    maxShareableEnergyKwh: 5,
    status: "active",
  },
  {
    name: "House Three",
    email: "h3.demo@solarshare.com",
    password: "demo123",
    houseId: "house_h3",
    walletBalance: 1000,
    battery: 55,
    donorEnabled: true,
    donorExtraRatePerKwh: DEFAULT_DONOR_EXTRA_RATE_PER_KWH,
    reserveBatteryPercent: DEFAULT_RESERVE_BATTERY_PERCENT,
    maxShareableEnergyKwh: 3,
    status: "active",
  },
];

const demoHouses = [
  {
    houseId: "house_h1",
    houseName: "House One",
    generation: 2.4,
    consumption: 5.9,
    connectedHouseIds: ["house_h2"],
    enabled: true,
  },
  {
    houseId: "house_h2",
    houseName: "House Two",
    generation: 7.4,
    consumption: 2.6,
    connectedHouseIds: ["house_h1", "house_h3"],
    enabled: true,
  },
  {
    houseId: "house_h3",
    houseName: "House Three",
    generation: 3.8,
    consumption: 3.7,
    connectedHouseIds: ["house_h2"],
    enabled: true,
  },
];

const calculatePricing = (units, donorExtraRatePerKwh = 0) => {
  const safeUnits = Math.max(0, parseFloat(Number(units).toFixed(2)));
  const baseUnits = Math.min(safeUnits, PREMIUM_THRESHOLD_KWH);
  const premiumUnits = Math.max(0, safeUnits - PREMIUM_THRESHOLD_KWH);
  const baseAmount = parseFloat((baseUnits * BASE_RATE_PER_KWH).toFixed(2));
  const premiumAmount = parseFloat((premiumUnits * donorExtraRatePerKwh).toFixed(2));
  const totalAmount = parseFloat((baseAmount + premiumAmount).toFixed(2));

  return {
    units: safeUnits,
    baseRatePerKwh: BASE_RATE_PER_KWH,
    premiumThresholdKwh: PREMIUM_THRESHOLD_KWH,
    donorExtraRatePerKwh,
    baseUnits: parseFloat(baseUnits.toFixed(2)),
    premiumUnits: parseFloat(premiumUnits.toFixed(2)),
    baseAmount,
    premiumAmount,
    totalAmount,
    effectiveRatePerKwh: safeUnits > 0 ? parseFloat((totalAmount / safeUnits).toFixed(2)) : 0,
  };
};

module.exports = {
  firebaseConfig,
  demoAccounts,
  demoHouses,
  calculatePricing,
  BASE_RATE_PER_KWH,
  PREMIUM_THRESHOLD_KWH,
};
