import {Document, Model} from "mongoose";
import {IAccount, IAccountDocument} from "../account";

export interface IAirport {
  open_flights_id: number;
  name: string;
  city: string;
  country: string;
  iata_code: string;
  icao_code: string;
  latitude: number;
  longitude: number;
  Altitude: number;
  timezone: number;
  dst: string;
  tz_timezone: string;
  port_type: string;
  source: string;
  account: IAccount
}

export interface IAirportDocument extends IAirport, Document {
    getName(): string;
}

export interface IAirportModel extends Model<IAirportDocument> {
    findOrInsertAirport(airport: IAirportDocument, account: IAccountDocument): Promise<IAirportDocument | null>
}
