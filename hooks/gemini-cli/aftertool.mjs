#!/usr/bin/env node
/**
 * Gemini CLI AfterTool hook — session event capture
 * Thin wrapper around shared session logic.
 * Session capture logic is in the compiled build.
 * For now, passthrough — session events are captured via MCP server.
 */

import { readStdin } from "../core/stdin.mjs";

const raw = await readStdin();
// Silent passthrough — no stdout output
