# BHAI Core Architecture

## Purpose

BHAI Core is the stable API contract between the BHAI application and AI infrastructure.

The application should call **BHAI Core**, not a vendor-specific provider directly.

```
BHAI App
   |
   v
/api/core
   |
   v
BHAI AI Router
   |
   +--> Gemini
   +--> OpenAI
   +--> Anthropic
   +--> Hugging Face
   +--> future self-hosted BHAI model
```

## Hosting independence

BHAI Core must not depend on Render, Replit, Vercel, or another specific host.

The same Node service should be deployable to:

- temporary cloud hosting
- a VPS
- a dedicated BHAI server
- a future BHAI Cloud cluster

## Contract

### GET /api/core

Returns service health and configured provider metadata. Secrets are never returned.

### POST /api/core

Accepts:

- `messages`
- `task`
- `system`
- `preferred`
- `role`
- `exclude`
- `fallback`
- `model`

Returns the generated text plus the actual provider/model used.

## Design rule

Provider changes happen behind the Core layer. The BHAI application contract stays stable.
