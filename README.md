# LoveBot

WhatsApp bot that gives relationship advice with an LLM. It connects to WhatsApp
through [Baileys](https://github.com/WhiskeySockets/Baileys) (the unofficial
multi-device web API), detects relationship topics in English, Spanish, Hebrew
and Thai, and replies in the language of the message.

## What it does

- Private chats: every message is analysed and answered.
- Group chats: replies when a message starts with `&`, mentions the bot name, or
  scores as relationship-related by keyword analysis.
- Slash commands over WhatsApp: `/help`, `/ai <prompt>`, `/echo <text>`,
  `/groups`, `/status`.
- Chat history import: send a WhatsApp chat export (`.txt` or a `.zip` of
  exports) to the bot, or `POST /api/upload-chat`, to seed the conversation
  context that later advice is based on. Contexts persist in `data/contexts/`.
- Sends a welcome message when added to a group.
- Small Express server that serves the pairing QR code and a status/send API.

## Requirements

- Node.js 22 (see `.nvmrc`). Node 18 is EOL and no longer supported.
- An OpenAI API key, or an OpenRouter API key.
- A phone with WhatsApp to pair the bot as a linked device.

## Configuration

Copy `.env.example` to `.env`. The TypeScript code reads these variables:

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `LLM_PROVIDER` | no | `openai` | `openai` or `openrouter` |
| `OPENAI_API_KEY` | when provider is `openai` | - | OpenAI key |
| `OPENAI_MODEL` | no | `gpt-4o-mini` | OpenAI chat model id |
| `OPENROUTER_API_KEY` | when provider is `openrouter` | - | OpenRouter key |
| `OPENROUTER_MODEL` | no | `openai/gpt-4o-mini` | OpenRouter model slug |
| `OPENROUTER_SITE_URL` | no | repo URL | Sent as `HTTP-Referer` to OpenRouter |
| `PORT` | no | `3000` | HTTP port for the QR page and API |
| `LOG_LEVEL` | no | `info` | pino log level |
| `BOT_NAME` | no | `LoveBot` | Name used in replies and as the Baileys browser name |

Model defaults live in `src/config.ts`. The process exits at startup with a
clear message if the key for the selected provider is missing.

## Models

Any model id the provider accepts works; set `OPENAI_MODEL` or
`OPENROUTER_MODEL`. The `models` CLI command prints a curated list
(`LLMClient.getAvailableModels()`), for example:

- OpenAI: `gpt-4o-mini` (default), `gpt-5.6-luna`, `gpt-5.6-sol`
- OpenRouter: `openai/gpt-4o-mini` (default), `anthropic/claude-haiku-4.5`,
  `anthropic/claude-sonnet-5`, `anthropic/claude-opus-5`,
  `meta-llama/llama-3.3-70b-instruct`, `mistralai/mistral-small-2603`

## Running locally

```bash
npm ci
cp .env.example .env   # add your key
npm run dev            # bot + web server from src/ via ts-node
```

Other entry points:

| Command | What it does |
| --- | --- |
| `npm run build` | Compile `src/` to `dist/` with `tsc` |
| `npm start` | Run the compiled bot (`dist/index.js`) |
| `npm run watch` | `npm run dev` with nodemon restarts |
| `npm run cli` | Interactive CLI (`src/cli.ts`) with the bot connected: `send`, `status`, `testadvice`, `models`, `clearauth`, `help`, ... |
| `npm run cli:local` | Same CLI in local-only mode: no WhatsApp connection, `testlocal` and `testadvice` exercise the advice pipeline |
| `npm run typecheck` | `tsc --noEmit` |

### Pairing with WhatsApp (QR flow)

1. Start the bot (`npm run dev`, `npm run cli`, or the Docker image).
2. The QR code prints in the terminal and is also served at
   `http://localhost:3000/qr` (image at `/api/qr-image`, JSON at `/api/qr`,
   status at `/api/status`). The image is written to `qr.png` and
   `public/qr.png`, both gitignored.
3. On the phone: WhatsApp > Linked devices > Link a device, scan the code.
4. Session credentials are stored in `auth_info_lovebot/` (gitignored). Keep
   that directory to avoid re-pairing; delete it (or run `clearauth` in the CLI)
   to start a fresh session.

### Smoke scripts

There is no automated test suite. `scripts/smoke/` holds manual scripts that
call the real LLM (they need a key in `.env`):

| Command | What it does |
| --- | --- |
| `npm run smoke:advice` | One direct-request message through `RelationshipAdviceService` |
| `npm run smoke:comprehensive` | A batch of group/private messages, prints whether each triggered a reply |
| `npm run smoke:analyzer` | Exercises `MessageAnalyzer`, `ContextManager`, `InterventionEngine` and the service |
| `npm run smoke:import` | Imports `test_files/sample_chats.zip` into a test context (no LLM call) |

`test_files/` contains synthetic chat exports used by `smoke:import` and by
`npm run cli -- --test-chat-import <file>`.

## Docker

```bash
docker build -t lovebot .
docker run --rm -it \
  --env-file .env \
  -p 3000:3000 \
  -v lovebot-auth:/app/auth_info_lovebot \
  -v lovebot-data:/app/data \
  lovebot
```

The image is a two-stage build on `node:22-slim`: the build stage runs
`npm ci` and `tsc`, the runtime stage installs production dependencies only and
runs `node -r ./crypto-polyfill.js dist/index.js`. Open
`http://localhost:3000/qr` to pair. The volumes keep the WhatsApp session and
conversation contexts across restarts.

## CI

`.github/workflows/ci.yml` runs `npm ci`, `tsc --noEmit` and `npm run build`
on Node 22 for pushes to `main` and pull requests. Dependabot checks npm,
GitHub Actions and the Docker base image weekly.

## Limitations

- Baileys is an unofficial reverse-engineered client. WhatsApp changes can
  break it without notice, and accounts used with unofficial clients risk being
  banned. Use a dedicated number.
- No automated tests; the smoke scripts hit the live LLM API.
- Topic detection is keyword-based per language, so it misses phrasing outside
  the dictionaries in `src/services/relationshipAdvice/MessageAnalyzer.ts`.
- `crypto-polyfill.js` is a no-op on Node 22 (kept for older runtimes only).

## License

[MIT](LICENSE)
