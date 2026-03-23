# AI Deploy Approval Demo

## What The Demo Shows

The AI Deploy Approval demo is the clearest end-to-end narrative in the repository.

If you want the fastest terminal-driven round trip first, start the stack with `make dev` and then
run `make demo`. That built-in flow creates a request, prints the secure approval URL, and waits
for the decision. The browser AI deploy demo below is the richer visual walkthrough.

It simulates:

- an AI deploy agent requesting approval for a production deployment of `billing-api`
- a human opening the secure approval page
- passkey authentication by the approver
- approval of the deployment request
- issuance of a scoped capability token
- capability use by the deploy agent
- recording of `deployment.executed`
- a visible event timeline across audit, immutable log, and ledger

Demo constants:

- service: `billing-api`
- environment: `production`
- version: `2026.03.16-demo`
- region: `eu-west-1`

## Exact Steps To Run It

1. Create env files:

```bash
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/approval-ui/.env.local.example apps/approval-ui/.env.local
```

2. Start the local stack:

```bash
make dev
```

3. Open the demo:

- [http://localhost:3000/demo/ai-deploy](http://localhost:3000/demo/ai-deploy)

4. Click `Request deployment approval`

5. Open the returned secure approval URL in a second tab

6. Register a passkey for `approver@example.com` if needed

7. Authenticate with that passkey

8. Approve the request

9. Return to the demo page and click `Use capability and execute deployment`

## What Happens Technically At Each Step

### 1. Demo page requests approval

The demo page calls:

- `POST /v1/approval-requests`

Payload highlights:

- `action = deployment.execute`
- `resource.type = service`
- `resource.id = billing-api`
- `riskLevel = high`

Because the action is high risk, Approva creates a `pending` approval request and returns a secure approval URL.

### 2. Human opens the approval page

The secure approval URL includes the approval access token.

The UI calls:

- `GET /v1/approval-requests/:id/secure-view?token=...`

This token scopes which request can be viewed and decided.

### 3. Approver authenticates with a passkey

Passkeys are enrolled ahead of time from Console Settings for a managed local user.
The approval page itself now only uses the authentication half of the passkey flow:

- `POST /v1/auth/passkeys/authenticate/start`
- `POST /v1/auth/passkeys/authenticate/finish`

Successful authentication creates an approver session cookie.

### 4. Human approves the request

The approval page calls:

- `POST /v1/approval-requests/:id/secure-approve?token=...`

Approva then:

- validates approval access token
- validates approver session
- records the decision
- issues a scoped capability token
- writes audit, immutable, and ledger events

### 5. Demo page uses the capability

The demo page calls:

- `POST /v1/capabilities/use`

If verification succeeds, Approva records `capability.used`.

### 6. Demo page records deployment execution

The demo page calls:

- `POST /v1/demo/ai-deploy/:approvalRequestId/execute`

This records `deployment.executed` and updates the visible timeline.

## Why The localStorage Token Bridge Exists Only For Demo Purposes

The demo needs a simple way to move the raw capability token from the approval page back to the demo page in the same browser session.

That is why the current demo uses a small browser bridge:

- the approval page stores the capability token briefly in localStorage under a namespaced key
- the demo page reads it, uses it once, and removes it
- the stored record includes timestamps and a short TTL

This is intentionally demo-only and not part of the production architecture.

Production direction is different:

- raw capability tokens should be transported only through explicit application-to-application channels
- the UI should not be the long-term transport path for execution credentials
- the demo bridge exists only to keep the repository demo understandable and self-contained
