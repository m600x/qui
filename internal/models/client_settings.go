// Copyright (c) 2026, s0up and the autobrr contributors.
// SPDX-License-Identifier: GPL-2.0-or-later

package models

import (
	"context"
	"database/sql"
	"errors"

	"github.com/autobrr/qui/internal/dbinterface"
)

// ClientSettingsStore persists frontend user settings as an opaque key-value
// map. Values are raw strings the backend never parses; the frontend owns the
// encoding of every key.
type ClientSettingsStore struct {
	db dbinterface.Querier
}

func NewClientSettingsStore(db dbinterface.Querier) *ClientSettingsStore {
	return &ClientSettingsStore{db: db}
}

// GetAll returns every stored setting. An empty map means nothing is stored.
func (s *ClientSettingsStore) GetAll(ctx context.Context) (map[string]string, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT key, value FROM client_settings`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	settings := make(map[string]string)
	for rows.Next() {
		var key, value string
		if err := rows.Scan(&key, &value); err != nil {
			return nil, err
		}
		settings[key] = value
	}
	return settings, rows.Err()
}

// Get returns one stored setting. ok is false when the key was never stored.
func (s *ClientSettingsStore) Get(ctx context.Context, key string) (value string, ok bool, err error) {
	err = s.db.QueryRowContext(ctx, `SELECT value FROM client_settings WHERE key = ?`, key).Scan(&value)
	if errors.Is(err, sql.ErrNoRows) {
		return "", false, nil
	}
	if err != nil {
		return "", false, err
	}
	return value, true, nil
}

// SetMany upserts the given settings atomically, leaving keys not in the map
// untouched.
func (s *ClientSettingsStore) SetMany(ctx context.Context, settings map[string]string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	for key, value := range settings {
		_, err := tx.ExecContext(ctx, `
			INSERT INTO client_settings (key, value)
			VALUES (?, ?)
			ON CONFLICT (key) DO UPDATE SET
				value = excluded.value,
				updated_at = CURRENT_TIMESTAMP
		`, key, value)
		if err != nil {
			return err
		}
	}
	return tx.Commit()
}
