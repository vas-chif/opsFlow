# Implementation Plan — OpsFlow V1.0 Core (i18n, Multi-Window UI & Tool Registry)

Implement standard internationalization (`vue-i18n`), multi-session task state management (`taskChatStore.ts` with `Map<string, ChatSession>`), and a standardized Agent Tool Plugin Registry including **Jina AI Reader** (`r.jina.ai`) for free web scraping.

---

## User Review Required

> [!IMPORTANT]
>
> 1. **Fixed UI Language (en-US):** All UI strings (buttons, drawer labels, statuses, dialogs) will be translated into English using `vue-i18n`.
> 2. **Dynamic AI Multilingual Engine:** The system prompt in `promptBuilder.ts` is updated so Gemini auto-detects the user's input language and responds naturally in that same language (e.g. Italian in, Italian out; English in, English out).
> 3. **Tool Registry Plugin Architecture:** All tools (`GmailDraftTool`, `GoogleSheetsTool`, `WebSearchTool`, `JinaReaderTool`) implement a unified `AgentTool` interface contract with Zod validation.

---

## Proposed Changes

### 1. Internationalization (`vue-i18n`)

- Expand [src/i18n/en-US/index.ts](file:///home/chif-vas/projects/opsflow/src/i18n/en-US/index.ts) with full dictionary keys for navigation, workspace actions, task statuses, and dialogs.
- Update [promptBuilder.ts](file:///home/chif-vas/projects/opsflow/opsflow-functions/src/ai/promptBuilder.ts) to include dynamic language matching instructions.

### 2. Multi-Window Task State Management

#### [NEW] [taskChatStore.ts](file:///home/chif-vas/projects/opsflow/src/stores/taskChatStore.ts)

- Implement Pinia store managing `sessions: Map<string, ChatSession>` allowing multiple task chat threads to be open simultaneously without state collisions.

#### [MODIFY] [TaskChatModal.vue](file:///home/chif-vas/projects/opsflow/src/components/TaskChatModal.vue)

- Refactor to connect seamlessly to `taskChatStore`.

### 3. Agent Tool Plugin Registry & Jina AI Reader

#### [MODIFY] [package.json](file:///home/chif-vas/projects/opsflow/package.json)

- Add `zod` dependency.

#### [NEW] [AgentTool.ts](file:///home/chif-vas/projects/opsflow/src/tools/AgentTool.ts)

- Define `AgentTool` interface, `ToolManifest`, `ToolExecutionContext`, and `ToolExecutionResult`.

#### [NEW] [GmailDraftTool.ts](file:///home/chif-vas/projects/opsflow/src/tools/implementations/GmailDraftTool.ts)

- Implement Gmail Draft tool conforming to `AgentTool`.

#### [NEW] [GoogleSheetsTool.ts](file:///home/chif-vas/projects/opsflow/src/tools/implementations/GoogleSheetsTool.ts)

- Implement Google Sheets reader/writer tool.

#### [NEW] [WebSearchTool.ts](file:///home/chif-vas/projects/opsflow/src/tools/implementations/WebSearchTool.ts)

- Implement Serper.dev web search tool.

#### [NEW] [JinaReaderTool.ts](file:///home/chif-vas/projects/opsflow/src/tools/implementations/JinaReaderTool.ts)

- Implement Jina AI Reader (`https://r.jina.ai/URL`) converting any webpage/public profile into clean Markdown at $0 cost.

#### [NEW] [registry.ts](file:///home/chif-vas/projects/opsflow/src/tools/registry.ts)

- Central tool registry offering `getAll()`, `getById()`, and Gemini function declaration generation.

---

## Verification Plan

### Automated Tests

- `yarn --ignore-engines typecheck` (verify 0 TypeScript errors)
- `yarn --ignore-engines lint` (verify 0 oxlint/oxfmt errors and warnings)

### Manual Verification

- Test `TaskChatModal.vue` opening task chat sessions via `taskChatStore`.
- Verify Jina AI Reader tool execution and prompt stacking.
