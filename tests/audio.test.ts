import { describe, expect, it } from "vitest";
import { encodeMonoPcm16Wav, mixAndResampleAudio } from "@/lib/audio";

describe("voice audio preparation", () => {
  it("mixes stereo input and resamples it to the ASR sample rate", () => {
    const left = new Float32Array(48_000).fill(0.5);
    const right = new Float32Array(48_000).fill(-0.25);
    const output = mixAndResampleAudio([left, right], 48_000, 16_000);

    expect(output).toHaveLength(16_000);
    expect(output[0]).toBeCloseTo(0.125, 3);
    expect(output.at(-1)).toBeCloseTo(0.125, 3);
  });

  it("creates a valid mono 16-bit WAV file", async () => {
    const wav = encodeMonoPcm16Wav(new Float32Array([0, 1, -1]), 16_000);
    const bytes = new Uint8Array(await wav.arrayBuffer());
    const view = new DataView(bytes.buffer);
    const text = (start: number, length: number) => String.fromCharCode(...bytes.slice(start, start + length));

    expect(wav.type).toBe("audio/wav");
    expect(text(0, 4)).toBe("RIFF");
    expect(text(8, 4)).toBe("WAVE");
    expect(text(36, 4)).toBe("data");
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(16_000);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getUint32(40, true)).toBe(6);
    expect(view.getInt16(44, true)).toBe(0);
    expect(view.getInt16(46, true)).toBe(32_767);
    expect(view.getInt16(48, true)).toBe(-32_768);
  });
});
