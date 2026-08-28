export const StyleSheet = { create: (s: any) => s };
export const Platform = { OS: 'android', select: (o: any) => o?.android ?? o?.default ?? undefined };
export const Alert = { alert: () => {} };
export const NativeModules = {};
export default {};
