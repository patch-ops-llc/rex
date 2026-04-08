export { compileWalkthrough, type CompileWalkthroughOptions } from "./narration/walkthrough-compiler";
export { generateNarration, generateWalkthroughTitle, type NarratedStep } from "./narration/narrator";
export {
  groupStepsByCategory,
  buildNarrationPrompt,
  extractPlanContextForCategory,
  type WalkthroughContext,
  type WalkthroughStepInput,
} from "./narration/context-assembler";

// Capture module (Playwright) is NOT re-exported from the main entry
// to avoid bundling Playwright into the Next.js webpack build.
// Import directly: import { ... } from "@rex/enablement/capture"
