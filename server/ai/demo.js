// Offline demo provider. Used only when no AI provider key is configured, so
// the office can be explored without credentials. It drives the exact same
// message bus, task queue and action protocol as the real providers, but its
// output is templated — the UI clearly labels the office as "Demo mode".
// Configure ANTHROPIC_API_KEY (or OPENAI_API_KEY / GEMINI_API_KEY) for real inference.

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const A = (type, f = {}) => ({ type, to: '', title: '', content: '', task_id: '', percent: 0, participants: [], ...f });

function topicOf(text) {
  const t = (text || '').replace(/^(ceo|hey|hi|please|aria)[,:\s]+/i, '').replace(/\s+/g, ' ').trim();
  return t.length > 90 ? t.slice(0, 87) + '…' : t || 'the new initiative';
}

const DELIVERABLES = {
  research: (title) => `# Research report: ${title}

*Demo mode — templated content. Connect an AI provider for real analysis.*

## Key findings
1. Demand is growing for mobile-first, lightweight web experiences (estimate; verify with live data).
2. Competitors focus on feature breadth; few optimise for low-bandwidth Android users.
3. Customers value WhatsApp-integrated support and local payment options (FPX, e-wallets).

## Opportunities
- Fast-loading PWA with offline support.
- Bilingual (English/Malay) onboarding.

## Risks
- Crowded market; differentiation must be clear.

## Recommendation
Build a focused PWA MVP and validate with a small launch campaign.`,
  development: (title) => `# Technical proposal: ${title}

*Demo mode — templated content.*

## Architecture
- **Frontend:** HTML5 + vanilla JS PWA (service worker, manifest, offline cache).
- **Backend:** Firebase Auth + Firestore, Cloud Functions for server logic.
- **Hosting:** Firebase Hosting with CDN.

## Milestones
1. Week 1 — design system, auth, data model.
2. Week 2 — core flows and offline sync.
3. Week 3 — QA, Lighthouse > 90, launch.

\`\`\`js
// service worker registration
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');
\`\`\``,
  social: (title) => `# Marketing strategy: ${title}

*Demo mode — templated content.*

## Positioning
"Fast, simple and made for you." — mobile-first, bilingual.

## Channels
Instagram Reels, TikTok, Facebook groups, WhatsApp broadcast.

## 2-week content calendar
| Day | Channel | Content |
|---|---|---|
| 1 | IG/TikTok | Teaser reel |
| 3 | Facebook | Problem/solution post |
| 7 | All | Launch announcement |
| 10 | IG Live | Demo & Q&A |

## Sample captions
- EN: "Your business, now in your pocket. 🚀 #LaunchDay"
- BM: "Urus bisnes anda di hujung jari. 🚀 #PelancaranBaru"`,
  security: (title) => `# Security review: ${title}

*Demo mode — templated content. Connect an AI provider for a real review.*

## Top risks
| Risk | Severity | Fix |
|---|---|---|
| Weak or reused passwords | High | Firebase Auth with email verification; offer Google sign-in |
| Exposed API keys in frontend | High | Keep secrets server-side; use environment variables |
| Unrestricted database rules | High | Firestore rules: deny by default, allow per-user documents only |
| No audit trail | Medium | Log sign-ins and admin actions |

## PDPA checklist
- Privacy notice and consent before collecting personal data.
- Collect only what is needed; set a retention period.
- Encrypt data in transit (HTTPS) and at rest.

## Next steps
Schedule a penetration test by a qualified tester before launch.`,
  ceo: (title) => `# Summary: ${title}\n\n*Demo mode.* Coordinated departments and reviewed outcomes.`,
};

function ceoInbox(ctx) {
  const { events, state } = ctx;
  const actions = [];
  let reply = '';
  let thought = '';
  const project = state.projects[state.projects.length - 1];
  for (const e of events) {
    const m = e.message;
    if (!m) continue;
    if (m.kind === 'report' && m.taskId) {
      const done = m.from;
      const pid = m.projectId || project?.id || '';
      const title = (m.content.match(/"([^"]+)"/) || [])[1] || 'the task';
      if (done === 'research') {
        thought = 'Research is in. Development should propose the technical solution next.';
        reply = 'Excellent findings, Dr. Iman. Passing these to Development now.';
        actions.push(A('assign_task', { to: 'development', title: `Technical proposal based on research`, content: `Review the research on "${title}" and propose a technical solution.\n\nResearch summary:\n${m.content.slice(0, 1500)}` }));
      } else if (done === 'development') {
        thought = 'Technical plan ready. Time for the marketing strategy.';
        reply = 'Solid architecture, Zane. Social Media, you are up.';
        actions.push(A('assign_task', { to: 'social', title: 'Launch marketing strategy', content: `Prepare a launch marketing strategy for this project. Technical approach:\n${m.content.slice(0, 1200)}` }));
      } else if (done === 'security') {
        thought = 'Security review done. Findings go back to Development.';
        reply = 'Thank you, Ashikin. I will make sure Development applies these fixes.';
        actions.push(A('message', { to: 'development', content: `Please apply Security's recommendations:\n${m.content.slice(0, 1200)}` }));
      } else if (done === 'social') {
        thought = 'All departments delivered. Closing the project and briefing the owner.';
        reply = 'Great campaign concept, Maya. Well done, team.';
        if (pid) actions.push(A('complete_project', { task_id: pid, content: 'Research, technical proposal and marketing strategy delivered. Recommend proceeding to MVP build and a soft launch.' }));
        actions.push(A('request_approval', { title: 'Proceed to launch campaign', content: 'All deliverables are ready. Approve to proceed with the launch campaign.' }));
        actions.push(A('message', { to: 'owner', content: 'Project complete: research, technical proposal and marketing strategy are filed under Projects. I have requested your approval to proceed with the launch.' }));
      }
    } else if (m.kind === 'approval') {
      thought = 'Owner made a decision.';
      reply = /APPROVED/.test(m.content) ? 'Thank you. I will instruct the team to proceed.' : 'Understood. We will hold and revise.';
    } else if (m.from === 'owner') {
      const text = m.content;
      const lower = text.toLowerCase();
      const topic = topicOf(text);
      if (/meeting|sync|stand-?up/.test(lower)) {
        thought = 'The owner wants the team aligned. Calling a meeting.';
        reply = 'Calling the team to the meeting room now.';
        actions.push(A('call_meeting', { title: topic, participants: ['research', 'development', 'social', 'security'] }));
      } else if (/secur|cyber|hack|pdpa|privacy|vulnerab|penetration|audit|breach/.test(lower)) {
        thought = 'A security matter for Ashikin.';
        reply = 'Understood. Ashikin, please run a security review.';
        actions.push(A('assign_task', { to: 'security', title: `Security review: ${topic}`, content: text }));
      } else if (/\bresearch|market|analy|competitor|trend/.test(lower) && !/project|website|app/.test(lower)) {
        thought = 'This is a research request.';
        reply = 'Understood. Research Team, please take this on.';
        actions.push(A('assign_task', { to: 'research', title: `Research: ${topic}`, content: text }));
      } else if (/develop|build|code|app|website|pwa/.test(lower) && !/project/.test(lower)) {
        thought = 'A development request.';
        reply = 'On it. Development Team, please handle this.';
        actions.push(A('assign_task', { to: 'development', title: `Build: ${topic}`, content: text }));
      } else if (/social|market(ing)?|campaign|caption|content|brand/.test(lower) && !/project/.test(lower)) {
        thought = 'Marketing request for Social Media.';
        reply = 'Social Media Team, please prepare this.';
        actions.push(A('assign_task', { to: 'social', title: `Campaign: ${topic}`, content: text }));
      } else {
        thought = 'A multi-step initiative. I will open a project and start with research.';
        reply = `Understood. I'm opening a project for "${topic}" and starting with market research.`;
        actions.push(A('create_project', { title: topic, content: text }));
        actions.push(A('assign_task', { to: 'research', title: `Market research: ${topic}`, content: `Investigate the market, competitors and opportunities for: ${text}` }));
      }
    } else if (m.kind === 'escalation' || m.kind === 'help') {
      thought = 'A department needs support.';
      reply = 'Noted. Proceed with reasonable assumptions and flag them in your deliverable.';
    }
  }
  return { thought: thought || 'Reviewing updates.', reply, actions };
}

function workerInbox(ctx) {
  const { events, agentId } = ctx;
  const actions = [];
  let reply = '';
  let thought = 'Reviewing new messages.';
  for (const e of events) {
    if (e.kind === 'task') {
      const t = e.task;
      thought = `Working on "${t.title}".`;
      reply = { research: 'Understood. I will analyse this and prepare a report.', development: 'Got it. Reviewing requirements and drafting the architecture.', social: 'Love it! Drafting the campaign concept now.', security: 'Noted. Starting a threat model and risk review.' }[agentId];
      actions.push(A('progress', { task_id: t.id, percent: 60, content: 'Draft ready, polishing.' }));
      actions.push(A('complete_task', { task_id: t.id, content: DELIVERABLES[agentId](t.title) }));
    } else if (e.message && e.message.from !== 'owner') {
      reply = 'Thanks, noted.';
    } else if (e.message) {
      reply = `Hello! I'm the ${agentId} lead. For coordinated work, please instruct the CEO — but I'm happy to help directly.`;
    }
  }
  return { thought, reply, actions };
}

const MEETING_LINES = {
  ceo: ['Welcome, team. Let us align on priorities and blockers.', 'Good discussion. Let us keep momentum.'],
  research: ['From research: demand is strong for mobile-first experiences; I will keep tracking competitors.', 'I can share a short brief on audience segments by tomorrow.'],
  development: ['Development is on track. I recommend a lightweight PWA on Firebase to move fast.', 'No blockers on my side; I will need final copy from Social Media.'],
  security: ['From security: we must protect customer data from day one; I recommend Firebase Auth and locked-down database rules.', 'I will prepare a PDPA checklist and review the architecture before launch.'],
  social: ['Marketing will focus on short-form video and bilingual captions.', 'I will draft the launch calendar once the feature list is final.'],
};

export async function demoRespond({ context }) {
  await wait(1200 + Math.random() * 1600); // feel like real thinking
  const { mode, agentId } = context;
  if (mode === 'meeting') {
    const n = context.meeting.transcript.filter((x) => x.agentId === agentId).length;
    const lines = MEETING_LINES[agentId];
    return { json: { thought: 'Contributing to the meeting.', reply: lines[Math.min(n, lines.length - 1)], actions: [] }, text: '', model: 'demo', usage: { in: 0, out: 0 } };
  }
  if (mode === 'meeting-summary') {
    return { json: { thought: 'Summarising the meeting.', reply: `Summary of "${context.meeting.topic}": Research continues market tracking, Development proceeds with the PWA plan, Social Media prepares the launch calendar. Next sync tomorrow.`, actions: [] }, text: '', model: 'demo', usage: { in: 0, out: 0 } };
  }
  const json = agentId === 'ceo' ? ceoInbox(context) : workerInbox(context);
  return { json, text: '', model: 'demo', usage: { in: 0, out: 0 } };
}
