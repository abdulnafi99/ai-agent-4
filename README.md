# NAFI AI OFFICE

**A living 3D office where five AI agents work as a company.**

NAFI AI OFFICE is an interactive 3D workspace built with Three.js. Five AI employees (a CEO, a Research specialist, a Lead Developer, a Social Media specialist and a Cyber Security specialist) each run on their own system prompt. They talk to each other through a shared message bus, hand each other tasks through a central task queue, meet in a glass meeting room and report back to you. Their 3D avatars show what they are actually doing: typing while they work, thinking, walking between departments, sitting in meetings, celebrating when they finish and showing a warning when something fails.

## Live deployment

Production runs on Vercel at https://nafi-ai-office-app.vercel.app. It's protected by Vercel Authentication and the owner access key. Pushes to `main` deploy automatically. See [Deploying](#deploying) for the limits of running on Vercel.

## Quick start

```bash
npm install
cp .env.example .env       # add ANTHROPIC_API_KEY for real AI agents
npm start                  # http://localhost:8080
```

You need Node 18.17 or newer.

Without an AI key the office runs in **Demo mode**. The agents still go through the same message bus, task queue and delegation chain, but their replies come from templates. The UI shows a "DEMO MODE" badge so this is never mistaken for real inference. Add `ANTHROPIC_API_KEY` (or `OPENAI_API_KEY` / `GEMINI_API_KEY`) to switch to live inference.

Try these instructions in the CEO command bar:

- `CEO, create a new website project for a Malaysian café.`
- `CEO, ask Research to analyse the Malaysian web application market.`
- `CEO, call a team meeting about our launch plan.`

## How the agents work

```
Owner ──instruction──▶ CEO inbox
                         │  inference (CEO system prompt + workspace state)
                         ▼
             JSON actions: create_project, assign_task, message, call_meeting, request_approval …
                         │
          ┌──────────────┼───────────────┐
          ▼              ▼               ▼
   Research inbox   Development inbox  Social inbox        (task queue + message bus)
          │ inference with its own system prompt
          ▼
   complete_task ──▶ document filed + report message ──▶ CEO inbox ──▶ next delegation …
```

- **Separate agents:** each agent has its own identity, responsibilities and system prompt (`server/agents/definitions.js`), and the owner can add extra instructions or a model override per agent in Settings.
- **Real AI-to-AI communication:** an agent turn is one inference call. The agent's prompt contains the current workspace state (team status, projects, its open tasks, work it delegated, recent conversation) plus the new events in its inbox. The model answers with structured JSON actions (`server/agents/definitions.js` → `RESPONSE_SCHEMA`). Claude uses structured outputs, so its replies always match the schema.
- **Actions:** `message`, `assign_task`, `progress`, `complete_task`, `fail_task`, `request_help`, `escalate`, plus CEO-only `create_project`, `complete_project`, `call_meeting` and `request_approval`.
- **Task queue:** tasks have a status (`queued → in_progress → completed / failed / cancelled`), a progress value, the person who assigned them and the person doing them. When a task is completed, the deliverable is saved as a document and sent back to whoever assigned it, which wakes that agent up.
- **Meetings:** participants walk to the meeting room and speak in turns for two rounds, each seeing the transcript so far. The CEO then closes the meeting with a summary and follow-up tasks, and the minutes are saved as a document.
- **Approvals:** the CEO can ask you to approve a decision. Your answer is delivered to the CEO as a message.
- **Persistent history:** messages, tasks, projects, meetings, documents, approvals and the activity log are all stored, in a local JSON file by default or in Firestore. Tasks that were interrupted by a restart pick up again when the server comes back.
- **Safety rails:** `MAX_TURNS_PER_CHAIN` caps how many agent turns one instruction can trigger, so agents can't loop forever. `MAX_CONCURRENT_AGENTS` limits how many inference calls run at once. Failed turns are retried with backoff, and after three failures in a row you are told.

## The 3D office

- Six spaces: the CEO executive office, a glass meeting room, the Security Operations Centre, the Research lab, the Development studio and the Creative (social media) studio, plus a lobby, a lounge corridor and an animated elevator.
- Glass sliding doors open when someone walks up to them. The low south and east walls are cut away so you can see inside, as in The Sims.
- Computer screens are drawn live: code for Development, charts for Research, a social feed for Social Media, a dashboard for the CEO. When an agent is idle, its screen shows a screensaver.
- Day and night lighting can follow your local time or be set to day, night or a continuous cycle.
- Speech bubbles show real messages, thought bubbles show what the agent is currently thinking, and glowing orbs fly between agents when a message, task or report is sent.
- Idle agents sometimes wander to the coffee bar, water cooler, reception or windows.

**Interactions:** click a character to open their profile, a desk for their tasks, a computer screen for their workspace and documents, the meeting room to start a meeting, or a department floor to fly the camera there. To move the camera, drag to orbit, scroll or pinch to zoom, and use WASD or the arrow keys to pan.

**Navigation:** Office, Agents, Task Manager, Communication, Projects, Analytics and Settings. The CEO Command Center is always on screen. It shows the CEO instruction bar, agents online, active tasks, completed projects, pending approvals, current meetings and a live feed of agent conversations.

## Devices and performance

Rendering quality is detected automatically. Phones and low-memory devices get **low** (no shadows, pixel ratio 1, fewer decorative meshes, screens redrawn less often). Tablets and iPad get **medium**, and desktops get **high**. If the frame rate drops below about 26 fps, the renderer switches itself to a lighter mode. You can also change the quality by hand in Settings.

All geometry and textures are generated in code, so there are no model files to download. Three.js is served from the app's own `node_modules`, so no CDN is needed. The layout works on Android phones, Android tablets, iPad and desktop. On phones the side panel becomes a bottom sheet.

## Configuration

See `.env.example` for every option.

| Area | Options |
|---|---|
| AI provider | `ANTHROPIC_API_KEY` (default model `claude-opus-5-5`, with server-side refusal fallback), `OPENAI_API_KEY` (default `gpt-5-mini`, + `OPENAI_BASE_URL` for any OpenAI-compatible endpoint), `GEMINI_API_KEY` (default `gemini-2.5-flash`) |
| Per-agent AI | Each agent can use a different provider: `AGENT_PROVIDER_RESEARCH=gemini`, `AGENT_PROVIDER_SOCIAL=openai`, `AGENT_PROVIDER_SECURITY=…`, and so on, or choose it in Settings. Agents without one use the default provider. `AGENT_MODEL_*` overrides the model. |
| Storage | `STORAGE=file` (default, `data/office.json`) or `STORAGE=firestore` with `FIREBASE_SERVICE_ACCOUNT` |
| Auth | Firebase Authentication (`FIREBASE_WEB_CONFIG` + `OWNER_EMAILS`, with ID tokens verified on the server), or a shared `OWNER_ACCESS_KEY`. With neither set, the office is open, which is for local development only. |

**Security:** AI provider keys are read only by the server and are never sent to the browser. Browsers never talk to Firestore directly: `firestore.rules` denies all client access, and the server uses `firebase-admin`. All model output is HTML-escaped before it is rendered. The live event stream (Server-Sent Events) passes the auth token as a query parameter, because `EventSource` cannot set headers, so serve the app over HTTPS in production.

## Deploying

- **Vercel:** the repository deploys as-is (Express preset). Set `OWNER_ACCESS_KEY` and, for real AI, `ANTHROPIC_API_KEY` in the project's environment variables. Vercel runs the app as a function it can pause or recycle, so history in `/tmp` isn't durable (use `STORAGE=firestore`), and agents only keep working while someone has the page open.
- **Any Node host / Cloud Run:** `docker build -t nafi-office . && docker run -p 8080:8080 --env-file .env nafi-office`
- **Firestore:** create a Firebase project, enable Firestore and Authentication, download a service-account key, set `STORAGE=firestore`, `FIREBASE_SERVICE_ACCOUNT`, `FIREBASE_WEB_CONFIG` and `OWNER_EMAILS`, then run `firebase deploy --only firestore:rules`.

## Project structure

```
server/
  index.js              HTTP API, static files, SSE live stream
  config.js             environment configuration
  auth.js               Firebase ID-token / owner-key authentication
  store.js              persistent store (JSON file or Firestore)
  agents/definitions.js the five agents, shared protocol, JSON schema
  agents/engine.js      inboxes, task manager, delegation, meetings, approvals
  ai/providers.js       Anthropic (Claude), OpenAI, Gemini adapters
  ai/demo.js            offline demo responder (no key configured)
public/
  index.html, css/style.css
  js/main.js            bootstrap, auth, wiring
  js/api.js, state.js   REST + SSE client, live state mirror
  js/world/             Three.js world: office, characters, textures, director
  js/ui/                panels, command center, markdown renderer
scripts/smoke.js        end-to-end delegation test (demo mode)
```

## Checks

```bash
npm run check   # syntax check + full owner → CEO → Research → Dev → Social → project-complete run in demo mode
```

## API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/config` | Public config (provider, auth mode) |
| GET | `/api/state` | Full workspace snapshot |
| GET | `/api/stream` | Live updates (SSE) |
| POST | `/api/command` | `{text}`: instruction to the CEO |
| POST | `/api/agents/:id/message` | `{text}`: message any agent directly |
| POST | `/api/tasks` | `{to,title,description}`: assign a task directly |
| POST | `/api/tasks/:id/cancel` | Cancel a task |
| POST | `/api/meetings` | `{topic,participants}`: start a meeting |
| POST | `/api/approvals/:id` | `{decision:"approve"\|"reject",note}` |
| PUT | `/api/settings` | Pause/resume, stand-up interval, per-agent model/effort/instructions |
| GET | `/api/documents/:id` | A full deliverable or set of meeting minutes |
| POST | `/api/reset` | Delete all workspace history |
