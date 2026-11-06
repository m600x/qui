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

func TestMatchesZenStatsTracker(t *testing.T) {
	t.Parallel()

	sm := &SyncManager{}
	names := map[string]string{"tracker.example.org": "My C411"}
	tests := []struct {
		name    string
		torrent qbt.Torrent
		want    bool
	}{
		{"url contains it", qbt.Torrent{Tracker: "https://tracker.c411.org/announce"}, true},
		{"url in any letter case", qbt.Torrent{Tracker: "https://TRACKER.C411.ORG/announce"}, true},
		{"display name contains it", qbt.Torrent{Tracker: "https://tracker.example.org/announce"}, true},
		{"later tracker of the torrent", qbt.Torrent{Trackers: []qbt.TorrentTracker{{Url: "https://a.example.net/announce"}, {Url: "https://x.c411.org/announce"}}}, true},
		{"other tracker", qbt.Torrent{Tracker: "https://tracker.other.org/announce"}, false},
		{"no tracker", qbt.Torrent{}, false},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			assert.Equal(t, tc.want, sm.matchesZenStatsTracker(&tc.torrent, names))
		})
	}
}

func TestAddZenScoreStats(t *testing.T) {
	t.Parallel()

	const day = int64(secondsPerDay)
	sm := &SyncManager{}
	stats := &TorrentStats{}
	sm.addZenScoreStats(context.Background(), 1, stats, []qbt.Torrent{
		{Tracker: "https://t.c411.org/announce", Category: "apps", SeedingTime: 10 * day},
		{Tracker: "https://t.c411.org/announce", Category: "xxx", SeedingTime: 100 * day},
		{Tracker: "https://t.c411.org/announce", Category: "apps"},
		{Tracker: "https://t.other.org/announce", Category: "apps", SeedingTime: 200 * day},
	})
	// 1 + 0.1 and 0.5 + 0.35; the unseeded and the other tracker's torrent do not count.
	assert.Equal(t, 2, stats.ZenScoreCount)
	assert.InDelta(t, 1.95, stats.ZenScoreSum, 1e-9)
	// Both torrents are 0 bytes, so each has the coefficient 0.25 / 4.25.
	coef := 0.25 / 4.25
	assert.InDelta(t, 2*coef, stats.ZenCoefSum, 1e-9)
	assert.InDelta(t, 1.1*coef+0.85*coef, stats.ZenScoreCoefSum, 1e-9)

	merged := mergeTorrentStats(&TorrentStats{ZenScoreSum: 1, ZenCoefSum: 1, ZenScoreCoefSum: 1, ZenScoreCount: 1}, stats)
	assert.Equal(t, 3, merged.ZenScoreCount)
	assert.InDelta(t, 2.95, merged.ZenScoreSum, 1e-9)
	assert.InDelta(t, 1+2*coef, merged.ZenCoefSum, 1e-9)
	assert.InDelta(t, 1+1.95*coef, merged.ZenScoreCoefSum, 1e-9)
}

func TestZenCoef(t *testing.T) {
	t.Parallel()

	assert.InDelta(t, 0.25/4.25, ZenCoef(0), 1e-9)
	assert.InDelta(t, 0.0591, ZenCoef(1_000_000), 1e-3)
	assert.InDelta(t, 0.2941, ZenCoef(1_000_000_000), 1e-3)
	assert.InDelta(t, 1.0, ZenCoef(4_000_000_000), 1e-9)
	assert.InDelta(t, 1.241, ZenCoef(25_000_000_000), 1e-3)
	assert.InDelta(t, 1.377, ZenCoef(60_000_000_000), 1e-3)
	assert.InDelta(t, 0.25/4.25, ZenCoef(-5), 1e-9)
}

func TestApplyZenFilters(t *testing.T) {
	t.Parallel()

	const day = int64(secondsPerDay)
	const gb = int64(1_000_000_000)
	// a: score 1.35, coef 0.29. b: score 1.5, coef 1.11. c: no score, coef 1.11. d: score 1.0, coef 0.08.
	build := func() []qbt.Torrent {
		return []qbt.Torrent{
			{Hash: "a", Size: gb, SeedingTime: 100 * day},
			{Hash: "b", Size: 10 * gb, SeedingTime: 200 * day},
			{Hash: "c", Size: 10 * gb},
			{Hash: "d", Size: gb / 10, SeedingTime: day},
		}
	}
	hashes := func(ts []qbt.Torrent) string {
		var out string
		for _, tr := range ts {
			out += tr.Hash
		}
		return out
	}
	f := func(v float64) *float64 { return &v }
	sm := &SyncManager{}
	ctx := context.Background()

	torrents := build()
	assert.Equal(t, "abcd", hashes(sm.applyZenFilters(ctx, 1, torrents, FilterOptions{})))
	assert.Equal(t, "bc", hashes(sm.applyZenFilters(ctx, 1, torrents, FilterOptions{ZenCoefMin: f(1)})))
	assert.Equal(t, "ad", hashes(sm.applyZenFilters(ctx, 1, torrents, FilterOptions{ZenCoefMax: f(0.5)})))
	// A Zen Score range leaves out the torrent that has not seeded.
	assert.Equal(t, "abd", hashes(sm.applyZenFilters(ctx, 1, torrents, FilterOptions{ZenScoreMin: f(0)})))
	assert.Equal(t, "ab", hashes(sm.applyZenFilters(ctx, 1, torrents, FilterOptions{ZenScoreMin: f(1.35), ZenScoreMax: f(2)})))
	assert.Equal(t, "b", hashes(sm.applyZenFilters(ctx, 1, torrents, FilterOptions{ZenScoreMin: f(1.35), ZenCoefMin: f(1)})))
	// The input is left as it was.
	assert.Equal(t, "abcd", hashes(torrents))

	assert.False(t, FilterOptions{ZenCoefMax: f(1)}.IsEmpty())
	assert.True(t, FilterOptions{}.IsEmpty())
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
