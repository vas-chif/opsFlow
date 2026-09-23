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
import { useQuasar, copyToClipboard } from "quasar";

// ── Firebase ─────────────────────────────────────────────────────────────────
import { getFirestore, collection, getDocs, doc, setDoc, orderBy, query } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { app } from "@/boot/firebase";

// ── Types ────────────────────────────────────────────────────────────────────
import type { TenantRole, SetUserRoleRequest } from "@/types/auth";
import type { TenantInvitation, CreateInvitationResponse } from "@/types/models";

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
  if (role === "owner") return "amber-9";
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
    const rolePriority: Record<TenantRole, number> = {
      owner: 1,
      superadmin: 2,
      admin: 3,
      user: 4,
      member: 5,
      manager: 6,
      operator: 7,
      viewer: 8,
    };
    const rawMembers = snap.docs.map((d) => ({
      uid: d.id,
      ...(d.data() as Omit<MemberRow, "uid">),
    }));
    // Sort hierarchy: Owner first, then SuperAdmin, Admin, User, then alphabetical
    members.value = rawMembers.sort((a, b) => {
      const orderA = rolePriority[a.role] ?? 99;
      const orderB = rolePriority[b.role] ?? 99;
      if (orderA !== orderB) return orderA - orderB;
      const nameA = a.displayName || a.email || "";
      const nameB = b.displayName || b.email || "";
      return nameA.localeCompare(nameB);
    });
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
  // Immunità assoluta per Owner e Superadmin (§7.4)
  if (member.role === "owner" || member.role === "superadmin") {
    return;
  }

  const nextActive = !member.isActive;
  try {
    const db = getFirestore(app);
    await setDoc(
      doc(db, `tenants/${authStore.tenantId}/members/${member.uid}`),
      { isActive: nextActive },
      { merge: true },
    );
    member.isActive = nextActive;

    // Se sospeso all'interno di un workspace specifico, revoca l'accesso a quel workspace
    if (!nextActive && props.scope === "workspace" && props.workspaceId && member.email) {
      try {
        await taskStore.removeMemberFromWorkspace(props.workspaceId, member.email);
      } catch {
        // Se non era già assegnato, ignora
      }
    }

    $q.notify({
      type: "info",
      message: `Collaborazione ${nextActive ? "riattivata" : "sospesa"} nel tenant: ${member.email}`,
    });
  } catch {
    $q.notify({ type: "negative", message: "Errore nell'aggiornamento dello stato nel tenant." });
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
        CreateInvitationResponse
      >(functions, "createTenantInvitation");

      const res = await createInvitation({
        email: inviteEmail.value,
        role: inviteRole.value,
        scope: props.scope,
        workspaceId: props.workspaceId,
        workspaceName: props.workspaceName || currentWorkspace.value?.name || undefined,
        taskId: props.taskId,
        taskTitle: props.taskTitle || currentTask.value?.title || undefined,
      });

      const data = res.data;
      const isLocal =
        typeof window !== "undefined" &&
        (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");
      const baseUrl = isLocal ? "https://opsflow-88of.web.app" : window.location.origin;
      const token = data.rawToken || data.tokenHash;
      const directUrl = token
        ? `${baseUrl}/#/invite?token=${token}&tenant=${authStore.tenantId}`
        : data.inviteUrl || "";

      const notifyOpts: {
        type: string;
        message: string;
        caption: string;
        icon: string;
        timeout: number;
        actions?: { label: string; color: string; handler: () => void }[];
      } = {
        type: data.emailSent === false ? "warning" : "positive",
        message:
          data.emailSent === false
            ? `Invito creato per ${inviteEmail.value}!`
            : `✉️ Invito inviato a ${inviteEmail.value}!`,
        caption:
          data.emailSent === false
            ? "Email non recapitata (Resend Sandbox). Usa 'Copia Link' per inviarlo via WhatsApp/chat."
            : "Puoi anche copiare direttamente il link di invito.",
        icon: data.emailSent === false ? "content_copy" : "mark_email_read",
        timeout: data.emailSent === false ? 10000 : 6000,
      };

      if (directUrl) {
        notifyOpts.actions = [
          {
            label: "📋 Copia Link",
            color: "white",
            handler: () => {
              void copyToClipboard(directUrl);
              $q.notify({
                type: "positive",
                message: "Link copiato negli appunti!",
                timeout: 3000,
              });
            },
          },
        ];
      }

      $q.notify(notifyOpts);
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

async function copyInvitationLink(inv: TenantInvitation): Promise<void> {
  const token = inv.rawToken || inv.tokenHash;
  const isLocal =
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");
  const baseUrl = isLocal ? "https://opsflow-88of.web.app" : window.location.origin;
  const inviteUrl = `${baseUrl}/#/invite?token=${token}&tenant=${inv.tenantId || authStore.tenantId}`;

  try {
    await copyToClipboard(inviteUrl);
    $q.notify({
      type: "positive",
      message: "📋 Link di invito copiato negli appunti!",
      caption: `Condividilo con ${inv.email} via WhatsApp o chat.`,
      icon: "content_copy",
      timeout: 5000,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Impossibile copiare il link.";
    $q.notify({ type: "warning", message: msg, icon: "warning" });
  }
} /*end copyInvitationLink*/

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
            <!-- Display name column with Owner badge -->
            <template #body-cell-displayName="{ row }">
              <q-td align="left">
                <div class="row items-center no-wrap">
                  <span class="text-weight-bold">{{ row.displayName || "Senza Nome" }}</span>
                  <q-badge
                    v-if="row.role === 'owner'"
                    color="amber-9"
                    text-color="white"
                    label="👑 Owner"
                    class="q-ml-sm text-caption"
                  />
                </div>
              </q-td>
            </template>

            <!-- Role column -->
            <template #body-cell-role="{ row }">
              <q-td align="center">
                <q-badge
                  :color="roleBadgeColor(row.role)"
                  :label="row.role"
                  :class="{ 'text-weight-bold shadow-1': row.role === 'owner' }"
                />
                <q-btn
                  v-if="authStore.isAdmin && row.role !== 'superadmin' && row.role !== 'owner'"
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
                  :color="row.isActive ? (row.role === 'owner' ? 'amber-9' : 'positive') : 'grey'"
                  :label="row.isActive ? 'Attivo' : 'Sospeso'"
                />
                <q-btn
                  v-if="row.role !== 'owner' && row.role !== 'superadmin'"
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
                    row.isActive
                      ? "Sospendi collaborazione nel tenant"
                      : "Riattiva collaborazione nel tenant"
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
                    v-if="row.role === 'owner'"
                    color="amber-9"
                    label="👑 Accesso Globale"
                    class="q-mr-xs text-weight-bold"
                  >
                    <q-tooltip
                      >L'Owner ha accesso completo per definizione a tutti i workspace e
                      task</q-tooltip
                    >
                  </q-badge>
                  <q-badge
                    v-else-if="assignedMembersList.includes(row.email)"
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

            <!-- Actions: Copy Link & Revoke -->
            <template #body-cell-actions="{ row }">
              <q-td align="center">
                <div class="row items-center justify-center no-wrap q-gutter-xs">
                  <q-btn
                    v-if="row.status === 'pending'"
                    flat
                    round
                    dense
                    icon="content_copy"
                    color="primary"
                    size="xs"
                    @click="copyInvitationLink(row)"
                  >
                    <q-tooltip>📋 Copia Link di Invito</q-tooltip>
                  </q-btn>
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
                </div>
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
      <q-dialog
        v-model="showInviteDialog"
        persistent
        backdrop-filter="blur(14px)"
        transition-show="scale"
        transition-hide="scale"
      >
        <q-card class="elite-invite-dialog-card column no-wrap">
          <!-- Header -->
          <q-card-section class="q-px-lg q-pt-lg q-pb-none">
            <div class="row items-center no-wrap">
              <div class="invite-icon-badge q-mr-md shrink-0">
                <q-icon name="person_add" size="24px" color="primary" />
              </div>
              <div class="col min-width-0">
                <div class="text-h6 text-weight-bold text-navy text-truncate">
                  Invita Collaboratore
                </div>
                <div class="text-caption text-grey-7 q-mt-xs">
                  {{
                    scope === "task"
                      ? "Accesso riservato a questo specifico task operativo"
                      : scope === "workspace"
                        ? "Accesso ai task e alle schede di questo workspace"
                        : "Invito all'organizzazione e al team aziendale"
                  }}
                </div>
              </div>
              <q-btn
                flat
                round
                dense
                icon="close"
                color="grey-6"
                v-close-popup
                :disable="isInviting"
                class="q-ml-sm shrink-0"
              />
            </div>

            <!-- Context Banner -->
            <div class="scope-pill-banner row items-center q-px-md q-py-sm q-mt-md">
              <q-icon
                :name="
                  scope === 'workspace' ? 'domain' : scope === 'task' ? 'task_alt' : 'business'
                "
                size="18px"
                class="text-gold q-mr-sm"
              />
              <div class="text-caption text-navy">
                <span class="text-weight-medium">Destinazione: </span>
                <strong class="text-navy">
                  {{
                    scope === "workspace"
                      ? workspaceName || "Workspace Corrente"
                      : scope === "task"
                        ? taskTitle || "Task Corrente"
                        : "Tutti i workspace del Tenant"
                  }}
                </strong>
              </div>
            </div>
          </q-card-section>

          <!-- Form Body -->
          <q-card-section class="q-px-lg q-py-md q-gutter-y-md">
            <div>
              <div class="text-caption text-weight-bold text-navy q-mb-xs">
                Indirizzo Email Aziendale
              </div>
              <q-input
                v-model="inviteEmail"
                type="email"
                outlined
                dense
                placeholder="collaboratore@azienda.com"
                autocomplete="off"
                spellcheck="false"
                bg-color="grey-1"
                class="elite-input"
                :disable="isInviting"
                @keydown.enter.prevent="sendInvite"
              >
                <template #prepend>
                  <q-icon name="mail_outline" color="primary" size="20px" />
                </template>
                <template v-if="inviteEmail" #append>
                  <q-btn
                    flat
                    round
                    dense
                    icon="close"
                    size="xs"
                    color="grey-5"
                    @click="inviteEmail = ''"
                  />
                </template>
              </q-input>
              <div class="text-caption text-grey-6 q-mt-xs" style="font-size: 0.76rem">
                Verrà generato un link di accesso sicuro e inviata la notifica.
              </div>
            </div>

            <div v-if="scope === 'tenant'">
              <div class="text-caption text-weight-bold text-navy q-mb-xs">
                Ruolo &amp; Privilegi
              </div>
              <q-select
                v-model="inviteRole"
                :options="roleOptions"
                option-value="value"
                option-label="label"
                emit-value
                map-options
                outlined
                dense
                bg-color="grey-1"
                class="elite-input"
                :disable="isInviting"
              >
                <template #prepend>
                  <q-icon name="admin_panel_settings" color="primary" size="20px" />
                </template>
              </q-select>
            </div>

            <!-- GDPR Security Pill -->
            <div class="gdpr-security-pill row items-center q-px-sm q-py-xs q-mt-sm">
              <q-icon name="verified_user" size="15px" color="positive" class="q-mr-xs" />
              <span class="text-caption text-grey-8" style="font-size: 0.74rem">
                Conforme GDPR Art. 32 con token crittografico monouso.
              </span>
            </div>
          </q-card-section>

          <!-- Footer Actions -->
          <q-card-actions class="q-px-lg q-pb-lg q-pt-xs row items-center justify-end">
            <q-btn
              flat
              rounded
              no-caps
              label="Annulla"
              color="grey-7"
              class="q-px-md q-mr-sm"
              v-close-popup
              :disable="isInviting"
            />
            <q-btn
              unelevated
              rounded
              no-caps
              label="Invia Invito"
              icon="send"
              class="btn-elite-send q-px-lg"
              :loading="isInviting"
              :disable="isInviting || !inviteEmail.trim()"
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

.elite-invite-dialog-card {
  width: 100%;
  max-width: 480px;
  min-width: 360px;
  background: #ffffff;
  border-radius: 20px;
  border-top: 4px solid #c5a065;
  box-shadow:
    0 24px 60px -12px rgba(10, 35, 66, 0.22),
    0 2px 8px rgba(10, 35, 66, 0.06);
  overflow: hidden;
}

.text-navy {
  color: #0a2342;
}

.text-gold {
  color: #c5a065;
}

.invite-icon-badge {
  width: 46px;
  height: 46px;
  border-radius: 12px;
  background: rgba(10, 35, 66, 0.05);
  border: 1px solid rgba(197, 160, 101, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
}

.scope-pill-banner {
  background: #f8fafc;
  border: 1px solid rgba(10, 35, 66, 0.08);
  border-radius: 10px;
}

.gdpr-security-pill {
  background: rgba(46, 125, 50, 0.06);
  border-radius: 8px;
  border: 1px solid rgba(46, 125, 50, 0.15);
}

.elite-input {
  :deep(.q-field__control) {
    border-radius: 10px;
    transition: all 0.2s ease;
    &:hover {
      border-color: rgba(10, 35, 66, 0.35);
    }
    &.q-field__control--focused {
      border-color: #0a2342;
      box-shadow: 0 0 0 3px rgba(10, 35, 66, 0.1);
    }
  }
}

.btn-elite-send {
  background: linear-gradient(135deg, #0a2342 0%, #153a66 100%) !important;
  color: #ffffff !important;
  font-weight: 600;
  letter-spacing: 0.3px;
  box-shadow: 0 4px 12px rgba(10, 35, 66, 0.2);
  transition: all 0.2s ease;

  &:hover {
    box-shadow: 0 6px 18px rgba(10, 35, 66, 0.32);
    transform: translateY(-1px);
  }
}
</style>
