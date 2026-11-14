/**
 * Tabela que vai para a transmissão. Só nomes e números: nenhum Discord ID
 * sai daqui, porque /stream e /api/board são públicos (o OBS abre sem senha).
 */

export type BoardRow = {
  place: number;
  players: string[];
  games: number;
  kills: number;
  wins: number;
  points: number;
  prize: number;
};

export type Board = {
  title: string;
  subtitle: string;
  showPoints: boolean;
  rows: BoardRow[];
  updatedAt: string;
};

export const BOARD_MAX_ROWS = 500;
