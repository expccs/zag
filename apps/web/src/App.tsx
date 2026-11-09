import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { LanguageProvider } from './i18n/LanguageProvider';
import { SocketProvider } from './socket/SocketProvider';
import { HomeScreen } from './screens/HomeScreen';

// Mission is a long landing with its own photos: keep it out of the
// initial chunk (vercel-react-best-practices: bundle-dynamic-imports).
const MissionScreen = lazy(() => import('./screens/MissionScreen'));
// Touch & Create and each step of the interactive flow load on demand;
// Home stays the smallest possible first paint.
const TouchScreen = lazy(() => import('./screens/TouchScreen'));
const ModesView = lazy(() => import('./screens/touch/ModesView'));
const InstructionsView = lazy(() => import('./screens/touch/InstructionsView'));
const SetupView = lazy(() => import('./screens/touch/SetupView'));
const SessionView = lazy(() => import('./screens/touch/session/SessionView'));

const routes = (
  <Routes>
    <Route path="/" element={<HomeScreen />} />
    <Route path="/mission" element={<MissionScreen />} />
    <Route path="/touch" element={<TouchScreen />}>
      <Route index element={<ModesView />} />
      <Route path="session" element={<SessionView />} />
      <Route path=":mode" element={<InstructionsView />} />
      <Route path=":mode/setup" element={<SetupView />} />
    </Route>
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
