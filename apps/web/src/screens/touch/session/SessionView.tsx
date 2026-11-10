import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useOrientation } from '../../../hooks/use-orientation';
import { formatClock, useSecondsUntil } from '../../../hooks/use-seconds-until';
import { useLanguage } from '../../../i18n/use-language';
import { MODES_PATH } from '../../../interactive/modes';
import type { SessionPhase } from '../../../socket/session-store';
import { useSession } from '../../../socket/use-session';
import { CountdownView } from './CountdownView';
import { DrawingView } from './DrawingView';
import { FinalView } from './FinalView';
import { QueueView } from './QueueView';
import { RotateView } from './RotateView';

type OrientationLock = { lock?: (orientation: string) => Promise<void> };

/** When the pill countdown of the portrait prompt ends, per phase. */
const targetOf = (phase: SessionPhase): number => {
  switch (phase.phase) {
    case 'queued':
      return phase.turnAt;
    case 'fade':
      return phase.startsAt;
    case 'active':
      return phase.endsAt;
    default:
      return 0;
  }
};

/**
 * One route for the whole turn, rendered from the session store. The
 * request goes to the server only once the phone is in landscape
 * (`pending` → `requesting`); until then, and whenever the phone is held
 * upright later, the portrait prompt asks to turn it and carries the
 * status. Landscape: queue → countdown («Початок через») → drawing →
 * final. The back arrow leaves the queue; a `skipped` end (cancel
 * elsewhere, tech pause) returns to the modes, a failed request to the
 * setup.
 */
export const SessionView = () => {
  const { phase, session } = useSession();
  const orientation = useOrientation();
  const navigate = useNavigate();
  const { messages } = useLanguage();
  const seconds = useSecondsUntil(targetOf(phase));
  const kind = phase.phase;
  const ended = kind === 'ended' ? phase.reason : null;
  const landscape = orientation === 'landscape';

  useEffect(() => {
    if (kind === 'idle' || ended === 'skipped') {
      session.reset();
      navigate(MODES_PATH, { replace: true });
    }
  }, [kind, ended, session, navigate]);

  // The phone is turned: ask for the turn. `EQUEUED` means the place
  // survived a reload; anything else sends the user back to the setup.
  useEffect(() => {
    if (kind !== 'pending' || !landscape) return;
    const mode = phase.phase === 'pending' ? phase.request.mode : null;
    void session.start().then((result) => {
      if (result.success || result.code === 'EQUEUED') return;
      session.reset();
      navigate(`/touch/${mode}/setup`, {
        replace: true,
        state: { failed: result.code !== 'ENOTALLOWED' },
      });
    });
  }, [kind, landscape, phase, session, navigate]);

  // Where supported (installed PWA on Android) the screen turns by itself;
  // iOS ignores the request and the rotate prompt does the job.
  useEffect(() => {
    const wanted = kind !== 'idle' && kind !== 'ended';
    if (wanted) {
      const orientationApi = screen.orientation as unknown as OrientationLock;
      orientationApi.lock?.('landscape').catch(() => {});
    }
    return () => {
      if (wanted) screen.orientation.unlock?.();
    };
  }, [kind]);

  const leave = () => {
    session.cancel();
    navigate(MODES_PATH, { replace: true });
  };

  const { fade, drawing } = messages.touch;
  const pillTitle = (): string => {
    switch (phase.phase) {
      case 'queued':
      case 'fade':
        return `${fade.title} ${seconds}`;
      case 'active':
        return `${drawing.timer}: ${formatClock(seconds)}`;
      default:
        return fade.rotateTitle;
    }
  };

  if (!landscape && kind !== 'ended' && kind !== 'idle') {
    return <RotateView title={pillTitle()} onLeave={leave} />;
  }

  switch (phase.phase) {
    case 'restoring':
    case 'pending':
    case 'requesting':
      // Landscape, answer on its way: the queue chrome without a number yet.
      return <QueueView turnAt={0} onLeave={leave} orientation="landscape" />;
    case 'queued':
      return (
        <QueueView
          turnAt={phase.turnAt}
          onLeave={leave}
          orientation="landscape"
        />
      );
    case 'fade':
      return <CountdownView startsAt={phase.startsAt} />;
    case 'active':
      return (
        <DrawingView
          sessionId={phase.sessionId}
          request={phase.request}
          endsAt={phase.endsAt}
          onTouch={session.sendTouch}
        />
      );
    case 'ended':
      return phase.reason === 'completed' ? <FinalView /> : null;
    default:
      return null;
  }
};

export default SessionView;
