---
layout: post
title: "Notes on local WebRTC playback: the SSAM trade-offs"
description: "SSAM as an architecture example: stream placement, viewer fan-out, bandwidth budgets, HTTPS and media encryption, firewall paths, and operational trade-offs."
date: 2026-11-05
---

Cool, the stream works. Now open the camera grid on three machines. Where’s all that traffic going?

And while I’m there: what’s encrypted, which connection crosses the firewall, and what happens when a dependency vanishes? One working player gives me plenty of new questions.

These are my current notes on those questions in SSAM. Some decisions are specific to this deployment; some numbers are examples. I expect the picture to get sharper as I learn more.

With SSAM, each deployed machine carries its own streaming instance. Cameras feed that machine; the viewer runs on another machine inside the site network. The browser-facing endpoint uses **HTTPS through Caddy**, and the streaming stack includes FFmpeg, MediaMTX, and WHEP playback.

The operating pattern is roughly **one to three simultaneous viewers**, with variable-bitrate camera feeds and low-delay live viewing as the goal. Those are the deployment facts behind this example. The capacity numbers below are illustrative. Network policies, availability targets, and unconfirmed security controls are design considerations, rather than claims that I have audited every installation.

## The constraints I start with

Before I add another box to the diagram, I want to know what problem it’s taking off my hands:

- Where do cameras, media server, and viewers sit? A site LAN, a routed VLAN, and a remote access network are different paths.
- How many cameras and simultaneous viewers need to work at peak load?
- What delay is acceptable for the operator’s task? What startup time and recovery time count as usable?
- Which dependencies can the site reach, and which can it continue without?
- Which identities can view which streams, and who owns certificates, updates, and recovery?

The SSAM box is already there. I’d like it to serve the local view without making a public service somebody else has to keep alive part of the critical path.

Tempting shortcut, though: “it’s local, so it’s fine.” I still have bandwidth and trust boundaries to account for.

## How I separate signaling, media, and management

<figure class="article-flow">
  <figcaption>SSAM: simplified placement, with distinct connection paths</figcaption>
  <div class="article-flow__nodes"><span>Cameras</span><b aria-hidden="true">→</b><span>SSAM machine<br><small>FFmpeg / MediaMTX</small></span><b aria-hidden="true">→</b><span>Viewer<br><small>Another site machine</small></span></div>
  <p>Signaling: viewer → Caddy over HTTPS → configured upstream. Media: MediaMTX ↔ viewer over a negotiated WebRTC connection protected with DTLS-SRTP. The diagram does not specify camera-ingest security or private network configuration.</p>
</figure>

**WHEP** supplies HTTP / HTTPS -based signaling for WebRTC playback. In this deployment that signaling is reached over HTTPS through a reverse proxy. WHEP doesn’t make the media flow through the HTTP reverse proxy. Its current specification requires HTTPS for the security model. [WHEP Internet-Draft](https://www.ietf.org/archive/id/draft-ietf-wish-whep-05.html).

The media connection has its own address, transport, and reachability requirements. The management interfaces form another surface again. A healthy web page is evidence about the web path; it tells me very little about either of the others. [MediaMTX connectivity documentation](https://mediamtx.org/docs/features/webrtc-specific-features).

## How I think about the bandwidth budget

One host, one camera feed, several viewers. Nice and tidy on the diagram. The extra copies still have to leave the machine. MediaMTX identifies server-to-reader bandwidth as a common scaling constraint when forwarding without re-encoding. [MediaMTX scalability guidance](https://mediamtx.org/docs/features/scalability).

Time for the deliberately boring arithmetic. I find it catches things the nice diagram doesn’t:

```text
Server ingress = sum of camera stream bitrates received
Server egress  = sum, over viewers, of the bitrates they watch
```

That estimate assumes a single received feed per camera, then separate unicast delivery to each viewer. Extra ingest sessions, renditions, recording destinations, and analytics paths need their own accounting.

**Illustrative example—not measured SSAM traffic:**

<div class="table-scroll" role="region" aria-label="Illustrative bandwidth budget" tabindex="0" markdown="1">

| Assumption or calculation | Payload rate |
| --- | --- |
| Five cameras, each at 4 Mb/s | 20 Mb/s into the server |
| One operator watching all five | 20 Mb/s out |
| Three operators watching all five | 60 Mb/s out |
| Illustrative 25% allowance on that egress | 75 Mb/s planning figure |

</div>

The 25% is a placeholder to make the margin visible, not a universal engineering factor. Real sizing needs measured peak bitrates, packet overhead, retransmissions, keyframe bursts, other traffic, and the site’s required reserve. Measure NIC receive and transmit separately; a full-duplex link has separate directional limits.

At a sustained **60 Mb/s**, eight hours of media payload represents roughly **216 GB** in decimal units. That matters if a deployment starts moving this traffic over a metered WAN or relay. It is a traffic estimate, not a bill: provider accounting and chargeable directions may differ.

And then I have to follow the traffic out of the server: switch uplink, inter-VLAN path, viewer. The browser has to decode the full grid too. Getting server CPU down is a win; I can still run out of room somewhere else.

The source mix includes thermal and PTZ cameras. I had to budget the actual active streams, not just physical camera count: a device can expose more than one channel or profile, and only the streams actually consumed belong in the ingress calculation. I would not derive a deployed bitrate from a model name alone.

For VBR, I’d inspect steady scenes, motion, PTZ movement, keyframe bursts, and simultaneous reconnects.

Also: “it’s a 4K camera” still hasn’t given me a bitrate. Codec, frame rate, motion, quality settings, and configured limits all get a vote.

For constrained links, I’d evaluate lower-bitrate camera substreams or explicit encoding profiles. I wouldn’t assume that forwarding a stream automatically produces an adaptive bitrate ladder. Real-time congestion control must respond to competing traffic, but it doesn’t manufacture link capacity. [WebRTC media transport](https://www.rfc-editor.org/rfc/rfc8834.html), [congestion-control requirements](https://www.rfc-editor.org/rfc/rfc8836.html).

## Why I budget latency across the whole path

This is where WHEP/WebRTC makes sense to me: the operator wants a live view, not a view that quietly drifts behind.

WHEP establishes playback; WebRTC provides the real-time media transport. I still need to measure the delay across the whole path. The acronym hasn’t done that bit for me.

I’d trace capture and encoding, keyframe availability, any decode/re-encode step, server queues, network transit, the receiver’s jitter buffer, and browser decoding/rendering. A long keyframe interval can hurt time to first picture; buffering and congestion can make a connected feed increasingly stale.

Where compatible source encoding can be forwarded, I’d evaluate avoiding unnecessary transcoding. Where browser compatibility requires re-encoding, I’d explicitly budget its compute, quality, and latency cost. MediaMTX documents browser codec constraints and the cases that need re-encoding. [MediaMTX WebRTC codec guidance](https://mediamtx.org/docs/features/webrtc-specific-features#codec-support-in-browsers).

For acceptance, I’d measure first-frame time, steady-state glass-to-glass delay, and recovery delay at one, two, and three concurrent viewers, including motion and network contention. Report percentiles and worst observed behavior. “Near real time” is the user requirement here; a numerical millisecond SLO still needs measurement and agreement.

## The traffic matrix I’d take to the network team

“Everything comes from the same origin” is useful context. The actionable requirement is a list of source, destination, transport, and purpose.

<div class="table-scroll" role="region" aria-label="Network requirements by connection" tabindex="0" markdown="1">

| Connection | Requirement to establish | Architectural concern |
| --- | --- | --- |
| Cameras → SSAM | Actual ingest protocol, ports, bitrate and protection | Camera permissions, segment boundaries, aggregate ingress |
| Viewer → Caddy | HTTPS endpoint, trusted certificate and permitted route | Signaling reachability and identity enforcement |
| Caddy → signaling upstream | Explicit backend address and protection | Restrict a same-host path or verify upstream TLS across a network |
| Viewer ↔ MediaMTX | Reachable advertised ICE candidates and configured media transport | Media ACLs, routing, UDP policy and any supported TCP fallback |
| Endpoints → STUN, if needed | Approved discovery endpoint and transport | Reachability, address exposure and dependency ownership |
| Endpoints → TURN, if needed | Approved relay endpoints, credentials and transports | Relay capacity, permitted egress, availability and cost |

</div>

These are requirement categories, not a proposed firewall rule set. I’d fill in actual ports from the deployed version and configuration. MediaMTX separates its signaling listener from its configurable media listeners. [MediaMTX configuration reference](https://mediamtx.org/docs/references/configuration-file).

For the local SSAM arrangement, a permitted direct path can avoid new internet-facing NAT forwarding and external relay infrastructure. A viewer across VLANs still needs routing and ACL permission. Advertising an unreachable NIC, container address, or hostname can break playback even when HTTPS works.

Small detour, because the port number is tempting: TURN on 443 is still TURN traffic. It doesn’t become ordinary HTTP or gain an automatic exception through an HTTP-only proxy or industrial firewall.

## The security boundaries I keep separate

The confirmed browser-facing SSAM path uses **HTTPS through Caddy**. TLS protects signaling there. WebRTC uses a DTLS handshake to establish SRTP keys; SRTP protects the media between the viewer and MediaMTX, including when a TURN relay forwards it. [WebRTC security architecture](https://www.rfc-editor.org/rfc/rfc8827.html#section-6.5).

I’d document the rest of the trust boundaries separately:

- **Proxy upstream:** where TLS terminates and what protects the next hop. Caddy supports independently configured upstream transports; front-end HTTPS does not establish backend protection. [Caddy reverse-proxy documentation](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy#upstream-addresses).
- **Stream authorization:** enforce access on session creation and relevant session operations, not just by hiding a link in the UI. Keep media and management privileges distinct.
- **Certificates and credentials:** establish trust distribution, renewal, expiry monitoring, and rotation for the site’s connectivity model. Don’t assume a public certificate service is reachable from an offline site.
- **Camera ingest and storage:** specify their own protection and retention requirements. Browser playback encryption says nothing about those paths.

MediaMTX is a media endpoint. Encrypted playback is not a claim that the server cannot see the video, or that the entire camera-to-viewer chain has opaque end-to-end encryption.

So yes, the local design helps with placement and dependencies. I still need to be able to point at each boundary and explain what protects it.

## Where I place WHEP, STUN, TURN, and ICE

<div class="table-scroll" role="region" aria-label="Protocol roles and trade-offs" tabindex="0" markdown="1">

| Piece | Job | What it adds to the design |
| --- | --- | --- |
| WHEP | Negotiate WebRTC playback using HTTPS signaling | A playback interface; media reachability still needs a design |
| STUN | Discover NAT mappings and support connectivity checks | Potential direct paths, without relaying the video |
| TURN | Provide a relay allocation | Another usable path, plus relay bandwidth and service ownership |
| ICE | Gather and test candidate pairs, then select a working pair | Connection selection across available local, discovered, or relayed paths |

</div>

These can coexist in one session. A WHEP player can negotiate a connection that ultimately uses TURN. Also, avoiding a separate public STUN service doesn’t remove STUN messages from ICE’s connectivity checks. [STUN](https://www.rfc-editor.org/rfc/rfc8489.html), [TURN](https://www.rfc-editor.org/rfc/rfc8656.html), [ICE](https://www.rfc-editor.org/rfc/rfc8445.html).

**Direct local delivery** keeps the media path close to the installation and avoids an external relay dependency where the site permits it. The trade-off is operating a media instance at each machine: versions, configuration, certificates, capacity, and support need a repeatable process. The SSAM host also remains a local failure boundary.

**STUN-assisted direct delivery** is worth considering where NAT mapping discovery can make an approved direct route work. It adds discovery, not a guaranteed route through every firewall.

**TURN-relayed delivery** is appropriate when direct paths fail or policy calls for a controlled relay. It can centralize an approved traversal path, but every relayed viewer still costs capacity. In the earlier 60 Mb/s example, a relay forwards roughly 60 Mb/s in and 60 Mb/s out—about 120 Mb/s aggregate relay-interface traffic before overhead. That does not mean the SSAM host sends every byte twice, nor does it define a provider’s billing method.

The relay has earned a box on the diagram. It also gets a capacity budget, an owner, and a failure test.

If I’m expecting local viewing to survive a public-service outage, I want to test that expectation. Writing “local” beside the arrow isn’t enough.

## The evidence I’d want before handover

The following is how I would validate this architecture, not a report of tests run against a live SSAM installation:

1. **Load the real viewing pattern.** Use the expected peak number of cameras and viewers. Measure peak ingress/egress, CPU, memory, decode load, first-frame time, and playback delay. Define acceptable values with the operator and network owner.
2. **Exercise the network boundary.** Validate the selected ICE path, routing, ACLs, loss, jitter, and competing traffic in an approved test environment. Check what happens when direct UDP is unavailable and whether the intended alternative actually works.
3. **Exercise recovery.** Disconnect a camera, restart a media process, interrupt signaling, and test the intended external-service outage behavior. Verify bounded retries, backoff, and an unmistakable stale/offline indication rather than a frozen image that looks live.
4. **Exercise identity and certificate failures.** Check unauthorized stream requests, expired credentials, revoked access, untrusted certificates, and renewal failures. Logs should explain failures without exposing tokens or camera credentials.
5. **Verify the release artifact.** Keep versions, build configuration, third-party notices, rollback instructions, and any required source-delivery mechanism aligned with the binaries actually shipped.

I’d separate signaling failures, ICE failures, and “connected but no useful frames” in telemetry. First-frame latency, reconnect counts, active viewers, stream bitrate, dropped frames, resource pressure, and relay selection tell different parts of the story. “Process is alive” is a useful starting point. I’d also like to know whether anyone can see a fresh frame.

## Where I’ve landed so far

For the confirmed SSAM arrangement, the local media instance gives viewers a nearby serving point. HTTPS through Caddy protects browser-facing signaling; WebRTC protects its media session. A direct local path can keep playback independent of an external relay where policy permits it.

The costs I still need to account for are per-machine operations, viewer fan-out, the host failure boundary, and explicit network/security controls. Remote access or a larger audience changes those calculations.

That’s the picture I’m trying to keep in my head: where each byte goes, who can receive it, what keeps it moving, and what the operator sees when it stops.

Quite a lot hiding behind “the stream works.”

For the connection mechanics, I’ve drawn out [how I understand STUN, TURN, and ICE]({{ '/blog/how-i-understand-stun-turn-and-ice/' | relative_url }}). That companion note focuses on the messages and paths behind this deployment discussion.
