// ===== Shared Types =====

export interface ShelfInfo {
  shelfId: number;
  code: string;
  deweyStart: number;
  deweyEnd: number;
  campus: string;
  rackNumber: number;
  letter: string;
  bay: number;
  face: number;
}

export interface RackInfo {
  rackNumber: number;
  shelves: ShelfInfo[];
}

export interface SearchResult {
  shelf: ShelfInfo;
  campus: string;
}

export interface CampusInfo {
  name: string;
  rackCount: number;
  shelfCount: number;
}
