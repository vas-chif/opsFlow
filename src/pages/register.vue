<script setup lang="ts">
/**
 * @file register.vue
 * @description High-contrast, WCAG 2.1 AAA accessible registration page with isolated button loading states
 * @author Vasile Chifeac
 * @created 2026-07-29
 * @modified 2026-07-29
 *
 * @notes
 * - Multi-tenant user onboarding via Firebase Auth
 * - Mandatory sendEmailVerification(user) and immediate signOut(auth)
 * - Custom Elite glassmorphic modal with gold accent for SPAM folder notice
 * - Isolated loading states per button
 *
 * @dependencies
 * - Firebase Auth (createUserWithEmailAndPassword, sendEmailVerification, signOut)
 * - authStore, uiStore
 * - Quasar components
 *
 * @performance
 * - Lightweight, optimized UI rendering
 */

// ── Vue & Framework ──────────────────────────────────────────────────────────
import { ref, computed } from "vue";
import { useRouter } from "vue-router";
import { useQuasar } from "quasar";

// ── Firebase ─────────────────────────────────────────────────────────────────
import { createUserWithEmailAndPassword, sendEmailVerification, signOut } from "firebase/auth";
import { auth } from "@/boot/firebase";

// ── Stores ───────────────────────────────────────────────────────────────────
import { useAuthStore } from "@/stores/authStore";
import { useUiStore } from "@/stores/uiStore";

// ── Composables ──────────────────────────────────────────────────────────────
const router = useRouter();
const q = useQuasar();

// ── State ────────────────────────────────────────────────────────────────────
const authStore = useAuthStore();
const uiStore = useUiStore();

const email = ref("");
const password = ref("");
const confirmPassword = ref("");
const showPassword = ref(false);
const showEliteVerificationModal = ref(false);

// Isolated loading states per button
const isSubmitting = ref(false);
const isGoogleLoading = ref(false);

const errorMessage = computed(() => authStore.error);

// ── Actions ──────────────────────────────────────────────────────────────────
const handleRegister = async (): Promise<void> => {
  if (!email.value || !password.value || !confirmPassword.value) {
    q.notify({
      type: "warning",
      message: "Please fill in all fields",
      position: "top",
    });
    return;
  }

  if (password.value !== confirmPassword.value) {
    q.notify({
      type: "warning",
      message: "Passwords do not match",
      position: "top",
    });
    return;
  }

  if (password.value.length < 8) {
    q.notify({
      type: "warning",
      message: "Password must be at least 8 characters",
      position: "top",
    });
    return;
  }

  isSubmitting.value = true;
  try {
    // 1. Create User in Firebase Auth
    const credential = await createUserWithEmailAndPassword(auth, email.value, password.value);

    // 2. Send Email Verification
    await sendEmailVerification(credential.user);

    // 3. Immediate forced logout to prevent unverified session access
    await signOut(auth);
    authStore.user = null;

    // 4. Open custom Elite Modal
    showEliteVerificationModal.value = true;
  } catch {
    q.notify({
      type: "negative",
      message: authStore.error || "Registration failed",
      position: "top",
    });
  } finally {
    isSubmitting.value = false;
  }
}; /*end handleRegister*/

const handleGoogleRegister = async (): Promise<void> => {
  isGoogleLoading.value = true;
  try {
    await authStore.loginWithGoogle();
    await router.push("/");

    q.notify({
      type: "positive",
      message: "Account registered with Google",
      position: "top",
    });
  } catch {
    q.notify({
      type: "negative",
      message: authStore.error || "Google registration failed",
      position: "top",
    });
  } finally {
    isGoogleLoading.value = false;
  }
}; /*end handleGoogleRegister*/

const goToLogin = async (): Promise<void> => {
  showEliteVerificationModal.value = false;
  await router.push("/login");
}; /*end goToLogin*/

const navigateToLogin = (): void => {
  router.push("/login");
}; /*end navigateToLogin*/
</script>

<template>
  <q-layout view="lHh Lpr lFf">
    <q-page-container>
      <q-page
        class="row items-center justify-center q-pa-md auth-page"
        :class="uiStore.darkMode ? 'dark-canvas' : 'light-canvas'"
      >
        <q-card class="q-pa-xl auth-card" :class="uiStore.darkMode ? 'dark-card' : 'light-card'">
          <!-- Dark mode toggle top right -->
          <div class="row justify-end q-mb-sm">
            <q-btn
              flat
              round
              dense
              :icon="uiStore.darkMode ? 'light_mode' : 'dark_mode'"
              :class="uiStore.darkMode ? 'text-gold' : 'text-primary'"
              @click="uiStore.toggleDarkMode()"
            />
          </div>

          <!-- Logo & Title -->
          <div class="text-center q-mb-xl">
            <q-avatar size="72px" class="q-mb-md logo-avatar">
              <img src="~@/assets/quasar-logo-vertical.svg" alt="OpsFlow" />
            </q-avatar>
            <h1
              class="text-h4 text-weight-bold q-my-none auth-title"
              :class="uiStore.darkMode ? 'text-white' : 'text-navy'"
            >
              OpsFlow
            </h1>
            <p
              class="text-subtitle1 q-mt-xs q-mb-none auth-subtitle"
              :class="uiStore.darkMode ? 'text-slate-light' : 'text-slate-dark'"
            >
              Create your workspace account
            </p>
          </div>

          <!-- Registration Form -->
          <q-form @submit.prevent="handleRegister" class="q-gutter-md">
            <!-- Email -->
            <div class="field-container">
              <label
                class="field-label"
                :class="uiStore.darkMode ? 'text-slate-light' : 'text-navy'"
              >
                Email Address
              </label>
              <q-input
                v-model="email"
                type="email"
                outlined
                dense
                required
                placeholder="name@company.com"
                autocomplete="email"
                class="custom-input"
                :class="uiStore.darkMode ? 'dark-input' : 'light-input'"
              >
                <template #prepend>
                  <q-icon name="email" class="input-icon" />
                </template>
              </q-input>
            </div>

            <!-- Password -->
            <div class="field-container">
              <label
                class="field-label"
                :class="uiStore.darkMode ? 'text-slate-light' : 'text-navy'"
              >
                Password
              </label>
              <q-input
                v-model="password"
                :type="showPassword ? 'text' : 'password'"
                outlined
                dense
                required
                placeholder="••••••••"
                autocomplete="new-password"
                class="custom-input"
                :class="uiStore.darkMode ? 'dark-input' : 'light-input'"
              >
                <template #prepend>
                  <q-icon name="lock" class="input-icon" />
                </template>
                <template #append>
                  <q-icon
                    :name="showPassword ? 'visibility_off' : 'visibility'"
                    class="cursor-pointer input-icon"
                    @click="showPassword = !showPassword"
                  />
                </template>
              </q-input>
            </div>

            <!-- Confirm Password -->
            <div class="field-container">
              <label
                class="field-label"
                :class="uiStore.darkMode ? 'text-slate-light' : 'text-navy'"
              >
                Confirm Password
              </label>
              <q-input
                v-model="confirmPassword"
                :type="showPassword ? 'text' : 'password'"
                outlined
                dense
                required
                placeholder="••••••••"
                autocomplete="new-password"
                class="custom-input"
                :class="uiStore.darkMode ? 'dark-input' : 'light-input'"
              >
                <template #prepend>
                  <q-icon name="lock" class="input-icon" />
                </template>
              </q-input>
            </div>

            <!-- Error Message -->
            <div v-if="errorMessage" class="error-banner text-caption q-mt-sm">
              <q-icon name="error_outline" size="sm" class="q-mr-xs" />
              {{ errorMessage }}
            </div>

            <!-- Submit Button -->
            <q-btn
              type="submit"
              label="Create Account"
              class="full-width q-mt-lg primary-cta-btn"
              :loading="isSubmitting"
              unelevated
              no-caps
              :class="uiStore.darkMode ? 'dark-cta' : 'light-cta'"
            />

            <!-- Google Registration Button -->
            <q-btn
              outline
              label="Sign up with Google"
              icon="account_circle"
              class="full-width q-mt-sm google-btn"
              :loading="isGoogleLoading"
              no-caps
              :class="uiStore.darkMode ? 'dark-google' : 'light-google'"
              @click="handleGoogleRegister"
            />

            <!-- Links -->
            <div class="row justify-center items-center q-mt-md text-body2">
              <q-btn
                flat
                dense
                label="Already have an account? Sign in"
                no-caps
                class="auth-link-primary text-weight-bold"
                :class="uiStore.darkMode ? 'text-gold-light' : 'text-gold-dark'"
                @click="navigateToLogin"
              />
            </div>
          </q-form>

          <!-- Security Notice -->
          <div
            class="q-mt-xl text-center text-caption security-notice"
            :class="uiStore.darkMode ? 'text-slate-muted' : 'text-slate-dark'"
          >
            <q-icon name="verified_user" size="xs" class="q-mr-xs text-gold" />
            Multi-tenant workspace protected by Firestore Security Rules
          </div>
        </q-card>
      </q-page>

      <!-- ── Custom Elite Email Verification Dialog ────────────────────────── -->
      <q-dialog v-model="showEliteVerificationModal" persistent backdrop-filter="blur(14px)">
        <q-card
          class="q-pa-lg elite-modal-card text-center"
          :class="uiStore.darkMode ? 'dark-modal' : 'light-modal'"
        >
          <div class="column items-center q-pa-md">
            <!-- Icon Badge -->
            <div class="icon-badge q-mb-md">
              <q-icon name="mark_email_unread" size="44px" color="amber-8" />
            </div>

            <!-- Title -->
            <h3
              class="text-h5 text-weight-bold q-my-none modal-title"
              :class="uiStore.darkMode ? 'text-white' : 'text-navy'"
            >
              Verifica Email Richiesta
            </h3>

            <div class="gold-divider q-my-md" />

            <!-- Description -->
            <p
              class="text-body1 modal-desc q-mb-lg"
              :class="uiStore.darkMode ? 'text-slate-light' : 'text-slate-dark'"
            >
              Registrazione avvenuta con successo! Ti abbiamo inviato un'email di conferma.
              <br /><br />
              Controlla la tua casella di posta e la cartella
              <strong class="text-amber-8">SPAM</strong>, quindi attiva l'indirizzo prima di
              effettuare il login.
            </p>

            <!-- CTA Button -->
            <q-btn
              label="Procedi al Login"
              icon-right="arrow_forward"
              class="full-width elite-modal-btn"
              :class="uiStore.darkMode ? 'dark-modal-btn' : 'light-modal-btn'"
              unelevated
              no-caps
              @click="goToLogin"
            />
          </div>
        </q-card>
      </q-dialog>
    </q-page-container>
  </q-layout>
</template>

<style scoped lang="scss">
// ── Canvas Styles ─────────────────────────────────────────────────────────────
.auth-page {
  min-height: 100vh;
  transition: background-color 0.3s ease;
}

.light-canvas {
  background-color: #f4f1ea;
}

.dark-canvas {
  background-color: #0b1320;
}

// ── Card Styles ───────────────────────────────────────────────────────────────
.auth-card {
  width: 100%;
  max-width: 440px;
  border-radius: 24px;
  transition: all 0.3s ease;
}

.light-card {
  background: #ffffff;
  border: 1px solid rgba(197, 160, 101, 0.4);
  box-shadow: 0 20px 48px rgba(10, 35, 66, 0.08);
}

.dark-card {
  background: #152238;
  border: 1.5px solid #c5a065;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.6);
}

// ── Typography Colors ────────────────────────────────────────────────────────
.text-navy {
  color: #0a2342;
}

.text-slate-dark {
  color: #475569;
}

.text-slate-light {
  color: #cbd5e1;
}

.text-slate-muted {
  color: #94a3b8;
}

.text-gold {
  color: #c5a065;
}

.text-gold-light {
  color: #fbbf24;
}

.text-gold-dark {
  color: #b45309;
}

.field-container {
  margin-bottom: 12px;
}

.field-label {
  display: block;
  font-size: 0.875rem;
  font-weight: 600;
  margin-bottom: 6px;
}

// ── Input Field Contrast Overrides ───────────────────────────────────────────
.custom-input {
  border-radius: 12px;

  :deep(.q-field__control) {
    border-radius: 12px !important;
    height: 48px;
  }
}

.light-input {
  :deep(.q-field__control) {
    background: #ffffff !important;
    border-color: #cbd5e1 !important;
  }
  :deep(.q-field__native),
  :deep(input) {
    color: #0f172a !important;
    font-weight: 500;
  }
  .input-icon {
    color: #0a2342;
  }
}

.dark-input {
  :deep(.q-field__control) {
    background: #0b1424 !important;
    border-color: #334155 !important;
  }
  :deep(.q-field__native),
  :deep(input) {
    color: #ffffff !important;
    font-weight: 500;
  }
  .input-icon {
    color: #c5a065;
  }
}

// ── Buttons High Contrast ────────────────────────────────────────────────────
.primary-cta-btn {
  height: 48px;
  font-size: 1rem;
  font-weight: 700;
  border-radius: 12px;
  letter-spacing: 0.03em;
}

.light-cta {
  background-color: #0a2342 !important;
  color: #ffffff !important;
  box-shadow: 0 4px 14px rgba(10, 35, 66, 0.25);
  &:hover {
    background-color: #12345e !important;
  }
}

.dark-cta {
  background-color: #c5a065 !important;
  color: #0b1320 !important;
  box-shadow: 0 4px 16px rgba(197, 160, 101, 0.35);
  &:hover {
    background-color: #d4af75 !important;
  }
}

.google-btn {
  height: 48px;
  font-size: 0.95rem;
  font-weight: 600;
  border-radius: 12px;
}

.light-google {
  border: 1.5px solid #0a2342 !important;
  color: #0a2342 !important;
  background: #ffffff !important;
}

.dark-google {
  border: 1.5px solid #c5a065 !important;
  color: #ffffff !important;
  background: #0b1424 !important;
}

// ── Error Banner ─────────────────────────────────────────────────────────────
.error-banner {
  background: #fef2f2;
  border: 1px solid #fca5a5;
  color: #991b1b;
  padding: 8px 12px;
  border-radius: 8px;
  font-weight: 500;
}

// ── Custom Elite Modal Styles ────────────────────────────────────────────────
.elite-modal-card {
  width: 100%;
  max-width: 460px;
  border-radius: 28px;
  transition: all 0.3s ease;
}

.light-modal {
  background: #ffffff;
  border: 2px solid #c5a065;
  box-shadow: 0 24px 60px rgba(10, 35, 66, 0.18);
}

.dark-modal {
  background: #152238;
  border: 2px solid #c5a065;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.8);
}

.icon-badge {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(197, 160, 101, 0.15);
  border: 1.5px solid rgba(197, 160, 101, 0.4);
}

.modal-title {
  font-family: "Playfair Display", Georgia, serif;
}

.gold-divider {
  width: 60px;
  height: 3px;
  background: linear-gradient(90deg, transparent, #c5a065, transparent);
  border-radius: 2px;
}

.modal-desc {
  line-height: 1.6;
}

.elite-modal-btn {
  height: 48px;
  font-size: 1rem;
  font-weight: 700;
  border-radius: 14px;
}

.light-modal-btn {
  background-color: #0a2342 !important;
  color: #ffffff !important;
  box-shadow: 0 4px 16px rgba(10, 35, 66, 0.25);
}

.dark-modal-btn {
  background-color: #c5a065 !important;
  color: #0b1320 !important;
  box-shadow: 0 4px 16px rgba(197, 160, 101, 0.35);
}
</style>
