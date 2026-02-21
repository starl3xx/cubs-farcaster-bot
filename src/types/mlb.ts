// MLB Stats API response types

export interface ScheduleResponse {
  dates: ScheduleDate[];
}

export interface ScheduleDate {
  date: string;
  games: ScheduleGame[];
}

export interface ScheduleGame {
  gamePk: number;
  gameDate: string;
  status: GameStatus;
  teams: {
    away: ScheduleTeam;
    home: ScheduleTeam;
  };
  gameNumber: number; // 1 for single game, 1 or 2 for doubleheader
  doubleHeader: string; // "N" or "Y" or "S" (split)
}

export interface GameStatus {
  abstractGameState: "Preview" | "Live" | "Final";
  detailedState: string; // "Final", "Postponed", "Suspended", etc.
  statusCode: string;
}

export interface ScheduleTeam {
  team: {
    id: number;
    name: string;
    abbreviation?: string;
  };
  score: number;
  isWinner: boolean;
}

// Game feed (live feed) response
export interface GameFeed {
  gamePk: number;
  gameData: GameData;
  liveData: LiveData;
}

export interface GameData {
  teams: {
    away: TeamInfo;
    home: TeamInfo;
  };
  venue: {
    name: string;
  };
  datetime: {
    dateTime: string;
  };
  status: GameStatus;
}

export interface TeamInfo {
  id: number;
  name: string;
  abbreviation: string;
  teamName: string;
}

export interface LiveData {
  linescore: Linescore;
  decisions?: Decisions;
  boxscore: Boxscore;
}

export interface Linescore {
  currentInning: number;
  currentInningOrdinal: string;
  innings: Inning[];
  teams: {
    home: LinescoreTeam;
    away: LinescoreTeam;
  };
}

export interface Inning {
  num: number;
  ordinalNum: string;
  home: InningHalf;
  away: InningHalf;
}

export interface InningHalf {
  runs?: number;
  hits?: number;
  errors?: number;
}

export interface LinescoreTeam {
  runs: number;
  hits: number;
  errors: number;
}

export interface Decisions {
  winner?: DecisionPitcher;
  loser?: DecisionPitcher;
  save?: DecisionPitcher;
}

export interface DecisionPitcher {
  id: number;
  fullName: string;
  link: string;
}

export interface Boxscore {
  teams: {
    away: BoxscoreTeam;
    home: BoxscoreTeam;
  };
}

export interface BoxscoreTeam {
  team: {
    id: number;
    name: string;
    abbreviation: string;
  };
  teamStats: {
    batting: {
      runs: number;
      hits: number;
    };
    pitching: {
      runs: number;
      hits: number;
      era: string;
    };
  };
}

// Game content (highlights)
export interface GameContent {
  highlights?: {
    highlights?: {
      items?: HighlightItem[];
    };
  };
  media?: {
    epg?: EpgItem[];
  };
}

export interface HighlightItem {
  id: string;
  type: string;
  title: string;
  description: string;
  playbacks?: Playback[];
  keywordsAll?: Keyword[];
}

export interface EpgItem {
  title: string;
  items?: EpgMediaItem[];
}

export interface EpgMediaItem {
  id: number;
  title: string;
  description: string;
  playbacks?: Playback[];
}

export interface Playback {
  name: string;
  url: string;
}

export interface Keyword {
  type: string;
  value: string;
}

// RSS feed types
export interface RssItem {
  title: string;
  link: string;
  description?: string;
  pubDate: string;
  guid: string;
  "dc:creator"?: string;
  creator?: string;
}
