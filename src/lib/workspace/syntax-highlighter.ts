import type { LanguageRegistration } from "shiki/core";
import { createHighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import githubDark from "shiki/dist/themes/github-dark.mjs";
import githubLight from "shiki/dist/themes/github-light.mjs";

type LanguageModule = { default: LanguageRegistration[] };
type LanguageLoader = () => Promise<LanguageModule>;

const languageLoaders: Record<string, LanguageLoader> = {
  bash: () => import("shiki/dist/langs/bash.mjs"),
  c: () => import("shiki/dist/langs/c.mjs"),
  cpp: () => import("shiki/dist/langs/cpp.mjs"),
  csharp: () => import("shiki/dist/langs/csharp.mjs"),
  css: () => import("shiki/dist/langs/css.mjs"),
  dart: () => import("shiki/dist/langs/dart.mjs"),
  dockerfile: () => import("shiki/dist/langs/dockerfile.mjs"),
  go: () => import("shiki/dist/langs/go.mjs"),
  html: () => import("shiki/dist/langs/html.mjs"),
  ini: () => import("shiki/dist/langs/ini.mjs"),
  java: () => import("shiki/dist/langs/java.mjs"),
  javascript: () => import("shiki/dist/langs/javascript.mjs"),
  json: () => import("shiki/dist/langs/json.mjs"),
  jsx: () => import("shiki/dist/langs/jsx.mjs"),
  kotlin: () => import("shiki/dist/langs/kotlin.mjs"),
  less: () => import("shiki/dist/langs/less.mjs"),
  lua: () => import("shiki/dist/langs/lua.mjs"),
  markdown: () => import("shiki/dist/langs/markdown.mjs"),
  php: () => import("shiki/dist/langs/php.mjs"),
  python: () => import("shiki/dist/langs/python.mjs"),
  r: () => import("shiki/dist/langs/r.mjs"),
  ruby: () => import("shiki/dist/langs/ruby.mjs"),
  rust: () => import("shiki/dist/langs/rust.mjs"),
  scala: () => import("shiki/dist/langs/scala.mjs"),
  scss: () => import("shiki/dist/langs/scss.mjs"),
  sql: () => import("shiki/dist/langs/sql.mjs"),
  svelte: () => import("shiki/dist/langs/svelte.mjs"),
  swift: () => import("shiki/dist/langs/swift.mjs"),
  toml: () => import("shiki/dist/langs/toml.mjs"),
  tsx: () => import("shiki/dist/langs/tsx.mjs"),
  typescript: () => import("shiki/dist/langs/typescript.mjs"),
  vue: () => import("shiki/dist/langs/vue.mjs"),
  xml: () => import("shiki/dist/langs/xml.mjs"),
  yaml: () => import("shiki/dist/langs/yaml.mjs"),
};

const highlighterPromise = createHighlighterCore({
  themes: [githubLight, githubDark],
  langs: [],
  engine: createJavaScriptRegexEngine(),
});
const languagePromises = new Map<string, Promise<void>>();

async function loadLanguage(language: string): Promise<void> {
  const existing = languagePromises.get(language);
  if (existing) return existing;

  const loader = languageLoaders[language];
  if (!loader) throw new Error(`Unsupported syntax language: ${language}`);

  const promise = Promise.all([highlighterPromise, loader()]).then(
    async ([highlighter, module]) => {
      await highlighter.loadLanguage(...module.default);
    }
  );
  languagePromises.set(language, promise);
  return promise;
}

export async function highlightCode(
  code: string,
  language: string,
  dark: boolean
): Promise<string> {
  await loadLanguage(language);
  const highlighter = await highlighterPromise;
  return highlighter.codeToHtml(code, {
    lang: language,
    theme: dark ? "github-dark" : "github-light",
  });
}
