export const SHENAVA_MODEL_KEYS = ["rizeh", "koochik"] as const;
export type ShenavaModelKey = (typeof SHENAVA_MODEL_KEYS)[number];

export const DEFAULT_SHENAVA_MODEL_KEY: ShenavaModelKey = "rizeh";
export const SHENAVA_SAMPLE_RATE = 16_000;

export type ShenavaModelDefinition = {
  key: ShenavaModelKey;
  id: string;
  displayName: string;
  shortName: string;
  revision: string;
  license: string;
  licenseUrl: string;
  modelUrl: string;
  sourceModelUrl: string;
  totalBytes: number;
  parameters: number;
  directoryName: string;
  recommended: boolean;
  description: string;
  files: readonly {
    name: "model.onnx" | "tokens.txt";
    size: number;
    sha256: string;
  }[];
};

export const SHENAVA_MODELS = {
  rizeh: {
    key: "rizeh",
    id: "Reza2kn/Shenava-Rizeh-v1.0-sherpa-onnx",
    displayName: "Shenava Rizeh v1.0",
    shortName: "Rizeh",
    revision: "c542ce322851424975d6b818f740cfb3b15bd991",
    license: "CC BY-NC 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-nc/4.0/",
    modelUrl:
      "https://huggingface.co/Reza2kn/Shenava-Rizeh-v1.0-sherpa-onnx",
    sourceModelUrl: "https://huggingface.co/Reza2kn/Shenava-Rizeh-v1.0",
    totalBytes: 116_712_896,
    parameters: 32_000_000,
    directoryName: "shenava-rizeh-v1.0",
    recommended: true,
    description: "سبک‌تر، سریع‌تر و مناسب استفاده روزمره روی بیشتر دستگاه‌ها",
    files: [
      {
        name: "model.onnx",
        size: 116_700_660,
        sha256:
          "ec66d191f1eee10a1cc4b58ce5d2d328e160193975e118139e4600102550255b",
      },
      {
        name: "tokens.txt",
        size: 12_236,
        sha256:
          "8e192963f6e666dfa5721e5cbd4710bc1ef592460a45f08cefc94b2db16a6954",
      },
    ],
  },
  koochik: {
    key: "koochik",
    id: "Reza2kn/Shenava-Koochik-v1.0-sherpa-onnx",
    displayName: "Shenava Koochik v1.0",
    shortName: "Koochik",
    revision: "b67cd889f37746469b1396cf4236682aec72fd6d",
    license: "CC BY-NC 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-nc/4.0/",
    modelUrl:
      "https://huggingface.co/Reza2kn/Shenava-Koochik-v1.0-sherpa-onnx",
    sourceModelUrl: "https://huggingface.co/Reza2kn/Shenava-Koochik-v1.0",
    totalBytes: 458_831_485,
    parameters: 114_000_000,
    directoryName: "shenava-koochik-v1.0",
    recommended: false,
    description: "مدل بزرگ‌تر برای دستگاه‌های قوی‌تر؛ دانلود و مصرف حافظه بیشتر",
    files: [
      {
        name: "model.onnx",
        size: 458_819_249,
        sha256:
          "6a564b5541920ce1c37bbc91d22e4b3a6838648b9b327eb88997e8db1f90950d",
      },
      {
        name: "tokens.txt",
        size: 12_236,
        sha256:
          "8e192963f6e666dfa5721e5cbd4710bc1ef592460a45f08cefc94b2db16a6954",
      },
    ],
  },
} as const satisfies Record<ShenavaModelKey, ShenavaModelDefinition>;

export function isShenavaModelKey(value: unknown): value is ShenavaModelKey {
  return (
    typeof value === "string" &&
    SHENAVA_MODEL_KEYS.includes(value as ShenavaModelKey)
  );
}

export type ShenavaModelPhase =
  | "not-installed"
  | "downloading"
  | "ready"
  | "error";

export type ShenavaModelStatus = {
  modelKey: ShenavaModelKey;
  phase: ShenavaModelPhase;
  installed: boolean;
  downloadedBytes: number;
  totalBytes: number;
  installedBytes: number;
  revision: string;
  error: string | null;
};

export type ShenavaStatus = {
  activeModelKey: ShenavaModelKey;
  models: Record<ShenavaModelKey, ShenavaModelStatus>;
};

export type ShenavaTranscription = {
  text: string;
  durationMs: number;
};

export function createInitialShenavaModelStatus(
  modelKey: ShenavaModelKey
): ShenavaModelStatus {
  const model = SHENAVA_MODELS[modelKey];
  return {
    modelKey,
    phase: "not-installed",
    installed: false,
    downloadedBytes: 0,
    totalBytes: model.totalBytes,
    installedBytes: 0,
    revision: model.revision,
    error: null,
  };
}

export const INITIAL_SHENAVA_STATUS: ShenavaStatus = {
  activeModelKey: DEFAULT_SHENAVA_MODEL_KEY,
  models: {
    rizeh: createInitialShenavaModelStatus("rizeh"),
    koochik: createInitialShenavaModelStatus("koochik"),
  },
};

const UNIT_NUMBERS: Readonly<Record<string, number>> = {
  صفر: 0,
  یک: 1,
  دو: 2,
  سه: 3,
  چهار: 4,
  پنج: 5,
  شش: 6,
  شیش: 6,
  هفت: 7,
  هشت: 8,
  نه: 9,
};

const TEEN_NUMBERS: Readonly<Record<string, number>> = {
  ده: 10,
  یازده: 11,
  دوازده: 12,
  سیزده: 13,
  چهارده: 14,
  پانزده: 15,
  پونزده: 15,
  شانزده: 16,
  شونزده: 16,
  هفده: 17,
  هیفده: 17,
  هجده: 18,
  هیجده: 18,
  نوزده: 19,
};

const TENS: Readonly<Record<string, number>> = {
  بیست: 20,
  سی: 30,
  چهل: 40,
  پنجاه: 50,
  شصت: 60,
  هفتاد: 70,
  هشتاد: 80,
  نود: 90,
};

const HUNDREDS: Readonly<Record<string, number>> = {
  صد: 100,
  یکصد: 100,
  دویست: 200,
  سیصد: 300,
  چهارصد: 400,
  پانصد: 500,
  پونصد: 500,
  ششصد: 600,
  شیشصد: 600,
  هفتصد: 700,
  هشتصد: 800,
  نهصد: 900,
};

const SCALES: Readonly<Record<string, number>> = {
  هزار: 1_000,
  میلیون: 1_000_000,
  میلیارد: 1_000_000_000,
};

const NUMBER_WORDS = new Set([
  ...Object.keys(UNIT_NUMBERS),
  ...Object.keys(TEEN_NUMBERS),
  ...Object.keys(TENS),
  ...Object.keys(HUNDREDS),
  ...Object.keys(SCALES),
]);

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

function numberWordValue(word: string): number | null {
  return (
    UNIT_NUMBERS[word] ??
    TEEN_NUMBERS[word] ??
    TENS[word] ??
    HUNDREDS[word] ??
    null
  );
}

/** Port of the model author's bundled `persian_itn.py`. */
export function normalizeShenavaPersianNumbers(text: string): string {
  const words = text.trim().split(/\s+/u);
  if (words.length === 1 && words[0] === "") return "";

  const output: string[] = [];
  let index = 0;

  while (index < words.length) {
    if (!NUMBER_WORDS.has(words[index])) {
      output.push(words[index]);
      index += 1;
      continue;
    }

    let total = 0;
    let current = 0;
    let cursor = index;

    while (
      cursor < words.length &&
      (NUMBER_WORDS.has(words[cursor]) || words[cursor] === "و")
    ) {
      const word = words[cursor];
      if (word === "و") {
        cursor += 1;
        continue;
      }

      const scale = SCALES[word];
      if (scale) {
        total += (current || 1) * scale;
        current = 0;
      } else {
        current += numberWordValue(word) ?? 0;
      }
      cursor += 1;
    }

    const digits = String(total + current)
      .split("")
      .map((digit) => PERSIAN_DIGITS[Number(digit)])
      .join("");
    output.push(digits);
    index = cursor;
  }

  return output.join(" ");
}

export function resamplePcm(
  samples: Float32Array,
  sourceRate: number,
  targetRate: number = SHENAVA_SAMPLE_RATE
): Float32Array {
  if (!Number.isFinite(sourceRate) || sourceRate <= 0) {
    throw new Error("Invalid source sample rate.");
  }
  if (samples.length === 0) return samples.slice();

  const normalizeSample = (sample: number) => {
    if (!Number.isFinite(sample)) return 0;
    return Math.max(-1, Math.min(1, sample));
  };

  if (sourceRate === targetRate) {
    const output = new Float32Array(samples.length);
    for (let index = 0; index < samples.length; index += 1) {
      output[index] = normalizeSample(samples[index]);
    }
    return output;
  }

  const ratio = sourceRate / targetRate;
  const targetLength = Math.max(1, Math.round(samples.length / ratio));
  const output = new Float32Array(targetLength);

  for (let index = 0; index < targetLength; index += 1) {
    const sourcePosition = Math.min(
      index * ratio,
      samples.length - 1
    );
    const left = Math.floor(sourcePosition);
    const right = Math.min(left + 1, samples.length - 1);
    const fraction = sourcePosition - left;
    output[index] = normalizeSample(
      normalizeSample(samples[left]) * (1 - fraction) +
        normalizeSample(samples[right]) * fraction
    );
  }

  return output;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "۰ بایت";
  const units = ["بایت", "کیلوبایت", "مگابایت", "گیگابایت"];
  const unitIndex = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  );
  const value = bytes / 1024 ** unitIndex;
  return `${value.toLocaleString("fa-IR", { maximumFractionDigits: 1 })} ${units[unitIndex]}`;
}
