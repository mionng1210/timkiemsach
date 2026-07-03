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
  hiddenFloors?: number[];
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

export interface CustomFeature {
  id: number;
  campus_id: number;
  type: string;
  pos_x: number;
  pos_z: number;
  length: number;
  width: number;
  rotation: number;
  _timestamp?: number;
}
