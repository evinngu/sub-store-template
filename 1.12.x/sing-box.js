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

// 1. Process regular outbounds (e.g. socks5) to add detour rules
config.outbounds.forEach(p => {
  if (/落地/i.test(p.tag) && !p.detour) {
      p.detour = 'relay-common'
  } else if (p.detour && p.detour.includes('前置')) {
      // Strip out wrong detours from dialer-proxy imported as outbounds
      delete p.detour
  }
})

// 2. Process natively parsed wireguard endpoints to inject phantom routing outbounds
// Sub-Store 1.12 now natively converts Clash WireGuard nodes correctly to endpoints.
if (config.endpoints) {
  let phantomOutbounds = []
  config.endpoints.forEach(ep => {
    if (ep.type === 'wireguard') {
      // Ensure it has a system interface for the phantom outbound to bind to
      if (!ep.name) {
        ep.name = "wg-" + Math.random().toString(36).substring(2, 6);
      }
      ep.system = true;
      if (ep.detour) delete ep.detour; // detour goes strictly on outbounds

      // Create a phantom Direct outbound that binds to this WireGuard interface
      let phantomOutbound = {
        tag: ep.tag,
        type: "direct",
        bind_interface: ep.name
      };
      
      if (/落地/i.test(ep.tag)) {
          phantomOutbound.detour = 'relay-warp';
      }
      phantomOutbounds.push(phantomOutbound);
    }
  })
  config.outbounds.push(...phantomOutbounds)
}

// Remove buggy fallback wireguard outbounds natively injected by Sub-Store (if any left)
config.outbounds = config.outbounds.filter(ob => ob.type !== 'wireguard')

config.outbounds.map(i => {
  if (['all', 'all-auto'].includes(i.tag)) {
    i.outbounds.push(...getTags(proxies))
  }
  if (['hk', 'hk-auto'].includes(i.tag)) {
    i.outbounds.push(...getTags(proxies, /港|hk|hongkong|hong kong|🇭🇰/i))
  }
  if (['tw', 'tw-auto'].includes(i.tag)) {
    i.outbounds.push(...getTags(proxies, /台|tw|taiwan|🇹🇼/i))
  }
  if (['jp', 'jp-auto'].includes(i.tag)) {
    i.outbounds.push(...getTags(proxies, /日本|jp|japan|🇯🇵/i))
  }
  if (['sg', 'sg-auto'].includes(i.tag)) {
    i.outbounds.push(...getTags(proxies, /^(?!.*(?:us)).*(新|sg|singapore|🇸🇬)/i))
  }
  if (['us', 'us-auto'].includes(i.tag)) {
    i.outbounds.push(...getTags(proxies, /美|us|unitedstates|united states|🇺🇸/i))
  }
  if (i.tag === 'exit-common') {
    const commonProxies = config.outbounds.filter(p => p.type !== 'direct' && /落地/i.test(p.tag) && p.detour === 'relay-common')
    i.outbounds.push(...getTags(commonProxies))
  }
  if (i.tag === 'exit-warp') {
    const warpProxies = config.outbounds.filter(p => p.type === 'direct' && /落地/i.test(p.tag) && p.detour === 'relay-warp')
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

function getTags(proxies, regex) {
  return (regex ? proxies.filter(p => regex.test(p.tag)) : proxies).map(p => p.tag)
}
