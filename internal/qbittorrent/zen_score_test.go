// Copyright (c) 2026, s0up and the autobrr contributors.
// SPDX-License-Identifier: GPL-2.0-or-later

package qbittorrent

import (
	"context"
	"testing"

	qbt "github.com/autobrr/go-qbittorrent"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestZenScore(t *testing.T) {
	t.Parallel()

	values := map[string]float64{"xxx": 0.5}
	const gb = int64(bytesPerGB)
	const day = int64(secondsPerDay)

	tests := []struct {
		name    string
		torrent qbt.Torrent
		want    float64
		scored  bool
	}{
		{"example from the spec", qbt.Torrent{Category: "apps", Size: 6*gb + gb/2, NumComplete: 43, SeedingTime: 10 * day}, 1.45, true},
		{"not seeded yet", qbt.Torrent{Category: "apps", Size: gb, NumComplete: 100}, 0, false},
		{"xxx category", qbt.Torrent{Category: "xxx", SeedingTime: day}, 0.5, true},
		{"uncategorized", qbt.Torrent{SeedingTime: day}, 1.0, true},
		{"6 days", qbt.Torrent{SeedingTime: 6 * day}, 1.0, true},
		{"7 days", qbt.Torrent{SeedingTime: 7 * day}, 1.1, true},
		{"29 days", qbt.Torrent{SeedingTime: 29 * day}, 1.1, true},
		{"30 days", qbt.Torrent{SeedingTime: 30 * day}, 1.25, true},
		{"89 days", qbt.Torrent{SeedingTime: 89 * day}, 1.25, true},
		{"90 days", qbt.Torrent{SeedingTime: 90 * day}, 1.35, true},
		{"179 days", qbt.Torrent{SeedingTime: 179 * day}, 1.35, true},
		{"180 days", qbt.Torrent{SeedingTime: 180 * day}, 1.5, true},
		{"40 seeders", qbt.Torrent{SeedingTime: day, NumComplete: 40, Size: gb}, 1.0, true},
		{"41 seeders under 1GB", qbt.Torrent{SeedingTime: day, NumComplete: 41, Size: gb - 1}, 1.2, true},
		{"200 seeders at 1GB", qbt.Torrent{SeedingTime: day, NumComplete: 200, Size: gb}, 1.35, true},
		{"41 seeders at 50GB", qbt.Torrent{SeedingTime: day, NumComplete: 41, Size: 50 * gb}, 1.35, true},
		{"41 seeders over 50GB", qbt.Torrent{SeedingTime: day, NumComplete: 41, Size: 50*gb + 1}, 1.5, true},
		{"201 seeders any size", qbt.Torrent{SeedingTime: day, NumComplete: 201, Size: 100 * gb}, 1.35, true},
		{"250 seeders", qbt.Torrent{SeedingTime: day, NumComplete: 250, Size: gb}, 1.35, true},
		{"251 seeders", qbt.Torrent{SeedingTime: day, NumComplete: 251, Size: gb}, 1.0, true},
		{"unknown seeders", qbt.Torrent{SeedingTime: day, NumComplete: -1, Size: gb}, 1.0, true},
		{"everything", qbt.Torrent{SeedingTime: 200 * day, NumComplete: 100, Size: 60 * gb}, 2.0, true},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			got, scored := ZenScore(&tc.torrent, values)
			assert.Equal(t, tc.scored, scored)
			assert.InDelta(t, tc.want, got, 1e-9)
		})
	}
}

type fakeZenSettings map[string]string

func (f fakeZenSettings) Get(_ context.Context, key string) (string, bool, error) {
	v, ok := f[key]
	return v, ok, nil
}

func TestZenCategoryValues(t *testing.T) {
	t.Parallel()

	sm := &SyncManager{}
	assert.Equal(t, defaultZenCategoryValues(), sm.zenCategoryValues(context.Background(), 1))

	sm.SetZenScoreSettings(fakeZenSettings{
		"qui-zen-score-categories:1": `{"apps":2,"xxx":0.25}`,
		"qui-zen-score-categories:2": `{}`,
		"qui-zen-score-categories:3": `not json`,
		"qui-zen-score-categories:4": ``,
	})
	assert.Equal(t, map[string]float64{"apps": 2, "xxx": 0.25}, sm.zenCategoryValues(context.Background(), 1))
	assert.Empty(t, sm.zenCategoryValues(context.Background(), 2))
	assert.Equal(t, defaultZenCategoryValues(), sm.zenCategoryValues(context.Background(), 3))
	assert.Equal(t, defaultZenCategoryValues(), sm.zenCategoryValues(context.Background(), 4))
	assert.Equal(t, defaultZenCategoryValues(), sm.zenCategoryValues(context.Background(), 5))
}

func TestSortTorrentsByZenScore(t *testing.T) {
	t.Parallel()

	const day = int64(secondsPerDay)
	build := func() []qbt.Torrent {
		return []qbt.Torrent{
			{Hash: "a", SeedingTime: 100 * day},
			{Hash: "b"},
			{Hash: "c", SeedingTime: day},
			{Hash: "d", SeedingTime: 10 * day},
			{Hash: "e"},
		}
	}
	hashes := func(ts []qbt.Torrent) []string {
		out := make([]string, len(ts))
		for i, tr := range ts {
			out[i] = tr.Hash
		}
		return out
	}
	sm := &SyncManager{}

	asc := build()
	sm.sortTorrentsByZenScore(context.Background(), 1, asc, false)
	require.Equal(t, []string{"c", "d", "a", "b", "e"}, hashes(asc))

	desc := build()
	sm.sortTorrentsByZenScore(context.Background(), 1, desc, true)
	require.Equal(t, []string{"a", "d", "c", "b", "e"}, hashes(desc))
}
