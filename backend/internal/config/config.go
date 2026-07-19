// Package config loads FlowStock's runtime configuration. A config file is
// optional — with none present, sensible defaults apply (loopback, port 8787,
// data in ~/.flowstock) so `flowstock` just runs.
package config

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
)

type Config struct {
	// Port is the HTTP listen port. Default 8787.
	Port string `json:"port"`
	// Host is the interface to bind. Default "127.0.0.1" (loopback only).
	// Set "0.0.0.0" to accept connections from other machines/branches.
	Host string `json:"host,omitempty"`
	// DataDir holds flowstock.db. Default ~/.flowstock.
	DataDir string `json:"data_dir,omitempty"`
	// Password, if set, gates the app behind a single owner password.
	// Empty (default) = open (suitable for a trusted single-user machine).
	Password string `json:"password,omitempty"`
	// FrameAncestors controls which origins may embed FlowStock in an iframe
	// (for the Vulos OS shell). Empty (default) = 'self' only.
	FrameAncestors string `json:"frame_ancestors,omitempty"`
}

const configName = "flowstock.config.json"

// Load resolves configuration from (in order) the file, environment overrides,
// and defaults.
func Load() *Config {
	cfg := &Config{}

	if data, found := readConfigFile(); data != nil {
		if err := json.Unmarshal(data, cfg); err != nil {
			log.Fatalf("parse %s: %v", found, err)
		}
		log.Printf("loaded config from %s", found)
	}

	// Environment overrides.
	if v := os.Getenv("FLOWSTOCK_PORT"); v != "" {
		cfg.Port = v
	}
	if v := os.Getenv("FLOWSTOCK_HOST"); v != "" {
		cfg.Host = v
	}
	if v := os.Getenv("FLOWSTOCK_DATA_DIR"); v != "" {
		cfg.DataDir = v
	}
	if v := os.Getenv("FLOWSTOCK_PASSWORD"); v != "" {
		cfg.Password = v
	}
	if v := os.Getenv("FLOWSTOCK_FRAME_ANCESTORS"); v != "" {
		cfg.FrameAncestors = v
	}

	// Defaults.
	if cfg.Port == "" {
		cfg.Port = "8787"
	}
	if cfg.Host == "" {
		cfg.Host = "127.0.0.1"
	}
	if cfg.DataDir == "" {
		if home, err := os.UserHomeDir(); err == nil {
			cfg.DataDir = filepath.Join(home, ".flowstock")
		} else {
			cfg.DataDir = ".flowstock"
		}
	}
	if abs, err := filepath.Abs(cfg.DataDir); err == nil {
		cfg.DataDir = abs
	}
	if err := os.MkdirAll(cfg.DataDir, 0o755); err != nil {
		log.Fatalf("create data dir %s: %v", cfg.DataDir, err)
	}
	return cfg
}

// DBPath is the path to the SQLite database file.
func (c *Config) DBPath() string { return filepath.Join(c.DataDir, "flowstock.db") }

// Addr is the host:port listen address.
func (c *Config) Addr() string { return fmt.Sprintf("%s:%s", c.Host, c.Port) }

func readConfigFile() ([]byte, string) {
	// 1. Walk up from cwd.
	if cwd, err := os.Getwd(); err == nil {
		dir := cwd
		for {
			p := filepath.Join(dir, configName)
			if d, err := os.ReadFile(p); err == nil {
				return d, p
			}
			parent := filepath.Dir(dir)
			if parent == dir {
				break
			}
			dir = parent
		}
	}
	// 2. ~/.config/flowstock/ and ~/.flowstock/
	if home, err := os.UserHomeDir(); err == nil {
		for _, p := range []string{
			filepath.Join(home, ".config", "flowstock", configName),
			filepath.Join(home, ".flowstock", configName),
		} {
			if d, err := os.ReadFile(p); err == nil {
				return d, p
			}
		}
	}
	// 3. Next to the executable.
	if exe, err := os.Executable(); err == nil {
		p := filepath.Join(filepath.Dir(exe), configName)
		if d, err := os.ReadFile(p); err == nil {
			return d, p
		}
	}
	return nil, ""
}
