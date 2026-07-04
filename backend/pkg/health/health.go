package health

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
)

const checkTimeout = 2 * time.Second

type redisPinger interface {
	Ping(ctx context.Context) *redis.StatusCmd
}

type sqlPinger interface {
	PingContext(ctx context.Context) error
}

type clickHousePinger interface {
	Ping(ctx context.Context) error
}

type statusResponse struct {
	Status string `json:"status"`
	Error  string `json:"error,omitempty"`
}

func GinHealthz(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"status": "healthy"})
}

func GinReadyz(rdb redisPinger, pgDB sqlPinger, chConn clickHousePinger) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), checkTimeout)
		defer cancel()

		if err := check(ctx, rdb, pgDB, chConn); err != nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"status": "unhealthy", "error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{"status": "ready"})
	}
}

func WorkerHealthz(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, statusResponse{Status: "healthy"})
}

func WorkerReadyz(rdb redisPinger, chConn clickHousePinger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), checkTimeout)
		defer cancel()

		if err := check(ctx, rdb, nil, chConn); err != nil {
			writeJSON(w, http.StatusServiceUnavailable, statusResponse{Status: "unhealthy", Error: err.Error()})
			return
		}

		writeJSON(w, http.StatusOK, statusResponse{Status: "ready"})
	}
}

func check(ctx context.Context, rdb redisPinger, pgDB sqlPinger, chConn clickHousePinger) error {
	if rdb != nil {
		if err := rdb.Ping(ctx).Err(); err != nil {
			return errWithMessage("redis down")
		}
	}

	if pgDB != nil {
		if err := pgDB.PingContext(ctx); err != nil {
			return errWithMessage("postgres down")
		}
	}

	if chConn != nil {
		if err := chConn.Ping(ctx); err != nil {
			return errWithMessage("clickhouse down")
		}
	}

	return nil
}

type errWithMessage string

func (e errWithMessage) Error() string {
	return string(e)
}

func writeJSON(w http.ResponseWriter, status int, body statusResponse) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}
