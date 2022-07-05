import {Document, Model} from "mongoose";
import {IAirport} from "../airport";
import {SeatInfo} from "./SeatInfo";
import Stripe from "stripe";
import {ISettingsGroup, ISettingsGroupDocument} from "../_mixin/settings-group/settings-group.interface";
import ISubscription = Stripe.subscriptions.ISubscription;
import ICustomer = Stripe.customers.ICustomer;
import {IUser, IUserDocument} from "../user";
import {ObjectId} from "bson";

export type IAccountSubscription = Partial<Pick<ISubscription,
    'id' |
    'billing_cycle_anchor' |
    'cancel_at_period_end' |
    'canceled_at' |
    'created' |
    'current_period_end' |
    'current_period_start' |
    'discount' |
    'quantity' |
    'status'>>;

export type IAccountCustomer = Pick<ICustomer,
    'id' |
    'created' |
    'email' |
    'name'>;

export type SignupType =
    'organic' |
    'partner_account' |
    'user_referred' |
    'partner_marketing';

export interface IAccount{
    /**
     * Company name
     */
    name: string;
    customer_id?: string;
    customer?: IAccountCustomer;
    subscription_id?: string;
    subscription?: IAccountSubscription;
    homeICAO?: IAirport;
    farPart?: string;
    created?: Date;
    features?: string[];
    prepaidSeats?: number;
    vendor?: string;
    referralCode?: string;
    referredBy?: IAccount;
    defaultAssessmentBehavior: DefaultAssessmentBehavior;
    signupType?: SignupType
}

export enum DefaultAssessmentBehavior {
    Pilot = 'pilot',
    Aircraft = 'aircraft'
}

export interface IAccountDocument extends IAccount, ISettingsGroupDocument, Document {
    activeUserCount(): Promise<number>;

    getSeatInfo(): Promise<SeatInfo>;

    countSubscribedUsers(): Promise<number>;

    totalUserCount(): Promise<number>;

    /**
     * must be populated first
     */
    accountOwner?: Document<IUser>;

    users: ObjectId[] | IUserDocument[];
    stripeLink: string;
}

export interface IAccountModel extends Model<IAccountDocument> {
}
