# Desk Assistant

A local Windows chat app with project workspaces, document retrieval, public web research and a bounded multi-step agent. Inference and embeddings run on the CPU; no cloud inference endpoint is used.

## Run from this repository

The models and dependencies are already present on this computer. Open a terminal in this folder and run:

```powershell
npm run dev
```

This launches the desktop app directly from source, watches `src/` and restarts after edits. It keeps a separate, persistent development profile in `.dev-data/`, so chats and project files survive restarts. Ctrl+C stops the watcher and app. No installation or executable rebuild is needed. `npm start` also runs from source, without watching, using the normal application profile.

For a fresh checkout, use Node.js 22 or newer on Windows:

```powershell
npm ci
npm run assets
npm run assets:embeddings
npm run dev
```

Asset downloads happen only during developer setup. Runtime/model revisions and checksums are pinned in the two manifests under `assets/`. Large binaries, private profiles, test data and build output are excluded from Git. No remote Git repository is configured automatically.

Previous installer EXEs, blockmaps and ZIPs have been removed. No replacement installer was generated for this update. An older `dist/win-unpacked` development artifact may remain; run source to test current behavior. Packaging is an explicit, separate action with `npm run build` when requested.

## Using the app

The left sidebar groups conversations beneath expandable project rows. Use the + beside Projects to create a project, the + on a project row to create a conversation in it, or New conversation to use the active project. Long lists have Show more. Each project has separate files, notes and conversations. The right-hand drawer is a dedicated file preview. Use its search icon (Ctrl+P) to filter project files in a modal; opening a result only previews it and never submits a chat request. **Use in chat** explicitly adds or removes that file from retrieval context. With no files selected, the active project's library is available. The + icon imports PDF, Word, text, Markdown and CSV; notes are read-only until you choose Edit note. Drag the divider to resize, drag toward the right edge to collapse, or use the collapse button. Width and open state are remembered. The focused divider also supports left/right arrows and Enter to collapse. Web references are saved per conversation and can be previewed in the same pane.

You can also drag up to 20 documents from File Explorer onto the middle chat pane. A drop indicator appears, supported files are imported and indexed locally, and successfully imported files are selected as context for the current conversation. Attached files appear as cards above the message box, showing their names and file types. Click a card to preview it in the right drawer; its × button removes it from conversation context without deleting the project file. Cards show an Adding status during import. On Send, attachment names and IDs are saved on the user message, cards appear above that sent message, and the composer clears. Files remain available as retrieval context for follow-ups without repeating the cards in every draft. Sent cards survive restarts and can still open the project file; if a file is deleted, its original attachment name remains in history. Dropping never submits the draft or starts a chat response. Existing imports are deduplicated; invalid files report individual errors.

Ask naturally. There is no web selector or manual search box. The router executes public searches for explicit research, current information, verification/compliance questions and research follow-ups. Summaries and extraction of uploaded documents normally stay local. Say **“Use only project files”** to prevent new network requests for that request. Previously saved public evidence may still be used.

For document-related research, the app first retrieves relevant passages, asks the local model for a generic public topic and checks the query for known identifiers. Regulation and jurisdiction fields must be grounded in the request or retrieved document. The activity timeline shows routing, retrieval, the exact outgoing query, page reads, compaction and response generation. These are execution events, not hidden model reasoning.

Documents and conversation text are not uploaded wholesale. Public search queries, including topics derived from documents, do leave the machine. Identifier filtering reduces accidental disclosure but cannot recognize every confidential concept. Web search uses a public HTML endpoint and can be rate-limited or blocked; unreadable pages are clearly identified as snippets.

Chat search is an icon above New conversation (Ctrl+K). The modal searches both titles and messages within the active project. Arrow keys, Enter, Escape and focus restoration are supported for both search dialogs.

The interface uses locally bundled [shadcn/ui](https://ui.shadcn.com/docs/components/radix/dialog) Button, Input and Dialog components with Radix focus management and Lucide icons. Source components live in `src/ui/components/`, with their MIT license. React is used for these UI controls; the existing chat workflow remains behind the restricted IPC bridge. `npm run ui:build` compiles the local renderer using esbuild and Tailwind, and source launches rebuild it automatically. Generated assets are in `.renderer/`, excluded from Git. No remote UI resources are loaded.

## Shared project history

Other conversations in the same project are available by default. For each request, the app searches original completed messages using BM25 and includes a small recent-history fallback. Up to six excerpts are locally token-bounded and passed as attributed evidence, with conversation title, message role, timestamp and IDs. This evidence participates in the existing context budget and can be inspected in the response sources. The original transcripts remain intact. This is relevant-history retrieval, not an unlimited copy of every conversation into each prompt. Assistant statements are labeled as potentially mistaken, and conflicting historical facts should be reported. Project history is never used to generate outgoing public-search queries. Other projects and deleted threads are excluded from fresh retrieval. There is no personalization toggle yet.

## Retrieval and context

The retrieval pipeline is local hybrid RAG:

1. Extract text into overlapping passages (PDF page numbers retained).
2. Encode passages with quantized MiniLM-L6-v2, a roughly 23 MB local ONNX model producing normalized 384-dimensional vectors.
3. Rank project-scoped candidates using BM25 keyword relevance and cosine semantic similarity.
4. Combine the two rankings with reciprocal rank fusion, remove identical passages and select diverse evidence with maximal marginal relevance.
5. Let the local agent perform up to three further search/read actions, then answer with source excerpts.

BM25 preserves exact names, terminology and standard numbers; embeddings retrieve paraphrases; diversity selection reduces redundant context. The index is persisted locally in JSON and searched in memory. This deliberately avoids a database server or costly cross-encoder on modest hardware. It is suitable for a modest project collection; very large corpora will need a disk-backed vector index. Retrieval does not guarantee exhaustive document coverage.

The 8,192-token model window is measured with llama.cpp's chat template and actual tokenizer. Each final prompt reserves 1,000 output tokens plus a 256-token safety margin. When the assembled prompt would exceed that input budget, older turns are summarized locally in bounded batches until usage approaches 62% of capacity, leaving room for subsequent turns. Memory preserves goals, preferences, facts, source IDs, decisions and open tasks; the latest exchange stays exact when space allows. Lower-ranked evidence is dropped and unusually large recent turns are shortened only if still necessary. Original messages remain on disk. Compaction is lossy, but it is automatic and no longer based on an arbitrary message count.

```mermaid
flowchart LR
    UI[Desktop chat and project file pane] --> IPC[Restricted IPC]
    IPC --> STORE[Project and thread persistence]
    STORE --> ROUTE[Intent router]
    ROUTE --> RAG[Local hybrid retrieval]
    RAG --> QUERY[Local public-topic abstraction and guards]
    QUERY --> WEB[Optional public search and page reads]
    RAG --> AGENT[Bounded research agent]
    WEB --> AGENT
    AGENT --> BUDGET[Tokenizer budget and automatic compaction]
    BUDGET --> MODEL[Local Qwen model]
    MODEL --> SAVE[Stream and persist answer with sources]
    SAVE --> UI
```

```mermaid
flowchart TD
    PROFILE[Local application profile] --> THREADS[threads.json: projects, conversations, drafts, memory]
    PROFILE --> PROJECTS[projects / project ID / library]
    PROJECTS --> FILES[Managed originals and editable notes]
    PROJECTS --> INDEX[Extracted passages and embedding vectors]
    ASSETS[Bundled local assets] --> QWEN[Qwen2.5 1.5B Q4 and llama.cpp CPU]
    ASSETS --> MINI[Quantized MiniLM embedding model]
```

## Persistence and boundaries

Normal application data lives in Electron's per-user application directory, typically `%APPDATA%/desk-assistant`. Source watch mode uses `.dev-data/`. Schema 3 migrates existing chats and libraries into **My project**, preserving legacy library data and a schema-2 thread backup. Threads retain full messages, drafts, selected files, sources, execution activities and memory. Interrupted work is marked on restart rather than silently re-executed.

Original imported files are copied into the project. Deleting an import removes its managed copy and index, but existing chat excerpts remain. Storage is local plaintext, not app-level encrypted; OS backup/sync policies still apply.

The sandboxed renderer has no Node access or direct network access. The authenticated inference server binds only to loopback. Web fetches enforce HTTPS, reject private addresses, pin resolved addresses and revalidate redirects; remote pages are parsed as text. The agent cannot execute commands or arbitrarily write files. Project notes are edited through the user interface.

## Validation

```powershell
npm test
node scripts/smoke-retrieval.cjs
node scripts/smoke-context.cjs
node scripts/smoke-ui.cjs
node scripts/smoke-drop.cjs
node scripts/smoke-projects.cjs
```

Unit tests cover migration, project/thread isolation, notes, formats, retrieval ranking, query guards, routing, compaction budgeting, action failures, cancellation and streaming. The smoke scripts exercise the real local embedding model, local LLM, and Electron UI using isolated `.test-data/` profiles. The UI smoke uses live public research, so network availability affects that check. `scripts/smoke-package.cjs` is reserved for a future freshly built package.

## Limits

Target: Windows 10/11 x64 CPU. An 8 GB RAM computer with several GB free disk space is a provisional starting point, not a measured minimum. The small 1.5B model favors lower resource use over reasoning accuracy. Performance and quality still need testing on the intended computer. Scanned PDFs need OCR before import; legacy `.doc` and image OCR are not supported. Imports are limited to 40 MB. The router is deterministic, so unusual language may need rephrasing. This is a research assistant, not an automated compliance determination.
