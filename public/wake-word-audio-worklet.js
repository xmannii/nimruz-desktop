const CHUNK_SAMPLES = 1_280;

class NimruzWakeWordProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.chunk = new Float32Array(CHUNK_SAMPLES);
    this.offset = 0;
  }

  process(inputs) {
    const input = inputs[0]?.[0];
    if (!input) return true;

    let inputOffset = 0;
    while (inputOffset < input.length) {
      const remaining = CHUNK_SAMPLES - this.offset;
      const length = Math.min(remaining, input.length - inputOffset);
      this.chunk.set(input.subarray(inputOffset, inputOffset + length), this.offset);
      this.offset += length;
      inputOffset += length;

      if (this.offset === CHUNK_SAMPLES) {
        const buffer = this.chunk.buffer;
        this.port.postMessage(buffer, [buffer]);
        this.chunk = new Float32Array(CHUNK_SAMPLES);
        this.offset = 0;
      }
    }

    return true;
  }
}

registerProcessor("nimruz-wake-word-processor", NimruzWakeWordProcessor);
