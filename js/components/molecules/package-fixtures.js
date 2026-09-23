/**
 * @module PackageFixtures
 * @description Sample package data shared by the Audio Software stories.
 *
 * Not used by the app: Storybook only. It exists because the same sample would
 * otherwise be pasted into each story that needs it, and a paste drifts from
 * what a box really serves without anything saying so.
 */

/**
 * The trial notice HQPlayer Embedded declares, as `packages-registry.json`
 * words it — copy it from there when that wording changes, so the stories keep
 * showing what a box actually serves.
 *
 * The tests deliberately do NOT use this: a component must display whatever
 * notice it is handed, so they pass their own text and would still pass if
 * this sentence changed.
 */
export const HQPLAYERD_TRIAL_NOTICE =
    'Without a licence key from Signalyst, HQPlayer Embedded stops taking commands '
    + '30 minutes after it starts — whether or not it played during that time. '
    + 'Restarting it from the Services tab gives another 30 minutes, and playback '
    + 'has to be started again.';
