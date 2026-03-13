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

// 1. Process and Distribute Proxies
proxies.forEach(p => {
  // Ensure internal stack for WireGuard to avoid naming/kernel issues on iOS
  if (p.type === 'wireguard') {
    delete p.system;
  }
  
  // Enforce detours for "落地" nodes based on their type
  if (/落地/i.test(p.tag)) {
    p.detour = (p.type === 'wireguard') ? 'relay-warp' : 'relay-common';
  } else if (p.detour && p.detour.includes('前置')) {
    // Cleanup incorrect detours from upstream
    delete p.detour;
  }
  
  config.outbounds.push(p);
})

// 2. Clear native endpoints (not needed for this simplified 1:1 setup)
config.endpoints = [];

// 3. Populate Selector Groups
// Break circular dependency: Relay groups (all, hk...) exclude landing nodes.
config.outbounds.map(i => {
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
  
  // Specific Exit Groups
  if (i.tag === 'exit-common') {
    // non-wireguard landing nodes
    const commonProxies = config.outbounds.filter(p => p.type !== 'wireguard' && p.type !== 'selector' && p.type !== 'urltest' && p.type !== 'direct' && /落地/i.test(p.tag))
    i.outbounds.push(...getTags(commonProxies))
  }
  if (i.tag === 'exit-warp') {
    // wireguard landing nodes
    const warpProxies = config.outbounds.filter(p => p.type === 'wireguard' && /落地/i.test(p.tag))
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
