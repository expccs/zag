import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useSocket } from '../socket/use-socket';

/**
 * Runs once per page load: asks the server over HTTP whether this phone
 * still has a turn (the page was reloaded while in the queue or drawing)
 * and, if so, puts the store back into it and opens the session screen,
 * where the countdown continues from the server's numbers.
 */
export const TurnRestorer = () => {
  const { session } = useSocket();
  const navigate = useNavigate();

  useEffect(() => {
    let mounted = true;
    void session.restore().then((found) => {
      if (found && mounted) navigate('/touch/session', { replace: true });
    });
    return () => {
      mounted = false;
    };
  }, [session, navigate]);

  return null;
};
