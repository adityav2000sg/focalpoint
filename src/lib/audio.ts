const TRANSCRIPTION_SAMPLE_RATE = 16_000;

type AudioContextConstructor = new () => AudioContext;

function browserAudioContext(): AudioContextConstructor | null {
  if (typeof window === "undefined") return null;
  const candidate = window as typeof window & { webkitAudioContext?: AudioContextConstructor };
  return window.AudioContext || candidate.webkitAudioContext || null;
}

export function mixAndResampleAudio(channels: Float32Array[], inputRate: number, outputRate = TRANSCRIPTION_SAMPLE_RATE) {
  if (!channels.length || channels[0].length === 0 || inputRate <= 0 || outputRate <= 0) return new Float32Array();
  const inputLength = Math.min(...channels.map((channel) => channel.length));
  const outputLength = Math.max(1, Math.round(inputLength * outputRate / inputRate));
  const ratio = inputRate / outputRate;
  const output = new Float32Array(outputLength);

  for (let outputIndex = 0; outputIndex < outputLength; outputIndex += 1) {
    const sourceStart = outputIndex * ratio;
    let sample = 0;

    if (ratio >= 1) {
      const start = Math.floor(sourceStart);
      const end = Math.min(inputLength, Math.max(start + 1, Math.floor((outputIndex + 1) * ratio)));
      let count = 0;
      for (let sourceIndex = start; sourceIndex < end; sourceIndex += 1) {
        for (const channel of channels) sample += channel[sourceIndex] || 0;
        count += channels.length;
      }
      sample = count ? sample / count : 0;
    } else {
      const left = Math.min(inputLength - 1, Math.floor(sourceStart));
      const right = Math.min(inputLength - 1, left + 1);
      const fraction = sourceStart - left;
      for (const channel of channels) sample += (channel[left] || 0) * (1 - fraction) + (channel[right] || 0) * fraction;
      sample /= channels.length;
    }

    output[outputIndex] = Math.max(-1, Math.min(1, sample));
  }

  return output;
}

export function encodeMonoPcm16Wav(samples: Float32Array, sampleRate = TRANSCRIPTION_SAMPLE_RATE) {
  const bytesPerSample = 2;
  const buffer = new ArrayBuffer(44 + samples.length * bytesPerSample);
  const view = new DataView(buffer);

  function writeText(offset: number, value: string) {
    for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index));
  }

  writeText(0, "RIFF");
  view.setUint32(4, 36 + samples.length * bytesPerSample, true);
  writeText(8, "WAVE");
  writeText(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeText(36, "data");
  view.setUint32(40, samples.length * bytesPerSample, true);

  samples.forEach((sample, index) => {
    const clamped = Math.max(-1, Math.min(1, sample));
    const pcm = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
    view.setInt16(44 + index * bytesPerSample, Math.round(pcm), true);
  });

  return new Blob([buffer], { type: "audio/wav" });
}

export async function prepareAudioForTranscription(recording: Blob) {
  if (recording.type.includes("wav")) return recording;
  const AudioContextImpl = browserAudioContext();
  if (!AudioContextImpl) throw new Error("This browser cannot prepare audio for transcription. Try Safari or Chrome, or type instead.");

  const context = new AudioContextImpl();
  try {
    const decoded = await context.decodeAudioData(await recording.arrayBuffer());
    const channels = Array.from({ length: decoded.numberOfChannels }, (_, index) => decoded.getChannelData(index));
    const mono = mixAndResampleAudio(channels, decoded.sampleRate);
    if (!mono.length) throw new Error("No audio was recorded. Tap the microphone and try again.");
    return encodeMonoPcm16Wav(mono);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("No audio")) throw error;
    throw new Error("That recording could not be prepared. Please record it again or type instead.");
  } finally {
    await context.close().catch(() => undefined);
  }
}
