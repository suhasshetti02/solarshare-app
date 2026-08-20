#include <WiFi.h>
#include <Firebase_ESP_Client.h>

// Provide the token generation process info.
#include "addons/TokenHelper.h"
// Provide the RTDB payload printing info and other helper functions.
#include "addons/RTDBHelper.h"

/* 
 * SMART GRID NODE - ESP32 FIRMWARE
 * --------------------------------
 * This firmware reads local telemetry (solar generation, house consumption, 
 * battery level), actuates the physical relays, and pushes the data 
 * to Firebase Firestore.
 */

// 1. Network Credentials
#define WIFI_SSID "YOUR_WIFI_SSID"
#define WIFI_PASSWORD "YOUR_WIFI_PASSWORD"

// 2. Firebase Project Credentials
#define API_KEY "AIzaSyA8DTDJyU5Rf45eCoI3FcsFxmkpZQzm4eY"
#define PROJECT_ID "smart-grid-dev2"
// Each ESP32 logs in as a specific house. 
#define USER_EMAIL "h1.demo@solarshare.com"
#define USER_PASSWORD "password123"
#define HOUSE_ID "house_h1"

// 3. Hardware GPIO Pins
#define PIN_SENSOR_BATTERY 34
#define PIN_SENSOR_SOLAR   35
#define PIN_SENSOR_USAGE   32

#define RELAY_GRID         18  // Contactor 1: Main Utility Grid
#define RELAY_P2P          19  // Contactor 2: Neighborhood Battery/P2P Bus
#define RELAY_FAULT        21  // Contactor 3: Safety Isolation

// Firebase objects
FirebaseData fbdo;
FirebaseAuth auth;
FirebaseConfig config;

unsigned long sendDataPrevMillis = 0;
const long interval = 10000; // Send telemetry every 10 seconds

void setup() {
  Serial.begin(115200);
  
  // Initialize Relays
  pinMode(RELAY_GRID, OUTPUT);
  pinMode(RELAY_P2P, OUTPUT);
  pinMode(RELAY_FAULT, OUTPUT);
  
  // Safe default: Disconnect from everything until connected
  digitalWrite(RELAY_GRID, LOW);
  digitalWrite(RELAY_P2P, LOW);
  digitalWrite(RELAY_FAULT, HIGH); 
  
  // Connect to Wi-Fi
  Serial.print("Connecting to Wi-Fi");
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi connected.");

  // Initialize Firebase
  Serial.println("Connecting to Firebase...");
  config.api_key = API_KEY;
  auth.user.email = USER_EMAIL;
  auth.user.password = USER_PASSWORD;
  
  config.token_status_callback = tokenStatusCallback;

  Firebase.begin(&config, &auth);
  Firebase.reconnectWiFi(true);
}

void loop() {
  // Check if Firebase is ready and 10 seconds have passed
  if (Firebase.ready() && (millis() - sendDataPrevMillis > interval || sendDataPrevMillis == 0)) {
    sendDataPrevMillis = millis();
    
    /* 
     * 1. SENSOR READINGS 
     * In a production deployment, use analogRead() and map logic.
     * Here, we simulate the sensor drift for the demo.
     */
    float generation = random(5, 50) / 10.0;  // 0.5 - 5.0 kW
    float consumption = random(5, 40) / 10.0; // 0.5 - 4.0 kW
    
    // Read battery voltage and map to percentage. (Mocked as 75.5% here)
    // int batRaw = analogRead(PIN_SENSOR_BATTERY);
    float battery = 75.5; 
    
    /*
     * 2. DETERMINE OPERATING MODE
     */
    String mode = "GRID";
    if (battery > 60 && generation > consumption) {
      mode = "P2P";       // Surplus: Share with neighbors
    } else if (battery < 20) {
      mode = "FAULT";     // Critical: Safety cutoff
    } else if (generation >= consumption) {
      mode = "BATTERY";   // Self-sufficient
    }
    
    /*
     * 3. ACTUATE PHYSICAL RELAYS
     */
    updateRelays(mode);

    /*
     * 4. PUSH TELEMETRY TO FIRESTORE
     */
    updateFirestoreData(generation, consumption, battery, mode);
  }
}

void updateRelays(String mode) {
  // Ensure break-before-make: turn off conflicting relays before turning on the new one
  if (mode == "FAULT") {
    digitalWrite(RELAY_GRID, LOW);
    digitalWrite(RELAY_P2P, LOW);
    digitalWrite(RELAY_FAULT, HIGH);
  } else if (mode == "GRID") {
    digitalWrite(RELAY_P2P, LOW);
    digitalWrite(RELAY_FAULT, LOW);
    delay(50); // Small mechanical delay
    digitalWrite(RELAY_GRID, HIGH);
  } else if (mode == "P2P" || mode == "BATTERY") {
    digitalWrite(RELAY_GRID, LOW);
    digitalWrite(RELAY_FAULT, LOW);
    delay(50);
    digitalWrite(RELAY_P2P, HIGH);
  }
}

void updateFirestoreData(float gen, float con, float bat, String mode) {
  // Construct Firestore Document Patch for House Document
  FirebaseJson houseDoc;
  houseDoc.set("fields/generation/doubleValue", gen);
  houseDoc.set("fields/consumption/doubleValue", con);
  houseDoc.set("fields/battery/doubleValue", bat);
  houseDoc.set("fields/reserve/integerValue", 30);
  
  String housePath = String("houses/") + HOUSE_ID;
  
  Serial.println("Pushing telemetry to " + housePath + "...");
  if (Firebase.Firestore.patchDocument(&fbdo, PROJECT_ID, "", housePath.c_str(), houseDoc.raw(), "generation,consumption,battery,reserve")) {
    Serial.println("House updated successfully.");
  } else {
    Serial.println("Failed to update house: " + fbdo.errorReason());
  }

  // If this ESP32 acts as the primary node, it updates the global grid_state
  if (String(HOUSE_ID) == "house_h1") {
    FirebaseJson gridDoc;
    gridDoc.set("fields/bus_source/stringValue", mode);
    gridDoc.set("fields/availability_mode/stringValue", mode);
    gridDoc.set("fields/switching_confirmed/booleanValue", (mode == "P2P" || mode == "BATTERY"));
    gridDoc.set("fields/contactor_1/booleanValue", mode == "GRID");
    gridDoc.set("fields/contactor_2/booleanValue", (mode == "BATTERY" || mode == "P2P"));
    gridDoc.set("fields/contactor_3/booleanValue", mode == "FAULT");
    
    if (Firebase.Firestore.patchDocument(&fbdo, PROJECT_ID, "", "system/grid_state", gridDoc.raw(), "bus_source,availability_mode,switching_confirmed,contactor_1,contactor_2,contactor_3")) {
      Serial.println("Grid state updated: " + mode);
    } else {
      Serial.println("Failed to update grid state: " + fbdo.errorReason());
    }
  }
}
