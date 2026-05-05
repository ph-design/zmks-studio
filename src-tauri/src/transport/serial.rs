use blocking::unblock;
use futures::channel::mpsc::channel;
use futures::StreamExt;
use std::collections::HashMap;

use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio_serial::{available_ports, SerialPortBuilderExt, SerialPortType};

use tauri::{command, AppHandle, State};
use tauri_plugin_cli::CliExt;

const READ_BUF_SIZE: usize = 1024;

#[cfg(windows)]
use std::{mem, ptr};

#[cfg(windows)]
use winapi::shared::devpkey::DEVPKEY_Device_BusReportedDeviceDesc;
#[cfg(windows)]
use winapi::shared::guiddef::GUID;
#[cfg(windows)]
use winapi::shared::minwindef::{DWORD, FALSE};
#[cfg(windows)]
use winapi::um::cguid::GUID_NULL;
#[cfg(windows)]
use winapi::um::handleapi::INVALID_HANDLE_VALUE;
#[cfg(windows)]
use winapi::um::setupapi::{
    SetupDiClassGuidsFromNameW, SetupDiDestroyDeviceInfoList, SetupDiEnumDeviceInfo,
    SetupDiGetClassDevsW, SetupDiGetDevicePropertyW, SetupDiOpenDevRegKey, DICS_FLAG_GLOBAL,
    DIGCF_PRESENT, DIREG_DEV, SP_DEVINFO_DATA,
};
#[cfg(windows)]
use winapi::um::winnt::{KEY_READ, REG_SZ};
#[cfg(windows)]
use winapi::um::winreg::{RegCloseKey, RegQueryValueExW};

#[cfg(windows)]
fn as_utf16(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(Some(0)).collect()
}

#[cfg(windows)]
fn from_utf16_lossy_trimmed(value: &[u16]) -> String {
    String::from_utf16_lossy(value)
        .trim_end_matches(char::from(0))
        .trim()
        .to_string()
}

#[cfg(windows)]
fn port_class_guids() -> Vec<GUID> {
    let class_name = as_utf16("Ports");
    let mut guid_count: DWORD = 1;
    let mut guids = vec![GUID_NULL];

    for _ in 0..2 {
        guids.resize(guid_count as usize, GUID_NULL);
        let result = unsafe {
            SetupDiClassGuidsFromNameW(
                class_name.as_ptr(),
                guids.as_mut_ptr(),
                guids.len() as DWORD,
                &mut guid_count,
            )
        };

        if result == FALSE {
            return Vec::new();
        }

        if guid_count as usize <= guids.len() {
            guids.truncate(guid_count as usize);
            return guids;
        }
    }

    Vec::new()
}

#[cfg(windows)]
fn device_port_name(
    device_info_set: winapi::um::setupapi::HDEVINFO,
    device_info: &mut SP_DEVINFO_DATA,
) -> Option<String> {
    let registry_key = unsafe {
        SetupDiOpenDevRegKey(
            device_info_set,
            device_info,
            DICS_FLAG_GLOBAL,
            0,
            DIREG_DEV,
            KEY_READ,
        )
    };

    if registry_key.is_null() || registry_key as *mut _ == INVALID_HANDLE_VALUE {
        return None;
    }

    let value_name = as_utf16("PortName");
    let mut value_type = 0;
    let mut port_name_buffer = [0u16; 260];
    let mut byte_len = (port_name_buffer.len() * mem::size_of::<u16>()) as DWORD;

    let result = unsafe {
        RegQueryValueExW(
            registry_key,
            value_name.as_ptr(),
            ptr::null_mut(),
            &mut value_type,
            port_name_buffer.as_mut_ptr() as *mut u8,
            &mut byte_len,
        )
    };
    unsafe { RegCloseKey(registry_key) };

    if result != 0 || value_type != REG_SZ || byte_len % 2 != 0 {
        return None;
    }

    let utf16_len = (byte_len as usize / mem::size_of::<u16>()).min(port_name_buffer.len());
    let port_name = from_utf16_lossy_trimmed(&port_name_buffer[..utf16_len]);

    if port_name.is_empty() {
        None
    } else {
        Some(port_name)
    }
}

#[cfg(windows)]
fn device_bus_reported_name(
    device_info_set: winapi::um::setupapi::HDEVINFO,
    device_info: &mut SP_DEVINFO_DATA,
) -> Option<String> {
    let mut property_type = 0;
    let mut required_size = 0;
    let mut property_buffer = [0u16; 260];

    let result = unsafe {
        SetupDiGetDevicePropertyW(
            device_info_set,
            device_info,
            &DEVPKEY_Device_BusReportedDeviceDesc,
            &mut property_type,
            property_buffer.as_mut_ptr() as *mut u8,
            (property_buffer.len() * mem::size_of::<u16>()) as DWORD,
            &mut required_size,
            0,
        )
    };

    if result == FALSE || required_size == 0 {
        return None;
    }

    let utf16_len = (required_size as usize / mem::size_of::<u16>()).min(property_buffer.len());
    let label = from_utf16_lossy_trimmed(&property_buffer[..utf16_len]);

    if label.is_empty() {
        None
    } else {
        Some(label)
    }
}

#[cfg(windows)]
fn windows_serial_port_labels() -> HashMap<String, String> {
    let mut labels = HashMap::new();

    for class_guid in port_class_guids() {
        let device_info_set = unsafe {
            SetupDiGetClassDevsW(&class_guid, ptr::null(), ptr::null_mut(), DIGCF_PRESENT)
        };

        if device_info_set == INVALID_HANDLE_VALUE {
            continue;
        }

        let mut member_index = 0;
        loop {
            let mut device_info = SP_DEVINFO_DATA {
                cbSize: mem::size_of::<SP_DEVINFO_DATA>() as DWORD,
                ClassGuid: GUID_NULL,
                DevInst: 0,
                Reserved: 0,
            };

            let result =
                unsafe { SetupDiEnumDeviceInfo(device_info_set, member_index, &mut device_info) };

            if result == FALSE {
                break;
            }

            if let (Some(port_name), Some(label)) = (
                device_port_name(device_info_set, &mut device_info),
                device_bus_reported_name(device_info_set, &mut device_info),
            ) {
                labels.insert(port_name, label);
            }

            member_index += 1;
        }

        unsafe { SetupDiDestroyDeviceInfoList(device_info_set) };
    }

    labels
}

#[cfg(not(windows))]
fn windows_serial_port_labels() -> HashMap<String, String> {
    HashMap::new()
}

fn clean_descriptor_part(value: &str, port_name: &str) -> String {
    let mut cleaned = value.trim().to_string();
    let port_suffix = format!(" ({port_name})");

    while cleaned.ends_with(&port_suffix) {
        cleaned.truncate(cleaned.len() - port_suffix.len());
        cleaned = cleaned.trim().to_string();
    }

    cleaned
}

fn is_generic_usb_serial_label(value: &str) -> bool {
    let lower = value.to_lowercase();

    lower.contains("microsoft")
        || lower.contains("usb serial")
        || lower.contains("usb 串行")
        || lower.contains("usb 串口")
}

fn serial_device_label(
    port_name: &str,
    manufacturer: &Option<String>,
    product: &Option<String>,
    vid: u16,
    pid: u16,
    windows_labels: &HashMap<String, String>,
) -> String {
    if let Some(label) = windows_labels.get(port_name) {
        return format!("{} ({})", label, port_name);
    }

    let manufacturer = manufacturer
        .as_ref()
        .map(|value| clean_descriptor_part(value, port_name))
        .filter(|value| !value.is_empty());
    let product = product
        .as_ref()
        .map(|value| clean_descriptor_part(value, port_name))
        .filter(|value| !value.is_empty());

    let descriptor_is_generic = manufacturer
        .as_ref()
        .map(|value| is_generic_usb_serial_label(value))
        .unwrap_or(false)
        || product
            .as_ref()
            .map(|value| is_generic_usb_serial_label(value))
            .unwrap_or(false);

    if descriptor_is_generic && vid == 0x1d50 && pid == 0xff10 {
        return format!("ZMK Studio USB ({})", port_name);
    }

    match (manufacturer, product) {
        (Some(mfr), Some(prod)) => format!("{} {} ({})", mfr, prod, port_name),
        (None, Some(prod)) => format!("{} ({})", prod, port_name),
        (Some(mfr), None) => format!("{} ({})", mfr, port_name),
        (None, None) => format!("USB Device ({})", port_name),
    }
}

#[command]
pub async fn serial_connect(
    id: String,
    app_handle: AppHandle,
    state: State<'_, super::commands::ActiveConnection<'_>>,
) -> Result<bool, String> {
    match tokio_serial::new(id, 9600).open_native_async() {
        Ok(mut port) => {
            #[cfg(unix)]
            port.set_exclusive(false)
                .expect("Unable to set serial port exclusive to false");

            let (mut reader, mut writer) = tokio::io::split(port);

            let ahc = app_handle.clone();
            let (send, mut recv) = channel(5);
            *state.conn.lock().await = Some(Box::new(send));

            let read_process = tauri::async_runtime::spawn(async move {
                use tauri::Emitter;
                use tauri::Manager;

                let mut buffer = vec![0; READ_BUF_SIZE];
                while let Ok(size) = reader.read(&mut buffer).await {
                    if size > 0 {
                        app_handle.emit("connection_data", &buffer[..size]);
                    } else {
                        break;
                    }
                }

                let state = app_handle.state::<super::commands::ActiveConnection>();
                *state.conn.lock().await = None;

                app_handle.emit("connection_disconnected", ());
            });

            tauri::async_runtime::spawn(async move {
                use tauri::Manager;

                while let Some(data) = recv.next().await {
                    let _res = writer.write(&data).await;
                }

                let state = ahc.state::<super::commands::ActiveConnection>();
                read_process.abort();
                *state.conn.lock().await = None;
            });

            Ok(true)
        }
        Err(e) => Err(format!("Failed to open the serial port: {}", e.description)),
    }
}

#[command]
pub async fn serial_list_devices(
    app_handle: AppHandle,
) -> Result<Vec<super::commands::AvailableDevice>, ()> {
    let ports = unblock(|| available_ports()).await.unwrap();
    let windows_labels = windows_serial_port_labels();

    let mut candidates = ports
        .into_iter()
        .filter_map(|pi| {
            if let SerialPortType::UsbPort(u) = pi.port_type {
                let label = serial_device_label(
                    &pi.port_name,
                    &u.manufacturer,
                    &u.product,
                    u.vid,
                    u.pid,
                    &windows_labels,
                );
                Some(super::commands::AvailableDevice {
                    id: pi.port_name,
                    label,
                })
            } else {
                None
            }
        })
        .collect::<Vec<_>>();

    match app_handle.cli().matches() {
        Ok(m) => {
            if let Some(p) = m.args.get("serial-port") {
                if let serde_json::Value::String(path) = &p.value {
                    candidates.push(super::commands::AvailableDevice {
                        id: path.to_string(),
                        label: format!("CLI Port: {path}").to_string(),
                    })
                }
            }
        }
        Err(_) => {}
    }

    Ok(candidates)
}
