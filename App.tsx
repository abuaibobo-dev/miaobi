import React, { useEffect, useRef } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import * as Linking from 'expo-linking';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import HomeScreen from './src/screens/HomeScreen';
import BookDetailScreen from './src/screens/BookDetailScreen';
import ShelfScreen from './src/screens/ShelfScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import ReaderScreen from './src/screens/ReaderScreen';
import AIAssistantScreen from './src/screens/AIAssistantScreen';
import SourceManagerScreen from './src/screens/SourceManagerScreen';
import { importExternalFile } from './src/lib/library';

const Stack = createNativeStackNavigator();

export default function App() {
  const navigationRef = useRef<any>(null);

  useEffect(() => {
    let mounted = true;
    const handle = async (url?: string | null) => {
      if (!url || !mounted) return;
      try {
        const parsed = Linking.parse(url);
        const uri = url.includes('content://') ? url : decodedUri(url);
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
    function decodedUri(value: string) {
      try { return decodeURIComponent(value); } catch { return value; }
    }
    Linking.getInitialURL().then(handle);
    const subscription = Linking.addEventListener('url', (event: { url: string }) => handle(event.url));
    return () => { mounted = false; subscription.remove(); };
  }, []);

  return (
    <NavigationContainer ref={navigationRef}>
      <StatusBar style="light" />
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          animation: 'slide_from_right',
          contentStyle: { backgroundColor: '#0D0D0D' },
        }}
      >
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="BookDetail" component={BookDetailScreen} />
        <Stack.Screen name="Shelf" component={ShelfScreen} />
        <Stack.Screen name="Settings" component={SettingsScreen} />
        <Stack.Screen name="Reader" component={ReaderScreen} />
        <Stack.Screen name="AIAssistant" component={AIAssistantScreen} />
        <Stack.Screen name="Sources" component={SourceManagerScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
