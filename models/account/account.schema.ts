import User, {USER_ROLES, UserState} from "../user";
import {SeatInfo} from "./SeatInfo";
import mongoose, {Schema} from "mongoose";
import _ from "lodash";
import {DefaultAssessmentBehavior, IAccountDocument, IAccountModel} from "./account.interface";
import {
    populateSettingsForDocument,
    populateSettingsForModel,
    SettingsGroupSchema
} from "../_mixin/settings-group/settings-group.schema";
import crypto from "crypto";

/**
 * Subset of stripe subscription data
 */
const SubscriptionSchema = new Schema({

    id: {
        type: String,
        index: true
    },
    billing_cycle_anchor: {
        type: Date
    },
    cancel_at_period_end: {
        type: Boolean
    },
    canceled_at: {
        type: Date
    },
    created: {
        type: Date
    },
    current_period_end: {
        type: Date
    },
    current_period_start: {
        type: Date
    },
    discount: {
        type: Map,
    },
    quantity: {
        type: Number
    },
    /**
     * https://stripe.com/docs/api/subscriptions/object#subscription_object-status
     */
    status: {
        type: String
    },
});
/**
 * Subset of Stripe customer data
 */
const CustomerSchema = new Schema({
    id: {
        type: String,
        index: true
    },
    created: {
        type: Date,
    },
    email: {
        type: String
    },
    name: {
        type: String
    },
});
const AccountSchema = new mongoose.Schema({
    name: {
        type: String
    },
    customer_id: {
        type: String,
        index: true
    },
    customer: {
        type: CustomerSchema
    },
    subscription_id: {
        type: String
    },
    subscription: {
        type: SubscriptionSchema
    },
    homeICAO: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Airport'
    },
    farPart: {type: String},
    created: {
        type: Date,
        default: Date.now
    },
    features: {
        type: [String]
    },
    prepaidSeats: {
        type: Number,
        default: 0
    },
    vendor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Vendor',
    },
    referralCode: {
        type: String,
    },
    referredBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Account',
    },
    defaultAssessmentBehavior: {
        type: String,
        enum: [DefaultAssessmentBehavior.Pilot, DefaultAssessmentBehavior.Aircraft],
        default: DefaultAssessmentBehavior.Pilot,
    },
    signupType: {
        type: String,
    },
    ...SettingsGroupSchema,

}, {
    toJSON: {
        virtuals: true,
        transform: function (doc, ret, options) {
            return _.omit(ret, 'subscription', 'customer', 'referredBy')
        }
    },
    toObject: {
        virtuals: true,
        transform: function (doc, ret, options) {
            return _.omit(ret, 'subscription', 'customer', 'referredBy')
        }
    }
});

AccountSchema.methods.activeUserCount = function (this: IAccountDocument) {
    return User.count({
        account: this._id,
        activeState: UserState.ACTIVE
    }).exec();
};

AccountSchema.methods.getSeatInfo = async function (this: IAccountDocument): Promise<SeatInfo> {
    const activeUsers = await this.activeUserCount();
    const prepaidSeats = this.prepaidSeats || 0;
    const totalSeats = Math.max(activeUsers, prepaidSeats);
    return {
        totalSeats: totalSeats,
        activeSeats: activeUsers,
        availableSeats: totalSeats - activeUsers
    }
};

AccountSchema.methods.countSubscribedUsers = function (this: IAccountDocument) {
    return User.count({
        account: this._id,
        $or: [
            {activeState: UserState.PENDING},
            {activeState: UserState.ACTIVE}
        ]
    }).exec();
};

AccountSchema.methods.totalUserCount = function (this: IAccountDocument) {
    return User.count({account: this._id}).exec();
};

AccountSchema.methods.populateSettings = populateSettingsForDocument;

AccountSchema.virtual('active')
    .get(function () {
        return !!this.subscription_id;
    });

AccountSchema.virtual('stripeLink')
    .get(function () {
        return `https://dashboard.stripe.com/customers/${this.customer_id}`
    })

AccountSchema.virtual('users', {
    ref: 'User',
    localField: '_id',
    foreignField: 'account',
    justOne: false
});

AccountSchema.virtual('accountOwner', {
    ref: 'User',
    localField: '_id',
    foreignField: 'account',
    justOne: true,
    match: {
        role: USER_ROLES.systemAdmin
    }
});

AccountSchema.virtual('apiKeys', {
    ref: 'ApiKey',
    localField: '_id',
    foreignField: 'account'
});

AccountSchema.virtual('integrations', {
    ref: 'Integration',
    localField: '_id',
    foreignField: 'account'
});

AccountSchema.pre('findOne', function (next) {
    this.populate('homeICAO');
    this.populate('vendor');
    next(null);
});

AccountSchema.pre('find', function (next) {
    this.populate('homeICAO');
    this.populate('vendor');
    next(null);
});

AccountSchema.pre('save', function (this: IAccountDocument, next) {
    if (this.isNew) {
        this.referralCode = crypto.randomBytes(8).toString('hex');
    }
    next();
})

// AccountSchema.pre('find', populateSettingsForModel);

export const Account = mongoose.model<IAccountDocument, IAccountModel>('Account', AccountSchema);
