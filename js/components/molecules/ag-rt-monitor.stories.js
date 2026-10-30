import './ag-rt-monitor.js';

export default {
    title: 'Molecules/AgRtMonitor',
    tags: ['autodocs'],
};

const Template = () => {
    const el = document.createElement('ag-rt-monitor');
    return el;
};

export const Default = Template.bind({});
Default.args = {};

/**
 * Rows as the core sends them, without a backend: MPD read on its sound threads, one
 * outranked by the rest of MPD (a real-time policy on the whole service), a stopped one.
 * @param {Array<Object>} processes
 * @returns {HTMLElement}
 */
const withRows = (processes) => {
    const el = document.createElement('ag-rt-monitor');
    el._load = async () => {
        el._processes = processes;
        el._loading = false;
    };
    return el;
};

const MPD = { name: 'mpd', pid: 838, running: true, policy: 'SCHED_FIFO', priority: 40,
    is_rt: true, audio_threads: true, outranked: false };

export const SoundThreads = {
    render: () => withRows([MPD,
        { name: 'shairport-sync', pid: 840, running: true, policy: 'SCHED_RR', priority: 20, is_rt: true },
        { name: 'RoonBridge', running: false }]),
};

export const Outranked = { render: () => withRows([{ ...MPD, outranked: true }]) };

