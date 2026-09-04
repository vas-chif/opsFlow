<script setup lang="ts">
/**
 * @file DeleteAccountDialog.vue
 * @description Multi-step security modal for account deletion and tenant teardown with re-auth.
 * @author Vasile Chifeac
 * @created 2026-09-04
 * @modified 2026-09-04
 *
 * @notes
 * - Step 1: Consequence explanation tailored to user role (Member vs Owner).
 * - Step 2: Re-authentication (Password / Google OAuth) + explicit confirmation string for Owner.
 * - Zero orphan documents: delegates to Cloud Functions with recursive delete.
 *
 * @dependencies
 * - firebase/auth
 * - firebase/functions
 * - quasar
 * - src/stores/authStore
 *
 * @performance
 * - Lazy loaded dialog, 0 Firestore reads on open, direct callable invocation on confirm.
 */

// ── Vue & Framework ──────────────────────────────────────────────────────────
import { ref, computed } from "vue";
import { useRouter } from "vue-router";
import { useQuasar } from "quasar";

// ── Firebase ─────────────────────────────────────────────────────────────────
import {
  EmailAuthProvider,
  GoogleAuthProvider,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
} from "firebase/auth";
import { getFunctions, httpsCallable } from "firebase/functions";
import { app, auth } from "@/boot/firebase";

// ── Stores ───────────────────────────────────────────────────────────────────
import { useAuthStore } from "@/stores/authStore";

// ── Props & Emits ────────────────────────────────────────────────────────────
interface Props {
  modelValue: boolean;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: "update:modelValue", val: boolean): void;
}>();

// ── State ────────────────────────────────────────────────────────────────────
const q = useQuasar();
const router = useRouter();
const authStore = useAuthStore();

const currentStep = ref<1 | 2>(1);
const isLoading = ref<boolean>(false);
const passwordInput = ref<string>("");
const isPasswordVisible = ref<boolean>(false);
const confirmationInput = ref<string>("");

// Detect authentication provider
const isGoogleUser = computed((): boolean => {
  const provider = auth.currentUser?.providerData[0]?.providerId;
  return provider === "google.com";
});

// Role detection: owner/superadmin vs member/user
const isOwner = computed((): boolean => {
  return authStore.isOwner;
});

const requiredConfirmPhrase = computed((): string => {
  return "ELIMINA DEFINITIVAMENTE";
});

const isConfirmationValid = computed((): boolean => {
  if (!isOwner.value) {
    return true;
  }
  const typed = confirmationInput.value.trim().toUpperCase();
  const tenantName = authStore.tenantId;
  return typed === requiredConfirmPhrase.value || typed === tenantName.toUpperCase();
});

// ── Actions ──────────────────────────────────────────────────────────────────
const resetForm = (): void => {
  currentStep.value = 1;
  passwordInput.value = "";
  confirmationInput.value = "";
  isLoading.value = false;
}; /*end resetForm*/

const handleClose = (): void => {
  if (isLoading.value) {
    return;
  }
  resetForm();
  emit("update:modelValue", false);
}; /*end handleClose*/

const performReauth = async (): Promise<void> => {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("Nessun utente autenticato trovato.");
  }

  if (isGoogleUser.value) {
    const provider = new GoogleAuthProvider();
    await reauthenticateWithPopup(user, provider);
  } else {
    if (!passwordInput.value) {
      throw new Error("Inserisci la tua password attuale per confermare l'identità.");
    }
    const credential = EmailAuthProvider.credential(user.email ?? "", passwordInput.value);
    await reauthenticateWithCredential(user, credential);
  }
}; /*end performReauth*/

const executeDeletion = async (): Promise<void> => {
  isLoading.value = true;
  try {
    // 1. Re-authenticate client-side to verify user identity
    await performReauth();

    // 2. Invoke appropriate Cloud Function with Admin SDK authority
    const functions = getFunctions(app, "europe-west1");

    if (isOwner.value) {
      const deleteTenantFn = httpsCallable<
        { confirmText: string },
        { success: boolean; message: string }
      >(functions, "deleteTenantAndAccount");
      await deleteTenantFn({ confirmText: confirmationInput.value.trim() });
    } else {
      const deleteMemberFn = httpsCallable<void, { success: boolean; message: string }>(
        functions,
        "deleteMemberAccount",
      );
      await deleteMemberFn();
    }

    // 3. Reset Pinia Store & clear ephemeral session state (§5, §11)
    await authStore.logout();
    handleClose();

    q.notify({
      type: "positive",
      message: isOwner.value
        ? "Organizzazione ed account eliminati definitivamente (GDPR Art. 17)."
        : "Il tuo account è stato rimosso. I workspace aziendali sono rimasti intatti.",
      position: "top",
      timeout: 5000,
    });

    await router.push("/login");
  } catch (err: unknown) {
    const rawMsg = err instanceof Error ? err.message : String(err);
    let userFriendlyMsg = rawMsg;

    if (rawMsg.includes("auth/wrong-password") || rawMsg.includes("auth/invalid-credential")) {
      userFriendlyMsg = "Password errata. Riprova con la password corretta.";
    } else if (rawMsg.includes("failed-precondition")) {
      userFriendlyMsg =
        "Impossibile procedere: sono ancora presenti collaboratori attivi nel team. " +
        "Rimuovi prima tutti i membri o trasferisci la proprietà.";
    }

    q.notify({
      type: "negative",
      message: userFriendlyMsg,
      position: "top",
      timeout: 6000,
    });
  } finally {
    isLoading.value = false;
  }
}; /*end executeDeletion*/
</script>

<template>
  <q-dialog
    :model-value="props.modelValue"
    persistent
    backdrop-filter="blur(12px)"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <q-card class="delete-dialog-card q-pa-lg">
      <!-- Header -->
      <div class="row items-center q-mb-md">
        <div class="warning-badge q-mr-md">
          <q-icon name="warning" size="24px" color="amber-9" />
        </div>
        <div>
          <div class="text-h6 text-weight-bold text-navy">
            {{
              isOwner ? "Dismissione Organizzazione & Account" : "Eliminazione Account Personale"
            }}
          </div>
          <div class="text-caption text-grey-7">
            {{
              isOwner
                ? "Chiusura definitiva del tenant aziendale"
                : "Revoca accesso e rimozione dati personali"
            }}
          </div>
        </div>
      </div>

      <q-separator class="q-my-sm separator-gold" />

      <!-- STEP 1: Consequence Explanation -->
      <div v-if="currentStep === 1" class="q-py-md">
        <div v-if="isOwner" class="alert-box-owner q-pa-md q-mb-md">
          <div class="text-weight-bold text-negative q-mb-xs">
            ⚠️ ATTENZIONE: Sei il Titolare Aziendale (Owner)
          </div>
          <div class="text-body2 text-grey-9">
            Questa operazione è <strong>irreversibile</strong>. Verrà eseguita la cancellazione a
            cascata dell'intera organizzazione (Tenant: <code>{{ authStore.tenantId }}</code
            >), compresi:
          </div>
          <ul class="text-caption text-grey-8 q-mt-xs q-pl-md">
            <li>Tutti i workspace ed i progetti aziendali</li>
            <li>Tutti i task, le approvazioni e lo storico operativo</li>
            <li>Tutti gli inviti pendenti</li>
            <li>Il tuo profilo utente e le credenziali di accesso</li>
          </ul>
          <div class="text-caption text-weight-medium text-negative q-mt-sm">
            Nota di sicurezza: se nel team sono ancora presenti altri membri, l'eliminazione verrà
            bloccata per evitare la perdita accidentale di lavoro altrui.
          </div>
        </div>

        <div v-else class="alert-box-member q-pa-md q-mb-md">
          <div class="text-weight-bold text-primary q-mb-xs">
            ℹ️ Informazione per Collaboratore del Team
          </div>
          <div class="text-body2 text-grey-9">
            Stai eliminando il tuo account personale dal sistema OpsFlow.
          </div>
          <ul class="text-caption text-grey-8 q-mt-xs q-pl-md">
            <li>
              I tuoi dati personali e di login verranno
              <strong>cancellati definitivamente</strong> (GDPR Art. 17).
            </li>
            <li>
              <strong>I workspace ed i task aziendali non verranno toccati</strong> e rimarranno a
              disposizione dei tuoi colleghi.
            </li>
          </ul>
        </div>

        <div class="row justify-end q-gutter-sm q-mt-lg">
          <q-btn flat label="Annulla" color="grey-8" no-caps @click="handleClose" />
          <q-btn
            color="negative"
            label="Ho compreso, Continua"
            no-caps
            class="elite-btn-danger"
            @click="currentStep = 2"
          />
        </div>
      </div>

      <!-- STEP 2: Re-Authentication & Security Gate -->
      <div v-else class="q-py-md">
        <div class="text-body2 text-grey-8 q-mb-md">
          Per garantire la massima sicurezza (GDPR Art. 32), conferma la tua identità:
        </div>

        <!-- Re-Auth: Google Provider -->
        <div v-if="isGoogleUser" class="q-mb-md text-center">
          <q-banner dense rounded class="bg-blue-1 text-primary q-mb-sm">
            L'account è autenticato con Google OAuth. Ti verrà richiesto di confermare l'account via
            popup.
          </q-banner>
        </div>

        <!-- Re-Auth: Password Provider -->
        <div v-else class="q-mb-md">
          <div class="text-caption text-weight-bold text-grey-8 q-mb-xs">
            Inserisci la tua Password attuale:
          </div>
          <q-input
            v-model="passwordInput"
            :type="isPasswordVisible ? 'text' : 'password'"
            outlined
            dense
            placeholder="Password di sicurezza"
          >
            <template #append>
              <q-icon
                :name="isPasswordVisible ? 'visibility_off' : 'visibility'"
                class="cursor-pointer"
                @click="isPasswordVisible = !isPasswordVisible"
              />
            </template>
          </q-input>
        </div>

        <!-- Confirmation phrase for Owner -->
        <div v-if="isOwner" class="q-mb-md">
          <div class="text-caption text-weight-bold text-negative q-mb-xs">
            Digita <code>{{ requiredConfirmPhrase }}</code> per confermare:
          </div>
          <q-input
            v-model="confirmationInput"
            outlined
            dense
            :placeholder="requiredConfirmPhrase"
          />
        </div>

        <div class="row justify-between items-center q-mt-lg">
          <q-btn
            flat
            label="Indietro"
            color="grey-7"
            no-caps
            :disable="isLoading"
            @click="currentStep = 1"
          />

          <div class="row q-gutter-sm">
            <q-btn
              flat
              label="Annulla"
              color="grey-8"
              no-caps
              :disable="isLoading"
              @click="handleClose"
            />
            <q-btn
              color="negative"
              :label="
                isOwner ? 'Distruggi Organizzazione ed Account' : 'Conferma ed Elimina Account'
              "
              no-caps
              class="elite-btn-danger"
              :loading="isLoading"
              :disable="!isConfirmationValid || (!isGoogleUser && !passwordInput)"
              @click="executeDeletion"
            />
          </div>
        </div>
      </div>
    </q-card>
  </q-dialog>
</template>

<style scoped lang="scss">
.delete-dialog-card {
  width: 480px;
  max-width: 95vw;
  background: rgba(255, 255, 255, 0.98);
  border: 1px solid rgba(197, 160, 101, 0.35);
  border-radius: 16px;
  box-shadow: 0 16px 40px rgba(10, 35, 66, 0.2);
}

.text-navy {
  color: #0a2342;
}

.separator-gold {
  background: linear-gradient(90deg, #c5a065, transparent);
  height: 2px;
}

.warning-badge {
  width: 42px;
  height: 42px;
  border-radius: 10px;
  background: rgba(255, 193, 7, 0.15);
  display: flex;
  align-items: center;
  justify-content: center;
}

.alert-box-owner {
  background: rgba(211, 47, 47, 0.06);
  border-left: 4px solid #d32f2f;
  border-radius: 8px;
}

.alert-box-member {
  background: rgba(10, 35, 66, 0.05);
  border-left: 4px solid #0a2342;
  border-radius: 8px;
}

.elite-btn-danger {
  font-weight: 600;
  border-radius: 8px;
  padding: 8px 18px;
}
</style>
