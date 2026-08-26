import React, { useEffect, useRef } from 'react';
import { StatusBar, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import HomeScreen from './src/screens/HomeScreen';
import BookDetailScreen from './src/screens/BookDetailScreen';
import ShelfScreen from './src/screens/ShelfScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import ReaderScreen from './src/screens/ReaderScreen';
import AIAssistantScreen from './src/screens/AIAssistantScreen';
import SourceManagerScreen from './src/screens/SourceManagerScreen';
import CustomSourcesScreen from './src/screens/CustomSourcesScreen';
import WritingScreen from './src/screens/WritingScreen';
import { importExternalFile } from './src/lib/library';
import { T } from './src/lib/theme';
import { AlertProvider } from './src/components/CustomAlert';
import { ErrorBoundary } from './src/components/ErrorBoundary';

const Stack = createNativeStackNavigator();

export default function App() {
  const navigationRef = useRef<any>(null);

  useEffect(() => {
    let mounted = true;
    let subscription: { remove: () => void } | undefined;
    const handle = async (url?: string | null) => {
      if (!url || !mounted) return;
      try {
        const parsed = (await import('expo-linking')).default.parse(url);
        const uri = url.includes('content://') ? url : decodeURIComponent(url);
        const name = decodeURIComponent(uri.split('/').pop() || '导入文件');
        if (!/\.(txt|csv|json|epub)$/i.test(name)) return;
        const result = await importExternalFile(uri, name);
        if (!result.ok) return;
        const library = await (await import('./src/lib/library')).getLibrary();
        const book = library.find(item => item.id === result.bookId) || library[0];
        if (!book) return;
        setTimeout(() => navigationRef.current?.navigate(book.localUri ? 'Reader' : 'BookDetail', book.localUri ? { bookId: book.id } : { book }), 80);
      } catch {}
    };
    (async () => {
      const Linking = await import('expo-linking');
      handle(await Linking.default.getInitialURL());
      subscription = Linking.default.addEventListener('url', ({ url }) => handle(url));
    })();
    return () => {
      mounted = false;
      subscription?.remove();
    };
  }, []);

  return (
    <ErrorBoundary>
    <AlertProvider>
      <View style={{ flex: 1 }}>
      <StatusBar barStyle="light-content" backgroundColor={T.bg} />
      <NavigationContainer ref={navigationRef}>
        <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
          <Stack.Screen name="Home" component={HomeScreen} />
          <Stack.Screen name="BookDetail" component={BookDetailScreen} />
          <Stack.Screen name="Shelf" component={ShelfScreen} />
          <Stack.Screen name="Settings" component={SettingsScreen} />
          <Stack.Screen name="Reader" component={ReaderScreen} />
          <Stack.Screen name="AIAssistant" component={AIAssistantScreen} />
          <Stack.Screen name="Sources" component={SourceManagerScreen} />
          <Stack.Screen name="CustomSources" component={CustomSourcesScreen} />
          <Stack.Screen name="Writing" component={WritingScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </View>
    </AlertProvider>
    </ErrorBoundary>
  );
}
