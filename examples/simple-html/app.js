import init, {
  StreamDecoder,
  inspect,
} from "../../dist/web/dss_codec_wasm.js";

const CHUNK_BYTES = 256 * 1024;
const INSPECT_BYTES = 2048;
const textEncoder = new TextEncoder();

const state = {
  file: null,
  fileName: "",
  info: null,
  audioUrl: null,
  decodedSamples: null,
  isDecoding: false,
  ready: false,
};

const fileInput = document.querySelector("#file-input");
const passwordPanel = document.querySelector("#password-panel");
const passwordInput = document.querySelector("#password-input");
const decodeButton = document.querySelector("#decode-button");
const progressPanel = document.querySelector("#progress-panel");
const progressNode = document.querySelector("#decode-progress");
const progressTextNode = document.querySelector("#progress-text");
const statusNode = document.querySelector("#status");
const audioPlayer = document.querySelector("#audio-player");
const downloadLink = document.querySelector("#download-link");
const waveformCanvas = document.querySelector("#waveform");

const detailFile = document.querySelector("#detail-file");
const detailFormat = document.querySelector("#detail-format");
const detailEncryption = document.querySelector("#detail-encryption");
const detailRate = document.querySelector("#detail-rate");
const detailDuration = document.querySelector("#detail-duration");

boot();

async function boot() {
  try {
    await init();
    state.ready = true;
    setStatus("WASM runtime ready. Choose a DSS or DS2 file.");
    drawPlaceholder("Waveform will appear here after decoding.");
  } catch (error) {
    setStatus(`Failed to initialize WASM: ${formatError(error)}`, true);
    drawPlaceholder("WASM failed to initialize.");
  }
}

fileInput.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }

  if (!state.ready) {
    setStatus("WASM is still loading. Try again in a moment.", true);
    return;
  }

  if (state.isDecoding) {
    setStatus("A decode is already running.", true);
    return;
  }

  clearAudio();
  passwordInput.value = "";

  state.file = file;
  state.fileName = file.name;

  try {
    const inspectBytes = new Uint8Array(
      await file.slice(0, Math.min(file.size, INSPECT_BYTES)).arrayBuffer(),
    );
    const inspectResult = inspect(inspectBytes);
    state.info = {
      encryption: inspectResult.encryption,
      format: inspectResult.format,
      nativeRate: inspectResult.nativeRate,
    };
    inspectResult.free();

    updateInspectDetails(file.name, state.info);

    if (state.info.encryption === "none") {
      passwordPanel.classList.add("hidden");
      setStatus("File loaded. Starting progressive decode...");
      await decodeCurrentFile();
    } else {
      passwordPanel.classList.remove("hidden");
      setStatus(
        `Encrypted file detected (${friendlyEncryption(state.info.encryption)}). Enter the password to decode.`,
      );
      passwordInput.focus();
    }
  } catch (error) {
    state.file = null;
    state.fileName = "";
    state.info = null;
    passwordPanel.classList.add("hidden");
    updateInspectDetails(file.name, null);
    setStatus(`Could not inspect the selected file: ${formatError(error)}`, true);
    drawPlaceholder("Could not inspect the selected file.");
  }
});

decodeButton.addEventListener("click", async () => {
  if (!state.file || !state.info) {
    setStatus("Select a file before trying to decode it.", true);
    return;
  }

  if (state.info.encryption !== "none" && passwordInput.value.length === 0) {
    setStatus("This file is encrypted. Enter the password first.", true);
    passwordInput.focus();
    return;
  }

  await decodeCurrentFile();
});

passwordInput.addEventListener("keydown", async (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    await decodeCurrentFile();
  }
});

async function decodeCurrentFile() {
  if (!state.file || !state.info || state.isDecoding) {
    return;
  }

  state.isDecoding = true;
  setControlsDisabled(true);
  showProgress(0);
  drawPlaceholder("Decoding audio stream...");

  try {
    const streamer =
      state.info.encryption === "none"
        ? new StreamDecoder()
        : StreamDecoder.withPassword(textEncoder.encode(passwordInput.value));

    const sampleChunks = [];
    let totalSamples = 0;
    let processedBytes = 0;
    let nativeRate = state.info.nativeRate;

    for (let offset = 0; offset < state.file.size; offset += CHUNK_BYTES) {
      const end = Math.min(offset + CHUNK_BYTES, state.file.size);
      const chunk = new Uint8Array(await state.file.slice(offset, end).arrayBuffer());
      const decodedChunk = streamer.push(chunk);

      if (decodedChunk.length > 0) {
        const chunkSamples = new Float32Array(decodedChunk);
        sampleChunks.push(chunkSamples);
        totalSamples += chunkSamples.length;
      }

      if (streamer.nativeRate != null) {
        nativeRate = streamer.nativeRate;
      }

      processedBytes = end;
      const progress = state.file.size === 0 ? 1 : processedBytes / state.file.size;
      updateProgress(progress, totalSamples, nativeRate);
      await yieldToBrowser();
    }

    const tailSamples = streamer.finish();
    if (tailSamples.length > 0) {
      const chunkSamples = new Float32Array(tailSamples);
      sampleChunks.push(chunkSamples);
      totalSamples += chunkSamples.length;
    }

    const samples = concatFloat32Chunks(sampleChunks, totalSamples);
    state.decodedSamples = samples;

    const wavBytes = createWavFile(samples, nativeRate);
    const wavBlob = new Blob([wavBytes], { type: "audio/wav" });
    replaceAudioUrl(URL.createObjectURL(wavBlob));

    audioPlayer.src = state.audioUrl;
    downloadLink.href = state.audioUrl;
    downloadLink.download = buildDownloadName(state.fileName);
    downloadLink.classList.remove("disabled");

    detailRate.textContent = `${nativeRate.toLocaleString()} Hz`;
    detailDuration.textContent = formatDuration(samples.length / nativeRate);

    updateProgress(1, samples.length, nativeRate);
    drawWaveform(samples);
    setStatus("Decode complete. Playback and WAV download are ready.");
  } catch (error) {
    clearAudio();
    drawPlaceholder("Decode failed. Try another file or password.");
    setStatus(`Decode failed: ${formatError(error)}`, true);
  } finally {
    state.isDecoding = false;
    setControlsDisabled(false);
  }
}

function updateInspectDetails(fileName, info) {
  detailFile.textContent = fileName || "None";
  detailFormat.textContent = info ? friendlyFormat(info.format) : "-";
  detailEncryption.textContent = info ? friendlyEncryption(info.encryption) : "-";
  detailRate.textContent = info ? `${info.nativeRate.toLocaleString()} Hz` : "-";
  detailDuration.textContent = "-";
}

function clearAudio() {
  state.decodedSamples = null;
  audioPlayer.removeAttribute("src");
  audioPlayer.load();
  downloadLink.removeAttribute("href");
  downloadLink.classList.add("disabled");
  replaceAudioUrl(null);
  showProgress(0, true);
}

function replaceAudioUrl(nextUrl) {
  if (state.audioUrl) {
    URL.revokeObjectURL(state.audioUrl);
  }
  state.audioUrl = nextUrl;
}

function setControlsDisabled(disabled) {
  fileInput.disabled = disabled;
  passwordInput.disabled = disabled;
  decodeButton.disabled = disabled;
}

function showProgress(progress, hidden = false) {
  progressPanel.classList.toggle("hidden", hidden);
  progressNode.value = progress;
  progressTextNode.textContent = `${Math.round(progress * 100)}%`;
}

function updateProgress(progress, totalSamples, nativeRate) {
  showProgress(progress);
  if (nativeRate > 0 && totalSamples > 0) {
    detailDuration.textContent = formatDuration(totalSamples / nativeRate);
  }
  setStatus(
    `Decoding audio stream... ${Math.round(progress * 100)}% (${formatBytes(progress * state.file.size)} / ${formatBytes(state.file.size)})`,
  );
}

function concatFloat32Chunks(chunks, totalLength) {
  const merged = new Float32Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}

function createWavFile(samples, sampleRate) {
  const bytesPerSample = 2;
  const blockAlign = bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let index = 0; index < samples.length; index += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[index]));
    const pcm = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
    view.setInt16(offset, Math.round(pcm), true);
    offset += bytesPerSample;
  }

  return buffer;
}

function writeAscii(view, offset, value) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

function drawWaveform(samples) {
  const context = resizeCanvas(waveformCanvas);
  const { width, height } = waveformCanvas;

  context.clearRect(0, 0, width, height);
  context.fillStyle = "#f8fcf9";
  context.fillRect(0, 0, width, height);

  context.strokeStyle = "rgba(31, 42, 51, 0.12)";
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(0, height / 2);
  context.lineTo(width, height / 2);
  context.stroke();

  const samplesPerPixel = Math.max(1, Math.ceil(samples.length / width));
  context.strokeStyle = "#0b6e4f";
  context.lineWidth = 1;
  context.beginPath();

  for (let x = 0; x < width; x += 1) {
    const start = x * samplesPerPixel;
    const end = Math.min(start + samplesPerPixel, samples.length);

    let min = 1;
    let max = -1;

    for (let index = start; index < end; index += 1) {
      const sample = samples[index];
      if (sample < min) {
        min = sample;
      }
      if (sample > max) {
        max = sample;
      }
    }

    const top = normalizeY(max, height);
    const bottom = normalizeY(min, height);
    context.moveTo(x + 0.5, top);
    context.lineTo(x + 0.5, bottom);
  }

  context.stroke();
}

function drawPlaceholder(message) {
  const context = resizeCanvas(waveformCanvas);
  const { width, height } = waveformCanvas;

  context.clearRect(0, 0, width, height);
  context.fillStyle = "#f8fcf9";
  context.fillRect(0, 0, width, height);

  context.strokeStyle = "rgba(31, 42, 51, 0.12)";
  context.beginPath();
  context.moveTo(0, height / 2);
  context.lineTo(width, height / 2);
  context.stroke();

  context.fillStyle = "#5f6a72";
  context.font = `${Math.max(16, Math.round(width / 40))}px Segoe UI`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(message, width / 2, height / 2);
}

function resizeCanvas(canvas) {
  const ratio = window.devicePixelRatio || 1;
  const displayWidth = Math.max(320, Math.round(canvas.clientWidth * ratio));
  const displayHeight = Math.max(160, Math.round((canvas.clientWidth * 0.29) * ratio));

  if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
    canvas.width = displayWidth;
    canvas.height = displayHeight;
  }

  return canvas.getContext("2d");
}

function normalizeY(sample, height) {
  return ((1 - sample) * 0.5) * height;
}

function buildDownloadName(fileName) {
  const dotIndex = fileName.lastIndexOf(".");
  const stem = dotIndex >= 0 ? fileName.slice(0, dotIndex) : fileName;
  return `${stem || "decoded"}.wav`;
}

function friendlyFormat(value) {
  return value.replaceAll("_", " ").toUpperCase();
}

function friendlyEncryption(value) {
  return value === "none" ? "None" : value.replaceAll("_", " ").toUpperCase();
}

function formatDuration(seconds) {
  const wholeSeconds = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(wholeSeconds / 60);
  const remainder = wholeSeconds % 60;
  return `${minutes}:${remainder.toString().padStart(2, "0")}`;
}

function formatBytes(bytes) {
  if (bytes < 1024) {
    return `${Math.round(bytes)} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}

function setStatus(message, isError = false) {
  statusNode.textContent = message;
  statusNode.classList.toggle("error", isError);
}

function yieldToBrowser() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

window.addEventListener("resize", () => {
  if (state.decodedSamples) {
    drawWaveform(state.decodedSamples);
    return;
  }
  drawPlaceholder(state.isDecoding ? "Decoding audio stream..." : "Waveform will appear here after decoding.");
});
