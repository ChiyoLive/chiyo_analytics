package main

import (
	"crypto"
	"crypto/ecdsa"
	"crypto/ed25519"
	"crypto/elliptic"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"math/big"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"chiyo_analytics/backend/pkg/jwksurl"
)

const (
	defaultJWKSCacheTTL = 1 * time.Hour
	maxJWKSCacheTTL     = 24 * time.Hour
	refetchCooldown     = 10 * time.Second
)

type JWK struct {
	Kty string `json:"kty"`
	Kid string `json:"kid"`
	Use string `json:"use"`
	Alg string `json:"alg"`
	// RSA
	N string `json:"n"`
	E string `json:"e"`
	// EC / OKP (EdDSA)
	Crv string `json:"crv"`
	X   string `json:"x"`
	Y   string `json:"y"`
}

type JWKS struct {
	Keys []JWK `json:"keys"`
}

type CachedKeys struct {
	Keys      map[string]crypto.PublicKey
	FetchedAt time.Time
	ExpiresAt time.Time
}

type JWKSCache struct {
	sync.RWMutex
	cache                map[string]*CachedKeys
	locks                sync.Map
	blockPrivateNetworks bool
	httpClient           *http.Client
}

type JWKSCacheOptions struct {
	BlockPrivateNetworks bool
}

func NewJWKSCache() *JWKSCache {
	return NewJWKSCacheWithOptions(JWKSCacheOptions{})
}

func NewJWKSCacheWithOptions(opts JWKSCacheOptions) *JWKSCache {
	return &JWKSCache{
		cache:                make(map[string]*CachedKeys),
		blockPrivateNetworks: opts.BlockPrivateNetworks,
		httpClient: jwksurl.NewHTTPClient(5*time.Second, jwksurl.Options{
			BlockPrivateNetworks: opts.BlockPrivateNetworks,
		}),
	}
}

func (c *JWKSCache) GetPublicKey(jwksURL string, kid string) (crypto.PublicKey, error) {
	validationOpts := jwksurl.Options{BlockPrivateNetworks: c.blockPrivateNetworks}
	if err := jwksurl.Validate(jwksURL, validationOpts); err != nil {
		return nil, err
	}
	cacheKey, err := jwksurl.Normalize(jwksURL)
	if err != nil {
		return nil, err
	}

	c.RLock()
	cached, exists := c.cache[cacheKey]
	c.RUnlock()

	now := time.Now()
	if exists && now.Before(cached.ExpiresAt) {
		if pubKey, ok := cached.Keys[kid]; ok {
			return pubKey, nil
		}
	}

	actualLock, _ := c.locks.LoadOrStore(cacheKey, &sync.Mutex{})
	mu := actualLock.(*sync.Mutex)
	mu.Lock()
	defer mu.Unlock()

	c.RLock()
	cached, exists = c.cache[cacheKey]
	c.RUnlock()

	// If we fetched very recently, do not hit the remote endpoint again.
	// This rate-limits requests carrying unknown/forged kids, preventing
	// them from amplifying into a fetch against the user's JWKS endpoint.
	if exists && time.Since(cached.FetchedAt) < refetchCooldown {
		if pubKey, ok := cached.Keys[kid]; ok {
			return pubKey, nil
		}
		return nil, fmt.Errorf("kid %s not found in cached JWKS from %s (recently fetched)", kid, cacheKey)
	}

	slog.Info("Fetching JWKS from remote URL", "url", cacheKey, "kid", kid)
	newKeys, expiresAt, err := c.fetchJWKS(cacheKey)
	if err != nil {
		if exists {
			slog.Warn("Failed to fetch JWKS, falling back to cached keys", "url", cacheKey, "err", err)
			if pubKey, ok := cached.Keys[kid]; ok {
				return pubKey, nil
			}
		}
		return nil, fmt.Errorf("failed to fetch JWKS from %s: %w", cacheKey, err)
	}

	c.Lock()
	c.cache[cacheKey] = &CachedKeys{
		Keys:      newKeys,
		FetchedAt: time.Now(),
		ExpiresAt: expiresAt,
	}
	c.Unlock()

	if pubKey, ok := newKeys[kid]; ok {
		return pubKey, nil
	}

	return nil, fmt.Errorf("kid %s not found in JWKS from %s", kid, cacheKey)
}

func (c *JWKSCache) fetchJWKS(url string) (map[string]crypto.PublicKey, time.Time, error) {
	resp, err := c.httpClient.Get(url)
	if err != nil {
		return nil, time.Time{}, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, time.Time{}, fmt.Errorf("unexpected status code: %d", resp.StatusCode)
	}

	var jwks JWKS
	if err := json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&jwks); err != nil {
		return nil, time.Time{}, err
	}

	keys := make(map[string]crypto.PublicKey)
	for _, key := range jwks.Keys {
		pubKey, err := parseJWK(key)
		if err != nil {
			slog.Warn("Failed to parse key from JWKS", "kid", key.Kid, "kty", key.Kty, "err", err)
			continue
		}
		keys[key.Kid] = pubKey
	}

	return keys, jwksCacheExpiry(resp.Header, time.Now()), nil
}

func jwksCacheExpiry(header http.Header, now time.Time) time.Time {
	for _, directive := range strings.Split(header.Get("Cache-Control"), ",") {
		directive = strings.TrimSpace(strings.ToLower(directive))
		if directive == "no-cache" || directive == "no-store" {
			return now
		}
		if strings.HasPrefix(directive, "max-age=") {
			seconds, err := strconv.ParseInt(strings.TrimPrefix(directive, "max-age="), 10, 64)
			if err != nil || seconds < 0 {
				continue
			}
			return cappedJWKSExpiry(now, time.Duration(seconds)*time.Second)
		}
	}

	if expires := header.Get("Expires"); expires != "" {
		expiresAt, err := http.ParseTime(expires)
		if err == nil {
			if !expiresAt.After(now) {
				return now
			}
			return cappedJWKSExpiry(now, expiresAt.Sub(now))
		}
	}

	return now.Add(defaultJWKSCacheTTL)
}

func cappedJWKSExpiry(now time.Time, ttl time.Duration) time.Time {
	if ttl > maxJWKSCacheTTL {
		ttl = maxJWKSCacheTTL
	}
	return now.Add(ttl)
}

// parseJWK converts a single JWK into a crypto.PublicKey, dispatching on the
// key type (kty) advertised by the user. Supports RSA, EC (ECDSA) and OKP (Ed25519).
func parseJWK(key JWK) (crypto.PublicKey, error) {
	switch key.Kty {
	case "RSA":
		if key.N == "" || key.E == "" {
			return nil, fmt.Errorf("RSA key missing n or e")
		}
		return parseRSAPublicKey(key.N, key.E)
	case "EC":
		if key.Crv == "" || key.X == "" || key.Y == "" {
			return nil, fmt.Errorf("EC key missing crv, x or y")
		}
		return parseECPublicKey(key.Crv, key.X, key.Y)
	case "OKP":
		if key.Crv == "" || key.X == "" {
			return nil, fmt.Errorf("OKP key missing crv or x")
		}
		return parseOKPPublicKey(key.Crv, key.X)
	default:
		return nil, fmt.Errorf("unsupported kty: %q", key.Kty)
	}
}

func parseRSAPublicKey(nStr, eStr string) (*rsa.PublicKey, error) {
	nBytes, err := decodeBase64URL(nStr)
	if err != nil {
		return nil, err
	}
	eBytes, err := decodeBase64URL(eStr)
	if err != nil {
		return nil, err
	}

	n := new(big.Int).SetBytes(nBytes)
	var eVal int
	for _, b := range eBytes {
		eVal = (eVal << 8) | int(b)
	}

	return &rsa.PublicKey{
		N: n,
		E: eVal,
	}, nil
}

func parseECPublicKey(crv, xStr, yStr string) (*ecdsa.PublicKey, error) {
	var curve elliptic.Curve
	switch crv {
	case "P-256":
		curve = elliptic.P256()
	case "P-384":
		curve = elliptic.P384()
	case "P-521":
		curve = elliptic.P521()
	default:
		return nil, fmt.Errorf("unsupported EC curve: %q", crv)
	}

	xBytes, err := decodeBase64URL(xStr)
	if err != nil {
		return nil, err
	}
	yBytes, err := decodeBase64URL(yStr)
	if err != nil {
		return nil, err
	}

	x := new(big.Int).SetBytes(xBytes)
	y := new(big.Int).SetBytes(yBytes)
	if !curve.IsOnCurve(x, y) {
		return nil, fmt.Errorf("EC point is not on curve %s", crv)
	}

	return &ecdsa.PublicKey{
		Curve: curve,
		X:     x,
		Y:     y,
	}, nil
}

func parseOKPPublicKey(crv, xStr string) (ed25519.PublicKey, error) {
	if crv != "Ed25519" {
		return nil, fmt.Errorf("unsupported OKP curve: %q", crv)
	}
	xBytes, err := decodeBase64URL(xStr)
	if err != nil {
		return nil, err
	}
	if len(xBytes) != ed25519.PublicKeySize {
		return nil, fmt.Errorf("invalid Ed25519 public key size: %d", len(xBytes))
	}
	return ed25519.PublicKey(xBytes), nil
}

// decodeBase64URL decodes a base64url value, tolerating both padded and
// unpadded inputs (JWKS members are unpadded per RFC 7515, but be lenient).
func decodeBase64URL(s string) ([]byte, error) {
	b, err := base64.RawURLEncoding.DecodeString(s)
	if err != nil {
		return base64.URLEncoding.DecodeString(addPadding(s))
	}
	return b, nil
}

func addPadding(s string) string {
	switch len(s) % 4 {
	case 2:
		return s + "=="
	case 3:
		return s + "="
	}
	return s
}
