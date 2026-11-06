// Copyright (c) 2026, s0up and the autobrr contributors.
// SPDX-License-Identifier: GPL-2.0-or-later

package qbittorrent

import (
	"cmp"
	"context"
	"encoding/json"
	"math"
	"strconv"
	"strings"

	qbt "github.com/autobrr/go-qbittorrent"
)

const (
	// ZenScoreColumn is the sort column of the Zen Score.
	ZenScoreColumn = "zen_score"
	// ZenScoreCoefColumn is the sort column of the Zen Score times the Zen coefficient.
	ZenScoreCoefColumn = "zen_score_coef"
	// zenScoreCategoriesKeyPrefix is the client setting that holds the category
	// values of one instance as a JSON object, category name to value. The
	// frontend owns the key; see useZenScoreCategoryValues.
	zenScoreCategoriesKeyPrefix = "qui-zen-score-categories:"

	zenDefaultCategoryValue = 1.0
	secondsPerDay           = 24 * 60 * 60
	bytesPerGB              = 1 << 30
)

// ZenScoreSettings reads the stored client settings the Zen Score depends on.
type ZenScoreSettings interface {
	Get(ctx context.Context, key string) (value string, ok bool, err error)
}

// SetZenScoreSettings sets where the sort reads the category values from. Call
// it before serving requests.
func (sm *SyncManager) SetZenScoreSettings(settings ZenScoreSettings) {
	sm.zenScoreSettings = settings
}

// defaultZenCategoryValues applies while an instance has no stored values.
func defaultZenCategoryValues() map[string]float64 {
	return map[string]float64{"xxx": 0.5}
}

// zenCategoryValues returns the category values of one instance. A category
// missing from the map is worth 1.0.
func (sm *SyncManager) zenCategoryValues(ctx context.Context, instanceID int) map[string]float64 {
	if sm.zenScoreSettings == nil {
		return defaultZenCategoryValues()
	}
	raw, ok, err := sm.zenScoreSettings.Get(ctx, zenScoreCategoriesKeyPrefix+strconv.Itoa(instanceID))
	if err != nil || !ok || strings.TrimSpace(raw) == "" {
		return defaultZenCategoryValues()
	}
	var values map[string]float64
	if err := json.Unmarshal([]byte(raw), &values); err != nil {
		return defaultZenCategoryValues()
	}
	return values
}

// ZenScore returns the Zen Score of a torrent: category value, plus seeding
// duration, plus the seeders and size bonus. ok is false for a torrent that has
// not seeded yet, which has no score.
func ZenScore(t *qbt.Torrent, categoryValues map[string]float64) (score float64, ok bool) {
	base, duration, swarm, ok := zenScoreParts(t, categoryValues)
	if !ok {
		return 0, false
	}
	// Drop the float noise of the sum, as in 1 + 0.1 + 0.35.
	return math.Round((base+duration+swarm)*100) / 100, true
}

// zenScoreParts splits the Zen Score into the category value, the seeding
// duration bonus and the seeders and size bonus. ok is false for a torrent
// that has not seeded yet.
func zenScoreParts(t *qbt.Torrent, categoryValues map[string]float64) (base, duration, swarm float64, ok bool) {
	if t.SeedingTime <= 0 {
		return 0, 0, 0, false
	}

	base = zenDefaultCategoryValue
	if v, found := categoryValues[t.Category]; found {
		base = v
	}

	switch days := t.SeedingTime / secondsPerDay; {
	case days >= 180:
		duration = 0.5
	case days >= 90:
		duration = 0.35
	case days >= 30:
		duration = 0.25
	case days >= 7:
		duration = 0.1
	}

	switch seeders := t.NumComplete; {
	case seeders >= 41 && seeders <= 200:
		switch {
		case t.Size < bytesPerGB:
			swarm = 0.2
		case t.Size <= 50*bytesPerGB:
			swarm = 0.35
		default:
			swarm = 0.5
		}
	case seeders >= 201 && seeders <= 250:
		swarm = 0.35
	}
	return base, duration, swarm, true
}

const (
	zenCoefGB            = 1e9
	zenCoefReferenceGB   = 4.0
	zenCoefSmallBonusGB  = 0.25
	zenCoefLargeExponent = 0.118
)

// ZenCoef returns the Zen coefficient of a size in bytes. Up to 4 GB it is
// (size + 0.25 GB) / 4.25 GB, and above that (size / 4 GB) ^ 0.118. Sizes are
// decimal. Keep it in step with computeZenCoef in web/src/lib/zen-score.ts.
func ZenCoef(sizeBytes int64) float64 {
	gb := float64(max(sizeBytes, 0)) / zenCoefGB
	if gb <= zenCoefReferenceGB {
		return (gb + zenCoefSmallBonusGB) / (zenCoefReferenceGB + zenCoefSmallBonusGB)
	}
	return math.Pow(gb/zenCoefReferenceGB, zenCoefLargeExponent)
}

func inZenRange(value float64, lower, upper *float64) bool {
	return (lower == nil || value >= *lower) && (upper == nil || value <= *upper)
}

// applyZenFilters keeps the torrents inside the Zen Score and Zen coefficient
// ranges of filters. It returns torrents itself when no range is set, and a new
// slice otherwise.
func (sm *SyncManager) applyZenFilters(ctx context.Context, instanceID int, torrents []qbt.Torrent, filters FilterOptions) []qbt.Torrent {
	if !filters.hasZenRange() {
		return torrents
	}
	hasScoreRange := filters.ZenScoreMin != nil || filters.ZenScoreMax != nil
	var categoryValues map[string]float64
	if hasScoreRange {
		categoryValues = sm.zenCategoryValues(ctx, instanceID)
	}

	kept := make([]qbt.Torrent, 0, len(torrents))
	for i := range torrents {
		t := &torrents[i]
		if hasScoreRange {
			score, ok := ZenScore(t, categoryValues)
			if !ok || !inZenRange(score, filters.ZenScoreMin, filters.ZenScoreMax) {
				continue
			}
		}
		if !inZenRange(ZenCoef(t.Size), filters.ZenCoefMin, filters.ZenCoefMax) {
			continue
		}
		kept = append(kept, *t)
	}
	return kept
}

// zenStatsTracker selects the torrents that count in the dashboard average: the
// ones whose tracker URL or tracker display name contains it, in any letter case.
const zenStatsTracker = "c411"

// matchesZenStatsTracker reports whether a torrent's tracker URL or tracker
// display name contains zenStatsTracker. displayNames maps a domain to its
// custom display name.
func (sm *SyncManager) matchesZenStatsTracker(t *qbt.Torrent, displayNames map[string]string) bool {
	check := func(trackerURL string) bool {
		if trackerURL == "" {
			return false
		}
		if strings.Contains(strings.ToLower(trackerURL), zenStatsTracker) {
			return true
		}
		name := displayNames[strings.ToLower(sm.ExtractDomainFromURL(trackerURL))]
		return strings.Contains(strings.ToLower(name), zenStatsTracker)
	}
	if check(t.Tracker) {
		return true
	}
	for _, tracker := range t.Trackers {
		if check(tracker.Url) {
			return true
		}
	}
	return false
}

// addZenScoreStats adds the sums and the count of the seeded torrents of one
// instance that match zenStatsTracker: their Zen Scores, their Zen
// coefficients, and each score times its own coefficient. The dashboard divides
// the totals of all instances.
func (sm *SyncManager) addZenScoreStats(ctx context.Context, instanceID int, stats *TorrentStats, torrents []qbt.Torrent) {
	var displayNames map[string]string
	var categoryValues map[string]float64
	for i := range torrents {
		t := &torrents[i]
		if t.SeedingTime <= 0 {
			continue
		}
		if displayNames == nil {
			displayNames = sm.getTrackerDisplayNameMap()
		}
		if !sm.matchesZenStatsTracker(t, displayNames) {
			continue
		}
		if categoryValues == nil {
			categoryValues = sm.zenCategoryValues(ctx, instanceID)
		}
		if base, duration, swarm, ok := zenScoreParts(t, categoryValues); ok {
			score := math.Round((base+duration+swarm)*100) / 100
			coef := ZenCoef(t.Size)
			stats.ZenScoreSum += score
			stats.ZenCoefSum += coef
			stats.ZenScoreCoefSum += score * coef
			stats.ZenScoreCount++
			stats.addZenDistribution(t, score, coef, base, duration, swarm)
		}
	}
}

// IsZenSortColumn reports whether column sorts by a Zen value that needs the
// category values of the instance.
func IsZenSortColumn(column string) bool {
	return column == ZenScoreColumn || column == ZenScoreCoefColumn
}

// ZenScoreCoef returns the Zen Score of a torrent times its own Zen
// coefficient. ok is false for a torrent that has no score yet.
func ZenScoreCoef(t *qbt.Torrent, categoryValues map[string]float64) (value float64, ok bool) {
	score, ok := ZenScore(t, categoryValues)
	if !ok {
		return 0, false
	}
	return score * ZenCoef(t.Size), true
}

// zenScoreOrder sorts by the Zen value of column. Torrents without a score come
// last in each direction.
func zenScoreOrder(column string, rows []*qbt.Torrent, categoryValues func(i int) map[string]float64, desc bool, tie func(a, b int) int) func(a, b int) int {
	value := ZenScore
	if column == ZenScoreCoefColumn {
		value = ZenScoreCoef
	}
	scores := make([]float64, len(rows))
	scored := make([]bool, len(rows))
	for i, t := range rows {
		scores[i], scored[i] = value(t, categoryValues(i))
	}
	return func(a, b int) int {
		switch {
		case !scored[a] && !scored[b]:
		case !scored[a]:
			return 1
		case !scored[b]:
			return -1
		default:
			if result := cmp.Compare(scores[a], scores[b]); result != 0 {
				return flipIf(desc, result)
			}
		}
		return compareHashThenTie(rows, a, b, tie)
	}
}

// sortTorrentsByZenScore sorts the rows of one instance in place by a Zen sort column.
func (sm *SyncManager) sortTorrentsByZenScore(ctx context.Context, column string, instanceID int, torrents []qbt.Torrent, desc bool) {
	rows := make([]*qbt.Torrent, len(torrents))
	for i := range torrents {
		rows[i] = &torrents[i]
	}
	values := sm.zenCategoryValues(ctx, instanceID)
	sortByIndex(torrents, zenScoreOrder(column, rows, func(int) map[string]float64 { return values }, desc, func(a, b int) int { return a - b }))
}

// sortCrossInstanceByZenScore sorts Unified rows in place, each with the
// category values of its own instance. Equal rows sort by instance.
func (sm *SyncManager) sortCrossInstanceByZenScore(ctx context.Context, column string, torrents []CrossInstanceTorrentView, desc bool) {
	rows := make([]*qbt.Torrent, len(torrents))
	for i := range torrents {
		rows[i] = torrents[i].Torrent
	}
	byInstance := make(map[int]map[string]float64)
	values := func(i int) map[string]float64 {
		id := torrents[i].InstanceID
		v, ok := byInstance[id]
		if !ok {
			v = sm.zenCategoryValues(ctx, id)
			byInstance[id] = v
		}
		return v
	}
	tie := func(a, b int) int { return cmp.Or(cmp.Compare(torrents[a].InstanceID, torrents[b].InstanceID), a-b) }
	sortByIndex(torrents, zenScoreOrder(column, rows, values, desc, tie))
}
