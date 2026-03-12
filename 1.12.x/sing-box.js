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

if (!config.endpoints) {
  config.endpoints = []
}

let regularProxies = []
let endpointProxies = []

proxies.forEach(p => {
  if (p.type === 'wireguard') {
    // 1. Ensure the endpoint creates a real system interface
    p.system = true;
    // Sanitize interface name (e.g., wg-WARP-1). Keep it short if possible.
    let ifaceName = "wg-" + Math.random().toString(36).substring(2, 6);
    p.name = ifaceName;
    
    // We don't put detour on the endpoint itself, because the endpoint is just a network device
    // Instead, we put it on the phantom outbound.
    if (p.detour) delete p.detour;
    endpointProxies.push(p);

    // 2. Create a phantom Direct outbound that binds to this WireGuard interface
    let phantomOutbound = {
      tag: p.tag,
      type: "direct",
      bind_interface: ifaceName
    };
    
    if (/落地/i.test(p.tag)) {
        phantomOutbound.detour = 'relay-warp';
    }
    regularProxies.push(phantomOutbound);
  } else {
    // Other node types (e.g. socks5)
    if (/落地/i.test(p.tag)) {
        p.detour = 'relay-common'
    } else if (p.detour && p.detour.includes('前置')) {
        // Strip out wrong detours from dialer-proxy
        delete p.detour
    }
    regularProxies.push(p)
  }
})

config.outbounds.push(...regularProxies)
config.endpoints.push(...endpointProxies)

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
    const commonProxies = regularProxies.filter(p => /落地/i.test(p.tag) && p.detour === 'relay-common')
    i.outbounds.push(...getTags(commonProxies))
  }
  if (i.tag === 'exit-warp') {
    const warpProxies = regularProxies.filter(p => /落地/i.test(p.tag) && p.detour === 'relay-warp')
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
