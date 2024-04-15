module.exports = { getDbClient };
const { initializeApp, getApps, getApp } = require("firebase/app");
const { getDatabase } = require("firebase/database");
const { getAnalytics, isSupported } = require("firebase/analytics");

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: process.env["FIREBASE_API_KEY"],
  authDomain: process.env["authDomain"],
  databaseURL: process.env["databaseURL"],
  projectId: process.env["projectId"],
  storageBucket: process.env["storageBucket"],
  messagingSenderId: process.env["messagingSenderId"],
  appId: process.env["appId"],
  measurementId: process.env["measurementId"],
};

// Check if Firebase app is already initialized to avoid "duplicate-app" error
let app;
if (!getApps().length) {
  app = initializeApp(firebaseConfig);
  console.log("Firebase app initialized successfully.");
} else {
  app = getApp(); // if already initialized, use that one
}

// Initialize Firebase Database Client
const dbClient = getDatabase(app);

// Initialize Firebase Analytics only if it's supported
isSupported().then((supported) => {
  if (supported) {
    const analytics = getAnalytics(app);
    console.log("Analytics initialized successfully.");
  } else {
    console.log("Analytics not supported in this environment.");
  }
});

function getDbClient() {
  console.log("Fetching Firebase Database client...");
  return dbClient; // Returns the Firebase Database client
}

module.exports = { getDbClient };
