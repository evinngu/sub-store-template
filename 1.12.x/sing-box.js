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

// 1. Distribute proxies into outbounds
proxies.forEach(p => {
  if (p.type === 'wireguard') {
    // (2) wireguard 类型的节点，删除 detour
    if (p.detour) delete p.detour;
    // Ensure internal stack for macOS/iOS compatibility
    delete p.system;
  } else {
    // (3) 非 wireguard 类型的落地节点，更新为 relay-common
    if (/落地/i.test(p.tag)) {
        p.detour = 'relay-common';
    } else if (p.detour && p.detour.includes('前置')) {
        // Strip out wrong detours from dialer-proxy imported as outbounds
        delete p.detour;
    }
  }
  config.outbounds.push(p);
})

// 2. Clear native endpoints (keeping it clean since we use outbounds directly)
config.endpoints = [];

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
      p.type !== 'wireguard' && 
      p.type !== 'direct' && 
      p.type !== 'selector' && 
      p.type !== 'urltest' && 
      /落地/i.test(p.tag)
    )
    i.outbounds.push(...getTags(commonProxies))
  }
  if (i.tag === 'exit-warp') {
    // (Direct Tag) Collect wireguard outbounds directly
    const warpProxies = config.outbounds.filter(p => 
      p.type === 'wireguard' && 
      /落地/i.test(p.tag)
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
