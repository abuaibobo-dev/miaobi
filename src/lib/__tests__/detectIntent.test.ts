import { describe, it, expect } from 'vitest';
import { detectIntent, isAdultIntent } from '../llm';

describe('detectIntent', () => {
  it('识别成人文学意图', () => {
    expect(detectIntent('写一段床戏')).toBe('adult');
    expect(detectIntent('描写做爱场景，要露骨')).toBe('adult');
    expect(detectIntent('继续写黄文')).toBe('adult');
  });

  it('识别写作意图', () => {
    expect(detectIntent('帮我续写第五章')).toBe('writing');
    expect(detectIntent('给小说设计大纲')).toBe('writing');
  });

  it('识别生图意图', () => {
    expect(detectIntent('画一幅村口雪景')).toBe('image');
    expect(detectIntent('生成插画')).toBe('image');
  });

  it('带图识别为 vision', () => {
    expect(detectIntent('这是什么', true)).toBe('vision');
  });

  it('普通对话为 chat', () => {
    expect(detectIntent('你好')).toBe('chat');
    expect(detectIntent('今天天气如何')).toBe('chat');
  });

  it('普通性爱描写语境触发 adult', () => {
    // 触发词本身即成人语境
    expect(detectIntent('帮我润色这段亲密场景描写')).toBe('adult');
  });
});

describe('isAdultIntent', () => {
  it('adult 意图为真', () => {
    expect(isAdultIntent('adult')).toBe(true);
  });
  it('其他意图为假', () => {
    expect(isAdultIntent('writing')).toBe(false);
    expect(isAdultIntent('chat')).toBe(false);
  });
});
