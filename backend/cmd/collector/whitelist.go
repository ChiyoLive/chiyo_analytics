package main

import (
	"sync"
)

type SiteWhitelist struct {
	sync.RWMutex
	allowed map[string]string // maps siteID -> jwksURL
}

func NewSiteWhitelist() *SiteWhitelist {
	return &SiteWhitelist{allowed: make(map[string]string)}
}

func (w *SiteWhitelist) Check(siteID string) (string, bool) {
	w.RLock()
	defer w.RUnlock()
	url, ok := w.allowed[siteID]
	return url, ok
}

func (w *SiteWhitelist) Update(sites map[string]string) {
	w.Lock()
	defer w.Unlock()
	w.allowed = sites
}

func (w *SiteWhitelist) Upsert(siteID string, jwksURL string) {
	w.Lock()
	defer w.Unlock()
	if w.allowed == nil {
		w.allowed = make(map[string]string)
	}
	w.allowed[siteID] = jwksURL
}

func (w *SiteWhitelist) Delete(siteID string) {
	w.Lock()
	defer w.Unlock()
	delete(w.allowed, siteID)
}
