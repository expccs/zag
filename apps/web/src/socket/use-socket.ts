import { useContext } from 'react';
import { SocketContext, type SocketContextValue } from './socket-context';

export const useSocket = (): SocketContextValue => {
  const value = useContext(SocketContext);
  if (!value) throw new Error('useSocket must be used inside <SocketProvider>');
  return value;
};
