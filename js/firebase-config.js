import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyA_4hMtyvOGbk9xaYqqCKs5N2gBXTzmZdE",
  authDomain: "kk-surveyform.firebaseapp.com",
  projectId: "kk-surveyform",
  storageBucket: "kk-surveyform.firebasestorage.app",
  messagingSenderId: "395728143102",
  appId: "1:395728143102:web:5eb4a5991401b038fa1baf",
  measurementId: "G-G2B6TM0S5X",
  databaseURL: "https://kk-surveyform-default-rtdb.asia-southeast1.firebasedatabase.app" // regional DB
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

// Secondary app for creating users without logging out the admin
const secondaryApp = initializeApp(firebaseConfig, "SecondaryApp");
const secondaryAuth = getAuth(secondaryApp);

export { app, auth, db, secondaryAuth };
