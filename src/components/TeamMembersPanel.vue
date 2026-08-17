/** * @file TeamMembersPanel.vue * @description Admin panel for inviting and managing workspace
members with RBAC role assignment. * @author Vasile Chifeac * @created 2026-08-17 * @modified
2026-08-17 * * @notes * - Visible only to admin and superadmin via `canManageWorkspace` getter (§3
Layer 1) * - Role assignment calls `authStore.setUserRole` → Cloud Function `setUserRole` (§3 Layer
3) * - No Firestore reads for permission checks — JWT claims only (§5) * * @dependencies * -
authStore (canManageWorkspace, setUserRole) * - quasar (QTable, QDialog, QSelect, QInput, QBtn,
QBadge, useQuasar) * * @performance * - Members list loaded on-demand from Firestore
tenants/{tenantId}/members * - Zero Firestore reads on component mount if user is not admin (v-if
guard) */

<script setup lang="ts">
// ── Vue & Framework ──────────────────────────────────────────────────────────
import { ref, computed, onMounted } from "vue";
import { useQuasar } from "quasar";

// ── Firebase ─────────────────────────────────────────────────────────────────
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import { app } from "@/boot/firebase";

// ── Types ────────────────────────────────────────────────────────────────────
import type { TenantRole, SetUserRoleRequest } from "@/types/auth";

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

const members = ref<MemberRow[]>([]);
const isLoading = ref(false);
const showInviteDialog = ref(false);
const inviteEmail = ref("");
const inviteRole = ref<TenantRole>("user");
const inviteUid = ref("");

const roleOptions: Array<{ label: string; value: TenantRole; color: string }> = [
  { label: "🔴 SuperAdmin", value: "superadmin", color: "negative" },
  { label: "🟡 Admin", value: "admin", color: "warning" },
  { label: "🟢 User", value: "user", color: "positive" },
];

const tableColumns = [
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

const roleBadgeColor = computed(() => (role: TenantRole) => {
  if (role === "superadmin") return "negative";
  if (role === "admin") return "warning";
  return "positive";
}); /*end roleBadgeColor*/

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
    // Update member doc in Firestore
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

async function sendInvite(): Promise<void> {
  if (!inviteUid.value || !inviteEmail.value) {
    $q.notify({ type: "warning", message: "Inserisci UID e email del membro da invitare." });
    return;
  }
  const payload: SetUserRoleRequest = {
    uid: inviteUid.value,
    tenantId: authStore.tenantId,
    role: inviteRole.value,
    isActive: true,
  };
  try {
    await authStore.setUserRole(payload);
    // Write member document for UI listing
    const db = getFirestore(app);
    await setDoc(doc(db, `tenants/${authStore.tenantId}/members/${inviteUid.value}`), {
      email: inviteEmail.value,
      displayName: inviteEmail.value,
      role: inviteRole.value,
      isActive: true,
      invitedBy: authStore.user?.uid,
      invitedAt: serverTimestamp(),
    });
    $q.notify({
      type: "positive",
      message: `Membro invitato: ${inviteEmail.value} come ${inviteRole.value}`,
      icon: "person_add",
    });
    showInviteDialog.value = false;
    inviteEmail.value = "";
    inviteUid.value = "";
    inviteRole.value = "user";
    await loadMembers();
  } catch {
    $q.notify({ type: "negative", message: "Errore nell'invito del membro." });
  }
} /*end sendInvite*/

onMounted(() => {
  void loadMembers();
});
</script>

<template>
  <div class="team-members-panel q-pa-md">
    <!-- Layer 1 Guard: visible only to admin/superadmin -->
    <template v-if="authStore.canManageWorkspace">
      <div class="row items-center justify-between q-mb-md">
        <div>
          <div class="text-h6 text-weight-bold">👥 Gestione Membri & Ruoli</div>
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

      <q-table
        :rows="members"
        :columns="tableColumns"
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
            <!-- Admin can change role -->
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
                    :options="roleOptions"
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
              <q-tooltip>{{ row.isActive ? "Sospendi account" : "Riattiva account" }}</q-tooltip>
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

      <!-- Invite Member Dialog (Fase 3.3) -->
      <q-dialog v-model="showInviteDialog" persistent>
        <q-card style="min-width: 360px" class="q-pa-md">
          <q-card-section>
            <div class="text-h6">➕ Invita Membro al Workspace</div>
            <div class="text-caption text-grey-6 q-mt-xs">
              L'utente deve già avere un account OpsFlow registrato.
            </div>
          </q-card-section>

          <q-card-section class="q-gutter-sm">
            <q-input
              v-model="inviteEmail"
              label="Email utente"
              type="email"
              outlined
              dense
              autocomplete="off"
            />
            <q-input
              v-model="inviteUid"
              label="Firebase UID utente"
              outlined
              dense
              hint="Visibile in Firebase Console → Authentication"
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
            <q-btn flat label="Annulla" v-close-popup />
            <q-btn
              unelevated
              color="primary"
              label="Invia Invito"
              icon="send"
              :loading="authStore.isLoading"
              @click="sendInvite"
            />
          </q-card-actions>
        </q-card>
      </q-dialog>
    </template>

    <!-- Non-admin fallback message -->
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
</style>
