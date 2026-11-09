import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useOrientation } from '../../../hooks/use-orientation';
import type { SessionPhase } from '../../../socket/session-store';
import { useSession } from '../../../socket/use-session';
import { CountdownView } from './CountdownView';
import { DrawingView } from './DrawingView';
import { FinalView } from './FinalView';
import { QueueView } from './QueueView';
import { RotateView } from './RotateView';

const LANDSCAPE_PHASES = new Set<SessionPhase['phase']>(['fade', 'active']);

type OrientationLock = { lock?: (orientation: string) => Promise<void> };

/**
 * One route for the whole turn, rendered from the session store:
 * queue → fade («Початок через»: rotate prompt in portrait, big digit in
 * landscape) → drawing (landscape; portrait keeps the prompt with the
 * timer) → final. Leaving the queue is the back arrow; a `skipped` end
 * (cancel elsewhere, tech pause) returns to the modes.
 */
export const SessionView = () => {
  const { phase, session } = useSession();
  const orientation = useOrientation();
  const navigate = useNavigate();
  const kind = phase.phase;
  const ended = kind === 'ended' ? phase.reason : null;

  useEffect(() => {
    if (kind === 'idle' || ended === 'skipped') {
      session.reset();
      navigate('/touch', { replace: true });
    }
  }, [kind, ended, session, navigate]);

  // Where supported (installed PWA on Android) the screen turns by itself;
  // iOS ignores the request and the rotate prompt does the job.
  useEffect(() => {
    const landscape = LANDSCAPE_PHASES.has(kind);
    if (landscape) {
      const orientationApi = screen.orientation as unknown as OrientationLock;
      orientationApi.lock?.('landscape').catch(() => {});
    }
    return () => {
      if (landscape) screen.orientation.unlock?.();
    };
  }, [kind]);

  const leave = () => {
    session.cancel();
    navigate('/touch', { replace: true });
  };

  switch (phase.phase) {
    case 'queued':
      return <QueueView turnAt={phase.turnAt} onLeave={leave} />;
    case 'fade':
      return orientation === 'landscape' ? (
        <CountdownView startsAt={phase.startsAt} />
      ) : (
        <RotateView phase={phase} onLeave={leave} />
      );
    case 'active':
      return orientation === 'landscape' ? (
        <DrawingView
          sessionId={phase.sessionId}
          request={phase.request}
          endsAt={phase.endsAt}
          onTouch={session.sendTouch}
        />
      ) : (
        <RotateView phase={phase} onLeave={leave} />
      );
    case 'ended':
      return phase.reason === 'completed' ? <FinalView /> : null;
    default:
      return null;
  }
};

export default SessionView;
