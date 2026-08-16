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
  seriesDescription?: string; // Always the LONG form: "Regular Season", "NL Division Series", "World Series". The short form lives only on seriesStatus.shortName/.abbreviation.
  status: GameStatus;
  teams: {
    away: ScheduleTeam;
    home: ScheduleTeam;
  };
  gameNumber: number; // 1 for single game, 1 or 2 for doubleheader
  doubleHeader: string; // "N" or "Y" or "S" (split)
  seriesGameNumber?: number; // index within the series — NOT the doubleheader gameNumber above
  gamesInSeries?: number;
  /** Requires `hydrate=venue`. A placeholder reads "NL Stadium" / "AL Stadium". */
  venue?: { id: number; name: string };
  /** Requires `hydrate=seriesStatus`. Present on EVERY game type, not just postseason. */
  seriesStatus?: SeriesStatus;
}

/**
 * Series state as of (and including) this game.
 *
 * Three traps, all verified against the live API:
 *  1. Present on regular-season and spring games too — a routine August sweep
 *     reports result "CHC wins 3-0" with abbreviation "RS". Gate any rendering
 *     on gameType, never on the presence of this object.
 *  2. `wins`/`losses` are relative to `winningTeam` (the series leader), NOT the
 *     Cubs. In 2025 NLDS Game 3 the Cubs won 4-3 yet this read "MIL leads 2-1".
 *  3. `winningTeam`/`losingTeam` are ABSENT ENTIRELY when the series is tied,
 *     and neither carries an `abbreviation` — opponent names must come from the
 *     game feed's TeamInfo.
 */
export interface SeriesStatus {
  gameNumber: number; // index within the series
  totalGames: number; // FORMAT length (3/5/7), not games played
  isTied: boolean; // defaults to true on unplayed games — do not trust alone
  isOver: boolean;
  wins: number;
  losses: number;
  result?: string; // absent on unplayed games and some finals
  description?: string; // "NL Division Series"
  shortDescription?: string; // "NLDS Game 3"
  shortName?: string; // asymmetric: "NLDS"/"NLCS" but "NL Wild Card Series"/"World Series"
  abbreviation?: string; // "NLWC" | "NLDS" | "NLCS" | "WS" | "RS" | "ST"
  winningTeam?: SeriesTeamRef;
  losingTeam?: SeriesTeamRef;
}

export interface SeriesTeamRef {
  id: number;
  name: string;
  link: string;
}

export interface SeasonsResponse {
  seasons: SeasonDates[];
}

export interface SeasonDates {
  seasonId: string;
  regularSeasonStartDate: string;
  regularSeasonEndDate: string;
  /** Absent for 2020 (COVID cancelled the All-Star Game) — always guard. */
  allStarDate?: string;
  lastDate1stHalf?: string;
  firstDate2ndHalf?: string;
  postSeasonStartDate?: string;
  postSeasonEndDate?: string;
}

export interface GameStatus {
  abstractGameState: "Preview" | "Live" | "Final";
  detailedState: string; // "Final", "Postponed", "Suspended", etc.
  statusCode: string;
  codedGameState?: string; // "F" = final; the reliable filter for played games
  /** Unresolved postseason games carry a fabricated 07:33Z time with this set. */
  startTimeTBD?: boolean;
}

export interface ScheduleTeam {
  team: {
    id: number;
    name: string;
    abbreviation?: string;
    teamName?: string;
    /**
     * True for MLB's pre-created postseason slots ("NL 4/5 Winner", id 5533).
     * ONLY returned when the request hydrates `team` — without that hydrate the
     * flag is absent and a placeholder is indistinguishable from a real club.
     */
    placeholder?: boolean;
  };
  score: number;
  isWinner: boolean;
  probablePitcher?: { id: number; fullName: string };
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
  /** Keyed by "ID{personId}". Bench players carry an EMPTY stats.batting object. */
  players?: Record<string, BoxscorePlayer>;
}

export interface BoxscorePlayer {
  person: { id: number; fullName: string };
  stats?: {
    batting?: BattingStats;
    pitching?: PitchingStats;
  };
}

/** Every field is optional — an unused bench player's `batting` is `{}`. */
export interface BattingStats {
  plateAppearances?: number;
  atBats?: number;
  hits?: number;
  doubles?: number;
  triples?: number;
  homeRuns?: number;
  rbi?: number;
  runs?: number;
  baseOnBalls?: number;
  intentionalWalks?: number;
  hitByPitch?: number;
  stolenBases?: number;
  caughtStealing?: number;
  sacFlies?: number;
  totalBases?: number;
  strikeOuts?: number;
}

export interface PitchingStats {
  inningsPitched?: string; // "6.2"
  outs?: number;
  battersFaced?: number;
  hits?: number;
  runs?: number;
  earnedRuns?: number;
  homeRuns?: number;
  baseOnBalls?: number;
  strikeOuts?: number;
  note?: string; // "(W, 8-4)" / "(S, 12)" / "(H, 3)"
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

/**
 * Optionality here is load-bearing, not defensive. Four fields are OMITTED from
 * the JSON rather than serialized as false/null — across 2019-2026 the API has
 * never once emitted `wildCardLeader: false`. Code must therefore test
 * `=== true` / `!= null` and never truthiness.
 */
export interface TeamRecord {
  team: { id: number; name: string };
  wins: number;
  losses: number;
  winningPercentage: string;
  divisionRank: string;
  leagueRank: string;
  gamesBack: string;
  divisionGamesBack: string;
  streak?: { streakCode: string; streakType: string; streakNumber: number };
  clinched: boolean;
  divisionChamp: boolean;
  divisionLeader: boolean;
  /** "+X" = X games CLEAR of the last wild card spot; "X" = X behind; "-" = level with it. */
  wildCardGamesBack: string;
  /** DIVISION elimination number. "E" here does NOT mean eliminated from the playoffs. */
  eliminationNumber: string;
  wildCardEliminationNumber: string;
  records?: { splitRecords?: { type: string; wins: number; losses: number }[] };
  // --- omitted entirely when not applicable ---
  wildCardRank?: string; // absent for division leaders
  wildCardLeader?: boolean; // true when in a wild card spot; absent otherwise
  magicNumber?: string; // division leaders only; becomes "-" on clinch
  clinchIndicator?: "z" | "y" | "w" | "x";
}

export interface CubsStanding {
  /** Playoff seed 1-6, derived — the API exposes no seed field. */
  seed?: number;
  wins: number;
  losses: number;
  winningPercentage: string;
  divisionRank: string;
  divisionGamesBack: string;
  streakCode?: string;
  clinched: boolean;
  divisionChamp: boolean;
  divisionLeader: boolean;
  wildCardGamesBack: string;
  eliminationNumber: string;
  wildCardEliminationNumber: string;
  wildCardRank?: string;
  wildCardLeader?: boolean;
  magicNumber?: string;
  clinchIndicator?: "z" | "y" | "w" | "x";
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
