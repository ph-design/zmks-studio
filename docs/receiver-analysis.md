# Receiver analysis

The connection page provides four synchronized time plots: received packets per second, decryption failure increments, USB management query duration, and observed keyboard link state. USB query duration is not radio latency. Unsupported RSSI, retry and loss metrics are not estimated.

Monitoring is opt-in for hardware and starts automatically for Demo. Pause preserves history; resume starts a new delta baseline. Hidden pages and busy transports skip queries. Failed reads leave missing samples and record an event. Counter rollback starts a new baseline. Data is limited to 3600 samples; the event list shows the latest 100 events. Time ranges are one minute, five minutes, or retained session history. Hover highlights a timestamp across plots; selecting an event switches to session history and highlights its timestamp. CSV exports retained samples with UTC timestamps.

Demo offers activity, idle keepalive, intermittent disconnection, decryption errors, counter reset and query failure scenarios. All operate without serial hardware. Changing scenarios resets the plotted session.

Validation: TypeScript and Vite production build passed. Chromium verified four plots, pause/resume, scenario switching, failure events, time range selection, CSV download and no document overflow at 390px. Real receiver hardware and native Tauri remain unverified. Polling cannot locate wireless state transitions more precisely than its sampling interval. Range brushing and firmware RSSI/channel scanning are not implemented in this phase.

## USB and Bluetooth management analysis

The connection page also probes the current Studio RPC transport using the read-only core.getDeviceInfo request. The four charts show successful queries per second, failed query increments, RPC round-trip duration and query response state. These are application management measurements, not HID report rate, key latency, radio packet loss or RSSI. A failed query is not proof of physical disconnection. Hardware monitoring is opt-in. Queries are sequential; a 3-second timeout is recorded as failure and no additional query is issued until the pending transport request settles. Pause or leaving the page stops scheduling new probes.

Demo provides USB and BLE timing profiles with stable, variable-delay and intermittent-failure scenarios, separate from the receiver simulation. CSV headers distinguish management queries from receiver packets. Browser checks passed for both profiles, eight total charts, failure events, pause/resume and 390px layout. Production build passed. Physical USB/BLE hardware has not been validated.
