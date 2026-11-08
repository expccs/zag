import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { LanguageProvider } from './i18n/LanguageProvider';
import { SocketProvider } from './socket/SocketProvider';
import { HomeScreen } from './screens/HomeScreen';

// Mission is a long landing with its own photos: keep it out of the
// initial chunk (vercel-react-best-practices: bundle-dynamic-imports).
const MissionScreen = lazy(() => import('./screens/MissionScreen'));
// Touch & Create opens the socket and pulls socket.io-client into its chunk.
const TouchScreen = lazy(() => import('./screens/TouchScreen'));

const routes = (
  <Routes>
    <Route path="/" element={<HomeScreen />} />
    <Route path="/mission" element={<MissionScreen />} />
    <Route path="/touch" element={<TouchScreen />} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
);

export const App = () => (
  <BrowserRouter>
    <LanguageProvider>
      <SocketProvider>
        <Suspense fallback={null}>{routes}</Suspense>
      </SocketProvider>
    </LanguageProvider>
  </BrowserRouter>
);
