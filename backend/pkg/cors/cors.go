package cors

import (
	"path"
	"strings"
)

// MatchOrigin checks if the given origin matches any of the allowed origins,
// supporting exact match and globbing (e.g. "https://*.domain.com").
func MatchOrigin(allowedOrigins []string, origin string) bool {
	for _, o := range allowedOrigins {
		if o == origin {
			return true
		}
		if strings.Contains(o, "*") {
			matched, err := path.Match(o, origin)
			if err == nil && matched {
				return true
			}
		}
	}
	return false
}
