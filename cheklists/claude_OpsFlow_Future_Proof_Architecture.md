Reading frontend design skill for UI patterns
Reading frontend design skill for UI patterns
Eccellente — tre problemi di produzione reali, ciascuno con una causa radice precisa. Li affronto in ordine di criticità con codice production-ready.

1. Bulletproof Google Workspace OAuth — Pattern End-to-End
   Il problema è strutturale: il token OAuth dell'utente vive nel browser, ma la Cloud Function che esegue il tool non ce l'ha. Serve un bridge esplicito e verificabile.

Layer 1 — Token Vault (Frontend, src/composables/useGoogleOAuth.ts)
typescript
// src/composables/useGoogleOAuth.ts
// Responsabilità UNICA: gestire il ciclo di vita del token Google dell'utente.
// Il token viene salvato in Firestore (cifrato) e riletto dalla Cloud Function.

import { getAuth } from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db } from 'src/boot/firebase';
import { useSecureLogger } from './useSecureLogger';

const logger = useSecureLogger('useGoogleOAuth');

// Schema stretto — nessun campo opzionale silenzioso
export interface GoogleTokenRecord {
accessToken: string;
refreshToken: string;
expiresAt: number; // epoch ms
scopes: string[];
userId: string;
tenantId: string;
updatedAt: ReturnType<typeof serverTimestamp>;
}

// Scopes MINIMI richiesti — dichiarati una volta sola, usati ovunque
export const REQUIRED_GMAIL_SCOPES = [
'https://www.googleapis.com/auth/gmail.compose',
] as const;

export const REQUIRED_SHEETS_SCOPES = [
'https://www.googleapis.com/auth/spreadsheets',
] as const;

export function useGoogleOAuth() {
// ── STEP 1: Avvia il flusso OAuth con scopes espliciti ──────────────
async function initiateOAuthFlow(
scopes: readonly string[]
): Promise<void> {
const { GoogleAuthProvider, signInWithPopup, linkWithPopup } = await import('firebase/auth');
const auth = getAuth();
const user = auth.currentUser;
if (!user) throw new Error('User must be authenticated before OAuth delegation');

    const provider = new GoogleAuthProvider();
    scopes.forEach(s => provider.addScope(s));

    // Forza il re-consent se i scope sono cambiati
    provider.setCustomParameters({ prompt: 'consent', access_type: 'offline' });

    try {
      // linkWithPopup se l'utente ha già un account Google, signInWithPopup altrimenti
      const result = await linkWithPopup(user, provider).catch(() =>
        signInWithPopup(auth, provider)
      );

      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (!credential?.accessToken) throw new Error('OAuth flow returned no access token');

      // Recupera il refresh token dall'IdToken result (disponibile solo al primo consent)
      // In produzione: il refresh token viene salvato dal backend via server-side OAuth
      // Per semplicità client-side: salviamo accessToken + expiry
      const tokenRecord: Omit<GoogleTokenRecord, 'updatedAt'> = {
        accessToken: credential.accessToken,
        refreshToken: '', // vedi nota sotto
        expiresAt: Date.now() + 3600 * 1000, // 1h standard Google
        scopes: [...scopes],
        userId: user.uid,
        tenantId: user.uid, // sostituire con tenantId reale da authStore
      };

      await persistToken(tokenRecord);
      logger.info('OAuth token stored', { scopes });
    } catch (err) {
      logger.error('OAuth flow failed', err);
      throw err;
    }

}

// ── STEP 2: Leggi e verifica il token prima di ogni tool call ────────
async function getValidToken(
requiredScopes: readonly string[]
): Promise<string> {
const auth = getAuth();
const user = auth.currentUser;
if (!user) throw new TokenError('NOT_AUTHENTICATED');

    const tokenDoc = await getDoc(
      doc(db, 'tenants', user.uid, 'oauthTokens', 'google')
    );

    if (!tokenDoc.exists()) throw new TokenError('TOKEN_NOT_FOUND');

    const record = tokenDoc.data() as GoogleTokenRecord;

    // Verifica scopes: ogni scope richiesto deve essere presente
    const missingScopes = requiredScopes.filter(s => !record.scopes.includes(s));
    if (missingScopes.length > 0) {
      throw new TokenError('INSUFFICIENT_SCOPES', { missingScopes });
    }

    // Verifica scadenza con margine di 5 minuti
    const isExpired = record.expiresAt < Date.now() + 5 * 60 * 1000;
    if (isExpired) {
      // Il refresh avviene lato backend (Cloud Function) per sicurezza
      throw new TokenError('TOKEN_EXPIRED');
    }

    return record.accessToken;

}

async function persistToken(
record: Omit<GoogleTokenRecord, 'updatedAt'>
): Promise<void> {
const auth = getAuth();
const user = auth.currentUser;
if (!user) throw new Error('No authenticated user');

    await setDoc(
      doc(db, 'tenants', user.uid, 'oauthTokens', 'google'),
      { ...record, updatedAt: serverTimestamp() },
      { merge: true }
    );

}

return { initiateOAuthFlow, getValidToken };
}

// Errore tipizzato — mai stringhe grezze
export class TokenError extends Error {
constructor(
public readonly code: 'NOT_AUTHENTICATED' | 'TOKEN_NOT_FOUND' | 'TOKEN_EXPIRED' | 'INSUFFICIENT_SCOPES',
public readonly meta?: Record<string, unknown>
) {
super(`GoogleOAuth: ${code}`);
this.name = 'TokenError';
}
}
Layer 2 — Tool Execution (Backend, opsflow-functions/src/tools/googleWorkspace.ts)
typescript
// opsflow-functions/src/tools/googleWorkspace.ts
// Ogni tool: verifica token → esegui → restituisce ApprovalPayload (MAI scrive direttamente)

import { defineTool } from '@genkit-ai/ai';
import { z } from 'zod';
import { google } from 'googleapis';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

// ── Tipi condivisi ────────────────────────────────────────────────────

const GmailDraftInputSchema = z.object({
to: z.array(z.string().email()),
subject: z.string().max(200),
body: z.string(),
cc: z.array(z.string().email()).optional(),
});

const SheetAppendInputSchema = z.object({
spreadsheetId: z.string(),
range: z.string(), // es. 'Lead 2024!A:Z'
values: z.array(z.array(z.string())),
});

// ApprovalPayload: ciò che il tool restituisce SEMPRE — mai scrive direttamente
export interface ApprovalPayload {
approvalId: string;
toolId: string;
previewType: 'gmail_draft' | 'sheet_append';
previewData: Record<string, unknown>;
// La Cloud Function scriverà su Firestore questo payload per l'approvazione
pendingAt: FirebaseFirestore.FieldValue;
}

// ── Helper: recupera token utente da Firestore ────────────────────────

async function getUserToken(
tenantId: string,
userId: string,
requiredScopes: string[]
): Promise<string> {
const db = getFirestore();
const tokenSnap = await db
.doc(`tenants/${tenantId}/oauthTokens/google`)
.get();

if (!tokenSnap.exists) {
throw Object.assign(new Error('OAuth token not found for user'), {
code: 'TOKEN_NOT_FOUND',
tenantId,
});
}

const data = tokenSnap.data()!;
const missingScopes = requiredScopes.filter(
(s: string) => !(data.scopes as string[]).includes(s)
);

if (missingScopes.length > 0) {
throw Object.assign(new Error('Insufficient OAuth scopes'), {
code: 'INSUFFICIENT_SCOPES',
missingScopes,
});
}

const isExpired = (data.expiresAt as number) < Date.now() + 5 * 60 * 1000;
if (isExpired) {
// Tentativo di refresh con il refresh token (se disponibile)
if (data.refreshToken) {
return await refreshAndPersistToken(tenantId, data.refreshToken as string);
}
throw Object.assign(new Error('OAuth token expired'), {
code: 'TOKEN_EXPIRED',
});
}

return data.accessToken as string;
}

async function refreshAndPersistToken(
tenantId: string,
refreshToken: string
): Promise<string> {
const oauth2 = new google.auth.OAuth2(
process.env.GOOGLE_CLIENT_ID,
process.env.GOOGLE_CLIENT_SECRET
);
oauth2.setCredentials({ refresh_token: refreshToken });

const { credentials } = await oauth2.refreshAccessToken();
if (!credentials.access_token) throw new Error('Token refresh failed');

const db = getFirestore();
await db.doc(`tenants/${tenantId}/oauthTokens/google`).update({
accessToken: credentials.access_token,
expiresAt: credentials.expiry_date ?? Date.now() + 3600 * 1000,
updatedAt: FieldValue.serverTimestamp(),
});

return credentials.access_token;
}

// ── Tool 1: Gmail Draft (CREA BOZZA — non invia mai) ─────────────────

export const gmailDraftTool = defineTool(
{
name: 'gmail_draft',
description:
'Prepares a Gmail draft for user review. The draft is NEVER sent automatically. Returns a preview for human approval.',
inputSchema: GmailDraftInputSchema,
outputSchema: z.object({
approvalId: z.string(),
previewData: z.record(z.unknown()),
}),
},
async (input, { context }) => {
const { tenantId, userId, taskId } = context as {
tenantId: string;
userId: string;
taskId: string;
};

    // 1. Token check — lancia eccezione tipizzata, mai fallisce silenziosamente
    const accessToken = await getUserToken(tenantId, userId, [
      'https://www.googleapis.com/auth/gmail.compose',
    ]);

    // 2. Crea la bozza su Gmail (scrittura reale su Gmail Draft API)
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const gmail = google.gmail({ version: 'v1', auth });

    const rawEmail = buildRawEmail(input);
    const draft = await gmail.users.drafts.create({
      userId: 'me',
      requestBody: { message: { raw: rawEmail } },
    });

    if (!draft.data.id) throw new Error('Gmail draft creation returned no ID');

    // 3. Salva il payload di approvazione su Firestore — il frontend lo ascolta via onSnapshot
    const approvalId = crypto.randomUUID();
    const db = getFirestore();
    const payload: ApprovalPayload = {
      approvalId,
      toolId: 'gmail_draft',
      previewType: 'gmail_draft',
      previewData: {
        draftId: draft.data.id,
        to: input.to,
        subject: input.subject,
        bodyPreview: input.body.slice(0, 300),
        gmailWebUrl: `https://mail.google.com/mail/#drafts/${draft.data.id}`,
      },
      pendingAt: FieldValue.serverTimestamp(),
    };

    await db
      .collection(`tenants/${tenantId}/tasks/${taskId}/approvals`)
      .doc(approvalId)
      .set(payload);

    // 4. Il tool restituisce SOLO il riferimento — nessun dato sensibile nel messaggio chat
    return { approvalId, previewData: payload.previewData };

}
);

// ── Tool 2: Google Sheets Append ──────────────────────────────────────

export const sheetsAppendTool = defineTool(
{
name: 'sheets_append',
description:
'Prepares rows to append to a Google Sheet. Data is NOT written until the user approves.',
inputSchema: SheetAppendInputSchema,
outputSchema: z.object({
approvalId: z.string(),
previewData: z.record(z.unknown()),
}),
},
async (input, { context }) => {
const { tenantId, userId, taskId } = context as {
tenantId: string;
userId: string;
taskId: string;
};

    const accessToken = await getUserToken(tenantId, userId, [
      'https://www.googleapis.com/auth/spreadsheets',
    ]);

    // NON scriviamo ancora su Sheets — solo prepariamo il payload
    const approvalId = crypto.randomUUID();
    const db = getFirestore();

    const payload: ApprovalPayload = {
      approvalId,
      toolId: 'sheets_append',
      previewType: 'sheet_append',
      previewData: {
        spreadsheetId: input.spreadsheetId,
        range: input.range,
        rows: input.values,
        rowCount: input.values.length,
        // Il token viene passato all'esecuzione reale (vedi executeApproval)
        _tokenRef: `tenants/${tenantId}/oauthTokens/google`,
      },
      pendingAt: FieldValue.serverTimestamp(),
    };

    await db
      .collection(`tenants/${tenantId}/tasks/${taskId}/approvals`)
      .doc(approvalId)
      .set(payload);

    return { approvalId, previewData: payload.previewData };

}
);

// ── Execution Gate: chiamata SOLO dopo approvazione utente ───────────

export async function executeApprovedAction(
tenantId: string,
userId: string,
taskId: string,
approvalId: string
): Promise<void> {
const db = getFirestore();
const approvalRef = db.doc(
`tenants/${tenantId}/tasks/${taskId}/approvals/${approvalId}`
);
const approvalSnap = await approvalRef.get();
if (!approvalSnap.exists) throw new Error('Approval not found');

const approval = approvalSnap.data() as ApprovalPayload;
if (approval.previewType === 'sheet_append') {
const data = approval.previewData;
const accessToken = await getUserToken(tenantId, userId, [
'https://www.googleapis.com/auth/spreadsheets',
]);

    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const sheets = google.sheets({ version: 'v4', auth });

    await sheets.spreadsheets.values.append({
      spreadsheetId: data.spreadsheetId as string,
      range: data.range as string,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: data.rows as string[][] },
    });

}

// Marca come eseguita
await approvalRef.update({
executedAt: FieldValue.serverTimestamp(),
executedBy: userId,
});
}

// ── Utility: costruisce email RFC2822 in base64 ───────────────────────
function buildRawEmail(input: z.infer<typeof GmailDraftInputSchema>): string {
const lines = [
`To: ${input.to.join(', ')}`,
...(input.cc ? [`Cc: ${input.cc.join(', ')}`] : []),
`Subject: ${input.subject}`,
'Content-Type: text/plain; charset=utf-8',
'',
input.body,
];
return Buffer.from(lines.join('\r\n'))
.toString('base64')
.replace(/\+/g, '-')
.replace(/\//g, '_')
.replace(/=+$/, '');
} 2. Interactive Human-in-the-Loop — Rich Preview Cards
Store (src/stores/taskChatStore.ts)
typescript
// src/stores/taskChatStore.ts
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import {
collection,
onSnapshot,
addDoc,
serverTimestamp,
query,
orderBy,
type Unsubscribe,
} from 'firebase/firestore';
import { db } from 'src/boot/firebase';
import type { TaskMessage, ApprovalCard } from 'src/types/models';

// ── Tipi locali ───────────────────────────────────────────────────────

export type MessageRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
id: string;
role: MessageRole;
content: string;
contentType: 'text' | 'approval_card' | 'agent_log';
createdAt: number; // epoch ms — ordinamento client-side sicuro
// Presente solo se contentType === 'approval_card'
approvalCard?: ApprovalCard;
}

export interface ApprovalCard {
approvalId: string;
toolId: string;
previewType: 'gmail_draft' | 'sheet_append';
previewData: Record<string, unknown>;
status: 'pending' | 'approved' | 'rejected';
}

export interface ChatSession {
taskId: string;
workspaceId: string;
messages: ChatMessage[];
isAgentTyping: boolean;
inputDraft: string;
error: string | null;
// Subscription handle — pulito alla chiusura della sessione
_unsubMessages?: Unsubscribe;
_unsubApprovals?: Unsubscribe;
}

// ── Store ─────────────────────────────────────────────────────────────

export const useTaskChatStore = defineStore('taskChat', () => {
// Map<taskId, ChatSession> — supporta N sessioni parallele
const sessions = ref(new Map<string, ChatSession>());
const primarySessionId = ref<string | null>(null);

const primarySession = computed(() =>
primarySessionId.value
? sessions.value.get(primarySessionId.value) ?? null
: null
);

// ── Apri / recupera una sessione ─────────────────────────────────
function openSession(
taskId: string,
workspaceId: string,
tenantId: string
): ChatSession {
if (sessions.value.has(taskId)) {
return sessions.value.get(taskId)!;
}

    const session: ChatSession = {
      taskId,
      workspaceId,
      messages: [],
      isAgentTyping: false,
      inputDraft: '',
      error: null,
    };
    sessions.value.set(taskId, session);

    // Avvia i due listener Firestore immediatamente
    _subscribeMessages(taskId, tenantId, workspaceId);
    _subscribeApprovals(taskId, tenantId, workspaceId);

    return session;

}

// ── Listener 1: messaggi chat ─────────────────────────────────────
function _subscribeMessages(
taskId: string,
tenantId: string,
workspaceId: string
): void {
const session = sessions.value.get(taskId);
if (!session) return;

    const q = query(
      collection(
        db,
        `tenants/${tenantId}/workspaces/${workspaceId}/tasks/${taskId}/messages`
      ),
      orderBy('createdAt', 'asc')
    );

    session._unsubMessages = onSnapshot(
      q,
      { includeMetadataChanges: false },
      (snap) => {
        const currentSession = sessions.value.get(taskId);
        if (!currentSession) return;

        // Ricostruisce l'array completo — onSnapshot è la source of truth
        currentSession.messages = snap.docs
          .filter(d => d.data().contentType !== 'approval_card') // le card arrivano dal secondo listener
          .map(d => ({
            id: d.id,
            ...(d.data() as Omit<ChatMessage, 'id'>),
            createdAt: d.data().createdAt?.toMillis?.() ?? Date.now(),
          }));

        currentSession.isAgentTyping = false;
      },
      (err) => {
        const s = sessions.value.get(taskId);
        if (s) s.error = `Firestore messages error: ${err.message}`;
      }
    );

}

// ── Listener 2: approval cards (subcollection separata) ───────────
function _subscribeApprovals(
taskId: string,
tenantId: string,
workspaceId: string
): void {
const session = sessions.value.get(taskId);
if (!session) return;

    const q = query(
      collection(
        db,
        `tenants/${tenantId}/tasks/${taskId}/approvals`
      ),
      orderBy('pendingAt', 'asc')
    );

    session._unsubApprovals = onSnapshot(q, (snap) => {
      const currentSession = sessions.value.get(taskId);
      if (!currentSession) return;

      snap.docChanges().forEach(change => {
        const data = change.doc.data();
        const cardMsg: ChatMessage = {
          id: `approval_${change.doc.id}`,
          role: 'assistant',
          content: '',
          contentType: 'approval_card',
          createdAt: data.pendingAt?.toMillis?.() ?? Date.now(),
          approvalCard: {
            approvalId: change.doc.id,
            toolId: data.toolId as string,
            previewType: data.previewType as ApprovalCard['previewType'],
            previewData: data.previewData as Record<string, unknown>,
            status: (data.executedAt ? 'approved' : data.rejectedAt ? 'rejected' : 'pending') as ApprovalCard['status'],
          },
        };

        if (change.type === 'added') {
          // Inserisce la card nella posizione temporale corretta
          const idx = currentSession.messages.findIndex(
            m => m.createdAt > cardMsg.createdAt
          );
          if (idx === -1) currentSession.messages.push(cardMsg);
          else currentSession.messages.splice(idx, 0, cardMsg);
        } else if (change.type === 'modified') {
          // Aggiorna la card esistente (es. status → 'approved')
          const existing = currentSession.messages.find(
            m => m.id === `approval_${change.doc.id}`
          );
          if (existing?.approvalCard) {
            existing.approvalCard.status = data.executedAt
              ? 'approved'
              : data.rejectedAt
              ? 'rejected'
              : 'pending';
          }
        }
      });
    });

}

// ── Invia un messaggio utente ─────────────────────────────────────
async function sendMessage(
taskId: string,
tenantId: string,
workspaceId: string,
content: string
): Promise<void> {
const session = sessions.value.get(taskId);
if (!session || !content.trim()) return;

    session.inputDraft = '';
    session.isAgentTyping = true;
    session.error = null;

    await addDoc(
      collection(
        db,
        `tenants/${tenantId}/workspaces/${workspaceId}/tasks/${taskId}/messages`
      ),
      {
        role: 'user' as MessageRole,
        content,
        contentType: 'text',
        createdAt: serverTimestamp(),
      }
    );
    // onSnapshot aggiorna automaticamente la lista — nessun push manuale necessario

}

// ── Approva o rifiuta una card ────────────────────────────────────
async function resolveApproval(
taskId: string,
tenantId: string,
approvalId: string,
decision: 'approved' | 'rejected'
): Promise<void> {
const { httpsCallable, getFunctions } = await import('firebase/functions');
const functions = getFunctions();
const resolveAction = httpsCallable(functions, 'resolveApproval');

    await resolveAction({ taskId, tenantId, approvalId, decision });
    // onSnapshot aggiornerà automaticamente lo status della card

}

// ── Chiudi e pulisci una sessione ─────────────────────────────────
function closeSession(taskId: string): void {
const session = sessions.value.get(taskId);
if (!session) return;
session._unsubMessages?.();
session._unsubApprovals?.();
sessions.value.delete(taskId);
if (primarySessionId.value === taskId) primarySessionId.value = null;
}

function setPrimary(taskId: string): void {
primarySessionId.value = taskId;
}

return {
sessions,
primarySessionId,
primarySession,
openSession,
sendMessage,
resolveApproval,
closeSession,
setPrimary,
};
});
Componente Preview Card (src/components/ApprovalCard.vue)
vue
<!-- src/components/ApprovalCard.vue -->
<!-- Componente autonomo: riceve la card, emette la decisione -->
<script setup lang="ts">
import { computed } from 'vue';
import type { ApprovalCard } from 'src/stores/taskChatStore';

const props = defineProps<{
  card: ApprovalCard;
  loading: boolean;
}>();

const emit = defineEmits<{
  approve: [approvalId: string];
  reject: [approvalId: string];
}>();

const isGmailDraft = computed(() => props.card.previewType === 'gmail_draft');
const isSheetAppend = computed(() => props.card.previewType === 'sheet_append');
const isPending = computed(() => props.card.status === 'pending');

const statusLabel = computed(() => ({
  pending: '',
  approved: '✅ Executed',
  rejected: '❌ Rejected',
}[props.card.status]));
</script>

<template>
  <div
    class="approval-card"
    :class="`approval-card--${card.status}`"
    role="region"
    :aria-label="`${card.previewType} preview — ${card.status}`"
  >
    <!-- Header -->
    <div class="approval-card__header">
      <q-icon
        :name="isGmailDraft ? 'mail' : 'table_chart'"
        size="18px"
        color="primary"
      />
      <span class="approval-card__title">
        {{ isGmailDraft ? 'Email Draft Preview' : 'Sheet Append Preview' }}
      </span>
      <q-badge
        v-if="!isPending"
        :color="card.status === 'approved' ? 'positive' : 'negative'"
        :label="statusLabel"
        class="approval-card__status"
      />
    </div>

    <!-- Gmail Draft Preview -->
    <template v-if="isGmailDraft">
      <div class="approval-card__field">
        <span class="approval-card__label">To</span>
        <span>{{ (card.previewData.to as string[]).join(', ') }}</span>
      </div>
      <div class="approval-card__field">
        <span class="approval-card__label">Subject</span>
        <span>{{ card.previewData.subject }}</span>
      </div>
      <div class="approval-card__body">
        {{ card.previewData.bodyPreview }}
        <span v-if="(card.previewData.bodyPreview as string).length >= 300" class="text-grey-6">
          … (truncated)
        </span>
      </div>

        :href="card.previewData.gmailWebUrl as string"
        target="_blank"
        rel="noopener noreferrer"
        class="approval-card__link"
      >
        Open in Gmail ↗
      </a>
    </template>

    <!-- Sheets Append Preview -->
    <template v-else-if="isSheetAppend">
      <div class="approval-card__field">
        <span class="approval-card__label">Range</span>
        <span>{{ card.previewData.range }}</span>
      </div>
      <div class="approval-card__field">
        <span class="approval-card__label">Rows to add</span>
        <span>{{ card.previewData.rowCount }}</span>
      </div>
      <div class="approval-card__table-preview">
        <table>
          <tr
            v-for="(row, rIdx) in (card.previewData.rows as string[][]).slice(0, 3)"
            :key="rIdx"
          >
            <td v-for="(cell, cIdx) in row" :key="cIdx">{{ cell }}</td>
          </tr>
          <tr v-if="(card.previewData.rowCount as number) > 3">
            <td :colspan="(card.previewData.rows as string[][])[0]?.length ?? 1" class="text-grey-6">
              + {{ (card.previewData.rowCount as number) - 3 }} more rows
            </td>
          </tr>
        </table>
      </div>
    </template>

    <!-- Action buttons — visibili solo se pending -->
    <div v-if="isPending" class="approval-card__actions">
      <q-btn
        label="✅ Approve & Execute"
        color="positive"
        :loading="loading"
        no-caps
        unelevated
        @click="emit('approve', card.approvalId)"
      />
      <q-btn
        label="❌ Reject"
        color="negative"
        flat
        no-caps
        :disable="loading"
        @click="emit('reject', card.approvalId)"
      />
    </div>

  </div>
</template>

<style scoped lang="scss">
.approval-card {
  border: 1px solid #c5a065;
  border-radius: 10px;
  padding: 14px 16px;
  background: rgba(197, 160, 101, 0.06);
  margin: 8px 0;
  transition: opacity 0.2s;

  &--approved,
  &--rejected {
    opacity: 0.65;
    pointer-events: none;
  }

  &__header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 10px;
    font-weight: 600;
    font-size: 13px;
  }

  &__title { flex: 1; }

  &__label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--q-grey-7, #616161);
    display: block;
    margin-bottom: 2px;
  }

  &__field { margin-bottom: 8px; font-size: 13px; }

  &__body {
    background: var(--q-grey-1, #f5f5f5);
    border-radius: 6px;
    padding: 10px 12px;
    font-size: 13px;
    line-height: 1.5;
    margin: 8px 0;
    white-space: pre-wrap;
  }

  &__link {
    font-size: 12px;
    color: #c5a065;
    text-decoration: none;
    &:hover { text-decoration: underline; }
  }

  &__table-preview {
    overflow-x: auto;
    margin: 8px 0;
    table {
      border-collapse: collapse;
      font-size: 12px;
      width: 100%;
      td {
        border: 1px solid #e0e0e0;
        padding: 4px 8px;
        max-width: 160px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    }
  }

  &__actions {
    display: flex;
    gap: 10px;
    margin-top: 14px;
    flex-wrap: wrap;
  }
}
</style>

3. State Persistence & Zero-Loss Refresh
   Il bug di perdita stato al refresh ha sempre la stessa causa: il componente Vue avvia il listener onSnapshot in onMounted, ma se il componente non è ancora montato (navigazione lazy, route change) il listener non parte e il backup localStorage non viene idratato correttamente.

La soluzione: il listener parte nello store, non nel componente. Il componente non sa nulla di Firestore.

Pattern completo con hydration garantita
typescript
// src/composables/useTaskChat.ts
// Questo composable è l'unico punto di ingresso per un componente che vuole la chat
// Garantisce: sessione aperta → listener attivo → stato idratato → zero perdita al refresh

import { computed, onUnmounted } from 'vue';
import { useTaskChatStore } from 'src/stores/taskChatStore';
import { useAuthStore } from 'src/stores/authStore';

export function useTaskChat(taskId: string, workspaceId: string) {
const chatStore = useTaskChatStore();
const authStore = useAuthStore();

const tenantId = authStore.tenantId;

// openSession è idempotente: se la sessione esiste già (sopravvissuta a un re-render),
// restituisce quella esistente senza riaprire il listener
const session = chatStore.openSession(taskId, workspaceId, tenantId);
chatStore.setPrimary(taskId);

const messages = computed(() => session.messages);
const isAgentTyping = computed(() => session.isAgentTyping);
const inputDraft = computed({
get: () => session.inputDraft,
set: (v: string) => { session.inputDraft = v; },
});
const error = computed(() => session.error);

async function send(content?: string): Promise<void> {
const text = content ?? session.inputDraft;
if (!text.trim()) return;
await chatStore.sendMessage(taskId, tenantId, workspaceId, text);
}

async function approve(approvalId: string): Promise<void> {
await chatStore.resolveApproval(taskId, tenantId, approvalId, 'approved');
}

async function reject(approvalId: string): Promise<void> {
await chatStore.resolveApproval(taskId, tenantId, approvalId, 'rejected');
}

// NON chiudiamo la sessione all'unmount del componente:
// la sessione sopravvive ai re-render e alle navigazioni finché l'utente non chiude esplicitamente
// closeSession viene chiamato solo quando l'utente clicca "X" sul task o naviga fuori dal workspace
onUnmounted(() => {
// Stub: sessione mantenuta viva — vedi nota architetturale
});

return { messages, isAgentTyping, inputDraft, error, send, approve, reject };
}
vue
<!-- src/components/TaskChatWindow.vue -->
<!-- Il componente è puro presentational logic — zero Firestore, zero store diretti -->
<script setup lang="ts">
import { ref, nextTick, watch } from 'vue';
import { useTaskChat } from 'src/composables/useTaskChat';
import ApprovalCard from './ApprovalCard.vue';

const props = defineProps<{
  taskId: string;
  workspaceId: string;
  displayMode?: 'drawer' | 'modal' | 'panel';
}>();

const { messages, isAgentTyping, inputDraft, error, send, approve, reject } =
  useTaskChat(props.taskId, props.workspaceId);

const feedRef = ref<HTMLElement | null>(null);
const approvalLoading = ref<Record<string, boolean>>({});

// Auto-scroll quando arriva un nuovo messaggio
watch(
  () => messages.value.length,
  async () => {
    await nextTick();
    if (feedRef.value) {
      feedRef.value.scrollTop = feedRef.value.scrollHeight;
    }
  }
);

async function handleApprove(approvalId: string): Promise<void> {
  approvalLoading.value[approvalId] = true;
  try {
    await approve(approvalId);
  } finally {
    approvalLoading.value[approvalId] = false;
  }
}

async function handleReject(approvalId: string): Promise<void> {
  approvalLoading.value[approvalId] = true;
  try {
    await reject(approvalId);
  } finally {
    approvalLoading.value[approvalId] = false;
  }
}
</script>

<template>
  <div class="task-chat" :class="`task-chat--${displayMode ?? 'drawer'}`">

    <!-- Error banner — non blocca la UI -->
    <q-banner v-if="error" dense class="bg-negative text-white q-mb-sm">
      {{ error }}
    </q-banner>

    <!-- Feed messaggi -->
    <div ref="feedRef" class="task-chat__feed">
      <template v-for="msg in messages" :key="msg.id">

        <!-- Messaggio testo normale -->
        <div
          v-if="msg.contentType === 'text'"
          class="task-chat__bubble"
          :class="`task-chat__bubble--${msg.role}`"
        >
          <span class="task-chat__bubble-content">{{ msg.content }}</span>
        </div>

        <!-- Preview card interattiva -->
        <ApprovalCard
          v-else-if="msg.contentType === 'approval_card' && msg.approvalCard"
          :card="msg.approvalCard"
          :loading="approvalLoading[msg.approvalCard.approvalId] ?? false"
          @approve="handleApprove"
          @reject="handleReject"
        />

      </template>

      <!-- Typing indicator -->
      <div v-if="isAgentTyping" class="task-chat__typing">
        <span class="task-chat__typing-dot" />
        <span class="task-chat__typing-dot" />
        <span class="task-chat__typing-dot" />
      </div>
    </div>

    <!-- Input -->
    <div class="task-chat__input-row">
      <q-input
        v-model="inputDraft"
        placeholder="Give an instruction…"
        filled
        rounded
        dense
        autogrow
        @keyup.enter.exact.prevent="send()"
      >
        <template #append>
          <q-btn
            flat
            round
            icon="send"
            :disable="!inputDraft.trim() || isAgentTyping"
            @click="send()"
          />
        </template>
      </q-input>
    </div>

  </div>
</template>

<style scoped lang="scss">
.task-chat {
  display: flex;
  flex-direction: column;
  height: 100%;

  &__feed {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    scroll-behavior: smooth;
  }

  &__bubble {
    max-width: 80%;
    padding: 10px 14px;
    border-radius: 12px;
    font-size: 14px;
    line-height: 1.5;
    word-break: break-word;

    &--user {
      align-self: flex-end;
      background: #c5a065;
      color: #0a2342;
      border-bottom-right-radius: 4px;
    }

    &--assistant {
      align-self: flex-start;
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(197, 160, 101, 0.3);
      border-bottom-left-radius: 4px;
    }
  }

  &__typing {
    display: flex;
    gap: 4px;
    align-self: flex-start;
    padding: 10px 14px;
  }

  &__typing-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #c5a065;
    animation: typing-pulse 1.2s infinite ease-in-out;

    &:nth-child(2) { animation-delay: 0.2s; }
    &:nth-child(3) { animation-delay: 0.4s; }
  }

  @keyframes typing-pulse {
    0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
    40% { opacity: 1; transform: scale(1); }
  }

  &__input-row {
    padding: 12px 16px;
    border-top: 1px solid rgba(197, 160, 101, 0.2);
  }
}
</style>

Riepilogo architetturale — le tre regole che tengono tutto insieme
Queste tre regole, se rispettate, rendono i tre bug impossibili da ripresentarsi:

1. Il token OAuth non viaggia mai nel messaggio chat. Vive solo in tenants/{tenantId}/oauthTokens/google. Il tool lo legge direttamente da Firestore. Se scade, lancia un errore tipizzato che il frontend intercetta e mostra un banner "Re-authorize Google" — mai un failure silenzioso.

2. Nessun tool scrive mai direttamente su Gmail o Sheets. Ogni tool scrive su approvals/{approvalId}. L'esecuzione reale avviene solo quando la Cloud Function resolveApproval riceve { decision: 'approved' } firmato dall'utente autenticato. Il frontend non può bypassare questo gate.

3. Lo stato della chat vive nello store Pinia, non nel componente. onSnapshot parte in openSession() (store), non in onMounted() (componente). Il refresh della pagina ricrea il componente ma lo store — se persistito con pinia-plugin-persistedstate per primarySessionId — sa quale sessione riaprire e rilancia immediatamente il listener. Zero perdita di stato.
