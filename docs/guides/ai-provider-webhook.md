# Webhook AI Provider — proxy completions through n8n (or anything else)

The **Webhook** AI provider type is a generic HTTP-endpoint provider. CriteriaIQ
posts the chat-completion request to a URL you configure and expects a
normalized JSON response back. The whole point is to let admins route AI
traffic through a layer they control — most commonly **n8n** so it can
dispatch to **Azure AI Foundry**, Bedrock, an internal LLM gateway, etc. —
without CriteriaIQ having to learn each downstream API.

This document defines the **contract** (request shape + response shape +
errors), walks through **wiring n8n** to that contract, and includes a
**ready-to-import sample workflow** you can drop into your n8n instance.

---

## When to use this

| Use case | Why webhook fits |
|---|---|
| Your Azure AI is Azure **AI Foundry** (not just OpenAI on Azure) | CriteriaIQ's built-in `azure_openai` provider only speaks the Azure OpenAI REST API. Foundry uses a different SDK; n8n's Azure AI node bridges it. |
| You want **centralized AI traffic** for logging / cost-tracking / quota enforcement | n8n becomes the single chokepoint. CriteriaIQ doesn't know or care which downstream the request actually went to. |
| You want **per-project routing** (different LLMs for different assessment rulesets) | Configure two CriteriaIQ Webhook providers pointing at different n8n workflows. Each workflow internally decides the downstream. |
| You want to **switch providers without redeploying** CriteriaIQ | Change the n8n workflow; CriteriaIQ keeps calling the same URL. |
| You're **NOT** using n8n | Same contract works for AWS Lambda, Azure Functions, a Python proxy, anything that speaks HTTP. |

---

## The contract

### Request — CriteriaIQ to your webhook

```http
POST <your-webhook-url>
Authorization: Bearer <your-secret>   ← only sent if Bearer Token is non-empty
Content-Type: application/json

{
  "messages": [
    { "role": "system",    "content": "You are a risk-analysis assistant…" },
    { "role": "user",      "content": "Analyze the following project…" }
  ],
  "model": "gpt-4o",
  "maxTokens": 4096,
  "temperature": 0.7
}
```

| Field | Type | Notes |
|---|---|---|
| `messages` | `[{ role, content }]` | OpenAI-shaped chat history. `role` is one of `system`, `user`, `assistant`. |
| `model` | string | The Default Model you configured on the provider. Passed through verbatim so your workflow can route on it. |
| `maxTokens` | number | The Max Tokens you configured. |
| `temperature` | number | 0.0–2.0, the Temperature you configured. |

### Response — your webhook back to CriteriaIQ

**Success (HTTP 200):**

```json
{
  "content": "The AI's reply text here.",
  "model": "gpt-4o",
  "usage": {
    "promptTokens": 123,
    "completionTokens": 456,
    "totalTokens": 579
  }
}
```

| Field | Required? | Notes |
|---|---|---|
| `content` | **yes** | The completion text. Empty string is treated as a contract violation. |
| `model` | no | If present, displayed in the Recent Runs feed. If absent, CriteriaIQ falls back to the configured Default Model. |
| `usage.promptTokens` | no | For cost-tracking. Falls through to `undefined` if absent. |
| `usage.completionTokens` | no | Same. |
| `usage.totalTokens` | no | Same. |

**Error (HTTP non-2xx):**

```json
{ "error": "Quota exceeded for resource X" }
```

A non-2xx with `{ "error": "..." }` surfaces the message verbatim to the
operator. A non-2xx with no body surfaces `Webhook AI provider responded
<status>`.

A 2xx with a missing `content` field surfaces a clear contract-violation
message pointing back at this doc.

### Authentication

| Mode | How to set it up |
|---|---|
| **Bearer token** (most common) | Put a secret in the **Bearer Token** field. CriteriaIQ sends it on every request as `Authorization: Bearer <secret>`. Your n8n workflow validates it in its first node. |
| **IP allowlist** | Leave the Bearer Token field blank. No `Authorization` header is sent. Configure n8n / your reverse proxy to only accept requests from your CriteriaIQ host. |
| **mTLS** | Leave the Bearer Token blank, terminate mTLS at a sidecar in front of your endpoint. CriteriaIQ doesn't currently send client certs natively — handle at the proxy layer. |

---

## Wiring an n8n workflow

### Step 1 — Build the workflow in n8n

Three nodes, in order:

```
[Webhook Trigger]  →  [Azure AI (or whatever)]  →  [Set]  →  [Respond to Webhook]
```

**Webhook trigger** node:
- Method: `POST`
- Path: choose something like `ai-completions`
- Response Mode: `Using 'Respond to Webhook' Node`
- Authentication: **None** (if you'll validate the bearer manually) or **Header Auth** (if you want n8n to enforce it)

**Azure AI / OpenAI / Foundry** node: map the incoming `messages`, `model`,
`maxTokens`, `temperature` from `{{ $json.body.messages }}` etc. into the
node's parameters. The exact field names depend on the n8n AI node you
pick — Azure OpenAI Chat Model, Anthropic Chat Model, Foundry, etc.

**Set** node: reshape the AI node's output into the contract response:
```json
{
  "content": "={{ $json.choices[0].message.content }}",
  "model":   "={{ $json.model }}",
  "usage": {
    "promptTokens":     "={{ $json.usage.prompt_tokens }}",
    "completionTokens": "={{ $json.usage.completion_tokens }}",
    "totalTokens":      "={{ $json.usage.total_tokens }}"
  }
}
```

**Respond to Webhook** node:
- Response Code: `200`
- Response Body: `={{ $json }}`

### Step 2 — Sample workflow JSON

Save the JSON below as `webhook-ai-proxy.json` and import it into your n8n
instance (**Workflows → Import from File**). Replace the Azure credential
ID + deployment name with your own values. The webhook URL n8n shows after
import is what you paste into CriteriaIQ.

```json
{
  "name": "CriteriaIQ AI Webhook → Azure",
  "nodes": [
    {
      "parameters": {
        "httpMethod": "POST",
        "path": "ai-completions",
        "responseMode": "responseNode",
        "options": {}
      },
      "name": "Webhook",
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 1,
      "position": [200, 300]
    },
    {
      "parameters": {
        "resource": "chat",
        "operation": "completion",
        "model": "={{$json.body.model}}",
        "messages": "={{$json.body.messages}}",
        "options": {
          "maxTokens": "={{$json.body.maxTokens}}",
          "temperature": "={{$json.body.temperature}}"
        }
      },
      "name": "Azure OpenAI",
      "type": "@n8n/n8n-nodes-langchain.lmChatAzureOpenAi",
      "typeVersion": 1,
      "position": [440, 300],
      "credentials": {
        "azureOpenAiApi": {
          "id": "REPLACE_WITH_YOUR_CREDENTIAL_ID",
          "name": "Azure OpenAI account"
        }
      }
    },
    {
      "parameters": {
        "mode": "raw",
        "jsonOutput": "={\n  \"content\": {{ JSON.stringify($json.choices[0].message.content) }},\n  \"model\": {{ JSON.stringify($json.model) }},\n  \"usage\": {\n    \"promptTokens\": {{ $json.usage.prompt_tokens }},\n    \"completionTokens\": {{ $json.usage.completion_tokens }},\n    \"totalTokens\": {{ $json.usage.total_tokens }}\n  }\n}"
      },
      "name": "Set Response",
      "type": "n8n-nodes-base.set",
      "typeVersion": 3,
      "position": [680, 300]
    },
    {
      "parameters": {
        "respondWith": "json",
        "responseBody": "={{ $json }}"
      },
      "name": "Respond to Webhook",
      "type": "n8n-nodes-base.respondToWebhook",
      "typeVersion": 1,
      "position": [920, 300]
    }
  ],
  "connections": {
    "Webhook":     { "main": [[{ "node": "Azure OpenAI",        "type": "main", "index": 0 }]] },
    "Azure OpenAI":{ "main": [[{ "node": "Set Response",        "type": "main", "index": 0 }]] },
    "Set Response":{ "main": [[{ "node": "Respond to Webhook",  "type": "main", "index": 0 }]] }
  },
  "active": false,
  "settings": {}
}
```

### Step 3 — Configure the Webhook provider in CriteriaIQ

1. Go to **Configuration → Integrations → AI Providers** and click **Add AI Provider**.
2. **Provider:** Webhook
3. **Display Name:** e.g. `n8n → Azure AI Foundry (production)`
4. **Bearer Token:** the secret you'll validate inside n8n (or blank if using IP allowlist)
5. **Endpoint URL:** paste the webhook URL from n8n
   - If you've configured **Configuration → Integrations → n8n**, the dialog also shows a
     "Pick from n8n integration" dropdown — your webhook-trigger workflows appear automatically
6. **Default Model:** what you want passed through (e.g. `gpt-4o`, `gpt-4.1`, `azure-ai-foundry`)
7. Click **Save**, then **Test Connection** to verify the contract round-trips

If the test fails, the error message points at the most likely cause:
- `Webhook responded 401` → your bearer doesn't match
- `Webhook AI provider responded 404` → URL is wrong, or the n8n workflow isn't activated
- `Webhook responded 2xx but the body is missing the required content field` → your **Set Response** / **Respond to Webhook** isn't shaping the output correctly

---

## Security

- The **Bearer Token** is stored AES-256-GCM encrypted at rest (same envelope as every other AI provider's API key).
- The **Endpoint URL** is stored plain. Don't put secrets in the URL itself — if you must (e.g. n8n workflow with token in path), treat it as if it were public.
- CriteriaIQ does **not** sign the request body — there's no HMAC. If you need request integrity, terminate at a proxy that adds it.
- Webhook traffic is normal `fetch` egress from the CriteriaIQ server. If your deployment uses an outbound proxy, the same proxy applies here.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| "Connection test failed: timeout" | n8n is unreachable from CriteriaIQ. Check egress firewall + the URL itself. |
| "Webhook AI provider responded 401" | Bearer token mismatch. Re-check the n8n Header Auth node. |
| "Webhook responded 2xx but the body is missing the required content field" | Your **Set Response** node isn't producing `{ "content": "..." }`. Check the expression. |
| "Webhook AI provider error: <something>" | A non-2xx response carried `{ "error": "..." }`. Read the message; usually a quota / auth issue inside the downstream. |
| Test passes, but assessments hang | The downstream is slow (>30s). CriteriaIQ doesn't currently impose a per-request timeout on Webhook providers — your reverse proxy may be terminating the connection. |

## Future enhancements

- **Per-request timeout** (currently inherits Node's default `fetch` timeout)
- **HMAC request signing** so the receiving end can verify the body wasn't tampered with
- **Streaming responses** — the contract is currently full-response only; streaming would need an SSE variant
