import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Source of truth for forge task status (the webhook is only an accelerator).
// Cheap when nothing is active: an indexed query returning zero rows.
crons.interval(
  "poll active forge tasks",
  { minutes: 2 },
  internal.generationActions.pollActiveTasks,
  {},
);

// FUTURE (v2): background keyword research populating researchTopics /
// keywordSuggestions, e.g.:
// crons.interval("research keywords", { hours: 24 }, internal.research.runResearch, {});

export default crons;
