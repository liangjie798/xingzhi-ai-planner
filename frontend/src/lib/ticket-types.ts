export interface TicketOption {
  mode: "火车" | "航班";
  service: string;
  optionId?: string;
  seat: string;
  price: number;
  departure?: string;
  arrival?: string;
  originStation?: string;
  destinationStation?: string;
  durationMinutes?: number;
  sourceName?: string;
  sourceUrl?: string;
  checkedAt?: string;
  priceBasis?: "base-fare" | "total" | "unknown";
  arrivalDayOffset?: number;
  stops?: number;
  codeshare?: boolean;
  operatingFlightNumber?: string;
}
export interface TicketSearchResult {
  origin: string;
  destination: string;
  date: string;
  status: "available" | "partial" | "unavailable" | "not-configured";
  checkedAt: string;
  options: TicketOption[];
  notes: string[];
  reply: string;
  providers?: Array<{airlineCode:string;sourceName:string;state:string;sourceUrl:string;checkedAt:string;quoteCount:number;airportScope?:string}>;
  modelCall?: {success:boolean;attempted:boolean;provider?:string;model?:string;reason?:string;requestId:string;purpose:"tool-selection"};
  toolCalls?: Array<{name:string;arguments:unknown;execution:string;status:string;providers:Array<{airlineCode:string;state:string}>}>;
}
