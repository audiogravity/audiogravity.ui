# Events API — Audiogravity Lit Components

**Last updated**: 2026-06-24  
**Architecture**: Event-driven with CustomEvents

> **Source of truth**: the `@fires` JSDoc annotations on each component. This
> file is a curated snapshot of the most stable events — run `grep -r "@fires"
> js/components/` for the complete up-to-date list.

---

## Overview

All Audiogravity Lit components use **CustomEvents** to communicate with their parent elements.

Standards across all components:
- All events use `bubbles: true, composed: true`
- Event names in **kebab-case**
- Payload always in the `detail` property
- Documented via JSDoc `@fires` annotations

---

## Architecture: 3 Types of Events

Audiogravity uses **3 distinct event mechanisms** with different purposes:

| Type | Mechanism | Scope | Usage | Examples |
|------|-----------|-------|-------|----------|
| **1. Component Events** | **CustomEvents** (this doc) | Local (parent ↔ child) | Component → Parent communication | `badge-click`, `save`, `tab-changed` |
| **2. Global UI State** | **@lit/context** | Global (app-wide) | UI state propagation | `theme`, `user`, `currentTab`, `connected` |
| **3. Real-time Data** | **EventBus** (EventEmitter) | Global (app-wide) | SSE data streams (1-2s) | `sysinfo-update`, `services-metrics` |

**Why 3 mechanisms?**
- **CustomEvents** : Standard DOM events for component composition (bubbling)
- **Context API** : Reactive global state for UI (avoid prop drilling)
- **EventBus** : High-frequency SSE data streams (avoid massive re-renders)

**See**: [JAVASCRIPT.md](./JAVASCRIPT.md) for architectural details on the 3 communication mechanisms.

---

## Atoms — Basic Events

### `<ag-badge>`
#### `badge-click`
**Fired when**: A clickable badge (`clickable` attribute) is clicked  
**Payload**: `{ type: string, label: string }`  
**Source**: [ag-badge.js:60](js/components/atoms/ag-badge.js#L60)

```javascript
badge.addEventListener('badge-click', (e) => {
    const { type, label } = e.detail;
    console.log(`Badge clicked: type=${type}, label=${label}`);
});
```

---

### `<ag-button>`
#### `btn-click`
**Fired when**: The button is clicked and is not disabled  
**Payload**: `{}`  
**Source**: [ag-button.js:69](js/components/atoms/ag-button.js#L69)

```javascript
button.addEventListener('btn-click', () => {
    console.log('Button clicked');
});
```

---

### `<ag-switch>`
#### `ag-change`
**Fired when**: The switch is toggled  
**Payload**: `{ checked: boolean }`  
**Source**: [ag-switch.js:53](js/components/atoms/ag-switch.js#L53)

```javascript
switchEl.addEventListener('ag-change', (e) => {
    console.log('Switch state:', e.detail.checked);
});
```

---

## Molecules — Composite Events

### `<ag-tabs>`
#### `tab-changed`
**Fired when**: The user changes the active tab  
**Payload**: `{ active: string, previous: string }`  
**Source**: [ag-tabs.js:73](js/components/molecules/ag-tabs.js#L73)

```javascript
tabs.addEventListener('tab-changed', (e) => {
    console.log(`Changed from ${e.detail.previous} to ${e.detail.active}`);
});
```

---

### `<ag-toast-notification>`
#### `toast-close`
**Fired when**: The toast is closed (automatically or manually)  
**Payload**: `{}`  
**Source**: [ag-toast-notification.js:87](js/components/molecules/ag-toast-notification.js#L87)

```javascript
toast.addEventListener('toast-close', () => {
    console.log('Toast closed');
});
```

---

### `<ag-service-card>`
#### `toggle-service`
**Fired when**: Start/Stop is triggered on a service  
**Payload**: `{ serviceId: string }`  
**Source**: [ag-service-card.js:63](js/components/molecules/ag-service-card.js#L63)

#### `toggle-enabled`
**Fired when**: A service is enabled/disabled at boot  
**Payload**: `{ serviceId: string, systemdUnit: string }`  
**Source**: [ag-service-card.js:72](js/components/molecules/ag-service-card.js#L72)

#### `metric-expanded-changed`
**Fired when**: A metric panel is expanded or collapsed  
**Payload**: `{}`  
**Source**: [ag-service-card.js:91](js/components/molecules/ag-service-card.js#L91)

#### `restart-service`
**Fired when**: A service restart is requested  
**Payload**: `{ serviceId: string }`  
**Source**: [ag-service-card.js:109](js/components/molecules/ag-service-card.js#L109)

```javascript
serviceCard.addEventListener('toggle-service', (e) => {
    const { serviceId } = e.detail;
    // Start or stop the service
});

serviceCard.addEventListener('restart-service', (e) => {
    restartService(e.detail.serviceId);
});
```

---

### `<ag-profile-card>`
#### `toggle-profile`
**Fired when**: An audio profile is activated or deactivated  
**Payload**: `{ profileId: string }`  
**Source**: [ag-profile-card.js:48](js/components/molecules/ag-profile-card.js#L48)

```javascript
profileCard.addEventListener('toggle-profile', (e) => {
    activateProfile(e.detail.profileId);
});
```

---

### `<ag-package-card>`
#### `package-action`
**Fired when**: A package installation or uninstallation is requested  
**Payload**: `{ packageId: string, action: 'install' | 'uninstall' }`  
**Source**: [ag-package-card.js:49](js/components/molecules/ag-package-card.js#L49)

#### `package-check-update`
**Fired when**: An update check is requested for a package  
**Payload**: `{ packageId: string }`  
**Source**: [ag-package-card.js:58](js/components/molecules/ag-package-card.js#L58)

```javascript
packageCard.addEventListener('package-action', (e) => {
    const { packageId, action } = e.detail;
    if (action === 'install') installPackage(packageId);
    else uninstallPackage(packageId);
});
```

---

### `<ag-governor-card>`
#### `governor-change`
**Fired when**: The user selects a new CPU governor  
**Payload**: `{ governor: string }`  
**Source**: [ag-governor-card.js:29](js/components/molecules/ag-governor-card.js#L29)

```javascript
governorCard.addEventListener('governor-change', (e) => {
    setCPUGovernor(e.detail.governor);
});
```

---

### `<ag-config-card>`
#### `edit-config`
**Fired when**: The user requests editing a configuration  
**Payload**: `{ serviceName: string }`  
**Source**: [ag-config-card.js:32](js/components/molecules/ag-config-card.js#L32)

```javascript
configCard.addEventListener('edit-config', (e) => {
    openConfigEditor(e.detail.serviceName);
});
```

---

### `<ag-systemd-card>`
#### `edit-service`
**Fired when**: The user opens the systemd override editor  
**Payload**: `{ serviceName: string }`  
**Source**: [ag-systemd-card.js:36](js/components/molecules/ag-systemd-card.js#L36)

#### `remove-override`
**Fired when**: The user removes a systemd override  
**Payload**: `{ serviceName: string }`  
**Source**: [ag-systemd-card.js:45](js/components/molecules/ag-systemd-card.js#L45)

#### `restore-backup`
**Fired when**: The user restores a configuration backup  
**Payload**: `{ serviceName: string, backupFile: string }`  
**Source**: [ag-systemd-card.js:54](js/components/molecules/ag-systemd-card.js#L54)

---

### `<ag-user-card>`
#### `edit-user`
**Fired when**: The user clicks the edit button on a user card  
**Payload**: `{ username: string }`  
**Source**: [ag-user-card.js:51](js/components/molecules/ag-user-card.js#L51)

#### `delete-user`
**Fired when**: The user clicks the delete button on a user card  
**Payload**: `{ username: string }`  
**Source**: [ag-user-card.js:59](js/components/molecules/ag-user-card.js#L59)

#### `toggle-user-status`
**Fired when**: The user enables or disables a user account  
**Payload**: `{ username: string, active: boolean }`  
**Source**: [ag-user-card.js:71](js/components/molecules/ag-user-card.js#L71)

---

### `<ag-hqplayer-output>`
#### `hqp-connected`
**Fired when**: A HQPlayer instance is successfully connected  
**Payload**: `{}`  
**Source**: [ag-hqplayer-output.js](js/components/molecules/ag-hqplayer-output.js)

#### `hqp-disconnected`
**Fired when**: The HQPlayer connection is removed  
**Payload**: `{}`  
**Source**: [ag-hqplayer-output.js](js/components/molecules/ag-hqplayer-output.js)

---

### `<ag-event-item>`
#### `event-click`
**Fired when**: An SSE event item in the history list is clicked  
**Payload**: `{ event: object }`  
**Source**: [ag-event-item.js:32](js/components/molecules/ag-event-item.js#L32)

```javascript
eventItem.addEventListener('event-click', (e) => {
    showEventDetails(e.detail.event);
});
```

---

## Organisms — Complex Events

### `<ag-modal>`
#### `modal-close`
**Fired when**: The modal is closed (backdrop click, ESC key, or close button)  
**Payload**: `{}`  
**Source**: [ag-modal.js:119](js/components/organisms/ag-modal.js#L119)

```javascript
modal.addEventListener('modal-close', () => {
    modal.show = false;
});
```

---

### `<ag-confirm-dialog>`
#### `dialog-confirm`
**Fired when**: The user clicks the confirm / OK button  
**Payload**: `{}`  
**Source**: [ag-confirm-dialog.js:87](js/components/organisms/ag-confirm-dialog.js#L87)

#### `dialog-cancel`
**Fired when**: The user clicks Cancel or presses ESC  
**Payload**: `{}`  
**Source**: [ag-confirm-dialog.js:79](js/components/organisms/ag-confirm-dialog.js#L79)

```javascript
dialog.addEventListener('dialog-confirm', () => deleteItem());
dialog.addEventListener('dialog-cancel', () => console.log('Cancelled'));
```

---

### `<ag-user-modal>`
#### `save`
**Fired when**: The form is submitted with valid data  
**Payload**: `{ payload: object, isEditing: boolean, originalUsername: string }`  
**Source**: [ag-user-modal.js:105](js/components/organisms/ag-user-modal.js#L105)

#### `cancel`
**Fired when**: The form is cancelled without saving  
**Payload**: `{}`  
**Source**: [ag-user-modal.js:73](js/components/organisms/ag-user-modal.js#L73)

#### `error`
**Fired when**: Validation fails (username too short, password too short, etc.)  
**Payload**: `string` (human-readable error message)  
**Source**: [ag-user-modal.js:84–92](js/components/organisms/ag-user-modal.js#L84)

```javascript
userModal.addEventListener('save', (e) => {
    const { username, password, role, active } = e.detail;
    saveUser(username, password, role, active);
});

userModal.addEventListener('error', (e) => {
    showToast(e.detail, 'error');
});
```

---

### `<ag-logs-modal>`
#### `close-request`
**Fired when**: The modal is closed normally  
**Payload**: `{}`  
**Source**: [ag-logs-modal.js:97](js/components/organisms/ag-logs-modal.js#L97)

#### `cancel-request`
**Fired when**: An ongoing installation is cancelled  
**Payload**: `{}`  
**Source**: [ag-logs-modal.js:101](js/components/organisms/ag-logs-modal.js#L101)

---

### `<ag-docs-modal>`
#### `docs-close`
**Fired when**: The documentation modal is closed  
**Payload**: `{}`  
**Source**: [ag-docs-modal.js:73](js/components/organisms/ag-docs-modal.js#L73)

---

### `<ag-event-detail-modal>`
#### `close-request`
**Fired when**: The event detail modal is closed  
**Payload**: `{}`  
**Source**: [ag-event-detail-modal.js:48](js/components/organisms/ag-event-detail-modal.js#L48)

---

### `<ag-config-editor>`
#### `back`
**Fired when**: The user navigates back to the form view  
**Payload**: `{}`  
**Source**: [ag-config-editor.js:241–245](js/components/organisms/ag-config-editor.js#L241)

#### `save`
**Fired when**: The configuration is saved (form or raw text mode)  
**Payload**: `{ mode: 'form' | 'raw', data: object | string, rawContent: string }`  
**Source**: [ag-config-editor.js:299](js/components/organisms/ag-config-editor.js#L299)

#### `restore`
**Fired when**: A configuration backup is restored  
**Payload**: `{ filename: string }`  
**Source**: [ag-config-editor.js:336](js/components/organisms/ag-config-editor.js#L336)

```javascript
configEditor.addEventListener('save', (e) => {
    const { formData, rawText } = e.detail;
    applyConfig(formData);
});
```

---

### `<ag-systemd-override-editor>`
#### `save`
**Fired when**: The systemd overrides are saved  
**Payload**: `{ properties: object, apply_immediately: boolean, service: object }`  
**Source**: [ag-systemd-override-editor.js:86](js/components/organisms/ag-systemd-override-editor.js#L86)

#### `cancel`
**Fired when**: The editor is cancelled without saving  
**Payload**: `{}`  
**Source**: [ag-systemd-override-editor.js:50](js/components/organisms/ag-systemd-override-editor.js#L50)

---

### `<ag-log-viewer>`
#### `filter-changed`
**Fired when**: The active log level filters change  
**Payload**: `{ levels: string[] }` — array of active levels (e.g. `['info', 'warning']`)  
**Source**: [ag-log-viewer.js:195](js/components/organisms/ag-log-viewer.js#L195)

#### `auto-refresh-toggled`
**Fired when**: The auto-refresh (live mode) is toggled on or off  
**Payload**: `{ enabled: boolean }`  
**Source**: [ag-log-viewer.js:214](js/components/organisms/ag-log-viewer.js#L214)

```javascript
logViewer.addEventListener('filter-changed', (e) => {
    console.log('Active levels:', e.detail.levels);
});

logViewer.addEventListener('auto-refresh-toggled', (e) => {
    console.log('Live mode:', e.detail.enabled);
});
```

---

### `<ag-history-panel>`
#### `clear-history`
**Fired when**: The user clears the event history  
**Payload**: `{}`  
**Source**: [ag-history-panel.js:44](js/components/organisms/ag-history-panel.js#L44)

---

### `<ag-top-bar>`
#### `burger-click`
**Fired when**: The burger menu button is clicked  
**Payload**: `{}` (no detail)  
**Source**: [ag-top-bar.js](js/components/organisms/ag-top-bar.js)

> `ag-top-bar` uses a generic `_emitAction(eventName)` helper. Check `@fires`
> annotations in the source for the current full list of dispatched events.

```javascript
topBar.addEventListener('burger-click', () => toggleSidebar());
```

---

## Summary

This file documents the most stable events. For a complete list run:

```bash
grep -r "@fires" js/components/ | sed 's/.*@fires //'
```

---

## Best Practices

### 1. Listening to Events
```javascript
// ✅ Always read from detail
component.addEventListener('event-name', (e) => {
    const { value } = e.detail;
    handleEvent(value);
});

// ❌ Never access properties directly on the event
component.addEventListener('event-name', (e) => {
    const value = e.value; // undefined — always use e.detail!
});
```

### 2. Cleanup
Lit events with `bubbles: true` and `composed: true` traverse the Shadow DOM boundary and bubble up the DOM tree. Since all Audiogravity components use **Light DOM** (`createRenderRoot() { return this; }`), there is no Shadow DOM boundary — events bubble normally. Manual `removeEventListener` is only needed for long-lived listeners attached to `document` or `window`.

### 3. Payload Typing
Always document payload type via JSDoc:
```javascript
/**
 * @fires save - Fired when the save button is clicked
 * @event save
 * @type {CustomEvent<{username: string, role: string, active: boolean}>}
 */
```

### 4. Dispatching Events (in Lit components)
```javascript
// Standard pattern used throughout the codebase
this.dispatchEvent(new CustomEvent('my-event', {
    detail: { key: value },
    bubbles: true,
    composed: true
}));
```

---

## References

- [CustomEvent — MDN Web Docs](https://developer.mozilla.org/en-US/docs/Web/API/CustomEvent)
- [Lit Events guide](https://lit.dev/docs/components/events/)
- [JAVASCRIPT.md](./JAVASCRIPT.md)
- [CSS Architecture](./CSS_ARCHITECTURE.md)

---

**Last updated**: 2026-06-24
