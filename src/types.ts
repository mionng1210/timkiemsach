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
  positionX?: number;
  positionZ?: number;
  color?: string;
}

export interface RackInfo {
  rackNumber: number;
  shelves: ShelfInfo[];
  bays: number[];
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
