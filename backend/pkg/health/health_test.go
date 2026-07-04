package health

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
)

type redisStub struct {
	err error
}

func (s redisStub) Ping(context.Context) *redis.StatusCmd {
	cmd := redis.NewStatusCmd(context.Background())
	cmd.SetErr(s.err)
	return cmd
}

type sqlStub struct {
	err error
}

func (s sqlStub) PingContext(context.Context) error {
	return s.err
}

type clickHouseStub struct {
	err error
}

func (s clickHouseStub) Ping(context.Context) error {
	return s.err
}

func TestGinHealthz(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.GET("/healthz", GinHealthz)

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", w.Code, http.StatusOK)
	}
	if got := strings.TrimSpace(w.Body.String()); got != `{"status":"healthy"}` {
		t.Fatalf("body = %s", got)
	}
}

func TestGinReadyz(t *testing.T) {
	tests := []struct {
		name       string
		redisErr   error
		sqlErr     error
		chErr      error
		wantStatus int
		wantBody   string
	}{
		{
			name:       "ready",
			wantStatus: http.StatusOK,
			wantBody:   `{"status":"ready"}`,
		},
		{
			name:       "redis down",
			redisErr:   errors.New("dial failed"),
			wantStatus: http.StatusServiceUnavailable,
			wantBody:   `{"error":"redis down","status":"unhealthy"}`,
		},
		{
			name:       "postgres down",
			sqlErr:     errors.New("dial failed"),
			wantStatus: http.StatusServiceUnavailable,
			wantBody:   `{"error":"postgres down","status":"unhealthy"}`,
		},
		{
			name:       "clickhouse down",
			chErr:      errors.New("dial failed"),
			wantStatus: http.StatusServiceUnavailable,
			wantBody:   `{"error":"clickhouse down","status":"unhealthy"}`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gin.SetMode(gin.TestMode)
			r := gin.New()
			r.GET("/readyz", GinReadyz(redisStub{err: tt.redisErr}, sqlStub{err: tt.sqlErr}, clickHouseStub{err: tt.chErr}))

			w := httptest.NewRecorder()
			req := httptest.NewRequest(http.MethodGet, "/readyz", nil)
			r.ServeHTTP(w, req)

			if w.Code != tt.wantStatus {
				t.Fatalf("status = %d, want %d", w.Code, tt.wantStatus)
			}
			if got := strings.TrimSpace(w.Body.String()); got != tt.wantBody {
				t.Fatalf("body = %s, want %s", got, tt.wantBody)
			}
		})
	}
}

func TestWorkerHandlers(t *testing.T) {
	t.Run("healthz", func(t *testing.T) {
		w := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "/healthz", nil)

		WorkerHealthz(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("status = %d, want %d", w.Code, http.StatusOK)
		}
		if got := w.Header().Get("Content-Type"); got != "application/json" {
			t.Fatalf("Content-Type = %q", got)
		}
		if got := strings.TrimSpace(w.Body.String()); got != `{"status":"healthy"}` {
			t.Fatalf("body = %s", got)
		}
	})

	t.Run("readyz failure", func(t *testing.T) {
		w := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "/readyz", nil)

		WorkerReadyz(redisStub{err: errors.New("dial failed")}, clickHouseStub{})(w, req)

		if w.Code != http.StatusServiceUnavailable {
			t.Fatalf("status = %d, want %d", w.Code, http.StatusServiceUnavailable)
		}
		if got := w.Header().Get("Content-Type"); got != "application/json" {
			t.Fatalf("Content-Type = %q", got)
		}
		if got := strings.TrimSpace(w.Body.String()); got != `{"status":"unhealthy","error":"redis down"}` {
			t.Fatalf("body = %s", got)
		}
	})
}
