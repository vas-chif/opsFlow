<!--
  @file WorkspaceAttitudeModal.vue
  @description Editor dialog for dynamic Workspace System Prompt (AI Attitude) in OpsFlow.
  @author Vasile Chifeac
  @created 2026-07-30
-->

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useQuasar } from "quasar";
import { useTaskStore } from "../stores/taskStore";
import type { Workspace } from "../types/models";

const props = defineProps<{
  modelValue: boolean;
  workspace: Workspace | null;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", val: boolean): void;
  (e: "saved"): void;
}>();

const q = useQuasar();
const taskStore = useTaskStore();

const isOpen = computed({
  get: () => props.modelValue,
  set: (val: boolean) => emit("update:modelValue", val),
});

const systemPrompt = ref("");
const isSaving = ref(false);

const presetTemplates = [
  {
    title: "🎯 Commerciale / Lead Scout",
    prompt:
      "Il tuo ruolo è cercare clienti IT, profilare prospect su LinkedIn/Indeed, generare bozze email e gestire gli stati dei contatti (Contattato, Risposta Positiva, Follow-up 30gg).",
  },
  {
    title: "📊 Amministrazione & Fogli",
    prompt:
      "Il tuo ruolo è leggere e scrivere dati su Google Sheets, spostare informazioni tra fogli, riassumere email di sistema e filtrare la spam.",
  },
  {
    title: "🧠 Prompt Optimization Hub",
    prompt:
      "Il tuo ruolo è analizzare i prompt inviati negli altri workspace, rilevare inefficienze o ambiguità e suggerire versioni ottimizzate per ridurre gli errori allo 0%.",
  },
];

watch(
  () => props.workspace,
  (newWs) => {
    if (newWs) {
      systemPrompt.value = newWs.systemPrompt || "";
    }
  },
  { immediate: true },
);

const applyPreset = (presetPrompt: string): void => {
  systemPrompt.value = presetPrompt;
}; /*end applyPreset*/

const handleSave = async (): Promise<void> => {
  if (!props.workspace || isSaving.value) return;

  isSaving.value = true;
  try {
    await taskStore.updateWorkspacePrompt(props.workspace.id, systemPrompt.value);
    q.notify({
      type: "positive",
      message: "Atteggiamento IA del Workspace aggiornato con successo!",
      position: "top",
    });
    emit("saved");
    isOpen.value = false;
  } catch {
    q.notify({
      type: "negative",
      message: "Errore durante il salvataggio dell'atteggiamento Workspace",
      position: "top",
    });
  } finally {
    isSaving.value = false;
  }
}; /*end handleSave*/
</script>

<template>
  <q-dialog v-model="isOpen" persistent backdrop-filter="blur(14px)">
    <q-card style="width: 650px; max-width: 90vw" class="q-pa-md">
      <q-card-section class="row items-center justify-between q-pb-none">
        <div class="row items-center q-gutter-sm">
          <q-icon name="psychology" color="amber-7" size="28px" />
          <div>
            <div class="text-h6 text-weight-bold">Atteggiamento IA Workspace (System Prompt)</div>
            <div class="text-caption text-grey-7">Workspace: {{ workspace?.name }}</div>
          </div>
        </div>
        <q-btn flat round dense icon="close" v-close-popup />
      </q-card-section>

      <q-card-section class="q-pt-md">
        <div class="text-body2 text-grey-8 q-mb-md">
          Definisci il ruolo, il comportamento e le regole specifiche che l'IA adotterà quando opera
          all'interno di questo Workspace.
        </div>

        <!-- Preset Buttons -->
        <div class="q-mb-md">
          <div class="text-caption text-weight-bold text-grey-7 q-mb-xs">Template Rapidi:</div>
          <div class="row q-gutter-xs">
            <q-btn
              v-for="tpl in presetTemplates"
              :key="tpl.title"
              dense
              outline
              size="sm"
              color="primary"
              :label="tpl.title"
              @click="applyPreset(tpl.prompt)"
            />
          </div>
        </div>

        <q-input
          v-model="systemPrompt"
          type="textarea"
          rows="6"
          outlined
          placeholder="Es: Il tuo ruolo è cercare clienti IT, profilare prospect e preparare bozze email su Gmail..."
        />
      </q-card-section>

      <q-card-actions align="right">
        <q-btn flat label="Annulla" v-close-popup />
        <q-btn
          color="primary"
          label="Salva Atteggiamento"
          :loading="isSaving"
          @click="handleSave"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>
