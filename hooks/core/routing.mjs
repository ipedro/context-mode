/**
 * Pure routing logic for PreToolUse hooks.
 * Returns NORMALIZED decision objects (NOT platform-specific format).
 *
 * Decision types:
 * - { action: "deny", reason: string }
 * - { action: "ask" }
 * - { action: "modify", updatedInput: object }
 * - { action: "context", additionalContext: string }
 * - null (passthrough)
 */

import { ROUTING_BLOCK, READ_GUIDANCE, GREP_GUIDANCE } from "../routing-block.mjs";

// Try to import security module — may not exist
let security = null;

export async function initSecurity(buildDir) {
  try {
    const { pathToFileURL } = await import("node:url");
    const secPath = (await import("node:path")).resolve(buildDir, "security.js");
    security = await import(pathToFileURL(secPath).href);
  } catch { /* not available */ }
}

/**
 * Route a PreToolUse event. Returns normalized decision object or null for passthrough.
 */
export function routePreToolUse(toolName, toolInput, projectDir) {
  // ─── Bash: Stage 1 security check, then Stage 2 routing ───
  if (toolName === "Bash") {
    const command = toolInput.command ?? "";

    // Stage 1: Security check against user's deny/allow patterns.
    // Only act when an explicit pattern matched. When no pattern matches,
    // evaluateCommand returns { decision: "ask" } with no matchedPattern —
    // in that case fall through so other hooks and the platform's native engine can decide.
    if (security) {
      const policies = security.readBashPolicies(projectDir);
      if (policies.length > 0) {
        const result = security.evaluateCommand(command, policies);
        if (result.decision === "deny") {
          return { action: "deny", reason: `Blocked by security policy: matches deny pattern ${result.matchedPattern}` };
        }
        if (result.decision === "ask" && result.matchedPattern) {
          return { action: "ask" };
        }
        // "allow" or no match → fall through to Stage 2
      }
    }

    // Stage 2: Context-mode routing (existing behavior)

    // curl/wget → replace with echo redirect
    if (/(^|\s|&&|\||\;)(curl|wget)\s/i.test(command)) {
      return {
        action: "modify",
        updatedInput: {
          command: 'echo "context-mode: curl/wget blocked. You MUST use mcp__plugin_context-mode_context-mode__fetch_and_index(url, source) to fetch URLs, or mcp__plugin_context-mode_context-mode__execute(language, code) to run HTTP calls in sandbox. Do NOT retry with curl/wget."',
        },
      };
    }

    // inline fetch (node -e, python -c, etc.) → replace with echo redirect
    if (
      /fetch\s*\(\s*['"](https?:\/\/|http)/i.test(command) ||
      /requests\.(get|post|put)\s*\(/i.test(command) ||
      /http\.(get|request)\s*\(/i.test(command)
    ) {
      return {
        action: "modify",
        updatedInput: {
          command: 'echo "context-mode: Inline HTTP blocked. Use mcp__plugin_context-mode_context-mode__execute(language, code) to run HTTP calls in sandbox, or mcp__plugin_context-mode_context-mode__fetch_and_index(url, source) for web pages. Do NOT retry with Bash."',
        },
      };
    }

    // allow all other Bash commands
    return null;
  }

  // ─── Read: nudge toward execute_file ───
  if (toolName === "Read") {
    return { action: "context", additionalContext: READ_GUIDANCE };
  }

  // ─── Grep: nudge toward execute ───
  if (toolName === "Grep") {
    return { action: "context", additionalContext: GREP_GUIDANCE };
  }

  // ─── WebFetch: deny + redirect to sandbox ───
  if (toolName === "WebFetch") {
    const url = toolInput.url ?? "";
    return {
      action: "deny",
      reason: `context-mode: WebFetch blocked. Use mcp__plugin_context-mode_context-mode__fetch_and_index(url: "${url}", source: "...") to fetch this URL in sandbox. Then use mcp__plugin_context-mode_context-mode__search(queries: [...]) to query results. Do NOT use curl/wget — they are also blocked.`,
    };
  }

  // ─── Task: inject context-mode routing into subagent prompts ───
  if (toolName === "Task") {
    const subagentType = toolInput.subagent_type ?? "";
    const prompt = toolInput.prompt ?? "";

    const updatedInput =
      subagentType === "Bash"
        ? { ...toolInput, prompt: prompt + ROUTING_BLOCK, subagent_type: "general-purpose" }
        : { ...toolInput, prompt: prompt + ROUTING_BLOCK };

    return { action: "modify", updatedInput };
  }

  // ─── MCP execute: security check for shell commands ───
  if (toolName.includes("context-mode") && toolName.endsWith("__execute")) {
    if (security && toolInput.language === "shell") {
      const code = toolInput.code ?? "";
      const policies = security.readBashPolicies(projectDir);
      if (policies.length > 0) {
        const result = security.evaluateCommand(code, policies);
        if (result.decision === "deny") {
          return { action: "deny", reason: `Blocked by security policy: shell code matches deny pattern ${result.matchedPattern}` };
        }
        if (result.decision === "ask" && result.matchedPattern) {
          return { action: "ask" };
        }
      }
    }
    return null;
  }

  // ─── MCP execute_file: check file path + code against deny patterns ───
  if (toolName.includes("context-mode") && toolName.endsWith("__execute_file")) {
    if (security) {
      // Check file path against Read deny patterns
      const filePath = toolInput.path ?? "";
      const denyGlobs = security.readToolDenyPatterns("Read", projectDir);
      const evalResult = security.evaluateFilePath(filePath, denyGlobs);
      if (evalResult.denied) {
        return { action: "deny", reason: `Blocked by security policy: file path matches Read deny pattern ${evalResult.matchedPattern}` };
      }

      // Check code parameter against Bash deny patterns (same as execute)
      const lang = toolInput.language ?? "";
      const code = toolInput.code ?? "";
      if (lang === "shell") {
        const policies = security.readBashPolicies(projectDir);
        if (policies.length > 0) {
          const result = security.evaluateCommand(code, policies);
          if (result.decision === "deny") {
            return { action: "deny", reason: `Blocked by security policy: shell code matches deny pattern ${result.matchedPattern}` };
          }
          if (result.decision === "ask" && result.matchedPattern) {
            return { action: "ask" };
          }
        }
      }
    }
    return null;
  }

  // ─── MCP batch_execute: check each command individually ───
  if (toolName.includes("context-mode") && toolName.endsWith("__batch_execute")) {
    if (security) {
      const commands = toolInput.commands ?? [];
      const policies = security.readBashPolicies(projectDir);
      if (policies.length > 0) {
        for (const entry of commands) {
          const cmd = entry.command ?? "";
          const result = security.evaluateCommand(cmd, policies);
          if (result.decision === "deny") {
            return { action: "deny", reason: `Blocked by security policy: batch command "${entry.label ?? cmd}" matches deny pattern ${result.matchedPattern}` };
          }
          if (result.decision === "ask" && result.matchedPattern) {
            return { action: "ask" };
          }
        }
      }
    }
    return null;
  }

  // Unknown tool — pass through
  return null;
}
