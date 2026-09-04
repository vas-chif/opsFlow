<script setup lang="ts">
/**
 * @file TeamMembersPanel.vue
 * @description Admin panel for inviting team members via secure email token (Step 14).
 *              Shows active members table + pending invitations tab with revoke controls.
 * @author Vasile Chifeac
 * @created 2026-08-17
 * @modified 2026-09-04
 *
 * @notes
 * - Invite flow: email + role ONLY — UID is never required (Step 14 goal)
 * - createTenantInvitation Cloud Function handles token generation + email (server-side)
 * - revokeTenantInvitation Cloud Function marks invitation as revoked
 * - Acceptance: handled by src/pages/invite.vue (deep-link landing page)
 *
 * @dependencies
 * - authStore (canManageWorkspace, setUserRole, tenantId)
 * - Firebase Functions (httpsCallable)
 * - quasar (QTable, QTabs, QDialog, QSelect, QInput, QBtn, QBadge)
 *
 * @performance
 * - Members: on-demand Firestore read from tenants/{tenantId}/members (on mount + refresh)
 * - Invitations: on-demand read from tenants/{tenantId}/invitations (on tab open)
 */

// ── Vue & Framework ──────────────────────────────────────────────────────────
import { ref, computed, onMounted } from "vue";
import { useQuasar } from "quasar";

// ── Firebase ─────────────────────────────────────────────────────────────────
import { getFirestore, collection, getDocs, doc, setDoc, orderBy, query } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { app } from "@/boot/firebase";

// ── Types ────────────────────────────────────────────────────────────────────
import type { TenantRole, SetUserRoleRequest } from "@/types/auth";
import type { TenantInvitation } from "@/types/models";

// ── Stores ───────────────────────────────────────────────────────────────────
import { useAuthStore } from "@/stores/authStore";

// UI-only — not Firestore data
interface MemberRow {
  uid: string;
  email: string;
  displayName: string;
  role: TenantRole;
  isActive: boolean;
}

const $q = useQuasar();
const authStore = useAuthStore();

// ── State ─────────────────────────────────────────────────────────────────────
const activeTab = ref<"members" | "invitations">("members");
const members = ref<MemberRow[]>([]);
const invitations = ref<TenantInvitation[]>([]);
const isLoading = ref(false);
const isInvLoading = ref(false);
const isInviting = ref(false);
const revokingHash = ref<string | null>(null);

// Invite dialog
const showInviteDialog = ref(false);
const inviteEmail = ref("");
const inviteRole = ref<"admin" | "user">("user");

// ── Options ───────────────────────────────────────────────────────────────────
const roleOptions: Array<{ label: string; value: "admin" | "user"; color: string }> = [
  { label: "🟡 Admin", value: "admin", color: "warning" },
  { label: "🟢 User", value: "user", color: "positive" },
];

const allRoleOptions: Array<{ label: string; value: TenantRole; color: string }> = [
  { label: "🟡 Admin", value: "admin", color: "warning" },
  { label: "🟢 User", value: "user", color: "positive" },
];

// ── Table columns ─────────────────────────────────────────────────────────────
const memberColumns = [
  {
    name: "displayName",
    label: "Nome",
    field: "displayName",
    sortable: true,
    align: "left" as const,
  },
  { name: "email", label: "Email", field: "email", sortable: true, align: "left" as const },
  { name: "role", label: "Ruolo", field: "role", sortable: true, align: "center" as const },
  { name: "isActive", label: "Stato", field: "isActive", align: "center" as const },
  { name: "actions", label: "Azioni", field: "actions", align: "center" as const },
];

const invitationColumns = [
  {
    name: "email",
    label: "Email Invitato",
    field: "email",
    sortable: true,
    align: "left" as const,
  },
  { name: "role", label: "Ruolo", field: "role", align: "center" as const },
  { name: "status", label: "Stato", field: "status", align: "center" as const },
  { name: "expiresAt", label: "Scadenza", field: "expiresAt", align: "center" as const },
  { name: "actions", label: "Azioni", field: "actions", align: "center" as const },
];

// ── Computed ──────────────────────────────────────────────────────────────────
const roleBadgeColor = computed(() => (role: TenantRole) => {
  if (role === "superadmin") return "negative";
  if (role === "admin") return "warning";
  return "positive";
}); /*end roleBadgeColor*/

const pendingInvitations = computed(() =>
  invitations.value.filter((i) => i.status === "pending"),
); /*end pendingInvitations*/

// ── Data loaders ──────────────────────────────────────────────────────────────
async function loadMembers(): Promise<void> {
  if (!authStore.canManageWorkspace) return;
  isLoading.value = true;
  try {
    const db = getFirestore(app);
    const snap = await getDocs(collection(db, `tenants/${authStore.tenantId}/members`));
    members.value = snap.docs.map((d) => ({
      uid: d.id,
      ...(d.data() as Omit<MemberRow, "uid">),
    }));
  } catch {
    $q.notify({ type: "negative", message: "Errore nel caricamento dei membri." });
  } finally {
    isLoading.value = false;
  }
} /*end loadMembers*/

async function loadInvitations(): Promise<void> {
  if (!authStore.canManageWorkspace) return;
  isInvLoading.value = true;
  try {
    const db = getFirestore(app);
    const q = query(
      collection(db, `tenants/${authStore.tenantId}/invitations`),
      orderBy("createdAt", "desc"),
    );
    const snap = await getDocs(q);
    invitations.value = snap.docs.map((d) => d.data() as TenantInvitation);
  } catch {
    $q.notify({ type: "negative", message: "Errore nel caricamento degli inviti." });
  } finally {
    isInvLoading.value = false;
  }
} /*end loadInvitations*/

function onTabChange(tab: "members" | "invitations"): void {
  if (tab === "invitations" && invitations.value.length === 0) {
    void loadInvitations();
  }
} /*end onTabChange*/

// ── Role & Status management ──────────────────────────────────────────────────
async function assignRole(member: MemberRow, newRole: TenantRole): Promise<void> {
  const payload: SetUserRoleRequest = {
    uid: member.uid,
    tenantId: authStore.tenantId,
    role: newRole,
    isActive: member.isActive,
  };
  try {
    await authStore.setUserRole(payload);
    member.role = newRole;
    $q.notify({
      type: "positive",
      message: `Ruolo aggiornato: ${member.displayName || member.email} → ${newRole}`,
      icon: "shield",
    });
  } catch {
    $q.notify({ type: "negative", message: "Errore nell'aggiornamento del ruolo." });
  }
} /*end assignRole*/

async function toggleActive(member: MemberRow): Promise<void> {
  const payload: SetUserRoleRequest = {
    uid: member.uid,
    tenantId: authStore.tenantId,
    role: member.role,
    isActive: !member.isActive,
  };
  try {
    await authStore.setUserRole(payload);
    member.isActive = !member.isActive;
    const db = getFirestore(app);
    await setDoc(
      doc(db, `tenants/${authStore.tenantId}/members/${member.uid}`),
      { isActive: member.isActive },
      { merge: true },
    );
    $q.notify({
      type: "info",
      message: `Account ${member.isActive ? "riattivato" : "sospeso"}: ${member.email}`,
    });
  } catch {
    $q.notify({ type: "negative", message: "Errore nell'aggiornamento stato account." });
  }
} /*end toggleActive*/

// ── Step 14: Invitation actions ───────────────────────────────────────────────
async function sendInvite(): Promise<void> {
  if (!inviteEmail.value) {
    $q.notify({ type: "warning", message: "Inserisci l'email del membro da invitare." });
    return;
  }
  isInviting.value = true;
  try {
    const functions = getFunctions(app, "europe-west1");
    const createInvitation = httpsCallable<
      { email: string; role: string },
      { success: boolean; message: string }
    >(functions, "createTenantInvitation");

    await createInvitation({ email: inviteEmail.value, role: inviteRole.value });

    $q.notify({
      type: "positive",
      message: `✉️ Invito inviato a ${inviteEmail.value}! L'email è in arrivo.`,
      icon: "mark_email_read",
      timeout: 4000,
    });
    showInviteDialog.value = false;
    inviteEmail.value = "";
    inviteRole.value = "user";
    // Refresh invitations tab if visible
    if (activeTab.value === "invitations") {
      await loadInvitations();
    } else {
      invitations.value = []; // force reload on next tab open
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Errore nell'invio dell'invito.";
    $q.notify({ type: "negative", message: msg });
  } finally {
    isInviting.value = false;
  }
} /*end sendInvite*/

async function revokeInvitation(inv: TenantInvitation): Promise<void> {
  revokingHash.value = inv.tokenHash;
  try {
    const functions = getFunctions(app, "europe-west1");
    const revokeInv = httpsCallable<
      { tokenHash: string; tenantId: string },
      { success: boolean; message: string }
    >(functions, "revokeTenantInvitation");

    await revokeInv({ tokenHash: inv.tokenHash, tenantId: authStore.tenantId });

    // Update local state
    const target = invitations.value.find((i) => i.tokenHash === inv.tokenHash);
    if (target) target.status = "revoked";

    $q.notify({ type: "info", message: `Invito revocato per ${inv.email}.`, icon: "cancel" });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Errore nella revoca.";
    $q.notify({ type: "negative", message: msg });
  } finally {
    revokingHash.value = null;
  }
} /*end revokeInvitation*/

function formatExpiry(expiresAt: string | Date | null): string {
  if (!expiresAt) return "—";
  const d = typeof expiresAt === "string" ? new Date(expiresAt) : expiresAt;
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
} /*end formatExpiry*/

function invStatusColor(status: string): string {
  if (status === "pending") return "warning";
  if (status === "accepted") return "positive";
  if (status === "revoked") return "grey";
  if (status === "expired") return "negative";
  return "grey";
} /*end invStatusColor*/

function invStatusLabel(status: string): string {
  const map: Record<string, string> = {
    pending: "⏳ In attesa",
    accepted: "✅ Accettato",
    revoked: "🚫 Revocato",
    expired: "⌛ Scaduto",
  };
  return map[status] ?? status;
} /*end invStatusLabel*/

onMounted(() => {
  void loadMembers();
});
</script>

<template>
  <div class="team-members-panel q-pa-md">
    <!-- Layer 1 Guard: visible only to admin/superadmin -->
    <template v-if="authStore.canManageWorkspace">
      <!-- Header -->
      <div class="row items-center justify-between q-mb-md">
        <div>
          <div class="text-h6 text-weight-bold">👥 Gestione Membri &amp; Team</div>
          <div class="text-caption text-grey-6">
            Tenant: {{ authStore.tenantId }} · Ruolo: {{ authStore.role }}
          </div>
        </div>
        <q-btn
          icon="person_add"
          label="Invita Membro"
          color="primary"
          unelevated
          rounded
          @click="showInviteDialog = true"
        />
      </div>

      <!-- Tabs: Membri / Inviti -->
      <q-tabs
        v-model="activeTab"
        dense
        class="q-mb-md"
        active-color="primary"
        indicator-color="primary"
        align="left"
        @update:model-value="onTabChange"
      >
        <q-tab name="members" icon="group" label="Membri Attivi" />
        <q-tab name="invitations" icon="mail" label="Inviti Pendenti">
          <q-badge
            v-if="pendingInvitations.length > 0"
            color="warning"
            :label="pendingInvitations.length"
            floating
          />
        </q-tab>
      </q-tabs>

      <!-- Tab: Membri Attivi -->
      <q-tab-panels v-model="activeTab" animated>
        <q-tab-panel name="members" class="q-pa-none">
          <q-table
            :rows="members"
            :columns="memberColumns"
            row-key="uid"
            :loading="isLoading"
            flat
            bordered
            dense
            :rows-per-page-options="[10, 20, 50]"
          >
            <!-- Role column -->
            <template #body-cell-role="{ row }">
              <q-td align="center">
                <q-badge :color="roleBadgeColor(row.role)" :label="row.role" />
                <q-btn
                  v-if="authStore.isAdmin && row.role !== 'superadmin'"
                  flat
                  round
                  dense
                  icon="edit"
                  size="xs"
                  class="q-ml-xs"
                >
                  <q-popup-proxy>
                    <q-card flat bordered class="q-pa-sm" style="min-width: 160px">
                      <q-select
                        v-model="row.role"
                        :options="allRoleOptions"
                        option-value="value"
                        option-label="label"
                        emit-value
                        map-options
                        dense
                        label="Cambia ruolo"
                        @update:model-value="(val: TenantRole) => assignRole(row, val)"
                      />
                    </q-card>
                  </q-popup-proxy>
                </q-btn>
              </q-td>
            </template>

            <!-- Active status column -->
            <template #body-cell-isActive="{ row }">
              <q-td align="center">
                <q-badge
                  :color="row.isActive ? 'positive' : 'grey'"
                  :label="row.isActive ? 'Attivo' : 'Sospeso'"
                />
                <q-btn
                  flat
                  round
                  dense
                  :icon="row.isActive ? 'pause_circle' : 'play_circle'"
                  :color="row.isActive ? 'warning' : 'positive'"
                  size="xs"
                  class="q-ml-xs"
                  @click="toggleActive(row)"
                >
                  <q-tooltip>{{
                    row.isActive ? "Sospendi account" : "Riattiva account"
                  }}</q-tooltip>
                </q-btn>
              </q-td>
            </template>

            <!-- Actions column -->
            <template #body-cell-actions="{ row }">
              <q-td align="center">
                <q-btn flat round dense icon="refresh" size="xs" @click="loadMembers">
                  <q-tooltip>Ricarica</q-tooltip>
                </q-btn>
                <q-btn flat round dense icon="info" size="xs" color="grey-6">
                  <q-tooltip>UID: {{ row.uid }}</q-tooltip>
                </q-btn>
              </q-td>
            </template>
          </q-table>
        </q-tab-panel>

        <!-- Tab: Inviti Pendenti -->
        <q-tab-panel name="invitations" class="q-pa-none">
          <div class="row justify-end q-mb-sm">
            <q-btn flat dense icon="refresh" label="Aggiorna" size="sm" @click="loadInvitations" />
          </div>
          <q-table
            :rows="invitations"
            :columns="invitationColumns"
            row-key="tokenHash"
            :loading="isInvLoading"
            flat
            bordered
            dense
            :rows-per-page-options="[10, 20, 50]"
          >
            <!-- Status badge -->
            <template #body-cell-status="{ row }">
              <q-td align="center">
                <q-badge :color="invStatusColor(row.status)" :label="invStatusLabel(row.status)" />
              </q-td>
            </template>

            <!-- Role badge -->
            <template #body-cell-role="{ row }">
              <q-td align="center">
                <q-badge :color="roleBadgeColor(row.role)" :label="row.role" />
              </q-td>
            </template>

            <!-- Expiry formatted -->
            <template #body-cell-expiresAt="{ row }">
              <q-td align="center">
                {{ formatExpiry(row.expiresAt) }}
              </q-td>
            </template>

            <!-- Actions: Revoke -->
            <template #body-cell-actions="{ row }">
              <q-td align="center">
                <q-btn
                  v-if="row.status === 'pending'"
                  flat
                  round
                  dense
                  icon="cancel"
                  color="negative"
                  size="xs"
                  :loading="revokingHash === row.tokenHash"
                  @click="revokeInvitation(row)"
                >
                  <q-tooltip>🚫 Revoca invito</q-tooltip>
                </q-btn>
                <span v-else class="text-grey-5 text-caption">—</span>
              </q-td>
            </template>

            <template #no-data>
              <div class="full-width column flex-center q-pa-lg text-grey-6">
                <q-icon name="mail_outline" size="48px" class="q-mb-sm" />
                <div>Nessun invito trovato per questo tenant.</div>
              </div>
            </template>
          </q-table>
        </q-tab-panel>
      </q-tab-panels>

      <!-- Invite Member Dialog — Step 14: solo Email + Ruolo (NO UID) -->
      <q-dialog v-model="showInviteDialog" persistent>
        <q-card style="min-width: 400px" class="q-pa-md glass-invite-card">
          <q-card-section>
            <div class="text-h6 text-weight-bold">✉️ Invita Membro via Email</div>
            <div class="text-caption text-grey-6 q-mt-xs">
              Il dipendente riceverà un link sicuro via email per unirsi all'organizzazione. Non è
              necessario conoscerne l'UID.
            </div>
          </q-card-section>

          <q-card-section class="q-gutter-md">
            <q-input
              v-model="inviteEmail"
              label="Email del dipendente"
              type="email"
              outlined
              dense
              autocomplete="off"
              hint="Inserisci l'email di lavoro del dipendente."
            />
            <q-select
              v-model="inviteRole"
              :options="roleOptions"
              option-value="value"
              option-label="label"
              emit-value
              map-options
              outlined
              dense
              label="Ruolo da assegnare"
            />
          </q-card-section>

          <q-card-actions align="right">
            <q-btn flat label="Annulla" v-close-popup :disable="isInviting" />
            <q-btn
              unelevated
              color="primary"
              label="Invia Invito"
              icon="send"
              :loading="isInviting"
              @click="sendInvite"
            />
          </q-card-actions>
        </q-card>
      </q-dialog>
    </template>

    <!-- Non-admin fallback -->
    <template v-else>
      <q-banner inline-actions class="text-white bg-grey-7" rounded>
        <template #avatar>
          <q-icon name="lock" />
        </template>
        Accesso riservato agli amministratori del workspace.
      </q-banner>
    </template>
  </div>
</template>

<style scoped lang="scss">
.team-members-panel {
  max-width: 960px;
  margin: 0 auto;
}

.glass-invite-card {
  background: rgba(10, 35, 66, 0.92);
  backdrop-filter: blur(16px);
  border: 1px solid rgba(197, 160, 101, 0.25);
  border-radius: 16px;
  color: var(--q-secondary);
}
</style>
