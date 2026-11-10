/**
 * @file Decide, before the first paint, whether it is a day the app dresses up for — and keep it
 * right.
 *
 * Two days, by the device's own clock: every 31 October the app puts on its Halloween dress —
 * spiders, bats, an orange glow, ghosts on the empty pages (css/components/halloween.css) — and
 * every 24 and 25 December its splash screen puts on Christmas's: snow, Santa's sleigh, a tree and
 * two gifts by the icon (css/components/christmas.css). Says so with one class on <html> per day,
 * `ag-halloween` and `ag-christmas`, which every piece of that day's dress needs to be drawn at
 * all: one rule, here, and nothing anywhere else reads the date. Halloween's class is read by the
 * app's code too (js/core/HalloweenController.js), for the pieces its components draw;
 * Christmas's by the stylesheet alone.
 *
 * `?halloween` or `?christmas` in the address puts the class on, on any day. Halloween's dress can
 * then be looked at in a browser tab. Christmas's cannot: it dresses the splash screen alone, which
 * a tab never shows (public/splash-boot.js) — to see it before the day, set the device's date to
 * the 24th and open the installed app.
 *
 * Before the first paint, because the splash screen wears the day's dress from its first frame —
 * on Halloween its wave turns orange, on Christmas the snow falls, and its line changes — and
 * swapped once the app's code had loaded, it would change in front of the user. Then kept right
 * while the page stays open: when the page comes back into view — an installed app can stay open
 * across midnight — and at midnight, for a screen left on all night. At midnight or within the
 * hour, whichever comes first: a timer counts its delay on a clock of its own, so a device whose
 * time is set late — a box's screen started before its clock was right — would otherwise wait out
 * a delay worked out from the wrong time, up to a day (code review, 2026-10-27). Should this file
 * fail to load, no dress — nothing else changes.
 *
 * A plain script, not a module, for the reasons theme-boot.js gives: it has to run before the
 * first paint, and the page's CSP forbids inline scripts. js/holiday-boot.test.js runs it.
 */
(function () {
    var HOUR = 3600000;

    /**
     * The days the app dresses up for: the word that names each one — its class on <html> is
     * that word after `ag-`, and the same word in the address puts it on, on any day — and its
     * dates on the device's clock, a month (0 for January) and the days of that month.
     */
    var DAYS = [
        { name: 'halloween', month: 9, dates: [31] },
        { name: 'christmas', month: 11, dates: [24, 25] },
    ];

    // Read once, as the page opens: the app then moves to other addresses without loading a new
    // page, and a look at a dress should not end with the first of them.
    DAYS.forEach(function (day) {
        day.asked = new RegExp('[?&]' + day.name + '(?:[=&]|$)').test(location.search);
    });
    var nextCheck = null;

    /** One of the day's dates on the device's clock, or a look asked for in the address. */
    function isOn(day, now) {
        return day.asked || (now.getMonth() === day.month && day.dates.indexOf(now.getDate()) !== -1);
    }

    /** Milliseconds until the next midnight on the device's clock, and a second past it. */
    function untilMidnight(now) {
        var next = new Date(now.getTime());
        next.setHours(24, 0, 0, 0);
        return next - now + 1000;
    }

    /** Put each dress on or take it off, and read the date again at midnight or in an hour. */
    function check() {
        var now = new Date();
        DAYS.forEach(function (day) {
            document.documentElement.classList.toggle('ag-' + day.name, isOn(day, now));
        });
        clearTimeout(nextCheck);
        nextCheck = setTimeout(check, Math.min(untilMidnight(now), HOUR));
    }

    check();
    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible') check();
    });
})();
