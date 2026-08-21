import { requireNativeModule } from 'expo';

declare module 'expo' {
  interface NativeModules {
    TermuxCommand: {
      run: (commandPath: string, args: string[]) => Promise<boolean>;
    };
  }
}

const nativeModule = requireNativeModule('TermuxCommand');

export function runTermuxCommand(commandPath: string, args: string[]): Promise<boolean> {
  return nativeModule.run(commandPath, args);
}
