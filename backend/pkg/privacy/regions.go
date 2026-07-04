package privacy

import "strings"

var restrictedDefaultCountries = map[string]struct{}{
	"AT": {}, "BE": {}, "BG": {}, "HR": {}, "CY": {}, "CZ": {}, "DK": {},
	"EE": {}, "FI": {}, "FR": {}, "DE": {}, "GR": {}, "HU": {}, "IE": {},
	"IT": {}, "LV": {}, "LT": {}, "LU": {}, "MT": {}, "NL": {}, "PL": {},
	"PT": {}, "RO": {}, "SK": {}, "SI": {}, "ES": {}, "SE": {},

	"GB": {}, "IS": {}, "LI": {}, "NO": {}, "CH": {},
}

func RequiresDefaultAnonymization(countryCode string) bool {
	_, ok := restrictedDefaultCountries[strings.ToUpper(countryCode)]
	return ok
}
