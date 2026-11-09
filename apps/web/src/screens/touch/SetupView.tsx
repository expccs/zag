import { useState } from 'react';
import { Navigate, useLocation, useNavigate, useParams } from 'react-router';
import { GlassButton } from '../../components/GlassButton';
import { useLanguage } from '../../i18n/use-language';
import {
  SETUP_KIND,
  defaultSetup,
  isEnabledMode,
  toRequest,
  type Setup,
} from '../../interactive/modes';
import { useSession } from '../../socket/use-session';
import { ColorPicker } from './setup/ColorPicker';
import { PalettePicker } from './setup/PalettePicker';
import { WidthPicker } from './setup/WidthPicker';
import { TouchChrome } from './TouchChrome';
import styles from './setup/setup.module.css';

const renderPicker = (setup: Setup, onChange: (setup: Setup) => void) => {
  switch (setup.kind) {
    case 'color':
      return (
        <ColorPicker
          colors={setup}
          onChange={(colors) => onChange({ kind: 'color', ...colors })}
        />
      );
    case 'width':
      return (
        <WidthPicker
          width={setup.width}
          onChange={(width) => onChange({ kind: 'width', width })}
        />
      );
    default:
      return (
        <PalettePicker
          palette={setup.palette}
          onChange={(palette) => onChange({ kind: 'palette', palette })}
        />
      );
  }
};

/**
 * «Обери колір / ширину / палітру» `31:2237` / `34:4171` / `38:2192`: the
 * mode's one setting and «Почати», which remembers the choice and moves
 * to the session screen; the request itself goes out once the phone is
 * turned to landscape (`SessionView`). A failed request comes back here
 * with `state.failed`; `ENOTALLOWED` needs no message, the layout already
 * shows the notice for the new server state.
 */
export const SetupView = () => {
  const { mode } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { messages } = useLanguage();
  const { session } = useSession();
  const [setup, setSetup] = useState<Setup>(() =>
    isEnabledMode(mode) ? defaultSetup(mode) : defaultSetup('comet'),
  );
  if (!isEnabledMode(mode)) return <Navigate to="/touch" replace />;
  const failed = (location.state as { failed?: boolean } | null)?.failed;

  const start = () => {
    session.prepare(toRequest(mode, setup));
    navigate('/touch/session');
  };

  const kind = SETUP_KIND[mode];
  const copy = messages.touch.setup;
  return (
    <TouchChrome back={`/touch/${mode}`}>
      <div className={styles.setup} data-kind={kind}>
        <h1 className={styles.title}>{copy[kind]}</h1>
        {renderPicker(setup, setSetup)}
        <div className={styles.action}>
          <GlassButton variant="action" onClick={start}>
            {copy.start}
          </GlassButton>
          {failed ? (
            <p className={styles.error} role="alert">
              {copy.failed}
            </p>
          ) : null}
        </div>
      </div>
    </TouchChrome>
  );
};

export default SetupView;
