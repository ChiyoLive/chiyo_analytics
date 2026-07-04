<!-- BEGIN:project-rules -->
# Project Overview
You can obtain a summary of the current project status from `PROJECT.md` located under the project root.

## Overview Documentation Structure
The project contains multiple documentation files, each serving a distinct purpose:
- `PROJECT.md`: The master status file for developers and AI Agents. Note: If discrepancies exist between this file and the actual codebase, the **actual code takes absolute precedence**.
- `README.{lang}.md`: User-facing documentation that guides users on how to use the project.
- `deployment/PROJECT.md`: Deployment-specific status file for developers and AI Agents. It details the deployment process for each target and explains the underlying design philosophy.

# SQL Query Standards
1. When writing SQL queries—whether for ClickHouse or PostgreSQL, always use fully qualified, semantically clear table formats such as `cyanly.events` or `public.users`. Never use ambiguous shorthand like `events` or `users`.

# Word Abbreviations
1. The official abbreviation for "Chiyo Analytics" is `cyanly`. Never use `Chiyo`, `chiyo`, `cha` as an abbreviation. Use either `chiyo_analytics` or `cyanly`.

# Regarding the `dashboard` Folder
The `dashboard` folder contains a customized version of Next.js. Before modifying any files inside this directory, you must first read and strictly follow the instructions in `./dashboard/AGENTS.md`.

# Upon Task Completion
1. Always update `./PROJECT.md` to ensure it accurately reflects the current state of the project.

# Execution of E2E Tests
1. You may attempt to run `uv run mng.py test e2e` based on the guidelines in `./PROJECT.md` to ensure that all tests still pass after your updates.
2. If you encounter an error stating that `pnpm` cannot be found, this is due to environment limitations. In this case, **do not attempt to fix this error yourself**. Instead, explicitly ask the user to run the command for you and provide you with the output.

# TypeScript Code Standards
1. **Always** use `type` instead of `interface`.
2. **Always** use `undefined` instead of `null` unless absolutely necessary.
3. **Avoid** using overly broad types like `any` or `Record<string, string>` unless strictly necessary. Use explicit, precise, and strongly-defined types.
<!-- END:project-rules -->
