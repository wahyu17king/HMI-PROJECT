# Integration Contract

## Current Status

The HMI is a static browser demo. Room telemetry, device response times, and outages are simulated. There is no live KNX, BMS, MBS, or OPERA connection yet. A browser must not connect directly to KNXnet/IP or contain PMS credentials.

Use an on-premises gateway service between this UI and the building/PMS networks. The UI should communicate only with that service over an authenticated HTTPS API and an event stream. Adapter credentials and KNX keys belong in the service's secret store, never in browser code or local storage.

## Normalized Gateway API

The API should expose provider-neutral data so the UI does not depend on a specific KNX or PMS vendor:

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/v1/health` | Gateway and adapter readiness |
| `GET` | `/api/v1/rooms` | Room state, telemetry, controller health, and last-seen time |
| `POST` | `/api/v1/commands` | Submit a room/device command; return a command ID and `pending` state |
| `GET` | `/api/v1/alarms` | Active and historical alarms with severity and acknowledgment state |
| `POST` | `/api/v1/alarms/{id}/acknowledge` | Acknowledge an alarm with authenticated operator identity |
| `GET` | `/api/v1/history?roomId={id}` | Command history for a room |
| `POST` | `/api/v1/shift-notes` | Store a shift handover note |
| `GET` | `/api/v1/diagnostics` | Adapter/device health and communication metrics |
| `GET` | `/api/v1/exports/rooms.csv` | Export an authorized room snapshot |
| `GET` | `/api/v1/events` | Server-sent events for telemetry, alarms, and command results |

Commands must remain `pending` until the gateway receives device feedback or times out. Include an idempotency key, actor, target point, requested value, result, and timestamp in the durable audit record. The server, not the UI, must enforce authorization.

## KNX Adapter

Use a service-side KNXnet/IP adapter in the same routed network as the KNX IP Interface/Router. The integration needs:

- Gateway IP/port and whether the installation uses tunneling or routing.
- ETS group-address export mapping each room's temperature, AC setpoint, DND/MUR, and feedback points.
- Datapoint types, units, scaling, and expected feedback timeout for each address.
- KNX IP Secure requirements and the approved key-provisioning method, if enabled.

The HMI must display gateway connectivity and the time of the last confirmed telemetry, not infer device state from a submitted command.

## PMS Adapters

OPERA Cloud and OPERA On-Premise require separate adapters behind the normalized gateway API:

- **OPERA Cloud / OHIP:** provisioned OHIP application, environment/base URL, OAuth client configuration, approved scopes, and the property's room/status mapping.
- **OPERA On-Premise / OWS:** exact OPERA version, OWS endpoint/WSDL, enabled services, authentication method, and the property's room/status mapping.
- **MBS/BMS:** identify the actual product/vendor and supported API/protocol. “BMS” alone is not specific enough to implement an adapter.

Map PMS check-in/check-out events to occupancy updates, and apply data-minimization rules to guest information. Do not treat a PMS reservation as proof that a KNX command succeeded.

## Deployment Gates

Before enabling live writes, select the gateway runtime/host, provide non-secret interface documentation and network routes, define room/group-address mappings, and test read-only telemetry first. Then validate command acknowledgments, disconnect/reconnect behavior, server-side roles, durable audit retention, and recovery procedures in a non-production environment. Keep the simulator available as a separate mode; never silently fall back from a failed live connection to simulated values.