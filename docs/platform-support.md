# Platform Support Matrix

This document provides a comprehensive comparison of all platforms supported by context-mode, including their hook paradigms, capabilities, configuration, and known limitations.

## Overview

context-mode supports five platforms across three hook paradigms:

| Paradigm | Platforms |
|----------|-----------|
| **JSON stdin/stdout** | Claude Code, Gemini CLI, VS Code Copilot |
| **TS Plugin** | OpenCode |
| **MCP-only** | Codex CLI |

The MCP server layer is 100% portable and needs no adapter. Only the hook layer requires platform-specific adapters.

---

## Main Comparison Table

| Feature | Claude Code | Gemini CLI | OpenCode | Codex CLI | VS Code Copilot |
|---------|-------------|------------|----------|-----------|-----------------|
| **Paradigm** | json-stdio | json-stdio | ts-plugin | mcp-only | json-stdio |
| **PreToolUse equivalent** | `PreToolUse` | `BeforeTool` | `tool.execute.before` | -- | `PreToolUse` |
| **PostToolUse equivalent** | `PostToolUse` | `AfterTool` | `tool.execute.after` | -- | `PostToolUse` |
| **PreCompact equivalent** | `PreCompact` | `PreCompress` | `experimental.session.compacting` | -- | `PreCompact` |
| **SessionStart** | `SessionStart` | `SessionStart` | -- | -- | `SessionStart` |
| **Can modify args** | Yes | Yes | Yes | -- | Yes |
| **Can modify output** | Yes | Yes | Yes (caveat) | -- | Yes |
| **Can inject session context** | Yes | Yes | -- | -- | Yes |
| **Can block tools** | Yes | Yes | Yes (throw) | -- | Yes |
| **Config location** | `~/.claude/settings.json` | `~/.gemini/settings.json` | `opencode.json` | `~/.codex/config.toml` | `.github/hooks/*.json` |
| **Session ID field** | `session_id` | `session_id` | `sessionID` (camelCase) | N/A | `sessionId` (camelCase) |
| **Project dir env** | `CLAUDE_PROJECT_DIR` | `GEMINI_PROJECT_DIR` | `ctx.directory` (plugin init) | N/A | `CLAUDE_PROJECT_DIR` |
| **MCP tool naming** | `mcp__server__tool` | `mcp__server__tool` | `mcp__server__tool` | `mcp__server__tool` | `f1e_` prefix |
| **Hook registration** | settings.json hooks object | settings.json hooks object | opencode.json plugin array | N/A | .github/hooks/*.json |
| **Plugin distribution** | Claude plugin registry | Extension cache | npm package | N/A | VS Code Marketplace |
| **Session dir** | `~/.claude/context-mode/sessions/` | `~/.gemini/context-mode/sessions/` | `~/.config/opencode/context-mode/sessions/` | `~/.codex/context-mode/sessions/` | `.github/context-mode/sessions/` or `~/.vscode/context-mode/sessions/` |

### Legend

- Yes = Fully supported
- -- = Not supported
- (caveat) = Supported with known issues

---

## Platform Details

### Claude Code

**Status:** Fully supported (primary platform)

**Hook Paradigm:** JSON stdin/stdout

Claude Code is the primary platform for context-mode. All hooks communicate via JSON on stdin/stdout. The adapter reads raw JSON input, normalizes it into platform-agnostic events, and formats responses back into Claude Code's expected output format.

**Hook Names:**
- `PreToolUse` -- fires before a tool is executed
- `PostToolUse` -- fires after a tool completes
- `PreCompact` -- fires before context compaction
- `SessionStart` -- fires when a session starts, resumes, or compacts
- `UserPromptSubmit` -- fires when user submits a prompt

**Blocking:** `permissionDecision: "deny"` in response JSON

**Arg Modification:** `updatedInput` field at top level of response

**Output Modification:** `updatedMCPToolOutput` for MCP tools, `additionalContext` for appending

**Session ID Extraction Priority:**
1. UUID from `transcript_path` field
2. `session_id` field
3. `CLAUDE_SESSION_ID` environment variable
4. Parent process ID fallback

**Known Issues:** None significant.

---

### Gemini CLI

**Status:** Fully supported

**Hook Paradigm:** JSON stdin/stdout

Gemini CLI uses the same JSON stdin/stdout paradigm as Claude Code but with different hook names and response format.

**Hook Names:**
- `BeforeTool` -- equivalent to PreToolUse
- `AfterTool` -- equivalent to PostToolUse
- `PreCompress` -- equivalent to PreCompact (advisory only, async, cannot block)
- `SessionStart` -- fires when a session starts

**Blocking:** `decision: "deny"` in response (NOT `permissionDecision`)

**Arg Modification:** `hookSpecificOutput.tool_input` (merged with original, not `updatedInput`)

**Output Modification:** `decision: "deny"` + `reason` replaces output; `hookSpecificOutput.additionalContext` appends

**Environment Variables:**
- `GEMINI_PROJECT_DIR` -- primary project directory
- `CLAUDE_PROJECT_DIR` -- alias (also works)

**Known Issues / Caveats:**
- `PreCompress` is advisory only (async, cannot block)
- No `decision: "ask"` support
- Hooks don't fire for subagents yet

---

### OpenCode

**Status:** Partially supported

**Hook Paradigm:** TS Plugin

OpenCode uses a TypeScript plugin paradigm instead of JSON stdin/stdout. Hooks are registered via the `plugin` array in `opencode.json`.

**Hook Names:**
- `tool.execute.before` -- equivalent to PreToolUse
- `tool.execute.after` -- equivalent to PostToolUse
- `experimental.session.compacting` -- equivalent to PreCompact (experimental)

**Blocking:** `throw Error` in `tool.execute.before` handler

**Arg Modification:** `output.args` mutation

**Output Modification:** `output.output` mutation (TUI bug for bash, see issue #13575)

**Session ID:** `input.sessionID` (camelCase, note the uppercase `ID`)

**Project Directory:** Available via `ctx.directory` in plugin init, not via environment variable

**Configuration:**
- `opencode.json` or `.opencode/opencode.json`
- Plugin registered in the `plugin` array with npm package names

**Known Issues / Caveats:**
- SessionStart is broken (issue #14808, no hook issue #5409)
- Output modification has TUI rendering bug for bash tool (issue #13575)
- `experimental.session.compacting` is marked experimental and may change
- No `canInjectSessionContext` capability

---

### Codex CLI

**Status:** MCP-only (no hooks)

**Hook Paradigm:** MCP-only

Codex CLI does not support hooks. PRs #2904 and #9796 were closed without merge. The only integration path is via MCP servers configured in `config.toml`.

**Configuration:**
- `~/.codex/config.toml` (TOML format, not JSON)
- MCP servers configured in `[mcp_servers]` section

**Capabilities:**
- PreToolUse: --
- PostToolUse: --
- PreCompact: --
- SessionStart: --
- Can modify args: --
- Can modify output: --
- Can inject session context: --

**Known Issues / Caveats:**
- Only `"hook": notify` config for `agent-turn-complete` exists (very limited)
- No plugin system or marketplace
- TOML configuration requires manual editing
- All hook-related parse/format methods throw errors

---

### VS Code Copilot

**Status:** Fully supported (preview)

**Hook Paradigm:** JSON stdin/stdout

VS Code Copilot uses the same JSON stdin/stdout paradigm as Claude Code with PascalCase hook names. It also provides unique hooks for subagent lifecycle.

**Hook Names:**
- `PreToolUse` -- fires before a tool is executed
- `PostToolUse` -- fires after a tool completes
- `PreCompact` -- fires before context compaction
- `SessionStart` -- fires when a session starts
- `Stop` -- fires when agent stops (unique to VS Code)
- `SubagentStart` -- fires when a subagent starts (unique to VS Code)
- `SubagentStop` -- fires when a subagent stops (unique to VS Code)

**Blocking:** `permissionDecision: "deny"` (same as Claude Code)

**Arg Modification:** `updatedInput` inside `hookSpecificOutput` wrapper (NOT flat like Claude Code)
```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "updatedInput": { ... }
  }
}
```

**Output Modification:** `additionalContext` inside `hookSpecificOutput`, or `decision: "block"` + `reason`

**MCP Tool Naming:** Uses `f1e_` prefix (not `mcp__server__tool`)

**Session ID:** `sessionId` (camelCase, not `session_id`)

**Configuration:**
- Primary: `.github/hooks/*.json`
- Also reads: `.claude/settings.json`
- MCP config: `.vscode/mcp.json`

**Environment Detection:**
- `VSCODE_PID` environment variable
- `TERM_PROGRAM=vscode`

**Known Issues / Caveats:**
- Preview status -- API may change without notice
- Matchers are parsed but IGNORED (all hooks fire on all tools)
- Tool input property names use camelCase (`filePath` not `file_path`)
- Response must be wrapped in `hookSpecificOutput` with `hookEventName`

---

## Capability Matrix (Quick Reference)

| Capability | Claude Code | Gemini CLI | OpenCode | Codex CLI | VS Code Copilot |
|-----------|:-----------:|:----------:|:--------:|:---------:|:---------------:|
| PreToolUse | Yes | Yes | Yes | -- | Yes |
| PostToolUse | Yes | Yes | Yes | -- | Yes |
| PreCompact | Yes | Yes | Yes* | -- | Yes |
| SessionStart | Yes | Yes | -- | -- | Yes |
| Modify Args | Yes | Yes | Yes | -- | Yes |
| Modify Output | Yes | Yes | Yes** | -- | Yes |
| Inject Context | Yes | Yes | -- | -- | Yes |
| Block Tools | Yes | Yes | Yes | -- | Yes |
| MCP Support | Yes | Yes | Yes | Yes | Yes |

\* OpenCode `experimental.session.compacting` is experimental
\*\* OpenCode has a TUI rendering bug for bash tool output (#13575)

---

## Hook Response Format Comparison

### Blocking a Tool

| Platform | Response Format |
|----------|----------------|
| Claude Code | `{ "permissionDecision": "deny", "reason": "..." }` |
| Gemini CLI | `{ "decision": "deny", "reason": "..." }` |
| OpenCode | `throw new Error("...")` |
| Codex CLI | N/A |
| VS Code Copilot | `{ "permissionDecision": "deny", "reason": "..." }` |

### Modifying Tool Input

| Platform | Response Format |
|----------|----------------|
| Claude Code | `{ "updatedInput": { ... } }` |
| Gemini CLI | `{ "hookSpecificOutput": { "tool_input": { ... } } }` |
| OpenCode | `{ "args": { ... } }` (mutation) |
| Codex CLI | N/A |
| VS Code Copilot | `{ "hookSpecificOutput": { "hookEventName": "PreToolUse", "updatedInput": { ... } } }` |

### Injecting Additional Context (PostToolUse)

| Platform | Response Format |
|----------|----------------|
| Claude Code | `{ "additionalContext": "..." }` |
| Gemini CLI | `{ "hookSpecificOutput": { "additionalContext": "..." } }` |
| OpenCode | `{ "additionalContext": "..." }` |
| Codex CLI | N/A |
| VS Code Copilot | `{ "hookSpecificOutput": { "hookEventName": "PostToolUse", "additionalContext": "..." } }` |
