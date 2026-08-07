from ipaddress import ip_address, ip_network

from fastapi import Request


def resolve_client_ip(request: Request, trusted_proxy_cidrs: str = "") -> str:
    peer = request.client.host if request.client is not None else "unknown"
    try:
        peer_address = ip_address(peer)
    except ValueError:
        return peer

    networks = []
    for raw in trusted_proxy_cidrs.split(","):
        value = raw.strip()
        if not value:
            continue
        try:
            networks.append(ip_network(value, strict=False))
        except ValueError:
            continue
    if not any(peer_address in network for network in networks):
        return peer

    forwarded = request.headers.get("x-forwarded-for", "")
    chain = [value.strip() for value in forwarded.split(",") if value.strip()]
    if not chain:
        return peer
    for candidate in reversed(chain):
        try:
            candidate_address = ip_address(candidate)
        except ValueError:
            continue
        if not any(candidate_address in network for network in networks):
            return candidate
    return chain[0]
