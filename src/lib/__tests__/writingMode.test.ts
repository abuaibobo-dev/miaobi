import { describe, expect, it } from 'vitest';
import { resolveWritingModeIntent } from '../llm';
import { classifyWritingOutput } from '../storage';

describe('resolveWritingModeIntent', () => {
  it('adult mode forces adult intent', () => {
    expect(resolveWritingModeIntent('adult', '你好')).toBe('adult');
  });

  it('outline mode forces writing intent', () => {
    expect(resolveWritingModeIntent('outline', '给我一个三幕结构')).toBe('writing');
  });

  it('novel mode forces writing intent', () => {
    expect(resolveWritingModeIntent('novel', '写一段话')).toBe('writing');
  });

  it('polish mode forces writing intent', () => {
    expect(resolveWritingModeIntent('polish', '帮我润色')).toBe('writing');
  });

  it('general mode delegates to detectIntent', () => {
    expect(resolveWritingModeIntent('general', '画一张图')).toBe('image');
    expect(resolveWritingModeIntent('general', '你好')).toBe('chat');
  });
});

describe('classifyWritingOutput', () => {
  it('treats chapter-like content as chapter', () => {
    expect(classifyWritingOutput('第1章 相遇\n\n正文开始')).toBe('chapter');
  });

  it('treats role sheet content as character', () => {
    expect(classifyWritingOutput('角色小传：林雾\n目标：复仇')).toBe('character');
  });

  it('treats outline content as outline', () => {
    expect(classifyWritingOutput('故事大纲：三幕结构\n第一幕...')).toBe('outline');
  });

  it('defaults to setting for generic content', () => {
    expect(classifyWritingOutput('这个世界的规则是魔法与科技并存')).toBe('setting');
  });
});
