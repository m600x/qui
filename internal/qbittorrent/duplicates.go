// Copyright (c) 2026, s0up and the autobrr contributors.
// SPDX-License-Identifier: GPL-2.0-or-later

package qbittorrent

import "strconv"

// narrowCrossInstanceRows keeps the rows that duplicatesOnly and instanceIDs
// select. Duplicates are found across every row given, before the instance
// selection narrows the list, so a row is still a duplicate when its twin is
// in an instance that is not shown.
//
// Two rows are duplicates when they share the info hash, or the exact name and
// size.
func narrowCrossInstanceRows(rows []CrossInstanceTorrentView, duplicatesOnly bool, instanceIDs []int) []CrossInstanceTorrentView {
	if !duplicatesOnly && len(instanceIDs) == 0 {
		return rows
	}

	var duplicate []bool
	if duplicatesOnly {
		duplicate = findDuplicateRows(rows)
	}
	var wanted map[int]struct{}
	if len(instanceIDs) > 0 {
		wanted = make(map[int]struct{}, len(instanceIDs))
		for _, id := range instanceIDs {
			wanted[id] = struct{}{}
		}
	}

	kept := make([]CrossInstanceTorrentView, 0, len(rows))
	for i, row := range rows {
		if duplicatesOnly && !duplicate[i] {
			continue
		}
		if wanted != nil {
			if _, ok := wanted[row.InstanceID]; !ok {
				continue
			}
		}
		kept = append(kept, row)
	}
	return kept
}

// findDuplicateRows reports, per row, whether another row shares its info hash
// or its exact name and size.
func findDuplicateRows(rows []CrossInstanceTorrentView) []bool {
	byHash := make(map[string]int, len(rows))
	byNameSize := make(map[string]int, len(rows))
	keys := make([][2]string, len(rows))
	for i, row := range rows {
		t := row.Torrent
		hash := t.InfohashV1
		if hash == "" {
			hash = t.Hash
		}
		keys[i] = [2]string{hash, t.Name + "\x00" + strconv.FormatInt(t.Size, 10)}
		if hash != "" {
			byHash[hash]++
		}
		byNameSize[keys[i][1]]++
	}

	duplicate := make([]bool, len(rows))
	for i, key := range keys {
		duplicate[i] = (key[0] != "" && byHash[key[0]] > 1) || byNameSize[key[1]] > 1
	}
	return duplicate
}
