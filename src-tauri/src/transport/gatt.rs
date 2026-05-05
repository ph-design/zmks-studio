use async_std::future::timeout;
use futures::{channel::mpsc::channel, FutureExt};
use futures::{StreamExt, TryFutureExt};

use std::collections::HashSet;
use std::time::{Duration, Instant};
use uuid::Uuid;

use bluest::{Adapter, ConnectionEvent, DeviceId};

use tauri::{command, AppHandle, State};

const SVC_UUID: Uuid = Uuid::from_u128(0x00000000_0196_6107_c967_c5cfb1c2482a);
const RPC_CHRC_UUID: Uuid = Uuid::from_u128(0x00000001_0196_6107_c967_c5cfb1c2482a);

#[command]
pub async fn gatt_connect(
    id: String,
    app_handle: AppHandle,
    state: State<'_, super::commands::ActiveConnection<'_>>,
) -> Result<bool, String> {
    let adapter = Adapter::default()
        .await
        .ok_or("Failed to access the BT adapter".to_string())?;

    adapter
        .wait_available()
        .await
        .map_err(|e| format!("Failed to wait for the BT adapter access: {}", e.message()))?;

    let device_id: DeviceId = serde_json::from_str(&id).unwrap();
    let d = adapter
        .open_device(&device_id)
        .await
        .map_err(|e| format!("Failed to open the device: {}", e.message()))?;

    if !d.is_connected().await {
        adapter
            .connect_device(&d)
            .await
            .map_err(|e| format!("Failed to connect to the device: {}", e.message()))?;
    }

    let service = d
        .discover_services_with_uuid(SVC_UUID)
        .await
        .map_err(|e| format!("Failed to find the device services: {}", e.message()))?
        .get(0)
        .cloned();

    if let Some(s) = service {
        let char = s
            .discover_characteristics_with_uuid(RPC_CHRC_UUID)
            .await
            .map_err(|e| {
                format!(
                    "Failed to find the studio service characteristics: {}",
                    e.message()
                )
            })?
            .get(0)
            .cloned();

        if let Some(c) = char {
            let c2 = c.clone();
            let ah1 = app_handle.clone();
            let notify_handle = tauri::async_runtime::spawn(async move {
                if let Ok(mut n) = c2.notify().await {
                    use tauri::Emitter;

                    while let Some(Ok(vn)) = n.next().await {
                        ah1.emit("connection_data", vn.clone());
                    }
                }
            });

            let ah2 = app_handle.clone();
            let disconnect_handle = tauri::async_runtime::spawn(async move {
                // Need to keep adapter from being dropped while active/connected
                let a = adapter;

                use tauri::Emitter;
                use tauri::Manager;

                if let Ok(mut events) = a.device_connection_events(&d).await {
                    while let Some(ev) = events.next().await {
                        if ev == ConnectionEvent::Disconnected {
                            let state = ah2.state::<super::commands::ActiveConnection>();
                            *state.conn.lock().await = None;

                            if let Err(e) = ah2.emit("connection_disconnected", ()) {
                                println!("ERROR RAISING! {:?}", e);
                            }

                            *state.conn.lock().await = None;
                        }
                    }
                };
            });

            let (send, mut recv) = channel(5);
            *state.conn.lock().await = Some(Box::new(send));
            tauri::async_runtime::spawn(async move {
                while let Some(data) = recv.next().await {
                    c.write(&data).await.expect("Write uneventfully");
                }

                disconnect_handle.abort();
                notify_handle.abort();
            });

            Ok(true)
        } else {
            Err(
                "Failed to connect: Unable to locate the required studio GATT characteristic"
                    .to_string(),
            )
        }
    } else {
        Err("Failed to connect: Unable to locate the required studio GATT service".to_string())
    }
}

const ADAPTER_TIMEOUT: Duration = Duration::from_secs(2);
const DISCOVERY_TIMEOUT: Duration = Duration::from_secs(2);
const DISCOVERY_SETTLE_TIMEOUT: Duration = Duration::from_millis(500);
const DEVICE_NAME_TIMEOUT: Duration = Duration::from_millis(500);

#[command]
pub async fn gatt_list_devices() -> Result<Vec<super::commands::AvailableDevice>, ()> {
    let adapter = Adapter::default()
        .map(|a| a.ok_or(()))
        .and_then(|a| async {
            timeout(ADAPTER_TIMEOUT, a.wait_available())
                .await
                .map_err(|_| ())
                .map(|_| a)
        })
        .await;

    let mut ret = vec![];

    if let Ok(a) = adapter {
        let devices = match a.discover_devices(&[SVC_UUID]).await {
            Ok(devices) => devices,
            Err(_) => return Ok(ret),
        };

        futures::pin_mut!(devices);
        let started_at = Instant::now();
        let mut seen_devices = HashSet::new();

        loop {
            let remaining = match DISCOVERY_TIMEOUT.checked_sub(started_at.elapsed()) {
                Some(remaining) => remaining,
                None => break,
            };
            let next_timeout = if ret.is_empty() {
                remaining
            } else {
                remaining.min(DISCOVERY_SETTLE_TIMEOUT)
            };

            let device = match timeout(next_timeout, devices.next()).await {
                Ok(Some(Ok(device))) => device,
                Ok(Some(Err(_))) => continue,
                Ok(None) | Err(_) => break,
            };

            let id = serde_json::to_string(&device.id()).unwrap();
            if !seen_devices.insert(id.clone()) {
                continue;
            }

            let label = timeout(DEVICE_NAME_TIMEOUT, device.name_async())
                .await
                .ok()
                .and_then(Result::ok)
                .unwrap_or("Unknown".to_string());

            ret.push(super::commands::AvailableDevice { label, id });
        }
    }

    Ok(ret)
}
