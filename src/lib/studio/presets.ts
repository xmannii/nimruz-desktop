export type StudioPreset = {
  id: string;
  label: string;
  /** English fragment appended to the model prompt. */
  prompt: string;
};

export const IMAGE_STYLES: StudioPreset[] = [
  {
    id: "none",
    label: "بدون سبک",
    prompt: "",
  },
  {
    id: "photo",
    label: "عکاسی واقعی",
    prompt: "photorealistic photograph, natural light, 35mm lens, fine detail",
  },
  {
    id: "cinematic",
    label: "سینمایی",
    prompt: "cinematic film still, dramatic lighting, anamorphic lens, rich color grading",
  },
  {
    id: "miniature",
    label: "نگارگری ایرانی",
    prompt: "Persian miniature painting, intricate ornamental patterns, flat perspective, lapis and gold leaf, Safavid style",
  },
  {
    id: "illustration",
    label: "تصویرسازی",
    prompt: "editorial digital illustration, clean shapes, confident linework, rich palette",
  },
  {
    id: "watercolor",
    label: "آبرنگ",
    prompt: "watercolor painting, soft washes, visible paper texture, gentle bleeding edges",
  },
  {
    id: "anime",
    label: "انیمه",
    prompt: "anime key visual, cel shading, crisp outlines, vibrant sky",
  },
  {
    id: "3d",
    label: "سه‌بعدی",
    prompt: "3D render, soft global illumination, subtle clay materials, studio backdrop",
  },
  {
    id: "product",
    label: "عکس محصول",
    prompt: "premium studio product photography, seamless backdrop, softbox lighting, crisp reflections",
  },
  {
    id: "minimal",
    label: "مینیمال",
    prompt: "minimalist composition, flat colors, generous negative space, modern graphic design",
  },
  {
    id: "poster",
    label: "پوستر",
    prompt: "bold graphic poster, strong focal point, Swiss grid layout, high contrast",
  },
];

export const VIDEO_CAMERA_MOVES: StudioPreset[] = [
  { id: "none", label: "حرکت آزاد", prompt: "" },
  { id: "static", label: "دوربین ثابت", prompt: "static locked-off camera" },
  { id: "push", label: "نزدیک‌شدن آرام", prompt: "slow dolly push-in toward the subject" },
  { id: "pull", label: "دورشدن آرام", prompt: "slow dolly pull-out revealing the scene" },
  { id: "orbit", label: "چرخش دور سوژه", prompt: "smooth orbiting camera around the subject" },
  { id: "drone", label: "نمای هوایی", prompt: "sweeping aerial drone shot" },
  { id: "tracking", label: "تعقیب سوژه", prompt: "tracking shot following the subject" },
  { id: "handheld", label: "روی دست", prompt: "handheld camera with natural subtle shake" },
];

export function findPreset(presets: StudioPreset[], id: unknown) {
  return presets.find((preset) => preset.id === id) ?? presets[0];
}
