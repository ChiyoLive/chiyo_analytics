package main

import (
	_ "embed"
	"net/http"

	"github.com/gin-gonic/gin"
)

//go:embed sdk/mpa.iife.js
var sdkMpaJS []byte

//go:embed sdk/spa.js
var sdkSpaJS []byte

//go:embed sdk/index.css
var sdkIndexCSS []byte

func registerSDKRoutes(r *gin.Engine) {
	r.GET("/sdk/mpa.iife.js", func(c *gin.Context) {
		c.Header("Cache-Control", "public, max-age=300")
		c.Data(http.StatusOK, "application/javascript; charset=utf-8", sdkMpaJS)
	})

	r.GET("/sdk/spa.js", func(c *gin.Context) {
		c.Header("Cache-Control", "public, max-age=300")
		c.Data(http.StatusOK, "application/javascript; charset=utf-8", sdkSpaJS)
	})

	r.GET("/sdk/ui/index.css", func(c *gin.Context) {
		c.Header("Cache-Control", "public, max-age=300")
		c.Data(http.StatusOK, "text/css; charset=utf-8", sdkIndexCSS)
	})
}
