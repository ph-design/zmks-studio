# Receiver indicator controls

The 2.4G panel shows keyboard battery telemetry and controls the receiver's user LED independently of keyboard lighting. The separate hardware charging indicator is unaffected.

## Using the panel

- Auto mode displays connection, unknown battery and low battery patterns.
- Always on and Off override the automatic pattern.
- Brightness uses hardware PWM, from 0 to 100%.
- The low-battery threshold is 5–50%; low-battery status clears at threshold + 5%.
- The blink cycle is 500–5000 ms.
- Apply changes runtime configuration. Save to receiver also persists it across reboot/unplugging.
- Identify receiver temporarily flashes at full brightness for five seconds, including when configured Off or 0%, then restores the configured mode.

Battery values are refreshed every five seconds while this panel is open and visible. A disconnected link or an unknown value displays Unknown. The keyboard's battery measurement interval is separate from this UI refresh interval.

## Receiver firmware contract

Firmware must expose `LED_CAPS=1` and valid configuration fields in `AT+2G4?`. Controls are unavailable on older firmware; pairing and existing status fields remain usable.

```text
AT+LED?
AT+LED=AUTO,100,20,2000
AT+LEDSAVE
AT+LEDIDENTIFY
```

The set command accepts mode (`AUTO`, `ON`, `OFF`), brightness (0–100), low-battery threshold (5–50), and blink cycle milliseconds (500–5000). It is runtime-only. The save command persists the current configuration. Invalid commands must return ERROR without changing configuration; failed persistence must return ERROR.

Status fields:

| Field | Values |
| --- | --- |
| BATTERY_PCT | 0–100; -1 or absent means unknown |
| LED_CAPS | 1 for this control protocol |
| LED_MODE | AUTO, ON, OFF |
| LED_BRIGHTNESS | 0–100 |
| LED_LOW_PCT | 5–50 |
| LED_PERIOD_MS | 500–5000 |
| LED_DIRTY | 1 for unsaved runtime changes, otherwise 0 |

LED settings are stored separately from wireless pairing under `dongle_led/config`. Configuration should survive restarting Studio. No setting is written merely by moving a slider.

## Validation

Run `bun test scripts/test-dongle-led.test.ts` for status parsing, older-firmware compatibility, and malformed/unknown telemetry cases. Browser interaction checks use the actual React components with simulated receiver responses; device persistence and PWM configuration need a receiver running compatible firmware.
