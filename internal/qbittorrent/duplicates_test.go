// Copyright (c) 2026, s0up and the autobrr contributors.
// SPDX-License-Identifier: GPL-2.0-or-later

package qbittorrent

import (
	"testing"

	qbt "github.com/autobrr/go-qbittorrent"
	"github.com/stretchr/testify/require"
)

func duplicateRow(instanceID int, hash, name string, size int64) CrossInstanceTorrentView {
	return CrossInstanceTorrentView{
		TorrentView: &TorrentView{Torrent: &qbt.Torrent{Hash: hash, Name: name, Size: size}},
		InstanceID:  instanceID,
	}
}

func rowHashes(rows []CrossInstanceTorrentView) []string {
	hashes := make([]string, len(rows))
	for i, row := range rows {
		hashes[i] = row.Torrent.Hash
	}
	return hashes
}

func TestNarrowCrossInstanceRows(t *testing.T) {
	// a1 and a2 share name and size; b1 is unique; c1 and c2 share a name but
	// not a size; the two d1 rows share a hash but not a name.
	rows := []CrossInstanceTorrentView{
		duplicateRow(1, "a1", "Show.S01", 100),
		duplicateRow(2, "a2", "Show.S01", 100),
		duplicateRow(2, "b1", "Other", 50),
		duplicateRow(1, "c1", "Same.Name", 70),
		duplicateRow(2, "c2", "Same.Name", 71),
		duplicateRow(3, "d1", "Renamed.One", 10),
		duplicateRow(1, "d1", "Renamed.Two", 11),
	}

	t.Run("no option keeps every row", func(t *testing.T) {
		require.Len(t, narrowCrossInstanceRows(rows, false, nil), len(rows))
	})

	t.Run("duplicates only", func(t *testing.T) {
		require.Equal(t, []string{"a1", "a2", "d1", "d1"}, rowHashes(narrowCrossInstanceRows(rows, true, nil)))
	})

	t.Run("instance selection alone", func(t *testing.T) {
		require.Equal(t, []string{"a2", "b1", "c2"}, rowHashes(narrowCrossInstanceRows(rows, false, []int{2})))
	})

	t.Run("twins are found before the instance selection narrows the rows", func(t *testing.T) {
		require.Equal(t, []string{"a2"}, rowHashes(narrowCrossInstanceRows(rows, true, []int{2})))
	})
}
