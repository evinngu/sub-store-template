const { type, name } = $arguments
const compatible_outbound = {
  tag: 'COMPATIBLE',
  type: 'direct',
}

let compatible
let config = JSON.parse($files[0])
let proxies = await produceArtifact({
  name,
  type: /^1$|col/i.test(type) ? 'collection' : 'subscription',
  platform: 'sing-box',
  produceType: 'internal',
})

// 1. Distribute proxies into outbounds and endpoints
proxies.forEach(p => {
  if (p.type === 'wireguard') {
    if (!config.endpoints) config.endpoints = [];
    p.tag = p.tag + "-ep"; // Rename endpoint to avoid collision with phantom outbound
    delete p.system; // Internal stack for iOS compatibility
    // WARP needs a detour to the relay group to connect in restricted networks
    p.detour = "relay-warp"; 
    config.endpoints.push(p);
  } else {
    // Normal landing nodes detour to relay-common (already confirmed working)
    if (/落地/i.test(p.tag)) {
        p.detour = 'relay-common';
    } else if (p.detour && p.detour.includes('前置')) {
        delete p.detour;
    }
    config.outbounds.push(p);
  }
})

// 2. Inject phantom routing outbounds for WireGuard UI visibility
if (config.endpoints) {
  let phantomOutbounds = []
  config.endpoints.forEach(ep => {
    if (ep.type === 'wireguard') {
      if (!ep.name) {
        ep.name = "wg" + Math.floor(Math.random() * 9000 + 1000);
      }
      let phantomOutbound = {
        tag: ep.tag.replace(/-ep$/, ""),
        type: "direct",
        bind_interface: ep.name
      };
      phantomOutbounds.push(phantomOutbound);
    }
  })
  config.outbounds.push(...phantomOutbounds)
}

// 3. Populate Selector Groups
config.outbounds.map(i => {
  // Relay Groups: Standard groups only contain relay nodes (non-landing) to break loops
  if (['all', 'all-auto'].includes(i.tag)) {
    i.outbounds.push(...getTags(proxies, null, true))
  }
  if (['hk', 'hk-auto'].includes(i.tag)) {
    i.outbounds.push(...getTags(proxies, /港|hk|hongkong|hong kong|🇭🇰/i, true))
  }
  if (['tw', 'tw-auto'].includes(i.tag)) {
    i.outbounds.push(...getTags(proxies, /台|tw|taiwan|🇹🇼/i, true))
  }
  if (['jp', 'jp-auto'].includes(i.tag)) {
    i.outbounds.push(...getTags(proxies, /日本|jp|japan|🇯🇵/i, true))
  }
  if (['sg', 'sg-auto'].includes(i.tag)) {
    i.outbounds.push(...getTags(proxies, /^(?!.*(?:us)).*(新|sg|singapore|🇸🇬)/i, true))
  }
  if (['us', 'us-auto'].includes(i.tag)) {
    i.outbounds.push(...getTags(proxies, /美|us|unitedstates|united states|🇺🇸/i, true))
  }
  
  // Processing Exit Groups
  if (i.tag === 'exit-common') {
    // Collect non-wireguard landing nodes from outbounds
    const commonProxies = config.outbounds.filter(p => 
      p.type !== 'direct' && 
      p.type !== 'selector' && 
      p.type !== 'urltest' && 
      /落地/i.test(p.tag)
    )
    i.outbounds.push(...getTags(commonProxies))
  }
  if (i.tag === 'exit-warp') {
    // Collect phantom 'direct' outbounds representing WARP
    const warpProxies = config.outbounds.filter(p => 
      p.type === 'direct' && 
      /落地/i.test(p.tag) && 
      p.bind_interface
    )
    i.outbounds.push(...getTags(warpProxies))
  }
})

config.outbounds.forEach(outbound => {
  if (Array.isArray(outbound.outbounds) && outbound.outbounds.length === 0) {
    if (!compatible) {
      config.outbounds.push(compatible_outbound)
      compatible = true
    }
    outbound.outbounds.push(compatible_outbound.tag);
  }
});

$content = JSON.stringify(config, null, 2)

function getTags(proxies, regex, excludeLanding = false) {
  let filtered = regex ? proxies.filter(p => regex.test(p.tag)) : proxies;
  if (excludeLanding) {
    filtered = filtered.filter(p => !/落地/i.test(p.tag));
  }
  return filtered.map(p => p.tag);
}
