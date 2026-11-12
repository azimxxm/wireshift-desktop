//! QR code for the phone camera, drawn locally as SVG (no network).

use qrcode::render::svg;
use qrcode::QrCode;

pub fn svg(text: &str) -> Result<String, String> {
    let code = QrCode::new(text.as_bytes()).map_err(|e| format!("QR kod yaratilmadi: {e}"))?;
    Ok(code
        .render::<svg::Color>()
        .min_dimensions(240, 240)
        .quiet_zone(true)
        .dark_color(svg::Color("#000000"))
        .light_color(svg::Color("#ffffff"))
        .build())
}
