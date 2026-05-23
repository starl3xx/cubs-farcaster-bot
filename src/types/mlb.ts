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
  gameType: string; // "S", "R", "F", "D", "L", "W", "A", "E"
  seriesDescription?: string; // "Spring Training", "ALDS", "World Series", etc.
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
  game: {
    type: string; // "S"=Spring Training, "R"=Regular, "F"=Wild Card, "D"=Division, "L"=LCS, "W"=World Series, "A"=All-Star, "E"=Exhibition
    season: string;
  };
  teams: {
    away: TeamInfo;
    home: TeamInfo;
  };
  venue: {
    name: string;
  };
  datetime: {
    dateTime: string;
    /** MLB-canonical game date in YYYY-MM-DD; immune to UTC rollover for night games. */
    officialDate: string;
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

// Game content (highlights + editorial)
export interface GameContent {
  editorial?: {
    recap?: {
      mlb?: EditorialArticle;
    };
  };
  highlights?: {
    highlights?: {
      items?: HighlightItem[];
    };
  };
  media?: {
    epg?: EpgItem[];
    highlights?: {
      highlights?: {
        items?: HighlightItem[];
      };
    };
  };
}

export interface EditorialArticle {
  headline?: string;
  image?: EditorialImage;
}

export interface EditorialImage {
  title?: string;
  altText?: string;
  cuts?: ImageCut[];
}

export interface ImageCut {
  aspectRatio: string;
  width: number;
  height: number;
  src: string;
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

// Standings
export interface StandingsResponse {
  records: StandingsRecord[];
}

export interface StandingsRecord {
  standingsType: string;
  league: { id: number };
  division: { id: number };
  teamRecords: TeamRecord[];
}

export interface TeamRecord {
  team: { id: number; name: string };
  wins: number;
  losses: number;
  winningPercentage: string;
  divisionRank: string;
  gamesBack: string;
  divisionGamesBack: string;
  streak?: { streakCode: string; streakType: string; streakNumber: number };
}

export interface CubsStanding {
  wins: number;
  losses: number;
  winningPercentage: string;
  divisionRank: string;
  divisionGamesBack: string;
  streakCode?: string;
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
