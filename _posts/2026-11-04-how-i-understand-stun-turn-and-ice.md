---
layout: post
title: "How I understand STUN, TURN, and ICE— with diagrams "
description: "My work journey of address discovery, connectivity checks, and relayed WebRTC media, with a separate look at where WHEP fits."
date: 2026-11-04
---

Okay. The stream plays. Add a NAT, another network, and a relay, and suddenly I need a drawing.

This is the picture I currently use for STUN, TURN, and ICE: what each piece learns, what it sends, and—this is the bit I keep coming back to—where the video actually travels.

It’s a simplified working model, with links to the specifications for the details I’ve left out. For obvious reasons. The diagrams are illustrations, not packet captures or diagrams of a customer network.

## The distinctions I try to keep clear

I have an address. Great. Can the other machine reach it? Different question. Is the session encrypted? Another question again.

Those three facts are easy to blur together when all I want is a picture in the browser.

My shorthand is:

- **STUN:** learn an externally observed address and check connectivity.
- **TURN:** obtain a relay allocation that can carry traffic.
- **ICE:** exchange and test candidates, then select a working pair.
- **WHEP:** provide signaling for WebRTC playback; use HTTPS for that signaling.

## STUN: what address does this request arrive from?

A client sends a **Binding request** to a STUN server. If a NAT translates the source, the server sees the translated address and port. Its response can report that endpoint in `XOR-MAPPED-ADDRESS`, giving the client a server-reflexive candidate.

<figure class="protocol-diagram">
  <div class="protocol-diagram__scroll" tabindex="0" role="region" aria-label="STUN request and response diagram"><img src="{{ '/images/blog/webrtc/stun-discovery.svg' | relative_url }}" data-theme-dark="{{ '/images/blog/webrtc/stun-discovery.svg' | relative_url }}" data-theme-light="{{ '/images/blog/webrtc/stun-discovery-light.svg' | relative_url }}" width="760" height="400" alt="Viewer sends a Binding request through a NAT to a STUN server. The response reports the observed external address and port. No video relay is shown."></div>
  <figcaption>Address discovery. On a narrow screen, scroll the diagram horizontally to follow the messages.</figcaption>
</figure>

That response doesn’t establish that another peer can use the address: mappings and filtering can depend on the destination. Nor does STUN install firewall rules or become the video path. `XOR` in the attribute name is an encoding detail, not a promise of confidentiality. [STUN specification, RFC 8489](https://www.rfc-editor.org/rfc/rfc8489.html).

So I have an address candidate. Useful! But I’m not calling that a working connection yet. I still need the actual peer to reach it. Enter ICE.

## ICE: which candidate pair can actually carry this session?

A candidate describes a potential endpoint. The useful categories here are host/local, STUN-discovered server-reflexive, and TURN-relayed. ICE can also learn peer-reflexive candidates during checks.

The peers exchange candidates through signaling and form candidate pairs. STUN Binding transactions test connectivity. ICE priorities, nomination, and policy determine the selected working pair; it isn't a fixed sequence of “try local, then STUN, then TURN.”

<figure class="protocol-diagram">
  <div class="protocol-diagram__scroll" tabindex="0" role="region" aria-label="ICE candidate selection diagram"><img src="{{ '/images/blog/webrtc/ice-selection.svg' | relative_url }}" data-theme-dark="{{ '/images/blog/webrtc/ice-selection.svg' | relative_url }}" data-theme-light="{{ '/images/blog/webrtc/ice-selection-light.svg' | relative_url }}" width="760" height="400" alt="Local, STUN-discovered, and TURN-relayed candidates feed into pair checks. ICE selects a working pair for media. Candidate checks are not a fixed fallback ladder."></div>
  <figcaption>The diagram groups the steps; it omits timing, priorities, peer-reflexive discovery, and trickle ICE details.</figcaption>
</figure>

A direct local connection can use STUN connectivity checks without depending on a separate public STUN service. A candidate pair becoming valid also doesn't prove useful video is arriving. [ICE specification, RFC 8445](https://www.rfc-editor.org/rfc/rfc8445.html).

This is the detail I want in the logs: which pair got selected? Did any pair get selected?

“Signaling returned successfully” is good news. I’d still like to know where my video went.

## TURN: give this session a reachable relay endpoint

A TURN client requests an **allocation**, authenticating as required, and receives a relayed transport address. The allocation has a lifetime and needs refreshes. Peer permissions control whose traffic the relay accepts; data can use Send/Data indications or a bound channel’s ChannelData messages.

<figure class="protocol-diagram">
  <div class="protocol-diagram__scroll" tabindex="0" role="region" aria-label="TURN allocation and media relay diagram"><img src="{{ '/images/blog/webrtc/turn-relay.svg' | relative_url }}" data-theme-dark="{{ '/images/blog/webrtc/turn-relay.svg' | relative_url }}" data-theme-light="{{ '/images/blog/webrtc/turn-relay-light.svg' | relative_url }}" width="760" height="435" alt="Viewer requests and authenticates a TURN allocation, receives a relay address, and permits the peer. Bidirectional WebRTC traffic then passes through the relay to the media server."></div>
  <figcaption>One possible topology: the viewer uses TURN and the media server reaches its relay address. Both peers don't necessarily need their own allocation.</figcaption>
</figure>

For WebRTC, TURN forwards encrypted DTLS-SRTP traffic; it doesn't need to terminate the media encryption. A TURN permission is not an exception in the site firewall. Both the relay and the relevant paths still have to be reachable under policy. [TURN specification, RFC 8656](https://www.rfc-editor.org/rfc/rfc8656.html), [WebRTC security architecture](https://www.rfc-editor.org/rfc/rfc8827.html#section-6.5).

Now the relay is carrying the traffic. Which brings me straight back to bandwidth, credentials, availability, and what happens when it disappears.

A relay can absolutely be the right choice. I just need to remember that I’ve added a service to operate, not finished the problem because the player connected.

## Where WHEP sits in the picture

WHEP handles the playback negotiation over HTTPS. It doesn't choose away the need for connectivity checks, and a WHEP session can select a TURN-relayed path. The current WHEP document is an Internet-Draft. [WHEP specification](https://www.ietf.org/archive/id/draft-ietf-wish-whep-05.html).

In the SSAM arrangement I’ve described, browser-facing signaling is HTTPS through Caddy, while the viewer runs on another machine on the site network. Whether that viewer reaches MediaMTX directly or needs another path depends on the network and its allowed routes—not just on the fact that the machine serves a WHEP endpoint.

At this point I need to stop collecting acronyms and follow one session:

1. Did signaling complete over the intended HTTPS path?
2. Which candidates were advertised, and could the peer reach them?
3. Did ICE select a pair, and was it direct or relayed?
4. Did the DTLS handshake complete and protected media begin arriving?
5. Are frames fresh and usable, rather than merely showing a connected session?

Same blank player. Several very different places to look.

That’s why I like turning those questions into logs and measurements; otherwise I’m just staring at the player and guessing.

I’ve put the bandwidth, security boundaries, and deployment trade-offs in [my SSAM architecture notes]({{ '/blog/whep-stun-turn-and-local-streaming/' | relative_url }}). This post is the smaller picture I use to keep the connection mechanisms straight; I expect to refine it as I learn more.
