/**
 * @file firebase.ts
 * @description Initializes Firebase App and Auth on the client before Vue mount.
 * @author Vasile Chifeac
 * @created 2026-07-16
 * @modified 2026-07-16
 *
 * @notes
 * - Config from VITE_* env vars only (never hardcode secrets)
 * - Optional Auth emulator when VITE_USE_EMULATOR=true in DEV
 *
 * @dependencies
 * - firebase/app
 * - firebase/auth
 *
 * @performance
 * - Single initializeApp call at boot (<5ms typical)
 */

// ── Vue & Framework ──────────────────────────────────────────────────────────
import { defineBoot } from "#q-app";

// ── Firebase ─────────────────────────────────────────────────────────────────
import { initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, connectAuthEmulator, type Auth } from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string,
  messagingSenderId: import.meta.env
    .VITE_FIREBASE_MESSAGING_SENDER_ID as string,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string
};

const app: FirebaseApp = initializeApp(firebaseConfig);
const auth: Auth = getAuth(app);

if (import.meta.env.DEV && import.meta.env.VITE_USE_EMULATOR === "true") {
  connectAuthEmulator(auth, "http://localhost:9099", { disableWarnings: true });
}

export { app, auth };

export default defineBoot(() => {
  // Firebase is initialized at module load so auth is ready for stores.
}); /*end defineBoot*/
