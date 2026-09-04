<script setup lang="ts">
/**
 * @file invite.vue
 * @description Landing page for tenant email invitation links (Step 14).
 *              Validates the cryptographic token via Cloud Function and onboards
 *              the user into the target tenant with a single click.
 * @author Vasile Chifeac
 * @created 2026-09-04
 * @modified 2026-09-04
 *
 * @notes
 * - Route: /#/invite?token=<rawToken>&tenant=<tenantId>  (filename-based routing)
 * - Flow A (unauthenticated): shows login/register CTA, then auto-accepts after auth
 * - Flow B (authenticated): shows confirm card and calls acceptTenantInvitation directly
 * - MANDATORY: getIdToken(true) + authStore.refreshClaims() BEFORE router.push (Prescrizione 3)
 * - Anti-Replay: the Cloud Function uses runTransaction to block double-redemption
 *
 * @dependencies
 * - Firebase Auth (getAuth, onAuthStateChanged)
 * - Firebase Functions (httpsCallable)
 * - authStore (refreshClaims)
 * - quasar (useQuasar)
 *
 * @performance
 * - Zero Firestore reads on this page — all validation is in Cloud Function (§5)
 */
// ── Vue & Framework ──────────────────────────────────────────────────────────
import { ref, onMounted, computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useQuasar } from "quasar";

// ── Firebase ─────────────────────────────────────────────────────────────────
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { getFunctions, httpsCallable } from "firebase/functions";
import { app } from "@/boot/firebase";

// ── Stores ───────────────────────────────────────────────────────────────────
import { useAuthStore } from "@/stores/authStore";

// ── State ──────────────────────────────────────────────────────────────────
const route = useRoute();
const router = useRouter();
const $q = useQuasar();
const authStore = useAuthStore();
const auth = getAuth(app);

const token = computed(() => route.query.token as string | undefined);
const tenantId = computed(() => route.query.tenant as string | undefined);

const isAccepting = ref(false);
const isAuthChecking = ref(true);
const currentUser = ref(auth.currentUser);
const acceptError = ref<string | null>(null);
const acceptSuccess = ref(false);

// ── Auth state tracking ────────────────────────────────────────────────────
onMounted(() => {
  const unsubscribe = onAuthStateChanged(auth, (user) => {
    currentUser.value = user;
    isAuthChecking.value = false;
    unsubscribe();
  });

  if (!token.value || !tenantId.value) {
    acceptError.value = "Link di invito non valido o incompleto. Controlla l'email ricevuta.";
  }
});

// ── Accept invitation ──────────────────────────────────────────────────────
async function acceptInvitation(): Promise<void> {
  if (!token.value || !tenantId.value) {
    acceptError.value = "Parametri di invito mancanti.";
    return;
  }
  if (!currentUser.value) {
    // Redirect to login with return URL so we come back after auth
    void router.push(`/login?redirect=${encodeURIComponent(route.fullPath)}`);
    return;
  }

  isAccepting.value = true;
  acceptError.value = null;

  try {
    const functions = getFunctions(app, "europe-west1");
    const acceptFn = httpsCallable<
      { token: string; tenantId: string },
      { success: boolean; tenantId: string; message: string }
    >(functions, "acceptTenantInvitation");

    await acceptFn({ token: token.value, tenantId: tenantId.value });

    // ✅ PRESCRIZIONE 3 (MANDATORY): Force refresh JWT to load new Custom Claims
    // Without this, Vue Router will block navigation due to stale token without tenantId/role
    await currentUser.value.getIdToken(true);
    await authStore.refreshClaims();

    acceptSuccess.value = true;

    $q.notify({
      type: "positive",
      message: "🎉 Benvenuto nel team! Stai accedendo al tuo workspace...",
      icon: "celebration",
      timeout: 3000,
    });

    // Navigate to workspaces after a brief celebratory delay
    setTimeout(() => {
      void router.push("/workspaces");
    }, 1500);
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Errore durante l'accettazione dell'invito.";
    acceptError.value = message;
    $q.notify({ type: "negative", message, timeout: 6000 });
  } finally {
    isAccepting.value = false;
  }
} /*end acceptInvitation*/

function goToLogin(): void {
  void router.push(`/login?redirect=${encodeURIComponent(route.fullPath)}`);
} /*end goToLogin*/
</script>

<template>
  <div class="invite-page fullscreen flex flex-center">
    <!-- Background -->
    <div class="invite-bg" />

    <div class="invite-container">
      <!-- Logo / Brand -->
      <div class="text-center q-mb-xl">
        <div class="invite-logo">
          <q-icon name="hub" size="48px" style="color: #c5a065" />
        </div>
        <div
          class="text-h4 text-weight-bold q-mt-sm"
          style="color: #c5a065; font-family: &quot;Playfair Display&quot;, serif"
        >
          OpsFlow
        </div>
        <div class="text-caption" style="color: #9aacbe; letter-spacing: 0.2em">
          WORKSPACE INTELLIGENCE PLATFORM
        </div>
      </div>

      <!-- Main Card -->
      <q-card class="invite-card q-pa-xl">
        <!-- Loading state -->
        <div v-if="isAuthChecking" class="column items-center q-pa-lg">
          <q-spinner-dots color="primary" size="48px" />
          <div class="q-mt-md text-grey-5">Verifica in corso...</div>
        </div>

        <!-- Invalid link -->
        <div v-else-if="!token || !tenantId" class="column items-center text-center q-pa-md">
          <q-icon name="broken_image" size="64px" color="negative" class="q-mb-md" />
          <div class="text-h6 text-weight-bold text-negative q-mb-sm">Link non valido</div>
          <div class="text-body2 q-mb-xl" style="color: #9aacbe">
            Il link di invito è malformato o incompleto.<br />
            Controlla l'email ricevuta e riprova.
          </div>
          <q-btn unelevated label="Vai all'accesso" color="primary" icon="login" to="/login" />
        </div>

        <!-- Success state -->
        <div v-else-if="acceptSuccess" class="column items-center text-center q-pa-md">
          <div class="success-icon q-mb-md">🎉</div>
          <div class="text-h5 text-weight-bold q-mb-sm" style="color: #c5a065">
            Benvenuto nel team!
          </div>
          <div class="text-body2 q-mb-md" style="color: #9aacbe">
            Accesso concesso. Stai per essere reindirizzato ai tuoi workspace...
          </div>
          <q-linear-progress
            indeterminate
            color="primary"
            class="q-mt-md"
            style="border-radius: 8px"
          />
        </div>

        <!-- Main invite content -->
        <div v-else>
          <div class="text-center q-mb-lg">
            <q-icon name="mail" size="48px" style="color: #c5a065" class="q-mb-sm" />
            <div
              class="text-h5 text-weight-bold q-mb-xs"
              style="color: #f9f7f2; font-family: &quot;Playfair Display&quot;, serif"
            >
              Sei stato invitato!
            </div>
            <div class="text-body2" style="color: #9aacbe">
              Hai ricevuto un invito per unirti ad un'organizzazione su OpsFlow.
            </div>
          </div>

          <!-- Error alert -->
          <q-banner
            v-if="acceptError"
            class="q-mb-md text-white"
            style="
              background: rgba(220, 80, 80, 0.2);
              border: 1px solid rgba(220, 80, 80, 0.4);
              border-radius: 10px;
            "
            rounded
          >
            <template #avatar>
              <q-icon name="error_outline" color="negative" />
            </template>
            {{ acceptError }}
          </q-banner>

          <!-- Not authenticated: prompt to log in -->
          <div v-if="!currentUser" class="column items-center text-center q-gutter-md">
            <div class="text-body2" style="color: #9aacbe">
              Per accettare l'invito devi prima accedere o creare un account OpsFlow.
            </div>
            <q-btn
              unelevated
              color="primary"
              label="Accedi o Registrati"
              icon="login"
              size="lg"
              class="full-width invite-cta-btn"
              @click="goToLogin"
            />
            <div class="text-caption" style="color: #5a7a9b">
              Il link di invito rimarrà valido per 7 giorni.
            </div>
          </div>

          <!-- Authenticated: show accept button -->
          <div v-else class="column q-gutter-md">
            <q-banner
              class="text-white q-mb-sm"
              style="
                background: rgba(197, 160, 101, 0.12);
                border: 1px solid rgba(197, 160, 101, 0.3);
                border-radius: 10px;
              "
              rounded
            >
              <template #avatar>
                <q-avatar color="primary" icon="account_circle" size="36px" />
              </template>
              <div class="text-weight-medium">{{ currentUser.email }}</div>
              <div class="text-caption text-grey-5">Account con cui verrà effettuato l'accesso</div>
            </q-banner>

            <q-btn
              unelevated
              color="primary"
              label="✅ Conferma adesione all'organizzazione"
              icon="check_circle"
              size="lg"
              class="full-width invite-cta-btn"
              :loading="isAccepting"
              :disable="isAccepting"
              @click="acceptInvitation"
            />
            <div class="text-caption text-center" style="color: #5a7a9b">
              Non sei tu?
              <a href="#" style="color: #c5a065" @click.prevent="goToLogin">Cambia account</a>
            </div>
          </div>

          <!-- GDPR notice -->
          <div class="q-mt-xl text-caption text-center" style="color: #3d5a78">
            Confermando l'adesione accetti i
            <a href="/privacy" style="color: #c5a065">Termini di Servizio</a> e la
            <a href="/privacy" style="color: #c5a065">Privacy Policy</a> di OpsFlow.<br />
            Se non riconosci questo invito, puoi ignorare questa pagina. — GDPR Art. 14
          </div>
        </div>
      </q-card>
    </div>
  </div>
</template>

<style scoped lang="scss">
.invite-page {
  background: #060f1e;
  min-height: 100vh;
  position: relative;
  overflow: hidden;
}

.invite-bg {
  position: fixed;
  inset: 0;
  background:
    radial-gradient(ellipse 80% 50% at 20% 20%, rgba(197, 160, 101, 0.08) 0%, transparent 60%),
    radial-gradient(ellipse 60% 40% at 80% 80%, rgba(10, 35, 66, 0.6) 0%, transparent 60%);
  pointer-events: none;
  z-index: 0;
}

.invite-container {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 480px;
  padding: 24px 16px;
}

.invite-logo {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 72px;
  height: 72px;
  background: rgba(10, 35, 66, 0.8);
  border: 1px solid rgba(197, 160, 101, 0.4);
  border-radius: 50%;
  backdrop-filter: blur(12px);
}

.invite-card {
  background: rgba(10, 35, 66, 0.75) !important;
  backdrop-filter: blur(20px) !important;
  border: 1px solid rgba(197, 160, 101, 0.2) !important;
  border-radius: 20px !important;
  box-shadow:
    0 32px 80px rgba(0, 0, 0, 0.6),
    0 0 0 1px rgba(197, 160, 101, 0.1) !important;
  color: #f9f7f2;
}

.invite-cta-btn {
  border-radius: 12px !important;
  font-size: 16px !important;
  font-weight: 700 !important;
  letter-spacing: 0.02em;
  padding: 14px 24px !important;
  transition: all 0.2s ease;
  background: linear-gradient(135deg, #c5a065 0%, #a0814f 100%) !important;
  color: #0a2342 !important;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(197, 160, 101, 0.4) !important;
  }
}

.success-icon {
  font-size: 64px;
  animation: bounce 0.6s ease-out;
}

@keyframes bounce {
  0% {
    transform: scale(0.5);
    opacity: 0;
  }
  60% {
    transform: scale(1.2);
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}
</style>
