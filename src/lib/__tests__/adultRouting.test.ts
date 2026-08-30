import { beforeEach, describe, expect, it, vi } from 'vitest';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSettings } from '../storage';
import { getAdultGatewayModels, getOllamaModels, isAdultContentUsable, resolveAdultRoute } from '../llm';

describe('resolveAdultRoute', () => {
  it('成人模式默认本地优先且允许云端回退', () => {
    expect(resolveAdultRoute({} as any)).toEqual({
      preferLocal: true,
      allowCloudFallback: true,
      localBaseUrl: 'http://127.0.0.1:11434',
      localModel: undefined,
      localProvider: 'ollama',
    });
  });

  it('可关闭成人模式云端回退', () => {
    expect(resolveAdultRoute({ adultLocalFallbackToCloud: false } as any)).toMatchObject({
      preferLocal: true,
      allowCloudFallback: false,
    });
  });

  it('显式选择云端时跳过本地优先', () => {
    expect(resolveAdultRoute({} as any, { providerOverride: 'cloud' })).toMatchObject({
      preferLocal: false,
      allowCloudFallback: true,
    });
  });

  it('显式指定成人本地模型与地址', () => {
    expect(resolveAdultRoute({
      adultLocalBaseUrl: 'http://127.0.0.1:1234/',
      adultLocalModel: 'qwen2.5:7b',
      adultLocalProvider: 'openai',
    } as any)).toEqual({
      preferLocal: true,
      allowCloudFallback: true,
      localBaseUrl: 'http://127.0.0.1:1234/v1',
      localModel: 'qwen2.5:7b',
      localProvider: 'openai',
    });
  });
});

describe('isAdultContentUsable', () => {
  it('本地拒答不算可用成人内容', () => {
    expect(isAdultContentUsable('抱歉，我不能提供露骨成人内容。')).toBe(false);
  });

  it('真实成人内容算可用', () => {
    expect(isAdultContentUsable('她喘息着抱紧他，欲望像潮水一样漫上来。')).toBe(true);
  });
});

describe('getAdultGatewayModels', () => {
  it('返回默认成人模型白名单顺序', () => {
    expect(getAdultGatewayModels({} as any)).toEqual([
      'gryphe/mythomax-l2-13b',
      'sao10k/l3-lunaris-8b',
      'anthracite-org/magnum-v4-72b',
    ]);
  });

  it('支持用户自定义模型顺序', () => {
    expect(getAdultGatewayModels({ adultGatewayModels: ['foo/bar', 'baz/qux'] } as any)).toEqual([
      'foo/bar',
      'baz/qux',
    ]);
  });
});

describe('getSettings adult local defaults', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('提供成人本地模型默认配置', async () => {
    const settings = await getSettings();
    expect(settings.adultLocalPreferred).toBe(true);
    expect(settings.adultLocalFallbackToCloud).toBe(true);
    expect(settings.adultLocalBaseUrl).toBe('http://127.0.0.1:11434');
    expect(settings.adultLocalProvider).toBe('ollama');
    expect(settings.adultGatewayEnabled).toBe(true);
    expect(settings.freeLlmApiBaseUrl).toBe('');
    expect(settings.freeLlmApiKey).toBe('');
  });

  it('新成人网关配置优先于旧 openRouter 字段', async () => {
    await AsyncStorage.setItem('miaobi.settings', JSON.stringify({
      adultGatewayEnabled: true,
      adultGatewayModels: ['new/model'],
      freeLlmApiKey: 'free-key',
      adultOpenRouterEnabled: false,
      adultOpenRouterModels: ['old/model'],
      openRouterApiKey: 'old-key',
    }));
    const settings = await getSettings();
    expect(settings.adultGatewayEnabled).toBe(true);
    expect(settings.adultGatewayModels).toEqual(['new/model']);
    expect(settings.freeLlmApiKey).toBe('free-key');
  });

  it('保留 qwen 本地文本模型', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        models: [{ name: 'qwen2.5:7b', size: 512 * 1024 * 1024 }],
      }),
    })) as any);

    await expect(getOllamaModels(true)).resolves.toContain('qwen2.5:7b');
  });
});
