//! Direct (in-process) access to the bundled libimobiledevice dylibs.
//!
//! The CLI tools (afcclient, ideviceinfo) can't do ranged reads or talk to
//! diagnostics_relay, so this module loads the same dylibs with `libloading`.
//! Everything here is READ-ONLY: we never call afc remove/rename/write.

use libloading::Library;
use std::ffi::{c_char, c_int, c_void, CStr, CString};
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

type IdeviceT = *mut c_void;
type AfcT = *mut c_void;
type DiagT = *mut c_void;
type PlistT = *mut c_void;

const IDEVICE_LOOKUP_USBMUX: c_int = 1 << 1;
const AFC_FOPEN_RDONLY: c_int = 1;
const SEEK_SET: c_int = 0;
const CLIENT_LABEL: &[u8] = b"wireshift\0";

struct Api {
    _imd: Library,
    _plist: Library,
    idevice_new_with_options: unsafe extern "C" fn(*mut IdeviceT, *const c_char, c_int) -> c_int,
    idevice_free: unsafe extern "C" fn(IdeviceT) -> c_int,
    afc_client_start_service: unsafe extern "C" fn(IdeviceT, *mut AfcT, *const c_char) -> c_int,
    afc_client_free: unsafe extern "C" fn(AfcT) -> c_int,
    afc_file_open: unsafe extern "C" fn(AfcT, *const c_char, c_int, *mut u64) -> c_int,
    afc_file_read: unsafe extern "C" fn(AfcT, u64, *mut c_char, u32, *mut u32) -> c_int,
    afc_file_seek: unsafe extern "C" fn(AfcT, u64, i64, c_int) -> c_int,
    afc_file_close: unsafe extern "C" fn(AfcT, u64) -> c_int,
    afc_get_file_info: unsafe extern "C" fn(AfcT, *const c_char, *mut *mut *mut c_char) -> c_int,
    afc_get_device_info: unsafe extern "C" fn(AfcT, *mut *mut *mut c_char) -> c_int,
    afc_dictionary_free: unsafe extern "C" fn(*mut *mut c_char) -> c_int,
    diag_start: unsafe extern "C" fn(IdeviceT, *mut DiagT, *const c_char) -> c_int,
    diag_query_ioreg_entry: unsafe extern "C" fn(DiagT, *const c_char, *const c_char, *mut PlistT) -> c_int,
    diag_goodbye: unsafe extern "C" fn(DiagT) -> c_int,
    diag_free: unsafe extern "C" fn(DiagT) -> c_int,
    plist_to_xml: unsafe extern "C" fn(PlistT, *mut *mut c_char, *mut u32) -> c_int,
    plist_mem_free: unsafe extern "C" fn(*mut c_void),
    plist_free: unsafe extern "C" fn(PlistT),
}

// The function pointers are plain C symbols; the libraries live as long as the process.
unsafe impl Send for Api {}
unsafe impl Sync for Api {}

static API: OnceLock<Result<Api, String>> = OnceLock::new();

fn lib_dir_candidates() -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    if let Ok(exe) = std::env::current_exe() {
        if let Some(contents) = exe.parent().and_then(|p| p.parent()) {
            dirs.push(contents.join("Resources").join("lib"));
            dirs.push(contents.join("Resources").join("resources").join("lib"));
        }
    }
    dirs.push(PathBuf::from("resources/lib"));
    dirs.push(PathBuf::from("src-tauri/resources/lib"));
    dirs.push(PathBuf::from("../src-tauri/resources/lib"));
    dirs.push(PathBuf::from("/opt/homebrew/lib"));
    dirs.push(PathBuf::from("/usr/local/lib"));
    dirs
}

fn load_api() -> Result<Api, String> {
    let dir = lib_dir_candidates()
        .into_iter()
        .find(|d| d.join("libimobiledevice-1.0.6.dylib").exists())
        .ok_or("libimobiledevice topilmadi")?;

    unsafe {
        let plist = Library::new(dir.join("libplist-2.0.4.dylib")).map_err(|e| e.to_string())?;
        let imd = Library::new(dir.join("libimobiledevice-1.0.6.dylib")).map_err(|e| e.to_string())?;

        macro_rules! sym {
            ($lib:expr, $name:literal) => {
                *$lib.get($name).map_err(|e| format!("{}: {}", stringify!($name), e))?
            };
        }

        Ok(Api {
            idevice_new_with_options: sym!(imd, b"idevice_new_with_options\0"),
            idevice_free: sym!(imd, b"idevice_free\0"),
            afc_client_start_service: sym!(imd, b"afc_client_start_service\0"),
            afc_client_free: sym!(imd, b"afc_client_free\0"),
            afc_file_open: sym!(imd, b"afc_file_open\0"),
            afc_file_read: sym!(imd, b"afc_file_read\0"),
            afc_file_seek: sym!(imd, b"afc_file_seek\0"),
            afc_file_close: sym!(imd, b"afc_file_close\0"),
            afc_get_file_info: sym!(imd, b"afc_get_file_info\0"),
            afc_get_device_info: sym!(imd, b"afc_get_device_info\0"),
            afc_dictionary_free: sym!(imd, b"afc_dictionary_free\0"),
            diag_start: sym!(imd, b"diagnostics_relay_client_start_service\0"),
            diag_query_ioreg_entry: sym!(imd, b"diagnostics_relay_query_ioregistry_entry\0"),
            diag_goodbye: sym!(imd, b"diagnostics_relay_goodbye\0"),
            diag_free: sym!(imd, b"diagnostics_relay_client_free\0"),
            plist_to_xml: sym!(plist, b"plist_to_xml\0"),
            plist_mem_free: sym!(plist, b"plist_mem_free\0"),
            plist_free: sym!(plist, b"plist_free\0"),
            _imd: imd,
            _plist: plist,
        })
    }
}

fn api() -> Result<&'static Api, String> {
    API.get_or_init(load_api).as_ref().map_err(|e| e.clone())
}

/// One open device + AFC connection, reused across range requests (handshake is slow).
struct AfcSession {
    udid: String,
    device: IdeviceT,
    afc: AfcT,
}

unsafe impl Send for AfcSession {}

impl Drop for AfcSession {
    fn drop(&mut self) {
        if let Ok(api) = api() {
            unsafe {
                (api.afc_client_free)(self.afc);
                (api.idevice_free)(self.device);
            }
        }
    }
}

static SESSION: Mutex<Option<AfcSession>> = Mutex::new(None);

fn open_device(api: &Api, udid: &str) -> Result<IdeviceT, String> {
    let c_udid = CString::new(udid).map_err(|e| e.to_string())?;
    let mut device: IdeviceT = std::ptr::null_mut();
    let rc = unsafe { (api.idevice_new_with_options)(&mut device, c_udid.as_ptr(), IDEVICE_LOOKUP_USBMUX) };
    if rc != 0 || device.is_null() {
        return Err(format!("Qurilmaga ulanib bo'lmadi (idevice {})", rc));
    }
    Ok(device)
}

fn open_session(api: &Api, udid: &str) -> Result<AfcSession, String> {
    let device = open_device(api, udid)?;
    let mut afc: AfcT = std::ptr::null_mut();
    let rc = unsafe { (api.afc_client_start_service)(device, &mut afc, CLIENT_LABEL.as_ptr() as *const c_char) };
    if rc != 0 || afc.is_null() {
        unsafe { (api.idevice_free)(device) };
        return Err(format!("AFC xizmati ishga tushmadi ({})", rc));
    }
    Ok(AfcSession { udid: udid.to_string(), device, afc })
}

/// Run `f` with a live AFC session for `udid`; reconnects once if the call fails.
fn with_afc<T>(udid: &str, f: impl Fn(&Api, AfcT) -> Result<T, String>) -> Result<T, String> {
    let api = api()?;
    let mut guard = SESSION.lock().map_err(|_| "AFC lock buzilgan".to_string())?;

    for attempt in 0..2 {
        let needs_new = guard.as_ref().map(|s| s.udid != udid).unwrap_or(true);
        if needs_new {
            *guard = None;
            *guard = Some(open_session(api, udid)?);
        }
        let afc = guard.as_ref().map(|s| s.afc).ok_or("AFC sessiya yo'q")?;
        match f(api, afc) {
            Ok(v) => return Ok(v),
            Err(e) if attempt == 0 => {
                tracing::debug!("AFC call failed, reconnecting: {}", e);
                *guard = None;
            }
            Err(e) => return Err(e),
        }
    }
    Err("AFC xatoligi".into())
}

/// Convert a NULL-terminated key/value char** list into pairs and free it.
unsafe fn take_dictionary(api: &Api, list: *mut *mut c_char) -> Vec<(String, String)> {
    let mut pairs = Vec::new();
    if list.is_null() {
        return pairs;
    }
    let mut i = 0;
    loop {
        let k = *list.add(i);
        if k.is_null() {
            break;
        }
        let v = *list.add(i + 1);
        if v.is_null() {
            break;
        }
        pairs.push((
            CStr::from_ptr(k).to_string_lossy().into_owned(),
            CStr::from_ptr(v).to_string_lossy().into_owned(),
        ));
        i += 2;
    }
    (api.afc_dictionary_free)(list);
    pairs
}

/// Size of a file on the device in bytes.
pub fn file_size(udid: &str, path: &str) -> Result<u64, String> {
    let c_path = CString::new(path).map_err(|e| e.to_string())?;
    with_afc(udid, |api, afc| unsafe {
        let mut info: *mut *mut c_char = std::ptr::null_mut();
        let rc = (api.afc_get_file_info)(afc, c_path.as_ptr(), &mut info);
        if rc != 0 {
            return Err(format!("Fayl topilmadi ({})", rc));
        }
        take_dictionary(api, info)
            .into_iter()
            .find(|(k, _)| k == "st_size")
            .and_then(|(_, v)| v.parse().ok())
            .ok_or_else(|| "st_size yo'q".to_string())
    })
}

/// Read `len` bytes starting at `offset` from a file on the device.
pub fn read_range(udid: &str, path: &str, offset: u64, len: u32) -> Result<Vec<u8>, String> {
    let c_path = CString::new(path).map_err(|e| e.to_string())?;
    with_afc(udid, |api, afc| unsafe {
        let mut handle: u64 = 0;
        let rc = (api.afc_file_open)(afc, c_path.as_ptr(), AFC_FOPEN_RDONLY, &mut handle);
        if rc != 0 {
            return Err(format!("Faylni ochib bo'lmadi ({})", rc));
        }

        let result = (|| {
            if offset > 0 && (api.afc_file_seek)(afc, handle, offset as i64, SEEK_SET) != 0 {
                return Err("Seek xatoligi".to_string());
            }
            let mut buf = vec![0u8; len as usize];
            let mut filled = 0usize;
            while filled < buf.len() {
                let mut got: u32 = 0;
                let want = (buf.len() - filled) as u32;
                let rc = (api.afc_file_read)(afc, handle, buf.as_mut_ptr().add(filled) as *mut c_char, want, &mut got);
                if rc != 0 {
                    return Err(format!("O'qish xatoligi ({})", rc));
                }
                if got == 0 {
                    break; // end of file
                }
                filled += got as usize;
            }
            buf.truncate(filled);
            Ok(buf)
        })();

        (api.afc_file_close)(afc, handle);
        result
    })
}

/// Total / free bytes of the device's data volume (AFC devinfo).
pub fn filesystem_info(udid: &str) -> Result<(u64, u64), String> {
    with_afc(udid, |api, afc| unsafe {
        let mut info: *mut *mut c_char = std::ptr::null_mut();
        if (api.afc_get_device_info)(afc, &mut info) != 0 {
            return Err("devinfo xatoligi".into());
        }
        let pairs = take_dictionary(api, info);
        let get = |key: &str| pairs.iter().find(|(k, _)| k == key).and_then(|(_, v)| v.parse::<u64>().ok());
        match (get("FSTotalBytes"), get("FSFreeBytes")) {
            (Some(total), Some(free)) => Ok((total, free)),
            _ => Err("FSTotalBytes yo'q".into()),
        }
    })
}

/// Query an IORegistry entry through diagnostics_relay and return it as XML plist text.
pub fn ioregistry_xml(udid: &str, name: Option<&str>, class: Option<&str>) -> Result<String, String> {
    let api = api()?;
    let device = open_device(api, udid)?;
    let c_name = name.map(|n| CString::new(n).unwrap_or_default());
    let c_class = class.map(|c| CString::new(c).unwrap_or_default());

    let result = unsafe {
        let mut diag: DiagT = std::ptr::null_mut();
        let rc = (api.diag_start)(device, &mut diag, CLIENT_LABEL.as_ptr() as *const c_char);
        if rc != 0 || diag.is_null() {
            Err(format!("diagnostics_relay ishga tushmadi ({})", rc))
        } else {
            let mut node: PlistT = std::ptr::null_mut();
            let rc = (api.diag_query_ioreg_entry)(
                diag,
                c_name.as_ref().map(|c| c.as_ptr()).unwrap_or(std::ptr::null()),
                c_class.as_ref().map(|c| c.as_ptr()).unwrap_or(std::ptr::null()),
                &mut node,
            );
            let out = if rc != 0 || node.is_null() {
                Err(format!("IORegistry so'rovi xato ({})", rc))
            } else {
                let mut xml: *mut c_char = std::ptr::null_mut();
                let mut len: u32 = 0;
                (api.plist_to_xml)(node, &mut xml, &mut len);
                let text = if xml.is_null() {
                    String::new()
                } else {
                    let s = CStr::from_ptr(xml).to_string_lossy().into_owned();
                    (api.plist_mem_free)(xml as *mut c_void);
                    s
                };
                (api.plist_free)(node);
                Ok(text)
            };
            (api.diag_goodbye)(diag);
            (api.diag_free)(diag);
            out
        }
    };

    unsafe { (api.idevice_free)(device) };
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    // Needs a real phone: cargo test native -- --ignored --nocapture
    #[test]
    #[ignore]
    fn probe_real_device() {
        let udid = std::env::var("WS_UDID").expect("WS_UDID");
        println!("fs: {:?}", filesystem_info(&udid));
        for (n, c) in [(Some("AppleSmartBattery"), None), (None, Some("IOPMPowerSource")), (None, Some("AppleSmartBattery"))] {
            match ioregistry_xml(&udid, n, c) {
                Ok(x) => println!("{:?}/{:?}: {} bytes\n{}", n, c, x.len(), &x[..x.len().min(6000)]),
                Err(e) => println!("{:?}/{:?}: {}", n, c, e),
            }
        }
    }
}
