import {IAccount, IAccountDocument} from "../account";
import {Document, Model} from "mongoose";
import {IAssessment} from "../assessment/assessment.interface";

export interface IAircraft {
    designation: string;
    type: string;
    dateAdded: Date;
    account: IAccount;
    defaultAssessment: IAssessment;
}

export interface IAircraftDocument extends IAircraft, Document {

    account: IAccountDocument;
}

export interface IAircraftModel extends Model<IAircraftDocument> {
    queryByDesignation(designation: string): Promise<IAircraftDocument>;
}
