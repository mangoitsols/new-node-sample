import mongoose, {model} from "mongoose";
import {IAircraftDocument, IAircraftModel} from "./aircraft.interface";

const AircraftSchema = new mongoose.Schema({
    designation: {
        type: String,
        trim: true,
        required: 'designation cannot be blank',
        index: {
            // @ts-ignore
            collation: {
                locale: 'en_US',
                strength: 2
            }
        },
        set: (value: string) => value.toUpperCase()
    },
    type: {
        type: String,
        default: 'Undefined Type',
    },
    dateAdded: {
        type: Date,
    },
    account: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'account',
        required: true
    },
    defaultAssessment: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Assessment'
    }
}, {
    toJSON: {
        transform(doc, ret, options) {
            ret.designation = (ret.designation || '').toLocaleUpperCase();
            return ret;
        }
    }
});

AircraftSchema.statics.queryByDesignation = function(this: IAircraftModel, designation: string) {
    return this.findOne({designation: designation}, null, {collation: {
            locale: 'en_US', // same as index
            strength: 2 // same as index
        }});
};

export const AircraftModel: any = model<IAircraftDocument, IAircraftModel>('Aircraft', AircraftSchema);
