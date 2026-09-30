/**
 * @module latest-throttle
 * @description Rate-limit a stream of values without ever losing the last one.
 *
 * `throttle` (js/common.js) lets the first call through and drops the calls that
 * follow within its window — right for a metrics refresh, wrong for a control: the
 * value a volume drag ends on would be one of those dropped. This one sends the
 * first value at once, then at most one value per interval — always the latest —
 * and never leaves one unsent: a value still waiting at the end of the interval
 * goes out then, and `flush()` sends it at once (a slider's release).
 */

/**
 * Wrap a sender so that it receives at most one value per `intervalMs`.
 *
 * @template T
 * @param {(value: T) => void} send - Receives each value let through.
 * @param {number} intervalMs - Minimum time between two sends.
 * @returns {{push: (value: T) => void, flush: () => void, cancel: () => void}}
 *   `push` offers a value; `flush` sends the waiting one now, if any; `cancel`
 *   drops it.
 */
export function latestThrottle(send, intervalMs) {
    // Wrapped, so that a falsy value — volume 0 — still counts as waiting.
    let waiting = null;
    let timer = null;
    let lastSentAt = -Infinity;

    const sendWaiting = () => {
        clearTimeout(timer);
        timer = null;
        if (!waiting) return;
        const { value } = waiting;
        waiting = null;
        lastSentAt = Date.now();
        send(value);
    };

    return {
        push(value) {
            waiting = { value };
            if (timer) return; // the send already scheduled will carry this value
            // Never longer than one interval: a clock set back must not hold a
            // control for as long as it went back.
            const wait = Math.min(intervalMs, lastSentAt + intervalMs - Date.now());
            if (wait <= 0) sendWaiting();
            else timer = setTimeout(sendWaiting, wait);
        },
        flush: sendWaiting,
        cancel() {
            clearTimeout(timer);
            timer = null;
            waiting = null;
        },
    };
}
