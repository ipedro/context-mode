#!/usr/bin/env node
/**
 * Gemini CLI SessionStart hook
 * Injects context-mode routing block as additional context.
 */

import { readStdin } from "../core/stdin.mjs";
import { ROUTING_BLOCK } from "../routing-block.mjs";

const raw = await readStdin();
const input = JSON.parse(raw);

// Inject routing block as additional context
const context = `SessionStart:compact hook success: Success\nSessionStart hook additional context: \n${ROUTING_BLOCK}`;
process.stdout.write(context);
