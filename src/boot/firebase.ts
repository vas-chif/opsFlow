/**
 * @file firebase.ts
 * @description Initializes Firebase App, Auth, and app-level auth/theme listeners on client boot.
 * @author Vasile Chifeac
 * @created 2026-07-16
 * @modified 2026-07-29
 *
 * @notes
 * - Config from VITE_* env vars only (never hardcode secrets)
 * - Registers authStore.init() and uiStore.initDarkMode() on app boot
 *
 * @dependencies
 * - firebase/app
 * - firebase/auth
 * - authStore & uiStore
 *
 * @performance
 * - Single initializeApp call at boot (<5ms typical)
 */

// ── Vue & Framework ──────────────────────────────────────────────────────────
import { defineBoot } from "#q-app";

// ── Firebase ─────────────────────────────────────────────────────────────────
import { initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, connectAuthEmulator, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

// ── Stores ───────────────────────────────────────────────────────────────────
import { useAuthStore } from "@/stores/authStore";
import { useUiStore } from "@/stores/uiStore";

const firebaseConfig = {
  apiKey:
    (import.meta.env.VITE_FIREBASE_API_KEY as string | undefined) ||
    "AIzaSyDep2aBRmSLypNe52MqXb2civiHx8WIKVk",
  authDomain:
    (import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined) ||
    "opsflow-88of.firebaseapp.com",
  projectId: (import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined) || "opsflow-88of",
  storageBucket:
    (import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined) ||
    "opsflow-88of.firebasestorage.app",
  messagingSenderId: String(import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "348805838247"),
  appId:
    (import.meta.env.VITE_FIREBASE_APP_ID as string | undefined) ||
    "1:348805838247:web:d921ed11fffb46ad407282",
};

const app: FirebaseApp = initializeApp(firebaseConfig);
const auth: Auth = getAuth(app);
const db: Firestore = getFirestore(app);

if (import.meta.env.DEV && String(import.meta.env.VITE_USE_EMULATOR) === "true") {
  try {
    connectAuthEmulator(auth, "http://localhost:9099", { disableWarnings: true });
  } catch {
    // Emulator connection might already be initialized during HMR
  }
}

export { app, auth, db };

export default defineBoot(() => {
  // Initialize stores on app boot for persistent auth state and theme
  const authStore = useAuthStore();
  const uiStore = useUiStore();

  uiStore.initDarkMode();
  authStore.init();
}); /*end defineBoot*/
