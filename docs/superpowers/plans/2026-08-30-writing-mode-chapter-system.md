# Writing Mode And Chapter System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make 妙笔 feel like a real writing tool by adding explicit creation modes, stronger project/chapter landing flow, and an adult-model-pool test entry.

**Architecture:** Keep existing `HomeScreen` as lightweight quick-create chat, but add explicit mode state that drives prompt/routing intent. Reuse `WritingScreen` as project-aware workspace, strengthen chapter/project persistence around it, and expose a focused gateway-model health test in settings instead of scattering provider behavior across screens.

**Tech Stack:** Expo 57, React Native, TypeScript, AsyncStorage, existing `chatCompletion` / `agentExecute` routing, Vitest.

**Spec:** approved in chat on 2026-08-30 for next batch priorities: explicit writing modes, project/chapter structure, adult pool testing.

## Global Constraints

- Keep adult safety boundary unchanged: no minors, coercion, incest, or illegal sexual content.
- Preserve existing `freellmapi` adult gateway as primary adult cloud route and local model as final fallback.
- Do not reintroduce deleted 找书/书源 flows.
- Use TDD for new behavior: write failing tests first, verify red, then implement.
- Bump `package.json` and `app.json` version together before release-triggering commit.
- Verify with `npm run typecheck`, `npm test`, and `npx expo export --platform android --output-dir dist-export --no-bytecode`.

---

## File Map

- Modify: `src/types/novel.ts`
  - Add explicit writing mode types and any small project metadata needed by UI.
- Modify: `src/lib/storage.ts`
  - Persist default writing mode preferences and any lightweight project/session helpers.
- Modify: `src/lib/llm.ts`
  - Accept explicit writing mode hints, expose adult gateway test helper.
- Create: `src/lib/__tests__/writingMode.test.ts`
  - Cover mode-to-intent/routing behavior.
- Create: `src/lib/__tests__/adultGatewayHealth.test.ts`
  - Cover adult gateway test helper behavior and result normalization.
- Modify: `src/screens/HomeScreen.tsx`
  - Add explicit mode switcher and mode-aware quick prompts.
- Modify: `src/screens/WritingScreen.tsx`
  - Add “save as project section/chapter” landing controls and better chapter creation semantics.
- Modify: `src/screens/SettingsScreen.tsx`
  - Add adult gateway one-tap test action and result display.

## Task 1: Add Explicit Writing Modes

**Files:**
- Modify: `src/types/novel.ts`
- Modify: `src/lib/llm.ts`
- Modify: `src/screens/HomeScreen.tsx`
- Test: `src/lib/__tests__/writingMode.test.ts`

**Interfaces:**
- Consumes: `detectIntent(text: string, hasImage?: boolean): Intent`
- Produces:
  - `type WritingMode = 'general' | 'novel' | 'adult' | 'polish' | 'outline'`
  - `resolveWritingModeIntent(mode: WritingMode, text: string): Intent`
  - Home screen mode state persisted under `miaobi.homeMode`

- [ ] **Step 1: Write failing test**

```ts
import { describe, expect, it } from 'vitest';
import { resolveWritingModeIntent } from '../llm';

describe('resolveWritingModeIntent', () => {
  it('adult mode forces adult intent', () => {
    expect(resolveWritingModeIntent('adult', '你好')).toBe('adult');
  });

  it('outline mode forces writing intent', () => {
    expect(resolveWritingModeIntent('outline', '给我一个三幕结构')).toBe('writing');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/__tests__/writingMode.test.ts`
Expected: FAIL with `resolveWritingModeIntent is not a function` or missing export.

- [ ] **Step 3: Write minimal implementation**

```ts
export type WritingMode = 'general' | 'novel' | 'adult' | 'polish' | 'outline';

export function resolveWritingModeIntent(mode: WritingMode, text: string): Intent {
  if (mode === 'adult') return 'adult';
  if (mode === 'outline' || mode === 'novel' || mode === 'polish') return 'writing';
  return detectIntent(text);
}
```

Then in `HomeScreen.tsx` add a compact mode chip row above quick prompts/input, persist selected mode to AsyncStorage, and use `resolveWritingModeIntent(selectedMode, text)` instead of plain `detectIntent` path.

- [ ] **Step 4: Run tests to verify it passes**

Run: `npm test -- src/lib/__tests__/writingMode.test.ts`
Expected: PASS

- [ ] **Step 5: Smoke-check screen behavior**

Run: `npm run typecheck`
Expected: PASS. `HomeScreen` compiles with new mode state and no dead imports.

## Task 2: Strengthen Project/Chapter Landing Flow

**Files:**
- Modify: `src/screens/WritingScreen.tsx`
- Modify: `src/lib/storage.ts`
- Modify: `src/types/novel.ts`

**Interfaces:**
- Consumes:
  - `saveNovel(novel: NovelProject): Promise<void>`
  - `saveChapter(chapter: Chapter): Promise<void>`
  - `getChapters(novelId: string): Promise<Chapter[]>`
- Produces:
  - explicit `WritingSectionType = 'chapter' | 'character' | 'outline' | 'setting'`
  - chapter save flow that lets assistant output become correct section instead of always chapter body

- [ ] **Step 1: Write failing test for save classification helper**

```ts
import { describe, expect, it } from 'vitest';
import { classifyWritingOutput } from '../storage';

describe('classifyWritingOutput', () => {
  it('treats chapter-like content as chapter', () => {
    expect(classifyWritingOutput('第1章 相遇\n\n正文开始')).toBe('chapter');
  });

  it('treats role sheet content as character', () => {
    expect(classifyWritingOutput('角色小传：林雾\n目标：复仇')).toBe('character');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/__tests__/writingMode.test.ts`
Expected: FAIL because helper does not exist.

- [ ] **Step 3: Write minimal implementation**

```ts
export type WritingSectionType = 'chapter' | 'character' | 'outline' | 'setting';

export function classifyWritingOutput(content: string): WritingSectionType {
  if (/^\s*第.{0,12}[章回节卷]/m.test(content)) return 'chapter';
  if (/角色|人物小传|人物设定/.test(content)) return 'character';
  if (/大纲|三幕|故事结构/.test(content)) return 'outline';
  return 'setting';
}
```

Then update `WritingScreen.tsx` so assistant result actions become explicit:
- “存为章节” only for chapter-like output
- “存为设定” / “存为大纲” / “存为人物” for non-chapter output
- for first batch, non-chapter sections can be appended into `NovelProject.styleGuide` with headings instead of designing a full new DB table

- [ ] **Step 4: Verify saving behavior compiles**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 5: Run full tests**

Run: `npm test`
Expected: PASS

## Task 3: Add Adult Gateway One-Tap Test

**Files:**
- Modify: `src/lib/llm.ts`
- Modify: `src/screens/SettingsScreen.tsx`
- Test: `src/lib/__tests__/adultGatewayHealth.test.ts`

**Interfaces:**
- Consumes:
  - `getSettings(): Promise<NovelSettings>`
  - existing `requestGatewayAdult(...)` internals
- Produces:
  - `testAdultGatewayModels(): Promise<Array<{ model: string; ok: boolean; reason: string }>>`
  - settings UI button `测试成人池`

- [ ] **Step 1: Write failing test**

```ts
import { describe, expect, it } from 'vitest';
import { testAdultGatewayModels } from '../llm';

describe('testAdultGatewayModels', () => {
  it('returns normalized result rows', async () => {
    const rows = await testAdultGatewayModels();
    expect(Array.isArray(rows)).toBe(true);
    expect(rows[0]).toHaveProperty('model');
    expect(rows[0]).toHaveProperty('ok');
    expect(rows[0]).toHaveProperty('reason');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/__tests__/adultGatewayHealth.test.ts`
Expected: FAIL because helper does not exist.

- [ ] **Step 3: Write minimal implementation**

```ts
export async function testAdultGatewayModels() {
  const settings = await getSettings();
  const models = getAdultGatewayModels(settings);
  const rows = [];
  for (const model of models) {
    try {
      const content = await requestGatewayAdult(model, SAMPLE_ADULT_TEST_MESSAGES, 180);
      rows.push({ model, ok: isAdultContentUsable(content), reason: isAdultContentUsable(content) ? 'ok' : 'refused' });
    } catch (error) {
      rows.push({ model, ok: false, reason: error instanceof Error ? error.message : String(error) });
    }
  }
  return rows;
}
```

Then add `SettingsScreen` button and compact results block listing each model as `可用 / 拒答 / 失败`.

- [ ] **Step 4: Verify targeted test passes**

Run: `npm test -- src/lib/__tests__/adultGatewayHealth.test.ts`
Expected: PASS

- [ ] **Step 5: Run final verification**

Run all:
- `npm run typecheck`
- `npm test`
- `npx expo export --platform android --output-dir dist-export --no-bytecode`

Expected: all PASS; export completes.

## Self-Review

- Spec coverage:
  - explicit creation modes: Task 1
  - stronger chapter/project landing: Task 2
  - adult pool one-tap test: Task 3
- Placeholder scan: no TBD/TODO placeholders remain.
- Type consistency:
  - `WritingMode` only defined in Task 1
  - `WritingSectionType` only defined in Task 2
  - `testAdultGatewayModels` only defined in Task 3

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-30-writing-mode-chapter-system.md`.

Two execution options:

1. Subagent-Driven (recommended) - I dispatch a fresh subagent per task, review between tasks, fast iteration
2. Inline Execution - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
