// Copyright (c) 2025-2026, s0up and the autobrr contributors.
// SPDX-License-Identifier: GPL-2.0-or-later

package qbittorrent

// FilterOptions represents the filter options from the frontend
type FilterOptions struct {
	Hashes            []string `json:"hashes"`
	Status            []string `json:"status"`
	ExcludeStatus     []string `json:"excludeStatus"`
	Categories        []string `json:"categories"`
	ExcludeCategories []string `json:"excludeCategories"`
	Tags              []string `json:"tags"`
	ExcludeTags       []string `json:"excludeTags"`
	Trackers          []string `json:"trackers"`
	ExcludeTrackers   []string `json:"excludeTrackers"`
	Expr              string   `json:"expr"`

	// Inclusive ranges of the Zen Score and the Zen coefficient. A nil bound is
	// open. A Zen Score range leaves out the torrents that have no score yet.
	ZenScoreMin *float64 `json:"zenScoreMin,omitempty"`
	ZenScoreMax *float64 `json:"zenScoreMax,omitempty"`
	ZenCoefMin  *float64 `json:"zenCoefMin,omitempty"`
	ZenCoefMax  *float64 `json:"zenCoefMax,omitempty"`

	// Unified view only. DuplicatesOnly keeps the rows that have a twin in any
	// instance: the same info hash, or the exact name and size. InstanceIDs then
	// keeps only the rows of those instances. The twin search runs before the
	// instance selection, so a row shown can be a duplicate of one not shown.
	DuplicatesOnly bool  `json:"duplicatesOnly,omitempty"`
	InstanceIDs    []int `json:"instanceIds,omitempty"`

	HideTrackerPasskeys bool `json:"-"`
}

// IsEmpty reports whether no filter is set.
func (f FilterOptions) IsEmpty() bool {
	return len(f.Hashes) == 0 &&
		len(f.Status) == 0 &&
		len(f.ExcludeStatus) == 0 &&
		len(f.Categories) == 0 &&
		len(f.ExcludeCategories) == 0 &&
		len(f.Tags) == 0 &&
		len(f.ExcludeTags) == 0 &&
		len(f.Trackers) == 0 &&
		len(f.ExcludeTrackers) == 0 &&
		f.Expr == "" &&
		!f.hasZenRange()
}

// hasZenRange reports whether a Zen Score or Zen coefficient bound is set.
func (f FilterOptions) hasZenRange() bool {
	return f.ZenScoreMin != nil || f.ZenScoreMax != nil || f.ZenCoefMin != nil || f.ZenCoefMax != nil
}
