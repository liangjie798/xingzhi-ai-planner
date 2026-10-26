export interface TicketOption {
  mode: "火车" | "航班";
  service: string;
  optionId?: string;
  seat: string;
  price: number;
  departure?: string;
  arrival?: string;
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
}
