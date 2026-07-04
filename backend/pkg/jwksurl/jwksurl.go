package jwksurl

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"strings"
	"time"
)

type Options struct {
	BlockPrivateNetworks bool
}

func Normalize(rawURL string) (string, error) {
	u, err := url.ParseRequestURI(rawURL)
	if err != nil {
		return "", errors.New("invalid URL format")
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return "", errors.New("URL scheme must be http or https")
	}
	if u.Hostname() == "" {
		return "", errors.New("URL host is required")
	}
	if u.User != nil {
		return "", errors.New("URL userinfo is not allowed")
	}
	if u.Fragment != "" {
		return "", errors.New("URL fragment is not allowed")
	}

	u.Scheme = strings.ToLower(u.Scheme)
	host := strings.ToLower(u.Hostname())
	port := u.Port()
	if (u.Scheme == "http" && port == "80") || (u.Scheme == "https" && port == "443") {
		port = ""
	}
	if port != "" {
		u.Host = net.JoinHostPort(host, port)
	} else {
		u.Host = host
	}
	return u.String(), nil
}

func Validate(rawURL string, opts Options) error {
	normalized, err := Normalize(rawURL)
	if err != nil {
		return err
	}
	u, err := url.Parse(normalized)
	if err != nil {
		return errors.New("invalid URL format")
	}
	host := u.Hostname()
	addr, err := netip.ParseAddr(host)
	if err == nil && isBlockedAddr(addr, opts) {
		return errors.New("URL host is not allowed")
	}
	return nil
}

func NewHTTPClient(timeout time.Duration, opts Options) *http.Client {
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.Proxy = nil
	dialer := &net.Dialer{Timeout: timeout}
	transport.DialContext = func(ctx context.Context, network string, address string) (net.Conn, error) {
		host, port, err := net.SplitHostPort(address)
		if err != nil {
			return nil, err
		}

		ipAddrs, err := net.DefaultResolver.LookupNetIP(ctx, "ip", host)
		if err != nil {
			return nil, err
		}
		if len(ipAddrs) == 0 {
			return nil, fmt.Errorf("host %s did not resolve to an IP address", host)
		}
		for _, addr := range ipAddrs {
			if isBlockedAddr(addr, opts) {
				return nil, fmt.Errorf("resolved IP address for host %s is not allowed", host)
			}
		}

		return dialer.DialContext(ctx, network, net.JoinHostPort(ipAddrs[0].String(), port))
	}

	return &http.Client{
		Timeout:   timeout,
		Transport: transport,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 5 {
				return errors.New("too many redirects")
			}
			return Validate(req.URL.String(), opts)
		},
	}
}

func isBlockedAddr(addr netip.Addr, opts Options) bool {
	if !addr.IsValid() {
		return true
	}
	if addr.Is4In6() {
		addr = addr.Unmap()
	}
	if isMetadataAddr(addr) {
		return true
	}
	if addr.IsUnspecified() || addr.IsMulticast() || addr.IsLinkLocalUnicast() || addr.IsLinkLocalMulticast() {
		return true
	}
	if opts.BlockPrivateNetworks && (addr.IsLoopback() || addr.IsPrivate()) {
		return true
	}
	return false
}

func isMetadataAddr(addr netip.Addr) bool {
	if addr == netip.MustParseAddr("169.254.169.254") {
		return true
	}
	if addr == netip.MustParseAddr("100.100.100.200") {
		return true
	}
	if addr == netip.MustParseAddr("fd00:ec2::254") {
		return true
	}
	return false
}
