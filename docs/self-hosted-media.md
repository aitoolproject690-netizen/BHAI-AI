# Self-hosted media workers

BHAI-X can route character speech and lip-sync to engines you control rather than consuming a hosted API quota. The worker must be reachable from the BHAI-X server over HTTPS and expose the JSON contract below. Setting an endpoint does **not** download or start a model; you must deploy a compatible worker first.

## Environment

- `BHAI_TTS_URL`: full HTTPS endpoint for your own TTS adapter.
- `BHAI_TTS_API_KEY`: optional bearer token for that worker.
- `BHAI_LIPSYNC_URL`: full HTTPS endpoint for your own lip-sync adapter.
- `BHAI_LIPSYNC_API_KEY`: optional bearer token for that worker.

If the corresponding self-hosted URL is set, it takes priority and BHAI-X does not call Gemini TTS or Sync Labs for that stage. When it is not set, the existing provider behavior remains. Never put keys into code or chat.

## TTS worker contract

Accept `POST application/json`:

```json
{
  "schemaVersion": "1.0",
  "script": "Hindi dialogue",
  "speakers": [{"characterId":"character-id","voiceName":"Kore","voiceFingerprint":"stable-id"}],
  "language": "Hindi",
  "voice": "Kore",
  "format": "wav",
  "textHash": "stable-hash"
}
```

Return JSON with `mimeType: "audio/wav"` and `data` containing base64-encoded **16-bit PCM WAV** audio. `duration` and `provider` are optional. This adapter contract deliberately does not require a specific TTS vendor.

## Lip-sync worker contract

Accept `POST application/json`:

```json
{
  "schemaVersion": "1.0",
  "sceneId": "scene-id",
  "videoData": "base64 source MP4",
  "videoMimeType": "video/mp4",
  "audioData": "base64 16-bit PCM WAV",
  "audioMimeType": "audio/wav",
  "durationSeconds": 6
}
```

Return JSON with `mimeType: "video/mp4"` and `data` containing base64 output MP4. `duration` and `provider` are optional. BHAI-X checks the MP4 container and duration contract, but it does not claim pixel-level phoneme synchronization has been independently scored.

## Engine choice and limits

MuseTalk is one self-hostable lip-sync option; its official repository describes 30fps+ inference on an NVIDIA Tesla V100, so a compatible GPU worker is the realistic route for production throughput. CPU/GPU capacity, storage, network bandwidth and electricity/hosting remain finite even when a third-party per-generation quota is removed. See [MuseTalk upstream](https://github.com/TMElyralab/MuseTalk) and check all bundled model/dependency licenses before commercial use.
