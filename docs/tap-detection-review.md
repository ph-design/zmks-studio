# 敲击检测评估与实现记录

当前路径已经使用 LIS2DH12 的硬件 Click 引擎：驱动读取并缓存 CLICK_SRC，再派发单击 / 双击回调；HPCLICK 高通与 Click 中断锁存也已启用。因此不应先改为高频软件敲击识别，或把“没开高通”当作已确认原因。

## 当前证据

- Motion Guard 初始化请求 100 Hz ODR。ST 对硬件单击 / 双击推荐 400 Hz 或更高，当前工作点值得优先复核。TIME_LIMIT / LATENCY / WINDOW 的单位是 1/ODR，升频时必须重新换算并写入这些寄存器。[ST AN5005 第 8 节](https://www.st.com/resource/en/application_note/an5005-lis2dh12-ultralowpower-highperformance-3axis-nano-accelerometer-with-digital-output-stmicroelectronics.pdf)
- 当前 CLICK_CFG 仅启用 Y 轴单击 / 双击。哪个轴最适合外壳敲击，需要结合传感器安装方向、机壳结构和实际波形验证，不能假定 Y 轴最有效。
- `click_side()` 把 CLICK_SRC 的 SIGN 映射为左右侧。SIGN 表示加速度冲击的方向，单颗加速度计不能仅凭它可靠定位敲击发生在外壳哪一侧；结构振铃、触碰方向和桌面支撑都可能改变首个有效冲击方向。这里是工程推断，需要采样验证。

## 建议推进顺序

1. **先定位在哪一层丢失。** 读取实际 CTRL_REG1/2/3/4/6、CLICK_CFG/THS、三个时间寄存器；记录 GPIO 中断次数、缓存的 CLICK_SRC、单击 / 双击回调数和最终动作数。一次中断只读一次会清除锁存的源寄存器，应用使用缓存。先接调试计数，暂不触发键位动作。
2. **先让硬件单击稳定。** 独立试验 400 Hz ODR，保留 Guard 的 100 Hz 软件处理节奏；先做单一“敲击机身”动作，逐轴采样，暂不区分左右或双击。按实际量程把阈值换算为 mg，比较有效敲击、打字与放置动作的峰值 / 脉宽，设置阈值和 TIME_LIMIT。
3. **再恢复硬件双击。** 明确 LATENCY 的屏蔽区间与 WINDOW 的第二次触发区间，记录事件时间线，核对硬件双击与应用延后单击的仲裁不会重复输出或取消有效事件。
4. **最后评估左右侧。** 若侧向信号确实可分，再用轴方向、首脉冲和少量时序特征辅助判断；若不同桌面上不能稳定区分，就提供单一敲击手势，避免把冲击极性当作可靠位置。
5. **独立验证输入体验。** 覆盖左右敲击、轻重打字、桌面碰撞、放下、拿起和包内晃动。继续保留拿起锁定时禁止敲击动作的门控，传感器读取与识别不进入按键处理路径。

以上为 preview.6 时的排查方案；下面记录 preview.7 的实现。识别成功率仍需实测。

## Tap detection and driver corrections (preview.7)

LIS2DH normal 10-bit samples previously used an approximate full-scale conversion: nominal 1 g decoded to approximately 0.976 g. Conversion now uses the datasheet nominal sensitivity for each range and 8/10/12-bit mode, explicit signed little-endian decoding and 64-bit intermediate arithmetic. BDU prevents mixed high/low bytes. Tests execute the actual patched fetch/conversion/channel getters. Register order is X/Y/Z; physical PCB-to-case axis orientation has not been measured, so no speculative X/Y swap is applied. Studio shows sensor-axis values in mg for this measurement. Real sensor tolerances still apply.

Enabled tapping selects 400 Hz hardware ODR; disabling restores 100 Hz. The guard consumes frames at its existing approximately 100 Hz cadence. I2C remains on the sampler thread. The hardware click engine selects single OR double detection, rather than arming both bits on the same axis. Default mode is one case-wide gesture, all sensor axes, 120 ms typing quiet interval. Left/right-by-polarity remains an explicit experimental option and is not reliable physical localization. Existing right-side bindings are preserved while hidden in unified mode.

Double-only bindings use hardware double-click. When both single and double actions are assigned, hardware single events feed bounded software arbitration; single actions wait for the second-tap interval. Physical key processing gains no new delay. Tap dispatch waits 12 ms to allow a coincident physical key to veto it, and rejects held/recent keys, lift-lock transitions, stale configurations and queue overflow. Carry transitions clear pending gestures.

Studio provides a 60-second no-action test, GPIO/recognition/gesture/action/suppression counters, actual register snapshot and a bounded 32-frame waveform with actual timestamps. Test events remain non-executing even if processed after test expiry. Snapshot reads do not reread the self-clearing CLICK_SRC register. Test sampling is best-effort and is not an oscilloscope or guaranteed 400 Hz host recording.

Wire extension: Capabilities uint32 tap_version=11 is 1. TapConfig fields 11/12/13 are axes_mask (1..7), split_sides (bool), typing_quiet_ms (0..1000). Complete extensions are validated transactionally; old clients preserve current extra options. Requests 14/15/16 get diagnostics, set test (bool), get capture; responses 14/15/16 return diagnostics, acceptance, capture. Capture bytes are at most 256 bytes: 32 little-endian frames of uint16 milliseconds and int16 X/Y/Z mg. Options persist independently as tap/v1 only on explicit Save; reset includes this record. Existing binding fields remain unchanged. The messages module must provide nanopb.proto, as the pinned module does.

Validation: host policy and real-controller tests, actual driver functions across modes/ranges and fresh EVO compilation pass. Physical axis orientation, click recognition rate, false triggers, power use and real reboot persistence need user testing. No preview.7 keyboard flash was performed. The nominal scale correction slightly changes motion thresholds in physical units; repeat carrying/placement and typing checks after flashing.

References: [LIS2DH12 datasheet](https://www.st.com/resource/en/datasheet/lis2dh12.pdf), [ST AN5005](https://www.st.com/resource/en/application_note/an5005-lis2dh12-ultralowpower-highperformance-3axis-nano-accelerometer-with-digital-output-stmicroelectronics.pdf).

## Double-only gestures and progressive disclosure (preview.8)

Capabilities.tapVersion=2 advertises hardware double-click-only behavior, including no-action test mode. All stored single actions are inert; old wire/storage fields are retained for compatibility. There is no software single/double arbitration or triple-tap feature. Version 1 keeps its decoder and diagnostic compatibility; the UI warns that old firmware must apply a tap setting to clear saved singles, then explicitly save.

The page shows double bindings, relative threshold (not mg), double window and layers first, plus a battery-life notice. The final Advanced parameters and hardware test disclosure defaults closed. Its diagnostic component mounts only when expanded, so closing it stops polling and any test started there. Axes, direction split, typing quiet window and lower-level timings remain adjustable inside. The threshold conversion/defaults and carry classifier are unchanged in this revision; the reported hard-spacebar false lock remains unresolved.

Validation: double-only actual-controller regression, unchanged driver/guard/power/telemetry tests and fresh EVO build pass. Physical recognition and current consumption remain user tests.
