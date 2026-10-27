/**
 * @file Decide, before the first paint, whether it is Halloween — and keep it right.
 *
 * Every 31 October by the device's own clock, the app puts on its Halloween dress: spiders, bats,
 * an orange glow, ghosts on the empty pages (css/components/halloween.css). `?halloween` in the
 * address does the same on any day, to look at it. Says so with the `ag-halloween` class on
 * <html>, which every piece of the dress needs to be drawn at all and which the app's code reads
 * (js/core/HalloweenController.js): one rule, here, and nothing anywhere else reads the date.
 *
 * Before the first paint, because the splash screen wears it from its first frame — its wave
 * turns orange, its line changes — and swapped once the app's code had loaded, both would change
 * in front of the user. Then kept right while the page stays open: when the page comes back into
 * view — an installed app can stay open across midnight — and at midnight, for a screen left on
 * all night. At midnight or within the hour, whichever comes first: a timer counts its delay on
 * a clock of its own, so a device whose time is set late — a box's screen started before its
 * clock was right — would otherwise wait out a delay worked out from the wrong time, up to a day
 * (code review, 2026-10-27). Should this file fail to load, no dress — nothing else changes.
 *
 * A plain script, not a module, for the reasons theme-boot.js gives: it has to run before the
 * first paint, and the page's CSP forbids inline scripts. js/halloween-boot.test.js runs it.
 */
(function () {
    var CLASS = 'ag-halloween';
    var HOUR = 3600000;

    // Read once, as the page opens: the app then moves to other addresses without loading a new
    // page, and a look at the dress should not end with the first of them.
    var preview = /[?&]halloween(?:[=&]|$)/.test(location.search);
    var nextCheck = null;

    /** 31 October on the device's clock, or a look asked for in the address. */
    function isHalloween(now) {
        return preview || (now.getMonth() === 9 && now.getDate() === 31);
    }

    /** Milliseconds until the next midnight on the device's clock, and a second past it. */
    function untilMidnight(now) {
        var next = new Date(now.getTime());
        next.setHours(24, 0, 0, 0);
        return next - now + 1000;
    }

    /** Put the dress on or take it off, and read the date again at midnight or in an hour. */
    function check() {
        var now = new Date();
        document.documentElement.classList.toggle(CLASS, isHalloween(now));
        clearTimeout(nextCheck);
        nextCheck = setTimeout(check, Math.min(untilMidnight(now), HOUR));
    }

    check();
    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible') check();
    });
})();
