package logger

import (
	"chiyo_analytics/backend/pkg/config"
	"context"
	"log/slog"
	"os"

	"github.com/gin-gonic/gin"
)

// Setup initializes the global slog based on GIN_MODE.
func Setup(appCfg config.AppConfig) {
	var handler slog.Handler
	opts := &slog.HandlerOptions{
		Level: slog.LevelDebug,
	}

	if appCfg.Env != "production" {
		handler = slog.NewJSONHandler(os.Stderr, opts)
	} else {
		handler = slog.NewTextHandler(os.Stderr, opts)
	}

	logger := slog.New(handler)
	slog.SetDefault(logger)

	// Route gin's default output to slog
	gin.DefaultWriter = &SlogGinWriter{level: slog.LevelInfo}
	gin.DefaultErrorWriter = &SlogGinWriter{level: slog.LevelError}
}

// SlogGinWriter is an io.Writer that writes to slog.
type SlogGinWriter struct {
	level slog.Level
}

func (w *SlogGinWriter) Write(p []byte) (n int, err error) {
	// Gin adds a trailing newline, we can strip it when passing to slog
	msg := string(p)
	if len(msg) > 0 && msg[len(msg)-1] == '\n' {
		msg = msg[:len(msg)-1]
	}
	slog.Log(context.Background(), w.level, msg)
	return len(p), nil
}
