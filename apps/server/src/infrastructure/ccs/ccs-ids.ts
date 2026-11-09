import type { ZagFlag } from '@zag/protocol';

// Identifiers of the ZAG project in CCS (admin.expolightcontrols.net), taken
// from a live `getPrograms()` dump (docs/backend/ccs-goups.json,
// docs/backend/ccs-ids.md). They are the
// defaults for CCS_STATE_GROUP / CCS_CONTROLS_GROUP / CCS_PROGRAM_*; env
// still overrides them.

/** ZAG project id: login `project`, `joinRoom` room, `getPrograms` query. */
export const CCS_PROJECT_ID = 'hzwbupoitdpg';

/** Group "Public app state": one SWITCH program per app flag. */
export const CCS_STATE_GROUP_ID = '6aef145253257f190d66c47b';

export const CCS_STATE_PROGRAMS: Readonly<Record<ZagFlag, string>> = {
  techPause: 'qduuwcanagbl', // "Maintenance"
  interactive: 'qxcsxqatyupx', // "Allow interactive"
  locationRestriction: 'azpuqosabwug', // "Location restriction"
  schedule: 'edbyrttglacr', // "Schedule"
};

/**
 * Group "Public app controls": stateless buttons the app triggers; each
 * relays the same-named command to the device "SR7 Facade Interactive"
 * (group `public_app`). Source: docs/backend/ccs-goups.json.
 */
export const CCS_CONTROLS_GROUP_ID = '6aef0c3e53257f190d66c477';

export const CCS_CONTROL_PROGRAMS = {
  sessionStart: 'ospyruigxyop', // WITH_PARAMS → session_start
  sessionEnd: 'fwzxaqlwzwbu', // COMMAND → session_end
  fade: 'crcerfeeroxz', // WITH_PARAMS → fade
  idle: 'ueplzvoyanld', // COMMAND → idle
} as const;
