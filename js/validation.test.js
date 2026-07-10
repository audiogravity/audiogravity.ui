/**
 * Unit tests for validation.js.
 *
 * Covers:
 * - validateAudioConfig(): posts to /config_validation/validate
 * - validateTopologyConfig(): posts to /config_validation/validate-topology,
 *   returns the API response, and rethrows on failure
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('lit', () => ({ html: (strings, ...values) => ({ strings, values }) }));
vi.mock('./api.js', () => ({ apiPost: vi.fn() }));
vi.mock('./components/ui-helpers.js', () => ({ showConfirm: vi.fn() }));

import { apiPost } from './api.js';
import { validateAudioConfig, validateTopologyConfig } from './validation.js';

describe('validation.js', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('validateAudioConfig', () => {
        it('posts the config to the audio-config validation route', async () => {
            const result = { valid: true, errors: [], warnings: [] };
            apiPost.mockResolvedValue(result);

            const config = { services: {} };
            await expect(validateAudioConfig(config)).resolves.toBe(result);
            expect(apiPost).toHaveBeenCalledWith('/config_validation/validate', config);
        });
    });

    describe('validateTopologyConfig', () => {
        it('posts the topology to the topology validation route', async () => {
            const result = { valid: true, errors: [], warnings: [] };
            apiPost.mockResolvedValue(result);

            const topology = { hifi_topology: { devices: {} } };
            await expect(validateTopologyConfig(topology)).resolves.toBe(result);
            expect(apiPost).toHaveBeenCalledWith('/config_validation/validate-topology', topology);
        });

        it('returns the validation response verbatim (errors + warnings)', async () => {
            const result = {
                valid: false,
                errors: [{ location: 'root', message: 'bad', type: 'x' }],
                warnings: ['w1'],
            };
            apiPost.mockResolvedValue(result);

            await expect(validateTopologyConfig({})).resolves.toEqual(result);
        });

        it('rethrows when the API call fails', async () => {
            apiPost.mockRejectedValue(new Error('network down'));
            await expect(validateTopologyConfig({})).rejects.toThrow('network down');
        });
    });
});
