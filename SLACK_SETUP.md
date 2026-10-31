# Slack sales notifications — delivery disabled by default

No Slack app, channel, installation or webhook was created for this implementation,
and no real message was sent. Development and automated tests use injected mocks
only. Actual workspace setup and first delivery require explicit approval and the
selected workspace/channel; AXHub deployment remains separately gated.

## What was verified

Read-only CLI evidence supplied by the orchestrator: Slack CLI4.12.0 has a visible
developer workspace session, but `slack api auth.test --method GET` returned
`not_authed`. `slack app list` returned `invalid_app_directory` because this is not
a configured Slack SDK app project. These results do not prove that no Slack apps
exist. Reuse of an existing installed app/webhook is not yet verified.

Slack's documented app-creation API supports configuration-token authentication
with app_configurations:write; that token is distinct from a developer CLI session
or bot token. Do not guess that an existing CLI login authorizes app installation.
See [apps.manifest.create](https://docs.slack.dev/reference/methods/apps.manifest.create/).

## Approved setup procedure

1. Confirm the approved workspace, destination channel, installer and data scope.
   Prefer an existing suitable app/channel after an authorized inventory check;
   otherwise obtain approval before creating them. Do not create or install an app
   from this runbook automatically.
2. An authorized installer enables Incoming Webhooks in the Slack app settings,
   chooses the approved channel and completes Slack's authorization flow. Channel
   access and workspace policies still apply. The webhook is tied to that chosen
   channel. Follow [Slack's incoming webhook setup](https://docs.slack.dev/messaging/sending-messages-using-incoming-webhooks/).
3. Put the resulting URL only in the server secret SLACK_SALES_WEBHOOK_URL. Never
   paste it into chat, client settings, screenshots, logs, command arguments or Git.
   The application accepts only HTTPS hooks.slack.com/services/... URLs without
   credentials, query/hash or alternate hosts. Redirects are rejected. GovSlack and
   Workflow Builder destinations are not implemented.
4. Set BORDERLESS_PUBLIC_URL to the real canonical HTTPS application origin, with
   no path/query/credentials. It must resolve publicly; the operator must verify
   the deployment domain. The application rejects IP literals, localhost and common
   private/development aliases, and never uses request headers or localhost as a
   fallback. The link targets /admin/inquiries?inquiryId=<id>; opening it still
   requires a platform-operator session.
5. Leave SLACK_SALES_DELIVERY_ENABLED unset/false until first-send approval. Native
   delivery additionally requires NODE_ENV=production. Development/test execution
   cannot perform native Slack transport even when an enabled flag is present.
6. After approval, enable the flag through the approved secret/configuration
   procedure. Use one synthetic inquiry to verify the selected channel, minimal
   message, correct admin link and persisted status. Treat this as a real external
   message; do not use client data for the smoke test. Never send one autonomously.

A minimal local manifest proposal, for authorized review rather than execution:

    display_information:
      name: Borderless Sales
      description: Minimal sales inquiry notifications
    oauth_config:
      scopes:
        bot:
          - incoming-webhook
    settings:
      incoming_webhooks:
        incoming_webhooks_enabled: true

This is a proposal based on the [official manifest schema](https://docs.slack.dev/reference/app-manifest/),
not proof of creation, installation or approval. The current implementation uses
standard HTTPS JSON requests and does not require a bot token or Slack SDK project.

## Message privacy

Only inquiry ID, company name, inquiry type, received timestamp and the canonical
admin link are sent. Plain-text blocks prevent Slack markup from being interpreted;
URL/contact-like content in labels is omitted. Contact names/email/phone, inquiry
notes, sales notes, documents, legal assessments, credentials and payment details
are never copied into this payload. Webhook secrets and raw provider error bodies
are neither stored in outbox records nor logged.

## Queue, retries and uncertainty

Inquiry creation enqueues the minimal event in the same PostgreSQL transaction.
A unique event/channel/aggregate key deduplicates queue creation. The durable worker
uses FOR UPDATE SKIP LOCKED and a 30-second lease; each provider operation is bounded
to five seconds natively/six seconds in the queue wrapper. Batches are capped at
five concurrent operations, with the production timer processing one item every
10seconds by default. PostgreSQL, rather than process memory, retains the queue.
The timer is in-process; scale and monitor workers deliberately.

Statuses are Pending, Sent, Failed, Retry Scheduled and Disabled. Missing
configuration or production opt-in yields Disabled without an outgoing request.
There are at most five automatic attempts per retry cycle with exponential delay.
HTTP429 honors Retry-After for the whole Slack channel: a persisted rate-limit
record prevents other inquiries and workers from claiming work until that deadline.
The cooldown remains effective when that record exhausts its retry budget;
manual retry cannot shorten it. Already in-flight requests cannot be recalled.
Unusually long/unsupported delays require operator
review. Other permanent4xx responses stop automatic retries. Slack's rate policy
and header behavior are documented in [rate limits](https://docs.slack.dev/apis/web-api/rate-limits/).

The normal webhook acknowledgement is HTTP200 with an ok body. A webhook does not
provide a message identifier here, so none is invented. Incoming webhooks do not
support deleting a sent message through that webhook. See [webhook responses and
limitations](https://docs.slack.dev/messaging/sending-messages-using-incoming-webhooks/).

A network timeout or expired worker lease cannot establish whether Slack accepted
the message. Such records retain uncertain=true, including after a later confirmed
retry, because duplicates may already exist. Expired leases are recovered from
PostgreSQL and retried within the budget. A late worker cannot overwrite a newer
lease's state. This is an at-least-once retry strategy, not an exactly-once delivery
guarantee. Sent means a confirmed acknowledgement was recorded, not that a human
read the message. Failed/uncertain records require human inspection after exhaustion.

## Operator retry and troubleshooting

Only an explicitly configured active platform operator may retry a notification;
organization Owner/Admin is insufficient. The endpoint is
POST /api/admin/inquiries/{inquiryId}/notifications/{notificationId}/retry with {}.
The service checks the notification belongs to that inquiry. Sent, Pending and
actively leased rows cannot be manually retried. Disabled/Failed/Retry Scheduled
rows require current approved production configuration. The operator action is
rate-limited and audited; it resets the bounded cycle while retaining uncertainty
and the previous attempt count in audit history. A manual retry preserves any
provider-mandated channel cooldown. It does not synchronously send.

Before retrying, inspect the safe category and possible duplicate state in the CRM.
For configuration/rejection failures, have the authorized installer verify the
channel, installation and secret privately. For rate limits, wait until the stored
retry time. For timeout/network/lease-expiry, check the destination before deciding
whether another attempt is appropriate. Never paste a webhook URL or raw upstream
body into a ticket. Rotating/reinstalling a webhook requires the same approval and
secret-handling process as initial setup.

Turning delivery off prevents subsequent native attempts; an already in-flight
request may still finish and a previously sent message is not retracted. Stop or
restart workers only through the approved application operation procedure. Do not
mark uncertain records Sent merely to clear an alert.

## Local verification and remaining checks

Targeted command:

    node --env-file=.env.local --import tsx --test tests/notifications.test.ts

The targeted run passed14tests: destination restrictions, development
send prohibition, minimal message projection, scrubbed provider failures, real
PostgreSQL deduplication/concurrent claims, 429 timing and persisted channel-wide
cooldown across concurrent workers, bounded retries, operator
and inquiry binding, stale-lease recovery, timeout abort and concurrent batch lease
safety. Transport is mocked; no real Slack endpoint was called.

Actual app reuse/creation, workspace installation, chosen channel, issued webhook,
canonical hosted admin URL, live acknowledgement and hosted-worker recovery remain
unverified until separately approved. Email delivery is not implemented by this
adapter. Customer inquiry creation must remain successful when Slack is disabled
or delivery later fails; notification delivery never activates billing or signs a
contract.

## Future event routing
The adapter interface is generic over its payload and channel. The event/channel/recipient-alias routing catalog separates sales, expert operations, verification, billing and security recipients; only the sales route is enabled. The current worker implements sales Slack delivery only. Future event payload validation, destination resolution and email transport remain explicitly unimplemented; disabled catalog entries do not enqueue or send notifications. No customer or secret destination is stored in this catalog.
