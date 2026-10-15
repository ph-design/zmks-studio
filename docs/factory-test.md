# Pre-shipment test flow

A bench tool inside this app, for testing a board before it gets packed. Four
things have to hold: every key fires, the IMU responds, the LEDs light, and the
shipping build is what is on the board.

It lives in `src/factory/` and is deliberately a separate application inside the
app — see `FactoryApp.tsx` for why. It is reachable from **Preferences → 产线 →
工厂测试**, behind the PIN in `DEFAULT_FACTORY_CONFIG`. `?factory=1` opens it
directly, which is what a bench shortcut or a kiosk launcher should use.

## The flow

The board arrives from the PCBA house with only its UF2 bootloader on it — the
house flashes the bootloader over J-Link before shipping, so nothing but the
bootloader is ever on it. That is the fact the whole design hangs off: because
there is no application firmware yet, attaching USB puts the board in
mass-storage mode with no button, no chord and no timing, and because the build
the bench flashes is the release artifact, **the build that gets tested is the
build that ships** rather than a test image that differs from it.

| # | Step | How it decides |
|---|---|---|
| 1 | 烧录固件 | Finds the UF2 volume by its `INFO_UF2.TXT` marker, checks the reported Model against the configured one, copies the newest `.uf2` from the bench folder, waits for the volume to disappear |
| 2 | 读取设备信息 | Attaches to the single USB serial device, retrying until it appears, then reads `core.getDeviceInfo` |
| 3 | 解锁键盘 | Polls `core.getLockState` and waits for the operator to press the unlock chord |
| 4 | 全键扫描 | Rewrites layer 0 so each position emits its own keystroke, then follows a squeegee sweep across the board: green means seen, all green passes it |
| 5 | IMU 动作检测 | Turns on `motion.setLiveStream` and judges the live state |
| 6 | RGB 灯光检查 | Walks red→green→blue→white, one look from the operator |
| 7 | 收尾与汇总 | `discardChanges`, `core.lock`, verify the lock, write the log line |

A failed step skips the remaining tests and jumps to the wrap-up: there is nothing
to learn from measuring the IMU on a unit that is already scrap, but the wrap-up
must still run so the board does not leave unlocked. Skipped steps are recorded as
`skip`, never as a pass, and re-testing a step clears that step and everything
after it — otherwise a retest that passes would leave the skipped steps skipped
and stamp the unit PASS with its IMU never tested.

## What each step can and cannot see

### Keys: a squeegee sweep, and why the code pool stops at Shift

`keymap`'s only notification is `unsavedChangesStatusChanged`. There is no
"position N was pressed" anywhere in the client, and a layer key emits no
keystroke at all, so watching the host cannot see the keymap directly.

The scan therefore manufactures the attribution. It writes a temporary layer in
which each position under test holds its own keystroke, and watches the host for
those keystrokes; a position whose code never arrives is a key that never fired.
Because each position in a group owns a distinct code, a neighbouring key cannot
pass for it either.

The operator drives this with a **squeegee dragged across the whole board**, which
is the part that decides the shape of the pool. A sweep holds several keys down at
once, so any code that is part of an OS chord is disqualified: put `Alt` in the
pool and a sweep becomes Alt+Tab and switches the app out from under the test; put
a Windows key in and the Start menu takes focus with it. The pool therefore stops
at `Shift` — 55 codes: letters, digits, punctuation, the six editing keys and both
Shifts. There is deliberately no tail of "last resort" codes; a board with more
positions than that takes another sweep instead, rotating through the same pool.

The rest of the pool's order comes from the repo's own history: `unlockPaths.ts`
records that **F13 never reaches the browser on Windows**, so nothing in the F-row
is used, and the window swallows every keystroke it recognises so a slipped-through
one cannot type into the app or reload it.

Limits worth stating plainly:

* Encoder *rotation* is not covered; only the encoder's press counts as a
  position.
* A key held down across a pass boundary is ignored for the next pass until it
  is released, which is why the settle window exists.
* A pass covers at most 55 positions, so a 60%-ish board takes two sweeps. The
  pane shows which pass is live and how many positions are still grey.
* One sweep only registers everything if the firmware reports **NKRO**. On a
  6KRO build a squeegee holding ten keys down drops reports, and the operator
  simply has to sweep more times — worth settling when the firmware is decided,
  since a single-pass sweep is the nicer bench experience.
* The test layer is never saved. `discardChanges` returns the device to the
  keymap in its flash, and a power cut mid-scan reverts on its own for the same
  reason.

### Locked firmware makes step 3 mandatory

The shipping build is locked, and locked firmware answers almost nothing — the
app's own shell shows a "Keyboard locked" screen in that state. There is also
**no unlock RPC**: `core` exposes `getDeviceInfo`, `getLockState`, `lock` and
`resetSettings`, so unlocking can only ever be a physical action. Studio can
watch for the result (`getLockState` is readable while locked) but can never do
it for the operator.

`core.lock` is also the one write in `core` with **no response field in the
proto** — it is fire-and-forget, so the wrap-up step can only read `getLockState`
back and report what it saw. A first bench run ended with "锁定未生效", and that
message now carries the observed state (`getLockState=<value>`) so the next run
tells us whether the request was refused or the state simply never changed.

So the bench flow always contains one human action at step 3 unless firmware
provides a factory channel. Two ways to remove it, both firmware-side:

1. Add `core.reset_to_bootloader`-style or unlock-on-request behaviour behind a
   factory build flag. Cheapest place for it is a *test* image, since a build
   that is only ever flashed by the bench never ships to a user.
2. Ship the bench build unlocked and flash the locked release build at the end.
   Costs a second flash and means the shipped keymap is no longer the one that
   was tested, so it is the weaker option.

Both are still open — the firmware side is being negotiated, so nothing here
depends on either landing. Until then the step simply asks the operator to press
the chord.

### IMU: already covered by `zmk.motion`

`setLiveStream` gives ~10 Hz of decoded state, which is enough to judge the
sensor without reading a register: no subsystem means no IMU, a sensor that is
present but unpowered reports nothing, and a working one responds to being
picked up. Any of three signals passes it (peak over threshold, a change of
orientation, a detected tap), so the operator does not have to learn a gesture.

Firmware without the subsystem is recorded as `skip`. That distinction is the
point: "this build has no IMU" and "the IMU works" must not look the same in the
log. **This step needs `zmk.motion` to have landed in firmware** — until then
every unit records `skip` here.

### RGB: one look, by necessity

`lighting` writes are fire-and-forget from the firmware's side, so
`setRgbUnderglowState` returning true proves the request arrived, not that a
single LED lit. A dead colour channel, an unsoldered data line or a reversed
strip all report success. The tool walks red, green, blue and white — which is
what makes a dead channel visible as a colour that never appears — and hands the
last millimetre to the operator. A light sensor or camera would cost more than
the defect it catches at this volume.

The pre-test state is written back afterwards, unsaved, so the shipped lighting
config is untouched.

### Flashing: why the app does not fetch builds itself

The bench folder (`firmwareDir`) is filled outside the app. Two reasons:
downloading a GitHub Actions artifact needs a token even for a public repo, and
the webview's CSP does not allow outbound requests, so an in-app fetch would mean
hiring credentials onto a bench PC *and* widening the app's network policy.

On the bench PC:

```sh
gh run download --repo ph-design/ph_lite-zmk-config --dir C:\zmk-firmware \
  --pattern "*.uf2" --name <artifact-name>
```

Artifacts also expire (90 days by default), so pinning a copy on the bench and
checking `modified_ms` — which the log records — is what makes a unit traceable
later. Publishing the build as a release asset instead of an artifact would allow
an anonymous download and remove the expiry, if the in-app fetch is wanted later.

## Bench setup

Three settings live in localStorage under `zmk-studio-factory-config`, edited by
`DEFAULT_FACTORY_CONFIG` defaults until someone adds a UI for them:

| Key | Why it matters |
|---|---|
| `firmwareDir` | Where the `.uf2` builds are. Empty means the step cannot run. |
| `expectedModel` | Substring matched against the bootloader's reported Model. Empty disables the check, and the UI keeps warning — a bench that flashes whatever volume happens to be mounted can brick a box of boards. |
| `pin` | Gate on the Preferences entry. Default is in the source; a line is expected to change it. |

The rest are tuning knobs for a board that needs them: `groupSize` (positions per
sweep, 55), `settleMs` (quiet window before a pass arms), `imuMagnitude` and
`rgbDwellMs`, `precheckMs` (30 s to prove the host path) and `noInputMs` (20 s of
absolute silence before the scan stops and explains itself).

`stallTimeoutMs` (90 s) is **idle time since the last new position**, not total
elapsed time. That distinction is the whole point: an earlier version counted from
the start of the scan, and a run was cut off after the operator pressed a single
key — the tool had been counting down while the operator was still reading the
screen. Counting from the last progress means a slow sweep and a second sweep are
never punished, while a genuinely dead key still cannot hold the line up forever.
The pane shows the idle countdown, so nobody has to guess whether the tool is
stuck. When it fires with at least one position seen, the unreached positions are
named in the verdict.

What it does *not* do is produce a verdict on its own when nothing was measured:
see the table below.

## When the scan reports no keys

The first bench run of this flow hung for two and a half minutes at the key scan
and then reported all 62 positions as unresponsive. Nothing was wrong with the
board: the scan simply had no way to tell "the operator did not sweep it yet" from
"this computer never saw the keyboard's keystrokes" from "the test keymap never
took effect", so it waited, and then blamed every key.

Three guards now separate those cases, in the order they can fire:

| Guard | Proves | Failure means |
|---|---|---|
| Pre-check: type into a focused textarea before anything is written | The host receives this keyboard's keystrokes | Focus, USB/BLE output selection, cable or keyboard — the checklist names all three |
| Read the first written pass back and compare | The temporary keymap took effect | Firmware accepted and dropped the write; report to firmware |
| `noInputMs` of silence with a pass armed | — | Stops the scan and reports which of the two above it is, from whether the pre-check had passed |
| `stallTimeoutMs` idle with **zero** positions seen | — | Stops with the checklist rather than a verdict: it is the same "nothing was measured" case, and the one an operator hits while working out how the tool behaves |

The pre-check is also what focuses the window: the textarea is autofocused, so the
most common cause (a window that lost focus, where keystrokes are simply not
delivered to the app) is settled before a single binding is written.

Neither guard produces a unit verdict. "Nothing arrived" is an environment
problem, so the step stops with the checklist and a rescan button rather than
stamping FAIL on a board nobody managed to test.

A *partial* sweep is different and does judge: positions that answered and
positions that did not, on one board, is what a real fault looks like. Pressing
结束扫描并判定 always judges, because that is the operator overruling the tool.

One more thing the scan can now say out loud: a keystroke that matches no position
in the live sweep. During a sweep every tested position holds a code of its own and
everything else is `&none`, so such a keystroke cannot have come from the keyboard
under test — it is the bench PC's own keyboard, and it used to look exactly like a
board where nothing was pressed.

## What this does not cover

* BLE. The flow assumes USB, because the key scan needs the keyboard's HID output
  to arrive at the same host, and because the bootloader step is USB-only.
* Per-LED verification, as above.
* Encoder rotation.
* The keymap a unit ships with beyond "the positions all fire": the scan replaces
  layer 0, so the shipped bindings are verified only insofar as they are restored.

## Verifying the flow itself

1. Bare board, nothing flashed: plug in, confirm step 1 finds the volume and the
   Model matches `expectedModel`, and that a mismatch refuses to write.
2. Pull the cable mid-scan on purpose: reconnect, confirm the keyboard comes back
   with its shipped keymap (nothing was saved) and is still locked.
3. Bench a unit with one deliberate fault (a key unsoldered, an LED disconnected)
   and check the log records `fail` on the right step.
4. Move the unconfigured-firmware case: a build with no `zmk.motion` must log
   `skip` for step 5 and still reach a verdict.
