#!/usr/bin/env node
/**
 * Gemini CLI PreCompress hook — advisory only (async, cannot block)
 */

import { readStdin } from "../core/stdin.mjs";

const raw = await readStdin();
// Advisory — no stdout output needed
