/**
 * Unit tests for the splash screen of an installed app (PWA) and iOS's launch images.
 *
 * The screen (index.html, css/components/splash-screen.css, js/splash-screen.js) was
 * redrawn on 2026-10-08, the user's choice among three animated mock-ups: the app's icon,
 * its name and the landing's line, coming in one after the other, then a wave going out of
 * the icon while the app loads. It used to show a drawn key beating in JavaScript, stay at
 * least 2.5 s on every launch, sit on a fixed dark ground, and follow iOS's launch image —
 * the name alone, in an older typeface — with a jump.
 *
 * Covers:
 * 1. what the screen shows, on the launch images' ground whatever the theme
 * 2. how it moves — the wave short of the name, the app's Animations setting ignored,
 *    the device's Reduce motion honoured
 * 3. when it goes — after the entrance and one whole wave, counted from its first motion;
 *    and out of the page even when its fade never says it ended
 * 4. where it is: the app's page and the sign-in page, alike; shown only where
 *    public/splash-boot.js says (js/splash-boot.test.js), skipped by the pages that leave
 *    for the other one
 * 5. the launch images: the plain ground the entrance starts from, one per declared screen
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { readStylesheet, cssRuleBody } from './test-utils.js';
import { SplashScreen, SPLASH_MIN_DURATION, SPLASH_FADE_MAX, SPLASH_SKIP_KEY, skipNextSplash } from './splash-screen.js';
import { launchImages, darkGround, plainPng } from '../scripts/make-launch-images.mjs';

/** A page's splash screen, from its opening tag to the end of the element. */
const splashMarkup = (html) => {
    const start = html.indexOf('<div id="ag-splash-screen"');
    return html.slice(start, html.indexOf('</div>', html.indexOf('splash-tagline', start)) + '</div>'.length);
};

const INDEX = readStylesheet('index.html');
const CSS = readStylesheet('css', 'components', 'splash-screen.css');
const SPLASH = splashMarkup(INDEX);

describe('what the splash screen shows', () => {
    it('the app\'s icon at 96px, its name and the landing\'s line — no drawn key any more', () => {
        expect(SPLASH).toMatch(/<img class="ag-app-icon splash-app-icon"[^>]*width="96" height="96"/);
        expect(SPLASH).toMatch(/class="ag-wordmark splash-wordmark">Audiogravi<sup>ty<\/sup>/);
        expect(SPLASH).toMatch(/class="splash-tagline">Your audio chain, fully controlled</);
        expect(SPLASH).not.toMatch(/<svg|splash-icon/);
    });

    it('on the theme\'s tokens, no colour written as a value', () => {
        expect(cssRuleBody(CSS, '#ag-splash-screen')).toMatch(/background:\s*var\(--bg-primary\)/);
        expect(CSS.replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/);
        // The critical style of index.html paints it before the stylesheet is applied.
        expect(INDEX).toMatch(/#ag-splash-screen\s*\{[^}]*background-color:\s*var\(--bg-primary/);
    });

    it('those of the theme the launch images are painted from, whatever the user\'s', () => {
        // On the user's theme, a light one cut from iOS's black image to white at launch.
        const [, theme] = SPLASH.match(/<div id="ag-splash-screen" data-theme="(\w+)" class="dark-mode"/) ?? [];
        expect(theme).toBe('minimal');
        // scripts/make-launch-images.mjs reads that same theme's dark ground (its darkGround()
        // is tested below on that file).
        expect(readStylesheet('scripts', 'make-launch-images.mjs')).toMatch(/'themes', 'minimal\.css'/);
    });
});

describe('how the splash screen moves', () => {
    const px = (text) => Number(text.match(/(\d+(?:\.\d+)?)px/)?.[1]);

    it('lets the wave stop short of the name: 22px past a 96px icon, 32px to the name', () => {
        const scale = Number(CSS.match(/@keyframes splashWave\s*\{[^}]*\}[^}]*to\s*\{[^}]*scale\(([\d.]+)\)/)?.[1]);
        const below = px(cssRuleBody(CSS, '.splash-mark').match(/margin-bottom:\s*[^;]+/)[0]);
        const gap = px(cssRuleBody(CSS, '#ag-splash-screen').match(/gap:\s*[^;]+/)[0]);
        expect(scale).toBeGreaterThan(1);
        expect((96 * (scale - 1)) / 2).toBeLessThan(below + gap);
    });

    it('keeps moving with the app\'s Animations setting off — the user\'s choice', () => {
        // body.no-animations * shortens every animation with !important; the id outweighs it.
        const body = cssRuleBody(CSS, 'body.no-animations #ag-splash-screen *');
        expect(body).toMatch(/animation-duration:\s*var\(--splash-duration[^)]*\)\s*!important/);
        expect(body).toMatch(/animation-delay:\s*var\(--splash-delay[^)]*\)\s*!important/);
        expect(body).toMatch(/animation-iteration-count:\s*var\(--splash-count[^)]*\)\s*!important/);
    });

    it('moves nothing under the device\'s Reduce motion: no entrance, no wave', () => {
        const reduced = CSS.slice(CSS.indexOf('@media (prefers-reduced-motion: reduce)'));
        expect(reduced).toMatch(/\.splash-tagline\s*\{[^}]*animation:\s*none\s*!important/);
        expect(reduced).toMatch(/\.splash-wave\s*\{[^}]*display:\s*none/);
    });

    it('pulses the icon\'s light instead, in light only — it stood still, and showed nothing going on', () => {
        const reduced = CSS.slice(CSS.indexOf('@media (prefers-reduced-motion: reduce)'));
        // Through the id and !important: themes.css cuts every animation under this setting.
        const pulse = reduced.match(/#ag-splash-screen \.splash-app-icon\s*\{([^}]*)\}/)?.[1] ?? '';
        expect(pulse).toMatch(/animation:\s*splashPulse[^;]*var\(--splash-count\)\s*!important/);
        // Its timing in the custom properties the exemption from the app's setting restores.
        expect(pulse).toMatch(/--splash-duration:\s*\d+ms/);
        expect(pulse).toMatch(/--splash-count:\s*infinite/);
        const frames = CSS.match(/@keyframes splashPulse\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';
        expect(frames).toMatch(/opacity/);
        expect(frames, 'a pulse that moves').not.toMatch(/transform|scale|translate|width|height/);
    });

    it('moves in CSS only: the heartbeat drawn frame by frame in JavaScript is gone', () => {
        expect(readStylesheet('js', 'splash-screen.js')).not.toMatch(/requestAnimationFrame/);
    });
});

describe('when the splash screen goes', () => {
    let el;
    /** What public/splash-boot.js decided before the first paint. */
    const shown = (on) => document.documentElement.classList.toggle('splash-on', on);

    beforeEach(() => {
        document.body.innerHTML = '<div id="ag-splash-screen"><span class="splash-wave"></span></div>';
        el = document.getElementById('ag-splash-screen');
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    });
    afterEach(() => { vi.useRealTimers(); shown(false); });

    /** Dismiss the screen now, its minimum passed. */
    const dismissed = async () => {
        shown(true);
        new SplashScreen().init();
        await vi.advanceTimersByTimeAsync(SPLASH_MIN_DURATION);
        expect(el.classList.contains('dismissing')).toBe(true);
    };

    /** The custom properties of an element's rule of its own that names its timing. */
    const timing = (selector) => {
        const re = new RegExp(String.raw`\n${selector.replace('.', '\\.')}\s*\{([^}]*)\}`, 'g');
        const body = [...CSS.matchAll(re)].map((m) => m[1]).find((b) => /--splash-delay/.test(b));
        return { delay: Number(body.match(/--splash-delay:\s*(\d+)ms/)[1]), duration: Number(body.match(/--splash-duration:\s*(\d+)ms/)[1]) };
    };

    it('stays for the entrance and one whole wave: at 0.7 s it was gone before the wave was seen', () => {
        const line = timing('.splash-tagline');
        const wave = timing('.splash-wave');
        expect(SPLASH_MIN_DURATION).toBe(wave.delay + wave.duration);
        expect(SPLASH_MIN_DURATION).toBeGreaterThanOrEqual(line.delay + line.duration);
    });

    it('fades once the document is ready and the minimum has passed', async () => {
        shown(true);
        new SplashScreen().init();
        await vi.advanceTimersByTimeAsync(SPLASH_MIN_DURATION - 1);
        expect(el.classList.contains('dismissing')).toBe(false);
        await vi.advanceTimersByTimeAsync(1);
        expect(el.classList.contains('dismissing')).toBe(true);
    });

    it('counts from when the screen starts moving, not from the navigation\'s start', async () => {
        // On a phone the page loads behind iOS's launch image: the entrance starts later.
        shown(true);
        // The earliest of the screen's animations: under Reduce motion, the icon's pulse.
        el.getAnimations = () => [
            { ready: Promise.resolve(), startTime: 1400 },
            { ready: Promise.resolve(), startTime: 900 },
            { ready: Promise.reject(new Error('cancelled')), startTime: null },
        ];
        new SplashScreen().init();
        await vi.advanceTimersByTimeAsync(900 + SPLASH_MIN_DURATION - 1);
        expect(el.classList.contains('dismissing')).toBe(false);
        await vi.advanceTimersByTimeAsync(1);
        expect(el.classList.contains('dismissing')).toBe(true);
    });

    it('is taken out of the page where public/splash-boot.js did not show it', () => {
        shown(false);
        new SplashScreen().init();
        expect(document.getElementById('ag-splash-screen')).toBeNull();
    });

    it('leaves the page once its own fade has ended', async () => {
        await dismissed();
        el.dispatchEvent(new Event('transitionend', { bubbles: true }));
        expect(el.classList.contains('hidden')).toBe(true);
        await vi.advanceTimersByTimeAsync(100);
        expect(el.isConnected).toBe(false);
    });

    it('not on a child\'s transition, which bubbles up to it', async () => {
        await dismissed();
        el.querySelector('.splash-wave').dispatchEvent(new Event('transitionend', { bubbles: true }));
        expect(el.classList.contains('hidden')).toBe(false);
    });

    it('leaves anyway when its fade never says it ended — its waves would run on, unseen', async () => {
        await dismissed();
        await vi.advanceTimersByTimeAsync(SPLASH_FADE_MAX - 1);
        expect(el.classList.contains('hidden')).toBe(false);
        await vi.advanceTimersByTimeAsync(1);
        expect(el.classList.contains('hidden')).toBe(true);
        await vi.advanceTimersByTimeAsync(100);
        expect(el.isConnected).toBe(false);
    });

    it('gives the fade time to end before that: 400ms, and 150ms under Reduce motion', () => {
        const fade = Number(cssRuleBody(CSS, '#ag-splash-screen').match(/transition:\s*opacity\s+(\d+)ms/)[1]);
        expect(fade).toBe(400);
        expect(SPLASH_FADE_MAX).toBeGreaterThan(fade);
    });
});

describe('where the splash screen is', () => {
    it('on the sign-in page too, the same markup: a launch with no session lands there', () => {
        expect(splashMarkup(readStylesheet('login.html'))).toBe(SPLASH);
    });

    it('the same size there: it uses no step the sign-in page redefines for itself', () => {
        // css/login.css redefines a few steps on body.login-page: through them, the gap and
        // the line were 16px and 14px there, 12px and 13px on the app's page.
        const login = readStylesheet('css', 'login.css');
        const redefined = new Set([...login.matchAll(/^\s*(--[\w-]+):/gm)].map((m) => m[1]));
        expect(redefined.has('--spacing-md')).toBe(true);
        const used = [...CSS.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1]);
        expect(used.filter((name) => redefined.has(name))).toEqual([]);
    });

    it('started by each page\'s script — imported first, run once the module\'s imports have loaded', () => {
        for (const file of [['js', 'main.js'], ['js', 'login.js']]) {
            const source = readStylesheet(...file);
            expect(source, file.join('/')).toMatch(/import \{ splashScreen(, skipNextSplash)? \} from '\.\/splash-screen\.js';\s*splashScreen\.init\(\);/);
            expect(source, file.join('/')).not.toMatch(/Init first|\/\/ First:/);
        }
    });

    it('painted only where public/splash-boot.js says so — never in a tab, even for an instant', () => {
        expect(cssRuleBody(CSS, 'html:not(.splash-on) #ag-splash-screen')).toMatch(/display:\s*none/);
    });
});

describe('once per opening of the app', () => {
    afterEach(() => { sessionStorage.clear(); });

    it('a page about to leave for the other one marks the next as skipped, with the time', () => {
        vi.useFakeTimers({ now: 1_700_000_000_000 });
        skipNextSplash();
        expect(sessionStorage.getItem(SPLASH_SKIP_KEY)).toBe('1700000000000');
        vi.useRealTimers();
    });

    // Read in the sources: both handlers are wired at module load, with the whole app.
    it.each([
        ['a sign-out, on the way to the sign-in page', ['js', 'common.js'], /skipNextSplash\(\);\s*window\.location\.href = 'login\.html';/],
        ['a sign-in, on the way to the app', ['js', 'login.js'], /function redirectToDashboard\(\) \{[^}]*?skipNextSplash\(\);[\s\S]*?window\.location\.href/],
    ])('%s', (_, file, pattern) => {
        expect(readStylesheet(...file)).toMatch(pattern);
    });
});

describe('iOS\'s launch images', () => {
    /** A PNG's pixel size and colour type, read from its header. */
    const header = (file) => {
        const b = readFileSync(file);
        return { width: b.readUInt32BE(16), height: b.readUInt32BE(20), colourType: b[25] };
    };

    it.each(['index.html', 'login.html'])('— %s — one per declared screen, at that screen\'s size', (page) => {
        const images = launchImages(readStylesheet(page));
        expect(images.length).toBeGreaterThan(30);
        for (const { href, width, height, ratio } of images) {
            const file = path.join(process.cwd(), 'public', href);
            expect(existsSync(file), href).toBe(true);
            expect(header(file), href).toMatchObject({ width: width * ratio, height: height * ratio });
        }
    });

    it('are the plain ground the entrance starts from — the default theme\'s dark ground, nothing on it', () => {
        // They showed the screen at rest: the entrance then made the icon vanish and come
        // back, a flicker rather than an animation (user, 2026-10-08).
        const ground = darkGround(readStylesheet('css', 'themes', 'minimal.css'));
        const want = [1, 3, 5].map((i) => parseInt(ground.slice(i, i + 2), 16));
        // Every pixel of one, the iPhone 13 mini's (decoding all forty takes seconds)...
        const png = PNG.sync.read(readFileSync(path.join(process.cwd(), 'public', 'pics', 'splash', 'apple-splash-1125-2436.png')));
        let off = 0;
        for (let i = 0; i < png.data.length; i += 4) {
            if (png.data[i] !== want[0] || png.data[i + 1] !== want[1] || png.data[i + 2] !== want[2]) off++;
        }
        expect(off, `pixels other than ${ground}`).toBe(0);
        // ...and for each, what only a plain image can be: one grey channel, a few KB.
        for (const { href } of launchImages(INDEX)) {
            const file = path.join(process.cwd(), 'public', href);
            expect(header(file).colourType, href).toBe(0);
            expect(readFileSync(file).length, `${href} weighs more than a plain ground`).toBeLessThan(16 * 1024);
        }
    });

    it('the script reads a screen\'s size from its media query, landscape included', () => {
        const [portrait, landscape] = launchImages(`
            <link rel="apple-touch-startup-image" media="screen and (device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" href="pics/splash/a.png">
            <link rel="apple-touch-startup-image" media="screen and (device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3) and (orientation: landscape)" href="pics/splash/b.png">`);
        expect(portrait).toEqual({ href: 'pics/splash/a.png', width: 375, height: 812, ratio: 3 });
        expect(landscape).toEqual({ href: 'pics/splash/b.png', width: 812, height: 375, ratio: 3 });
    });

    it('the script writes one colour, in one grey channel when it is a grey', () => {
        const grey = plainPng(2, 1, '#000000');
        expect(grey[25]).toBe(0); // greyscale
        expect([...PNG.sync.read(grey).data]).toEqual([0, 0, 0, 255, 0, 0, 0, 255]);
        const colour = plainPng(1, 1, '#12141c');
        expect(colour[25]).toBe(2); // RGB
        expect([...PNG.sync.read(colour).data]).toEqual([0x12, 0x14, 0x1c, 255]);
    });

    it('the script reads the default theme\'s dark ground', () => {
        expect(darkGround(readStylesheet('css', 'themes', 'minimal.css'))).toBe('#000000');
    });
});
