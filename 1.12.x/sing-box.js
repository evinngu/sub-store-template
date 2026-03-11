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
    
    // Combine ip and ipv6 into address array
    endpoint.address = []
    if (p.ip) endpoint.address.push(p.ip)
    if (p.ipv6) endpoint.address.push(p.ipv6)
    // Handle Sub-Store local_address just in case
    if (p.local_address && Array.isArray(p.local_address)) {
        endpoint.address.push(...p.local_address)
    }

    // Map private-key to private_key
    if (p['private-key']) {
        endpoint.private_key = p['private-key']
    }
    
    // Construct peers array
    let peersConfig = []
    if (p.peers && Array.isArray(p.peers)) {
        p.peers.forEach(peer => {
            peersConfig.push({
                address: peer.server,
                port: peer.port,
                public_key: peer['public-key'] || peer.public_key,
                pre_shared_key: peer['pre-shared-key'] || peer.pre_shared_key,
                allowed_ips: peer['allowed-ips'] || peer.allowed_ips || ["0.0.0.0/0"],
                reserved: peer.reserved
            })
        })
    } else if (p.server && p.server_port) {
        // Fallback for older formats
        peersConfig.push({
            address: p.server,
            port: p.server_port,
            public_key: p.peer_public_key || p['peer-public-key'],
            pre_shared_key: p.pre_shared_key || p['pre-shared-key'],
            allowed_ips: p.allowed_ips || p['allowed-ips'] || ["0.0.0.0/0"],
            reserved: p.reserved
        })
    }
    endpoint.peers = peersConfig

    // Clean up Clash-specific and unnecessary fields
    delete endpoint.ip
    delete endpoint.ipv6
    delete endpoint['private-key']
    delete endpoint.udp
    delete endpoint.dns
    delete endpoint['dialer-proxy']
    delete endpoint['remote-dns-resolve']
    delete endpoint.server
    delete endpoint.server_port
    delete endpoint.endpoints // if it was there
    delete endpoint.peer_public_key
    delete endpoint['peer-public-key']
    delete endpoint.pre_shared_key
    delete endpoint['pre-shared-key']
    delete endpoint.reserved
    delete endpoint.allowed_ips
    delete endpoint['allowed-ips']
    delete endpoint.local_address

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
