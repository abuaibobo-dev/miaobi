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
import AIAssistantScreen from './src/screens/AIAssistantScreen';
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
          tabBarLabel: '创作',
          tabBarIcon: ({ color, size }) => <Icon.chat size={size} color={color} />,
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
    (async () => {
      try {
        const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
        const confirmed = await AsyncStorage.getItem('miaobi.adultConfirmed');
        if (confirmed !== null) return;
        const { showAlert } = await import('./src/components/CustomAlert');
        const show = () => showAlert(
          '成人内容确认',
          '本应用包含面向 18 岁以上成年人的成人文学功能。请确认你已年满 18 周岁，且仅浏览合法成人内容。',
          [
            { text: '我已年满18岁', style: 'default', onPress: () => { AsyncStorage.setItem('miaobi.adultConfirmed', 'yes'); } },
            { text: '未满18岁', style: 'cancel', onPress: () => { AsyncStorage.setItem('miaobi.adultConfirmed', 'no'); AsyncStorage.getItem('miaobi.settings').then(raw => { const cur = raw ? JSON.parse(raw) : {}; AsyncStorage.setItem('miaobi.settings', JSON.stringify({ ...cur, adultContent: false })); }); } },
          ],
        );
        show();
      } catch {}
    })();
  }, []);

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
          <Stack.Screen name="Writing" component={WritingScreen} />
          <Stack.Screen name="AIAssistant" component={AIAssistantScreen} />
        </Stack.Navigator>
      </NavigationContainer>
      </View>
    </AlertProvider>
    </ErrorBoundary>
  );
}
