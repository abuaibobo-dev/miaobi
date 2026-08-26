import React, { useEffect, useRef } from 'react';
import { StatusBar, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import HomeScreen from './src/screens/HomeScreen';
import BookDetailScreen from './src/screens/BookDetailScreen';
import ShelfScreen from './src/screens/ShelfScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import ReaderScreen from './src/screens/ReaderScreen';
import SourceManagerScreen from './src/screens/SourceManagerScreen';
import CustomSourcesScreen from './src/screens/CustomSourcesScreen';
import WritingScreen from './src/screens/WritingScreen';
import { importExternalFile } from './src/lib/library';
import { T } from './src/lib/theme';
import { AlertProvider } from './src/components/CustomAlert';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { Icon } from './src/lib/icons';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function HomeTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: T.surface,
          borderTopColor: T.border,
          borderTopWidth: 0.5,
          height: 56,
          paddingBottom: 6,
          paddingTop: 4,
        },
        tabBarActiveTintColor: T.text,
        tabBarInactiveTintColor: T.textMuted,
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600' },
      }}
    >
      <Tab.Screen
        name="Chat"
        component={HomeScreen}
        options={{
          tabBarLabel: '聊天',
          tabBarIcon: ({ color, size }) => <Icon.chat size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="Write"
        component={WritingScreen}
        options={{
          tabBarLabel: '写作',
          tabBarIcon: ({ color, size }) => <Icon.write size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="ShelfTab"
        component={ShelfScreen}
        options={{
          tabBarLabel: '书架',
          tabBarIcon: ({ color, size }) => <Icon.book size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="SettingsTab"
        component={SettingsScreen}
        options={{
          tabBarLabel: '设置',
          tabBarIcon: ({ color, size }) => <Icon.settings size={size} color={color} />,
        }}
      />
    </Tab.Navigator>
  );
}

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
          <Stack.Screen name="Main" component={HomeTabs} />
          <Stack.Screen name="BookDetail" component={BookDetailScreen} />
          <Stack.Screen name="Reader" component={ReaderScreen} />
          <Stack.Screen name="Sources" component={SourceManagerScreen} />
          <Stack.Screen name="CustomSources" component={CustomSourcesScreen} />
        </Stack.Navigator>
      </NavigationContainer>
      </View>
    </AlertProvider>
    </ErrorBoundary>
  );
}
