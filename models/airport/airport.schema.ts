import {model, Schema} from 'mongoose';
import * as _ from "lodash";
import {IAirportDocument, IAirportModel} from "./airport.interface";
import {IAccount} from "../account";

const AirportSchema = new Schema({
    open_flights_id: {
        type: Number,
    },
    name: {
        type: String,
        trim: true,
        index: true,
    },
    city: {
        type: String,
        trim: true,
        index: true
    },
    country: {
        type: String,
        trim: true,
    },
    iata_code: {
        type: String,
        trim: true,
    },
    icao_code: {
        type: String,
        trim: true,
        index: true,
    },
    latitude: {
        type: Number,
    },
    longitude: {
        type: Number,
    },
    Altitude: {
        type: Number,
    },
    timezone: {
        type: Number,
    },
    dst: {
        type: String,
        trim: true,
    },
    tz_timezone: {
        type: String,
        trim: true,
    },
    port_type: {
        type: String,
        trim: true,
    },
    source: {
        type: String,
        trim: true,
    },
    account: {
        type: Schema.Types.ObjectId,
        ref: 'Account'
    }
}, {
    toJSON: {
        transform: function (doc, ret) {

            return _.omit(ret, ['account']);
        }
    },
    toObject: {
        transform: function (doc, ret) {
            return _.omit(ret, ['account']);
        }
    }
});

/**
 * @memberOf IAirportDocument
 */
AirportSchema.methods.getName = function (this: IAirportDocument) {
    if (this.name && this.icao_code) {
        return `${this.name} (${this.icao_code})`;
    }
    return 'N/A';
};

/**
 * @memberOf IAirportModel
 * @static
 */
AirportSchema.statics.findOrInsertAirport = async function (
    this: IAirportModel,
    airport: IAirportDocument,
    account: IAccount) {

    if (!airport) {
        return null;
    }
    const byId = _.get(airport, '_id');
    const byCode = _.get(airport, 'icao_code');
    let ret = null;
    if (byId) {
        ret = await this.findOne({
            account: {$in: [account, null]},
            _id: byId
        }).exec();
    } else if (byCode) {
        ret = await this.findOne({
            account: {$in: [account, null]},
            icao_code: byCode
        }).exec();
    }
    if (!ret) {
        const params = _.clone(airport);
        Object.assign(params, {account: account});
        ret = await this.create(params);
    }
    return ret;
};


export const AirportModel: any = model<IAirportDocument, IAirportModel>('Airport', AirportSchema);
