<script setup lang="ts">
/**
 * @file login.vue
 * @description High-contrast, WCAG 2.1 AAA accessible login page with isolated button loading states
 * @author Vasile Chifeac
 * @created 2026-07-29
 * @modified 2026-07-29
 *
 * @notes
 * - Multi-tenant auth via Firebase Auth & Custom Claims
 * - Enforces email verification check before granting access to dashboard
 * - Isolated loading states per button to avoid triggering all spinners simultaneously
 *
 * @dependencies
 * - Firebase Auth
 * - authStore, uiStore
 * - Quasar components
 *
 * @performance
 * - Optimized render, zero runtime bloat
 */

// ── Vue & Framework ──────────────────────────────────────────────────────────
import { ref, computed } from "vue";
import { useRouter, useRoute } from "vue-router";
import { useQuasar } from "quasar";

// ── Stores ───────────────────────────────────────────────────────────────────
import { useAuthStore } from "@/stores/authStore";
import { useUiStore } from "@/stores/uiStore";

// ── Composables ──────────────────────────────────────────────────────────────
const router = useRouter();
const q = useQuasar();
const route = useRoute();

// ── State ────────────────────────────────────────────────────────────────────
const authStore = useAuthStore();
const uiStore = useUiStore();

const email = ref("");
const password = ref("");
const showPassword = ref(false);
const showUnverifiedBanner = ref(false);

// Isolated loading states per button
const isSubmitting = ref(false);
const isGoogleLoading = ref(false);
const resendingEmail = ref(false);

const errorMessage = computed(() => authStore.error);

// ── Actions ──────────────────────────────────────────────────────────────────
const handleLogin = async (): Promise<void> => {
  if (!email.value || !password.value) {
    q.notify({
      type: "warning",
      message: "Please fill in all fields",
      position: "top",
    });
    return;
  }

  showUnverifiedBanner.value = false;
  isSubmitting.value = true;

  try {
    await authStore.login(email.value, password.value);

    const redirect = (route.query.redirect as string) || "/";
    await router.push(redirect);

    q.notify({
      type: "positive",
      message: "Login successful",
      position: "top",
    });
  } catch (err) {
    if (err instanceof Error && err.message === "EMAIL_NOT_VERIFIED") {
      showUnverifiedBanner.value = true;
      q.notify({
        type: "warning",
        message:
          "Attenzione: la tua email non è stata ancora verificata. Controlla la posta (inclusa la cartella SPAM) e clicca sul link di conferma.",
        position: "top",
        timeout: 8000,
      });
      return;
    }

    q.notify({
      type: "negative",
      message: authStore.error || "Login failed",
      position: "top",
    });
  } finally {
    isSubmitting.value = false;
  }
}; /*end handleLogin*/

const handleResendVerification = async (): Promise<void> => {
  if (!email.value || !password.value) {
    q.notify({
      type: "warning",
      message: "Inserisci email e password per richiedere un nuovo link di verifica",
      position: "top",
    });
    return;
  }

  resendingEmail.value = true;
  try {
    await authStore.resendVerificationEmail(email.value, password.value);
    q.notify({
      type: "positive",
      message:
        "Nuova email di conferma inviata! Controlla la tua casella di posta e la cartella SPAM.",
      position: "top",
      timeout: 6000,
    });
  } catch {
    q.notify({
      type: "negative",
      message: "Impossibile inviare l'email di conferma. Verifica le credenziali.",
      position: "top",
    });
  } finally {
    resendingEmail.value = false;
  }
}; /*end handleResendVerification*/

const handleGoogleLogin = async (): Promise<void> => {
  isGoogleLoading.value = true;
  try {
    await authStore.loginWithGoogle();

    const redirect = (route.query.redirect as string) || "/";
    await router.push(redirect);

    q.notify({
      type: "positive",
      message: "Signed in with Google",
      position: "top",
    });
  } catch {
    q.notify({
      type: "negative",
      message: authStore.error || "Google login failed",
      position: "top",
    });
  } finally {
    isGoogleLoading.value = false;
  }
}; /*end handleGoogleLogin*/

const navigateToRegister = (): void => {
  router.push("/register");
}; /*end navigateToRegister*/

const navigateToForgotPassword = (): void => {
  q.notify({
    type: "info",
    message: "Password reset coming soon",
    position: "top",
  });
}; /*end navigateToForgotPassword*/
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
              Sign in to your workspace
            </p>
          </div>

          <!-- Warning Banner: Unverified Email (Elite Styling) -->
          <div
            v-if="showUnverifiedBanner"
            class="q-mb-lg unverified-banner-card"
            :class="uiStore.darkMode ? 'dark-unverified-banner' : 'light-unverified-banner'"
          >
            <div class="row items-start no-wrap q-gutter-md">
              <div
                class="banner-icon-badge flex-shrink-0"
                :class="uiStore.darkMode ? 'dark-icon-badge' : 'light-icon-badge'"
              >
                <q-icon name="mark_email_unread" size="24px" />
              </div>

              <div class="col">
                <div
                  class="text-weight-bold text-subtitle2"
                  :class="uiStore.darkMode ? 'text-white' : 'text-navy'"
                >
                  Email Non Verificata
                </div>
                <div
                  class="text-caption q-mt-xs banner-text"
                  :class="uiStore.darkMode ? 'text-slate-light' : 'text-slate-dark'"
                >
                  Attenzione: la tua email non è stata ancora verificata. Controlla la posta
                  (inclusa la cartella <strong class="text-amber-8">SPAM</strong>) e clicca sul link
                  di conferma.
                </div>
                <div class="row justify-end q-mt-sm">
                  <q-btn
                    unelevated
                    no-caps
                    label="Reinvia Email"
                    class="resend-btn"
                    :class="uiStore.darkMode ? 'dark-resend-btn' : 'light-resend-btn'"
                    :loading="resendingEmail"
                    @click="handleResendVerification"
                  />
                </div>
              </div>
            </div>
          </div>

          <!-- Login Form -->
          <q-form @submit.prevent="handleLogin" class="q-gutter-md">
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
                autocomplete="current-password"
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

            <!-- Error Message -->
            <div
              v-if="errorMessage && errorMessage !== 'EMAIL_NOT_VERIFIED'"
              class="error-banner text-caption q-mt-sm"
            >
              <q-icon name="error_outline" size="sm" class="q-mr-xs" />
              {{ errorMessage }}
            </div>

            <!-- Submit Button -->
            <q-btn
              type="submit"
              label="Sign In"
              class="full-width q-mt-lg primary-cta-btn"
              :loading="isSubmitting"
              unelevated
              no-caps
              :class="uiStore.darkMode ? 'dark-cta' : 'light-cta'"
            />

            <!-- Google Auth Button -->
            <q-btn
              outline
              label="Sign in with Google"
              icon="account_circle"
              class="full-width q-mt-sm google-btn"
              :loading="isGoogleLoading"
              no-caps
              :class="uiStore.darkMode ? 'dark-google' : 'light-google'"
              @click="handleGoogleLogin"
            />

            <!-- Links -->
            <div class="row justify-between items-center q-mt-md text-body2">
              <q-btn
                flat
                dense
                label="Forgot password?"
                no-caps
                class="auth-link-secondary"
                :class="uiStore.darkMode ? 'text-amber-light' : 'text-navy-link'"
                @click="navigateToForgotPassword"
              />
              <q-btn
                flat
                dense
                label="Create account"
                no-caps
                class="auth-link-primary text-weight-bold"
                :class="uiStore.darkMode ? 'text-gold-light' : 'text-gold-dark'"
                @click="navigateToRegister"
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

// ── Elite Unverified Email Banner ────────────────────────────────────────────
.unverified-banner-card {
  border-radius: 18px;
  padding: 16px 20px;
  transition: all 0.3s ease;
}

.light-unverified-banner {
  background: #fffbeb;
  border: 1.5px solid #f59e0b;
  box-shadow: 0 8px 24px rgba(245, 158, 11, 0.12);
}

.dark-unverified-banner {
  background: rgba(245, 158, 11, 0.08);
  border: 1.5px solid #c5a065;
  box-shadow: 0 8px 24px rgba(197, 160, 101, 0.2);
}

.banner-icon-badge {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.light-icon-badge {
  background: rgba(245, 158, 11, 0.18);
  color: #b45309;
}

.dark-icon-badge {
  background: rgba(197, 160, 101, 0.2);
  color: #fbbf24;
}

.banner-text {
  line-height: 1.5;
}

.resend-btn {
  height: 38px;
  border-radius: 10px;
  font-weight: 700;
  padding: 0 16px;
}

.light-resend-btn {
  background-color: #0a2342 !important;
  color: #ffffff !important;
}

.dark-resend-btn {
  background-color: #c5a065 !important;
  color: #0b1320 !important;
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

.text-amber-light {
  color: #60a5fa;
}

.text-navy-link {
  color: #0284c7;
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
</style>
