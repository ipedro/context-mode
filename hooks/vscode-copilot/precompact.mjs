#!/usr/bin/env node
/**
 * VS Code Copilot PreCompact hook — advisory only
 */

import { readStdin } from "../core/stdin.mjs";

const raw = await readStdin();
// Advisory — no stdout output needed
