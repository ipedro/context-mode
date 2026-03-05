import { describe, it, expect, beforeEach } from "vitest";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { OpenCodeAdapter } from "../../src/adapters/opencode/index.js";

describe("OpenCodeAdapter", () => {
  let adapter: OpenCodeAdapter;

  beforeEach(() => {
    adapter = new OpenCodeAdapter();
  });

  // ── Capabilities ──────────────────────────────────────

  describe("capabilities", () => {
    it("sessionStart is false", () => {
      expect(adapter.capabilities.sessionStart).toBe(false);
    });

    it("canInjectSessionContext is false", () => {
      expect(adapter.capabilities.canInjectSessionContext).toBe(false);
    });

    it("preToolUse and postToolUse are true", () => {
      expect(adapter.capabilities.preToolUse).toBe(true);
      expect(adapter.capabilities.postToolUse).toBe(true);
    });

    it("paradigm is ts-plugin", () => {
      expect(adapter.paradigm).toBe("ts-plugin");
    });
  });

  // ── parsePreToolUseInput ──────────────────────────────

  describe("parsePreToolUseInput", () => {
    it("extracts sessionId from sessionID (camelCase)", () => {
      const event = adapter.parsePreToolUseInput({
        tool_name: "shell",
        sessionID: "oc-session-123",
      });
      expect(event.sessionId).toBe("oc-session-123");
    });

    it("projectDir is undefined (uses ctx.directory)", () => {
      const event = adapter.parsePreToolUseInput({
        tool_name: "shell",
      });
      expect(event.projectDir).toBeUndefined();
    });

    it("extracts toolName from tool_name", () => {
      const event = adapter.parsePreToolUseInput({
        tool_name: "read_file",
        tool_input: { path: "/some/file" },
      });
      expect(event.toolName).toBe("read_file");
    });

    it("falls back to pid when no sessionID", () => {
      const event = adapter.parsePreToolUseInput({
        tool_name: "shell",
      });
      expect(event.sessionId).toBe(`pid-${process.ppid}`);
    });
  });

  // ── formatPreToolUseResponse ──────────────────────────

  describe("formatPreToolUseResponse", () => {
    it("throws Error for deny decision", () => {
      expect(() =>
        adapter.formatPreToolUseResponse({
          decision: "deny",
          reason: "Blocked",
        }),
      ).toThrow("Blocked");
    });

    it("throws Error with default message when no reason for deny", () => {
      expect(() =>
        adapter.formatPreToolUseResponse({
          decision: "deny",
        }),
      ).toThrow("Blocked by context-mode hook");
    });

    it("returns args object for modify", () => {
      const updatedInput = { command: "echo hi" };
      const result = adapter.formatPreToolUseResponse({
        decision: "modify",
        updatedInput,
      });
      expect(result).toEqual({ args: updatedInput });
    });

    it("returns undefined for allow", () => {
      const result = adapter.formatPreToolUseResponse({
        decision: "allow",
      });
      expect(result).toBeUndefined();
    });
  });

  // ── formatPostToolUseResponse ─────────────────────────

  describe("formatPostToolUseResponse", () => {
    it("formats updatedOutput as output field", () => {
      const result = adapter.formatPostToolUseResponse({
        updatedOutput: "New output",
      });
      expect(result).toEqual({ output: "New output" });
    });

    it("formats additionalContext", () => {
      const result = adapter.formatPostToolUseResponse({
        additionalContext: "Extra info",
      });
      expect(result).toEqual({ additionalContext: "Extra info" });
    });

    it("returns undefined for empty response", () => {
      const result = adapter.formatPostToolUseResponse({});
      expect(result).toBeUndefined();
    });
  });

  // ── parseSessionStartInput ────────────────────────────

  describe("parseSessionStartInput", () => {
    it("throws because SessionStart is not supported", () => {
      expect(() => adapter.parseSessionStartInput({})).toThrow(
        /OpenCode does not support SessionStart/,
      );
    });
  });

  // ── Config paths ──────────────────────────────────────

  describe("config paths", () => {
    it("settings path is opencode.json (relative)", () => {
      expect(adapter.getSettingsPath()).toBe(resolve("opencode.json"));
    });

    it("session dir is under ~/.config/opencode/context-mode/sessions/", () => {
      const sessionDir = adapter.getSessionDir();
      expect(sessionDir).toBe(
        join(homedir(), ".config", "opencode", "context-mode", "sessions"),
      );
    });
  });
});
