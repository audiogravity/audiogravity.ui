/**
 * Unit tests for HalloweenController: a component in step with the app's Halloween dress.
 *
 * Covers:
 * 1. isHalloween reads the class on <html>, and nothing else
 * 2. a host renders its part when the class comes, and again when it goes
 * 3. another class's change costs it no render
 * 4. a removed host is no longer told
 */
import { describe, it, expect, afterEach } from 'vitest';
import { LitElement, html } from 'lit';
import { HalloweenController, HALLOWEEN_CLASS, isHalloween } from './HalloweenController.js';

class HalloweenHost extends LitElement {
    constructor() {
        super();
        this.halloween = new HalloweenController(this);
        this.renders = 0;
    }

    createRenderRoot() { return this; }

    render() {
        this.renders += 1;
        return html`${this.halloween.on ? 'boo' : 'plain'}`;
    }
}
customElements.define('test-halloween-host', HalloweenHost);

/** The class changes; the observer hears it at the next microtask. */
async function turn(on, host) {
    document.documentElement.classList.toggle(HALLOWEEN_CLASS, on);
    await Promise.resolve();
    await host?.updateComplete;
}

async function mount() {
    const host = document.createElement('test-halloween-host');
    document.body.append(host);
    await host.updateComplete;
    return host;
}

afterEach(() => {
    document.documentElement.classList.remove(HALLOWEEN_CLASS, 'dark-mode');
    document.body.replaceChildren();
});

describe('isHalloween', () => {
    it('is the class on <html>', async () => {
        expect(HALLOWEEN_CLASS).toBe('ag-halloween');
        expect(isHalloween()).toBe(false);
        await turn(true);
        expect(isHalloween()).toBe(true);
        // On the body, it is not the day's: halloween-boot.js puts it on <html>.
        await turn(false);
        document.body.classList.add(HALLOWEEN_CLASS);
        expect(isHalloween()).toBe(false);
        document.body.classList.remove(HALLOWEEN_CLASS);
    });
});

describe('HalloweenController', () => {
    it('reads the day as its host connects', async () => {
        await turn(true);
        const host = await mount();
        expect(host.halloween.on).toBe(true);
        expect(host.textContent).toBe('boo');
    });

    it('renders its host again when the day comes, and when it goes', async () => {
        const host = await mount();
        expect(host.textContent).toBe('plain');
        await turn(true, host);
        expect(host.textContent).toBe('boo');
        await turn(false, host);
        expect(host.textContent).toBe('plain');
    });

    it('costs its host no render when another class of <html> changes', async () => {
        const host = await mount();
        const renders = host.renders;
        document.documentElement.classList.add('dark-mode');
        await Promise.resolve();
        await host.updateComplete;
        expect(host.renders).toBe(renders);
    });

    it('tells a removed host nothing, and reads the day again when it comes back', async () => {
        const host = await mount();
        host.remove();
        await turn(true);
        expect(host.halloween.on).toBe(false);
        document.body.append(host);
        await host.updateComplete;
        expect(host.halloween.on).toBe(true);
        expect(host.textContent).toBe('boo');
    });
});
