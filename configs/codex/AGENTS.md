# context-mode

Raw tool output floods your context window. Use context-mode MCP tools to keep raw data in the sandbox.

## Tool Selection

1. **GATHER**: `mcp__context-mode__batch_execute(commands, queries)` — Primary tool for research. Runs all commands, auto-indexes, and searches. ONE call replaces many individual steps.
2. **FOLLOW-UP**: `mcp__context-mode__search(queries: ["q1", "q2", ...])` — Use for all follow-up questions. ONE call, many queries.
3. **PROCESSING**: `mcp__context-mode__execute(language, code)` or `mcp__context-mode__execute_file(path, language, code)` — Use for API calls, log analysis, and data processing.
4. **WEB**: `mcp__context-mode__fetch_and_index(url)` then `mcp__context-mode__search(queries)` — Fetch, index, then query. Never dump raw HTML.

## Rules

- DO NOT use shell for commands producing >20 lines of output — use `mcp__context-mode__execute` or `mcp__context-mode__batch_execute`.
- DO NOT read files for analysis — use `mcp__context-mode__execute_file`. Reading IS correct for files you intend to edit.
- DO NOT use curl/wget — use `mcp__context-mode__execute` or `mcp__context-mode__fetch_and_index`.
- Shell is ONLY for git, mkdir, rm, mv, navigation, and short commands.

## Output

- Keep responses under 500 words.
- Write artifacts (code, configs) to FILES — never return them as inline text.
- Return only: file path + 1-line description.
