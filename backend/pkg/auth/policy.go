package auth

import (
	"encoding/json"
)

type PolicyStatement struct {
	Effect  string   `json:"effect"`
	Actions []string `json:"actions"`
}

// EvaluatePolicy evaluates the simple IAM JSONB policies array.
// Returns true if there is an active "allow" statement matching the target action,
// supporting "*" wildcard as "allow all".
func EvaluatePolicy(policiesRaw []byte, targetAction string) (bool, error) {
	if len(policiesRaw) == 0 {
		return false, nil
	}

	var statements []PolicyStatement
	if err := json.Unmarshal(policiesRaw, &statements); err != nil {
		return false, err
	}

	for _, stmt := range statements {
		if stmt.Effect != "allow" {
			continue
		}

		for _, action := range stmt.Actions {
			if action == "*" || action == targetAction {
				return true, nil
			}
		}
	}

	return false, nil
}
