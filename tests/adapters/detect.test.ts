import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { detectPlatform, getAdapter } from "../../src/adapters/detect.js";
import { ClaudeCodeAdapter } from "../../src/adapters/claude-code/index.js";
import { GeminiCLIAdapter } from "../../src/adapters/gemini-cli/index.js";
import { OpenCodeAdapter } from "../../src/adapters/opencode/index.js";
import { CodexAdapter } from "../../src/adapters/codex/index.js";
import { VSCodeCopilotAdapter } from "../../src/adapters/vscode-copilot/index.js";

// ─────────────────────────────────────────────────────────
// detectPlatform — env var detection
// ─────────────────────────────────────────────────────────

describe("detectPlatform", () => {
  let savedEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    savedEnv = { ...process.env };
    // Clear all platform-specific env vars to get a clean slate
    delete process.env.CLAUDE_PROJECT_DIR;
    delete process.env.CLAUDE_SESSION_ID;
    delete process.env.GEMINI_PROJECT_DIR;
    delete process.env.GEMINI_SESSION_ID;
    delete process.env.OPENCODE_PROJECT_DIR;
    delete process.env.OPENCODE_SESSION_ID;
    delete process.env.GITHUB_COPILOT_AGENT;
    delete process.env.COPILOT_SESSION_ID;
    delete process.env.VSCODE_PID;
    delete process.env.VSCODE_CWD;
    delete process.env.CURSOR_SESSION_ID;
    delete process.env.CURSOR_TRACE_ID;
  });

  afterEach(() => {
    process.env = savedEnv;
  });

  it("returns claude-code when CLAUDE_PROJECT_DIR is set", () => {
    process.env.CLAUDE_PROJECT_DIR = "/some/project";
    const signal = detectPlatform();
    expect(signal.platform).toBe("claude-code");
    expect(signal.confidence).toBe("high");
  });

  it("returns claude-code when CLAUDE_SESSION_ID is set", () => {
    process.env.CLAUDE_SESSION_ID = "abc-123";
    const signal = detectPlatform();
    expect(signal.platform).toBe("claude-code");
    expect(signal.confidence).toBe("high");
  });

  it("returns gemini-cli when GEMINI_PROJECT_DIR is set", () => {
    process.env.GEMINI_PROJECT_DIR = "/some/project";
    const signal = detectPlatform();
    expect(signal.platform).toBe("gemini-cli");
    expect(signal.confidence).toBe("high");
  });

  it("returns gemini-cli when GEMINI_SESSION_ID is set", () => {
    process.env.GEMINI_SESSION_ID = "gemini-sess";
    const signal = detectPlatform();
    expect(signal.platform).toBe("gemini-cli");
    expect(signal.confidence).toBe("high");
  });

  it("returns opencode when OPENCODE_PROJECT_DIR is set", () => {
    process.env.OPENCODE_PROJECT_DIR = "/some/project";
    const signal = detectPlatform();
    expect(signal.platform).toBe("opencode");
    expect(signal.confidence).toBe("high");
  });

  it("returns vscode-copilot when VSCODE_PID is set", () => {
    process.env.VSCODE_PID = "12345";
    const signal = detectPlatform();
    expect(signal.platform).toBe("vscode-copilot");
    expect(signal.confidence).toBe("high");
  });

  it("returns cursor when CURSOR_SESSION_ID is set", () => {
    process.env.CURSOR_SESSION_ID = "cursor-sess";
    const signal = detectPlatform();
    expect(signal.platform).toBe("cursor");
    expect(signal.confidence).toBe("high");
  });

  it("returns claude-code as default when no platform detected", () => {
    // No env vars set, and we rely on fallback.
    // Note: on machines with ~/.claude/ this may return medium confidence
    // instead of low, but platform should still be "claude-code".
    const signal = detectPlatform();
    expect(signal.platform).toBe("claude-code");
  });
});

// ─────────────────────────────────────────────────────────
// getAdapter — returns correct adapter for each platform
// ─────────────────────────────────────────────────────────

describe("getAdapter", () => {
  it("returns ClaudeCodeAdapter for claude-code", async () => {
    const adapter = await getAdapter("claude-code");
    expect(adapter).toBeInstanceOf(ClaudeCodeAdapter);
  });

  it("returns GeminiCLIAdapter for gemini-cli", async () => {
    const adapter = await getAdapter("gemini-cli");
    expect(adapter).toBeInstanceOf(GeminiCLIAdapter);
  });

  it("returns OpenCodeAdapter for opencode", async () => {
    const adapter = await getAdapter("opencode");
    expect(adapter).toBeInstanceOf(OpenCodeAdapter);
  });

  it("returns CodexAdapter for codex", async () => {
    const adapter = await getAdapter("codex");
    expect(adapter).toBeInstanceOf(CodexAdapter);
  });

  it("returns VSCodeCopilotAdapter for vscode-copilot", async () => {
    const adapter = await getAdapter("vscode-copilot");
    expect(adapter).toBeInstanceOf(VSCodeCopilotAdapter);
  });

  it("returns ClaudeCodeAdapter for unknown platform", async () => {
    const adapter = await getAdapter("unknown" as any);
    expect(adapter).toBeInstanceOf(ClaudeCodeAdapter);
  });
});
