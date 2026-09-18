<script setup lang="ts">
/**
 * @file TeamMembersPanel.vue
 * @description Admin panel for inviting and assigning team members via secure email token (Step 14 & Step 26).
 *              Supports scoping to Tenant, Workspace, or individual Task.
 * @author Vasile Chifeac
 * @created 2026-08-17
 * @modified 2026-09-18
 *
 * @notes
 * - Scopes: 'tenant' (full team), 'workspace' (workspace-level access), 'task' (single-task access)
 * - Step 26: If invited to a Workspace, user sees all tasks in that workspace.
 * - Step 26: If invited to a Task, user sees ONLY that task.
 * - createTenantInvitation Cloud Function handles token generation + email (server-side)
 *
 * @dependencies
 * - authStore (canManageWorkspace, setUserRole, tenantId)
 * - taskStore (workspaces, tasks, assignMemberToWorkspace, assignMemberToTask)
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
import { useTaskStore } from "@/stores/taskStore";

// ── Props & Emits ────────────────────────────────────────────────────────────
interface Props {
  scope?: "tenant" | "workspace" | "task" | undefined;
  workspaceId?: string | undefined;
  workspaceName?: string | undefined;
  taskId?: string | undefined;
  taskTitle?: string | undefined;
  isDialog?: boolean | undefined;
}

const props = withDefaults(defineProps<Props>(), {
  scope: "tenant",
  workspaceId: "",
  workspaceName: "",
  taskId: "",
  taskTitle: "",
  isDialog: false,
});

const emit = defineEmits<{
  (e: "close"): void;
}>();

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
const taskStore = useTaskStore();

// ── State ─────────────────────────────────────────────────────────────────────
const activeTab = ref<"assigned" | "members" | "invitations">(
  props.scope === "tenant" ? "members" : "assigned",
);
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
  { label: "🟢 User (Collaboratore)", value: "user", color: "positive" },
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

const currentWorkspace = computed(() => {
  if (!props.workspaceId) return taskStore.activeWorkspace;
  return taskStore.workspaces.find((w) => w.id === props.workspaceId) ?? null;
}); /*end currentWorkspace*/

const currentTask = computed(() => {
  if (!props.taskId) return null;
  return taskStore.tasks.find((t) => t.id === props.taskId) ?? null;
}); /*end currentTask*/

const assignedMembersList = computed(() => {
  if (props.scope === "workspace") {
    return currentWorkspace.value?.assignedMembers ?? [];
  }
  if (props.scope === "task") {
    return currentTask.value?.assignedMembers ?? [];
  }
  return [];
}); /*end assignedMembersList*/

const panelTitle = computed(() => {
  if (props.scope === "workspace") {
    return `👥 Collaboratori Workspace: ${props.workspaceName || currentWorkspace.value?.name || "Workspace"}`;
  }
  if (props.scope === "task") {
    return `👥 Collaboratori Task: ${props.taskTitle || currentTask.value?.title || "Task"}`;
  }
  return "👥 Gestione Membri & Team Aziendale";
}); /*end panelTitle*/

const panelSubtitle = computed(() => {
  if (props.scope === "workspace") {
    return "I membri assegnati possono visualizzare e operare su tutti i task di questo workspace.";
  }
  if (props.scope === "task") {
    return "I membri assegnati possono visualizzare e completare SOLO questo singolo task.";
  }
  return `Tenant: ${authStore.tenantId} · Ruolo: ${authStore.role}`;
}); /*end panelSubtitle*/

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

function onTabChange(tab: "assigned" | "members" | "invitations"): void {
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

// ── Member Assignment (Step 26) ───────────────────────────────────────────────
async function removeAssignedMember(email: string): Promise<void> {
  try {
    if (props.scope === "workspace" && props.workspaceId) {
      await taskStore.removeMemberFromWorkspace(props.workspaceId, email);
      $q.notify({ type: "info", message: `Accesso al workspace revocato per ${email}.` });
    } else if (props.scope === "task" && props.workspaceId && props.taskId) {
      await taskStore.removeMemberFromTask(props.workspaceId, props.taskId, email);
      $q.notify({ type: "info", message: `Accesso al task revocato per ${email}.` });
    }
  } catch {
    $q.notify({ type: "negative", message: "Impossibile revocare l'accesso." });
  }
} /*end removeAssignedMember*/

async function quickAssignMember(email: string): Promise<void> {
  try {
    if (props.scope === "workspace" && props.workspaceId) {
      await taskStore.assignMemberToWorkspace(props.workspaceId, email);
      $q.notify({
        type: "positive",
        message: `✅ ${email} aggiunto al workspace!`,
        icon: "check_circle",
      });
    } else if (props.scope === "task" && props.workspaceId && props.taskId) {
      await taskStore.assignMemberToTask(props.workspaceId, props.taskId, email);
      $q.notify({
        type: "positive",
        message: `✅ ${email} aggiunto al task!`,
        icon: "check_circle",
      });
    }
  } catch {
    $q.notify({ type: "negative", message: "Impossibile assegnare il collaboratore." });
  }
} /*end quickAssignMember*/

// ── Invitation actions ───────────────────────────────────────────────────────
async function sendInvite(): Promise<void> {
  if (!inviteEmail.value) {
    $q.notify({ type: "warning", message: "Inserisci l'email della persona da invitare." });
    return;
  }
  isInviting.value = true;
  try {
    // 1. Direct association on Workspace or Task
    if (props.scope === "workspace" && props.workspaceId) {
      await taskStore.assignMemberToWorkspace(props.workspaceId, inviteEmail.value);
    } else if (props.scope === "task" && props.workspaceId && props.taskId) {
      await taskStore.assignMemberToTask(props.workspaceId, props.taskId, inviteEmail.value);
    }

    // 2. Cloud Function call to issue invitation token and send email
    try {
      const functions = getFunctions(app, "europe-west1");
      const createInvitation = httpsCallable<
        {
          email: string;
          role: string;
          scope?: string | undefined;
          workspaceId?: string | undefined;
          workspaceName?: string | undefined;
          taskId?: string | undefined;
          taskTitle?: string | undefined;
        },
        { success: boolean; message: string }
      >(functions, "createTenantInvitation");

      await createInvitation({
        email: inviteEmail.value,
        role: inviteRole.value,
        scope: props.scope,
        workspaceId: props.workspaceId,
        workspaceName: props.workspaceName || currentWorkspace.value?.name || undefined,
        taskId: props.taskId,
        taskTitle: props.taskTitle || currentTask.value?.title || undefined,
      });

      $q.notify({
        type: "positive",
        message: `✉️ Invito inviato a ${inviteEmail.value}! L'email è in arrivo.`,
        icon: "mark_email_read",
        timeout: 4000,
      });
    } catch (cfErr: unknown) {
      // In local or offline dev, if Cloud Function email fails, assignment still stands
      const msg = cfErr instanceof Error ? cfErr.message : "Servizio email non raggiungibile.";
      $q.notify({
        type: "warning",
        message: `Collaboratore associato con successo! (Nota email: ${msg})`,
        icon: "person_add",
        timeout: 4500,
      });
    }

    showInviteDialog.value = false;
    inviteEmail.value = "";
    inviteRole.value = "user";

    // Refresh invitations if tab open
    if (activeTab.value === "invitations") {
      await loadInvitations();
    } else {
      invitations.value = [];
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
          <div class="text-h6 text-weight-bold">{{ panelTitle }}</div>
          <div class="text-caption text-grey-6">
            {{ panelSubtitle }}
          </div>
        </div>
        <div class="row items-center q-gutter-sm">
          <q-btn
            icon="person_add"
            label="Aggiungi Persona"
            color="primary"
            unelevated
            rounded
            no-caps
            @click="showInviteDialog = true"
          />
          <q-btn
            v-if="isDialog"
            flat
            round
            dense
            icon="close"
            color="grey-6"
            @click="emit('close')"
          />
        </div>
      </div>

      <!-- Tabs -->
      <q-tabs
        v-model="activeTab"
        dense
        class="q-mb-md"
        active-color="primary"
        indicator-color="primary"
        align="left"
        @update:model-value="onTabChange"
      >
        <q-tab
          v-if="scope !== 'tenant'"
          name="assigned"
          icon="how_to_reg"
          label="Collaboratori Assegnati"
        >
          <q-badge
            v-if="assignedMembersList.length > 0"
            color="primary"
            :label="assignedMembersList.length"
            floating
          />
        </q-tab>
        <q-tab
          name="members"
          icon="group"
          :label="scope === 'tenant' ? 'Membri Attivi' : 'Tutti i Membri del Team'"
        />
        <q-tab name="invitations" icon="mail" label="Inviti Pendenti">
          <q-badge
            v-if="pendingInvitations.length > 0"
            color="warning"
            :label="pendingInvitations.length"
            floating
          />
        </q-tab>
      </q-tabs>

      <!-- Panels -->
      <q-tab-panels v-model="activeTab" animated style="min-height: 300px">
        <!-- Tab: Collaboratori Assegnati (scope !== 'tenant') -->
        <q-tab-panel v-if="scope !== 'tenant'" name="assigned" class="q-pa-none">
          <div v-if="assignedMembersList.length === 0" class="text-center q-pa-xl text-grey-6">
            <q-icon name="person_outline" size="56px" class="q-mb-md text-grey-5" />
            <div class="text-h6 text-weight-medium">Nessun collaboratore specifico assegnato</div>
            <div class="text-caption q-mt-xs text-grey-6">
              {{
                scope === "workspace"
                  ? "Tutti gli amministratori hanno accesso. Aggiungi collaboratori per dare accesso mirato a questo workspace."
                  : "Aggiungi persone per consentire loro di collaborare e visualizzare SOLO questo singolo task."
              }}
            </div>
            <q-btn
              color="primary"
              icon="person_add"
              label="Aggiungi Persona tramite Email"
              class="q-mt-lg"
              unelevated
              rounded
              no-caps
              @click="showInviteDialog = true"
            />
          </div>

          <q-list v-else bordered separator class="rounded-borders q-mt-sm">
            <q-item v-for="email in assignedMembersList" :key="email" class="q-py-md">
              <q-item-section avatar>
                <q-avatar color="primary" text-color="white" icon="person" />
              </q-item-section>
              <q-item-section>
                <q-item-label class="text-weight-bold">{{ email }}</q-item-label>
                <q-item-label caption>
                  <q-badge
                    :color="scope === 'workspace' ? 'secondary' : 'accent'"
                    :label="
                      scope === 'workspace'
                        ? 'Accesso Completo Workspace'
                        : 'Accesso Esclusivo Task'
                    "
                  />
                </q-item-label>
              </q-item-section>
              <q-item-section side>
                <q-btn
                  flat
                  round
                  dense
                  color="negative"
                  icon="delete_outline"
                  size="sm"
                  @click="removeAssignedMember(email)"
                >
                  <q-tooltip>Revoca accesso</q-tooltip>
                </q-btn>
              </q-item-section>
            </q-item>
          </q-list>
        </q-tab-panel>

        <!-- Tab: Membri Attivi -->
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
                <!-- If inside workspace or task scope, show quick assign button -->
                <template v-if="scope !== 'tenant'">
                  <q-badge
                    v-if="assignedMembersList.includes(row.email)"
                    color="positive"
                    label="Assegnato"
                    class="q-mr-xs"
                  />
                  <q-btn
                    v-else
                    unelevated
                    dense
                    size="xs"
                    color="primary"
                    icon="add"
                    label="Assegna"
                    no-caps
                    class="q-mr-xs"
                    @click="quickAssignMember(row.email)"
                  />
                </template>
                <q-btn flat round dense icon="refresh" size="xs" @click="loadMembers">
                  <q-tooltip>Ricarica</q-tooltip>
                </q-btn>
                <q-btn flat round dense icon="info" size="xs" color="grey-6">
                  <q-tooltip>UID: {{ row.uid }}</q-tooltip>
                </q-btn>
              </q-td>
            </template>

            <template #no-data>
              <div class="full-width column flex-center q-pa-lg text-grey-6">
                <q-icon name="people_outline" size="48px" class="q-mb-sm" />
                <div>Nessun membro trovato nel tenant.</div>
              </div>
            </template>
          </q-table>
        </q-tab-panel>

        <!-- Tab: Inviti Pendenti -->
        <q-tab-panel name="invitations" class="q-pa-none">
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

      <!-- Invite Member Dialog — Step 14 & Step 26 -->
      <q-dialog v-model="showInviteDialog" persistent>
        <q-card style="min-width: 420px" class="q-pa-md glass-invite-card">
          <q-card-section>
            <div class="text-h6 text-weight-bold">
              ✉️ Invita Persona
              {{ scope !== "tenant" ? (scope === "workspace" ? "al Workspace" : "al Task") : "" }}
            </div>
            <div class="text-caption text-grey-4 q-mt-xs">
              {{
                scope === "task"
                  ? "La persona riceverà l'invito per collaborare SOLO a questo specifico task."
                  : scope === "workspace"
                    ? "La persona invitata avrà accesso a tutti i task operativi di questo workspace."
                    : "Il membro riceverà un link sicuro via email per unirsi all'organizzazione aziendale."
              }}
            </div>
          </q-card-section>

          <q-card-section class="q-gutter-md">
            <q-input
              v-model="inviteEmail"
              label="Email del collaboratore"
              type="email"
              outlined
              dense
              dark
              autocomplete="off"
              hint="Inserisci l'indirizzo email aziendale."
            />
            <q-select
              v-if="scope === 'tenant'"
              v-model="inviteRole"
              :options="roleOptions"
              option-value="value"
              option-label="label"
              emit-value
              map-options
              outlined
              dense
              dark
              label="Ruolo da assegnare"
            />
          </q-card-section>

          <q-card-actions align="right">
            <q-btn flat label="Annulla" color="grey-4" v-close-popup :disable="isInviting" />
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
  background: rgba(10, 35, 66, 0.94);
  backdrop-filter: blur(16px);
  border: 1px solid rgba(197, 160, 101, 0.25);
  border-radius: 16px;
  color: #f9f7f2;
}
</style>
