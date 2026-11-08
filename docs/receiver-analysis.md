# Receiver analysis

The connection page provides four synchronized time plots: received packets per second, decryption failure increments, USB management query duration, and observed keyboard link state. USB query duration is not radio latency. Unsupported RSSI, retry and loss metrics are not estimated.

Monitoring is opt-in for hardware and starts automatically for Demo. Pause preserves history; resume starts a new delta baseline. Hidden pages and busy transports skip queries. Failed reads leave missing samples and record an event. Counter rollback starts a new baseline. Data is limited to 3600 samples; the event list shows the latest 100 events. Time ranges are one minute, five minutes, or retained session history. Hover highlights a timestamp across plots; selecting an event switches to session history and highlights its timestamp. CSV exports retained samples with UTC timestamps.

Demo offers activity, idle keepalive, intermittent disconnection, decryption errors, counter reset and query failure scenarios. All operate without serial hardware. Changing scenarios resets the plotted session.

Validation: TypeScript and Vite production build passed. Chromium verified four plots, pause/resume, scenario switching, failure events, time range selection, CSV download and no document overflow at 390px. Real receiver hardware and native Tauri remain unverified. Polling cannot locate wireless state transitions more precisely than its sampling interval. Range brushing and firmware RSSI/channel scanning are not implemented in this phase.
