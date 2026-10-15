//! Bench support for the factory (pre-shipment) flow.
//!
//! Two things the app has no way to do otherwise:
//!
//!  * find the board while it is still sitting in its UF2 bootloader — there is
//!    no Studio connection at that point, so nothing in the RPC surface helps;
//!  * hand a .uf2 build to the bootloader, which is done by copying the file
//!    onto the mass-storage volume the bootloader exposes.
//!
//! Detection is deliberately marker-file based: every UF2 bootloader this
//! project ships drops `INFO_UF2.TXT` at the volume root. That needs no extra
//! crates, works on any of the three desktop platforms, and — importantly —
//! means "no marker" can never be mistaken for "this is the volume to write to".

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::thread::sleep;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const MARKER: &str = "INFO_UF2.TXT";

/// How long to wait for the bootloader to reboot out of mass-storage mode after
/// the copy returns. Writing the final block is what triggers the reboot, so the
/// volume vanishing *is* the success signal.
const REBOOT_TIMEOUT: Duration = Duration::from_secs(20);

#[derive(Serialize, Deserialize, Clone)]
pub struct Uf2Drive {
    pub path: String,
    pub label: String,
    pub model: String,
    pub board_id: String,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct FirmwareCandidate {
    pub path: String,
    pub name: String,
    pub size: u64,
    pub modified_ms: u64,
}

fn candidate_roots() -> Vec<PathBuf> {
    #[cfg(windows)]
    {
        (b'A'..=b'Z')
            .map(|c| PathBuf::from(format!("{}:\\", c as char)))
            .collect()
    }

    #[cfg(not(windows))]
    {
        let mut roots = Vec::new();
        for base in ["/Volumes", "/media", "/run/media"] {
            let base = PathBuf::from(base);
            let Ok(entries) = fs::read_dir(&base) else {
                continue;
            };
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    roots.push(path.clone());
                    // Linux mounts removable media one level deeper: /media/<user>/<label>
                    if let Ok(inner) = fs::read_dir(&path) {
                        for nested in inner.flatten() {
                            if nested.path().is_dir() {
                                roots.push(nested.path());
                            }
                        }
                    }
                }
            }
        }
        roots
    }
}

/// Reads the marker file, returning (model, board id). Missing marker → None,
/// which is how a plain USB stick gets skipped.
fn read_marker(root: &Path) -> Option<(String, String)> {
    let contents = fs::read_to_string(root.join(MARKER)).ok()?;
    let field = |name: &str| {
        contents
            .lines()
            .find_map(|line| line.trim().strip_prefix(name).map(|v| v.trim().to_string()))
            .unwrap_or_default()
    };
    Some((field("Model:"), field("Board-ID:")))
}

fn volume_label(root: &Path) -> String {
    root.file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| root.to_string_lossy().to_string())
}

#[tauri::command]
pub fn factory_list_uf2_drives() -> Vec<Uf2Drive> {
    candidate_roots()
        .into_iter()
        .filter_map(|root| {
            let (model, board_id) = read_marker(&root)?;
            Some(Uf2Drive {
                label: volume_label(&root),
                path: root.to_string_lossy().to_string(),
                model,
                board_id,
            })
        })
        .collect()
}

fn modified_ms(meta: &fs::Metadata) -> u64 {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Every .uf2 in a directory, newest first. The bench keeps whatever CI produced
/// there — the app deliberately does not fetch builds itself, because hiring a
/// GitHub token into a bench PC is a decision for whoever runs the line.
#[tauri::command]
pub fn factory_list_firmware(dir: String) -> Result<Vec<FirmwareCandidate>, String> {
    let trimmed = dir.trim().trim_matches('"');
    if trimmed.is_empty() {
        return Ok(Vec::new());
    }

    let entries = fs::read_dir(trimmed).map_err(|e| format!("{}: {}", trimmed, e))?;
    let mut out: Vec<FirmwareCandidate> = entries
        .flatten()
        .filter_map(|entry| {
            let path = entry.path();
            if !path.is_file() {
                return None;
            }
            let name = path.file_name()?.to_string_lossy().to_string();
            if !name.to_ascii_lowercase().ends_with(".uf2") {
                return None;
            }
            let meta = entry.metadata().ok()?;
            Some(FirmwareCandidate {
                path: path.to_string_lossy().to_string(),
                name,
                size: meta.len(),
                modified_ms: modified_ms(&meta),
            })
        })
        .collect();
    out.sort_by(|a, b| b.modified_ms.cmp(&a.modified_ms));
    Ok(out)
}

/// Copies a build onto the bootloader volume and waits for it to reboot.
///
/// The copy is allowed to fail: the bootloader starts writing the image as soon
/// as the last block lands and resets the moment it is done, which the host can
/// very reasonably observe as "the device is not ready". Re-checking the marker
/// is what decides the outcome, never the copy status alone.
#[tauri::command]
pub fn factory_flash_uf2(uf2_path: String, drive: String) -> Result<String, String> {
    let source = PathBuf::from(&uf2_path);
    if !source.is_file() {
        return Err(format!("固件文件不存在: {}", uf2_path));
    }

    let root = PathBuf::from(&drive);
    let (model, _) = read_marker(&root)
        .ok_or_else(|| format!("{} 上没有 {}，已中止写入", drive, MARKER))?;

    let name = source
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .ok_or_else(|| "固件文件名无效".to_string())?;
    let destination = root.join(&name);

    let copy_result = fs::copy(&source, &destination);

    // The reboot is the real result. Give the volume time to drop out.
    let deadline = SystemTime::now() + REBOOT_TIMEOUT;
    let mut rebooted = false;
    while SystemTime::now() < deadline {
        if read_marker(&root).is_none() {
            rebooted = true;
            break;
        }
        sleep(Duration::from_millis(250));
    }

    if !rebooted {
        let detail = match copy_result {
            Ok(_) => "文件已写入，但设备 20 秒内没有重启".to_string(),
            Err(e) => format!("写入失败: {}", e),
        };
        return Err(detail);
    }

    Ok(format!("已写入 {} → {} ({})", name, drive, model))
}
