# Contributing to Nimruz Desktop

Thank you for your interest in contributing. This project is open source and welcomes bug reports, feature ideas, and pull requests.

## Getting started

1. Fork the repository and clone your fork.
2. Install [pnpm](https://pnpm.io/) if you do not already have it.
3. Install dependencies:

   ```bash
   pnpm install
   ```

4. Start the app in development mode:

   ```bash
   pnpm dev
   ```

## Before you open a PR

Run the checks locally:

```bash
pnpm typecheck
pnpm test
```

Keep changes focused. Match the existing code style, naming, and patterns in the files you touch.

## Pull request guidelines

- Describe what changed and why.
- Link related issues when applicable.
- Avoid unrelated refactors in the same PR.
- Do not commit secrets, API keys, or local build artifacts.

## Reporting issues

When filing a bug report, include:

- Your operating system and app version
- Steps to reproduce the problem
- Expected vs. actual behavior
- Relevant logs or screenshots if available

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
