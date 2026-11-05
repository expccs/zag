import { SocketProvider } from './socket/SocketProvider';
import { StubScreen } from './screens/StubScreen';

export const App = () => (
  <SocketProvider autoConnect>
    <StubScreen />
  </SocketProvider>
);
