import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, BackHandler, Linking, Platform, Share, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import type { ShouldStartLoadRequest } from 'react-native-webview/lib/WebViewTypes';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { NATIVE_BRIDGE_JS } from './src/nativeBridge';
import { WEB_APP_HTML } from './src/webAppHtml.generated';

// The embedded page runs as if it were served from the live site, so it keeps
// the same storage origin, cloud sync (Supabase) and /dealer-portal routing.
const APP_ORIGIN = 'https://fttechapp.shipstatic.com';
const BACKGROUND = '#000F41';

type BridgeMessage =
  | { type: 'file'; kind: 'save' | 'share'; name: string; mime: string; data: string }
  | { type: 'share-text'; title: string; text: string; url: string }
  | { type: 'open-url'; url: string }
  | { type: 'url'; url: string }
  | { type: 'error'; message: string };

const withoutHash = (url: string) => url.split('#')[0];
const isAppUrl = (url: string) => url === APP_ORIGIN || url.startsWith(APP_ORIGIN + '/');

async function shareFile(name: string, mime: string, base64: string) {
  const file = new File(Paths.cache, name.replace(/[\\/:*?"<>|]/g, '_') || 'download');
  file.create({ overwrite: true });
  file.write(base64, { encoding: 'base64' });
  await Sharing.shareAsync(file.uri, { mimeType: mime, dialogTitle: name });
}

function FTTechApp() {
  const insets = useSafeAreaInsets();
  const webView = useRef<WebView>(null);
  // Each in-app page load (reload, /dealer-portal) re-renders the embedded HTML
  // at that address instead of fetching it from the network.
  const [page, setPage] = useState({ url: APP_ORIGIN + '/', key: 0 });
  const currentUrl = useRef(page.url);
  const loading = useRef(true);
  const canGoBack = useRef(false);

  const loadPage = useCallback((url: string) => {
    loading.current = true;
    currentUrl.current = url;
    setPage((p) => ({ url, key: p.key + 1 }));
  }, []);

  const onShouldStartLoadWithRequest = useCallback(
    (req: ShouldStartLoadRequest) => {
      const { url } = req;
      if (!req.isTopFrame || /^(about|data|blob):/i.test(url)) return true;
      if (isAppUrl(url)) {
        if (loading.current) return true;
        if (req.navigationType !== 'reload' && withoutHash(url) === withoutHash(currentUrl.current)) {
          return true;
        }
        loadPage(url);
        return false;
      }
      Linking.openURL(url).catch(() => {});
      return false;
    },
    [loadPage],
  );

  const onMessage = useCallback(async (event: WebViewMessageEvent) => {
    let msg: BridgeMessage;
    try {
      msg = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }
    try {
      switch (msg.type) {
        case 'file':
          await shareFile(msg.name, msg.mime, msg.data);
          break;
        case 'share-text':
          await Share.share({ title: msg.title, message: [msg.text, msg.url].filter(Boolean).join('\n') });
          break;
        case 'open-url':
          await Linking.openURL(msg.url);
          break;
        case 'url':
          currentUrl.current = msg.url;
          break;
        case 'error':
          Alert.alert('FTTechApp', msg.message);
          break;
      }
    } catch (e) {
      Alert.alert('FTTechApp', e instanceof Error ? e.message : 'Something went wrong');
    }
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!canGoBack.current) return false;
      webView.current?.goBack();
      return true;
    });
    return () => sub.remove();
  }, []);

  return (
    <View
      style={[
        styles.container,
        // iOS: the page lays itself out around the notch (viewport-fit=cover).
        Platform.OS === 'android' && { paddingTop: insets.top, paddingBottom: insets.bottom },
      ]}
    >
      <StatusBar style="light" />
      <WebView
        key={page.key}
        ref={webView}
        style={styles.webView}
        source={{ html: WEB_APP_HTML, baseUrl: page.url }}
        originWhitelist={['*']}
        injectedJavaScriptBeforeContentLoaded={NATIVE_BRIDGE_JS}
        onMessage={onMessage}
        onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
        onOpenWindow={(e) => Linking.openURL(e.nativeEvent.targetUrl).catch(() => {})}
        onLoadEnd={() => {
          loading.current = false;
        }}
        onNavigationStateChange={(nav) => {
          canGoBack.current = nav.canGoBack;
        }}
        onContentProcessDidTerminate={() => loadPage(currentUrl.current)}
        onRenderProcessGone={() => loadPage(currentUrl.current)}
        domStorageEnabled
        javaScriptEnabled
        allowFileAccess
        allowsInlineMediaPlayback
        allowsBackForwardNavigationGestures
        contentInsetAdjustmentBehavior="never"
        setSupportMultipleWindows
        textZoom={100}
        webviewDebuggingEnabled={__DEV__}
      />
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <FTTechApp />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BACKGROUND },
  webView: { flex: 1, backgroundColor: BACKGROUND },
});
