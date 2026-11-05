// Entry point for Vercel's Express support: exports the configured app.
// Locally, use `npm start` (server/index.js), which also calls listen().
import { createApp } from './server/index.js';

const app = await createApp();
export default app;
