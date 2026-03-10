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
    let endpoint = { ...p }
    // Migrate old outbound fields to the new peers array
    endpoint.peers = [{
      server: p.server,
      server_port: p.server_port,
      peer_public_key: p.peer_public_key,
      pre_shared_key: p.pre_shared_key,
      reserved: p.reserved,
      allowed_ips: p.allowed_ips || ["0.0.0.0/0"]
    }]
    if (endpoint.peers[0].server) {
      endpoint.peers[0].address = endpoint.peers[0].server
      delete endpoint.peers[0].server
    }
    if (endpoint.peers[0].server_port) {
      endpoint.peers[0].port = endpoint.peers[0].server_port
      delete endpoint.peers[0].server_port
    }

    delete endpoint.server
    delete endpoint.server_port
    delete endpoint.endpoints
    delete endpoint.peer_public_key
    delete endpoint.pre_shared_key
    delete endpoint.reserved
    delete endpoint.allowed_ips

    endpointProxies.push(endpoint)
  } else {
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
    const commonProxies = proxies.filter(p => /落地/i.test(p.tag) && p.type !== 'wireguard')
    commonProxies.forEach(p => p.detour = 'relay-common')
    i.outbounds.push(...getTags(commonProxies))
  }
  if (i.tag === 'exit-warp') {
    const warpProxies = proxies.filter(p => /落地/i.test(p.tag) && p.type === 'wireguard')
    warpProxies.forEach(p => p.detour = 'relay-warp')
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
