// Copyright (c) 2026, s0up and the autobrr contributors.
// SPDX-License-Identifier: GPL-2.0-or-later

package qbittorrent

import (
	"sort"

	qbt "github.com/autobrr/go-qbittorrent"
)

// Bucket edges of the Zen distributions on the dashboard. Keep them in step with
// web/src/lib/zen-score-charts.ts. A value goes in the first bucket whose upper
// edge is above it, so n edges make n+1 buckets: below the first edge, between
// each pair of edges, and from the last edge up.
var (
	zenScoreEdges   = []float64{0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 2.0}
	zenCoefEdges    = []float64{0.06, 0.07, 0.08, 0.09, 0.1, 0.12, 0.15, 0.2, 0.3, 0.4, 0.5, 0.7, 1.0, 1.25, 1.5}
	zenProductEdges = []float64{0.05, 0.075, 0.1, 0.15, 0.2, 0.3, 0.5, 0.75, 1.0, 1.5, 2.0, 2.5}
	// Seeding days, seeders, and size in bytes (decimal), at the tiers of the score and the coefficient.
	zenAgeEdges   = []float64{7, 30, 90, 180}
	zenSwarmEdges = []float64{41, 201, 251}
	zenSizeEdges  = []float64{1e7, 1e8, 1e9, 4e9, 25e9}
)

func zenBucket(value float64, edges []float64) int {
	return sort.Search(len(edges), func(i int) bool { return edges[i] > value })
}

func addToBucket[T int | float64](buckets []T, edges []float64, index int, delta T) []T {
	if buckets == nil {
		buckets = make([]T, len(edges)+1)
	}
	buckets[index] += delta
	return buckets
}

// mergeBuckets adds two bucket lists into a new one, so a list that a response
// holds is never changed.
func mergeBuckets[T int | float64](base, next []T) []T {
	if len(next) == 0 {
		return base
	}
	merged := make([]T, max(len(base), len(next)))
	copy(merged, base)
	for i, v := range next {
		merged[i] += v
	}
	return merged
}

// addZenDistribution adds one seeded torrent to the distributions the
// dashboard charts: the histograms, the age, swarm and size bands, and the
// parts the score is made of.
func (s *TorrentStats) addZenDistribution(t *qbt.Torrent, score, coef, base, duration, swarm float64) {
	product := score * coef
	s.ZenBaseSum += base
	s.ZenDurationSum += duration
	s.ZenSwarmSum += swarm

	s.ZenScoreHist = addToBucket(s.ZenScoreHist, zenScoreEdges, zenBucket(score, zenScoreEdges), 1)
	s.ZenCoefHist = addToBucket(s.ZenCoefHist, zenCoefEdges, zenBucket(coef, zenCoefEdges), 1)
	productBucket := zenBucket(product, zenProductEdges)
	s.ZenProductHist = addToBucket(s.ZenProductHist, zenProductEdges, productBucket, 1)
	s.ZenProductHistSum = addToBucket(s.ZenProductHistSum, zenProductEdges, productBucket, product)

	s.ZenAgeBands = addToBucket(s.ZenAgeBands, zenAgeEdges, zenBucket(float64(t.SeedingTime)/secondsPerDay, zenAgeEdges), 1)
	s.ZenSwarmBands = addToBucket(s.ZenSwarmBands, zenSwarmEdges, zenBucket(float64(t.NumComplete), zenSwarmEdges), 1)
	sizeBand := zenBucket(float64(t.Size), zenSizeEdges)
	s.ZenSizeBands = addToBucket(s.ZenSizeBands, zenSizeEdges, sizeBand, 1)
	s.ZenSizeBandPoints = addToBucket(s.ZenSizeBandPoints, zenSizeEdges, sizeBand, product)
}

// mergeZenDistribution adds the Zen distributions of next into base.
func mergeZenDistribution(base, next *TorrentStats) {
	base.ZenBaseSum += next.ZenBaseSum
	base.ZenDurationSum += next.ZenDurationSum
	base.ZenSwarmSum += next.ZenSwarmSum
	base.ZenScoreHist = mergeBuckets(base.ZenScoreHist, next.ZenScoreHist)
	base.ZenCoefHist = mergeBuckets(base.ZenCoefHist, next.ZenCoefHist)
	base.ZenProductHist = mergeBuckets(base.ZenProductHist, next.ZenProductHist)
	base.ZenProductHistSum = mergeBuckets(base.ZenProductHistSum, next.ZenProductHistSum)
	base.ZenAgeBands = mergeBuckets(base.ZenAgeBands, next.ZenAgeBands)
	base.ZenSwarmBands = mergeBuckets(base.ZenSwarmBands, next.ZenSwarmBands)
	base.ZenSizeBands = mergeBuckets(base.ZenSizeBands, next.ZenSizeBands)
	base.ZenSizeBandPoints = mergeBuckets(base.ZenSizeBandPoints, next.ZenSizeBandPoints)
}
