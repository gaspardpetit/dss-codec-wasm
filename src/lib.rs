use dss_codec_core::crypto::ds2_encrypted::ENCRYPTED_MAGIC;
use dss_codec_core::streaming::DecryptingDecoderStreamer;
use dss_codec_core::{decode_to_buffer, decode_to_buffer_with_password, decrypt_to_bytes, inspect_bytes};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct InspectResult {
    format: String,
    native_rate: u32,
    encryption: String,
}

#[wasm_bindgen]
impl InspectResult {
    #[wasm_bindgen(getter)]
    pub fn format(&self) -> String {
        self.format.clone()
    }

    #[wasm_bindgen(getter, js_name = nativeRate)]
    pub fn native_rate(&self) -> u32 {
        self.native_rate
    }

    #[wasm_bindgen(getter)]
    pub fn encryption(&self) -> String {
        self.encryption.clone()
    }
}

#[wasm_bindgen]
pub struct DecodeResult {
    /// Normalized mono PCM samples in [-1.0, 1.0] for JS/WebAudio consumers.
    samples: Vec<f32>,
    native_rate: u32,
    format: String,
}

#[wasm_bindgen]
pub struct StreamDecoder {
    inner: DecryptingDecoderStreamer,
}

#[wasm_bindgen]
impl DecodeResult {
    #[wasm_bindgen(getter)]
    pub fn format(&self) -> String {
        self.format.clone()
    }

    #[wasm_bindgen(getter, js_name = nativeRate)]
    pub fn native_rate(&self) -> u32 {
        self.native_rate
    }

    #[wasm_bindgen(getter)]
    pub fn samples(&self) -> Box<[f32]> {
        self.samples.clone().into_boxed_slice()
    }
}

#[wasm_bindgen]
impl StreamDecoder {
    #[wasm_bindgen(constructor)]
    pub fn new() -> StreamDecoder {
        StreamDecoder {
            inner: DecryptingDecoderStreamer::new(None),
        }
    }

    #[wasm_bindgen(js_name = withPassword)]
    pub fn with_password(password: &[u8]) -> StreamDecoder {
        StreamDecoder {
            inner: DecryptingDecoderStreamer::new(Some(password)),
        }
    }

    #[wasm_bindgen(getter)]
    pub fn format(&self) -> Option<String> {
        self.inner.format().map(format_name)
    }

    #[wasm_bindgen(getter, js_name = nativeRate)]
    pub fn native_rate(&self) -> Option<u32> {
        self.inner.native_rate()
    }

    pub fn push(&mut self, data: &[u8]) -> Result<Box<[f32]>, JsValue> {
        self.inner
            .push(data)
            .map(normalize_pcm_samples)
            .map(Vec::into_boxed_slice)
            .map_err(to_js_error)
    }

    pub fn finish(&mut self) -> Result<Box<[f32]>, JsValue> {
        self.inner
            .finish()
            .map(normalize_pcm_samples)
            .map(Vec::into_boxed_slice)
            .map_err(to_js_error)
    }
}

fn format_name(format: dss_codec_core::demux::AudioFormat) -> String {
    match format {
        dss_codec_core::demux::AudioFormat::DssSp => "dss_sp".to_string(),
        dss_codec_core::demux::AudioFormat::Ds2Sp => "ds2_sp".to_string(),
        dss_codec_core::demux::AudioFormat::Ds2Qp => "ds2_qp".to_string(),
    }
}

fn encryption_name(info: dss_codec_core::EncryptionInfo) -> String {
    match info {
        dss_codec_core::EncryptionInfo::None => "none".to_string(),
        dss_codec_core::EncryptionInfo::EncryptedDs2Aes128 => "ds2_aes_128".to_string(),
        dss_codec_core::EncryptionInfo::EncryptedDs2Aes256 => "ds2_aes_256".to_string(),
        dss_codec_core::EncryptionInfo::EncryptedUnknown(mode) => format!("ds2_unknown_{mode}"),
    }
}

fn to_js_error(error: dss_codec_core::error::DecodeError) -> JsValue {
    JsValue::from_str(&error.to_string())
}

fn normalize_pcm_sample(sample: f64) -> f32 {
    (sample / 32768.0).clamp(-1.0, 1.0) as f32
}

fn normalize_pcm_samples(samples: Vec<f64>) -> Vec<f32> {
    samples.into_iter().map(normalize_pcm_sample).collect()
}

fn to_wasm_decode_result(buffer: dss_codec_core::AudioBuffer) -> DecodeResult {
    DecodeResult {
        samples: normalize_pcm_samples(buffer.samples),
        native_rate: buffer.native_rate,
        format: format_name(buffer.format),
    }
}

#[wasm_bindgen(js_name = inspect)]
pub fn inspect_wasm(data: &[u8]) -> Result<InspectResult, JsValue> {
    let info = inspect_bytes(data).map_err(to_js_error)?;
    Ok(InspectResult {
        format: format_name(info.format),
        native_rate: info.native_rate(),
        encryption: encryption_name(info.encryption),
    })
}

#[wasm_bindgen(js_name = decrypt)]
pub fn decrypt_wasm(data: &[u8]) -> Result<Box<[u8]>, JsValue> {
    decrypt_to_bytes(data, None)
        .map(|bytes| bytes.into_boxed_slice())
        .map_err(to_js_error)
}

#[wasm_bindgen(js_name = decryptWithPassword)]
pub fn decrypt_with_password_wasm(data: &[u8], password: &[u8]) -> Result<Box<[u8]>, JsValue> {
    decrypt_to_bytes(data, Some(password))
        .map(|bytes| bytes.into_boxed_slice())
        .map_err(to_js_error)
}

#[wasm_bindgen(js_name = decode)]
pub fn decode_wasm(data: &[u8]) -> Result<DecodeResult, JsValue> {
    decode_to_buffer(data)
        .map(to_wasm_decode_result)
        .map_err(to_js_error)
}

#[wasm_bindgen(js_name = decodeWithPassword)]
pub fn decode_with_password_wasm(
    data: &[u8],
    password: &[u8],
) -> Result<DecodeResult, JsValue> {
    decode_to_buffer_with_password(data, Some(password))
        .map(to_wasm_decode_result)
        .map_err(to_js_error)
}

#[wasm_bindgen(js_name = isEncryptedDs2)]
pub fn is_encrypted_ds2_wasm(data: &[u8]) -> bool {
    data.starts_with(&ENCRYPTED_MAGIC)
}

#[cfg(test)]
mod tests {
    use super::normalize_pcm_sample;

    #[test]
    fn pcm_samples_are_normalized_for_js() {
        assert_eq!(normalize_pcm_sample(-32768.0), -1.0);
        assert_eq!(normalize_pcm_sample(0.0), 0.0);
        assert!((normalize_pcm_sample(32767.0) - 0.9999695).abs() < 1e-6);
    }

    #[test]
    fn out_of_range_samples_are_clamped() {
        assert_eq!(normalize_pcm_sample(-50000.0), -1.0);
        assert_eq!(normalize_pcm_sample(50000.0), 1.0);
    }
}
