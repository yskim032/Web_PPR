// ============================================================
// Firebase Configuration - web-ppr-32a89
// ============================================================

import { initializeApp }  from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAnalytics }   from "https://www.gstatic.com/firebasejs/10.8.0/firebase-analytics.js";
import { getFirestore }   from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth }        from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getStorage }     from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

const firebaseConfig = {
  apiKey:            "AIzaSyABO5hnDD18_e7z8c0lLmH5ZOjvVWBc6to",
  authDomain:        "web-ppr-32a89.firebaseapp.com",
  projectId:         "web-ppr-32a89",
  storageBucket:     "web-ppr-32a89.firebasestorage.app",
  messagingSenderId: "78167313761",
  appId:             "1:78167313761:web:98bd42b259227e1d5e8920",
  measurementId:     "G-M3CFSWQYDJ"
};

let app, analytics, db, auth, storage;
let firebaseReady = false;

try {
  app       = initializeApp(firebaseConfig);
  analytics = getAnalytics(app);
  db        = getFirestore(app);
  auth      = getAuth(app);
  storage   = getStorage(app);
  firebaseReady = true;
  console.log("[Firebase] Initialized: web-ppr-32a89");
} catch (e) {
  console.warn("[Firebase] Init failed - running in local mode:", e.message);
  firebaseReady = false;
}

export { app, analytics, db, auth, storage, firebaseReady };
