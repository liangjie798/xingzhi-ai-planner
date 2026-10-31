export type AirlineCode = "CZ" | "MF" | "MU" | "OQ" | "9H" | "GS" | "SC" | "KN" | "9C" | "RY";
export type AirlineState = "quoted" | "no-flights" | "login-required" | "verification-required" | "session-expired" | "tls-error" | "timeout" | "unverified-page" | "unrecognized-price" | "not-configured" | "unsupported" | "busy" | "cancelled";
export interface FlightQuery { origin: string; destination: string; date: string; airlineCodes?: AirlineCode[] }
export interface AirportCity { name: string; code: string; airports: string[]; scope: string }
export interface ResolvedFlightQuery extends FlightQuery { from: AirportCity; to: AirportCity }
export interface AirlineQuote {
  airlineCode: AirlineCode;
  sourceName: string;
  flightNumber: string;
  operatingFlightNumber?: string;
  departure: string;
  arrival: string;
  arrivalDayOffset?: number;
  originStation?: string;
  destinationStation?: string;
  cabin: string;
  price: number;
  currency: "CNY";
  priceBasis: "base-fare" | "total" | "unknown";
  availability: "display-only";
  stops?: number;
  codeshare: boolean;
  sourceUrl: string;
  checkedAt: string;
  date: string;
}
export interface AirlineAttempt { airlineCode: string; sourceName: string; state: AirlineState; sourceUrl: string; checkedAt: string; quoteCount: number; airportScope?: string }
export interface AirlineSearchResult {
  origin: string; destination: string; date: string; checkedAt: string;
  status: "partial" | "unavailable" | "not-configured";
  quotes: AirlineQuote[];
  providers: AirlineAttempt[];
  notes: string[];
}
/** Browser observations are untrusted input. Only validated fields reach an Agent. */
export interface FlightRowObservation {
  text: string;
  flightNumber?: string;
  priceText?: string;
  cabin?: string;
  departure?: string;
  arrival?: string;
  departureDate?: string;
  arrivalDate?: string;
  originCode?: string;
  destinationCode?: string;
  originStation?: string;
  destinationStation?: string;
  stops?: number;
}
export interface AirlinePageObservation {
  url: string;
  text: string;
  pageDate?: string;
  originLabel?: string;
  destinationLabel?: string;
  rows: FlightRowObservation[];
}
